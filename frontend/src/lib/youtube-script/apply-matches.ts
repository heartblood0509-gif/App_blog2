/**
 * 블로그 본문 → 유튜브 스크립트 변환의 "치환 단계".
 *
 * AI가 반환한 매칭 리스트(MediaMatch[])를 받아 원본 본문에 일괄 적용한다.
 * 이 단계엔 LLM이 개입하지 않으므로:
 *   - 처리 시간: 0ms 수준 (보통 1ms 이내)
 *   - 결정론적: 같은 입력 → 항상 같은 출력
 *   - 본문은 매칭에 걸린 부분만 정확히 치환되고 나머지는 100% 그대로
 *
 * 사용자가 UI에서 잘못된 매칭을 X로 제외하면, 그 항목을 뺀 부분집합으로
 * 이 함수를 재호출하여 즉시 결과를 재계산 (LLM 재호출 없음).
 */

export interface MediaMatch {
  /** 본문에 등장하는 정확한 원문 표현 */
  old: string;
  /** 치환 후 문구 */
  new: string;
}

/**
 * 본문에 매칭 리스트를 일괄 적용해 새 본문을 반환.
 *
 * - matches는 입력 순서대로 적용 (먼저 등록된 패턴이 먼저 치환)
 * - 공백 / 같은 값 / new가 비어 있는 항목은 건너뜀 (방어 코드)
 * - 원본 content는 변경하지 않음 (순수 함수)
 */
export function applyMatches(content: string, matches: MediaMatch[]): string {
  let result = content;
  for (const m of matches) {
    if (!m || !m.old || !m.new) continue;
    if (m.old === m.new) continue;
    result = result.replaceAll(m.old, m.new);
  }
  return result;
}
