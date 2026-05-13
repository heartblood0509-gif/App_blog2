/**
 * 정보성글 변형 — 직접 레퍼런스 제공 모드.
 *
 * 사용자가 입력한 견본 글(referenceText)과 그 분석 결과(referenceAnalysis)를
 * 그대로 학습시켜, 같은 톤·서사 구조·소제목 패턴으로 새 글을 작성한다.
 *
 * 정보성글 정책 (info 전체 공통):
 *   - 본문/제목에 회사명·인물명·시그니처 노출 0
 *   - 브랜드 프로필 직접 주입 X. distill propositions를 보조 정보로 사용
 *   - 화자는 익명 업계 전문가 (견본 글에 화자가 명시돼 있어도 우리 브랜드로 치환 X)
 *
 * info-custom 특이사항:
 *   - 견본 글이 본문 톤·서사의 1순위. propositions는 "참고 정보"로 라벨링하여 톤 충돌 방지.
 *   - 골격(SKELETON) 미강제 — 견본 구조 자체가 골격.
 */
import type { BrandProfile, BrandProposition } from "@/types/brand";
import { buildAnonymousBrandContext } from "../../../brand-context";
import { buildAnonymousNarratorRule } from "../../../narrator";
import { buildToneRule } from "../../../tone-extractor";
import { buildExcerptPatternRule } from "../../../excerpt-pattern";
import {
  buildPropositionsBlock,
  buildSharedRulesForInfo,
  buildTopicSection,
} from "../../../shared";

interface BuildInfoCustomPromptOptions {
  profile: BrandProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  charCount: { min: number; max: number };
  requirements?: string;
  /** 사용자가 제공한 견본 글 본문 — 톤 통계 추출 입력으로만 사용. LLM에 주입하지 않음. */
  referenceText?: string;
  /** 견본 글에 대한 AI 구조 분석 결과 (서사·톤·소제목·SEO) — LLM에 주입 */
  referenceAnalysis?: string;
  /** distill API에서 추출한 정보 명제. 정보성글에서는 필수 */
  propositions?: BrandProposition[];
  /** 분석에서 추출된 본보기 문장 8개 — 통계 패턴으로만 변환되어 LLM에 주입 */
  referenceExcerpts?: string[];
}

export function buildInfoCustomPrompt(opts: BuildInfoCustomPromptOptions): string {
  const {
    profile,
    mainKeyword,
    subKeywords,
    topic,
    selectedTitle,
    charCount,
    requirements,
    referenceText,
    referenceAnalysis,
    propositions,
    referenceExcerpts,
  } = opts;

  if (!propositions || propositions.length === 0) {
    throw new Error(
      "정보성글 본문 생성에는 propositions가 필요합니다. distill API를 먼저 호출하세요."
    );
  }

  const sections: string[] = [];

  sections.push(`당신은 한국어 [정보성글]을 쓰는 전문 에디터입니다.
이 글은 일반 정보 제공이 목적이며, 특정 회사·인물을 알리는 글이 절대 아닙니다.
아래 모든 정보를 종합해서 마크다운 본문 한 편을 작성하세요.`);

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

  // 정보 명제 — 보조 재료 (견본 톤이 우선)
  sections.push(buildPropositionsBlock(propositions));

  sections.push(buildAnonymousBrandContext(profile));
  sections.push(buildAnonymousNarratorRule());

  // 톤 학습 — 사용자 견본 글의 통계만 추출 (원본 본문은 LLM에 미주입)
  if (referenceText && referenceText.trim().length > 0) {
    sections.push(buildToneRule(referenceText));
  }

  // EXCERPTS → 어미·호흡 패턴 통계로 변환 (원본 문장 자체는 미노출)
  if (referenceExcerpts && referenceExcerpts.length > 0) {
    const excerptRule = buildExcerptPatternRule(referenceExcerpts);
    if (excerptRule) sections.push(excerptRule);
  }

  // 견본 분석 결과 — 추출된 서사 구조·소제목·SEO 패턴 (원본 본문 X, 분석 마크다운만)
  if (referenceAnalysis && referenceAnalysis.trim().length > 0) {
    sections.push(`[견본 글 구조 분석 — AI가 추출한 패턴 정리. 새 글은 이 구조·흐름·소제목 패턴을 따를 것]
${referenceAnalysis.trim()}`);
  }

  // 핵심 지시 — 표절 차단 + 브랜드 노출 차단
  sections.push(`[핵심 지시 — 직접 레퍼런스 모드]
- 위 구조 분석의 서사 흐름·소제목 패턴·문단 호흡 분포를 따른다.
- 어휘·소재·사례·인물·금액·고유명사는 사용자 입력 메인 키워드와 브랜드 도메인에 맞춰 처음부터 새로 창작한다.
- 견본의 산업·지역·인물명이 분석 안에 잠복해 있으면 절대 본문에 그대로 사용하지 않는다.
- [정보 재료] 명제는 본문 흐름에 맞을 때만 보조적으로 활용한다. 모두 다 억지로 넣지 않는다.

[정보성글 본질 — 브랜드 노출 차단 (절대 위반 금지)]
- 정보성글은 "내 브랜드를 직접 언급하지 않는 것"이 본질이다. 광고처럼 보이는 순간 글 가치 0이 된다.
- 본문 전체의 95% 지점 이전 = 브랜드명·회사명·자사 서비스명·1인칭 자랑 0건. 마지막 1~2문장 외 등장 시 재작성.
- **브랜드명 노출은 선택 사항이다.** 글 흐름·개연성상 자연스러우면 마지막 1~2문장에만 짧게 (예: "지금까지 [브랜드명]였습니다."), 그렇지 않으면 전혀 노출하지 않아도 된다. 어느 쪽이든 정답.
- 본문 중간에 자사 강점·시그니처 표현·CTA 직접 노출 금지. 분석의 ④ 갈아끼우기 규칙대로 도메인 어휘로 풀어내라.
- 1인칭 화자가 브랜드 컨텍스트에 "X 대표 Y"로 박혀 있어도, 정보성글에서는 익명 전문가·업계 종사자 톤으로 작성한다. 화자 이름·소속 직접 노출 금지.
- 분석의 "## 브랜드 노출 정책" 섹션이 있다면 그 규칙을 우선 따른다.
- 광고 직접 표현 금지 — 마지막 단락은 "감사" 톤으로 닫는다.

[브랜드 컨텍스트 활용 정책]
- 시스템이 정보성글에서는 의도적으로 자사 식별 정보(회사명·인물명·서비스명·시그니처 표현·자랑 통계)를 컨텍스트에서 제거했다.
- 위에 주어진 [글 카테고리]·[공통의 적]·[금기]만 활용해 글을 쓴다.
- 도메인 지식·시장 통찰은 본문에 녹여 활용하되, 화자 정체성·소속·고유명사는 노출하지 않는다 ("우리 회사가 14년 했는데..." X / "이 업계 14년 경력자로서..." O).`);

  sections.push(buildSharedRulesForInfo({ mode: "follow-reference" }));

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
