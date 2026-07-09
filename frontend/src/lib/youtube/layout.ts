// 쇼츠 레이아웃(작업 전역) 단일 출처 — 타입 + 기하 상수 + 편집용 체커 배경.
//
// "full"(기본): 미디어가 화면을 꽉 채운다(현행 동작). 미디어를 줄이면 편집 화면에선 빈 공간을
//   체커보드로 표시하지만, 최종 영상의 빈 공간은 검정이다(WYSIWYG 예외 — 체커는 "여기 비어있음" 표시).
// "boxed": 상·하단에 순검정 박스를 덮어 미디어를 가운데 밴드로 가두고, 제목·자막을 박스 위에 얹는다.
//
// 밴드 비율은 백엔드 video_assembler.LAYOUT_BOX_* (상단 0..469 / 가운데 469..1445 / 하단 1445..1920,
// 1080×1920 기준)와 정합해야 한다. 프레임 컴포넌트가 아니라 이 모듈이 상수의 단일 출처다(순환 import 방지).

export type LayoutMode = "full" | "boxed" | "blur";

export const DEFAULT_LAYOUT_MODE: LayoutMode = "full";

// 흐림 배경(blur) 강도(가우시안 sigma). UI 는 기준 25 대비 %로 다룬다(모션 속도 슬라이더 패턴).
// 20~200% × 25 = 5~50, 백엔드 clamp(BLUR_SIGMA_MIN/MAX)와 정합.
export const BLUR_SIGMA_DEFAULT = 25;
export const BLUR_PCT_MIN = 20;
export const BLUR_PCT_MAX = 200;
export const BLUR_PCT_STEP = 5;
export const BLUR_PCT_DEFAULT = 100;

const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** 슬라이더 %(기준 sigma 대비) → 실제 sigma. 범위 밖은 클램프. */
export function sigmaFromBlurPct(pct: number): number {
  const p = clampNum(Number.isFinite(pct) ? pct : BLUR_PCT_DEFAULT, BLUR_PCT_MIN, BLUR_PCT_MAX);
  return BLUR_SIGMA_DEFAULT * (p / 100);
}
/** sigma → 슬라이더 %(정수, 클램프). 저장된 sigma 를 슬라이더 위치로 되돌린다. */
export function blurPctFromSigma(sigma: number): number {
  const s = Number.isFinite(sigma) ? sigma : BLUR_SIGMA_DEFAULT;
  return clampNum(Math.round((s / BLUR_SIGMA_DEFAULT) * 100), BLUR_PCT_MIN, BLUR_PCT_MAX);
}

// 상단 검정 박스 높이(=가운데 밴드 상단), 프레임 높이 대비 비율.
export const LAYOUT_BAND_TOP_FRAC = 469 / 1920; // 0.24427
// 가운데 미디어 밴드 높이 비율(제목 입력 단계 도식의 체커 밴드와 동일).
export const LAYOUT_BAND_MID_FRAC = 976 / 1920; // 0.50833
// 하단 검정 박스 상단 y 비율(= TOP + MID = 1445/1920).
export const LAYOUT_BAND_BOTTOM_TOP_FRAC = 1445 / 1920; // 0.75260

// 편집 전용 체커보드 배경 — "여기는 미디어가 없는 빈 공간"임을 나타낸다(최종 영상엔 없음).
export const CHECKER_BG_STYLE = {
  background: "repeating-conic-gradient(#d4d4d8 0% 25%, #f4f4f5 0% 50%)",
  backgroundSize: "20px 20px",
} as const;
