// electron-updater 통합.
// Windows: 좌하단 토스트(`UpdaterToast`) → [업데이트] 한 번 클릭 → 메인 창 hide
//   → 별도 진행률 BrowserWindow(`updater-progress.html`) 표시 → 다운로드 → 무음 설치 →
//   NSIS 가 새 버전 자동 실행. 다운로드 중에는 [취소] 버튼으로 빠져나갈 수 있다.
// macOS: GitHub Releases 페이지를 브라우저로 열어 사용자가 dmg 를 받게 한다 (코드사인이 없어
//   electron-updater 자동 설치를 못 쓰기 때문). 토스트 라벨은 "다운로드 페이지 열기" 로 표기.
//
// 정책(§D 호환):
//   - autoDownload = false : 사용자가 "업데이트" 누른 경우에만 받기 시작.
//   - autoInstallOnAppQuit = false : 자동 종료 시 자동 설치 안 함.
//   - busy 상태(busyOps.size > 0) 일 때 다운로드는 끝나도 install 보류. busy 가 풀리는
//     순간 main.ts 의 `endBusy` 가 tryInstallNow 를 호출 → proceedToInstall() 로 무음 설치.
//   - 다운로드 진행 중 재진입은 downloadInFlight 가드로 차단.
//   - 다운로드 완료 후 install 보류 상태에서 추가 download 호출은 installPendingAfterDownload
//     가드로 차단.
//   - download-progress 가 60초간 없으면 워치독이 CancellationToken.cancel() 호출.
//
// 무음 설치의 핵심:
//   autoUpdater.quitAndInstall(isSilent=true, isForceRunAfter=true)
//   - BaseUpdater.js:14-15 의 분기: isSilent=true 이면 isForceRunAfter 인자를 그대로 사용.
//   - NsisUpdater 가 `/S --force-run` 인자로 NSIS 인스톨러를 띄움 → GUI 없이 진행 + 자동 실행.
//   - oneClick:false 는 그대로 두므로 "첫 설치" 는 기존대로 GUI(설치 경로 선택 등) 가 뜬다.
//   - UAC 권한 요청 창은 Windows 보안 정책이라 막을 수 없음.

import { BrowserWindow, ipcMain, shell, app } from "electron";
import { autoUpdater } from "electron-updater";
import { CancellationToken } from "builder-util-runtime";
import log from "electron-log";
import { paths } from "./paths";

autoUpdater.logger = log;

type UpdaterStatus =
  | "checking"
  | "available"
  | "none"
  | "downloading"
  | "downloaded"
  | "error"
  | "blocked-busy";

interface GithubRelease {
  tag_name?: string;
  name?: string;
  body?: string;
}

let registered = false;

let progressWin: BrowserWindow | null = null;
let allowProgressClose = false;
let downloadToken: CancellationToken | null = null;
let downloadInFlight = false;
let installPendingAfterDownload = false;
let watchdog: NodeJS.Timeout | null = null;
const WATCHDOG_MS = 60_000;

const RELEASES_URL = "https://github.com/heartblood0509-gif/App_blog2/releases/latest";
const LATEST_RELEASE_API =
  "https://api.github.com/repos/heartblood0509-gif/App_blog2/releases/latest";

function versionParts(value: string): number[] {
  return value.replace(/^v/i, "").split(/[.-]/).slice(0, 3).map((part) => {
    const n = Number(part);
    return Number.isFinite(n) ? n : 0;
  });
}

function isNewerVersion(candidate: string, current: string): boolean {
  const next = versionParts(candidate);
  const now = versionParts(current);
  for (let i = 0; i < 3; i += 1) {
    const a = next[i] ?? 0;
    const b = now[i] ?? 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

let mainRef: BrowserWindow | null = null;

function send(s: UpdaterStatus, p?: unknown): void {
  if (!mainRef || mainRef.isDestroyed()) return;
  mainRef.webContents.send("updater:state", { s, p });
}

function showMainAgain(): void {
  if (!mainRef || mainRef.isDestroyed()) return;
  if (!mainRef.isVisible()) mainRef.show();
  if (mainRef.isMinimized()) mainRef.restore();
  mainRef.focus();
}

function openProgressWindow(): void {
  if (progressWin && !progressWin.isDestroyed()) return;
  progressWin = new BrowserWindow({
    width: 380,
    height: 160,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    closable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: "#1a1a1a",
    title: "App Blog Publisher 업데이트",
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: paths.updaterProgressPreload,
    },
  });
  progressWin.removeMenu();
  progressWin.on("close", (event) => {
    if (!allowProgressClose) event.preventDefault();
  });
  progressWin.on("closed", () => {
    progressWin = null;
  });
  progressWin.loadFile(paths.updaterProgressHtml).catch((e) => {
    log.warn(`[updater] progress html load 실패: ${(e as Error).message}`);
  });
}

function closeProgressWindow(): void {
  if (!progressWin || progressWin.isDestroyed()) {
    progressWin = null;
    return;
  }
  allowProgressClose = true;
  try {
    progressWin.destroy();
  } catch (e) {
    log.warn(`[updater] progress 창 destroy 실패: ${(e as Error).message}`);
  }
  progressWin = null;
  allowProgressClose = false;
}

function sendProgress(
  payload: { phase: "downloading"; percent: number } | { phase: "installing" },
): void {
  if (!progressWin || progressWin.isDestroyed()) return;
  try {
    progressWin.webContents.send("progress", payload);
  } catch { /* ignore */ }
}

function resetWatchdog(): void {
  if (watchdog) clearTimeout(watchdog);
  watchdog = setTimeout(() => {
    watchdog = null;
    try {
      downloadToken?.cancel();
    } catch { /* ignore */ }
    cleanupAfterFailure("네트워크 응답이 60초간 없습니다.");
  }, WATCHDOG_MS);
}

function clearWatchdog(): void {
  if (watchdog) {
    clearTimeout(watchdog);
    watchdog = null;
  }
}

function cleanupAfterFailure(message: string): void {
  clearWatchdog();
  closeProgressWindow();
  showMainAgain();
  downloadToken = null;
  downloadInFlight = false;
  installPendingAfterDownload = false;
  send("error", message);
}

function proceedToInstall(): void {
  if (!progressWin || progressWin.isDestroyed()) openProgressWindow();
  sendProgress({ phase: "installing" });
  // 짧은 지연으로 UI 가 "곧 재시작됩니다…" 로 보이게 한 뒤 NSIS 실행.
  setTimeout(() => {
    try {
      // 핵심: isSilent=true → NsisUpdater 가 `/S --force-run` 으로 인스톨러 호출.
      autoUpdater.quitAndInstall(true, true);
    } catch (e) {
      log.error(`[updater] quitAndInstall 실패: ${(e as Error).message}`);
      cleanupAfterFailure((e as Error).message);
    }
  }, 600);
}

/** main.ts 의 endBusy 가 busy 해제 transition 에서 호출. */
export function tryInstallNow(_main: BrowserWindow): void {
  if (process.platform === "darwin") return;
  if (!installPendingAfterDownload) return;
  installPendingAfterDownload = false;
  proceedToInstall();
}

export function initUpdater(main: BrowserWindow): void {
  if (registered) return;
  registered = true;
  mainRef = main;

  if (!app.isPackaged) {
    log.info("[updater] dev 모드 — 자동 업데이트 비활성");
    return;
  }

  if (process.platform === "darwin") {
    initMacUpdater();
    return;
  }

  initWindowsUpdater();
}

function initMacUpdater(): void {
  const checkMacRelease = async (silent: boolean): Promise<GithubRelease | null> => {
    if (!silent) send("checking");
    try {
      const response = await fetch(LATEST_RELEASE_API, {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "App-Blog-Publisher",
        },
      });
      if (response.status === 404) {
        if (!silent) send("none");
        return null;
      }
      if (!response.ok) {
        throw new Error(`GitHub release check failed: ${response.status}`);
      }
      const release = (await response.json()) as GithubRelease;
      const latestVersion = release.tag_name?.replace(/^v/i, "");
      if (latestVersion && isNewerVersion(latestVersion, app.getVersion())) {
        const info = {
          version: latestVersion,
          releaseName: release.name ?? release.tag_name,
          releaseNotes: release.body,
        };
        send("available", info);
        return release;
      }
      if (!silent) send("none");
      return null;
    } catch (e) {
      const message = (e as Error).message;
      log.warn(`[updater] macOS release check failed: ${message}`);
      if (!silent) send("error", message);
      return null;
    }
  };

  ipcMain.handle("updater:check", async () => checkMacRelease(false));
  ipcMain.handle("updater:download", async () => {
    await shell.openExternal(RELEASES_URL);
    return true;
  });
  ipcMain.handle("updater:install", async () => {
    await shell.openExternal(RELEASES_URL);
    return true;
  });

  setTimeout(() => {
    checkMacRelease(true).catch(() => { /* handled */ });
  }, 4000);
}

function initWindowsUpdater(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  // v0.1.3 의 blockmap 파일명은 점 구분(`App.Blog.Publisher-...`), v0.1.4 부터는 하이픈
  // 구분(`App-Blog-Publisher-...`) 이라 두 버전 사이 differential download 가 잘못된
  // blockmap 경로를 시도하다 실패할 수 있다. v0.1.5+ 부터는 양쪽 파일명이 일관되므로
  // 별도 후속 작업으로 다시 켜도 안전 (지금은 끄는 게 안전한 선택).
  autoUpdater.disableDifferentialDownload = true;

  autoUpdater.on("checking-for-update", () => send("checking"));
  autoUpdater.on("update-available", (info) => send("available", info));
  autoUpdater.on("update-not-available", () => send("none"));
  autoUpdater.on("error", (e) => {
    // 자동 부팅 체크(예: 0건 → "No published versions") 의 자연스러운 실패는 silent.
    // 사용자가 직접 트리거한 에러는 download/install 핸들러의 catch 가 send("error") 호출.
    log.warn(`[updater] silent error event: ${e?.message ?? String(e)}`);
    // 다운로드 중이었다면 cleanup. (autoUpdater 가 download 도중 에러를 던지면 promise 도
    // reject 되지만, 일부 케이스에서 이벤트만 발생하기도 함.)
    if (downloadInFlight) {
      cleanupAfterFailure(e?.message ?? "업데이트 중 오류가 발생했습니다.");
    }
  });
  autoUpdater.on("download-progress", (p) => {
    resetWatchdog();
    const percent = Math.max(0, Math.min(100, Math.round(p?.percent ?? 0)));
    sendProgress({ phase: "downloading", percent });
  });
  autoUpdater.on("update-downloaded", () => {
    clearWatchdog();
    downloadInFlight = false;
    // 다운로드는 끝났음. busy 검사 → 통과면 무음 설치, 아니면 보류.
    import("./main")
      .then((mod) => {
        if (mod.isAppBusy()) {
          installPendingAfterDownload = true;
          mod.setInstallPending(true);
          closeProgressWindow();
          showMainAgain();
          send("blocked-busy", { ops: mod.listBusyOps() });
          return;
        }
        proceedToInstall();
      })
      .catch((e) => {
        log.error(`[updater] update-downloaded 처리 실패: ${(e as Error).message}`);
        cleanupAfterFailure((e as Error).message);
      });
  });

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
    if (downloadInFlight) return false;
    if (installPendingAfterDownload) {
      // 이미 다운로드 끝나서 install 만 대기 중 — busy 풀리길 기다려야 함.
      try {
        const mod = await import("./main");
        send("blocked-busy", { ops: mod.listBusyOps() });
      } catch {
        send("blocked-busy");
      }
      return false;
    }
    downloadInFlight = true;
    if (mainRef && !mainRef.isDestroyed()) mainRef.hide();
    openProgressWindow();
    send("downloading");
    downloadToken = new CancellationToken();
    resetWatchdog();
    try {
      // electron-updater 가 자체 vendored builder-util-runtime 의 CancellationToken
      // 타입을 받도록 선언돼 있지만(둘은 같은 코드의 별개 인스턴스), 런타임 인터페이스는
      // 동일하므로 root 본의 토큰을 그대로 전달.
      await autoUpdater.downloadUpdate(downloadToken as never);
      return true;
    } catch (e) {
      const message = (e as Error).message ?? "다운로드 실패";
      // 사용자가 취소한 경우와 그 외 에러를 구분.
      if (downloadToken?.cancelled) {
        cleanupAfterFailure("사용자가 다운로드를 취소했습니다.");
      } else {
        cleanupAfterFailure(message);
      }
      return false;
    }
  });

  ipcMain.handle("updater:install", async () => {
    // 하위호환용. 새 흐름에서는 download 가 끝나면 자동으로 install 로 이어지므로
    // 외부에서 직접 호출할 일은 없지만 노출은 유지.
    try {
      const mod = await import("./main");
      if (mod.isAppBusy()) {
        installPendingAfterDownload = true;
        mod.setInstallPending(true);
        send("blocked-busy", { ops: mod.listBusyOps() });
        return false;
      }
      proceedToInstall();
      return true;
    } catch (e) {
      cleanupAfterFailure((e as Error).message);
      return false;
    }
  });

  ipcMain.on("updater:cancel", () => {
    if (!downloadInFlight) return;
    try {
      downloadToken?.cancel();
    } catch (e) {
      log.warn(`[updater] cancel 토큰 호출 실패: ${(e as Error).message}`);
    }
    // 실제 정리는 downloadUpdate 의 catch 블록에서 cleanupAfterFailure 가 처리.
  });

  // 부팅 후 4초 뒤 자동 check.
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((e) => {
      log.warn(`[updater] 자동 check 실패: ${(e as Error).message}`);
    });
  }, 4000);
}
