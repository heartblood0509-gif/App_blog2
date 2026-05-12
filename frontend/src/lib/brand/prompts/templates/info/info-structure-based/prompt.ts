/**
 * 정보성글 변형 — 서사 구조 기반 작성.
 *
 * 입력: 보관함에서 선택된 분석 레코드 (analysis 마크다운 + flow + excerptPattern)
 * 핵심: 원본 견본 글 본문은 LLM에 절대 주입되지 않는다. 분석 결과만 전달.
 *       표절 위험 0 — 사용자 직관 "구조만 따라가면 된다"의 정공법 구현.
 */
import type { BrandProfile, AnalysisRecord } from "@/types/brand";
import { buildAnonymousBrandContext } from "../../../brand-context";
import { buildAnonymousNarratorRule } from "../../../narrator";
import { buildSharedRules, buildTopicSection } from "../../../shared";

interface BuildInfoStructureBasedPromptOptions {
  profile: BrandProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  charCount: { min: number; max: number };
  requirements?: string;
  /** 보관함에서 선택된 분석 레코드 (필수) */
  analysisRecord: AnalysisRecord;
}

export function buildInfoStructureBasedPrompt(
  opts: BuildInfoStructureBasedPromptOptions
): string {
  const {
    profile,
    mainKeyword,
    subKeywords,
    topic,
    selectedTitle,
    charCount,
    requirements,
    analysisRecord,
  } = opts;

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

  sections.push(buildAnonymousBrandContext(profile));
  sections.push(buildAnonymousNarratorRule());

  // 보관함 분석의 단계 라벨 — 본문 흐름 가이드
  if (analysisRecord.flow && analysisRecord.flow.length > 0) {
    sections.push(`[본문 흐름 — ${analysisRecord.flow.length}단계 순서대로 전개]
${analysisRecord.flow.map((step, i) => `${i + 1}. ${step}`).join("\n")}`);
  }

  // 어미·호흡 패턴 — 통계 요약만 (원본 문장 X)
  if (analysisRecord.excerptPattern && analysisRecord.excerptPattern.trim()) {
    sections.push(`[어미·호흡 패턴 — 이 결로 작성, 원본 본보기 문장은 비공개]
${analysisRecord.excerptPattern.trim()}`);
  }

  // 분석 마크다운 — 서사 구조·소제목·톤 가이드 (원본 글 본문 X)
  sections.push(`[서사 구조 분석 — 이 구조·소제목·톤 가이드를 따를 것]
${analysisRecord.analysis.trim()}`);

  // 핵심 지시 — 표절 차단 + 브랜드 노출 차단의 마지막 방어선
  sections.push(`[핵심 지시 — 서사 구조 기반 모드]
- 위 분석의 흐름·소제목 패턴·톤 분포만 흡수한다.
- 원본 견본 글의 본문은 시스템에서 의도적으로 숨겨두었으므로 LLM에 노출되지 않는다.
- 어휘·소재·사례·인물·금액·고유명사는 사용자 입력 메인 키워드와 브랜드 도메인에 맞춰 처음부터 새로 창작한다.
- 분석 안에 견본의 산업·지역·인물명이 잠복해 있더라도(예: 인테리어, 군산 등) 본문에 그대로 사용하지 않는다.

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

  sections.push(buildSharedRules({ mode: "follow-reference" }));

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
