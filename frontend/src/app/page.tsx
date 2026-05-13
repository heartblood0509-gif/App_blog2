"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
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
  Channel,
  PostCategory,
  ThreadsState,
  UserProduct,
  ProductInfo,
} from "@/types";
import type { BrandProfile, BrandProposition } from "@/types/brand";
import { initialThreadsState } from "@/types";
import { fetchUserProducts } from "@/lib/products";
import { buildCustomProductInfo } from "@/lib/prompts/brand-context";
import { parseImageMarkers, ensureSubtitleCoverage, ensureHookImage, ensureIntroImage, dedupeSubtitleEchoes, stripBrTags } from "@/lib/image/marker-parser";

import { StepChannelSelect } from "@/components/steps/step-channel-select";
import { StepNarrative } from "@/components/steps/step-narrative";
import { StepSettings } from "@/components/steps/step-settings";
import { StepTitleSelect } from "@/components/steps/step-title-select";
import { StepGenerate } from "@/components/steps/step-generate";
import { StepPublish } from "@/components/steps/step-publish";
import { StepThreadsAnalysis } from "@/components/steps-threads/step-threads-analysis";
import { StepThreadsSettings } from "@/components/steps-threads/step-threads-settings";
import { StepThreadsGenerate } from "@/components/steps-threads/step-threads-generate";
import { TemplateFitModal } from "@/components/brand/template-fit-modal";
import { SourceWarningModal } from "@/components/aeo/source-warning-modal";

const BLOG_STEPS = [
  { label: "채널 선택", icon: Package },
  { label: "글 구조", icon: BookOpen },
  { label: "글 설정", icon: Settings },
  { label: "제목 선택", icon: Type },
  { label: "글 생성", icon: FileText },
  { label: "발행", icon: Send },
];

const THREADS_STEPS = [
  { label: "채널 선택", icon: Package },
  { label: "분석 방식", icon: BookOpen },
  { label: "글 설정", icon: Settings },
  { label: "쓰레드 생성", icon: FileText },
];

const initialState: WizardState = {
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
  selectedAeoProfileId: null,
  selectedAeoTemplate: null,
  aeoTargetQueries: [],
  aeoSources: [],
  selectedAnalysisRecordId: null,
  brandPropositions: null,
  brandPropositionsCacheKey: null,
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
  referenceAnalysis: "",
  referenceExcerpts: [],
  referenceText: "",
  isLoading: false,
  threads: initialThreadsState,
};

export default function Home() {
  const [state, setState] = useState<WizardState>(initialState);
  const [userProducts, setUserProducts] = useState<UserProduct[]>([]);

  const refetchUserProducts = useCallback(async () => {
    const list = await fetchUserProducts();
    setUserProducts(list);
  }, []);

  useEffect(() => {
    refetchUserProducts();
  }, [refetchUserProducts]);

  const customProductInfoById = useMemo<Record<string, ProductInfo>>(
    () =>
      Object.fromEntries(userProducts.map((p) => [p.id, buildCustomProductInfo(p)])),
    [userProducts]
  );

  const handleProductDeleted = useCallback((deletedId: string) => {
    setState((prev) => ({
      ...prev,
      selectedProducts: prev.selectedProducts.filter((p) => p.id !== deletedId),
    }));
  }, []);

  // Phase 1 검문소 — 브랜드 모드 글 생성 직전 LLM 적합성 검사 결과를 띄우는 모달 상태.
  // 글 생성 자체는 막지 않음. 사용자가 ① 추천 적용 / ② 이전 단계 / ③ 그냥 진행 중 선택.
  const [fitGate, setFitGate] = useState<{
    open: boolean;
    reason: string;
    suggestions: string[];
  } | null>(null);
  // 모달의 ①/③ 동작 후 같은 입력으로 fetchContent를 다시 부를 때, 검문소를 재실행하지 않기 위한 1회용 플래그.
  const bypassFitCheckRef = useRef(false);

  // AEO 모드 — Step 2→3 진행 시 출처가 비어있으면 경고. "그대로 진행" 1회 통과 플래그.
  const [sourceWarningOpen, setSourceWarningOpen] = useState(false);
  const bypassSourceWarningRef = useRef(false);

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
    // 3) 도입부 이미지 보장 (HOOK~첫 소제목 사이 본문이 길면 마커 자동 주입)
    // 4) 소제목 커버리지 보장 (누락된 곳에 마커 자동 주입)
    const cleanedContent = stripBrTags(rawContent);
    const hookedContent = ensureHookImage(cleanedContent, state.selectedTitle, state.mainKeyword);
    const dedupedContent = dedupeSubtitleEchoes(hookedContent);
    const introCoveredContent = ensureIntroImage(dedupedContent, state.mainKeyword);
    const coveredContent = ensureSubtitleCoverage(introCoveredContent);

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

  const STEPS = state.channel === "thread" ? THREADS_STEPS : BLOG_STEPS;

  const canAdvance = (): boolean => {
    // 쓰레드 채널 분기
    if (state.channel === "thread") {
      switch (state.currentStep) {
        case 0:
          return true; // 채널만 고르면 통과
        case 1:
          return (
            state.threads.analysisMode !== null &&
            state.threads.analysisResult.trim() !== ""
          );
        case 2:
          return state.threads.analysisMode === "image" ||
            state.threads.analysisMode === "template"
            ? state.threads.settings.topic.trim() !== ""
            : true;
        case 3:
          return true;
        default:
          return false;
      }
    }

    // 블로그 채널 (기존 로직 그대로)
    switch (state.currentStep) {
      case 0:
        // Step 0은 채널 선택 전용. 채널만 고르면 통과.
        return state.channel !== null;
      case 1: {
        // 카테고리는 블로그 채널일 때만 필수
        if (state.channel === "blog" && state.postCategory === null) return false;
        // 서사 구조/말투/URL/제품 체크는 후기성 카테고리일 때만 적용
        // (브랜드/AEO 등 다른 카테고리는 향후 다른 구성을 가질 예정)
        if (state.postCategory === "review") {
          // 제품 선택 (Step 0에서 분리됨 — Step 1로 이동)
          if (state.selectedProducts.length === 0) return false;
          if (state.narrativeSource === null || state.toneType === null) return false;
          // 직접 레퍼런스 모드만 URL 필수 (감정/결론 선공형은 내장 샘플 사용)
          const urlRequired = state.narrativeSource === "custom-reference";
          if (urlRequired && state.referenceUrl.trim().length === 0) return false;
          // custom-reference 모드는 분석 완료까지 강제 (Step 2에서 명시적 [분석] 버튼으로 트리거)
          if (urlRequired && state.referenceAnalysis.trim().length === 0) return false;
        }
        if (state.postCategory === "brand") {
          // 브랜드 프로필 + 템플릿 선택 필수. 정보성글이면 변형도 선택.
          if (!state.selectedBrandProfileId) return false;
          if (!state.selectedBrandTemplate) return false;
          if (state.selectedBrandTemplate === "info" && !state.selectedBrandInfoVariant) return false;
          // info-custom 모드: 견본 글 분석 결과 필수 (URL 또는 본문 입력 후 분석 완료까지 강제)
          if (state.selectedBrandInfoVariant === "info-custom") {
            if (state.referenceAnalysis.trim().length === 0) return false;
          }
          // info-structure-based 모드: 보관함에서 분석 선택 필수
          if (state.selectedBrandInfoVariant === "info-structure-based") {
            if (!state.selectedAnalysisRecordId) return false;
          }
        }
        if (state.postCategory === "aeo") {
          // AEO 프로필 + 글 타입 선택 필수.
          if (!state.selectedAeoProfileId) return false;
          if (!state.selectedAeoTemplate) return false;
        }
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

  const advanceHint = (): string | undefined => {
    if (canAdvance()) return undefined;

    // 쓰레드 채널 hint
    if (state.channel === "thread") {
      switch (state.currentStep) {
        case 0:
          return state.channel === null ? "채널을 선택해주세요" : undefined;
        case 1:
          if (state.threads.analysisMode === null) return "분석 방식을 선택해주세요";
          if (state.threads.analysisResult.trim() === "")
            return "분석을 완료해주세요";
          return undefined;
        case 2:
          if (
            (state.threads.analysisMode === "image" ||
              state.threads.analysisMode === "template") &&
            state.threads.settings.topic.trim() === ""
          ) {
            return "주제를 입력해주세요";
          }
          return undefined;
        default:
          return undefined;
      }
    }

    switch (state.currentStep) {
      case 0:
        if (state.channel === null) return "채널을 선택해주세요";
        if (state.selectedProducts.length === 0) return "제품을 1개 이상 선택해주세요";
        return undefined;
      case 1:
        if (state.channel === "blog" && state.postCategory === null)
          return "포스팅 카테고리를 선택해주세요";
        if (state.postCategory === "review") {
          if (state.narrativeSource === null) return "서사 구조를 선택해주세요";
          if (state.toneType === null) return "말투를 선택해주세요";
          if (
            state.narrativeSource === "custom-reference" &&
            state.referenceUrl.trim().length === 0
          )
            return "레퍼런스 URL을 입력해주세요";
        }
        if (state.postCategory === "brand") {
          if (!state.selectedBrandProfileId) return "브랜드 프로필을 선택해주세요";
          if (!state.selectedBrandTemplate) return "글 템플릿을 선택해주세요";
          if (state.selectedBrandTemplate === "info" && !state.selectedBrandInfoVariant)
            return "정보성글 변형을 선택해주세요";
          if (
            state.selectedBrandInfoVariant === "info-structure-based" &&
            !state.selectedAnalysisRecordId
          )
            return "보관함에서 분석을 선택해주세요";
        }
        if (state.postCategory === "aeo") {
          if (!state.selectedAeoProfileId) return "AEO 프로필을 선택해주세요";
          if (!state.selectedAeoTemplate) return "AEO 글 타입을 선택해주세요";
        }
        return undefined;
      case 2:
        if (state.mainKeyword.trim().length === 0) return "메인 키워드를 입력해주세요";
        return undefined;
      default:
        return undefined;
    }
  };

  const fetchReferenceAnalysis = useCallback(async (overrideMode?: "url" | "text") => {
    const mode = overrideMode ?? "url";
    let textToAnalyze = "";

    if (mode === "url") {
      if (!state.referenceUrl) return;
    } else {
      if (!state.referenceText.trim()) return;
    }

    updateState({ isLoading: true });
    try {
      if (mode === "url") {
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
        textToAnalyze = crawlData.content;
        // 텍스트 모드와 동일하게 referenceText에도 채워넣어 생성 단계에서 활용
        updateState({ referenceText: textToAnalyze });
      } else {
        textToAnalyze = state.referenceText.trim();
      }

      const analyzeRes = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referenceText: textToAnalyze,
          mode: state.postCategory === "brand" ? "brand" : "review",
        }),
      });
      if (!analyzeRes.ok) {
        const err = await analyzeRes.json();
        throw new Error(err.error || "분석에 실패했습니다.");
      }
      const analyzeData = await analyzeRes.json();

      // 분석 완료 시 사용자가 아직 톤을 안 골랐으면 "레퍼런스 그대로"를 기본값으로 자동 선택
      const autoTone =
        state.toneType === null ? { toneType: "레퍼런스" as const } : {};
      updateState({
        referenceAnalysis: analyzeData.analysis,
        referenceExcerpts: Array.isArray(analyzeData.excerpts) ? analyzeData.excerpts : [],
        isLoading: false,
        ...autoTone,
      });
      toast.success("레퍼런스 분석이 완료되었습니다.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "레퍼런스 분석 실패";
      toast.error(msg);
      updateState({ isLoading: false });
    }
  }, [state.referenceUrl, state.toneType, state.referenceText, state.postCategory, updateState]);

  // 브랜드 모드에서 selectedBrandProfileId 로 프로필 객체를 가져옴
  const fetchBrandProfile = useCallback(async (): Promise<BrandProfile | null> => {
    if (!state.selectedBrandProfileId) return null;
    try {
      const res = await fetch("/api/brand/profiles", { cache: "no-store" });
      if (!res.ok) return null;
      const all = await res.json();
      if (!Array.isArray(all)) return null;
      return (all.find((p: BrandProfile) => p?.id === state.selectedBrandProfileId) ?? null) as BrandProfile | null;
    } catch {
      return null;
    }
  }, [state.selectedBrandProfileId]);

  /**
   * 정보성글 — 본문/제목 생성 직전에 distill 결과를 보장.
   * 캐시 키(`${profileId}:${mainKeyword}`)가 일치하면 기존 결과 재사용,
   * 다르면 `/api/brand/distill` 호출 후 state에 저장.
   *
   * 정보성글이 아니거나 브랜드 모드가 아니면 null 반환 (no-op).
   */
  const ensureBrandPropositions = useCallback(
    async (profileArg?: BrandProfile | null): Promise<BrandProposition[] | null> => {
      if (state.postCategory !== "brand") return null;
      if (state.selectedBrandTemplate !== "info") return null;

      const profile = profileArg ?? (await fetchBrandProfile());
      if (!profile) {
        throw new Error("브랜드 프로필을 불러오지 못했습니다.");
      }

      const cacheKey = `${profile.id}:${state.mainKeyword}`;
      // 캐시 히트
      if (
        state.brandPropositionsCacheKey === cacheKey &&
        state.brandPropositions &&
        state.brandPropositions.length > 0
      ) {
        return state.brandPropositions;
      }

      // 미스 — distill 호출
      const res = await fetch("/api/brand/distill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          mainKeyword: state.mainKeyword,
          subKeywords: state.subKeywords || undefined,
          topic: state.topic || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "정보 명제 추출에 실패했습니다.");
      }
      const data = (await res.json()) as {
        propositions: BrandProposition[];
        cacheKey: string;
      };
      updateState({
        brandPropositions: data.propositions,
        brandPropositionsCacheKey: data.cacheKey,
      });
      return data.propositions;
    },
    [
      state.postCategory,
      state.selectedBrandTemplate,
      state.mainKeyword,
      state.subKeywords,
      state.topic,
      state.brandPropositions,
      state.brandPropositionsCacheKey,
      fetchBrandProfile,
      updateState,
    ]
  );

  // AEO 모드에서 selectedAeoProfileId 로 프로필 객체를 가져옴
  const fetchAeoProfile = useCallback(async (): Promise<unknown | null> => {
    if (!state.selectedAeoProfileId) return null;
    try {
      const res = await fetch("/api/aeo/profiles", { cache: "no-store" });
      if (!res.ok) return null;
      const all = await res.json();
      if (!Array.isArray(all)) return null;
      return all.find((p) => p?.id === state.selectedAeoProfileId) ?? null;
    } catch {
      return null;
    }
  }, [state.selectedAeoProfileId]);

  const fetchTitles = useCallback(async () => {
    updateState({ isLoading: true, titleSuggestions: [] });
    try {
      // 브랜드 모드 분기
      if (state.postCategory === "brand") {
        const profile = await fetchBrandProfile();
        if (!profile) {
          throw new Error("브랜드 프로필을 불러오지 못했습니다.");
        }

        // 정보성글이면 distill 보장 (캐시 미스 시 자동 호출)
        let propositions: BrandProposition[] | undefined;
        if (state.selectedBrandTemplate === "info") {
          const result = await ensureBrandPropositions(profile);
          if (!result || result.length === 0) {
            throw new Error("정보 명제를 준비하지 못했습니다.");
          }
          propositions = result;
        }

        const res = await fetch("/api/brand/titles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile,
            template: state.selectedBrandTemplate,
            infoVariantId: state.selectedBrandInfoVariant,
            mainKeyword: state.mainKeyword,
            subKeywords: state.subKeywords || undefined,
            topic: state.topic || undefined,
            count: 5,
            propositions,
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
        return;
      }

      // AEO 모드 분기
      if (state.postCategory === "aeo") {
        const profile = await fetchAeoProfile();
        if (!profile) {
          throw new Error("AEO 프로필을 불러오지 못했습니다.");
        }
        const res = await fetch("/api/aeo/titles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile,
            template: state.selectedAeoTemplate,
            mainKeyword: state.mainKeyword,
            subKeywords: state.subKeywords || undefined,
            topic: state.topic || undefined,
            count: 5,
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
        return;
      }

      // 후기성 모드 (기존)
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
          topic: state.topic || undefined,
          customProductInfoById,
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
  }, [state.postCategory, state.selectedBrandTemplate, state.selectedBrandInfoVariant, state.selectedAeoTemplate, state.selectedProducts, state.narrativeType, state.toneType, state.mainKeyword, state.subKeywords, state.persona, state.topic, customProductInfoById, fetchBrandProfile, fetchAeoProfile, ensureBrandPropositions, updateState]);

  // 검증 호출. fetchContent와 본문 직접 수정(handleContentEdit) 양쪽에서 재사용한다.
  // 브랜드 모드에서는 template/profile을 함께 보내야 정보성글 한정 노출 검증이 동작한다.
  const runValidation = useCallback(
    async (text: string) => {
      try {
        const endpoint =
          state.postCategory === "brand"
            ? "/api/brand/validate"
            : state.postCategory === "aeo"
            ? "/api/aeo/validate"
            : "/api/validate";

        // 브랜드 모드면 template/profile 추가 (정보성글 한정 브랜드 노출 검증용)
        const extraBody: Record<string, unknown> = {};
        if (state.postCategory === "brand") {
          extraBody.template = state.selectedBrandTemplate;
          const profile = await fetchBrandProfile();
          if (profile) extraBody.profile = profile;
        }

        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            keyword: state.mainKeyword,
            charRange: state.charCountRange,
            ...extraBody,
          }),
        });
        if (!res.ok) return;
        const quality = await res.json();
        updateState({ qualityResult: quality });
      } catch {
        // 검증 실패는 사용자 흐름을 막지 않음
      }
    },
    [state.postCategory, state.selectedBrandTemplate, state.mainKeyword, state.charCountRange, fetchBrandProfile, updateState]
  );

  const fetchContent = useCallback(async (topicOverride?: string) => {
    const effectiveTopic =
      topicOverride !== undefined ? topicOverride : state.topic;

    // ── Phase 1 검문소 (브랜드/AEO 모드) ──
    // 글 생성 직전 LLM에게 "템플릿 ↔ 주제" 적합성을 묻는다.
    // 어떤 실패도 글 생성을 막지 않도록 안전 폴백 처리.
    if (
      state.postCategory === "brand" &&
      state.selectedBrandTemplate &&
      !bypassFitCheckRef.current
    ) {
      // 검문소 호출 동안 사용자가 멈춤으로 오해하지 않도록 로딩 상태 ON.
      // (모달 띄우거나 통과해서 generate로 넘어가기 전까지 유지)
      updateState({ isLoading: true });
      try {
        const checkRes = await fetch("/api/brand/check-fit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template: state.selectedBrandTemplate,
            infoVariantId: state.selectedBrandInfoVariant,
            topic: effectiveTopic || undefined,
            mainKeyword: state.mainKeyword,
            subKeywords: state.subKeywords || undefined,
            selectedTitle: state.selectedTitle || undefined,
          }),
        });
        if (checkRes.ok) {
          const fit = await checkRes.json();
          // 디버그: 검문소 응답을 항상 콘솔에 남겨 사용자가 DevTools로 확인 가능하게
          // eslint-disable-next-line no-console
          console.log("[검문소 응답]", fit);
          if (
            !fit.skipped &&
            fit.match === false &&
            typeof fit.confidence === "number" &&
            fit.confidence >= 0.6
          ) {
            // 모달 띄울 동안 로딩 표시는 끔. 사용자가 모달과 인터랙션해야 하니까.
            updateState({ isLoading: false });
            const sugs = Array.isArray(fit.suggestions)
              ? fit.suggestions.filter((s: unknown): s is string => typeof s === "string")
              : typeof fit.suggestion === "string"
              ? [fit.suggestion]
              : [];
            setFitGate({
              open: true,
              reason: typeof fit.reason === "string" ? fit.reason : "",
              suggestions: sugs,
            });
            return;
          }
        }
      } catch {
        // 검문소 호출 자체 실패 — 글 생성 막지 않고 통과
      }
    }

    if (
      state.postCategory === "aeo" &&
      state.selectedAeoTemplate &&
      !bypassFitCheckRef.current
    ) {
      updateState({ isLoading: true });
      try {
        const checkRes = await fetch("/api/aeo/check-fit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template: state.selectedAeoTemplate,
            topic: effectiveTopic || undefined,
            mainKeyword: state.mainKeyword,
            subKeywords: state.subKeywords || undefined,
            selectedTitle: state.selectedTitle || undefined,
          }),
        });
        if (checkRes.ok) {
          const fit = await checkRes.json();
          // eslint-disable-next-line no-console
          console.log("[AEO 검문소 응답]", fit);
          if (
            !fit.skipped &&
            fit.match === false &&
            typeof fit.confidence === "number" &&
            fit.confidence >= 0.6
          ) {
            updateState({ isLoading: false });
            const sugs = Array.isArray(fit.suggestions)
              ? fit.suggestions.filter((s: unknown): s is string => typeof s === "string")
              : typeof fit.suggestion === "string"
              ? [fit.suggestion]
              : [];
            setFitGate({
              open: true,
              reason: typeof fit.reason === "string" ? fit.reason : "",
              suggestions: sugs,
            });
            return;
          }
        }
      } catch {
        // AEO 검문소 실패 — 통과 처리
      }
    }
    bypassFitCheckRef.current = false;

    updateState({
      isLoading: true,
      generatedContent: "",
      qualityResult: null,
      contentDirty: false,
      generatedImages: {},
      customPromptsBySlot: {},
    });
    try {
      // 브랜드 모드 분기 — /api/brand/generate 로 호출
      let res: Response;
      if (state.postCategory === "brand") {
        const profile = await fetchBrandProfile();
        if (!profile) {
          throw new Error("브랜드 프로필을 불러오지 못했습니다.");
        }

        // 정보성글이면 distill 보장 (보통 fetchTitles 단계에서 이미 캐시됨)
        let propositions: BrandProposition[] | undefined;
        if (state.selectedBrandTemplate === "info") {
          const result = await ensureBrandPropositions(profile);
          if (!result || result.length === 0) {
            throw new Error("정보 명제를 준비하지 못했습니다.");
          }
          propositions = result;
        }

        res = await fetch("/api/brand/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile,
            template: state.selectedBrandTemplate,
            infoVariantId: state.selectedBrandInfoVariant,
            mainKeyword: state.mainKeyword,
            subKeywords: state.subKeywords || undefined,
            topic: effectiveTopic || undefined,
            requirements: state.requirements || undefined,
            charCount: state.charCountRange,
            selectedTitle: state.selectedTitle,
            // info-custom 모드 — 사용자 견본 글 + 분석 결과 동적 주입 (원본 본문은 톤 통계 추출 입력으로만 사용)
            referenceText:
              state.selectedBrandInfoVariant === "info-custom"
                ? state.referenceText || undefined
                : undefined,
            referenceAnalysis:
              state.selectedBrandInfoVariant === "info-custom"
                ? state.referenceAnalysis || undefined
                : undefined,
            propositions,
            referenceExcerpts:
              state.selectedBrandInfoVariant === "info-custom" &&
              state.referenceExcerpts.length > 0
                ? state.referenceExcerpts
                : undefined,
            // info-structure-based 모드 — 보관함 분석 ID
            analysisRecordId:
              state.selectedBrandInfoVariant === "info-structure-based"
                ? state.selectedAnalysisRecordId || undefined
                : undefined,
          }),
        });
      } else if (state.postCategory === "aeo") {
        const profile = await fetchAeoProfile();
        if (!profile) {
          throw new Error("AEO 프로필을 불러오지 못했습니다.");
        }
        res = await fetch("/api/aeo/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile,
            template: state.selectedAeoTemplate,
            mainKeyword: state.mainKeyword,
            subKeywords: state.subKeywords || undefined,
            topic: effectiveTopic || undefined,
            requirements: state.requirements || undefined,
            charCount: state.charCountRange,
            selectedTitle: state.selectedTitle,
            targetQueries: state.aeoTargetQueries.length > 0 ? state.aeoTargetQueries : undefined,
            sources: state.aeoSources.length > 0 ? state.aeoSources : undefined,
          }),
        });
      } else {
        // 후기성 (기존)
        res = await fetch("/api/generate", {
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
            referenceExcerpts: state.referenceExcerpts.length > 0 ? state.referenceExcerpts : undefined,
            topic: effectiveTopic || undefined,
            customProductInfoById,
          }),
        });
      }

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

      // 스트리밍 완료 직후 <br> 정화 → 후킹 → 중복 제거 → 도입부 안전망 → 소제목 커버리지
      const finalized = ensureSubtitleCoverage(
        ensureIntroImage(
          dedupeSubtitleEchoes(
            ensureHookImage(stripBrTags(content), state.selectedTitle, state.mainKeyword)
          ),
          state.mainKeyword
        )
      );
      if (finalized !== content) {
        content = finalized;
        updateState({ generatedContent: finalized });
      }

      // 생성 완료 후 품질 검증
      updateState({ isLoading: false });
      await runValidation(content);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "글 생성 실패";
      toast.error(msg);
      updateState({ isLoading: false });
    }
  }, [state.postCategory, state.selectedBrandTemplate, state.selectedBrandInfoVariant, state.selectedAeoTemplate, state.aeoTargetQueries, state.aeoSources, state.topic, state.selectedProducts, state.narrativeType, state.toneType, state.mainKeyword, state.subKeywords, state.persona, state.requirements, state.charCountRange, state.selectedTitle, state.referenceAnalysis, state.referenceExcerpts, state.referenceText, state.toneExample, customProductInfoById, fetchBrandProfile, fetchAeoProfile, ensureBrandPropositions, updateState, runValidation]);

  // ── Phase 1 검문소 모달 핸들러 ──
  const handleFitAcceptSuggestion = useCallback(
    (picked: string) => {
      const newTopic = picked.trim();
      setFitGate(null);
      if (!newTopic) return;
      // 주제만 바꾸면 기존 제목(옛 주제 기반)과 충돌해 어색한 글이 나옴.
      // → 제목·생성결과 모두 클리어 + 글 설정 단계(2)로 돌려보내서
      //   사용자가 [다음] 누르면 새 제목 5개가 자동 생성되도록 한다.
      updateState({
        topic: newTopic,
        selectedTitle: "",
        titleSuggestions: [],
        generatedContent: "",
        qualityResult: null,
        contentDirty: false,
        isLoading: false,
        currentStep: 2,
      });
      toast.success(
        `주제를 "${newTopic}" 로 바꿨습니다. [다음] 을 눌러 새 제목을 받아주세요.`
      );
    },
    [updateState]
  );

  const handleFitGoBack = useCallback(() => {
    setFitGate(null);
    // 글 설정 단계(2)로 돌아가 주제/키워드를 직접 수정하도록 한다.
    // 옛 제목·생성결과는 새로 받을 수 있도록 클리어.
    updateState({
      currentStep: 2,
      selectedTitle: "",
      titleSuggestions: [],
      generatedContent: "",
      qualityResult: null,
      contentDirty: false,
      isLoading: false,
    });
  }, [updateState]);

  const handleFitProceedAnyway = useCallback(() => {
    setFitGate(null);
    bypassFitCheckRef.current = true;
    // 운영 튜닝용 — 사용자가 검문소를 무시한 횟수 누적
    try {
      const cnt = parseInt(
        localStorage.getItem("brandFitOverrideCount") || "0",
        10
      );
      localStorage.setItem("brandFitOverrideCount", String(cnt + 1));
    } catch {
      /* localStorage 사용 불가 환경 무시 */
    }
    fetchContent().catch(() => {});
  }, [fetchContent]);

  const handleQualityFix = useCallback(async () => {
    if (!state.qualityResult || state.qualityResult.isPass) return;
    updateState({ isLoading: true });
    try {
      // 브랜드 모드 분기
      let res: Response;
      if (state.postCategory === "brand") {
        const profile = await fetchBrandProfile();
        if (!profile) {
          throw new Error("브랜드 프로필을 불러오지 못했습니다.");
        }

        // 정보성글이면 propositions 동봉 (수정 시에도 익명 톤 유지)
        let propositions: BrandProposition[] | undefined;
        if (state.selectedBrandTemplate === "info") {
          const result = await ensureBrandPropositions(profile);
          propositions = result || undefined;
        }

        res = await fetch("/api/brand/fix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile,
            template: state.selectedBrandTemplate,
            infoVariantId: state.selectedBrandInfoVariant,
            content: state.generatedContent,
            failReasons: state.qualityResult.failReasons,
            keyword: state.mainKeyword,
            propositions,
          }),
        });
      } else if (state.postCategory === "aeo") {
        const profile = await fetchAeoProfile();
        if (!profile) {
          throw new Error("AEO 프로필을 불러오지 못했습니다.");
        }
        res = await fetch("/api/aeo/fix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile,
            template: state.selectedAeoTemplate,
            content: state.generatedContent,
            failReasons: state.qualityResult.failReasons,
            keyword: state.mainKeyword,
          }),
        });
      } else {
        res = await fetch("/api/fix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: state.generatedContent,
            failReasons: state.qualityResult.failReasons,
            keyword: state.mainKeyword,
          }),
        });
      }

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

      // 품질 수정 완료 직후 <br> 정화 → 후킹 → 중복 제거 → 도입부 안전망 → 소제목 커버리지
      const finalizedFix = ensureSubtitleCoverage(
        ensureIntroImage(
          dedupeSubtitleEchoes(
            ensureHookImage(stripBrTags(fixed), state.selectedTitle, state.mainKeyword)
          ),
          state.mainKeyword
        )
      );
      if (finalizedFix !== fixed) {
        fixed = finalizedFix;
        updateState({ generatedContent: finalizedFix });
      }

      const validateEndpoint =
        state.postCategory === "brand" ? "/api/brand/validate" : "/api/validate";

      // 브랜드 모드면 template/profile 추가 (정보성글 한정 노출 검증)
      const validateExtra: Record<string, unknown> = {};
      if (state.postCategory === "brand") {
        validateExtra.template = state.selectedBrandTemplate;
        const profileForValidate = await fetchBrandProfile();
        if (profileForValidate) validateExtra.profile = profileForValidate;
      }

      const validateRes = await fetch(validateEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: fixed,
          keyword: state.mainKeyword,
          charRange: state.charCountRange,
          ...validateExtra,
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
  }, [state.postCategory, state.selectedBrandTemplate, state.selectedBrandInfoVariant, state.selectedAeoTemplate, state.generatedContent, state.qualityResult, state.mainKeyword, state.charCountRange, fetchBrandProfile, fetchAeoProfile, ensureBrandPropositions, updateState]);

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

    // AEO 모드: Step 2(설정) → Step 3(제목) 진행 시 출처 누락이면 경고 모달.
    // "그대로 진행"이면 bypass 플래그가 켜져 한 번 통과.
    if (
      nextStep === 3 &&
      state.postCategory === "aeo" &&
      !bypassSourceWarningRef.current
    ) {
      const hasSource = state.aeoSources.some(
        (s) => (s.url?.trim() || s.note?.trim() || "").length > 0
      );
      if (!hasSource) {
        setSourceWarningOpen(true);
        return;
      }
    }
    bypassSourceWarningRef.current = false;

    updateState({ currentStep: nextStep });

    // 자동 fetch는 블로그 채널에만 적용 (쓰레드는 사용자가 명시적으로 버튼을 눌러야 함)
    if (state.channel === "blog") {
      if (nextStep === 3 && state.titleSuggestions.length === 0) {
        fetchTitles().catch(() => {});
      }
      if (nextStep === 4 && state.generatedContent === "") {
        fetchContent().catch(() => {});
      }
    }
  };

  const handleSourceWarningProceed = () => {
    setSourceWarningOpen(false);
    bypassSourceWarningRef.current = true;
    handleNext();
  };

  const handleSourceWarningGoBack = () => {
    setSourceWarningOpen(false);
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

  const handleChannelChange = useCallback(
    (channel: Channel) => {
      // 채널이 실제로 바뀐 경우 블로그 관련 입력값까지 모두 리셋해
      // 다른 채널/플로우의 stale state가 다음 진행을 막지 않도록 한다.
      if (channel !== state.channel) {
        updateState({
          channel,
          currentStep: 0,
          threads: initialThreadsState,
          selectedProducts: [],
          postCategory: null,
          narrativeSource: null,
          narrativeType: null,
          toneType: null,
          toneExample: "",
          referenceUrl: "",
          selectedCustomReferenceId: null,
          referenceAnalysis: "",
          referenceExcerpts: [],
          aeoTargetQueries: [],
          aeoSources: [],
        });
      } else {
        updateState({ channel });
      }
    },
    [updateState, state.channel]
  );

  const handleThreadsChange = useCallback(
    (partial: Partial<ThreadsState>) => {
      setState((prev) => ({
        ...prev,
        threads: { ...prev.threads, ...partial },
      }));
    },
    []
  );

  const handlePostCategoryChange = useCallback(
    (postCategory: PostCategory) => {
      updateState({ postCategory });
    },
    [updateState]
  );

  const handleBrandProfileChange = useCallback(
    (profileId: string) => {
      // 프로필이 바뀌면 distill 캐시 무효화 (프로필별 자산이 다르므로)
      updateState({
        selectedBrandProfileId: profileId,
        brandPropositions: null,
        brandPropositionsCacheKey: null,
      });
    },
    [updateState]
  );

  const handleBrandTemplateChange = useCallback(
    (template: import("@/types/brand").BrandTemplateId) => {
      // 템플릿이 바뀌면 변형/보관함 선택과 distill 캐시를 초기화한다.
      updateState({
        selectedBrandTemplate: template,
        selectedBrandInfoVariant: null,
        selectedAnalysisRecordId: null,
        brandPropositions: null,
        brandPropositionsCacheKey: null,
      });
    },
    [updateState]
  );

  const handleBrandInfoVariantChange = useCallback(
    (variant: import("@/types/brand").BrandInfoVariantId) => {
      // 변형마다 사용하는 잔여 상태가 달라 진입/이탈 시 정리하고 distill 캐시를 무효화한다.
      const isCustom = variant === "info-custom";
      const isLibrary = variant === "info-structure-based";
      updateState({
        selectedBrandInfoVariant: variant,
        brandPropositions: null,
        brandPropositionsCacheKey: null,
        ...(isCustom
          ? {} // 들어올 때는 기존 입력 유지 (재진입 편의)
          : { referenceUrl: "", referenceText: "", referenceAnalysis: "" }),
        ...(isLibrary
          ? {} // 보관함 모드는 selectedAnalysisRecordId 유지
          : { selectedAnalysisRecordId: null }),
      });
    },
    [updateState]
  );

  const handleAnalysisRecordSelect = useCallback(
    (recordId: string) => {
      // 카드 1클릭에 variant + recordId 둘 다 결정 (안전망)
      updateState({
        selectedAnalysisRecordId: recordId,
        selectedBrandInfoVariant: "info-structure-based",
      });
    },
    [updateState]
  );

  const handleAeoProfileChange = useCallback(
    (profileId: string) => {
      updateState({ selectedAeoProfileId: profileId });
    },
    [updateState]
  );

  const handleAeoTemplateChange = useCallback(
    (template: import("@/types/aeo").AeoTemplateId) => {
      // 글 타입이 바뀌면 타겟 쿼리는 그대로 두되, 제목/본문은 새로 받아야 하므로 비우지 않음
      // (사용자가 같은 키워드로 두 타입을 비교해볼 수 있게)
      updateState({ selectedAeoTemplate: template });
    },
    [updateState]
  );

  const handleNarrativeSourceChange = useCallback(
    (source: NarrativeSource) => {
      // narrativeType 파생: custom-reference면 null, 나머지는 동일한 값
      const narrativeType = source === "custom-reference" ? null : source;
      // 내장 레퍼런스가 있는 모드(empathy/conclusion)에서 사용자가 아직 톤을 안 골랐으면
      // 기본값으로 "레퍼런스 그대로" 자동 선택. 사용자가 명시적으로 고른 톤은 유지.
      const autoTone =
        source !== "custom-reference" && state.toneType === null
          ? { toneType: "레퍼런스" as const }
          : {};
      updateState({
        narrativeSource: source,
        narrativeType,
        // 모드가 바뀌면 이전 분석 결과는 무효 (URL도 새로 입력)
        referenceAnalysis: "",
        referenceExcerpts: [],
        ...autoTone,
      });
    },
    [updateState, state.toneType]
  );

  const handleReferenceUrlChange = useCallback(
    (url: string) => {
      updateState({ referenceUrl: url, referenceAnalysis: "", referenceExcerpts: [] });
    },
    [updateState]
  );

  const handleReferenceTextChange = useCallback(
    (text: string) => {
      updateState({ referenceText: text, referenceAnalysis: "" });
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
    if (state.contentDirty) {
      const ok = window.confirm(
        "직접 수정한 본문이 모두 사라집니다. 다시 생성할까요?"
      );
      if (!ok) return;
    }
    fetchContent();
  }, [fetchContent, state.contentDirty]);

  const handleContentCopy = useCallback(() => {
    navigator.clipboard.writeText(state.generatedContent);
  }, [state.generatedContent]);

  // 사용자가 「✓ 수정 완료」를 누르면 호출됨.
  // 본문이 변하면 page.tsx의 useEffect가 자동으로 마커 재파싱·자동 가공을 다시 돌리고,
  // 슬롯은 description+index 매칭으로 보존된다.
  // 품질 검증도 즉시 재실행해서 우측 패널을 갱신한다.
  const handleContentEdit = useCallback(
    (next: string) => {
      if (next === state.generatedContent) return;
      updateState({ generatedContent: next, contentDirty: true });
      runValidation(next);
    },
    [state.generatedContent, updateState, runValidation]
  );

  const renderStep = () => {
    // 쓰레드 채널 분기
    if (state.channel === "thread") {
      switch (state.currentStep) {
        case 0:
          return (
            <StepChannelSelect
              channel={state.channel}
              onChannelChange={handleChannelChange}
            />
          );
        case 1:
          return (
            <StepThreadsAnalysis
              threads={state.threads}
              onChange={handleThreadsChange}
            />
          );
        case 2:
          return (
            <StepThreadsSettings
              settings={state.threads.settings}
              onChange={(settings) => handleThreadsChange({ settings })}
              analysisMode={state.threads.analysisMode}
            />
          );
        case 3:
          return (
            <StepThreadsGenerate
              threads={state.threads}
              onChange={handleThreadsChange}
            />
          );
        default:
          return null;
      }
    }

    switch (state.currentStep) {
      case 0:
        return (
          <StepChannelSelect
            channel={state.channel}
            onChannelChange={handleChannelChange}
          />
        );
      case 1:
        return (
          <StepNarrative
            narrativeSource={state.narrativeSource}
            referenceUrl={state.referenceUrl}
            referenceText={state.referenceText}
            toneType={state.toneType}
            toneExample={state.toneExample}
            channel={state.channel}
            postCategory={state.postCategory}
            selectedProducts={state.selectedProducts}
            onNarrativeSourceChange={handleNarrativeSourceChange}
            onReferenceUrlChange={handleReferenceUrlChange}
            onReferenceTextChange={handleReferenceTextChange}
            onToneChange={handleToneChange}
            onToneExampleChange={(example: string) => updateState({ toneExample: example })}
            onPostCategoryChange={handlePostCategoryChange}
            onSelectedProductsChange={handleProductChange}
            referenceAnalysis={state.referenceAnalysis}
            isAnalyzing={state.isLoading}
            onAnalyze={() => fetchReferenceAnalysis().catch(() => {})}
            onAnalyzeText={() => fetchReferenceAnalysis("text").catch(() => {})}
            onReferenceAnalysisChange={(value) =>
              updateState({ referenceAnalysis: value })
            }
            selectedBrandProfileId={state.selectedBrandProfileId}
            selectedBrandTemplate={state.selectedBrandTemplate}
            selectedBrandInfoVariant={state.selectedBrandInfoVariant}
            selectedAnalysisRecordId={state.selectedAnalysisRecordId}
            onBrandProfileChange={handleBrandProfileChange}
            onBrandTemplateChange={handleBrandTemplateChange}
            onBrandInfoVariantChange={handleBrandInfoVariantChange}
            selectedAeoProfileId={state.selectedAeoProfileId}
            selectedAeoTemplate={state.selectedAeoTemplate}
            onAeoProfileChange={handleAeoProfileChange}
            onAeoTemplateChange={handleAeoTemplateChange}
            onAnalysisRecordSelect={handleAnalysisRecordSelect}
            userProducts={userProducts}
            onUserProductsChange={refetchUserProducts}
            onProductDeleted={handleProductDeleted}
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
            onContentEdit={handleContentEdit}
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
            콘텐츠 생성기
          </button>
          <p className="mt-2 text-sm text-muted-foreground">
            채널과 카테고리를 골라 콘텐츠를 단계별로 생성합니다
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
              title={advanceHint()}
              className="gap-2"
            >
              다음
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          {state.currentStep === STEPS.length - 1 && <div className="w-20" />}
        </div>
      </div>

      {/* Phase 1 검문소 모달 — 브랜드 모드 글 생성 직전 LLM 적합성 미스매치 알림 */}
      {fitGate && (
        <TemplateFitModal
          open={fitGate.open}
          reason={fitGate.reason}
          suggestions={fitGate.suggestions}
          onAcceptSuggestion={handleFitAcceptSuggestion}
          onGoBack={handleFitGoBack}
          onProceedAnyway={handleFitProceedAnyway}
          onOpenChange={(open) => {
            if (!open) setFitGate(null);
          }}
        />
      )}

      {/* AEO 출처 누락 경고 모달 */}
      <SourceWarningModal
        open={sourceWarningOpen}
        onProceedAnyway={handleSourceWarningProceed}
        onGoBack={handleSourceWarningGoBack}
      />
    </div>
  );
}
