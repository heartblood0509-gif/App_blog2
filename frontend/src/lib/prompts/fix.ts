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
      return `- 글자수가 부족함
  기존 글의 구조와 흐름은 절대 바꾸지 말 것
  다음 방법으로만 늘릴 것:
  - 이미 언급된 경험에 감각적 디테일 추가 (촉감 냄새 느낌 등)
  - 기존 문단 사이에 짧은 감정이나 상황 묘사 1~2줄 추가
  새로운 주제나 단계를 추가하지 말 것`;
    }
    if (reason.includes("글자수 초과")) {
      return `- 글자수가 초과함
  핵심 내용은 유지하면서 반복되는 표현만 줄일 것
  문단이나 단계를 삭제하지 말 것`;
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
      return `- 광고처럼 느껴지는 표현이 감지됨
  해당 표현을 담백하고 자연스러운 표현으로 바꿔
  체험단이 쓸법한 클리셰를 실제 사용자가 쓸법한 표현으로 교체
  교체 후에도 광고 느낌이 나지 않는지 확인`;
    }
    return `- ${reason}`;
  });

  return `# 역할
너는 블로그 글 품질 교정 전문가야.
아래 글에서 품질 문제가 발견되었어.
지시한 문제만 수정하고, 나머지 내용/톤/구조는 절대 건드리지 마.

## 수정 지시사항
${instructions.join("\n")}

## 중요 규칙 (최우선)
- 글의 퀄리티가 가장 중요함 글의 자연스러움을 절대 해치지 말 것
- 지시한 부분만 최소한으로 수정할 것
- 글의 톤 말투 감정 흐름 구조는 그대로 유지
- 광고처럼 느껴지는 표현으로 바꾸지 말 것
- 문장부호(마침표 쉼표 느낌표 물음표 따옴표) 사용하지 말 것
- 수정된 글 전체를 그대로 출력할 것 (설명이나 코멘트 없이)
- \`[이미지: ...]\` 마커는 **개수·위치·설명 모두 원본 그대로** 유지할 것 (절대 삭제/이동/문구 변경 금지)
- 본문에 >로 시작하는 줄이 있으면 → > 마커만 제거하고 일반 문단으로 변환 (인용구는 소제목 ## 전용)
- 소제목(## 또는 ##\{스타일\})은 절대 삭제/이동하지 말 것

## 원본 글
${content}`;
}
