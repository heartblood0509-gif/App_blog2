"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sparkles,
  BookOpen,
  Award,
  ShoppingBag,
  Check,
  Loader2,
  Search,
  Pencil,
  Save,
  X,
  ArrowRight,
  BookmarkPlus,
  Lock,
  Eye,
} from "lucide-react";
import { toast } from "sonner";
import type {
  BrandTemplateId,
  BrandInfoVariantId,
  BrandIntroVariantId,
  BrandValueProofVariantId,
  BrandDetailVariantId,
  AnalysisRecord,
} from "@/types/brand";
import { INFO_VARIANTS } from "@/lib/brand/prompts/templates/info";
import { INTRO_VARIANTS } from "@/lib/brand/prompts/templates/intro";
import { VALUE_PROOF_VARIANTS } from "@/lib/brand/prompts/templates/value-proof";
import { DETAIL_VARIANTS } from "@/lib/brand/prompts/templates/detail";
import { extractFlowFromMarkdownBody } from "@/lib/analysis-parser";
import { AnalysisLibrarySection } from "./analysis-library-section";
import { AnalysisRecordForm } from "./analysis-record-form";

type TemplateCard = {
  id: BrandTemplateId;
  name: string;
  description: string;
  icon: React.ElementType;
  enabled: boolean;
};

const TEMPLATES: TemplateCard[] = [
  { id: "intro", name: "소개글", description: "나 또는 내 브랜드를 소개하고 신뢰를 쌓는 글", icon: Sparkles, enabled: true },
  { id: "info", name: "정보성글", description: "유입을 위한 정보성 글 (브랜드 추구방향과 일치)", icon: BookOpen, enabled: true },
  { id: "value-proof", name: "가치입증글", description: "권위·수치·결과로 신뢰를 입증하는 글", icon: Award, enabled: true },
  { id: "detail", name: "상세페이지글", description: "구매 전환 직전 단계의 글", icon: ShoppingBag, enabled: true },
];

interface BrandTemplateSectionProps {
  selectedTemplate: BrandTemplateId | null;
  selectedInfoVariant: BrandInfoVariantId | null;
  /** Step B에서 활성 — 소개글 변형 */
  selectedIntroVariant: BrandIntroVariantId | null;
  /** Step C에서 활성 — 가치입증글 변형 */
  selectedValueProofVariant: BrandValueProofVariantId | null;
  /** Step C에서 활성 — 상세페이지글 변형 */
  selectedDetailVariant: BrandDetailVariantId | null;
  onTemplateChange: (template: BrandTemplateId) => void;
  onInfoVariantChange: (variant: BrandInfoVariantId) => void;
  onIntroVariantChange: (variant: BrandIntroVariantId) => void;
  onValueProofVariantChange: (variant: BrandValueProofVariantId) => void;
  onDetailVariantChange: (variant: BrandDetailVariantId) => void;
  // custom 전용 — 견본 글 입력 영역 (4개 템플릿 공통)
  referenceUrl: string;
  referenceText: string;
  referenceAnalysis: string;
  isAnalyzing: boolean;
  onReferenceUrlChange: (url: string) => void;
  onReferenceTextChange: (text: string) => void;
  onReferenceAnalysisChange: (value: string) => void;
  onAnalyzeUrl: () => void;
  onAnalyzeText: () => void;
  // structure-based 전용 — 보관함 분석 선택 (4개 템플릿 공통)
  selectedAnalysisRecordId: string | null;
  onAnalysisRecordSelect: (recordId: string) => void;
}

export function BrandTemplateSection({
  selectedTemplate,
  selectedInfoVariant,
  selectedIntroVariant,
  selectedValueProofVariant,
  selectedDetailVariant,
  onTemplateChange,
  onInfoVariantChange,
  onIntroVariantChange,
  onValueProofVariantChange,
  onDetailVariantChange,
  referenceUrl,
  referenceText,
  referenceAnalysis,
  isAnalyzing,
  onReferenceUrlChange,
  onReferenceTextChange,
  onReferenceAnalysisChange,
  onAnalyzeUrl,
  onAnalyzeText,
  selectedAnalysisRecordId,
  onAnalysisRecordSelect,
}: BrandTemplateSectionProps) {
  // 입력 모드 탭 (UI 로컬 상태)
  const [inputMode, setInputMode] = useState<"url" | "text">("url");
  // 분석 결과 편집 모드
  const [analysisEditing, setAnalysisEditing] = useState(false);
  const [analysisDraft, setAnalysisDraft] = useState("");
  // 보관함 저장 진행 상태
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  // 내장 카드 (보관함 BUILTIN_SEEDS) — 서사 구조 템플릿 영역에 동적 렌더링
  const [builtinRecords, setBuiltinRecords] = useState<AnalysisRecord[]>([]);
  // "보기" 모달용 — 내장 분석 마크다운 readonly 표시
  const [viewingRecord, setViewingRecord] = useState<AnalysisRecord | null>(null);

  // 4개 템플릿 공통 — custom 모드 선택 여부 (견본 글 입력 영역 노출 조건)
  const isCustomSelected =
    selectedInfoVariant === "info-custom" ||
    selectedIntroVariant === "intro-custom" ||
    selectedValueProofVariant === "value-proof-custom" ||
    selectedDetailVariant === "detail-custom";

  // 템플릿 선택 시 해당 scope의 내장 분석 카드 fetch (4개 템플릿 공통)
  // Step A: info만 활성, 나머지는 Step B/C에서 카드 추가 시 자동으로 보임
  useEffect(() => {
    if (!selectedTemplate) return;
    let cancelled = false;
    const url = `/api/analysis/records?scope=${encodeURIComponent(selectedTemplate)}`;
    fetch(url, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : [];
        setBuiltinRecords(list.filter((r: AnalysisRecord) => r.isBuiltin));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedTemplate]);

  // 내장 카드 1클릭 → variant + recordId 동시 설정 (selectedTemplate에 따라 다른 variant 호출)
  const handleBuiltinCardClick = useCallback(
    (recordId: string) => {
      if (selectedTemplate === "intro") {
        onIntroVariantChange("intro-structure-based");
      } else if (selectedTemplate === "value-proof") {
        onValueProofVariantChange("value-proof-structure-based");
      } else if (selectedTemplate === "detail") {
        onDetailVariantChange("detail-structure-based");
      } else {
        onInfoVariantChange("info-structure-based");
      }
      onAnalysisRecordSelect(recordId);
    },
    [
      selectedTemplate,
      onInfoVariantChange,
      onIntroVariantChange,
      onValueProofVariantChange,
      onDetailVariantChange,
      onAnalysisRecordSelect,
    ]
  );

  const handleSaveToLibrary = async () => {
    if (!referenceAnalysis.trim()) return;
    const defaultLabel = `직접 레퍼런스 ${new Date().toLocaleString("ko-KR", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
    const label = window.prompt("보관함에 저장할 이름을 입력하세요", defaultLabel);
    if (!label) return;
    setSavingToLibrary(true);
    try {
      const res = await fetch("/api/analysis/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          sourceType: "user",
          sourceUrl: referenceUrl.trim() || undefined,
          analysis: referenceAnalysis.trim(),
          flow: extractFlowFromMarkdownBody(referenceAnalysis),
          excerptPattern: "",
          // 현재 선택된 템플릿 scope로 저장 — 다른 템플릿 보관함과 분리
          templateScope: selectedTemplate ?? "info",
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "저장 실패");
      }
      toast.success("보관함에 저장되었습니다.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "저장 실패";
      toast.error(msg);
    } finally {
      setSavingToLibrary(false);
    }
  };

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-xl font-semibold">글 템플릿</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          어떤 종류의 브랜드 글을 만들지 선택하세요
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {TEMPLATES.map((tpl) => {
          const selected = selectedTemplate === tpl.id;
          const Icon = tpl.icon;
          const disabled = !tpl.enabled;

          return (
            <Card
              key={tpl.id}
              onClick={disabled ? undefined : () => onTemplateChange(tpl.id)}
              aria-disabled={disabled}
              className={`transition-all duration-200 ${
                disabled
                  ? "cursor-not-allowed opacity-50 grayscale"
                  : selected
                    ? "cursor-pointer ring-2 ring-primary bg-primary/5"
                    : "cursor-pointer hover:ring-1 hover:ring-muted-foreground/30"
              }`}
            >
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{tpl.name}</CardTitle>
                  </div>
                  {disabled && (
                    <Badge variant="secondary" className="text-[10px]">
                      준비 중
                    </Badge>
                  )}
                  {!disabled && selected && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-primary"
                    >
                      <Check className="h-3.5 w-3.5 text-primary-foreground" />
                    </motion.div>
                  )}
                </div>
                <CardDescription className="text-xs leading-relaxed">
                  {tpl.description}
                </CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {(selectedTemplate === "info" ||
        selectedTemplate === "intro" ||
        selectedTemplate === "value-proof" ||
        selectedTemplate === "detail") && (
        <motion.div
          key={`${selectedTemplate}-variants`}
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.2 }}
          className="mt-6 space-y-4 overflow-hidden"
        >
          <div>
            <h3 className="text-base font-semibold">서사 구조 템플릿</h3>
            <p className="mt-0.5 text-sm text-muted-foreground">
              글의 전체적인 흐름을 선택하세요
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
            {/* 내장 카드들 — selectedTemplate scope의 builtin records 자동 렌더링 */}
            {builtinRecords.map((r) => {
              // structure-based 변형 선택 여부 — selectedTemplate에 따라 다른 variant 비교
              const structureBasedSelected =
                selectedTemplate === "intro"
                  ? selectedIntroVariant === "intro-structure-based"
                  : selectedTemplate === "value-proof"
                    ? selectedValueProofVariant === "value-proof-structure-based"
                    : selectedTemplate === "detail"
                      ? selectedDetailVariant === "detail-structure-based"
                      : selectedInfoVariant === "info-structure-based";
              const isSel = structureBasedSelected && selectedAnalysisRecordId === r.id;
              const displayFlow =
                r.flow && r.flow.length > 0 ? r.flow : extractFlowFromMarkdownBody(r.analysis);
              return (
                <Card
                  key={r.id}
                  className={`cursor-pointer transition-all duration-200 ${
                    isSel
                      ? "ring-2 ring-primary bg-primary/5"
                      : "hover:ring-1 hover:ring-muted-foreground/30"
                  }`}
                  onClick={() => handleBuiltinCardClick(r.id)}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Lock className="h-5 w-5 text-primary" />
                        <CardTitle className="text-base">{r.label}</CardTitle>
                        <Badge variant="secondary" className="text-[10px]">
                          내장
                        </Badge>
                      </div>
                      {isSel && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-primary"
                        >
                          <Check className="h-3.5 w-3.5 text-primary-foreground" />
                        </motion.div>
                      )}
                    </div>
                    {r.excerptPattern && (
                      <CardDescription className="text-xs leading-relaxed">
                        {r.excerptPattern}
                      </CardDescription>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {displayFlow.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1">
                        {displayFlow.map((step, i) => (
                          <span
                            key={`${r.id}-${i}-${step}`}
                            className="flex items-center gap-1"
                          >
                            <span
                              className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                                isSel
                                  ? "bg-primary/15 text-primary"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {step}
                            </span>
                            {i < displayFlow.length - 1 && (
                              <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                            )}
                          </span>
                        ))}
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewingRecord(r);
                      }}
                    >
                      <Eye className="mr-1 h-3 w-3" />
                      보기
                    </Button>
                  </CardContent>
                </Card>
              );
            })}

            {/* 정적 카드 — selectedTemplate에 따라 해당 VARIANTS 목록 사용 */}
            {(selectedTemplate === "intro"
              ? INTRO_VARIANTS
              : selectedTemplate === "value-proof"
                ? VALUE_PROOF_VARIANTS
                : selectedTemplate === "detail"
                  ? DETAIL_VARIANTS
                  : INFO_VARIANTS
            ).map((variant) => {
              const isSel =
                selectedTemplate === "intro"
                  ? selectedIntroVariant === variant.id
                  : selectedTemplate === "value-proof"
                    ? selectedValueProofVariant === variant.id
                    : selectedTemplate === "detail"
                      ? selectedDetailVariant === variant.id
                      : selectedInfoVariant === variant.id;
              const Icon = variant.icon;
              const handleClick = () => {
                if (selectedTemplate === "intro") {
                  onIntroVariantChange(variant.id as import("@/types/brand").BrandIntroVariantId);
                } else if (selectedTemplate === "value-proof") {
                  onValueProofVariantChange(
                    variant.id as import("@/types/brand").BrandValueProofVariantId
                  );
                } else if (selectedTemplate === "detail") {
                  onDetailVariantChange(
                    variant.id as import("@/types/brand").BrandDetailVariantId
                  );
                } else {
                  onInfoVariantChange(variant.id as import("@/types/brand").BrandInfoVariantId);
                }
              };

              return (
                <Card
                  key={variant.id}
                  className={`cursor-pointer transition-all duration-200 ${
                    isSel
                      ? "ring-2 ring-primary bg-primary/5"
                      : "hover:ring-1 hover:ring-muted-foreground/30"
                  }`}
                  onClick={handleClick}
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-primary" />
                        <CardTitle className="text-base">{variant.name}</CardTitle>
                        {"isFinale" in variant && variant.isFinale && (
                          <Badge variant="secondary" className="text-[10px]">
                            ⭐ 최종장
                          </Badge>
                        )}
                      </div>
                      {isSel && (
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          className="flex h-6 w-6 items-center justify-center rounded-full bg-primary"
                        >
                          <Check className="h-3.5 w-3.5 text-primary-foreground" />
                        </motion.div>
                      )}
                    </div>
                    <CardDescription className="text-xs leading-relaxed">
                      {variant.description}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center gap-1">
                      {variant.flow.map((step, i) => (
                        <span key={step} className="flex items-center gap-1">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                              isSel
                                ? "bg-primary/15 text-primary"
                                : "bg-muted text-muted-foreground"
                            }`}
                          >
                            {step}
                          </span>
                          {i < variant.flow.length - 1 && (
                            <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                          )}
                        </span>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {isCustomSelected && (
            <motion.div
              key="info-custom-input"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              transition={{ duration: 0.2 }}
              className="space-y-4 overflow-hidden rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4"
            >
              {/* 탭 전환 */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setInputMode("url")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    inputMode === "url"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  URL로 가져오기
                </button>
                <button
                  type="button"
                  onClick={() => setInputMode("text")}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                    inputMode === "text"
                      ? "bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  }`}
                >
                  본문 직접 붙여넣기
                </button>
              </div>

              {inputMode === "url" ? (
                <div className="space-y-2">
                  <label className="text-xs font-medium">참고할 블로그 글 URL</label>
                  <div className="flex gap-2">
                    <Input
                      type="url"
                      placeholder="https://blog.naver.com/..."
                      value={referenceUrl}
                      onChange={(e) => onReferenceUrlChange(e.target.value)}
                      disabled={isAnalyzing}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      onClick={onAnalyzeUrl}
                      disabled={isAnalyzing || referenceUrl.trim().length === 0}
                      size="sm"
                    >
                      {isAnalyzing ? (
                        <>
                          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          분석 중
                        </>
                      ) : (
                        <>
                          <Search className="mr-1.5 h-3.5 w-3.5" />
                          서사 구조 분석
                        </>
                      )}
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    네이버 블로그 URL만 자동 크롤링됩니다. 다른 플랫폼은 본문 직접 붙여넣기를 이용해주세요.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs font-medium">참고할 글 본문</label>
                  <Textarea
                    placeholder="평소 마음에 드는 블로그 글의 본문을 그대로 붙여넣으세요. AI가 톤과 구조를 학습합니다."
                    value={referenceText}
                    onChange={(e) => onReferenceTextChange(e.target.value)}
                    disabled={isAnalyzing}
                    className="min-h-[160px] text-xs"
                  />
                  <Button
                    type="button"
                    onClick={onAnalyzeText}
                    disabled={isAnalyzing || referenceText.trim().length < 100}
                    size="sm"
                  >
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                        분석 중
                      </>
                    ) : (
                      <>
                        <Search className="mr-1.5 h-3.5 w-3.5" />
                        서사 구조 분석
                      </>
                    )}
                  </Button>
                  {referenceText.trim().length > 0 &&
                    referenceText.trim().length < 100 && (
                      <p className="text-[11px] text-amber-600">
                        본문이 너무 짧습니다 (최소 100자 이상 권장).
                      </p>
                    )}
                </div>
              )}

              {/* 분석 결과 */}
              {referenceAnalysis.trim().length > 0 && (
                <div className="space-y-2 rounded-md border bg-background p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-medium">📋 서사 구조 분석 결과</p>
                    {!analysisEditing ? (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={handleSaveToLibrary}
                          disabled={savingToLibrary}
                        >
                          {savingToLibrary ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : (
                            <BookmarkPlus className="mr-1 h-3 w-3" />
                          )}
                          보관함에 저장
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            setAnalysisDraft(referenceAnalysis);
                            setAnalysisEditing(true);
                          }}
                        >
                          <Pencil className="mr-1 h-3 w-3" />
                          편집
                        </Button>
                      </div>
                    ) : (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => {
                            onReferenceAnalysisChange(analysisDraft);
                            setAnalysisEditing(false);
                          }}
                        >
                          <Save className="mr-1 h-3 w-3" />
                          저장
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 text-xs"
                          onClick={() => setAnalysisEditing(false)}
                        >
                          <X className="mr-1 h-3 w-3" />
                          취소
                        </Button>
                      </div>
                    )}
                  </div>
                  {analysisEditing ? (
                    <Textarea
                      value={analysisDraft}
                      onChange={(e) => setAnalysisDraft(e.target.value)}
                      className="min-h-[200px] text-xs"
                    />
                  ) : (
                    <ScrollArea className="h-48 w-full">
                      <div className="prose prose-sm max-w-none text-xs">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {referenceAnalysis}
                        </ReactMarkdown>
                      </div>
                    </ScrollArea>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {/* 서사 구조 보관함 — 사용자 분석 라이브러리. Step B에서는 정보성글에서만 노출 (intro의 사용자 분석은 향후 작업). */}
          {selectedTemplate === "info" && (
            <div className="mt-2 rounded-lg border border-dashed border-muted-foreground/30 bg-muted/30 p-4">
              <AnalysisLibrarySection
                selectedRecordId={
                  selectedInfoVariant === "info-structure-based"
                    ? selectedAnalysisRecordId
                    : null
                }
                onSelect={(id) => {
                  onInfoVariantChange("info-structure-based");
                  onAnalysisRecordSelect(id);
                }}
              />
            </div>
          )}
        </motion.div>
      )}

      {/* 내장 분석 "보기" 모달 (readonly) */}
      <AnalysisRecordForm
        open={viewingRecord !== null}
        initial={viewingRecord}
        onClose={() => setViewingRecord(null)}
        onSave={async () => {
          // builtin은 readOnly라 호출되지 않지만 prop은 필수
        }}
      />
    </section>
  );
}
