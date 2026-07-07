// 쇼츠 제목 폰트 4종(전부 OFL) × 폰트별 굵기. UI(글씨체 그리드 + 굵기 드롭다운) + 미리보기 공용.
//
// 백엔드 짝: youtube-backend/core/fonts.py 의 BUNDLED_TITLE_FONTS. **폰트 id·굵기 id 는 두
// 파일이 항상 동일**해야 한다(scripts/check-title-font-sync.js 가 빌드 전 검사).
//
// 굵기 방식: 폰트당 CSS family 1개(cssFamily) + 굵기별 font-weight(cssWeight). globals.css 가
// 같은 family 에 굵기별 @font-face(파일)를 매핑하므로, 미리보기는 fontFamily+fontWeight 로 선택.
// 파일은 /public/fonts. 같은-출처라 CSP `font-src 'self'` 로 커버.

export interface FontWeight {
  id: string; // canonical: thin/extralight/light/regular/medium/semibold/bold/extrabold/black
  label: string; // 폰트 원래 굵기 이름 그대로 노출
  cssWeight: number; // @font-face 와 매칭되는 CSS font-weight
}

export interface TitleFont {
  id: string;
  label: string;
  cssFamily: string; // globals.css @font-face family
  defaultWeight: string;
  weights: FontWeight[];
}

const W = {
  thin: { id: "thin", label: "Thin", cssWeight: 100 },
  extralight: { id: "extralight", label: "ExtraLight", cssWeight: 200 },
  light: { id: "light", label: "Light", cssWeight: 300 },
  regular: { id: "regular", label: "Regular", cssWeight: 400 },
  medium: { id: "medium", label: "Medium", cssWeight: 500 },
  semibold: { id: "semibold", label: "SemiBold", cssWeight: 600 },
  bold: { id: "bold", label: "Bold", cssWeight: 700 },
  extrabold: { id: "extrabold", label: "ExtraBold", cssWeight: 800 },
  black: { id: "black", label: "Black", cssWeight: 900 },
} as const;

export const TITLE_FONTS: TitleFont[] = [
  {
    id: "pretendard",
    label: "프리텐다드",
    cssFamily: "'TF-Pretendard'",
    defaultWeight: "extrabold",
    weights: [W.light, W.regular, W.medium, W.semibold, W.bold, W.extrabold],
  },
  {
    id: "paperlogy",
    label: "페이퍼로지",
    cssFamily: "'TF-Paperlogy'",
    defaultWeight: "extrabold",
    weights: [W.light, W.regular, W.medium, W.semibold, W.bold, W.extrabold],
  },
  {
    id: "gmarket",
    label: "G마켓 산스",
    cssFamily: "'TF-GmarketSans'",
    defaultWeight: "bold",
    weights: [W.light, W.medium, W.bold],
  },
  {
    id: "atoz",
    label: "에이투지체",
    cssFamily: "'TF-AtoZ'",
    defaultWeight: "extrabold",
    weights: [
      W.thin,
      W.extralight,
      W.light,
      W.regular,
      W.medium,
      W.semibold,
      W.bold,
      W.extrabold,
      W.black,
    ],
  },
];

export const DEFAULT_TITLE_FONT = "pretendard";
export const DEFAULT_TITLE_FONT_WEIGHT = "extrabold";
export const DEFAULT_TITLE_FONT_SIZE = 120; // px, 1080폭 렌더 기준
export const TITLE_FONT_SIZE_MIN = 70;
export const TITLE_FONT_SIZE_MAX = 170;

// 자막 스타일 기본값(작업 전역). 폰트는 번들 4종 중 하나(제목과 동일 목록). 기본 프리텐다드·ExtraBold.
// 크기/색/위치는 렌더 기준(1080×1920). y=자막 상단, dx=가로 중앙 오프셋.
export const DEFAULT_SUBTITLE_FONT = "pretendard";
export const DEFAULT_SUBTITLE_FONT_WEIGHT = "extrabold";
export const DEFAULT_SUBTITLE_FONT_SIZE = 55;
export const SUBTITLE_FONT_SIZE_MIN = 36;
export const SUBTITLE_FONT_SIZE_MAX = 80;
export const DEFAULT_SUBTITLE_COLOR = "#FFFFFF";
export const DEFAULT_SUBTITLE_DX = 0;
export const DEFAULT_SUBTITLE_Y = 1300;

export function getTitleFont(id: string): TitleFont {
  return TITLE_FONTS.find((f) => f.id === id) ?? TITLE_FONTS[0];
}

/** 폰트가 그 굵기를 가지면 그 굵기, 아니면 그 폰트 기본 굵기 id 반환. */
export function normalizeWeight(fontId: string, weightId: string): string {
  const f = getTitleFont(fontId);
  return f.weights.some((w) => w.id === weightId) ? weightId : f.defaultWeight;
}

/** 미리보기용 { fontFamily, fontWeight }. */
export function titleFontStyle(fontId: string, weightId: string): {
  fontFamily: string;
  fontWeight: number;
} {
  const f = getTitleFont(fontId);
  const wid = normalizeWeight(fontId, weightId);
  const w = f.weights.find((x) => x.id === wid) ?? f.weights[0];
  return { fontFamily: f.cssFamily, fontWeight: w.cssWeight };
}

/** 렌더 기준 px(1080폭)을 미리보기 프레임 px로 환산. */
export function previewFontSizePx(titleFontSize: number, frameWidth: number): number {
  return Math.round(titleFontSize * (frameWidth / 1080));
}
