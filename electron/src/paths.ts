import { app } from "electron";
import path from "path";

// dev 모드(`electron path/to/main.js`)에선 app.getName()이 기본값 "Electron"이라
// userData가 ~/Library/Application Support/Electron/ 로 떨어져 배포 앱과 분리됨.
// setName으로 강제 일치시켜 dev/prod 동일 데이터 디렉토리 사용.
app.setName("app-blog2-desktop");

const isDev = !app.isPackaged;
const backendExecutableName = process.platform === "win32" ? "BlogPublisher.exe" : "BlogPublisher";

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
