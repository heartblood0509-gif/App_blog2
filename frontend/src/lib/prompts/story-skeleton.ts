/**
 * 후기성 블로그 "무엇에 대해 쓰고 싶나요?" textarea를 채워주는 AI 스토리 추천 프롬프트.
 *
 * 사용자가 메인 키워드를 입력하면, 그 키워드에 맞는 "고생 스토리 뼈대"를
 * 3~4줄 구어체 메모(~함/~임/~음)로 생성한다.
 *
 * 5단계 공식:
 *  ① 누가 고생 시작 → ② 증상/문제 심화 → ③ 못 하게 된 행동
 *  → ④ 전문가 진단/추천 → ⑤ 회복 (해피엔딩)
 *
 * Few-shot은 두피/샴푸 도메인 anchoring을 막기 위해 다른 카테고리(인테리어/건강식품)도 섞어둠.
 */

export interface ProductSummary {
  name: string;
  category?: string;
  advantages?: string;
}

/**
 * 사용자가 "질문에 답하기" 폼으로 입력한 답.
 * 일부 또는 전체 비어 있을 수 있음. 비어 있는 단계는 AI가 5단계 공식으로 자동 보강.
 */
export interface UserAnswers {
  /** 질문 1 — "누구의 이야기?" — 예: "엄마, 50대 주부" */
  who?: string;
  /** 질문 2 — "가장 짜증나는 증상 + 그 때문에 포기한 행동" */
  problemAndAvoidance?: string;
  /** 질문 3 — "제품 쓰고 그 행동을 다시 할 수 있게 됐나?" */
  recoveredAction?: string;
}

export function buildStorySkeletonPrompt(
  keyword: string,
  products: ProductSummary[] = [],
  userAnswers?: UserAnswers
): string {
  const productSection = buildProductSection(products);
  const answerSection = buildUserAnswerSection(userAnswers);

  return `# Role
너는 블로그 자동화 프로그램 '블로그 픽'의 핵심 AI 엔진이다. 사용자가 입력한 [Target Keyword]를 분석하여, 네이버 블로그 알고리즘이 좋아하는 '초구체적이고 사실적인 경험담(스토리텔링) 뼈대'를 생성하는 역할을 한다.

# Objective
사용자가 키워드만 입력해도, 마치 실제 그 상황을 겪어본 사람이 쓴 것 같은 생생한 '세부사항 스토리'를 3~4줄의 구어체(~함, ~임, ~음) 형태로 출력하라. 도메인은 두피/샴푸뿐 아니라 인테리어·건강식품·생활용품 등 모든 카테고리에 자연스럽게 적용되어야 한다.

# Core Rules (스토리 뼈대 규칙 — 도메인 무관 일반화)
1. [스토리텔링 시작]: 대상(엄마, 나, 남편, 아이, 친구 등)이 해당 키워드와 관련된 문제·증상·불편함으로 고생하기 시작한 계기를 생생하게 서술.
2. [문제 심화]: 처음엔 가벼웠으나 나중엔 심각해진 과정(가려움→붉어짐, 곰팡이→누수, 피로→무기력 등 구체적 변화) 언급.
3. [행동 제약]: 그 문제 때문에 일상에서 '절대 못 하게 된 행동(포기한 것)'을 명시.
4. [전문가 진단·추천]: 그 분야의 전문가(병원/약사/시공기사/디자이너/전문샵/트레이너 등)를 통해 특정 성분·시공·제품·케어가 필수적이라는 진단을 받음. ※ 카테고리에 맞는 전문가를 자연스럽게 골라 쓸 것.
5. [비포&애프터]: 일정 기간 꾸준히 관리·시공·복용한 결과, 지금은 포기했던 일상 행동을 무리 없이 할 수 있게 되었다는 해피엔딩으로 마무리.

# Output Tone & Manner
- 마침표 뒤에 문장을 딱딱하게 끊지 말고, 개발자/마케터가 툭툭 던지듯 적은 메모 형식(~음, ~함, ~임)으로 출력할 것.
- 사설·안내 문구·\`[Output]:\` 같은 prefix·따옴표 없이 오직 뼈대 텍스트만 출력해야 함.
- 출력은 3~5줄, 총 200~350자 정도가 적당.
- 두피·샴푸 외 카테고리 키워드가 들어왔을 때 두피 어휘를 섞어 쓰지 말 것 (욕실 리모델링이면 두피 단어 금지).

# Few-Shot Examples (출력 예시 참고 — 다양한 카테고리)
[Input Keyword]: 지루성두피염
[Output]: 엄마의 지루성두피염 증상의 고통스러웠던 스토리텔링. 처음엔 가려움으로 시작 나중엔 두피가 붉어지고 염증까지 발생. 너무 고통스러워 해서 염색은 꿈도 못꾸심. 병원에 가니 자연유래계면활성제 샴푸 필수로 권장, 현재는 증상이 심하므로 연고 처방. 3개월정도 테라피 샴푸 사용후 지금은 순한 염색정도는 하셔도 크게 무리 없으심.

[Input Keyword]: 두피건조증
[Output]: 남편의 만성 두피건조증과 각질 폭발 스토리텔링. 머리가 건조하니까 하얗게 각질이 일어나고 당기는 통증까지 유발함. 스프레이나 왁스 같은 헤어 제품은 바를 엄두도 못 내고 늘 모자만 쓰고 다님. 미용실 원장님이 두피 유수분 밸런스 깨진 거라고 보습 샴푸 권장함. 한 달 동안 보습 팩이랑 샴푸 병행했더니 당김 증상 사라지고 지금은 중요한 날 헤어 스타일링 가볍게 해도 멀쩡함.

[Input Keyword]: 욕실 리모델링
[Output]: 결혼 8년차 우리집 욕실의 곰팡이·누수 지옥 스토리텔링. 처음엔 줄눈 사이에 검은 점 몇 개였는데 나중엔 천장 벽지까지 들뜨고 아래층에서 누수 항의까지 받음. 손님 초대는 꿈도 못 꾸고 샤워하러 들어갈 때마다 스트레스. 시공 기사님이 방수층 다 깨졌다고 욕조 철거 + 방수 + 타일 재시공 풀패키지 권장함. 2주 시공 후 지금은 욕실 사진 인스타에 자랑할 수 있을 정도로 깔끔해짐.

[Input Keyword]: 관절영양제
[Output]: 50대 아빠의 무릎 시큰거림 스토리텔링. 처음엔 계단 오를 때만 좀 뻐근한 정도였는데 나중엔 평지 걷기만 해도 시큰거리고 밤에 뻑적거려서 잠을 설치심. 등산은 물론이고 손주 안아주는 것도 부담스러워하셔서 가족 분위기까지 가라앉음. 정형외과에서 연골 닳기 시작했다고 글루코사민·MSM 복합 영양제 꾸준히 챙기라고 함. 3개월 챙겨드린 뒤 지금은 가벼운 둘레길 정도는 거뜬히 걸으심.
${productSection}${answerSection}
---

[Input Keyword]: ${keyword.trim()}
[Output]:`;
}

function buildUserAnswerSection(answers?: UserAnswers): string {
  if (!answers) return "";
  const who = answers.who?.trim();
  const problem = answers.problemAndAvoidance?.trim();
  const recovered = answers.recoveredAction?.trim();
  if (!who && !problem && !recovered) return "";

  const lines: string[] = [];
  if (who) lines.push(`- 대상(누구 이야기): ${who}`);
  if (problem) lines.push(`- 가장 짜증 나는 증상·포기한 행동: ${problem}`);
  if (recovered) lines.push(`- 제품 사용 후 회복된 행동·변화: ${recovered}`);

  return `

# 사용자가 제공한 정보 (반드시 반영)
${lines.join("\n")}

지시:
- 위 정보를 5단계 공식의 ①②③⑤에 자연스럽게 녹여서 작성할 것. 사용자 답을 그대로 베끼지 말고 메모 톤(~함/~임/~음)으로 다듬어 통합.
- 사용자가 답하지 않은 단계(특히 ④ 전문가 진단·추천)는 키워드의 카테고리에 맞는 자연스러운 전문가(병원/약사/시공기사/디자이너/트레이너 등)를 골라 보강할 것.
- 사용자 답이 일부만 있어도 결과는 항상 자연스러운 한 단락 메모로 출력.`;
}

function buildProductSection(products: ProductSummary[]): string {
  if (!products || products.length === 0) return "";
  const lines = products
    .filter((p) => p && p.name)
    .map((p) => {
      const cat = p.category ? `(${p.category})` : "";
      const adv = p.advantages?.trim() ? ` — ${p.advantages.trim().split(/\n+/)[0]}` : "";
      return `- ${p.name}${cat}${adv}`;
    });
  if (lines.length === 0) return "";
  return `

# 참고: 이 글에서 자연스럽게 녹여낼 제품 정보
${lines.join("\n")}
※ 제품 카테고리·특징에 맞춰 스토리 5단계 흐름을 자연스럽게 맞출 것. 제품명을 스토리에 직접 박지는 말고(추천 단계에서 카테고리만 언급), 톤·방향만 참고.`;
}
