"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
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
} from "lucide-react";
import type { ProductId, SelectedProduct } from "@/types";
import { PRODUCTS } from "@/lib/products";

const PRODUCT_ICONS: Record<ProductId, React.ElementType> = {
  "hair-loss-shampoo": Droplets,
  "therapy-shampoo": Sparkles,
  "body-lotion": Hand,
  soap: Bath,
  "scalp-brush": CircleDot,
  "hair-tonic": FlaskConical,
};

interface ProductSelectionSectionProps {
  selectedProducts: SelectedProduct[];
  onChange: (products: SelectedProduct[]) => void;
}

export function ProductSelectionSection({
  selectedProducts,
  onChange,
}: ProductSelectionSectionProps) {
  const [editingId, setEditingId] = useState<ProductId | null>(null);
  const [draftAdvantages, setDraftAdvantages] = useState("");
  const dialogTextareaRef = useRef<HTMLTextAreaElement | null>(null);

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

  const handleSave = useCallback(() => {
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

  const editingProduct = editingId
    ? PRODUCTS.find((p) => p.id === editingId) ?? null
    : null;

  return (
    <section>
      <div className="mb-4">
        <h2 className="text-xl font-semibold">제품 선택</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          후기에 포함할 제품을 선택하고 장점을 작성하세요 (복수 선택 가능)
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRODUCTS.map((product) => {
          const selected = isSelected(product.id);
          const Icon = PRODUCT_ICONS[product.id];

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
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {product.category}
                  </Badge>
                </div>

                <div className="border-t border-border px-4 py-3 flex justify-end">
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
              .map((p) => PRODUCTS.find((prod) => prod.id === p.id)?.name)
              .filter(Boolean)
              .join(", ")}
          </span>
        </motion.div>
      )}

      {/* Advantages Editor Dialog */}
      <Dialog
        open={editingId !== null}
        onOpenChange={(open) => {
          if (!open) closeEditor();
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editingProduct ? `${editingProduct.name} 장점 작성` : "제품 장점 작성"}
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
            {editingProduct && !isSelected(editingProduct.id) && (
              <p className="text-xs text-muted-foreground">
                저장하면 이 제품이 자동으로 선택됩니다.
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeEditor}>
              취소
            </Button>
            <Button type="button" variant="default" onClick={handleSave}>
              <Check className="h-3.5 w-3.5" />
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
