"use client";

/**
 * 유튜브 스크립트 변환 결과 카드.
 *
 * 표시 내용:
 * 1. 변환된 본문 textarea (사용자 직접 편집 가능)
 * 2. "AI가 바꾼 표현" 표 (잘못된 매칭을 X로 제외 가능 — LLM 재호출 없이 즉시 재계산)
 * 3. 복사 버튼
 *
 * 동작:
 * - props로 받은 originalContent + matches − excludedKeys 를 applyMatches로 치환하여 표시
 * - 사용자가 X 토글하면 부모(step-publish)의 excludedKeys state가 갱신되고
 *   useMemo가 재계산되어 textarea 내용이 즉시 바뀜
 * - textarea를 직접 편집하면 그때부턴 사용자 편집본을 우선시 (manualEdit state)
 */
import { useMemo, useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Video, Copy, Check, X, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { applyMatches, type MediaMatch } from "@/lib/youtube-script/apply-matches";

interface YoutubeScriptResultProps {
  originalContent: string;
  matches: MediaMatch[];
  excludedKeys: Set<string>;
  onToggleMatch: (key: string) => void;
  isLoading: boolean;
}

export function YoutubeScriptResult({
  originalContent,
  matches,
  excludedKeys,
  onToggleMatch,
  isLoading,
}: YoutubeScriptResultProps) {
  // 사용자가 textarea 직접 편집을 시작했는지 (true면 자동 재계산 중단)
  const [manualEdit, setManualEdit] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // 매칭 변경(부모의 excludedKeys 또는 matches 갱신) 시 manualEdit 초기화
  // → 사용자가 매칭 X 토글하면 textarea가 다시 자동 계산됨
  useEffect(() => {
    // 부모의 매칭(matches/excludedKeys)이 바뀌면 수동 편집본을 자동 결과로 되돌리는 의도된 파생상태 리셋.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setManualEdit(null);
  }, [matches, excludedKeys]);

  // 유효 매칭 (제외된 것 빼고) 적용한 자동 결과
  const autoConverted = useMemo(() => {
    const effective = matches.filter((m) => !excludedKeys.has(m.old));
    return applyMatches(originalContent, effective);
  }, [originalContent, matches, excludedKeys]);

  const displayed = manualEdit ?? autoConverted;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayed);
      setCopied(true);
      toast.success("복사되었습니다");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("복사 실패");
    }
  };

  const hasMatches = matches.length > 0;
  const activeMatchCount = matches.filter((m) => !excludedKeys.has(m.old)).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-sm">
            <Video className="h-4 w-4 text-rose-500" />
            유튜브 변환 결과
            {isLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCopy}
            disabled={isLoading || !displayed}
            className="gap-1.5"
          >
            {copied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                복사됨
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                복사
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 변환 결과 — 편집 가능한 textarea */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              변환된 본문 (직접 수정해도 돼요)
            </span>
            {manualEdit !== null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setManualEdit(null)}
                className="h-6 gap-1 text-xs"
              >
                <RotateCcw className="h-3 w-3" />
                자동 변환 결과로 되돌리기
              </Button>
            )}
          </div>
          <Textarea
            value={displayed}
            onChange={(e) => setManualEdit(e.target.value)}
            className="min-h-[300px] font-mono text-sm leading-relaxed"
            placeholder={isLoading ? "변환 중..." : "변환된 본문이 여기에 표시됩니다"}
            disabled={isLoading}
          />
        </div>

        <Separator />

        {/* AI가 바꾼 표현 표 (또는 안내문) */}
        {hasMatches ? (
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-sm font-semibold">AI가 바꾼 표현 ({activeMatchCount}/{matches.length})</h4>
              <p className="text-xs text-muted-foreground">
                이상한 매칭은 X 눌러 제외 → 결과 즉시 재계산
              </p>
            </div>
            <div className="rounded-md border divide-y">
              {matches.map((m) => {
                const excluded = excludedKeys.has(m.old);
                return (
                  <div
                    key={m.old}
                    className={`flex items-center gap-3 px-3 py-2 text-sm transition-opacity ${
                      excluded ? "opacity-50" : ""
                    }`}
                  >
                    <code
                      className={`flex-1 truncate rounded bg-muted px-1.5 py-0.5 text-xs ${
                        excluded ? "line-through" : ""
                      }`}
                      title={m.old}
                    >
                      {m.old}
                    </code>
                    <span className="text-muted-foreground">→</span>
                    <code
                      className={`flex-1 truncate rounded bg-muted px-1.5 py-0.5 text-xs ${
                        excluded ? "line-through" : ""
                      }`}
                      title={m.new}
                    >
                      {m.new}
                    </code>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onToggleMatch(m.old)}
                      className="h-7 w-7 shrink-0 p-0"
                      title={excluded ? "다시 적용" : "이 매칭 제외"}
                    >
                      {excluded ? (
                        <RotateCcw className="h-3.5 w-3.5" />
                      ) : (
                        <X className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        ) : !isLoading ? (
          <div className="rounded-md border border-dashed bg-muted/30 px-4 py-3 text-center text-sm text-muted-foreground">
            변환할 표현이 없습니다 — 본문을 그대로 유튜브 영상 스크립트로 쓰셔도 돼요.
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
