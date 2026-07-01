"use client";

// Wizard 작성 상태(WizardState)를 Context로 끌어올려 설정 페이지를 오가도 보존되게 한다.
// page.tsx가 useWizardState() 훅으로 읽고 쓴다. resetState()는 헤더 제목 클릭 시 호출.
//
// 영속성: 가벼운 텍스트·구조 필드만 localStorage에 자동 저장(500ms debounce).
// 이미지 등 큰 이진 데이터는 image-storage(IndexedDB)에서 별도 관리하므로 제외.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import { initialThreadsState, type WizardState } from "@/types";
import { NARRATIVE_TEMPLATES } from "@/lib/prompts/narrative-templates";

const initialWizardState: WizardState = {
  selectedProducts: [],
  channel: null,
  postCategory: null,
  narrativeSource: null,
  narrativeType: null,
  toneType: null,
  toneExample: "",
  referenceUrl: "",
  selectedCustomReferenceId: null,
  selectedBrandProfileId: null,
  selectedBrandTemplate: null,
  selectedBrandInfoVariant: null,
  selectedBrandIntroVariant: null,
  selectedBrandValueProofVariant: null,
  selectedBrandDetailVariant: null,
  selectedBrandProductId: undefined,
  selectedAeoProfileId: null,
  selectedAeoProductId: undefined,
  selectedTemplateType: "auto",
  brandPropositions: null,
  brandPropositionsCacheKey: null,
  selectedAnalysisRecordId: null,
  brandCustomReferenceMode: "branded",
  topic: "",
  mainKeyword: "",
  subKeywords: "",
  persona: "",
  requirements: "",
  charCountRange: { min: 0, max: 0, label: "레퍼런스 맞춤" },
  productPlacementMode: "mention",
  titleSuggestions: [],
  selectedTitle: "",
  generatedContent: "",
  qualityResult: null,
  contentDirty: false,
  manualImageLayout: false,
  imageSlots: [],
  userPhotosBySlot: {},
  excludedSlotIds: [],
  generatedImages: {},
  isGeneratingBySlot: {},
  isImageGenerating: false,
  imageDescBySlot: {},
  aspectBySlot: {},
  slotFailures: {},
  slotVersionMap: {},
  currentRoundId: null,
  currentStep: 0,
  maxVisitedStep: 0,
  referenceAnalysis: "",
  referenceExcerpts: [],
  referenceText: "",
  referenceTitleFormula: null,
  isLoading: false,
  threads: initialThreadsState,
};

const LS_KEY = "blog-pick-wizard-state-v1";

/**
 * v3 (시드 6개 영구 제거) — 마이그레이션.
 *
 * 50명 배포 환경에서 옛 사용자의 localStorage에 시드 ID가 남아있으면
 * BRAND_PRODUCTS lookup 실패 → silent fail (제품 컨텍스트 누락된 글 생성).
 * 다음 접속 시 자동 1회 정리.
 */
const LEGACY_SEED_IDS = new Set([
  "therapy-shampoo",
  "hair-loss-shampoo",
  "scalp-brush",
  "body-lotion",
  "hair-tonic",
  "soap",
]);

function purgeLegacySeedIds(state: Partial<WizardState>): Partial<WizardState> {
  return {
    ...state,
    selectedProducts: (state.selectedProducts ?? []).filter(
      (p) => !LEGACY_SEED_IDS.has(p.id),
    ),
    selectedBrandProductId: LEGACY_SEED_IDS.has(state.selectedBrandProductId ?? "")
      ? undefined
      : state.selectedBrandProductId,
    selectedAeoProductId: LEGACY_SEED_IDS.has(state.selectedAeoProductId ?? "")
      ? undefined
      : state.selectedAeoProductId,
  };
}

// localStorage 보관에서 제외할 필드: 큰 이진 / 진행 중 플래그 / IDB 관리 데이터
const NON_PERSISTABLE_KEYS = [
  "generatedImages",
  "userPhotosBySlot",
  "isGeneratingBySlot",
  "isImageGenerating",
  "slotFailures",
  "slotVersionMap",
  "currentRoundId",
  "isLoading",
] as const;

function pickPersistable(state: WizardState): Partial<WizardState> {
  const clone: Partial<WizardState> = { ...state };
  for (const k of NON_PERSISTABLE_KEYS) {
    delete clone[k];
  }
  return clone;
}

function loadFromStorage(): WizardState {
  if (typeof window === "undefined") return initialWizardState;
  try {
    const raw = window.localStorage.getItem(LS_KEY);
    if (!raw) return initialWizardState;
    const parsed = JSON.parse(raw) as Partial<WizardState> & { postCategory?: unknown };
    // 마이그레이션 1: 옛 "aeo" 단독 카테고리는 제거되었으므로 seoAeo로 승격.
    // (UI에서 "AEO 블로그"로 표시되던 흐름과 동일한 통합형으로 자연스럽게 이어짐)
    // unknown 캐스트 — PostCategory 타입에서 "aeo" 가 빠졌지만 옛 localStorage 에는 남아있을 수 있어
    // 의도적으로 string 값 비교. (없으면 옛 사용자가 진입 시 화면 깨짐)
    if ((parsed.postCategory as unknown) === "aeo") {
      parsed.postCategory = "seoAeo";
    }
    // 마이그레이션 3: 옛 버전/브랜치에서 저장된 서사(narrativeType)가 이 버전에 없는 값이면 null 로 정리.
    // (예: 문제해결 후기형·hook-conclusion 등 다른 흐름에서 고른 값 → getNarrativePrompt 크래시 방지)
    if (
      parsed.narrativeType != null &&
      !((parsed.narrativeType as string) in NARRATIVE_TEMPLATES)
    ) {
      parsed.narrativeType = null;
    }
    // 마이그레이션 4: 옛 customPromptsBySlot(=슬롯별 '전체 프롬프트')는 imageDescBySlot(='설명만')로
    // 의미가 바뀌었다. 옛 값을 그대로 두면 50줄 프롬프트가 description으로 오인·부활하므로 명시 삭제.
    // (rename만으로는 parsed의 unknown key가 state에 얹혀 재저장되므로 삭제가 필요 — Codex #5)
    delete (parsed as Record<string, unknown>).customPromptsBySlot;
    // 마이그레이션 2 (v3): 시드 6개 영구 제거. 옛 사용자 localStorage 자동 정리.
    return { ...initialWizardState, ...purgeLegacySeedIds(parsed as Partial<WizardState>) };
  } catch {
    return initialWizardState;
  }
}

function isDirty(state: WizardState): boolean {
  return state.channel !== null || state.currentStep > 0;
}

interface WizardStateContextValue {
  state: WizardState;
  setState: Dispatch<SetStateAction<WizardState>>;
  updateState: (partial: Partial<WizardState>) => void;
  resetState: () => void;
}

const WizardStateContext = createContext<WizardStateContextValue | null>(null);

export function WizardStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(() => loadFromStorage());

  const updateState = useCallback((partial: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetState = useCallback(() => {
    setState(initialWizardState);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(LS_KEY);
      } catch {}
    }
  }, []);

  // state 변경마다 500ms debounce 후 localStorage에 저장.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(
          LS_KEY,
          JSON.stringify(pickPersistable(state)),
        );
      } catch {
        // quota 초과 등은 무시 — 다음 변경 때 다시 시도.
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [state]);

  // 입력값이 있는 상태에서 창 닫기·새로고침 시도 시 브라우저 경고.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isDirty(state)) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state]);

  return (
    <WizardStateContext.Provider value={{ state, setState, updateState, resetState }}>
      {children}
    </WizardStateContext.Provider>
  );
}

export function useWizardState(): WizardStateContextValue {
  const ctx = useContext(WizardStateContext);
  if (!ctx) {
    throw new Error("useWizardState must be used within WizardStateProvider");
  }
  return ctx;
}
