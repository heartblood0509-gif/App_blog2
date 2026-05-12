import { BrowserWindow, shell } from "electron";

const ALLOWED_EXTERNAL_HOSTS = new Set([
  "github.com",
  "raw.githubusercontent.com",
  "playwright.dev",
  "blog.naver.com",
]);

export function applyWindowSecurity(win: BrowserWindow, allowedOrigin: string): void {
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(allowedOrigin) && url !== "about:blank") {
      event.preventDefault();
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (ALLOWED_EXTERNAL_HOSTS.has(u.hostname)) {
        shell.openExternal(url);
      }
    } catch {
      /* ignore malformed url */
    }
    return { action: "deny" };
  });
}
