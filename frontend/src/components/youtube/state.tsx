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
import {
  DEFAULT_TITLE_FONT,
  DEFAULT_TITLE_FONT_WEIGHT,
  DEFAULT_TITLE_FONT_SIZE,
  normalizeWeight,
} from "@/lib/youtube/fonts";
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
  titleFontSize: DEFAULT_TITLE_FONT_SIZE,
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
  bgmFilename: null,
  bgmVolume: 12,
  bgmStartSec: 0,
  jobId: null,
  busy: false,
  error: null,
  maxStepReached: 0,
};

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
  const [state, update] = useReducer(reducer, initialYtState);
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

export const CARD_B_STEPS: YtStep[] = [
  { screen: "script", label: "제목·대본" },
  { screen: "lines", label: "자산" },
  { screen: "tts", label: "음성" },
  { screen: "bgm", label: "BGM" },
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
    selectedTitle: ds.title ?? "",
    scriptText: lineTexts.join("\n"),
    ttsEngine: ds.tts_engine ?? "typecast",
    voiceId: ds.voice_id ?? VOICE_OPTIONS[0].value,
    emotion: ds.emotion ?? "normal",
    ttsSpeed: ds.tts_speed ?? 1.0,
    ttsSessionId: ds.tts_session_id ?? null,
    ttsDirty: false,
    expandedSentences: null,
    bgmFilename: ds.bgm_filename ?? null,
    bgmVolume: Math.max(0, Math.min(50, vol)),
    bgmStartSec: ds.bgm_start_sec ?? 0,
    busy: false,
    error: null,
  };
}
