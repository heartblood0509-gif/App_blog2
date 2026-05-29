"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles } from "lucide-react";
import type { UserProduct } from "@/types";
import { PRODUCTS } from "@/lib/products";
import { composeAdvantagesNatural } from "@/lib/prompts/brand-context";

interface ProductFormProps {
  open: boolean;
  initial?: UserProduct | Partial<Omit<UserProduct, "id">> | null;
  /** 시드 + 기존 사용자 제품의 이름 목록 (중복 검증) */
  existingNames: string[];
  /**
   * AI 어시스턴트가 도메인 추론으로 채운 필드 이름 배열.
   * 해당 필드는 노란 배경 + "AI 추정" 배지로 표시. 사용자가 검토해야 함.
   */
  prefillAiGuessFields?: string[];
  onClose: () => void;
  onSave: (payload: Omit<UserProduct, "id">) => Promise<void> | void;
}

type Payload = Omit<UserProduct, "id">;

const EMPTY: Payload = {
  name: "",
  category: "",
  defaultAdvantages: "",
  relatedSymptoms: [],
  naturalMentionPatterns: [],
  keyInsight: "",
  sensoryDetails: [],
  realReviews: [],
  productUrl: "",
  hasReviews: true,
  expectedReactions: [],
  efficacy: "",
  ingredients: "",
  usability: "",
  differentiator: "",
  usage: "",
  // 사이클 3 — precautions만 유지 (사용자 검증 후 4칸 제거)
  precautions: "",
};

// 시드 카테고리 (자동완성 데이터소스, 중복 제거)
const SEED_CATEGORIES = Array.from(new Set(PRODUCTS.map((p) => p.category)));

// 양쪽 큰따옴표·작은따옴표·전각 따옴표 strip
const stripQuotes = (s: string): string =>
  s.replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "");

const linesToArray = (s: string): string[] =>
  s
    .split("\n")
    .map((line) => stripQuotes(line))
    .filter((line) => line.length > 0);

const arrayToLines = (a: string[] | undefined): string => (a ?? []).join("\n");

// 탈모샴푸 placeholder
const PH = {
  name: "탈모샴푸",
  category: "헤어케어",
  efficacy: `두피 열감 진정, 빠짐 환경 개선
머리 감고 나서 두피 컨디션이 안정됨`,
  ingredients: `비오틴, 살리실산
무실리콘`,
  usability: `개운하지만 건조하지 않음
기존 탈모샴푸 특유의 뻣뻣함이 덜함`,
  differentiator: `탈모를 잡는다보다 빠질 환경을 줄이는 방향으로 접근`,
  usage: `2회 푸시, 거품 충분히 낸 뒤 두피에 2분 마사지 후 헹굼`,
  relatedSymptoms: `탈모
머리카락 빠짐
두피 가려움
두피 각질
두피 냄새
머리숱 감소`,
  naturalMentionPatterns: `요즘 쓰고 있는 샴푸
지인 추천으로 써보기 시작한
우연히 바꿔보게 된
맘카페에서 후기 보고 바꿔본`,
  keyInsight: "탈모를 잡는다보다 빠질 환경을 줄이는 방향으로 접근하는 타입",
  sensoryDetails: `개운함은 있는데 건조하지 않음
두피 열감 간지러움이 줄면서 전체적인 두피 컨디션 안정
기존 탈모샴푸 특유의 뻣뻣함이 덜함`,
  realReviews: `머리 빠지는 건 바로 줄진 않는데 두피가 덜 자극받으니까 덜 빠지는 느낌
기존 탈모샴푸처럼 뻣뻣하거나 떡지는 느낌 없음
꾸준히 썼을 때 차이가 나는 쪽`,
  productUrl: "https://example.com/products/hair-shampoo",
  expectedReactions: `처음 써본 사람은 "확 잡아주는 느낌"보다 "두피가 편해지는 흐름"이라고 느낄 듯
꾸준히 쓸수록 차이가 나는 타입이라 단기 체감보다 1~2주 후가 핵심`,
  // 사이클 3 — precautions만 유지 (신뢰도 단락의 핵심)
  precautions: `극건성 두피에는 다소 가벼울 수 있음
향에 민감한 분은 무향 제품 추천`,
};

/** 평면 펼침 섹션 — 카드형 구획. aiSuggested=true면 옅은 노란 배경 + 배지 */
function Section({
  title,
  hint,
  aiSuggested,
  children,
}: {
  title: React.ReactNode;
  hint?: string;
  aiSuggested?: boolean;
  children: React.ReactNode;
}) {
  const aiCls = aiSuggested
    ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
    : "bg-card/40";
  return (
    <section className={`space-y-2 rounded-lg border p-4 ${aiCls}`}>
      <header>
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          {title}
          {aiSuggested && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:text-amber-100">
              <Sparkles className="h-2.5 w-2.5" />
              AI 추정
            </span>
          )}
        </h3>
        {hint && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
        )}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

/** 개별 textarea 옆 AI 추정 배지 — 5분할 같은 한 Section 안의 개별 필드용 */
function AiBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span className="ml-1 inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:text-amber-100">
      <Sparkles className="h-2.5 w-2.5" />
      AI 추정
    </span>
  );
}

type ArrayFieldKey =
  | "relatedSymptoms"
  | "naturalMentionPatterns"
  | "sensoryDetails"
  | "realReviews"
  | "expectedReactions";

const EMPTY_LINES_TEXT: Record<ArrayFieldKey, string> = {
  relatedSymptoms: "",
  naturalMentionPatterns: "",
  sensoryDetails: "",
  realReviews: "",
  expectedReactions: "",
};

export function ProductForm({
  open,
  initial,
  existingNames,
  prefillAiGuessFields,
  onClose,
  onSave,
}: ProductFormProps) {
  const [payload, setPayload] = useState<Payload>(EMPTY);
  // 배열 필드의 원본 텍스트 — Enter로 빈 줄 입력해도 사라지지 않도록 분리 보관.
  // 저장 시 linesToArray로 변환.
  const [linesText, setLinesText] =
    useState<Record<ArrayFieldKey, string>>(EMPTY_LINES_TEXT);
  const [submitting, setSubmitting] = useState(false);

  const aiGuessSet = useMemo(
    () => new Set(prefillAiGuessFields ?? []),
    [prefillAiGuessFields]
  );

  useEffect(() => {
    if (open) {
      if (initial) {
        const { id: _ignored, ...rest } = initial as Partial<UserProduct>;
        void _ignored;
        const merged: Payload = {
          ...EMPTY,
          ...rest,
          hasReviews: rest.hasReviews ?? true,
        };
        setPayload(merged);
        setLinesText({
          relatedSymptoms: arrayToLines(merged.relatedSymptoms),
          naturalMentionPatterns: arrayToLines(merged.naturalMentionPatterns),
          sensoryDetails: arrayToLines(merged.sensoryDetails),
          realReviews: arrayToLines(merged.realReviews),
          expectedReactions: arrayToLines(merged.expectedReactions ?? []),
        });
      } else {
        setPayload(EMPTY);
        setLinesText(EMPTY_LINES_TEXT);
      }
    }
  }, [open, initial]);

  const update = <K extends keyof Payload>(key: K, value: Payload[K]) =>
    setPayload((prev) => ({ ...prev, [key]: value }));

  const updateLines = (key: ArrayFieldKey, value: string) =>
    setLinesText((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (submitting) return;

    // 5분할 → 자연 합성 (라벨 누수 차단의 핵심) — defaultAdvantages에 저장
    const normalized: Payload = {
      name: payload.name.trim(),
      category: payload.category.trim(),
      defaultAdvantages: "", // 아래에서 composeAdvantagesNatural로 채움
      keyInsight: stripQuotes(payload.keyInsight.trim()),
      relatedSymptoms: linesToArray(linesText.relatedSymptoms),
      naturalMentionPatterns: linesToArray(linesText.naturalMentionPatterns),
      sensoryDetails: linesToArray(linesText.sensoryDetails),
      realReviews: linesToArray(linesText.realReviews),
      productUrl: payload.productUrl?.trim() ?? "",
      hasReviews: payload.hasReviews,
      expectedReactions: linesToArray(linesText.expectedReactions),
      efficacy: payload.efficacy?.trim() ?? "",
      ingredients: payload.ingredients?.trim() ?? "",
      usability: payload.usability?.trim() ?? "",
      differentiator: payload.differentiator?.trim() ?? "",
      usage: payload.usage?.trim() ?? "",
      // 사이클 3 — precautions만 유지
      precautions: payload.precautions?.trim() ?? "",
    };
    // defaultAdvantages를 자연 합성 텍스트로 채움 (P0-3 해결: step 1 빈 화면 방지 + fallback 안전)
    normalized.defaultAdvantages = composeAdvantagesNatural({
      ...normalized,
      id: "tmp", // composeAdvantagesNatural은 id 안 쓰지만 타입 만족용
    } as UserProduct);

    // 검증
    const missing: string[] = [];
    if (!normalized.name) missing.push("제품명");
    if (!normalized.category) missing.push("카테고리");

    const hasAnyAdvantage =
      normalized.efficacy ||
      normalized.ingredients ||
      normalized.usability ||
      normalized.differentiator ||
      normalized.usage ||
      normalized.defaultAdvantages;
    if (!hasAnyAdvantage) missing.push("제품 장점 (효능·성분·사용감·차별점·사용법 중 하나 이상)");

    if (normalized.relatedSymptoms.length === 0) missing.push("관련 증상/고민");
    if (normalized.naturalMentionPatterns.length === 0)
      missing.push("자연스러운 언급 패턴");
    if (!normalized.keyInsight) missing.push("핵심 방향성");
    if (normalized.sensoryDetails.length === 0) missing.push("감각 표현");

    if (normalized.hasReviews && normalized.realReviews.length === 0) {
      missing.push("실제 후기 (또는 위에서 '신규 출시' 선택)");
    }

    if (missing.length > 0) {
      toast.error(`다음 항목을 입력해주세요: ${missing.join(", ")}`);
      return;
    }

    // 이름 중복
    const initialName = (initial && "name" in initial ? initial.name : undefined) ?? undefined;
    const otherNames = existingNames.filter((n) => !initialName || n !== initialName);
    if (otherNames.includes(normalized.name)) {
      toast.error(`이미 등록된 제품 이름입니다: ${normalized.name}`);
      return;
    }

    // ⚠️ AI 추정 환각 confirm — 성분(ingredients) 또는 효능(efficacy)이 AI 추정이고 값이 있을 때
    const riskyAiFields: string[] = [];
    if (aiGuessSet.has("ingredients") && normalized.ingredients) {
      riskyAiFields.push("핵심 성분·특징");
    }
    if (aiGuessSet.has("efficacy") && normalized.efficacy) {
      riskyAiFields.push("효능·기대 효과");
    }
    if (riskyAiFields.length > 0) {
      const ok = window.confirm(
        `AI가 추정해서 채운 항목이 포함되어 있습니다:\n\n• ${riskyAiFields.join("\n• ")}\n\n실제 제품과 맞는지 확인하셨나요?\n\n[취소]를 누르면 폼으로 돌아가서 노란 배경 칸을 수정할 수 있습니다.`
      );
      if (!ok) return;
    }

    setSubmitting(true);
    try {
      await onSave(normalized);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const isEditMode = !!(initial && "id" in initial && initial.id);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{isEditMode ? "제품 수정" : "새 제품 등록"}</DialogTitle>
          <DialogDescription>
            <strong>필수 항목</strong>(제품명·카테고리·장점 1개 이상·증상·언급·방향성·감각)만 채우면 저장돼요.
            채울수록 글 품질이 올라갑니다.
            <br />
            <span className="text-[11px]">
              💡 더 쉽게 채우고 싶다면 위 [✨ AI 도움받기] 버튼을 사용해보세요.
              {aiGuessSet.size > 0 && (
                <strong className="ml-1 text-amber-700 dark:text-amber-300">
                  ※ 노란 배경 칸은 AI가 추정한 부분입니다. 실제 제품과 다르면 꼭 수정하세요.
                </strong>
              )}
            </span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="space-y-5">
            {/* 기본 정보 */}
            <Section title="기본 정보" hint="제품의 정체성을 결정">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="product-name" className="text-xs flex items-center">
                    제품명 *
                    <AiBadge show={aiGuessSet.has("name")} />
                  </Label>
                  <Input
                    id="product-name"
                    value={payload.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder={PH.name}
                    className={aiGuessSet.has("name") ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : ""}
                  />
                </div>
                <div>
                  <Label htmlFor="product-category" className="text-xs flex items-center">
                    카테고리 *
                    <AiBadge show={aiGuessSet.has("category")} />
                  </Label>
                  <Input
                    id="product-category"
                    list="seed-categories"
                    value={payload.category}
                    onChange={(e) => update("category", e.target.value)}
                    placeholder={PH.category}
                    className={aiGuessSet.has("category") ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : ""}
                  />
                  <datalist id="seed-categories">
                    {SEED_CATEGORIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="mt-3">
                <Label htmlFor="product-url" className="text-xs flex items-center">
                  판매 제품 URL
                  <AiBadge show={aiGuessSet.has("productUrl")} />
                </Label>
                <Input
                  id="product-url"
                  type="url"
                  value={payload.productUrl ?? ""}
                  onChange={(e) => update("productUrl", e.target.value)}
                  placeholder="예: https://example.com/products/..."
                  className={
                    aiGuessSet.has("productUrl")
                      ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20"
                      : ""
                  }
                />
                <p className="mt-1 text-[11px] text-muted-foreground">
                  비우면 제품명은 1~2회만 자연스럽게 언급됩니다. 입력하면 본문 마지막 줄에 링크가 들어갑니다.
                </p>
              </div>

              {/* 출시 상태 토글 */}
              <div className="mt-3">
                <Label className="text-xs">출시 상태 *</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  <label
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border-2 p-3 transition-colors ${
                      payload.hasReviews ? "border-primary bg-primary/5" : "border-muted bg-card hover:bg-muted/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="has-reviews"
                      checked={payload.hasReviews === true}
                      onChange={() => update("hasReviews", true)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-medium">이미 출시되어 후기가 있어요</div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        실제 사용자 후기를 입력 → 톤 레퍼런스로 활용
                      </p>
                    </div>
                  </label>
                  <label
                    className={`flex cursor-pointer items-start gap-2 rounded-lg border-2 p-3 transition-colors ${
                      payload.hasReviews === false ? "border-primary bg-primary/5" : "border-muted bg-card hover:bg-muted/30"
                    }`}
                  >
                    <input
                      type="radio"
                      name="has-reviews"
                      checked={payload.hasReviews === false}
                      onChange={() => update("hasReviews", false)}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-medium">신규 출시 / 후기 없음</div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        후기 없이도 등록 가능 — 예상 반응으로 대체
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </Section>

            {/* 2열 그리드 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* 좌측 — 제품 자체 정보 (5분할 장점) */}
              <div className="space-y-4">
                <Section
                  title="제품 장점 (5칸으로 나눠 적어요)"
                  hint="1개 이상만 채우면 OK. 채울수록 글이 입체적으로 나옵니다"
                >
                  <div>
                    <Label className="text-xs flex items-center">
                      효능·기대 효과
                      <AiBadge show={aiGuessSet.has("efficacy")} />
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5 mb-1">
                      이 제품 쓰면 뭐가 좋아지나 → 본문 효과 단락에 사용
                    </p>
                    <Textarea
                      rows={3}
                      value={payload.efficacy ?? ""}
                      onChange={(e) => update("efficacy", e.target.value)}
                      placeholder={PH.efficacy}
                      className={aiGuessSet.has("efficacy") ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : ""}
                    />
                  </div>

                  <div>
                    <Label className="text-xs flex items-center">
                      핵심 성분·특징
                      <AiBadge show={aiGuessSet.has("ingredients")} />
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5 mb-1">
                      어떤 성분이 들어있나 → 신뢰도 단락에 사용 · <strong className="text-amber-700 dark:text-amber-300">AI는 추측하지 않음. 직접 적어주세요</strong>
                    </p>
                    <Textarea
                      rows={2}
                      value={payload.ingredients ?? ""}
                      onChange={(e) => update("ingredients", e.target.value)}
                      placeholder={PH.ingredients}
                      className={aiGuessSet.has("ingredients") ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : ""}
                    />
                  </div>

                  <div>
                    <Label className="text-xs flex items-center">
                      사용감 (감각)
                      <AiBadge show={aiGuessSet.has("usability")} />
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5 mb-1">
                      쓸 때의 느낌 → 후기 톤 단락에 사용
                    </p>
                    <Textarea
                      rows={2}
                      value={payload.usability ?? ""}
                      onChange={(e) => update("usability", e.target.value)}
                      placeholder={PH.usability}
                      className={aiGuessSet.has("usability") ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : ""}
                    />
                  </div>

                  <div>
                    <Label className="text-xs flex items-center">
                      차별 포인트
                      <AiBadge show={aiGuessSet.has("differentiator")} />
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5 mb-1">
                      다른 제품과 뭐가 다른가 → 도입부 hook에 사용
                    </p>
                    <Textarea
                      rows={2}
                      value={payload.differentiator ?? ""}
                      onChange={(e) => update("differentiator", e.target.value)}
                      placeholder={PH.differentiator}
                      className={aiGuessSet.has("differentiator") ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : ""}
                    />
                  </div>

                  <div>
                    <Label className="text-xs flex items-center">
                      사용 방법·팁
                      <AiBadge show={aiGuessSet.has("usage")} />
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5 mb-1">
                      어떻게 써야 좋나 → TIP 박스에 사용
                    </p>
                    <Textarea
                      rows={2}
                      value={payload.usage ?? ""}
                      onChange={(e) => update("usage", e.target.value)}
                      placeholder={PH.usage}
                      className={aiGuessSet.has("usage") ? "border-amber-300 bg-amber-50 dark:bg-amber-950/20" : ""}
                    />
                  </div>
                </Section>

                <Section
                  title="이 제품, 한마디로?"
                  hint="이 제품이 어떤 제품인지 한 문장으로 — 글의 톤·전체 방향이 여기서 정해집니다"
                  aiSuggested={aiGuessSet.has("keyInsight")}
                >
                  <Input
                    value={payload.keyInsight}
                    onChange={(e) => update("keyInsight", e.target.value)}
                    placeholder={PH.keyInsight}
                  />
                </Section>
              </div>

              {/* 우측 — 누구에게·어떻게 파나 */}
              <div className="space-y-4">
                <Section
                  title="관련 증상·고민"
                  hint="이 제품이 해결해주는 문제 (한 줄에 하나씩)"
                  aiSuggested={aiGuessSet.has("relatedSymptoms")}
                >
                  <Textarea
                    rows={6}
                    value={linesText.relatedSymptoms}
                    onChange={(e) => updateLines("relatedSymptoms", e.target.value)}
                    placeholder={PH.relatedSymptoms}
                  />
                </Section>

                <Section
                  title="블로그에서 이 제품을 어떻게 부를까요?"
                  hint='블로그에서 이 제품을 처음 운 띄울 때 표현 (한 줄에 하나씩) · 예: "요즘 쓰고 있는 샴푸" / "지인 추천으로 써본"'
                  aiSuggested={aiGuessSet.has("naturalMentionPatterns")}
                >
                  <Textarea
                    rows={4}
                    value={linesText.naturalMentionPatterns}
                    onChange={(e) =>
                      updateLines("naturalMentionPatterns", e.target.value)
                    }
                    placeholder={PH.naturalMentionPatterns}
                  />
                </Section>

                <Section
                  title="이 제품 쓸 때 어떤 느낌인가요?"
                  hint="짧은 키워드·구절로 한 줄에 하나씩 · 글에서 디테일 묘사할 때 참고됩니다"
                  aiSuggested={aiGuessSet.has("sensoryDetails")}
                >
                  <Textarea
                    rows={4}
                    value={linesText.sensoryDetails}
                    onChange={(e) => updateLines("sensoryDetails", e.target.value)}
                    placeholder={PH.sensoryDetails}
                  />
                </Section>

                {/* 후기 — hasReviews 분기 */}
                {payload.hasReviews ? (
                  <Section
                    title="실제 후기 *"
                    hint="후기 톤의 레퍼런스 — 한 줄에 하나씩, 따옴표 없이 자연스러운 문장"
                    aiSuggested={aiGuessSet.has("realReviews")}
                  >
                    <Textarea
                      rows={4}
                      value={linesText.realReviews}
                      onChange={(e) => updateLines("realReviews", e.target.value)}
                      placeholder={PH.realReviews}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      ※ 따옴표는 자동으로 정리됩니다.
                    </p>
                  </Section>
                ) : (
                  <Section
                    title="예상 사용자 반응 (선택)"
                    hint="신상품이라 후기는 없지만, 사용자가 이렇게 반응할 것 같다 — 한 줄에 하나씩"
                    aiSuggested={aiGuessSet.has("expectedReactions")}
                  >
                    <Textarea
                      rows={4}
                      value={linesText.expectedReactions}
                      onChange={(e) =>
                        updateLines("expectedReactions", e.target.value)
                      }
                      placeholder={PH.expectedReactions}
                    />
                    <p className="text-[11px] text-muted-foreground">
                      ※ 비워둬도 등록 가능. 채우면 글의 후기 톤 단락에 활용됩니다.
                    </p>
                  </Section>
                )}

                {/* 사이클 3 — 부작용·안 맞을 수 있는 케이스 (메인 영역, 우측 컬럼 맨 아래) */}
                <Section
                  title="안 맞을 수 있는 케이스 (선택)"
                  hint='"건성 두피에는 다소 가벼울 수 있음" 같은 솔직한 한 줄 → 글의 신뢰도 ↑, 광고스러움 회피'
                  aiSuggested={aiGuessSet.has("precautions")}
                >
                  <Textarea
                    rows={3}
                    value={payload.precautions ?? ""}
                    onChange={(e) => update("precautions", e.target.value)}
                    placeholder={PH.precautions}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    ※ 비워둬도 OK. 채우면 글이 광고처럼 안 보이고 진솔하게 읽힙니다.
                  </p>
                </Section>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? "저장 중..." : isEditMode ? "수정 저장" : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
