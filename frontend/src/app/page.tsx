"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AppHeader } from "@/components/AppHeader";
import { useWizardState } from "@/components/providers/WizardStateProvider";
import { useAuthContext } from "@/lib/auth/auth-context";
import { subscribeProfilesChanged } from "@/lib/sync/profile-sync-engine";
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
  SquarePlay,
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
  BlogDraft,
} from "@/types";
import { initialThreadsState } from "@/types";
import { fetchUserProducts, PRODUCTS } from "@/lib/products";
import { canAttachBrandProduct } from "@/lib/brand/prompts/policy";
import { showGenErrorToast, parseGenErrorResponse } from "@/lib/ai/reason-text";
import { buildCustomProductInfo } from "@/lib/prompts/brand-context";
import { exportZip, detectImageMime } from "@/lib/export-zip";
import {
  saveDraft,
  listDrafts,
  getDraft,
  renameDraft,
  deleteDraft,
  consumePendingDraft,
} from "@/lib/draft-storage";
import {
  SaveDraftDialog,
  DraftLibraryModal,
} from "@/components/steps/draft-library-modal";

// V1 첨부 제품: ID로 user 등록 풀 + 시드 풀에서 UserProduct 모양으로 lookup.
// 시드 제품은 5분할 필드가 없으므로 defaultAdvantages만 활용됨 (빌더에서 자동 폴백).
function resolveAttachedProduct(
  id: string | undefined,
  userProducts: UserProduct[],
): UserProduct | undefined {
  if (!id) return undefined;
  const userP = userProducts.find((p) => p.id === id);
  if (userP) return userP;
  const seed = PRODUCTS.find((p) => p.id === id);
  if (!seed) return undefined;
  return {
    id: seed.id,
    name: seed.name,
    category: seed.category,
    defaultAdvantages: seed.defaultAdvantages,
    relatedSymptoms: [],
    naturalMentionPatterns: [],
    keyInsight: "",
    sensoryDetails: [],
    realReviews: [],
  };
}
import {
  runImageBulk,
  type SlotJob,
  type SlotOutcome,
} from "@/lib/image-bulk";
import {
  saveImage,
  loadImagesByRound,
  clearOldRounds,
  listRoundIds,
  saveDraftImages,
  loadDraftImages,
  saveDraftUserPhotos,
  loadDraftUserPhotos,
  deleteDraftAssets,
} from "@/lib/image-storage";
import {
  parseImageMarkers,
  ensureSubtitleCoverage,
  ensureHookImage,
  ensureIntroImage,
  dedupeSubtitleEchoes,
  stripBrTags,
  sanitizeBrandBodyText,
  ensureBrandEnumerationImages,
  ensureBrandSubtitleCoverage,
  ensureBrandIntroImage,
  ensureBrandBodyFillerImages,
  pruneEmptyIntroHook,
  enforceImageMarkerCap,
  collapseBlankLines,
  applySubtitleLineBreaks,
  pruneExcludedMarkers,
  moveMarkerBlock,
  moveMarkerToBoundary,
  insertEmptyMarkerAtBoundary,
  markerIndexAtBoundary,
  computeBlocks,
  replaceTextBlock,
} from "@/lib/image/marker-parser";

// 카테고리별 이미지 총량 상한. 캡은 ensure 함수 누적 결과의 마지막 안전장치.
// null/매핑 없음은 review 기본값 12로 처리. 쓰레드 모드는 별도 렌더 경로라 호출 안 됨.
const MAX_BY_CATEGORY: Record<string, number> = {
  brand: 12,
  review: 12,
  seoAeo: 12, // SEO·AEO 통합형은 브랜드와 동일한 후처리 파이프라인을 사용하므로 캡도 12장으로 일치
};
function resolveMaxCount(
  postCategory: PostCategory | null,
  templateType?: import("@/types").SeoAeoTemplateType,
): number {
  if (!postCategory) return 12;
  // seoAeo + 의도 4종 선택 시 AEO 미니멀 정책으로 4장 캡 (auto는 기존 12장).
  if (postCategory === "seoAeo" && templateType && templateType !== "auto") {
    return 4;
  }
  return MAX_BY_CATEGORY[postCategory] ?? 12;
}

/**
 * 후처리 파이프라인 — postCategory 별로 다른 규칙 적용.
 * - brand, seoAeo: 브랜드 8단계 (살균 → HOOK → 중복제거 → 열거 → 소제목 → 도입부 → 채움 → 캡)
 * - review: 기존 4단계 (HOOK → 중복제거 → 도입부 → 소제목 → 캡)
 */
function applyImagePostProcessing(
  raw: string,
  postCategory: PostCategory | null,
  selectedTitle: string,
  mainKeyword: string,
  templateType?: import("@/types").SeoAeoTemplateType,
): string {
  // stripBrTags가 `<br>` 폭주를 개행으로 치환해 빈 줄이 거대 누적되는 사고 차단
  const cleaned = collapseBlankLines(stripBrTags(raw));
  const maxCount = resolveMaxCount(postCategory, templateType);
  if (postCategory === "brand" || postCategory === "seoAeo") {
    const sanitized = sanitizeBrandBodyText(cleaned);
    const hooked = ensureHookImage(sanitized, selectedTitle, mainKeyword);
    const deduped = dedupeSubtitleEchoes(hooked);
    const enumerated = ensureBrandEnumerationImages(deduped);
    const subtitled = ensureBrandSubtitleCoverage(enumerated);
    const introCovered = ensureBrandIntroImage(subtitled, mainKeyword);
    const filled = ensureBrandBodyFillerImages(introCovered);
    // 캡은 pruneEmptyIntroHook 이전에 — HOOK이 살아있는 상태에서 보호 가능하도록.
    // seoAeo Intent 모드(3~4장 미니멀 정책)는 hardCap=true 로 강제 컷.
    // 그렇지 않으면 enforceImageMarkerCap의 "보호 슬롯이 maxCount 초과 시 컷 포기" 정책 때문에
    // 본문 1·2·3 + FAQ + 정리 = 5개 소제목 보호로 인해 캡 4가 무효화됨.
    const isSeoAeoIntent =
      postCategory === "seoAeo" && templateType !== undefined && templateType !== "auto";
    const capped = enforceImageMarkerCap(filled, maxCount, { hardCap: isSeoAeoIntent });
    // 소제목 콤마 뒤 자동 줄바꿈은 가장 마지막에 (이미지 마커 처리 완료된 안정 상태)
    return applySubtitleLineBreaks(pruneEmptyIntroHook(capped));
  }
  const hooked = ensureHookImage(cleaned, selectedTitle, mainKeyword);
  const deduped = dedupeSubtitleEchoes(hooked);
  const introCovered = ensureIntroImage(deduped, mainKeyword);
  const subtitled = ensureSubtitleCoverage(introCovered);
  const capped = enforceImageMarkerCap(subtitled, maxCount);
  return applySubtitleLineBreaks(pruneEmptyIntroHook(capped));
}

import { StepChannelSelect } from "@/components/steps/step-channel-select";
import { YoutubeWorkflow } from "@/components/youtube/YoutubeWorkflow";
import { YOUTUBE_FEATURE_ENABLED } from "@/lib/youtube-feature";
import { StepNarrative } from "@/components/steps/step-narrative";
import { StepSettings } from "@/components/steps/step-settings";
import { StepTitleSelect } from "@/components/steps/step-title-select";
import { StepGenerate } from "@/components/steps/step-generate";
import { StepPublish } from "@/components/steps/step-publish";
import { StepThreadsAnalysis } from "@/components/steps-threads/step-threads-analysis";
import { StepThreadsSettings } from "@/components/steps-threads/step-threads-settings";
import { StepThreadsGenerate } from "@/components/steps-threads/step-threads-generate";
import { TemplateFitModal } from "@/components/brand/template-fit-modal";
import { EmptyInputsWarningModal } from "@/components/empty-inputs-warning-modal";

// Step 2 (글 설정) 입력 칸 중 하나라도 채워졌는지 검사
function hasAnyContextInput(state: WizardState): boolean {
  return (
    state.mainKeyword.trim().length > 0 ||
    state.topic.trim().length > 0 ||
    state.subKeywords.trim().length > 0 ||
    state.requirements.trim().length > 0 ||
    state.persona.trim().length > 0
  );
}

// 메인 키워드가 비어있으면 다른 칸에서 키워드 후보를 유도해 항상 non-empty 보장.
// 다운스트림 프롬프트(title.ts, generation.ts, fix.ts, brand/aeo)는 이 값을 받는다.
function getEffectiveMainKeyword(state: WizardState): string {
  const mk = state.mainKeyword.trim();
  if (mk.length > 0) return mk;
  const subFirst = state.subKeywords.split(",")[0]?.trim();
  if (subFirst) return subFirst;
  const topicFirst = state.topic.split("\n")[0]?.trim();
  if (topicFirst) return topicFirst.split(/\s+/).slice(0, 3).join(" ");
  const reqFirst = state.requirements.split("\n")[0]?.trim();
  if (reqFirst) return reqFirst.split(/\s+/).slice(0, 3).join(" ");
  return "";
}

// 브랜드 블로그 중 "노출 키워드가 선택"인 템플릿(소개/가치입증/상세)은
// 키워드가 비면 주제로 대체하지 않고 빈 값("")을 그대로 흘려보낸다.
// → 제목·본문이 키워드를 억지로 박지 않고 '무엇에 대해 쓰고 싶나요'(topic)로 작성됨.
// info/custom은 검색 노출용이라 기존 getEffectiveMainKeyword 동작을 유지.
const KEYWORD_OPTIONAL_BRAND_TEMPLATES = new Set(["intro", "value-proof", "detail"]);
function getEffectiveBrandKeyword(state: WizardState): string {
  if (KEYWORD_OPTIONAL_BRAND_TEMPLATES.has(state.selectedBrandTemplate ?? "")) {
    return state.mainKeyword.trim();
  }
  return getEffectiveMainKeyword(state);
}

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

const YOUTUBE_STEPS = [
  { label: "채널 선택", icon: Package },
  { label: "쇼츠 생성", icon: SquarePlay },
];

export default function Home() {
  const router = useRouter();
  const { state, setState, updateState, resetState } = useWizardState();
  const { plan } = useAuthContext();
  // 유튜브 미구매(plan==='blog') 사용자가 persist 된 위저드 상태로 유튜브에 머물러 있어도
  // 채널선택으로 되돌리기 위한 가드(보안 아닌 UX 일관성용 — 실제 차단은 카드+프록시).
  // 킬스위치 OFF면 plan 무관하게 유튜브 워크플로우 진입 차단(저장된 channel:"youtube" 우회 방어).
  const youtubeAllowed = plan !== "blog" && YOUTUBE_FEATURE_ENABLED;
  const [userProducts, setUserProducts] = useState<UserProduct[]>([]);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  // 금지어 AI 부분 치환 — 본문 보존을 위해 단어 매핑만 받아 클라이언트가 surgical replace.
  const [isReplacingForbidden, setIsReplacingForbidden] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);

  // 보관함(드래프트)
  const [drafts, setDrafts] = useState<BlogDraft[]>([]);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [saveDraftOpen, setSaveDraftOpen] = useState(false);
  const [saveDraftDefaultName, setSaveDraftDefaultName] = useState("");
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [draftStorageWarning, setDraftStorageWarning] = useState(false);
  const [replacementPreview, setReplacementPreview] = useState<{
    replacements: Record<string, string>;
    skipped: string[];
  } | null>(null);
  const [replacementDialogOpen, setReplacementDialogOpen] = useState(false);

  // 구간 재작성("이 문단만 다시 쓰기")
  // - rewriteTargetBlock: 입력창 단계 대상 blockIndex (null이면 입력창 닫힘)
  // - rewriteInstruction: 사용자 지시 입력값
  // - rewritePreview: 결과 미리보기(요청 시점 전체 본문 스냅샷 포함 → 적용 시 staleness 가드)
  const [rewriteTargetBlock, setRewriteTargetBlock] = useState<number | null>(null);
  // 입력창에 함께 보여줄 "고칠 문단 원문" — 팝업이 본문을 가려도 무엇을 고치는지 보이게.
  const [rewriteTargetText, setRewriteTargetText] = useState("");
  const [rewriteInstruction, setRewriteInstruction] = useState("");
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewritePreview, setRewritePreview] = useState<{
    blockIndex: number;
    original: string;
    rewritten: string;
    contentAtRequest: string;
  } | null>(null);
  const [rewriteDialogOpen, setRewriteDialogOpen] = useState(false);

  // 큰 타이틀 클릭 시: 위저드가 비어있으면 바로 reset, 진행 중이면 확인 모달.
  const handleTitleClick = useCallback(() => {
    const dirty = state.channel !== null || state.currentStep > 0;
    if (!dirty) {
      resetState();
      return;
    }
    setResetConfirmOpen(true);
  }, [resetState, state.channel, state.currentStep]);

  const confirmReset = useCallback(() => {
    setResetConfirmOpen(false);
    resetState();
  }, [resetState]);

  // 이미지 일괄 생성 라운드 관리. ref로 두면 콜백에서 stale closure 없이 최신값 비교 가능.
  const bulkAbortRef = useRef<AbortController | null>(null);
  const bulkRoundIdRef = useRef<string | null>(null);

  // 첫 부팅: API 키가 아직 없으면 통합 설정 페이지(/settings/my-info)로 안내.
  // 사용자가 거기서 API 키 + 블로그 계정 + 첫 프로필을 자연스럽게 둘러보도록 함.
  // 메인 진입 시 한 번만 확인.
  useEffect(() => {
    const api = window.electronAPI?.settings;
    if (!api) return;
    api.getMasked().then((r) => {
      if (!r.hasKey) {
        router.replace("/settings/my-info?tab=api-generation");
      }
    }).catch(() => {});
  }, [router]);

  // 앱 마운트 시: 가장 최근 라운드 이미지를 IndexedDB에서 복원하고 오래된 라운드는 정리.
  // generatedImages가 비어 있을 때만 복원 (사용자가 새 글 시작 중간이면 덮어쓰지 않음).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const rounds = await listRoundIds();
        if (!rounds[0]) return;
        const restored = await loadImagesByRound(rounds[0]);
        if (cancelled) return;
        const keys = Object.keys(restored);
        if (keys.length === 0) return;
        setState((prev) => {
          if (Object.keys(prev.generatedImages).length > 0) return prev;
          const next = { ...prev.generatedImages };
          for (const sid of keys) next[sid] = restored[sid].base64;
          return { ...prev, generatedImages: next, currentRoundId: rounds[0] };
        });
      } catch {
        // 복원 실패는 조용히 무시
      } finally {
        clearOldRounds(3).catch(() => {});
      }
    })();
    return () => {
      cancelled = true;
    };
    // 마운트 1회만
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 슬롯 버전 증가는 각 user-action 핸들러 내부에서 setState 머지 시 직접 처리.
  // (라운드 도중 사용자가 슬롯을 만지면 옛 결과가 새 상태를 덮어쓰지 못하게 stale-write 가드)

  const refetchUserProducts = useCallback(async () => {
    const list = await fetchUserProducts();
    setUserProducts(list);
  }, []);

  useEffect(() => {
    refetchUserProducts();
  }, [refetchUserProducts]);

  // 다른 기기의 제품 변경이 실시간 반영되면 목록 재조회.
  useEffect(() => {
    return subscribeProfilesChanged((kind) => {
      if (kind === "product" || kind === "all") void refetchUserProducts();
    });
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
      // dangling reference 정리 (A1): 브랜드/AEO 첨부 ID가 사라진 제품 가리키면 초기화
      selectedBrandProductId:
        prev.selectedBrandProductId === deletedId ? undefined : prev.selectedBrandProductId,
      selectedAeoProductId:
        prev.selectedAeoProductId === deletedId ? undefined : prev.selectedAeoProductId,
    }));
  }, [setState]);

  // Phase 1 검문소 — 브랜드 모드 글 생성 직전 LLM 적합성 검사 결과를 띄우는 모달 상태.
  // 글 생성 자체는 막지 않음. 사용자가 ① 추천 적용 / ② 이전 단계 / ③ 그냥 진행 중 선택.
  const [fitGate, setFitGate] = useState<{
    open: boolean;
    reason: string;
    suggestions: string[];
  } | null>(null);
  // 모달의 ①/③ 동작 후 같은 입력으로 fetchContent를 다시 부를 때, 검문소를 재실행하지 않기 위한 1회용 플래그.
  const bypassFitCheckRef = useRef(false);

  // Step 2 (글 설정) — 모든 입력 칸이 비었을 때 [다음] 누르면 안내 모달
  const [emptyInputsWarningOpen, setEmptyInputsWarningOpen] = useState(false);

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

    // 후처리 — 수동 배치 모드(manualImageLayout)면 "마커를 넣고 빼는" 배치 함수는 건너뛰고,
    // 마커를 건드리지 않는 위생/가독성 함수만 적용한다(사용자가 옮기고 지운 배치를 되돌리지 않되
    // <br> 폭주 정리·소제목 줄바꿈은 유지 → 미리보기/발행 일치). 병합 규칙은 아래에서 그대로 둔다.
    const coveredContent = state.manualImageLayout
      ? applySubtitleLineBreaks(collapseBlankLines(stripBrTags(rawContent)))
      : applyImagePostProcessing(
          rawContent,
          state.postCategory,
          state.selectedTitle,
          getEffectiveMainKeyword(state),
          state.selectedTemplateType,
        );

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
    const prunedImageDesc = Object.fromEntries(
      Object.entries(state.imageDescBySlot).filter(([id]) => validIds.has(id))
    );
    const prunedAspect = Object.fromEntries(
      Object.entries(state.aspectBySlot).filter(([id]) => validIds.has(id))
    );

    setState((prev) => ({
      ...prev,
      imageSlots: merged,
      generatedImages: prunedImages,
      userPhotosBySlot: prunedPhotos,
      excludedSlotIds: prunedExcluded,
      isGeneratingBySlot: prunedGenerating,
      imageDescBySlot: prunedImageDesc,
      aspectBySlot: prunedAspect,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.generatedContent]);

  const STEPS =
    state.channel === "youtube"
      ? YOUTUBE_STEPS
      : state.channel === "thread"
        ? THREADS_STEPS
        : BLOG_STEPS;

  const canAdvance = (): boolean => {
    // 유튜브 채널: 채널만 고르면 통과(이후는 임베드 화면이라 마법사 진행 없음).
    if (state.channel === "youtube") {
      return true;
    }

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
          // 브랜드 프로필 + 템플릿 선택 필수. intro/info/value-proof/detail이면 variant도 선택.
          if (!state.selectedBrandProfileId) return false;
          if (!state.selectedBrandTemplate) return false;
          if (state.selectedBrandTemplate === "info" && !state.selectedBrandInfoVariant) return false;
          if (state.selectedBrandTemplate === "intro" && !state.selectedBrandIntroVariant) return false;
          if (state.selectedBrandTemplate === "value-proof" && !state.selectedBrandValueProofVariant) return false;
          if (state.selectedBrandTemplate === "detail" && !state.selectedBrandDetailVariant) return false;
          // "내 템플릿 만들기" — 견본 글 분석 결과 또는 보관함 선택 중 하나는 필수
          if (state.selectedBrandTemplate === "custom") {
            const hasAnalysis = state.referenceAnalysis.trim().length > 0;
            const hasLibrary = !!state.selectedAnalysisRecordId;
            if (!hasAnalysis && !hasLibrary) return false;
          }
          // structure-based 모드 (4개 템플릿 공통): 보관함에서 분석 선택 필수
          if (
            state.selectedBrandInfoVariant === "info-structure-based" ||
            state.selectedBrandIntroVariant === "intro-structure-based" ||
            state.selectedBrandValueProofVariant === "value-proof-structure-based" ||
            state.selectedBrandDetailVariant === "detail-structure-based"
          ) {
            if (!state.selectedAnalysisRecordId) return false;
          }
        }
        if (state.postCategory === "seoAeo") {
          // SEO·AEO 통합형 — AEO 프로필만 필수 (글 타입은 단일 흐름이라 미사용)
          if (!state.selectedAeoProfileId) return false;
        }
        return true;
      }
      case 2:
        // 후기성: 메인 키워드 필수 (AI 스토리 추천 + 검색 노출 안정성)
        if (state.postCategory === "review") {
          return state.mainKeyword.trim().length > 0;
        }
        // SEO·AEO 통합형은 주제 또는 메인 키워드 중 1개는 필수 (LLM이 의도를 잡기 위한 최소 신호)
        if (state.postCategory === "seoAeo") {
          return (
            state.topic.trim().length > 0 ||
            state.mainKeyword.trim().length > 0
          );
        }
        return hasAnyContextInput(state);
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
          if (state.selectedBrandTemplate === "intro" && !state.selectedBrandIntroVariant)
            return "소개글 변형을 선택해주세요";
          if (state.selectedBrandTemplate === "value-proof" && !state.selectedBrandValueProofVariant)
            return "가치입증글 변형을 선택해주세요";
          if (state.selectedBrandTemplate === "detail" && !state.selectedBrandDetailVariant)
            return "상세페이지글 변형을 선택해주세요";
          if (state.selectedBrandTemplate === "custom") {
            const hasAnalysis = state.referenceAnalysis.trim().length > 0;
            const hasLibrary = !!state.selectedAnalysisRecordId;
            if (!hasAnalysis && !hasLibrary)
              return "견본 글을 분석하거나 보관함에서 분석을 선택해주세요";
          }
          if (
            (state.selectedBrandInfoVariant === "info-structure-based" ||
              state.selectedBrandIntroVariant === "intro-structure-based" ||
              state.selectedBrandValueProofVariant === "value-proof-structure-based" ||
              state.selectedBrandDetailVariant === "detail-structure-based") &&
            !state.selectedAnalysisRecordId
          )
            return "보관함에서 분석을 선택해주세요";
        }
        if (state.postCategory === "seoAeo") {
          if (!state.selectedAeoProfileId) return "AEO 프로필을 선택해주세요";
        }
        return undefined;
      case 2:
        if (
          state.postCategory === "review" &&
          state.mainKeyword.trim().length === 0
        ) {
          return "메인 키워드를 입력해주세요";
        }
        if (state.postCategory === "seoAeo") {
          if (
            state.topic.trim().length === 0 &&
            state.mainKeyword.trim().length === 0
          ) {
            return "주제 또는 메인 키워드 중 하나는 입력해주세요";
          }
        }
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

      updateState({
        referenceAnalysis: analyzeData.analysis,
        referenceExcerpts: Array.isArray(analyzeData.excerpts) ? analyzeData.excerpts : [],
        // brand 모드 응답에만 titleFormula가 포함됨. 후기성에서는 undefined → null.
        referenceTitleFormula: analyzeData.titleFormula ?? null,
        isLoading: false,
      });
      toast.success("레퍼런스 분석이 완료되었습니다.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "레퍼런스 분석 실패";
      toast.error(msg);
      updateState({ isLoading: false });
    }
  }, [state.referenceUrl, state.referenceText, state.postCategory, updateState]);

  // 브랜드 모드에서 selectedBrandProfileId 로 프로필 객체를 가져옴
  const fetchBrandProfile = useCallback(async (): Promise<unknown | null> => {
    if (!state.selectedBrandProfileId) return null;
    try {
      const res = await fetch("/api/brand/profiles", { cache: "no-store" });
      if (!res.ok) return null;
      const all = await res.json();
      if (!Array.isArray(all)) return null;
      return all.find((p) => p?.id === state.selectedBrandProfileId) ?? null;
    } catch {
      return null;
    }
  }, [state.selectedBrandProfileId]);

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
        // "내 템플릿 만들기"(custom) 모드: 사용자 입력 분석을 referenceTitleFormula로 임시 객체 합성.
        // structure-based 모드: 보관함 카드 ID 전송 (백엔드에서 fetch).
        const isCustomReference =
          state.selectedBrandTemplate === "custom" &&
          state.referenceTitleFormula !== null &&
          !state.selectedAnalysisRecordId;
        const isStructureBased =
          state.selectedBrandInfoVariant === "info-structure-based" ||
          state.selectedBrandIntroVariant === "intro-structure-based" ||
          state.selectedBrandValueProofVariant === "value-proof-structure-based" ||
          state.selectedBrandDetailVariant === "detail-structure-based" ||
          (state.selectedBrandTemplate === "custom" && !!state.selectedAnalysisRecordId);

        const customAnalysisRecord = isCustomReference
          ? {
              id: "direct-reference",
              label: "내 템플릿",
              sourceType: "user" as const,
              analysis: state.referenceAnalysis || "",
              flow: [],
              excerptPattern: "",
              createdAt: "",
              isBuiltin: false,
              templateScope: "info" as const,
              titleFormula: state.referenceTitleFormula,
            }
          : undefined;

        const res = await fetch("/api/brand/titles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile,
            template: state.selectedBrandTemplate,
            infoVariantId: state.selectedBrandInfoVariant,
            mainKeyword: getEffectiveBrandKeyword(state),
            subKeywords: state.subKeywords || undefined,
            topic: state.topic || undefined,
            count: 5,
            analysisRecord: customAnalysisRecord,
            analysisRecordId: isStructureBased
              ? state.selectedAnalysisRecordId || undefined
              : undefined,
          }),
        });
        if (!res.ok) throw await parseGenErrorResponse(res, "제목 생성에 실패했습니다.");
        const data = await res.json();
        if (!Array.isArray(data.suggestions)) {
          throw new Error("응답 형식이 올바르지 않습니다. 다시 시도해주세요.");
        }
        updateState({ titleSuggestions: data.suggestions, isLoading: false });
        return;
      }

      // SEO·AEO 통합형 분기
      if (state.postCategory === "seoAeo") {
        const effectiveMain = getEffectiveMainKeyword(state);
        if (!effectiveMain) {
          throw new Error("주제 또는 메인 키워드 중 하나는 입력해주세요.");
        }
        const profile = await fetchAeoProfile();
        if (!profile) {
          throw new Error("AEO 프로필을 불러오지 못했습니다.");
        }
        const res = await fetch("/api/seo-aeo/titles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile,
            topic: state.topic || undefined,
            mainKeyword: effectiveMain,
            subKeywords: state.subKeywords || undefined,
            requirements: state.requirements || undefined,
            count: 5,
            // 의도 4종 선택 시 후보 5개를 그 각도 안에서만 변주. "auto"면 기존 동작.
            templateType: state.selectedTemplateType,
          }),
        });
        if (!res.ok) throw await parseGenErrorResponse(res, "제목 생성에 실패했습니다.");
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
          mainKeyword: getEffectiveMainKeyword(state),
          subKeywords: state.subKeywords || undefined,
          persona: state.persona || undefined,
          topic: state.topic || undefined,
          customProductInfoById,
        }),
      });
      if (!res.ok) throw await parseGenErrorResponse(res, "제목 생성에 실패했습니다.");
      const data = await res.json();
      if (!Array.isArray(data.suggestions)) {
        throw new Error("응답 형식이 올바르지 않습니다. 다시 시도해주세요.");
      }
      updateState({ titleSuggestions: data.suggestions, isLoading: false });
    } catch (err) {
      showGenErrorToast(err);
      updateState({ isLoading: false });
    }
    // getEffectiveMainKeyword(state)가 state 전체를 읽어 룰은 whole-object(state)를 요구하지만,
    // 실제로 읽는 필드는 아래에 개별 나열돼 있다. 전체 state를 넣으면 매 state 변경마다 콜백이
    // 재생성돼 불필요한 비용만 늘어 의도적으로 좁게 유지한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.postCategory, state.selectedBrandTemplate, state.selectedBrandInfoVariant, state.selectedBrandIntroVariant, state.selectedBrandValueProofVariant, state.selectedBrandDetailVariant, state.selectedAnalysisRecordId, state.referenceAnalysis, state.referenceTitleFormula, state.selectedProducts, state.narrativeType, state.toneType, state.mainKeyword, state.subKeywords, state.persona, state.topic, customProductInfoById, fetchBrandProfile, fetchAeoProfile, updateState]);

  // 검증 호출. fetchContent와 본문 직접 수정(handleContentEdit) 양쪽에서 재사용한다.
  const runValidation = useCallback(
    async (text: string) => {
      try {
        const endpoint =
          state.postCategory === "brand"
            ? "/api/brand/validate"
            : "/api/validate";
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            keyword: getEffectiveBrandKeyword(state),
            charRange: state.charCountRange,
            // Intent Mode 활성 시 validator 물음표 reject 완화 (질문형 소제목·FAQ 의무화에 맞춤)
            intentMode:
              state.postCategory === "seoAeo" &&
              state.selectedTemplateType !== "auto",
          }),
        });
        if (!res.ok) return;
        const quality = await res.json();
        updateState({ qualityResult: quality });
      } catch {
        // 검증 실패는 사용자 흐름을 막지 않음
      }
    },
    // getEffectiveMainKeyword(state)가 state 전체를 읽어 룰은 whole-object(state)를 요구하지만,
    // runValidation은 effect(2217)에 묶여 있어 전체 state를 deps에 넣으면 재검증 루프가 된다.
    // (state.selectedTemplateType를 deps 밖에서 읽는 기존 잠재 stale은 PR에 별도 플래그함.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.postCategory, state.selectedBrandTemplate, state.mainKeyword, state.charCountRange, updateState]
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
            mainKeyword: getEffectiveBrandKeyword(state),
            subKeywords: state.subKeywords || undefined,
            selectedTitle: state.selectedTitle || undefined,
          }),
        });
        if (checkRes.ok) {
          const fit = await checkRes.json();
          // 디버그: 검문소 응답을 항상 콘솔에 남겨 사용자가 DevTools로 확인 가능하게
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

    bypassFitCheckRef.current = false;

    updateState({
      isLoading: true,
      generatedContent: "",
      qualityResult: null,
      contentDirty: false,
      manualImageLayout: false,
      generatedImages: {},
      imageDescBySlot: {},
      aspectBySlot: {},
    });
    try {
      // 브랜드 모드 분기 — /api/brand/generate 로 호출
      let res: Response;
      if (state.postCategory === "brand") {
        const profile = await fetchBrandProfile();
        if (!profile) {
          throw new Error("브랜드 프로필을 불러오지 못했습니다.");
        }
        // "내 템플릿 만들기" — 사용자가 직접 분석한 글이 있으면 referenceText/Analysis 전송,
        // 보관함에서 선택한 카드가 있으면 analysisRecordId 전송 (structure-based와 동일 경로).
        const isCustomTemplate = state.selectedBrandTemplate === "custom";
        const isCustomDirectInput = isCustomTemplate && !state.selectedAnalysisRecordId;
        const isCustomLibrary = isCustomTemplate && !!state.selectedAnalysisRecordId;
        const isStructureBasedVariant =
          state.selectedBrandInfoVariant === "info-structure-based" ||
          state.selectedBrandIntroVariant === "intro-structure-based" ||
          state.selectedBrandValueProofVariant === "value-proof-structure-based" ||
          state.selectedBrandDetailVariant === "detail-structure-based";
        res = await fetch("/api/brand/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile,
            template: state.selectedBrandTemplate,
            infoVariantId: state.selectedBrandInfoVariant,
            introVariantId: state.selectedBrandIntroVariant,
            valueProofVariantId: state.selectedBrandValueProofVariant,
            detailVariantId: state.selectedBrandDetailVariant,
            mainKeyword: getEffectiveBrandKeyword(state),
            subKeywords: state.subKeywords || undefined,
            topic: effectiveTopic || undefined,
            requirements: state.requirements || undefined,
            charCount: state.charCountRange,
            selectedTitle: state.selectedTitle,
            // "내 템플릿 만들기" 전용 — 브랜드 노출 모드 토글
            referenceMode: isCustomTemplate ? state.brandCustomReferenceMode : undefined,
            // 사용자 직접 입력 견본 글 + 분석 결과 (custom 템플릿에서 보관함 선택 안 했을 때)
            referenceText: isCustomDirectInput ? state.referenceText || undefined : undefined,
            referenceAnalysis: isCustomDirectInput
              ? state.referenceAnalysis || undefined
              : undefined,
            referenceExcerpts:
              isCustomDirectInput && state.referenceExcerpts.length > 0
                ? state.referenceExcerpts
                : undefined,
            // 보관함 분석 ID — structure-based 변형 또는 custom 템플릿에서 보관함 선택 시
            analysisRecordId:
              isStructureBasedVariant || isCustomLibrary
                ? state.selectedAnalysisRecordId || undefined
                : undefined,
            // V1 첨부 제품 (선택) — undefined면 라우트에서 격리 패턴으로 기존 경로 유지
            attachedProduct: resolveAttachedProduct(state.selectedBrandProductId, userProducts),
          }),
        });
      } else if (state.postCategory === "seoAeo") {
        // SEO·AEO 통합형 — /api/seo-aeo/generate 로 호출
        const effectiveMain = getEffectiveMainKeyword(state);
        if (!effectiveMain) {
          throw new Error("주제 또는 메인 키워드 중 하나는 입력해주세요.");
        }
        const profile = await fetchAeoProfile();
        if (!profile) {
          throw new Error("AEO 프로필을 불러오지 못했습니다.");
        }
        res = await fetch("/api/seo-aeo/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            profile,
            selectedTitle: state.selectedTitle,
            topic: effectiveTopic || undefined,
            mainKeyword: effectiveMain,
            subKeywords: state.subKeywords || undefined,
            requirements: state.requirements || undefined,
            charCount: state.charCountRange,
            // V1 첨부 제품 (선택) — undefined면 라우트에서 격리 패턴으로 기존 경로 유지
            attachedProduct: resolveAttachedProduct(state.selectedAeoProductId, userProducts),
            // Intent 모드 전용 필드. "auto" 또는 undefined면 기존 함수 경로(회귀 0).
            // attachedProductName은 intent 모드 본문 2 자연 연결에 사용.
            templateType: state.selectedTemplateType,
            attachedProductName:
              resolveAttachedProduct(state.selectedAeoProductId, userProducts)?.name ?? null,
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
            mainKeyword: getEffectiveMainKeyword(state),
            subKeywords: state.subKeywords || undefined,
            persona: state.persona || undefined,
            requirements: state.requirements || undefined,
            charCount: state.charCountRange,
            selectedTitle: state.selectedTitle,
            referenceAnalysis: state.referenceAnalysis || undefined,
            referenceExcerpts: state.referenceExcerpts.length > 0 ? state.referenceExcerpts : undefined,
            topic: effectiveTopic || undefined,
            customProductInfoById,
            productPlacementMode: state.productPlacementMode,
          }),
        });
      }

      if (!res.ok) throw await parseGenErrorResponse(res, "글 생성에 실패했습니다.");

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

      // 스트리밍 완료 직후 후처리 (applyImagePostProcessing — postCategory 별 분기)
      const finalized = applyImagePostProcessing(
        content,
        state.postCategory,
        state.selectedTitle,
        getEffectiveMainKeyword(state),
        state.selectedTemplateType,
      );
      if (finalized !== content) {
        content = finalized;
        updateState({ generatedContent: finalized });
      }

      // 생성 완료 후 품질 검증
      updateState({ isLoading: false });
      await runValidation(content);
    } catch (err) {
      showGenErrorToast(err);
      updateState({ isLoading: false });
    }
    // fetchContent는 useEffect(…, [fetchContent]) (1181·1883)에 묶여 있어, 전체 state나
    // userProducts를 deps에 넣으면 매 state 변경마다 콜백이 재생성→effect가 재실행되어 글이
    // 반복 재생성될 수 있다. 필요한 필드는 아래에 개별 나열돼 있으므로 의도적으로 좁게 유지한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.postCategory, state.selectedBrandTemplate, state.selectedBrandInfoVariant, state.topic, state.selectedProducts, state.narrativeType, state.toneType, state.mainKeyword, state.subKeywords, state.persona, state.requirements, state.charCountRange, state.selectedTitle, state.referenceAnalysis, state.referenceExcerpts, state.referenceText, state.toneExample, customProductInfoById, fetchBrandProfile, fetchAeoProfile, updateState, runValidation]);

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
        manualImageLayout: false,
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
      manualImageLayout: false,
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
        // 슬롯이 변경됐으므로 slotVersion 증가 → 진행 중인 라운드의 옛 결과가 덮어쓰지 못함
        const nextVersion = {
          ...prev.slotVersionMap,
          [slotId]: (prev.slotVersionMap[slotId] ?? 0) + 1,
        };
        const nextFailures = { ...prev.slotFailures };
        delete nextFailures[slotId];
        return {
          ...prev,
          userPhotosBySlot: nextPhotos,
          generatedImages: nextImages,
          slotVersionMap: nextVersion,
          slotFailures: nextFailures,
        };
      });
    },
    [setState]
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
    [setState]
  );

  /**
   * 슬롯의 "생성할 이미지 설명"(description) 오버라이드 변경.
   * - value가 null이면 해당 키 삭제 → AI 추천(slot.description)으로 복원
   * - 그 외(빈 문자열 포함)는 편집 중 값 그대로 저장. 실제 전송 시엔 공백이면 slot.description로 폴백(effectiveDescription).
   * 설명은 생성 입력이므로 변경 시 slotVersionMap을 올려 진행 중 라운드의 stale write를 막는다.
   */
  const handleImageDescChange = useCallback(
    (slotId: string, value: string | null) => {
      setState((prev) => {
        const next = { ...prev.imageDescBySlot };
        if (value === null) {
          delete next[slotId];
        } else {
          next[slotId] = value;
        }
        return {
          ...prev,
          imageDescBySlot: next,
          slotVersionMap: {
            ...prev.slotVersionMap,
            [slotId]: (prev.slotVersionMap[slotId] ?? 0) + 1,
          },
        };
      });
    },
    [setState]
  );

  /** 슬롯별 비율 변경. 생성 입력이므로 slotVersionMap 증가(레이스 방지). */
  const handleAspectChange = useCallback(
    (slotId: string, ratio: string) => {
      setState((prev) => ({
        ...prev,
        aspectBySlot: { ...prev.aspectBySlot, [slotId]: ratio },
        slotVersionMap: {
          ...prev.slotVersionMap,
          [slotId]: (prev.slotVersionMap[slotId] ?? 0) + 1,
        },
      }));
    },
    [setState]
  );

  /** 활성(비제외) 슬롯 전체 비율 일괄 변경. 각 슬롯 버전을 올려 진행 중 결과 오염 방지. */
  const handleAspectChangeAll = useCallback(
    (ratio: string) => {
      setState((prev) => {
        const excluded = new Set(prev.excludedSlotIds);
        const nextAspect = { ...prev.aspectBySlot };
        const nextVersion = { ...prev.slotVersionMap };
        for (const s of prev.imageSlots) {
          if (excluded.has(s.id)) continue;
          nextAspect[s.id] = ratio;
          nextVersion[s.id] = (nextVersion[s.id] ?? 0) + 1;
        }
        return { ...prev, aspectBySlot: nextAspect, slotVersionMap: nextVersion };
      });
    },
    [setState]
  );

  const handleToggleExcluded = useCallback(
    (slotId: string, excluded: boolean) => {
      setState((prev) => {
        const set = new Set(prev.excludedSlotIds);
        if (excluded) set.add(slotId);
        else set.delete(slotId);
        return {
          ...prev,
          excludedSlotIds: Array.from(set),
          slotVersionMap: {
            ...prev.slotVersionMap,
            [slotId]: (prev.slotVersionMap[slotId] ?? 0) + 1,
          },
        };
      });
    },
    [setState]
  );

  // ── 수동 이미지 배치 (넣기/빼기/옮기기) ──────────────────────────────────────
  // 공통: 본문을 직접 계산한 뒤 imageSlots 도 함께 확정해 한 번의 setState 로 커밋한다.
  // manualImageLayout=true 로 자동 배치기를 끄고, prevContentRef 를 갱신해 KEY EFFECT 를 no-op
  // 시킨다(병합이 안 돌아 id 어긋남 없음). 발행이 순서 기반이므로 항상 parseImageMarkers 로
  // 재도출해 "순서=마커순서=index" 를 맞추고 기존 id 를 그 순서에 얹는다.
  const commitManualLayout = useCallback(
    (rawNewContent: string, newIdOrder: string[], opts?: { bumpVersionIds?: string[] }) => {
      // KEY EFFECT 의 manual 분기와 동일한 위생 처리(멱등) → 저장값이자 ref 값으로 사용
      const content = applySubtitleLineBreaks(
        collapseBlankLines(stripBrTags(rawNewContent)),
      );
      const parsed = parseImageMarkers(content);
      const slots = parsed.map((s, i) => (newIdOrder[i] ? { ...s, id: newIdOrder[i] } : s));
      const validIds = new Set(slots.map((s) => s.id));
      prevContentRef.current = content;
      setState((prev) => {
        const bumpedVersion = { ...prev.slotVersionMap };
        for (const id of opts?.bumpVersionIds ?? []) {
          bumpedVersion[id] = (bumpedVersion[id] ?? 0) + 1;
        }
        return {
          ...prev,
          generatedContent: content,
          imageSlots: slots,
          manualImageLayout: true,
          generatedImages: Object.fromEntries(
            Object.entries(prev.generatedImages).filter(([id]) => validIds.has(id)),
          ),
          userPhotosBySlot: Object.fromEntries(
            Object.entries(prev.userPhotosBySlot).filter(([id]) => validIds.has(id)),
          ),
          isGeneratingBySlot: Object.fromEntries(
            Object.entries(prev.isGeneratingBySlot).filter(([id]) => validIds.has(id)),
          ),
          imageDescBySlot: Object.fromEntries(
            Object.entries(prev.imageDescBySlot).filter(([id]) => validIds.has(id)),
          ),
          aspectBySlot: Object.fromEntries(
            Object.entries(prev.aspectBySlot).filter(([id]) => validIds.has(id)),
          ),
          slotFailures: Object.fromEntries(
            Object.entries(prev.slotFailures).filter(([id]) => validIds.has(id)),
          ),
          excludedSlotIds: prev.excludedSlotIds.filter((id) => validIds.has(id)),
          // 삭제된 id 는 map 에서 지우지 않고 bump — 진행 중 라운드의 stale 결과를 확실히 버리도록.
          slotVersionMap: bumpedVersion,
        };
      });
    },
    [setState],
  );

  const handleDeleteSlot = useCallback(
    (slotId: string) => {
      const slots = state.imageSlots;
      if (!slots.some((s) => s.id === slotId)) return;
      const newContent = pruneExcludedMarkers(
        state.generatedContent,
        slots,
        new Set([slotId]),
      );
      const newIdOrder = slots.filter((s) => s.id !== slotId).map((s) => s.id);
      commitManualLayout(newContent, newIdOrder, { bumpVersionIds: [slotId] });
    },
    [state.imageSlots, state.generatedContent, commitManualLayout],
  );

  const handleMoveSlot = useCallback(
    (slotId: string, dir: "up" | "down") => {
      const slots = state.imageSlots;
      const slot = slots.find((s) => s.id === slotId);
      if (!slot) return;
      const { content: newContent, adjacentWasMarker } = moveMarkerBlock(
        state.generatedContent,
        slot.index,
        dir,
      );
      if (newContent === state.generatedContent) return; // 경계(맨 위/아래) → no-op
      const ids = slots.map((s) => s.id);
      // 다른 마커를 지나 순서가 바뀐 경우에만 id 순서도 함께 swap
      if (adjacentWasMarker) {
        const j = dir === "up" ? slot.index - 1 : slot.index + 1;
        if (j >= 0 && j < ids.length) {
          [ids[slot.index], ids[j]] = [ids[j], ids[slot.index]];
        }
      }
      commitManualLayout(newContent, ids);
    },
    [state.imageSlots, state.generatedContent, commitManualLayout],
  );

  // 드래그 재배치(Phase 2): 마커를 임의의 블록 경계로 이동. moveMarkerBlock 과 같은 커밋 경로 재사용.
  const handleMoveSlotToBoundary = useCallback(
    (slotId: string, targetBoundary: number) => {
      const slots = state.imageSlots;
      const slot = slots.find((s) => s.id === slotId);
      if (!slot) return;
      const { content: newContent, newMarkerIndex } = moveMarkerToBoundary(
        state.generatedContent,
        slot.index,
        targetBoundary,
      );
      if (newContent === state.generatedContent) return;
      const ids = slots.map((s) => s.id);
      const [movedId] = ids.splice(slot.index, 1);
      ids.splice(newMarkerIndex, 0, movedId);
      commitManualLayout(newContent, ids);
    },
    [state.imageSlots, state.generatedContent, commitManualLayout],
  );

  const handleAddSlotAtBoundary = useCallback(
    (boundary: number) => {
      const slots = state.imageSlots;
      const keyword = getEffectiveMainKeyword(state) || "본문";
      const desc = `${keyword} 관련 실사 장면, 자연광, 한국인 피사체`;
      const newContent = insertEmptyMarkerAtBoundary(
        state.generatedContent,
        boundary,
        desc,
      );
      const insertIndex = markerIndexAtBoundary(state.generatedContent, boundary);
      const ids = slots.map((s) => s.id);
      const freshId = `slot-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
      ids.splice(insertIndex, 0, freshId);
      commitManualLayout(newContent, ids);
    },
    // getEffectiveMainKeyword 가 state 여러 필드를 읽으므로 state 를 dep 으로 둔다.
    [state, commitManualLayout],
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
      // 사진 올린 자리에서 AI 생성(text-to-image) 금지 — 업로드/변환 사진 덮어쓰기 방지.
      if (action === "ai" && photo) {
        toast.error("사진이 업로드된 자리예요. 사진을 빼면 AI로 생성할 수 있어요.");
        return;
      }

      // 생성 시작 시점의 슬롯 버전 스냅샷. 생성 중 사용자가 비율/프롬프트/제외를 바꾸면
      // slotVersionMap 이 올라가므로, 결과 반영 직전 버전이 달라졌으면 옛 결과를 폐기한다
      // (일괄 생성의 onSlotDone 과 동일한 stale-write 방지 규칙).
      const versionAtStart = state.slotVersionMap[slotId] ?? 0;

      setState((prev) => ({
        ...prev,
        isGeneratingBySlot: { ...prev.isGeneratingBySlot, [slotId]: true },
      }));

      try {
        // 사용자가 수정한 설명(공백이면 AI 추천으로 폴백). 서버가 이 값을 고정 템플릿에 끼워 재조립.
        const effectiveDescription =
          state.imageDescBySlot[slotId]?.trim() || slot.description;
        const aspectRatio =
          action === "ai" ? state.aspectBySlot[slotId] ?? "1:1" : undefined;
        const body = {
          content: state.generatedContent,
          slots: [
            {
              id: slot.id,
              index: slot.index,
              description: effectiveDescription,
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
              aspectRatio,
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
          // [B3] 생성 중 삭제/이동으로 사라진 슬롯이면 결과를 버림(orphan 이미지 방지)
          const slotStillExists = prev.imageSlots.some((s) => s.id === slotId);
          // 생성 중 비율/프롬프트/제외가 바뀌었으면(버전 증가) 옛 결과를 버림(stale write 방지)
          const versionUnchanged =
            (prev.slotVersionMap[slotId] ?? 0) === versionAtStart;
          if (
            slotStillExists &&
            versionUnchanged &&
            r &&
            r.status === "done" &&
            r.base64
          ) {
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
    [state.imageSlots, state.excludedSlotIds, state.userPhotosBySlot, state.generatedContent, state.imageDescBySlot, state.aspectBySlot, state.slotVersionMap, setState]
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

  /**
   * 일괄 AI 생성 — 클라이언트 병렬 풀(image-bulk).
   * 사진도 없고 출력도 없는 빈 슬롯만 대상.
   *
   * 변경 요지(이전 버전 대비):
   *  - 서버 직렬 배치 → 클라 동시성 3 + 최소 시작 간격 6초 풀
   *  - 슬롯 완료 즉시 화면 반영 + IndexedDB 저장
   *  - 429 backoff, AIMD 적응형 스로틀, 슬롯별 timeout
   *  - roundId/slotVersion 도장으로 stale write 방지
   */
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

    if (bulkAbortRef.current) {
      toast.info("이미 일괄 생성이 진행 중입니다.");
      return;
    }

    const roundId =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `r_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    const controller = new AbortController();
    bulkAbortRef.current = controller;
    bulkRoundIdRef.current = roundId;

    // 라운드 시작 시점의 slotVersion을 스냅샷 → 콜백에서 이 값과 현재 state 비교
    const versionSnapshot: Record<string, number> = {};
    for (const t of targets) {
      versionSnapshot[t.id] = state.slotVersionMap[t.id] ?? 0;
    }

    const jobs: SlotJob[] = targets.map((s) => ({
      slotPayload: {
        id: s.id,
        index: s.index,
        description: state.imageDescBySlot[s.id]?.trim() || s.description,
        groupId: s.groupId,
        mode: "ai" as const,
        aspectRatio: state.aspectBySlot[s.id] ?? "1:1",
      },
      slotVersion: versionSnapshot[s.id],
    }));

    // 라운드 시작 — 글로벌 플래그(버튼 잠금/[중지] 표시 전용)와 실패 칩 초기화,
    // 시작된 슬롯의 진행 플래그는 onSlotStart에서 켠다 (모든 슬롯 동시 spinner 회피).
    setState((prev) => {
      const nextFailures = { ...prev.slotFailures };
      for (const t of targets) delete nextFailures[t.id];
      return {
        ...prev,
        isImageGenerating: true,
        slotFailures: nextFailures,
        currentRoundId: roundId,
      };
    });

    let doneCount = 0;
    let failCount = 0;
    let abortedCount = 0;

    try {
      await runImageBulk(jobs, state.generatedContent, undefined, {
        roundId,
        signal: controller.signal,
        onSlotStart: (slotId) => {
          setState((prev) => ({
            ...prev,
            isGeneratingBySlot: {
              ...prev.isGeneratingBySlot,
              [slotId]: true,
            },
          }));
        },
        onSlotDone: (out: SlotOutcome) => {
          // 1) 라운드 일치 확인
          if (bulkRoundIdRef.current !== out.roundId) return;
          // 2) slot 버전 일치 확인 (사용자가 라운드 중에 손댔으면 무시)
          setState((prev) => {
            const currentVersion = prev.slotVersionMap[out.id] ?? 0;
            if (currentVersion !== out.slotVersion) {
              // stale: spinner만 끄고 결과는 버림
              const nextGen = { ...prev.isGeneratingBySlot };
              nextGen[out.id] = false;
              return { ...prev, isGeneratingBySlot: nextGen };
            }
            const nextGen = { ...prev.isGeneratingBySlot };
            nextGen[out.id] = false;

            // [B3] 삭제/이동으로 사라진 슬롯이면 spinner만 끄고 결과 버림(orphan 방지)
            if (!prev.imageSlots.some((s) => s.id === out.id)) {
              return { ...prev, isGeneratingBySlot: nextGen };
            }

            if (out.status === "done") {
              doneCount++;
              // IndexedDB 저장 (실패해도 흐름 안 막음)
              saveImage(out.roundId, out.id, out.base64, out.mimeType).catch(() => {});
              const nextFailures = { ...prev.slotFailures };
              delete nextFailures[out.id];
              return {
                ...prev,
                generatedImages: { ...prev.generatedImages, [out.id]: out.base64 },
                isGeneratingBySlot: nextGen,
                slotFailures: nextFailures,
              };
            }
            if (out.status === "failed") {
              failCount++;
              return {
                ...prev,
                isGeneratingBySlot: nextGen,
                slotFailures: { ...prev.slotFailures, [out.id]: out.reasonCode },
              };
            }
            // aborted
            abortedCount++;
            return { ...prev, isGeneratingBySlot: nextGen };
          });
        },
        onThrottle: (info) => {
          console.log("[image-bulk] throttle", JSON.stringify(info));
        },
      });
    } catch (err) {
      // runImageBulk는 거의 throw하지 않음(슬롯 단위 catch). 만약 throw되면 토스트.
      const msg = err instanceof Error ? err.message : "이미지 생성 실패";
      toast.error(msg);
    } finally {
      bulkAbortRef.current = null;
      // 라운드 마무리. slotFailures는 보존(사용자가 칩 보고 재시도 결정).
      setState((prev) => ({
        ...prev,
        isImageGenerating: false,
      }));

      if (doneCount > 0) {
        toast.success(`이미지 ${doneCount}개 생성 완료`);
      }
      if (failCount > 0) {
        toast.warning(
          `${failCount}개 실패 — 슬롯 카드에서 사유를 확인하고 재시도해 주세요`
        );
      }
      if (abortedCount > 0 && doneCount === 0 && failCount === 0) {
        toast.info("일괄 생성을 중지했습니다.");
      }
    }
  }, [
    state.imageSlots,
    state.excludedSlotIds,
    state.userPhotosBySlot,
    state.generatedImages,
    state.generatedContent,
    state.imageDescBySlot,
    state.aspectBySlot,
    state.slotVersionMap,
    setState,
  ]);

  /** 일괄 생성 중지 — 새 슬롯 시작 차단 + 가능한 in-flight fetch 끊기 */
  const handleAbortImages = useCallback(() => {
    const c = bulkAbortRef.current;
    if (!c) return;
    c.abort();
  }, []);

  const handleNext = () => {
    if (state.currentStep >= STEPS.length - 1) return;

    // Step 2 (글 설정) — 모든 칸이 비어있으면 안내 모달을 띄우고 진행 차단
    // 쓰레드 모드는 검사 대상 필드(블로그 전용)를 안 쓰므로 건너뜀.
    // 후기성은 mainKeyword가 필수라 canAdvance()가 직접 차단하므로 이 모달은 건너뜀.
    if (
      state.currentStep === 2 &&
      state.channel !== "thread" &&
      state.postCategory !== "review" &&
      !hasAnyContextInput(state)
    ) {
      setEmptyInputsWarningOpen(true);
      return;
    }

    if (!canAdvance()) return;
    const nextStep = state.currentStep + 1;

    updateState({
      currentStep: nextStep,
      maxVisitedStep: Math.max(state.maxVisitedStep, nextStep),
    });

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
      const shouldAutoAdvance = state.currentStep === 0;
      const nextStep = shouldAutoAdvance ? 1 : state.currentStep;
      const nextMaxVisitedStep =
        shouldAutoAdvance
          ? Math.max(state.maxVisitedStep, nextStep)
          : state.maxVisitedStep;

      // 채널이 실제로 바뀐 경우 블로그 관련 입력값까지 모두 리셋해
      // 다른 채널/플로우의 stale state가 다음 진행을 막지 않도록 한다.
      if (channel !== state.channel) {
        updateState({
          channel,
          currentStep: shouldAutoAdvance ? nextStep : 0,
          maxVisitedStep: shouldAutoAdvance ? nextStep : 0,
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
        });
      } else {
        updateState({
          channel,
          currentStep: nextStep,
          maxVisitedStep: nextMaxVisitedStep,
        });
      }
    },
    [updateState, state.channel, state.currentStep, state.maxVisitedStep]
  );

  const handleThreadsChange = useCallback(
    (partial: Partial<ThreadsState>) => {
      setState((prev) => ({
        ...prev,
        threads: { ...prev.threads, ...partial },
      }));
    },
    [setState]
  );

  const handlePostCategoryChange = useCallback(
    (postCategory: PostCategory) => {
      // 카테고리 변경 시 다른 카테고리의 stale 입력/결과를 정리해 잘못된 상태 잔존을 막는다.
      // 본문/제목/품질 결과도 모두 리셋해 새 카테고리 흐름이 깨끗하게 시작되도록 한다.
      updateState({
        postCategory,
        titleSuggestions: [],
        selectedTitle: "",
        generatedContent: "",
        qualityResult: null,
        contentDirty: false,
        manualImageLayout: false,
        generatedImages: {},
        imageDescBySlot: {},
        aspectBySlot: {},
        // AEO 프로필 — seoAeo가 사용
        selectedAeoProfileId:
          postCategory === "seoAeo" ? state.selectedAeoProfileId : null,
        // 브랜드 전용 — 카테고리 바뀌면 템플릿/변형 선택 초기화 (프로필 ID는 보존)
        selectedBrandTemplate: postCategory === "brand" ? state.selectedBrandTemplate : null,
        selectedBrandInfoVariant: postCategory === "brand" ? state.selectedBrandInfoVariant : null,
        selectedBrandIntroVariant: postCategory === "brand" ? state.selectedBrandIntroVariant : null,
        selectedBrandValueProofVariant: postCategory === "brand" ? state.selectedBrandValueProofVariant : null,
        selectedBrandDetailVariant: postCategory === "brand" ? state.selectedBrandDetailVariant : null,
      });
    },
    [
      updateState,
      state.selectedAeoProfileId,
      state.selectedBrandTemplate,
      state.selectedBrandInfoVariant,
      state.selectedBrandIntroVariant,
      state.selectedBrandValueProofVariant,
      state.selectedBrandDetailVariant,
    ]
  );

  const handleBrandProfileChange = useCallback(
    (profileId: string) => {
      updateState({ selectedBrandProfileId: profileId });
    },
    [updateState]
  );

  const handleBrandTemplateChange = useCallback(
    (template: import("@/types/brand").BrandTemplateId) => {
      // 템플릿이 바뀌면 변형 선택과 보관함 선택은 초기화 — 사용자가 명시적으로 다시 골라야 함.
      // "custom"으로 진입할 때는 referenceUrl/Text/Analysis 그대로 유지 (재진입 편의).
      // 다른 템플릿으로 이동 시에는 견본 입력은 비움.
      const isCustomEntry = template === "custom";
      updateState({
        selectedBrandTemplate: template,
        selectedBrandInfoVariant: null,
        selectedBrandIntroVariant: null,
        selectedBrandValueProofVariant: null,
        selectedBrandDetailVariant: null,
        selectedAnalysisRecordId: null,
        // 소개글·가치입증글은 제품 첨부 비활성(D1) — 잔여 선택을 비워 생성 시 전송 차단.
        ...(canAttachBrandProduct(template) ? {} : { selectedBrandProductId: undefined }),
        ...(isCustomEntry ? {} : { referenceUrl: "", referenceText: "", referenceAnalysis: "" }),
      });
    },
    [updateState]
  );

  const handleBrandIntroVariantChange = useCallback(
    (variant: import("@/types/brand").BrandIntroVariantId) => {
      const isLibrary = variant === "intro-structure-based";
      updateState({
        selectedBrandIntroVariant: variant,
        referenceUrl: "",
        referenceText: "",
        referenceAnalysis: "",
        ...(isLibrary ? {} : { selectedAnalysisRecordId: null }),
      });
    },
    [updateState]
  );

  const handleBrandValueProofVariantChange = useCallback(
    (variant: import("@/types/brand").BrandValueProofVariantId) => {
      const isLibrary = variant === "value-proof-structure-based";
      updateState({
        selectedBrandValueProofVariant: variant,
        referenceUrl: "",
        referenceText: "",
        referenceAnalysis: "",
        ...(isLibrary ? {} : { selectedAnalysisRecordId: null }),
      });
    },
    [updateState]
  );

  const handleBrandDetailVariantChange = useCallback(
    (variant: import("@/types/brand").BrandDetailVariantId) => {
      const isLibrary = variant === "detail-structure-based";
      updateState({
        selectedBrandDetailVariant: variant,
        referenceUrl: "",
        referenceText: "",
        referenceAnalysis: "",
        ...(isLibrary ? {} : { selectedAnalysisRecordId: null }),
      });
    },
    [updateState]
  );

  const handleBrandInfoVariantChange = useCallback(
    (variant: import("@/types/brand").BrandInfoVariantId) => {
      const isLibrary = variant === "info-structure-based";
      updateState({
        selectedBrandInfoVariant: variant,
        referenceUrl: "",
        referenceText: "",
        referenceAnalysis: "",
        ...(isLibrary
          ? {} // 보관함 모드는 selectedAnalysisRecordId 유지
          : { selectedAnalysisRecordId: null }),
      });
    },
    [updateState]
  );

  const handleAnalysisRecordSelect = useCallback(
    (recordId: string) => {
      // "내 템플릿 만들기"에서 보관함 선택 시는 recordId만 설정.
      // 기존 4개 템플릿의 builtin 카드 클릭은 brand-template-section.tsx 내부에서
      // 해당 variant까지 함께 변경하므로 여기서는 별도 처리 불필요.
      updateState({
        selectedAnalysisRecordId: recordId,
      });
    },
    [updateState]
  );

  const handleBrandCustomReferenceModeChange = useCallback(
    (mode: import("@/types/brand").BrandCustomReferenceMode) => {
      updateState({ brandCustomReferenceMode: mode });
    },
    [updateState]
  );

  const handleAeoProfileChange = useCallback(
    (profileId: string) => {
      updateState({ selectedAeoProfileId: profileId });
    },
    [updateState]
  );

  // Intent Mode — 글 의도 변경 시 downstream 상태 초기화.
  // titleSuggestions/selectedTitle/generatedContent/qualityResult/contentDirty/generatedImages/imageDescBySlot/aspectBySlot
  // 를 비워야 이전 의도로 만들어진 결과가 새 의도와 섞이는 사고를 막을 수 있다.
  // setState 함수형 업데이트로 prev 와 동일한 값이면 no-op (re-render 회피).
  const handleTemplateTypeChange = useCallback(
    (templateType: import("@/types").SeoAeoTemplateType) => {
      setState((prev) => {
        if (prev.selectedTemplateType === templateType) return prev;
        return {
          ...prev,
          selectedTemplateType: templateType,
          titleSuggestions: [],
          selectedTitle: "",
          generatedContent: "",
          qualityResult: null,
          contentDirty: false,
          manualImageLayout: false,
          generatedImages: {},
          imageDescBySlot: {},
          aspectBySlot: {},
        };
      });
    },
    [setState]
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
        referenceExcerpts: [],
      });
    },
    [updateState]
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

  // 본문 + 이미지를 ZIP 한 묶음으로 다운로드.
  // Electron 은 will-download 핸들러가 저장 위치 선택 창을 띄움(기본 위치=다운로드 폴더).
  const handleExportZip = useCallback(async () => {
    if (!state.generatedContent) return;
    setIsExportingZip(true);
    try {
      await exportZip({
        title: state.selectedTitle || "블로그 글",
        content: state.generatedContent,
        imageSlots: state.imageSlots,
        generatedImages: state.generatedImages,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "ZIP 생성에 실패했습니다.";
      toast.error(msg);
    } finally {
      setIsExportingZip(false);
    }
  }, [
    state.generatedContent,
    state.selectedTitle,
    state.imageSlots,
    state.generatedImages,
  ]);

  // ── 보관함(드래프트) ──────────────────────────────────────────────────────
  // 스냅샷에서 제외할 키: 큰 이진(이미지/원본사진) + 진행 중 플래그 + IDB 관리 데이터.
  // (WizardStateProvider 의 NON_PERSISTABLE_KEYS 와 동일 기준)
  const buildDraftSnapshot = useCallback((): Partial<WizardState> => {
    const clone: Partial<WizardState> = { ...state };
    const exclude: (keyof WizardState)[] = [
      "generatedImages",
      "userPhotosBySlot",
      "isGeneratingBySlot",
      "isImageGenerating",
      "slotFailures",
      "slotVersionMap",
      "currentRoundId",
      "isLoading",
    ];
    for (const k of exclude) delete clone[k];
    return clone;
  }, [state]);

  // 기본 제목 자동 조합: [모드·프로필/제품명] 글제목.
  // 브랜드/AEO 프로필명은 state 에 없어 async 로 조회(fetchBrandProfile/fetchAeoProfile 재사용).
  const buildDefaultDraftName = useCallback(async (): Promise<string> => {
    const title = (state.selectedTitle || "").trim();
    let prefix = "";
    try {
      if (state.postCategory === "review") {
        const pid = state.selectedProducts[0]?.id;
        const pname = pid ? customProductInfoById[pid]?.name : undefined;
        if (pname) prefix = `[제품·${pname}] `;
      } else if (state.postCategory === "brand") {
        const profile = (await fetchBrandProfile()) as { name?: string } | null;
        if (profile?.name) prefix = `[브랜드·${profile.name}] `;
      } else if (state.postCategory === "seoAeo") {
        const profile = (await fetchAeoProfile()) as
          | { name?: string; label?: string }
          | null;
        const pname = profile?.name ?? profile?.label;
        if (pname) prefix = `[AEO·${pname}] `;
      }
    } catch {
      // 프로필 조회 실패 — 제목만으로 폴백
    }
    if (title) return `${prefix}${title}`;
    if (prefix) return prefix.trim();
    const now = new Date();
    return `제목 없는 글 (${now.getMonth() + 1}.${now.getDate()})`;
  }, [
    state.selectedTitle,
    state.postCategory,
    state.selectedProducts,
    customProductInfoById,
    fetchBrandProfile,
    fetchAeoProfile,
  ]);

  // 저장공간 사용량이 80% 이상이면 경고 배너 플래그 ON.
  const refreshStorageWarning = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
        const { usage, quota } = await navigator.storage.estimate();
        if (usage && quota && quota > 0) {
          setDraftStorageWarning(usage / quota >= 0.8);
        }
      }
    } catch {
      // estimate 미지원 — 무시
    }
  }, []);

  const handleRequestSaveDraft = useCallback(async () => {
    if (!state.generatedContent) return;
    const name = await buildDefaultDraftName();
    setSaveDraftDefaultName(name);
    setSaveDraftOpen(true);
  }, [state.generatedContent, buildDefaultDraftName]);

  const handleSaveDraft = useCallback(
    async (name: string, memo: string) => {
      setIsSavingDraft(true);
      try {
        const snapshot = buildDraftSnapshot();
        const slotIds = Object.keys(state.generatedImages);
        const userPhotoSlotIds = Object.keys(state.userPhotosBySlot);
        const draft = saveDraft({ name, memo, snapshot, slotIds, userPhotoSlotIds });

        // 완성 이미지 복사 (mimeType 은 매직바이트로 추정해 함께 보관)
        const imgs: Record<string, { base64: string; mimeType: string }> = {};
        for (const [sid, b64] of Object.entries(state.generatedImages)) {
          imgs[sid] = { base64: b64, mimeType: detectImageMime(b64) };
        }
        await saveDraftImages(draft.id, imgs);
        // 원본 사진(AI 변환용) 복사
        await saveDraftUserPhotos(draft.id, state.userPhotosBySlot);

        setDrafts(listDrafts());
        await refreshStorageWarning();
        toast.success("보관함에 저장했습니다.");
        setSaveDraftOpen(false);
      } catch (err) {
        const msg =
          err instanceof Error && /quota|exceeded/i.test(err.message)
            ? "저장공간이 부족합니다. 보관함에서 오래된 글을 정리해 주세요."
            : "보관함 저장에 실패했습니다.";
        toast.error(msg);
      } finally {
        setIsSavingDraft(false);
      }
    },
    [state.generatedImages, state.userPhotosBySlot, buildDraftSnapshot, refreshStorageWarning],
  );

  const handleOpenLibrary = useCallback(async () => {
    setDrafts(listDrafts());
    await refreshStorageWarning();
    setLibraryOpen(true);
  }, [refreshStorageWarning]);

  const handleLoadDraft = useCallback(
    async (id: string) => {
      const draft = getDraft(id);
      if (!draft) return;
      // 현재 작성 중인(미저장) 글이 있으면 덮어쓰기 확인
      if (state.generatedContent || state.channel !== null) {
        const ok = window.confirm(
          "현재 작성 중인 글을 덮어씁니다. 보관함의 글을 불러올까요?",
        );
        if (!ok) return;
      }
      const [imgs, photos] = await Promise.all([
        loadDraftImages(id),
        loadDraftUserPhotos(id),
      ]);
      const generatedImages: Record<string, string> = {};
      for (const [sid, v] of Object.entries(imgs)) generatedImages[sid] = v.base64;
      const userPhotosBySlot: Record<string, UserPhoto> = {};
      for (const [sid, p] of Object.entries(photos)) {
        userPhotosBySlot[sid] = {
          base64: p.base64,
          mimeType: p.mimeType,
          instruction: p.instruction,
          useProModel: p.useProModel,
        };
      }
      // round 저장소와 네임스페이스 분리 — 복원 후 재생성 이미지는 새 roundId 로.
      const newRoundId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `r_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      // 옛 드래프트 sanitize: customPromptsBySlot(옛 '전체 프롬프트')는 제거하고,
      // 신규 키는 스냅샷 값(없으면 {})으로 명시 지정해 이전 글의 값이 새 지 않게 한다. (Codex #5·#6)
      const snap = { ...draft.snapshot };
      delete (snap as Record<string, unknown>).customPromptsBySlot;
      setState((prev) => ({
        ...prev,
        ...snap,
        // 옛 드래프트(필드 없음) 또는 직전 글의 stale true 방어 — 스냅샷 값 우선, 없으면 false.
        manualImageLayout: snap.manualImageLayout ?? false,
        imageDescBySlot: snap.imageDescBySlot ?? {},
        aspectBySlot: snap.aspectBySlot ?? {},
        generatedImages,
        userPhotosBySlot,
        currentRoundId: newRoundId,
        isGeneratingBySlot: {},
        isImageGenerating: false,
        slotFailures: {},
        isLoading: false,
        currentStep: 4, // 글 생성 단계
      }));
      setLibraryOpen(false);
      toast.success("보관함의 글을 불러왔습니다.");
    },
    [state.generatedContent, state.channel, setState],
  );

  // "내 정보 → 글 보관함"에서 「이어서 작성하기」로 넘어온 경우, 마운트 시 1회 자동 복원.
  const pendingDraftHandledRef = useRef(false);
  useEffect(() => {
    if (pendingDraftHandledRef.current) return;
    pendingDraftHandledRef.current = true;
    const id = consumePendingDraft();
    if (id) void handleLoadDraft(id);
    // 마운트 1회만 — handleLoadDraft 는 마운트 시점 클로저로 충분.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDeleteDraft = useCallback(async (id: string) => {
    const ok = window.confirm("이 글을 보관함에서 삭제할까요?");
    if (!ok) return;
    deleteDraft(id);
    await deleteDraftAssets(id);
    setDrafts(listDrafts());
    toast.success("삭제했습니다.");
  }, []);

  const handleRenameDraft = useCallback(
    (id: string, name: string, memo: string) => {
      renameDraft(id, name, memo);
      setDrafts(listDrafts());
    },
    [],
  );

  const handleExportDraftZip = useCallback(async (id: string) => {
    const draft = getDraft(id);
    if (!draft) return;
    try {
      const imgs = await loadDraftImages(id);
      const generatedImages: Record<string, string> = {};
      const mimeBySlot: Record<string, string> = {};
      for (const [sid, v] of Object.entries(imgs)) {
        generatedImages[sid] = v.base64;
        mimeBySlot[sid] = v.mimeType;
      }
      await exportZip({
        title: draft.name || draft.snapshot.selectedTitle || "블로그 글",
        content: draft.snapshot.generatedContent ?? "",
        imageSlots: draft.snapshot.imageSlots ?? [],
        generatedImages,
        mimeBySlot,
      });
    } catch {
      toast.error("ZIP 생성에 실패했습니다.");
    }
  }, []);

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

  // 금지어 AI 대체어 요청 — "(삭제 필요)"인 BANNED 단어만 추출해 /api/replace-forbidden 호출.
  // 응답은 단어→대체어 매핑 JSON. 본문은 여기서 손대지 않고, 컨펌 다이얼로그를 띄운다.
  const handleReplaceForbiddenRequest = useCallback(async () => {
    if (!state.qualityResult || !state.generatedContent) return;
    const bannedWords = Array.from(
      new Set(
        state.qualityResult.forbiddenWords
          .filter((fw) => fw.replacement === "(삭제 필요)")
          .map((fw) => fw.word),
      ),
    );
    if (bannedWords.length === 0) return;

    setIsReplacingForbidden(true);
    try {
      const res = await fetch("/api/replace-forbidden", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: state.generatedContent,
          words: bannedWords,
        }),
      });
      if (!res.ok) throw await parseGenErrorResponse(res, "대체어 요청 실패");
      const data = (await res.json()) as {
        replacements: Record<string, string>;
        skipped: string[];
      };
      if (Object.keys(data.replacements).length === 0) {
        toast.info("AI가 적절한 대체어를 찾지 못했어요. 본문 수정에서 직접 빼주세요.");
        return;
      }
      setReplacementPreview(data);
      setReplacementDialogOpen(true);
    } catch (err) {
      showGenErrorToast(err);
    } finally {
      setIsReplacingForbidden(false);
    }
  }, [state.qualityResult, state.generatedContent]);

  // 다이얼로그에서 [적용하기] 클릭 → 본문 surgical replace (replaceAll, 한 단어=한 대체어).
  // 본문 외 영역은 단 1글자도 안 바뀐다. 재검증까지 자동으로.
  const handleReplacementApply = useCallback(() => {
    if (!replacementPreview || !state.generatedContent) {
      setReplacementDialogOpen(false);
      return;
    }
    let next = state.generatedContent;
    for (const [word, replacement] of Object.entries(replacementPreview.replacements)) {
      next = next.split(word).join(replacement);
    }
    updateState({ generatedContent: next, contentDirty: true });
    runValidation(next);
    setReplacementDialogOpen(false);
    setReplacementPreview(null);

    const skippedCount = replacementPreview.skipped.length;
    if (skippedCount > 0) {
      toast.success(
        `금지어 ${Object.keys(replacementPreview.replacements).length}개 대체 완료. ${skippedCount}개는 직접 수정이 필요합니다.`,
      );
    } else {
      toast.success("금지어가 대체되었습니다.");
    }
  }, [replacementPreview, state.generatedContent, updateState, runValidation]);

  // ── 구간 재작성("이 문단만 다시 쓰기") ─────────────────────────────────────
  // 요청(입력창) → 제출(API) → 미리보기 → 적용(commitManualLayout). 마커/이미지 보존이
  // 핵심이라 적용은 handleContentEdit 이 아니라 원자 커밋 경로(commitManualLayout)를 쓴다.
  const handleRewriteSectionRequest = useCallback(
    (blockIndex: number) => {
      // 이미지 생성 중에는 in-flight 결과가 옛 본문 기준으로 덮어쓸 수 있어 차단.
      if (state.isImageGenerating) {
        toast.info("이미지 생성이 끝난 뒤에 문단을 다시 써 주세요.");
        return;
      }
      // 고칠 문단 원문을 계산해 입력창에 함께 표시(팝업이 본문을 가리는 문제 해결).
      const blocks = computeBlocks(state.generatedContent);
      const b = blocks[blockIndex];
      if (!b || b.kind !== "text") {
        toast.error("문단 위치를 찾지 못했어요. 다시 시도해주세요.");
        return;
      }
      const original = state.generatedContent
        .split("\n")
        .slice(b.lineStart, b.lineEnd + 1)
        .join("\n");
      setRewriteTargetText(original);
      setRewriteInstruction("");
      setRewriteTargetBlock(blockIndex);
    },
    [state.isImageGenerating, state.generatedContent],
  );

  const handleRewriteSectionSubmit = useCallback(async () => {
    const blockIndex = rewriteTargetBlock;
    const instruction = rewriteInstruction.trim();
    if (blockIndex === null || !instruction || !state.generatedContent) return;

    const contentAtRequest = state.generatedContent;
    const lines = contentAtRequest.split("\n");
    const blocks = computeBlocks(contentAtRequest);
    const block = blocks[blockIndex];
    if (!block || block.kind !== "text") {
      toast.error("문단 위치를 찾지 못했어요. 다시 시도해주세요.");
      setRewriteTargetBlock(null);
      return;
    }
    const original = lines.slice(block.lineStart, block.lineEnd + 1).join("\n");
    // 앞뒤 맥락: 가장 가까운 텍스트 블록 (톤/흐름 참고용, 읽기 전용)
    const nearestText = (dir: 1 | -1): string => {
      for (let k = blockIndex + dir; k >= 0 && k < blocks.length; k += dir) {
        if (blocks[k].kind === "text") {
          return lines.slice(blocks[k].lineStart, blocks[k].lineEnd + 1).join("\n");
        }
      }
      return "";
    };

    setIsRewriting(true);
    try {
      const res = await fetch("/api/rewrite-section", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section: original,
          instruction,
          keyword: getEffectiveMainKeyword(state) || undefined,
          before: nearestText(-1) || undefined,
          after: nearestText(1) || undefined,
        }),
      });
      if (!res.ok) throw await parseGenErrorResponse(res, "문단 다시 쓰기 실패");
      const data = (await res.json()) as { rewritten: string };
      const rewritten = (data.rewritten ?? "").trim();
      if (!rewritten) {
        toast.info("AI가 내용을 만들지 못했어요. 다시 시도해주세요.");
        return;
      }
      setRewritePreview({ blockIndex, original, rewritten, contentAtRequest });
      setRewriteTargetBlock(null);
      setRewriteDialogOpen(true);
    } catch (err) {
      showGenErrorToast(err);
    } finally {
      setIsRewriting(false);
    }
  }, [rewriteTargetBlock, rewriteInstruction, state]);

  const handleRewriteApply = useCallback(() => {
    if (!rewritePreview || !state.generatedContent) {
      setRewriteDialogOpen(false);
      return;
    }
    // 1) 전체 본문 스냅샷 일치 가드 — 요청~적용 사이 본문/이미지 배치가 바뀌면 안전 취소.
    if (state.generatedContent !== rewritePreview.contentAtRequest) {
      toast.error("본문이 변경돼 적용을 취소했어요. 다시 시도해주세요.");
      setRewriteDialogOpen(false);
      setRewritePreview(null);
      return;
    }
    // 2) 블록 재확인 (방어)
    const blocks = computeBlocks(state.generatedContent);
    const block = blocks[rewritePreview.blockIndex];
    const lines = state.generatedContent.split("\n");
    if (
      !block ||
      block.kind !== "text" ||
      lines.slice(block.lineStart, block.lineEnd + 1).join("\n") !== rewritePreview.original
    ) {
      toast.error("문단 위치가 바뀌어 적용할 수 없어요. 다시 시도해주세요.");
      setRewriteDialogOpen(false);
      setRewritePreview(null);
      return;
    }
    // 3) splice + 위생
    const spliced = replaceTextBlock(state.generatedContent, block, rewritePreview.rewritten);
    const sanitized = applySubtitleLineBreaks(collapseBlankLines(stripBrTags(spliced)));
    // 4) 마커 수 불변 assertion — 어긋나면 이미지 유실 위험이므로 취소.
    if (parseImageMarkers(sanitized).length !== state.imageSlots.length) {
      toast.error("이미지 자리 정합성 문제로 적용을 취소했어요. 다시 시도해주세요.");
      setRewriteDialogOpen(false);
      setRewritePreview(null);
      return;
    }
    // 5) 원자 커밋 — 자동 이미지 주입기 우회 + 슬롯 id 순서 보존 + prev 기반 프루닝.
    const idOrder = state.imageSlots.map((s) => s.id);
    commitManualLayout(spliced, idOrder);
    runValidation(sanitized);
    updateState({ contentDirty: true });
    setRewriteDialogOpen(false);
    setRewritePreview(null);
    toast.success("문단을 다시 썼어요.");
  }, [
    rewritePreview,
    state.generatedContent,
    state.imageSlots,
    commitManualLayout,
    runValidation,
    updateState,
  ]);

  const renderStep = () => {
    // 유튜브 채널 분기 — step 0 은 채널 선택, 그 이후는 쇼츠 생성기 임베드.
    if (state.channel === "youtube") {
      // 미구매자가 이전에 고른 유튜브 상태가 persist 돼 남아 있으면 채널선택으로 폴백.
      if (state.currentStep === 0 || !youtubeAllowed) {
        return (
          <StepChannelSelect
            channel={youtubeAllowed ? state.channel : null}
            onChannelChange={handleChannelChange}
          />
        );
      }
      return <YoutubeWorkflow />;
    }

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
              onStartNew={resetState}
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
            selectedBrandIntroVariant={state.selectedBrandIntroVariant}
            selectedBrandValueProofVariant={state.selectedBrandValueProofVariant}
            selectedBrandDetailVariant={state.selectedBrandDetailVariant}
            selectedAnalysisRecordId={state.selectedAnalysisRecordId}
            onBrandProfileChange={handleBrandProfileChange}
            onBrandTemplateChange={handleBrandTemplateChange}
            onBrandInfoVariantChange={handleBrandInfoVariantChange}
            onBrandIntroVariantChange={handleBrandIntroVariantChange}
            onBrandValueProofVariantChange={handleBrandValueProofVariantChange}
            onBrandDetailVariantChange={handleBrandDetailVariantChange}
            brandCustomReferenceMode={state.brandCustomReferenceMode}
            onBrandCustomReferenceModeChange={handleBrandCustomReferenceModeChange}
            selectedAeoProfileId={state.selectedAeoProfileId}
            onAeoProfileChange={handleAeoProfileChange}
            selectedTemplateType={state.selectedTemplateType}
            onTemplateTypeChange={handleTemplateTypeChange}
            onAnalysisRecordSelect={handleAnalysisRecordSelect}
            userProducts={userProducts}
            onUserProductsChange={refetchUserProducts}
            onProductDeleted={handleProductDeleted}
            selectedBrandProductId={state.selectedBrandProductId}
            selectedAeoProductId={state.selectedAeoProductId}
            onBrandProductAttach={(id) => updateState({ selectedBrandProductId: id })}
            onAeoProductAttach={(id) => updateState({ selectedAeoProductId: id })}
          />
        );
      case 2:
        return (
          <StepSettings
            state={state}
            onChange={updateState}
            customProductInfoById={customProductInfoById}
          />
        );
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
            title={state.selectedTitle}
            qualityResult={state.qualityResult}
            // 표시용 키워드는 검증에 실제로 쓴 것과 동일해야 한다(runValidation 이 getEffectiveBrandKeyword 사용).
            // 그래야 키워드 없이 쓰는 브랜드 템플릿에서 "" 로 일치돼 글 정보의 키워드 섹션이 숨는다.
            keyword={getEffectiveBrandKeyword(state)}
            isLoading={state.isLoading}
            onRetryValidation={() => {
              if (state.generatedContent) void runValidation(state.generatedContent);
            }}
            // 이미지 마커 수 warn 임계치를 Intent Mode일 때 3~4장 정책으로 분기
            isIntentMode={
              state.postCategory === "seoAeo" &&
              state.selectedTemplateType !== "auto"
            }
            onRegenerate={handleContentRegenerate}
            onCopy={handleContentCopy}
            onExportZip={handleExportZip}
            isExporting={isExportingZip}
            onRequestSaveDraft={handleRequestSaveDraft}
            onOpenLibrary={handleOpenLibrary}
            onContentEdit={handleContentEdit}
            onReplaceForbidden={handleReplaceForbiddenRequest}
            isReplacingForbidden={isReplacingForbidden}
            imageSlots={state.imageSlots}
            userPhotosBySlot={state.userPhotosBySlot}
            excludedSlotIds={state.excludedSlotIds}
            generatedImages={state.generatedImages}
            isGeneratingBySlot={state.isGeneratingBySlot}
            isImageGenerating={state.isImageGenerating}
            imageDescBySlot={state.imageDescBySlot}
            aspectBySlot={state.aspectBySlot}
            slotFailures={state.slotFailures}
            onUserPhotoChange={handleUserPhotoChange}
            onUserInstructionChange={handleUserInstructionChange}
            onToggleExcluded={handleToggleExcluded}
            onGenerateImages={handleGenerateImages}
            onAbortImages={handleAbortImages}
            onGenerateSlotAI={handleGenerateSlotAI}
            onTransformSlot={handleTransformSlot}
            onImageDescChange={handleImageDescChange}
            onAspectChange={handleAspectChange}
            onAspectChangeAll={handleAspectChangeAll}
            onDeleteSlot={handleDeleteSlot}
            onMoveSlot={handleMoveSlot}
            onMoveSlotToBoundary={handleMoveSlotToBoundary}
            onAddSlotAtBoundary={handleAddSlotAtBoundary}
            onRewriteTextBlock={handleRewriteSectionRequest}
            manualImageLayout={state.manualImageLayout}
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
            onStartNew={resetState}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div data-blog-pick-root className="min-h-screen bg-background text-foreground">
      <div
        data-blog-pick-shell
        className="mx-auto max-w-7xl px-4 pb-16 pt-8 sm:px-6 lg:px-8"
      >
        <AppHeader
          onTitleClick={handleTitleClick}
          subtitle={
            state.channel === "thread"
              ? "쓰레드 글과 이미지를 한 번에 만듭니다"
              : state.channel === "blog"
                ? "후기 · 브랜드 · AEO 블로그 글을 단계별로 자동 생성합니다"
                : state.channel === "youtube" &&
                    youtubeAllowed &&
                    state.currentStep > 0
                  ? "각 단계를 클릭해 자유롭게 이동할 수 있어요"
                  : "어떤 채널의 콘텐츠를 만들지 골라보세요"
          }
        />

        {/* Stepper — 유튜브 탭(채널 선택 이후)에선 네이티브 워크플로가 자체 스텝퍼를 그리므로 숨김 */}
        {!(state.channel === "youtube" && state.currentStep > 0) && (
        <nav className="mb-16">
          <ol className="flex items-center justify-between">
            {STEPS.map((step, index) => {
              const Icon = step.icon;
              const isActive = index === state.currentStep;
              const isCompleted = index < state.currentStep;
              const isJumpable =
                index <= state.maxVisitedStep && index !== state.currentStep;

              return (
                <li
                  key={step.label}
                  className="flex flex-1 items-center last:flex-none"
                >
                  <button
                    type="button"
                    disabled={!isJumpable}
                    onClick={() => {
                      updateState({ currentStep: index });
                      // 점프로 단계 이동 시에도 handleNext와 동일한 자동 fetch 트리거 적용.
                      // 블로그 채널에서만, 비어 있을 때만 호출.
                      if (state.channel === "blog") {
                        if (index === 3 && state.titleSuggestions.length === 0) {
                          fetchTitles().catch(() => {});
                        }
                        if (index === 4 && state.generatedContent === "") {
                          fetchContent().catch(() => {});
                        }
                      }
                    }}
                    aria-label={`${step.label} 단계로 이동`}
                    aria-current={isActive ? "step" : undefined}
                    className={`flex flex-col items-center gap-2 rounded-lg p-1 transition-all ${
                      isJumpable
                        ? "cursor-pointer hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        : "cursor-default"
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300 ${
                        isCompleted
                          ? "border-primary bg-primary text-primary-foreground"
                          : isActive
                            ? "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_color-mix(in_oklch,var(--primary)_18%,transparent)]"
                            : "border-muted bg-muted/40 text-muted-foreground"
                      }`}
                    >
                      {isCompleted ? (
                        <Check className="h-5 w-5" />
                      ) : (
                        <Icon className="h-5 w-5" />
                      )}
                    </div>
                    <span
                      className={`hidden text-xs whitespace-nowrap transition-colors sm:inline-block ${
                        isActive
                          ? "font-semibold text-primary"
                          : isCompleted
                            ? "font-medium text-foreground"
                            : "font-medium text-muted-foreground"
                      }`}
                    >
                      {step.label}
                    </span>
                  </button>
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
        )}

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

        {/* Navigation Buttons — 유튜브 탭(채널 선택 이후)에선 네이티브 워크플로가 자체 운전하므로 숨김 */}
        {!(state.channel === "youtube" && state.currentStep > 0) && (
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
              <span className="hidden sm:inline">다음: {STEPS[state.currentStep + 1].label}</span>
              <span className="sm:hidden">다음</span>
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
          {state.currentStep === STEPS.length - 1 && <div className="w-20" />}
        </div>
        )}
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

      {/* Step 2 빈 입력 안내 모달 */}
      <EmptyInputsWarningModal
        open={emptyInputsWarningOpen}
        onClose={() => setEmptyInputsWarningOpen(false)}
      />

      {/* 큰 타이틀 클릭 또는 헤더 "새로 시작" 버튼 → 위저드 초기화 확인 */}
      <Dialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>처음으로 돌아갈까요?</DialogTitle>
            <DialogDescription>
              지금까지 입력하신 내용이 모두 사라집니다. 계속하시겠어요?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetConfirmOpen(false)}
            >
              취소
            </Button>
            <Button onClick={confirmReset}>새로 시작</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 금지어 AI 대체어 미리보기 + 적용 확인 */}
      <Dialog
        open={replacementDialogOpen}
        onOpenChange={(open) => {
          setReplacementDialogOpen(open);
          if (!open) setReplacementPreview(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>AI가 제안한 대체어</DialogTitle>
            <DialogDescription>
              본문은 그대로 두고 아래 단어만 정확히 바뀝니다.
            </DialogDescription>
          </DialogHeader>

          {replacementPreview && (
            <div className="space-y-2 py-2">
              {Object.entries(replacementPreview.replacements).map(
                ([word, replacement]) => (
                  <div
                    key={word}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span className="text-red-400 line-through">{word}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className="font-medium text-green-500">
                      {replacement}
                    </span>
                  </div>
                ),
              )}
              {replacementPreview.skipped.length > 0 && (
                <div className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 text-xs text-amber-600 dark:text-amber-400">
                  AI가 적절한 대체어를 못 찾은 단어:{" "}
                  <strong>{replacementPreview.skipped.join(", ")}</strong>
                  <br />
                  본문 수정에서 직접 다듬어주세요.
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setReplacementDialogOpen(false);
                setReplacementPreview(null);
              }}
            >
              취소
            </Button>
            <Button onClick={handleReplacementApply}>적용하기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 구간 재작성 1단계 — 수정 요청 입력창 */}
      <Dialog
        open={rewriteTargetBlock !== null}
        onOpenChange={(open) => {
          if (!open) setRewriteTargetBlock(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>이 문단만 다시 쓰기</DialogTitle>
            <DialogDescription>
              아래 문단을 어떻게 바꿀지 알려주세요. 이 문단만 새로 쓰고 나머지 글과 이미지는 그대로 둡니다.
            </DialogDescription>
          </DialogHeader>

          {/* 고칠 문단 원문 — 팝업이 본문을 가려도 무엇을 고치는지 보이게 */}
          <div className="max-h-48 overflow-y-auto rounded-md border border-border/60 bg-muted/30 p-3">
            <div className="mb-1 text-xs font-medium text-muted-foreground">
              고칠 문단
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {rewriteTargetText}
            </p>
          </div>

          <Textarea
            value={rewriteInstruction}
            onChange={(e) => setRewriteInstruction(e.target.value)}
            placeholder="예: 더 짧고 담백하게 / 실제 사용 후기 느낌으로 / 예시를 하나 넣어서"
            rows={3}
            autoFocus
            disabled={isRewriting}
          />

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRewriteTargetBlock(null)}
              disabled={isRewriting}
            >
              취소
            </Button>
            <Button
              onClick={handleRewriteSectionSubmit}
              disabled={isRewriting || rewriteInstruction.trim().length === 0}
            >
              {isRewriting ? "AI가 쓰는 중…" : "AI에게 요청"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 구간 재작성 2단계 — 원문 vs 새 문단 미리보기 + 적용 */}
      <Dialog
        open={rewriteDialogOpen}
        onOpenChange={(open) => {
          setRewriteDialogOpen(open);
          if (!open) setRewritePreview(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>새로 쓴 문단</DialogTitle>
            <DialogDescription>
              마음에 들면 적용하세요. 이 문단만 바뀌고 이미지는 유지됩니다.
            </DialogDescription>
          </DialogHeader>

          {rewritePreview && (
            <div className="space-y-3 py-2">
              <div className="rounded-md border border-border/60 bg-muted/30 p-3">
                <div className="mb-1 text-xs font-medium text-muted-foreground">
                  기존
                </div>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground line-through decoration-red-400/50">
                  {rewritePreview.original}
                </p>
              </div>
              <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
                <div className="mb-1 text-xs font-medium text-primary">새 문단</div>
                <p className="whitespace-pre-wrap text-sm">
                  {rewritePreview.rewritten}
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                // 다시 요청: 같은 블록·같은 지시로 입력창 재오픈
                if (rewritePreview) {
                  setRewriteTargetBlock(rewritePreview.blockIndex);
                }
                setRewriteDialogOpen(false);
                setRewritePreview(null);
              }}
            >
              다시 요청
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setRewriteDialogOpen(false);
                setRewritePreview(null);
              }}
            >
              취소
            </Button>
            <Button onClick={handleRewriteApply}>적용하기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 보관함 — 저장 다이얼로그 + 목록 모달 */}
      <SaveDraftDialog
        open={saveDraftOpen}
        defaultName={saveDraftDefaultName}
        saving={isSavingDraft}
        onClose={() => setSaveDraftOpen(false)}
        onSave={handleSaveDraft}
      />
      <DraftLibraryModal
        open={libraryOpen}
        drafts={drafts}
        storageWarning={draftStorageWarning}
        onClose={() => setLibraryOpen(false)}
        onLoad={handleLoadDraft}
        onDelete={handleDeleteDraft}
        onRename={handleRenameDraft}
        onExport={handleExportDraftZip}
      />
    </div>
  );
}
