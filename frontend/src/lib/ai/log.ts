/**
 * AI 경로 로그 헬퍼 (브라우저/Node 양립, 외부 의존성 0).
 *
 * - devLog: 성공/진단 로그. dev(NODE_ENV=development)에서만 출력 → 패키징 릴리스에선 조용.
 *   사용자의 dev:worktree:electron 테스트는 dev 모드라 그대로 보이고, 출시 빌드에서만 숨겨진다.
 *   에러 로그([ai-error]/[fal] error/slot_failed 등)는 게이트하지 않고 호출 측에서 직접
 *   console.log 한다(안정화 동안 릴리스에서도 유지 — 필드 디버깅용).
 * - maskSecrets: 에러 message 를 로그/응답에 싣기 전, 키로 보이는 토큰을 *** 로 가린다.
 *   (실측상 Gemini/OpenAI/fal 에러 메시지는 키를 echo 하지 않으나, 방어적으로 가린다.)
 */

export function devLog(tag: string, payload: unknown): void {
  if (process.env.NODE_ENV !== "development") return;
  console.log(tag, JSON.stringify(payload));
}

// Google(AIza…), OpenAI(sk-…/sk-proj-…), fal(<uuid>:<hex> id:secret) 키 패턴.
const SECRET_RE =
  /AIza[\w-]{20,}|sk-[A-Za-z0-9_-]{16,}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8,}/gi;

export function maskSecrets(s: string): string {
  return s.replace(SECRET_RE, "***");
}
