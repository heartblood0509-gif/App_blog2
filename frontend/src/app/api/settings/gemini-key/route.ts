// 웹(Next dev) 환경에서 Gemini API 키 상태를 조회·저장하는 라우트.
// Electron 환경에서는 settings:getMasked / settings:setGeminiKey IPC 가 동일 역할.
//
// GET:  현재 사용 중인 키의 등록 여부 + 마스킹 + 출처(local-file | env | none) 반환.
//       평문 키는 절대 반환하지 않는다.
// POST: 평문 키를 받아 .gemini-key.local 에 저장. dev 환경에서만 동작.
//       (production 에서는 403 — 평문 파일 저장을 막아 사고 방지.)

import { NextResponse } from "next/server";
import {
  deleteLocalGeminiKey,
  getServerGeminiKey,
  maskKey,
  writeLocalGeminiKey,
} from "@/lib/server/gemini-key";

export const dynamic = "force-dynamic";

export async function GET() {
  const { key, source } = await getServerGeminiKey();
  if (!key) {
    return NextResponse.json({ hasKey: false, masked: null, source });
  }
  return NextResponse.json({
    hasKey: true,
    masked: maskKey(key),
    source,
  });
}

function isDev(): boolean {
  return process.env.NODE_ENV === "development";
}

export async function POST(req: Request) {
  if (!isDev()) {
    return NextResponse.json(
      { ok: false, error: "키 저장은 개발 모드에서만 허용됩니다." },
      { status: 403 }
    );
  }

  let body: { plaintext?: unknown } | null = null;
  try {
    body = (await req.json()) as { plaintext?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "JSON 본문이 올바르지 않습니다." }, { status: 400 });
  }

  const plaintext = typeof body?.plaintext === "string" ? body.plaintext.trim() : "";
  if (!plaintext) {
    return NextResponse.json({ ok: false, error: "키가 비어 있습니다." }, { status: 400 });
  }
  // 최소 길이 가드 — Gemini 키는 보통 39자. 너무 짧으면 거부.
  if (plaintext.length < 20) {
    return NextResponse.json(
      { ok: false, error: "키가 너무 짧습니다. 전체 키를 붙여넣었는지 확인하세요." },
      { status: 400 }
    );
  }

  try {
    await writeLocalGeminiKey(plaintext);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gemini-key POST] 저장 실패:", msg);
    return NextResponse.json({ ok: false, error: "파일 저장에 실패했습니다." }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    hasKey: true,
    masked: maskKey(plaintext),
    source: "local-file" as const,
  });
}

export async function DELETE() {
  if (!isDev()) {
    return NextResponse.json(
      { ok: false, error: "키 삭제는 개발 모드에서만 허용됩니다." },
      { status: 403 }
    );
  }
  try {
    await deleteLocalGeminiKey();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[gemini-key DELETE] 삭제 실패:", msg);
    return NextResponse.json({ ok: false, error: "파일 삭제에 실패했습니다." }, { status: 500 });
  }
  // 삭제 후 env 키가 남아있을 수 있으니 다시 조회해서 반환.
  const { key, source } = await getServerGeminiKey();
  return NextResponse.json({
    ok: true,
    hasKey: !!key,
    masked: key ? maskKey(key) : null,
    source,
  });
}
