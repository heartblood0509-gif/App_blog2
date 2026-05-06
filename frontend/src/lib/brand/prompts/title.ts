/**
 * 브랜드 제목 생성 프롬프트.
 *
 * 사용자 명시 규칙 + 레퍼런스 어휘 학습:
 *   - 메인 키워드로 시작
 *   - 문장부호 0
 *   - 5개 이상 후보
 *   - 후킹은 도발적 단어 활용
 */
import type { BrandProfile, BrandTemplateId } from "@/types/brand";
import { buildBrandContext } from "./brand-context";
import { buildToneRule } from "./tone-extractor";
import { buildTopicSection, BRAND_TITLE_RULES } from "./shared";
import { getTemplateReference } from "./template-loader";

interface BuildTitlePromptOptions {
  profile: BrandProfile;
  template: BrandTemplateId;
  infoVariantId?: string | null;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  count?: number;
}

export function buildBrandTitlePrompt(opts: BuildTitlePromptOptions): string {
  const { profile, template, infoVariantId, mainKeyword, subKeywords, topic, count = 5 } = opts;
  const reference = getTemplateReference(template, infoVariantId);

  const sections: string[] = [];

  sections.push(`당신은 한국어 브랜드 블로그 제목을 짓는 전문 카피라이터입니다.
다음 브랜드의 ${count}개 이상의 제목 후보를 만들어주세요.`);

  sections.push(buildBrandContext(profile));

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

  sections.push(`[출력 형식 — 절대 위반 금지]
JSON 배열만 출력. 설명·접두어·코드 블록 마커 X.
형식: [{"title": "제목 1", "type": "후킹 유형 한 단어"}, ...]
type 예시: "도발", "반전", "수치", "공포", "공감"`);

  return sections.join("\n\n");
}
