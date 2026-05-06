/**
 * 정보성글 변형 3 — 수단 비교 모드 (유럽 일반 패키지(버스) vs 크루즈 패키지).
 *
 * 톤: 비교 대비·통쾌. 버스 7시간 / 매일 짐싸기 같은 체력 소모 디테일을 직격으로 때림.
 * 빌런: 일반 지상 패키지의 고질병.
 */
import type { BrandProfile } from "@/types/brand";
import { buildBrandContext } from "../../../brand-context";
import { buildNarratorRule } from "../../../narrator";
import { buildToneRule } from "../../../tone-extractor";
import { buildSharedRules, buildTopicSection } from "../../../shared";
import { INFO_3_REFERENCE } from "./reference";

interface BuildInfo3PromptOptions {
  profile: BrandProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  charCount: { min: number; max: number };
  requirements?: string;
}

const INFO_3_SKELETON = `[글 골격 — 정보성글 (수단 비교: 일반 패키지(버스) vs 크루즈)]

1. 후킹 — 도입부
   · 일반 유럽 패키지의 후기 인용 ("버스만 타다 왔다", "매일 새벽 짐 싸기")
   · 화자의 공부 경험 자연스럽게 노출
   · "유럽 여행의 치트키"라는 프레임 깔기

2. 비교 본론 (4~5개 소제목, 각각 "일반 vs 크루즈" 대비 구조)
   · 이동 — 버스 좁은 7시간 vs 5성급 호텔에서 자고 일어나면 다음 나라
   · 짐 — 매일 짐 싸기 vs 첫날 한 번만, 옷장이 따라옴
   · 간섭/안심 — 패키지 구속 + 자유여행 막막함을 동시에 해결
   · 가격 — 미끼 가격의 함정 + 정직한 올인클루시브
   · (선택) 스케줄 — 한정 출발 일정 노출

3. 마무리 — 행동 유도
   · "패키지로 가되, 고생은 하기 싫다" 류 합리적 여행자 호명
   · 한정·선착순 분위기는 자연스럽게 (광고 직접 표현 X)
   · 화자의 각오로 닫음

이미지 마커는 큰 섹션 전환 지점에 5~7개 배치.`;

export function buildInfo3Prompt(opts: BuildInfo3PromptOptions): string {
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
  sections.push(buildToneRule(INFO_3_REFERENCE));

  sections.push(`[참고 레퍼런스 글 — 이 톤·구조·어휘를 학습할 것. 본문 자체는 베끼지 말 것]
${INFO_3_REFERENCE}`);

  sections.push(INFO_3_SKELETON);
  sections.push(buildSharedRules());

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
