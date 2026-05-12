import { app, BrowserWindow, dialog, ipcMain } from "electron";
import crypto from "node:crypto";
import path from "node:path";
import log from "electron-log";
import { paths } from "./paths";
import { applyWindowSecurity } from "./security";
import { getFreePort } from "./net-utils";
import { PythonManager } from "./python-manager";
import { NextServerManager } from "./next-server";
import { initJobObject, assignToJob, closeJobObject } from "./job-object";
import { initUpdater, tryInstallNow } from "./updater";
import { CredentialBroker } from "./credential-broker";
import { redactTransform } from "./log-redactor";
import { loadGeminiApiKey, registerSettingsIpc } from "./settings";

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

// §D — busy 상태. operation id 기반 Set 으로 idempotent. boolean 카운터 아님.
const busyOps = new Set<string>();
let installPending = false;

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

// §A 보안 토큰. packaged 빌드에서는 ALLOW_INSECURE_DEV_* 플래그를 절대 set 하지 않음.
const APP_TOKEN = crypto.randomBytes(32).toString("hex");
const APP_SESSION_TOKEN = crypto.randomBytes(32).toString("hex");

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(boot).catch((err) => {
    console.error("[main] boot failed:", err);
    dialog.showErrorBox("App Blog Publisher", `서비스 시작 실패:\n${String(err?.message ?? err)}`);
    app.exit(1);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", async (event) => {
    if (isQuitting) return;
    isQuitting = true;
    event.preventDefault();
    try {
      await Promise.allSettled([nextSrv?.stop(), python?.stop(), broker?.stop()]);
    } finally {
      // Job Object 핸들 닫기 — 좀비 안전망 트리거.
      closeJobObject();
      app.exit(0);
    }
  });
}

async function boot(): Promise<void> {
  // 좀비 안전망. Job Object 초기화는 자식 spawn 이전에 끝나야 함.
  initJobObject();

  // §C credential broker 시작. safeStorage 미사용 환경에서도 broker 자체는 떠 있고,
  // 실제 /encrypt 호출 시 503 반환. 사용자에게는 UI 단에서 안내.
  broker = new CredentialBroker({ appToken: APP_TOKEN });
  await broker.start();
  if (!broker.isEncryptionAvailable()) {
    dialog.showErrorBox(
      "App Blog Publisher",
      "이 PC 에서 비밀번호 암호화 기능을 사용할 수 없습니다.\n" +
        "Windows 사용자 프로필에 문제가 있을 수 있습니다.\n" +
        "기존 계정의 비밀번호는 다시 입력해야 동작합니다.",
    );
  }

  const backendPort = await getFreePort();
  const frontendPort = await getFreePort();
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
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    backgroundColor: "#1a1a1a",
    title: "App Blog Publisher",
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: paths.preload,
    },
  });
  applyWindowSecurity(mainWindow, allowedOrigin);
  await mainWindow.loadURL(allowedOrigin);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  // §F 설정 IPC.
  registerSettingsIpc();

  // §D busy IPC.
  ipcMain.handle("app:startBusy", (_e, opId: string) => {
    if (typeof opId === "string" && opId.length > 0) busyOps.add(opId);
  });
  ipcMain.handle("app:endBusy", (_e, opId: string) => {
    if (typeof opId === "string") endBusy(opId);
  });
  ipcMain.handle("app:isBusy", () => busyOps.size > 0);

  // 업데이트 모듈은 메인 윈도우가 살아있을 때 init.
  initUpdater(mainWindow);
}
