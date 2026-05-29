"use client";

// "내 정보" 페이지 안에서 사용자 등록 제품을 통합 관리하는 매니저.
// - 목록 카드 + [새 등록] + [수정] / [삭제]
// - 등록·수정은 기존 ProductForm 다이얼로그 100% 재사용 (글 작성 흐름과 동일 UX)
// - 위저드(wizard) state 의존성 없음 — 독립 동작.

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { UserProduct } from "@/types";
import { ProductForm } from "@/components/steps/product-form";

export function ProductManager() {
  const [products, setProducts] = useState<UserProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<UserProduct | null>(null);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      if (!res.ok) throw new Error("제품 목록을 불러오지 못했습니다.");
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "오류");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  const handleCreate = useCallback(() => {
    setEditing(null);
    setFormOpen(true);
  }, []);

  const handleEdit = useCallback((p: UserProduct) => {
    setEditing(p);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (p: UserProduct) => {
      if (!confirm(`"${p.name}" 제품을 삭제할까요?`)) return;
      try {
        const res = await fetch(`/api/products?id=${encodeURIComponent(p.id)}`, {
          method: "DELETE",
          cache: "no-store",
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || "삭제 실패");
        }
        toast.success("제품이 삭제되었습니다.");
        await fetchProducts();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "삭제 실패");
      }
    },
    [fetchProducts]
  );

  const handleSave = useCallback(
    async (payload: Omit<UserProduct, "id">) => {
      try {
        const isEdit = editing !== null;
        const url = isEdit
          ? `/api/products?id=${encodeURIComponent(editing!.id)}`
          : `/api/products`;
        const method = isEdit ? "PUT" : "POST";
        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `${isEdit ? "수정" : "등록"} 실패`);
        }
        toast.success(`제품이 ${isEdit ? "수정" : "등록"}되었습니다.`);
        await fetchProducts();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "저장 실패");
        throw err;
      }
    },
    [editing, fetchProducts]
  );

  return (
    <div className="space-y-4">
      {/* 상단: 안내 + 새 등록 버튼 */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          후기성 블로그에서 사용할 제품을 등록·수정·삭제합니다.
        </p>
        <Button size="sm" onClick={handleCreate} className="gap-1 shrink-0">
          <Plus className="h-4 w-4" />새 제품 등록
        </Button>
      </div>

      {/* 카드 그리드 */}
      {loading && products.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          불러오는 중…
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          등록된 제품이 아직 없습니다. 위 [새 제품 등록] 버튼으로 시작하세요.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {products.map((p) => (
            <Card key={p.id} className="transition-shadow hover:shadow-sm">
              <CardContent className="p-0">
                <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                  <Package className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <span className="font-medium truncate">{p.name}</span>
                  <Badge variant="secondary" className="ml-auto text-[10px] shrink-0">
                    {p.category}
                  </Badge>
                </div>
                <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    onClick={() => handleEdit(p)}
                  >
                    <Pencil className="mr-1 h-3 w-3" />
                    수정
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-destructive"
                    onClick={() => handleDelete(p)}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    삭제
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 등록·수정 다이얼로그 — 글 작성 흐름과 동일 컴포넌트 */}
      <ProductForm
        open={formOpen}
        initial={editing}
        existingNames={products.map((p) => p.name)}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSave={handleSave}
      />
    </div>
  );
}
