# 쇼츠 제목 색(HEX) 정규화·검증. 사용자 입력 색은 최종적으로 ffmpeg drawtext 필터
# 문자열(fontcolor=...)에 그대로 박히므로, 임의 문자열이 들어오면 필터 인젝션 위험이 있다.
# 그래서 라우터 흡수 시 1차, video_assembler 렌더 진입 시 2차로 이 함수를 통과시켜
# "#RRGGBB(대문자)" 형태만 허용하고, 그 외에는 무조건 기본색으로 폴백한다.

import re

_HEX_RE = re.compile(r"^#?([0-9A-Fa-f]{6})$")

# 제목 기본색: 윗줄 흰색 / 아랫줄 톤다운 노란색. 프론트 title-colors.ts 와 값이 일치해야 한다.
DEFAULT_TITLE_COLOR1 = "#FFFFFF"
DEFAULT_TITLE_COLOR2 = "#E8D44D"


def normalize_hex(value, default: str) -> str:
    """value 가 6자리 HEX(#유무 무관)면 '#RRGGBB'(대문자)로 정규화, 아니면 default 반환.

    default 자체도 한 번 더 검증해(오타 방지) 항상 안전한 값만 나가게 한다.
    """
    m = _HEX_RE.match(value.strip()) if isinstance(value, str) else None
    if m:
        return "#" + m.group(1).upper()
    md = _HEX_RE.match(default.strip()) if isinstance(default, str) else None
    return ("#" + md.group(1).upper()) if md else "#FFFFFF"
