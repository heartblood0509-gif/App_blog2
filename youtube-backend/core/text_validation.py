"""텍스트 입력 검증 — 이모지 감지.

영상 자막/제목은 ffmpeg drawtext(단일 폰트)로 그려서 컬러 이모지를 표현하지
못한다(자막에 두부 □ 로 깨짐). 또 일부 환경(한국어 Windows·cp949)에서는 이모지가
로그 출력 등에서 인코딩 오류를 일으킬 수 있다. 그래서 영상 제작 직전에 제목/대본의
이모지를 막고 사용자에게 빼달라고 안내한다.

"진짜 이모지"만 좁게 잡고, ★ ☆ ✓ → ※ 같은 한국 사용자가 제목에 흔히 쓰는 텍스트
기호는 통과시킨다(과차단 방지). 새 의존성 없이 표준 라이브러리만 사용.
"""

# 이모지로 간주하는 코드포인트 범위:
#  - 0x1F300–0x1FAFF : 얼굴/손짓/사물/교통/피부색 등 대부분의 이모지 + 확장-A.
#                      ZWJ 가족(예: 가족 이모지)도 구성 문자가 이 범위라 함께 잡힌다.
#  - 0x1F1E6–0x1F1FF : 국기(regional indicator).
#  - 0xFE0F          : 이모지 변형 선택자(VARIATION SELECTOR-16). 오직 "이 글자를
#                      이모지로 그려라"는 신호에만 쓰여, 하트/해 같은 텍스트 기호가
#                      이모지로 렌더되는 경우를 잡는다. (★ ✓ → 단독은 FE0F가 없어 통과)
#  - 0x20E3          : 키캡 결합 문자(예: 숫자 키캡 이모지).
# 의도적으로 0x2600–0x27BF 통블록은 넣지 않는다(★=0x2605, ✓=0x2713 등 텍스트 기호 과차단 방지).


def contains_emoji(text: str) -> bool:
    """text 에 이모지가 하나라도 있으면 True. None/빈 문자열은 False."""
    if not text:
        return False
    for ch in text:
        o = ord(ch)
        if 0x1F300 <= o <= 0x1FAFF:
            return True
        if 0x1F1E6 <= o <= 0x1F1FF:
            return True
        if o == 0xFE0F or o == 0x20E3:
            return True
    return False
