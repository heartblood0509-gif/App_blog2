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


# ── 앞뒤 문맥(previous_text/next_text) ────────────────────────
# 짧은 줄이 홀로 날아가면 모델이 한국어 대본인데 중국어·영어 발음을 튀게 하는 문제 완화용.
# ⚠️ v3 는 이 파라미터를 HTTP 400(unsupported_model)으로 거부하므로 반드시 빠져야 한다.
from core.tts_engines import _eleven_context, _ELEVEN_CONTEXT_CHARS  # noqa: E402

_SENTS = ["첫째 문장.", "둘째 문장.", "셋째 문장.", "넷째 문장."]


def test_context_includes_both_sides_in_original_order():
    prev, nxt = _eleven_context(_SENTS, 2, "eleven_multilingual_v2")
    assert prev == "첫째 문장. 둘째 문장."   # 원문 순서 유지(역순 아님)
    assert nxt == "넷째 문장."


def test_context_none_at_edges():
    assert _eleven_context(_SENTS, 0, "eleven_multilingual_v2")[0] is None   # 첫 줄엔 앞 문맥 없음
    assert _eleven_context(_SENTS, 3, "eleven_multilingual_v2")[1] is None   # 끝 줄엔 뒤 문맥 없음
    assert _eleven_context(["혼자"], 0, "eleven_multilingual_v2") == (None, None)


def test_context_disabled_for_v3():
    # v3 에 붙이면 생성 자체가 400 으로 죽는다 — 모델 게이트 회귀 방지.
    assert _eleven_context(_SENTS, 2, "eleven_v3") == (None, None)


def test_context_respects_char_budget():
    long = ["가" * 250, "나" * 250, "짧은 줄", "다" * 250, "라" * 250]
    prev, nxt = _eleven_context(long, 2, "eleven_multilingual_v2")
    # 250+250 은 예산(300)을 넘으므로 가장 가까운 한 줄만 담긴다.
    assert len(prev) <= _ELEVEN_CONTEXT_CHARS and len(nxt) <= _ELEVEN_CONTEXT_CHARS
    assert prev == "나" * 250 and nxt == "다" * 250


def test_context_skips_blank_and_bad_index():
    assert _eleven_context(_SENTS, 99, "eleven_multilingual_v2") == (None, None)
    assert _eleven_context(["", "  ", "본문"], 2, "eleven_multilingual_v2")[0] is None
