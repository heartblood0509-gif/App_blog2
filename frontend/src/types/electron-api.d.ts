// 단일 window.electronAPI 타입 선언.
// 모든 컴포넌트/훅은 여기 정의를 공유한다 (busy.ts, UpdaterModal.tsx, SettingsModal.tsx 등).
//
// declare global 중복으로 인한 타입 충돌 방지.

type UpdaterState =
  | "idle"
  | "checking"
  | "available"
  | "none"
  | "downloading"
  | "downloaded"
  | "error"
  | "blocked-busy";

interface UpdaterStateEvent {
  s: UpdaterState;
  p?: unknown;
}

interface ElectronUpdaterApi {
  check: () => Promise<unknown>;
  download: () => Promise<boolean>;
  install: () => Promise<boolean>;
  getState: () => Promise<UpdaterStateEvent | null>;
  onState: (cb: (e: UpdaterStateEvent) => void) => () => void;
  onProgress: (cb: (percent: number) => void) => () => void;
}

interface ElectronAppApi {
  startBusy: (opId: string) => Promise<void>;
  endBusy: (opId: string) => Promise<void>;
  isBusy: () => Promise<boolean>;
  relaunch: () => Promise<void>;
  openLogsFolder: () => Promise<{ ok: boolean; error?: string; path: string }>;
  openDataFolder: () => Promise<{ ok: boolean; error?: string; path: string }>;
  openTtsPreviewFolder: () => Promise<{ ok: boolean; error?: string; path: string }>;
}

interface ElectronPublishApi {
  start: (opId: string) => Promise<void>;
  end: (opId: string) => Promise<void>;
  isActive: () => Promise<boolean>;
}

interface ElectronBlogSplitApi {
  open: (url?: string) => Promise<{ ok: boolean }>;
  close: () => Promise<void>;
  isOpen: () => Promise<boolean>;
  getUrl: () => Promise<string>;
  getZoom: () => Promise<number>;
  setZoom: (factor: number) => Promise<number>;
  navigate: (
    action: "back" | "forward" | "reload" | "home" | "go",
    url?: string,
  ) => Promise<{
    ok: boolean;
    url: string;
    canGoBack: boolean;
    canGoForward: boolean;
  }>;
  pasteProbe: (input: {
    title?: string;
    content?: string;
    images?: Array<{ index: number; base64: string; mimeType?: string }>;
    // dev-only: BlogContentRenderer 와 같은 규칙으로 frontend 에서 계산한 블록 스냅샷.
    // main 의 parsePasteBlocks 결과와 비교해 분기 차이를 즉시 발견하는 진단용.
    // text block 은 lineCount/first/last 만 담아 log 폭증을 피한다.
    frontendBlocks?: Array<{ type: string; detail?: string }>;
  }) => Promise<{
    ok: boolean;
    error?: string;
    steps: Array<{ name: string; ok: boolean; detail: string; skipped?: boolean }>;
    snapshot?: unknown;
  }>;
  onState: (cb: (open: boolean) => void) => () => void;
  onNavigation: (
    cb: (state: {
      url: string;
      canGoBack: boolean;
      canGoForward: boolean;
    }) => void,
  ) => () => void;
  // 우측 블로그 뷰에서 단어 찾기(Chromium 네이티브 find-in-page).
  find: (
    text: string,
    options?: { forward?: boolean; findNext?: boolean },
  ) => Promise<number>;
  stopFind: () => Promise<void>;
  focusView: () => Promise<void>;
  setFindBarHeight: (px: number) => Promise<void>;
  onFound: (
    cb: (state: {
      requestId: number;
      activeMatchOrdinal: number;
      matches: number;
      finalUpdate: boolean;
    }) => void,
  ) => () => void;
  onOpenFind: (cb: () => void) => () => void;
  onFindReset: (cb: () => void) => () => void;
}

interface ElectronSettingsApi {
  getMasked: () => Promise<{
    hasKey: boolean;
    masked: string | null;
    encryption_available: boolean;
  }>;
  setGeminiKey: (plaintext: string) => Promise<{
    ok: boolean;
    encryption_available: boolean;
  }>;
  // Typecast: 유튜브 전용 키(다음 부팅 시 youtube-backend 에 env 시드용). 빈 문자열=지우기.
  setTypecastKey: (plaintext: string) => Promise<{
    ok: boolean;
    encryption_available: boolean;
  }>;
  // ElevenLabs: 유튜브 전용 키(다음 부팅 시 youtube-backend 에 env 시드용). 빈 문자열=지우기.
  setElevenLabsKey: (plaintext: string) => Promise<{
    ok: boolean;
    encryption_available: boolean;
  }>;
  // fal: 블로그 이미지(fal 우선) + 유튜브 공용 키. 빈 문자열=지우기.
  setFalKey: (plaintext: string) => Promise<{
    ok: boolean;
    encryption_available: boolean;
  }>;
  getFalMasked: () => Promise<{
    hasKey: boolean;
    masked: string | null;
    encryption_available: boolean;
  }>;
  // OpenAI 키 (ChatGPT 모드). 빈 문자열=지우기.
  setOpenAIKey: (plaintext: string) => Promise<{
    ok: boolean;
    encryption_available: boolean;
  }>;
  getOpenAIMasked: () => Promise<{
    hasKey: boolean;
    masked: string | null;
    encryption_available: boolean;
  }>;
  // AI 제공자 토글 + OpenAI 텍스트 모델.
  getAiProvider: () => Promise<{
    provider: "gemini" | "openai";
    imageProvider?: "gemini" | "openai";
    openaiTextModel: "gpt-5.4-mini" | "gpt-5.5";
  }>;
  setAiProvider: (cfg: {
    provider?: "gemini" | "openai";
    imageProvider?: "gemini" | "openai";
    openaiTextModel?: "gpt-5.4-mini" | "gpt-5.5";
  }) => Promise<{
    ok: boolean;
    provider: "gemini" | "openai";
    imageProvider?: "gemini" | "openai";
    openaiTextModel: "gpt-5.4-mini" | "gpt-5.5";
  }>;
}

interface ElectronAuthDeviceInfo {
  device_id: string;
  device_name: string;
  platform: string;
  app_version: string;
}

interface ElectronAuthApi {
  openExternal: (url: string) => Promise<boolean>;
  getDeviceInfo: () => Promise<ElectronAuthDeviceInfo>;
  getPendingDeepLink: () => Promise<string | null>;
  onDeepLink: (cb: (url: string) => void) => () => void;
  getAutoLoginEnabled: () => Promise<boolean>;
  setAutoLoginEnabled: (enabled: boolean) => Promise<boolean>;
}

interface ElectronMediaApi {
  // 렌더러 File → OS 절대경로(webUtils). 실패/비파일이면 "". 카드 B 선트림 업로드의 경로 임포트용.
  getPathForFile: (file: File) => string;
}

interface ElectronAPI {
  platform: NodeJS.Platform;
  auth: ElectronAuthApi;
  updater: ElectronUpdaterApi;
  app: ElectronAppApi;
  publish: ElectronPublishApi;
  blogSplit: ElectronBlogSplitApi;
  settings: ElectronSettingsApi;
  // 구버전 데스크톱 앱엔 없을 수 있어 옵셔널 — 없으면 프론트가 웹 업로드로 폴백.
  media?: ElectronMediaApi;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
