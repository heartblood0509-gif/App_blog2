import { app, BrowserWindow, dialog, ipcMain, powerMonitor, screen, shell } from "electron";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import log from "electron-log";
import { paths } from "./paths";
import { applyWindowSecurity } from "./security";
import { getFreePort, getPreferredOrFreePort } from "./net-utils";
import { PythonManager } from "./python-manager";
import { NextServerManager } from "./next-server";
import { initJobObject, assignToJob, closeJobObject } from "./job-object";
import { initUpdater, tryInstallNow } from "./updater";
import { CredentialBroker } from "./credential-broker";
import { redactTransform } from "./log-redactor";
import {
  getAutoLoginEnabled,
  getDeviceInfo,
  loadFrontendPort,
  loadGeminiApiKey,
  registerSettingsIpc,
  saveFrontendPort,
  setAutoLoginEnabled,
} from "./settings";

// §G — userData/logs/main.log 로 회전 저장 + redaction.
log.transports.file.resolvePathFn = () =>
  path.join(app.getPath("userData"), "logs", "main.log");
log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";
// transforms: 각 message 의 인자 배열에서 토큰/PW 마스킹.
log.hooks.push((message) => redactTransform(message));
Object.assign(console, log.functions);

let mainWindow: BrowserWindow | null = null;
let python: PythonManager | null = null;
let nextSrv: NextServerManager | null = null;
let broker: CredentialBroker | null = null;
let isQuitting = false;
// before-quit 모달에서 "종료" 선택 시 true. 재진입 시 모달 우회.
let forceQuit = false;

// §D — busy 상태. operation id 기반 Set 으로 idempotent. boolean 카운터 아님.
const busyOps = new Set<string>();
// §H — 발행 진행 상태. busyOps 와 별도. 종료 모달 가드용.
const publishingOps = new Set<string>();
let installPending = false;
const AUTH_PROTOCOL = "com.heartblood.appblog2";
let pendingAuthDeepLink: string | null = null;

// §I — 각 stop() 5초, 전체 셧다운 10초 한도. 하나라도 hang 되면 강제 KILL 폴백.
const STOP_TIMEOUT_MS = 5_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T> | undefined, ms: number, label: string): Promise<T | "timeout"> {
  if (!p) return Promise.resolve("timeout" as const);
  return new Promise<T | "timeout">((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[shutdown] ${label} stop() timeout after ${ms}ms`);
      resolve("timeout");
    }, ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => {
        clearTimeout(timer);
        console.warn(`[shutdown] ${label} stop() error:`, e);
        resolve("timeout");
      },
    );
  });
}

function endBusy(opId: string): void {
  const wasBusy = busyOps.size > 0;
  busyOps.delete(opId);
  // 마지막 busy 가 빠진 transition 일 때 pending 된 install 자동 시도
  if (wasBusy && busyOps.size === 0 && installPending) {
    installPending = false;
    if (mainWindow) tryInstallNow(mainWindow);
  }
}

export function isAppBusy(): boolean {
  return busyOps.size > 0;
}

export function listBusyOps(): string[] {
  return Array.from(busyOps);
}

export function setInstallPending(v: boolean): void {
  installPending = v;
}

// app.getVersion() 은 dev 모드에서 Electron 프레임워크 버전(예: 33.4.11)을 반환하는
// 알려진 동작이 있어, 사용자 친화 타이틀("Blog Pick v0.2.3")을 위해 package.json 을
// 직접 읽는다. prod 빌드(app.asar 내부)에서도 `../../package.json` 경로가 유효하므로
// dev/prod 양쪽에서 같은 결과.
function getAppVersion(): string {
  try {
    const pkgPath = path.join(__dirname, "..", "..", "package.json");
    const data = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string };
    if (typeof data?.version === "string" && data.version.length > 0) return data.version;
  } catch { /* fall through */ }
  return app.getVersion();
}

function getInitialWindowBounds(): { width: number; height: number } {
  const { width: workAreaWidth, height: workAreaHeight } = screen.getPrimaryDisplay().workAreaSize;
  return {
    width: Math.min(1920, workAreaWidth),
    height: Math.min(1080, workAreaHeight),
  };
}

// §A 보안 토큰. packaged 빌드에서는 ALLOW_INSECURE_DEV_* 플래그를 절대 set 하지 않음.
const APP_TOKEN = crypto.randomBytes(32).toString("hex");
const APP_SESSION_TOKEN = crypto.randomBytes(32).toString("hex");

function isAuthDeepLink(value: string | undefined): value is string {
  return typeof value === "string" && value.startsWith(`${AUTH_PROTOCOL}://auth/callback`);
}

function findAuthDeepLink(argv: string[]): string | null {
  return argv.find((arg) => isAuthDeepLink(arg)) ?? null;
}

function deliverAuthDeepLink(url: string): void {
  pendingAuthDeepLink = url;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("auth:deepLink", url);
  }
}

function registerAuthProtocol(): void {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
    return;
  }
  app.setAsDefaultProtocolClient(AUTH_PROTOCOL);
}

registerAuthProtocol();

const startupAuthDeepLink = findAuthDeepLink(process.argv);
if (startupAuthDeepLink) {
  pendingAuthDeepLink = startupAuthDeepLink;
}

app.on("open-url", (event, url) => {
  if (!isAuthDeepLink(url)) return;
  event.preventDefault();
  deliverAuthDeepLink(url);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const deepLink = findAuthDeepLink(argv);
    if (deepLink) deliverAuthDeepLink(deepLink);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(boot).catch((err) => {
    console.error("[main] boot failed:", err);
    dialog.showErrorBox("Blog Pick",`서비스 시작 실패:\n${String(err?.message ?? err)}`);
    app.exit(1);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on("before-quit", async (event) => {
    if (isQuitting) return;

    // §H 발행 진행 중이면 사용자 확인. forceQuit 가 true 면 모달 우회.
    if (publishingOps.size > 0 && !forceQuit) {
      event.preventDefault();
      const dialogOpts = {
        type: "warning" as const,
        buttons: ["계속 작업", "종료"],
        defaultId: 0,
        cancelId: 0,
        message: "발행 작업이 진행 중입니다.",
        detail: "지금 종료하면 작성 중인 글이 손실될 수 있습니다.",
      };
      const choice = mainWindow
        ? dialog.showMessageBoxSync(mainWindow, dialogOpts)
        : dialog.showMessageBoxSync(dialogOpts);
      if (choice === 1) {
        forceQuit = true;
        app.quit(); // 재진입 → 모달 우회 → 정리 경로
      }
      return;
    }

    isQuitting = true;
    event.preventDefault();

    // §I 데드라인. 각 stop 5s + 전체 10s. hang 시 강제 진행.
    const overall = Promise.allSettled([
      withTimeout(nextSrv?.stop(), STOP_TIMEOUT_MS, "next"),
      withTimeout(python?.stop(), STOP_TIMEOUT_MS, "python"),
      withTimeout(broker?.stop(), STOP_TIMEOUT_MS, "broker"),
    ]);
    const timer = new Promise<"shutdown-timeout">((resolve) =>
      setTimeout(() => resolve("shutdown-timeout"), SHUTDOWN_TIMEOUT_MS),
    );
    try {
      const result = await Promise.race([overall, timer]);
      if (result === "shutdown-timeout") {
        console.warn(`[shutdown] overall ${SHUTDOWN_TIMEOUT_MS}ms timeout — proceeding to exit`);
      }
    } finally {
      // Job Object 핸들 닫기 — Windows 자식 트리 KILL 안전망 트리거.
      closeJobObject();
      app.exit(0);
    }
  });

  // §D 시스템 종료/재시작 — before-quit 우회 시나리오 안전망.
  powerMonitor.on("shutdown", () => {
    console.log("[shutdown] powerMonitor.shutdown — forwarding to app.quit()");
    forceQuit = true;
    app.quit();
  });
}

// §D macOS startup orphan sweeper.
// 이전 세션이 크래시·SIGKILL·Force Quit·시스템 셧다운 등으로 자식 트리를 정리 못 하고
// 종료된 경우, 이번 부팅 시 잔존 프로세스를 한 번에 청소. Windows 는 Job Object 가 처리.
//
// 식별 마커:
//   - ${userData}/chrome-profiles  (Chromium 인자에 등장)
//   - paths.backendExe              (PyInstaller 백엔드 절대 경로)
// → 일반 Chrome 이나 다른 사용자의 Chromium 은 user-data-dir 이 다르므로 절대 안 잡힘.
function sweepOrphans(): void {
  if (process.platform !== "darwin") return;
  const markers = [
    path.join(paths.userData, "chrome-profiles"),
    paths.backendExe,
  ].filter(Boolean);
  if (markers.length === 0) return;
  try {
    const ps = spawnSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
    if (ps.status !== 0 || !ps.stdout) return;
    const lines = ps.stdout.split("\n");
    let killed = 0;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (!markers.some((m) => line.includes(m))) continue;
      const pidStr = line.split(/\s+/)[0];
      const pid = parseInt(pidStr, 10);
      if (!pid || !Number.isFinite(pid) || pid === process.pid) continue;
      try {
        process.kill(pid, "SIGKILL");
        killed += 1;
      } catch {
        /* already gone */
      }
    }
    if (killed > 0) console.log(`[sweep] startup orphan sweeper: killed=${killed}`);
  } catch (e) {
    console.warn(`[sweep] failed: ${(e as Error).message}`);
  }
}

async function boot(): Promise<void> {
  // §D 이전 세션 잔존 프로세스 정리 — Job Object 초기화/자식 spawn 이전에 수행.
  sweepOrphans();

  // 좀비 안전망. Job Object 초기화는 자식 spawn 이전에 끝나야 함.
  initJobObject();

  // §C credential broker 시작. safeStorage 미사용 환경에서도 broker 자체는 떠 있고,
  // 실제 /encrypt 호출 시 503 반환. 사용자에게는 UI 단에서 안내.
  broker = new CredentialBroker({ appToken: APP_TOKEN });
  await broker.start();
  if (!broker.isEncryptionAvailable()) {
    dialog.showErrorBox(
      "Blog Pick",
      "이 PC 에서 비밀번호 암호화 기능을 사용할 수 없습니다.\n" +
        "Windows 사용자 프로필에 문제가 있을 수 있습니다.\n" +
        "기존 계정의 비밀번호는 다시 입력해야 동작합니다.",
    );
  }

  const backendPort = await getFreePort();
  // §J — Supabase 세션 영속성을 위해 매 부팅마다 같은 포트(=같은 origin)를 시도한다.
  // 마지막에 사용한 포트가 비어 있으면 재사용, 점유돼 있으면 빈 포트로 fallback.
  const frontendPort = await getPreferredOrFreePort(loadFrontendPort());
  saveFrontendPort(frontendPort);
  const frontendOrigin = `http://127.0.0.1:${frontendPort}`;

  python = new PythonManager(backendPort, {
    appToken: APP_TOKEN,
    frontendOrigin,
    credentialBrokerUrl: broker.url,
  });
  await python.start();
  assignToJob(python.pid);

  // §F 설정에서 Gemini key 복호화. 없으면 SettingsModal 이 사용자에게 입력 요청.
  const geminiApiKey = loadGeminiApiKey();

  nextSrv = new NextServerManager(frontendPort, python.baseUrl, {
    appToken: APP_TOKEN,
    sessionToken: APP_SESSION_TOKEN,
    geminiApiKey,
  });
  await nextSrv.start();
  assignToJob(nextSrv.pid);

  const allowedOrigin = nextSrv.url;
  // macOS dock 아이콘은 dev 모드에서 Electron 기본 아이콘이 떠서 명시 지정.
  // prod 빌드에선 .app 번들 아이콘을 OS 가 직접 쓰므로 setIcon 은 dev 한정 보정 용도.
  if (process.platform === "darwin" && app.dock) {
    try {
      app.dock.setIcon(paths.iconPng);
    } catch {
      /* 아이콘 파일 누락 등은 무시 — 기본 아이콘 유지 */
    }
  }

  const fixedTitle = `Blog Pick v${getAppVersion()}`;
  const initialBounds = getInitialWindowBounds();
  mainWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    backgroundColor: "#1a1a1a",
    title: fixedTitle,
    icon: paths.iconPng,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: paths.preload,
    },
  });
  // Electron 기본 동작: 페이지가 로드되면 HTML <title> 이 BrowserWindow.title 을 덮어쓴다.
  // 그러면 "Blog Pick v0.2.3" 가 "Blog Pick" 으로 바뀌어 버전 표시가 사라지므로 차단.
  mainWindow.on("page-title-updated", (event) => {
    event.preventDefault();
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.getTitle() !== fixedTitle) {
      mainWindow.setTitle(fixedTitle);
    }
  });
  applyWindowSecurity(mainWindow, allowedOrigin);

  // §F 설정 IPC.
  registerSettingsIpc();

  // Google OAuth callback + device identity IPC.
  ipcMain.handle("auth:openExternal", async (_e, url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") return false;
      await shell.openExternal(url);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle("auth:getDeviceInfo", () => getDeviceInfo());
  ipcMain.handle("auth:getPendingDeepLink", () => {
    const url = pendingAuthDeepLink;
    pendingAuthDeepLink = null;
    return url;
  });
  ipcMain.handle("auth:getAutoLoginEnabled", () => getAutoLoginEnabled());
  ipcMain.handle("auth:setAutoLoginEnabled", (_e, enabled: boolean) => {
    setAutoLoginEnabled(Boolean(enabled));
    return getAutoLoginEnabled();
  });

  // §D busy IPC.
  ipcMain.handle("app:startBusy", (_e, opId: string) => {
    if (typeof opId === "string" && opId.length > 0) busyOps.add(opId);
  });
  ipcMain.handle("app:endBusy", (_e, opId: string) => {
    if (typeof opId === "string") endBusy(opId);
  });
  ipcMain.handle("app:isBusy", () => busyOps.size > 0);

  // §H publish 진행 상태 IPC — before-quit 모달 가드용. busyOps 와 별도.
  // 발행 라우트 진입 시 publish:start, 완료/실패/취소 시 publish:end.
  ipcMain.handle("publish:start", (_e, opId: string) => {
    if (typeof opId === "string" && opId.length > 0) publishingOps.add(opId);
  });
  ipcMain.handle("publish:end", (_e, opId: string) => {
    if (typeof opId === "string") publishingOps.delete(opId);
  });
  ipcMain.handle("publish:isActive", () => publishingOps.size > 0);

  await mainWindow.loadURL(allowedOrigin);

  mainWindow.on("close", (event) => {
    if (process.platform === "darwin" && !isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // 업데이트 모듈은 메인 윈도우가 살아있을 때 init.
  initUpdater(mainWindow);
}
