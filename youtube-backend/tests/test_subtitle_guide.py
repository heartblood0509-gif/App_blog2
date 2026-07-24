"""자막 화면-폭 백스톱(core/subtitle_guide) — 실제 번들 TTF 로 안전선 판정 테스트.

핵심: 글자 수(12자)가 아니라 실제 픽셀 폭으로 판정하므로
  · 짧은 문장은 통과, 같은 문장을 키우면 넘침(글자 크기 반영)
  · dx 로 옮기면 옮긴 위치 기준으로 넘침(위치 반영)
  · NFD(자모 분해) 텍스트도 NFC 와 동일 판정(맥 붙여넣기 오탐 방지)
  · 조각(subtitle_chunks)이 없는 줄은 자동 분할로 폴백해 검사
"""

import unicodedata

from core.subtitle_guide import (
    find_overflow_line,
    find_overflow_line_for_job,
    resolve_subtitle_font_path,
)
from config import settings


FONT = settings.FONT_SUB  # 번들 Pretendard


def _line(text, chunks=None):
    d = {"line_id": "l1", "text": text}
    if chunks is not None:
        d["subtitle_chunks"] = chunks
    return d


class _Job:
    def __init__(self, font="pretendard", weight="extrabold", size=55, dx=0):
        self.subtitle_font = font
        self.subtitle_font_weight = weight
        self.subtitle_font_size = size
        self.subtitle_dx = dx


def test_short_line_passes_at_default_size():
    lines = [_line("두 마리를 소개합니다", ["두 마리를 소개합니다"])]
    assert find_overflow_line(lines, FONT, 55, 0) is None


def test_same_line_overflows_when_enlarged():
    # 화면에 딱 맞는 줄도 글자 크기를 키우면 안전선을 넘는다(글자 수는 그대로).
    lines = [_line("두 마리를 소개합니다", ["두 마리를 소개합니다"])]
    assert find_overflow_line(lines, FONT, 55, 0) is None
    assert find_overflow_line(lines, FONT, 120, 0) == 0


def test_overflows_when_shifted_by_dx():
    # 중앙에선 여유롭지만 오른쪽 끝까지 옮기면 넘친다(위치 반영).
    lines = [_line("두 마리를 소개합니다", ["두 마리를 소개합니다"])]
    assert find_overflow_line(lines, FONT, 55, 0) is None
    assert find_overflow_line(lines, FONT, 55, 350) == 0


def test_nfd_text_same_verdict_as_nfc():
    nfc = "두 마리를 소개합니다"
    nfd = unicodedata.normalize("NFD", nfc)
    for size in (55, 120):
        a = find_overflow_line([_line(nfc, [nfc])], FONT, size, 0)
        b = find_overflow_line([_line(nfd, [nfd])], FONT, size, 0)
        assert a == b


def test_long_single_chunk_overflows():
    # 한 조각에 문장을 통째로 넣으면(끊지 않으면) 넘친다.
    long = "저희 집에 살고 있는 심장 폭행하는 고양이가 두 마리"
    assert find_overflow_line([_line("x", [long])], FONT, 55, 0) == 0


def test_falls_back_to_auto_split_when_no_chunks():
    # 조각을 안 준 줄(자동 분할 폴백)도 검사 대상 — 정상 길이는 통과.
    lines = [_line("저희 집에 살고 있는 심장 폭행하는 고양이가 두 마리를 소개합니다")]
    # 자동 분할(natural_split)은 12자 이하 조각들로 나뉘므로 기본 크기에선 통과.
    assert find_overflow_line(lines, FONT, 55, 0) is None


def test_second_line_index_reported():
    lines = [
        _line("첫 줄", ["첫 줄"]),
        _line("x", ["저희 집에 살고 있는 심장 폭행하는 고양이가 두 마리"]),
    ]
    assert find_overflow_line(lines, FONT, 55, 0) == 1


def test_missing_font_does_not_block():
    lines = [_line("x", ["저희 집에 살고 있는 심장 폭행하는 고양이가 두 마리"])]
    assert find_overflow_line(lines, "/nonexistent/font.ttf", 55, 0) is None


def test_for_job_matches_render_font_resolution():
    # job 스타일로 검사 — 사용자가 폰트를 고르면 렌더와 동일한 번들 폰트로 해석.
    job = _Job(font="pretendard", weight="extrabold", size=55, dx=0)
    path = resolve_subtitle_font_path(job)
    assert path.endswith("Pretendard-ExtraBold.ttf")
    lines = [_line("두 마리를 소개합니다", ["두 마리를 소개합니다"])]
    assert find_overflow_line_for_job(job, lines) is None
    assert find_overflow_line_for_job(_Job(size=120), lines) == 0


def test_for_job_defaults_to_settings_font_when_unset():
    # subtitle_font 미설정(레거시)이면 settings.FONT_SUB 로 폴백.
    job = _Job(font=None)
    assert resolve_subtitle_font_path(job) == settings.FONT_SUB
