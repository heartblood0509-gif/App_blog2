"use client";

import { useEffect, useState } from "react";
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
import type { AnalysisRecord, AnalysisRecordUpsert } from "@/types/brand";

interface AnalysisRecordFormProps {
  open: boolean;
  /** 편집 모드면 기존 레코드, 신규면 null */
  initial?: AnalysisRecord | null;
  /** 저장 직전 라벨만 미리 채우고 싶을 때 (예: 직접 레퍼런스에서 분석 직후 저장 통로) */
  defaults?: Partial<AnalysisRecordUpsert>;
  onClose: () => void;
  onSave: (payload: AnalysisRecordUpsert) => Promise<void> | void;
}

const linesToArray = (s: string): string[] =>
  s.split(",").map((x) => x.trim()).filter(Boolean);

const arrayToLines = (a: string[]): string => a.join(", ");

export function AnalysisRecordForm({
  open,
  initial,
  defaults,
  onClose,
  onSave,
}: AnalysisRecordFormProps) {
  const [label, setLabel] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [analysis, setAnalysis] = useState("");
  const [flowText, setFlowText] = useState("");
  const [excerptPattern, setExcerptPattern] = useState("");
  const [saving, setSaving] = useState(false);

  const readOnly = initial?.isBuiltin ?? false;

  useEffect(() => {
    if (open) {
      setLabel(initial?.label ?? defaults?.label ?? "");
      setSourceUrl(initial?.sourceUrl ?? defaults?.sourceUrl ?? "");
      setAnalysis(initial?.analysis ?? defaults?.analysis ?? "");
      setFlowText(arrayToLines(initial?.flow ?? defaults?.flow ?? []));
      setExcerptPattern(initial?.excerptPattern ?? defaults?.excerptPattern ?? "");
    }
  }, [open, initial, defaults]);

  const handleSubmit = async () => {
    if (!label.trim() || !analysis.trim()) {
      return;
    }
    setSaving(true);
    try {
      await onSave({
        label: label.trim(),
        sourceType: "user",
        sourceUrl: sourceUrl.trim() || undefined,
        analysis: analysis.trim(),
        flow: linesToArray(flowText),
        excerptPattern: excerptPattern.trim(),
      });
      onClose();
    } catch {
      // toast는 호출부에서 처리
    } finally {
      setSaving(false);
    }
  };

  const isEdit = !!initial;
  const title = readOnly
    ? "내장 분석 레코드 (읽기 전용)"
    : isEdit
    ? "분석 레코드 수정"
    : "분석 레코드 저장";

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {readOnly
              ? "시스템 내장 레코드는 수정·삭제할 수 없습니다. 참고용으로 확인하세요."
              : "이 분석은 보관함에 저장되어 다음 글 작성 시 [서사 구조 기반 작성]에서 골라 사용할 수 있습니다."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-3">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="ar-label">이름 *</Label>
              <Input
                id="ar-label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="예: 김철수 블로그 폭로형 분석"
                disabled={readOnly}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ar-url">원본 URL (선택)</Label>
              <Input
                id="ar-url"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
                placeholder="https://..."
                disabled={readOnly}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ar-flow">단계 라벨 (쉼표 구분)</Label>
              <Input
                id="ar-flow"
                value={flowText}
                onChange={(e) => setFlowText(e.target.value)}
                placeholder="예: 피해 사례, 경고, 고백, 주의사항, 마무리"
                disabled={readOnly}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ar-pattern">어미·호흡 패턴 요약 (선택)</Label>
              <Input
                id="ar-pattern"
                value={excerptPattern}
                onChange={(e) => setExcerptPattern(e.target.value)}
                placeholder="예: 평균 18자, ~합니다체 위주, 단어 사이 마침표"
                disabled={readOnly}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="ar-analysis">분석 마크다운 *</Label>
              <Textarea
                id="ar-analysis"
                value={analysis}
                onChange={(e) => setAnalysis(e.target.value)}
                placeholder="서사 구조·소제목·톤 등을 마크다운으로 작성"
                className="min-h-[280px] font-mono text-xs"
                disabled={readOnly}
              />
            </div>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {readOnly ? "닫기" : "취소"}
          </Button>
          {!readOnly && (
            <Button
              onClick={handleSubmit}
              disabled={saving || !label.trim() || !analysis.trim()}
            >
              {saving ? "저장 중..." : isEdit ? "수정" : "저장"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
