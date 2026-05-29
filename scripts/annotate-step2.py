#!/usr/bin/env python3
"""
후기성 2단계(글 설정) 스크린샷에 주석 합성.
캔버스를 우측으로 확장해서 라벨을 본체 옆에 배치 (docs 표준 패턴).

입력: frontend/public/help-screenshots/review-step2-raw.png  (1377×1046)
출력: frontend/public/help-screenshots/review-step2.png       (확장 후)
"""

import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from pathlib import Path

ROOT = Path("frontend/public/help-screenshots")
SRC = ROOT / "review-step2-raw.png"
DST = ROOT / "review-step2.png"

FONT_PATH = "/System/Library/Fonts/AppleSDGothicNeo.ttc"

PRIMARY = (124, 58, 237, 255)        # #7C3AED
BADGE_BG = (124, 58, 237, 32)        # 옅은 보라 배경 (chip 톤)
BADGE_BORDER = (124, 58, 237, 60)
LABEL_BG = (255, 255, 255, 255)
LABEL_BORDER = (229, 231, 235, 255)
TEXT_DARK = (17, 24, 39, 255)
TEXT_SUB = (75, 85, 99, 255)
SHADOW = (15, 23, 42, 60)
CANVAS_BG = (250, 250, 249, 255)     # 본문 배경과 자연스럽게


def font(size: int, weight: int = 0) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_PATH, size, index=weight)


def text_size(draw, txt, f):
    bbox = draw.textbbox((0, 0), txt, font=f)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def draw_label_card(
    canvas: Image.Image,
    draw: ImageDraw.ImageDraw,
    pos,
    number: str,
    title: str,
    desc: str = "",
    max_text_w: int = 320,
):
    """우측 라벨 카드를 그린다 — 번호 배지 + 제목(굵게) + 부제(연한 회색).

    pos: 좌상단
    반환: (cx, cy) = 라벨 카드의 좌측 중앙점 — 화살표 시작점으로 사용
    """
    x, y = pos
    f_num = font(30, 6)
    f_title = font(24, 6)
    f_desc = font(19, 0)

    # 줄바꿈 처리
    def wrap(txt, f, max_w):
        if not txt:
            return []
        words = txt.split(" ")
        lines = []
        cur = ""
        for w in words:
            test = (cur + " " + w).strip() if cur else w
            tw, _ = text_size(draw, test, f)
            if tw <= max_w:
                cur = test
            else:
                if cur:
                    lines.append(cur)
                cur = w
        if cur:
            lines.append(cur)
        return lines

    title_lines = wrap(title, f_title, max_text_w)
    desc_lines = wrap(desc, f_desc, max_text_w)

    pad_x = 18
    pad_y = 14
    badge_size = 44
    gap = 14
    line_gap = 4

    title_h_total = sum(text_size(draw, l, f_title)[1] + line_gap for l in title_lines) - line_gap
    desc_h_total = (
        sum(text_size(draw, l, f_desc)[1] + line_gap for l in desc_lines) - line_gap
        if desc_lines
        else 0
    )

    inner_w = max_text_w
    box_w = badge_size + gap + inner_w + pad_x * 2
    box_h = pad_y * 2 + title_h_total + (desc_h_total + 8 if desc_lines else 0)

    # 그림자
    shadow_layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    sd.rounded_rectangle(
        [x + 3, y + 6, x + box_w + 3, y + box_h + 6],
        radius=14,
        fill=SHADOW,
    )
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(7))
    canvas.alpha_composite(shadow_layer)

    # 박스
    draw.rounded_rectangle(
        [x, y, x + box_w, y + box_h],
        radius=14,
        fill=LABEL_BG,
        outline=LABEL_BORDER,
        width=2,
    )

    # 번호 배지 — 옅은 보라 배경 + 보라 폰트 (chip 톤)
    bx = x + pad_x
    by = y + pad_y + 2
    draw.rounded_rectangle(
        [bx, by, bx + badge_size, by + badge_size],
        radius=11,
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
    for line in title_lines:
        draw.text((tx, ty), line, font=f_title, fill=TEXT_DARK)
        _, lh = text_size(draw, line, f_title)
        ty += lh + line_gap
    if desc_lines:
        ty += 4
        for line in desc_lines:
            draw.text((tx, ty), line, font=f_desc, fill=TEXT_SUB)
            _, lh = text_size(draw, line, f_desc)
            ty += lh + line_gap

    # 화살표 시작점 = 라벨 좌측 중앙
    return (x, y + box_h // 2)


def draw_arrow(draw, start, end, color=PRIMARY, width: int = 3, head_size: int = 14):
    draw.line([start, end], fill=color, width=width)
    x1, y1 = start
    x2, y2 = end
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


def main():
    src = Image.open(SRC).convert("RGBA")
    W, H = src.size  # 1377 × 1046

    # 우측 라벨 패널 폭
    PANEL_W = 470
    PADDING = 30

    new_w = W + PANEL_W
    new_h = H
    canvas = Image.new("RGBA", (new_w, new_h), CANVAS_BG)
    # 원본 캡처 그대로 좌측에 배치
    canvas.alpha_composite(src, (0, 0))
    draw = ImageDraw.Draw(canvas)

    panel_x = W + PADDING
    text_w = PANEL_W - PADDING * 2 - 44 - 14 - 36  # 사용 가능 텍스트 폭

    # 좌측 캡처 본체의 화살표 타겟 좌표 (캡처 기준)
    # — 메인 키워드 필수 경고
    target_main = (660, 596)
    # — AI 추천/질문에 답하기 두 버튼 위치
    target_ai = (660, 700)
    # — 서브 키워드 입력칸
    target_sub = (1320, 752)
    # — 다음: 제목 선택 버튼
    target_next = (1320, 980)

    # 라벨 4개 — 우측 패널에 세로로 배치
    label_y_start = 130
    label_gap = 30

    arrow_start_1 = draw_label_card(
        canvas, draw,
        pos=(panel_x, label_y_start),
        number="①",
        title="메인 키워드 (필수)",
        desc="검색 노출의 핵심. 비우면 다음 단계 진행 불가.",
        max_text_w=text_w,
    )

    arrow_start_2 = draw_label_card(
        canvas, draw,
        pos=(panel_x, label_y_start + 165),
        number="②",
        title="AI 추천 / 질문에 답하기",
        desc="키워드만 보고 글 주제를 AI가 자동 제안하거나, 3가지 질문에 답해서 정리.",
        max_text_w=text_w,
    )

    arrow_start_3 = draw_label_card(
        canvas, draw,
        pos=(panel_x, label_y_start + 365),
        number="③",
        title="서브 키워드 / 추가 요구사항",
        desc="둘 다 선택. 본문에 자연 포함될 보조 키워드 + 특별 지시사항.",
        max_text_w=text_w,
    )

    arrow_start_4 = draw_label_card(
        canvas, draw,
        pos=(panel_x, label_y_start + 555),
        number="④",
        title="다음: 제목 선택",
        desc="메인 키워드 채웠으면 활성. 클릭하면 3단계로.",
        max_text_w=text_w,
    )

    # 화살표 — 라벨 좌측 중앙 → 본체 영역
    draw_arrow(draw, arrow_start_1, target_main)
    draw_arrow(draw, arrow_start_2, target_ai)
    draw_arrow(draw, arrow_start_3, target_sub)
    draw_arrow(draw, arrow_start_4, target_next)

    # 저장
    canvas.convert("RGB").save(DST, "PNG", optimize=True)
    print(f"✓ saved: {DST}  ({DST.stat().st_size // 1024} KB, {canvas.size})")


if __name__ == "__main__":
    main()
