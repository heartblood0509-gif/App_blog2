/**
 * "내 템플릿 만들기" 메타.
 *
 * 다른 4개 템플릿과 달리 variant 개념이 없음 — 사용자가 직접 입력한 견본 글이 곧 변형.
 * 톤 분기는 BrandCustomReferenceMode 토글로 처리 (UI에서 선택, 빌더에서 분기).
 */
export { buildCustomPrompt } from "./prompt";
