import fs from "fs";
import path from "path";
import { paths } from "./paths";
import { spawnDetached, killTree, SpawnedChild } from "./child-utils";
import { waitForUrl } from "./net-utils";

export interface NextServerOptions {
  appToken: string;
  sessionToken: string;
  geminiApiKey?: string;
  openaiApiKey?: string;
  // fal 키 — 블로그 이미지(fal 우선) + 유튜브 공용. 키 변경은 재시작 후 반영(Gemini 키와 동일).
  falKey?: string;
  // provider/모델은 부팅 env 가 아니라, Next 가 매 요청 읽는 파일 경로로 전달(즉시 전환).
  aiProviderConfigPath?: string;
  // youtube-backend(쇼츠 생성기) origin — "유튜브" 탭 iframe src 로 클라이언트에 노출.
  youtubeUrl?: string;
}

export class NextServerManager {
  private child: SpawnedChild | null = null;
  readonly host = "127.0.0.1";
  constructor(
    readonly port: number,
    readonly backendUrl: string,
    readonly opts: NextServerOptions,
  ) {}

  get url(): string {
    return `http://${this.host}:${this.port}`;
  }

  get pid(): number | undefined {
    return this.child?.pid;
  }

  async start(): Promise<void> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(this.port),
      HOSTNAME: this.host,
      BACKEND_URL: this.backendUrl,
      // §A-1 backendFetch 헬퍼가 백엔드 호출 시 첨부.
      APP_TOKEN: this.opts.appToken,
      // §A-2 Next proxy.ts 가 Set-Cookie + /api/* 검증에 사용.
      APP_SESSION_TOKEN: this.opts.sessionToken,
      // 서버측 키 리졸버(gemini/openai/fal-key)가 "env(앱 금고 주입) vs .local 파일"
      // 우선순위를 가르는 마커. Electron 에선 settings.json→env 가 정본이라 env 우선.
      APP_RUNTIME: "electron",
    };

    // §F GEMINI_API_KEY — settings.json 에서 복호화한 평문이 있을 때만 주입.
    if (this.opts.geminiApiKey) {
      env.GEMINI_API_KEY = this.opts.geminiApiKey;
    }

    // 블로그 ChatGPT 모드 — OpenAI 키는 부팅 시 env 로 주입(키 변경은 재시작 후 반영).
    if (this.opts.openaiApiKey) {
      env.OPENAI_API_KEY = this.opts.openaiApiKey;
    }
    // fal 키 — 블로그 이미지(fal 우선)가 getServerFalKey()로 읽는다. 유튜브와 공용 키.
    if (this.opts.falKey) {
      env.FAL_API_KEY = this.opts.falKey;
    }
    // provider/모델은 userData 의 파일 경로만 알려준다. Next 가 매 요청 이 파일을 읽어
    // 토글이 재시작 없이 즉시 반영된다.
    if (this.opts.aiProviderConfigPath) {
      env.AI_PROVIDER_CONFIG_PATH = this.opts.aiProviderConfigPath;
    }

    // 유튜브 탭의 같은-origin 프록시(/api/youtube/[...path] → youtube-backend-fetch)가
    // 런타임에 읽는 youtube-backend origin. (구 iframe 의 /api/youtube-url 은 M5 에서 제거됨.)
    if (this.opts.youtubeUrl) {
      env.YOUTUBE_BACKEND_URL = this.opts.youtubeUrl;
    }

    if (paths.isDev) {
      // 워크트리 dev 에서 frontend/node_modules 를 메인에서 빌려온(symlink) 경우 Turbopack 이
      // 거부하므로 webpack 으로 폴백한다. (dev-worktree.js 웹 모드의 spawnFrontend 와 동일한 처리)
      const devArgs = ["next", "dev", "-p", String(this.port), "-H", this.host];
      try {
        if (fs.lstatSync(path.join(paths.frontendCwdDev, "node_modules")).isSymbolicLink()) {
          devArgs.push("--webpack");
        }
      } catch {
        /* node_modules 없음 — 무시 */
      }
      this.child = spawnDetached("npx", devArgs, {
        cwd: paths.frontendCwdDev,
        env,
        shell: true,
        label: "next",
      });
    } else {
      // production: standalone server.js 를 Electron 자체 Node 로 fork
      this.child = spawnDetached(process.execPath, [paths.frontendStandaloneServer], {
        cwd: undefined,
        env: { ...env, ELECTRON_RUN_AS_NODE: "1" },
        label: "next",
      });
    }

    await waitForUrl(this.url, 60_000);
    console.log(`[next] ready on ${this.url}`);
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    const pid = this.child.pid;
    this.child = null;
    await killTree(pid);
  }
}
