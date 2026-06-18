// 서버측 키 리졸버가 "로컬 파일(.local) vs env" 우선순위를 실행 환경에 맞게 정하는 데 쓴다.
//
// - Electron 앱: 사용자가 UI 로 저장한 키는 userData/settings.json(safeStorage 암호화)이 정본이고,
//   부팅 시 그 평문이 GEMINI_API_KEY / OPENAI_API_KEY / FAL_API_KEY env 로 주입된다.
//   이때 frontend/*.local 평문 파일은 웹 dev 잔재일 뿐이므로 env 를 우선해야 한다
//   (옛 .local 파일이 앱이 주입한 진짜 키를 가리는 사고 방지).
// - 웹 dev(./start.sh): safeStorage 가 없어 UI 저장이 *.local 파일에 기록되므로 파일을 우선.
//
// 판별: Electron next-server 가 부팅 시 APP_RUNTIME=electron 을 주입한다
//       (electron/src/next-server.ts). 그 마커가 없으면 웹 dev 로 간주.

export function isElectronRuntime(): boolean {
  return process.env.APP_RUNTIME === "electron";
}
