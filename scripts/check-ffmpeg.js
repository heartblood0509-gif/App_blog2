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

const { execFileSync } = require("node:child_process");

// 1) ffmpeg 실행 + libfreetype(텍스트 렌더 부품) 포함 여부 확인.
//    없으면 영상의 제목/자막(한글)이 □(글자 깨짐)로 박힌 채 출시된다. dev 는 시스템 ffmpeg 라
//    안 드러나고 배포본에서만 터지므로, 패키징 게이트에서 미리 막는다.
//    ⚠️ 릴리스 CI 는 각 OS 네이티브 러너에서 빌드하므로 바이너리는 반드시 실행 가능해야 한다.
//       실행 자체가 안 되면(아키텍처 불일치 등) 깨진 채 출시되므로 하드 페일한다(Codex 리뷰).
const ffmpegPath = path.join(dir, needed[0]);
let ffmpegOut;
try {
  ffmpegOut = execFileSync(ffmpegPath, ["-version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
} catch (e) {
  console.error(`\n[check-ffmpeg] build/ffmpeg/${needed[0]} 실행 실패: ${e.message}`);
  console.error("  → 아키텍처 불일치/손상 가능성. 빌드 OS 에 맞는(맥 arm64 / 윈도우 x64) 정적 빌드인지 확인하세요.\n");
  process.exit(1);
}
if (!/libfreetype/.test(ffmpegOut)) {
  console.error("\n[check-ffmpeg] 번들 ffmpeg 에 libfreetype 이 없습니다.");
  console.error("  → 영상의 제목/자막(한글)이 깨진 채(□) 출시됩니다.");
  console.error("  libfreetype 을 포함한 정적 빌드로 교체하세요.");
  console.error("  확인: `build/ffmpeg/ffmpeg -version | grep libfreetype`\n");
  process.exit(1);
}
console.log("[check-ffmpeg] ffmpeg 실행 OK + libfreetype 포함 (한글 자막/제목 렌더 가능)");

// 2) ffprobe 실행 확인(길이 추출·검증에 사용). 실행 안 되면 하드 페일.
const ffprobePath = path.join(dir, needed[1]);
try {
  execFileSync(ffprobePath, ["-version"], { stdio: ["ignore", "ignore", "ignore"] });
} catch (e) {
  console.error(`\n[check-ffmpeg] build/ffmpeg/${needed[1]} 실행 실패: ${e.message}`);
  console.error("  → ffprobe 가 없거나 아키텍처가 안 맞습니다. 영상 길이 추출/검증이 깨집니다.\n");
  process.exit(1);
}
console.log("[check-ffmpeg] ffprobe 실행 OK");

console.log("[check-ffmpeg] ffmpeg/ffprobe OK (build/ffmpeg)");
