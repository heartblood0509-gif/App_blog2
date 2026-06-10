// 웹(Next dev) 환경에서 사용 중인 OpenAI API 키의 서버측 단일 진실 소스.
// gemini-key.ts 와 동일 패턴(.gemini-key.local → GEMINI_API_KEY)을 OpenAI 용으로 복제.
//
// 우선순위:
//   1. 로컬 비밀 파일 (frontend/.openai-key.local) — AiProviderPanel 의 [저장] 동작이 기록
//   2. process.env.OPENAI_API_KEY (.env 또는 OS env, Electron 부팅 시 주입)
//
// 보안:
//   - 평문 키는 이 모듈 밖으로 절대 노출하지 않는다. 외부에는 마스킹된 형태만 제공.
//   - .openai-key.local 은 .gitignore 처리. 권한 0600 으로 작성.
//   - POST 저장은 NODE_ENV === "development" 에서만 허용 (라우트 측 가드).
//
// 캐시 무효화: 모듈은 상태를 보유하지 않는다. 매 호출마다 디스크/env 를 다시 읽는다.

import { promises as fs } from "node:fs";
import path from "node:path";

// frontend/ 워킹 디렉터리 기준. Next dev 는 process.cwd() 가 frontend 폴더.
function keyFilePath(): string {
  return path.join(process.cwd(), ".openai-key.local");
}

async function readFileKey(): Promise<string | null> {
  try {
    const raw = await fs.readFile(keyFilePath(), "utf8");
    const trimmed = raw.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") {
      console.warn("[openai-key] .openai-key.local 읽기 실패:", code ?? err);
    }
    return null;
  }
}

function readEnvKey(): string | null {
  const raw = process.env.OPENAI_API_KEY?.trim() ?? "";
  return raw.length > 0 ? raw : null;
}

export type KeySource = "local-file" | "env" | "none";

/**
 * 현재 사용해야 할 평문 OpenAI 키와 출처를 반환. 라우트의 generate 호출에서만 사용.
 * 평문은 호출 측에서 즉시 SDK 에 전달하고 변수에 오래 보관하지 말 것.
 */
export async function getServerOpenAIKey(): Promise<{
  key: string | null;
  source: KeySource;
}> {
  const fileKey = await readFileKey();
  if (fileKey) return { key: fileKey, source: "local-file" };

  const envKey = readEnvKey();
  if (envKey) return { key: envKey, source: "env" };

  return { key: null, source: "none" };
}

/**
 * 키 저장 (dev 전용). 호출 측 라우트에서 NODE_ENV 가드 후 사용.
 * - atomic write: 임시 파일에 쓰고 rename
 * - 권한 0600 (소유자만 읽기/쓰기)
 */
export async function writeLocalOpenAIKey(plaintext: string): Promise<void> {
  const target = keyFilePath();
  const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmp, plaintext, { mode: 0o600, encoding: "utf8" });
  await fs.rename(tmp, target);
}

/** 로컬 파일에서 키 삭제. dev 전용. 파일 없으면 noop. */
export async function deleteLocalOpenAIKey(): Promise<void> {
  try {
    await fs.unlink(keyFilePath());
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code !== "ENOENT") throw err;
  }
}
