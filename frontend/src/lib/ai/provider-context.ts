// 요청 단위 provider 스냅샷 (코덱스 리뷰 ⑦).
// 파사드는 기본적으로 매 호출 디스크/env 를 읽지만, 한 요청 안에서 여러 AI 호출이
// 일어나는 라우트(예: images/generate 의 describeImageSubject→transformImage)는
// withProviderSnapshot 으로 감싸 provider 를 1회 고정해 "한 요청 내 섞임"을 방지한다.

import { AsyncLocalStorage } from "node:async_hooks";
import { getAiProviderConfig, type AiProviderConfig } from "@/lib/server/ai-provider";

const als = new AsyncLocalStorage<AiProviderConfig>();

/** 요청 스냅샷이 있으면 그 값을, 없으면 디스크/env 에서 즉시 해석. */
export async function resolveProviderConfig(): Promise<AiProviderConfig> {
  const ctx = als.getStore();
  if (ctx) return ctx;
  return getAiProviderConfig();
}

/** fn 실행 동안 provider 를 1회 스냅샷으로 고정한다(한 요청 내 일관성 보장). */
export async function withProviderSnapshot<T>(fn: () => Promise<T>): Promise<T> {
  const cfg = await getAiProviderConfig();
  return als.run(cfg, fn);
}
