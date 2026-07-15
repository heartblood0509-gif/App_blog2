import fs from "fs";
import path from "path";
import { paths } from "./paths";
import { spawnDetached, killTree, SpawnedChild } from "./child-utils";
import { waitForUrl } from "./net-utils";

// youtube-backend(쇼츠 생성기)를 두 번째 로컬 백엔드로 띄우는 매니저.
// 블로그 백엔드(PythonManager)와 별개 포트/프로세스. iframe 으로 임베드된다.
export interface YoutubeManagerOptions {
  // API 키 암호화(Fernet) 키 파생용. 재시작 간 동일해야 저장된 키 복호화 가능.
  jwtSecret: string;
  // 데이터/산출물 디렉터리 (userData 하위 — 앱 번들 내부는 쓰기 불가).
  storageDir: string;
  bgmDir: string;
  // 임베드 포트 게이트용 토큰(X-App-Token). blog 백엔드와 동일하게 Electron 이 발급해 주입한다.
  // Next 프록시도 같은 APP_TOKEN 을 백엔드 홉에 실어 보내므로 양쪽이 일치해야 한다.
  appToken: string;
  // 부팅 시 youtube-backend DB 에 시드할 키(없으면 사용자가 임베드된 설정 화면에서 입력).
  geminiApiKey?: string;
  falKey?: string;
  typecastApiKey?: string;
  elevenlabsApiKey?: string;
  // 번들 ffmpeg/ffprobe 경로 (packaged). dev 는 시스템 PATH.
  ffmpegBin?: string;
  ffprobeBin?: string;
}

export class YoutubeManager {
  private child: SpawnedChild | null = null;
  readonly host = "127.0.0.1";
  constructor(readonly port: number, readonly opts: YoutubeManagerOptions) {}

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
      // 로컬 단일 사용자 모드 — 로그인/OAuth/관리자 없이 고정 계정 1개.
      LOCAL_SINGLE_USER: "1",
      // 포트 게이트 토큰 — main.py 가 LOCAL_SINGLE_USER 에서 이 값을 요구(fail-closed).
      APP_TOKEN: this.opts.appToken,
      JWT_SECRET: this.opts.jwtSecret,
      STORAGE_DIR: this.opts.storageDir,
      BGM_DIR: this.opts.bgmDir,
      // R2 비활성(로컬 저장). 빈 값이면 youtube-backend 가 로컬 전용 모드로 동작.
      R2_BUCKET_NAME: "",
      // OAuth 가 없어도 쿠키 secure 플래그 등 참조부 정합 위해 자기 origin 주입.
      BASE_URL: this.baseUrl,
      PYTHONUNBUFFERED: "1",
      PYTHONIOENCODING: "utf-8:replace",
    };
    if (this.opts.geminiApiKey) env.GEMINI_API_KEY = this.opts.geminiApiKey;
    if (this.opts.falKey) env.FAL_KEY = this.opts.falKey;
    if (this.opts.typecastApiKey) env.TYPECAST_API_KEY = this.opts.typecastApiKey;
    if (this.opts.elevenlabsApiKey) env.ELEVENLABS_API_KEY = this.opts.elevenlabsApiKey;
    if (this.opts.ffmpegBin) env.FFMPEG_BIN = this.opts.ffmpegBin;
    if (this.opts.ffprobeBin) env.FFPROBE_BIN = this.opts.ffprobeBin;

    if (paths.isDev) {
      // 전용 venv 가 있으면 그 python 으로, 없으면 시스템 python 으로 폴백.
      const hasVenv = fs.existsSync(paths.youtubeVenvPython);
      const pythonCommand = hasVenv
        ? paths.youtubeVenvPython
        : process.platform === "win32"
          ? "python"
          : "python3";
      this.child = spawnDetached(pythonCommand, ["main.py"], {
        cwd: paths.youtubeBackendCwdDev,
        env,
        // 절대 venv 경로면 shell 불필요. bare 명령일 때만 shell(PATH/.cmd shim 호환).
        shell: !hasVenv,
        label: "yt",
      });
    } else {
      // packaged: 번들된 실행파일이 실제로 있는지(+POSIX 실행권한) 먼저 확인.
      // 없으면 원시 ENOENT 팝업 대신 명확한 에러로 실패시킨다(킬스위치 어긋남/빌드 누락 방어).
      const exe = paths.youtubeBackendExe;
      if (!fs.existsSync(exe)) {
        throw new Error(`[yt] backend executable not found: ${exe}`);
      }
      if (process.platform !== "win32") {
        try {
          fs.accessSync(exe, fs.constants.X_OK);
        } catch {
          throw new Error(`[yt] backend executable not runnable (no +x): ${exe}`);
        }
      }
      this.child = spawnDetached(exe, [], {
        cwd: path.dirname(exe),
        env,
        label: "yt",
      });
    }

    // 무거운 파이썬 의존성(numpy/soundfile/google-genai) 임포트로 부팅이 느릴 수 있어 넉넉히.
    await waitForUrl(`${this.baseUrl}/health`, 90_000);
    console.log(`[yt] healthy on ${this.baseUrl}`);
  }

  async stop(): Promise<void> {
    if (!this.child) return;
    const pid = this.child.pid;
    this.child = null;
    await killTree(pid);
  }
}
