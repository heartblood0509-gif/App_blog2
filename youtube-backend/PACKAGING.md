# youtube-backend 패키징 메모

블로그앱(Electron)에 두 번째 로컬 백엔드로 번들되는 "쇼츠 생성기"의 배포 빌드 절차.

## 1. 빌드 (PyInstaller)

`npm run build:backend` 이 두 백엔드를 모두 빌드한다:
- `backend/build-macos.sh` → `backend/dist/BlogPublisher/`
- `youtube-backend/build-youtube-macos.sh` → `youtube-backend/dist/YoutubeGenerator/`

(Windows 는 각각 `build-windows.bat` / `build-youtube-windows.bat`.)

electron-builder `extraResources` 가 `youtube-backend/dist/YoutubeGenerator` → `resources/youtube-backend/` 로 복사한다(이미 `package.json` 에 등록됨). 런타임에 `paths.youtubeBackendExe` 가 이 경로를 가리킨다.

### 빌드 머신 요구사항
- **Python ≥ 3.10** (fastapi>=0.135 등). 시스템 `python3` 가 3.9 면 빌드 스크립트가 `python3.13/3.12/3.11/3.10` 를 자동 탐색한다. 없으면 `brew install python@3.13`.
- Python 3.13 에서는 stdlib `audioop` 이 제거됐으므로(PEP 594) `requirements.txt` 가 `audioop-lts` 백포트를 조건부로 포함한다(pydub 의존성).

### 네이티브 의존성 (spec 에서 처리)
`YoutubeGenerator.spec` 이 `collect_all` 로 동봉: soundfile(libsndfile), Pillow, numpy, cryptography(OpenSSL), google-genai, boto3, bcrypt. 또한 `static/`·`fonts/` 디렉터리를 datas 로 포함.

## 2. ffmpeg / ffprobe 번들 (바이너리만 수동 제공)

youtube-backend 는 영상 합성·오디오 변환·길이 추출에 `ffmpeg` 와 `ffprobe` 를 서브프로세스로 호출한다. 두 바이너리는 라이선스/용량 문제로 레포에 포함하지 않으므로 **빌드 전에 직접 배치**해야 한다.

플랫폼별 정적 빌드를 받아 아래에 둔다(실행 권한 필요):
- macOS: `build/ffmpeg/ffmpeg`, `build/ffmpeg/ffprobe` (`chmod +x`)
- Windows: `build/ffmpeg/ffmpeg.exe`, `build/ffmpeg/ffprobe.exe`

그 외 배선은 **이미 되어 있다**:
- `package.json` `build.extraResources` 에 `{ "from": "build/ffmpeg", "to": "ffmpeg" }` 등록됨 → `resources/ffmpeg/ffmpeg(.exe)` 로 번들.
- `paths.ffmpegBin`/`ffprobeBin` 이 그 경로를 가리켜 Electron 이 `FFMPEG_BIN`/`FFPROBE_BIN` env 로 youtube-backend 에 주입.
  - **dev 도 `build/ffmpeg` 가 있으면 그 바이너리를 쓴다**(배포본과 동일 → dev=prod). 없으면 시스템 PATH 폴백.
    그래서 `build/ffmpeg` 에 정적 빌드를 한 번 배치해 두면 dev 영상 생성도 배포와 똑같이 동작한다.
- `npm run dist*` 는 electron-builder 직전에 `node scripts/check-ffmpeg.js` 로 **존재·실행권한에 더해 drawtext 필터(제목·자막용, libfreetype)와 libx264(H.264 인코더) 까지 검사**하고, 하나라도 없으면 빌드를 즉시 중단한다(조용히 깨진 앱이 나가지 않도록 — Codex 리뷰 #3·#5).
  - drawtext 가 없으면 영상이 `No such filter: 'drawtext'` 로 **전면 실패**한다(글자 □ 깨짐이 아니라 영상 자체가 안 나옴).

> 폴백: 런타임에 `FFMPEG_BIN`/`FFPROBE_BIN` 이 가리키는 파일이 없으면 `core/ffmpeg.py` resolver 가 시스템 PATH 로 폴백한다(개발 편의). 단 배포 앱은 PATH 를 신뢰할 수 없어 위 번들이 필수이며, 그래서 dist 단계에서 fail-fast 로 강제한다.

## 3. 런타임 데이터 경로

packaged 앱 번들 내부는 쓰기 불가이므로 Electron 이 `STORAGE_DIR`/`BGM_DIR` 을 `userData/youtube/...` 로 주입한다(SQLite `shorts.db`, 생성 영상, 임시파일, BGM 모두 여기에 저장).
