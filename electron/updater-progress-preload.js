"use strict";

const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  onProgress: (cb) => {
    if (typeof cb !== "function") return () => {};
    const handler = (_event, payload) => {
      try { cb(payload); } catch { /* ignore */ }
    };
    ipcRenderer.on("progress", handler);
    return () => ipcRenderer.removeListener("progress", handler);
  },
  cancel: () => {
    ipcRenderer.send("updater:cancel");
  },
});
