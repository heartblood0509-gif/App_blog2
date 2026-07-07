"""카드 B 선트림 업로드: 나레이션-조각 길이 충돌 감지 로직 단위 테스트.

ffmpeg 실제 컷(_cut_clip_segment)은 통합 검증으로 확인했고, 여기서는 순수 로직만 고정한다.
"""
from api.routes.preview import _find_clip_conflicts, CLIP_FIT_EPS


def test_clip_conflict_detects_only_short_clip_lines():
    lines = [
        {"line_id": "a", "clip_duration": 8.0, "clip_start": 2.0},  # avail 6.0
        {"line_id": "b", "clip_duration": 5.0, "clip_start": 0.0},  # avail 5.0
        {"line_id": "c"},                                            # 레거시(clip_duration 없음)
        {"line_id": "d", "clip_duration": 10.0, "clip_start": 0.0},  # avail 10.0
    ]
    sources = ["clip", "clip", "clip", "clip"]
    # needed: a=5(OK), b=6(부족), c=999(레거시 스킵), d=9(OK)
    conflicts = _find_clip_conflicts(lines, sources, [5.0, 6.0, 999.0, 9.0])
    assert [c["index"] for c in conflicts] == [1]
    assert conflicts[0]["line_id"] == "b"
    assert abs(conflicts[0]["available"] - 5.0) < 1e-6
    assert abs(conflicts[0]["needed"] - 6.0) < 1e-6


def test_clip_conflict_skips_non_clip_sources():
    lines = [
        {"line_id": "a", "clip_duration": 3.0, "clip_start": 0.0},  # avail 3 < needed 5 이지만 source=ai
        {"line_id": "b", "clip_duration": 3.0, "clip_start": 0.0},  # source=clip → 감지
    ]
    conflicts = _find_clip_conflicts(lines, ["ai", "clip"], [5.0, 5.0])
    assert [c["index"] for c in conflicts] == [1]


def test_clip_conflict_within_eps_is_ok():
    # 사용가능 == 나레이션 - eps 경계: 통과해야 함(assembler 허용치와 동일).
    lines = [{"line_id": "a", "clip_duration": 5.0, "clip_start": 0.0}]
    assert _find_clip_conflicts(lines, ["clip"], [5.0 + CLIP_FIT_EPS / 2]) == []


def test_clip_conflict_empty_when_no_durations():
    lines = [{"line_id": "a", "clip_duration": 5.0, "clip_start": 0.0}]
    # durations 길이가 짧으면(0) 비교 대상 없음.
    assert _find_clip_conflicts(lines, ["clip"], []) == []
