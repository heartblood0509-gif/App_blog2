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
import { spawn } from "node:child_process";
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

interface ReleaseMetadata {
  version: string;
  releaseName?: string;
  releaseNotes?: string;
}

// GitHub Releases API 에서 최신 릴리즈 메타데이터를 가져온다.
// macOS 는 electron-updater 자동 다운로드를 못 쓰므로 이 함수가 체크의 본체이고,
// Windows 는 electron-updater 가 latest.yml 만 읽어서 release.name 을 모르기 때문에
// update-available 이벤트 후 보강 호출로 사용한다.
async function fetchReleaseMetadata(): Promise<GithubRelease | null> {
  const response = await fetch(LATEST_RELEASE_API, {
    headers: {
      Accept: "application/vnd.github+json",
      "User-Agent": "Blog-Pick",
    },
  });
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`GitHub release check failed: ${response.status}`);
  }
  return (await response.json()) as GithubRelease;
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

// ── 실행 중 자동 재확인 (재시작 없이 새 패치 인지) ───────────────────────────
// 부팅 시 1회 확인 외에, 켜둔 채로도 주기적으로 + 창 포커스 시 다시 확인한다.
//
// 체크 모드: foreground = 사용자가 직접(재시도/수동) 요청 → checking/none/error 를 그대로
//   화면에 노출. background = 주기/포커스 자동 확인 → checking/none 을 보내지 않는다
//   (보내면 렌더러 UpdaterToast 가 떠 있던 "새 버전"·"작업 끝나면 설치" 카드를 지워버림).
type CheckMode = "idle" | "foreground" | "background";
let checkMode: CheckMode = "idle";
let checkInFlight = false;
// 마지막 확인 시각(포커스 throttle 기준). focus 가 잦아도 과도하게 안 터지게.
let lastCheckAt = 0;
// 같은 버전을 background 확인 때마다 반복 알림하지 않기 위한 표시.
let lastNotifiedVersion: string | null = null;
// 토스트에 알린 다운로드 대상 버전(다운로드 시점 정합성 확인/로깅용).
let pendingDownloadVersion: string | null = null;
// 렌더러가 늦게 마운트되어 live 이벤트를 놓쳐도 복원할 수 있도록 마지막 "의미있는" 상태를 캐싱.
let cachedState: { s: UpdaterStatus; p?: unknown } | null = null;
// 플랫폼별 확인 함수(mac/win) 를 가리키는 참조 — 주기/포커스/IPC 가 공통으로 호출.
let platformCheck: ((mode: "foreground" | "background") => Promise<unknown>) | null = null;
let pollTimer: NodeJS.Timeout | null = null;
let focusHandler: (() => void) | null = null;
const POLL_INTERVAL_MS = 60 * 60 * 1000; // 1시간
const FOCUS_THROTTLE_MS = 10 * 60 * 1000; // 10분

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
  // 렌더러가 늦게 마운트돼 이 이벤트를 놓쳐도 복원할 수 있도록(RISK-06) 화면에 "떠 있어야 하는"
  // 상태만 캐싱. 그 외(확인 중/다운로드/없음/완료)는 사라져야 하므로 캐시를 비운다.
  if (s === "available" || s === "blocked-busy" || s === "error") {
    cachedState = { s, p };
  } else {
    cachedState = null;
  }
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
    width: 460,
    height: 220,
    center: true,
    frame: false,
    resizable: false,
    movable: true,
    minimizable: false,
    maximizable: false,
    closable: false,
    alwaysOnTop: true,
    skipTaskbar: false,
    backgroundColor: "#1a1a1a",
    title: "Blog Pick 업데이트",
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
  payload:
    | { phase: "downloading"; percent: number }
    | { phase: "installing" }
    | { phase: "restarting" },
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

// 앱이 종료되면 진행창도 사라지고, 그 뒤 NSIS 가 조용히(/S) 설치하는 동안 화면이 빈다 →
// 사용자가 "멈췄나?" 하고 프로그램을 다시 켜는 혼란이 생긴다. 앱과 "독립된"(별도 OS 프로세스)
// 안내창을 띄워 설치 내내 떠 있게 한다. PowerShell+WinForms 로 띄우고 detached 로 분리하므로
// Electron 종료/NSIS 설치를 막지 않는다. 실패해도(차단/오류) 그냥 무시 → 설치엔 영향 없음.
// (윈도우 전용. 맥은 애초에 자동 설치를 안 하고 다운로드 페이지만 연다.)
function showWindowsInstallingPopup(): void {
  if (process.platform !== "win32") return;
  try {
    const ps = [
      "Add-Type -AssemblyName System.Windows.Forms;",
      "Add-Type -AssemblyName System.Drawing;",
      "$f = New-Object System.Windows.Forms.Form;",
      "$f.Text = 'Blog Pick 업데이트';",
      "$f.ClientSize = New-Object System.Drawing.Size(470,150);",
      "$f.StartPosition = 'CenterScreen';",
      "$f.FormBorderStyle = 'FixedDialog';",
      "$f.MaximizeBox = $false; $f.MinimizeBox = $false; $f.ControlBox = $false;",
      "$f.TopMost = $true;",
      "$f.BackColor = [System.Drawing.Color]::FromArgb(26,26,26);",
      "$l = New-Object System.Windows.Forms.Label;",
      "$l.Text = '업데이트를 설치하고 있어요. 잠시만 기다려 주세요.' + [Environment]::NewLine + [Environment]::NewLine + '자동으로 다시 시작됩니다 (최대 1분).' + [Environment]::NewLine + '프로그램을 직접 실행하지 마세요. 이 창은 자동으로 닫힙니다.';",
      "$l.ForeColor = [System.Drawing.Color]::White;",
      "$l.Font = New-Object System.Drawing.Font('Malgun Gothic',11);",
      "$l.TextAlign = 'MiddleCenter'; $l.Dock = 'Fill';",
      "$f.Controls.Add($l);",
      "$t = New-Object System.Windows.Forms.Timer; $t.Interval = 120000; $t.Add_Tick({ $f.Close() }); $t.Start();",
      "[void]$f.ShowDialog();",
    ].join(" ");
    const child = spawn(
      "powershell.exe",
      ["-NoProfile", "-WindowStyle", "Hidden", "-Command", ps],
      { detached: true, stdio: "ignore", windowsHide: true },
    );
    child.unref();
  } catch (e) {
    log.warn(`[updater] 설치 안내창 표시 실패(무시): ${(e as Error).message}`);
  }
}

function proceedToInstall(): void {
  if (!progressWin || progressWin.isDestroyed()) openProgressWindow();
  // 1) 먼저 "설치 중" 단계를 약 2.5초 노출 — 사용자가 진행 단계를 인지할 시간 확보.
  sendProgress({ phase: "installing" });
  setTimeout(() => {
    // 2) "재시작 안내" 를 약 1.5초 노출 — "화면이 잠깐 사라졌다 자동 재시작" 을 읽을 시간 확보.
    sendProgress({ phase: "restarting" });
    setTimeout(() => {
      // 3) 앱 종료 직전, 설치 동안 떠 있을 독립 안내창을 띄운다(윈도우 전용).
      showWindowsInstallingPopup();
      try {
        // 핵심: isSilent=true → NsisUpdater 가 `/S --force-run` 으로 인스톨러 호출.
        autoUpdater.quitAndInstall(true, true);
      } catch (e) {
        log.error(`[updater] quitAndInstall 실패: ${(e as Error).message}`);
        cleanupAfterFailure((e as Error).message);
      }
    }, 1500);
  }, 2500);
}

/** main.ts 의 endBusy 가 busy 해제 transition 에서 호출. */
export function tryInstallNow(_main: BrowserWindow): void {
  if (process.platform === "darwin") return;
  if (!installPendingAfterDownload) return;
  installPendingAfterDownload = false;
  proceedToInstall();
}

// 주기/포커스가 공통으로 부르는 background 확인 트리거.
function triggerBackgroundCheck(): void {
  if (!platformCheck) return;
  if (checkInFlight) return; // 이미 확인 중이면 중복 진입 방지(동시 확인 가드)
  if (downloadInFlight || installPendingAfterDownload) return; // 다운로드/설치 진행 중엔 끼어들지 않음
  platformCheck("background").catch((e) => {
    log.warn(`[updater] background check 실패: ${(e as Error).message}`);
  });
}

// 1시간 주기 + 창 포커스(10분 throttle) 자동 재확인 설치. 창 종료 시 정리.
function setupAutoRecheck(main: BrowserWindow): void {
  pollTimer = setInterval(triggerBackgroundCheck, POLL_INTERVAL_MS);
  focusHandler = () => {
    if (Date.now() - lastCheckAt >= FOCUS_THROTTLE_MS) triggerBackgroundCheck();
  };
  main.on("focus", focusHandler);
  main.once("closed", () => {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (focusHandler) {
      main.removeListener("focus", focusHandler);
      focusHandler = null;
    }
  });
}

export function initUpdater(main: BrowserWindow): void {
  if (registered) return;
  registered = true;
  mainRef = main;

  // 렌더러가 마운트 시점에 현재 업데이트 상태를 조회(RISK-06: live 이벤트 유실 복원).
  // dev 모드에서도 핸들러는 존재해야 렌더러가 에러 없이 호출 가능 → 분기 이전에 등록.
  ipcMain.handle("updater:getState", () => cachedState);

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
  const checkMacRelease = async (
    mode: "foreground" | "background",
  ): Promise<GithubRelease | null> => {
    const silent = mode === "background";
    // background 끼리 중복 진입 방지(동시 확인 가드). foreground 는 사용자 요청이므로 통과.
    if (silent && checkInFlight) return null;
    checkInFlight = true;
    checkMode = mode;
    lastCheckAt = Date.now();
    try {
      if (!silent) send("checking");
      const release = await fetchReleaseMetadata();
      if (!release) {
        if (!silent) send("none");
        return null;
      }
      const latestVersion = release.tag_name?.replace(/^v/i, "");
      if (latestVersion && isNewerVersion(latestVersion, app.getVersion())) {
        // background 는 같은 버전 반복 알림 skip. foreground 는 항상 표시.
        if (silent && latestVersion === lastNotifiedVersion) return release;
        lastNotifiedVersion = latestVersion;
        pendingDownloadVersion = latestVersion;
        const info: ReleaseMetadata = {
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
    } finally {
      // RISK-04: 실패해도 반드시 리셋 — 이후 background 확인이 영구히 막히지 않게.
      checkInFlight = false;
      checkMode = "idle";
    }
  };

  platformCheck = checkMacRelease;

  ipcMain.handle("updater:check", async () => checkMacRelease("foreground"));
  ipcMain.handle("updater:download", async () => {
    await shell.openExternal(RELEASES_URL);
    return true;
  });
  ipcMain.handle("updater:install", async () => {
    await shell.openExternal(RELEASES_URL);
    return true;
  });

  setTimeout(() => {
    checkMacRelease("background").catch(() => { /* handled */ });
  }, 4000);
  if (mainRef) setupAutoRecheck(mainRef);
}

function initWindowsUpdater(): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  // 설치본이 시험판(예: 0.3.0-rc4)이면 electron-updater 가 allowPrerelease 를 자동으로 true 로
  // 켜서 "시험판 채널" 규칙으로 업데이트를 찾는다 → 정식 릴리스(0.3.1 등)를 못 집어내 자동업데이트
  // 알림이 안 뜨는 경우가 있다(rc 빌드 윈도우 한정). false 로 고정해 항상 "정식 최신 릴리스
  // (/releases/latest)" 기준으로 확인하게 한다. 정식 설치본엔 영향 없음(원래 false). 시험판 설치본도
  // 정식 업데이트 알림을 받게 됨 — 맥(숫자 비교) 과 동작이 일관됨.
  autoUpdater.allowPrerelease = false;
  // v0.1.3 의 blockmap 파일명은 점 구분(`App.Blog.Publisher-...`), v0.1.4 부터는 하이픈
  // 구분(`App-Blog-Publisher-...`) 이라 두 버전 사이 differential download 가 잘못된
  // blockmap 경로를 시도하다 실패할 수 있다. v0.1.5+ 부터는 양쪽 파일명이 일관되므로
  // 별도 후속 작업으로 다시 켜도 안전 (지금은 끄는 게 안전한 선택).
  autoUpdater.disableDifferentialDownload = true;

  autoUpdater.on("checking-for-update", () => {
    // background 자동 확인이면 화면에 "확인 중" 을 보내지 않는다 — 떠 있던 토스트가 사라짐(RISK-02).
    if (checkMode === "background") return;
    send("checking");
  });
  autoUpdater.on("update-available", (info) => {
    const baseVersion = info?.version ?? "";
    // background 확인인데 이미 같은 버전을 알렸으면 skip(반복 토스트·중복 API 호출 방지).
    // foreground(사용자 요청)는 항상 표시.
    if (checkMode === "background" && baseVersion && baseVersion === lastNotifiedVersion) {
      return;
    }
    // RISK-05: 비동기 보강(fetch) 전에 동기적으로 버전을 마킹 → 그 사이 다른 확인이 끼어들어도
    // 같은 버전을 두 번 fetch/알림하지 않는다.
    lastNotifiedVersion = baseVersion || lastNotifiedVersion;
    if (baseVersion) pendingDownloadVersion = baseVersion;
    // electron-updater 의 UpdateInfo 는 latest.yml 의 version/files/sha 만 채움.
    // release.name(사용자 친화 한 줄 요약)·release.body 는 빌드 시점에 모르므로
    // GitHub Releases API 를 한 번 더 호출해서 보강한 뒤 토스트로 전송.
    const baseNotes = typeof info?.releaseNotes === "string" ? info.releaseNotes : undefined;
    fetchReleaseMetadata()
      .then((release) => {
        const merged: ReleaseMetadata = {
          version: baseVersion,
          releaseName: release?.name ?? release?.tag_name ?? undefined,
          releaseNotes: release?.body ?? baseNotes,
        };
        send("available", merged);
      })
      .catch((e) => {
        // 네트워크 실패 시에도 토스트는 띄움 — release.name 만 빠진 안전 fallback.
        log.warn(`[updater] release metadata 보강 실패: ${(e as Error).message}`);
        send("available", { version: baseVersion, releaseNotes: baseNotes });
      });
  });
  autoUpdater.on("update-not-available", () => {
    // background 면 "최신입니다" 도 보내지 않는다(떠 있던 카드 보존, RISK-02).
    if (checkMode === "background") return;
    send("none");
  });
  autoUpdater.on("error", (e) => {
    // 자동 부팅 체크(예: 0건 → "No published versions") 의 자연스러운 실패는 silent.
    log.warn(`[updater] error event: ${e?.message ?? String(e)}`);
    // 다운로드 중이었다면 cleanup. (autoUpdater 가 download 도중 에러를 던지면 promise 도
    // reject 되지만, 일부 케이스에서 이벤트만 발생하기도 함.)
    if (downloadInFlight) {
      cleanupAfterFailure(e?.message ?? "업데이트 중 오류가 발생했습니다.");
      return;
    }
    // RISK-04: 다운로드가 아닌 "확인 중" 에러 — checkForUpdates 가 promise 를 settle 하지 않는
    // 희귀 케이스 대비로 여기서도 방어적으로 in-flight 플래그를 푼다. (정상 경로는 runWindowsCheck
    // 의 finally 가 처리. foreground 에러 표면화도 그쪽에서 일원화.)
    if (checkInFlight) {
      checkInFlight = false;
      checkMode = "idle";
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

  // 모든 Windows 확인의 단일 진입점. foreground/background 를 구분해 이벤트 핸들러가
  // checking/none 노출 여부를 결정하게 하고, in-flight 플래그를 finally 로 반드시 정리(RISK-04).
  const runWindowsCheck = async (mode: "foreground" | "background"): Promise<void> => {
    if (mode === "background" && checkInFlight) return; // 동시 확인 가드
    checkInFlight = true;
    checkMode = mode;
    lastCheckAt = Date.now();
    try {
      await autoUpdater.checkForUpdates();
    } catch (e) {
      const message = (e as Error).message ?? "업데이트 확인 실패";
      log.warn(`[updater] ${mode} check 실패: ${message}`);
      // RISK-09: 사용자가 [재시도]로 직접 요청한 확인의 실패는 조용히 묻히지 않게 표면화.
      if (mode === "foreground") send("error", message);
    } finally {
      checkInFlight = false;
      checkMode = "idle";
    }
  };
  platformCheck = runWindowsCheck;

  ipcMain.handle("updater:check", async () => {
    await runWindowsCheck("foreground");
    return null;
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
    // downloadInFlight 을 즉시 true 로 — 이 순간부터 background 재확인이 끼어들지 못한다(RISK-08).
    // autoUpdater 는 마지막 checkForUpdates 결과(latest.yml)를 다운로드하므로, 토스트에 알린
    // 버전과 다르면(그 사이 새 릴리스가 또 올라온 경우) 로그로 남겨 추적 가능하게 한다.
    downloadInFlight = true;
    log.info(`[updater] download 시작 (토스트 표시 버전: ${pendingDownloadVersion ?? "?"})`);
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

  // 부팅 후 4초 뒤 자동 check(background) + 이후 주기/포커스 재확인 설치.
  setTimeout(() => {
    runWindowsCheck("background").catch(() => { /* handled in finally/catch */ });
  }, 4000);
  if (mainRef) setupAutoRecheck(mainRef);
}
