/**
 * 정보성글 변형 2 — 방식 비교 모드 (자유여행 vs 패키지).
 *
 * 톤: 자기고백·반전. "혼자 직구로 다 했지만 결국 시설 절반도 못 누림" 식 자기 경험 폭로 → 신뢰 형성.
 * 빌런: 자유여행의 정보 격차 + 흔한 패키지의 부실함.
 */
import type { BrandProfile } from "@/types/brand";
import { buildBrandContext } from "../../../brand-context";
import { buildNarratorRule } from "../../../narrator";
import { buildToneRule } from "../../../tone-extractor";
import { buildSharedRules, buildTopicSection } from "../../../shared";
import { INFO_2_REFERENCE } from "./reference";

interface BuildInfo2PromptOptions {
  profile: BrandProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  charCount: { min: number; max: number };
  requirements?: string;
}

const INFO_2_SKELETON = `[글 골격 — 정보성글 (방식 비교: 자유여행 vs 패키지)]

1. 후킹 — 도입부
   · 고객의 실제 갈등 인용 (자유여행 vs 패키지 양쪽 불안 따옴표 인용)
   · "자유여행이 더 싸 보이지만…" 식 통념 흔들기
   · 본론 진입 명분 제시

2. 자기고백 — 화자의 시도와 실패
   · 화자가 직접 자유여행/직구를 시도해본 경험
   · "정보 검색·분석에는 자신 있었지만 결과는 처참했다" 식 자기 폭로
   · 깨달음 — "공부가 아니라 대접받아야 하는 여행"
   · 임두환 같은 전문가와 손잡은 명분 자연스럽게 노출

3. 본론 — 전문가 동행의 가치 (4개 정도 소제목)
   · "정보 격차 = 돈의 손해" — 검색창에 안 나오는 디테일
   · 차별화 루트 — 흔한 패키지가 못 가는 도시 조합
   · 핵심 도시는 '진짜' 가는 설계 (예: 시내 호텔 1박 같은 차별점)
   · 정직한 올인클루시브 — 미끼 가격 거부

4. 마무리 — 가치 전환
   · "공부하지 말고 대접받으며 누리세요" 류 프레임 전환
   · 화자의 약속·각오로 닫음
   · 광고 직접 표현 X

이미지 마커는 큰 섹션 전환 지점에 5~7개 배치.`;

export function buildInfo2Prompt(opts: BuildInfo2PromptOptions): string {
  const { profile, mainKeyword, subKeywords, topic, selectedTitle, charCount, requirements } = opts;

  const sections: string[] = [];

  sections.push(`당신은 한국어 브랜드 블로그를 쓰는 전문 에디터입니다.
아래 모든 정보를 종합해서 [정보성글] 한 편을 마크다운으로 작성하세요.`);

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
  sections.push(buildToneRule(INFO_2_REFERENCE));

  sections.push(`[참고 레퍼런스 글 — 이 톤·구조·어휘를 학습할 것. 본문 자체는 베끼지 말 것]
${INFO_2_REFERENCE}`);

  sections.push(INFO_2_SKELETON);
  sections.push(buildSharedRules());

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
