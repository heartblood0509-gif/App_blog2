import type { ProductId, UserProduct } from "@/types";
import { toast } from "sonner";

/**
 * 공용 제품 기본 정보
 * 서버(brand-context.ts)와 클라이언트(product-selection-section.tsx) 모두 이 파일에서 임포트
 */
export interface ProductBase {
  id: ProductId;
  name: string;
  category: string;
  defaultAdvantages: string;
}

/**
 * v3 (시드 6개 영구 제거):
 * 50명 설치형 배포자가 직접 등록한 본인 브랜드 제품으로만 글을 만들도록 환경 정리.
 * isSeedProduct / isSeedProductName / getProductByIdFromBase 함수는 호출처 호환을 위해 유지
 * (빈 배열에 대해 항상 false / undefined 반환).
 */
export const PRODUCTS: ProductBase[] = [];

export function getProductByIdFromBase(id: string): ProductBase | undefined {
  return PRODUCTS.find((p) => p.id === id);
}

/** 사용자가 등록한 제품 목록 조회 — Next.js 캐싱으로 stale UI 방지를 위해 no-store */
export async function fetchUserProducts(): Promise<UserProduct[]> {
  try {
    const res = await fetch("/api/products", { cache: "no-store" });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch (err) {
    const msg = err instanceof Error ? err.message : "제품 목록을 불러오지 못했습니다.";
    toast.error(msg);
    return [];
  }
}

export function isSeedProduct(id: string): boolean {
  return PRODUCTS.some((p) => p.id === id);
}

export function isSeedProductName(name: string): boolean {
  const trimmed = name.trim();
  return PRODUCTS.some((p) => p.name === trimmed);
}
