#!/usr/bin/env node
//
// scripts/dev-worktree.js
//
// 워크트리에서 로컬 dev 환경을 빠르게 셋업한다.
// 매번 사람(또는 Claude)이 직접 절차를 짜지 않고 한 줄로 끝내는 게 목적.
//
// 하는 일:
//   1) 메인 체크아웃의 의존성 디렉토리(node_modules, playwright-cache 등) 를 OS 별 최적 방식으로 빌려옴
//        - macOS  : `cp -cR` (APFS clone, CoW, 거의 즉시)
//        - Linux  : `cp -lR` (hardlink copy, 즉시)
//        - Windows: `mklink /J` (junction, 즉시; Turbopack 이 symlink 와 달리 진짜 dir 로 인식)
//        - 실패시 : `fs.cpSync(recursive)` 전체 복사 (느리지만 어디서나 동작)
//      → 진짜 디렉토리로 보이므로 Turbopack 이 reject 하지 않음. dev/prod 빌드 도구 parity 유지.
//      → playwright-cache 는 Electron dev 가 PLAYWRIGHT_BROWSERS_PATH 로 워크트리 경로를 주입하므로 필수.
//   2) frontend/.env.local 자동 생성
//        - 메인 .env.local 복사 + BACKEND_URL + ALLOW_INSECURE_DEV_AUTH 오버라이드
//        - 이미 있으면 건드리지 않음
//   3) 빈 포트 자동 선정 (8001 부터) → 다른 프로젝트가 8000 점유해도 충돌 없음
//   4) 백엔드/프론트엔드 기동 (또는 Electron 모드면 그쪽으로 위임)
//   5) 양쪽 READY 확인 후 URL 출력. Ctrl+C 로 종료시 자식 프로세스 정리.
//
// 사용:
//   node scripts/dev-worktree.js                # 웹 브라우저 테스트 (기본)
//   node scripts/dev-worktree.js --electron     # Electron 데스크톱 앱
//   node scripts/dev-worktree.js --main <path>  # 메인 체크아웃 경로 명시
//
// 호환: macOS / Linux / Windows (Git Bash, PowerShell, cmd 모두)

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const os = require("node:os");
const { spawn, spawnSync } = require("node:child_process");

// ─────────────────────────────────────────────────────── 인자 파싱
const argv = process.argv.slice(2);
const isElectron = argv.includes("--electron");
const mainArgIdx = argv.indexOf("--main");
const explicitMain = mainArgIdx >= 0 ? argv[mainArgIdx + 1] : null;

// ─────────────────────────────────────────────────────── 위치 확인
const worktreeRoot = findWorktreeRoot(process.cwd());
if (!worktreeRoot) die("이 스크립트는 워크트리 안(루트의 package.json 위치)에서 실행해야 합니다.");

const WORKTREE_MARKER = `${path.sep}.claude${path.sep}worktrees${path.sep}`;
if (!worktreeRoot.includes(WORKTREE_MARKER)) {
  console.log("[!] 워크트리가 아닙니다. 메인 체크아웃에서는 Electron 테스트면 `npm run dev`, 웹만이면 `./start.sh` 를 쓰세요.");
  process.exit(0);
}

const mainRoot = explicitMain
  ? path.resolve(explicitMain)
  : worktreeRoot.split(WORKTREE_MARKER)[0];
if (!fs.existsSync(path.join(mainRoot, "package.json"))) {
  die(`메인 체크아웃을 찾을 수 없습니다: ${mainRoot}\n  --main <path> 로 명시해주세요.`);
}

console.log(`[dev-worktree] worktree=${worktreeRoot}`);
console.log(`[dev-worktree] main    =${mainRoot}`);
console.log(`[dev-worktree] mode    =${isElectron ? "electron" : "web"}`);

// ─────────────────────────────────────────────────────── 메인 흐름
(async () => {
  // 1. 의존성 디렉토리 빌려오기 (node_modules + playwright-cache)
  await prepareDeps(mainRoot, worktreeRoot);

  if (isElectron) {
    // Electron dev: 자체 main.ts 가 빈 포트로 backend+frontend 를 orchestrate. 우리는 위임만.
    console.log("\n[dev-worktree] Electron 모드 — npm run dev 위임");
    const child = spawn(npmCmd(), ["run", "dev"], { cwd: worktreeRoot, stdio: "inherit", shell: process.platform === "win32" });
    wireExit(child);
    return;
  }

  // Web 모드: 백엔드 + 프론트 직접 기동
  const backendPort = await findFreePort(8001);
  const frontendPort = await findFreePort(3000);

  // 2. frontend/.env.local
  ensureEnvLocal(mainRoot, worktreeRoot, backendPort);

  // 3. 백엔드 기동
  console.log(`\n[dev-worktree] 백엔드 기동 (PORT=${backendPort})`);
  const backend = spawnBackend(worktreeRoot, backendPort);
  await waitForPort(backendPort, 30_000).catch(() => die("백엔드가 30초 안에 LISTEN 하지 못함"));

  // 4. 프론트 기동 (node_modules 가 symlink 면 webpack fallback, 진짜 dir 면 Turbopack)
  console.log(`\n[dev-worktree] 프론트 기동 (PORT=${frontendPort})`);
  const frontend = spawnFrontend(worktreeRoot, frontendPort, backendPort);

  // 5. 프론트 LISTEN 대기 + 안내
  await waitForPort(frontendPort, 60_000).catch(() => die("프론트가 60초 안에 LISTEN 하지 못함"));
  console.log("\n✓ dev-worktree READY");
  console.log(`   Backend  : http://localhost:${backendPort}`);
  console.log(`   Frontend : http://localhost:${frontendPort}`);
  console.log("   브라우저로 위 Frontend URL 접속 후 테스트하세요. Ctrl+C 로 종료.");

  wireExit(backend, frontend);
})().catch((e) => die(e.message || String(e)));

// ─────────────────────────────────────────────────────── 헬퍼

function die(msg) {
  console.error(`[dev-worktree] FATAL: ${msg}`);
  process.exit(1);
}

function findWorktreeRoot(from) {
  let dir = path.resolve(from);
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, "package.json")) && fs.existsSync(path.join(dir, "frontend"))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

async function prepareDeps(mainRoot, worktreeRoot) {
  // 메인 체크아웃에서 빌려올 의존성 디렉토리 목록.
  // - node_modules (root): Electron 빌드/spawn 에 필요
  // - frontend/node_modules: Next.js dev 서버에 필요
  // - playwright-cache: Electron dev 가 PLAYWRIGHT_BROWSERS_PATH 로 이 경로를 백엔드에 주입.
  //   없으면 발행 시 "Executable doesn't exist at .../chromium-XXXX/..." 로 실패.
  const sharedDeps = [
    { rel: "node_modules",          hint: "메인에서 `npm install` 실행 필요" },
    { rel: "frontend/node_modules", hint: "메인에서 `npm install --prefix frontend` 실행 필요" },
    { rel: "playwright-cache",      hint: "메인에서 `cd frontend && npx playwright install chromium` 실행 필요" },
  ];
  console.log("\n[dev-worktree] 의존성 디렉토리 준비");
  for (const { rel, hint } of sharedDeps) {
    const src = path.join(mainRoot, rel);
    const dst = path.join(worktreeRoot, rel);
    if (fs.existsSync(dst)) {
      console.log(`  ${rel}: 이미 존재 — 건너뜀`);
      continue;
    }
    if (!fs.existsSync(src)) {
      console.log(`  ${rel}: 메인에 없음 — 건너뜀 (${hint})`);
      continue;
    }
    const method = fastCopy(src, dst);
    console.log(`  ${rel}: ${method} 완료`);
  }
}

// OS 별 최적 빠른 복사. 진짜 디렉토리로 보이도록 (Turbopack 호환).
function fastCopy(src, dst) {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      const r = spawnSync("cp", ["-cR", src, dst], { stdio: "pipe" });
      if (r.status === 0) return "APFS clone";
    } else if (platform === "linux") {
      const r = spawnSync("cp", ["-lR", src, dst], { stdio: "pipe" });
      if (r.status === 0) return "hardlink";
    } else if (platform === "win32") {
      // mklink /J 는 admin 권한 불필요. junction 은 디렉토리 symlink 와 달리 진짜 dir 로 인식됨.
      // Git Bash / PowerShell / cmd 어디서든 cmd.exe 직접 호출.
      const r = spawnSync("cmd", ["/c", "mklink", "/J", dst, src], { stdio: "pipe" });
      if (r.status === 0) return "junction";
    }
  } catch (_) { /* fallthrough */ }
  // 폴백: 느리지만 어디서나 동작
  console.log(`  (fast copy 실패 — 전체 복사 폴백, 1~3분 소요)`);
  fs.cpSync(src, dst, { recursive: true });
  return "full copy";
}

function ensureEnvLocal(mainRoot, worktreeRoot, backendPort) {
  const dst = path.join(worktreeRoot, "frontend", ".env.local");
  if (fs.existsSync(dst)) {
    console.log(`\n[dev-worktree] frontend/.env.local 이미 존재 — 건너뜀`);
    return;
  }
  const src = path.join(mainRoot, "frontend", ".env.local");
  let base = "";
  if (fs.existsSync(src)) {
    base = fs.readFileSync(src, "utf8").trimEnd();
    console.log(`\n[dev-worktree] frontend/.env.local 생성 (메인 .env.local 복사 + 오버라이드)`);
  } else {
    console.log(`\n[dev-worktree] frontend/.env.local 생성 (메인에 .env.local 없음 — 기본값만)`);
    console.log(`  ⚠ GEMINI_API_KEY 등 개인 키는 직접 채워야 합니다.`);
  }
  const override = [
    "",
    "# worktree dev 모드 (auto-generated by scripts/dev-worktree.js)",
    `BACKEND_URL=http://localhost:${backendPort}`,
    "ALLOW_INSECURE_DEV_AUTH=1",
    "",
  ].join("\n");
  fs.writeFileSync(dst, base + override, "utf8");
}

function findFreePort(start) {
  return new Promise((resolve, reject) => {
    function tryPort(p) {
      if (p > start + 50) return reject(new Error(`free port not found near ${start}`));
      const srv = net.createServer();
      srv.once("error", () => tryPort(p + 1));
      srv.once("listening", () => srv.close(() => resolve(p)));
      srv.listen(p);
    }
    tryPort(start);
  });
}

function waitForPort(port, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      const sock = net.connect(port, "127.0.0.1");
      sock.once("connect", () => { sock.destroy(); resolve(); });
      sock.once("error", () => {
        sock.destroy();
        if (Date.now() - startedAt > timeoutMs) return reject(new Error(`port ${port} not ready in ${timeoutMs}ms`));
        setTimeout(check, 300);
      });
    }
    check();
  });
}

function spawnBackend(worktreeRoot, port) {
  const pythonCmd = process.platform === "win32" ? "python" : "python3";
  const env = {
    ...process.env,
    PORT: String(port),
    ALLOW_INSECURE_DEV_AUTH: "1",
    ALLOW_INSECURE_DEV_PW: "1",
  };
  return spawn(pythonCmd, ["main.py"], {
    cwd: path.join(worktreeRoot, "backend"),
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

function spawnFrontend(worktreeRoot, frontendPort, backendPort) {
  const frontendDir = path.join(worktreeRoot, "frontend");
  // node_modules 가 symlink (= 메인을 상대경로로 가리키는 경우) 면 Turbopack 이 거부 →  webpack 으로 폴백
  const nm = path.join(frontendDir, "node_modules");
  const useWebpack = isSymlink(nm);
  const args = ["next", "dev", "--port", String(frontendPort)];
  if (useWebpack) {
    args.push("--webpack");
    console.log("  (node_modules 가 symlink → Turbopack 호환을 위해 --webpack 모드)");
  }
  return spawn(npxCmd(), args, {
    cwd: frontendDir,
    env: { ...process.env, BACKEND_URL: `http://localhost:${backendPort}` },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

function isSymlink(p) {
  try { return fs.lstatSync(p).isSymbolicLink(); }
  catch { return false; }
}

function npmCmd() { return process.platform === "win32" ? "npm.cmd" : "npm"; }
function npxCmd() { return process.platform === "win32" ? "npx.cmd" : "npx"; }

function wireExit(...children) {
  let cleaning = false;
  const cleanup = (signal) => {
    if (cleaning) return;
    cleaning = true;
    console.log(`\n[dev-worktree] 종료 중 (${signal || "exit"})...`);
    for (const c of children) {
      if (c && !c.killed) {
        try { c.kill("SIGTERM"); } catch (_) { /* ignore */ }
      }
    }
    setTimeout(() => process.exit(0), 1500);
  };
  process.on("SIGINT", () => cleanup("SIGINT"));
  process.on("SIGTERM", () => cleanup("SIGTERM"));
  for (const c of children) {
    if (!c) continue;
    c.on("exit", (code) => {
      console.log(`[dev-worktree] 자식 프로세스 종료 (code=${code})`);
      cleanup("child-exit");
    });
  }
}
