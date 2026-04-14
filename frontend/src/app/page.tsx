"use client";

import { useState, useCallback } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Package,
  BookOpen,
  Settings,
  Type,
  FileText,
  Send,
  Check,
} from "lucide-react";
import type {
  WizardState,
  SelectedProduct,
  NarrativeType,
  ToneType,
  TitleSuggestion,
  QualityResult,
} from "@/types";

import { StepProductSelect } from "@/components/steps/step-product-select";
import { StepNarrative } from "@/components/steps/step-narrative";
import { StepSettings } from "@/components/steps/step-settings";
import { StepTitleSelect } from "@/components/steps/step-title-select";
import { StepGenerate } from "@/components/steps/step-generate";
import { StepPublish } from "@/components/steps/step-publish";

const STEPS = [
  { label: "제품 선택", icon: Package },
  { label: "글 구조", icon: BookOpen },
  { label: "글 설정", icon: Settings },
  { label: "제목 선택", icon: Type },
  { label: "글 생성", icon: FileText },
  { label: "발행", icon: Send },
];

const initialState: WizardState = {
  selectedProducts: [],
  narrativeType: null,
  toneType: null,
  mainKeyword: "",
  subKeywords: "",
  persona: "",
  requirements: "",
  charCountRange: { min: 1500, max: 2000, label: "1500~2000자" },
  referenceUrl: "",
  titleSuggestions: [],
  selectedTitle: "",
  generatedContent: "",
  qualityResult: null,
  currentStep: 0,
  referenceAnalysis: "",
  isLoading: false,
};

export default function Home() {
  const [state, setState] = useState<WizardState>(initialState);

  const updateState = useCallback((partial: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  const canAdvance = (): boolean => {
    switch (state.currentStep) {
      case 0:
        return state.selectedProducts.length > 0;
      case 1:
        return state.narrativeType !== null && state.toneType !== null;
      case 2:
        return state.mainKeyword.trim().length > 0;
      case 3:
        return state.selectedTitle.trim().length > 0;
      case 4:
        return state.generatedContent.trim().length > 0;
      default:
        return true;
    }
  };

  const fetchReferenceAnalysis = useCallback(async () => {
    if (!state.referenceUrl) return;
    updateState({ isLoading: true });
    try {
      // 1) 크롤링
      const crawlRes = await fetch("/api/crawl", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: state.referenceUrl }),
      });
      if (!crawlRes.ok) {
        const err = await crawlRes.json();
        throw new Error(err.error || "크롤링에 실패했습니다.");
      }
      const crawlData = await crawlRes.json();

      // 2) 분석
      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ referenceText: crawlData.content }),
      });
      if (!analyzeRes.ok) {
        const err = await analyzeRes.json();
        throw new Error(err.error || "분석에 실패했습니다.");
      }
      const analyzeData = await analyzeRes.json();

      updateState({ referenceAnalysis: analyzeData.analysis, isLoading: false });
      toast.success("레퍼런스 분석이 완료되었습니다.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "레퍼런스 분석 실패";
      toast.error(msg);
      updateState({ isLoading: false });
    }
  }, [state.referenceUrl, updateState]);

  const fetchTitles = useCallback(async () => {
    updateState({ isLoading: true, titleSuggestions: [] });
    try {
      const res = await fetch("/api/titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: state.selectedProducts,
          narrativeType: state.narrativeType,
          toneType: state.toneType,
          mainKeyword: state.mainKeyword,
          subKeywords: state.subKeywords || undefined,
          persona: state.persona || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "제목 생성에 실패했습니다.");
      }
      const data = await res.json();
      if (!Array.isArray(data.suggestions)) {
        throw new Error("응답 형식이 올바르지 않습니다. 다시 시도해주세요.");
      }
      updateState({ titleSuggestions: data.suggestions, isLoading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "제목 생성 실패";
      toast.error(msg);
      updateState({ isLoading: false });
    }
  }, [state.selectedProducts, state.narrativeType, state.toneType, state.mainKeyword, state.subKeywords, state.persona, updateState]);

  const fetchContent = useCallback(async () => {
    updateState({ isLoading: true, generatedContent: "", qualityResult: null });
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: state.selectedProducts,
          narrativeType: state.narrativeType,
          toneType: state.toneType,
          mainKeyword: state.mainKeyword,
          subKeywords: state.subKeywords || undefined,
          persona: state.persona || undefined,
          requirements: state.requirements || undefined,
          charCount: state.charCountRange,
          selectedTitle: state.selectedTitle,
          referenceAnalysis: state.referenceAnalysis || undefined,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || "글 생성에 실패했습니다.");
      }

      if (!res.body) throw new Error("스트림 응답을 받을 수 없습니다.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let content = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          content += decoder.decode(value, { stream: true });
          updateState({ generatedContent: content });
        }
      } catch {
        if (content.length > 0) {
          toast.error("글 생성 중 연결이 끊겼습니다. 생성된 부분까지 표시합니다.");
        } else {
          throw new Error("글 생성 중 연결이 끊겼습니다.");
        }
      }

      if (content.length === 0) {
        throw new Error("생성된 내용이 없습니다. 다시 시도해주세요.");
      }

      // 생성 완료 후 품질 검증
      const validateRes = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: content,
          keyword: state.mainKeyword,
          charRange: state.charCountRange,
        }),
      });
      if (validateRes.ok) {
        const quality = await validateRes.json();
        updateState({ qualityResult: quality, isLoading: false });
      } else {
        updateState({ isLoading: false });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "글 생성 실패";
      toast.error(msg);
      updateState({ isLoading: false });
    }
  }, [state.selectedProducts, state.narrativeType, state.toneType, state.mainKeyword, state.subKeywords, state.persona, state.requirements, state.charCountRange, state.selectedTitle, state.referenceAnalysis, updateState]);

  const handleQualityFix = useCallback(async () => {
    if (!state.qualityResult || state.qualityResult.isPass) return;
    updateState({ isLoading: true });
    try {
      const res = await fetch("/api/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: state.generatedContent,
          failReasons: state.qualityResult.failReasons,
          keyword: state.mainKeyword,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "수정 실패" }));
        throw new Error(err.error || "품질 수정에 실패했습니다.");
      }

      if (!res.body) throw new Error("응답을 받을 수 없습니다.");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let fixed = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        fixed += decoder.decode(value, { stream: true });
        updateState({ generatedContent: fixed });
      }

      // 수정 후 재검증
      const validateRes = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: fixed,
          keyword: state.mainKeyword,
          charRange: state.charCountRange,
        }),
      });
      if (validateRes.ok) {
        const quality = await validateRes.json();
        updateState({ qualityResult: quality, isLoading: false });
        if (quality.isPass) {
          toast.success("품질 수정 완료! 모든 항목 통과.");
        } else {
          toast.info("일부 항목이 개선되었습니다. 한 번 더 시도해보세요.");
        }
      } else {
        updateState({ isLoading: false });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "품질 수정 실패";
      toast.error(msg);
      updateState({ isLoading: false });
    }
  }, [state.generatedContent, state.qualityResult, state.mainKeyword, state.charCountRange, updateState]);

  const handleNext = () => {
    if (!canAdvance() || state.currentStep >= STEPS.length - 1) return;
    const nextStep = state.currentStep + 1;
    updateState({ currentStep: nextStep });

    // Step 2→3 전환 시: 레퍼런스 URL이 있으면 분석 실행
    if (nextStep === 3 && state.referenceUrl && !state.referenceAnalysis) {
      fetchReferenceAnalysis().catch(() => {});
    }
    // Step 2→3 완료 시 제목 자동 생성
    if (nextStep === 3 && state.titleSuggestions.length === 0) {
      fetchTitles().catch(() => {});
    }
    // Step 3→4 완료 시 글 자동 생성
    if (nextStep === 4 && state.generatedContent === "") {
      fetchContent().catch(() => {});
    }
  };

  const handleBack = () => {
    if (state.currentStep > 0) {
      updateState({ currentStep: state.currentStep - 1 });
    }
  };

  const handleProductChange = useCallback(
    (products: SelectedProduct[]) => {
      updateState({ selectedProducts: products });
    },
    [updateState]
  );

  const handleNarrativeChange = useCallback(
    (type: NarrativeType) => {
      updateState({ narrativeType: type });
    },
    [updateState]
  );

  const handleToneChange = useCallback(
    (type: ToneType) => {
      updateState({ toneType: type });
    },
    [updateState]
  );

  const handleTitleSelect = useCallback(
    (title: string) => {
      updateState({ selectedTitle: title });
    },
    [updateState]
  );

  const handleTitleRegenerate = useCallback(() => {
    fetchTitles();
  }, [fetchTitles]);

  const handleContentRegenerate = useCallback(() => {
    fetchContent();
  }, [fetchContent]);

  const handleContentCopy = useCallback(() => {
    navigator.clipboard.writeText(state.generatedContent);
  }, [state.generatedContent]);

  const renderStep = () => {
    switch (state.currentStep) {
      case 0:
        return (
          <StepProductSelect
            selectedProducts={state.selectedProducts}
            onChange={handleProductChange}
          />
        );
      case 1:
        return (
          <StepNarrative
            narrativeType={state.narrativeType}
            toneType={state.toneType}
            onNarrativeChange={handleNarrativeChange}
            onToneChange={handleToneChange}
          />
        );
      case 2:
        return <StepSettings state={state} onChange={updateState} />;
      case 3:
        return (
          <StepTitleSelect
            titles={state.titleSuggestions}
            selectedTitle={state.selectedTitle}
            onSelect={handleTitleSelect}
            onRegenerate={handleTitleRegenerate}
            isLoading={state.isLoading}
          />
        );
      case 4:
        return (
          <StepGenerate
            content={state.generatedContent}
            qualityResult={state.qualityResult}
            keyword={state.mainKeyword}
            isLoading={state.isLoading}
            onRegenerate={handleContentRegenerate}
            onCopy={handleContentCopy}
            onQualityFix={handleQualityFix}
          />
        );
      case 5:
        return (
          <StepPublish
            content={state.generatedContent}
            title={state.selectedTitle}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            후기성 블로그 생성기
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            자연스러운 후기형 블로그 포스팅을 단계별로 생성합니다
          </p>
        </div>

        {/* Stepper */}
        <nav className="mb-10">
          <ol className="flex items-center justify-between">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === state.currentStep;
              const isCompleted = index < state.currentStep;

              return (
                <li
                  key={step.label}
                  className="flex flex-1 items-center last:flex-none"
                >
                  <div className="flex flex-col items-center gap-2">
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                        isCompleted
                          ? "border-primary bg-primary text-primary-foreground"
                          : isActive
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-muted bg-muted/30 text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </div>
                    <span
                      className={`text-xs font-medium whitespace-nowrap ${
                        isActive
                          ? "text-foreground"
                          : isCompleted
                            ? "text-primary"
                            : "text-muted-foreground"
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {index < STEPS.length - 1 && (
                    <div
                      className={`mx-2 mt-[-1.5rem] h-0.5 flex-1 transition-colors duration-300 ${
                        index < state.currentStep
                          ? "bg-primary"
                          : "bg-muted"
                      }`}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Step Content */}
        <div className="relative min-h-[500px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={state.currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
            >
              {renderStep()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Navigation Buttons */}
        <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
          <Button
            variant="outline"
            size="lg"
            onClick={handleBack}
            disabled={state.currentStep === 0}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            이전
          </Button>

          <span className="text-sm text-muted-foreground">
            {state.currentStep + 1} / {STEPS.length}
          </span>

          {state.currentStep < STEPS.length - 1 && (
            <Button
              size="lg"
              onClick={handleNext}
              disabled={!canAdvance()}
              className="gap-2"
            >
              다음
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          {state.currentStep === STEPS.length - 1 && <div className="w-20" />}
        </div>
      </div>
    </div>
  );
}
