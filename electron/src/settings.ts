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
    app.relaunch();
    app.exit(0);
  });
}
