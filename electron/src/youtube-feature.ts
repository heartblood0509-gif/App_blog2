// 유튜브 기능 전역 킬스위치 (Electron 메인 프로세스용).
//
// frontend/src/lib/youtube-feature.ts 와 **항상 같은 값**으로 유지한다.
// Electron(tsc -p electron)은 frontend/src 를 import 할 수 없어 값을 미러링하며,
// 두 파일의 불일치는 scripts/check-youtube-flag-sync.js 가 빌드 전 검사한다.
//
//   false → 유튜브 백엔드를 아예 spawn 하지 않는다. packaged 빌드에
//           YoutubeGenerator 실행파일이 없어도 ENOENT 팝업이 뜨지 않는다. (미완성 기능 차단용)
//   true  → 기존 동작 복원. 부팅 시 youtube-backend 를 띄우고 iframe origin 을 허용한다.
//
// 유튜브 이식이 완성되면 이 값을 (frontend 와 함께) true 로 되돌리면 끝.
export const YOUTUBE_FEATURE_ENABLED = true;
