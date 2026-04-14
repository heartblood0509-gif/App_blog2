/**
 * 품질 미통과 항목을 AI가 수정하도록 하는 프롬프트 빌더
 */

interface FixParams {
  content: string;
  failReasons: string[];
  keyword: string;
}

export function buildFixPrompt(params: FixParams): string {
  const { content, failReasons, keyword } = params;

  const instructions = failReasons.map((reason) => {
    if (reason.includes("키워드 부족")) {
      const match = reason.match(/(\d+)회/);
      const current = match ? parseInt(match[1]) : 0;
      const needed = 4 - current;
      return `- 메인 키워드 "${keyword}"가 현재 ${current}회뿐임. ${needed}회 더 자연스럽게 추가해. 억지로 넣지 말고 문맥에 맞게 녹여.`;
    }
    if (reason.includes("키워드 과다")) {
      const match = reason.match(/(\d+)회/);
      const current = match ? parseInt(match[1]) : 0;
      const excess = current - 7;
      return `- 메인 키워드 "${keyword}"가 ${current}회로 너무 많음. ${excess}회 줄여서 7회 이하로 맞춰.`;
    }
    if (reason.includes("글자수 부족")) {
      return `- 글자수가 부족함. 기존 흐름을 유지하면서 자연스럽게 내용을 보강해서 늘려줘.`;
    }
    if (reason.includes("글자수 초과")) {
      return `- 글자수가 초과함. 핵심 내용은 유지하면서 반복되거나 불필요한 부분을 줄여줘.`;
    }
    if (reason.includes("소제목 부족")) {
      const match = reason.match(/(\d+)개/);
      const current = match ? parseInt(match[1]) : 0;
      return `- 소제목이 ${current}개뿐임. > 형식으로 소제목을 ${3 - current}개 더 추가해. 궁금증을 유발하는 소제목으로.`;
    }
    if (reason.includes("해시태그 부족")) {
      const match = reason.match(/(\d+)개/);
      const current = match ? parseInt(match[1]) : 0;
      return `- 해시태그가 ${current}개뿐임. 관련 해시태그를 추가해서 총 8개로 맞춰.`;
    }
    if (reason.includes("광고성 표현")) {
      return `- 광고성 표현이 감지됨. "인생템", "강력 추천", "드디어 찾았다" 같은 체험단 클리셰를 자연스러운 표현으로 바꿔.`;
    }
    return `- ${reason}`;
  });

  return `# 역할
너는 블로그 글 품질 교정 전문가야.
아래 글에서 품질 문제가 발견되었어.
지시한 문제만 수정하고, 나머지 내용/톤/구조는 절대 건드리지 마.

## 수정 지시사항
${instructions.join("\n")}

## 중요 규칙
- 지시한 부분만 수정할 것
- 글의 톤, 말투, 감정 흐름은 그대로 유지
- 광고 느낌 나는 표현으로 바꾸지 말 것
- 수정된 글 전체를 그대로 출력할 것 (설명이나 코멘트 없이)

## 원본 글
${content}`;
}
