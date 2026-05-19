/**
 * 브랜드 프로필 → 정보 명제 추출 프롬프트 (Distill).
 *
 * 정보성글 전용 — 본문에 회사명·인물명·시그니처가 새는 문제를 차단하기 위해,
 * 본문 생성 전에 한 번 더 LLM을 호출해서 브랜드 자산을 일반 명제로 추상화한다.
 *
 * 추출 원칙:
 *   - 금기: 브랜드명, 대표·보조 인물 이름, 서비스 고유명사, 시그니처 표현 그대로 노출 0
 *   - 유지: 구체 수치(30~40%, 14년 등), 비유, 차별점의 핵심 메커니즘
 *   - 변환: "우리끼리09는 단체구매다" → "크루즈 시장에서 단체구매가 거품을 제거하는 유일한 구조다"
 *
 * 출력: JSON 배열 `[{statement, evidence, source}]` — 5~10개.
 */
import type { BrandProfile, BrandProposition } from "@/types/brand";

interface BuildDistillPromptOptions {
  profile: BrandProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
}

/** 명제 텍스트에 브랜드 식별자가 그대로 노출됐는지 검사. 검증 게이트용 */
export function detectBrandLeakInProposition(
  prop: BrandProposition,
  profile: BrandProfile
): string[] {
  const leaks: string[] = [];
  const haystack = `${prop.statement} ${prop.evidence}`;
  const candidates: string[] = [];
  // v2: label, supportingPersona, signaturePhrases 제거됨
  if (profile.name) candidates.push(profile.name);
  if (profile.narrator?.name) candidates.push(profile.narrator.name);
  for (const word of candidates) {
    if (!word) continue;
    if (haystack.includes(word)) leaks.push(word);
  }
  return leaks;
}

export function buildDistillPrompt(opts: BuildDistillPromptOptions): string {
  const { profile, mainKeyword, subKeywords, topic } = opts;

  const sections: string[] = [];

  sections.push(`당신은 브랜드 프로필을 "정보 명제(propositions)"로 추출·추상화하는 분석가입니다.

[목적]
이 명제들은 곧 작성될 [정보성글]의 본문 재료가 됩니다. 정보성글의 핵심 원칙은:
"본문은 일반 정보 제공처럼 보이되, 그 정보가 결과적으로 우리 사업과 일치한다."
즉 본문 어디에도 우리 회사명·대표 이름·서비스명·시그니처 표현이 등장하면 안 됩니다.
그래서 명제 단계에서부터 그것들을 모두 추상화해야 합니다.`);

  sections.push(`[메인 키워드] ${mainKeyword}`);
  if (subKeywords && subKeywords.trim()) {
    sections.push(`[보조 키워드] ${subKeywords}`);
  }
  if (topic && topic.trim()) {
    sections.push(`[글 주제] ${topic.trim()}`);
  }

  // 브랜드 프로필 — 풍성한 raw 데이터 (이건 추출 입력일 뿐, 본문 컨텍스트 X)
  sections.push(`[브랜드 프로필 — 추출 입력 자료]
이 정보를 보고 메인 키워드 도메인에 부합하는 일반 정보 명제로 추상화하세요.
- 이름: ${profile.name}
- 카테고리: ${profile.category}
- 한 줄 소개: ${profile.oneLine}
- 핵심 가치: ${(profile.coreValues || []).join(" / ")}
- 화자: ${profile.narrator?.name || ""} (${profile.narrator?.role || ""})
- 화자 경력·자격:
${(profile.narrator?.authority || "").split("\n").map((s) => s.trim()).filter(Boolean).map((a) => `  · ${a}`).join("\n") || "  (없음)"}
- 스토리(시작/위기/부활/만남): ${profile.story?.origin || ""} | ${profile.story?.crisis || ""} | ${profile.story?.revival || ""} | ${profile.story?.encounter || ""}
- 에피소드:
${(profile.episodes || []).map((e) => `  · [${e.type}] ${e.content}`).join("\n") || "  (없음)"}
- 추가 서비스:
${(profile.services || []).map((s) => `  · ${s}`).join("\n") || "  (없음)"}
- 차별점:
${(profile.differentiators || []).map((d) => `  · ${d}`).join("\n") || "  (없음)"}
- 빌런(공통의 적):
${(profile.villains || []).map((v) => `  · ${v}`).join("\n") || "  (없음)"}
- 추천 코스/상품:
${(profile.recommendedRoutes || []).map((r) => `  · ${r}`).join("\n") || "  (없음)"}`);

  // 추출 원칙
  sections.push(`[추출 원칙 — 절대 위반 금지]

1. 금기 (명제 텍스트에 절대 등장 X)
   - 브랜드명: "${profile.name}"
   - 인물 실명: "${profile.narrator?.name || ""}"
   - 자사 서비스·상품 고유명사
   - 자사 고유 시그니처 표현 그대로 인용 금지 (의미는 차용 OK, 문장 그대로는 X)
   - "저희", "우리 회사", "당사" 같은 1인칭 소유격
   - "업계 1위" 같은 자기 자랑 어휘

2. 유지 (명제에서 살릴 것)
   - 구체 수치 (예: 30~40% 절감, 14년 경력 → "10년 이상 누적 경력자", "30% 이상 가격 격차" 등 추상화)
   - 메커니즘·인과 관계 (단체구매가 거품을 제거하는 구조 등)
   - 비유의 본질 (구체 비유 표현은 일반화)
   - 도메인의 함정·리스크·차별점

3. 변환 패턴 (필수)
   - 자사 사례 → 일반 시장 명제로 일반화
   - "우리 X" → "X 영역에서는 ~한 구조다" / "X를 제대로 하려면 ~가 필요하다"
   - 인물 권위 → "10년 이상 현장 경력자가 ~하다" 같은 익명 권위로 환원

4. 갯수·길이
   - 5~10개 명제 (메인 키워드 도메인에 부합하는 것만 선별)
   - 각 명제: statement 1~2문장 (간결), evidence 1문장 (구체 근거)
   - 중복 명제 금지 (같은 메커니즘을 다른 표현으로 쪼개지 마라)

5. 메인 키워드 정합성
   - 모든 명제는 메인 키워드(${mainKeyword}) 도메인에서 의미가 통해야 한다
   - 메인 키워드와 무관한 자산은 추출 대상에서 제외`);

  sections.push(`[좋은 추출 예시]
{
  "statement": "크루즈 여행 가격을 실질적으로 줄이는 유일한 구조는 단체 공동구매다",
  "evidence": "선사 직거래 + 그룹 단가로 일반 패키지 대비 30~40% 격차가 발생한다",
  "source": "차별점·핵심가치"
}

{
  "statement": "표면 가격이 싼 크루즈는 기항지 옵션 비용으로 마지막 날 청구서가 두 배가 되는 경우가 흔하다",
  "evidence": "기항지 투어가 옵션인 상품은 1인당 수십만원 추가가 표준이다",
  "source": "빌런·차별점"
}

[나쁜 추출 예시 — 절대 이렇게 하지 말 것]
✗ "${profile.name}는 단체구매로 거품을 제거한다" (회사명 그대로 노출)
✗ "${profile.narrator?.name || "윤희"} 대표는 14년 경력이다" (인물 실명 노출)
✗ "캐리어 한 번만 풀면 된다" (자사 고유 슬로건 그대로 인용)`);

  sections.push(`[출력 형식 — 절대 위반 금지]
JSON 배열만 출력. 설명·접두어·코드블록 마커 X.

형식:
[
  {"statement": "...", "evidence": "...", "source": "..."},
  ...
]

source 라벨은 어느 프로필 항목에서 우러났는지 짧게 (예: "차별점#2", "글쓴이경력#3", "빌런").

검산: 5~10개인가? 모든 명제에 회사명·인물명·시그니처가 0건인가? 메인 키워드 도메인에서 통하는가?`);

  return sections.join("\n\n");
}
