import { app } from "electron";
import fs from "fs";
import path from "path";

// dev 모드(`electron path/to/main.js`)에선 app.getName()이 기본값 "Electron"이라
// userData가 ~/Library/Application Support/Electron/ 로 떨어져 배포 앱과 분리됨.
// setName으로 강제 일치시켜 dev/prod 동일 데이터 디렉토리 사용.
app.setName("app-blog2-desktop");

const isDev = !app.isPackaged;
const backendExecutableName = process.platform === "win32" ? "BlogPublisher.exe" : "BlogPublisher";
const youtubeBackendExecutableName = process.platform === "win32" ? "YoutubeGenerator.exe" : "YoutubeGenerator";
const ffmpegName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
const ffprobeName = process.platform === "win32" ? "ffprobe.exe" : "ffprobe";

// dev 에서도 build/ffmpeg 에 정적 빌드가 있으면 그것을 우선 사용 → 배포본과 동일 바이너리(dev=prod).
// "배포는 정상인데 dev 만 (시스템 ffmpeg 에 drawtext/libx264 빠져) 실패" 같은 환경 차이를 원천 차단.
// 없으면 빈 문자열 → 시스템 PATH 폴백(기존 동작 유지: build/ffmpeg 미배치 개발자 보호).
// build/ffmpeg 는 배포 시 그대로 번들되는 바로 그 디렉터리(youtube-backend/PACKAGING.md).
const devBundledFfmpeg = path.join(__dirname, "..", "..", "build", "ffmpeg", ffmpegName);
const devBundledFfprobe = path.join(__dirname, "..", "..", "build", "ffmpeg", ffprobeName);
const devFfmpegBin = isDev && fs.existsSync(devBundledFfmpeg) ? devBundledFfmpeg : "";
const devFfprobeBin = isDev && fs.existsSync(devBundledFfprobe) ? devBundledFfprobe : "";

export const paths = {
  isDev,

  userData: app.getPath("userData"),

  preload: path.join(__dirname, "preload.js"),

  splashHtml: isDev
    ? path.join(__dirname, "..", "splash.html")
    : path.join(process.resourcesPath, "splash.html"),

  updaterProgressHtml: isDev
    ? path.join(__dirname, "..", "updater-progress.html")
    : path.join(process.resourcesPath, "updater-progress.html"),

  updaterProgressPreload: isDev
    ? path.join(__dirname, "..", "updater-progress-preload.js")
    : path.join(process.resourcesPath, "updater-progress-preload.js"),

  backendExe: isDev
    ? path.join(__dirname, "..", "..", "backend", "dist", "BlogPublisher", backendExecutableName)
    : path.join(process.resourcesPath, "backend", backendExecutableName),

  backendCwdDev: path.join(__dirname, "..", "..", "backend"),

  // youtube-backend(쇼츠 생성기) — 두 번째 로컬 백엔드. packaged 는 별도 PyInstaller exe.
  youtubeBackendExe: isDev
    ? "" // dev 에선 youtubeBackendCwdDev 에서 python main.py 직접 실행
    : path.join(process.resourcesPath, "youtube-backend", youtubeBackendExecutableName),
  youtubeBackendCwdDev: path.join(__dirname, "..", "..", "youtube-backend"),
  // dev 의 전용 venv (scripts/dev-worktree.js 가 생성). 없으면 시스템 python 으로 폴백.
  youtubeVenvPython: process.platform === "win32"
    ? path.join(__dirname, "..", "..", "youtube-backend", ".venv", "Scripts", "python.exe")
    : path.join(__dirname, "..", "..", "youtube-backend", ".venv", "bin", "python"),

  // 번들 ffmpeg/ffprobe. packaged: resources/ffmpeg. dev: build/ffmpeg 가 있으면 그것(=배포본과 동일),
  // 없으면 빈 문자열 → 시스템 PATH 폴백. (devFfmpegBin/devFfprobeBin 계산은 위 참조)
  ffmpegBin: isDev ? devFfmpegBin : path.join(process.resourcesPath, "ffmpeg", ffmpegName),
  ffprobeBin: isDev ? devFfprobeBin : path.join(process.resourcesPath, "ffmpeg", ffprobeName),

  frontendCwdDev: path.join(__dirname, "..", "..", "frontend"),

  // Next standalone 출력 구조: standalone/frontend/server.js + standalone/node_modules (hoisted).
  // package.json extraResources 가 standalone 통째를 frontend 로 매핑하므로
  //   - server.js → resources/frontend/frontend/server.js
  //   - hoisted node_modules (lru-cache 등) → resources/frontend/node_modules  ← parent-walk 로 해결
  //   - 프로젝트 node_modules → resources/frontend/frontend/node_modules
  frontendStandaloneServer: path.join(process.resourcesPath, "frontend", "frontend", "server.js"),
  frontendHoistedNodeModules: path.join(process.resourcesPath, "frontend", "node_modules"),

  playwrightBrowsers: isDev
    ? path.join(__dirname, "..", "..", "playwright-cache")
    : path.join(process.resourcesPath, "ms-playwright"),

  // dev: 워크스페이스 루트의 build/icon.png. prod: macOS 는 번들 아이콘을 OS 가 직접 쓰지만
  // BrowserWindow.icon / app.dock.setIcon 폴백용 경로도 잡아둔다.
  iconPng: isDev
    ? path.join(__dirname, "..", "..", "build", "icon.png")
    : path.join(process.resourcesPath, "icon.png"),
};
