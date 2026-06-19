import {
  app,
  BrowserWindow,
  WebContentsView,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  powerMonitor,
  screen,
  shell,
  type NativeImage,
  type Rectangle,
  type WebFrameMain,
} from "electron";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import log from "electron-log";
import { paths } from "./paths";
import { applyWindowSecurity } from "./security";
import { getFreePort, getPreferredOrFreePort } from "./net-utils";
import { PythonManager } from "./python-manager";
import { YoutubeManager } from "./youtube-manager";
import { YOUTUBE_FEATURE_ENABLED } from "./youtube-feature";
import { NextServerManager } from "./next-server";
import { initJobObject, assignToJob, closeJobObject } from "./job-object";
import { initUpdater, tryInstallNow } from "./updater";
import { CredentialBroker } from "./credential-broker";
import { redactTransform } from "./log-redactor";
import {
  getAutoLoginEnabled,
  getDeviceInfo,
  getOrCreateYoutubeJwtSecret,
  loadFalKey,
  loadFrontendPort,
  loadGeminiApiKey,
  loadOpenAIApiKey,
  aiProviderConfigPath,
  loadTypecastApiKey,
  registerSettingsIpc,
  saveFrontendPort,
  setAutoLoginEnabled,
} from "./settings";

// §G — userData/logs/main.log 로 회전 저장 + redaction.
log.transports.file.resolvePathFn = () =>
  path.join(app.getPath("userData"), "logs", "main.log");
log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.file.format = "[{y}-{m}-{d} {h}:{i}:{s}.{ms}] [{level}] {text}";
// transforms: 각 message 의 인자 배열에서 토큰/PW 마스킹.
log.hooks.push((message) => redactTransform(message));
Object.assign(console, log.functions);

let mainWindow: BrowserWindow | null = null;
let blogSplitView: WebContentsView | null = null;
let python: PythonManager | null = null;
let youtube: YoutubeManager | null = null;
let nextSrv: NextServerManager | null = null;
let broker: CredentialBroker | null = null;
let isQuitting = false;
// before-quit 모달에서 "종료" 선택 시 true. 재진입 시 모달 우회.
let forceQuit = false;

// §D — busy 상태. operation id 기반 Set 으로 idempotent. boolean 카운터 아님.
const busyOps = new Set<string>();
// §H — 발행 진행 상태. busyOps 와 별도. 종료 모달 가드용.
const publishingOps = new Set<string>();
let installPending = false;
const AUTH_PROTOCOL = "com.heartblood.appblog2";
let pendingAuthDeepLink: string | null = null;

// §I — 각 stop() 5초, 전체 셧다운 10초 한도. 하나라도 hang 되면 강제 KILL 폴백.
const STOP_TIMEOUT_MS = 5_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

function withTimeout<T>(p: Promise<T> | undefined, ms: number, label: string): Promise<T | "timeout"> {
  if (!p) return Promise.resolve("timeout" as const);
  return new Promise<T | "timeout">((resolve) => {
    const timer = setTimeout(() => {
      console.warn(`[shutdown] ${label} stop() timeout after ${ms}ms`);
      resolve("timeout");
    }, ms);
    p.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => {
        clearTimeout(timer);
        console.warn(`[shutdown] ${label} stop() error:`, e);
        resolve("timeout");
      },
    );
  });
}

function endBusy(opId: string): void {
  const wasBusy = busyOps.size > 0;
  busyOps.delete(opId);
  // 마지막 busy 가 빠진 transition 일 때 pending 된 install 자동 시도
  if (wasBusy && busyOps.size === 0 && installPending) {
    installPending = false;
    if (mainWindow) tryInstallNow(mainWindow);
  }
}

export function isAppBusy(): boolean {
  return busyOps.size > 0;
}

export function listBusyOps(): string[] {
  return Array.from(busyOps);
}

export function setInstallPending(v: boolean): void {
  installPending = v;
}

// app.getVersion() 은 dev 모드에서 Electron 프레임워크 버전(예: 33.4.11)을 반환하는
// 알려진 동작이 있어, 사용자 친화 타이틀("Blog Pick v0.2.3")을 위해 package.json 을
// 직접 읽는다. prod 빌드(app.asar 내부)에서도 `../../package.json` 경로가 유효하므로
// dev/prod 양쪽에서 같은 결과.
function getAppVersion(): string {
  try {
    const pkgPath = path.join(__dirname, "..", "..", "package.json");
    const data = JSON.parse(fs.readFileSync(pkgPath, "utf-8")) as { version?: string };
    if (typeof data?.version === "string" && data.version.length > 0) return data.version;
  } catch { /* fall through */ }
  return app.getVersion();
}

function getInitialWindowBounds(): { width: number; height: number } {
  const { width: workAreaWidth, height: workAreaHeight } = screen.getPrimaryDisplay().workAreaSize;
  return {
    width: Math.min(1920, workAreaWidth),
    height: Math.min(1080, workAreaHeight),
  };
}

const BLOG_SPLIT_DEFAULT_URL = "https://blog.naver.com";
const BLOG_SPLIT_NAVER_HOME_URL = "https://www.naver.com";
const BLOG_SPLIT_TOOLBAR_HEIGHT = 44;
// 찾기 막대가 열리면 그 높이만큼 블로그 뷰를 더 아래로 내린다(찾기 막대가
// 네이티브 뷰에 가려지지 않도록). 실제 픽셀은 렌더러가 렌더된 막대를 측정해
// blogSplit:setFindBarHeight 로 넘겨주므로 양쪽에 같은 상수를 중복하지 않는다.
let blogSplitFindBarHeight = 0;
const BLOG_SPLIT_ALLOWED_HOSTS = new Set([
  "naver.com",
  "www.naver.com",
  "m.naver.com",
  "blog.naver.com",
  "section.blog.naver.com",
  "m.blog.naver.com",
  "nid.naver.com",
]);

function parseAllowedBlogSplitUrl(value: string): URL | null {
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    if (!BLOG_SPLIT_ALLOWED_HOSTS.has(parsed.hostname)) {
      return null;
    }
    parsed.protocol = "https:";
    return parsed;
  } catch {
    return null;
  }
}

function normalizeBlogSplitUrl(value?: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return BLOG_SPLIT_DEFAULT_URL;
  }
  const parsed = parseAllowedBlogSplitUrl(value);
  if (!parsed) {
    return BLOG_SPLIT_DEFAULT_URL;
  }
  return parsed.toString();
}

function getBlogSplitBounds(): Rectangle | null {
  if (!mainWindow || mainWindow.isDestroyed()) return null;
  const { width, height } = mainWindow.getContentBounds();
  const leftWidth = Math.floor(width / 2);
  const topOffset = BLOG_SPLIT_TOOLBAR_HEIGHT + blogSplitFindBarHeight;
  return {
    x: leftWidth,
    y: topOffset,
    width: Math.max(0, width - leftWidth),
    height: Math.max(0, height - topOffset),
  };
}

function notifyBlogSplitState(open: boolean): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("blogSplit:state", open);
}

// 네이버 페이지(BrowserView)의 스크롤바를 항상 보이게 강제.
// 기본은 macOS 오버레이 스크롤바라 멈추면 사라진다 → ::-webkit-scrollbar 를
// 직접 지정하면 클래식(상시 노출) 스크롤바로 전환된다. 가로/세로 모두 적용.
const BLOG_SPLIT_SCROLLBAR_CSS = `
  ::-webkit-scrollbar { width: 12px; height: 12px; }
  ::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.32);
    border-radius: 6px;
    border: 3px solid transparent;
    background-clip: padding-box;
  }
  ::-webkit-scrollbar-thumb:hover { background: rgba(0, 0, 0, 0.5); background-clip: padding-box; }
  ::-webkit-scrollbar-track { background: transparent; }
`;

// 새 문서를 로드하면 insertCSS 가 초기화되므로 매 로드마다 다시 주입한다.
function injectBlogSplitScrollbarCss(): void {
  if (!isBlogSplitOpen()) return;
  blogSplitView!.webContents.insertCSS(BLOG_SPLIT_SCROLLBAR_CSS).catch(() => {});
}

// 우측 패널 줌 배율(1 = 100%). 컴퓨터에 익숙하지 않은 사용자도 툴바 +/- 로
// 확대·축소할 수 있게 한다. 페이지를 이동해도 유지되도록 값을 보관하고
// 매 로드(did-finish-load)마다 다시 적용한다.
const BLOG_SPLIT_ZOOM_MIN = 0.5;
const BLOG_SPLIT_ZOOM_MAX = 2;
let blogSplitZoomFactor = 1;

function applyBlogSplitZoom(): void {
  if (!isBlogSplitOpen()) return;
  blogSplitView!.webContents.setZoomFactor(blogSplitZoomFactor);
}

function setBlogSplitZoom(factor: number): number {
  blogSplitZoomFactor = Math.min(
    BLOG_SPLIT_ZOOM_MAX,
    Math.max(BLOG_SPLIT_ZOOM_MIN, Math.round(factor * 100) / 100),
  );
  applyBlogSplitZoom();
  return blogSplitZoomFactor;
}

function notifyBlogSplitNavigation(): void {
  if (!mainWindow || mainWindow.isDestroyed() || !isBlogSplitOpen()) return;
  const contents = blogSplitView!.webContents;
  mainWindow.webContents.send("blogSplit:navigation", {
    url: contents.getURL(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
  });
}

function isBlogSplitOpen(): boolean {
  return Boolean(blogSplitView && !blogSplitView.webContents.isDestroyed());
}

// 우측 블로그 뷰에서 단어 찾기(Chromium 네이티브 find-in-page).
// 빈 검색어는 findInPage 가 허용하지 않으므로 하이라이트만 지운다.
// 반환하는 requestId 로 렌더러가 늦게 도착한 옛 검색 결과(stale)를 걸러낸다.
function findInBlogSplit(text: unknown, options: unknown): number {
  if (!isBlogSplitOpen()) return 0;
  const query = typeof text === "string" ? text : String(text ?? "");
  const contents = blogSplitView!.webContents;
  if (query.length === 0) {
    contents.stopFindInPage("clearSelection");
    return 0;
  }
  const opts = (options ?? {}) as { forward?: unknown; findNext?: unknown };
  return contents.findInPage(query, {
    forward: opts.forward !== false,
    findNext: Boolean(opts.findNext),
    matchCase: false,
  });
}

function stopBlogSplitFind(): void {
  if (!isBlogSplitOpen()) return;
  blogSplitView!.webContents.stopFindInPage("clearSelection");
}

function focusBlogSplitView(): void {
  if (!isBlogSplitOpen()) return;
  blogSplitView!.webContents.focus();
}

function getBlogSplitUrl(): string {
  if (!isBlogSplitOpen()) return "";
  return blogSplitView!.webContents.getURL();
}

function layoutBlogSplitView(): void {
  if (!blogSplitView || blogSplitView.webContents.isDestroyed()) return;
  const bounds = getBlogSplitBounds();
  if (bounds) blogSplitView.setBounds(bounds);
}

function applyBlogSplitSecurity(view: WebContentsView): void {
  view.webContents.on("will-navigate", (event, url) => {
    const parsed = parseAllowedBlogSplitUrl(url);
    if (!parsed) {
      event.preventDefault();
      return;
    }
    if (parsed.toString() !== url) {
      event.preventDefault();
      view.webContents.loadURL(parsed.toString()).catch(() => {});
    }
  });
  view.webContents.setWindowOpenHandler(({ url }) => {
    const parsed = parseAllowedBlogSplitUrl(url);
    if (parsed) {
      view.webContents.loadURL(parsed.toString()).catch(() => {});
    }
    return { action: "deny" };
  });
}

async function openBlogSplitView(url?: unknown): Promise<{ ok: boolean }> {
  if (!mainWindow || mainWindow.isDestroyed()) return { ok: false };

  if (!isBlogSplitOpen()) {
    blogSplitView = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        sandbox: true,
        nodeIntegration: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
      },
    });
    applyBlogSplitSecurity(blogSplitView);
    blogSplitView.webContents.on("did-navigate", notifyBlogSplitNavigation);
    blogSplitView.webContents.on("did-navigate-in-page", notifyBlogSplitNavigation);
    // 페이지를 이동하면 기존 하이라이트가 사라지므로 렌더러 카운터도 0으로 되돌린다.
    blogSplitView.webContents.on("did-navigate", () => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("blogSplit:findReset");
      }
    });
    // find-in-page 결과를 렌더러로 전달. requestId 로 stale 판별, finalUpdate 로 확정.
    blogSplitView.webContents.on("found-in-page", (_e, result) => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      mainWindow.webContents.send("blogSplit:foundInPage", {
        requestId: result.requestId,
        activeMatchOrdinal: result.activeMatchOrdinal,
        matches: result.matches,
        finalUpdate: result.finalUpdate,
      });
    });
    // 블로그 뷰에 포커스가 있을 때의 Cmd/Ctrl+F 는 keydown 이 렌더러로 가지 않으므로
    // 여기서 가로채 렌더러에 찾기 막대를 열라고 알린다(포커스도 앱 쪽으로 넘김).
    blogSplitView.webContents.on("before-input-event", (event, input) => {
      if (
        input.type === "keyDown" &&
        (input.meta || input.control) &&
        input.key.toLowerCase() === "f"
      ) {
        event.preventDefault();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.focus();
          mainWindow.webContents.send("blogSplit:openFind");
        }
      }
    });
    blogSplitView.webContents.on("did-finish-load", () => {
      notifyBlogSplitNavigation();
      injectBlogSplitScrollbarCss();
      applyBlogSplitZoom();
    });
    blogSplitView.webContents.once("destroyed", () => {
      blogSplitView = null;
      notifyBlogSplitState(false);
    });
    mainWindow.contentView.addChildView(blogSplitView);
  }

  layoutBlogSplitView();
  try {
    await blogSplitView!.webContents.loadURL(normalizeBlogSplitUrl(url));
  } catch {
    closeBlogSplitView();
    return { ok: false };
  }
  notifyBlogSplitState(true);
  notifyBlogSplitNavigation();
  return { ok: true };
}

function closeBlogSplitView(): void {
  if (!blogSplitView) {
    notifyBlogSplitState(false);
    return;
  }
  const view = blogSplitView;
  blogSplitView = null;
  // 다음에 열 때 오프셋/하이라이트가 남지 않도록 찾기 상태를 초기화.
  blogSplitFindBarHeight = 0;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.contentView.removeChildView(view);
  }
  if (!view.webContents.isDestroyed()) {
    view.webContents.stopFindInPage("clearSelection");
    view.webContents.close({ waitForBeforeUnload: false });
  }
  notifyBlogSplitState(false);
}

async function navigateBlogSplit(action: unknown, url?: unknown): Promise<{
  ok: boolean;
  url: string;
  canGoBack: boolean;
  canGoForward: boolean;
}> {
  if (!isBlogSplitOpen()) {
    return { ok: false, url: "", canGoBack: false, canGoForward: false };
  }

  const contents = blogSplitView!.webContents;
  switch (action) {
    case "back":
      if (contents.navigationHistory.canGoBack()) contents.navigationHistory.goBack();
      break;
    case "forward":
      if (contents.navigationHistory.canGoForward()) contents.navigationHistory.goForward();
      break;
    case "reload":
      contents.reload();
      break;
    case "home":
      await contents.loadURL(BLOG_SPLIT_NAVER_HOME_URL);
      break;
    case "go":
      await contents.loadURL(normalizeBlogSplitUrl(url));
      break;
    default:
      return {
        ok: false,
        url: contents.getURL(),
        canGoBack: contents.navigationHistory.canGoBack(),
        canGoForward: contents.navigationHistory.canGoForward(),
      };
  }

  return {
    ok: true,
    url: contents.getURL(),
    canGoBack: contents.navigationHistory.canGoBack(),
    canGoForward: contents.navigationHistory.canGoForward(),
  };
}

interface BlogSplitPasteProbeImage {
  index: number;
  base64: string;
  mimeType?: string;
}

interface BlogSplitPasteProbeRequest {
  title?: string;
  content?: string;
  images?: BlogSplitPasteProbeImage[];
}

interface BlogSplitPasteProbeStep {
  name: string;
  ok: boolean;
  detail: string;
  skipped?: boolean;
}

interface BlogSplitPasteProbeResult {
  ok: boolean;
  error?: string;
  steps: BlogSplitPasteProbeStep[];
  snapshot?: unknown;
}

interface BlogSplitAnchorResult {
  ok: boolean;
  reason: string;
  trailingText: boolean;
  cursorAtAppend: boolean;
  // 커서가 놓인 append/trailing text 컴포넌트가 "비어 있는가".
  // 구조물(이미지/인용구) paste 는 반드시 빈 칸에서 일어나야 한다(invariant).
  // non-empty 본문 위에서 paste 하면 본문이 분할/밀림 → 누적·순서역전 사고.
  trailingEmpty: boolean;
  componentOrder: string[];
}

interface BlogSplitTitleToBodyResult {
  ok: boolean;
  titleCursorEnd: boolean;
  bodyCursor: boolean;
  reason: string;
  fallback: boolean;
}

type BlogSplitStructuralAnchor = { kind: "image" | "quote"; index: number };

type BlogSplitPasteBlock =
  | { type: "text"; lines: string[] }
  | { type: "quote"; text: string }
  | { type: "image"; imageIndex: number; description: string };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderProbeInlineMarkdown(value: string): string {
  return escapeHtml(value)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, "$1<em>$2</em>");
}

function firstMeaningfulParagraph(content: string): string {
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^\[이미지:\s*.+?\]$/.test(line)) continue;
    if (/^#{2,3}(?:\{\w+\})?\s+/.test(line)) continue;
    if (line.startsWith("#")) continue;
    return line;
  }
  return "본문 paste 검증 문장입니다. **굵은 글자**와 *기울임* 보존 여부를 확인합니다.";
}

function firstHeading(content: string): string {
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    const match = line.match(/^#{2,3}(?:\{\w+\})?\s+(.+)$/);
    if (match) return match[1].replace(/\[\[BR\]\]/g, "\n").trim();
  }
  return "인용구 paste 검증 소제목";
}

function getFirstProbeImage(images: BlogSplitPasteProbeImage[] | undefined): BlogSplitPasteProbeImage | null {
  if (!images || images.length === 0) return null;
  const sorted = [...images].sort((a, b) => a.index - b.index);
  return sorted.find((img) => Boolean(img.base64)) ?? null;
}

function trimBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim().length === 0) start += 1;
  while (end > start && lines[end - 1].trim().length === 0) end -= 1;
  return lines.slice(start, end);
}

function parsePasteBlocks(content: string): BlogSplitPasteBlock[] {
  const blocks: BlogSplitPasteBlock[] = [];
  const textLines: string[] = [];
  let markerIndex = -1;

  const flushText = () => {
    const lines = trimBlankLines(textLines.map((line) => line.trim()));
    if (lines.length > 0) {
      blocks.push({ type: "text", lines });
    }
    textLines.length = 0;
  };

  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line) {
      textLines.push("");
      continue;
    }

    // H1(# 제목)은 글 제목 → 본문에서 제외 (title 은 별도 입력됨).
    // backend parse_markdown(markdown_converter.py)과 동일 규칙. '##'/'###' 소제목은 건드리지 않음.
    if (/^#\s+/.test(line) && !line.startsWith("##")) {
      flushText();
      continue;
    }

    const imageMatch = line.match(/^\[이미지:\s*(.+?)\]$/);
    if (imageMatch) {
      flushText();
      markerIndex += 1;
      blocks.push({
        type: "image",
        imageIndex: markerIndex,
        description: imageMatch[1].trim(),
      });
      continue;
    }

    const headingMatch = line.match(/^#{2,3}(?:\{\w+\})?\s+(.+)$/);
    if (headingMatch) {
      flushText();
      blocks.push({
        type: "quote",
        text: headingMatch[1].replace(/\[\[BR\]\]/g, "\n").trim(),
      });
      continue;
    }

    if (line.startsWith("> ")) {
      flushText();
      blocks.push({
        type: "quote",
        text: line.replace(/^>\s*/, "").replace(/\[\[BR\]\]/g, "\n").trim(),
      });
      continue;
    }

    textLines.push(line);
  }

  flushText();
  return blocks;
}

function renderParagraphHtml(lines: string[]): string {
  return lines
    .map((line) => (line.trim() ? `<p>${renderProbeInlineMarkdown(line)}</p>` : "<p><br></p>"))
    .join("");
}

function plainTextFromLines(lines: string[]): string {
  return lines
    .map((line) => line.replace(/\*\*/g, "").replace(/\*/g, ""))
    .join("\n");
}

function normalizeComparableText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function imageByIndex(
  images: BlogSplitPasteProbeImage[] | undefined,
  imageIndex: number,
): BlogSplitPasteProbeImage | null {
  return images?.find((image) => image.index === imageIndex && Boolean(image.base64)) ?? null;
}

function normalizeBase64Image(value: string): string {
  const commaIndex = value.indexOf(",");
  const raw = value.startsWith("data:") && commaIndex >= 0 ? value.slice(commaIndex + 1) : value;
  return raw.replace(/\s/g, "");
}

function createNativeImageFromBase64(value: string, mimeType = "image/png"): NativeImage {
  const normalized = normalizeBase64Image(value);
  const fromBuffer = nativeImage.createFromBuffer(Buffer.from(normalized, "base64"));
  if (!fromBuffer.isEmpty()) return fromBuffer;
  return nativeImage.createFromDataURL(`data:${mimeType};base64,${normalized}`);
}

function findBlogEditorFrame(): WebFrameMain | null {
  if (!isBlogSplitOpen()) return null;
  const contents = blogSplitView!.webContents;
  return (
    contents.mainFrame.framesInSubtree.find((frame) => {
      if (frame.isDestroyed() || frame.detached) return false;
      const url = frame.url || "";
      return frame.name === "mainFrame" || url.includes("PostWrite") || url.includes("SmartEditor");
    }) ?? null
  );
}

async function focusInEditor(frame: WebFrameMain, selectorMode: "title" | "body"): Promise<boolean> {
  const script = `
    (() => {
      const focusTarget = (target) => {
        target.focus();
        const range = document.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        return true;
      };

      if (${JSON.stringify(selectorMode)} === "title") {
        const selectors = [
          ".se-documentTitle [contenteditable='true']",
          ".se-documentTitle .se-title-text",
          ".se-title-text [contenteditable='true']",
          ".se-title-text",
        ];
        for (const selector of selectors) {
          const el = document.querySelector(selector);
          if (!el) continue;
          const target = el.closest("[contenteditable='true']") || el;
          target.scrollIntoView({ block: "center", inline: "nearest" });
          return focusTarget(target);
        }
        return false;
      }

      const root = document.querySelector(".se-content") || document.querySelector(".se-sections");
      if (!root) return false;

      const components = Array.from(root.querySelectorAll(".se-component"))
        .filter((component) => !component.closest(".se-documentTitle"));
      for (let i = components.length - 1; i >= 0; i -= 1) {
        const component = components[i];
        const target =
          component.querySelector(".se-text-paragraph") ||
          component.querySelector("[contenteditable='true']");
        if (!target) continue;
        if (component.closest(".se-component.se-quotation")) continue;
        target.scrollIntoView({ block: "center", inline: "nearest" });
        return focusTarget(target);
      }

      const emptyTarget =
        root.querySelector(".se-text-paragraph") ||
        root.querySelector("[contenteditable='true']");
      if (emptyTarget) {
        emptyTarget.scrollIntoView({ block: "center", inline: "nearest" });
        return focusTarget(emptyTarget);
      }
      return false;
    })()
  `;
  return Boolean(await frame.executeJavaScript(script, true));
}

async function pasteClipboardIntoFocusedBlogSplit(waitMs = 900): Promise<void> {
  blogSplitView!.webContents.paste();
  await sleep(waitMs);
}

async function placeTitleCursorAtEnd(frame: WebFrameMain): Promise<{ ok: boolean; reason: string }> {
  const result = await frame.executeJavaScript(`
    (() => {
      const selectors = [
        ".se-documentTitle [contenteditable='true']",
        ".se-documentTitle .se-title-text",
        ".se-title-text [contenteditable='true']",
        ".se-title-text",
      ];
      for (const selector of selectors) {
        const el = document.querySelector(selector);
        if (!el) continue;
        const target = el.closest("[contenteditable='true']") || el;
        target.scrollIntoView({ block: "center", inline: "nearest" });
        target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        if (target.focus) target.focus();
        const range = document.createRange();
        range.selectNodeContents(target);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return { ok: true, reason: "ok" };
      }
      return { ok: false, reason: "title_target_not_found" };
    })()
  `, true);
  if (!result || typeof result !== "object") return { ok: false, reason: "invalid_result" };
  const value = result as { ok?: unknown; reason?: unknown };
  return {
    ok: value.ok === true,
    reason: typeof value.reason === "string" ? value.reason : "unknown",
  };
}

async function pressEnterInBlogSplit(waitMs = 700): Promise<void> {
  const contents = blogSplitView!.webContents;
  contents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
  contents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
  await sleep(waitMs);
}

async function moveFromTitleToBody(frame: WebFrameMain): Promise<BlogSplitTitleToBodyResult> {
  const titleCursor = await placeTitleCursorAtEnd(frame);
  if (!titleCursor.ok) {
    return {
      ok: false,
      titleCursorEnd: false,
      bodyCursor: false,
      reason: titleCursor.reason,
      fallback: false,
    };
  }

  await sleep(300);
  await pressEnterInBlogSplit(700);

  const bodyCursor = await placeCursorAtAppendTarget(frame);
  if (bodyCursor.ok) {
    return {
      ok: true,
      titleCursorEnd: true,
      bodyCursor: true,
      reason: bodyCursor.reason,
      fallback: false,
    };
  }

  const fallbackCursor = await ensureAppendCursor(frame);
  return {
    ok: fallbackCursor.ok,
    titleCursorEnd: true,
    bodyCursor: fallbackCursor.ok,
    reason: `${bodyCursor.reason}:fallback:${fallbackCursor.reason}`,
    fallback: true,
  };
}

async function getBlogEditorComponentOrder(frame: WebFrameMain): Promise<string[]> {
  const result = await frame.executeJavaScript(`
    (() => {
      const root = document.querySelector(".se-content") || document.querySelector(".se-sections");
      if (!root) return [];
      return Array.from(root.querySelectorAll(".se-component"))
        .filter((component) => !component.closest(".se-documentTitle"))
        .map((component) => {
          if (component.classList.contains("se-image")) return "image";
          if (component.classList.contains("se-quotation")) return "quote";
          if (component.classList.contains("se-text")) return "text";
          return "other";
        });
    })()
  `);
  return Array.isArray(result) ? result.filter((item): item is string => typeof item === "string") : [];
}

async function placeCursorAtAppendTarget(frame: WebFrameMain): Promise<BlogSplitAnchorResult> {
  const result = await frame.executeJavaScript(`
    (() => {
      const componentOrder = () => {
        const root = document.querySelector(".se-content") || document.querySelector(".se-sections");
        if (!root) return [];
        return Array.from(root.querySelectorAll(".se-component"))
          .filter((component) => !component.closest(".se-documentTitle"))
          .map((component) => {
            if (component.classList.contains("se-image")) return "image";
            if (component.classList.contains("se-quotation")) return "quote";
            if (component.classList.contains("se-text")) return "text";
            return "other";
          });
      };

      const placeAtEnd = (textComponent) => {
        const paragraphs = Array.from(textComponent.querySelectorAll(".se-text-paragraph"));
        const para = paragraphs[paragraphs.length - 1] ||
          textComponent.querySelector("[contenteditable='true']");
        if (!para) return { ok: false, reason: "no_paragraph" };
        const editable = para.closest("[contenteditable='true']") || para;
        para.scrollIntoView({ block: "center", inline: "nearest" });
        if (editable.focus) editable.focus();
        para.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        para.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        para.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        const focusNode = para.querySelector("span.__se-node") || para;
        const range = document.createRange();
        if (focusNode.childNodes.length > 0) {
          range.setStartAfter(focusNode.lastChild);
        } else {
          range.setStart(focusNode, 0);
        }
        range.collapse(true);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        return { ok: true, reason: "ok" };
      };

      const root = document.querySelector(".se-content") || document.querySelector(".se-sections");
      if (!root) {
        return { ok: false, reason: "no_root", trailingText: false, cursorAtAppend: false, componentOrder: [] };
      }
      const texts = Array.from(root.querySelectorAll(".se-component.se-text"))
        .filter((component) => !component.closest(".se-documentTitle"));
      const target = texts[texts.length - 1];
      if (!target) {
        return { ok: false, reason: "no_text_component", trailingText: false, cursorAtAppend: false, componentOrder: componentOrder() };
      }
      const targetEmpty = (target.textContent || "").replace(/[\\u200b\\uFEFF\\u00a0]/g, "").trim().length === 0;
      const placed = placeAtEnd(target);
      const components = Array.from(root.querySelectorAll(".se-component"))
        .filter((component) => !component.closest(".se-documentTitle"));
      const idx = components.indexOf(target);
      const cursorAtAppend = placed.ok && idx >= components.length - 2;
      return {
        ok: Boolean(placed.ok && cursorAtAppend),
        reason: placed.ok ? "ok" : placed.reason,
        trailingText: true,
        cursorAtAppend,
        trailingEmpty: targetEmpty,
        componentOrder: componentOrder(),
      };
    })()
  `, true);
  return normalizeAnchorResult(result);
}

function normalizeAnchorResult(value: unknown): BlogSplitAnchorResult {
  if (!value || typeof value !== "object") {
    return { ok: false, reason: "invalid_result", trailingText: false, cursorAtAppend: false, trailingEmpty: false, componentOrder: [] };
  }
  const result = value as {
    ok?: unknown;
    reason?: unknown;
    trailingText?: unknown;
    cursorAtAppend?: unknown;
    trailingEmpty?: unknown;
    componentOrder?: unknown;
  };
  return {
    ok: result.ok === true,
    reason: typeof result.reason === "string" ? result.reason : "unknown",
    trailingText: result.trailingText === true,
    cursorAtAppend: result.cursorAtAppend === true,
    trailingEmpty: result.trailingEmpty === true,
    componentOrder: Array.isArray(result.componentOrder)
      ? result.componentOrder.filter((item): item is string => typeof item === "string")
      : [],
  };
}

async function ensureAppendCursor(frame: WebFrameMain): Promise<BlogSplitAnchorResult> {
  const placed = await placeCursorAtAppendTarget(frame);
  if (placed.ok) return placed;

  const focused = await focusInEditor(frame, "body");
  if (!focused) {
    return {
      ...placed,
      reason: placed.reason === "unknown" ? "body_focus_failed" : `${placed.reason}:body_focus_failed`,
    };
  }
  return placeCursorAtAppendTarget(frame);
}

async function getBlogEditorSnapshot(frame: WebFrameMain): Promise<unknown> {
  return frame.executeJavaScript(`
    (() => {
      const text = (el) => (el && el.textContent ? el.textContent.trim() : "");
      const titleEl =
        document.querySelector(".se-documentTitle .se-title-text") ||
        document.querySelector(".se-documentTitle [contenteditable='true']") ||
        document.querySelector(".se-title-text");
      const title = text(titleEl);
      const quotes = Array.from(document.querySelectorAll(".se-component.se-quotation")).map((q, index) => ({
        index,
        className: q.className,
        text: text(q),
      }));
      const images = Array.from(document.querySelectorAll(".se-component.se-image")).map((img, index) => ({
        index,
        className: img.className,
        hasImg: Boolean(img.querySelector("img")),
        text: text(img).slice(0, 120),
      }));
      const bodyText = Array.from(document.querySelectorAll(".se-content .se-component"))
        .map((el) => text(el))
        .filter(Boolean)
        .slice(0, 12);
      const componentOrder = Array.from(document.querySelectorAll(".se-content .se-component"))
        .filter((component) => !component.closest(".se-documentTitle"))
        .map((component) => {
          if (component.classList.contains("se-image")) return "image";
          if (component.classList.contains("se-quotation")) return "quote";
          if (component.classList.contains("se-text")) return "text";
          return "other";
        });
      return { title, quoteCount: quotes.length, imageCount: images.length, quotes, images, bodyText, componentOrder };
    })()
  `);
}

async function getSelectionDiagnostics(frame: WebFrameMain, label: string): Promise<unknown> {
  return frame.executeJavaScript(`
    ((label) => {
      const text = (el) => (el && el.textContent ? el.textContent.trim() : "");
      const root = document.querySelector(".se-content") || document.querySelector(".se-sections");
      const components = root
        ? Array.from(root.querySelectorAll(".se-component"))
            .filter((component) => !component.closest(".se-documentTitle"))
        : [];
      const componentOrder = components.map((component) => {
        if (component.classList.contains("se-image")) return "image";
        if (component.classList.contains("se-quotation")) return "quote";
        if (component.classList.contains("se-text")) return "text";
        return "other";
      });
      const sel = window.getSelection();
      const focusNode = sel && sel.rangeCount > 0 ? sel.focusNode : null;
      const focusEl = focusNode
        ? (focusNode.nodeType === Node.ELEMENT_NODE ? focusNode : focusNode.parentElement)
        : null;
      const component = focusEl ? focusEl.closest(".se-component") : null;
      const paragraphs = component ? Array.from(component.querySelectorAll(".se-text-paragraph")) : [];
      const para = focusEl ? focusEl.closest(".se-text-paragraph") : null;
      const componentIndex = component ? components.indexOf(component) : -1;
      const paragraphIndex = para ? paragraphs.indexOf(para) : -1;
      const focusTextLength = focusNode && typeof focusNode.textContent === "string"
        ? focusNode.textContent.length
        : null;
      const focusOffset = sel && sel.rangeCount > 0 ? sel.focusOffset : null;
      // node-type aware 끝 판정: focusOffset 의 단위가 노드 타입마다 다르므로
      // (text=글자 위치, element=자식 노드 인덱스) 직접 비교는 부정확하다.
      // Range 로 "커서 위치 ~ 현재 문단 끝" 사이 텍스트를 추출해 비었는지로 판정한다.
      const focusNodeType = focusNode
        ? (focusNode.nodeType === Node.TEXT_NODE
            ? "text"
            : focusNode.nodeType === Node.ELEMENT_NODE
              ? "element"
              : "other")
        : null;
      let caretTail = null;
      let atParaEnd = null;
      if (focusNode && para && sel && sel.rangeCount > 0) {
        try {
          const tailRange = document.createRange();
          tailRange.setStart(focusNode, sel.focusOffset);
          tailRange.setEndAfter(para.lastChild || para);
          caretTail = tailRange.toString();
          atParaEnd = caretTail.length === 0;
        } catch (err) {
          caretTail = null;
          atParaEnd = null;
        }
      }
      const componentType = component
        ? component.classList.contains("se-image")
          ? "image"
          : component.classList.contains("se-quotation")
            ? "quote"
            : component.classList.contains("se-text")
              ? "text"
              : "other"
        : "none";
      return {
        label,
        componentOrder,
        selection: {
          componentType,
          componentIndex,
          paragraphIndex,
          paragraphCount: paragraphs.length,
          focusOffset,
          focusTextLength,
          atLastParagraph: paragraphIndex >= 0 && paragraphIndex === paragraphs.length - 1,
          nearNodeEnd: typeof focusOffset === "number" && typeof focusTextLength === "number"
            ? focusOffset >= focusTextLength
            : null,
          focusNodeType,
          atParaEnd,
          caretTail: typeof caretTail === "string" ? caretTail.slice(0, 30) : caretTail,
          firstText: text(paragraphs[0]).slice(0, 60),
          currentText: text(para).slice(0, 60),
          lastText: text(paragraphs[paragraphs.length - 1]).slice(0, 60),
        },
        textComponents: components
          .filter((component) => component.classList.contains("se-text"))
          .map((component, index) => {
            const ps = Array.from(component.querySelectorAll(".se-text-paragraph"));
            return {
              index,
              first: text(ps[0]).slice(0, 50),
              last: text(ps[ps.length - 1]).slice(0, 50),
              paragraphs: ps.length,
            };
          })
          .slice(0, 8),
      };
    })(${JSON.stringify(label)})
  `, true);
}

function compactSelectionDiagnostics(value: unknown): string {
  if (!value || typeof value !== "object") return "diag=invalid";
  const diag = value as {
    selection?: {
      componentType?: unknown;
      componentIndex?: unknown;
      paragraphIndex?: unknown;
      paragraphCount?: unknown;
      atLastParagraph?: unknown;
      nearNodeEnd?: unknown;
      atParaEnd?: unknown;
      focusNodeType?: unknown;
      caretTail?: unknown;
      currentText?: unknown;
      lastText?: unknown;
    };
    componentOrder?: unknown;
  };
  const sel = diag.selection || {};
  const order = Array.isArray(diag.componentOrder)
    ? diag.componentOrder.filter((item): item is string => typeof item === "string").join(">")
    : "";
  const currentText = typeof sel.currentText === "string" ? sel.currentText : "";
  const lastText = typeof sel.lastText === "string" ? sel.lastText : "";
  return [
    `sel=${String(sel.componentType)}#${String(sel.componentIndex)}`,
    `p=${String(sel.paragraphIndex)}/${String(sel.paragraphCount)}`,
    `lastP=${String(sel.atLastParagraph)}`,
    `end=${String(sel.nearNodeEnd)}`,
    `atParaEnd=${String(sel.atParaEnd)}`,
    `fnode=${String(sel.focusNodeType)}`,
    `tail="${typeof sel.caretTail === "string" ? sel.caretTail : ""}"`,
    `cur="${currentText}"`,
    `last="${lastText}"`,
    `order=${order}`,
  ].join(" ");
}

async function logSelectionDiagnostics(frame: WebFrameMain, label: string): Promise<string> {
  const diagnostics = await getSelectionDiagnostics(frame, label).catch((error: unknown) => ({
    label,
    error: error instanceof Error ? error.message : String(error),
  }));
  log.info(`[pasteProbe] ${label} ${JSON.stringify(diagnostics)}`);
  return compactSelectionDiagnostics(diagnostics);
}

async function countEditorComponents(frame: WebFrameMain): Promise<{ quotes: number; images: number }> {
  const result = await frame.executeJavaScript(`
    (() => ({
      quotes: document.querySelectorAll(".se-component.se-quotation").length,
      images: document.querySelectorAll(".se-component.se-image").length,
    }))()
  `);
  if (!result || typeof result !== "object") return { quotes: 0, images: 0 };
  const value = result as { quotes?: unknown; images?: unknown };
  return {
    quotes: typeof value.quotes === "number" ? value.quotes : 0,
    images: typeof value.images === "number" ? value.images : 0,
  };
}

async function clickQuotationToolbar(frame: WebFrameMain): Promise<boolean> {
  return Boolean(await frame.executeJavaScript(`
    (() => {
      const selectors = [
        'button[data-name="quotation"]',
        'button.se-toolbar-button-quotation',
        'button[aria-label*="인용"]',
        'button[title*="인용"]'
      ];
      for (const selector of selectors) {
        const btn = document.querySelector(selector);
        if (!btn) continue;
        btn.scrollIntoView({ block: "center", inline: "nearest" });
        btn.click();
        return true;
      }
      return false;
    })()
  `, true));
}

async function focusLastQuotation(frame: WebFrameMain): Promise<boolean> {
  return Boolean(await frame.executeJavaScript(`
    (() => {
      const quotes = document.querySelectorAll(".se-component.se-quotation");
      const q = quotes[quotes.length - 1];
      if (!q) return false;
      const target =
        q.querySelector(".se-text-paragraph") ||
        q.querySelector("[contenteditable='true']") ||
        q;
      target.scrollIntoView({ block: "center", inline: "nearest" });
      target.focus();
      const range = document.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      target.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      return true;
    })()
  `, true));
}

async function runBlogSplitPasteProbe(input: unknown): Promise<BlogSplitPasteProbeResult> {
  const steps: BlogSplitPasteProbeStep[] = [];

  // 붙여넣기로 입력 기능은 프로덕션에도 노출되므로 dev 전용 게이트를 두지 않는다.
  // (PoC 시절의 NODE_ENV!=="development" 차단이 남아 있어, UI 는 노출됐는데 패키지 빌드에선
  //  클릭해도 즉시 빠져나가 동작하지 않던 버그를 제거. 분할 패널 열림·blog.naver.com 글쓰기
  //  페이지·에디터 프레임 존재로 런타임 가드는 아래에서 충분히 한다.)
  if (!isBlogSplitOpen()) {
    return { ok: false, error: "blog-split-not-open", steps };
  }

  const url = getBlogSplitUrl();
  const parsed = parseAllowedBlogSplitUrl(url);
  if (!parsed || parsed.hostname !== "blog.naver.com") {
    return { ok: false, error: "blog-editor-not-open", steps };
  }

  const frame = findBlogEditorFrame();
  if (!frame) {
    return { ok: false, error: "editor-frame-not-found", steps };
  }

  const req = (input && typeof input === "object" ? input : {}) as BlogSplitPasteProbeRequest;
  const title = req.title?.trim() || "Paste PoC 제목";
  const content = req.content || "";
  const blocks = parsePasteBlocks(content);

  const previousClipboard = {
    text: clipboard.readText(),
    html: clipboard.readHTML(),
    image: clipboard.readImage(),
  };

  try {
    const titleFocused = await focusInEditor(frame, "title");
    if (titleFocused) await sleep(700);
    clipboard.write({ text: title });
    if (titleFocused) await pasteClipboardIntoFocusedBlogSplit(500);
    const titleToBody = titleFocused
      ? await moveFromTitleToBody(frame)
      : {
          ok: false,
          titleCursorEnd: false,
          bodyCursor: false,
          reason: "title focus failed",
          fallback: false,
        };
    const snapshotAfterTitle = (await getBlogEditorSnapshot(frame)) as { title?: string };
    steps.push({
      name: "title:text/plain",
      ok:
        titleFocused &&
        normalizeComparableText(snapshotAfterTitle.title || "").includes(
          normalizeComparableText(title),
      ),
      detail: titleFocused ? `title=${snapshotAfterTitle.title || ""}` : "title focus failed",
    });
    steps.push({
      name: "title:enterToBody",
      ok: titleToBody.ok,
      detail: `titleCursorEnd=${titleToBody.titleCursorEnd} bodyCursor=${titleToBody.bodyCursor} reason=${titleToBody.reason}${titleToBody.fallback ? " fallback=true" : ""}`,
    });

    if (blocks.length === 0) {
      const fallbackLines = [firstMeaningfulParagraph(content)];
      clipboard.write({
        text: plainTextFromLines(fallbackLines),
        html: renderParagraphHtml(fallbackLines),
      });
      await pasteClipboardIntoFocusedBlogSplit();
      steps.push({
        name: "body:fallbackTextPaste",
        ok: true,
        detail: "fallback paragraph pasted (no cursor reposition)",
      });
    }

    // 1차 단순화(사람 흉내): 블록 사이 커서 재배치(placeCursor*)를 전면 제거한다.
    // 사용자 수동 실험 결과 — paste 후 SmartEditor 가 커서를 결과물 밑에 자동으로 둔다.
    // 따라서 그 자연 커서를 신뢰하고, DOM 은 count/selection "읽기 진단"으로만 사용한다.
    // (코덱스 보강: 쓰기=실제 입력[paste/Enter], DOM=읽기 전용, 검증[count]은 유지)
    for (const [blockIndex, block] of blocks.entries()) {
      if (block.type === "text") {
        // 이미지 다음 본문: 빈 줄 확보를 위해 본문 paste 전 엔터1.
        const prevBlock = blockIndex > 0 ? blocks[blockIndex - 1] : null;
        let preSpacer = "";
        if (prevBlock && prevBlock.type === "image") {
          await pressEnterInBlogSplit(300);
          preSpacer = " pre=enter1";
        }
        clipboard.write({
          text: plainTextFromLines(block.lines),
          html: renderParagraphHtml(block.lines),
        });
        await pasteClipboardIntoFocusedBlogSplit();
        // 본문 입력 후 무조건 엔터 1번: 커서가 본문 끝 글자에 머물지 않고 새 빈 줄로 이동한다.
        // → 이미지 다음(에디터가 빈 줄+커서 자동 생성)과 동일한 시작 상태가 되어,
        //   뒤따르는 인용구 앞 여백(엔터3)이 본문/이미지에서 동일하게 적용된다.
        await pressEnterInBlogSplit(300);
        const diag = await logSelectionDiagnostics(frame, `after block:${blockIndex}:textPaste`);
        steps.push({
          name: `block:${blockIndex}:textHtmlPaste`,
          ok: true,
          detail: `lines=${block.lines.length}${preSpacer} +enter1 [${diag}]`,
        });
        continue;
      }

      if (block.type === "quote") {
        const before = await countEditorComponents(frame);
        // 이미지/본문 다음에 인용구가 올 때, 인용구 앞에 여백(진짜 엔터 3번)을 넣는다.
        // sendInputEvent 기반 실제 입력이라 커서를 망치지 않는다(1차 성공 흐름 유지).
        const prevBlock = blockIndex > 0 ? blocks[blockIndex - 1] : null;
        let spacerInfo = "";
        if (prevBlock && (prevBlock.type === "image" || prevBlock.type === "text")) {
          for (let i = 0; i < 3; i++) await pressEnterInBlogSplit(300);
          spacerInfo = " spacer=enter3";
        }
        const quoteLines = block.text.split("\n").map((line) => line.trim()).filter(Boolean);
        const quoteHtml = `<blockquote>${renderParagraphHtml(quoteLines.length ? quoteLines : [block.text])}</blockquote>`;
        clipboard.write({ text: block.text, html: quoteHtml });
        await pasteClipboardIntoFocusedBlogSplit();
        const after = await countEditorComponents(frame);
        const diag = await logSelectionDiagnostics(frame, `after block:${blockIndex}:quotePaste`);
        steps.push({
          name: `block:${blockIndex}:quoteHtmlPaste`,
          ok: after.quotes > before.quotes,
          detail: `quotes ${before.quotes}->${after.quotes}${spacerInfo} [${diag}]`,
        });
        continue;
      }

      const before = await countEditorComponents(frame);
      const imagePayload = imageByIndex(req.images, block.imageIndex);
      if (!imagePayload) {
        steps.push({
          name: `block:${blockIndex}:imagePngPaste`,
          ok: true,
          skipped: true,
          detail: `missing image payload index=${block.imageIndex} (${block.description})`,
        });
        continue;
      }

      // 본문 다음 이미지: 본문 직후 엔터1(커서 내림)만으론 이미지가 본문에 딱 붙으므로,
      // 빈 줄 확보를 위해 엔터 1번 더 친다.
      // (이미지 다음 본문은 커서가 자동으로 이미지 밑에 가므로 불필요 — 사용자 확인)
      const prevBlock = blockIndex > 0 ? blocks[blockIndex - 1] : null;
      let imgSpacerInfo = "";
      if (prevBlock && prevBlock.type === "text") {
        await pressEnterInBlogSplit(300);
        imgSpacerInfo = " spacer=enter1";
      }
      const mimeType = imagePayload.mimeType || "image/png";
      const image = createNativeImageFromBase64(imagePayload.base64, mimeType);
      const imageSize = image.getSize();
      clipboard.write({ image });
      await pasteClipboardIntoFocusedBlogSplit(3000);
      const after = await countEditorComponents(frame);
      const diag = await logSelectionDiagnostics(frame, `after block:${blockIndex}:imagePaste`);
      steps.push({
        name: `block:${blockIndex}:imagePngPaste`,
        ok: !image.isEmpty() && after.images > before.images,
        detail: `imageEmpty=${image.isEmpty()} size=${imageSize.width}x${imageSize.height} images ${before.images}->${after.images}${imgSpacerInfo} [${diag}]`,
      });
    }

    const snapshot = await getBlogEditorSnapshot(frame);
    log.info(`[pasteProbe][result] ok=${steps.every((step) => step.ok)} blocks=${blocks.length}`);
    for (const s of steps) {
      log.info(`[pasteProbe][step] ${s.name} ok=${s.ok}${s.skipped ? " skipped" : ""} | ${s.detail}`);
    }
    log.info(`[pasteProbe][snapshot] ${JSON.stringify(snapshot)}`);
    return {
      ok: steps.every((step) => step.ok),
      steps,
      snapshot,
    };
  } catch (e) {
    log.error(`[pasteProbe][error] ${e instanceof Error ? e.message : String(e)}`);
    for (const s of steps) {
      log.info(`[pasteProbe][step] ${s.name} ok=${s.ok}${s.skipped ? " skipped" : ""} | ${s.detail}`);
    }
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      steps,
      snapshot: await getBlogEditorSnapshot(frame).catch(() => undefined),
    };
  } finally {
    const restoreImage = previousClipboard.image.isEmpty() ? undefined : previousClipboard.image;
    clipboard.write({
      text: previousClipboard.text,
      html: previousClipboard.html,
      ...(restoreImage ? { image: restoreImage } : {}),
    });
  }
}

// §A 보안 토큰. packaged 빌드에서는 ALLOW_INSECURE_DEV_* 플래그를 절대 set 하지 않음.
const APP_TOKEN = crypto.randomBytes(32).toString("hex");
const APP_SESSION_TOKEN = crypto.randomBytes(32).toString("hex");

function isAuthDeepLink(value: string | undefined): value is string {
  return typeof value === "string" && value.startsWith(`${AUTH_PROTOCOL}://auth/callback`);
}

function findAuthDeepLink(argv: string[]): string | null {
  return argv.find((arg) => isAuthDeepLink(arg)) ?? null;
}

function deliverAuthDeepLink(url: string): void {
  pendingAuthDeepLink = url;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("auth:deepLink", url);
  }
}

function registerAuthProtocol(): void {
  if (process.defaultApp && process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, [
      path.resolve(process.argv[1]),
    ]);
    return;
  }
  app.setAsDefaultProtocolClient(AUTH_PROTOCOL);
}

registerAuthProtocol();

const startupAuthDeepLink = findAuthDeepLink(process.argv);
if (startupAuthDeepLink) {
  pendingAuthDeepLink = startupAuthDeepLink;
}

app.on("open-url", (event, url) => {
  if (!isAuthDeepLink(url)) return;
  event.preventDefault();
  deliverAuthDeepLink(url);
});

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const deepLink = findAuthDeepLink(argv);
    if (deepLink) deliverAuthDeepLink(deepLink);
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(boot).catch((err) => {
    console.error("[main] boot failed:", err);
    dialog.showErrorBox("Blog Pick",`서비스 시작 실패:\n${String(err?.message ?? err)}`);
    app.exit(1);
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (!mainWindow.isVisible()) mainWindow.show();
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on("before-quit", async (event) => {
    if (isQuitting) return;

    // §H 발행 진행 중이면 사용자 확인. forceQuit 가 true 면 모달 우회.
    if (publishingOps.size > 0 && !forceQuit) {
      event.preventDefault();
      const dialogOpts = {
        type: "warning" as const,
        buttons: ["계속 작업", "종료"],
        defaultId: 0,
        cancelId: 0,
        message: "발행 작업이 진행 중입니다.",
        detail: "지금 종료하면 작성 중인 글이 손실될 수 있습니다.",
      };
      const choice = mainWindow
        ? dialog.showMessageBoxSync(mainWindow, dialogOpts)
        : dialog.showMessageBoxSync(dialogOpts);
      if (choice === 1) {
        forceQuit = true;
        app.quit(); // 재진입 → 모달 우회 → 정리 경로
      }
      return;
    }

    isQuitting = true;
    event.preventDefault();

    // §I 데드라인. 각 stop 5s + 전체 10s. hang 시 강제 진행.
    const overall = Promise.allSettled([
      withTimeout(nextSrv?.stop(), STOP_TIMEOUT_MS, "next"),
      withTimeout(python?.stop(), STOP_TIMEOUT_MS, "python"),
      withTimeout(youtube?.stop(), STOP_TIMEOUT_MS, "youtube"),
      withTimeout(broker?.stop(), STOP_TIMEOUT_MS, "broker"),
    ]);
    const timer = new Promise<"shutdown-timeout">((resolve) =>
      setTimeout(() => resolve("shutdown-timeout"), SHUTDOWN_TIMEOUT_MS),
    );
    try {
      const result = await Promise.race([overall, timer]);
      if (result === "shutdown-timeout") {
        console.warn(`[shutdown] overall ${SHUTDOWN_TIMEOUT_MS}ms timeout — proceeding to exit`);
      }
    } finally {
      // Job Object 핸들 닫기 — Windows 자식 트리 KILL 안전망 트리거.
      closeJobObject();
      app.exit(0);
    }
  });

  // §D 시스템 종료/재시작 — before-quit 우회 시나리오 안전망.
  powerMonitor.on("shutdown", () => {
    console.log("[shutdown] powerMonitor.shutdown — forwarding to app.quit()");
    forceQuit = true;
    app.quit();
  });
}

// §D macOS startup orphan sweeper.
// 이전 세션이 크래시·SIGKILL·Force Quit·시스템 셧다운 등으로 자식 트리를 정리 못 하고
// 종료된 경우, 이번 부팅 시 잔존 프로세스를 한 번에 청소. Windows 는 Job Object 가 처리.
//
// 식별 마커:
//   - ${userData}/chrome-profiles  (Chromium 인자에 등장)
//   - paths.backendExe              (PyInstaller 백엔드 절대 경로)
// → 일반 Chrome 이나 다른 사용자의 Chromium 은 user-data-dir 이 다르므로 절대 안 잡힘.
function sweepOrphans(): void {
  if (process.platform !== "darwin") return;
  const markers = [
    path.join(paths.userData, "chrome-profiles"),
    paths.backendExe,
  ].filter(Boolean);
  if (markers.length === 0) return;
  try {
    const ps = spawnSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" });
    if (ps.status !== 0 || !ps.stdout) return;
    const lines = ps.stdout.split("\n");
    let killed = 0;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (!markers.some((m) => line.includes(m))) continue;
      const pidStr = line.split(/\s+/)[0];
      const pid = parseInt(pidStr, 10);
      if (!pid || !Number.isFinite(pid) || pid === process.pid) continue;
      try {
        process.kill(pid, "SIGKILL");
        killed += 1;
      } catch {
        /* already gone */
      }
    }
    if (killed > 0) console.log(`[sweep] startup orphan sweeper: killed=${killed}`);
  } catch (e) {
    console.warn(`[sweep] failed: ${(e as Error).message}`);
  }
}

async function boot(): Promise<void> {
  // §D 이전 세션 잔존 프로세스 정리 — Job Object 초기화/자식 spawn 이전에 수행.
  sweepOrphans();

  // 좀비 안전망. Job Object 초기화는 자식 spawn 이전에 끝나야 함.
  initJobObject();

  // ── 시작 속도: 창을 먼저 만들어 로딩 화면을 즉시 보여주고, 백엔드(파이썬)·Next 서버는
  // 뒤에서 데운 뒤 준비되면 실제 앱으로 전환한다. (이전엔 둘 다 뜬 뒤에야 창을 만들어 ~5.5초 깜깜)
  const fixedTitle = `Blog Pick v${getAppVersion()}`;
  const initialBounds = getInitialWindowBounds();
  mainWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    backgroundColor: "#1a1a1a",
    title: fixedTitle,
    icon: paths.iconPng,
    show: false,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      preload: paths.preload,
    },
  });
  const win = mainWindow;

  // 다운로드: 앱 내부에서 생성한 blob 다운로드(이미지 단건 · 본문+이미지 ZIP)는 저장 위치를
  // 사용자가 고르도록 "다른 이름으로 저장" 창을 띄운다. 기본 위치/파일명은 다운로드 폴더 +
  // 원본 이름으로 제안 — setSavePath 를 호출하지 않으면 Electron 이 이 옵션으로 다이얼로그를 띄운다.
  // blob: URL 만 대상으로 한정 — 분할뷰(네이버 블로그) 등 외부 http(s) 다운로드는 기본 동작 유지.
  win.webContents.session.on("will-download", (_event, item) => {
    try {
      if (!item.getURL().startsWith("blob:")) return;
      const downloadsDir = app.getPath("downloads");
      item.setSaveDialogOptions({
        defaultPath: path.join(downloadsDir, item.getFilename()),
      });
    } catch (err) {
      log.warn("[download] 저장 다이얼로그 설정 실패, 기본 동작으로 진행", err);
    }
  });

  // 스플래시가 그려질 준비가 되면 창 표시. ready-to-show 가 안 와도 1.5s fallback 으로 보장.
  let mainWindowShown = false;
  let resolveSplashShown!: () => void;
  const splashShownPromise = new Promise<void>((r) => {
    resolveSplashShown = r;
  });
  const showMainWindow = (): void => {
    if (!win.isDestroyed() && !mainWindowShown) {
      mainWindowShown = true;
      win.show();
      resolveSplashShown();
    }
  };
  const showFallback = setTimeout(() => {
    showMainWindow();
  }, 1500);
  win.once("ready-to-show", () => {
    clearTimeout(showFallback);
    showMainWindow();
  });

  // HTML <title> 이 BrowserWindow.title 을 덮어쓰는 기본 동작 차단 (버전 표시 유지).
  win.on("page-title-updated", (event) => {
    event.preventDefault();
    if (!win.isDestroyed() && win.getTitle() !== fixedTitle) {
      win.setTitle(fixedTitle);
    }
  });
  win.on("resize", layoutBlogSplitView);
  win.on("maximize", layoutBlogSplitView);
  win.on("unmaximize", layoutBlogSplitView);
  win.on("enter-full-screen", layoutBlogSplitView);
  win.on("leave-full-screen", layoutBlogSplitView);
  win.on("close", (event) => {
    if (process.platform === "darwin" && !isQuitting) {
      event.preventDefault();
      win.hide();
      return;
    }
    // Windows/Linux: 발행 진행 중이면 창이 파괴되기 *전에* 확인한다.
    // before-quit 의 발행 가드는 창이 닫힌(window-all-closed) 뒤에야 실행되므로,
    // 거기서 "계속 작업" 으로 취소되면 UI 없는 좀비 상태가 된다. 창이 살아있는
    // 지금 물어보고, "종료" 면 forceQuit 로 before-quit 모달까지 우회한다.
    if (publishingOps.size > 0 && !forceQuit && !isQuitting) {
      event.preventDefault();
      const choice = dialog.showMessageBoxSync(win, {
        type: "warning" as const,
        buttons: ["계속 작업", "종료"],
        defaultId: 0,
        cancelId: 0,
        message: "발행 작업이 진행 중입니다.",
        detail: "지금 종료하면 작성 중인 글이 손실될 수 있습니다.",
      });
      if (choice === 1) {
        forceQuit = true;
        // destroy 는 beforeunload(미저장 경고)를 건너뛴다 — 이미 종료를 택했으므로
        // dirty 확인창을 또 띄우지 않고 바로 닫고 before-quit 정리 경로로 보낸다.
        win.destroy();
      }
    }
  });
  win.on("closed", () => {
    closeBlogSplitView();
    mainWindow = null;
  });

  // 입력값이 있으면 렌더러가 beforeunload 로 네이티브 창 닫기(X)를 막는다
  // (WizardStateProvider 의 isDirty 가드). Electron 기본 동작은 "조용히 취소" 라
  // X 버튼이 먹통이 된다(메뉴 File>Exit 는 app.quit→app.exit 로 우회되어 멀쩡).
  // will-prevent-unload 를 받아 종료 확인 대화상자를 띄우고, 사용자가 "종료" 를
  // 택하면 event.preventDefault() 로 unload 를 허용 → 창 닫기 진행.
  win.webContents.on("will-prevent-unload", (event) => {
    if (win.isDestroyed()) return;
    // will-prevent-unload 는 창 닫기뿐 아니라 새로고침/내비게이션에도 발동한다.
    // 발행 중이라면 unload 를 허용하지 않는다(허용 시 렌더러가 언마운트되며 publish:end 가
    // 호출돼 추적을 잃지만 백엔드/수동 발행은 계속 살아있을 수 있음). 창 닫기 경로의 발행
    // 확인은 win.on("close") 에서 처리되고 그쪽은 win.destroy() 라 여기로 오지 않는다.
    if (publishingOps.size > 0) return; // preventDefault 안 함 → unload 취소(기존 동작 유지)
    const choice = dialog.showMessageBoxSync(win, {
      type: "question" as const,
      buttons: ["종료", "취소"],
      defaultId: 1,
      cancelId: 1,
      message: "저장하지 않은 변경사항이 있습니다.",
      detail: "지금 종료하면 작성 중인 이미지 등 일부 입력이 사라질 수 있습니다.",
    });
    if (choice === 0) event.preventDefault(); // unload 허용 → 창이 닫힘
  });

  // macOS dock 아이콘은 dev 모드에서 Electron 기본 아이콘이 떠서 명시 지정.
  // prod 빌드에선 .app 번들 아이콘을 OS 가 직접 쓰므로 setIcon 은 dev 한정 보정 용도.
  if (process.platform === "darwin" && app.dock) {
    try {
      app.dock.setIcon(paths.iconPng);
    } catch {
      /* 아이콘 파일 누락 등은 무시 — 기본 아이콘 유지 */
    }
  }

  // 로딩 화면 먼저 표시 (정적 파일이라 수백 ms 안에 뜸).
  await win.loadFile(paths.splashHtml);

  // §C credential broker 시작. safeStorage 미사용 환경에서도 broker 자체는 떠 있고,
  // 실제 /encrypt 호출 시 503 반환. 사용자에게는 UI 단에서 안내.
  broker = new CredentialBroker({ appToken: APP_TOKEN });
  await broker.start();

  const backendPort = await getFreePort();
  // 킬스위치 OFF면 포트를 잡지 않는다(불필요 점유 방지). youtubeOrigin 도 undefined 가 되어
  // 아래 NextServer env 주입·navigation allowlist 에서 자연히 빠진다.
  const youtubePort = YOUTUBE_FEATURE_ENABLED ? await getFreePort() : null;
  // §J — Supabase 세션 영속성을 위해 매 부팅마다 같은 포트(=같은 origin)를 시도한다.
  // 마지막에 사용한 포트가 비어 있으면 재사용, 점유돼 있으면 빈 포트로 fallback.
  const frontendPort = await getPreferredOrFreePort(loadFrontendPort());
  saveFrontendPort(frontendPort);
  const frontendOrigin = `http://127.0.0.1:${frontendPort}`;
  const youtubeOrigin =
    youtubePort !== null ? `http://127.0.0.1:${youtubePort}` : undefined;

  python = new PythonManager(backendPort, {
    appToken: APP_TOKEN,
    frontendOrigin,
    credentialBrokerUrl: broker.url,
  });
  // 파이썬 자식을 먼저 spawn 해 백그라운드에서 부팅시킨다(spawn 은 즉시 pid 확보).
  // 그 사이 splash 가 화면에 그려질 때까지 기다린 뒤에야 safeStorage(Keychain)에 접근한다.
  // 미서명 앱에선 첫 safeStorage 호출이 동기로 수 초 블로킹돼 splash 렌더까지 막으므로,
  // 반드시 splash 가 보인 뒤(=loop 가 한 번 비워진 뒤)에 호출해야 로딩 화면이 즉시 뜬다.
  const pythonReady = python.start();
  assignToJob(python.pid);

  // youtube-backend(쇼츠 생성기) — 백그라운드로 띄운다. 사용자가 "유튜브" 탭을 눌러
  // iframe 이 로드될 때 준비돼 있으면 되고, 부팅을 막을 필요는 없으므로 await 하지 않는다.
  // 킬스위치 OFF면 생성·spawn 자체를 건너뛴다 → packaged 빌드에 실행파일이 없어도 ENOENT 팝업 없음.
  if (YOUTUBE_FEATURE_ENABLED && youtubePort !== null) {
    youtube = new YoutubeManager(youtubePort, {
      jwtSecret: getOrCreateYoutubeJwtSecret(),
      storageDir: path.join(paths.userData, "youtube", "storage"),
      bgmDir: path.join(paths.userData, "youtube", "bgm"),
      // 3키 모두 부팅 시 env 시드(youtube-backend DB 가 비어있을 때만 반영). 변경 즉시 적용은 설정 UI 의 PUT.
      geminiApiKey: loadGeminiApiKey(),
      typecastApiKey: loadTypecastApiKey(),
      falKey: loadFalKey(),
      ffmpegBin: paths.ffmpegBin || undefined,
      ffprobeBin: paths.ffprobeBin || undefined,
    });
    youtube.start().catch((err) => {
      console.error("[yt] start failed:", err);
    });
    assignToJob(youtube.pid);
  }

  // splash 가 실제로 표시될 때까지 대기 (ready-to-show 또는 1.5s fallback).
  await splashShownPromise;

  // 첫 safeStorage 호출 — Keychain 비용(미서명 앱 수 초)을 splash 뒤로 숨긴다.
  // 결과는 아래 앱 로드 후 에러 다이얼로그 표시 여부에만 쓴다.
  const encryptionAvailable = broker.isEncryptionAvailable();

  // §F 설정에서 Gemini key 복호화. 없으면 SettingsModal 이 사용자에게 입력 요청.
  // (위에서 safeStorage 가 이미 준비됐으므로 여기선 빠름)
  const geminiApiKey = loadGeminiApiKey();
  const openaiApiKey = loadOpenAIApiKey();

  await pythonReady;

  nextSrv = new NextServerManager(frontendPort, python.baseUrl, {
    appToken: APP_TOKEN,
    sessionToken: APP_SESSION_TOKEN,
    geminiApiKey,
    openaiApiKey,
    falKey: loadFalKey(),
    aiProviderConfigPath: aiProviderConfigPath(),
    youtubeUrl: youtubeOrigin,
  });
  await nextSrv.start();
  assignToJob(nextSrv.pid);

  const allowedOrigin = nextSrv.url;

  applyWindowSecurity(win, allowedOrigin, youtubeOrigin ? [youtubeOrigin] : []);

  // §F 설정 IPC.
  registerSettingsIpc();

  // Google OAuth callback + device identity IPC.
  ipcMain.handle("auth:openExternal", async (_e, url: string) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:") return false;
      await shell.openExternal(url);
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.handle("auth:getDeviceInfo", () => getDeviceInfo());
  ipcMain.handle("auth:getPendingDeepLink", () => {
    const url = pendingAuthDeepLink;
    pendingAuthDeepLink = null;
    return url;
  });
  ipcMain.handle("auth:getAutoLoginEnabled", () => getAutoLoginEnabled());
  ipcMain.handle("auth:setAutoLoginEnabled", (_e, enabled: boolean) => {
    setAutoLoginEnabled(Boolean(enabled));
    return getAutoLoginEnabled();
  });

  // §D busy IPC.
  ipcMain.handle("app:startBusy", (_e, opId: string) => {
    if (typeof opId === "string" && opId.length > 0) busyOps.add(opId);
  });
  ipcMain.handle("app:endBusy", (_e, opId: string) => {
    if (typeof opId === "string") endBusy(opId);
  });
  ipcMain.handle("app:isBusy", () => busyOps.size > 0);

  // 진단 로그 폴더 열기 — 사용자가 Win+R·경로입력 없이 버튼 한 번으로 로그 폴더를 띄워
  // 그 안의 파일을 그대로 문의에 첨부할 수 있게 한다. shell.openPath 는 Win/mac(intel·arm) 공통.
  ipcMain.handle("app:openLogsFolder", async () => {
    const dir = path.join(app.getPath("userData"), "logs");
    try {
      // 로그가 아직 없는 새 설치에서도 폴더가 열리도록 보장.
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // mkdir 실패해도 openPath 를 시도해 본다(이미 존재할 수 있음).
    }
    const error = await shell.openPath(dir); // 성공 시 빈 문자열, 실패 시 에러 메시지.
    return { ok: error === "", error: error || undefined, path: dir };
  });

  // 음성 미리듣기(샘플) 캐시 폴더 열기 — 미리듣기 재생 실패 문의 시, 재생에 실패한
  // 그 .wav 파일 자체를 사용자가 그대로 첨부할 수 있게 한다. shell.openPath 는 Win/mac(intel·arm) 공통.
  //
  // 뿌리를 paths.userData 로 잡는다(app.getPath 재호출 X) — 백엔드가 파일을 쓰는 storageDir
  // (youtube-manager 에 주입한 `path.join(paths.userData, "youtube", "storage")`)과 **같은 출처**라야
  // userData 파생식을 누가 바꿔도 '쓰는 경로'와 '여는 경로'가 절대 엇갈리지 않는다.
  ipcMain.handle("app:openTtsPreviewFolder", async () => {
    const dir = path.join(paths.userData, "youtube", "storage", "tts_preview");
    try {
      // 한 번도 미리듣기를 안 한 설치에서도 폴더가 열리도록 보장(빈 폴더면 '캐시 없음'이 곧 단서).
      fs.mkdirSync(dir, { recursive: true });
    } catch {
      // mkdir 실패해도 openPath 를 시도해 본다(이미 존재할 수 있음).
    }
    const error = await shell.openPath(dir); // 성공 시 빈 문자열, 실패 시 에러 메시지.
    return { ok: error === "", error: error || undefined, path: dir };
  });

  // §H publish 진행 상태 IPC — before-quit 모달 가드용. busyOps 와 별도.
  // 발행 라우트 진입 시 publish:start, 완료/실패/취소 시 publish:end.
  ipcMain.handle("publish:start", (_e, opId: string) => {
    if (typeof opId === "string" && opId.length > 0) publishingOps.add(opId);
  });
  ipcMain.handle("publish:end", (_e, opId: string) => {
    if (typeof opId === "string") publishingOps.delete(opId);
  });
  ipcMain.handle("publish:isActive", () => publishingOps.size > 0);

  ipcMain.handle("blogSplit:open", async (_e, url?: unknown) => openBlogSplitView(url));
  ipcMain.handle("blogSplit:close", () => {
    closeBlogSplitView();
  });
  ipcMain.handle("blogSplit:isOpen", () => isBlogSplitOpen());
  ipcMain.handle("blogSplit:getUrl", () => getBlogSplitUrl());
  ipcMain.handle("blogSplit:getZoom", () =>
    isBlogSplitOpen() ? blogSplitView!.webContents.getZoomFactor() : blogSplitZoomFactor,
  );
  ipcMain.handle("blogSplit:setZoom", (_e, factor: unknown) =>
    setBlogSplitZoom(typeof factor === "number" && Number.isFinite(factor) ? factor : 1),
  );
  ipcMain.handle("blogSplit:navigate", async (_e, action: unknown, url?: unknown) =>
    navigateBlogSplit(action, url),
  );
  ipcMain.handle("blogSplit:pasteProbe", async (_e, input: unknown) => runBlogSplitPasteProbe(input));
  ipcMain.handle("blogSplit:find", (_e, text: unknown, options: unknown) =>
    findInBlogSplit(text, options),
  );
  ipcMain.handle("blogSplit:stopFind", () => {
    stopBlogSplitFind();
  });
  ipcMain.handle("blogSplit:focusView", () => {
    focusBlogSplitView();
  });
  ipcMain.handle("blogSplit:setFindBarHeight", (_e, px: unknown) => {
    const next = Math.max(0, Math.round(Number(px) || 0));
    if (next === blogSplitFindBarHeight) return;
    blogSplitFindBarHeight = next;
    layoutBlogSplitView();
  });

  // 스플래시 → 실제 앱 화면으로 전환. (프로그램적 loadURL 은 will-navigate 가드를 거치지 않음)
  await win.loadURL(allowedOrigin);

  // 업데이트 모듈은 메인 윈도우가 살아있을 때 init.
  initUpdater(win);

  // 비밀번호 암호화 불가 안내는 앱이 보인 뒤에 표시 (부팅 경로를 막지 않도록 지연).
  if (!encryptionAvailable) {
    dialog.showErrorBox(
      "Blog Pick",
      "이 PC 에서 비밀번호 암호화 기능을 사용할 수 없습니다.\n" +
        "Windows 사용자 프로필에 문제가 있을 수 있습니다.\n" +
        "기존 계정의 비밀번호는 다시 입력해야 동작합니다.",
    );
  }
}
