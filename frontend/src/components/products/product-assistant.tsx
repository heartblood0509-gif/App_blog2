"use client";

import { useCallback, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import type { UserProduct } from "@/types";
import {
  StepInterview,
  serializeInterviewAnswers,
  type InterviewAnswers,
} from "@/components/profile-assistant/step-interview";
import { getProductInterviewQuestions } from "./product-interview-questions";

interface ProductAssistantProps {
  open: boolean;
  onClose: () => void;
  /**
   * AI가 채운 prefill을 부모에게 넘김.
   * 부모는 이걸 받아서 ProductForm을 prefill 모드로 띄움 (사용자가 확인·수정 후 등록).
   *
   * aiGuessFields: AI가 도메인 추론으로 채운 필드 이름 배열.
   * UI에서 해당 칸을 노란 배경 + "AI 추정" 배지로 표시 (사용자 환각 검토용).
   */
  onPrefillReady: (
    prefill: Partial<Omit<UserProduct, "id">>,
    aiGuessFields: string[]
  ) => void;
}

/** AI assist 응답 형태 */
interface AssistResponse {
  name?: string;
  category?: string;
  keyInsight?: string;
  efficacy?: string;
  ingredients?: string;
  usability?: string;
  differentiator?: string;
  usage?: string;
  realReviews?: string[];
  expectedReactions?: string[];
  relatedSymptoms?: string[];
  naturalMentionPatterns?: string[];
  sensoryDetails?: string[];
  // 사이클 2/3 — precautions만 유지
  precautions?: string;
  // 메타
  missingFields?: string[];
  /** AI가 도메인 추론으로 채운 필드 이름 (사이클 2 환각 가드) */
  aiGuessFields?: string[];
}

/**
 * 사이클 4: 두 단계로 분리.
 * 1) released-select — 출시 상태 라디오 선택 (이미/신규)
 * 2) interview      — StepInterview로 10개 질문 1개씩
 *
 * 자유 텍스트 모드는 통째 제거 (사용자 결정).
 */
type Stage = "released-select" | "interview";

export function ProductAssistant({
  open,
  onClose,
  onPrefillReady,
}: ProductAssistantProps) {
  const [stage, setStage] = useState<Stage>("released-select");
  const [hasReviews, setHasReviews] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);

  const resetAll = useCallback(() => {
    setStage("released-select");
    setHasReviews(null);
    setLoading(false);
  }, []);

  const handleClose = useCallback(() => {
    if (loading) return;
    resetAll();
    onClose();
  }, [loading, resetAll, onClose]);

  /** 출시 상태 선택 화면에서 [다음] 누르면 인터뷰 시작 */
  const handleReleasedNext = useCallback(() => {
    if (hasReviews === null) {
      toast.error("출시 상태를 선택해주세요.");
      return;
    }
    setStage("interview");
  }, [hasReviews]);

  /**
   * 인터뷰 완료 콜백.
   * 답변을 자유 텍스트로 직렬화 → 기존 /api/products/assist 호출 → ProductForm prefill 전달.
   */
  const handleInterviewComplete = useCallback(
    async (answers: InterviewAnswers) => {
      if (hasReviews === null) return; // 방어 (released-select 거쳤으면 null 아님)

      const questions = getProductInterviewQuestions(hasReviews);
      const freeformInput = serializeInterviewAnswers(questions, answers);

      if (!freeformInput.trim()) {
        toast.error("최소 1개 이상의 질문에 답해주세요.");
        return;
      }

      setLoading(true);
      try {
        const res = await fetch("/api/products/assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ freeformInput, hasReviews }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "분석 실패");
        }
        const data = (await res.json()) as AssistResponse;

        // AssistResponse → UserProduct prefill 변환
        const prefill: Partial<Omit<UserProduct, "id">> = {
          name: data.name ?? "",
          category: data.category ?? "",
          keyInsight: data.keyInsight ?? "",
          efficacy: data.efficacy ?? "",
          ingredients: data.ingredients ?? "",
          usability: data.usability ?? "",
          differentiator: data.differentiator ?? "",
          usage: data.usage ?? "",
          relatedSymptoms: data.relatedSymptoms ?? [],
          naturalMentionPatterns: data.naturalMentionPatterns ?? [],
          sensoryDetails: data.sensoryDetails ?? [],
          realReviews: data.realReviews ?? [],
          expectedReactions: data.expectedReactions ?? [],
          hasReviews,
          defaultAdvantages: "", // 5분할로 자동 합쳐짐 (폼 저장 시점에 composeAdvantagesNatural)
          // 사이클 2/3 — precautions만 유지
          precautions: data.precautions ?? "",
        };

        const aiGuessFields = data.aiGuessFields ?? [];
        const missingCount = data.missingFields?.length ?? 0;
        if (missingCount > 0) {
          toast.success(
            `AI가 양식을 채웠어요. ${missingCount}개 칸은 단서가 부족해 비어있으니 확인해주세요.`
          );
        } else if (aiGuessFields.length > 0) {
          toast.success(
            `AI가 양식을 채웠어요. 노란 배경 칸은 AI 추정이니 실제 제품과 맞는지 확인해주세요.`
          );
        } else {
          toast.success("AI가 양식을 모두 채웠어요. 확인 후 저장해주세요.");
        }

        onPrefillReady(prefill, aiGuessFields);
        resetAll();
        onClose();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "분석 오류";
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    [hasReviews, onPrefillReady, onClose, resetAll]
  );

  /** 인터뷰 단계에서 [취소] → 출시 상태 선택으로 돌아가기 */
  const handleInterviewCancel = useCallback(() => {
    setStage("released-select");
  }, []);

  const questions =
    hasReviews !== null ? getProductInterviewQuestions(hasReviews) : [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-4 !grid-cols-none">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI 제품 프로필 도우미
          </DialogTitle>
          <DialogDescription>
            {stage === "released-select" &&
              "먼저 이 제품이 어떤 상태인지 알려주세요. 그 다음 한 칸씩 차근차근 물어봅니다."}
            {stage === "interview" &&
              "한 칸씩 답해주세요. 막히면 [잘 모르겠음 → 다음]을 눌러 건너뛸 수 있어요."}
          </DialogDescription>
        </DialogHeader>

        {/* 1단계 — 출시 상태 선택 */}
        {stage === "released-select" && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs">출시 상태</Label>
              <div className="mt-1.5 grid grid-cols-1 md:grid-cols-2 gap-2">
                <label
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border-2 p-4 transition-colors ${
                    hasReviews === true
                      ? "border-primary bg-primary/5"
                      : "border-muted bg-card hover:bg-muted/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="assistant-has-reviews"
                    checked={hasReviews === true}
                    onChange={() => setHasReviews(true)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium">이미 출시되어 후기가 있어요</div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      실제 고객 후기를 묻습니다 → 글의 후기 톤 레퍼런스
                    </p>
                  </div>
                </label>

                <label
                  className={`flex cursor-pointer items-start gap-2 rounded-lg border-2 p-4 transition-colors ${
                    hasReviews === false
                      ? "border-primary bg-primary/5"
                      : "border-muted bg-card hover:bg-muted/30"
                  }`}
                >
                  <input
                    type="radio"
                    name="assistant-has-reviews"
                    checked={hasReviews === false}
                    onChange={() => setHasReviews(false)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium">신규 출시 / 후기 없음</div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      예상 사용자 반응을 묻습니다 → 광고스럽지 않은 추정 톤으로
                    </p>
                  </div>
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>
                취소
              </Button>
              <Button
                onClick={handleReleasedNext}
                disabled={hasReviews === null}
                className="gap-1"
              >
                다음 <ArrowRight className="h-3 w-3" />
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* 2단계 — 인터뷰 (10개 질문 1개씩) */}
        {stage === "interview" && (
          <>
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p>AI가 양식을 채우는 중…</p>
                <p className="text-[11px]">잠시만 기다려주세요 (보통 5~10초)</p>
              </div>
            ) : (
              <StepInterview
                headerLabel="AI 제품 프로필 도우미"
                questions={questions}
                onComplete={handleInterviewComplete}
                onCancel={handleInterviewCancel}
              />
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
