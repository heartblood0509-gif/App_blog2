// 유튜브 백엔드(youtube-backend, 별도 포트 · CORS 없음)로 가는 모든 요청의 단일 same-origin 프록시.
// 브라우저는 /api/youtube/<백엔드 경로> 로 호출 → 이 라우트가 YOUTUBE_BACKEND_URL 로 forward 한다.
// SSE(text/event-stream), multipart 업로드, 영상 Range(206)까지 그대로 패스스루.
//
// 인증은 2-홉:
//   1) Next 입구 미들웨어(proxy.ts)가 /api/* 를 app_session/app_user_session 쿠키로 먼저 검문.
//      렌더러는 쿠키를 보유하므로 통과(외부 curl 은 401).
//   2) 유튜브 백엔드는 LOCAL_SINGLE_USER 로 무인증 — 두 번째 홉은 쿠키 불필요.

export const runtime = "nodejs"; // 스트리밍/멀티파트 패스스루엔 nodejs 런타임 필요.
export const dynamic = "force-dynamic"; // 캐시 금지(SSE·실시간).

// 요청 → upstream 으로 넘기지 않을 hop-by-hop 헤더(undici 가 본문 기준으로 재설정).
const STRIP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
]);

// upstream → 응답에서 제거할 헤더(undici 가 본문을 이미 디코드/재청크함).
const STRIP_RESPONSE_HEADERS = new Set([
  "content-encoding",
  "transfer-encoding",
  "connection",
]);

async function forward(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const base = process.env.YOUTUBE_BACKEND_URL;
  if (!base) {
    return Response.json(
      { error: "YOUTUBE_BACKEND_URL 이 설정되지 않았습니다. 데스크톱 앱에서 실행하세요." },
      { status: 503 },
    );
  }

  // 원본 요청 경로에서 프록시 prefix 만 떼어 그대로 forward 한다.
  // catch-all params(path.join)은 끝 슬래시를 잃어 `/api/jobs/` → `/api/jobs` 가 되고,
  // FastAPI 가 308 로 리다이렉트한다(작업 생성/목록이 끝 슬래시 라우트). pathname 을 쓰면
  // 끝 슬래시와 URL 인코딩이 모두 보존된다.
  const PROXY_PREFIX = "/api/youtube";
  const { path } = await ctx.params;
  const url = new URL(req.url);
  const rest = url.pathname.startsWith(PROXY_PREFIX)
    ? url.pathname.slice(PROXY_PREFIX.length)
    : `/${path.join("/")}`;
  const target = `${base.replace(/\/$/, "")}${rest}${url.search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    if (!STRIP_REQUEST_HEADERS.has(key.toLowerCase())) headers.set(key, value);
  });
  // 임베드 백엔드는 X-App-Token 으로 포트 게이트된다. Electron 이 Next 런타임에 주입한
  // APP_TOKEN 을 백엔드 홉에 동봉한다(브라우저 EventSource/<img> 는 헤더를 못 붙이므로 여기서).
  // 이 프록시가 REST·SSE·미디어·바이너리의 단일 통로라 한 곳 주입으로 전부 커버.
  // 웹 dev(APP_TOKEN 미설정)에선 생략 → 백엔드의 ALLOW_INSECURE_DEV_AUTH 폴백과 짝이 맞는다.
  const appToken = process.env.APP_TOKEN;
  if (appToken) headers.set("x-app-token", appToken);

  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const init: RequestInit & { duplex?: "half" } = {
    method: req.method,
    headers,
    body: hasBody ? req.body : undefined,
    signal: req.signal, // 클라이언트 끊김 → upstream 연결 종료(abort 전파).
    cache: "no-store",
    redirect: "manual",
  };
  if (hasBody) init.duplex = "half"; // Node(undici) 스트리밍 본문 전송 필수.

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (e) {
    if ((e as Error)?.name === "AbortError") {
      return new Response(null, { status: 499 }); // 클라이언트가 연결을 닫음.
    }
    return Response.json(
      { error: "유튜브 백엔드에 연결할 수 없습니다." },
      { status: 502 },
    );
  }

  const respHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!STRIP_RESPONSE_HEADERS.has(key.toLowerCase())) respHeaders.set(key, value);
  });
  // 역프록시/버퍼링 차단 — SSE 가 실시간으로 흐르도록. 일반 응답엔 무해.
  respHeaders.set("X-Accel-Buffering", "no");

  // upstream.body(ReadableStream)를 그대로 패스스루 → 206/Content-Range/Accept-Ranges 보존.
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

export const GET = forward;
export const POST = forward;
export const PUT = forward;
export const PATCH = forward;
export const DELETE = forward;
export const HEAD = forward;
