// Typecast 성우 목록은 API 가 아니라 프런트 상수다(원본 static/js/app.js VOICE_OPTIONS 추출).
// ElevenLabs 는 계정마다 음성(특히 보이스 클론)이 달라 런타임에 조회한다(endpoints.ttsVoices).

export interface YtVoice {
  value: string;
  label: string;
}

// 레거시 기본 엔진. 신규 코드는 상태(state.ttsEngine)를 쓰고 이 상수는 Typecast 기본값 표기용으로만 남긴다.
export const TTS_ENGINE = "typecast";

// 음성 엔진 선택지 — 영상 제작 음성 설정 UI 에서 사용.
export interface TtsEngineOption {
  value: string; // "typecast" | "elevenlabs"
  label: string;
}
export const TTS_ENGINES: TtsEngineOption[] = [
  { value: "typecast", label: "Typecast" },
  { value: "elevenlabs", label: "ElevenLabs" },
];

// ElevenLabs 모델 선택지.
export const ELEVEN_MODELS: YtVoice[] = [
  { value: "eleven_multilingual_v2", label: "표준 (multilingual v2)" },
  { value: "eleven_v3", label: "최신 (v3)" },
];

// ElevenLabs 음성 설정 기본값(백엔드 ElevenLabsOptions 기본과 일치).
export const ELEVEN_DEFAULTS = {
  model: "eleven_multilingual_v2",
  stability: 0.5,
  similarity: 0.75,
  style: 0,
};

// v3 stability 3택(연속 슬라이더 대신 프리셋). 값은 백엔드가 그대로 voice_settings.stability 로 보냄.
export const ELEVEN_V3_STABILITY: YtVoice[] = [
  { value: "0", label: "창의적" },
  { value: "0.5", label: "자연스러움" },
  { value: "1", label: "안정적" },
];

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
