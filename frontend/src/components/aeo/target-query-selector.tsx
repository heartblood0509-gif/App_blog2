"use client";

import { useCallback, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import type { AeoProfile } from "@/types/aeo";

interface TargetQuerySelectorProps {
  profile: AeoProfile | null;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string;
  /** 현재 확정된 질문 목록 (외부 상태) */
  queries: string[];
  onChange: (queries: string[]) => void;
}

/**
 * AEO 타겟 자연어 질문 선택기.
 *
 * - "자동 추론" 버튼으로 AI가 5개 후보 생성
 * - 체크박스로 사용/미사용 토글
 * - 직접 추가 가능
 * - 각 항목 삭제 가능
 *
 * 동작:
 *   queries (외부 상태) = 현재 선택된 모든 질문
 *   suggestions (내부 상태) = 화면에 표시할 후보 목록
 *   체크 = queries에 포함되어 있는지로 판단
 */
export function TargetQuerySelector({
  profile,
  mainKeyword,
  subKeywords,
  topic,
  queries,
  onChange,
}: TargetQuerySelectorProps) {
  const [suggestions, setSuggestions] = useState<string[]>(queries);
  const [loading, setLoading] = useState(false);
  const [manualInput, setManualInput] = useState("");

  const canInfer = profile !== null && mainKeyword.trim().length > 0;

  const handleInfer = useCallback(async () => {
    if (!canInfer) {
      toast.error("AEO 프로필과 메인 키워드를 먼저 입력해주세요.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/aeo/infer-queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profile,
          mainKeyword,
          subKeywords: subKeywords || undefined,
          topic: topic || undefined,
          count: 5,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "추론 실패");
      }
      const data = (await res.json()) as { queries: string[] };
      // 후보 목록 갱신 + 모두 체크 상태로 시작
      setSuggestions(data.queries);
      onChange(data.queries);
      toast.success("자연어 질문 후보를 만들었습니다. 원하는 항목만 체크하거나 직접 추가하세요.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "추론 중 오류";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [canInfer, profile, mainKeyword, subKeywords, topic, onChange]);

  const toggleQuery = useCallback(
    (q: string, checked: boolean) => {
      const next = checked
        ? Array.from(new Set([...queries, q]))
        : queries.filter((x) => x !== q);
      onChange(next);
    },
    [queries, onChange]
  );

  const removeSuggestion = useCallback(
    (q: string) => {
      setSuggestions((prev) => prev.filter((x) => x !== q));
      onChange(queries.filter((x) => x !== q));
    },
    [queries, onChange]
  );

  const addManual = useCallback(() => {
    const value = manualInput.trim();
    if (!value) return;
    if (suggestions.includes(value)) {
      toast.error("이미 추가된 질문입니다.");
      return;
    }
    setSuggestions((prev) => [...prev, value]);
    onChange(Array.from(new Set([...queries, value])));
    setManualInput("");
  }, [manualInput, suggestions, queries, onChange]);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-sm font-semibold">타겟 자연어 질문</Label>
          <p className="mt-1 text-xs text-muted-foreground">
            이 글이 답할 AI 질문들. AI 자동 추론 후 원하는 것만 체크하세요.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleInfer}
          disabled={!canInfer || loading}
          className="gap-1"
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {loading ? "추론 중..." : "AI 자동 추론"}
        </Button>
      </div>

      {suggestions.length === 0 ? (
        <Card className="p-4 text-center">
          <p className="text-xs text-muted-foreground">
            우측의 [AI 자동 추론] 버튼을 누르면 자연어 질문 5개를 추천해 드려요.
          </p>
        </Card>
      ) : (
        <Card>
          <CardContent className="space-y-2 p-4">
            {suggestions.map((q) => {
              const checked = queries.includes(q);
              return (
                <div
                  key={q}
                  className="flex items-start gap-2 rounded-md py-1 hover:bg-muted/30"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => toggleQuery(q, v === true)}
                    className="mt-0.5"
                  />
                  <span className="flex-1 text-sm leading-snug">{q}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground"
                    onClick={() => removeSuggestion(q)}
                    title="이 질문 삭제"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Input
          placeholder='직접 추가: "임산부 ___ 추천해주세요" 같은 자연어 질문'
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addManual();
            }
          }}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={addManual}
          disabled={!manualInput.trim()}
          className="gap-1 shrink-0"
        >
          <Plus className="h-4 w-4" />추가
        </Button>
      </div>

      {queries.length > 0 && (
        <p className="text-xs text-muted-foreground">
          ✓ 선택된 질문 {queries.length}개가 본문 생성에 반영됩니다.
        </p>
      )}
    </section>
  );
}
