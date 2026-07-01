/**
 * 소개글 — 대표 신념 기반 소개형 (8단계) 골격.
 *
 * 대표/운영자가 직접 자신의 신념·철학·일하는 기준을 소개하는 글.
 * 경력 자랑보다 '어떤 마음으로 일하는가'에 무게.
 */
import type { BrandProfile } from "@/types/brand";
import { buildBrandContext, buildBrandDataMap } from "../../brand-context";
import { buildNarratorRule } from "../../narrator";
import { buildToneRule } from "../../tone-extractor";
import { buildSharedRules, buildTopicSection } from "../../shared";
import { INTRO_REFERENCE } from "./reference";

interface BuildIntroPromptOptions {
  profile: BrandProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  charCount: { min: number; max: number };
  requirements?: string;
}

const INTRO_SKELETON = `[글 골격 — 소개글 (대표 신념 기반 소개형, 8단계)]
이 글은 대표 또는 운영자가 직접 자신의 신념·철학·일하는 기준을 소개하는 글입니다. 아래 8단계 흐름을 그대로 따르세요.

## 1단계 — 대표 인사 + 신뢰 오프닝
- 대표/운영자가 직접 인사하며 시작
- 경력 / 경험 / 전문 분야 / 운영 기간 등 신뢰 요소를 짧게 소개
- 사용 패턴: "반갑습니다 ㅇㅇㅇ입니다", "ㅇㅇ년 동안 이 일을 해왔습니다", "지금까지 수많은 사례를 경험했습니다"
- 첫 문단에서 신뢰 확보 / 사람 자체를 먼저 소개 / 권위보다 안정감 형성 중심

## 2단계 — 객관적 경험 증명
- 실제 경험 수치 / 진행 사례 / 운영 이력 / 전문 분야 경험 등 객관적 근거 제시
- 사용 패턴: "지금까지 ㅇㅇ건 이상 진행", "다양한 사례를 경험", "오랜 기간 한 분야 집중"
- 과장보다 경험 중심 / 신뢰 기반 강화 / '믿을 수 있는 사람' 이미지

## 3단계 — 핵심 신념 선언
- 글 핵심 메시지를 선언형으로 제시
- 운영 철학 또는 일하는 기준 공개
- 사용 패턴: "가장 중요하게 생각하는 건", "이것만은 약속드립니다", "항상 이런 기준으로 일합니다"
- 소개글 핵심 구간 / 차별화 시작점 / 브랜드 방향성 형성

## 4단계 — 사람들이 느끼는 불안 공감
- 사람들이 실제로 느끼는 불안과 고민 설명
- 설명 부족 / 선택 어려움 / 비용 부담 / 불신 등 현실적인 감정 공감
- 사용 패턴: "왜 이렇게 어렵게 느껴질까", "제대로 선택한 게 맞을까", "괜히 불안해진다"
- 실제 속마음 묘사 / 공감 몰입 강화 / 독자가 자기 이야기처럼 느끼게 구성

## 5단계 — 시행착오 + 성장 과정 공개
- 처음부터 완벽하지 않았다는 점 공개
- 부족했던 부분 / 고민했던 과정 / 개선하려고 노력한 과정
- 사용 패턴: "솔직히 처음엔 잘 몰랐습니다", "그래서 더 공부하기 시작했습니다", "계속 기록하고 고민했습니다"
- 인간적인 진정성 형성 / 거리감 감소 / 성장형 이미지 구축

## 6단계 — 실제 현장 감정 묘사
- 실제 현장에서 자주 겪는 상황 설명
- 사람들이 느끼는 감정 / 긴장 / 고민 / 기대감 등 현실 장면 묘사
- 사용 패턴: "실제로 많이 긴장하십니다", "생각보다 걱정이 크더라고요", "이런 말씀을 자주 하십니다"
- 현장감 증가 / 감정 몰입 강화 / 독자가 상황을 상상하게 만듦

## 7단계 — 나만의 행동 방식 소개
- 단순 실력보다 '어떻게 대하는가' 설명
- 소통 방식 / 일하는 태도 / 응대 방식 / 문제 해결 방식 소개
- 사용 패턴: "저는 이렇게 설명드립니다", "최대한 편하게 도와드리려고 합니다", "충분히 이해하실 수 있도록 설명합니다"
- 인간적인 신뢰 형성 / 차별화 포인트 강화 / 감정적 안심 유도

## 8단계 — 따뜻한 신뢰 마무리
- 신념 재강조 / 감사 표현 / 부담 없는 문의 유도
- 사용 패턴: "믿고 찾아주셔도 좋습니다", "도움이 되었으면 좋겠습니다", "감사합니다"
- 강매 없음 / 브랜드 호감 유지 / 사람 자체에 대한 신뢰 강화

[소제목 스타일]
- 메인 스타일: 신념 선언형 / 감성 소개형 / 철학 기반 소개형
- 짧은 선언형 문장, 감정 메시지 강조, 핵심 가치 단독 배치
- 예시: "이것만은 약속드립니다", "가장 중요하게 생각하는 건", "결국 중요한 건 신뢰입니다", "저는 이렇게 생각합니다"

[문체]
- 감성적인 합니다체 + 친근한 구어체 혼합
- 짧은 문장 위주, 감정 묘사 많음, 실제 대화 느낌 사용
- 반복 감정 키워드: 신뢰 / 공감 / 진심 / 고민 / 안심 / 감사 / 책임감
- 시각 강조: 핵심 문장 단독 배치 / 감정 문장 강조 / 괄호 활용 / 실제 대화 인용 삽입 가능

[감정 흐름]
신뢰 인식 → 공감 → 불안 이해 → 진정성 인식 → 감정 몰입 → 안심 → 호감

[핵심 설득 방식]
- ❌ 단순 경력만 강조하지 않음
- ✔ 어떤 마음으로 일하는가 / 어떤 기준으로 운영하는가 / 왜 이런 철학을 가지게 되었는가를 설명하며 신뢰 형성

[SEO]
- 브랜드명 / 대표명 / 전문 분야 / 핵심 서비스 키워드 자연 반복 (전체 5~7회)
- 메인 키워드 첫 문단 1회 등장 필수
- 브랜드명 초반 반복, 대표 이름 자연 반복, 신뢰 키워드 반복`;

export function buildIntroPrompt(opts: BuildIntroPromptOptions): string {
  const { profile, mainKeyword, subKeywords, topic, selectedTitle, charCount, requirements } = opts;

  const sections: string[] = [];

  sections.push(`당신은 한국어 브랜드 블로그를 쓰는 전문 에디터입니다.
아래 모든 정보를 종합해서 [소개글] 한 편을 마크다운으로 작성하세요.`);

  // 글자수 강제는 LLM 퀄리티 저하의 주범 — 사용자가 명시 선택한 경우(min/max 양쪽 > 0)에만 박음
  const charCountLine =
    charCount.min > 0 && charCount.max > 0
      ? `\n[목표 글자수] ${charCount.min}~${charCount.max}자`
      : "";
  sections.push(`[글 제목] ${selectedTitle}
[메인 키워드] ${mainKeyword || "없음 (아래 주제 중심으로 작성)"}${subKeywords ? `\n[보조 키워드] ${subKeywords}` : ""}${charCountLine}`);

  const topicSection = buildTopicSection(topic);
  if (topicSection) sections.push(topicSection);

  if (requirements && requirements.trim()) {
    sections.push(`[추가 요구사항]\n${requirements.trim()}`);
  }

  sections.push(buildBrandContext(profile, "intro"));
  sections.push(buildNarratorRule(profile, "intro"));

  // 레퍼런스 견본 글이 있을 때만 톤 학습 + 레퍼런스 섹션 주입
  if (INTRO_REFERENCE && INTRO_REFERENCE.trim().length > 0) {
    sections.push(buildToneRule(INTRO_REFERENCE));
    sections.push(`[참고 레퍼런스 글 — 이 톤·구조·어휘를 학습할 것. 본문 자체는 베끼지 말 것]
${INTRO_REFERENCE}`);
  }

  sections.push(INTRO_SKELETON);
  sections.push(buildBrandDataMap("intro"));
  sections.push(buildSharedRules({ hasKeyword: Boolean(mainKeyword?.trim()) }));

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
