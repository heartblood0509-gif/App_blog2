"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen, Pencil, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import type { AnalysisRecord, AnalysisRecordUpsert } from "@/types/brand";
import { extractFlowFromMarkdownBody } from "@/lib/analysis-parser";
import { AnalysisRecordForm } from "./analysis-record-form";
import { fetchStoreList, StoreCorruptError } from "@/lib/store-fetch";
import { mutateProfileStore } from "@/lib/stores/profile-mutate";
import { StoreCorruptPanel } from "@/components/store-corrupt-panel";

interface AnalysisLibrarySectionProps {
  selectedRecordId: string | null;
  onSelect: (recordId: string) => void;
}

export function AnalysisLibrarySection({
  selectedRecordId,
  onSelect,
}: AnalysisLibrarySectionProps) {
  const [records, setRecords] = useState<AnalysisRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<AnalysisRecord | null>(null);
  const [corrupt, setCorrupt] = useState(false);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchStoreList<AnalysisRecord>("/api/analysis/records");
      setRecords(data);
      setCorrupt(false);
    } catch (err) {
      if (err instanceof StoreCorruptError) {
        setCorrupt(true);
      } else {
        toast.error(err instanceof Error ? err.message : "오류");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // 사용자 분석만 보관함에 표시 (내장 시드는 서사 구조 템플릿 영역에서 별도 렌더링)
  const userRecords = records.filter((r) => !r.isBuiltin);

  const handleEdit = useCallback((r: AnalysisRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(r);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (r: AnalysisRecord, e: React.MouseEvent) => {
      e.stopPropagation();
      if (!confirm(`"${r.label}" 분석을 삭제할까요?`)) return;
      try {
        const res = await mutateProfileStore(
          `/api/analysis/records?id=${encodeURIComponent(r.id)}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "삭제 실패");
        }
        toast.success("분석이 삭제되었습니다.");
        fetchRecords();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "삭제 실패";
        toast.error(msg);
      }
    },
    [fetchRecords]
  );

  const handleSave = useCallback(
    async (payload: AnalysisRecordUpsert) => {
      try {
        const isEdit = editing !== null;
        const url = isEdit
          ? `/api/analysis/records?id=${encodeURIComponent(editing!.id)}`
          : `/api/analysis/records`;
        const method = isEdit ? "PUT" : "POST";
        const res = await mutateProfileStore(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `${isEdit ? "수정" : "저장"} 실패`);
        }
        toast.success(`분석이 ${isEdit ? "수정" : "저장"}되었습니다.`);
        await fetchRecords();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "저장 실패";
        toast.error(msg);
        throw err;
      }
    },
    [editing, fetchRecords]
  );

  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-base font-semibold">서사 구조 보관함</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          직접 추가한 분석을 골라주세요. 원본 견본 글은 시스템에서 숨겨져 표절 위험이 없습니다.
        </p>
      </div>

      {corrupt ? (
        <StoreCorruptPanel kind="분석 보관함" onRetry={() => void fetchRecords()} />
      ) : loading && userRecords.length === 0 ? (
        <p className="text-sm text-muted-foreground">불러오는 중...</p>
      ) : userRecords.length === 0 ? (
        <Card className="p-6 text-center border-dashed">
          <p className="text-sm text-muted-foreground">
            아직 추가한 분석이 없어요. [내 템플릿 만들기]로 새 분석을 만들어보세요.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {userRecords.map((r) => {
            const selected = selectedRecordId === r.id;
            // 저장된 flow가 있으면 그대로, 없으면 분석 마크다운에서 fallback 추출
            // (옛 데이터에 flow가 빈 배열로 저장된 경우도 화면엔 정상 표시)
            const displayFlow =
              r.flow && r.flow.length > 0 ? r.flow : extractFlowFromMarkdownBody(r.analysis);
            return (
              <Card
                key={r.id}
                onClick={() => onSelect(r.id)}
                className={`cursor-pointer transition-all duration-200 ${
                  selected
                    ? "ring-2 ring-primary bg-primary/5"
                    : "hover:ring-1 hover:ring-muted-foreground/30"
                }`}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-4 w-4 text-primary" />
                      <CardTitle className="text-sm">{r.label}</CardTitle>
                    </div>
                    {selected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="flex h-5 w-5 items-center justify-center rounded-full bg-primary"
                      >
                        <Check className="h-3 w-3 text-primary-foreground" />
                      </motion.div>
                    )}
                  </div>
                  {displayFlow.length > 0 && (
                    <div className="mt-1 flex flex-wrap items-center gap-1">
                      {displayFlow.map((step, i) => (
                        <span key={`${r.id}-${i}-${step}`} className="flex items-center gap-1">
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                              selected
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
                </CardHeader>
                <CardContent className="pt-0 space-y-2">
                  {r.excerptPattern && (
                    <p className="text-[11px] text-muted-foreground line-clamp-2">
                      {r.excerptPattern}
                    </p>
                  )}
                  <div className="flex gap-1 pt-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={(e) => handleEdit(r, e)}
                    >
                      <Pencil className="mr-1 h-3 w-3" />
                      수정
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 text-destructive"
                      onClick={(e) => handleDelete(r, e)}
                    >
                      <Trash2 className="mr-1 h-3 w-3" />
                      삭제
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AnalysisRecordForm
        open={formOpen}
        initial={editing}
        onClose={() => setFormOpen(false)}
        onSave={handleSave}
      />
    </section>
  );
}
