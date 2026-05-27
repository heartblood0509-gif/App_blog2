"use client";

/**
 * 브랜드/AEO 모드에서 후기성 제품 풀을 "선택사항"으로 첨부하는 섹션.
 *
 * V1 제약 (계획서 안전장치 A8):
 * - 등록 버튼 없음 (제품 등록은 후기성 모드에서만)
 * - 단일 선택만 (다중 첨부는 V2)
 * - 디폴트는 "없음"
 *
 * NEXT_PUBLIC_ENABLE_PRODUCT_ATTACH=1일 때만 step-narrative에서 렌더 (A9).
 */
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Package, Paperclip } from "lucide-react";
import type { ProductId, UserProduct } from "@/types";
import { PRODUCTS } from "@/lib/products";

interface AttachedProductSectionProps {
  mode: "brand" | "aeo";
  value: ProductId | undefined;
  onChange: (productId: ProductId | undefined) => void;
  userProducts: UserProduct[];
}

export function AttachedProductSection({
  mode,
  value,
  onChange,
  userProducts,
}: AttachedProductSectionProps) {
  // 시드 제품 + 사용자 등록 제품 모두 첨부 후보로 노출
  const allOptions = [
    ...PRODUCTS.map((p) => ({ id: p.id, name: p.name, category: p.category })),
    ...userProducts.map((u) => ({ id: u.id, name: u.name, category: u.category })),
  ];

  const isEmpty = allOptions.length === 0;
  const modeLabel = mode === "brand" ? "브랜드" : "AEO";
  const fallbackDescription =
    mode === "brand"
      ? "비워두면 브랜드와 관련된 내용으로 글이 작성됩니다"
      : "비워두면 AEO 프로필 도메인 관련 내용으로 글이 작성됩니다";

  return (
    <section>
      <div className="mb-4">
        <h2 className="flex items-center gap-2 text-xl font-semibold">
          <Paperclip className="h-5 w-5 text-primary" />
          제품 프로필 (선택)
          <Badge variant="secondary" className="text-[10px]">선택</Badge>
        </h2>
        <p className="mt-1 text-sm font-medium text-red-600 dark:text-red-400">
          이 {modeLabel} 글에서 다룰 특정 제품이 있나요? 첨부하면 글의 컨텍스트로 활용됩니다. {fallbackDescription}.
        </p>
      </div>

      {isEmpty ? (
        <Card>
          <CardContent className="py-6 text-center text-sm text-muted-foreground">
            <Package className="mx-auto mb-2 h-8 w-8 opacity-50" />
            <p>등록된 제품이 없습니다.</p>
            <p className="mt-1 text-xs">
              후기성 블로그 모드에서 제품을 먼저 등록하시면 여기에 나타납니다.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
          {/* "없음" 카드 — 디폴트 */}
          <Card
            onClick={() => onChange(undefined)}
            className={`cursor-pointer transition-all ${
              !value
                ? "ring-2 ring-primary bg-primary/5"
                : "hover:ring-1 hover:ring-muted-foreground/30"
            }`}
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">없음</CardTitle>
                {!value && (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary">
                    <Check className="h-3.5 w-3.5 text-primary-foreground" />
                  </div>
                )}
              </div>
              <CardDescription className="text-xs">
                {modeLabel} 정보 전반에 대해 작성
              </CardDescription>
            </CardHeader>
          </Card>

          {allOptions.map((opt) => {
            const selected = value === opt.id;
            return (
              <Card
                key={opt.id}
                onClick={() => onChange(opt.id)}
                className={`cursor-pointer transition-all ${
                  selected
                    ? "ring-2 ring-primary bg-primary/5"
                    : "hover:ring-1 hover:ring-muted-foreground/30"
                }`}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <Package className="h-4 w-4 text-primary shrink-0" />
                      <CardTitle className="text-sm truncate">{opt.name}</CardTitle>
                    </div>
                    {selected && (
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary shrink-0">
                        <Check className="h-3.5 w-3.5 text-primary-foreground" />
                      </div>
                    )}
                  </div>
                  <CardDescription className="text-xs">{opt.category}</CardDescription>
                </CardHeader>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
