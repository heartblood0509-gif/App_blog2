"""이모지 감지 유틸 단위 테스트.

영상 자막은 ffmpeg drawtext(단일 폰트)라 컬러 이모지를 못 그린다(두부 □ 로 깨짐).
그래서 제목/대본에 이모지가 있으면 '영상 만들기' 직전에 차단한다. 이 테스트는
contains_emoji 가 (1) 진짜 이모지를 잡고 (2) ★ ✓ → 같은 텍스트 기호는 통과시키는지
(과차단 회귀 방지)를 검증한다.

이모지는 chr(코드포인트)로 직접 구성한다 — 소스 파일의 인코딩이나 보이지 않는
결합 문자(FE0F/ZWJ 등) 보존에 의존하지 않기 위해서.
"""

import pytest

# tests/conftest.py 가 JWT_SECRET 주입 후 import
from core.text_validation import contains_emoji

GRINNING = chr(0x1F601)                                   # 😁
PRAY = chr(0x1F64F)                                       # 🙏
FLAG_KR = chr(0x1F1F0) + chr(0x1F1F7)                     # 🇰🇷 (regional indicator 2개)
FAMILY = chr(0x1F468) + chr(0x200D) + chr(0x1F469) + chr(0x200D) + chr(0x1F467)  # 👨‍👩‍👧 (ZWJ)
HEART_VS16 = chr(0x2764) + chr(0xFE0F)                    # ❤️ (텍스트 하트 + 이모지 변형선택자)
KEYCAP_1 = chr(0x31) + chr(0xFE0F) + chr(0x20E3)          # 1️⃣ (키캡)


@pytest.mark.parametrize(
    "text",
    [
        GRINNING + " 대표님들 안녕하세요",
        PRAY + " 앞으로 잘 부탁드립니다",
        "대한민국 " + FLAG_KR + " 화이팅",
        "우리 가족 " + FAMILY,
        "사랑해요 " + HEART_VS16,
        KEYCAP_1 + " 첫 번째 이유",
    ],
)
def test_detects_emoji(text):
    assert contains_emoji(text) is True


@pytest.mark.parametrize(
    "text",
    [
        "안녕하세요 반갑습니다 저는 곽명근입니다.",
        "오늘 매출은 1,200,000원입니다!",
        "Hello world 2026",
        "별점 ★☆ 체크 ✓ 다음 → 참고 ※",  # 텍스트 기호 — 통과해야 함(과차단 방지)
        "문장 부호。、！？… 테스트",
        "",
    ],
)
def test_ignores_plain_text(text):
    assert contains_emoji(text) is False


def test_none_is_safe():
    assert contains_emoji(None) is False
