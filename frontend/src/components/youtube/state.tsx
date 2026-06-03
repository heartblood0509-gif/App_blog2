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
  NarrationLine,
  ScriptLine,
  TitleOption,
} from "@/lib/youtube/endpoints";
import { VOICE_OPTIONS } from "@/lib/youtube/voices";

export type YtMode = "ai_full" | "user_assets";

export type YtScreen =
  | "mode"
  | "keys" // API 키 설정(스텝 외 화면)
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

  // 나레이션 (줄마다 text + role)
  narration: NarrationLine[];
  // 확정 나레이션 → 이미지 프롬프트/모션이 채워진 줄(이후 job.lines). promo_comment 는 BGM 단계에서 지연 생성 → null.
  scriptLines: ScriptLine[] | null;

  // 음성(TTS)
  ttsEngine: string;
  voiceId: string;
  emotion: string;
  ttsSpeed: number;
  ttsSessionId: string | null;
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
}

export const initialYtState: YtState = {
  screen: "mode",
  mode: null,
  category: "cosmetics",
  contentType: "info",
  topic: "",
  painPoint: "",
  ingredient: "",
  keyword: "",
  productImageId: null,
  keywordAtTitleGen: "",
  titleOptions: [],
  selectedTitle: "",
  titleLine1: "",
  titleLine2: "",
  narration: [],
  scriptLines: null,
  ttsEngine: "typecast",
  voiceId: VOICE_OPTIONS[0].value,
  emotion: "normal",
  ttsSpeed: 1.0,
  ttsSessionId: null,
  expandedSentences: null,
  bgmFilename: null,
  bgmVolume: 12,
  bgmStartSec: 0,
  jobId: null,
  busy: false,
  error: null,
};

type Patch = Partial<YtState>;

function reducer(state: YtState, patch: Patch): YtState {
  return { ...state, ...patch };
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
  screen: YtScreen;
  label: string;
}

export const CARD_A_STEPS: YtStep[] = [
  { screen: "topic", label: "주제" },
  { screen: "titles", label: "제목" },
  { screen: "narration", label: "나레이션" },
  { screen: "tts", label: "음성" },
  { screen: "bgm", label: "BGM" },
];

export const CARD_B_STEPS: YtStep[] = [
  { screen: "script", label: "제목·대본" },
  { screen: "lines", label: "자산" },
  { screen: "tts", label: "음성" },
  { screen: "bgm", label: "BGM" },
];

export function stepsForMode(mode: YtMode | null): YtStep[] {
  return mode === "user_assets" ? CARD_B_STEPS : CARD_A_STEPS;
}
