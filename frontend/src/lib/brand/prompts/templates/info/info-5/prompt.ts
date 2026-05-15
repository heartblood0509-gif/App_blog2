/**
 * 정보성글 변형 5 — 함정 폭로형.
 *
 * 빌런: 비양심·미끼형 업체, 사기성 광고
 * 톤: 분노+공감으로 시작 → 전문가 권위 → 부드러운 CTA로 마무리
 * 핵심 무기: 피해 사례 인용 + 타겟 필터링 + 자기 고백 + 주의사항 N가지 + 객관 입장
 */
import type { BrandProfile } from "@/types/brand";
import { buildBrandContext } from "../../../brand-context";
import { buildNarratorRule } from "../../../narrator";
import { buildToneRule } from "../../../tone-extractor";
import { buildSharedRules, buildTopicSection } from "../../../shared";
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

3. 자기 고백 + 사명감
   · 작가가 과거 비슷한 좌절을 겪은 일화 공유 (전문가 진정성)
   · 비양심 업체 때문에 분노했던 경험
   · "피해자에게 알려야겠다" 사명감으로 글 작성 동기 명시

4. 주의사항 N가지 (본론 — 반드시 인용구 소제목)
   · "목숨걸고 조심해야 할 N가지" 류 강력한 메인 소제목 (##{postit})
   · 첫째/둘째/셋째 식 인라인 번호로 N가지 풀어냄
   · 각 항목마다 구체 수치·일화·비유 활용
   · 셋째 같은 큰 항목 안에 추가 인용구 소제목으로 세분화 가능
   · 단정형 어미 + 시각적 강조(절.대.로, 비.양.심. 등 단어 사이 마침표)

5. 객관 입장 — 상업성 유보
   · "꼭 저희한테 맡기란 말 아닙니다" 류 겸손 한 마디
   · "폭로가 된 글" 같은 자기 성찰 표현
   · 우리 업체가 누구인지는 일부러 마지막까지 밝히지 않음

6. 부드러운 CTA — 마무리
   · "도움이 되셨다면 필요하신 분들만 문의해주세요" 류 부드러운 초대
   · 브랜드명은 글 마지막 1~2문장에서만 노출 (글의 ~95% 지점)
   · 광고 직접 표현 금지 — "감사" 톤으로 닫음

[톤·말투 힌트]
- 95% 구어체 ("~하실껍니다", "~이겠죠?", "~말입니다")
- 단정형 어미로 권위 형성 ("~입니다", "~할 껍니다", "~마련입니다")
- 감정 단어 직설 사용 ("사기", "눈탱이", "비양심", "분노", "뼈 시리도록")
- 시각적 강조 — 단어 사이 마침표 ("절.대.로", "비.양.심.")

[표절 차단 — 절대 위반 금지]
- 위 6단계 골격은 "흐름·전개 순서"만 가이드한다. 어떤 문장도 그대로 가져다 쓰지 마라.
- 본문의 산업·지역·사례·인물·금액·고유명사는 모두 사용자 입력 메인 키워드와 브랜드 도메인에 맞춰 새로 창작한다.
- 위 골격에 등장한 따옴표 안 예시("...")는 패턴 힌트일 뿐이다. 같은 표현을 그대로 쓰지 말고 본문의 도메인에 맞는 새 표현으로 작성한다.

이미지 마커는 큰 섹션 전환 지점에 5~7개 배치.`;

export function buildInfo5Prompt(opts: BuildInfo5PromptOptions): string {
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
  sections.push(buildToneRule(INFO_5_REFERENCE));

  sections.push(INFO_5_SKELETON);
  sections.push(buildSharedRules());

  sections.push(`[출력 — 마크다운 본문만, 설명·코드블록 마커 X]`);

  return sections.join("\n\n");
}
