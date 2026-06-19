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

// 1) ffmpeg 실행 확인(+ 버전 문자열 확보 — 아래 libx264 검사에 사용).
//    실행 자체가 안 되면(아키텍처 불일치 등) 깨진 채 출시되므로 하드 페일한다.
//    ⚠️ 릴리스 CI 는 각 OS 네이티브 러너에서 빌드하므로 바이너리는 반드시 실행 가능해야 한다.
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

// 1-a) drawtext 필터 존재를 직접 조회해 검증.
//    제목·자막을 영상에 입히는 필수 필터(libfreetype 으로 빌드돼야 존재). 없으면 영상 제작이
//    "No such filter: 'drawtext'" 로 **전면 실패**한다 — 글자가 □ 로 깨지는 게 아니라 영상 자체가
//    안 나온다(Codex 리뷰 #5). dev 는 시스템 ffmpeg 라 안 드러나고 배포본에서만 터지므로 여기서 막는다.
//    `-version` 의 'libfreetype' 문자열 추정보다 필터를 직접 조회하는 게 정확하다(Codex 리뷰 #1).
let filtersOut;
try {
  filtersOut = execFileSync(ffmpegPath, ["-hide_banner", "-filters"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
} catch (e) {
  console.error(`\n[check-ffmpeg] build/ffmpeg/${needed[0]} -filters 조회 실패: ${e.message}\n`);
  process.exit(1);
}
if (!/\bdrawtext\b/.test(filtersOut)) {
  console.error("\n[check-ffmpeg] 번들 ffmpeg 에 drawtext 필터가 없습니다(libfreetype 미포함 빌드).");
  console.error("  → 제목/자막 입히는 단계에서 \"No such filter: 'drawtext'\" 로 영상 제작이 전면 실패합니다.");
  console.error("    (글자가 □ 로 나오는 게 아니라 영상 자체가 안 만들어집니다.)");
  console.error("  libfreetype 을 포함한 정적 빌드로 교체하세요.");
  console.error("  확인: `build/ffmpeg/ffmpeg -h filter=drawtext` (Unknown filter 가 안 떠야 정상)\n");
  process.exit(1);
}
console.log("[check-ffmpeg] drawtext 필터 OK (제목/자막 렌더 가능)");

// 1-b) libx264(H.264 인코더) 포함 여부. LGPL 빌드엔 libx264 가 없어 영상 인코딩이 전부 실패한다
//      (AI 클립 처리·합치기·자막 입히기 모두 -c:v libx264 사용 → 윈도우 영상생성 불가, 0.3.0 버그).
//      dev 시스템 ffmpeg 엔 보통 있어 안 드러나고 배포본(win64-lgpl)에서만 터지므로 여기서 막는다.
if (!/libx264/.test(ffmpegOut)) {
  console.error("\n[check-ffmpeg] 번들 ffmpeg 에 libx264(H.264 인코더) 가 없습니다.");
  console.error("  → 영상 인코딩(클립 처리·합치기·자막)이 전부 실패합니다.");
  console.error("  GPL 정적 빌드로 교체하세요 (LGPL 빌드엔 libx264 가 없음).");
  console.error("  확인: `build/ffmpeg/ffmpeg -version | grep libx264`\n");
  process.exit(1);
}
console.log("[check-ffmpeg] libx264(H.264 인코더) 포함 (영상 인코딩 가능)");

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
