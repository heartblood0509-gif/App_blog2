"use client";

// Wizard 작성 상태(WizardState)를 Context로 끌어올려 설정 페이지를 오가도 보존되게 한다.
// page.tsx가 useWizardState() 훅으로 읽고 쓴다. resetState()는 헤더 제목 클릭 시 호출.

import {
  createContext,
  useCallback,
  useContext,
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
  currentStep: 0,
  maxVisitedStep: 0,
  referenceAnalysis: "",
  referenceExcerpts: [],
  referenceText: "",
  referenceTitleFormula: null,
  isLoading: false,
  threads: initialThreadsState,
};

interface WizardStateContextValue {
  state: WizardState;
  setState: Dispatch<SetStateAction<WizardState>>;
  updateState: (partial: Partial<WizardState>) => void;
  resetState: () => void;
}

const WizardStateContext = createContext<WizardStateContextValue | null>(null);

export function WizardStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WizardState>(initialWizardState);

  const updateState = useCallback((partial: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const resetState = useCallback(() => {
    setState(initialWizardState);
  }, []);

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
