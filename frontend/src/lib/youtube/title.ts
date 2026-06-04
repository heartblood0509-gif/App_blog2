// 영상 오버레이용 2줄 제목 유틸. Card A(TitleSelect)·Card B(ScriptInput) 공유.
// (원본 static/js/app.js autoSplitTitle/combineTitle 동작을 1:1 이식.)

// 백엔드 NarrationRequest.selected_title 의 max_length(합친 제목 기준).
export const TITLE_MAX = 30;

/** 공백 단어 경계에서 두 줄 길이 차가 최소가 되도록 분할. */
export function autoSplitTitle(text: string): [string, string] {
  const words = text.split(" ").filter(Boolean);
  if (words.length <= 1) return [text, ""];
  let bestSplit = 1;
  let bestDiff = Infinity;
  for (let i = 1; i < words.length; i++) {
    const l1 = words.slice(0, i).join(" ");
    const l2 = words.slice(i).join(" ");
    const diff = Math.abs(l1.length - l2.length);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestSplit = i;
    }
  }
  return [
    words.slice(0, bestSplit).join(" "),
    words.slice(bestSplit).join(" "),
  ];
}

/** 2줄 → 백엔드로 보낼 단일 제목(line2 있으면 "l1 l2", 없으면 "l1"). */
export function combineTitle(l1: string, l2: string): string {
  const a = l1.trim();
  const b = l2.trim();
  return b ? `${a} ${b}` : a;
}
