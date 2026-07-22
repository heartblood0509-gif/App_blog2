"""Typecast 감정 미지원(422) 폴백 테스트.

성우가 못 내는 감정이 요청되면 영상 전체를 실패시키지 말고 감정만 떼어내
기본 톤으로라도 생성해야 한다. 감정과 무관한 4xx 는 건드리면 안 된다.
"""

from core.tts_engines import _TYPECAST_MODEL, _drop_unsupported_emotion


class FakeResp:
    def __init__(self, status_code, text=""):
        self.status_code = status_code
        self.text = text


EMOTION_422 = (
    '{"error_code":"EMOTION_NOT_SUPPORTED","message":"Voice \'tc_6059dad0b83880769a50502f\' '
    "does not support emotion 'toneup'. Supported emotions: ['normal', 'happy', 'sad', 'angry']\"}"
)


def _payload_with_emotion(emotion="toneup"):
    return {
        "text": "안녕하세요",
        "voice_id": "tc_6059dad0b83880769a50502f",
        "model": _TYPECAST_MODEL,
        "prompt": {"emotion_type": "preset", "emotion_preset": emotion},
    }


def test_drops_emotion_and_signals_retry_on_422():
    payload = _payload_with_emotion()
    assert _drop_unsupported_emotion(payload, FakeResp(422, EMOTION_422), "[t]") is True
    # 감정만 빠지고 나머지(텍스트·성우·모델)는 그대로여야 재시도가 의미 있다.
    assert "prompt" not in payload
    assert payload["text"] == "안녕하세요"
    assert payload["voice_id"] == "tc_6059dad0b83880769a50502f"


def test_ignores_success_response():
    payload = _payload_with_emotion()
    assert _drop_unsupported_emotion(payload, FakeResp(200), "[t]") is False
    assert "prompt" in payload


def test_ignores_unrelated_4xx():
    # 키 오류·크레딧 부족 등은 감정 탓이 아니므로 감정을 떼면 안 되고, 그대로 에러여야 한다.
    payload = _payload_with_emotion()
    assert _drop_unsupported_emotion(payload, FakeResp(401, '{"error":"invalid api key"}'), "[t]") is False
    assert _drop_unsupported_emotion(payload, FakeResp(402, '{"error":"not enough credits"}'), "[t]") is False
    assert "prompt" in payload


def test_no_infinite_retry_when_emotion_already_dropped():
    # 이미 감정을 뗀 payload 로 또 422 가 와도 True 를 돌려주면 무한 재시도가 된다.
    payload = {"text": "안녕하세요", "voice_id": "tc_x", "model": _TYPECAST_MODEL}
    assert _drop_unsupported_emotion(payload, FakeResp(422, EMOTION_422), "[t]") is False


def test_all_voices_use_v30():
    # 감정 목록(get_voice_emotions)이 v30 기준이라 생성도 v30 이어야 어긋나지 않는다.
    assert _TYPECAST_MODEL == "ssfm-v30"
