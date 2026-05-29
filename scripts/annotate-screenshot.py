#!/usr/bin/env python3
"""
매뉴얼 스크린샷에 번호 배지 + 한글 라벨 + 화살표를 합성한다.

블로그픽 매뉴얼 시각 톤(primary 보라색, 둥근 모서리, 부드러운 그림자)에
맞춰서 캡처 위에 단계 안내를 그린다.

입력:  frontend/public/help-screenshots/review-step1-raw.png
출력:  frontend/public/help-screenshots/review-step1.png
"""

from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path

ROOT = Path("frontend/public/help-screenshots")
SRC = ROOT / "review-step1-raw.png"
DST = ROOT / "review-step1.png"

FONT_PATH = "/System/Library/Fonts/AppleSDGothicNeo.ttc"

# 블로그픽 primary 톤 (보라). 본 페이지 디자인과 일치하도록.
PRIMARY = (124, 58, 237, 255)        # #7C3AED
PRIMARY_SOFT = (124, 58, 237, 40)
BADGE_BG = (124, 58, 237, 32)        # 옅은 보라 배경 (chip 톤)
BADGE_BORDER = (124, 58, 237, 60)
LABEL_BG = (255, 255, 255, 245)
LABEL_BORDER = (229, 231, 235, 255)  # #E5E7EB
TEXT_DARK = (17, 24, 39, 255)        # #111827
TEXT_SUB = (75, 85, 99, 255)         # #4B5563
SHADOW = (15, 23, 42, 60)


def font(size: int, weight: int = 0) -> ImageFont.FreeTypeFont:
    """AppleSDGothicNeo.ttc는 weight 인덱스 0=Regular, 6=Bold 정도."""
    return ImageFont.truetype(FONT_PATH, size, index=weight)


def text_size(draw: ImageDraw.ImageDraw, txt: str, f: ImageFont.FreeTypeFont):
    """텍스트의 (w, h) 측정."""
    bbox = draw.textbbox((0, 0), txt, font=f)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def draw_label(
    draw: ImageDraw.ImageDraw,
    overlay: Image.Image,
    pos,
    number: str,
    title: str,
    desc: str = "",
):
    """번호 배지 + 제목 + 부제 한 줄 라벨을 그린다.

    pos: 라벨 좌상단 (x, y)
    """
    x, y = pos
    f_num = font(34, 6)
    f_title = font(28, 6)
    f_desc = font(22, 0)

    # 박스 폭 측정
    title_w, title_h = text_size(draw, title, f_title)
    desc_w, desc_h = text_size(draw, desc, f_desc) if desc else (0, 0)
    inner_w = max(title_w, desc_w)

    pad_x = 22
    pad_y = 18
    badge_size = 52
    gap = 18

    box_w = badge_size + gap + inner_w + pad_x * 2
    box_h = pad_y * 2 + title_h + (desc_h + 6 if desc else 0)

    # 그림자
    shadow_layer = Image.new("RGBA", overlay.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    sd.rounded_rectangle(
        [x + 4, y + 8, x + box_w + 4, y + box_h + 8],
        radius=16,
        fill=SHADOW,
    )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(8))
    overlay.alpha_composite(shadow_layer)

    # 라벨 박스
    draw.rounded_rectangle(
        [x, y, x + box_w, y + box_h],
        radius=16,
        fill=LABEL_BG,
        outline=LABEL_BORDER,
        width=2,
    )

    # 번호 배지 (둥근 사각형) — 옅은 보라 배경 + 보라 폰트 (chip 톤)
    bx = x + pad_x
    by = y + (box_h - badge_size) // 2
    draw.rounded_rectangle(
        [bx, by, bx + badge_size, by + badge_size],
        radius=12,
        fill=BADGE_BG,
        outline=BADGE_BORDER,
        width=1,
    )
    num_w, num_h = text_size(draw, number, f_num)
    draw.text(
        (bx + (badge_size - num_w) // 2, by + (badge_size - num_h) // 2 - 2),
        number,
        font=f_num,
        fill=PRIMARY,
    )

    # 텍스트
    tx = bx + badge_size + gap
    ty = y + pad_y
    draw.text((tx, ty), title, font=f_title, fill=TEXT_DARK)
    if desc:
        draw.text(
            (tx, ty + title_h + 6),
            desc,
            font=f_desc,
            fill=TEXT_SUB,
        )

    return (x, y, x + box_w, y + box_h)


def draw_arrow(
    draw: ImageDraw.ImageDraw,
    start,
    end,
    color=PRIMARY,
    width: int = 4,
    head_size: int = 18,
):
    """직선 화살표. 끝에 화살촉(삼각형)."""
    import math

    x1, y1 = start
    x2, y2 = end

    # 본선
    draw.line([start, end], fill=color, width=width)

    # 화살촉
    angle = math.atan2(y2 - y1, x2 - x1)
    left = (
        x2 - head_size * math.cos(angle - math.pi / 6),
        y2 - head_size * math.sin(angle - math.pi / 6),
    )
    right = (
        x2 - head_size * math.cos(angle + math.pi / 6),
        y2 - head_size * math.sin(angle + math.pi / 6),
    )
    draw.polygon([end, left, right], fill=color)


def draw_highlight(draw: ImageDraw.ImageDraw, box, radius: int = 16):
    """선택된 영역을 primary outline + 옅은 fill로 강조."""
    x1, y1, x2, y2 = box
    draw.rounded_rectangle(
        [x1, y1, x2, y2],
        radius=radius,
        fill=PRIMARY_SOFT,
        outline=PRIMARY,
        width=4,
    )


def main():
    img = Image.open(SRC).convert("RGBA")
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # 좌표는 raw 캡처(1439×2122) 기준. 캡처 보고 측정한 값.
    # === ① 포스팅 카테고리 (후기성 선택) ===
    # 후기성 블로그 카드는 이미 primary로 선택되어 있어 추가 강조 불필요
    draw_label(
        draw, overlay,
        pos=(890, 480),
        number="①",
        title="포스팅 카테고리",
        desc="후기성 / 브랜드 / AEO 중 선택",
    )
    draw_arrow(draw, start=(890, 540), end=(495, 555))

    # === ② 제품 프로필 ===
    draw_label(
        draw, overlay,
        pos=(890, 660),
        number="②",
        title="제품 프로필",
        desc="발행할 제품 선택 (다중 가능, 필수)",
    )
    draw_arrow(draw, start=(890, 720), end=(870, 810))

    # === ③ 서사 구조 ===
    draw_label(
        draw, overlay,
        pos=(890, 1160),
        number="③",
        title="서사 구조 선택",
        desc="감정 선공형 / 결론 선공형",
    )
    draw_arrow(draw, start=(890, 1220), end=(680, 1290))

    # === ④ 말투 선택 ===
    draw_label(
        draw, overlay,
        pos=(700, 1450),
        number="④",
        title="말투 선택",
        desc="존댓말 / 반말 / 음슴체 — 예시 직접 수정 가능",
    )
    draw_arrow(draw, start=(700, 1510), end=(510, 1565))

    # === ⑤ 다음 단계 ===
    draw_label(
        draw, overlay,
        pos=(720, 2010),
        number="⑤",
        title="다음 단계로",
        desc="모든 선택을 마치면 클릭",
    )
    draw_arrow(draw, start=(1180, 2050), end=(1200, 2065))

    # 합성
    final = Image.alpha_composite(img, overlay)
    final.convert("RGB").save(DST, "PNG", optimize=True)
    print(f"✓ saved: {DST}  ({DST.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
