"use client";

import { useCallback, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Search, FileText, Hash, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { WizardState, ProductInfo } from "@/types";
import type { ProductSummary, UserAnswers } from "@/lib/prompts/story-skeleton";
import { PRODUCTS } from "@/lib/products";
import { Label } from "@/components/ui/label";

// 후기성 모드는 페르소나 카드를 제거하면서 PERSONA_PRESETS 사용처가 사라짐.
// state.persona 자체는 가이드 폼 질문 1 답으로 자동 저장된다.

interface StepSettingsProps {
  state: WizardState;
  onChange: (partial: Partial<WizardState>) => void;
  /** 사용자가 직접 등록한 제품의 메타데이터. AI 스토리 추천에 제품 카테고리/이름을 같이 넘기기 위해 사용 */
  customProductInfoById?: Record<string, ProductInfo>;
}

export function StepSettings({ state, onChange, customProductInfoById }: StepSettingsProps) {
  // ─────── AI 스토리 추천 (후기성 전용) ───────
  const [isRecommending, setIsRecommending] = useState(false);
  const [overwriteOpen, setOverwriteOpen] = useState(false);
  // 덮어쓰기 confirm 후 어느 액션을 이어갈지 — "auto" = AI 자동 추천, "guide" = 가이드 폼 열기
  const [pendingAction, setPendingAction] = useState<"auto" | "guide" | null>(null);
  // 가이드 폼 다이얼로그
  const [guideOpen, setGuideOpen] = useState(false);
  // 빠른 입력 칩(라디오 형태) — 누르면 guideWhoText에 라벨이 자동 들어감.
  // 활성화 상태는 guideWhoText의 시작 부분과 라벨이 일치하는지로 자동 추론(derived state).
  const [guideWhoText, setGuideWhoText] = useState("");
  const [guideProblem, setGuideProblem] = useState("");
  const [guideRecovered, setGuideRecovered] = useState("");

  const keywordTrimmed = state.mainKeyword.trim();
  const hasExistingTopic = state.topic.trim().length > 0;
  const canRecommend = keywordTrimmed.length > 0 && !isRecommending;

  const runRecommend = useCallback(
    async (userAnswers?: UserAnswers) => {
      if (!keywordTrimmed) return;
      setIsRecommending(true);
      try {
        const products: ProductSummary[] = state.selectedProducts.map((sp) => {
          const seed = PRODUCTS.find((p) => p.id === sp.id);
          const info = customProductInfoById?.[sp.id] ?? seed;
          return {
            name: info?.name ?? sp.id,
            category: info?.category,
            advantages: sp.advantages,
          };
        });
        const res = await fetch("/api/story-skeleton", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ keyword: keywordTrimmed, products, userAnswers }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err?.error || "추천 요청 실패");
        }
        const data = (await res.json()) as { story?: string };
        const story = (data.story ?? "").trim();
        if (!story) throw new Error("AI 응답이 비어 있습니다.");

        // 질문 1 답이 있으면 페르소나에도 자동 저장 (페르소나 카드 제거에 따른 보존)
        const update: Partial<WizardState> = { topic: story };
        if (userAnswers?.who?.trim()) {
          update.persona = userAnswers.who.trim();
        }
        onChange(update);
        toast.success("AI가 스토리를 추천했어요");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "추천 실패. 잠시 후 다시 시도해주세요";
        toast.error(msg);
      } finally {
        setIsRecommending(false);
      }
    },
    [keywordTrimmed, state.selectedProducts, customProductInfoById, onChange]
  );

  const handleAutoRecommendClick = useCallback(() => {
    if (!canRecommend) return;
    if (hasExistingTopic) {
      setPendingAction("auto");
      setOverwriteOpen(true);
      return;
    }
    runRecommend();
  }, [canRecommend, hasExistingTopic, runRecommend]);

  const handleGuideOpenClick = useCallback(() => {
    if (!canRecommend) return;
    if (hasExistingTopic) {
      setPendingAction("guide");
      setOverwriteOpen(true);
      return;
    }
    setGuideOpen(true);
  }, [canRecommend, hasExistingTopic]);

  const handleOverwriteConfirm = useCallback(() => {
    setOverwriteOpen(false);
    if (pendingAction === "auto") {
      runRecommend();
    } else if (pendingAction === "guide") {
      setGuideOpen(true);
    }
    setPendingAction(null);
  }, [pendingAction, runRecommend]);

  const handleGuideSubmit = useCallback(() => {
    const who = guideWhoText.trim();
    const problem = guideProblem.trim();
    const recovered = guideRecovered.trim();
    setGuideOpen(false);
    runRecommend({
      who: who || undefined,
      problemAndAvoidance: problem || undefined,
      recoveredAction: recovered || undefined,
    });
    // 다음 사용을 위해 폼 초기화는 하지 않음 (다시 열면 직전 답이 보이도록)
  }, [guideWhoText, guideProblem, guideRecovered, runRecommend]);

  const isReview = state.postCategory === "review";

  // 선택한 제품 중에 판매 URL이 등록된 게 하나라도 있는지.
  // "제품 링크 넣기"를 활성화할지 결정하는 안전장치 — URL이 없는데 링크 모드를
  // 고르면 정작 본문 끝에 빈 결과가 나옴.
  // v3에서 시드 풀(PRODUCTS)이 비워졌으므로 사용자 등록 메타(customProductInfoById)만 확인.
  const hasAnyProductUrl = useMemo(() => {
    if (!isReview) return false;
    return state.selectedProducts.some((sp) => {
      const info = customProductInfoById?.[sp.id];
      return Boolean(info?.productUrl?.trim());
    });
  }, [isReview, state.selectedProducts, customProductInfoById]);

  const placementMode = state.productPlacementMode ?? "mention";

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold">글 설정</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          키워드, 페르소나, 기타 요구사항을 설정하세요
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column */}
        <div className="space-y-6">
          {isReview ? (
            <>
              {/* 후기성 전용 — 1단계: 메인 키워드 (필수) */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <StepBadge n={1} />
                    <Search className="h-4 w-4" />
                    메인 키워드
                    <Badge variant="destructive" className="text-[10px]">
                      필수
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Input
                    placeholder="예: 탈모샴푸 추천"
                    value={state.mainKeyword}
                    onChange={(e) => onChange({ mainKeyword: e.target.value })}
                  />
                  <p className="mt-2 text-xs font-medium text-destructive">
                    검색 노출(상위노출)에 필수입니다. 비우면 다음 단계로 진행할 수 없습니다.
                  </p>
                </CardContent>
              </Card>

              <p className="-my-2 text-center text-xs text-muted-foreground">
                ↓ 위 키워드를 바탕으로 AI가 스토리를 추천합니다
              </p>

              {/* 후기성 전용 — 2단계: 무엇에 대해 쓰고 싶나요? + AI 추천 버튼 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-sm">
                    <StepBadge n={2} />
                    <FileText className="h-4 w-4" />
                    무엇에 대해 쓰고 싶나요?
                    <Badge variant="secondary" className="text-[10px]">
                      선택
                    </Badge>
                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!canRecommend}
                        onClick={handleAutoRecommendClick}
                        title={
                          keywordTrimmed.length === 0
                            ? "먼저 메인 키워드를 입력해주세요"
                            : undefined
                        }
                        className="gap-1"
                      >
                        {isRecommending ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            <span>추천 받는 중…</span>
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-3.5 w-3.5" />
                            <span className="hidden sm:inline">✨ AI 추천</span>
                            <span className="sm:hidden">AI</span>
                          </>
                        )}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={!canRecommend}
                        onClick={handleGuideOpenClick}
                        title={
                          keywordTrimmed.length === 0
                            ? "먼저 메인 키워드를 입력해주세요"
                            : undefined
                        }
                        className="gap-1"
                      >
                        <span aria-hidden>📝</span>
                        <span className="hidden sm:inline">질문에 답하기</span>
                        <span className="sm:hidden">질문</span>
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="비워두면 키워드만 보고 AI가 알아서 글을 구성합니다.&#10;✨ AI 스토리 추천 버튼을 누르면 키워드에 맞는 경험담 뼈대가 자동으로 채워집니다."
                    value={state.topic}
                    onChange={(e) => onChange({ topic: e.target.value })}
                    className="min-h-[120px]"
                  />
                </CardContent>
              </Card>

              {/* 후기성 전용 — 3단계: 제품 노출 방식 (링크 vs 자연 언급).
                  product-placement.ts 가 placementMode를 받아 프롬프트 가드를
                  두 톤 중 하나로 주입. "mention"은 URL을 컨텍스트에서 아예 빼서
                  LLM이 인지조차 못 하게 막는다. */}
              <ProductPlacementCard
                mode={placementMode}
                onChange={(next) => onChange({ productPlacementMode: next })}
                hasAnyProductUrl={hasAnyProductUrl}
              />
            </>
          ) : (
            <>
              {/* 기본(비-review) — 기존 구조 그대로 유지: topic → mainKeyword */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4" />
                    무엇에 대해 쓰고 싶나요?
                    <Badge variant="secondary" className="text-[10px]">
                      선택
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder={"상세하게 작성할수록 글 품질이 올라갑니다.\n\n비워두면 등록한 브랜드 프로필과 키워드를 기반으로 AI가 알아서 글을 구성합니다."}
                    value={state.topic}
                    onChange={(e) => onChange({ topic: e.target.value })}
                    className="min-h-[100px]"
                  />
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <Search className="h-4 w-4" />
                    메인 키워드
                    <Badge variant="secondary" className="text-[10px]">
                      선택
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Input
                    placeholder="예: 탈모샴푸 추천"
                    value={state.mainKeyword}
                    onChange={(e) => onChange({ mainKeyword: e.target.value })}
                  />
                  <p className="mt-2 text-xs font-medium text-destructive">
                    비워두면 글은 생성되지만, 검색 노출(상위노출)을 원한다면 메인 키워드 입력을 권장합니다.
                  </p>
                </CardContent>
              </Card>
            </>
          )}

          {/* 페르소나 카드는 후기성 모드에서 제거됨 — 가이드 질문 1("누구의 이야기?")이 페르소나 정보 흡수.
              state.persona 자체는 다른 단계(제목·본문 생성 프롬프트)에서 사용되므로 가이드 폼 완료 시 자동 저장됨. */}
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Requirements */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" />
                추가 요구사항
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder={
                  state.postCategory === "seoAeo"
                    ? "글의 목적(예: 신제품 인지도 ↑), 소개할 제품·서비스(예: 미르엔 영양제), 강조할 포인트 등을 자유롭게 적어주세요"
                    : "특별히 강조하고 싶은 내용이나 포함/제외할 내용을 작성하세요"
                }
                value={state.requirements}
                onChange={(e) => onChange({ requirements: e.target.value })}
                className="min-h-[100px]"
              />
            </CardContent>
          </Card>

          {/* Sub Keywords */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Hash className="h-4 w-4" />
                서브 키워드
                <Badge variant="secondary" className="text-[10px]">
                  선택
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="쉼표로 구분 (예: 두피케어, 민감성두피)"
                value={state.subKeywords}
                onChange={(e) => onChange({ subKeywords: e.target.value })}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                본문에 자연스럽게 포함될 서브 키워드를 입력하세요
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* 기존 textarea에 내용 있을 때 덮어쓰기 확인 다이얼로그 */}
      <Dialog
        open={overwriteOpen}
        onOpenChange={(open) => {
          setOverwriteOpen(open);
          if (!open) setPendingAction(null);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>기존 내용을 새 추천으로 바꿀까요?</DialogTitle>
            <DialogDescription>
              이미 작성한 내용이 있습니다. 새 AI 추천을 받으면 기존 내용은 사라집니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setOverwriteOpen(false);
                setPendingAction(null);
              }}
            >
              취소
            </Button>
            <Button onClick={handleOverwriteConfirm}>바꾸기</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 수동 가이드 — 3개 질문 폼 */}
      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>📝 질문에 답하면 AI가 스토리로 다듬어드려요</DialogTitle>
            <DialogDescription>
              모든 칸이 필수는 아니에요. 답한 부분만으로도 AI가 자연스럽게 완성합니다.
              비운 부분은 AI가 알아서 채워줍니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* 질문 1 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                질문 1. 이 스토리는 '누구'의 이야기인가요?
              </Label>
              <p className="text-xs text-muted-foreground">
                아래 칩을 누르면 입력칸에 자동으로 채워져요. 그 뒤에 직업·나이대를 자유롭게 덧붙이세요.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: "내가 직접 겪음" },
                  { label: "가족 (부모/아이)" },
                  { label: "지인/고객" },
                ].map((opt) => {
                  const isActive = guideWhoText.trim().startsWith(opt.label);
                  return (
                    <Button
                      key={opt.label}
                      type="button"
                      variant={isActive ? "default" : "outline"}
                      size="xs"
                      onClick={() => {
                        if (isActive) {
                          // 같은 칩 다시 누르면 라벨 제거 (덧붙인 내용은 살림)
                          const remainder = guideWhoText.trim().slice(opt.label.length).trim();
                          setGuideWhoText(remainder.replace(/^[—\-:,·\s]+/, ""));
                        } else {
                          // 다른 칩 누르면 라벨로 시작하도록 prefix 교체
                          const others = ["내가 직접 겪음", "가족 (부모/아이)", "지인/고객"];
                          let body = guideWhoText.trim();
                          for (const lbl of others) {
                            if (body.startsWith(lbl)) {
                              body = body.slice(lbl.length).trim().replace(/^[—\-:,·\s]+/, "");
                              break;
                            }
                          }
                          setGuideWhoText(body ? `${opt.label} — ${body}` : opt.label);
                        }
                      }}
                    >
                      {opt.label}
                    </Button>
                  );
                })}
              </div>
              <Input
                placeholder="예: 내가 직접 겪음 — 30대 주부 / 가족 (부모/아이) — 50대 어머니"
                value={guideWhoText}
                onChange={(e) => setGuideWhoText(e.target.value)}
              />
            </div>

            {/* 질문 2 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                질문 2. 그 사람이 겪은 '가장 짜증 나는 증상'과 '그 때문에 포기한 행동'은?
              </Label>
              <Textarea
                placeholder="예) 밤마다 온몸이 가려워 긁다 보니 흉터 생기고 밤잠 완전히 설침. 너무 가려워서 외출도 안 함."
                value={guideProblem}
                onChange={(e) => setGuideProblem(e.target.value)}
                className="min-h-[80px]"
              />
            </div>

            {/* 질문 3 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                질문 3. 우리 제품을 쓰고 나서 '그 행동'을 다시 할 수 있게 되었나요?
              </Label>
              <Textarea
                placeholder="예) 한 달째 쓰는데 가려움 싹 줄고 요즘은 매일 꿀잠 자며 살 것 같음."
                value={guideRecovered}
                onChange={(e) => setGuideRecovered(e.target.value)}
                className="min-h-[80px]"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setGuideOpen(false)}>
              취소
            </Button>
            <Button onClick={handleGuideSubmit} disabled={isRecommending}>
              {isRecommending ? (
                <>
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                  생성 중…
                </>
              ) : (
                "✨ AI로 스토리 완성하기"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
      {n}
    </div>
  );
}

// 후기성 전용 — 제품 노출 방식 선택 카드.
//
// 두 모드:
//   - "mention": 본문에 제품명만 1~2회 자연스럽게 언급, 링크/구매유도 없음 (기본값)
//   - "link":    본문 마지막 줄에 판매 URL을 단독으로 박음
//
// 안전장치: 선택한 제품 중 등록된 판매 URL이 하나도 없으면 "링크 넣기"는
// disabled. URL이 없는데 그 모드를 골라도 결과적으로 빈 결과가 나오므로 미리 차단.
function ProductPlacementCard({
  mode,
  onChange,
  hasAnyProductUrl,
}: {
  mode: "link" | "mention";
  onChange: (next: "link" | "mention") => void;
  hasAnyProductUrl: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <StepBadge n={3} />
          <Sparkles className="h-4 w-4" />
          제품 노출 방식
          <Badge variant="secondary" className="text-[10px]">
            선택
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {/* 옵션 1 — 자연 언급 (기본) */}
          <Button
            type="button"
            variant={mode === "mention" ? "default" : "outline"}
            onClick={() => onChange("mention")}
            className="h-auto min-h-[64px] flex-col items-start gap-1 px-3 py-3 text-left whitespace-normal"
          >
            <span className="text-sm font-semibold">제품명만 자연 언급</span>
            <span className="text-[11px] leading-snug opacity-80">
              본문에 제품명을 1~2회 자연스럽게 언급하고 끝. 링크·구매 유도 없음.
            </span>
          </Button>

          {/* 옵션 2 — 링크 넣기 */}
          <Button
            type="button"
            variant={mode === "link" ? "default" : "outline"}
            onClick={() => onChange("link")}
            disabled={!hasAnyProductUrl}
            title={
              !hasAnyProductUrl
                ? "선택한 제품에 등록된 판매 링크가 없어요. '내 정보 → 제품 관리'에서 URL을 등록한 뒤 다시 시도해주세요."
                : undefined
            }
            className="h-auto min-h-[64px] flex-col items-start gap-1 px-3 py-3 text-left whitespace-normal"
          >
            <span className="text-sm font-semibold">제품 링크 넣기</span>
            <span className="text-[11px] leading-snug opacity-80">
              본문 마지막 줄에 판매 링크가 단독으로 들어가요.
            </span>
          </Button>
        </div>

        {!hasAnyProductUrl && (
          <p className="text-[11px] text-muted-foreground">
            선택한 제품에 등록된 판매 링크가 없어 &lsquo;링크 넣기&rsquo;는 비활성 상태예요.
            &lsquo;내 정보 → 제품 관리&rsquo;에서 URL을 채우면 활성됩니다.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
