"""Windows 애플리케이션 제어(Smart App Control / WDAC) 차단 감지 + 사용자 안내 문구.

증상: 서명 안 된 번들 ffmpeg.exe 를 subprocess 로 실행하려는 순간 Windows 가
`OSError: [WinError 4551] 애플리케이션 제어 정책에서 이 파일을 차단했습니다` 를 던진다.
즉 ffmpeg 가 뭘 잘못한 게 아니라 "실행 자체가 막힌" 것이라, 영상 조립·목소리 샘플 등
ffmpeg 를 켜야 하는 모든 기능이 동일하게 실패한다. (PC 를 포맷·새로 설치하면 SAC 가
평가 끝에 자동으로 켜지면서 갑자기 발생할 수 있음.)

이 모듈은 그 예외를 알아보고, 사용자에게 원인·해결(SAC 끄기)을 알려주는 문구를 제공한다.
문구에는 반드시 "Smart App Control" 이 들어간다 — 프론트가 이 표식을 보고 영상 실패
패널을 구조화 안내(단계 칩 등)로 승격하기 때문. 문구를 바꾸면 프론트 감지도 함께 고칠 것.
"""

# Windows Smart App Control / WDAC 가 실행을 막을 때의 OSError.winerror 코드.
_WIN_APP_CONTROL_BLOCKED = 4551

# 프론트(ProgressView / VoiceSettingsBar)가 감지하는 표식 문구. 절대 바꾸지 말 것(바꾸면 프론트도).
SAC_MARKER = "Smart App Control"


def is_app_control_block(exc: BaseException) -> bool:
    """예외가 Windows 애플리케이션 제어 차단(WinError 4551)인지 판별한다.

    - 원본 OSError 는 .winerror 속성으로 정확히 판별(영상 조립 경로).
    - 문자열로 감싸진 경우(예: RuntimeError(f"...: {오류}"))는 메시지에 남은
      "WinError 4551" 로 판별(목소리 샘플 경로 — normalize 가 OSError 를 RuntimeError 로 감쌈).
    """
    if getattr(exc, "winerror", None) == _WIN_APP_CONTROL_BLOCKED:
        return True
    return f"WinError {_WIN_APP_CONTROL_BLOCKED}" in str(exc)


# 영상 조립 실패 패널용(프론트가 감지되면 구조화 안내로 대체하므로, 이건 자립형 폴백 겸 표식).
SAC_MESSAGE_VIDEO = (
    "Windows 보안(Smart App Control)이 영상 제작 도구를 차단했어요. "
    "Windows 보안 → 앱 및 브라우저 컨트롤 → Smart App Control → 끔으로 해제해 주세요."
)

# 목소리 샘플 토스트용(짧게 한 줄, 프론트에 그대로 노출됨).
SAC_MESSAGE_VOICE = "Windows 보안(Smart App Control)이 소리 미리듣기를 차단했어요."
