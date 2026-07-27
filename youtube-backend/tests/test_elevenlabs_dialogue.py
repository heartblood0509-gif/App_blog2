"""v3 text-to-dialogue 경로 단위 테스트.

v3 는 대본 전체를 한 번에 합성해(줄별 톤 흔들림 해소) 한 덩어리 오디오로 받는다.
그걸 다시 줄별 sent_XX.wav 로 정확히 나누는 게 이 경로의 핵심이라, 나누는 계산
(배치 분할 · 구간 취합 · 정렬 슬라이스 · 배속 보정)을 API 없이 검증한다.
"""

import pytest

# tests/conftest.py 가 JWT_SECRET 을 주입한 뒤 import
from core.tts_engines import (
    _dialogue_batches,
    _dialogue_spans,
    _slice_alignment,
    _uses_dialogue,
    _alignment_to_word_times,
)


# ── 어떤 모델이 dialogue 로 가나 ──────────────────────────────
def test_only_v3_uses_dialogue():
    assert _uses_dialogue("eleven_v3") is True
    assert _uses_dialogue("eleven_multilingual_v2") is False
    # 미지정이면 기본 모델(v2) 취급 — 줄별 호출로 가야 한다
    assert _uses_dialogue(None) is False
    assert _uses_dialogue("") is False


# ── 배치 분할 ────────────────────────────────────────────────
def test_batches_keep_everything_in_one_call_when_short():
    sents = ["가나다", "라마바", "사아자"]
    assert _dialogue_batches([0, 1, 2], sents) == [[0, 1, 2]]


def test_batches_split_on_char_budget():
    sents = ["A" * 60, "B" * 60, "C" * 60]
    # 상한 100 이면 60+60 이 넘으므로 한 줄씩 끊긴다
    assert _dialogue_batches([0, 1, 2], sents, max_chars=100) == [[0], [1], [2]]
    # 상한 130 이면 두 줄까지 들어간다
    assert _dialogue_batches([0, 1, 2], sents, max_chars=130) == [[0, 1], [2]]


def test_batches_never_split_a_single_long_line():
    """한 줄이 혼자 상한을 넘어도 쪼개지 않는다 — 문장을 자르면 자막 줄과 어긋난다."""
    sents = ["A" * 500, "B" * 10]
    assert _dialogue_batches([0, 1], sents, max_chars=100) == [[0], [1]]


def test_batches_preserve_given_order_and_subset():
    """증분 재생성은 연속되지 않은 줄 번호가 올 수 있다."""
    sents = ["가", "나", "다", "라"]
    assert _dialogue_batches([3, 1], sents) == [[3, 1]]


def test_batches_empty():
    assert _dialogue_batches([], []) == []


# ── voice_segments → 줄별 구간 ────────────────────────────────
def _seg(k, t0, t1, cs, ce):
    return {
        "dialogue_input_index": k,
        "start_time_seconds": t0,
        "end_time_seconds": t1,
        "character_start_index": cs,
        "character_end_index": ce,
        "voice_id": "v",
    }


def test_spans_basic():
    segs = [_seg(0, 0.0, 0.88, 0, 6), _seg(1, 0.88, 2.64, 6, 20)]
    assert _dialogue_spans(segs, 2, "T") == {0: [0.0, 0.88, 0, 6], 1: [0.88, 2.64, 6, 20]}


def test_spans_merge_when_one_line_arrives_split():
    """같은 줄이 여러 조각으로 와도 하나로 합친다(바깥쪽 경계를 취함)."""
    segs = [_seg(0, 0.0, 0.5, 0, 3), _seg(0, 0.5, 1.2, 3, 6)]
    assert _dialogue_spans(segs, 1, "T") == {0: [0.0, 1.2, 0, 6]}


def test_spans_ignore_out_of_range_index():
    segs = [_seg(0, 0.0, 1.0, 0, 5), _seg(9, 1.0, 2.0, 5, 9)]
    assert _dialogue_spans(segs, 1, "T") == {0: [0.0, 1.0, 0, 5]}


def test_spans_raise_when_a_line_is_missing():
    """구간 정보가 빠진 줄이 있으면 조용히 넘어가면 안 된다 — 그 줄 wav 가 안 생긴다."""
    with pytest.raises(RuntimeError, match="구간 정보"):
        _dialogue_spans([_seg(0, 0.0, 1.0, 0, 5)], 2, "T")


def test_spans_raise_on_empty_segments():
    with pytest.raises(RuntimeError, match="구간 정보"):
        _dialogue_spans([], 1, "T")


def test_spans_skip_malformed_entries():
    segs = [{"dialogue_input_index": "x"}, _seg(0, 0.0, 1.0, 0, 5)]
    assert _dialogue_spans(segs, 1, "T") == {0: [0.0, 1.0, 0, 5]}


# ── 정렬 슬라이스 (줄 기준으로 0초부터 다시 세기) ──────────────
FULL = {
    "characters": list("안녕하세요오늘은맑음"),
    "character_start_times_seconds": [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9],
    "character_end_times_seconds": [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
}


def test_slice_rebases_to_line_start():
    """둘째 줄(5번 글자부터)은 0.5초에 시작하므로 그 줄 안에선 0초가 돼야 한다."""
    out = _slice_alignment(FULL, 5, 10, 0.5, 1.0)
    assert out["characters"] == list("오늘은맑음")
    assert out["character_start_times_seconds"][0] == pytest.approx(0.0)
    assert out["character_end_times_seconds"][-1] == pytest.approx(0.5)


def test_slice_applies_tempo():
    """배속을 걸면 오디오가 1/tempo 로 짧아지니 타임스탬프도 같이 줄어야 한다."""
    out = _slice_alignment(FULL, 5, 10, 0.5 / 2.0, 2.0)
    assert out["character_start_times_seconds"][0] == pytest.approx(0.0)
    # 원래 0.5초짜리 구간이 2배속이면 0.25초
    assert out["character_end_times_seconds"][-1] == pytest.approx(0.25)


def test_slice_never_returns_negative_times():
    """반올림 때문에 시작이 살짝 음수로 계산돼도 0 으로 막는다(자막이 음수 초로 어긋남 방지)."""
    out = _slice_alignment(FULL, 5, 10, 0.6, 1.0)
    assert min(out["character_start_times_seconds"]) >= 0.0


def test_slice_feeds_word_times_pipeline():
    """슬라이스 결과가 기존 어절 변환 파이프라인에 그대로 들어간다."""
    al = {
        "characters": list("안녕 세상"),
        "character_start_times_seconds": [0.0, 0.1, 0.2, 0.2, 0.3],
        "character_end_times_seconds": [0.1, 0.2, 0.2, 0.3, 0.4],
    }
    words = _alignment_to_word_times(_slice_alignment(al, 0, 5, 0.0, 1.0))
    assert [w["text"] for w in words] == ["안녕", "세상"]


def test_slice_clamps_out_of_range_indices():
    out = _slice_alignment(FULL, 8, 999, 0.8, 1.0)
    assert out["characters"] == list("맑음")


def test_slice_returns_none_on_bad_input():
    assert _slice_alignment(None, 0, 5, 0.0, 1.0) is None
    assert _slice_alignment({}, 0, 5, 0.0, 1.0) is None
    assert _slice_alignment(FULL, 5, 5, 0.0, 1.0) is None
