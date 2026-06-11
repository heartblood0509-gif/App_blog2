// 유튜브 "AI가 모두 생성"(Card A) 하위 기능 스위치.
//
//   false → 카드/진입 숨김 + 기능 비활성화 (출시 기본).
//           앞문(React ModeSelect)·정적 UI 카드 비노출 + 뒷문(서버 create_job/retry-images) 403.
//   true  → 복원. ModeSelect 두 카드가 다시 보이고 AI 자동 생성 흐름이 동작.
//
// ⚠ 백엔드 쌍: youtube-backend/config.py 의 YT_AI_FULL_ENABLED — **항상 같은 값**으로 유지.
//   복원 시 손볼 곳 3개: 이 파일 + youtube-backend/config.py + youtube-backend/static/index.html(ai_full 카드 주석 해제).
//
// 유튜브 전체 킬스위치(youtube-feature.ts)와는 별개의 하위 기능 플래그다.
export const YT_AI_FULL_ENABLED = false;
