import net from "net";

// 선호 포트가 사용 가능하면 그 값을, 아니면 임의의 빈 포트를 반환.
// 매 부팅마다 다른 포트가 잡히면 Supabase 가 origin 별 IndexedDB 에 세션을
// 분리 저장해 자동 로그인이 깨지므로, 마지막 사용 포트를 재사용하기 위해 사용한다.
export async function getPreferredOrFreePort(preferred: number | undefined): Promise<number> {
  if (preferred && preferred > 0 && preferred < 65536) {
    const ok = await new Promise<boolean>((resolve) => {
      const srv = net.createServer();
      srv.once("error", () => resolve(false));
      srv.once("listening", () => srv.close(() => resolve(true)));
      try {
        srv.listen(preferred, "127.0.0.1");
      } catch {
        resolve(false);
      }
    });
    if (ok) return preferred;
  }
  return getFreePort();
}

export function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (!addr || typeof addr === "string") {
        srv.close();
        reject(new Error("could not determine free port"));
        return;
      }
      const port = addr.port;
      srv.close(() => resolve(port));
    });
  });
}

export async function waitForUrl(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastErr: unknown = undefined;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
      lastErr = new Error(`status ${res.status}`);
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`waitForUrl timeout: ${url} (last: ${String(lastErr)})`);
}
