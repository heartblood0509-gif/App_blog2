// 유튜브 기능 전역 킬스위치.
//
//   false → plan 과 무관하게 유튜브를 전체 OFF. 카드는 "준비 중"으로 잠기고,
//           서버 옆문(/api/youtube/*)도 일괄 403. (미완성 기능 출시 차단용)
//   true  → 기존 plan 게이팅 복원. 명시적 plan='blog'(유튜브 미구매)만 차단하고
//           그 외(null/blog_youtube)는 허용.
//
// 유튜브 이식이 완성되면 이 값을 true 로 되돌리면 끝. 다른 코드는 손대지 않는다.
export const YOUTUBE_FEATURE_ENABLED = false;
