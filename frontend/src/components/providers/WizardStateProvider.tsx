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
  selectedAeoProfileId: null,
  selectedAeoTemplate: null,
  aeoTargetQueries: [],
  aeoSources: [],
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
  titleSuggestions: [],
  selectedTitle: "",
  generatedContent: "",
  qualityResult: null,
  contentDirty: false,
  imageSlots: [],
  userPhotosBySlot: {},
  excludedSlotIds: [],
  generatedImages: {},
  isGeneratingBySlot: {},
  isImageGenerating: false,
  customPromptsBySlot: {},
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
    const parsed = JSON.parse(raw) as Partial<WizardState>;
    return { ...initialWizardState, ...parsed };
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
