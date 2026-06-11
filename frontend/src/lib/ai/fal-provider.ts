// fal.ai(@fal-ai/client) 이미지 제공자 구현.
// 파사드(lib/gemini.ts)가 "이미지 provider = Gemini + fal 키 보유" 일 때 이 함수들에 위임한다.
// nano-banana-2 = gemini-3.1-flash-image, nano-banana-pro = gemini-3-pro-image 라 품질 동일.
//
// 키: 라우트가 넘기는 apiKey 는 Gemini 키이므로 fal 에선 무시하고 getServerFalKey() 로 읽는다
//     (openai-provider 가 OpenAI 키를 서버에서 읽는 것과 동일 구조).
// 큐: fal.subscribe 는 동시성 한도에 걸려도 거부하지 않고 큐 대기 → 429 가 구조적으로 거의 없다.
// 에러 계약(코덱스 C3): SAFETY/빈 응답만 null. 그 외(인증·결제·엔드포인트)는 throw —
//     단 fal 오류는 .status 를 실어 보내 상위 분류기(retry-classify)가 generic 하게 분류하게 한다.

import { createFalClient, type FalClient } from "@fal-ai/client";
import { getServerFalKey } from "@/lib/server/fal-key";
import { CONFIG } from "@/lib/config";
import { devLog, maskSecrets } from "./log";
import type { GeneratedImageResult } from "./types";

// 키 단위 인스턴스 캐싱(genai/openai 패턴과 동일 — 키 변경 시 자동으로 새 인스턴스).
const falByKey = new Map<string, FalClient>();

async function getFal(): Promise<FalClient> {
  const { key } = await getServerFalKey();
  if (!key) throw new Error("fal API 키가 설정되지 않았습니다.");
  let inst = falByKey.get(key);
  if (!inst) {
    inst = createFalClient({ credentials: key });
    falByKey.set(key, inst);
  }
  return inst;
}

// 파사드가 넘기는 Gemini 모델 문자열 → fal 엔드포인트. Pro 모델은 사진변환에서만 쓰인다(M8).
function isProModel(model: string): boolean {
  return model === CONFIG.IMAGE_MODEL_PRO || /pro/i.test(model);
}
function genEndpoint(model: string): string {
  return isProModel(model) ? CONFIG.FAL_IMAGE_MODEL_PRO : CONFIG.FAL_IMAGE_MODEL;
}
function editEndpoint(model: string): string {
  return isProModel(model)
    ? CONFIG.FAL_IMAGE_EDIT_MODEL_PRO
    : CONFIG.FAL_IMAGE_EDIT_MODEL;
}

// SAFETY/콘텐츠 차단류 — 기존 계약대로 null(생성 자체는 막지 않음).
const SAFETY_RE = /safety|content[_\s-]?policy|blocked|nsfw|moderat/i;

/** fal 출력(images[0].url)을 GeneratedImageResult 로 정규화. sync_mode → data URI, 아니면 fetch. */
async function extractFalImage(
  data: unknown
): Promise<GeneratedImageResult | null> {
  const images = (
    data as { images?: Array<{ url?: string; content_type?: string }> }
  )?.images;
  const first = images?.[0];
  const url = first?.url;
  if (!url) return null;

  // sync_mode:true → data:image/png;base64,XXXX  ([\s\S] 로 dotAll 플래그 없이 매칭)
  const m = /^data:([^;]+);base64,([\s\S]+)$/.exec(url);
  if (m) return { base64: m[2], mimeType: m[1] };

  // http(s) URL 로 온 경우 → 내려받아 base64 로 변환.
  const res = await fetch(url);
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  const mimeType =
    first?.content_type || res.headers.get("content-type") || "image/png";
  return { base64: buf.toString("base64"), mimeType };
}

// fal 오류를 상위 분류기가 읽을 수 있게 .status 를 보존해 다시 throw.
// (fal ApiError 는 HTTP status 를 들고 있어 mapStatusToReason 이 generic 하게 동작.)
function normalizeFalError(err: unknown): never {
  if (err instanceof Error) {
    const status = (err as { status?: number }).status;
    const e = new Error(`[fal] ${err.message}`) as Error & {
      status?: number;
      provider?: string;
    };
    if (typeof status === "number") e.status = status;
    e.provider = "fal";
    throw e;
  }
  throw new Error(`[fal] ${String(err)}`);
}

const SYNC_INPUT = { num_images: 1, output_format: "png", sync_mode: true };

// 공통 실행기 — getFal → subscribe → 구조화 로그(fal requestId 포함) → 정규화.
//   requestId 는 fal 대시보드에서 대조 가능 → "정말 fal 로 생성됐다"는 명확한 증거.
//   에러 계약: SAFETY/빈 응답만 null, 나머지는 normalizeFalError 로 throw(상위 분류).
async function runFal(
  endpoint: string,
  input: Record<string, unknown>
): Promise<GeneratedImageResult | null> {
  try {
    const fal = await getFal();
    const { data, requestId } = await fal.subscribe(endpoint, { input });
    // thinking 사용 시 응답에 draft 이미지가 섞이는지 확인용(imageCount) — images[0] 최종본 검증.
    const imageCount =
      (data as { images?: unknown[] })?.images?.length ?? 0;
    const img = await extractFalImage(data);
    devLog("[fal] done", { endpoint, requestId, imageCount, ok: img != null });
    return img;
  } catch (err) {
    if (err instanceof Error && SAFETY_RE.test(err.message)) return null;
    // fal발 오류(키·잔액·엔드포인트)를 Gemini 오류와 구분해 남긴다(에러 로그 → 릴리스에서도 유지).
    const status = (err as { status?: number })?.status ?? null;
    const message = err instanceof Error ? err.message : String(err);
    console.log(
      "[fal] error",
      JSON.stringify({ endpoint, status, message: maskSecrets(message).slice(0, 200) })
    );
    normalizeFalError(err);
  }
}

/** 텍스트 프롬프트로 이미지 1장 생성. _apiKey(=Gemini 키)는 무시. */
export async function generateImage(
  prompt: string,
  model: string,
  _apiKey?: string
): Promise<GeneratedImageResult | null> {
  return runFal(genEndpoint(model), { prompt, ...SYNC_INPUT });
}

/** aspectRatio 를 지정해 이미지 1장 생성. */
export async function generateImageWithAspect(
  prompt: string,
  aspectRatio: string,
  model: string,
  _apiKey?: string
): Promise<GeneratedImageResult | null> {
  return runFal(genEndpoint(model), {
    prompt,
    aspect_ratio: aspectRatio,
    ...SYNC_INPUT,
  });
}

/** 사용자 이미지 + 텍스트 지시로 변형(image-to-image). image_urls 에 base64 data URI.
 *  thinking_level:"high" — fal 변환은 기본적으로 thinking 이 꺼져 있어(omit) Gemini(기본 ON)보다
 *  지시를 덜 따른다. high 로 맞춰 프롬프트 순종도를 올린다(공식 가격: +$0.002/장, 사실상 무시 가능). */
export async function transformImage(
  prompt: string,
  userImageBase64: string,
  userImageMime: string,
  model: string,
  _apiKey?: string
): Promise<GeneratedImageResult | null> {
  const dataUri = `data:${userImageMime};base64,${userImageBase64}`;
  return runFal(editEndpoint(model), {
    prompt,
    image_urls: [dataUri],
    thinking_level: "high",
    ...SYNC_INPUT,
  });
}
