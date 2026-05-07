/**
 * 브랜드 제목 생성 프롬프트.
 *
 * 사용자 명시 규칙 + 레퍼런스 어휘 학습:
 *   - 메인 키워드로 시작
 *   - 문장부호 0
 *   - 5개 이상 후보
 *   - 후킹은 도발적 단어 활용
 *
 * 정보성글(template === "info") 분기:
 *   - buildBrandContext 미주입 (회사명 노출 차단)
 *   - 대신 propositions를 컨텍스트로 사용 (제목이 명제 톤과 어울리게)
 *   - BRAND_ZERO_EXPOSURE_RULES 강제
 */
import type { BrandProfile, BrandTemplateId, BrandProposition } from "@/types/brand";
import { buildBrandContext } from "./brand-context";
import { buildToneRule } from "./tone-extractor";
import {
  buildTopicSection,
  BRAND_TITLE_RULES,
  BRAND_ZERO_EXPOSURE_RULES,
  buildPropositionsBlock,
} from "./shared";
import { getTemplateReference } from "./template-loader";

interface BuildTitlePromptOptions {
  profile: BrandProfile;
  template: BrandTemplateId;
  infoVariantId?: string | null;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  count?: number;
  /** 정보성글 전용 — distill 결과 */
  propositions?: BrandProposition[];
}

export function buildBrandTitlePrompt(opts: BuildTitlePromptOptions): string {
  const {
    profile,
    template,
    infoVariantId,
    mainKeyword,
    subKeywords,
    topic,
    count = 5,
    propositions,
  } = opts;
  const reference = getTemplateReference(template, infoVariantId);
  const isInfo = template === "info";

  const sections: string[] = [];

  if (isInfo) {
    sections.push(`당신은 한국어 [정보성글] 제목을 짓는 전문 카피라이터입니다.
이 글은 일반 정보 제공이 목적이며, 특정 회사·인물을 알리는 글이 아닙니다.
제목에도 회사명·인물명·자사 서비스 고유명사가 절대 등장해서는 안 됩니다.
${count}개 이상의 제목 후보를 만들어주세요.`);
  } else {
    sections.push(`당신은 한국어 브랜드 블로그 제목을 짓는 전문 카피라이터입니다.
다음 브랜드의 ${count}개 이상의 제목 후보를 만들어주세요.`);
  }

  // 정보성글: 브랜드 컨텍스트 미주입, 명제 컨텍스트 사용
  // 그 외: 기존대로 브랜드 컨텍스트 주입
  if (isInfo) {
    if (propositions && propositions.length > 0) {
      sections.push(buildPropositionsBlock(propositions));
    }
  } else {
    sections.push(buildBrandContext(profile));
  }

  sections.push(`[메인 키워드] ${mainKeyword}`);
  if (subKeywords && subKeywords.trim()) {
    sections.push(`[보조 키워드] ${subKeywords}`);
  }

  const topicSection = buildTopicSection(topic);
  if (topicSection) sections.push(topicSection);

  if (reference) {
    sections.push(buildToneRule(reference));
    sections.push(`[참고 레퍼런스 글의 제목 톤]
"${reference.split("\n")[0]}"
↑ 이런 결의 후킹 어휘(배신, 함정, 진실, 실패 등)와 도발적 톤을 학습하되, 본문 자체는 베끼지 말고 메인 키워드를 첫 단어로 한 새 제목을 만들 것.`);
  }

  sections.push(BRAND_TITLE_RULES);

  // 정보성글 — 노출 0 강제
  if (isInfo) {
    sections.push(BRAND_ZERO_EXPOSURE_RULES);
  }

  sections.push(`[출력 형식 — 절대 위반 금지]
JSON 배열만 출력. 설명·접두어·코드 블록 마커 X.
형식: [{"title": "제목 1", "type": "후킹 유형 한 단어"}, ...]
type 예시: "도발", "반전", "수치", "공포", "공감"`);

  return sections.join("\n\n");
}
