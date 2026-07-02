import type { NextConfig } from "next";
import path from "node:path";

// §E CSP — production (Electron packaged) 에서만 강제. dev 모드는 우회(§H 리스크 #7).
// Next 16 공식 가이드 "Without Nonces" 패턴(node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
const isDev = process.env.NODE_ENV === "development";

// shadcn / framer-motion 은 인라인 스타일을 사용하므로 style-src 에 'unsafe-inline' 필요.
// Next.js 16 자체도 inline bootstrap script 가 있어 nonces 없이는 script-src 에 'unsafe-inline' 필요.
// connect-src 에 http://127.0.0.1:* 를 허용해 packaged 앱이 다른 동적 포트 backend 와 직접 통신 가능.
// Supabase 는 REST(https)뿐 아니라 Realtime 이 wss://<proj>.supabase.co/realtime/v1 로 붙는다.
// CSP 는 https:// 와 wss:// 를 다른 스킴으로 취급하므로 wss 출처를 명시하지 않으면 realtime
// WebSocket 이 차단돼 구독이 TIMED_OUT 된다(REST 는 되는데 실시간만 죽는 프로덕션 전용 버그).
// media-src 에 blob: 필요 — TTS 샘플 미리듣기가 응답을 Blob→objectURL(blob:)로 <audio> 재생한다.
// 없으면 default-src 'self' 로 폴백돼 blob 오디오가 차단된다(dev 는 CSP 미적용이라 안 드러나고
// 패키지 빌드에서만 'no supported source' 로 실패 → 프로덕션 전용 버그).
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
  media-src 'self' blob: data:;
  font-src 'self' data:;
  connect-src 'self' http://127.0.0.1:* https://dhwysuflubrnmbapjrxs.supabase.co wss://dhwysuflubrnmbapjrxs.supabase.co;
  frame-src 'self' http://127.0.0.1:*;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
`;

const nextConfig: NextConfig = {
  output: "standalone",
  // 끝 슬래시 자동 리다이렉트(308) 비활성화. 유튜브 프록시가 백엔드의 끝 슬래시 라우트
  // (`/api/jobs/` 생성·목록 등)를 그대로 전달해야 하는데, Next 기본값은 인바운드에서
  // `/api/youtube/api/jobs/` → `/api/youtube/api/jobs` 로 308 리다이렉트해 끝 슬래시를 잃는다.
  // 끄면 프록시 핸들러가 원본 pathname(끝 슬래시 포함)을 받아 백엔드에 정확히 forward 한다.
  skipTrailingSlashRedirect: true,
  // standalone tracing root 를 monorepo 루트(이 파일의 상위)로 고정.
  // 미설정 시 Next 가 lockfile 을 자동 탐색하다가 git 워크트리(.claude/worktrees/...)
  // 같은 비표준 위치에서 잘못된 상위 루트를 잡아 server.js 경로가 어그러진다.
  outputFileTracingRoot: path.join(__dirname, ".."),
  experimental: {
    // Next.js 16 기본 10MB 제한에 걸려 /api/publish 가 502 발생(이미지 12장 base64 → 10MB+).
    // proxy.ts 가 본문 버퍼링하므로 라우트 segment config 가 아니라 여기서 키워야 함.
    // (Next 16에서 middlewareClientMaxBodySize → proxyClientMaxBodySize 로 이름 변경.)
    proxyClientMaxBodySize: "100mb",
  },
  async headers() {
    if (isDev) return [];
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: cspHeader.replace(/\s{2,}/g, " ").trim(),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
