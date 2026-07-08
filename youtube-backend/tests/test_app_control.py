"""Windows 애플리케이션 제어(Smart App Control) 차단 감지 테스트."""

from core.app_control import (
    is_app_control_block,
    SAC_MARKER,
    SAC_MESSAGE_VIDEO,
    SAC_MESSAGE_VOICE,
)


def test_detects_raw_oserror_by_winerror():
    # 영상 조립 경로: 원본 OSError 가 .winerror=4551 로 전파된다.
    err = OSError("애플리케이션 제어 정책에서 이 파일을 차단했습니다")
    err.winerror = 4551
    assert is_app_control_block(err) is True


def test_detects_wrapped_runtimeerror_by_message():
    # 목소리 샘플 경로: normalize 가 OSError 를 문자열로 감싼 RuntimeError.
    wrapped = RuntimeError("ffmpeg 실행 불가: [WinError 4551] 애플리케이션 제어 정책에서 이 파일을 차단했습니다")
    assert is_app_control_block(wrapped) is True


def test_ignores_unrelated_errors():
    assert is_app_control_block(RuntimeError("ffmpeg 정규화 실패: some codec error")) is False
    assert is_app_control_block(OSError("[Errno 2] No such file or directory")) is False
    other = OSError("permission denied")
    other.winerror = 5  # ERROR_ACCESS_DENIED — 다른 코드는 오탐하지 않는다.
    assert is_app_control_block(other) is False


def test_user_messages_carry_frontend_marker():
    # 프론트(ProgressView / VoiceSettingsBar)가 이 표식으로 감지·승격하므로 반드시 포함돼야 한다.
    assert SAC_MARKER in SAC_MESSAGE_VIDEO
    assert SAC_MARKER in SAC_MESSAGE_VOICE
