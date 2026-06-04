import { BrowserWindow, shell } from "electron";

const ALLOWED_EXTERNAL_HOSTS = new Set([
  "github.com",
  "raw.githubusercontent.com",
  "playwright.dev",
  "blog.naver.com",
  // youtube-backend(쇼츠 생성기) 설정/BGM 화면의 외부 링크 (target=_blank). (B3)
  "aistudio.google.com", // Gemini API 키 발급
  "fal.ai", // FAL 영상 생성 키/대시보드
  "typecast.ai", // Typecast TTS API
  "studio.youtube.com", // YouTube 오디오 보관함
]);

/**
 * @param allowedOrigin  최상위 프레임이 머물러야 하는 origin (Next 앱).
 * @param extraNavOrigins  추가로 네비게이션을 허용할 origin (예: youtube-backend iframe).
 *   초기 iframe src 로드는 보통 will-navigate 를 발생시키지 않지만, 방어적으로 허용한다.
 */
export function applyWindowSecurity(
  win: BrowserWindow,
  allowedOrigin: string,
  extraNavOrigins: string[] = [],
): void {
  win.webContents.on("will-navigate", (event, url) => {
    const allowed =
      url === "about:blank" ||
      url.startsWith(allowedOrigin) ||
      extraNavOrigins.some((o) => o && url.startsWith(o));
    if (!allowed) {
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
