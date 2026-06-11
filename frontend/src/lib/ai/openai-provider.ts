// OpenAI(ChatGPT) 제공자 구현. gemini-provider.ts 와 동일한 함수 시그니처를 제공하되
// 내부를 OpenAI SDK(chat.completions / images)로 매핑한다. 파사드가 provider 분기 후 위임.
//
// 핵심 매핑:
//   - 텍스트/스트림: chat.completions.create (stream?). systemInstruction → system 메시지.
//   - 멀티모달 입력: parts → {type:"text"} / {type:"image_url", image_url:{url:data URL}}.
//   - JSON 모드: responseMimeType="application/json" → response_format:{type:"json_object"}
//                + "JSON" 지시를 system 메시지로 주입(없으면 400).
//   - 이미지: images.generate / images.edit, model=gpt-image-2.
//   - 에러 계약: 콘텐츠 정책 거부(moderation)만 null(=Gemini SAFETY), 그 외는 정규화 후 throw.
//
// model 인자는 호출처가 넘기는 "Gemini 모델 문자열"이라, roleFromModel 로 역할을 환원해
// 실제 OpenAI 모델/이미지 품질을 고른다. apiKey 인자는 OpenAI 자체 키 해석을 쓰므로 무시.

import OpenAI, { toFile } from "openai";
import { getServerOpenAIKey } from "@/lib/server/openai-key";
import { resolveProviderConfig } from "@/lib/ai/provider-context";
import { CONFIG } from "@/lib/config";
import { roleFromModel, aspectToSize } from "./model-map";
import type {
  ChatTurn,
  ChatPart,
  MultimodalTurn,
  GenerateTextConfig,
  GeneratedImageResult,
} from "./types";

type ChatMessage = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type ContentPart = OpenAI.Chat.Completions.ChatCompletionContentPart;

// 정적 메타 지시(사용자 입력과 무관). 긴 규칙이 user 메시지에만 있으면 gpt 가 규칙을 약하게
// 따르는 문제를 보정한다. user 보다 상위 채널인 developer 로 "지침을 엄격히 따르라"는 고정
// 문구만 올린다. ⚠️ 사용자 데이터(주제·요구사항·본문 등)는 절대 이 채널로 올리지 않는다
// (신뢰경계 보존 — 코덱스 리뷰 ①). developer 가 기대만 못하면 system 으로 교체 가능.
const OPENAI_GENERATION_DIRECTIVE =
  "당신은 한국어 글쓰기 전문가입니다. 사용자 메시지에 담긴 모든 지침·규칙·형식·분량 요구를 하나도 빠짐없이 정확히 따르세요. " +
  "글을 끝내기 전, 사용자 메시지가 요구한 구조 요소·분량·금지 규칙·출력 형식을 모두 충족했는지 스스로 점검하고, 누락이나 위반이 있으면 고친 뒤 최종본만 출력하세요. " +
  "같은 제목 문구를 본문 안에 그대로 반복하지 마세요. " +
  "요청된 결과물만 출력하고, 인사말·자기설명·메타발언·코드펜스 같은 군더더기는 절대 덧붙이지 마세요.";

// 키 단위 인스턴스 캐싱 (genai 패턴과 동일 — 키 변경 시 자동으로 새 인스턴스).
const openaiByKey = new Map<string, OpenAI>();

async function getOpenAI(): Promise<OpenAI> {
  const { key } = await getServerOpenAIKey();
  if (!key) throw new Error("OpenAI API 키가 설정되지 않았습니다.");
  let inst = openaiByKey.get(key);
  if (!inst) {
    inst = new OpenAI({ apiKey: key });
    openaiByKey.set(key, inst);
  }
  return inst;
}

/** 텍스트 역할(generation/analysis 등)은 모두 사용자가 고른 단일 텍스트 모델을 쓴다.
 *  요청 스냅샷(withProviderSnapshot)이 있으면 그 값을 따라 한 요청 내 모델 일관성을 보장한다. */
async function resolveTextModel(): Promise<string> {
  const { openaiTextModel } = await resolveProviderConfig();
  return openaiTextModel;
}

type ImageQuality = "low" | "medium" | "high";
function imageQualityForModel(model: string): ImageQuality {
  return roleFromModel(model) === "imagePro"
    ? (CONFIG.OPENAI_IMAGE_QUALITY.pro as ImageQuality)
    : (CONFIG.OPENAI_IMAGE_QUALITY.default as ImageQuality);
}

/** Gemini inlineData parts → OpenAI content 배열(text / image_url data URL). */
function partsToContent(parts: ChatPart[]): ContentPart[] {
  return parts.map((p): ContentPart =>
    "text" in p
      ? { type: "text", text: p.text }
      : {
          type: "image_url",
          image_url: {
            url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
          },
        }
  );
}

// ─────────────────────────────────────────────
// 에러 정규화 — images/generate 라우트의 parseGeminiError 가 분류할 수 있게 맞춘다.
// ─────────────────────────────────────────────

function normalizeOpenAIError(err: unknown): Error {
  const e = err as { status?: number; code?: string; message?: string };
  const status = e?.status ?? 0;
  const code = e?.code ?? "";
  const baseMsg = e?.message ?? String(err);
  // parseGeminiError 는 message 안의 status 숫자 + RESOURCE_EXHAUSTED/UNAVAILABLE 키워드를 본다.
  let tag = "";
  if (status === 429 || /rate_limit|insufficient_quota/i.test(code)) {
    tag = "429 RESOURCE_EXHAUSTED";
  } else if (status === 503) {
    tag = "503 UNAVAILABLE";
  } else if (status === 500) {
    tag = "500 INTERNAL";
  } else if (status) {
    tag = String(status);
  }
  return new Error(`[openai${tag ? " " + tag : ""}] ${baseMsg}`);
}

/**
 * 이미지 에러 처리. 콘텐츠 정책 거부(moderation)만 null(=Gemini SAFETY 계약).
 * 잘못된 size/image 같은 400은 정규화해 throw — "안전 차단"으로 위장하지 않는다.
 */
function handleImageError(err: unknown): null {
  const e = err as { code?: string; type?: string; message?: string };
  const sig = `${e?.code ?? ""} ${e?.type ?? ""} ${e?.message ?? String(err)}`;
  if (/moderation|content_policy|safety/i.test(sig)) {
    return null;
  }
  throw normalizeOpenAIError(err);
}

// ─────────────────────────────────────────────
// 텍스트
// ─────────────────────────────────────────────

export async function* generateStream(
  prompt: string,
  _model: string = "gemini-2.5-flash",
  _apiKey?: string
): AsyncGenerator<string> {
  const client = await getOpenAI();
  const model = await resolveTextModel();
  const stream = await client.chat.completions.create({
    model,
    messages: [
      { role: "developer", content: OPENAI_GENERATION_DIRECTIVE },
      { role: "user", content: prompt },
    ],
    stream: true,
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export async function* generateChatStream(
  systemInstruction: string,
  history: ChatTurn[],
  _model: string = "gemini-2.5-flash",
  _apiKey?: string
): AsyncGenerator<string> {
  const client = await getOpenAI();
  const model = await resolveTextModel();
  const messages: ChatMessage[] = [
    { role: "system", content: systemInstruction },
    ...history.map(
      (t): ChatMessage => ({
        role: t.role === "model" ? "assistant" : "user",
        content: t.text,
      })
    ),
  ];
  const stream = await client.chat.completions.create({ model, messages, stream: true });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export async function* generateMultimodalChatStream(
  systemInstruction: string,
  history: MultimodalTurn[],
  _model: string = "gemini-2.5-flash",
  _apiKey?: string
): AsyncGenerator<string> {
  const client = await getOpenAI();
  const model = await resolveTextModel();
  const messages: ChatMessage[] = [
    { role: "system", content: systemInstruction },
    ...history.map((t): ChatMessage => {
      // assistant(=model) 턴은 OpenAI 가 배열 content/이미지를 허용하지 않으므로 텍스트만 결합.
      if (t.role === "model") {
        const text = t.parts.map((p) => ("text" in p ? p.text : "")).join("");
        return { role: "assistant", content: text };
      }
      return { role: "user", content: partsToContent(t.parts) };
    }),
  ];
  const stream = await client.chat.completions.create({ model, messages, stream: true });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export async function generateText(
  prompt: string,
  _model: string = "gemini-2.5-flash",
  _apiKey?: string,
  generationConfig?: GenerateTextConfig
): Promise<string> {
  const client = await getOpenAI();
  const model = await resolveTextModel();
  const wantJson = generationConfig?.responseMimeType === "application/json";
  const messages: ChatMessage[] = wantJson
    ? [
        { role: "developer", content: OPENAI_GENERATION_DIRECTIVE },
        { role: "system", content: "You must respond with valid JSON only." },
        { role: "user", content: prompt },
      ]
    : [
        { role: "developer", content: OPENAI_GENERATION_DIRECTIVE },
        { role: "user", content: prompt },
      ];
  const res = await client.chat.completions.create({
    model,
    messages,
    ...(generationConfig?.temperature !== undefined
      ? { temperature: generationConfig.temperature }
      : {}),
    ...(generationConfig?.topP !== undefined ? { top_p: generationConfig.topP } : {}),
    ...(wantJson ? { response_format: { type: "json_object" as const } } : {}),
  });
  return res.choices[0]?.message?.content ?? "";
}

export async function* generateMultimodalStream(
  parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }>,
  _model: string,
  _apiKey?: string
): AsyncGenerator<string> {
  const client = await getOpenAI();
  const model = await resolveTextModel();
  const stream = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: partsToContent(parts) }],
    stream: true,
  });
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta) yield delta;
  }
}

export async function generateMultimodalText(
  parts: Array<{ text: string } | { inlineData: { data: string; mimeType: string } }>,
  _model: string,
  _apiKey?: string
): Promise<string> {
  const client = await getOpenAI();
  const model = await resolveTextModel();
  const res = await client.chat.completions.create({
    model,
    messages: [{ role: "user", content: partsToContent(parts) }],
  });
  return res.choices[0]?.message?.content ?? "";
}

export async function describeImageSubject(
  userImageBase64: string,
  userImageMime: string,
  prompt: string,
  model: string,
  _apiKey?: string
): Promise<string> {
  try {
    const text = await generateMultimodalText(
      [
        { inlineData: { data: userImageBase64, mimeType: userImageMime } },
        { text: prompt },
      ],
      model
    );
    const oneLine = (text || "").replace(/\s+/g, " ").trim();
    return oneLine.slice(0, 100);
  } catch {
    return "";
  }
}

// ─────────────────────────────────────────────
// 이미지 (gpt-image-2)
// ─────────────────────────────────────────────

export async function generateImage(
  prompt: string,
  model: string,
  _apiKey?: string
): Promise<GeneratedImageResult | null> {
  try {
    const client = await getOpenAI();
    const res = await client.images.generate({
      model: CONFIG.OPENAI_IMAGE_MODEL,
      prompt,
      size: "1024x1024" as OpenAI.Images.ImageGenerateParams["size"],
      quality: imageQualityForModel(model) as OpenAI.Images.ImageGenerateParams["quality"],
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) return null;
    return { base64: b64, mimeType: "image/png" };
  } catch (err) {
    return handleImageError(err);
  }
}

export async function generateImageWithAspect(
  prompt: string,
  aspectRatio: string,
  model: string,
  _apiKey?: string
): Promise<GeneratedImageResult | null> {
  try {
    const client = await getOpenAI();
    const res = await client.images.generate({
      model: CONFIG.OPENAI_IMAGE_MODEL,
      prompt,
      size: aspectToSize(aspectRatio) as OpenAI.Images.ImageGenerateParams["size"],
      quality: imageQualityForModel(model) as OpenAI.Images.ImageGenerateParams["quality"],
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) return null;
    return { base64: b64, mimeType: "image/png" };
  } catch (err) {
    return handleImageError(err);
  }
}

export async function transformImage(
  prompt: string,
  userImageBase64: string,
  userImageMime: string,
  model: string,
  _apiKey?: string
): Promise<GeneratedImageResult | null> {
  try {
    const client = await getOpenAI();
    const image = await toFile(Buffer.from(userImageBase64, "base64"), "image.png", {
      type: userImageMime || "image/png",
    });
    const res = await client.images.edit({
      model: CONFIG.OPENAI_IMAGE_MODEL,
      image,
      prompt,
      quality: imageQualityForModel(model) as OpenAI.Images.ImageEditParams["quality"],
    });
    const b64 = res.data?.[0]?.b64_json;
    if (!b64) return null;
    return { base64: b64, mimeType: "image/png" };
  } catch (err) {
    return handleImageError(err);
  }
}
