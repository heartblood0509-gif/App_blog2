"""제목 폰트 매니페스트 — 기본 무료폰트 4종(전부 OFL) × 폰트별 굵기.

프론트 짝: frontend/src/lib/youtube/fonts.ts 의 TITLE_FONTS. **폰트 id·굵기 id 는 두 파일이
항상 동일**해야 한다(scripts/check-title-font-sync.js 가 빌드 전 검사). 라이선스 근거는
사용자 메모리 title-font-picker-feature.md 참고.

폰트 파일은 모두 이 백엔드의 fonts/ 폴더(굵기별 static 파일)에 둔다. video_assembler 의
drawtext 는 제목·자막 폰트를 같은 cwd(fonts/) 기준 basename 으로 넘기므로 제목 폰트도 반드시
fonts/ 안에 있어야 한다. resolve_title_font_path 는 이 불변식을 지키기 위해 fonts/ 밖 경로는
반환하지 않고, 알 수 없는 폰트/굵기는 그 폰트 기본 굵기 → 번들 Pretendard 순으로 폴백한다.
"""

import os

from config import BASE_DIR, settings

FONTS_DIR = os.path.join(BASE_DIR, "fonts")

# 폰트 id -> {label, default(굵기 id), weights: {굵기 id -> fonts/ 파일명}}
# 굵기 id 는 canonical: light/regular/medium/semibold/bold/extrabold/black.
BUNDLED_TITLE_FONTS: dict[str, dict] = {
    "pretendard": {
        "label": "프리텐다드",
        "default": "extrabold",
        "weights": {
            "light": "Pretendard-Light.ttf",
            "regular": "Pretendard-Regular.ttf",
            "medium": "Pretendard-Medium.ttf",
            "semibold": "Pretendard-SemiBold.ttf",
            "bold": "Pretendard-Bold.ttf",
            "extrabold": "Pretendard-ExtraBold.ttf",
        },
    },
    "paperlogy": {
        "label": "페이퍼로지",
        "default": "extrabold",
        "weights": {
            "light": "Paperlogy-Light.ttf",
            "regular": "Paperlogy-Regular.ttf",
            "medium": "Paperlogy-Medium.ttf",
            "semibold": "Paperlogy-SemiBold.ttf",
            "bold": "Paperlogy-Bold.ttf",
            "extrabold": "Paperlogy-ExtraBold.ttf",
        },
    },
    "gmarket": {
        "label": "G마켓 산스",
        "default": "bold",
        "weights": {
            "light": "GmarketSans-Light.ttf",
            "medium": "GmarketSans-Medium.ttf",
            "bold": "GmarketSans-Bold.ttf",
        },
    },
    "atoz": {
        "label": "에이투지체",
        "default": "extrabold",
        # 굵기 파일이 추가되면 여기에 등록(프론트 fonts.ts 와 함께).
        "weights": {
            "extrabold": "AtoZ-ExtraBold.ttf",
        },
    },
}

DEFAULT_TITLE_FONT_ID = "pretendard"


def resolve_title_font_path(font_id: str | None, weight_id: str | None = None) -> str:
    """(폰트 id, 굵기 id) -> 절대경로. 항상 fonts/ 내부만 반환(cwd 불변식 보장).

    폴백 순서: 요청 굵기 → 그 폰트 기본 굵기 → 번들 Pretendard(settings.FONT_TITLE).
    파일이 실재하지 않으면(예: 아직 미배치) 마찬가지로 폴백한다.
    """
    font = BUNDLED_TITLE_FONTS.get((font_id or "").strip())
    if font:
        weights = font["weights"]
        wid = (weight_id or "").strip()
        filename = weights.get(wid) or weights.get(font["default"])
        if filename:
            path = os.path.join(FONTS_DIR, filename)
            if os.path.exists(path):
                return path
    return settings.FONT_TITLE
