#!/usr/bin/env node
//
// scripts/sync-version.js
//
// 루트 package.json 의 version 을
//   frontend/package.json 와 backend/version.txt 로 전파한다.
//
// 사용:
//   - `npm version patch` 한 줄로 모든 버전 일괄 갱신을 위해 루트 package.json 의
//     scripts.version 훅에 연결되어 있다(`npm version` 흐름의 'version' 단계 — 버전이 이미
//     bump 된 직후, git commit/tag 직전).
//   - 또는 수동으로: `node scripts/sync-version.js`
//
// electron-updater 의 SoT 는 루트 package.json 이므로, 이 스크립트는 단일 방향(루트 → 자식).

"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const rootPkgPath = path.join(root, "package.json");
const rootPkg = JSON.parse(fs.readFileSync(rootPkgPath, "utf8"));
const version = rootPkg.version;

if (!version || typeof version !== "string") {
  console.error(`[sync-version] FAIL: 루트 package.json 의 version 이 비어있음`);
  process.exit(1);
}

let changed = 0;

// 1) frontend/package.json
{
  const p = path.join(root, "frontend", "package.json");
  const pkg = JSON.parse(fs.readFileSync(p, "utf8"));
  if (pkg.version !== version) {
    pkg.version = version;
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + "\n");
    console.log(`[sync-version] frontend/package.json -> ${version}`);
    changed++;
  }
}

// 2) backend/version.txt
{
  const p = path.join(root, "backend", "version.txt");
  const existing = fs.existsSync(p) ? fs.readFileSync(p, "utf8").trim() : null;
  if (existing !== version) {
    fs.writeFileSync(p, version + "\n");
    console.log(`[sync-version] backend/version.txt -> ${version}`);
    changed++;
  }
}

console.log(`[sync-version] OK (${version}, changed=${changed})`);
