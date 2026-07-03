#!/usr/bin/env node
//
// scripts/check-title-font-sync.js
//
// 쇼츠 제목 폰트 id 집합이 백엔드/프론트에서 일치하는지 검사한다.
//   - youtube-backend/core/fonts.py       (BUNDLED_TITLE_FONTS, 렌더 시 폰트 경로 해석)
//   - frontend/src/lib/youtube/fonts.ts    (TITLE_FONTS, UI 그리드 + 미리보기)
//
// 두 파일은 서로 import 할 수 없어 id 를 각자 정의한다. 불일치 시 "UI엔 있는데 렌더가
// 폴백"(또는 그 반대) 사고가 나므로 빌드 전에 실패시킨다. (패턴: check-youtube-flag-sync.js)
//   node scripts/check-title-font-sync.js

"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const PY = path.join(root, "youtube-backend", "core", "fonts.py");
const TS = path.join(root, "frontend", "src", "lib", "youtube", "fonts.ts");

function read(label, file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    console.error(`[check-title-font-sync] FAIL: ${label} 파일을 읽을 수 없음: ${file}`);
    process.exit(1);
  }
}

// py: 최상위 폰트 id 는 4칸 들여쓰기 `    "id": {` 로만 나타난다(굵기 키는 12칸이라 제외).
function pyIds(src) {
  return new Set([...src.matchAll(/^ {4}"([^"]+)":\s*\{/gm)].map((m) => m[1]));
}
// ts: 폰트 id 는 4칸 들여쓰기 줄머리 `    id: "..."` 로만 나타난다(굵기 id 는 인라인이라 제외).
function tsIds(src) {
  return new Set([...src.matchAll(/^ {4}id:\s*"([^"]+)",/gm)].map((m) => m[1]));
}

const py = pyIds(read("backend", PY));
const ts = tsIds(read("frontend", TS));
if (py.size === 0 || ts.size === 0) {
  console.error("[check-title-font-sync] FAIL: 폰트 id 목록을 파싱하지 못함 (구조 변경?)");
  process.exit(1);
}

const onlyPy = [...py].filter((id) => !ts.has(id));
const onlyTs = [...ts].filter((id) => !py.has(id));
if (onlyPy.length || onlyTs.length) {
  console.error(
    "[check-title-font-sync] FAIL: 폰트 id 불일치\n" +
      (onlyPy.length ? `  백엔드에만: ${onlyPy.join(", ")}\n` : "") +
      (onlyTs.length ? `  프론트에만: ${onlyTs.join(", ")}\n` : "") +
      `  맞출 파일:\n   - ${PY}\n   - ${TS}`,
  );
  process.exit(1);
}

console.log(`[check-title-font-sync] OK — 폰트 id ${py.size}종 일치 (${[...py].join(", ")})`);
