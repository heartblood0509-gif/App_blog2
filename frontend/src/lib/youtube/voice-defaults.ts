// 음성 설정 "이 기기 마지막 사용값" 자동 기억(로컬). 제목(title-defaults.ts)·자막(subtitle-defaults.ts)
// 과 같은 정책 — 늘 같은 성우를 쓰는 사용자가 새 영상마다 목록 첫 성우(혜리)로 되돌아가지 않게 한다.
// 작업을 다시 열 때의 복원은 이것과 무관하다(그건 서버에 저장된 job 값 — restorePatchFromDraft).
//
// 감정(emotion)은 기억하지 않는다. 성우를 바꾸면 앱이 감정을 "normal" 로 되돌리는 규칙이고,
// 감정 목록은 성우별로 API 에서 따로 받아오므로 기기 단위로 이월하면 어긋날 여지가 있다.
//
// SSR 안전: 모든 함수가 typeof window 가드를 거친다(패턴: subtitle-defaults.ts).

import { VOICE_OPTIONS, ELEVEN_MODELS } from "./voices";

export interface VoicePrefs {
  engine: string; // "typecast" | "elevenlabs"
  voiceId: string;
  ttsSpeed: number;
  elModel: string;
  elStability: number;
  elSimilarity: number;
  elStyle: number;
}

const PREFS_KEY = "blogpick-yt-voice-prefs";

function num(v: unknown, min: number, max: number): number | undefined {
  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return Math.max(min, Math.min(max, v));
}

/** 저장된 마지막 음성 설정을 검증해 부분 반환. 없거나 손상되면 {} (호출부 기본값 유지). */
export function loadLastVoice(): Partial<VoicePrefs> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Partial<Record<keyof VoicePrefs, unknown>>;
    const out: Partial<VoicePrefs> = {};
    const engine = p.engine === "elevenlabs" ? "elevenlabs" : "typecast";
    out.engine = engine;
    if (typeof p.voiceId === "string" && p.voiceId) {
      // Typecast 는 성우 목록이 프런트 상수라 검증 가능 — 목록에서 빠진 옛 id 는 버린다.
      // ElevenLabs 는 계정마다 음성이 달라(보이스 클론) 런타임 조회 전엔 검증할 수 없으므로 그대로 둔다.
      // 계정이 바뀌어 없는 음성이면 선택칸이 비어 보이고 사용자가 다시 고르면 된다(작업 재열기와 동일).
      if (engine === "elevenlabs" || VOICE_OPTIONS.some((v) => v.value === p.voiceId)) {
        out.voiceId = p.voiceId;
      }
    }
    // 엔진이 ElevenLabs 인데 쓸 음성이 없으면 ""(강제 선택)로 맞춘다.
    // 안 그러면 초기값인 Typecast 성우 id 가 남아 엔진과 음성이 어긋난다.
    if (engine === "elevenlabs" && out.voiceId === undefined) out.voiceId = "";
    const speed = num(p.ttsSpeed, 0.5, 2);
    if (speed !== undefined) out.ttsSpeed = speed;
    if (typeof p.elModel === "string" && ELEVEN_MODELS.some((m) => m.value === p.elModel)) {
      out.elModel = p.elModel;
    }
    const stab = num(p.elStability, 0, 1);
    if (stab !== undefined) out.elStability = stab;
    const sim = num(p.elSimilarity, 0, 1);
    if (sim !== undefined) out.elSimilarity = sim;
    const style = num(p.elStyle, 0, 1);
    if (style !== undefined) out.elStyle = style;
    return out;
  } catch {
    return {};
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: VoicePrefs | null = null;

/** 마지막 음성 설정을 디바운스 저장(속도 슬라이더가 잦으므로). */
export function saveLastVoice(prefs: VoicePrefs): void {
  if (typeof window === "undefined") return;
  pending = prefs;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    if (!pending) return;
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(pending));
    } catch {
      // quota 등 무시 — 자동 기억은 실패해도 기능에 지장 없음
    }
  }, 400);
}
