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
