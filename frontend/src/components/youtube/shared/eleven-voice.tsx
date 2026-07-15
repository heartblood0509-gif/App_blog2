"use client";

// ElevenLabs 음성 설정 공용 조각 — TtsConfig(카드) 와 VoiceSettingsBar(바) 가 함께 쓴다.
// Typecast 는 감정 프리셋, ElevenLabs 는 모델 선택 + stability/유사도/스타일 슬라이더 + 계정 음성(클론 포함).
// 계정 음성은 런타임에 조회(useElevenVoices)하며, 키가 없으면 설정 화면 안내를 노출한다.

import { useEffect, useState, type ReactNode } from "react";
import { CircleAlert, Loader2 } from "lucide-react";
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { ttsVoices, type ElevenVoice } from "@/lib/youtube/endpoints";
import { ELEVEN_MODELS, ELEVEN_V3_STABILITY } from "@/lib/youtube/voices";

// 라이브러리 음성 이름은 "Alice - Clear, Engaging Educator" 처럼 이름+설명이 붙어 있다.
// 접힌 트리거엔 이름만, 펼친 목록엔 이름(굵게)+설명(작게)으로 나눠 보여준다.
function splitVoiceLabel(name: string): { primary: string; secondary: string | null } {
  const i = name.indexOf(" - ");
  if (i === -1) return { primary: name, secondary: null };
  return { primary: name.slice(0, i), secondary: name.slice(i + 3) };
}

// 목록 항목: 이름만(설명 생략). 길면 …로 줄여 좌우 폭을 넘지 않게.
function VoiceItem({ voice }: { voice: ElevenVoice }) {
  return (
    <SelectItem value={voice.voice_id}>
      <span className="truncate">{splitVoiceLabel(voice.name).primary}</span>
    </SelectItem>
  );
}

// ElevenLabs voice_settings.speed 허용 범위(백엔드 클램프와 일치).
export const ELEVEN_SPEED_MIN = 0.7;
export const ELEVEN_SPEED_MAX = 1.2;
export function clampElevenSpeed(s: number): number {
  return Math.min(Math.max(s, ELEVEN_SPEED_MIN), ELEVEN_SPEED_MAX);
}

// v3 는 stability 가 사실상 3택(0/0.5/1). 모델 전환 시 현재 값을 가장 가까운 프리셋으로 스냅.
export function snapStabilityForModel(model: string, stability: number): number {
  if (model !== "eleven_v3") return stability;
  return [0, 0.5, 1].reduce(
    (a, b) => (Math.abs(b - stability) < Math.abs(a - stability) ? b : a),
    0.5,
  );
}

export interface ElevenVoicesState {
  voices: ElevenVoice[];
  loading: boolean;
  error: string | null;
  noKey: boolean; // 400(키 없음/무효) — 설정 화면 유도용
}

/** engine==="elevenlabs"일 때 계정 음성 목록을 조회한다. 키 없으면 noKey=true. */
export function useElevenVoices(enabled: boolean): ElevenVoicesState & { reload: () => void } {
  const [state, setState] = useState<ElevenVoicesState>({
    voices: [],
    loading: false,
    error: null,
    noKey: false,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const res = await ttsVoices("elevenlabs");
        if (!cancelled)
          setState({ voices: res.voices, loading: false, error: null, noKey: false });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "음성 목록을 불러오지 못했어요.";
        const noKey = /API\s*키|api key/i.test(msg);
        if (!cancelled) setState({ voices: [], loading: false, error: msg, noKey });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, nonce]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}

export interface ElevenPatch {
  voiceId?: string;
  elModel?: string;
  elStability?: number;
  elSimilarity?: number;
  elStyle?: number;
}

// 라벨 옆 느낌표(ⓘ) 아이콘에 마우스를 올리면 뜨는 흰색 말풍선 껍데기.
// 공용 Tooltip 은 검정 배경이 기본이라, 여기선 흰색(popover) 배경으로 직접 그린다.
function InfoHint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger
        render={
          <button
            type="button"
            aria-label={label}
            className="inline-flex items-center text-muted-foreground/70 hover:text-foreground"
          >
            <CircleAlert className="size-3.5" />
          </button>
        }
      />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner side="top" sideOffset={8} className="isolate z-50">
          <TooltipPrimitive.Popup
            className={cn(
              "z-50 flex max-w-sm origin-(--transform-origin) flex-col items-start gap-2",
              "whitespace-normal rounded-lg border bg-popover px-3.5 py-3 text-left text-xs",
              "leading-relaxed text-popover-foreground shadow-lg",
              "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95",
              "data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
            )}
          >
            {children}
            <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%-1px)] rotate-45 rounded-[2px] border-r border-b border-border bg-popover data-[side=top]:-bottom-2.5" />
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// 안정성 설명 — 모델별로 다르다: v3 는 3택 프리셋(창의적/자연스러움/안정적), v2 는 0~1 연속 슬라이더.
function StabilityHint({ isV3 }: { isV3: boolean }) {
  return (
    <InfoHint label="안정성 설명 보기">
      {isV3 ? (
        <>
          <p>
            <b>창의적</b> (제일 낮음) — 감정을 잔뜩 실어 연기하는 배우. 억양·감정 변화가 크고
            표현이 풍부합니다. 대신 가끔 어색하게 튀거나(과장·헛발음) 매번 다르게 나올 수 있어요.
          </p>
          <p>
            <b>자연스러움</b> (중간) — 원래 그 사람 목소리에 가장 가깝고 균형 잡힌 상태. 감정과
            안정의 중간이라 대부분 상황에 무난합니다.
          </p>
          <p>
            <b>안정적</b> (제일 높음) — 아나운서처럼 차분하고 예측 가능하게. 매번 거의 똑같이
            읽습니다. 대신 감정 표현이나 지시에 대한 반응은 약해져요(v2와 비슷한 느낌).
          </p>
          <p className="border-t border-border pt-2 text-muted-foreground">
            한 줄 요약: 왼쪽일수록 감정 폭↑·변덕↑, 오른쪽일수록 일정·차분·밋밋.
          </p>
        </>
      ) : (
        <>
          <p>목소리가 얼마나 일정하게 유지되는지를 0~1 막대로 정합니다.</p>
          <p>
            <b>낮출수록</b> (0에 가까움) — 억양·감정 변화가 커지고 표현이 풍부해집니다. 대신
            만들 때마다 조금씩 달라지고 가끔 불안정하게 들릴 수 있어요.
          </p>
          <p>
            <b>높일수록</b> (1에 가까움) — 차분하고 일정하게, 매번 거의 똑같이 읽습니다. 대신
            밋밋하게 들릴 수 있어요.
          </p>
          <p className="border-t border-border pt-2 text-muted-foreground">
            한 줄 요약: 왼쪽일수록 감정 폭↑·변덕↑, 오른쪽일수록 일정·차분·밋밋. 보통 0.5 안팎을 권장해요.
          </p>
        </>
      )}
    </InfoHint>
  );
}

// 모델 설명 — 표준(v2) vs 최신(v3) 차이. 클론 충실도 문구는 ElevenLabs 공식 안내에 근거한다:
// "PVC(전문 클론)는 아직 v3에 완전 최적화되지 않아 이전 모델보다 클론 품질이 낮을 수 있다.
//  v3 기능이 필요하면 IVC(즉석 클론)나 디자인 음성을 쓰는 게 좋다." (elevenlabs.io/blog/eleven-v3)
function ModelHint() {
  return (
    <InfoHint label="모델 설명 보기">
      <p>목소리를 만들어내는 AI 엔진의 세대예요. 같은 성우라도 느낌이 달라집니다.</p>
      <p>
        <b>표준 (multilingual v2)</b> — 차분하고 일관적이며, <b>복제한 내 목소리(클론)를 원본에
        더 가깝게 재현</b>합니다. 자막과 음성 타이밍도 정확해 자막이 중요한 숏폼에 적합해요.
      </p>
      <p>
        <b>최신 (v3)</b> — 표현력·감정 연기가 가장 뛰어납니다. 대신 <b>복제 음성은 원본과 덜 닮게</b>
        나올 수 있고(ElevenLabs 공식: 전문 클론은 아직 v3에 최적화 전이라 이전 모델보다 클론 품질이
        낮을 수 있음), 만들 때마다 조금씩 달라지며 자막 타이밍 정밀도도 v2보다 떨어질 수 있어요.
      </p>
      <p className="border-t border-border pt-2 text-muted-foreground">
        한 줄 요약: 내 목소리와 닮게·자막 정확이 중요하면 표준(v2), 감정 표현이 중요하면 최신(v3).
      </p>
    </InfoHint>
  );
}

// 유사도 설명 — ElevenLabs 공식: "AI가 원본 목소리를 얼마나 충실히 따라갈지 결정".
// "원본 녹음이 나쁜데 유사도를 너무 높이면 원본의 아티팩트·배경 잡음까지 따라할 수 있음."
function SimilarityHint() {
  return (
    <InfoHint label="유사도 설명 보기">
      <p>목소리가 원본 성우(특히 내 클론)를 얼마나 똑같이 따라 하는지를 정해요.</p>
      <p>
        <b>높일수록</b> — 원본 목소리에 더 충실하게 재현합니다(내 클론이면 더 닮음).
      </p>
      <p>
        <b>낮출수록</b> — 원본과 덜 닮게, 대신 조금 더 매끄럽게 들릴 수 있어요.
      </p>
      <p className="border-t border-border pt-2 text-muted-foreground">
        주의: 원본 녹음이 지저분한데 너무 높이면 원본의 잡음·잡소리까지 따라할 수 있어요(ElevenLabs 공식). 보통 0.75 안팎을 권장해요.
      </p>
    </InfoHint>
  );
}

// 스타일 설명 — ElevenLabs 공식: "원본 화자의 스타일을 과장. 모델이 약간 덜 안정적이 되고
// 지연이 늘 수 있으며, 일반적으로 항상 0 유지를 권장."
function StyleHint() {
  return (
    <InfoHint label="스타일 설명 보기">
      <p>원본 화자의 말투·억양 등 특유의 &lsquo;스타일&rsquo;을 얼마나 과장할지 정해요.</p>
      <p>
        <b>0</b> — 과장 없음(기본).
      </p>
      <p>
        <b>올릴수록</b> — 그 사람 특유의 스타일이 강조되지만, 목소리가 불안정해지고 생성이 느려질 수 있어요.
      </p>
      <p className="border-t border-border pt-2 text-muted-foreground">
        ElevenLabs는 특별한 이유가 없으면 <b>0으로 두기를 권장</b>해요.
      </p>
    </InfoHint>
  );
}

function LabeledSlider({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: ReactNode;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex min-w-[150px] flex-1 flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          {label}
          {hint}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {value.toFixed(2)}
        </span>
      </div>
      <Slider
        min={0}
        max={1}
        step={0.05}
        value={value}
        disabled={disabled}
        onValueChange={onChange}
      />
    </div>
  );
}

/**
 * ElevenLabs 음성 조각. 3행 배치:
 *   1행: 엔진(engineSelect 슬롯) · 성우 · 모델
 *   2행: 안정성 · 유사도 · 스타일
 * 속도 슬라이더는 호스트가 3행으로 따로 붙인다(엔진마다 범위가 달라서).
 * engineSelect: 호스트의 엔진 선택 UI. 넘기면 1행 맨 앞에 '엔진' 라벨과 함께 놓는다(없으면 생략).
 * 키 없음/로딩 상태는 인라인 안내로 표시한다.
 */
export function ElevenVoiceControls({
  engineSelect,
  voiceId,
  model,
  stability,
  similarity,
  style,
  voicesState,
  onPatch,
  disabled,
}: {
  engineSelect?: ReactNode;
  voiceId: string;
  model: string;
  stability: number;
  similarity: number;
  style: number;
  voicesState: ElevenVoicesState;
  onPatch: (p: ElevenPatch) => void;
  disabled?: boolean;
}) {
  const { voices, loading, noKey } = voicesState;
  const mine = voices.filter((v) => v.group === "mine");
  const library = voices.filter((v) => v.group !== "mine");
  const isV3 = model === "eleven_v3";

  return (
    <div className="flex flex-col gap-3">
      {/* 1행: 엔진 · 성우 · 모델 */}
      <div className="flex flex-wrap items-start gap-3">
        {engineSelect && (
          <div className="flex min-w-[130px] flex-col gap-1">
            <span className="text-xs text-muted-foreground">엔진</span>
            {engineSelect}
          </div>
        )}
        {!noKey && (
          <>
            {/* 성우 (내 클론 우선) */}
            <div className="flex min-w-[180px] flex-1 flex-col gap-1">
              <span className="text-xs text-muted-foreground">
                성우{loading && <Loader2 className="ml-1 inline size-3 animate-spin" />}
              </span>
              <Select
                items={voices.map((v) => ({
                  value: v.voice_id,
                  label: splitVoiceLabel(v.name).primary,
                }))}
                value={voiceId}
                disabled={disabled || loading}
                onValueChange={(v) => v && onPatch({ voiceId: v })}
              >
                <SelectTrigger aria-label="ElevenLabs 성우" className="h-8 w-full bg-background">
                  <SelectValue placeholder={loading ? "불러오는 중…" : "성우를 선택하세요"} />
                </SelectTrigger>
                <SelectContent>
                  {mine.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>내 음성 (클론)</SelectLabel>
                      {mine.map((v) => (
                        <VoiceItem key={v.voice_id} voice={v} />
                      ))}
                    </SelectGroup>
                  )}
                  {mine.length > 0 && library.length > 0 && <SelectSeparator />}
                  {library.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>기본 음성</SelectLabel>
                      {library.map((v) => (
                        <VoiceItem key={v.voice_id} voice={v} />
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            </div>

            {/* 모델 */}
            <div className="flex min-w-[160px] flex-col gap-1">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                모델
                <ModelHint />
              </span>
              <Select
                items={ELEVEN_MODELS}
                value={model}
                disabled={disabled}
                onValueChange={(v) =>
                  v && onPatch({ elModel: v, elStability: snapStabilityForModel(v, stability) })
                }
              >
                <SelectTrigger aria-label="ElevenLabs 모델" className="h-8 w-full bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ELEVEN_MODELS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        )}
      </div>

      {noKey ? (
        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
          설정 → API 키에서 ElevenLabs 키를 저장하면 계정 음성(보이스 클론 포함)을 쓸 수 있어요.
        </p>
      ) : (
        // 2행: 안정성 · 유사도 · 스타일 (스타일도 안정성/유사도와 같은 세로 라벨형)
        <div className="flex flex-wrap items-start gap-3">
          {/* 안정성 — v3 는 3택, v2 는 슬라이더 */}
          {isV3 ? (
            <div className="flex min-w-[200px] flex-col gap-1">
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                안정성
                <StabilityHint isV3 />
              </span>
              <div className="flex gap-1.5">
                {ELEVEN_V3_STABILITY.map((opt) => {
                  const active = Math.abs(Number(opt.value) - stability) < 1e-6;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={disabled}
                      onClick={() => onPatch({ elStability: Number(opt.value) })}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:bg-muted",
                      )}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <LabeledSlider
              label="안정성"
              hint={<StabilityHint isV3={false} />}
              value={stability}
              disabled={disabled}
              onChange={(v) => onPatch({ elStability: v })}
            />
          )}

          <LabeledSlider
            label="유사도"
            hint={<SimilarityHint />}
            value={similarity}
            disabled={disabled}
            onChange={(v) => onPatch({ elSimilarity: v })}
          />
          <LabeledSlider
            label="스타일"
            hint={<StyleHint />}
            value={style}
            disabled={disabled}
            onChange={(v) => onPatch({ elStyle: v })}
          />
        </div>
      )}
    </div>
  );
}
