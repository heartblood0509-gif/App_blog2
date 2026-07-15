#!/usr/bin/env node
//
// scripts/dev-worktree.js
//
// 워크트리에서 로컬 dev 환경을 빠르게 셋업한다.
// 매번 사람(또는 Claude)이 직접 절차를 짜지 않고 한 줄로 끝내는 게 목적.
//
// 하는 일:
//   1) 의존성 준비 — "메인과 같으면 빌려 쓰고(연결), 이 브랜치에서 바꿨으면 그것만 새로"
//        판단 기준 = 부품 목록 파일이 메인과 글자까지 같은가 (package-lock.json / requirements.txt).
//        메인이 다른 브랜치라 부품이 다르면 "다름"으로 판정 → 알아서 새로 설치(오설치 원천 차단).
//        순차 테스트(동시에 여러 dev 안 띄움) 워크플로우에 맞춘 설계 — 디스크·시간 절약.
//        - JS(frontend·루트) : lockfile 같으면 메인 node_modules 를 symlink 로 빌림, 다르면 `npm ci`
//        - electron 바이너리 : 새로 설치했는데 깨졌으면(npm allow-scripts 차단 등) 메인에서 자동 복구
//        - Python(backend)   : requirements 같으면 전역에 이미 있다고 보고 건너뜀, 다르면 설치(PEP668 우회)
//        - Playwright chromium: 메인 playwright-cache 를 symlink 로 빌림 → 재다운로드 0
//        - youtube-backend venv: requirements 같으면 메인 .venv 빌림, 다르면 새로
//   2) frontend/.env.local 자동 생성 (메인 복사 + BACKEND_URL/ALLOW_INSECURE_DEV_AUTH 오버라이드, idempotent)
//   3) 빈 포트 자동 선정 (8001 부터) → 다른 프로젝트가 8000 점유해도 충돌 없음
//   4) 백엔드/프론트엔드 기동 (또는 Electron 모드면 그쪽으로 위임)
//   5) 양쪽 READY 확인 후 URL 출력. Ctrl+C 로 종료시 자식 프로세스 정리.
//
// 빌려오기(symlink)라 문제가 생기면(메인에 없음/버전 다름 등) 자동으로 "직접 설치"로 폴백한다 → 멈춤 없음.
//
// 사용:
//   node scripts/dev-worktree.js                # 웹 브라우저 테스트 (기본, 빌려오기)
//   node scripts/dev-worktree.js --electron     # Electron 데스크톱 앱
//   node scripts/dev-worktree.js --fresh        # 빌려오지 않고 전부 새로 설치 (예전 완전 격리 방식)
//   node scripts/dev-worktree.js --deps-only    # JS 의존성(frontend + 루트)만 준비하고 종료 (서버/Python 생략)
//                                               #   → typecheck/lint(프론트·electron) 처럼 서버 없이 빠른 사전점검만 할 때
//   node scripts/dev-worktree.js --build        # 프론트 프로덕션 빌드만 (next build, 심링크면 자동 --webpack)
//                                               #   → PR 직전 "출시 형태 조립 가능?" 게이트. `npm run build:worktree` 로도 호출
//   node scripts/dev-worktree.js --main <path>  # 메인 체크아웃 경로 명시
//   node scripts/dev-worktree.js --frontend-port 3006 --backend-port 8006  # 포트 강제 지정 (선택)
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
// JS 의존성만 빌려오고 종료 (typecheck/lint 용 — 서버 기동·Python 설치 생략)
const depsOnly = argv.includes("--deps-only");
// 프론트 프로덕션 빌드만 하고 종료 (PR 직전 "출시 형태 조립 가능?" 게이트).
// 워크트리는 node_modules 가 메인 심링크라 Turbopack 이 거부 → dev 와 동일하게 자동 --webpack.
const isBuild = argv.includes("--build");
// 완전 격리: 메인에서 빌려오지 않고 워크트리에 전부 새로 설치(예전 방식). 기본은 "빌려오기".
const noBorrow = argv.includes("--fresh");
const mainArgIdx = argv.indexOf("--main");
const explicitMain = mainArgIdx >= 0 ? argv[mainArgIdx + 1] : null;
// 포트 강제 지정 (선택). 미지정 시 빈 포트 자동 검색.
const fePortIdx = argv.indexOf("--frontend-port");
const explicitFrontendPort = fePortIdx >= 0 ? Number(argv[fePortIdx + 1]) : null;
const bePortIdx = argv.indexOf("--backend-port");
const explicitBackendPort = bePortIdx >= 0 ? Number(argv[bePortIdx + 1]) : null;

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
  // 1. 의존성 준비 (메인에서 빌려오거나, 바뀐 것만 새로 설치)
  await prepareDeps(worktreeRoot, mainRoot);

  if (depsOnly) {
    console.log("\n✓ dev-worktree --deps-only 완료 (서버 미기동). typecheck/lint 실행 가능.");
    return;
  }

  if (isBuild) {
    // PR 직전 게이트: 프론트 프로덕션 빌드만. 서버는 안 띄운다.
    runFrontendBuild(worktreeRoot);
    return;
  }

  if (isElectron) {
    // Electron dev: 자체 main.ts 가 빈 포트로 backend+frontend 를 orchestrate. 우리는 위임만.
    console.log("\n[dev-worktree] Electron 모드 — npm run dev 위임");
    const child = spawn(npmCmd(), ["run", "dev"], { cwd: worktreeRoot, stdio: "inherit", shell: process.platform === "win32" });
    wireExit(child);
    return;
  }

  // Web 모드: 백엔드 + 프론트 직접 기동
  //
  // 포트 결정 우선순위:
  //   1. CLI 인자(--frontend-port / --backend-port) — 명시적 지정 시 즉시 실패 가능
  //   2. PORT 환경변수 (frontend만) — Claude Code preview_start autoPort 호환
  //   3. findFreePort 자동 탐색
  const backendPort = explicitBackendPort
    ? await ensurePortFree(explicitBackendPort, "백엔드")
    : await findFreePort(8001);
  const frontendPort = explicitFrontendPort
    ? await ensurePortFree(explicitFrontendPort, "프론트엔드")
    : process.env.PORT
    ? Number.parseInt(process.env.PORT, 10)
    : await findFreePort(3000);

  // 2. frontend/.env.local
  ensureEnvLocal(mainRoot, worktreeRoot, backendPort);

  // 3. 백엔드 기동
  console.log(`\n[dev-worktree] 백엔드 기동 (PORT=${backendPort})`);
  const backend = spawnBackend(worktreeRoot, backendPort);
  await waitForPort(backendPort, 30_000).catch(() => die("백엔드가 30초 안에 LISTEN 하지 못함"));

  // 3-2. youtube-backend(쇼츠 생성기) 기동. 웹 모드엔 Electron NextServer 가 없으므로
  //      여기서 직접 띄우고 YOUTUBE_BACKEND_URL 을 프론트 env 로 주입한다.
  //      킬스위치 OFF면 띄우지 않는다 — Electron 메인과 동일하게 맞춰 혼란을 막는다.
  let youtube = null;
  let youtubeUrl = null;
  if (
    youtubeFeatureEnabled(worktreeRoot) &&
    fs.existsSync(path.join(worktreeRoot, "youtube-backend", "main.py"))
  ) {
    const youtubePort = await findFreePort(8101);
    youtubeUrl = `http://127.0.0.1:${youtubePort}`;
    console.log(`\n[dev-worktree] youtube-backend 기동 (PORT=${youtubePort})`);
    youtube = spawnYoutubeBackend(worktreeRoot, youtubePort);
    await waitForPort(youtubePort, 90_000).catch(() =>
      die("youtube-backend 가 90초 안에 LISTEN 하지 못함 (의존성 설치/임포트 확인)")
    );
  }

  // 4. 새 소식 안전장치: package.json version 과 whats-new.json 최신 버전 일치 검사 (경고만)
  runWhatsNewCheck(worktreeRoot);

  // 5. 프론트 기동 (node_modules 가 symlink 면 webpack fallback, 진짜 dir 면 Turbopack)
  console.log(`\n[dev-worktree] 프론트 기동 (PORT=${frontendPort})`);
  const frontend = spawnFrontend(worktreeRoot, frontendPort, backendPort, youtubeUrl);

  // 5. 프론트 LISTEN 대기 + 안내
  await waitForPort(frontendPort, 60_000).catch(() => die("프론트가 60초 안에 LISTEN 하지 못함"));
  console.log("\n✓ dev-worktree READY");
  console.log(`   Backend  : http://localhost:${backendPort}`);
  if (youtubeUrl) console.log(`   YouTube  : ${youtubeUrl}`);
  console.log(`   Frontend : http://localhost:${frontendPort}`);
  console.log("   브라우저로 위 Frontend URL 접속 후 테스트하세요. Ctrl+C 로 종료.");

  wireExit(backend, frontend, youtube);
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

async function prepareDeps(worktreeRoot, mainRoot) {
  // 순차 테스트 워크플로우 최적화: "메인과 같으면 빌려 쓰고(연결), 이 브랜치에서 바꿨으면 그것만 새로".
  //   판단 기준 = 부품 목록 파일(package-lock.json / requirements.txt)이 메인과 글자까지 같은가.
  //   메인이 다른 브랜치라 부품이 다르면 → "다름"으로 판정돼 알아서 새로 설치(오설치 원천 차단).
  //   --fresh 면 빌려오지 않고 전부 새로 설치(예전 완전 격리 방식).
  const pythonCmd = process.platform === "win32" ? "python" : "python3";

  // frontend 는 typecheck/lint/dev 모두 필요하므로 항상 준비.
  console.log("\n[dev-worktree] JS 의존성 준비 (frontend)");
  prepareNodeModules(path.join(worktreeRoot, "frontend"), path.join(mainRoot, "frontend"), "frontend");

  // --build(프론트 프로덕션 빌드)는 frontend 만으로 충분 — 루트·Python·youtube 생략.
  if (isBuild) return;

  // 루트(Electron 빌드·spawn, cross-env 등). --deps-only(typecheck/lint)도 electron/ 을 검사하므로
  // 루트 node_modules(electron 타입 등)가 필요하다 → frontend 다음에 항상 준비한다.
  console.log("\n[dev-worktree] JS 의존성 준비 (루트)");
  prepareNodeModules(worktreeRoot, mainRoot, "루트");
  // electron 바이너리가 설치 스크립트 차단(npm allow-scripts) 등으로 깨졌으면 메인에서 자동 복구.
  ensureElectronBinary(worktreeRoot, mainRoot);

  // --deps-only(typecheck/lint): 여기까지(frontend + 루트 JS)면 충분 — Python·youtube·ffmpeg 생략.
  if (depsOnly) return;

  // Python(backend) 의존성 — requirements 가 메인과 같으면 전역에 이미 있다고 보고 건너뜀.
  preparePythonDeps(worktreeRoot, mainRoot, pythonCmd);

  // 발행용 Playwright 크로미움 — 메인 캐시를 빌려 씀(재다운로드 0).
  ensurePlaywrightChromium(worktreeRoot, mainRoot, pythonCmd);

  // youtube-backend venv — requirements 같으면 메인 venv 빌리고, 다르면 새로.
  setupYoutubeVenv(worktreeRoot, mainRoot);

  // 번들 ffmpeg(drawtext/libx264 포함 정적 빌드) — 메인 build/ffmpeg 를 빌려 씀.
  // 없으면 electron paths.ts 가 시스템 PATH 로 폴백하는데, brew ffmpeg 엔 drawtext 가 빠져
  // 영상 마지막 자막/제목(drawtext) 단계에서 "No such filter: 'drawtext'" 로 실패한다.
  ensureBundledFfmpeg(worktreeRoot, mainRoot);
}

// build/ffmpeg: 메인의 번들 ffmpeg/ffprobe(정적 빌드)를 워크트리로 심링크로 빌려온다.
// electron paths.ts 는 <root>/build/ffmpeg/ffmpeg 존재 시 그것을 FFMPEG_BIN 으로 주입한다(=배포본과 동일).
function ensureBundledFfmpeg(worktreeRoot, mainRoot) {
  console.log("\n[dev-worktree] 번들 ffmpeg 준비 (build/ffmpeg)");
  const mainFfmpeg = path.join(mainRoot, "build", "ffmpeg");
  if (!fs.existsSync(mainFfmpeg)) {
    console.log("  메인에 build/ffmpeg 없음 → 시스템 PATH 사용(주의: brew ffmpeg 는 drawtext 누락 가능)");
    return;
  }
  fs.mkdirSync(path.join(worktreeRoot, "build"), { recursive: true });
  const wtFfmpeg = path.join(worktreeRoot, "build", "ffmpeg");
  if (!linkFromMain(wtFfmpeg, mainFfmpeg, "번들 ffmpeg")) {
    console.log("  연결 실패 → 시스템 PATH 폴백(자막 단계 실패 가능)");
  }
}

// ── 빌려오기(symlink) 공용 유틸 ──────────────────────────────

// 두 파일 내용이 완전히 같은지. 한쪽이라도 없으면 false(=다름 → 새로 설치).
function filesEqual(a, b) {
  try {
    return fs.readFileSync(a, "utf8") === fs.readFileSync(b, "utf8");
  } catch {
    return false;
  }
}

// target 이 이미 source 를 가리키는 심링크인지.
function isLinkTo(target, source) {
  try {
    return (
      fs.lstatSync(target).isSymbolicLink() &&
      fs.realpathSync(target) === fs.realpathSync(source)
    );
  } catch {
    return false;
  }
}

// 메인(source)을 target 에 심링크로 빌려온다. 성공 시 true.
// 메인에 원본이 없거나 연결이 실패하면 false → 호출측이 직접 설치로 폴백.
function linkFromMain(target, source, label) {
  if (!fs.existsSync(source)) return false;
  if (isLinkTo(target, source)) {
    console.log(`  ${label}: 메인 것 사용중(연결 유지)`);
    return true;
  }
  try {
    fs.rmSync(target, { recursive: true, force: true });
  } catch {
    /* 없으면 무시 */
  }
  try {
    fs.symlinkSync(source, target, "dir");
  } catch (e) {
    console.log(`  ${label}: 연결 실패(${e.message}) → 직접 설치로 전환`);
    return false;
  }
  console.log(`  ${label}: 메인에서 빌림(연결 생성)`);
  return true;
}

// node_modules: lockfile 이 메인과 같으면 빌리고(연결), 다르면 새로 설치.
function prepareNodeModules(dir, mainDir, label) {
  const nm = path.join(dir, "node_modules");
  const mainNm = path.join(mainDir, "node_modules");
  const same = filesEqual(
    path.join(dir, "package-lock.json"),
    path.join(mainDir, "package-lock.json"),
  );
  if (!noBorrow && same && fs.existsSync(mainNm)) {
    if (linkFromMain(nm, mainNm, `${label} node_modules`)) return;
  }
  // 새로 설치: 연결(symlink)이 남아있으면 먼저 제거(실디렉토리는 npm 이 갱신).
  if (isSymlink(nm)) {
    try {
      fs.rmSync(nm, { force: true });
    } catch {
      /* 무시 */
    }
  }
  if (noBorrow) console.log(`  ${label}: --fresh → 새로 설치`);
  else if (!same) console.log(`  ${label}: 의존성이 메인과 달라 새로 설치`);
  else console.log(`  ${label}: 메인에 node_modules 없음 → 새로 설치`);
  runNpmInstall(dir, label);
}

function readPkgVersion(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")).version;
  } catch {
    return null;
  }
}

// electron 바이너리가 깨졌으면(설치 스크립트 차단 등으로 path.txt 미생성) 메인에서 복구.
// node_modules 를 빌려온 경우엔 메인 것을 그대로 쓰므로 해당 없음.
function ensureElectronBinary(worktreeRoot, mainRoot) {
  const nm = path.join(worktreeRoot, "node_modules");
  if (isSymlink(nm)) return; // 루트 node_modules 를 빌림 → electron 도 메인 것 → OK
  const wtEl = path.join(nm, "electron");
  if (!fs.existsSync(wtEl)) return; // electron 의존성 없음
  if (fs.existsSync(path.join(wtEl, "path.txt"))) return; // 정상 설치됨

  const mainEl = path.join(mainRoot, "node_modules", "electron");
  const wtVer = readPkgVersion(wtEl);
  const mainVer = readPkgVersion(mainEl);
  const mainDist = path.join(mainEl, "dist");
  const mainPathTxt = path.join(mainEl, "path.txt");
  if (wtVer && mainVer && wtVer === mainVer && fs.existsSync(mainDist) && fs.existsSync(mainPathTxt)) {
    console.log(`  electron 바이너리 깨짐 → 메인에서 복구(v${mainVer} 복사)`);
    try {
      const wtDist = path.join(wtEl, "dist");
      fs.rmSync(wtDist, { recursive: true, force: true });
      // ⚠️ macOS 의 Electron.app 은 프레임워크 내부에 심볼릭 링크(Versions/Current, Resources 등)를 쓴다.
      // fs.cpSync 기본값은 심링크를 '역참조'해 실제 파일로 복사 → 링크 구조가 깨져 부팅 시
      // "icudtl.dat not found / Invalid file descriptor to ICU data → SIGTRAP" 로 즉사한다.
      // darwin 은 앱 번들 복사에 정확한 ditto(심링크·서명·리소스포크 보존)를 쓰고, 그 외엔 verbatimSymlinks.
      if (process.platform === "darwin") {
        const d = spawnSync("ditto", [mainDist, wtDist], { stdio: "inherit" });
        if (d.status !== 0) {
          throw new Error(`ditto 실패 (code=${d.status ?? d.error?.message})`);
        }
      } else {
        fs.cpSync(mainDist, wtDist, { recursive: true, verbatimSymlinks: true });
      }
      fs.copyFileSync(mainPathTxt, path.join(wtEl, "path.txt"));
    } catch (e) {
      console.log(`  ⚠ electron 복구 실패: ${e.message} — 수동: node node_modules/electron/install.js`);
    }
  } else {
    console.log("  ⚠ electron 바이너리 없음 + 메인에서 복구 불가(버전 불일치/부재) — 수동 확인 필요");
  }
}

// Python(backend) 의존성 — 전역(user site)에 설치되며 모든 워크트리·메인이 공유.
// requirements 가 메인과 같으면 이미 설치돼 있다고 보고 건너뛴다(빠름). 다르면 설치.
function preparePythonDeps(worktreeRoot, mainRoot, pythonCmd) {
  const same = filesEqual(
    path.join(worktreeRoot, "backend", "requirements.txt"),
    path.join(mainRoot, "backend", "requirements.txt"),
  );
  if (!noBorrow && same) {
    console.log("\n[dev-worktree] Python 의존성: 메인과 동일 — 건너뜀(전역에 이미 설치됨)");
    return;
  }
  console.log("\n[dev-worktree] Python 의존성 설치 (backend/requirements.txt)");
  const pipArgs = ["-m", "pip", "install", "-r", "backend/requirements.txt"];
  const pipOpts = { cwd: worktreeRoot, stdio: "inherit", shell: process.platform === "win32" };
  let r = spawnSync(pythonCmd, pipArgs, pipOpts);
  if (r.status !== 0) {
    // Python 3.14+/Homebrew 등 PEP 668 "externally-managed" 환경에서는 시스템 python 에
    // 직접 pip install 이 거부된다. 사용자 사이트(--user)에 PEP 668 가드만 우회 설치.
    console.log("  pip install 거부됨 → --user --break-system-packages 로 재시도 (PEP 668 우회)");
    r = spawnSync(pythonCmd, [...pipArgs, "--user", "--break-system-packages"], pipOpts);
  }
  if (r.status !== 0) {
    die(`pip install 실패 — 수동으로 \`${pythonCmd} -m pip install -r backend/requirements.txt\` 실행 후 다시 시도`);
  }
}

// package-lock.json 있으면 npm ci(정확 재현), 없으면 npm install 폴백.
function runNpmInstall(dir, label) {
  if (!fs.existsSync(path.join(dir, "package.json"))) {
    console.log(`  ${label}: package.json 없음 — 건너뜀`);
    return;
  }
  const hasLock = fs.existsSync(path.join(dir, "package-lock.json"));
  const sub = hasLock ? "ci" : "install";
  if (!hasLock) console.log(`  ${label}: package-lock.json 없음 → npm install 로 대체`);
  console.log(`  ${label}: npm ${sub} …`);
  const r = spawnSync(npmCmd(), [sub], {
    cwd: dir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) die(`${label} npm ${sub} 실패: ${dir}`);
}

// 발행용 크로미움. 기본은 메인 playwright-cache 를 빌려 씀(연결) → 재다운로드 0.
// 런타임(electron paths.ts, backend)이 워크트리 경로(playwright-cache)를 보는데, 그게 메인을 가리키게 된다.
// install 은 그 경로에 idempotent — 있으면 즉시 통과, 버전 다르거나 캐시 손상 시만 내려받는다.
function ensurePlaywrightChromium(worktreeRoot, mainRoot, pythonCmd) {
  const wtCache = path.join(worktreeRoot, "playwright-cache");
  const mainCache = path.join(mainRoot, "playwright-cache");
  console.log("\n[dev-worktree] 발행용 Playwright 크로미움 확인");
  if (!noBorrow && linkFromMain(wtCache, mainCache, "playwright 브라우저")) {
    // wtCache 가 이제 메인 캐시를 가리킴 (아래 install 은 메인 캐시에 idempotent).
  } else if (isSymlink(wtCache)) {
    // 빌리기 불가(--fresh 이거나 메인 캐시 없음) → 남은 연결 제거하고 워크트리-로컬에 설치.
    try {
      fs.rmSync(wtCache, { force: true });
    } catch {
      /* 무시 */
    }
  }
  const r = spawnSync(pythonCmd, ["-m", "playwright", "install", "chromium"], {
    cwd: worktreeRoot,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, PLAYWRIGHT_BROWSERS_PATH: wtCache },
  });
  if (r.status !== 0) {
    die(`playwright 크로미움 설치 실패 — 수동: PLAYWRIGHT_BROWSERS_PATH="${wtCache}" ${pythonCmd} -m playwright install chromium`);
  }
}

// youtube-backend 는 Python >=3.10 필요 (fastapi>=0.135 등). 시스템 python3 가 3.9 처럼
// 낮을 수 있으므로 적합한 인터프리터를 탐색한다. 없으면 null.
function findYoutubePython() {
  const candidates =
    process.platform === "win32"
      ? ["python3.13", "python3.12", "python3.11", "python3.10", "python"]
      : ["python3.13", "python3.12", "python3.11", "python3.10", "python3"];
  for (const cmd of candidates) {
    const r = spawnSync(cmd, ["-c", "import sys;print(sys.version_info[0],sys.version_info[1])"], {
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    if (r.status === 0 && r.stdout) {
      const [maj, min] = r.stdout.trim().split(/\s+/).map(Number);
      if (maj > 3 || (maj === 3 && min >= 10)) return cmd;
    }
  }
  return null;
}

// youtube-backend venv. requirements 가 메인과 같으면 메인 .venv 를 빌리고(연결),
// 다르면 워크트리에 새로 만든다. (venv 는 원본 위치의 절대경로를 쓰므로, 연결로 빌려도
//  메인 .venv 를 그대로 실행하는 셈이라 안전.)
function setupYoutubeVenv(worktreeRoot, mainRoot) {
  const ytDir = path.join(worktreeRoot, "youtube-backend");
  if (!fs.existsSync(path.join(ytDir, "requirements.txt"))) {
    console.log("\n[dev-worktree] youtube-backend 없음 — 건너뜀");
    return;
  }
  const wtVenv = path.join(ytDir, ".venv");
  const mainYtDir = path.join(mainRoot, "youtube-backend");
  const same = filesEqual(
    path.join(ytDir, "requirements.txt"),
    path.join(mainYtDir, "requirements.txt"),
  );
  if (!noBorrow && same && fs.existsSync(path.join(mainYtDir, ".venv"))) {
    if (linkFromMain(wtVenv, path.join(mainYtDir, ".venv"), "youtube .venv")) return;
  }
  // 새로: 연결이 남아있으면 제거 후 venv 생성 + 설치.
  if (isSymlink(wtVenv)) {
    try {
      fs.rmSync(wtVenv, { force: true });
    } catch {
      /* 무시 */
    }
  }
  const venvPython = youtubeVenvPython(worktreeRoot);
  if (!fs.existsSync(venvPython)) {
    const pythonCmd = findYoutubePython();
    if (!pythonCmd) {
      die(
        "youtube-backend 는 Python 3.10 이상이 필요합니다. python3.11/3.12/3.13 중 하나를 설치하세요.\n" +
        "  macOS: brew install python@3.13"
      );
    }
    console.log(`\n[dev-worktree] youtube-backend venv 생성 (.venv, ${pythonCmd})`);
    const v = spawnSync(pythonCmd, ["-m", "venv", ".venv"], {
      cwd: ytDir,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    if (v.status !== 0) die("youtube-backend venv 생성 실패");
  }
  console.log("[dev-worktree] youtube-backend 의존성 설치 (.venv, 최초 1~2분 소요)");
  const r = spawnSync(venvPython, ["-m", "pip", "install", "-r", "requirements.txt"], {
    cwd: ytDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) die("youtube-backend pip install 실패");
}

function youtubeVenvPython(worktreeRoot) {
  const venvDir = path.join(worktreeRoot, "youtube-backend", ".venv");
  return process.platform === "win32"
    ? path.join(venvDir, "Scripts", "python.exe")
    : path.join(venvDir, "bin", "python");
}

function ensureEnvLocal(mainRoot, worktreeRoot, backendPort) {
  // 1) frontend/.env — GEMINI_API_KEY 같은 개인 키가 보통 여기 들어있음.
  //    .env.local이 아니라 .env에 키를 두는 프로젝트도 있으니 둘 다 복사.
  copyEnvFileIfMissing(
    path.join(mainRoot, "frontend", ".env"),
    path.join(worktreeRoot, "frontend", ".env"),
    "frontend/.env"
  );

  // 2) frontend/.env.local — BACKEND_URL/ALLOW_INSECURE_DEV_AUTH 오버라이드 포함.
  //    .worktreeinclude(공식 기능)가 워크트리 생성 시 메인 .env.local 을 먼저 복사해
  //    둘 수 있다. 그 경우 메인 파일엔 워크트리 전용 오버라이드가 없으므로,
  //    "있으면 건너뛰기"가 아니라 "없으면 생성, 있으면 빠진 오버라이드 키만 보강"한다.
  //    (idempotent — dev:worktree 를 여러 번 돌려도 안전)
  const dst = path.join(worktreeRoot, "frontend", ".env.local");
  const requiredKeys = [
    { key: "BACKEND_URL", value: `http://localhost:${backendPort}` },
    { key: "ALLOW_INSECURE_DEV_AUTH", value: "1" },
  ];

  if (fs.existsSync(dst)) {
    // 이미 존재(예: .worktreeinclude 가 메인 .env.local 복사) — 빠진 오버라이드만 덧붙임.
    const added = ensureEnvKeys(dst, requiredKeys);
    if (added.length) {
      console.log(`\n[dev-worktree] frontend/.env.local 존재 — 누락된 오버라이드 보강: ${added.join(", ")}`);
    } else {
      console.log(`\n[dev-worktree] frontend/.env.local 존재 — 오버라이드 이미 적용됨`);
    }
    return;
  }

  // 신규 생성: 메인 .env.local 복사 + 오버라이드
  const src = path.join(mainRoot, "frontend", ".env.local");
  let base = "";
  if (fs.existsSync(src)) {
    base = fs.readFileSync(src, "utf8").trimEnd();
    console.log(`\n[dev-worktree] frontend/.env.local 생성 (메인 .env.local 복사 + 오버라이드)`);
  } else {
    console.log(`\n[dev-worktree] frontend/.env.local 생성 (메인에 .env.local 없음 — 기본값만)`);
    console.log(`  ⚠ GEMINI_API_KEY 등 개인 키는 frontend/.env 또는 .env.local 에 직접 채워야 합니다.`);
  }
  const override = [
    "",
    "# worktree dev 모드 (auto-generated by scripts/dev-worktree.js)",
    ...requiredKeys.map(({ key, value }) => `${key}=${value}`),
    "",
  ].join("\n");
  fs.writeFileSync(dst, base + override, "utf8");
}

// 기존 env 파일에 빠진 key=value 라인만 덧붙인다. (이미 있는 키는 건드리지 않음)
// 추가한 키 이름 배열을 반환. 아무것도 추가 안 했으면 빈 배열.
function ensureEnvKeys(filePath, keyValues) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const hasKey = (key) => lines.some((line) => line.trimStart().startsWith(`${key}=`));
  const missing = keyValues.filter(({ key }) => !hasKey(key));
  if (!missing.length) return [];
  const block = [
    "# worktree dev 모드 보강 (auto-generated by scripts/dev-worktree.js)",
    ...missing.map(({ key, value }) => `${key}=${value}`),
    "",
  ].join("\n");
  const base = content.replace(/\s*$/, "");
  fs.writeFileSync(filePath, `${base}\n\n${block}`, "utf8");
  return missing.map(({ key }) => key);
}

function copyEnvFileIfMissing(srcPath, dstPath, label) {
  if (!fs.existsSync(srcPath)) return;
  if (fs.existsSync(dstPath)) {
    console.log(`\n[dev-worktree] ${label} 이미 존재 — 건너뜀`);
    return;
  }
  fs.copyFileSync(srcPath, dstPath);
  console.log(`\n[dev-worktree] ${label} 생성 (메인에서 복사)`);
}

// 한 인터페이스(host)에서 port 바인딩 가능 여부. EADDRINUSE 만 "점유"로 보고,
// 그 외 에러(예: IPv6 미지원 EADDRNOTAVAIL)는 충돌 아님으로 간주해 막지 않는다.
function canBind(port, host) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", (err) => resolve(!err || err.code !== "EADDRINUSE"));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, host);
  });
}

// 진짜 빈 포트 = 127.0.0.1(IPv4 loopback)와 ::(IPv6) 양쪽에서 모두 바인딩 가능.
// 백엔드/youtube 는 127.0.0.1, next dev 는 :: 로 바인딩한다. macOS 에선 SO_REUSEADDR 때문에
// 0.0.0.0 테스트로는 127.0.0.1 전용 점유를 못 잡으므로, 실제 바인딩과 동일한 host 로 확인한다.
// (한쪽만 보면 다른 워크트리가 점유한 포트를 거짓 "비어있음"으로 골라 EADDRINUSE 충돌난다.)
async function findFreePort(start) {
  for (let p = start; p <= start + 50; p++) {
    if ((await canBind(p, "127.0.0.1")) && (await canBind(p, "::"))) return p;
  }
  throw new Error(`free port not found near ${start}`);
}

// 강제 지정 포트가 비어 있는지 확인. 점유 시 즉시 실패시켜 자동 대체 포트로 도망가지 않게 한다.
async function ensurePortFree(port, label) {
  // findFreePort 와 동일 기준 — 127.0.0.1·:: 양쪽에서 바인딩 가능해야 "비어있음".
  if ((await canBind(port, "127.0.0.1")) && (await canBind(port, "::"))) return port;
  throw new Error(`${label} 포트 ${port} 가 이미 사용 중입니다. 다른 포트를 쓰거나 점유 프로세스를 종료하세요.`);
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

function runWhatsNewCheck(worktreeRoot) {
  // 새 소식 빠짐 안전장치. exit code 무시 — 경고만, 빌드 막지 않음.
  const script = path.join(worktreeRoot, "frontend", "scripts", "check-whats-new-version.mjs");
  if (!fs.existsSync(script)) return;
  try {
    require("child_process").execFileSync(process.execPath, [script], {
      stdio: "inherit",
    });
  } catch {
    // 체크 실패해도 dev 는 계속 진행
  }
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

// node_modules 가 symlink 면 Turbopack 이 "filesystem root 밖을 가리킨다"며 패닉 → webpack 으로 폴백해야 한다.
// frontend/node_modules 뿐 아니라 워크트리 ROOT node_modules(메인을 가리키는 심링크)도 확인한다.
// Turbopack 은 패키지 해석 시 상위로 올라가 루트 node_modules 심링크에 걸리므로, frontend 것이
// 실디렉터리여도 루트가 심링크면 패닉한다(둘 중 하나라도 심링크면 webpack). dev·build 공용 판단.
function frontendNeedsWebpack(worktreeRoot) {
  return (
    isSymlink(path.join(worktreeRoot, "frontend", "node_modules")) ||
    isSymlink(path.join(worktreeRoot, "node_modules"))
  );
}

function spawnFrontend(worktreeRoot, frontendPort, backendPort, youtubeUrl) {
  const frontendDir = path.join(worktreeRoot, "frontend");
  const useWebpack = frontendNeedsWebpack(worktreeRoot);
  const args = ["next", "dev", "--port", String(frontendPort)];
  if (useWebpack) {
    args.push("--webpack");
    console.log("  (node_modules 가 symlink → Turbopack 호환을 위해 --webpack 모드)");
  }
  const env = { ...process.env, BACKEND_URL: `http://localhost:${backendPort}` };
  // "유튜브" 탭 iframe 이 /api/youtube-url 로 읽어가는 youtube-backend origin.
  if (youtubeUrl) env.YOUTUBE_BACKEND_URL = youtubeUrl;
  return spawn(npxCmd(), args, {
    cwd: frontendDir,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}

// 워크트리 프론트 프로덕션 빌드(next build). 심링크 node_modules 면 자동으로 --webpack 을 붙여
// Turbopack 패닉을 피한다. 빌드 exit code 를 그대로 전파(실패 시 die)해 PR 게이트로 쓸 수 있게 한다.
function runFrontendBuild(worktreeRoot) {
  const frontendDir = path.join(worktreeRoot, "frontend");
  const useWebpack = frontendNeedsWebpack(worktreeRoot);
  const args = ["next", "build"];
  if (useWebpack) args.push("--webpack");
  console.log(
    `\n[dev-worktree] 프론트 프로덕션 빌드 (next build${useWebpack ? " --webpack" : ""})` +
      (useWebpack ? "\n  (node_modules 가 symlink → Turbopack 호환을 위해 --webpack 모드)" : "")
  );
  const r = spawnSync(npxCmd(), args, {
    cwd: frontendDir,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) die(`프론트 프로덕션 빌드 실패 (code=${r.status ?? r.error?.message})`);
  console.log("\n✓ dev-worktree --build 완료 (프론트 프로덕션 빌드 성공)");
}

// youtube-backend(쇼츠 생성기)를 로컬 단일 사용자 모드로 띄운다. 웹 dev 전용.
// frontend 킬스위치(YOUTUBE_FEATURE_ENABLED)를 파싱한다. OFF면 dev-worktree 도
// youtube-backend 를 띄우지 않아 Electron 메인과 동작이 일치한다.
// (파일을 못 읽거나 값을 못 찾으면 보수적으로 false = 띄우지 않음.)
function youtubeFeatureEnabled(worktreeRoot) {
  try {
    const p = path.join(worktreeRoot, "frontend", "src", "lib", "youtube-feature.ts");
    const m = fs
      .readFileSync(p, "utf8")
      .match(/YOUTUBE_FEATURE_ENABLED\s*=\s*(true|false)\b/);
    return m ? m[1] === "true" : false;
  } catch {
    return false;
  }
}

function spawnYoutubeBackend(worktreeRoot, port) {
  const ytDir = path.join(worktreeRoot, "youtube-backend");
  const venvPython = youtubeVenvPython(worktreeRoot);
  const hasVenv = fs.existsSync(venvPython);
  const pythonCmd = hasVenv
    ? venvPython
    : process.platform === "win32"
    ? "python"
    : "python3";
  // dev 데이터(SQLite/영상/BGM)는 워크트리 안 별도 폴더에 격리. (git 추적 제외)
  const dataDir = path.join(worktreeRoot, "youtube-backend", ".dev-data");
  const env = {
    ...process.env,
    PORT: String(port),
    HOST: "127.0.0.1",
    LOCAL_SINGLE_USER: "1",
    // 임베드 포트 게이트(main.py)는 LOCAL_SINGLE_USER 에서 APP_TOKEN 을 요구한다.
    // 워크트리 dev 는 Electron youtube-manager 를 안 거쳐 APP_TOKEN 이 없으므로,
    // blog 백엔드(spawnBackend)와 동일하게 dev 우회 플래그를 명시 주입한다.
    ALLOW_INSECURE_DEV_AUTH: "1",
    // dev 고정 시크릿 — 재시작해도 동일해야 저장된 API 키를 복호화할 수 있다.
    JWT_SECRET: "dev-youtube-jwt-secret-local-single-user-do-not-ship",
    STORAGE_DIR: path.join(dataDir, "storage"),
    BGM_DIR: path.join(dataDir, "bgm"),
    BASE_URL: `http://127.0.0.1:${port}`,
    R2_BUCKET_NAME: "",
    PYTHONUNBUFFERED: "1",
    PYTHONIOENCODING: "utf-8:replace",
  };
  // GEMINI/FAL/TYPECAST 키가 셸 env 에 있으면 시드. 없으면 임베드된 설정 화면에서 입력.
  return spawn(pythonCmd, ["main.py"], {
    cwd: ytDir,
    env,
    stdio: "inherit",
    shell: !hasVenv && process.platform === "win32",
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
