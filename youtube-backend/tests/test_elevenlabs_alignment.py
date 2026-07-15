"""ElevenLabs 글자 정렬 → 어절 word_times 변환(_alignment_to_word_times) 단위 테스트.

핵심: 공백 기준으로 글자 타임스탬프를 묶어 Typecast 와 동일한 어절 word_times 를 만든다.
엣지 케이스(앞뒤 공백/개행/구두점/빈·불일치 배열)와 _validate_word_times 통과를 검증한다.
"""

# tests/conftest.py 가 JWT_SECRET 을 주입한 뒤 import
from core.tts_engines import (
    _alignment_to_word_times,
    _pack_char_alignment,
    _validate_word_times,
    _eleven_opts,
    _coerce_float,
)


def _al(chars, starts, ends):
    return {
        "characters": chars,
        "character_start_times_seconds": starts,
        "character_end_times_seconds": ends,
    }


# ── 정상: 공백으로 어절 분리 ──────────────────────────────────
def test_basic_korean_two_words():
    al = _al(
        ["안", "녕", " ", "세", "상"],
        [0.0, 0.12, 0.25, 0.25, 0.40],
        [0.12, 0.25, 0.25, 0.40, 0.55],
    )
    assert _alignment_to_word_times(al) == [
        {"text": "안녕", "start": 0.0, "end": 0.25},
        {"text": "세상", "start": 0.25, "end": 0.55},
    ]


# ── 앞뒤 공백·개행은 빈 단어를 만들지 않는다 ──────────────────
def test_leading_trailing_and_newline():
    al = _al(
        [" ", "가", "\n", "나", " "],
        [0.0, 0.1, 0.2, 0.3, 0.4],
        [0.1, 0.2, 0.3, 0.4, 0.5],
    )
    assert _alignment_to_word_times(al) == [
        {"text": "가", "start": 0.1, "end": 0.2},
        {"text": "나", "start": 0.3, "end": 0.4},
    ]


# ── 구두점은 앞 단어에 붙는다 ─────────────────────────────────
def test_punctuation_attaches_to_word():
    al = _al(
        ["안", "녕", "!", " ", "야"],
        [0.0, 0.1, 0.2, 0.3, 0.4],
        [0.1, 0.2, 0.3, 0.4, 0.5],
    )
    out = _alignment_to_word_times(al)
    assert out[0]["text"] == "안녕!"
    assert out[1]["text"] == "야"


# ── 형식 이상 → None (호출부가 비례 폴백) ─────────────────────
def test_none_on_bad_input():
    assert _alignment_to_word_times(None) is None
    assert _alignment_to_word_times({}) is None
    # 길이 불일치
    assert _alignment_to_word_times(_al(["a", "b"], [0.0], [0.1])) is None
    # 빈 배열
    assert _alignment_to_word_times(_al([], [], [])) is None
    # 전부 공백 → 단어 없음 → None
    assert _alignment_to_word_times(_al([" ", " "], [0.0, 0.1], [0.1, 0.2])) is None


# ── _validate_word_times 를 통과하는 정상 결과 ────────────────
def test_validate_passthrough():
    al = _al(
        ["가", " ", "나", "다"],
        [0.0, 0.3, 0.3, 0.6],
        [0.3, 0.3, 0.6, 0.9],
    )
    wt = _alignment_to_word_times(al)
    # duration 이 마지막 end 와 맞으면 그대로 통과
    assert _validate_word_times(wt, 0.9) == wt


# ── char_alignment 저장 형태 ──────────────────────────────────
def test_pack_char_alignment():
    al = _al(["가", "나"], [0.0, 0.11], [0.11, 0.22])
    packed = _pack_char_alignment(al)
    assert packed == {
        "characters": ["가", "나"],
        "start_times": [0.0, 0.11],
        "end_times": [0.11, 0.22],
    }
    assert _pack_char_alignment({"characters": ["a"], "character_start_times_seconds": []}) is None


# ── _eleven_opts / _coerce_float 기본값 정규화 ────────────────
def test_eleven_opts_defaults():
    assert _eleven_opts(None) == ("eleven_multilingual_v2", 0.5, 0.75, 0.0)
    assert _eleven_opts({"model_id": "eleven_v3", "stability": 0.2}) == (
        "eleven_v3",
        0.2,
        0.75,
        0.0,
    )


def test_coerce_float():
    assert _coerce_float("1.5", 0.0) == 1.5
    assert _coerce_float(None, 0.5) == 0.5
    assert _coerce_float("bad", 0.3) == 0.3
