// 챗봇 답변(마크다운)에서 URL·경로를 "안전하게" 클릭 링크로 만든다.
//
// 문제: react-markdown + remark-gfm 은 http(s)://·www. 만 자동 링크한다. 모델이
//   (A) 스킴 없이(aistudio.google.com/app)  (B) 백틱으로 감싸(`/help/api-key`)
//   (C) 한글을 붙여(https://…/docs에서) 쓰면 링크가 안 되거나 깨진다.
// 해결: remarkGfm "뒤"에 도는 mdast 변환 플러그인. AST 노드 타입으로 code/codeblock/
//   image/definition 은 자연히 보호되어 문자열 파싱 위험이 없다. 모든 링크 생성은
//   safeUrl() 을 통과(javascript:/data: 차단).

// remark 플러그인은 mdast 트리를 받는다. 외부 타입 의존을 피하려고 최소 노드 타입만 둔다.
interface MdNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MdNode[];
}

const ALLOWED_PROTOCOLS = ["http:", "https:", "mailto:"];

/** 허용 프로토콜(http/https/mailto)·내부 경로(/…)만 통과. 그 외는 null(차단). */
export function safeUrl(href: string): string | null {
  const h = (href || "").trim();
  if (!h) return null;
  if (h.startsWith("/")) return h; // 앱 내부 경로
  try {
    const u = new URL(h);
    return ALLOWED_PROTOCOLS.includes(u.protocol) ? h : null;
  } catch {
    return null;
  }
}

// 오탐(파일명·버전 등) 방지용 TLD 화이트리스트. 스킴이 있으면 이 목록과 무관하게 링크.
const TLDS = [
  "com", "net", "org", "io", "dev", "ai", "co", "kr", "app", "gov", "edu",
  "me", "info", "biz", "tv", "cc", "xyz", "page", "run", "sh", "gg", "us",
  "uk", "jp", "store", "blog", "site", "online", "cloud",
];

// 끝에 흡수되기 쉬운 한국어 조사(긴 것부터). URL 자체의 한글(IRI)은 안 건드리고 이것만 분리.
const KO_PARTICLES = [
  "이라고", "라고", "이라는", "라는", "으로", "로서", "로써", "에게", "께서",
  "처럼", "부터", "까지", "마저", "조차", "한테", "에서", "이나", "든지", "이든",
  "은", "는", "이", "가", "을", "를", "의", "에", "도", "만", "와", "과", "로",
  "요", "나",
];

const TLD_GROUP = TLDS.join("|");
// 스킴 URL | www. | 스킴 없는 도메인(+:port +/path? #frag). 도메인 라벨은 ASCII 만(한글 도메인/파일명 회피).
const URL_SCAN = new RegExp(
  `(?:https?:\\/\\/|www\\.)[^\\s<>]+` +
    `|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLD_GROUP})(?::\\d{1,5})?(?:[/?#][^\\s<>]*)?`,
  "gi"
);

function normalizeHref(token: string): string {
  if (/^https?:\/\//i.test(token)) return token;
  if (/^www\./i.test(token)) return `https://${token}`;
  if (token.startsWith("/")) return token;
  return `https://${token}`;
}

/** 매치된 raw 토큰 끝에서 한글 조사·문장부호·불균형 닫힘괄호를 잘라 순수 URL 부분만 남긴다. */
function trimTrailing(raw: string): string {
  let url = raw;
  for (;;) {
    let changed = false;
    // 끝 문장부호
    const punct = url.match(/[.,!?;:]+$/);
    if (punct) {
      url = url.slice(0, url.length - punct[0].length);
      changed = true;
    }
    // 불균형 닫힘 괄호/대괄호
    while (/[)\]}]$/.test(url)) {
      const open = (url.match(/[([{]/g) || []).length;
      const close = (url.match(/[)\]}]/g) || []).length;
      if (close > open) {
        url = url.slice(0, -1);
        changed = true;
      } else break;
    }
    // 끝 한국어 조사(알려진 것만)
    for (const p of KO_PARTICLES) {
      if (url.endsWith(p)) {
        url = url.slice(0, -p.length);
        changed = true;
        break;
      }
    }
    if (!changed) break;
  }
  return url;
}

interface UrlHit {
  start: number;
  end: number;
  display: string;
  href: string;
}

/** 텍스트에서 안전한 URL 후보들을 찾는다(이메일/단어 중간 회피, 트레일링 정리, safeUrl 통과만). */
export function findUrls(text: string): UrlHit[] {
  const hits: UrlHit[] = [];
  URL_SCAN.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = URL_SCAN.exec(text))) {
    const raw = m[0];
    const start = m.index;
    const hasScheme = /^(https?:\/\/|www\.)/i.test(raw);
    const prev = start > 0 ? text[start - 1] : "";
    if (prev === "@") continue; // 이메일 도메인부 회피
    if (!hasScheme && /[a-z0-9@._-]/i.test(prev)) continue; // 스킴 없는 도메인이 단어 중간이면 skip
    const url = trimTrailing(raw);
    if (!url || url.length < 4) continue;
    const href = safeUrl(normalizeHref(url));
    if (!href) continue;
    hits.push({ start, end: start + url.length, display: url, href });
  }
  return hits;
}

function linkNode(href: string, displayValue: string): MdNode {
  return { type: "link", url: href, title: null, children: [{ type: "text", value: displayValue }] };
}

/** text 노드 값을 [text, link, text, …] 노드 배열로 분할. */
function splitText(value: string): MdNode[] {
  const hits = findUrls(value);
  if (!hits.length) return [{ type: "text", value }];
  const out: MdNode[] = [];
  let pos = 0;
  for (const h of hits) {
    if (h.start > pos) out.push({ type: "text", value: value.slice(pos, h.start) });
    out.push(linkNode(h.href, h.display));
    pos = h.end;
  }
  if (pos < value.length) out.push({ type: "text", value: value.slice(pos) });
  return out;
}

const INTERNAL_PATH = /^\/[\w\-./?#=&%]*$/;

/** 인라인 코드 값 전체가 URL/도메인/내부경로면 link 노드로, 아니면 null(코드 유지). */
function inlineCodeToLink(value: string): MdNode | null {
  const v = value.trim();
  if (!v || /\s/.test(v)) return null; // 공백 있으면 진짜 코드
  if (INTERNAL_PATH.test(v)) {
    const href = safeUrl(v);
    if (href) return linkNode(href, value);
  }
  const hits = findUrls(v);
  if (hits.length === 1 && hits[0].start === 0 && hits[0].end === v.length) {
    return linkNode(hits[0].href, value);
  }
  return null;
}

/** gfm autolink 가 한글까지 흡수한 링크 보정. 라벨이 URL 형태일 때만(사람 텍스트 라벨은 제외). */
function fixLinkKorean(link: MdNode): MdNode[] {
  if (!link.children || link.children.length !== 1) return [link];
  const c = link.children[0];
  if (c.type !== "text" || !c.value) return [link];
  if (!/^(https?:\/\/|www\.|[a-z0-9-]+\.)/i.test(c.value)) return [link]; // 라벨이 URL형일 때만
  const trimmed = trimTrailing(c.value);
  if (trimmed === c.value || !trimmed) return [link];
  const rest = c.value.slice(trimmed.length);
  c.value = trimmed;
  const href = safeUrl(normalizeHref(trimmed));
  if (href) link.url = href;
  return [link, { type: "text", value: rest }];
}

function walk(node: MdNode): void {
  if (!node || !Array.isArray(node.children)) return;
  const isLinkParent = node.type === "link";
  const next: MdNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && !isLinkParent) {
      next.push(...splitText(child.value || ""));
    } else if (child.type === "inlineCode") {
      next.push(inlineCodeToLink(child.value || "") ?? child);
    } else if (child.type === "link") {
      walk(child); // 라벨 텍스트는 isLinkParent=true 라 분할 안 됨
      next.push(...fixLinkKorean(child));
    } else {
      walk(child);
      next.push(child);
    }
  }
  node.children = next;
}

/** remark 플러그인: remarkGfm "뒤"에 등록. */
export function remarkChatLinkify() {
  return (tree: MdNode): void => {
    walk(tree);
  };
}
