// 프리뷰 "안전 영역" 표시 토글의 기기별 기억.
//
// 정책(첫 방문 켜짐): 이 화면에 처음 오면 안전 영역을 켠 상태로 보여줘 사용자가 이 기능을
// 최소 한 번은 보게 한다(발견성). 이후 사용자가 끄면 그 선택을 기억한다.
// SSR 안전: typeof window 가드(패턴: title-defaults.ts).

const KEY = "blogpick-yt-show-guides";

/** 저장된 값이 있으면 그대로, 없으면(첫 방문) true. */
export function loadShowGuides(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const v = localStorage.getItem(KEY);
    return v === null ? true : v === "1";
  } catch {
    return true;
  }
}

export function saveShowGuides(on: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // 저장 실패(프라이빗 모드 등)는 무시 — 표시 여부는 이번 세션만 유지된다.
  }
}
