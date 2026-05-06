/**
 * 소개글 — Origin Story (인물 서사형) 골격.
 *
 * 두 인물이 각자 섹션을 가지며 결합되는 스토리.
 * 위기 폭로보다 인물의 동기·신념·만남에 무게.
 */
import type { BrandProfile } from "@/types/brand";
import { buildBrandContext } from "../../brand-context";
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

const INTRO_SKELETON = `[글 골격 — 소개글 (Origin Story)]
이 글은 두 인물이 만나 브랜드를 만든 이야기입니다. 다음 흐름을 따르세요:

1. 후킹 — 도발적 한 줄로 시작
   · 예: "업계에 욕 좀 먹고 있습니다. 그래도 어쩔 수 없습니다."
   · 주변에서 들었던 비난/의심을 그대로 노출하며 강한 관심 유발
   · 이 글이 왜 쓰여졌는지 명분 제시

2. 인물 1 (1인칭 화자) 자기 소개와 결핍
   · 이름·직책 자연스럽게 노출
   · "저도 똑같이 X를 꿈꿨다"는 공감 형성
   · 시장에서 마주한 답답함·결핍 (가격 거품 / 정보 장벽 / 속 빈 강정 등)
   · "이 답답함이 나를 움직였다"는 결심으로 닫음

3. 인물 2 (보조 인물 — 3인칭으로 등장) 노하우와 고집
   · 화자가 인물 2를 소개 ("그때 저는 ~한 ${`<인물 2>`} 대표를 만났습니다")
   · 인물 2의 권위·근거를 구체 수치로 제시 (예: "10년간 직접", "30회 이상")
   · 인물 2의 신념·고집 — "단순히 상품을 파는 사람이 아닙니다" 류

4. 결합 — 브랜드 탄생
   · 두 사람의 만남과 합의
   · 기존 시장과 다른 우리만의 약속 (수치·구체 차별점 박기)
   · "그래서 [브랜드명]이 탄생했습니다" 류

5. 철학 — 우리는 다르다
   · 시장의 일반 방식 vs 우리의 방식 (대비 구조)
   · 비유 활용 (예: "관리 vs 동행", "맛집 가서 밑반찬만 먹기")

6. 감성 마무리 — 실제 에피소드
   · 고객의 단골 멘트 또는 감동 에피소드
   · 우리가 보여드리고 싶은 풍경
   · 마지막 한 줄 — "[브랜드명]과 함께하세요" 류 (광고 톤은 X, 초대 톤)

이미지 마커 ([이미지: ...])는 각 큰 섹션 전환 지점에 1개씩 자연스럽게 배치 (총 5~7개).`;

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
[메인 키워드] ${mainKeyword}${subKeywords ? `\n[보조 키워드] ${subKeywords}` : ""}${charCountLine}`);

  const topicSection = buildTopicSection(topic);
  if (topicSection) sections.push(topicSection);

  if (requirements && requirements.trim()) {
    sections.push(`[추가 요구사항]\n${requirements.trim()}`);
  }

  sections.push(buildBrandContext(profile));
  sections.push(buildNarratorRule(profile, "intro"));
  sections.push(buildToneRule(INTRO_REFERENCE));

  sections.push(`[참고 레퍼런스 글 — 이 톤·구조·어휘를 학습할 것. 본문 자체는 베끼지 말 것]
${INTRO_REFERENCE}`);

  sections.push(INTRO_SKELETON);
  sections.push(buildSharedRules());

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
