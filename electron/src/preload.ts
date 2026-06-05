import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

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
interface BlogSplitNavigationEvent {
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
}
interface BlogSplitPasteProbeImage {
  index: number;
  base64: string;
  mimeType?: string;
}
interface BlogSplitPasteProbeResult {
  ok: boolean;
  error?: string;
  steps: Array<{ name: string; ok: boolean; detail: string; skipped?: boolean }>;
  snapshot?: unknown;
}

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  auth: {
    openExternal: (url: string): Promise<boolean> => ipcRenderer.invoke("auth:openExternal", url),
    getDeviceInfo: (): Promise<{
      device_id: string;
      device_name: string;
      platform: string;
      app_version: string;
    }> => ipcRenderer.invoke("auth:getDeviceInfo"),
    getPendingDeepLink: (): Promise<string | null> =>
      ipcRenderer.invoke("auth:getPendingDeepLink"),
    onDeepLink: (cb: (url: string) => void) => {
      const handler = (_: IpcRendererEvent, url: string) => cb(url);
      ipcRenderer.on("auth:deepLink", handler);
      return () => ipcRenderer.removeListener("auth:deepLink", handler);
    },
    getAutoLoginEnabled: (): Promise<boolean> =>
      ipcRenderer.invoke("auth:getAutoLoginEnabled"),
    setAutoLoginEnabled: (enabled: boolean): Promise<boolean> =>
      ipcRenderer.invoke("auth:setAutoLoginEnabled", enabled),
  },
  updater: {
    check: () => ipcRenderer.invoke("updater:check"),
    download: () => ipcRenderer.invoke("updater:download"),
    install: () => ipcRenderer.invoke("updater:install"),
    // 렌더러 마운트 시 현재 업데이트 상태(예: 이미 떠 있어야 할 "새 버전" 알림)를 복원.
    getState: (): Promise<UpdaterStateEvent | null> => ipcRenderer.invoke("updater:getState"),
    onState: (cb: (e: UpdaterStateEvent) => void) => {
      const handler = (_: IpcRendererEvent, e: UpdaterStateEvent) => cb(e);
      ipcRenderer.on("updater:state", handler);
      return () => ipcRenderer.removeListener("updater:state", handler);
    },
    onProgress: (cb: (percent: number) => void) => {
      const handler = (_: IpcRendererEvent, percent: number) => cb(percent);
      ipcRenderer.on("updater:progress", handler);
      return () => ipcRenderer.removeListener("updater:progress", handler);
    },
  },
  // §D busy 추적. opId 는 renderer 가 unique 보장.
  app: {
    startBusy: (opId: string) => ipcRenderer.invoke("app:startBusy", opId),
    endBusy: (opId: string) => ipcRenderer.invoke("app:endBusy", opId),
    isBusy: (): Promise<boolean> => ipcRenderer.invoke("app:isBusy"),
    relaunch: () => ipcRenderer.invoke("app:relaunch"),
  },
  // §H publish 진행 추적. 종료 모달 가드용. busy 와 별도 (자동 발행 / 수동 발행 둘 다 포함).
  publish: {
    start: (opId: string) => ipcRenderer.invoke("publish:start", opId),
    end: (opId: string) => ipcRenderer.invoke("publish:end", opId),
    isActive: (): Promise<boolean> => ipcRenderer.invoke("publish:isActive"),
  },
  blogSplit: {
    open: (url?: string): Promise<{ ok: boolean }> => ipcRenderer.invoke("blogSplit:open", url),
    close: (): Promise<void> => ipcRenderer.invoke("blogSplit:close"),
    isOpen: (): Promise<boolean> => ipcRenderer.invoke("blogSplit:isOpen"),
    getUrl: (): Promise<string> => ipcRenderer.invoke("blogSplit:getUrl"),
    navigate: (
      action: "back" | "forward" | "reload" | "home" | "go",
      url?: string,
    ): Promise<{ ok: boolean; url: string; canGoBack: boolean; canGoForward: boolean }> =>
      ipcRenderer.invoke("blogSplit:navigate", action, url),
    pasteProbe: (input: {
      title?: string;
      content?: string;
      images?: BlogSplitPasteProbeImage[];
    }): Promise<BlogSplitPasteProbeResult> =>
      ipcRenderer.invoke("blogSplit:pasteProbe", input),
    onState: (cb: (open: boolean) => void) => {
      const handler = (_: IpcRendererEvent, open: boolean) => cb(open);
      ipcRenderer.on("blogSplit:state", handler);
      return () => ipcRenderer.removeListener("blogSplit:state", handler);
    },
    onNavigation: (cb: (state: BlogSplitNavigationEvent) => void) => {
      const handler = (_: IpcRendererEvent, state: BlogSplitNavigationEvent) => cb(state);
      ipcRenderer.on("blogSplit:navigation", handler);
      return () => ipcRenderer.removeListener("blogSplit:navigation", handler);
    },
  },
  // §F 설정. 평문 key 는 renderer 로 흐르지 않음 (마스킹만).
  settings: {
    getMasked: (): Promise<{ hasKey: boolean; masked: string | null; encryption_available: boolean }> =>
      ipcRenderer.invoke("settings:getMasked"),
    setGeminiKey: (plaintext: string): Promise<{ ok: boolean; encryption_available: boolean }> =>
      ipcRenderer.invoke("settings:setGeminiKey", plaintext),
    // 유튜브 전용 키(다음 부팅 시 youtube-backend 에 env 시드용). 빈 문자열=지우기.
    setTypecastKey: (plaintext: string): Promise<{ ok: boolean; encryption_available: boolean }> =>
      ipcRenderer.invoke("settings:setTypecastKey", plaintext),
    setFalKey: (plaintext: string): Promise<{ ok: boolean; encryption_available: boolean }> =>
      ipcRenderer.invoke("settings:setFalKey", plaintext),
  },
});
