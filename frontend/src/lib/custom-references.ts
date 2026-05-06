/**
 * 사용자가 "이름 붙여 저장"한 레퍼런스 분석 결과를 localStorage에 보관.
 * 후기성 / 브랜드 두 카테고리가 단일 키 안에 함께 저장되며, category 필드로 필터링.
 *
 * SSR 안전: 모든 함수는 typeof window === "undefined" 가드를 거침.
 */

import type { CustomReference, ReferenceCategory } from "@/types";

const STORAGE_KEY = "blogpick-custom-references";

function readAll(): CustomReference[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as CustomReference[];
  } catch {
    return [];
  }
}

function writeAll(refs: CustomReference[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(refs));
}

export function getAllReferences(): CustomReference[] {
  return readAll();
}

export function getReferences(category: ReferenceCategory): CustomReference[] {
  return readAll().filter((r) => r.category === category);
}

export function getReferenceById(id: string): CustomReference | null {
  return readAll().find((r) => r.id === id) ?? null;
}

export function saveReference(
  ref: Omit<CustomReference, "id" | "createdAt">
): CustomReference {
  const all = readAll();
  const created: CustomReference = {
    ...ref,
    id: `ref-${Date.now()}`,
    createdAt: new Date().toISOString(),
  };
  all.push(created);
  writeAll(all);
  return created;
}

export function deleteReference(id: string): void {
  writeAll(readAll().filter((r) => r.id !== id));
}

export function renameReference(id: string, name: string): CustomReference | null {
  const all = readAll();
  const target = all.find((r) => r.id === id);
  if (!target) return null;
  target.name = name;
  writeAll(all);
  return target;
}
