import { app } from "electron";
import path from "path";

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
};
