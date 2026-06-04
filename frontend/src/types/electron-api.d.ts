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
  onState: (cb: (e: UpdaterStateEvent) => void) => () => void;
  onProgress: (cb: (percent: number) => void) => () => void;
}

interface ElectronAppApi {
  startBusy: (opId: string) => Promise<void>;
  endBusy: (opId: string) => Promise<void>;
  isBusy: () => Promise<boolean>;
  relaunch: () => Promise<void>;
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
  // 유튜브 전용 키(다음 부팅 시 youtube-backend 에 env 시드용). 빈 문자열=지우기.
  setTypecastKey: (plaintext: string) => Promise<{
    ok: boolean;
    encryption_available: boolean;
  }>;
  setFalKey: (plaintext: string) => Promise<{
    ok: boolean;
    encryption_available: boolean;
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

interface ElectronAPI {
  platform: NodeJS.Platform;
  auth: ElectronAuthApi;
  updater: ElectronUpdaterApi;
  app: ElectronAppApi;
  publish: ElectronPublishApi;
  blogSplit: ElectronBlogSplitApi;
  settings: ElectronSettingsApi;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};
