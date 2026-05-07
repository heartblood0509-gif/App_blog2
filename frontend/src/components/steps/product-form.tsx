"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { Separator } from "@/components/ui/separator";
import type { UserProduct } from "@/types";
import { PRODUCTS } from "@/lib/products";

interface ProductFormProps {
  open: boolean;
  initial?: UserProduct | null;
  /** 시드 + 기존 사용자 제품의 이름 목록 (중복 검증) */
  existingNames: string[];
  onClose: () => void;
  onSave: (payload: Omit<UserProduct, "id">) => Promise<void> | void;
}

type Payload = Omit<UserProduct, "id">;

const EMPTY: Payload = {
  name: "",
  category: "",
  defaultAdvantages: "",
  relatedSymptoms: [],
  naturalMentionPatterns: [],
  keyInsight: "",
  sensoryDetails: [],
  realReviews: [],
};

// 시드 카테고리 (자동완성 데이터소스, 중복 제거)
const SEED_CATEGORIES = Array.from(new Set(PRODUCTS.map((p) => p.category)));

// 양쪽 큰따옴표·작은따옴표·전각 따옴표 strip
const stripQuotes = (s: string): string =>
  s.replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, "");

const linesToArray = (s: string): string[] =>
  s
    .split("\n")
    .map((line) => stripQuotes(line))
    .filter((line) => line.length > 0);

const arrayToLines = (a: string[] | undefined): string => (a ?? []).join("\n");

// 탈모샴푸 placeholder (장점은 "실제 후기:" 섹션 제거한 윗부분만)
const PH = {
  name: "탈모샴푸",
  category: "헤어케어",
  defaultAdvantages: `자극적인 느낌 없이 꾸준히 쓰는 데 초점 맞춰진 타입
두피 상태 안정시키는 느낌 → 빠짐보다 환경 개선 쪽
머리 감고 나서 개운함은 있는데 건조하지 않음
두피 열감 간지러움이 줄면서 전체적인 두피 컨디션이 안정됨
기존 탈모샴푸 특유의 뻣뻣함이 덜함
탈모를 잡는다보다 빠질 환경을 줄이는 방향`,
  relatedSymptoms: `탈모
머리카락 빠짐
두피 가려움
두피 각질
두피 냄새
머리숱 감소`,
  naturalMentionPatterns: `요즘 쓰고 있는 샴푸
지인 추천으로 써보기 시작한
우연히 바꿔보게 된
맘카페에서 후기 보고 바꿔본`,
  keyInsight: "탈모를 잡는다보다 빠질 환경을 줄이는 방향으로 접근하는 타입",
  sensoryDetails: `개운함은 있는데 건조하지 않음
두피 열감 간지러움이 줄면서 전체적인 두피 컨디션 안정
기존 탈모샴푸 특유의 뻣뻣함이 덜함`,
  realReviews: `머리 빠지는 건 바로 줄진 않는데 두피가 덜 자극받으니까 덜 빠지는 느낌
기존 탈모샴푸처럼 뻣뻣하거나 떡지는 느낌 없음
꾸준히 썼을 때 차이가 나는 쪽`,
};

export function ProductForm({
  open,
  initial,
  existingNames,
  onClose,
  onSave,
}: ProductFormProps) {
  const [payload, setPayload] = useState<Payload>(EMPTY);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (initial) {
        const { id: _ignored, ...rest } = initial;
        void _ignored;
        setPayload(rest);
      } else {
        setPayload(EMPTY);
      }
    }
  }, [open, initial]);

  const update = <K extends keyof Payload>(key: K, value: Payload[K]) =>
    setPayload((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    if (submitting) return;

    const normalized: Payload = {
      name: payload.name.trim(),
      category: payload.category.trim(),
      defaultAdvantages: payload.defaultAdvantages.trim(),
      keyInsight: stripQuotes(payload.keyInsight.trim()),
      relatedSymptoms: payload.relatedSymptoms,
      naturalMentionPatterns: payload.naturalMentionPatterns,
      sensoryDetails: payload.sensoryDetails,
      realReviews: payload.realReviews,
    };

    // 검증 — 모든 필드 필수
    const missing: string[] = [];
    if (!normalized.name) missing.push("제품명");
    if (!normalized.category) missing.push("카테고리");
    if (!normalized.defaultAdvantages) missing.push("제품 장점");
    if (normalized.relatedSymptoms.length === 0) missing.push("관련 증상/고민");
    if (normalized.naturalMentionPatterns.length === 0)
      missing.push("자연스러운 언급 패턴");
    if (!normalized.keyInsight) missing.push("핵심 방향성");
    if (normalized.sensoryDetails.length === 0) missing.push("감각 표현");
    if (normalized.realReviews.length === 0) missing.push("실제 후기");

    if (missing.length > 0) {
      toast.error(`다음 항목을 입력해주세요: ${missing.join(", ")}`);
      return;
    }

    // 이름 중복 검증 (편집 중인 자기 자신은 제외)
    const otherNames = existingNames.filter(
      (n) => !initial || n !== initial.name
    );
    if (otherNames.includes(normalized.name)) {
      toast.error(`이미 등록된 제품 이름입니다: ${normalized.name}`);
      return;
    }

    setSubmitting(true);
    try {
      await onSave(normalized);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "제품 수정" : "새 제품 등록"}</DialogTitle>
          <DialogDescription>
            모든 항목은 글 생성 품질에 영향을 줍니다. 기본 6개 제품과 동일한 수준의 글을 얻으려면 모든 항목을 채워주세요.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-5">
            {/* 기본 정보 */}
            <section className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="product-name" className="text-xs">제품명 *</Label>
                  <Input
                    id="product-name"
                    value={payload.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder={PH.name}
                  />
                </div>
                <div>
                  <Label htmlFor="product-category" className="text-xs">카테고리 *</Label>
                  <Input
                    id="product-category"
                    list="seed-categories"
                    value={payload.category}
                    onChange={(e) => update("category", e.target.value)}
                    placeholder={PH.category}
                  />
                  <datalist id="seed-categories">
                    {SEED_CATEGORIES.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                </div>
              </div>
            </section>

            <Separator />

            {/* 제품 장점 */}
            <section className="space-y-2">
              <Label className="text-xs">제품 장점 *</Label>
              <Textarea
                rows={8}
                value={payload.defaultAdvantages}
                onChange={(e) => update("defaultAdvantages", e.target.value)}
                placeholder={PH.defaultAdvantages}
              />
            </section>

            <Separator />

            {/* 관련 증상/고민 */}
            <section className="space-y-2">
              <Label className="text-xs">관련 증상/고민 * (한 줄에 하나씩)</Label>
              <Textarea
                rows={6}
                value={arrayToLines(payload.relatedSymptoms)}
                onChange={(e) =>
                  update("relatedSymptoms", linesToArray(e.target.value))
                }
                placeholder={PH.relatedSymptoms}
              />
            </section>

            {/* 자연스러운 언급 패턴 */}
            <section className="space-y-2">
              <Label className="text-xs">
                자연스러운 언급 패턴 * (한 줄에 하나씩)
              </Label>
              <Textarea
                rows={4}
                value={arrayToLines(payload.naturalMentionPatterns)}
                onChange={(e) =>
                  update("naturalMentionPatterns", linesToArray(e.target.value))
                }
                placeholder={PH.naturalMentionPatterns}
              />
            </section>

            <Separator />

            {/* 핵심 방향성 */}
            <section className="space-y-2">
              <Label className="text-xs">핵심 방향성 *</Label>
              <Input
                value={payload.keyInsight}
                onChange={(e) => update("keyInsight", e.target.value)}
                placeholder={PH.keyInsight}
              />
            </section>

            {/* 감각 표현 */}
            <section className="space-y-2">
              <Label className="text-xs">감각 표현 * (한 줄에 하나씩)</Label>
              <Textarea
                rows={4}
                value={arrayToLines(payload.sensoryDetails)}
                onChange={(e) =>
                  update("sensoryDetails", linesToArray(e.target.value))
                }
                placeholder={PH.sensoryDetails}
              />
            </section>

            <Separator />

            {/* 실제 후기 */}
            <section className="space-y-2">
              <Label className="text-xs">실제 후기 * (한 줄에 하나씩)</Label>
              <Textarea
                rows={4}
                value={arrayToLines(payload.realReviews)}
                onChange={(e) =>
                  update("realReviews", linesToArray(e.target.value))
                }
                placeholder={PH.realReviews}
              />
              <p className="text-[11px] text-muted-foreground">
                ※ 따옴표 없이 자연스러운 문장 그대로 적어주세요. 양쪽 따옴표는 자동으로 정리됩니다.
              </p>
            </section>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={submitting}>
            {submitting ? "저장 중..." : initial ? "수정 저장" : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
