"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Droplets,
  Sparkles,
  Hand,
  Bath,
  CircleDot,
  FlaskConical,
  Pencil,
  Check,
  Layers,
  MessageSquare,
  SquarePlay,
  LayoutGrid,
} from "lucide-react";
import type { ProductId, SelectedProduct, Channel } from "@/types";
import { PRODUCTS } from "@/lib/products";

const PRODUCT_ICONS: Record<ProductId, React.ElementType> = {
  "hair-loss-shampoo": Droplets,
  "therapy-shampoo": Sparkles,
  "body-lotion": Hand,
  soap: Bath,
  "scalp-brush": CircleDot,
  "hair-tonic": FlaskConical,
};

const CHANNELS: Array<{
  id: Channel;
  name: string;
  description: string;
  icon: React.ElementType;
  enabled: boolean;
}> = [
  { id: "blog", name: "블로그", description: "네이버 블로그 후기형 포스팅", icon: Layers, enabled: true },
  { id: "thread", name: "쓰레드", description: "짧은 호흡의 SNS 포스팅", icon: MessageSquare, enabled: false },
  { id: "youtube", name: "유튜브", description: "영상 스크립트 / 자막", icon: SquarePlay, enabled: false },
  { id: "detail-page", name: "상세페이지", description: "쇼핑몰 상품 상세", icon: LayoutGrid, enabled: false },
];

interface StepProductSelectProps {
  selectedProducts: SelectedProduct[];
  onChange: (products: SelectedProduct[]) => void;
  channel: Channel | null;
  onChannelChange: (channel: Channel) => void;
}

export function StepProductSelect({
  selectedProducts,
  onChange,
  channel,
  onChannelChange,
}: StepProductSelectProps) {
  const [editingId, setEditingId] = useState<ProductId | null>(null);
  const editingTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isSelected = useCallback(
    (id: ProductId) => selectedProducts.some((p) => p.id === id),
    [selectedProducts]
  );

  const getAdvantages = useCallback(
    (id: ProductId) => selectedProducts.find((p) => p.id === id)?.advantages ?? "",
    [selectedProducts]
  );

  const handleToggle = useCallback(
    (id: ProductId, defaultAdvantages: string) => {
      if (isSelected(id)) {
        if (editingId === id) setEditingId(null);
        onChange(selectedProducts.filter((p) => p.id !== id));
      } else {
        onChange([...selectedProducts, { id, advantages: defaultAdvantages }]);
      }
    },
    [selectedProducts, onChange, isSelected, editingId]
  );

  const handleAdvantagesChange = useCallback(
    (id: ProductId, advantages: string) => {
      onChange(
        selectedProducts.map((p) => (p.id === id ? { ...p, advantages } : p))
      );
    },
    [selectedProducts, onChange]
  );

  useEffect(() => {
    if (editingId && editingTextareaRef.current) {
      const textarea = editingTextareaRef.current;
      textarea.focus();
      const length = textarea.value.length;
      textarea.setSelectionRange(length, length);
    }
  }, [editingId]);

  return (
    <div className="space-y-10">
      {/* Channel Section */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">채널 선택</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            어떤 채널의 콘텐츠를 만들지 선택하세요
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CHANNELS.map((ch) => {
            const selected = channel === ch.id;
            const Icon = ch.icon;
            const disabled = !ch.enabled;

            return (
              <Card
                key={ch.id}
                onClick={disabled ? undefined : () => onChannelChange(ch.id)}
                aria-disabled={disabled}
                className={`transition-all duration-200 ${
                  disabled
                    ? "cursor-not-allowed opacity-50 grayscale"
                    : selected
                      ? "cursor-pointer ring-2 ring-primary bg-primary/5"
                      : "cursor-pointer hover:ring-1 hover:ring-muted-foreground/30"
                }`}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">{ch.name}</CardTitle>
                    </div>
                    {disabled && (
                      <Badge variant="secondary" className="text-[10px]">
                        준비 중
                      </Badge>
                    )}
                    {!disabled && selected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-primary"
                      >
                        <Check className="h-3.5 w-3.5 text-primary-foreground" />
                      </motion.div>
                    )}
                  </div>
                  <CardDescription className="text-xs leading-relaxed">
                    {ch.description}
                  </CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      </section>

      <Separator />

      {/* Product Section */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">제품 선택</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            후기에 포함할 제품을 선택하고 장점을 수정하세요 (복수 선택 가능)
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {PRODUCTS.map((product) => {
          const selected = isSelected(product.id);
          const Icon = PRODUCT_ICONS[product.id];

          return (
            <Card
              key={product.id}
              className={`cursor-pointer transition-all duration-200 ${
                selected
                  ? "ring-2 ring-primary bg-primary/5"
                  : "hover:ring-1 hover:ring-muted-foreground/30"
              }`}
            >
              <CardContent className="p-0">
                {/* Product Header */}
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 pt-4 pb-3 text-left"
                  onClick={() =>
                    handleToggle(product.id, product.defaultAdvantages)
                  }
                >
                  <Checkbox
                    checked={selected}
                    onCheckedChange={() =>
                      handleToggle(product.id, product.defaultAdvantages)
                    }
                  />
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium">{product.name}</span>
                  </div>
                  <Badge variant="secondary" className="ml-auto text-[10px]">
                    {product.category}
                  </Badge>
                </button>

                {/* Expandable Advantages */}
                <AnimatePresence>
                  {selected && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border px-4 pt-3 pb-4">
                        <Label className="mb-2 text-xs text-muted-foreground">
                          제품 장점
                        </Label>
                        <Textarea
                          ref={
                            editingId === product.id
                              ? editingTextareaRef
                              : undefined
                          }
                          value={getAdvantages(product.id)}
                          onChange={(e) =>
                            handleAdvantagesChange(product.id, e.target.value)
                          }
                          placeholder="제품의 장점을 작성하세요..."
                          readOnly={editingId !== product.id}
                          className={`min-h-[80px] text-xs ${
                            editingId === product.id
                              ? ""
                              : "bg-muted/40 cursor-default focus-visible:ring-0"
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        />
                        <div className="mt-2 flex justify-end">
                          {editingId === product.id ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="default"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingId(null);
                              }}
                            >
                              <Check className="h-3.5 w-3.5" />
                              확인
                            </Button>
                          ) : (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEditingId(product.id);
                              }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                              수정
                            </Button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
      </section>
    </div>
  );
}
