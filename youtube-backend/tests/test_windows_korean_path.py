"""윈도우 한글 계정 경로(C:\\Users\\한글이름\\...) 회귀 테스트.

배경: 계정 폴더가 한글이면 쇼츠 영상 '마지막 합치기(concat)' 단계에서 실패했다.
두 겹의 버그:
  1) concat 목록 파일에 한글 절대경로를 cp949로 저장 → ffmpeg가 경로를 못 찾음.
  2) ffmpeg 출력(한글 바이트 포함) 디코딩이 깨져 result.stderr가 None → 진짜 에러가
     TypeError로 둔갑(은폐).

여기서는 (2)의 은폐 방지와 get_duration 방어를 ffmpeg 없이도 결정적으로 검증하고,
(1)의 상대경로 방식이 한글+공백 폴더에서도 정상 동작하는지 ffmpeg가 있을 때 검증한다.
mac은 파일시스템이 UTF-8이라 cp949 실패 자체는 재현되지 않는다(윈도우 빌드 현장검증 별도).
"""

import os
import shutil
import sys

import pytest

# tests/conftest.py가 JWT_SECRET 주입 후 import
from core.audio_utils import run
from core.ffmpeg import FFMPEG_Q

_HAS_FFMPEG = shutil.which("ffmpeg") is not None
requires_ffmpeg = pytest.mark.skipif(not _HAS_FFMPEG, reason="ffmpeg 필요")

KOR_DIR = "픽소 윤희"  # 한글 + 공백 (실제 사고 계정명)


# ── (2) 에러 은폐 방지: run()이 읽을 수 있는 RuntimeError를 던지는가 ──────────────

def test_run_surfaces_readable_error_on_invalid_utf8_stderr():
    """실패하면서 stderr에 유효하지 않은 UTF-8 바이트를 뱉는 명령.

    수정 전(encoding='utf-8'만): 디코딩이 깨져 stderr=None → `stderr[-1000:]`에서
    TypeError, 또는 POSIX에선 subprocess.run이 UnicodeDecodeError를 던짐.
    수정 후(errors='replace'): 문자열로 디코드되어 returncode!=0 → RuntimeError로 표면화.
    """
    py = sys.executable
    # b'\xed\x95\x9c' = '한'(정상 UTF-8), b'\xff\xfe' = 잘못된 바이트 → replace 대상
    code = "import sys; sys.stderr.buffer.write(b'\\xed\\x95\\x9c\\xff\\xfe fail'); sys.exit(1)"
    cmd = f'"{py}" -c "{code}"'
    with pytest.raises(RuntimeError):
        run(cmd)


# ── get_duration 방어: 실패를 명확한 RuntimeError로 ──────────────────────────────

def test_get_duration_raises_runtimeerror_on_bad_input(tmp_path):
    """ffprobe 실패 시 JSONDecodeError/KeyError로 흐려지지 않고 RuntimeError를 던지는가.

    (ffprobe가 없어도 returncode!=0 → 동일하게 RuntimeError. ffmpeg 불필요.)
    """
    from core.video_assembler import get_duration

    with pytest.raises(RuntimeError):
        get_duration(str(tmp_path / "존재하지않는파일.mp4"))


# ── (1) 상대경로 concat이 한글+공백 폴더에서 동작하는가 ──────────────────────────

@requires_ffmpeg
def test_concat_relative_paths_in_korean_dir(tmp_path):
    """한글+공백 폴더 안에서 '파일명만' concat 목록으로 이어붙이기가 성공하는가."""
    from core.video_assembler import get_duration

    kdir = tmp_path / KOR_DIR / "temp"
    kdir.mkdir(parents=True)

    clips = []
    for i in range(2):
        clip = os.path.join(str(kdir), f"clip_{i:02d}.mp4")
        run(
            f'{FFMPEG_Q} -y -f lavfi -i testsrc=duration=0.3:size=64x64:rate=10 '
            f'-pix_fmt yuv420p "{clip}"'
        )
        assert os.path.exists(clip)
        clips.append(clip)

    # 프로덕션과 동일: 목록 파일은 temp_dir 안, 항목은 파일명(basename)만, UTF-8 저장
    concat_list = os.path.join(str(kdir), "concat_list.txt")
    with open(concat_list, "w", encoding="utf-8") as f:
        for clip in clips:
            f.write(f"file '{os.path.basename(clip)}'\n")

    out = os.path.join(str(kdir), "concat_raw.mp4")
    run(f'{FFMPEG_Q} -y -f concat -safe 0 -i "{concat_list}" -c copy "{out}"')

    assert os.path.exists(out)
    assert get_duration(out) > 0.0
