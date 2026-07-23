"""Typecast 월 크레딧 소진(402) → 한국어 안내 교체 테스트.

원문은 영문 JSON({"error_code":"CREDIT_INSUFFICIENT",...})이라 그대로 노출하면
사용자가 원인도 해결책도 알 수 없다. 402 를 만나면 즉시 한국어 안내로 바꿔 던져야 하고,
재시도·엔드포인트 폴백으로 시간을 끌어서도 안 된다.
"""

import asyncio

import pytest

from core.tts_engines import (
    TYPECAST_CREDIT_MARKER,
    TYPECAST_USAGE_URL,
    TypecastCreditExhausted,
    _raise_if_credit_exhausted,
    generate_tts_typecast,
)


class FakeResp:
    def __init__(self, status_code, text=""):
        self.status_code = status_code
        self.text = text


CREDIT_402 = (
    '{"error_code":"CREDIT_INSUFFICIENT","message":"Insufficient credits or account is '
    'inactive. Please check your status at https://typecast.ai/developers/api."}'
)


def test_raises_on_402():
    with pytest.raises(TypecastCreditExhausted):
        _raise_if_credit_exhausted(FakeResp(402, CREDIT_402))


def test_raises_on_credit_code_with_other_status():
    # 상태코드가 바뀌어도 error_code 로 알아봐야 한다(공급자 응답 변경 대비).
    with pytest.raises(TypecastCreditExhausted):
        _raise_if_credit_exhausted(FakeResp(403, CREDIT_402))


def test_ignores_success_and_unrelated_errors():
    # 성공 응답 본문에 우연히 같은 낱말이 있어도 건드리면 안 된다.
    _raise_if_credit_exhausted(FakeResp(200, "CREDIT_INSUFFICIENT"))
    _raise_if_credit_exhausted(FakeResp(429, '{"error":"rate limit"}'))
    _raise_if_credit_exhausted(FakeResp(422, '{"error_code":"EMOTION_NOT_SUPPORTED"}'))


def test_message_is_korean_and_actionable():
    msg = str(TypecastCreditExhausted())
    # 영문 원문이 새어나가면 안 된다.
    assert "CREDIT_INSUFFICIENT" not in msg
    assert "Insufficient credits" not in msg
    # 원인 + 해결(자동 충전·업그레이드) + 확인 링크가 모두 있어야 안내로서 완성된다.
    assert TYPECAST_CREDIT_MARKER in msg
    assert "업그레이드" in msg
    assert TYPECAST_USAGE_URL in msg


def test_marker_is_contained_in_message():
    # 프론트(tts-error-toast.ts)가 이 표식으로 '사용량 확인' 버튼을 붙인다.
    # 표식이 문구에서 빠지면 버튼이 조용히 사라진다.
    assert TYPECAST_CREDIT_MARKER in TypecastCreditExhausted().args[0]


# ── 실제 402 응답 재현 ──
# 크레딧을 충전하고 나면 살아 있는 API 로는 402 를 다시 만들 수 없다. 그래서 사용자가 실제로
# 받았던 응답을 그대로 흉내 내, 생성 경로 전체가 어떻게 반응하는지 여기서 고정한다.


class _FakeResp402:
    status_code = 402
    text = CREDIT_402
    headers: dict = {}

    def json(self):
        import json as _json

        return _json.loads(CREDIT_402)


def test_real_402_stops_without_plain_fallback(tmp_path, monkeypatch):
    """with-timestamps 가 402 면 플레인 엔드포인트로 폴백하지 않고 즉시 멈춘다.

    폴백해봐야 같은 402 라 헛호출만 늘고 실패 확인이 느려진다.
    """
    import requests

    calls = []

    def fake_post(url, **kwargs):
        calls.append(url)
        return _FakeResp402()

    monkeypatch.setattr(requests, "post", fake_post)

    with pytest.raises(TypecastCreditExhausted) as excinfo:
        asyncio.run(
            generate_tts_typecast(str(tmp_path), ["안녕하세요"], api_key="dummy-key")
        )

    # 문장 하나당 딱 한 번만 두들긴다(예전엔 with-timestamps → 플레인 으로 2회).
    assert len(calls) == 1
    # 사용자에게 나가는 문구에 영문 원문이 섞이면 안 된다.
    assert "CREDIT_INSUFFICIENT" not in str(excinfo.value)
    assert TYPECAST_CREDIT_MARKER in str(excinfo.value)


# ── 중간 실패 시 남은 문장 취소 ──
# asyncio.gather 는 자식 하나가 예외를 던져도 형제를 취소하지 않는다. 그래서 예전엔 20줄
# 대본의 11번째에서 크레딧이 떨어져도 12~20번 줄이 각자 API 를 한 번 더 두들기고 실패했다.
# 사용자는 이미 에러를 본 뒤인데 뒤에서 헛호출이 계속되는 상태. 아래 두 테스트가 그 회귀를 막는다.


SENTENCES = ["첫째 줄", "둘째 줄", "셋째 줄", "넷째 줄", "다섯째 줄"]


class _FailAtNth:
    """N번째 호출부터 실패 응답을 주는 가짜 requests.post.

    calls 에는 요청 본문의 문장을 담는다 — 몇 번 불렸는지뿐 아니라 '어느 줄이 나갔는지'까지
    봐야 뒤쪽 줄이 정말 취소됐는지 확인할 수 있다.
    """

    def __init__(self, fail_at, ok_response, fail_response):
        self.fail_at = fail_at
        self.ok_response = ok_response
        self.fail_response = fail_response
        self.calls = []

    def __call__(self, url, **kwargs):
        self.calls.append((kwargs.get("json") or {}).get("text"))
        if len(self.calls) >= self.fail_at:
            return self.fail_response
        return self.ok_response


class _FakeRespTypecastOK:
    """with-timestamps 성공 응답 — 무음 wav 1프레임을 base64 로 돌려준다."""

    status_code = 200
    text = ""
    headers = {"Content-Type": "application/json"}

    def json(self):
        import base64

        return {
            "audio": base64.b64encode(_silent_wav_bytes()).decode(),
            "audio_format": "wav",
            "words": [],
        }


def _silent_wav_bytes():
    """44100Hz mono 무음 wav 한 토막 (soundfile 이 읽을 수 있는 최소 실제 파일)."""
    import io

    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, [0.0] * 441, 44100, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def test_typecast_stops_remaining_sentences_after_failure(tmp_path, monkeypatch):
    """5줄 중 3번째에서 402 면 API 호출은 정확히 3번. 4·5번 줄은 아예 안 나간다.

    Typecast 는 동시 실행 1(_TYPECAST_MAX_CONCURRENCY)이라 순서도 호출 횟수도 확정적이다.
    """
    import requests

    fake = _FailAtNth(3, _FakeRespTypecastOK(), _FakeResp402())
    monkeypatch.setattr(requests, "post", fake)

    with pytest.raises(TypecastCreditExhausted):
        asyncio.run(generate_tts_typecast(str(tmp_path), SENTENCES, api_key="dummy-key"))

    # 3번째에서 확정 실패 → 4·5번 줄은 세마포어 큐에서 그대로 포기해야 한다.
    # (예전 gather 코드에서는 여기가 5회였다.)
    assert fake.calls == ["첫째 줄", "둘째 줄", "셋째 줄"], f"헛호출 발생: {fake.calls}"


class _FakeRespElevenOK:
    """ElevenLabs with-timestamps 성공 응답 — mp3 대신 무음 wav 를 실어 보낸다.

    실제 응답은 mp3 지만 이 테스트에서 ffmpeg 디코드는 monkeypatch 로 대체되므로
    바이트 내용 자체는 무엇이든 상관없다(비어 있지만 않으면 된다).
    """

    status_code = 200
    text = ""
    headers = {"Content-Type": "application/json"}

    def json(self):
        import base64

        return {"audio_base64": base64.b64encode(b"fake-mp3-bytes").decode(), "alignment": None}


class _FakeRespEleven401:
    """401 — ElevenLabs 경로에서 플레인 폴백 없이 즉시 죽는 확정 실패(키 무효)."""

    status_code = 401
    text = '{"detail":"invalid api key"}'
    headers: dict = {}

    def json(self):
        return {"detail": "invalid api key"}


def test_elevenlabs_stops_remaining_sentences_after_failure(tmp_path, monkeypatch):
    """ElevenLabs 도 동일 — 3번째 줄이 죽으면 뒤쪽 줄은 API 로 안 나간다.

    Typecast 와 달리 동시 실행이 2(_ELEVEN_MAX_CONCURRENCY)라 '정확히 3회'로 못 박을 수
    없다. 실패가 확정되는 순간 이미 스레드에서 돌고 있던 문장 하나는 끝까지 가기 때문
    (asyncio.to_thread 는 실행 중인 스레드를 중단시키지 못한다 — 중단 깃발 방식의 알려진 한계).
    그래서 확정적으로 검증 가능한 것만 못 박는다: 마지막 줄은 절대 안 나가고, 전체 호출도
    줄 수(5)보다 적다. 취소가 깨지면 5줄이 전부 나가 두 조건 다 무너진다.
    """
    import requests

    from core.tts_engines import generate_tts_elevenlabs

    fake = _FailAtNth(3, _FakeRespElevenOK(), _FakeRespEleven401())
    monkeypatch.setattr(requests, "post", fake)
    # mp3→wav 디코드(번들 ffmpeg)는 이 테스트의 관심사가 아니다 — 무음 wav 로 대체.
    def fake_decode(mp3_bytes, mp3_path, out_path, prefix):
        with open(out_path, "wb") as f:
            f.write(_silent_wav_bytes())

    monkeypatch.setattr("core.tts_engines._eleven_decode_to_wav", fake_decode)

    with pytest.raises(RuntimeError):
        asyncio.run(
            generate_tts_elevenlabs(
                str(tmp_path), SENTENCES, voice_id="v1", api_key="dummy-key",
            )
        )

    assert "다섯째 줄" not in fake.calls, f"취소돼야 할 줄이 API 로 나갔다: {fake.calls}"
    assert len(fake.calls) < len(SENTENCES), f"헛호출 발생: {fake.calls}"
