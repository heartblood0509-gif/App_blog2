#!/usr/bin/env node
//
// scripts/check-youtube-flag-sync.js
//
// 유튜브 킬스위치(YOUTUBE_FEATURE_ENABLED)가 두 곳에서 같은 값인지 검사한다.
//   - frontend/src/lib/youtube-feature.ts  (Next 런타임/프록시 게이팅)
//   - electron/src/youtube-feature.ts       (Electron 메인 — 백엔드 spawn 차단)
//
// Electron(tsc -p electron)은 frontend/src 를 import 할 수 없어 값을 미러링한다.
// 불일치 시 "프론트는 OFF인데 Electron 은 백엔드를 띄움"(또는 그 반대) 사고가 나므로
// 빌드 전에 실패시킨다.
//
// build:electron 의 pre 훅(prebuild:electron)으로 자동 실행되며, 수동으로도:
//   node scripts/check-youtube-flag-sync.js
// (패턴은 scripts/sync-version.js 참고)

"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");

const FILES = {
  frontend: path.join(root, "frontend", "src", "lib", "youtube-feature.ts"),
  electron: path.join(root, "electron", "src", "youtube-feature.ts"),
};

function readFlag(label, file) {
  let src;
  try {
    src = fs.readFileSync(file, "utf8");
  } catch {
    console.error(`[check-youtube-flag-sync] FAIL: ${label} 파일을 읽을 수 없음: ${file}`);
    process.exit(1);
  }
  const m = src.match(/YOUTUBE_FEATURE_ENABLED\s*=\s*(true|false)\b/);
  if (!m) {
    console.error(
      `[check-youtube-flag-sync] FAIL: ${label} 에서 YOUTUBE_FEATURE_ENABLED 값을 찾지 못함: ${file}`,
    );
    process.exit(1);
  }
  return m[1] === "true";
}

const frontend = readFlag("frontend", FILES.frontend);
const electron = readFlag("electron", FILES.electron);

if (frontend !== electron) {
  console.error(
    `[check-youtube-flag-sync] FAIL: 킬스위치 불일치 — frontend=${frontend}, electron=${electron}\n` +
      `  두 파일의 YOUTUBE_FEATURE_ENABLED 를 같은 값으로 맞추세요:\n` +
      `   - ${FILES.frontend}\n` +
      `   - ${FILES.electron}`,
  );
  process.exit(1);
}

console.log(
  `[check-youtube-flag-sync] OK (YOUTUBE_FEATURE_ENABLED=${frontend}, 양쪽 일치)`,
);
