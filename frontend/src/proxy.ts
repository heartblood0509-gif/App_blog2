// §A-2 — Next API 입구 보호 (HttpOnly + SameSite=Strict 쿠키).
//
// 위협 모델: 같은 PC 의 다른 프로그램이 http://127.0.0.1:${frontendPort}/api/publish 를
// 직접 호출하면, Next API route 가 알아서 APP_TOKEN 을 붙여 백엔드를 호출하므로 백엔드
// 만의 토큰 인증으론 못 막힘. 그래서 Next 자체가 입구에서 한 번 더 검증.
//
// 동작:
//   1) 페이지(/, /step-*, etc.) 응답에 app_session 쿠키 발급 (HttpOnly, SameSite=Strict).
//      Electron 의 renderer 가 이 쿠키를 갖게 됨. JS 는 못 읽음.
//   2) /api/* 요청은 쿠키의 app_session 값이 APP_SESSION_TOKEN env 와 일치할 때만 통과.
//      외부 프로그램의 curl 요청은 쿠키가 없으니 401.
//
// dev fallback: APP_SESSION_TOKEN env 가 없고 ALLOW_INSECURE_DEV_AUTH=1 이면 검증 통과.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "app_session";

function getExpectedToken(): string | null {
  const t = process.env.APP_SESSION_TOKEN;
  if (t) return t;
  // dev fallback
  if (process.env.ALLOW_INSECURE_DEV_AUTH === "1") return null;
  // packaged 빌드에서 env 누락 → 401 일괄 발급 (fail-closed)
  return "__missing-token-fail-closed__";
}

export function proxy(request: NextRequest): NextResponse {
  const expected = getExpectedToken();
  const isApiRequest = request.nextUrl.pathname.startsWith("/api/");

  if (isApiRequest) {
    // dev fallback: expected === null 이면 검증 skip
    if (expected !== null) {
      const cookie = request.cookies.get(SESSION_COOKIE)?.value;
      if (cookie !== expected) {
        return new NextResponse("Unauthorized", { status: 401 });
      }
    }
    // /api/* 통과 — 쿠키 재발급은 안 함 (이미 보유 중일 것)
    return NextResponse.next();
  }

  // 페이지 응답 — 쿠키 발급/갱신
  const response = NextResponse.next();
  if (expected && expected !== "__missing-token-fail-closed__") {
    response.cookies.set({
      name: SESSION_COOKIE,
      value: expected,
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60 * 24, // 1일. Electron 부팅마다 새 토큰이라 짧아도 충분.
    });
  }
  return response;
}

export const config = {
  // 정적 자원·이미지 최적화는 검증 면제 (성능).
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
