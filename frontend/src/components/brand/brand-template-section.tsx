"use client";

import { motion } from "framer-motion";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sparkles, BookOpen, Award, ShoppingBag, Check } from "lucide-react";
import type { BrandTemplateId, BrandInfoVariantId } from "@/types/brand";

type TemplateCard = {
  id: BrandTemplateId;
  name: string;
  description: string;
  icon: React.ElementType;
  enabled: boolean;
};

const TEMPLATES: TemplateCard[] = [
  { id: "intro", name: "소개글", description: "나 또는 내 브랜드를 소개하고 신뢰를 쌓는 글", icon: Sparkles, enabled: true },
  { id: "info", name: "정보성글", description: "유입을 위한 정보성 글 (브랜드 추구방향과 일치)", icon: BookOpen, enabled: true },
  { id: "value-proof", name: "가치입증글", description: "신뢰도와 권위를 높이는 글", icon: Award, enabled: true },
  { id: "detail", name: "상세페이지글", description: "구매 전환 직전 단계의 글", icon: ShoppingBag, enabled: false },
];

type InfoVariant = { id: BrandInfoVariantId; label: string; description: string };

const INFO_VARIANTS: InfoVariant[] = [
  { id: "info-1", label: "정보성글 1", description: "Hook → Crisis → Solution → CTA 골격" },
];

interface BrandTemplateSectionProps {
  selectedTemplate: BrandTemplateId | null;
  selectedInfoVariant: BrandInfoVariantId | null;
  onTemplateChange: (template: BrandTemplateId) => void;
  onInfoVariantChange: (variant: BrandInfoVariantId) => void;
}

export function BrandTemplateSection({
  selectedTemplate,
  selectedInfoVariant,
  onTemplateChange,
  onInfoVariantChange,
}: BrandTemplateSectionProps) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-xl font-semibold">글 템플릿</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          어떤 종류의 브랜드 글을 만들지 선택하세요
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {TEMPLATES.map((tpl) => {
          const selected = selectedTemplate === tpl.id;
          const Icon = tpl.icon;
          const disabled = !tpl.enabled;

          return (
            <Card
              key={tpl.id}
              onClick={disabled ? undefined : () => onTemplateChange(tpl.id)}
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
                    <CardTitle className="text-base">{tpl.name}</CardTitle>
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
                  {tpl.description}
                </CardDescription>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {selectedTemplate === "info" && (
        <motion.div
          key="info-variants"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          transition={{ duration: 0.2 }}
          className="mt-4 space-y-2 overflow-hidden"
        >
          <p className="text-sm font-medium">정보성글 변형 선택</p>
          <div className="flex flex-wrap gap-2">
            {INFO_VARIANTS.map((v) => {
              const isSel = selectedInfoVariant === v.id;
              return (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => onInfoVariantChange(v.id)}
                  className={`rounded-md border px-3 py-2 text-left text-xs transition-all ${
                    isSel
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-muted-foreground/50"
                  }`}
                >
                  <div className="font-medium">{v.label}</div>
                  <div className="text-muted-foreground">{v.description}</div>
                </button>
              );
            })}
          </div>
        </motion.div>
      )}
    </section>
  );
}
