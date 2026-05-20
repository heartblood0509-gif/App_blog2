import { ChildProcess, spawn, spawnSync, StdioOptions } from "child_process";
import fs from "node:fs";
import path from "node:path";
import { paths } from "./paths";

export interface SpawnedChild {
  pid: number | undefined;
  proc: ChildProcess;
}

const POSIX = process.platform !== "win32";

function openLogFd(label: string, stream: "stdout" | "stderr"): number | undefined {
  try {
    const dir = path.join(paths.userData, "logs");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${label}.${stream}.log`);
    // 단순 size-cap: 5MB 이상이면 trim (오래된 절반 버림). 회전 없음 (간단함 우선).
    try {
      const st = fs.statSync(file);
      if (st.size > 5 * 1024 * 1024) {
        const fd0 = fs.openSync(file, "r");
        const buf = Buffer.alloc(2.5 * 1024 * 1024);
        fs.readSync(fd0, buf, 0, buf.length, st.size - buf.length);
        fs.closeSync(fd0);
        fs.writeFileSync(file, buf);
      }
    } catch {
      /* ignore */
    }
    return fs.openSync(file, "a");
  } catch {
    return undefined;
  }
}

export function spawnDetached(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; shell?: boolean; label: string },
): SpawnedChild {
  // 자식 stdio 처리:
  //   - dev: "inherit" — 개발자 터미널에 직접 출력 (Electron 파이프 경유 X).
  //   - packaged: 파일 FD 직접 리다이렉트 — Electron 이 자식 stdio 핸들을 잡고 있지 않아
  //               종료 시 hang 없음. 손자(Playwright Chromium) 가 부모 파이프를 상속
  //               하는 사고도 차단 (Codex 의 A번 지적).
  let stdio: StdioOptions;
  if (paths.isDev) {
    stdio = ["ignore", "inherit", "inherit"];
  } else {
    const outFd = openLogFd(opts.label, "stdout");
    const errFd = openLogFd(opts.label, "stderr");
    stdio = ["ignore", outFd ?? "ignore", errFd ?? "ignore"];
  }

  const proc = spawn(cmd, args, {
    cwd: opts.cwd,
    env: opts.env,
    shell: opts.shell ?? false,
    windowsHide: true,
    // §C-1 POSIX: detached:true → 자식이 새 프로세스 그룹/세션 리더가 되어,
    //   종료 시 process.kill(-pid, ...) 로 손자까지 그룹 KILL 가능.
    // Windows: detached 의미가 다르고 Job Object 가 자식 트리를 흡수하므로 미설정.
    detached: POSIX,
    stdio,
  });
  proc.on("exit", (code, sig) =>
    console.log(`[${opts.label}] exited code=${code} sig=${sig}`),
  );
  // 부모 이벤트 루프가 자식 종료를 기다리지 않도록 unref.
  // 우리는 별도로 PID 추적 + killTree 로 명시적 종료를 수행함.
  try { proc.unref(); } catch { /* ignore */ }
  return { pid: proc.pid, proc };
}

async function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function killTree(pid: number | undefined): Promise<void> {
  if (!pid) return;
  if (process.platform === "win32") {
    await new Promise<void>((resolve) => {
      const p = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        windowsHide: true,
        stdio: "ignore",
      });
      p.on("exit", () => resolve());
      p.on("error", () => resolve());
    });
    return;
  }

  // §C-2 POSIX: PGID 검증 후 그룹 SIGTERM → 최대 3초 대기 → 살아있으면 SIGKILL.
  // pgid === pid 일 때만 negative-pid 그룹 KILL 안전 (다른 무관한 그룹 오발 방지).
  // Node 의 process 객체엔 getpgid 가 없으므로 `ps -o pgid=` 로 조회.
  const psRes = spawnSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" });
  if (psRes.status !== 0) return; // already gone
  const pgid = parseInt(psRes.stdout.trim(), 10);
  if (!Number.isFinite(pgid)) return;
  const target = pgid === pid ? -pid : pid;
  try { process.kill(target, "SIGTERM"); } catch { return; }

  const deadline = Date.now() + 3_000;
  while (Date.now() < deadline) {
    if (!isAlive(pid)) return;
    await wait(100);
  }
  try { process.kill(target, "SIGKILL"); } catch { /* already dead */ }
}

// 하위 호환 alias — 기존 호출 사이트가 점진적으로 옮길 동안 유지.
export const killTreeWindows = killTree;
