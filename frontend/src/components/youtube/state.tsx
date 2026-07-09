"use client";

// 유튜브(쇼츠 픽) 네이티브 워크플로의 내부 상태 컨테이너.
// 호스트 블로그앱은 단일 페이지 + 위저드 상태 패턴이라 React Router 를 쓰지 않는다.
// 유튜브 탭은 자족적 화면 상태머신(모드선택 → Card A/B 단계 → 진행 → 미리보기 → 완료)을
// 이 컨텍스트로 자체 관리한다. (Card B 줄 편집의 정교한 reducer 는 M3 에서 확장.)

import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
} from "react";
import type {
  DraftState,
  NarrationLine,
  ScriptLine,
  TitleOption,
} from "@/lib/youtube/endpoints";
import { VOICE_OPTIONS } from "@/lib/youtube/voices";
import type { WordTime } from "@/lib/youtube/subtitle-split";
import {
  DEFAULT_TITLE_FONT,
  DEFAULT_TITLE_FONT_WEIGHT,
  DEFAULT_TITLE_FONT_SIZE,
  DEFAULT_TITLE_LINE1_SIZE,
  DEFAULT_TITLE_LINE2_SIZE,
  DEFAULT_TITLE_LINE_GAP,
  DEFAULT_TITLE_DX,
  DEFAULT_TITLE_DY,
  DEFAULT_SUBTITLE_FONT,
  DEFAULT_SUBTITLE_FONT_WEIGHT,
  DEFAULT_SUBTITLE_FONT_SIZE,
  DEFAULT_SUBTITLE_COLOR,
  DEFAULT_SUBTITLE_DX,
  DEFAULT_SUBTITLE_Y,
  defaultTitleLineGap,
  normalizeWeight,
} from "@/lib/youtube/fonts";
import {
  DEFAULT_TITLE_COLOR1,
  DEFAULT_TITLE_COLOR2,
  normalizeHexOr,
} from "@/lib/youtube/title-colors";
import { DEFAULT_MOTION_SPEED } from "@/lib/youtube/transform";
import { type LayoutMode, DEFAULT_LAYOUT_MODE, BLUR_SIGMA_DEFAULT } from "@/lib/youtube/layout";
import { loadLastUsed } from "@/lib/youtube/title-defaults";
import { loadLastSubtitle } from "@/lib/youtube/subtitle-defaults";
import { YT_AI_FULL_ENABLED } from "@/lib/youtube-ai-full-feature";

export type YtMode = "ai_full" | "user_assets";

export type YtScreen =
  | "mode"
  // Card A
  | "topic"
  | "titles"
  | "narration"
  // Card B (M3)
  | "script"
  | "lines"
  // 공유
  | "tts"
  | "bgm"
  // 출력 (M2)
  | "progress"
  | "preview"
  | "clips"
  | "completed";

export type YtCategory = "cosmetics" | "general";
export type YtContentType = "info" | "promo" | "promo_comment";

// 카드 B 음성 빌드 스냅샷. sent_XX.wav 는 빌드 순서(lineIds 순)로 저장되므로
// 재생 시 index = lineIds.indexOf(lineId). texts 로 줄별 변경(dirty)을 감지하고,
// durations 로 줄별/총 길이를 보여준다. version 은 오디오 URL 캐시버스터.
export interface TtsBuildSnapshot {
  sessionId: string;
  lineIds: string[]; // 빌드 순서 = sent_XX 인덱스
  texts: Record<string, string>; // line_id → 빌드 당시 텍스트
  durations: number[]; // 빌드 순서별 길이(초)
  // 빌드 순서별 어절 타임스탬프(자막-음성 동기화용). 폴백/구세션 줄은 null.
  wordTimes: (WordTime[] | null)[];
  voice: { voiceId: string; speed: number; emotion: string };
  version: number; // 단조 증가(캐시버스터)
}

export interface YtState {
  screen: YtScreen;
  mode: YtMode | null;

  // Card A — 주제
  category: YtCategory;
  contentType: YtContentType;
  topic: string;
  painPoint: string;
  ingredient: string;
  keyword: string;
  productImageId: string | null;
  // 제목 생성 시점의 키워드 스냅샷(info 타입에서 제목/나레이션 키워드 불일치 경고용).
  keywordAtTitleGen: string;

  // 제목
  titleOptions: TitleOption[];
  selectedTitle: string;
  titleLine1: string;
  titleLine2: string;
  // 제목 폰트(core.fonts id) + 굵기 id + 크기(px, 1080폭 렌더 기준). 기본 프리텐다드·ExtraBold·120.
  titleFont: string;
  titleFontWeight: string;
  titleFontSize: number;
  // 제목 줄별 글자 크기(px, 1080폭) + 첫줄↔둘째줄 세로 간격(top-to-top, px). 기본은 단일 크기(120)·간격 130.
  titleLine1Size: number;
  titleLine2Size: number;
  titleLineGap: number;
  // 제목 줄별 색(#RRGGBB). 기본 윗줄 흰색 / 아랫줄 톤다운 노란색.
  titleColor1: string;
  titleColor2: string;
  // 제목 위치 오프셋(렌더 기준 px). dx=가로 중앙 오프셋(1080폭), dy=기본 위치 기준 세로 델타(1920높이).
  // 0/0=기존 고정 위치. 2줄은 한 덩어리로 함께 이동.
  titleDx: number;
  titleDy: number;

  // 자막 스타일(작업 전역). 폰트 ""=기본 자막폰트. 크기/색/위치는 렌더 기준(1080×1920).
  // subtitleDx=가로 중앙 오프셋(px), subtitleY=자막 상단 y(px).
  subtitleFont: string;
  subtitleFontWeight: string;
  subtitleFontSize: number;
  subtitleColor: string;
  subtitleDx: number;
  subtitleY: number;

  // 줌(모션) 속도 — 작업 전역, 모든 줄 공통. 초당 확대 비율(0.0125=1.25%/s).
  motionSpeed: number;

  // 레이아웃 — 작업 전역. "full"=꽉 채움(기본), "boxed"=상·하단 검정 박스, "blur"=흐림 배경.
  layoutMode: LayoutMode;
  // 흐림 배경 강도(가우시안 sigma). blur 모드에서만 의미.
  blurSigma: number;

  // Card B — 붙여넣은 원본 대본(스텝 되돌아왔을 때 유지)
  scriptText: string;

  // 나레이션 (줄마다 text + role)
  narration: NarrationLine[];
  // 현재 narration 이 어떤 제목으로 생성됐는지. selectedTitle 과 다르면 stale → 재생성.
  narrationTitle: string;
  // 확정 나레이션 → 이미지 프롬프트/모션이 채워진 줄(이후 job.lines). promo_comment 는 BGM 단계에서 지연 생성 → null.
  scriptLines: ScriptLine[] | null;

  // 음성(TTS)
  ttsEngine: string;
  voiceId: string;
  emotion: string;
  ttsSpeed: number;
  ttsSessionId: string | null;
  // 줄 텍스트/구조가 바뀌어 음성 재빌드가 필요한 상태. true면 BGM/렌더 전 음성 단계를 한 번 거쳐야 한다.
  // ttsSessionId 는 유지(incremental: 바뀐 줄만 재합성)하고 이 플래그로만 게이트한다.
  ttsDirty: boolean;
  // promo_comment: TTS 가 6초 초과 줄을 분리한 결과(이후 이미지 프롬프트 생성에 사용). 그 외 null.
  expandedSentences: string[] | null;
  // 카드 B: 마지막으로 성공한 음성 빌드의 스냅샷. 줄별/전체 재생 매핑 + 줄별 dirty 판정의 기준.
  // null = 아직 한 번도 안 만듦(재생 누르면 그때 생성). 화면 나갈 때 이 자체는 유지된다.
  ttsBuild: TtsBuildSnapshot | null;

  // BGM
  bgmFilename: string | null;
  bgmVolume: number;
  bgmStartSec: number;

  // 작업/비동기
  jobId: string | null;
  busy: boolean;
  error: string | null;

  // 스텝퍼 진행 표시(장식)용: 이번 세션에 도달한 최대 단계 인덱스(단조 증가). 완료 점·진행바 채움에 쓰며,
  // 클릭 이동 판정엔 안 씀(원본 maxReachedStep 과 동일 역할 — 마지막 '영상 제작'만 빼면 단계는 자유 클릭).
  maxStepReached: number;
}

export const initialYtState: YtState = {
  // YT_AI_FULL_ENABLED=false 면 모드 선택(ModeSelect)을 건너뛰고 바로 Card B("내가 직접 제공")로 진입.
  // reset(update({...initialYtState}))도 같은 초기값을 타므로 "새로 만들기"도 Card B 로 시작한다.
  screen: YT_AI_FULL_ENABLED ? "mode" : "script",
  mode: YT_AI_FULL_ENABLED ? null : "user_assets",
  category: "cosmetics",
  contentType: "info",
  topic: "",
  painPoint: "",
  ingredient: "",
  keyword: "",
  productImageId: null,
  keywordAtTitleGen: "",
  scriptText: "",
  titleOptions: [],
  selectedTitle: "",
  titleLine1: "",
  titleLine2: "",
  titleFont: DEFAULT_TITLE_FONT,
  titleFontWeight: DEFAULT_TITLE_FONT_WEIGHT,
  // 앵커(title_font_size)는 첫 줄 크기와 동일하게 시작(줄별 크기가 항상 우선하지만 폴백 정합).
  titleFontSize: DEFAULT_TITLE_LINE1_SIZE,
  titleLine1Size: DEFAULT_TITLE_LINE1_SIZE,
  titleLine2Size: DEFAULT_TITLE_LINE2_SIZE,
  titleLineGap: DEFAULT_TITLE_LINE_GAP,
  titleColor1: DEFAULT_TITLE_COLOR1,
  titleColor2: DEFAULT_TITLE_COLOR2,
  titleDx: DEFAULT_TITLE_DX,
  titleDy: DEFAULT_TITLE_DY,
  subtitleFont: DEFAULT_SUBTITLE_FONT,
  subtitleFontWeight: DEFAULT_SUBTITLE_FONT_WEIGHT,
  subtitleFontSize: DEFAULT_SUBTITLE_FONT_SIZE,
  subtitleColor: DEFAULT_SUBTITLE_COLOR,
  subtitleDx: DEFAULT_SUBTITLE_DX,
  subtitleY: DEFAULT_SUBTITLE_Y,
  motionSpeed: DEFAULT_MOTION_SPEED,
  layoutMode: DEFAULT_LAYOUT_MODE,
  blurSigma: BLUR_SIGMA_DEFAULT,
  narration: [],
  narrationTitle: "",
  scriptLines: null,
  ttsEngine: "typecast",
  voiceId: VOICE_OPTIONS[0].value,
  emotion: "normal",
  ttsSpeed: 1.0,
  ttsSessionId: null,
  ttsDirty: false,
  expandedSentences: null,
  ttsBuild: null,
  bgmFilename: null,
  bgmVolume: 12,
  bgmStartSec: 0,
  jobId: null,
  busy: false,
  error: null,
  maxStepReached: 0,
};

// 새 영상 시작값 = 초기값 + "이 기기 마지막 스타일"(자동 기억 우선 정책). 폰트/굵기/크기/색만
// 마지막값으로 덮어쓰고 나머지는 초기값. 진행 중 작업 복원(restorePatchFromDraft)엔 관여 안 함.
// 신규 프로젝트 진입점(Provider 초기화 + "새로 만들기" reset)에서 공유한다.
export function freshYtState(): YtState {
  const last = loadLastUsed();
  const sub = loadLastSubtitle();
  return {
    ...initialYtState,
    ...(last.font !== undefined ? { titleFont: last.font } : {}),
    ...(last.font !== undefined || last.weight !== undefined
      ? { titleFontWeight: normalizeWeight(last.font ?? DEFAULT_TITLE_FONT, last.weight ?? DEFAULT_TITLE_FONT_WEIGHT) }
      : {}),
    // 마지막 스타일에서 앵커·줄별 크기·간격을 각각 seed. 구 저장데이터(size 만 있음)는
    // 첫 줄만 그 값으로 폴백하고, 둘째 줄·간격은 초기 기본값(120·108) 유지.
    ...(last.size !== undefined ? { titleFontSize: last.size } : {}),
    ...(last.line1Size !== undefined
      ? { titleLine1Size: last.line1Size }
      : last.size !== undefined
        ? { titleLine1Size: last.size }
        : {}),
    ...(last.line2Size !== undefined ? { titleLine2Size: last.line2Size } : {}),
    ...(last.lineGap !== undefined ? { titleLineGap: last.lineGap } : {}),
    ...(last.color1 !== undefined ? { titleColor1: last.color1 } : {}),
    ...(last.color2 !== undefined ? { titleColor2: last.color2 } : {}),
    // 자막 스타일도 이 기기 마지막값으로 seed(위치 dx/y 는 기억 안 함 — 매번 기본에서 시작).
    ...(sub.font !== undefined ? { subtitleFont: sub.font } : {}),
    ...(sub.weight !== undefined ? { subtitleFontWeight: sub.weight } : {}),
    ...(sub.size !== undefined ? { subtitleFontSize: sub.size } : {}),
    ...(sub.color !== undefined ? { subtitleColor: sub.color } : {}),
  };
}

type Patch = Partial<YtState>;

function reducer(state: YtState, patch: Patch): YtState {
  const next = { ...state, ...patch };
  // 화면이 바뀌면 도달한 최대 단계를 단조 증가로 갱신(진행 표시용 — 완료 점·진행바 채움. 클릭 이동 판정엔 안 씀).
  // patch 에 maxStepReached 가 들어오면(리셋: {...initialYtState}) 그 값을 기준으로 다시 계산해
  // "새로 만들기"가 0 으로 정상 초기화되게 한다. stepsForMode/CARD_*_STEPS 는 dispatch 시점엔 초기화됨.
  if (patch.screen !== undefined) {
    const steps = stepsForMode(next.mode);
    const idx = steps.findIndex(
      (s) => s.screen === next.screen || s.match?.includes(next.screen),
    );
    if (idx >= 0) next.maxStepReached = Math.max(next.maxStepReached, idx);
  }
  return next;
}

interface YtContextValue {
  state: YtState;
  update: (patch: Patch) => void;
}

const YtContext = createContext<YtContextValue | null>(null);

export function YoutubeWorkflowProvider({ children }: { children: ReactNode }) {
  // 지연 초기화로 "이 기기 마지막 스타일"을 seed(localStorage, 클라 전용 — SSR 시 loadLastUsed 가 {}).
  const [state, update] = useReducer(reducer, undefined, freshYtState);
  return (
    <YtContext.Provider value={{ state, update }}>
      {children}
    </YtContext.Provider>
  );
}

export function useYt(): YtContextValue {
  const ctx = useContext(YtContext);
  if (!ctx) {
    throw new Error("useYt must be used within YoutubeWorkflowProvider");
  }
  return ctx;
}

// 모드별 내부 스텝퍼 정의. Card B 단계는 M3 에서 화면이 채워진다.
export interface YtStep {
  screen: YtScreen; // 이 스텝의 대표 화면(점프 시 이동 대상)
  label: string;
  // 이 스텝으로 함께 강조될 추가 화면들. "영상 제작"처럼 한 단계가 여러 화면(진행→완료)을
  // 거치는 경우, 그 화면들에서도 같은 스텝이 활성으로 잡히게 한다.
  match?: YtScreen[];
}

export const CARD_A_STEPS: YtStep[] = [
  { screen: "topic", label: "주제" },
  { screen: "titles", label: "제목" },
  { screen: "narration", label: "나레이션" },
  { screen: "tts", label: "음성" },
  { screen: "bgm", label: "BGM" },
  {
    screen: "progress",
    label: "영상 제작",
    match: ["progress", "preview", "clips", "completed"],
  },
];

// 카드 B: 음성·BGM·자막을 '화면·소리' 단계로 통합 → 3단계. tts/bgm 화면은 카드 A 전용으로만 남는다.
export const CARD_B_STEPS: YtStep[] = [
  { screen: "script", label: "제목·대본" },
  { screen: "lines", label: "화면·소리" },
  { screen: "progress", label: "영상 제작", match: ["progress", "completed"] },
];

export function stepsForMode(mode: YtMode | null): YtStep[] {
  return mode === "user_assets" ? CARD_B_STEPS : CARD_A_STEPS;
}

// 작업이력에서 연 작업(reopen 응답 또는 draft-state)을 워크플로 state 로 복원하는 패치 생성.
// 줄(lines)은 LineAssetEditor 가 jobId 로 다시 불러오므로 screen=lines + jobId 만으로 복원되고,
// 음성/BGM 선택값은 화면이 state 에서 읽으므로 여기서 채운다. ttsDirty=false(복원 직후엔 깨끗 —
// 안 고치면 기존 음성으로 재생성 없이 재렌더). bgm_volume 은 백엔드 0~0.5 → 슬라이더 0~50 으로 환산.
export function restorePatchFromDraft(
  jobId: string,
  ds: DraftState,
): Partial<YtState> {
  const lineTexts = (ds.lines ?? []).map((l) => l.text).filter(Boolean);
  const vol = Math.round((ds.bgm_volume ?? 0.12) * 100);
  return {
    jobId,
    mode: "user_assets",
    screen: "lines",
    maxStepReached: 1, // Card B: script=0, lines=1
    titleLine1: ds.title_line1 ?? "",
    titleLine2: ds.title_line2 ?? "",
    titleFont: ds.title_font ?? DEFAULT_TITLE_FONT,
    titleFontWeight: normalizeWeight(
      ds.title_font ?? DEFAULT_TITLE_FONT,
      ds.title_font_weight ?? DEFAULT_TITLE_FONT_WEIGHT,
    ),
    titleFontSize: ds.title_font_size ?? DEFAULT_TITLE_FONT_SIZE,
    // 레거시 job(줄별 필드 null)은 단일 크기(title_font_size)·기존 간격 공식으로 폴백 →
    // 재오픈 시 화면·렌더가 그대로 유지된다.
    titleLine1Size: ds.title_line1_size ?? ds.title_font_size ?? DEFAULT_TITLE_LINE1_SIZE,
    titleLine2Size: ds.title_line2_size ?? ds.title_font_size ?? DEFAULT_TITLE_LINE2_SIZE,
    titleLineGap:
      ds.title_line_gap ?? defaultTitleLineGap(ds.title_font_size ?? DEFAULT_TITLE_FONT_SIZE),
    titleColor1: normalizeHexOr(ds.title_color1, DEFAULT_TITLE_COLOR1),
    titleColor2: normalizeHexOr(ds.title_color2, DEFAULT_TITLE_COLOR2),
    // 위치는 저장된 값 그대로 복원. 레거시 job(dx/dy=null)은 렌더가 0 을 썼으므로 0 으로 폴백
    // (DEFAULT_TITLE_DY=38 로 폴백하면 옛 영상과 프리뷰가 어긋난다).
    titleDx: ds.title_dx ?? 0,
    titleDy: ds.title_dy ?? 0,
    subtitleFont: ds.subtitle_font ?? DEFAULT_SUBTITLE_FONT,
    subtitleFontWeight: ds.subtitle_font_weight ?? DEFAULT_SUBTITLE_FONT_WEIGHT,
    subtitleFontSize: ds.subtitle_font_size ?? DEFAULT_SUBTITLE_FONT_SIZE,
    subtitleColor: normalizeHexOr(ds.subtitle_color, DEFAULT_SUBTITLE_COLOR),
    subtitleDx: ds.subtitle_dx ?? DEFAULT_SUBTITLE_DX,
    subtitleY: ds.subtitle_y ?? DEFAULT_SUBTITLE_Y,
    motionSpeed: ds.motion_speed ?? DEFAULT_MOTION_SPEED,
    // 백엔드는 boxed/blur 만 저장(그 외 NULL=꽉 채움). 재열기 시 사용자가 고른 값이 유지되게 필수 복원.
    layoutMode: ds.layout_mode === "boxed" ? "boxed" : ds.layout_mode === "blur" ? "blur" : "full",
    blurSigma: ds.layout_blur_sigma ?? BLUR_SIGMA_DEFAULT,
    selectedTitle: ds.title ?? "",
    scriptText: lineTexts.join("\n"),
    ttsEngine: ds.tts_engine ?? "typecast",
    voiceId: ds.voice_id ?? VOICE_OPTIONS[0].value,
    emotion: ds.emotion ?? "normal",
    ttsSpeed: ds.tts_speed ?? 1.0,
    ttsSessionId: ds.tts_session_id ?? null,
    ttsDirty: false,
    expandedSentences: null,
    // LineAssetEditor 가 마운트 시 매니페스트로 스냅샷을 복원(있으면 재빌드 없이 즉시 재생).
    ttsBuild: null,
    bgmFilename: ds.bgm_filename ?? null,
    bgmVolume: Math.max(0, Math.min(50, vol)),
    bgmStartSec: ds.bgm_start_sec ?? 0,
    busy: false,
    error: null,
  };
}
