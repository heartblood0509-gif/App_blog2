// §C — Electron-hosted credential broker (HTTP, 127.0.0.1 only).
//
// 백엔드가 Naver 비밀번호를 잠그거나 풀어 쓸 때 호출. safeStorage 가 main 프로세스에서만
// 동작하므로, 백엔드는 이 HTTP 엔드포인트를 통해 우회.
//
// 보안:
//   - 127.0.0.1 만 listen.
//   - 모든 요청에 X-App-Token 검증.
//   - plaintext 는 stdout/log 로 절대 흘리지 않음 (try/catch 메시지에서도).
//
// 엔드포인트:
//   POST /encrypt { plaintext: string }    → 200 { ciphertext_b64: string }
//   POST /decrypt { ciphertext_b64: string } → 200 { plaintext: string }
//
//   인증 실패 시 401. 입력 형식 오류 시 400. safeStorage 사용 불가 시 503.

import { safeStorage } from "electron";
import http from "node:http";
import { getFreePort } from "./net-utils";

export interface CredentialBrokerOptions {
  appToken: string;
}

export class CredentialBroker {
  private server: http.Server | null = null;
  private _url: string | null = null;

  constructor(readonly opts: CredentialBrokerOptions) {}

  get url(): string {
    if (!this._url) throw new Error("credential-broker not started");
    return this._url;
  }

  isEncryptionAvailable(): boolean {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  }

  async start(): Promise<void> {
    const port = await getFreePort();
    this.server = http.createServer((req, res) => this.handle(req, res));
    await new Promise<void>((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(port, "127.0.0.1", () => resolve());
    });
    this._url = `http://127.0.0.1:${port}`;
    console.log(`[broker] listening on ${this._url}`);
  }

  async stop(): Promise<void> {
    const s = this.server;
    if (!s) return;
    this.server = null;
    await new Promise<void>((resolve) => s.close(() => resolve()));
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse): void {
    const send = (status: number, body: object): void => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(body));
    };

    // 인증
    const token = req.headers["x-app-token"];
    if (token !== this.opts.appToken) {
      send(401, { error: "unauthorized" });
      return;
    }

    if (req.method !== "POST") {
      send(405, { error: "method not allowed" });
      return;
    }

    if (!this.isEncryptionAvailable()) {
      send(503, { error: "encryption-unavailable" });
      return;
    }

    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 64_000) {
        req.destroy();
      }
    });
    req.on("end", () => {
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(body);
      } catch {
        send(400, { error: "invalid-json" });
        return;
      }

      const url = req.url ?? "/";
      try {
        if (url === "/encrypt") {
          const plaintext = typeof parsed.plaintext === "string" ? parsed.plaintext : null;
          if (plaintext === null) {
            send(400, { error: "missing-plaintext" });
            return;
          }
          const buf = safeStorage.encryptString(plaintext);
          send(200, { ciphertext_b64: buf.toString("base64") });
          return;
        }
        if (url === "/decrypt") {
          const ctB64 = typeof parsed.ciphertext_b64 === "string" ? parsed.ciphertext_b64 : null;
          if (!ctB64) {
            send(400, { error: "missing-ciphertext" });
            return;
          }
          const buf = Buffer.from(ctB64, "base64");
          const plaintext = safeStorage.decryptString(buf);
          send(200, { plaintext });
          return;
        }
        send(404, { error: "not-found" });
      } catch (e) {
        // 의도적으로 (e as Error).message 를 응답에 안 넣음 — 평문/내부상태 노출 방지.
        const code = url === "/decrypt" ? "decrypt-failed" : "encrypt-failed";
        console.warn(`[broker] ${code}`);
        send(500, { error: code });
      }
    });
  }
}
