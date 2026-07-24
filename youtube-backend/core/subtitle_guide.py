"""자막이 화면 안전선(가이드1: 렌더 좌표 x100~980)을 벗어나는지 PIL 로 실측.

confirm(영상 만들기) 직전 백스톱 — 프론트가 정상 동작하면 도달하지 않지만, 렌더 직전 마지막으로
한 번 더 검사해 화면 밖으로 넘치는 자막이 박힌 영상을 막는다. 프론트 guide.ts 와 같은 규칙:
가로 중앙(x=540) + dx 오프셋, 마침표 제외, NFC, 테두리(외곽선) 폭 가산. 프론트 canvas
measureText 와 PIL getlength 는 같은 번들 TTF 를 재므로 사실상 일치한다(경계는 프론트보다
SLACK_PX 만큼 느슨 — 측정기 미세 차이로 프론트 통과분이 서버에서 막히는 것 방지).

폰트 해석은 worker.py 의 렌더 경로와 동일해야 실제 영상과 정합한다:
  job.subtitle_font 있으면 resolve_title_font_path(subtitle_font, subtitle_font_weight),
  없으면 settings.FONT_SUB.
"""

from functools import lru_cache

from PIL import ImageFont

from config import settings
from core.fonts import resolve_title_font_path
from core.subtitle_utils import natural_split, normalize_nfc, strip_subtitle_periods

RENDER_W = 1080
CENTER_X = RENDER_W / 2  # 540 — 자막 가로 중앙
SAFE_LEFT = 100
SAFE_RIGHT = 980
# 프론트(canvas)와 백엔드(PIL) 측정기 차이·반올림을 흡수하는 여유(px). 프론트가 통과시킨
# 자막이 서버에서만 막히는 경계 불일치를 방지한다.
SLACK_PX = 12


@lru_cache(maxsize=32)
def _font(font_path, size):
    return ImageFont.truetype(font_path, size)


def _stroke_px(size):
    """자막 테두리 두께 — video_assembler sub_border / 프론트 subtitleStrokePx 와 동일 공식."""
    return max(1, round(3 * size / 55))


def _display_lines(chunks):
    """조각들을 화면 줄(각 조각의 "\\n" = 화면 줄바꿈)로 펼친다. 프론트 subtitleDisplayLines 와 동일."""
    out = []
    for c in chunks:
        for ln in str(c).split("\n"):
            ln = ln.strip()
            if ln:
                out.append(ln)
    return out


def chunks_for_line(line):
    """줄의 유효 자막 조각 — 확정값(subtitle_chunks) 우선, 없으면 자동 분할.
    프론트 chunksForLine 과 동일(미리보기=판정 정합)."""
    raw = line.get("subtitle_chunks")
    if isinstance(raw, list):
        cleaned = [c for c in raw if isinstance(c, str) and c.strip()]
        if cleaned:
            return cleaned
    text = (line.get("text") or "").strip()
    if not text:
        return []
    return natural_split(text)


def _line_overflows(text, font, stroke, dx):
    clean = strip_subtitle_periods(normalize_nfc(text)).strip()
    if not clean:
        return False
    half = (font.getlength(clean) + 2 * stroke) / 2
    left = CENTER_X + dx - half
    right = CENTER_X + dx + half
    return left < SAFE_LEFT - SLACK_PX or right > SAFE_RIGHT + SLACK_PX


def resolve_subtitle_font_path(job):
    """렌더(worker.py)와 동일한 자막 폰트 경로 해석."""
    sub_font = getattr(job, "subtitle_font", None)
    if sub_font:
        return resolve_title_font_path(sub_font, getattr(job, "subtitle_font_weight", None))
    return settings.FONT_SUB


def find_overflow_line(lines, font_path, size, dx):
    """안전선을 벗어나는 첫 줄의 0-based 인덱스, 없으면 None.

    폰트 로드 실패 시 None(차단하지 않음 — 렌더가 폴백 폰트로 진행하므로 여기서 막지 않는다)."""
    try:
        font = _font(str(font_path), int(size))
    except Exception:
        return None
    stroke = _stroke_px(int(size))
    dx = int(dx)
    for i, line in enumerate(lines):
        for dl in _display_lines(chunks_for_line(line)):
            if _line_overflows(dl, font, stroke, dx):
                return i
    return None


def find_overflow_line_for_job(job, lines):
    """job 의 자막 스타일(폰트·크기·dx)로 find_overflow_line — 렌더 설정과 동일."""
    return find_overflow_line(
        lines,
        resolve_subtitle_font_path(job),
        int(getattr(job, "subtitle_font_size", None) or 55),
        int(getattr(job, "subtitle_dx", None) or 0),
    )
