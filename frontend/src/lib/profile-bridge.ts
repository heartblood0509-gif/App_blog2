/**
 * 브랜드 ↔ AEO 프로필 양방향 연동 헬퍼.
 *
 * 한쪽 프로필 신규 등록 직후, 다른 쪽 양식을 prefill 데이터로 열어주는
 * 공용 필드 매핑 + 중복 감지 함수.
 *
 * 매핑 대상 (의미상 같은 칸들):
 *   브랜드                              ↔  AEO
 *   name                                ↔  name + label
 *   category                            ↔  category
 *   oneLine                             ↔  oneLineIntro
 *   narrator.authority (multi-line)     ↔  identity.credentials (string[])  ← 글쓴이 경력·자격
 *   targets.primary                     ↔  audience                          ← 주 고객
 *   forbidden.forbiddenWords            ↔  forbidden.words
 *
 * 매핑하지 않는 필드는 각자 페르소나 특화이므로 사용자가 직접 입력.
 */
import type { BrandProfile } from "@/types/brand";
import type { AeoProfile } from "@/types/aeo";

/** 줄바꿈 string → 배열 (빈 줄 제거) */
const splitLines = (s: string | undefined): string[] =>
  (s ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** 배열 → 줄바꿈 string */
const joinLines = (arr: ReadonlyArray<string> | undefined): string =>
  (arr ?? []).filter(Boolean).join("\n");

/** 브랜드 → AEO prefill (신규 AEO 양식 초기값으로 사용) */
export function copyBrandToAeoPrefill(
  brand: BrandProfile,
): Partial<Omit<AeoProfile, "id">> {
  return {
    label: brand.name,
    name: brand.name,
    category: brand.category,
    oneLineIntro: brand.oneLine,
    // 브랜드의 글쓴이 경력·자격 → AEO 자격·경력 배열로 변환
    identity: {
      experience: "", // 브랜드엔 별도 칸 없음. 사용자가 직접 입력
      credentials: splitLines(brand.narrator?.authority),
    },
    // 브랜드의 주 고객 → AEO 누구에게 도움 주나
    audience: brand.targets?.primary ?? "",
    forbidden: {
      enabled: true,
      words: brand.forbidden?.forbiddenWords ?? [],
    },
  };
}

/** AEO → 브랜드 prefill (신규 브랜드 양식 초기값으로 사용) */
export function copyAeoToBrandPrefill(
  aeo: AeoProfile,
): Partial<Omit<BrandProfile, "id">> {
  // AEO 자격·경력 배열 → 브랜드 narrator.authority 줄바꿈 string으로
  const authorityLines = joinLines(aeo.identity?.credentials);
  // AEO experience(한 줄)도 있으면 맨 위에 합침
  const experience = aeo.identity?.experience?.trim();
  const mergedAuthority = experience
    ? [experience, authorityLines].filter(Boolean).join("\n")
    : authorityLines;

  return {
    name: aeo.name,
    category: aeo.category,
    oneLine: aeo.oneLineIntro,
    narrator: {
      name: "",
      role: "",
      authority: mergedAuthority,
      fixed: true,
    },
    targets: {
      primary: aeo.audience ?? "",
      secondary: "",
      tertiary: "",
    },
    forbidden: {
      competitorNames: true,
      forbiddenWords: aeo.forbidden?.words ?? [],
      adStyle: true,
    },
  };
}

/** 동일 이름의 짝 프로필이 이미 등록돼 있는지 검사 */
export function hasCounterpartProfile(
  name: string,
  counterpartList: ReadonlyArray<{ name?: string }>,
): boolean {
  const target = (name ?? "").trim();
  if (!target) return false;
  return counterpartList.some((p) => (p?.name ?? "").trim() === target);
}
