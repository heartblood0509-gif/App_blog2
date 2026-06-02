// §F — userData/settings.json 에 사용자 설정 저장. Gemini API 키는 safeStorage 로 잠금.
//
// IPC:
//   settings:getMasked → { hasKey: boolean, masked: string | null }
//     평문은 절대 renderer 로 흐르지 않음. 표시용 마스킹 문자열만.
//   settings:setGeminiKey { plaintext } → { ok: boolean, encryption_available: boolean }
//     저장 후 사용자에게 재시작 안내. 다음 부팅에 NextServerManager 가 env 로 주입.

import { app, ipcMain, safeStorage } from "electron";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

interface SettingsFile {
  gemini_api_key_encrypted?: string; // base64 DPAPI
  device_id_encrypted?: string; // base64 DPAPI
  device_id_plain?: string; // fallback only when safeStorage is unavailable
  // §J — 자동 로그인 / 세션 영속성. 매 부팅마다 Next dev 포트가 바뀌면 Supabase 가
  // IndexedDB 를 origin 별로 분리 저장하기 때문에 세션이 복원되지 않는다. 마지막에
  // 성공한 포트를 재사용해 origin 을 안정화한다.
  frontend_port?: number;
  // 사용자가 로그인 화면 체크박스로 제어. false 이면 다음 부팅 시 Supabase 로컬
  // 세션을 비우고 로그인 화면을 다시 띄운다. 기본값 true.
  auto_login_enabled?: boolean;
  // youtube-backend(쇼츠 생성기)의 JWT_SECRET. API 키 암호화(Fernet) 키를 여기서 파생하므로
  // 재시작해도 동일해야 저장된 키를 복호화할 수 있다 → 1회 생성 후 영속.
  youtube_jwt_secret?: string;
}

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function readRaw(): SettingsFile {
  try {
    const raw = fs.readFileSync(settingsPath(), "utf-8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeRawAtomic(data: SettingsFile): void {
  const p = settingsPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
  fs.renameSync(tmp, p);
}

function mask(plain: string): string {
  if (plain.length <= 8) return "***";
  return plain.slice(0, 4) + "•".repeat(8) + plain.slice(-4);
}

export function loadGeminiApiKey(): string | undefined {
  const data = readRaw();
  const ct = data.gemini_api_key_encrypted;
  if (!ct) return undefined;
  try {
    if (!safeStorage.isEncryptionAvailable()) return undefined;
    const buf = Buffer.from(ct, "base64");
    return safeStorage.decryptString(buf);
  } catch {
    return undefined;
  }
}

function encryptSetting(value: string): string | null {
  if (!safeStorage.isEncryptionAvailable()) return null;
  return safeStorage.encryptString(value).toString("base64");
}

function decryptSetting(value: string): string | null {
  try {
    if (!safeStorage.isEncryptionAvailable()) return null;
    return safeStorage.decryptString(Buffer.from(value, "base64"));
  } catch {
    return null;
  }
}

export function getOrCreateDeviceId(): string {
  const data = readRaw();
  if (data.device_id_encrypted) {
    const decrypted = decryptSetting(data.device_id_encrypted);
    if (decrypted) return decrypted;
  }
  if (data.device_id_plain) return data.device_id_plain;

  const deviceId = crypto.randomUUID();
  const encrypted = encryptSetting(deviceId);
  if (encrypted) {
    data.device_id_encrypted = encrypted;
  } else {
    data.device_id_plain = deviceId;
  }
  writeRawAtomic(data);
  return deviceId;
}

export function loadFrontendPort(): number | undefined {
  const data = readRaw();
  const port = data.frontend_port;
  if (typeof port === "number" && Number.isInteger(port) && port > 0 && port < 65536) {
    return port;
  }
  return undefined;
}

export function saveFrontendPort(port: number): void {
  const data = readRaw();
  if (data.frontend_port === port) return;
  data.frontend_port = port;
  writeRawAtomic(data);
}

export function getOrCreateYoutubeJwtSecret(): string {
  const data = readRaw();
  if (data.youtube_jwt_secret && data.youtube_jwt_secret.length >= 32) {
    return data.youtube_jwt_secret;
  }
  const secret = crypto.randomBytes(32).toString("hex");
  data.youtube_jwt_secret = secret;
  writeRawAtomic(data);
  return secret;
}

export function getAutoLoginEnabled(): boolean {
  const data = readRaw();
  // 기본값 true — 처음 사용자에게는 자동 로그인이 켜져 있다.
  return data.auto_login_enabled !== false;
}

export function setAutoLoginEnabled(enabled: boolean): void {
  const data = readRaw();
  const next = Boolean(enabled);
  if (data.auto_login_enabled === next) return;
  data.auto_login_enabled = next;
  writeRawAtomic(data);
}

export function getDeviceInfo() {
  return {
    device_id: getOrCreateDeviceId(),
    device_name: os.hostname() || "Unknown device",
    platform: `${process.platform} ${os.release()}`,
    app_version: app.getVersion(),
  };
}

export function registerSettingsIpc(): void {
  ipcMain.handle("settings:getMasked", async () => {
    const plain = loadGeminiApiKey();
    return {
      hasKey: Boolean(plain),
      masked: plain ? mask(plain) : null,
      encryption_available: safeStorage.isEncryptionAvailable(),
    };
  });

  ipcMain.handle("settings:setGeminiKey", async (_e, plaintext: string) => {
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, encryption_available: false };
    }
    if (typeof plaintext !== "string" || plaintext.length === 0) {
      return { ok: false, encryption_available: true };
    }
    const ct = safeStorage.encryptString(plaintext).toString("base64");
    const data = readRaw();
    data.gemini_api_key_encrypted = ct;
    writeRawAtomic(data);
    return { ok: true, encryption_available: true };
  });

  ipcMain.handle("app:relaunch", () => {
    // app.quit() 으로 before-quit 경로 통과 → 자식(python/next/broker) 정상 정리.
    // app.exit(0) 직접 호출은 자식 트리 누수 위험이라 사용하지 않음.
    app.relaunch();
    app.quit();
  });
}
