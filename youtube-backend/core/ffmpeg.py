"""ffmpeg / ffprobe 실행 파일 경로 resolver.

youtube-backend 는 ffmpeg·ffprobe 를 서브프로세스로 직접 호출한다(영상 합성·오디오 변환·길이 추출).
원본 코드는 `"ffmpeg"` / `"ffprobe"` 문자열을 하드코딩해 시스템 PATH 에만 의존했지만,
Electron 패키지 빌드에선 PATH 에 ffmpeg 가 없을 수 있어 번들된 바이너리를 가리켜야 한다.

해결: 환경변수 `FFMPEG_BIN` / `FFPROBE_BIN` 이 있으면 그 경로를, 없으면 PATH 에서 탐색한다.
- dev: 시스템 ffmpeg(예: brew) 사용 → env 없이도 동작.
- packaged: Electron 이 번들 바이너리 경로를 env 로 주입.

shell=True 로 실행하는 호출부가 많고 번들 경로엔 공백이 들어갈 수 있으므로
(예: macOS .app 번들), shell 문자열에 넣을 땐 반드시 큰따옴표로 감싼다 → `quoted_ffmpeg()`.
"""

import os
import shutil


def _resolve(name: str, env_var: str) -> str:
    path = os.environ.get(env_var)
    if path and os.path.exists(path):
        return path
    found = shutil.which(name)
    return found or name  # 최종 폴백: 이름 그대로(PATH 기대)


# 모듈 로드 시 1회 해석. (Electron env 는 프로세스 시작 시 주입되므로 안전)
FFMPEG = _resolve("ffmpeg", "FFMPEG_BIN")
FFPROBE = _resolve("ffprobe", "FFPROBE_BIN")


# shell=True / shlex.split 문자열 명령에 그대로 끼워 넣을 수 있는 큰따옴표 포함 형태.
# 예: f'{FFMPEG_Q} -y -i "{src}" "{dst}"'
FFMPEG_Q = f'"{FFMPEG}"'
FFPROBE_Q = f'"{FFPROBE}"'
