/**
 * 레퍼런스 글에서 말투 패턴을 추출.
 *
 * - 정적 분석 (LLM 호출 없음, 결정적·빠름)
 * - 종결 어미 / 호흡 / 수사 / 1인칭 패턴을 통계적으로 잡아 톤 가이드 생성
 *
 * 추출 결과 예 (우리끼리09 레퍼런스):
 *   - 종결: 합니다체 (95%), 의문 호흡 가끔
 *   - 1인칭: "저", "저희", "제가"
 *   - 수사: 수치 박기, 비유 타격, 도발적 카피
 *   - 호흡: 짧은 단언 → 길게 풀이 → 짧은 단언
 */

interface ToneSignals {
  endingStyle: string;
  firstPerson: string[];
  rhetoricalDevices: string[];
  rhythmNotes: string;
}

function detectEndingStyle(text: string): string {
  // 형용사 종결 통계
  const respectfulMatches = (text.match(/(습니다|입니다|습니까|입니까|죠|니다)/g) || []).length;
  const informalMatches = (text.match(/(어요|아요|예요|이에요)/g) || []).length;
  const eumshmMatches = (text.match(/(음|함|됨|었음|었음\b)/g) || []).length;
  const banmalMatches = (text.match(/(어\b|아\b|어\.|아\.|는데\b|이지\b|었어\b)/g) || []).length;

  const total = respectfulMatches + informalMatches + eumshmMatches + banmalMatches;
  if (total === 0) return "중립적인 톤";

  const dominant = Math.max(respectfulMatches, informalMatches, eumshmMatches, banmalMatches);
  if (dominant === respectfulMatches) return "합니다체 (\"~합니다\", \"~입니다\", \"~죠\") 일관";
  if (dominant === informalMatches) return "친근체 (\"~어요\", \"~예요\")";
  if (dominant === eumshmMatches) return "음슴체 (\"~함\", \"~음\")";
  return "반말체";
}

function detectFirstPerson(text: string): string[] {
  const found = new Set<string>();
  ["저는", "제가", "저희", "저", "우리"].forEach((p) => {
    if (text.includes(p)) found.add(p);
  });
  return Array.from(found);
}

function detectRhetoricalDevices(text: string): string[] {
  const devices: string[] = [];

  // 수치 박기
  if (/\d+\s*(년|회|명|만|억|%|만원|원)/.test(text)) {
    devices.push("수치 박기 (구체 숫자로 권위/신뢰 형성)");
  }

  // 도발적 후킹
  if (/욕[을 ]?먹|솔직히|불편한 진실|배신|함정|덫|폭로|진짜|진실/.test(text)) {
    devices.push("도발적 카피 (\"욕 먹습니다\", \"솔직히\", \"진실\", \"배신\" 류)");
  }

  // 비유
  if (/마치|처럼|같은|같다|같습니다/.test(text)) {
    devices.push("비유 타격 (\"~처럼\", \"~같은\")");
  }

  // 인용/괄호
  if (/[""].+?[""]/.test(text)) {
    devices.push("인용구 / 큰따옴표로 강조");
  }

  // 단언/반전
  if (/하지만|그런데|결국|사실|솔직히 말씀드리면/.test(text)) {
    devices.push("반전 접속어 (\"하지만\", \"솔직히\")");
  }

  return devices;
}

function detectRhythm(text: string): string {
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  const avgLen = lines.length > 0 ? lines.reduce((a, l) => a + l.length, 0) / lines.length : 0;
  if (avgLen < 50) return "짧은 단언 위주 — 1~2줄 단문 자주";
  if (avgLen < 100) return "짧은 단언 + 중간 길이 풀이 혼합";
  return "긴 풀이 위주";
}

export function extractToneFromReference(reference: string): ToneSignals {
  return {
    endingStyle: detectEndingStyle(reference),
    firstPerson: detectFirstPerson(reference),
    rhetoricalDevices: detectRhetoricalDevices(reference),
    rhythmNotes: detectRhythm(reference),
  };
}

export function buildToneRule(reference: string): string {
  const signals = extractToneFromReference(reference);
  const fpStr = signals.firstPerson.length > 0 ? signals.firstPerson.join(", ") : "(자유)";
  const devicesStr = signals.rhetoricalDevices.length > 0
    ? signals.rhetoricalDevices.map((d) => `  · ${d}`).join("\n")
    : "  · (특이 사항 없음 — 자연스러운 한국어)";

  return `[말투 규칙 — 아래 레퍼런스 글에서 추출됨. 이 결을 절대 어기지 말 것]
- 종결 어미: ${signals.endingStyle}
- 1인칭 표현: ${fpStr}
- 호흡: ${signals.rhythmNotes}
- 자주 쓰는 수사:
${devicesStr}

위 패턴을 그대로 재현하되, 사용된 문장 자체는 베끼지 말고 새 글에 자연스럽게 녹여내세요.`;
}
