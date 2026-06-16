/**
 * 브랜드 글 정책 — 템플릿별 분기를 한 곳에 모은 단일 진실 소스.
 *
 * 빌더마다 `template === "intro"` 식 조건을 흩뿌리면 한 곳이라도 누락 시
 * (예: fix.ts 품질 보정 경로) 중복 비화가 되살아난다. 두 헬퍼로 중앙화한다.
 */
import type { BrandTemplateId } from "@/types/brand";

/**
 * 브랜드 컨텍스트 주입 모드.
 * - "full": 프로필 전체 주입 (detail/custom/fix(full)/info-legacy — 기존 동작).
 * - "intro": 소개글 — 스토리·경력 중심, 업계 폭로(villains) 제외, 고객 사례 포함.
 * - "value-proof": 가치입증글 — 탄생 스토리 극소화, 폭로·숫자·제3자 증명 중심.
 *
 * 정보성글의 "anonymous"는 별도 함수(buildAnonymousBrandContext)가 담당하므로 여기 없음.
 */
export type BrandContextMode = "full" | "intro" | "value-proof";

/** 템플릿 → 브랜드 컨텍스트 모드. intro/value-proof만 필터링, 그 외는 기존 그대로. */
export function getBrandContextMode(template: BrandTemplateId): BrandContextMode {
  if (template === "intro") return "intro";
  if (template === "value-proof") return "value-proof";
  return "full";
}

/**
 * 이 템플릿에서 제품 프로필 첨부를 허용하는가.
 * 소개글·가치입증글은 브랜드 자체 이야기라 제품 첨부 비활성 (D1).
 *
 * null/undefined(템플릿 미선택)는 true — 선택 전 기존 UI 노출을 유지하기 위함.
 */
export function canAttachBrandProduct(
  template: BrandTemplateId | null | undefined
): boolean {
  return template !== "intro" && template !== "value-proof";
}
