// 블로그 이미지 생성(fal 우선)이 사용하는 fal API 키의 서버측 단일 진실 소스.
// gemini-key.ts 패턴을 그대로 복제한다. fal 키는 블로그(이 모듈)와 유튜브 백엔드가 공용으로 쓴다.
//
// 우선순위(실행 환경별, runtime.ts 의 isElectronRuntime 로 분기):
//   - Electron 앱:  env(FAL_API_KEY ?? FAL_KEY, settings.json 복호화 주입) → .fal-key.local
//   - 웹 dev:       .fal-key.local(통합 키 패널 저장) → env(FAL_API_KEY ?? FAL_KEY)
//   FAL_API_KEY=블로그 next-server 주입명, FAL_KEY=유튜브 백엔드 공유명(같은 키). 둘 다 지원.
//   환경별로 "그 환경의 UI 저장 위치"를 우선해, 다른 환경 잔재가 가리지 않게 한다.
//
// 보안:
//   - 평문 키는 이 모듈 밖으로 노출하지 않는다. 외부에는 마스킹만 제공.
//   - .fal-key.local 은 .gitignore 처리. 권한 0600 으로 작성.
//   - POST 저장은 NODE_ENV === "development" 에서만 허용(라우트 측 가드).
//
// 캐시 무효화:
//   - 상태를 보유하지 않는다. 매 호출 디스크/env 를 다시 읽어 키 변경 즉시 반영.

import { promises as fs } from "node:fs";
import path from "node:path";
import { isElectronRuntime } from "./runtime";

// frontend/ 워킹 디렉터리 기준. Next dev 는 process.cwd() 가 frontend 폴더.
function keyFilePath(): string {
  return path.join(process.cwd(), ".fal-key.local");
}

async function readFileKey(): Promise<string | null> {
  try {
    const raw = await fs.readFile(keyFilePath(), "utf8");
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") {
      console.warn("[fal-key] .fal-key.local 읽기 실패:", code ?? err);
    }
    return null;
  }
}

// 블로그(FAL_API_KEY)와 유튜브(FAL_KEY) 양쪽 env 명을 모두 지원(같은 키).
function readEnvKey(): string | null {
  const raw = (process.env.FAL_API_KEY ?? process.env.FAL_KEY)?.trim() ?? "";
  return raw.length > 0 ? raw : null;
}

export type FalKeySource = "local-file" | "env" | "none";

/**
 * 현재 사용해야 할 평문 fal 키와 출처를 반환. fal-provider 의 이미지 생성에서만 사용.
 * 평문은 호출 측에서 즉시 SDK 에 전달하고 변수에 오래 보관하지 말 것.
 */
export async function getServerFalKey(): Promise<{
  key: string | null;
  source: FalKeySource;
}> {
  const fileKey = await readFileKey();
  const envKey = readEnvKey();

  // Electron 에선 settings.json→env 주입이 정본이라 env 우선(웹 dev 잔재 .local 이 가리지 않게).
  // 웹 dev 에선 UI 저장이 .fal-key.local 에 기록되므로 파일 우선. (판별: runtime.ts)
  if (isElectronRuntime()) {
    if (envKey) return { key: envKey, source: "env" };
    if (fileKey) return { key: fileKey, source: "local-file" };
  } else {
    if (fileKey) return { key: fileKey, source: "local-file" };
    if (envKey) return { key: envKey, source: "env" };
  }

  return { key: null, source: "none" };
}

/** fal 키 등록 여부(이미지 fal 라우팅 판단용). 캐시 없음 — 매 호출 읽기. */
export async function isFalImageAvailable(): Promise<boolean> {
  const { key } = await getServerFalKey();
  return key != null;
}

/** 마스킹 — 평문 노출 방지용. 키 패널 표시에만 사용. */
export function maskKey(key: string): string {
  if (key.length < 12) return "•".repeat(Math.max(key.length, 4));
  return `${key.slice(0, 4)}••••••${key.slice(-4)}`;
}

/**
 * 키 저장 (dev 전용). 호출 측 라우트에서 NODE_ENV 가드 후 사용.
 * atomic write(임시 파일 → rename) + 권한 0600.
 */
export async function writeLocalFalKey(plaintext: string): Promise<void> {
  const target = keyFilePath();
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, plaintext, { mode: 0o600, encoding: "utf8" });
  await fs.rename(tmp, target);
}

/** 로컬 파일에서 키 삭제. dev 전용. 파일 없으면 noop. */
export async function deleteLocalFalKey(): Promise<void> {
  try {
    await fs.unlink(keyFilePath());
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") throw err;
  }
}
