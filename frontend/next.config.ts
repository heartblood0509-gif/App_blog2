import type { NextConfig } from "next";
import path from "node:path";

// §E CSP — production (Electron packaged) 에서만 강제. dev 모드는 우회(§H 리스크 #7).
// Next 16 공식 가이드 "Without Nonces" 패턴(node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md).
const isDev = process.env.NODE_ENV === "development";

// shadcn / framer-motion 은 인라인 스타일을 사용하므로 style-src 에 'unsafe-inline' 필요.
// Next.js 16 자체도 inline bootstrap script 가 있어 nonces 없이는 script-src 에 'unsafe-inline' 필요.
// connect-src 에 http://127.0.0.1:* 를 허용해 packaged 앱이 다른 동적 포트 backend 와 직접 통신 가능.
const cspHeader = `
  default-src 'self';
  script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""};
  style-src 'self' 'unsafe-inline';
  img-src 'self' blob: data:;
  font-src 'self' data:;
  connect-src 'self' http://127.0.0.1:* https://dhwysuflubrnmbapjrxs.supabase.co;
  object-src 'none';
  base-uri 'self';
  form-action 'self';
  frame-ancestors 'none';
`;

const nextConfig: NextConfig = {
  output: "standalone",
  // standalone tracing root 를 monorepo 루트(이 파일의 상위)로 고정.
  // 미설정 시 Next 가 lockfile 을 자동 탐색하다가 git 워크트리(.claude/worktrees/...)
  // 같은 비표준 위치에서 잘못된 상위 루트를 잡아 server.js 경로가 어그러진다.
  outputFileTracingRoot: path.join(__dirname, ".."),
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
