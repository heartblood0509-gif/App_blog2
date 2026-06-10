// 활성 AI 제공자 + OpenAI 텍스트 모델 설정 라우트.
//   GET:  가드 없음 — 프로덕션에서도 토글/뱃지 렌더에 필요하고, 비밀이 아니다.
//   POST: dev 전용 (웹). Electron 은 settings:setAiProvider IPC 를 쓴다.

import { NextResponse } from "next/server";
import {
  getAiProviderConfig,
  writeAiProviderConfig,
  type AiProvider,
  type OpenAiTextModel,
} from "@/lib/server/ai-provider";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = await getAiProviderConfig();
  return NextResponse.json(cfg);
}

function isDev(): boolean {
  return process.env.NODE_ENV === "development";
}

export async function POST(req: Request) {
  if (!isDev()) {
    return NextResponse.json(
      { ok: false, error: "설정 변경은 개발 모드에서만 허용됩니다." },
      { status: 403 }
    );
  }

  let body: { provider?: unknown; openaiTextModel?: unknown } | null = null;
  try {
    body = (await req.json()) as { provider?: unknown; openaiTextModel?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const partial: { provider?: AiProvider; openaiTextModel?: OpenAiTextModel } = {};
  if (body?.provider === "gemini" || body?.provider === "openai") {
    partial.provider = body.provider;
  }
  if (body?.openaiTextModel === "gpt-5.4-mini" || body?.openaiTextModel === "gpt-5.5") {
    partial.openaiTextModel = body.openaiTextModel;
  }
  if (partial.provider === undefined && partial.openaiTextModel === undefined) {
    return NextResponse.json(
      { ok: false, error: "유효한 provider 또는 openaiTextModel 이 필요합니다." },
      { status: 400 }
    );
  }

  const merged = await writeAiProviderConfig(partial);
  return NextResponse.json({ ok: true, ...merged });
}
