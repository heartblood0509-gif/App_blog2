import path from "path";
import { paths } from "./paths";
import { spawnDetached, killTreeWindows, SpawnedChild } from "./child-utils";
import { waitForUrl } from "./net-utils";

export interface PythonManagerOptions {
  appToken: string;
  frontendOrigin: string;
  credentialBrokerUrl?: string;
}

export class PythonManager {
  private child: SpawnedChild | null = null;
  readonly host = "127.0.0.1";
  constructor(readonly port: number, readonly opts: PythonManagerOptions) {}

  get baseUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  get pid(): number | undefined {
    return this.child?.pid;
  }

  async start(): Promise<void> {
    const env: NodeJS.ProcessEnv = {
      ...process.env,
      PORT: String(this.port),
      HOST: this.host,
      APP_DATA_DIR: paths.userData,
      CHROME_PROFILES_DIR: path.join(paths.userData, "chrome-profiles"),
      PLAYWRIGHT_BROWSERS_PATH: paths.playwrightBrowsers,
      PLAYWRIGHT_TMPDIR: path.join(paths.userData, "tmp"),
      PYTHONUNBUFFERED: "1",
      // Windows 한국어 로케일에서 PyInstaller frozen exe 의 sys.stdout 기본값이
      // cp949 라 이모지·일부 유니코드 출력 시 UnicodeEncodeError. stdin/stdout/stderr
      // 만 UTF-8 로 강제하고 encode 불가 시 ? 로 대체 (open() 기본은 건드리지 않음).
      PYTHONIOENCODING: "utf-8:replace",
      // §A-1 백엔드 토큰.
      APP_TOKEN: this.opts.appToken,
      // §B CORS — 정확한 frontend origin 만 허용.
      FRONTEND_ORIGIN: this.opts.frontendOrigin,
    };

    // §C credential broker URL — Electron credential-broker 가 띄워졌을 때만 주입.
    if (this.opts.credentialBrokerUrl) {
      env.APP_CREDENTIAL_BROKER_URL = this.opts.credentialBrokerUrl;
    }

    if (paths.isDev) {
      const pythonCommand = process.platform === "win32" ? "python" : "python3";
      this.child = spawnDetached(pythonCommand, ["main.py"], {
        cwd: paths.backendCwdDev,
        env,
        shell: true, // python.cmd / python.exe shim 모두 호환
        label: "py",
      });
    } else {
      this.child = spawnDetached(paths.backendExe, [], {
        cwd: path.dirname(paths.backendExe),
        env,
        label: "py",
      });
    }

    await waitForUrl(`${this.baseUrl}/health`, 30_000);
    console.log(`[py] healthy on ${this.baseUrl}`);
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    const pid = this.child.pid;
    this.child = null;
    await killTreeWindows(pid);
  }
}
