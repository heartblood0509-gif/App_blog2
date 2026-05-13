// §G-2 — 로그에서 토큰/키/비밀번호 마스킹.
//
// electron-log 의 transform hook 에 끼워, file/console transport 모두에 적용.
// 새로운 토큰/키 종류를 도입할 때마다 패턴을 보강.

const PATTERNS: Array<[RegExp, string]> = [
  // KEY=value
  [/((?:APP_TOKEN|APP_SESSION_TOKEN|GEMINI_API_KEY)=)([^\s'"]+)/g, "$1***"],
  // 헤더 X-App-Token: xxx
  [/(X-App-(?:Token|Session)\s*[:=]\s*)([^\s'",}]+)/gi, "$1***"],
  // Authorization: Bearer xxx
  [/(Authorization\s*[:=]\s*)([^\s'",}]+)/gi, "$1***"],
  // naver_pw 필드
  [/("?naver_pw"?\s*[:=]\s*)("?)([^,"\n}]+)/g, '$1$2***'],
  // naver_pw_encrypted 필드 — ciphertext 자체도 마스킹 (길이도 노출 안 함)
  [/("?naver_pw_encrypted"?\s*[:=]\s*)("?)([A-Za-z0-9+/=]+)/g, '$1$2***'],
  // base64 plaintext 가 우연히 보일 가능성 차단 (가장 마지막에 적용되지 않으니 신중)
];

export function redact(input: unknown): unknown {
  if (typeof input !== "string") return input;
  let out = input;
  for (const [re, repl] of PATTERNS) {
    out = out.replace(re, repl);
  }
  return out;
}

/** electron-log hook 으로 쓸 함수. message.data 의 각 인자를 redact 후 반환. */
export function redactTransform<T extends { data: unknown[] }>(message: T): T {
  message.data = message.data.map(redact);
  return message;
}
