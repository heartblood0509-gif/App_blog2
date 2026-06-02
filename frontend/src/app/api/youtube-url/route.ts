import { NextResponse } from "next/server";

// "유튜브" 탭 iframe 이 가리킬 youtube-backend(쇼츠 생성기) origin 을 런타임에 반환.
// standalone 빌드라 NEXT_PUBLIC_* 빌드타임 인라인은 못 쓰고, Electron 이 주입한
// 런타임 env(YOUTUBE_BACKEND_URL)를 서버에서 읽어 클라이언트로 내려준다.
export const dynamic = "force-dynamic";

export async function GET() {
  const url = process.env.YOUTUBE_BACKEND_URL ?? null;
  return NextResponse.json({ url });
}
