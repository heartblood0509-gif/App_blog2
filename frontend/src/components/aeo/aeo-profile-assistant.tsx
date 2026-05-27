"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sparkles, Loader2, CheckCircle2, AlertCircle, ArrowRight, Edit3, MessagesSquare, FileText } from "lucide-react";
import { toast } from "sonner";
import type { AeoProfile } from "@/types/aeo";
import {
  FOLLOWUP_QUESTIONS,
  type AeoProfileMissingField,
} from "@/lib/aeo/prompts/profile-assist";
import {
  StepInterview,
  serializeInterviewAnswers,
  getAnsweredFieldIds,
  type InterviewAnswers,
} from "@/components/profile-assistant/step-interview";
import { AEO_INTERVIEW_QUESTIONS } from "./aeo-interview-questions";

interface AeoProfileAssistantProps {
  open: boolean;
  onClose: () => void;
  onSaved: (newProfile: AeoProfile) => void;
  /**
   * 브랜드 → AEO 다리에서 옮겨온 prefill 데이터.
   * 있으면 mode-select 스킵 + 자동으로 인터뷰 모드 진입.
   * 인터뷰에서는 prefill에 답이 있는 질문은 자동 스킵하고 빈 칸만 묻는다.
   */
  prefill?: Partial<Omit<AeoProfile, "id">> | null;
}

/**
 * AEO 프로필 prefill → 인터뷰 답변 형태로 변환.
 * 인터뷰 question.id 기준 매핑. 값이 비어있으면 포함하지 않음.
 */
function prefillToInterviewAnswers(
  prefill: Partial<Omit<AeoProfile, "id">>,
): InterviewAnswers {
  const out: InterviewAnswers = {};
  if (prefill.name?.trim()) {
    out.name = { answered: true, value: prefill.name };
  }
  if (prefill.category?.trim()) {
    out.category = { answered: true, value: prefill.category };
  }
  if (prefill.oneLineIntro?.trim()) {
    out.oneLineIntro = { answered: true, value: prefill.oneLineIntro };
  }
  if (prefill.identity?.experience?.trim()) {
    out.experience = { answered: true, value: prefill.identity.experience };
  }
  if ((prefill.identity?.credentials ?? []).length > 0) {
    out.credentials = { answered: true, value: prefill.identity!.credentials };
  }
  if (prefill.audience?.trim()) {
    out.audience = { answered: true, value: prefill.audience };
  }
  if ((prefill.recommendationCriteria ?? []).length > 0) {
    out.recommendationCriteria = {
      answered: true,
      value: prefill.recommendationCriteria!,
    };
  }
  if ((prefill.trustedSources ?? []).length > 0) {
    out.trustedSources = { answered: true, value: prefill.trustedSources! };
  }
  return out;
}

const EXAMPLE_INPUT = `예시:
저는 미르엔이라는 바디·헤어케어 브랜드를 8년째 운영하고 있어요. 민감성 피부 때문에 시중 제품들이 안 맞아서 직접 안전한 성분으로 만들기 시작했어요. 누적 판매 1만 개 이상, 자체 임상 6개월을 거쳤고 재구매율 35%예요. 식약처 성분 안전성 정보를 자주 참고하고, 민감성 피부도 안심하고 쓸 수 있는 제품만 추천합니다.`;

type AssistResponse = Omit<AeoProfile, "id"> & {
  missingFields?: AeoProfileMissingField[];
};

/** 인터뷰 question.id → AssistResponse 안의 어떤 필드를 사용자가 직접 답했는지 매핑 */
function mapAnsweredInterviewIdsToFieldKeys(
  answeredQuestionIds: ReadonlyArray<string>,
): Set<string> {
  const set = new Set<string>();
  for (const qid of answeredQuestionIds) {
    switch (qid) {
      case "name":
        set.add("name");
        set.add("label");
        break;
      case "category":
        set.add("category");
        break;
      case "oneLineIntro":
        set.add("oneLineIntro");
        break;
      case "experience":
        set.add("identity.experience");
        break;
      case "credentials":
        set.add("identity.credentials");
        break;
      case "audience":
        set.add("audience");
        break;
      case "recommendationCriteria":
        set.add("recommendationCriteria");
        break;
      case "trustedSources":
        set.add("trustedSources");
        break;
    }
  }
  return set;
}

type Stage = "mode-select" | "interview" | "input" | "review";

export function AeoProfileAssistant({ open, onClose, onSaved, prefill }: AeoProfileAssistantProps) {
  const [stage, setStage] = useState<Stage>("interview");

  // prefill 답변 + 인터뷰 질문에서 prefill로 채워진 칸 제외 → 빈 칸만 인터뷰
  const prefillAnswers = useMemo(
    () => (prefill ? prefillToInterviewAnswers(prefill) : ({} as InterviewAnswers)),
    [prefill]
  );
  const remainingQuestions = useMemo(
    () => AEO_INTERVIEW_QUESTIONS.filter((q) => !(q.id in prefillAnswers)),
    [prefillAnswers]
  );
  const [freeformInput, setFreeformInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<AssistResponse | null>(null);
  const [pendingMissing, setPendingMissing] = useState<AeoProfileMissingField[]>([]);
  const [followupAnswer, setFollowupAnswer] = useState("");
  const [saving, setSaving] = useState(false);
  const [userAnsweredFieldKeys, setUserAnsweredFieldKeys] = useState<Set<string> | null>(null);

  const resetAll = useCallback(() => {
    setStage("interview");
    setFreeformInput("");
    setLoading(false);
    setDraft(null);
    setPendingMissing([]);
    setFollowupAnswer("");
    setSaving(false);
    setUserAnsweredFieldKeys(null);
  }, []);

  // prefill 있으면 mode-select 스킵하고 자동으로 인터뷰 모드 진입
  useEffect(() => {
    if (open && prefill && stage === "mode-select") {
      setStage("interview");
    }
    // 모달 닫히면 다음 열림을 위해 초기화
    if (!open) {
      // open=false → resetAll은 외부 onClose 흐름에서 처리
    }
  }, [open, prefill, stage]);

  const handleClose = useCallback(() => {
    resetAll();
    onClose();
  }, [resetAll, onClose]);

  const runAnalyze = useCallback(
    async (text: string, answeredKeys: Set<string> | null) => {
      setLoading(true);
      try {
        const res = await fetch("/api/aeo/profile-assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ freeformInput: text }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "분석 실패");
        }
        const data = (await res.json()) as AssistResponse;
        setDraft(data);
        setPendingMissing(
          answeredKeys === null && Array.isArray(data.missingFields) ? data.missingFields : []
        );
        setUserAnsweredFieldKeys(answeredKeys);
        setStage("review");
        toast.success(
          answeredKeys
            ? "AI가 빈 칸을 채워드렸어요. 노란 배경이 AI가 추정한 부분입니다."
            : "자기소개를 8칸으로 정리했어요. 부족한 칸을 채워봅시다."
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "분석 오류";
        toast.error(msg);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const handleAnalyze = useCallback(async () => {
    if (freeformInput.trim().length < 10) {
      toast.error("자기소개를 최소 10자 이상 입력해주세요.");
      return;
    }
    await runAnalyze(freeformInput, null);
  }, [freeformInput, runAnalyze]);

  const handleInterviewComplete = useCallback(
    async (userAnswers: InterviewAnswers) => {
      // prefill 답 + 사용자 답 합쳐서 LLM에 전달 (빈 칸 추론 정확도 ↑)
      const allAnswers: InterviewAnswers = { ...prefillAnswers, ...userAnswers };
      const text = serializeInterviewAnswers(AEO_INTERVIEW_QUESTIONS, allAnswers);
      const answered = getAnsweredFieldIds(AEO_INTERVIEW_QUESTIONS, allAnswers);
      const answeredFieldKeys = mapAnsweredInterviewIdsToFieldKeys(answered);
      if (!text.trim()) {
        toast.error("최소 1개 이상의 항목에 답해주세요.");
        return;
      }
      await runAnalyze(text, answeredFieldKeys);
    },
    [prefillAnswers, runAnalyze]
  );

  const currentMissing = pendingMissing[0] ?? null;
  const applyFollowupAnswer = useCallback(() => {
    if (!draft || !currentMissing) return;
    const answer = followupAnswer.trim();
    if (!answer) {
      setPendingMissing((prev) => prev.slice(1));
      setFollowupAnswer("");
      return;
    }
    const next: AssistResponse = { ...draft };
    switch (currentMissing) {
      case "name":
        next.name = answer;
        if (!next.label) next.label = answer;
        break;
      case "category":
        next.category = answer;
        break;
      case "oneLineIntro":
        next.oneLineIntro = answer;
        break;
      case "experience":
        next.identity = { ...next.identity, experience: answer };
        break;
      case "credentials":
        next.identity = {
          ...next.identity,
          credentials: answer.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
        };
        break;
      case "audience":
        next.audience = answer;
        break;
      case "recommendationCriteria":
        next.recommendationCriteria = answer
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "trustedSources":
        next.trustedSources = answer
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "forbidden":
        next.forbidden = {
          enabled: true,
          words: answer.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
        };
        break;
    }
    setDraft(next);
    setPendingMissing((prev) => prev.slice(1));
    setFollowupAnswer("");
  }, [draft, currentMissing, followupAnswer]);

  const updateDraft = useCallback(
    <K extends keyof AssistResponse>(key: K, value: AssistResponse[K]) => {
      setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
    },
    []
  );

  const handleSave = useCallback(async () => {
    if (!draft) return;
    if (!draft.label?.trim() || !draft.name?.trim()) {
      toast.error("프로필 이름과 라벨은 필수입니다.");
      return;
    }
    setSaving(true);
    try {
      const { missingFields: _missingFields, ...payload } = draft;
      void _missingFields;
      const res = await fetch("/api/aeo/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "저장 실패");
      }
      const saved = (await res.json()) as AeoProfile;
      toast.success("새 AEO 프로필이 등록되었습니다.");
      onSaved(saved);
      resetAll();
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "저장 실패";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  }, [draft, onSaved, onClose, resetAll]);

  const stats = useMemo(() => {
    if (!draft) return { filled: 0, total: 8 };
    let filled = 0;
    if (draft.name?.trim()) filled++;
    if (draft.category?.trim()) filled++;
    if (draft.oneLineIntro?.trim()) filled++;
    if (draft.identity?.experience?.trim()) filled++;
    if (draft.identity?.credentials?.length) filled++;
    if (draft.audience?.trim()) filled++;
    if (draft.recommendationCriteria?.length) filled++;
    if (draft.trustedSources?.length) filled++;
    return { filled, total: 8 };
  }, [draft]);

  const isAiSuggested = useCallback(
    (fieldKey: string, hasValue: boolean): boolean => {
      if (!userAnsweredFieldKeys) return false;
      if (!hasValue) return false;
      return !userAnsweredFieldKeys.has(fieldKey);
    },
    [userAnsweredFieldKeys]
  );

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-4 !grid-cols-none">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI AEO 프로필 도우미
          </DialogTitle>
          <DialogDescription>
            {stage === "mode-select" && "어떻게 입력하시겠어요? 차근차근 답해도 좋고, 한 번에 적어도 됩니다."}
            {stage === "input" && "본인을 자유롭게 소개해주세요. AI가 8칸으로 자동 정리해드립니다."}
            {stage === "interview" && "한 칸씩 차근차근 답해주세요. 막히면 [잘 모르겠음]을 눌러 다음 단계로 넘어갈 수 있어요."}
            {stage === "review" && `자동으로 ${stats.filled}/${stats.total}칸이 채워졌어요. 부족한 부분만 함께 채워봅시다.`}
          </DialogDescription>
        </DialogHeader>

        {/* 모드 선택 */}
        {stage === "mode-select" && (
          <div className="space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setStage("interview")}
                className="rounded-lg border-2 border-primary/40 bg-primary/5 hover:bg-primary/10 p-5 text-left transition-colors"
              >
                <div className="mb-2 flex items-center gap-2">
                  <MessagesSquare className="h-5 w-5 text-primary" />
                  <h3 className="text-base font-semibold">차근차근 답하기</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  8단계 인터뷰. 각 단계에 미르엔 예시가 있어서 처음이거나 막막할 때 좋아요.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setStage("input")}
                className="rounded-lg border bg-card hover:bg-muted/40 p-5 text-left transition-colors"
              >
                <div className="mb-2 flex items-center gap-2">
                  <FileText className="h-5 w-5 text-foreground" />
                  <h3 className="text-base font-semibold">한 번에 적기</h3>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  자유 텍스트로 한 번에 소개. 빠르게 끝낼 때 좋아요.
                </p>
              </button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>취소</Button>
            </DialogFooter>
          </div>
        )}

        {/* 단계별 인터뷰 — loading이면 분석 로딩 화면, 아니면 인터뷰 화면 */}
        {stage === "interview" && loading && (
          <div className="flex flex-col items-center justify-center gap-3 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p>AI가 빈 칸을 자동으로 채우는 중…</p>
            <p className="text-[11px]">잠시만 기다려주세요 (보통 5~10초)</p>
          </div>
        )}
        {stage === "interview" && !loading && (
          <>
            {prefill && remainingQuestions.length < AEO_INTERVIEW_QUESTIONS.length && (
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-950/20 p-3 text-xs text-emerald-900 dark:text-emerald-200">
                <CheckCircle2 className="mr-1 inline-block h-3 w-3" />
                브랜드 프로필에서 {AEO_INTERVIEW_QUESTIONS.length - remainingQuestions.length}개 칸을 자동으로 채웠어요.
                남은 <strong>{remainingQuestions.length}개</strong> 질문만 답해주세요.
              </div>
            )}
            {remainingQuestions.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  모든 칸이 채워졌어요. AI가 정리 중…
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleInterviewComplete({})}
                  disabled={loading}
                >
                  지금 미리보기로 이동
                </Button>
              </div>
            ) : (
              <StepInterview
                headerLabel="AI AEO 프로필 도우미"
                questions={remainingQuestions}
                onComplete={handleInterviewComplete}
                onCancel={() => onClose()}
              />
            )}
          </>
        )}

        {/* 자유 텍스트 입력 */}
        {stage === "input" && (
          <div className="space-y-3">
            <Textarea
              value={freeformInput}
              onChange={(e) => setFreeformInput(e.target.value)}
              placeholder={EXAMPLE_INPUT}
              rows={8}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              💡 누구신지 / 경력·자격 / 어떤 분들에게 도움 주고 싶은지 / 추천 기준을 자유롭게 적어주세요.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStage("interview")} disabled={loading}>
                이전
              </Button>
              <Button
                onClick={handleAnalyze}
                disabled={loading || freeformInput.trim().length < 10}
                className="gap-1"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {loading ? "분석 중..." : "AI에게 분석시키기"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {/* 미리보기 (직접 수정 가능) */}
        {stage === "review" && draft && (
          <div className="flex flex-col gap-4 flex-1 min-h-0">
            {/* 추가 질문 영역 (자유 모드 한정) */}
            {currentMissing && userAnsweredFieldKeys === null && (
              <div className="shrink-0 rounded-lg border-2 border-primary/40 bg-primary/5 p-4">
                <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
                  <AlertCircle className="h-4 w-4" />
                  AI 추가 질문 — {pendingMissing.length}개 남음
                </div>
                <p className="mb-3 text-sm">{FOLLOWUP_QUESTIONS[currentMissing]}</p>
                <div className="flex gap-2">
                  <Input
                    value={followupAnswer}
                    onChange={(e) => setFollowupAnswer(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        applyFollowupAnswer();
                      }
                    }}
                    placeholder="여기에 답해주세요 (모르겠으면 비워두고 [건너뛰기])"
                    className="flex-1"
                    autoFocus
                  />
                  <Button
                    onClick={applyFollowupAnswer}
                    variant="default"
                    size="sm"
                    className="gap-1 shrink-0"
                  >
                    {followupAnswer.trim() ? "다음" : "건너뛰기"}
                    <ArrowRight className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            )}

            {!currentMissing && (
              <div className="shrink-0 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 p-3 text-sm text-emerald-900 dark:text-emerald-200">
                <CheckCircle2 className="mr-1 inline-block h-4 w-4" />
                {userAnsweredFieldKeys
                  ? "노란 배경 칸은 AI가 추정한 부분입니다. 확인하고 수정 가능합니다."
                  : "모든 추가 질문이 끝났어요. 아래 미리보기에서 직접 수정도 가능합니다."}
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto pr-3">
              <div className="space-y-3 text-sm">
                <PreviewField
                  label="[1] 프로필 이름"
                  value={draft.name}
                  onChange={(v) => updateDraft("name", v)}
                  required
                  aiSuggested={isAiSuggested("name", !!draft.name?.trim())}
                />
                <PreviewField
                  label="[2] 카테고리"
                  value={draft.category}
                  onChange={(v) => updateDraft("category", v)}
                  aiSuggested={isAiSuggested("category", !!draft.category?.trim())}
                />
                <PreviewField
                  label="[3] 한 줄 소개"
                  value={draft.oneLineIntro}
                  onChange={(v) => updateDraft("oneLineIntro", v)}
                  multiline
                  aiSuggested={isAiSuggested("oneLineIntro", !!draft.oneLineIntro?.trim())}
                />
                <PreviewField
                  label="[4-1] 직접 경험"
                  value={draft.identity?.experience ?? ""}
                  onChange={(v) =>
                    updateDraft("identity", { ...draft.identity, experience: v })
                  }
                  aiSuggested={isAiSuggested("identity.experience", !!draft.identity?.experience?.trim())}
                />
                <PreviewListField
                  label="[4-2] 자격·경력"
                  values={draft.identity?.credentials ?? []}
                  onChange={(arr) =>
                    updateDraft("identity", { ...draft.identity, credentials: arr })
                  }
                  aiSuggested={isAiSuggested("identity.credentials", (draft.identity?.credentials ?? []).length > 0)}
                />
                <PreviewField
                  label="[5] 누구에게 도움 주나"
                  value={draft.audience}
                  onChange={(v) => updateDraft("audience", v)}
                  multiline
                  aiSuggested={isAiSuggested("audience", !!draft.audience?.trim())}
                />
                <PreviewListField
                  label="[6] 추천 기준 (위→아래 우선순위)"
                  values={draft.recommendationCriteria ?? []}
                  onChange={(arr) => updateDraft("recommendationCriteria", arr)}
                  aiSuggested={isAiSuggested("recommendationCriteria", (draft.recommendationCriteria ?? []).length > 0)}
                />
                <PreviewListField
                  label="[7] 자주 인용하는 출처"
                  values={draft.trustedSources ?? []}
                  onChange={(arr) => updateDraft("trustedSources", arr)}
                  aiSuggested={isAiSuggested("trustedSources", (draft.trustedSources ?? []).length > 0)}
                />
                <PreviewField
                  label="[8] 절대 쓰지 않는 말 (쉼표로 구분)"
                  value={(draft.forbidden?.words ?? []).join(", ")}
                  onChange={(v) =>
                    updateDraft("forbidden", {
                      enabled: true,
                      words: v.split(",").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                />
              </div>
            </div>

            {/* 저장 중 오버레이 — 클릭 직후 즉시 시각 피드백 */}
            {saving && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 backdrop-blur-sm rounded-lg">
                <div className="flex flex-col items-center gap-2 text-sm font-medium">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  <span>저장 중…</span>
                </div>
              </div>
            )}
            <DialogFooter className="shrink-0 gap-2 sm:gap-2">
              <Button variant="outline" onClick={resetAll} disabled={saving}>
                다시 입력
              </Button>
              <Button onClick={handleSave} disabled={saving} size="default" className="gap-1 min-w-[120px]">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Edit3 className="h-4 w-4" />}
                {saving ? "저장 중..." : "저장하기"}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────
// 미리보기 필드 — 단일 텍스트
// ─────────────────────────────────────────────
function PreviewField({
  label,
  value,
  onChange,
  required,
  multiline,
  aiSuggested,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  multiline?: boolean;
  aiSuggested?: boolean;
}) {
  const empty = !value?.trim();
  const aiCls = aiSuggested ? "bg-amber-50 dark:bg-amber-950/20 border-amber-300" : "";
  return (
    <div className="space-y-1">
      <Label className="text-xs flex items-center gap-1">
        {empty ? (
          <AlertCircle className="h-3 w-3 text-amber-500" />
        ) : (
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        )}
        {label}
        {required && <span className="text-destructive">*</span>}
        {aiSuggested && (
          <span className="ml-1 inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:text-amber-100">
            <Sparkles className="h-2.5 w-2.5" />
            AI 추정
          </span>
        )}
      </Label>
      {multiline ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className={empty ? "border-amber-300" : aiCls}
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={empty ? "border-amber-300" : aiCls}
        />
      )}
    </div>
  );
}

function PreviewListField({
  label,
  values,
  onChange,
  aiSuggested,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
  aiSuggested?: boolean;
}) {
  const serializedValues = values.join("\n");
  const [text, setText] = useState(serializedValues);
  const empty = values.length === 0;
  const aiCls = aiSuggested ? "bg-amber-50 dark:bg-amber-950/20 border-amber-300" : "";

  return (
    <div className="space-y-1">
      <Label className="text-xs flex items-center gap-1">
        {empty ? (
          <AlertCircle className="h-3 w-3 text-amber-500" />
        ) : (
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        )}
        {label}
        {aiSuggested && (
          <span className="ml-1 inline-flex items-center gap-1 rounded bg-amber-100 dark:bg-amber-900/40 px-1.5 py-0.5 text-[10px] font-medium text-amber-900 dark:text-amber-100">
            <Sparkles className="h-2.5 w-2.5" />
            AI 추정
          </span>
        )}
      </Label>
      <Textarea
        value={text}
        onChange={(e) => {
          const nextText = e.target.value;
          const nextValues = nextText.split("\n").map((s) => s.trim()).filter(Boolean);
          setText(nextText);
          onChange(nextValues);
        }}
        rows={Math.min(Math.max(text.split("\n").length, 2), 6)}
        placeholder="한 줄에 하나씩"
        className={empty ? "border-amber-300" : aiCls}
      />
    </div>
  );
}
