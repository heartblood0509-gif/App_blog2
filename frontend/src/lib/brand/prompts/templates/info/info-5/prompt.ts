/**
 * 정보성글 변형 5 — 함정 폭로형.
 *
 * 빌런: 비양심·미끼형 업체, 사기성 광고
 * 톤: 분노+공감으로 시작 → 익명 전문가 권위 → 정보 정리로 마무리
 *
 * 정보성글 정책 (info 전체 공통):
 *   - 본문/제목에 회사명·인물명·시그니처 노출 0
 *   - 브랜드 프로필 직접 주입 X. 대신 distill로 추출한 정보 명제(propositions) 사용
 *   - 화자는 익명 업계 전문가
 */
import type { BrandProfile, BrandProposition } from "@/types/brand";
import { buildAnonymousExpertNarrator } from "../../../narrator";
import { buildToneRule } from "../../../tone-extractor";
import {
  buildSharedRulesForInfo,
  buildTopicSection,
  buildPropositionsBlock,
} from "../../../shared";
import { INFO_5_REFERENCE } from "./reference";

// INFO_5_REFERENCE 는 톤 통계 추출(buildToneRule) 입력으로만 사용한다.
// 견본 글 본문 자체는 LLM 프롬프트에 절대 주입하지 않는다 — 표절 차단의 핵심.

interface BuildInfo5PromptOptions {
  profile: BrandProfile;
  mainKeyword: string;
  subKeywords?: string;
  topic?: string | null;
  selectedTitle: string;
  charCount: { min: number; max: number };
  requirements?: string;
  /** distill API에서 추출한 정보 명제. 정보성글에서는 필수 */
  propositions?: BrandProposition[];
}

const INFO_5_SKELETON = `[글 골격 — 정보성글 (함정 폭로형)]

1. 후킹 — 피해 사례 인용
   · 실제 피해자의 말을 따옴표로 인용 (예: "사기 당한건가요?", "눈탱이 맞은 것 같아요")
   · 짧고 강한 감정 단어로 시작 (불안·공감 즉시 형성)
   · 두 줄 이상의 인용을 연속 배치 → 강한 도입

2. 타겟 필터링·경고
   · "이미 X를 끝낸 사람은 100% 후회한다" 류 경고
   · 특정 조건(예산·상황) 충족하는 독자만 남김 — 글의 가치 상승 효과
   · 읽지 말라고 말하면서 오히려 읽고 싶게 만드는 역설 활용

3. 전문가 시각의 분석 (자기 고백 X, 사명감 X)
   · "현장에 있어보면 알 수 있는 사실들" 류 익명 전문가 톤
   · 빌런(미끼형 업체)이 어떻게 함정을 만드는지 메커니즘 설명
   · 도메인의 일반 구조·관행을 분석하듯 풀어냄
   · 자기 회사·자기 이름·자기 회사 일화를 본문에 노출 X (개인 일화는 익명 전문가의 일반화된 경험으로 환원)

4. 주의사항 N가지 (본론 — 반드시 인용구 소제목)
   · "목숨걸고 조심해야 할 N가지" 류 강력한 메인 소제목 (##{postit})
   · 첫째/둘째/셋째 식 인라인 번호로 N가지 풀어냄
   · 각 항목마다 구체 수치·일화·비유 활용 (단, 자사 일화 X — 일반 시장 사례·도메인 관행으로)
   · 셋째 같은 큰 항목 안에 추가 인용구 소제목으로 세분화 가능
   · 단정형 어미 + 시각적 강조(절.대.로, 비.양.심. 등 단어 사이 마침표)

5. 정보 정리 — 마무리
   · 앞서 풀어낸 주의사항·메커니즘을 한 번 더 짧게 정리
   · "정보가 도움이 되셨길 바랍니다" 류 정중한 닫음
   · 회사명·브랜드명·CTA 노출 X. 정보 제공으로 깔끔하게 마무리

[톤·말투 힌트]
- 95% 구어체 ("~하실껍니다", "~이겠죠?", "~말입니다")
- 단정형 어미로 권위 형성 ("~입니다", "~할 껍니다", "~마련입니다")
- 짧은 문장 위주, 거의 모든 문장이 하나의 문단을 형성할 정도로 잦은 줄바꿈
- 감정 단어 직설 사용 ("사기", "눈탱이", "비양심", "분노", "뼈 시리도록")
- 시각적 강조 — 단어 사이 마침표 ("절.대.로", "비.양.심.")

[표절 차단 — 절대 위반 금지]
- 위 6단계 골격은 "흐름·전개 순서"만 가이드한다. 어떤 문장도 그대로 가져다 쓰지 마라.
- 본문의 산업·지역·사례·인물·금액·고유명사는 모두 사용자 입력 메인 키워드와 브랜드 도메인에 맞춰 새로 창작한다.
- 위 골격에 등장한 따옴표 안 예시("...")는 패턴 힌트일 뿐이다. 같은 표현을 그대로 쓰지 말고 본문의 도메인에 맞는 새 표현으로 작성한다.

이미지 마커는 큰 섹션 전환 지점에 5~7개 배치.`;

export function buildInfo5Prompt(opts: BuildInfo5PromptOptions): string {
  const { mainKeyword, subKeywords, topic, selectedTitle, charCount, requirements, propositions } = opts;

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

  // 정보 명제 — 브랜드 프로필 대신 이걸 본문 재료로
  sections.push(buildPropositionsBlock(propositions));

  // 화자는 익명 전문가 (회사·이름 식별 단서 0)
  sections.push(buildAnonymousExpertNarrator());

  // 톤은 견본 글에서 추출 (브랜드 의존 X)
  sections.push(buildToneRule(INFO_5_REFERENCE));

  sections.push(INFO_5_SKELETON);

  // 정보성글 전용 공통 규칙 (BRAND_ZERO_EXPOSURE_RULES 포함, BRAND_ASSET_USAGE_RULES 제외)
  sections.push(buildSharedRulesForInfo());

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
