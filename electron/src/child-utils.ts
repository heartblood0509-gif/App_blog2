import { ChildProcess, spawn } from "child_process";

export interface SpawnedChild {
  pid: number | undefined;
  proc: ChildProcess;
}

export function spawnDetached(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv; shell?: boolean; label: string },
): SpawnedChild {
  const proc = spawn(cmd, args, {
    cwd: opts.cwd,
    env: opts.env,
    shell: opts.shell ?? false,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  proc.stdout?.on("data", (b) => process.stdout.write(`[${opts.label}] ${b}`));
  proc.stderr?.on("data", (b) => process.stderr.write(`[${opts.label}] ${b}`));
  proc.on("exit", (code, sig) =>
    console.log(`[${opts.label}] exited code=${code} sig=${sig}`),
  );
  return { pid: proc.pid, proc };
}

export async function killTreeWindows(pid: number | undefined): Promise<void> {
  if (!pid) return;
  if (process.platform !== "win32") {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      /* already dead */
    }
    return;
  }
  await new Promise<void>((resolve) => {
    const p = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    p.on("exit", () => resolve());
    p.on("error", () => resolve());
  });
}
