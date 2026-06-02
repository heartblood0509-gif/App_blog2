import { paths } from "./paths";
import { spawnDetached, killTree, SpawnedChild } from "./child-utils";
import { waitForUrl } from "./net-utils";

export interface NextServerOptions {
  appToken: string;
  sessionToken: string;
  geminiApiKey?: string;
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
    };

    // §F GEMINI_API_KEY — settings.json 에서 복호화한 평문이 있을 때만 주입.
    if (this.opts.geminiApiKey) {
      env.GEMINI_API_KEY = this.opts.geminiApiKey;
    }

    // "유튜브" 탭 iframe 이 가리킬 youtube-backend origin. /api/youtube-url 이 런타임에 반환.
    if (this.opts.youtubeUrl) {
      env.YOUTUBE_BACKEND_URL = this.opts.youtubeUrl;
    }

    if (paths.isDev) {
      this.child = spawnDetached("npx", ["next", "dev", "-p", String(this.port), "-H", this.host], {
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
