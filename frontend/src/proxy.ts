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
import type { ProfilePlan } from "@/lib/auth/types";

const SESSION_COOKIE = "app_session";
const USER_SESSION_COOKIE = "app_user_session";

// 유튜브 프록시 prefix 와, plan 차단에서 예외로 두는 키 관리 통로.
// (키 입력란은 항상 열어둠 — 미결제자도 키 저장/조회는 가능, 기능 사용만 차단.)
const YOUTUBE_PROXY_PREFIX = "/api/youtube/";
const YOUTUBE_KEY_MGMT_PREFIX = "/api/youtube/api/auth/";

interface BasicAuthConfig {
  username: string;
  password: string;
}

function isVercelRuntime(): boolean {
  return process.env.VERCEL === "1" || Boolean(process.env.VERCEL_ENV);
}

function getBasicAuthConfig(): BasicAuthConfig | null {
  const username = process.env.APP_BASIC_AUTH_USER;
  const password = process.env.APP_BASIC_AUTH_PASSWORD;
  if (!username || !password) return null;
  return { username, password };
}

function isBasicAuthValid(request: NextRequest, config: BasicAuthConfig): boolean {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Basic ")) return false;

  try {
    const decoded = atob(authorization.slice("Basic ".length));
    const separator = decoded.indexOf(":");
    if (separator === -1) return false;

    const username = decoded.slice(0, separator);
    const password = decoded.slice(separator + 1);
    return username === config.username && password === config.password;
  } catch {
    return false;
  }
}

function basicAuthChallenge(): NextResponse {
  return new NextResponse("Authentication required", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Blog Pick"',
    },
  });
}

function getExpectedToken(): string | null {
  const t = process.env.APP_SESSION_TOKEN;
  if (t) return t;
  // Vercel 웹 배포는 Electron 이 APP_SESSION_TOKEN 을 주입하지 않는다.
  // 별도 사용자 인증이 생기기 전까지는 API 라우트별 서버 검증에 맡긴다.
  if (isVercelRuntime()) return null;
  // dev fallback
  if (process.env.ALLOW_INSECURE_DEV_AUTH === "1") return null;
  // packaged 빌드에서 env 누락 → 401 일괄 발급 (fail-closed)
  return "__missing-token-fail-closed__";
}

function isUserAuthDisabled(): boolean {
  return (
    process.env.APP_REQUIRE_USER_AUTH === "0" ||
    process.env.ALLOW_INSECURE_DEV_AUTH === "1"
  );
}

function userSessionSecret(): string | null {
  return process.env.APP_USER_SESSION_SECRET || process.env.APP_SESSION_TOKEN || null;
}

function base64urlToArrayBuffer(value: string): ArrayBuffer {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
}

function decodeBase64urlJson(value: string): unknown {
  const buffer = base64urlToArrayBuffer(value);
  const json = new TextDecoder().decode(new Uint8Array(buffer));
  return JSON.parse(json);
}

interface VerifiedUserSession {
  exp: number;
  plan: ProfilePlan | null;
}

// 서명(HMAC-SHA256)·만료를 검증하고 통과 시 payload 를 돌려준다(실패=null).
// 위변조 불가한 서명 안에 plan 클레임이 들어 있어 DB 추가조회 없이 옆문 차단에 쓴다.
async function verifyUserSession(
  cookie: string | undefined,
): Promise<VerifiedUserSession | null> {
  if (!cookie) return null;
  const secret = userSessionSecret();
  if (!secret) return null;

  const [payload, signature] = cookie.split(".");
  if (!payload || !signature) return null;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlToArrayBuffer(signature),
      new TextEncoder().encode(payload),
    );
    if (!ok) return null;

    const decoded = decodeBase64urlJson(payload);
    if (!decoded || typeof decoded !== "object") return null;
    const exp = (decoded as { exp?: unknown }).exp;
    if (typeof exp !== "number" || exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }
    const rawPlan = (decoded as { plan?: unknown }).plan;
    const plan: ProfilePlan | null =
      rawPlan === "blog" || rawPlan === "blog_youtube" ? rawPlan : null;
    return { exp, plan };
  } catch {
    return null;
  }
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  const basicAuth = getBasicAuthConfig();
  if (isVercelRuntime() && basicAuth && !isBasicAuthValid(request, basicAuth)) {
    return basicAuthChallenge();
  }

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
    const isAuthApi = request.nextUrl.pathname.startsWith("/api/auth/");
    if (!isAuthApi && !isUserAuthDisabled()) {
      const userCookie = request.cookies.get(USER_SESSION_COOKIE)?.value;
      const session = await verifyUserSession(userCookie);
      if (!session) {
        return new NextResponse("User authentication required", { status: 401 });
      }

      // 옆문 차단: 유튜브 미결제자(plan==='blog')는 유튜브 기능 API 직접 호출 차단.
      // 키 관리 통로(/api/youtube/api/auth/*)는 예외로 통과(키 입력란 열어둠 요구와 정합).
      // 명시적 'blog' 만 차단 — plan 없음/null/blog_youtube 는 통과(기본 허용).
      const { pathname } = request.nextUrl;
      if (
        session.plan === "blog" &&
        pathname.startsWith(YOUTUBE_PROXY_PREFIX) &&
        !pathname.startsWith(YOUTUBE_KEY_MGMT_PREFIX)
      ) {
        return new NextResponse("YouTube plan required", { status: 403 });
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
