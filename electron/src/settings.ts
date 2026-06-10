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
  // 유튜브 쇼츠 전용 키. 부팅 시 YoutubeManager 가 env 로 시드(youtube-backend DB 가 비어있을 때만).
  // 변경 즉시 적용은 설정 UI 가 youtube 백엔드에 PUT 으로 직접 갱신(여긴 다음 부팅용 보관).
  typecast_api_key_encrypted?: string; // base64 DPAPI
  fal_key_encrypted?: string; // base64 DPAPI
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
  // ── AI 제공자(블로그 글 생성) ── 키만 암호화 저장.
  // provider/모델 토글은 즉시 반영돼야 해서 userData/ai-provider.json(평문 JSON)에 따로 둔다.
  openai_api_key_encrypted?: string; // base64 DPAPI
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

// base64(DPAPI) 암호문 → 평문. 복호화 불가/미설정이면 undefined.
function loadEncryptedKey(ct?: string): string | undefined {
  if (!ct) return undefined;
  try {
    if (!safeStorage.isEncryptionAvailable()) return undefined;
    return safeStorage.decryptString(Buffer.from(ct, "base64"));
  } catch {
    return undefined;
  }
}

export function loadGeminiApiKey(): string | undefined {
  return loadEncryptedKey(readRaw().gemini_api_key_encrypted);
}

export function loadTypecastApiKey(): string | undefined {
  return loadEncryptedKey(readRaw().typecast_api_key_encrypted);
}

export function loadFalKey(): string | undefined {
  return loadEncryptedKey(readRaw().fal_key_encrypted);
}

export function loadOpenAIApiKey(): string | undefined {
  return loadEncryptedKey(readRaw().openai_api_key_encrypted);
}

// provider/모델은 비밀이 아니고 토글 시 즉시 반영돼야 해서 userData 의 평문 JSON 으로 둔다.
// Next 가 AI_PROVIDER_CONFIG_PATH 로 이 파일을 매 요청 읽어, 재시작 없이 전환된다.
export type AiProviderConfig = {
  provider: "gemini" | "openai";
  openaiTextModel: "gpt-5.4-mini" | "gpt-5.5";
};

export function aiProviderConfigPath(): string {
  return path.join(app.getPath("userData"), "ai-provider.json");
}

export function readAiProviderConfig(): AiProviderConfig {
  try {
    const raw = fs.readFileSync(aiProviderConfigPath(), "utf-8");
    const p = JSON.parse(raw);
    return {
      provider: p?.provider === "openai" ? "openai" : "gemini",
      openaiTextModel: p?.openaiTextModel === "gpt-5.4-mini" ? "gpt-5.4-mini" : "gpt-5.5",
    };
  } catch {
    return { provider: "gemini", openaiTextModel: "gpt-5.5" };
  }
}

function writeAiProviderConfig(cfg: AiProviderConfig): void {
  const p = aiProviderConfigPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg), "utf-8");
  fs.renameSync(tmp, p);
}

// 유튜브 전용 키(typecast/fal) 저장. 빈 문자열이면 해당 필드를 지운다(설정 UI '지우기'와 정합).
type YoutubeKeyField = "typecast_api_key_encrypted" | "fal_key_encrypted";
function setEncryptedYoutubeKey(
  field: YoutubeKeyField,
  plaintext: string,
): { ok: boolean; encryption_available: boolean } {
  const encryption_available = safeStorage.isEncryptionAvailable();
  const data = readRaw();
  if (typeof plaintext === "string" && plaintext.length === 0) {
    if (data[field] !== undefined) {
      delete data[field];
      writeRawAtomic(data);
    }
    return { ok: true, encryption_available };
  }
  if (!encryption_available) return { ok: false, encryption_available: false };
  if (typeof plaintext !== "string") return { ok: false, encryption_available: true };
  data[field] = safeStorage.encryptString(plaintext).toString("base64");
  writeRawAtomic(data);
  return { ok: true, encryption_available: true };
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

  // 유튜브 전용 키(다음 부팅 시 youtube-backend 에 env 시드용). 빈 문자열=지우기.
  ipcMain.handle("settings:setTypecastKey", async (_e, plaintext: string) =>
    setEncryptedYoutubeKey("typecast_api_key_encrypted", plaintext),
  );
  ipcMain.handle("settings:setFalKey", async (_e, plaintext: string) =>
    setEncryptedYoutubeKey("fal_key_encrypted", plaintext),
  );

  // OpenAI 키 (블로그 ChatGPT 모드). setGeminiKey 패턴 + 빈 문자열=지우기.
  ipcMain.handle("settings:setOpenAIKey", async (_e, plaintext: string) => {
    const encryption_available = safeStorage.isEncryptionAvailable();
    const data = readRaw();
    if (typeof plaintext === "string" && plaintext.length === 0) {
      if (data.openai_api_key_encrypted !== undefined) {
        delete data.openai_api_key_encrypted;
        writeRawAtomic(data);
      }
      return { ok: true, encryption_available };
    }
    if (!encryption_available) return { ok: false, encryption_available: false };
    if (typeof plaintext !== "string") return { ok: false, encryption_available: true };
    data.openai_api_key_encrypted = safeStorage.encryptString(plaintext).toString("base64");
    writeRawAtomic(data);
    return { ok: true, encryption_available: true };
  });

  ipcMain.handle("settings:getOpenAIMasked", async () => {
    const plain = loadOpenAIApiKey();
    return {
      hasKey: Boolean(plain),
      masked: plain ? mask(plain) : null,
      encryption_available: safeStorage.isEncryptionAvailable(),
    };
  });

  ipcMain.handle("settings:getAiProvider", async () => readAiProviderConfig());

  // provider/모델 토글 — userData/ai-provider.json 에 즉시 기록. Next 가 매 요청 읽어 재시작 불필요.
  ipcMain.handle(
    "settings:setAiProvider",
    async (_e, cfg: { provider?: string; openaiTextModel?: string }) => {
      const current = readAiProviderConfig();
      const next: AiProviderConfig = {
        provider:
          cfg?.provider === "gemini" || cfg?.provider === "openai" ? cfg.provider : current.provider,
        openaiTextModel:
          cfg?.openaiTextModel === "gpt-5.4-mini" || cfg?.openaiTextModel === "gpt-5.5"
            ? cfg.openaiTextModel
            : current.openaiTextModel,
      };
      writeAiProviderConfig(next);
      return { ok: true, ...next };
    },
  );

  ipcMain.handle("app:relaunch", () => {
    // app.quit() 으로 before-quit 경로 통과 → 자식(python/next/broker) 정상 정리.
    // app.exit(0) 직접 호출은 자식 트리 누수 위험이라 사용하지 않음.
    app.relaunch();
    app.quit();
  });
}
