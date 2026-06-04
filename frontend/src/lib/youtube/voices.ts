// 성우 목록은 API 가 아니라 프런트 상수다(원본 static/js/app.js VOICE_OPTIONS 추출).
// 현재 엔진은 typecast 하나뿐(원본 index.html 엔진 select 도 typecast 단일).

export interface YtVoice {
  value: string;
  label: string;
}

export const TTS_ENGINE = "typecast";

export const VOICE_OPTIONS: YtVoice[] = [
  { value: "tc_62e8f21e979b3860fe2f6a24", label: "혜리 (여성)" },
  { value: "tc_611c3f692fac944dff493a04", label: "세희 (여성)" },
  { value: "tc_6568164fe05ddffee8b0e271", label: "시연 (여성)" },
  { value: "tc_622964d6255364be41659078", label: "세나 (여성)" },
  { value: "tc_61659c5818732016a95fe763", label: "류은 (여성)" },
  { value: "tc_632293f759d649937b97f323", label: "진우 (남성)" },
  { value: "tc_668f4f533ea5c6ce5e43fd48", label: "우성 (남성)" },
  { value: "tc_6059dad0b83880769a50502f", label: "창수 (남성)" },
  { value: "tc_61de29497924994f5abd68db", label: "세진 (남성)" },
];
