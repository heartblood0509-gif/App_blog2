"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Droplets,
  Sparkles,
  Hand,
  Bath,
  CircleDot,
  FlaskConical,
  Pencil,
  Check,
  Plus,
  Trash2,
  Package,
} from "lucide-react";
import type { ProductId, SelectedProduct, UserProduct } from "@/types";
import type { ProductBase } from "@/lib/products";
import { PRODUCTS, isSeedProduct } from "@/lib/products";
import { ProductForm } from "@/components/steps/product-form";

const SEED_PRODUCT_ICONS: Record<string, React.ElementType> = {
  "hair-loss-shampoo": Droplets,
  "therapy-shampoo": Sparkles,
  "body-lotion": Hand,
  soap: Bath,
  "scalp-brush": CircleDot,
  "hair-tonic": FlaskConical,
};

function getProductIcon(id: string): React.ElementType {
  return SEED_PRODUCT_ICONS[id] ?? Package;
}

interface ProductSelectionSectionProps {
  selectedProducts: SelectedProduct[];
  onChange: (products: SelectedProduct[]) => void;
  userProducts: UserProduct[];
  onUserProductsChange: () => void;
  onProductDeleted: (id: string) => void;
}

export function ProductSelectionSection({
  selectedProducts,
  onChange,
  userProducts,
  onUserProductsChange,
  onProductDeleted,
}: ProductSelectionSectionProps) {
  const [editingId, setEditingId] = useState<ProductId | null>(null);
  const [draftAdvantages, setDraftAdvantages] = useState("");
  const dialogTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 등록·수정 폼 상태
  const [formOpen, setFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<UserProduct | null>(null);

  // 시드 + 사용자 머지 (그리드 렌더용 — ProductBase 모양)
  const allProducts: ProductBase[] = [
    ...PRODUCTS,
    ...userProducts.map((u) => ({
      id: u.id,
      name: u.name,
      category: u.category,
      defaultAdvantages: u.defaultAdvantages,
    })),
  ];

  const isSelected = useCallback(
    (id: ProductId) => selectedProducts.some((p) => p.id === id),
    [selectedProducts]
  );

  const handleToggle = useCallback(
    (id: ProductId, defaultAdvantages: string) => {
      if (isSelected(id)) {
        onChange(selectedProducts.filter((p) => p.id !== id));
      } else {
        onChange([...selectedProducts, { id, advantages: defaultAdvantages }]);
      }
    },
    [selectedProducts, onChange, isSelected]
  );

  const openEditor = useCallback(
    (id: ProductId, defaultAdvantages: string) => {
      const current =
        selectedProducts.find((p) => p.id === id)?.advantages ?? defaultAdvantages;
      setDraftAdvantages(current);
      setEditingId(id);
    },
    [selectedProducts]
  );

  const closeEditor = useCallback(() => {
    setEditingId(null);
  }, []);

  const handleSaveAdvantages = useCallback(() => {
    if (!editingId) return;
    const exists = selectedProducts.some((p) => p.id === editingId);
    if (exists) {
      onChange(
        selectedProducts.map((p) =>
          p.id === editingId ? { ...p, advantages: draftAdvantages } : p
        )
      );
    } else {
      onChange([...selectedProducts, { id: editingId, advantages: draftAdvantages }]);
    }
    setEditingId(null);
  }, [editingId, draftAdvantages, selectedProducts, onChange]);

  useEffect(() => {
    if (editingId && dialogTextareaRef.current) {
      const textarea = dialogTextareaRef.current;
      textarea.focus();
      const length = textarea.value.length;
      textarea.setSelectionRange(length, length);
    }
  }, [editingId]);

  const editingProductForAdvantages = editingId
    ? allProducts.find((p) => p.id === editingId) ?? null
    : null;

  // ─────────────────────────────────────────────
  // 사용자 제품 등록·수정·삭제
  // ─────────────────────────────────────────────

  const handleCreate = useCallback(() => {
    setEditingProduct(null);
    setFormOpen(true);
  }, []);

  const handleEditUserProduct = useCallback((p: UserProduct, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingProduct(p);
    setFormOpen(true);
  }, []);

  const handleDeleteUserProduct = useCallback(
    async (p: UserProduct, e: React.MouseEvent) => {
      e.stopPropagation();
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
        onProductDeleted(p.id);
        onUserProductsChange();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "삭제 실패";
        toast.error(msg);
      }
    },
    [onProductDeleted, onUserProductsChange]
  );

  const handleSaveUserProduct = useCallback(
    async (payload: Omit<UserProduct, "id">) => {
      try {
        const isEdit = editingProduct !== null;
        const url = isEdit
          ? `/api/products?id=${encodeURIComponent(editingProduct!.id)}`
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
        onUserProductsChange();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "저장 실패";
        toast.error(msg);
        throw err;
      }
    },
    [editingProduct, onUserProductsChange]
  );

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">제품 선택</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            후기에 포함할 제품을 선택하고 장점을 작성하세요 (복수 선택 가능)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleCreate} className="gap-1">
          <Plus className="h-4 w-4" />새 등록
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {allProducts.map((product) => {
          const selected = isSelected(product.id);
          const Icon = getProductIcon(product.id);
          const isUser = !isSeedProduct(product.id);
          const userRecord = isUser
            ? userProducts.find((u) => u.id === product.id) ?? null
            : null;

          return (
            <Card
              key={product.id}
              onClick={() => handleToggle(product.id, product.defaultAdvantages)}
              className={`cursor-pointer transition-all duration-200 ${
                selected
                  ? "ring-2 ring-primary bg-primary/5"
                  : "hover:ring-1 hover:ring-muted-foreground/30"
              }`}
            >
              <CardContent className="p-0">
                <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() =>
                      handleToggle(product.id, product.defaultAdvantages)
                    }
                    onClick={(e) => e.stopPropagation()}
                  />
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">{product.name}</span>
                  </div>
                  <div className="ml-auto flex items-center gap-1">
                    {isUser && (
                      <Badge variant="outline" className="text-[10px]">
                        내 제품
                      </Badge>
                    )}
                    <Badge variant="secondary" className="text-[10px]">
                      {product.category}
                    </Badge>
                  </div>
                </div>

                <div className="border-t border-border px-4 py-3 flex justify-end gap-2">
                  {isUser && userRecord && (
                    <>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        onClick={(e) => handleEditUserProduct(userRecord, e)}
                      >
                        <Pencil className="mr-1 h-3 w-3" />
                        수정
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-destructive"
                        onClick={(e) => handleDeleteUserProduct(userRecord, e)}
                      >
                        <Trash2 className="mr-1 h-3 w-3" />
                        삭제
                      </Button>
                    </>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant={selected ? "default" : "outline"}
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditor(product.id, product.defaultAdvantages);
                    }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    장점 작성
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {selectedProducts.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 text-sm text-muted-foreground"
        >
          선택된 제품:{" "}
          <span className="font-medium text-foreground">
            {selectedProducts
              .map((p) => allProducts.find((prod) => prod.id === p.id)?.name)
              .filter(Boolean)
              .join(", ")}
          </span>
        </motion.div>
      )}

      {/* 장점 작성 다이얼로그 */}
      <Dialog
        open={editingId !== null}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingProductForAdvantages ? `${editingProductForAdvantages.name} 장점 작성` : "제품 장점 작성"}
            </DialogTitle>
            <DialogDescription>
              후기에 반영할 제품의 장점을 자유롭게 작성하세요.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">제품 장점</Label>
            <Textarea
              ref={dialogTextareaRef}
              value={draftAdvantages}
              onChange={(e) => setDraftAdvantages(e.target.value)}
              placeholder="제품의 장점을 작성하세요..."
              className="min-h-[180px] text-sm"
            />
            {editingProductForAdvantages && !isSelected(editingProductForAdvantages.id) && (
              <p className="text-xs text-muted-foreground">
                저장하면 이 제품이 자동으로 선택됩니다.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeEditor}>
              취소
            </Button>
            <Button type="button" variant="default" onClick={handleSaveAdvantages}>
              <Check className="h-3.5 w-3.5" />
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 새 등록·수정 다이얼로그 */}
      <ProductForm
        open={formOpen}
        initial={editingProduct}
        existingNames={[
          ...PRODUCTS.map((p) => p.name),
          ...userProducts.map((u) => u.name),
        ]}
        onClose={() => setFormOpen(false)}
        onSave={handleSaveUserProduct}
      />
    </section>
  );
}
