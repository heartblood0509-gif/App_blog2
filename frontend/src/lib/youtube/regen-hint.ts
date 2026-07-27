// 줄별 '다시 읽기' 버튼의 라벨 노출 기억(기기별).
//
// 이 버튼은 재생 버튼에 붙은 보조 버튼이라 아이콘만 두는 게 위계상 맞다. 다만 아이콘만
// 있으면 처음 쓰는 사람은 존재를 모른다 — 실제로 예전에 이 버튼을 못 찾겠다는 피드백이
// 있었다. 그래서 몇 번 써 볼 때까지는 글자를 같이 보여주고, 익숙해지면 아이콘만 남긴다.
//
// SSR 안전: typeof window 가드(패턴: guide-prefs.ts).

const KEY = "blogpick-yt-regen-uses";

/** 이 횟수만큼 써 보기 전까지는 버튼에 '다시 읽기' 글자를 같이 보여준다. */
export const REGEN_LABEL_USES = 3;

export function loadRegenUses(): number {
  if (typeof window === "undefined") return 0;
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}

export function bumpRegenUses(): number {
  const next = loadRegenUses() + 1;
  if (typeof window === "undefined") return next;
  try {
    localStorage.setItem(KEY, String(next));
  } catch {
    // 저장 실패(프라이빗 모드 등)는 무시 — 이번 세션만 유지된다.
  }
  return next;
}
