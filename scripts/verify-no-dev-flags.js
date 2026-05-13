#!/usr/bin/env node
//
// §J — packaged 빌드의 main.js 안에 ALLOW_INSECURE_DEV_* 문자열이 없는지 검증.
// 만약 코드 어디선가 dev 플래그를 Electron 측에서 set 하도록 작성되었다면 fail.
//
// 사용:
//   node scripts/verify-no-dev-flags.js
//
// exit 0: 통과. exit 1: 위반 발견.

"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const target = path.join(root, "electron", "dist", "main.js");

if (!fs.existsSync(target)) {
  console.error(`[verify-no-dev-flags] FAIL: target not found: ${target}`);
  console.error("  (run `npm run build:electron` first)");
  process.exit(1);
}

const content = fs.readFileSync(target, "utf-8");
const forbidden = ["ALLOW_INSECURE_DEV_AUTH", "ALLOW_INSECURE_DEV_PW"];
const hits = forbidden.filter((flag) => content.includes(flag));

if (hits.length > 0) {
  console.error(`[verify-no-dev-flags] FAIL: forbidden flag(s) in main.js: ${hits.join(", ")}`);
  process.exit(1);
}

console.log(`[verify-no-dev-flags] PASS: no dev fallback flags in dist/main.js`);
