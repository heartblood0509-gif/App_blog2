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

contextBridge.exposeInMainWorld("electronAPI", {
  updater: {
    check: () => ipcRenderer.invoke("updater:check"),
    download: () => ipcRenderer.invoke("updater:download"),
    install: () => ipcRenderer.invoke("updater:install"),
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
  // §F 설정. 평문 key 는 renderer 로 흐르지 않음 (마스킹만).
  settings: {
    getMasked: (): Promise<{ hasKey: boolean; masked: string | null; encryption_available: boolean }> =>
      ipcRenderer.invoke("settings:getMasked"),
    setGeminiKey: (plaintext: string): Promise<{ ok: boolean; encryption_available: boolean }> =>
      ipcRenderer.invoke("settings:setGeminiKey", plaintext),
  },
});
