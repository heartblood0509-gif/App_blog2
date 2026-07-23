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
