/**
 * 가치입증글 — 반전 고백 → 통찰 → 시장 폭로 → 권위 입증 골격.
 *
 * 자랑 일변도가 아닌, "우리도 실패했다"식 반전으로 신뢰를 쌓는 글.
 * 권위는 수치·구체 사례·시장 폭로로 자연스럽게 입증.
 */
import type { BrandProfile } from "@/types/brand";
import { buildBrandContext } from "../../brand-context";
import { buildNarratorRule } from "../../narrator";
import { buildToneRule } from "../../tone-extractor";
import { buildSharedRules, buildTopicSection } from "../../shared";
import { VALUE_PROOF_REFERENCE } from "./reference";

interface BuildValueProofPromptOptions {
  profile: BrandProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  charCount: { min: number; max: number };
  requirements?: string;
}

const VALUE_PROOF_SKELETON = `[글 골격 — 가치입증글 (반전 고백 → 통찰 → 시장 폭로 → 권위 입증)]

1. 후킹 — 반전 고백
   · "전문가도 실패했다" 식 의외성으로 시작
   · 화자가 자신의 실패·결핍을 솔직하게 노출 (자기 권위가 있음에도)
   · 숫자로 강도 표현 (예: "3주를 매달렸다", "50회 이상")
   · "그때 절실히 느꼈다 — X 만큼은 무조건 Y" 류로 인사이트 예고

2. 통찰 — 보편 인사이트
   · 화자의 실패에서 추출한 보편 진실 ("이 영역은 '지식'이 아니라 '경험'의 영역")
   · 독자가 처할 수 있는 비슷한 함정 묘사
   · "여러분의 1분 1초는 돈보다 귀합니다" 류 가치 정의

3. 시장 폭로 — 두 가지 함정
   · 시장의 부조리한 구조 분류 (예: 거품형 vs 미끼형)
   · 다단계·후불제·회원 모집 등 구체 사례 폭로
   · 본질적 문제 지적 ("그들의 본질은 X가 아니라 Y에 있습니다")

4. 권위 입증 — 우리는 다르다
   · 시장 양극단 문제를 우리가 어떻게 동시에 해결했는지
   · 구체 시스템·정책 제시 (올인클루시브, 직거래 등)
   · 자랑 X — 이미 폭로한 문제의 자연스러운 해결책으로 제시

5. 마무리 — 약속
   · "여러분은 그저 X만 즐기시면 됩니다" 류 안심 메시지
   · 주변의 비난을 감수하고도 가는 길에 대한 의지
   · "[브랜드명]이 끝까지 책임지겠습니다" 류로 닫음

이미지 마커는 큰 섹션 전환 지점에 5~7개 배치.`;

export function buildValueProofPrompt(opts: BuildValueProofPromptOptions): string {
  const { profile, mainKeyword, subKeywords, topic, selectedTitle, charCount, requirements } = opts;

  const sections: string[] = [];

  sections.push(`당신은 한국어 브랜드 블로그를 쓰는 전문 에디터입니다.
아래 모든 정보를 종합해서 [가치입증글] 한 편을 마크다운으로 작성하세요.`);

  // 글자수 강제는 LLM 퀄리티 저하의 주범 — 사용자가 명시 선택한 경우에만 박음
  const charCountLine =
    charCount.min > 0 && charCount.max > 0
      ? `\n[목표 글자수] ${charCount.min}~${charCount.max}자`
      : "";
  sections.push(`[글 제목] ${selectedTitle}
[메인 키워드] ${mainKeyword}${subKeywords ? `\n[보조 키워드] ${subKeywords}` : ""}${charCountLine}`);

  const topicSection = buildTopicSection(topic);
  if (topicSection) sections.push(topicSection);

  if (requirements && requirements.trim()) {
    sections.push(`[추가 요구사항]\n${requirements.trim()}`);
  }

  sections.push(buildBrandContext(profile));
  sections.push(buildNarratorRule(profile, "value-proof"));
  sections.push(buildToneRule(VALUE_PROOF_REFERENCE));

  sections.push(`[참고 레퍼런스 글 — 이 톤·구조·어휘를 학습할 것. 본문 자체는 베끼지 말 것]
${VALUE_PROOF_REFERENCE}`);

  sections.push(VALUE_PROOF_SKELETON);
  sections.push(buildSharedRules());

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
