/**
 * "내 템플릿 만들기" — 사용자가 직접 제공한 견본 글의 톤·서사 구조로 새 글을 생성.
 *
 * 기존 4개 *-custom 빌더(intro/info/value-proof/detail-custom)를 통합한 단일 빌더.
 * 톤 차이는 referenceMode 토글로 분기:
 *   - "branded": 1인칭 대표 + 자사 노출 (구 intro/value-proof/detail-custom 톤)
 *   - "anonymous": 익명 전문가 + 브랜드 비노출 (구 info-custom 톤)
 *
 * 견본 글 자체 파일 없음 — 런타임에 사용자 입력 동적 주입.
 */
import type { BrandProfile, BrandCustomReferenceMode } from "@/types/brand";
import { buildBrandContext, buildAnonymousBrandContext } from "../../brand-context";
import { buildNarratorRule, buildAnonymousNarratorRule } from "../../narrator";
import { buildToneRule } from "../../tone-extractor";
import { buildExcerptPatternRule } from "../../excerpt-pattern";
import { buildSharedRules, buildTopicSection } from "../../shared";

interface BuildCustomPromptOptions {
  profile: BrandProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  charCount: { min: number; max: number };
  requirements?: string;
  /** 브랜드 노출 모드 — UI 토글에서 결정. 기본값은 "branded". */
  referenceMode?: BrandCustomReferenceMode;
  /** 사용자가 제공한 견본 글 본문 — 톤 통계 추출 입력으로만 사용. LLM에 주입하지 않음. */
  referenceText?: string;
  /** 견본 글에 대한 AI 구조 분석 결과 (서사·톤·소제목·SEO) — LLM에 주입 */
  referenceAnalysis?: string;
  /** 분석에서 추출된 본보기 문장 — 통계 패턴으로만 변환되어 LLM에 주입 */
  referenceExcerpts?: string[];
}

export function buildCustomPrompt(opts: BuildCustomPromptOptions): string {
  const {
    profile,
    mainKeyword,
    subKeywords,
    topic,
    selectedTitle,
    charCount,
    requirements,
    referenceMode = "branded",
    referenceText,
    referenceAnalysis,
    referenceExcerpts,
  } = opts;

  const isAnonymous = referenceMode === "anonymous";

  const sections: string[] = [];

  sections.push(`당신은 한국어 브랜드 블로그를 쓰는 전문 에디터입니다.
아래 모든 정보를 종합해서 견본 글과 같은 톤·구조의 새 글 한 편을 마크다운으로 작성하세요.`);

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

  // 브랜드 컨텍스트 — referenceMode에 따라 노출/비노출 분기
  if (isAnonymous) {
    sections.push(buildAnonymousBrandContext(profile));
    sections.push(buildAnonymousNarratorRule());
  } else {
    sections.push(buildBrandContext(profile));
    sections.push(buildNarratorRule(profile, "intro"));
  }

  // 톤 학습 — 사용자 견본 글의 통계만 추출 (원본 본문은 LLM에 미주입)
  if (referenceText && referenceText.trim().length > 0) {
    sections.push(buildToneRule(referenceText));
  }

  // 어미·호흡 패턴 통계
  if (referenceExcerpts && referenceExcerpts.length > 0) {
    const excerptRule = buildExcerptPatternRule(referenceExcerpts);
    if (excerptRule) sections.push(excerptRule);
  }

  // 견본 분석 결과
  if (referenceAnalysis && referenceAnalysis.trim().length > 0) {
    sections.push(`[견본 글 구조 분석 — AI가 추출한 패턴 정리. 새 글은 이 구조·흐름·소제목 패턴을 따를 것]
${referenceAnalysis.trim()}`);
  }

  // 핵심 지시 — referenceMode 분기
  if (isAnonymous) {
    sections.push(`[핵심 지시 — 내 템플릿 만들기 (익명 톤)]
- 위 구조 분석의 서사 흐름·소제목 패턴·문단 호흡 분포를 따른다.
- 어휘·소재·사례·인물·금액·고유명사는 사용자 입력 메인 키워드와 브랜드 도메인에 맞춰 처음부터 새로 창작한다.
- 견본의 산업·지역·인물명이 분석 안에 잠복해 있으면 절대 본문에 그대로 사용하지 않는다.

[브랜드 노출 차단 (절대 위반 금지)]
- "내 브랜드를 직접 언급하지 않는 것"이 본질이다. 광고처럼 보이는 순간 글 가치 0이 된다.
- 본문 전체의 95% 지점 이전 = 브랜드명·회사명·자사 서비스명·1인칭 자랑 0건. 마지막 1~2문장 외 등장 시 재작성.
- **브랜드명 노출은 선택 사항이다.** 글 흐름·개연성상 자연스러우면 마지막 1~2문장에만 짧게 (예: "지금까지 [브랜드명]였습니다."), 그렇지 않으면 전혀 노출하지 않아도 된다.
- 본문 중간에 자사 강점·시그니처 표현·CTA 직접 노출 금지.
- 1인칭 화자가 브랜드 컨텍스트에 박혀 있어도, 익명 전문가·업계 종사자 톤으로 작성한다. 화자 이름·소속 직접 노출 금지.
- 분석의 "## 브랜드 노출 정책" 섹션이 있다면 그 규칙을 우선 따른다.
- 광고 직접 표현 금지 — 마지막 단락은 "감사" 톤으로 닫는다.

[브랜드 컨텍스트 활용 정책]
- 시스템이 의도적으로 자사 식별 정보(회사명·인물명·서비스명·시그니처 표현·자랑 통계)를 컨텍스트에서 제거했다.
- 위에 주어진 [글 카테고리]·[공통의 적]·[금기]만 활용해 글을 쓴다.
- 도메인 지식·시장 통찰은 본문에 녹여 활용하되, 화자 정체성·소속·고유명사는 노출하지 않는다 ("우리 회사가 14년 했는데..." X / "이 업계 14년 경력자로서..." O).`);
  } else {
    sections.push(`[핵심 지시 — 내 템플릿 만들기 (브랜드 노출 톤)]
- 위 구조 분석의 서사 흐름·소제목 패턴·문단 호흡 분포를 따른다.
- 어휘·소재·사례·인물·금액·고유명사는 사용자 입력 메인 키워드와 브랜드 도메인에 맞춰 처음부터 새로 창작한다.
- 견본의 산업·지역·인물명이 분석 안에 잠복해 있으면 절대 본문에 그대로 사용하지 않는다.

[1인칭 대표 톤 + 자사 노출 (절대 위반 금지)]
- 화자는 브랜드 컨텍스트의 ${`<narrator>`} (대표 본인). 이름·직책·경력을 자연스럽게 노출한다.
- 브랜드명·자사 서비스·시그니처 표현은 본문 전반에 자연스럽게 녹여낸다.
- 단, 광고 직접 표현("꼭 결제하세요" 등)은 금지. "감사"·"신뢰" 톤으로 닫는다.
- 견본 글에 "익명 전문가" 톤이 있더라도 새 글에서는 대표 본인 1인칭 ("저는...", "저희가...")으로 작성한다.
- 가격·일정·진행 방식 같은 실무 정보는 솔직하게 안내. 강매·과장 표현 금지.`);
  }

  sections.push(buildSharedRules({ mode: "follow-reference" }));

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
