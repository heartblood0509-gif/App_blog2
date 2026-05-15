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
import type { BrandProfile } from "@/types/brand";
import {
  BRAND_FOLLOWUP_QUESTIONS,
  type BrandProfileMissingField,
} from "@/lib/brand/prompts/profile-assist";

interface BrandProfileAssistantProps {
  open: boolean;
  onClose: () => void;
  /** 저장 성공 시 호출 — 부모가 목록 갱신 + 새 프로필 자동 선택 */
  onSaved: (newProfile: BrandProfile) => void;
}

const EXAMPLE_INPUT = `예시:
저희는 우리끼리09라는 크루즈 여행 공동구매 플랫폼입니다. 대표는 윤희(마케팅 14년차, 크루즈 인솔 50회 이상)이고요. 일반 여행사들이 미끼 가격으로 유인하고 추가 옵션비를 폭탄으로 붙이는 게 너무 분노스러워서 직접 공동구매를 시작했어요. 전 일정 관광 포함 + 추가 비용 0원이 가장 큰 차별점이고요. 주 고객은 첫 크루즈를 꿈꾸는 40~60대 부부입니다.`;

/**
 * 도우미 응답 형태 — profile-assist API가 반환하는 JSON.
 * (Omit<BrandProfile, "id"> 와 호환되되 missingFields 부가).
 */
type AssistResponse = Omit<BrandProfile, "id"> & {
  missingFields?: BrandProfileMissingField[];
};

export function BrandProfileAssistant({ open, onClose, onSaved }: BrandProfileAssistantProps) {
  type Stage = "input" | "review";
  const [stage, setStage] = useState<Stage>("input");
  const [freeformInput, setFreeformInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState<AssistResponse | null>(null);
  // 추가 질문 중인 필드 (배열의 첫 번째 항목부터 처리)
  const [pendingMissing, setPendingMissing] = useState<BrandProfileMissingField[]>([]);
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
      toast.error("브랜드 자기소개를 최소 10자 이상 입력해주세요.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/brand/profile-assist", {
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
      toast.success("자기소개를 브랜드 프로필로 정리했어요. 부족한 칸을 채워봅시다.");
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
      case "oneLine":
        next.oneLine = answer;
        break;
      case "narratorAuthority":
        next.narrator = { ...next.narrator, authority: answer };
        break;
      case "storyOrigin":
        next.story = { ...next.story, origin: answer };
        break;
      case "differentiators":
        next.differentiators = answer
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean);
        break;
      case "targetPrimary":
        next.targets = { ...next.targets, primary: answer };
        break;
      case "villains":
        next.villains = answer
          .split(/[,\n]/)
          .map((s) => s.trim())
          .filter(Boolean);
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
    if (!draft.label?.trim() || !draft.name?.trim() || !draft.narrator?.name?.trim()) {
      toast.error("브랜드명·라벨·화자 이름은 필수입니다.");
      return;
    }
    setSaving(true);
    try {
      // missingFields는 저장 페이로드에서 제거
      const { missingFields: _missingFields, ...payload } = draft;
      void _missingFields;
      const res = await fetch("/api/brand/profiles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "저장 실패");
      }
      const saved = (await res.json()) as BrandProfile;
      toast.success("새 브랜드 프로필이 등록되었습니다.");
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

  // 미리보기에서 채워진 핵심 칸 / 비어있는 칸 카운트 (10개 핵심 기준)
  const stats = useMemo(() => {
    if (!draft) return { filled: 0, total: 10 };
    let filled = 0;
    if (draft.name?.trim()) filled++;
    if (draft.category?.trim()) filled++;
    if (draft.oneLine?.trim()) filled++;
    if (draft.narrator?.name?.trim()) filled++;
    if (draft.narrator?.authority?.trim()) filled++;
    if (draft.story?.origin?.trim()) filled++;
    if (draft.targets?.primary?.trim()) filled++;
    if (draft.differentiators?.length) filled++;
    if (draft.villains?.length) filled++;
    if (draft.authorityAssets?.length) filled++;
    return { filled, total: 10 };
  }, [draft]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col gap-4 !grid-cols-none">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            AI 브랜드 프로필 도우미
          </DialogTitle>
          <DialogDescription>
            {stage === "input"
              ? "브랜드/회사를 자유롭게 소개해주세요. AI가 양식을 자동으로 정리해드립니다."
              : `자동으로 ${stats.filled}/${stats.total}칸이 채워졌어요. 부족한 부분만 함께 채워봅시다.`}
          </DialogDescription>
        </DialogHeader>

        {stage === "input" && (
          <div className="space-y-3">
            <Textarea
              value={freeformInput}
              onChange={(e) => setFreeformInput(e.target.value)}
              placeholder={EXAMPLE_INPUT}
              rows={9}
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              💡 회사 이름 · 분야 · 글 쓰는 사람 (대표/이사) · 시작 동기 · 차별점 · 주 고객 정도를 자유롭게 적어주세요.
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
                <p className="mb-3 text-sm">{BRAND_FOLLOWUP_QUESTIONS[currentMissing]}</p>
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
                  label="[1] 브랜드/회사명"
                  value={draft.name}
                  onChange={(v) => updateDraft("name", v)}
                  required
                />
                <PreviewField
                  label="[2] 분야·업종"
                  value={draft.category}
                  onChange={(v) => updateDraft("category", v)}
                />
                <PreviewField
                  label="[3] 한 줄 소개"
                  value={draft.oneLine}
                  onChange={(v) => updateDraft("oneLine", v)}
                  multiline
                />
                <PreviewField
                  label="[4] 화자 이름"
                  value={draft.narrator?.name ?? ""}
                  onChange={(v) =>
                    updateDraft("narrator", { ...draft.narrator, name: v, fixed: true })
                  }
                  required
                />
                <PreviewField
                  label="[5] 화자 직책"
                  value={draft.narrator?.role ?? ""}
                  onChange={(v) =>
                    updateDraft("narrator", { ...draft.narrator, role: v, fixed: true })
                  }
                />
                <PreviewField
                  label="[6] 화자 권위·경력"
                  value={draft.narrator?.authority ?? ""}
                  onChange={(v) =>
                    updateDraft("narrator", { ...draft.narrator, authority: v, fixed: true })
                  }
                  multiline
                />
                <PreviewField
                  label="[7] 왜 시작했나 (스토리)"
                  value={draft.story?.origin ?? ""}
                  onChange={(v) => updateDraft("story", { ...draft.story, origin: v })}
                  multiline
                />
                <PreviewField
                  label="[8] 주 고객"
                  value={draft.targets?.primary ?? ""}
                  onChange={(v) =>
                    updateDraft("targets", { ...draft.targets, primary: v })
                  }
                  multiline
                />
                <PreviewListField
                  label="[9] 차별점 (한 줄에 하나)"
                  values={draft.differentiators ?? []}
                  onChange={(arr) => updateDraft("differentiators", arr)}
                />
                <PreviewListField
                  label="[10] 공통의 적 / 폭로 대상"
                  values={draft.villains ?? []}
                  onChange={(arr) => updateDraft("villains", arr)}
                />
                <PreviewListField
                  label="[11] 권위·신뢰 자산"
                  values={draft.authorityAssets ?? []}
                  onChange={(arr) => updateDraft("authorityAssets", arr)}
                />
                <PreviewField
                  label="[12] 절대 쓰지 않는 단어 (쉼표로 구분)"
                  value={(draft.forbidden?.forbiddenWords ?? []).join(", ")}
                  onChange={(v) =>
                    updateDraft("forbidden", {
                      competitorNames: draft.forbidden?.competitorNames ?? true,
                      adStyle: draft.forbidden?.adStyle ?? true,
                      forbiddenWords: v.split(",").map((s) => s.trim()).filter(Boolean),
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
