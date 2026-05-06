/**
 * 정보성글 변형 4 — 가치 비교 모드 (모든 유럽 여행 방식 vs 크루즈) — 최종장.
 *
 * 톤: 우아·정의. "여행의 본질은 고생이 아니라 대접" 프레임으로 모든 어설픈 방식을 동시 비판.
 * 빌런: 자유여행의 불안 + 패키지의 획일화 — 양쪽 동시 비판.
 * 마무리: 감동 에피소드(브랜드 컨텍스트의 episodes 중 분위기 맞는 것)로 자연스럽게 닫음.
 */
import type { BrandProfile } from "@/types/brand";
import { buildBrandContext } from "../../../brand-context";
import { buildNarratorRule } from "../../../narrator";
import { buildToneRule } from "../../../tone-extractor";
import { buildSharedRules, buildTopicSection } from "../../../shared";
import { INFO_4_REFERENCE } from "./reference";

interface BuildInfo4PromptOptions {
  profile: BrandProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  charCount: { min: number; max: number };
  requirements?: string;
}

const INFO_4_SKELETON = `[글 골격 — 정보성글 (가치 비교: 모든 유럽 여행 방식 vs 크루즈) — 최종장]

1. 후킹 — 도입부
   · 사소하지만 공감 가는 디테일 (예: "캐리어와의 전쟁", "깃발 쫓아다니기")
   · 자유여행 vs 패키지 양쪽 갈등을 따옴표로 인용
   · 본론 진입 명분

2. 본론 — 양쪽 동시 비판 + 우리만의 답 (4개 정도 소제목)
   · 이동 — 버스 vs 5성급 리조트 (자고 나면 나라가 바뀌는 낭만)
   · 자유여행 환상 깨기 — "정보가 아니라 대응"의 문제
   · 짐 — 옷장이 통째로 이동하는 여유
   · 가격 — 정직한 올인클루시브의 품격

3. 한정 스케줄 노출 (선택)
   · 코스별 차별점·잔여석 분위기 (광고 직접 표현 X)

4. 마무리 — 감동 에피소드로 닫기
   · 브랜드 컨텍스트의 episodes 중 신뢰·여유·휴식 문맥에 맞는 1개를 자연스럽게 활용
   · 강제 X — 글 흐름과 맞을 때만, 같은 표현 반복 금지
   · "여행의 본질은 고생이 아니라 대접" 프레임으로 닫음
   · 화자의 동행 약속

이미지 마커는 큰 섹션 전환 지점에 5~7개 배치.`;

export function buildInfo4Prompt(opts: BuildInfo4PromptOptions): string {
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
  sections.push(buildToneRule(INFO_4_REFERENCE));

  sections.push(`[참고 레퍼런스 글 — 이 톤·구조·어휘를 학습할 것. 본문 자체는 베끼지 말 것]
${INFO_4_REFERENCE}`);

  sections.push(INFO_4_SKELETON);
  sections.push(buildSharedRules());

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
