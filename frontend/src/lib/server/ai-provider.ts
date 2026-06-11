// 활성 AI 제공자(Gemini/OpenAI)와 선택된 OpenAI 텍스트 모델의 서버측 단일 진실 소스.
// 비밀이 아닌 설정이라 JSON 파일로 저장. gemini-key.ts 의 파일/atomic write 패턴을 따른다.
//
// 우선순위:
//   1. frontend/.ai-provider.local  (JSON: {provider, imageProvider?, openaiTextModel})
//   2. process.env.AI_PROVIDER / AI_IMAGE_PROVIDER / OPENAI_TEXT_MODEL  (Electron 부팅 시 주입)
//   3. 기본값 {provider:"gemini", openaiTextModel:"gpt-5.5"}
//      — 미설정 시 기존 동작(Gemini) 보존이 핵심.
//
// 2축 provider: provider = 글·제목·분석(텍스트 축). imageProvider = 이미지 축(신규).
//   imageProvider 는 "선택적" — 미설정이면 provider 를 따른다(effImageProvider = imageProvider ?? provider).
//   이렇게 두면 분리 전부터 ChatGPT 로 이미지를 쓰던 사용자 동작이 보존된다(조용한 변경 방지).
//
// 매 호출 디스크/env 재읽기(상태 없음). 단, "한 요청 안에서 provider 가 섞이지 않도록"
// 일관성이 필요한 호출 측(이미지 라우트 등)은 요청 시작 시 1회 스냅샷으로 고정해 사용한다.

import { promises as fs } from "node:fs";
import path from "node:path";

export type AiProvider = "gemini" | "openai";
export type OpenAiTextModel = "gpt-5.4-mini" | "gpt-5.5";

export interface AiProviderConfig {
  provider: AiProvider;
  /** 이미지 생성 provider. 미설정(undefined)이면 provider 를 따름 — 기존 동작 보존. */
  imageProvider?: AiProvider;
  openaiTextModel: OpenAiTextModel;
}

/** 이미지 축의 실효 provider — imageProvider 미설정 시 텍스트 provider 를 따른다. */
export function effectiveImageProvider(cfg: AiProviderConfig): AiProvider {
  return cfg.imageProvider ?? cfg.provider;
}

const DEFAULT_CONFIG: AiProviderConfig = {
  provider: "gemini",
  openaiTextModel: "gpt-5.5",
};

function isProvider(v: unknown): v is AiProvider {
  return v === "gemini" || v === "openai";
}

function isTextModel(v: unknown): v is OpenAiTextModel {
  return v === "gpt-5.4-mini" || v === "gpt-5.5";
}

function configFilePath(): string {
  // Electron 은 쓰기 가능한 userData 경로를 AI_PROVIDER_CONFIG_PATH 로 주입한다
  // (토글 시 재시작 없이 즉시 반영 — main 프로세스가 이 파일에 쓰고 Next 가 매 요청 읽음).
  // 웹 dev 는 frontend/.ai-provider.local.
  return process.env.AI_PROVIDER_CONFIG_PATH || path.join(process.cwd(), ".ai-provider.local");
}

async function readFileConfig(): Promise<Partial<AiProviderConfig> | null> {
  try {
    const raw = await fs.readFile(configFilePath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const obj = parsed as Record<string, unknown>;
    const out: Partial<AiProviderConfig> = {};
    if (isProvider(obj.provider)) out.provider = obj.provider;
    if (isProvider(obj.imageProvider)) out.imageProvider = obj.imageProvider;
    if (isTextModel(obj.openaiTextModel)) out.openaiTextModel = obj.openaiTextModel;
    return out;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") {
      console.warn("[ai-provider] .ai-provider.local 읽기 실패:", code ?? err);
    }
    return null;
  }
}

function readEnvConfig(): Partial<AiProviderConfig> {
  const out: Partial<AiProviderConfig> = {};
  const p = process.env.AI_PROVIDER?.trim();
  if (isProvider(p)) out.provider = p;
  const ip = process.env.AI_IMAGE_PROVIDER?.trim();
  if (isProvider(ip)) out.imageProvider = ip;
  const m = process.env.OPENAI_TEXT_MODEL?.trim();
  if (isTextModel(m)) out.openaiTextModel = m;
  return out;
}

/**
 * 현재 활성 provider 와 OpenAI 텍스트 모델을 반환.
 * 파일(최우선) → env → 기본값(gemini) 순으로 병합.
 */
export async function getAiProviderConfig(): Promise<AiProviderConfig> {
  const envCfg = readEnvConfig();
  const fileCfg = await readFileConfig();
  return { ...DEFAULT_CONFIG, ...envCfg, ...(fileCfg ?? {}) };
}

/**
 * provider/모델 설정 저장 (dev 전용; Electron 은 IPC 사용).
 * 기존 값과 병합 — 토글만 바꿔도 모델이 유지되고, 모델만 바꿔도 provider 가 유지된다.
 */
export async function writeAiProviderConfig(
  partial: Partial<AiProviderConfig>
): Promise<AiProviderConfig> {
  const current = await getAiProviderConfig();
  const merged: AiProviderConfig = {
    provider: isProvider(partial.provider) ? partial.provider : current.provider,
    imageProvider: isProvider(partial.imageProvider)
      ? partial.imageProvider
      : current.imageProvider,
    openaiTextModel: isTextModel(partial.openaiTextModel)
      ? partial.openaiTextModel
      : current.openaiTextModel,
  };
  const target = configFilePath();
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, JSON.stringify(merged), { mode: 0o600, encoding: "utf8" });
  await fs.rename(tmp, target);
  return merged;
}
