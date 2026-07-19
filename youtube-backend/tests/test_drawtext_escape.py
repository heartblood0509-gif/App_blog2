"""drawtext 2단계 이스케이프 — 곧은따옴표(')로 자막이 통째로 사라지던 버그 회귀 테스트.

배경: ffmpeg 는 필터 문자열을 두 번 해석한다(필터그래프 → 옵션값). 과거 한 단계
이스케이프는 ' 가 대본에 있으면 두 번째 해석에서 인용이 찢어져 그 자막이 정상
위치에서 사라지고 좌상단에 잔해가 렌더됐다(에러 없이 영상 완성 → 조용한 소실).
백슬래시는 조용히 증발했다. 번들 ffmpeg 실측(PNG 렌더 비교)으로 검증된 로직을
문자열 수준에서 고정한다.
"""

import re

from core.video_assembler import escape_drawtext_text


def test_plain_text_quoted():
    # 특수문자 없는 평문: 인용부호(그래프 레벨로 이스케이프된 \')로 감싸진다.
    assert escape_drawtext_text("안녕하세요") == "\\'안녕하세요\\'"


def test_straight_quote_exact():
    # it's → ①옵션값 'it'\''s' → ②그래프 레벨 \'it\'\\\'\'s\'  (실측 렌더 정상 확인)
    assert escape_drawtext_text("it's") == "\\'it\\'\\\\\\'\\'s\\'"


def test_backslash_survives():
    # 과거엔 조용히 증발하던 백슬래시가 이스케이프돼 살아남는다.
    assert escape_drawtext_text("a\\b") == "\\'a\\\\b\\'"


def test_graph_separators_escaped():
    # 필터그래프 구분자(, ; [ ])는 전부 백슬래시 이스케이프.
    out = escape_drawtext_text("a,b;c[d]")
    assert "\\," in out and "\\;" in out and "\\[" in out and "\\]" in out


def test_curly_quotes_passthrough():
    # 둥근따옴표(AI 대본 기본)는 특수문자가 아니라 그대로 통과 — 회귀 방지.
    assert escape_drawtext_text("‘인용’ “그대로”") == "\\'‘인용’ “그대로”\\'"


def test_no_unescaped_specials_remain():
    # 어떤 입력이든, 백슬래시가 앞에 없는 맨몸 ' , ; [ ] 가 결과에 남지 않는다.
    cases = [
        "it's ok",
        "쉼표, 콜론: 100% 'A' 끝",
        "back\\slash '혼합', 전부; [다] 나옴",
        "‘둥근’ 과 \"큰따옴표\" {x} # $ & ~",
        "",
    ]
    for s in cases:
        out = escape_drawtext_text(s)
        bare = re.search(r"(?<!\\)[',;\[\]]", out)
        assert bare is None, f"{s!r} -> {out!r} 에 맨몸 특수문자 {bare.group()!r}"


def test_composes_into_drawtext_option():
    # 호출부 계약: text={결과} 로 따옴표 없이 끼워도 : 구분이 안 깨진다(콜론 포함 입력).
    e = escape_drawtext_text("콜론: 있음")
    frag = f"drawtext=expansion=none:text={e}:fontsize=55"
    # 인용 안의 콜론은 옵션 구분자로 해석되지 않아야 하며, 인용부호가 양끝을 감싼다.
    assert frag.startswith("drawtext=expansion=none:text=\\'")
    assert frag.endswith("\\':fontsize=55")
