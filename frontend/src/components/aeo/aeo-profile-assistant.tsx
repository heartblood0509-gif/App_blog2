"use client";

import { useCallback, useMemo, useState } from "react";
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
import { Sparkles, Loader2, CheckCircle2, AlertCircle, ArrowRight, Edit3 } from "lucide-react";
import { toast } from "sonner";
import type { AeoProfile } from "@/types/aeo";
import {
  FOLLOWUP_QUESTIONS,
  type AeoProfileMissingField,
} from "@/lib/aeo/prompts/profile-assist";

interface AeoProfileAssistantProps {
  open: boolean;
  onClose: () => void;
  /** 저장 성공 시 호출 — 부모가 목록 갱신 + 새 프로필 자동 선택 */
  onSaved: (newProfile: AeoProfile) => void;
}

const EXAMPLE_INPUT = `예시:
저는 약사 8년차이고 두 아이 엄마예요. 산부인과 인근 약국에서 5년 근무하면서 임산부·수유부 안전 성분 상담을 200건 넘게 했어요. 식약처 가이드를 자주 참고하고, 임산부에게 정말 안전한 제품만 추천하려고 해요. 성분 안전성을 가장 중요하게 봅니다.`;

/**
 * 도우미 응답 형태 — profile-assist API가 반환하는 JSON.
 * (Omit<AeoProfile, "id"> 와 호환되되 missingFields 부가).
 */
type AssistResponse = Omit<AeoProfile, "id"> & {
  missingFields?: AeoProfileMissingField[];
};

export function AeoProfileAssistant({ open, onClose, onSaved }: AeoProfileAssistantProps) {
  type Stage = "input" | "review";
  const [stage, setStage] = useState<Stage>("input");
  const [freeformInput, setFreeformInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<AssistResponse | null>(null);
  // 추가 질문 중인 필드 (배열의 첫 번째 항목부터 처리)
  const [pendingMissing, setPendingMissing] = useState<AeoProfileMissingField[]>([]);
  const [followupAnswer, setFollowupAnswer] = useState("");
  const [saving, setSaving] = useState(false);

  const resetAll = useCallback(() => {
    setStage("input");
    setFreeformInput("");
    setLoading(false);
    setDraft(null);
    setPendingMissing([]);
    setFollowupAnswer("");
    setSaving(false);
  }, []);

  const handleClose = useCallback(() => {
    resetAll();
    onClose();
  }, [resetAll, onClose]);

  const handleAnalyze = useCallback(async () => {
    if (freeformInput.trim().length < 10) {
      toast.error("자기소개를 최소 10자 이상 입력해주세요.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/aeo/profile-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ freeformInput }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "분석 실패");
      }
      const data = (await res.json()) as AssistResponse;
      setDraft(data);
      setPendingMissing(Array.isArray(data.missingFields) ? data.missingFields : []);
      setStage("review");
      toast.success("자기소개를 8칸으로 정리했어요. 부족한 칸을 채워봅시다.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "분석 오류";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [freeformInput]);

  // 추가질문 답변 → 해당 필드에 채워넣기 (단순 텍스트 매핑)
  const currentMissing = pendingMissing[0] ?? null;
  const applyFollowupAnswer = useCallback(() => {
    if (!draft || !currentMissing) return;
    const answer = followupAnswer.trim();
    if (!answer) {
      // 빈 답이면 그냥 스킵 (사용자가 모르거나 안 적기로 결정)
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

  // 미리보기 필드 직접 수정
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
      // missingFields는 저장 페이로드에서 제거
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

  // 미리보기에서 채워진 칸 / 비어있는 칸 카운트
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

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-4 !grid-cols-none">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI 프로필 등록 도우미
          </DialogTitle>
          <DialogDescription>
            {stage === "input"
              ? "본인을 자유롭게 소개해주세요. AI가 8칸으로 자동 정리해드립니다."
              : `자동으로 ${stats.filled}/${stats.total}칸이 채워졌어요. 부족한 부분만 함께 채워봅시다.`}
          </DialogDescription>
        </DialogHeader>

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
              자세할수록 좋아요.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose} disabled={loading}>
                취소
              </Button>
              <Button
                onClick={handleAnalyze}
                disabled={loading || freeformInput.trim().length < 10}
                className="gap-1"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {loading ? "분석 중..." : "AI에게 분석시키기"}
              </Button>
            </DialogFooter>
          </div>
        )}

        {stage === "review" && draft && (
          <div className="flex flex-col gap-4 flex-1 min-h-0">
            {/* 추가 질문 영역 */}
            {currentMissing && (
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
                모든 추가 질문이 끝났어요. 아래 미리보기에서 직접 수정도 가능합니다.
              </div>
            )}

            {/* 미리보기 (직접 수정 가능) — flex-1로 남는 공간 차지하고 내부 스크롤 */}
            <div className="flex-1 min-h-0 overflow-y-auto pr-3">
              <div className="space-y-3 text-sm">
                <PreviewField
                  label="[1] 프로필 이름"
                  value={draft.name}
                  onChange={(v) => updateDraft("name", v)}
                  required
                />
                <PreviewField
                  label="[2] 카테고리"
                  value={draft.category}
                  onChange={(v) => updateDraft("category", v)}
                />
                <PreviewField
                  label="[3] 한 줄 소개"
                  value={draft.oneLineIntro}
                  onChange={(v) => updateDraft("oneLineIntro", v)}
                  multiline
                />
                <PreviewField
                  label="[4-1] 직접 경험"
                  value={draft.identity?.experience ?? ""}
                  onChange={(v) =>
                    updateDraft("identity", { ...draft.identity, experience: v })
                  }
                />
                <PreviewListField
                  label="[4-2] 자격·경력"
                  values={draft.identity?.credentials ?? []}
                  onChange={(arr) =>
                    updateDraft("identity", { ...draft.identity, credentials: arr })
                  }
                />
                <PreviewField
                  label="[5] 누구에게 도움 주나"
                  value={draft.audience}
                  onChange={(v) => updateDraft("audience", v)}
                  multiline
                />
                <PreviewListField
                  label="[6] 추천 기준 (위→아래 우선순위)"
                  values={draft.recommendationCriteria ?? []}
                  onChange={(arr) => updateDraft("recommendationCriteria", arr)}
                />
                <PreviewListField
                  label="[7] 자주 인용하는 출처"
                  values={draft.trustedSources ?? []}
                  onChange={(arr) => updateDraft("trustedSources", arr)}
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

            <DialogFooter className="shrink-0 gap-2 sm:gap-2">
              <Button variant="outline" onClick={() => setStage("input")} disabled={saving}>
                다시 입력
              </Button>
              <Button onClick={handleSave} disabled={saving} className="gap-1">
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
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  multiline?: boolean;
}) {
  const empty = !value?.trim();
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
      </Label>
      {multiline ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className={empty ? "border-amber-300" : ""}
        />
      ) : (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={empty ? "border-amber-300" : ""}
        />
      )}
    </div>
  );
}

// 미리보기 필드 — 배열 (한 줄에 하나씩 textarea)
function PreviewListField({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (v: string[]) => void;
}) {
  const empty = values.length === 0;
  return (
    <div className="space-y-1">
      <Label className="text-xs flex items-center gap-1">
        {empty ? (
          <AlertCircle className="h-3 w-3 text-amber-500" />
        ) : (
          <CheckCircle2 className="h-3 w-3 text-emerald-500" />
        )}
        {label}
      </Label>
      <Textarea
        value={values.join("\n")}
        onChange={(e) =>
          onChange(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))
        }
        rows={Math.min(Math.max(values.length, 2), 6)}
        placeholder="한 줄에 하나씩"
        className={empty ? "border-amber-300" : ""}
      />
    </div>
  );
}
