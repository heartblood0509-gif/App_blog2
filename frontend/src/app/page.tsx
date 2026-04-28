"use client";

import { useState, useCallback, useEffect, useRef } from "react";
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
  NarrativeSource,
  ToneType,
  UserPhoto,
} from "@/types";
import { parseImageMarkers, ensureSubtitleCoverage, ensureHookImage, dedupeSubtitleEchoes, stripBrTags } from "@/lib/image/marker-parser";

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
  narrativeSource: null,
  narrativeType: null,
  toneType: null,
  toneExample: "",
  referenceUrl: "",
  mainKeyword: "",
  subKeywords: "",
  persona: "",
  requirements: "",
  charCountRange: { min: 1500, max: 2000, label: "1500~2000자" },
  titleSuggestions: [],
  selectedTitle: "",
  generatedContent: "",
  qualityResult: null,
  imageSlots: [],
  userPhotosBySlot: {},
  excludedSlotIds: [],
  generatedImages: {},
  isGeneratingBySlot: {},
  isImageGenerating: false,
  customPromptsBySlot: {},
  currentStep: 0,
  referenceAnalysis: "",
  isLoading: false,
};

export default function Home() {
  const [state, setState] = useState<WizardState>(initialState);

  const updateState = useCallback((partial: Partial<WizardState>) => {
    setState((prev) => ({ ...prev, ...partial }));
  }, []);

  // 페이지 밖(슬롯 이외의 영역)에 파일을 드롭했을 때 브라우저가 파일을 열어 위저드 진행이 날아가지 않도록 방어
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  // content가 바뀔 때마다 이미지 슬롯 재파싱.
  // 기존 슬롯의 description이 같으면 ID/모드/업로드사진/생성이미지를 유지한다.
  // ★ AI가 소제목 아래 마커를 누락하면 자동 주입하여 100% 커버리지 보장.
  const prevContentRef = useRef<string>("");
  useEffect(() => {
    const rawContent = state.generatedContent;

    // 0) <br> 태그를 줄바꿈으로 치환 (미리보기와 발행물 표시 일치)
    // 1) 최상단 후킹 이미지 보장 (본문 맨 첫 줄에 마커 없으면 자동 주입)
    // 2) 소제목 직전 중복 일반 문장 제거 (네이버에서 인용구+텍스트 이중 노출 방지)
    // 3) 소제목 커버리지 보장 (누락된 곳에 마커 자동 주입)
    const cleanedContent = stripBrTags(rawContent);
    const hookedContent = ensureHookImage(cleanedContent, state.selectedTitle, state.mainKeyword);
    const dedupedContent = dedupeSubtitleEchoes(hookedContent);
    const coveredContent = ensureSubtitleCoverage(dedupedContent);

    // 처리 완료된 결과와 비교 — 원본이 같아도 아직 후킹/소제목 주입이 안 된 상태면 진행
    if (coveredContent === prevContentRef.current) return;

    if (coveredContent !== rawContent) {
      // 내용이 바뀌었으면 state 업데이트 → 이 useEffect가 다시 돌면서 파싱
      setState((prev) => ({ ...prev, generatedContent: coveredContent }));
      return;
    }

    prevContentRef.current = coveredContent;

    const newSlots = parseImageMarkers(coveredContent);

    // 기존 슬롯 중 같은 description+index이면 ID 재사용 (이미지/설정 보존)
    const oldSlots = state.imageSlots;
    const merged = newSlots.map((ns) => {
      const reuse = oldSlots.find(
        (os) => os.index === ns.index && os.description === ns.description
      );
      return reuse ? { ...ns, id: reuse.id } : ns;
    });

    const validIds = new Set(merged.map((s) => s.id));
    const prunedImages = Object.fromEntries(
      Object.entries(state.generatedImages).filter(([id]) => validIds.has(id))
    );
    const prunedPhotos = Object.fromEntries(
      Object.entries(state.userPhotosBySlot).filter(([id]) => validIds.has(id))
    );
    const prunedExcluded = state.excludedSlotIds.filter((id) => validIds.has(id));
    const prunedGenerating = Object.fromEntries(
      Object.entries(state.isGeneratingBySlot).filter(([id]) => validIds.has(id))
    );
    const prunedCustomPrompts = Object.fromEntries(
      Object.entries(state.customPromptsBySlot).filter(([id]) => validIds.has(id))
    );

    setState((prev) => ({
      ...prev,
      imageSlots: merged,
      generatedImages: prunedImages,
      userPhotosBySlot: prunedPhotos,
      excludedSlotIds: prunedExcluded,
      isGeneratingBySlot: prunedGenerating,
      customPromptsBySlot: prunedCustomPrompts,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.generatedContent]);

  const canAdvance = (): boolean => {
    switch (state.currentStep) {
      case 0:
        return state.selectedProducts.length > 0;
      case 1: {
        if (state.narrativeSource === null || state.toneType === null) return false;
        // 직접 레퍼런스 모드만 URL 필수 (감정/결론 선공형은 내장 샘플 사용)
        const urlRequired = state.narrativeSource === "custom-reference";
        if (urlRequired && state.referenceUrl.trim().length === 0) return false;
        return true;
      }
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
    updateState({
      isLoading: true,
      generatedContent: "",
      qualityResult: null,
      generatedImages: {},
      customPromptsBySlot: {},
    });
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          products: state.selectedProducts,
          narrativeType: state.narrativeType,
          toneType: state.toneType,
          toneExample: state.toneExample || undefined,
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

      // reader의 마지막 updateState가 React에 커밋될 기회 부여 (race 방어)
      await Promise.resolve();

      // 스트리밍 완료 직후 <br> 정화 → 후킹 → 중복 제거 → 소제목 커버리지 보장
      const finalized = ensureSubtitleCoverage(
        dedupeSubtitleEchoes(
          ensureHookImage(stripBrTags(content), state.selectedTitle, state.mainKeyword)
        )
      );
      if (finalized !== content) {
        content = finalized;
        updateState({ generatedContent: finalized });
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
  }, [state.selectedProducts, state.narrativeType, state.toneType, state.mainKeyword, state.subKeywords, state.persona, state.requirements, state.charCountRange, state.selectedTitle, state.referenceAnalysis, state.toneExample, updateState]);

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

      // reader의 마지막 updateState가 커밋될 기회 부여 (race 방어)
      await Promise.resolve();

      // 품질 수정 완료 직후 <br> 정화 → 후킹 → 중복 제거 → 소제목 커버리지 재보장
      const finalizedFix = ensureSubtitleCoverage(
        dedupeSubtitleEchoes(
          ensureHookImage(stripBrTags(fixed), state.selectedTitle, state.mainKeyword)
        )
      );
      if (finalizedFix !== fixed) {
        fixed = finalizedFix;
        updateState({ generatedContent: finalizedFix });
      }

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

  // ─────────────────────────────
  // 이미지 핸들러
  // ─────────────────────────────

  /** 사진 업로드/교체/제거. 업로드 시엔 generatedImages에도 즉시 커밋. */
  const handleUserPhotoChange = useCallback(
    (slotId: string, photo: UserPhoto | null) => {
      setState((prev) => {
        const nextPhotos = { ...prev.userPhotosBySlot };
        const nextImages = { ...prev.generatedImages };
        if (photo) {
          // 업로드(또는 교체): 원본 보관 + 최종 이미지로 즉시 커밋
          nextPhotos[slotId] = photo;
          nextImages[slotId] = photo.base64;
        } else {
          // 제거: 원본 삭제. 현재 출력이 원본과 동일하면 함께 삭제, 변환된 것이면 유지
          const oldPhoto = prev.userPhotosBySlot[slotId];
          delete nextPhotos[slotId];
          if (oldPhoto && nextImages[slotId] === oldPhoto.base64) {
            delete nextImages[slotId];
          }
        }
        return {
          ...prev,
          userPhotosBySlot: nextPhotos,
          generatedImages: nextImages,
        };
      });
    },
    []
  );

  const handleUserInstructionChange = useCallback(
    (slotId: string, instruction: string) => {
      setState((prev) => {
        const existing = prev.userPhotosBySlot[slotId];
        if (!existing) return prev;
        return {
          ...prev,
          userPhotosBySlot: {
            ...prev.userPhotosBySlot,
            [slotId]: { ...existing, instruction },
          },
        };
      });
    },
    []
  );

  /**
   * 슬롯의 커스텀 프롬프트 변경.
   * - prompt가 null이면 해당 키 삭제 → 기본 빌더 프롬프트로 복원
   * - 빈 문자열이 아닌 값이면 그대로 저장
   */
  const handleCustomPromptChange = useCallback(
    (slotId: string, prompt: string | null) => {
      setState((prev) => {
        const next = { ...prev.customPromptsBySlot };
        if (prompt === null) {
          delete next[slotId];
        } else {
          next[slotId] = prompt;
        }
        return { ...prev, customPromptsBySlot: next };
      });
    },
    []
  );

  const handleToggleExcluded = useCallback(
    (slotId: string, excluded: boolean) => {
      setState((prev) => {
        const set = new Set(prev.excludedSlotIds);
        if (excluded) set.add(slotId);
        else set.delete(slotId);
        return { ...prev, excludedSlotIds: Array.from(set) };
      });
    },
    []
  );

  /** 단일 슬롯 실행: AI 생성(text-to-image) 또는 AI 변환(image-to-image) */
  const runSlotAction = useCallback(
    async (slotId: string, action: "ai" | "transform") => {
      const slot = state.imageSlots.find((s) => s.id === slotId);
      if (!slot) return;
      if (state.excludedSlotIds.includes(slotId)) return;

      const photo = state.userPhotosBySlot[slotId];
      if (action === "transform" && !photo) {
        toast.error("업로드된 사진이 없습니다.");
        return;
      }

      setState((prev) => ({
        ...prev,
        isGeneratingBySlot: { ...prev.isGeneratingBySlot, [slotId]: true },
      }));

      try {
        const customPrompt =
          action === "ai" ? state.customPromptsBySlot[slotId] : undefined;
        const body = {
          content: state.generatedContent,
          slots: [
            {
              id: slot.id,
              index: slot.index,
              description: slot.description,
              groupId: slot.groupId,
              mode: action === "transform" ? "userPhoto" : "ai",
              userPhoto:
                action === "transform" && photo
                  ? {
                      base64: photo.base64,
                      mimeType: photo.mimeType,
                      instruction: photo.instruction,
                    }
                  : undefined,
              useProModel:
                action === "transform" && photo?.useProModel === true,
              customPrompt,
            },
          ],
        };

        const res = await fetch("/api/images/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(err.error || "이미지 생성 실패");
        }
        const data = (await res.json()) as {
          results: Array<{ id: string; status: string; base64?: string; error?: string }>;
        };
        const r = data.results[0];

        setState((prev) => {
          const nextGenerating = { ...prev.isGeneratingBySlot };
          nextGenerating[slotId] = false;
          if (r && r.status === "done" && r.base64) {
            return {
              ...prev,
              generatedImages: { ...prev.generatedImages, [slotId]: r.base64 },
              isGeneratingBySlot: nextGenerating,
            };
          }
          return { ...prev, isGeneratingBySlot: nextGenerating };
        });

        if (r && r.status === "done") {
          toast.success(action === "ai" ? "AI 생성 완료" : "AI 변환 완료");
        } else {
          toast.error(r?.error || "이미지 생성 실패");
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "이미지 생성 실패";
        toast.error(msg);
        setState((prev) => ({
          ...prev,
          isGeneratingBySlot: { ...prev.isGeneratingBySlot, [slotId]: false },
        }));
      }
    },
    [state.imageSlots, state.excludedSlotIds, state.userPhotosBySlot, state.generatedContent, state.customPromptsBySlot]
  );

  const handleGenerateSlotAI = useCallback(
    (slotId: string) => {
      runSlotAction(slotId, "ai");
    },
    [runSlotAction]
  );

  const handleTransformSlot = useCallback(
    (slotId: string) => {
      runSlotAction(slotId, "transform");
    },
    [runSlotAction]
  );

  /** 일괄 AI 생성: 사진도 없고 출력도 없는 빈 슬롯만 대상 */
  const handleGenerateImages = useCallback(async () => {
    const excludedSet = new Set(state.excludedSlotIds);
    const targets = state.imageSlots.filter(
      (s) =>
        !excludedSet.has(s.id) &&
        !state.userPhotosBySlot[s.id] &&
        !state.generatedImages[s.id]
    );

    if (targets.length === 0) {
      toast.info("생성할 빈 슬롯이 없습니다.");
      return;
    }

    setState((prev) => ({
      ...prev,
      isImageGenerating: true,
      isGeneratingBySlot: {
        ...prev.isGeneratingBySlot,
        ...Object.fromEntries(targets.map((t) => [t.id, true])),
      },
    }));

    try {
      const body = {
        content: state.generatedContent,
        slots: targets.map((s) => ({
          id: s.id,
          index: s.index,
          description: s.description,
          groupId: s.groupId,
          mode: "ai" as const,
          customPrompt: state.customPromptsBySlot[s.id],
        })),
      };
      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || "이미지 생성 실패");
      }
      const data = (await res.json()) as {
        results: Array<{ id: string; status: string; base64?: string }>;
      };

      setState((prev) => {
        const nextImages = { ...prev.generatedImages };
        const nextGenerating = { ...prev.isGeneratingBySlot };
        let doneCount = 0;
        let failCount = 0;
        for (const r of data.results) {
          nextGenerating[r.id] = false;
          if (r.status === "done" && r.base64) {
            nextImages[r.id] = r.base64;
            doneCount++;
          } else if (r.status === "failed") {
            failCount++;
          }
        }
        if (doneCount > 0) toast.success(`이미지 ${doneCount}개 생성 완료`);
        if (failCount > 0)
          toast.warning(
            `${failCount}개 생성 실패 — 해당 슬롯은 발행 시 빈 자리로 남습니다`
          );
        return {
          ...prev,
          generatedImages: nextImages,
          isGeneratingBySlot: nextGenerating,
          isImageGenerating: false,
        };
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "이미지 생성 실패";
      toast.error(msg);
      setState((prev) => {
        const nextGenerating = { ...prev.isGeneratingBySlot };
        for (const t of targets) nextGenerating[t.id] = false;
        return {
          ...prev,
          isGeneratingBySlot: nextGenerating,
          isImageGenerating: false,
        };
      });
    }
  }, [
    state.imageSlots,
    state.excludedSlotIds,
    state.userPhotosBySlot,
    state.generatedImages,
    state.generatedContent,
    state.customPromptsBySlot,
  ]);

  const handleNext = () => {
    if (!canAdvance() || state.currentStep >= STEPS.length - 1) return;
    const nextStep = state.currentStep + 1;
    updateState({ currentStep: nextStep });

    // 레퍼런스 분석은 Step 1 → Step 2 전환 시점에 미리 시작 (제목 생성 시점보다 일찍)
    if (nextStep === 2 && state.referenceUrl && !state.referenceAnalysis) {
      fetchReferenceAnalysis().catch(() => {});
    }
    if (nextStep === 3 && state.titleSuggestions.length === 0) {
      fetchTitles().catch(() => {});
    }
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

  const handleNarrativeSourceChange = useCallback(
    (source: NarrativeSource) => {
      // narrativeType 파생: custom-reference면 null, 나머지는 동일한 값
      const narrativeType = source === "custom-reference" ? null : source;
      updateState({
        narrativeSource: source,
        narrativeType,
        // 모드가 바뀌면 이전 분석 결과는 무효 (URL도 새로 입력)
        referenceAnalysis: "",
      });
    },
    [updateState]
  );

  const handleReferenceUrlChange = useCallback(
    (url: string) => {
      updateState({ referenceUrl: url, referenceAnalysis: "" });
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
            narrativeSource={state.narrativeSource}
            referenceUrl={state.referenceUrl}
            toneType={state.toneType}
            toneExample={state.toneExample}
            onNarrativeSourceChange={handleNarrativeSourceChange}
            onReferenceUrlChange={handleReferenceUrlChange}
            onToneChange={handleToneChange}
            onToneExampleChange={(example: string) => updateState({ toneExample: example })}
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
            imageSlots={state.imageSlots}
            userPhotosBySlot={state.userPhotosBySlot}
            excludedSlotIds={state.excludedSlotIds}
            generatedImages={state.generatedImages}
            isGeneratingBySlot={state.isGeneratingBySlot}
            isImageGenerating={state.isImageGenerating}
            customPromptsBySlot={state.customPromptsBySlot}
            onUserPhotoChange={handleUserPhotoChange}
            onUserInstructionChange={handleUserInstructionChange}
            onToggleExcluded={handleToggleExcluded}
            onGenerateImages={handleGenerateImages}
            onGenerateSlotAI={handleGenerateSlotAI}
            onTransformSlot={handleTransformSlot}
            onCustomPromptChange={handleCustomPromptChange}
          />
        );
      case 5:
        return (
          <StepPublish
            content={state.generatedContent}
            title={state.selectedTitle}
            imageSlots={state.imageSlots}
            generatedImages={state.generatedImages}
            excludedSlotIds={state.excludedSlotIds}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <button
            onClick={() => setState(initialState)}
            className="text-2xl font-bold tracking-tight sm:text-3xl hover:text-primary transition-colors"
          >
            후기성 블로그 생성기
          </button>
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
