#!/usr/bin/env node
// dev/build 시작 전 안전장치: package.json version과
// public/whats-new.json 최신 entry version이 일치하는지 검사.
// 불일치 시 빌드는 막지 않고 노란 경고만 출력 — 사용자가 깜빡 잊는 걸 방지.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const YELLOW = "\x1b[33m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

function warn(lines) {
  const bar = "─".repeat(60);
  console.warn(`\n${YELLOW}${bar}`);
  for (const line of lines) console.warn(`${YELLOW}${line}${RESET}`);
  console.warn(`${YELLOW}${bar}${RESET}\n`);
}

try {
  const pkg = JSON.parse(
    readFileSync(join(root, "package.json"), "utf8"),
  );
  const whatsNew = JSON.parse(
    readFileSync(join(root, "public/whats-new.json"), "utf8"),
  );

  const pkgVersion = pkg.version;
  const latestEntry = whatsNew.entries?.[0];
  const latestVersion = latestEntry?.version;

  if (!latestVersion) {
    warn([
      `${BOLD}⚠️  새 소식 안전장치${RESET}${YELLOW}`,
      `   whats-new.json 에 항목이 하나도 없어요.`,
      `   다음 패치 전에 최소 1개 항목을 채워주세요.`,
    ]);
    process.exit(0);
  }

  if (pkgVersion !== latestVersion) {
    warn([
      `${BOLD}⚠️  새 소식 빠짐 경고${RESET}${YELLOW}`,
      ``,
      `   package.json version : ${BOLD}${pkgVersion}${RESET}${YELLOW}`,
      `   whats-new.json 최신   : ${BOLD}${latestVersion}${RESET}${YELLOW}`,
      ``,
      `   두 버전이 다르면 사용자가 이번 업데이트 내역을 못 봐요.`,
      `   배포 전에 frontend/public/whats-new.json 맨 앞에`,
      `   v${pkgVersion} 항목을 추가해주세요.`,
      ``,
      `   (도움이 필요하면 Claude한테 "새 소식 추가해줘"라고 말하세요)`,
    ]);
  }
  // 일치하면 조용히 통과
} catch (err) {
  warn([
    `${BOLD}⚠️  새 소식 안전장치 실행 실패${RESET}${YELLOW}`,
    `   ${err.message}`,
    `   (체크는 실패했지만 빌드는 계속됩니다)`,
  ]);
}

process.exit(0);
