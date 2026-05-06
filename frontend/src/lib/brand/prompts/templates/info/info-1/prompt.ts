/**
 * 정보성글 변형 1 — Hook → Crisis → Solution → CTA 골격.
 *
 * 정보 제시 + 함정 폭로 + 해결책 + 가치 전환.
 * 후기성과는 다름 — 브랜드 시선의 정보 제공이며, 마무리에 우리 브랜드의 방식을 자연스럽게 노출.
 */
import type { BrandProfile } from "@/types/brand";
import { buildBrandContext } from "../../../brand-context";
import { buildNarratorRule } from "../../../narrator";
import { buildToneRule } from "../../../tone-extractor";
import { buildSharedRules, buildTopicSection } from "../../../shared";
import { INFO_1_REFERENCE } from "./reference";

interface BuildInfo1PromptOptions {
  profile: BrandProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  charCount: { min: number; max: number };
  requirements?: string;
}

const INFO_1_SKELETON = `[글 골격 — 정보성글 (Hook → Crisis → Solution → CTA)]

1. 후킹 — 도입부
   · 화자 자기 소개 (이름·직책 자연스럽게)
   · "최근 X에 대해 알아보시는 분들이 늘었다" 식 시장 흐름 언급
   · 가격/조건 차이로 인한 혼란 제기
   · "오늘 그 진실을 짚어드리겠습니다" 류로 본론 진입 명분 제시

2. Crisis 1 — 함정 폭로 (실질 정보 + 비유)
   · 메인 키워드 영역에서 흔히 보이는 미끼/거품 구조 폭로
   · 비유 1개 이상 활용 (예: "맛집 가서 밑반찬만 먹기")
   · 광고가 아닌 정보 톤으로 — 권위로 신뢰 형성

3. Crisis 2 — 추가 비용/리스크 공포
   · 표면 가격 외 숨겨진 손해 명시 (수치 활용)
   · 고객이 실제로 겪을 수 있는 부정 시나리오
   · "여행 마지막 날 청구서를 보고…" 류 구체 묘사

4. Solution — 우리만의 방식 (자랑 X, 정직 톤)
   · "솔직히 말씀드리면 X를 빼면 손님 모으기 쉽지만…"식 정직 토로
   · 우리의 약속 — 구체적 시스템 (수치·정책)
   · 공동구매·올인클루시브 등 차별점

5. CTA — 가치 전환
   · "X 여행이 아닌 Y 여행을 선택하세요" 류 프레임 전환
   · 광고 직접 표현 X — 초대 톤
   · 마지막에 화자의 약속·각오로 닫음

이미지 마커는 큰 섹션 전환 지점에 5~7개 배치.`;

export function buildInfo1Prompt(opts: BuildInfo1PromptOptions): string {
  const { profile, mainKeyword, subKeywords, topic, selectedTitle, charCount, requirements } = opts;

  const sections: string[] = [];

  sections.push(`당신은 한국어 브랜드 블로그를 쓰는 전문 에디터입니다.
아래 모든 정보를 종합해서 [정보성글] 한 편을 마크다운으로 작성하세요.`);

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
  sections.push(buildNarratorRule(profile, "info"));
  sections.push(buildToneRule(INFO_1_REFERENCE));

  sections.push(`[참고 레퍼런스 글 — 이 톤·구조·어휘를 학습할 것. 본문 자체는 베끼지 말 것]
${INFO_1_REFERENCE}`);

  sections.push(INFO_1_SKELETON);
  sections.push(buildSharedRules());

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
