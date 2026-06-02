#!/usr/bin/env node
//
// scripts/check-ffmpeg.js
//
// 배포 패키징(dist) 직전, youtube-backend(쇼츠 생성기)에 필요한 ffmpeg/ffprobe
// 바이너리가 build/ffmpeg/ 에 있는지 확인하는 fail-fast 게이트.
//
// 왜: 영상 합성·오디오 변환·BGM 검증이 ffmpeg/ffprobe 서브프로세스에 의존한다.
// 바이너리가 빠진 채 배포하면 "유튜브" 탭이 깨진 채 출시된다(Codex 리뷰 #3).
// 라이선스/용량 문제로 레포에는 포함하지 않으므로(직접 배치), 없으면 조용히 넘어가지
// 않고 빌드를 멈춘다. 상세 절차: youtube-backend/PACKAGING.md

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const isWin = process.platform === "win32";
const dir = path.join(__dirname, "..", "build", "ffmpeg");
const needed = isWin ? ["ffmpeg.exe", "ffprobe.exe"] : ["ffmpeg", "ffprobe"];

const missing = needed.filter((n) => !fs.existsSync(path.join(dir, n)));
if (missing.length) {
  console.error("\n[check-ffmpeg] 배포에 필요한 ffmpeg 바이너리가 없습니다:");
  for (const n of missing) console.error(`  - build/ffmpeg/${n}`);
  console.error("\n  youtube-backend(쇼츠 생성기)의 영상/오디오 처리에 필수입니다.");
  console.error("  플랫폼별 정적 빌드를 build/ffmpeg/ 에 넣은 뒤 다시 시도하세요.");
  console.error("  자세한 내용: youtube-backend/PACKAGING.md\n");
  process.exit(1);
}

// 유닉스: 실행 권한 확인.
if (!isWin) {
  for (const n of needed) {
    try {
      fs.accessSync(path.join(dir, n), fs.constants.X_OK);
    } catch {
      console.error(`[check-ffmpeg] 실행 권한 없음: build/ffmpeg/${n} — \`chmod +x\` 필요\n`);
      process.exit(1);
    }
  }
}

console.log("[check-ffmpeg] ffmpeg/ffprobe OK (build/ffmpeg)");
