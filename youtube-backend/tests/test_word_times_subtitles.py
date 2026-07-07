"""자막 조각 타이밍(word_times) 단위 테스트.

split_subtitle_natural 이 어절 타임스탬프가 있으면 조각 전환을 실제 발화(어절 start)에 맞추고,
정합하지 않으면 표시 길이 비례로 폴백하는지 검증한다. 프론트 subtitle-split.test.ts 와 같은 규칙.
"""

from core.subtitle_utils import split_subtitle_natural, word_times_match


def _line(text, offset, end):
    return {"text": text, "offset": offset, "end": end}


def test_word_times_boundary_is_next_word_start():
    # 10~13초 줄, 2 조각. 다음 조각 첫 어절(곽명근입니다)의 start=1.6 → 전환 = 10+1.6
    timings = [_line("안녕하세요 저는 곽명근입니다", 10.0, 13.0)]
    chunks = [["안녕하세요 저는", "곽명근입니다"]]
    wt = [[
        {"text": "안녕하세요", "start": 0.0, "end": 0.6},
        {"text": "저는", "start": 0.7, "end": 1.0},
        {"text": "곽명근입니다", "start": 1.6, "end": 2.9},
    ]]
    subs = split_subtitle_natural(timings, chunks, wt)
    assert subs == [(10.0, 11.6, "안녕하세요 저는"), (11.6, 13.0, "곽명근입니다")]


def test_first_chunk_starts_at_offset_last_ends_at_line_end():
    timings = [_line("하나 둘 셋", 5.0, 8.0)]
    chunks = [["하나", "둘 셋"]]
    wt = [[
        {"text": "하나", "start": 0.3, "end": 0.8},  # 앞 침묵 0.3 — 그래도 자막은 줄 시작부터
        {"text": "둘", "start": 1.2, "end": 1.6},
        {"text": "셋", "start": 1.9, "end": 2.4},
    ]]
    subs = split_subtitle_natural(timings, chunks, wt)
    assert subs[0][0] == 5.0        # 첫 조각은 줄 offset 부터
    assert subs[0][1] == 6.2        # 둘의 start=1.2 → 5.0+1.2
    assert subs[-1][1] == 8.0       # 마지막 조각은 줄 끝까지


def test_fallback_proportional_when_no_word_times():
    timings = [_line("안녕하세요 저는 곽명근입니다", 0.0, 3.0)]
    chunks = [["안녕하세요 저는", "곽명근입니다"]]
    with_none = split_subtitle_natural(timings, chunks, None)
    # 표시 길이 비례: "안녕하세요 저는"(8) : "곽명근입니다"(6) → 첫 조각 끝 = 3*8/14 ≈ 1.71
    assert with_none[0][1] != 3.0
    assert abs(with_none[0][1] - 1.71) < 0.05


def test_fallback_on_count_mismatch():
    timings = [_line("가 나 다", 0.0, 3.0)]
    chunks = [["가 나 다"]]  # 1 조각인데
    wt = [[{"text": "가", "start": 0.0, "end": 1.0}, {"text": "나", "start": 1.0, "end": 2.0}]]  # 2 어절
    # 어절 수(2) != 조각의 어절 수(3) → 폴백. 무크래시로 단일 조각 반환.
    subs = split_subtitle_natural(timings, chunks, wt)
    assert len(subs) == 1
    assert subs[0] == (0.0, 3.0, "가 나 다")


def test_fallback_on_text_mismatch():
    timings = [_line("가 나", 0.0, 2.0)]
    chunks = [["가", "나"]]
    wt = [[{"text": "가", "start": 0.0, "end": 1.0}, {"text": "다", "start": 1.0, "end": 2.0}]]  # 다 != 나
    assert not word_times_match(["가", "나"], wt[0])
    subs = split_subtitle_natural(timings, chunks, wt)
    # 폴백(비례): 두 조각 동일 길이 → 1.0 경계
    assert subs[0][1] == 1.0


def test_fallback_on_non_monotonic_starts():
    timings = [_line("가 나 다", 0.0, 3.0)]
    chunks = [["가", "나", "다"]]
    wt = [[
        {"text": "가", "start": 0.0, "end": 1.0},
        {"text": "나", "start": 2.0, "end": 2.5},
        {"text": "다", "start": 1.0, "end": 3.0},  # start 역행
    ]]
    assert not word_times_match(["가", "나", "다"], wt[0])


def test_card_a_trailing_period_tolerance():
    # 카드 A 는 chunks 가 natural_split(text.rstrip(".")) 이라 끝 마침표가 빠진다.
    # word_times 의 마지막 어절엔 마침표가 붙어 있어도 정합해야 한다.
    chunks = ["안녕하세요", "곽명근입니다"]  # 마침표 없음(rstrip 결과)
    wt = [
        {"text": "안녕하세요", "start": 0.0, "end": 0.6},
        {"text": "곽명근입니다.", "start": 0.7, "end": 1.5},  # 마침표 붙음
    ]
    assert word_times_match(chunks, wt)


def test_word_times_match_basic():
    assert word_times_match(["가 나", "다"], [
        {"text": "가", "start": 0.0, "end": 0.5},
        {"text": "나", "start": 0.5, "end": 1.0},
        {"text": "다", "start": 1.0, "end": 1.5},
    ])
    assert not word_times_match(["가"], None)
    assert not word_times_match(["가"], [])


# ── 자막 전용 띄어쓰기: 발화 한 어절("피부장벽이")이 자막에선 여러 어절("피부 장벽이") ──
# 프론트 subtitle-split.test.ts 의 같은 픽스처와 정합.

_WT_SPLIT = [
    {"text": "홍조의", "start": 0.0, "end": 0.5},
    {"text": "원인은", "start": 0.6, "end": 1.1},
    {"text": "피부장벽이", "start": 1.3, "end": 2.3},
    {"text": "무너졌기", "start": 2.4, "end": 3.0},
    {"text": "때문입니다.", "start": 3.1, "end": 3.8},
]


def test_word_count_differs_but_string_matches():
    # 어절 수(6 vs 5)가 달라도 공백 제거 문자열이 같으면 정합.
    assert word_times_match(["홍조의 원인은", "피부 장벽이 무너졌기 때문입니다."], _WT_SPLIT)


def test_boundary_at_word_start_unchanged_with_subtitle_space():
    # 경계가 발화 어절 시작(피부장벽이 start=1.3)에 떨어지면 기존 규칙 그대로.
    timings = [_line("홍조의 원인은 피부장벽이 무너졌기 때문입니다.", 10.0, 14.0)]
    chunks = [["홍조의 원인은", "피부 장벽이 무너졌기 때문입니다."]]
    subs = split_subtitle_natural(timings, chunks, [_WT_SPLIT])
    # 타이밍은 원본 조각(마침표 포함)으로 정렬하고, 출력 자막에서만 마침표가 빠진다.
    assert subs == [
        (10.0, 11.3, "홍조의 원인은"),
        (11.3, 14.0, "피부 장벽이 무너졌기 때문입니다"),
    ]


def test_boundary_inside_spoken_word_interpolates():
    # "피부|장벽이": 피부장벽이(5자, 1.3~2.3)의 2/5 지점 → 1.3 + 1.0×0.4 = 1.7
    timings = [_line("홍조의 원인은 피부장벽이 무너졌기 때문입니다.", 10.0, 14.0)]
    chunks = [["홍조의 원인은 피부", "장벽이 무너졌기 때문입니다."]]
    subs = split_subtitle_natural(timings, chunks, [_WT_SPLIT])
    assert subs[0] == (10.0, 11.7, "홍조의 원인은 피부")
    assert subs[1] == (11.7, 14.0, "장벽이 무너졌기 때문입니다")


# ── 자막 마침표 제거(소수점 보존) ──────────────────────────────────

from core.subtitle_utils import strip_subtitle_periods  # noqa: E402


def test_strip_subtitle_periods_removes_and_keeps_decimals():
    assert strip_subtitle_periods("때문입니다.") == "때문입니다"
    assert strip_subtitle_periods("안녕...") == "안녕"          # 여러 마침표(생략부호)도 제거
    assert strip_subtitle_periods("5만.") == "5만"
    assert strip_subtitle_periods("3.5") == "3.5"             # 소수점 보존
    assert strip_subtitle_periods("가격은 3.5%입니다.") == "가격은 3.5%입니다"
    assert strip_subtitle_periods("0.5초") == "0.5초"


def test_output_strips_period_but_keeps_decimal_and_timing():
    # 카드 B 확정 조각(마침표 포함, 소수점 포함) → 타이밍은 그대로, 출력 자막만 마침표 제거.
    timings = [_line("가격은 3.5입니다.", 0.0, 4.0)]
    chunks = [["가격은", "3.5입니다."]]
    subs = split_subtitle_natural(timings, chunks, None)
    texts = [t for _, _, t in subs]
    assert texts == ["가격은", "3.5입니다"]  # 끝 마침표만 빠지고 소수점은 유지
