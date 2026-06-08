// 챗봇 지식 베이스 자동 생성기.
//
// /help 의 매뉴얼 페이지(JSX)에서 "사람이 읽는 텍스트"만 안전하게 추출해
// src/lib/chatbot/knowledge.generated.ts 를 만든다.
// → 매뉴얼을 고치면 이 스크립트만 다시 돌면 챗봇 지식도 자동으로 최신이 된다.
//
// 정규식 대신 TypeScript 파서(AST)를 써서 className 같은 노이즈는 빼고
// JSX 텍스트 + 의미 있는 문자열 prop(title/suffix/term/desc 등)만 모은다.
//
// 실행: node scripts/build-chatbot-knowledge.mjs  (predev / prebuild 에서 자동 실행)

import ts from "typescript";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const HELP_DIR = join(__dirname, "..", "src", "app", "help");
const OUT_FILE = join(
  __dirname,
  "..",
  "src",
  "lib",
  "chatbot",
  "knowledge.generated.ts"
);

// 값이 사람이 읽는 내용이 아니라 스타일/식별자인 attribute — 추출에서 제외.
const NOISE_ATTRS = new Set([
  "className",
  "id",
  "tone",
  "variant",
  "number",
  "step",
  "key",
  "href",
  "src",
  "lang",
  "aria-label",
  "role",
  "name",
]);

/** help 폴더에서 page.tsx 파일을 (경로 슬러그와 함께) 모은다. */
function collectHelpPages() {
  const pages = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        // _components 등 언더스코어 폴더는 매뉴얼 본문이 아니므로 제외.
        if (!entry.startsWith("_")) walk(full);
      } else if (entry === "page.tsx") {
        pages.push(full);
      }
    }
  }
  walk(HELP_DIR);
  return pages.sort();
}

/** 파일 절대경로 → /help/usage 같은 라우트 슬러그. */
function toRoute(filePath) {
  const rel = filePath
    .slice(HELP_DIR.length)
    .replace(/\\/g, "/")
    .replace(/\/page\.tsx$/, "");
  return "/help" + rel;
}

/** 한 파일에서 사람이 읽는 텍스트 조각을 순서대로 추출. */
function extractText(filePath) {
  const source = readFileSync(filePath, "utf8");
  const sf = ts.createSourceFile(
    filePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );

  const parts = [];

  // HTML 엔티티 디코드 + 노이즈 제거.
  const decode = (s) =>
    s
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&amp;/g, "&");
  // 구두점/기호만 있는 조각은 버린다(태그 분리로 생긴 ".", "·" 같은 파편).
  const isNoise = (s) => /^[.,·•\-–—:;]*$/.test(s);
  const push = (raw) => {
    const t = decode(raw).replace(/\s+/g, " ").trim();
    if (t && !isNoise(t)) parts.push(t);
  };

  function visit(node) {
    // import 문은 통째로 건너뛴다.
    if (ts.isImportDeclaration(node)) return;

    // 노이즈 attribute(className 등)는 값까지 통째로 스킵.
    if (ts.isJsxAttribute(node)) {
      const attrName = node.name.getText(sf);
      if (NOISE_ATTRS.has(attrName)) return;
    }

    // JSX 사이의 일반 텍스트.
    if (ts.isJsxText(node)) {
      push(node.text);
      return;
    }

    // 문자열 리터럴 (title="...", { term: "...", desc: "..." } 등).
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node)
    ) {
      push(node.text);
      return;
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);
  return parts;
}

function build() {
  const pages = collectHelpPages();
  const blocks = [];

  for (const file of pages) {
    const route = toRoute(file);
    const parts = extractText(file);
    if (parts.length === 0) continue;
    blocks.push(`## 도움말 페이지: ${route}\n${parts.join("\n")}`);
  }

  const manualText = blocks.join("\n\n");

  const banner =
    "// ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.\n" +
    "// 원본: src/app/help/**/page.tsx\n" +
    "// 재생성: node scripts/build-chatbot-knowledge.mjs\n";

  const body =
    banner +
    "\n/** /help 매뉴얼에서 자동 추출한 챗봇 지식 본문. */\n" +
    `export const HELP_MANUAL_TEXT = ${JSON.stringify(manualText)};\n`;

  writeFileSync(OUT_FILE, body, "utf8");
  console.log(
    `[build-chatbot-knowledge] ${pages.length}개 페이지 → ${manualText.length}자 추출 완료`
  );
}

build();
