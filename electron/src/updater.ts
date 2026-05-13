// electron-updater 통합 + §D busy guard.
//
// 정책(§D):
//   - autoDownload = false : 사용자가 "다운로드" 누른 경우에만 받기.
//   - autoInstallOnAppQuit = false : "지금 설치" 누른 경우에만 인스톨.
//   - 부팅 4초 후 1회 자동 check.
//   - busy 상태(busyOps.size > 0) 일 때는 install 거부 → blocked-busy 응답.
//     마지막 busy op 가 끝나는 순간 자동으로 install 재시도 (main.ts 에서 처리).

import { BrowserWindow, ipcMain, shell, app } from "electron";
import { autoUpdater } from "electron-updater";
import log from "electron-log";
import { paths } from "./paths";

// §G — autoUpdater 의 모든 로그를 electron-log 로.
autoUpdater.logger = log;

type UpdaterStatus =
  | "checking"
  | "available"
  | "none"
  | "downloading"
  | "downloaded"
  | "error"
  | "blocked-busy";

let splash: BrowserWindow | null = null;
let registered = false;
let pendingMain: BrowserWindow | null = null;

const RELEASES_URL = "https://github.com/heartblood0509-gif/App_blog2/releases/latest";

function showSplash(): void {
  if (splash && !splash.isDestroyed()) return;
  splash = new BrowserWindow({
    width: 360,
    height: 120,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: "#1a1a1a",
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  splash.loadFile(paths.splashHtml).catch((e) => {
    console.warn(`[updater] splash load 실패: ${(e as Error).message}`);
  });
  splash.on("closed", () => {
    splash = null;
  });
}

/** 외부에서 호출 — busy 해제 transition 시 main.ts 가 install 재시도. */
export function tryInstallNow(main: BrowserWindow): void {
  try {
    if (!main.isDestroyed()) main.hide();
  } catch { /* ignore */ }
  showSplash();
  setTimeout(() => {
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch (e) {
      console.warn(`[updater] quitAndInstall 실패: ${(e as Error).message}`);
    }
  }, 500);
}

export function initUpdater(main: BrowserWindow): void {
  if (registered) return;
  registered = true;
  pendingMain = main;

  if (!app.isPackaged) {
    console.log("[updater] dev 모드 — 자동 업데이트 비활성");
    return;
  }

  if (process.platform === "darwin") {
    autoUpdater.on("update-available", () => {
      shell.openExternal(RELEASES_URL).catch(() => { /* ignore */ });
    });
    autoUpdater.checkForUpdates().catch(() => { /* ignore */ });
    return;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;

  const send = (s: UpdaterStatus, p?: unknown): void => {
    if (main.isDestroyed()) return;
    main.webContents.send("updater:state", { s, p });
  };

  autoUpdater.on("checking-for-update", () => send("checking"));
  autoUpdater.on("update-available", (info) => send("available", info));
  autoUpdater.on("update-not-available", () => send("none"));
  autoUpdater.on("error", (e) => {
    // 자동 체크(부팅 4초 후) 의 자연스러운 실패(예: GitHub release 0건 → "No published
    // versions on GitHub")까지 모달로 보이지 않도록 silent. 사용자가 직접 다운로드/설치
    // 누른 경우의 에러는 각 ipcMain.handle 안의 catch 에서 send("error") 호출.
    log.warn(`[updater] silent error event: ${e?.message ?? String(e)}`);
  });
  autoUpdater.on("download-progress", (p) => {
    if (main.isDestroyed()) return;
    main.webContents.send("updater:progress", Math.round(p?.percent ?? 0));
  });
  autoUpdater.on("update-downloaded", () => send("downloaded"));

  ipcMain.handle("updater:check", async () => {
    try {
      const r = await autoUpdater.checkForUpdates();
      return r?.updateInfo ?? null;
    } catch (e) {
      send("error", (e as Error).message);
      return null;
    }
  });

  ipcMain.handle("updater:download", async () => {
    send("downloading");
    try {
      await autoUpdater.downloadUpdate();
      return true;
    } catch (e) {
      send("error", (e as Error).message);
      return false;
    }
  });

  ipcMain.handle("updater:install", async () => {
    // §D — busy 상태 검사. main.ts 에서 export 된 함수 사용.
    // dynamic import 로 순환 의존 회피.
    const mainModule = await import("./main");
    if (mainModule.isAppBusy()) {
      mainModule.setInstallPending(true);
      send("blocked-busy", { ops: mainModule.listBusyOps() });
      return false;
    }
    tryInstallNow(main);
    return true;
  });

  // 부팅 후 4초 뒤 자동 check
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => {
      console.warn(`[updater] 자동 check 실패: ${(e as Error).message}`);
    });
  }, 4000);
}

void pendingMain;
