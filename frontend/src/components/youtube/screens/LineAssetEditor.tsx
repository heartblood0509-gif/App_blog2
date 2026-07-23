"use client";

// Card B 2단계 — 줄별 자산 편집(이미지 + 영상).
// 대본을 쪼갠 줄마다: AI 이미지 생성/재생성, 내 이미지 올리기, 내 영상 올리기,
// 그리고 준비된 이미지를 움직이는 영상으로 바꾸는 AI 영상 변환. 진행 상태는 draft-state 폴링으로 추적.
//
// 줄 구조 편집(엔터 분할/합치기/삭제·텍스트 인라인 수정)은 index 가 바뀌므로 호출 직전 line_id 로
// 현재 index 를 재해석한다(업로드/변환의 레이스 방지).
//
// 줄별 비동기 생성은 job.status 가 아니라 **줄별 status**(pending→ready/failed)로 끝나므로,
// draft-state(lines[].status / asset_step / asset_version)를 2초마다 폴링해 갱신한다.
// 캐시버스팅은 줄이 들고 있는 asset_version 을 ?v 로 붙여 처리(재생성/업로드 시 백엔드가 +1).

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpToLine,
  Check,
  CheckCircle2,
  CornerDownLeft,
  Film,
  ImageIcon,
  ImageUp,
  Loader2,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  RotateCcw,
  Scissors,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { freshYtState, useYt, type TtsBuildSnapshot } from "../state";
import { ytUrl } from "@/lib/youtube/api";
import { cn } from "@/lib/utils";
import { ShortsPreviewFrame } from "../ShortsPreviewFrame";
import { TransformablePreviewMedia } from "../TransformablePreviewMedia";
import { SegmentTrack } from "../SegmentTrack";
import { ImageContextMenu } from "@/components/image-context-menu";
import { triggerDownload } from "@/lib/download";
import {
  clampTransform,
  DEFAULT_TRANSFORM,
  isDefaultTransform,
  SCALE_MIN,
  SCALE_MAX,
  MOTION_SPEED_PCT_MIN,
  MOTION_SPEED_PCT_MAX,
  MOTION_SPEED_PCT_STEP,
  MOTION_SPEED_PCT_DEFAULT,
  rateFromSpeedPct,
  speedPctFromRate,
  type LineTransform,
} from "@/lib/youtube/transform";
import { VoiceSettingsBar } from "../shared/VoiceSettingsBar";
import { BgmPicker, bgmAudioUrl, formatTime } from "../shared/BgmPicker";
import { SubtitleStylePicker } from "../shared/SubtitleStylePicker";
import { LayoutPicker } from "../shared/LayoutPicker";
import { CHECKER_BG_STYLE, type LayoutMode } from "@/lib/youtube/layout";
import { PlaybackProgressBar } from "../shared/PlaybackProgressBar";
import { useTtsSessionPlayback } from "../useTtsSessionPlayback";
import {
  chunkBoundariesFromWordTimes,
  chunksForLine,
  chunksFromWordsGaps,
  displayLen,
  hasOverflowChunk,
  MAX_DISPLAY,
  parseSubtitleChunks,
  stripSubtitlePeriods,
  type WordTime,
} from "@/lib/youtube/subtitle-split";
import {
  cleanupClipProxy,
  confirmDraft,
  deleteLine,
  editLine,
  generateMissingImages,
  getDraftState,
  getTtsSessionManifest,
  importClipSegment,
  makeClipProxy,
  mergeLine,
  regenerateClip,
  regenerateImage,
  saveDraftMeta,
  saveLineVisual,
  applyLayoutFitTransforms,
  setSubtitleChunks,
  splitLine,
  ttsPreviewBuild,
  uploadClip,
  uploadImage,
  type BgmItem,
  type ElevenLabsOptions,
  type LineSource,
  type ScriptLine,
  type UploadClipResult,
} from "@/lib/youtube/endpoints";
import { TrimUploadModal } from "../TrimUploadModal";
import { saveLastSubtitle } from "@/lib/youtube/subtitle-defaults";
import { saveLastVoice } from "@/lib/youtube/voice-defaults";

const ACCEPT = "image/png,image/jpeg,image/webp";
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;
// 영상 업로드(백엔드와 동일: MP4/MOV/WebM/AVI, 50MB). MP4 외 포맷은 서버가 FFmpeg 로 변환.
const CLIP_ACCEPT = "video/mp4,video/quicktime,video/webm,video/x-msvideo";
const CLIP_ALLOWED_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/avi",
];
const CLIP_MAX_BYTES = 50 * 1024 * 1024;
const POLL_MS = 2000;
// 정체 감지: 한 줄이라도 완료되면 연장. 이 시간 동안 진척이 전혀 없으면 폴링 중단(영구 잠금 방지).
// Card B 이미지는 순서대로 생성(~16~32초/줄)이라 첫 줄도 이 안에 든다.
const STALL_MS = 150_000;
// AI 영상 변환(fal.ai)은 한 줄에 수 분 걸릴 수 있어, 변환 중엔 정체 창을 넉넉히 잡는다(가짜 타임아웃 방지).
const CLIP_STALL_MS = 660_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const isReady = (l: ScriptLine) => l.status === "ready";
const isFailed = (l: ScriptLine) => l.status === "failed";
// 프리뷰 모션 반복 주기용 줄 길이(초) 추정 — 음성 미빌드라 실제 나레이션 길이를 모를 때의 폴백.
// 자막 순환 추정과 같은 글자수×0.15초 계수. 최소 2.5초로 너무 빠른 반복을 막는다.
// 초당 줌 속도(rate)는 duration 과 무관하게 일정하므로, 추정이 대략만 맞아도 체감 속도는 정확.
const estimateLineSec = (l: ScriptLine | undefined): number =>
  l ? Math.max(2.5, displayLen(l.text ?? "") * 0.15) : 4;
// 생성/업로드 진행 중: 아직 pending 인데 단계(asset_step)가 찍혀 있음.
const isWorking = (l: ScriptLine) => l.status === "pending" && !!l.asset_step;
const anyWorking = (ls: ScriptLine[]) => ls.some(isWorking);
// AI 영상 변환 진행 중(fal.ai) — 폴링 정체 창을 넉넉히 잡을지 판단용.
const anyAiClipWorking = (ls: ScriptLine[]) =>
  ls.some((l) => isWorking(l) && l.asset_action === "ai_clip");

const SOURCE_LABEL: Record<LineSource, string> = {
  ai: "AI",
  image: "내 사진",
  clip: "영상",
};

// 선트림 업로드 영상 조각이 그 줄 나레이션보다 짧으면 부족분(초)을, 아니면 null 을 돌려준다.
// 대상은 clip 소스 + clip_duration 이 있는 줄뿐(레거시/AI변환/이미지 줄은 confirm·렌더 실측이 백스톱).
// 시작점(clip_start)은 보지 않는다 — 조각 자체 길이가 짧으면 "더 긴 영상으로 교체"만이 해법이고,
// 시작점 초과는 SegmentTrack 제약·reconcile 자동 보정으로 이미 해소되기 때문이다.
const CLIP_SHORTFALL_EPS = 0.05; // 백엔드 _find_clip_conflicts 허용오차와 동일
const AI_CLIP_MAX_SEC = 6; // veo3.1 lite 고정 길이(백엔드 fal_video "6s" / LINE_DURATION_THRESHOLD 와 동일)
function clipShortfallSec(
  source: LineSource,
  clipDuration: number | null | undefined,
  needed: number | null,
): number | null {
  if (source !== "clip" || typeof clipDuration !== "number" || needed == null) return null;
  const gap = needed - clipDuration;
  return gap > CLIP_SHORTFALL_EPS ? gap : null;
}

// 움직임(모션) 효과 선택지. 이미지·영상 모두 "없음/줌 인/줌 아웃" 중에서 고른다.
// 영상 줄은 줌아웃 없이 "없음/줌 인"만(백엔드 process_user_clip 제약).
type MotionOption = { value: string; label: string };
const IMAGE_MOTIONS: MotionOption[] = [
  { value: "none", label: "모션 없음" },
  { value: "zoom_in", label: "줌 인 (확대)" },
  { value: "zoom_out", label: "줌 아웃 (축소)" },
];
const CLIP_MOTIONS: MotionOption[] = [
  { value: "none", label: "모션 없음" },
  { value: "zoom_in", label: "줌 인 (확대)" },
];
// 예전 버전에서 저장된 팬(pan) 효과 — 선택지에선 뺐지만 값은 유효(렌더는 계속 지원).
// 옛 작업을 다시 열었을 때 드롭다운이 빈 채로 뜨지 않게 라벨만 남겨둔다.
const LEGACY_MOTION_LABELS: Record<string, string> = {
  pan_left: "왼쪽으로 (이전 효과)",
  pan_right: "오른쪽으로 (이전 효과)",
  pan_up: "위로 (이전 효과)",
  pan_down: "아래로 (이전 효과)",
};
const SLIDER_COMMIT_MS = 400;
// 크기 슬라이더 조작 뒤 외곽선/핸들을 잠깐 더 보여주는 시간(ms). "직접 잡을 수 있음" 힌트.
const SPOTLIGHT_HOLD_MS = 1100;

function errMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

// 정지 상태 자막 자동 순환용 — 각 조각을 몇 초 보여줄지. 음성이 있으면 실제 나레이션
// 타이밍(word_times → 비례), 아직 음성을 안 만들었으면 글자 수 기반으로 추정한다.
function chunkDisplayDurations(
  chunks: string[],
  durationSec: number | null,
  wordTimes: WordTime[] | null,
): number[] {
  if (chunks.length === 0) return [];
  if (durationSec && durationSec > 0) {
    const bounds = chunkBoundariesFromWordTimes(chunks, wordTimes, durationSec);
    if (bounds) {
      return bounds.map((b, i) => Math.max(0.4, b - (i > 0 ? bounds[i - 1] : 0)));
    }
    const weights = chunks.map((c) => Math.max(1, displayLen(c)));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    return weights.map((w) => Math.max(0.4, (w / total) * durationSec));
  }
  // 음성 미빌드: 글자수×0.15초, 조각당 최소 1.2초로 넉넉히.
  return chunks.map((c) => Math.max(1.2, displayLen(c) * 0.15));
}

// 자막 조각 편집 행 — 자막 어절을 칩으로 나열한다. 어절 사이 간격 3종:
//   · = 같은 줄(누르면 컷으로 나눠 다음 화면으로), ✂ = 컷 경계(누르면 합침),
//   ↵(초록) = 화면 줄바꿈(같은 화면 두 줄; 수정 모드에서만 바꾸고 여기선 표시만).
// 글자 수정·화면 줄바꿈은 [수정] 버튼으로 연다. 재생 중 조각은 강조.
// 12자 초과 화면 줄은 경고색(최종 영상이 화면 밖으로 넘침 → 영상 만들기 차단).
function SubtitleChunkRow({
  chunks,
  onToggle,
  onEdit,
  disabled,
  activeChunkIdx,
}: {
  chunks: string[];
  onToggle: (wordIndex: number) => void;
  onEdit: () => void;
  disabled?: boolean;
  activeChunkIdx?: number | null;
}) {
  const { words, gaps, segOfWord, lineOfWord, lineOverflow } = parseSubtitleChunks(chunks);
  if (words.length === 0) return null;
  const anyOverflow = lineOverflow.some(Boolean);

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-y-1 text-xs">
      <span className="mr-1.5 inline-flex shrink-0 items-center gap-1 text-muted-foreground">
        <span className="rounded border border-border px-1 text-[0.6rem] font-medium">자막</span>
      </span>
      {words.map((w, i) => {
        const over = lineOverflow[lineOfWord[i]];
        const playing = activeChunkIdx != null && activeChunkIdx === segOfWord[i];
        const gap = i > 0 ? gaps[i - 1] : null;
        return (
          <Fragment key={i}>
            {gap === "cut" && (
              <button
                type="button"
                onClick={() => onToggle(i)}
                disabled={disabled}
                aria-label="컷 합치기"
                title="다음 화면으로 넘어가는 자리예요 — 누르면 합쳐요"
                className="mx-0.5 inline-flex h-5 w-5 items-center justify-center rounded bg-primary text-primary-foreground transition-colors disabled:opacity-40"
              >
                <Scissors className="size-3" />
              </button>
            )}
            {gap === "wrap" && (
              <span
                aria-label="화면 줄바꿈"
                title="같은 화면에서 두 줄로 나뉜 자리예요 (수정에서 바꿔요)"
                className="mx-0.5 inline-flex h-5 items-center justify-center px-0.5 text-emerald-600 dark:text-emerald-400"
              >
                <CornerDownLeft className="size-3" />
              </span>
            )}
            {gap === "space" && (
              <button
                type="button"
                onClick={() => onToggle(i)}
                disabled={disabled}
                aria-label="여기서 컷 나누기"
                title="누르면 여기서 자막을 끊어 다음 화면으로 넘겨요"
                className="mx-0.5 inline-flex h-5 w-3 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
              >
                ·
              </button>
            )}
            <span
              className={cn(
                "rounded px-1 py-0.5",
                over
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                  : playing
                    ? "bg-primary/15 text-foreground"
                    : "text-foreground",
              )}
            >
              {stripSubtitlePeriods(w)}
            </span>
          </Fragment>
        );
      })}
      <button
        type="button"
        onClick={onEdit}
        disabled={disabled}
        aria-label="자막 글자 수정"
        title="글자를 고치거나 화면을 두 줄로 나눠요"
        className="ml-1.5 inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5 text-[0.7rem] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
      >
        <Pencil className="size-3" />
        수정
      </button>
      {anyOverflow && (
        <span className="ml-1.5 inline-flex items-center gap-1 text-[0.7rem] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3" />
          화면보다 길어요 — 끊거나 수정에서 줄을 나눠주세요
        </span>
      )}
    </div>
  );
}

// 자막 수정 모드 — 컷별 입력창. 글자 수정(발음≠표시)·스페이스 띄어쓰기·Enter 화면 줄바꿈을
// 자유 타이핑으로 처리한다. 컷 나누기/합치기는 칩에서만 하므로 여기선 컷 개수를 고정.
function SubtitleEditRow({
  initialChunks,
  disabled,
  onSave,
  onCancel,
}: {
  initialChunks: string[];
  disabled?: boolean;
  onSave: (chunks: string[]) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<string[]>(() =>
    initialChunks.length > 0 ? initialChunks : [""],
  );
  const multi = values.length > 1;

  function commit() {
    // 조각별: 줄마다 trim, 빈 줄 제거, \n 로 다시 이어붙임. 통째로 빈 조각은 버린다.
    const cleaned = values
      .map((v) =>
        v
          .split("\n")
          .map((ln) => ln.trim())
          .filter(Boolean)
          .join("\n"),
      )
      .filter((c) => c.length > 0);
    onSave(cleaned);
  }

  return (
    <div className="mt-1.5 rounded-md border border-primary/40 bg-primary/[0.03] p-2 text-xs">
      <div className="mb-1.5 flex items-center gap-1 text-[0.7rem] text-muted-foreground">
        <Pencil className="size-3 text-primary" />
        <span>
          글자를 고치고, <span className="font-medium text-foreground">Enter로 화면을 두 줄</span>로
          나눠요. 음성은 그대로예요.
        </span>
      </div>
      <div className="space-y-1.5">
        {values.map((v, i) => {
          const overLine = v.split("\n").some((ln) => displayLen(ln.trim()) > MAX_DISPLAY);
          return (
            <div key={i}>
              {multi && (
                <span className="mb-0.5 inline-block rounded bg-primary/10 px-1.5 text-[0.6rem] font-medium text-primary">
                  컷 {i + 1}
                </span>
              )}
              <Textarea
                value={v}
                autoFocus={i === 0}
                disabled={disabled}
                onChange={(e) =>
                  setValues((prev) => prev.map((x, j) => (j === i ? e.target.value : x)))
                }
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.preventDefault();
                    onCancel();
                  } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    commit();
                  }
                }}
                rows={Math.max(1, v.split("\n").length)}
                className="min-h-0 resize-y py-1 text-sm leading-snug"
                aria-label={multi ? `컷 ${i + 1} 자막` : "자막"}
              />
              {overLine && (
                <span className="mt-0.5 inline-flex items-center gap-1 text-[0.7rem] text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="size-3" />
                  화면보다 긴 줄이 있어요 — Enter로 나눠주세요
                </span>
              )}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <Button size="xs" onClick={commit} disabled={disabled}>
          <Check className="size-3" />
          완료
        </Button>
        <Button size="xs" variant="outline" onClick={onCancel} disabled={disabled}>
          <X className="size-3" />
          취소
        </Button>
      </div>
    </div>
  );
}

export function LineAssetEditor() {
  const { state, update } = useYt();
  const jobId = state.jobId;
  const [lines, setLines] = useState<ScriptLine[]>([]);
  const [sources, setSources] = useState<LineSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  // 업로드 진행 중인 줄(line_id 기반 — 재인덱싱돼도 표시가 엉뚱한 줄로 안 옮겨가게).
  const [uploading, setUploading] = useState<Set<string>>(new Set());
  // 줄 텍스트 인라인 편집: line_id → 편집 중인 텍스트(아직 서버 저장 전). 저장되면 제거.
  // 폴링이 lines 를 갈아끼워도 textarea 는 이 draft 를 우선 표시 → 입력 중 글자가 안 날아간다.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingText, setSavingText] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState<Set<string>>(new Set());
  // 나누기/합치기(구조 변경) 진행 중인 줄. 끝나면 응답의 재정렬 전체로 교체.
  const [structuring, setStructuring] = useState<Set<string>>(new Set());
  // 우측 프리뷰에 띄울 선택 줄(line_id 기준). index 로 잡으면 split/merge/delete 재인덱싱 후
  // 다른 줄을 가리킨다 — 백엔드 /images/{idx} 도 lines[idx].line_id 로 파일을 찾으므로.
  const [activeLineId, setActiveLineId] = useState<string>("");
  // 자산 위치/배율 편집 초안(line_id 기준). 2초 폴링이 드래그 중 미디어를 되돌리지 못하게
  // lines[i].transform 보다 우선한다. 서버 저장이 확정되면 lines 에 접고 초안을 지운다.
  const [transformDrafts, setTransformDrafts] = useState<Record<string, LineTransform>>({});
  // 영상 조각 시작점(clip_start) 미세조정 초안(line_id 기준) — transformDrafts 와 같은 이유.
  const [clipStartDrafts, setClipStartDrafts] = useState<Record<string, number>>({});
  // 자산(이미지/영상) 우클릭 다운로드 메뉴. null = 닫힘.
  // items = 이 줄에서 받을 수 있는 자산들(AI 변환 클립이면 영상+원본이미지 둘 다).
  const [assetMenu, setAssetMenu] = useState<
    { x: number; y: number; items: { label: string; url: string; filename: string }[] } | null
  >(null);

  // 음성 재생 컨트롤러(줄별 ▶ / 전체 미리듣기 + BGM 믹스 + 자막 조각 추적).
  const playback = useTtsSessionPlayback();
  // 음성 세션 빌드/영상 확정 진행 표시.
  const [building, setBuilding] = useState(false);
  const [creating, setCreating] = useState(false);
  // 선택된 BGM(전체 미리듣기 믹서에 넘길 url·길이). BgmPicker 가 알려준다.
  const [selectedBgm, setSelectedBgm] = useState<BgmItem | null>(null);
  // 정지 상태에서 선택 줄 자막을 나레이션 타이밍대로 자동 순환시키는 인덱스(재생 중엔 재생 훅이 몰아감).
  const [cycleChunkIdx, setCycleChunkIdx] = useState(0);
  // 자막 "수정" 모드에 들어간 줄(line_id). null 이면 모든 줄이 칩 보기.
  const [editingSubLineId, setEditingSubLineId] = useState<string | null>(null);
  // 순환 타이머가 재개(드래그·재생 전환 후)될 때 이어갈 현재 인덱스. state 와 동기 유지.
  const cycleIdxRef = useRef(0);
  // 크기 슬라이더를 건드리는 동안 외곽선/핸들을 잠깐 켜는 신호(포커스 없이도 "잡을 수 있음"을 노출).
  const [sliderSpotlight, setSliderSpotlight] = useState(false);
  // 프리뷰에서 자막을 끌고 있는 중 — 드래그 동안 자막 자동 순환을 멈춰 잡은 조각이 안 바뀌게.
  const [subtitleDragging, setSubtitleDragging] = useState(false);
  // 프리뷰 프레임 폭 — 창 높이에 맞춰 자동(짧으면 축소, 크면 상한). 고정 크기면 짧은 창에서 잘림.
  const [previewWidth, setPreviewWidth] = useState(300);
  // 프레임 밖 외곽선/리사이즈 핸들을 그릴 오버레이(프레임의 형제 — overflow-hidden 미적용).
  // TransformablePreviewMedia 가 여기에 포털로 렌더한다.
  const [previewOverlayEl, setPreviewOverlayEl] = useState<HTMLDivElement | null>(null);
  // 선트림 업로드 모달 — 영상 파일을 고르면 업로드 전에 쓸 구간을 먼저 선택한다.
  // srcPath: 데스크톱 원본 경로(경로 임포트·프록시용). previewSrc: 저화질 미리보기본 URL. preparing: 변환 중.
  const [trimTarget, setTrimTarget] = useState<{
    lineId: string;
    file: File;
    neededSec: number;
    srcPath: string;
    previewSrc: string;
    preparing: boolean;
  } | null>(null);
  const [trimBusy, setTrimBusy] = useState(false);
  // 이미 매니페스트 복원을 시도했는지(중복 방지).
  const hydratedRef = useRef(false);

  const mountedRef = useRef(true);
  const pollingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const clipFileRef = useRef<HTMLInputElement>(null);
  // 업로드 대상 줄의 line_id. 파일 대화상자가 열린 사이 split/delete 로 순서가 바뀌어도
  // 전송 직전 line_id → 현재 index 로 재해석해 엉뚱한 줄에 안 올라가게 한다(Codex #7).
  const uploadTargetRef = useRef<string>("");
  // 항상 최신 lines 를 가리키는 거울. blur 저장·삭제 시 line_id → 현재 index 를
  // 이걸로 재해석한다(폴링/삭제로 순서가 바뀌어도 엉뚱한 줄을 안 건드리게).
  const linesRef = useRef<ScriptLine[]>([]);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

  // 현재 프리뷰에 띄운 줄의 (line_id, index). transform 핸들러가 이벤트 시점에 참조한다.
  const activeRef = useRef<{ lineId: string; index: number }>({ lineId: "", index: -1 });
  const sliderTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const spotlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (sliderTimer.current) clearTimeout(sliderTimer.current);
    if (spotlightTimer.current) clearTimeout(spotlightTimer.current);
  }, []);

  // 크기 슬라이더/원래대로를 만질 때 외곽선+핸들을 잠깐 켠다(마지막 조작 뒤 SPOTLIGHT_HOLD_MS 후 꺼짐).
  const flashSpotlight = useCallback(() => {
    setSliderSpotlight(true);
    if (spotlightTimer.current) clearTimeout(spotlightTimer.current);
    spotlightTimer.current = setTimeout(() => setSliderSpotlight(false), SPOTLIGHT_HOLD_MS);
  }, []);

  // 위치/배율을 서버에 저장. 성공 시 lines 에 접고(서버가 클램프한 값) 초안을 지운다.
  const persistTransform = useCallback(
    (t: LineTransform, lineId: string, index: number) => {
      if (!jobId || !lineId) return;
      saveLineVisual(jobId, index, lineId, { transform: t })
        .then((res) => {
          if (!mountedRef.current) return;
          const finalT = (res.transform as LineTransform | null) ?? t;
          setLines((prev) =>
            prev.map((l) =>
              String(l.line_id ?? "") === lineId ? { ...l, transform: finalT } : l,
            ),
          );
          setTransformDrafts((d) => {
            if (!(lineId in d)) return d;
            const n = { ...d };
            delete n[lineId];
            return n;
          });
        })
        .catch((e) => {
          // 실패 시 초안을 남겨 화면엔 유지(다음 조작 때 재시도).
          if (mountedRef.current) {
            toast.error(e instanceof Error ? e.message : "위치 저장에 실패했어요.");
          }
        });
    },
    [jobId],
  );

  // 드래그/휠 중 실시간 갱신(초안만, 미저장).
  const onTransformChange = useCallback((t: LineTransform) => {
    const { lineId } = activeRef.current;
    if (!lineId) return;
    setTransformDrafts((d) => ({ ...d, [lineId]: t }));
  }, []);

  // 확정 저장(드래그 끝/휠 정지 — TransformablePreviewMedia 가 호출).
  const onTransformCommit = useCallback(
    (t: LineTransform) => {
      const { lineId, index } = activeRef.current;
      if (!lineId || index < 0) return;
      if (sliderTimer.current) clearTimeout(sliderTimer.current);
      setTransformDrafts((d) => ({ ...d, [lineId]: t }));
      persistTransform(t, lineId, index);
    },
    [persistTransform],
  );

  // 크기 슬라이더: 실시간 반영 + 디바운스 저장.
  const onScaleSlider = useCallback(
    (scalePct: number, current: LineTransform) => {
      const { lineId, index } = activeRef.current;
      if (!lineId || index < 0) return;
      const t = clampTransform({ ...current, scale: scalePct / 100 });
      setTransformDrafts((d) => ({ ...d, [lineId]: t }));
      flashSpotlight();
      if (sliderTimer.current) clearTimeout(sliderTimer.current);
      sliderTimer.current = setTimeout(
        () => persistTransform(t, lineId, index),
        SLIDER_COMMIT_MS,
      );
    },
    [persistTransform, flashSpotlight],
  );

  // "원래대로": 현재 레이아웃 기준(기본=cover, 박스·흐림=fit)으로 서버가 되돌린다 + 손댐 해제.
  // 원본 크기(nat)는 프리뷰 내부에만 있어 프론트가 계산할 수 없으므로 서버 리셋에 위임.
  // 목표값을 응답 전엔 모르니 낙관적 draft 는 두지 않고, 응답을 persistTransform 처럼 접는다.
  const onResetTransform = useCallback(() => {
    const { lineId, index } = activeRef.current;
    if (!lineId || index < 0 || !jobId) return;
    if (sliderTimer.current) clearTimeout(sliderTimer.current);
    flashSpotlight();
    saveLineVisual(jobId, index, lineId, { resetToLayout: true })
      .then((res) => {
        if (!mountedRef.current) return;
        const finalT = (res.transform as LineTransform | null) ?? null;
        setLines((prev) =>
          prev.map((l) =>
            String(l.line_id ?? "") === lineId
              ? { ...l, transform: finalT, transform_manual: false }
              : l,
          ),
        );
        setTransformDrafts((d) => {
          if (!(lineId in d)) return d;
          const n = { ...d };
          delete n[lineId];
          return n;
        });
      })
      .catch((e) => {
        if (mountedRef.current) {
          toast.error(e instanceof Error ? e.message : "되돌리기에 실패했어요.");
        }
      });
  }, [jobId, flashSpotlight]);

  // 레이아웃 선택: 방금 고른 mode 의 기본 배치(기본=cover, 박스·흐림=fit)로 '안 건드린' 줄만
  // 서버에서 일괄 정렬한다(손댄 줄은 보존). layoutMode 자체는 LayoutPicker 가 이미 state 에 반영했다.
  const onLayoutSelect = useCallback(
    (mode: LayoutMode) => {
      if (!jobId) return;
      if (sliderTimer.current) clearTimeout(sliderTimer.current);
      setTransformDrafts({}); // 진행 중이던 로컬 초안 폐기(일괄 정렬 결과로 대체됨)
      applyLayoutFitTransforms(jobId, mode)
        .then((res) => {
          if (!mountedRef.current) return;
          setLines(res.lines);
          setSources(res.sources);
        })
        .catch((e) => {
          if (mountedRef.current) {
            toast.error(e instanceof Error ? e.message : "레이아웃 맞춤에 실패했어요.");
          }
        });
    },
    [jobId],
  );

  // 움직임 효과 선택: 즉시 저장 + 낙관적 반영.
  const onMotionChange = useCallback(
    (motion: string) => {
      const { lineId, index } = activeRef.current;
      if (!jobId || !lineId || index < 0) return;
      setLines((prev) =>
        prev.map((l) =>
          String(l.line_id ?? "") === lineId ? { ...l, motion } : l,
        ),
      );
      saveLineVisual(jobId, index, lineId, { motion }).catch((e) => {
        if (mountedRef.current) {
          toast.error(e instanceof Error ? e.message : "효과 저장에 실패했어요.");
        }
      });
    },
    [jobId],
  );

  // 구간 트랙 드래그 중: 실시간 반영(초안). 미리보기가 그 구간을 바로 재생하도록.
  const onClipStartDrag = useCallback((sec: number) => {
    const { lineId } = activeRef.current;
    if (!lineId) return;
    setClipStartDrafts((d) => ({ ...d, [lineId]: sec }));
  }, []);

  // 구간 트랙 놓을 때: 서버 저장 확정 후 lines 반영·초안 정리.
  const onClipStartCommit = useCallback(
    (sec: number) => {
      const { lineId, index } = activeRef.current;
      if (!jobId || !lineId || index < 0) return;
      setClipStartDrafts((d) => ({ ...d, [lineId]: sec }));
      saveLineVisual(jobId, index, lineId, { clipStart: sec })
        .then((res) => {
          if (!mountedRef.current) return;
          const finalV = (res.clip_start as number | null | undefined) ?? sec;
          setLines((prev) =>
            prev.map((l) =>
              String(l.line_id ?? "") === lineId ? { ...l, clip_start: finalV } : l,
            ),
          );
          setClipStartDrafts((d) => {
            const n = { ...d };
            delete n[lineId];
            return n;
          });
        })
        .catch((e) => {
          if (mountedRef.current) {
            toast.error(e instanceof Error ? e.message : "구간 저장에 실패했어요.");
          }
        });
    },
    [jobId],
  );

  // split 로 새로 생긴 줄에 포커스/캐럿을 옮기려는 "예약". 단발 rAF 는 줄 교체(setLines)+잠금
  // 해제(finally) 재렌더와 타이밍이 어긋나 끝-Enter 에서 빗나갔다(readOnly 로 원래 줄이 포커스를
  // 쥐고 있어 더 두드러짐). 줄 목록이 커밋된 뒤 아래 useEffect 에서 결정적으로 적용한다.
  const pendingFocusRef = useRef<{ lineId: string; pos: number } | null>(null);
  useEffect(() => {
    const pf = pendingFocusRef.current;
    if (!pf) return;
    const ta = document.querySelector<HTMLTextAreaElement>(
      `textarea[data-line-id="${pf.lineId}"]`,
    );
    if (!ta) return; // 아직 미렌더 — 다음 lines 변경 때 재시도
    pendingFocusRef.current = null;
    ta.focus();
    const p = Math.max(0, Math.min(pf.pos, ta.value.length));
    ta.setSelectionRange(p, p);
  }, [lines]);

  // 선택 줄이 비었거나 사라지면(초기 진입·삭제·재인덱싱) 첫 줄로 회복.
  useEffect(() => {
    if (!lines.length) return;
    const exists = lines.some((l) => String(l.line_id ?? "") === activeLineId);
    if (!exists) setActiveLineId(String(lines[0].line_id ?? ""));
  }, [lines, activeLineId]);

  function indexOfLine(lineId: string): number {
    return linesRef.current.findIndex((l) => String(l.line_id ?? "") === lineId);
  }
  // 합치기/삭제 후 해당 줄 textarea 에 포커스 + 캐럿을 지정 위치로(이음새 복원).
  // Textarea 는 ref 를 안 넘기므로 data-line-id 로 찾는다. 재렌더 후라 rAF 로 한 프레임 미룬다.
  function focusLineCaret(lineId: string, pos: number) {
    if (!lineId) return;
    requestAnimationFrame(() => {
      const ta = document.querySelector<HTMLTextAreaElement>(
        `textarea[data-line-id="${lineId}"]`,
      );
      if (!ta) return;
      ta.focus();
      const p = Math.max(0, Math.min(pos, ta.value.length));
      ta.setSelectionRange(p, p);
    });
  }
  function clearDraft(lineId: string) {
    setDrafts((d) => {
      if (!(lineId in d)) return d;
      const n = { ...d };
      delete n[lineId];
      return n;
    });
  }

  async function refresh(): Promise<ScriptLine[] | null> {
    if (!jobId) return null;
    try {
      const st = await getDraftState(jobId);
      if (!mountedRef.current) return null;
      setLines(st.lines);
      setSources(st.line_sources);
      return st.lines;
    } catch {
      return null;
    }
  }

  async function startPolling() {
    if (pollingRef.current) return;
    pollingRef.current = true;
    setPolling(true);
    let doneCount = lines.filter((l) => isReady(l) || isFailed(l)).length;
    let stallAt = Date.now() + STALL_MS;
    // AI 영상 변환은 한 줄에 수 분 걸려 줄 완료(진척)가 한동안 없을 수 있다. 변환을 처음 본 시점에
    // 한 번만 넉넉한 마감을 따로 잡아 두고(끝나면 해제) 가짜 타임아웃을 막는다.
    let clipDeadline = 0;
    while (mountedRef.current && pollingRef.current) {
      await sleep(POLL_MS);
      if (!mountedRef.current) break;
      const ls = await refresh();
      if (ls) {
        const done = ls.filter((l) => isReady(l) || isFailed(l)).length;
        if (done > doneCount) {
          doneCount = done;
          stallAt = Date.now() + STALL_MS; // 진척 있으면 정체 타이머 연장
        }
        if (anyAiClipWorking(ls)) {
          if (!clipDeadline) clipDeadline = Date.now() + CLIP_STALL_MS;
        } else {
          clipDeadline = 0; // 변환이 끝났으면 변환용 마감 해제
        }
        if (!anyWorking(ls)) break;
      }
      if (Date.now() > Math.max(stallAt, clipDeadline)) {
        toast.error("생성이 예상보다 오래 걸려요. 잠시 후 다시 시도하거나 새로고침해 주세요.");
        break;
      }
    }
    pollingRef.current = false;
    if (mountedRef.current) setPolling(false);
  }

  useEffect(() => {
    mountedRef.current = true;
    (async () => {
      setLoading(true);
      const ls = await refresh();
      if (mountedRef.current) setLoading(false);
      if (ls && anyWorking(ls)) startPolling();
    })();
    return () => {
      mountedRef.current = false;
      pollingRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function genAll() {
    if (!jobId) return;
    try {
      const r = await generateMissingImages(jobId);
      if (!r.queued?.length && !r.already_running) {
        toast.info("AI로 만들 줄이 없어요. (이미 준비됨이거나 내 사진이 올라간 줄)");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "일괄 생성 요청에 실패했어요.");
      return;
    }
    await refresh();
    startPolling();
  }

  async function regen(i: number) {
    if (!jobId) return;
    try {
      await regenerateImage(jobId, i);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "이미지 생성 요청에 실패했어요.");
      return;
    }
    await refresh();
    startPolling();
  }

  // 준비된 이미지를 AI 로 움직이는 영상으로 변환(비동기, fal.ai). 상태는 폴링으로 추적.
  async function convertToClip(i: number) {
    if (!jobId) return;
    // AI 영상은 6초 고정 — 나레이션이 6초를 넘으면 변환해도 마지막 렌더에서 막힌다.
    // 생성(비용·수 분) 전에 미리 차단한다. 음성 미빌드/dirty면 글자수 추정으로 폴백해 안내.
    const line = linesRef.current[i];
    if (line) {
      const measured = durationOf(line);
      const needed = measured ?? estimateLineSec(line);
      if (needed > AI_CLIP_MAX_SEC + CLIP_SHORTFALL_EPS) {
        toast.error(
          measured != null
            ? `이 줄 나레이션은 ${measured.toFixed(1)}초예요. AI 영상은 최대 6초라 다 담을 수 없어요. 대본을 줄이거나 영상을 직접 올려주세요.`
            : `이 줄은 나레이션이 약 ${Math.round(needed)}초로 예상돼요. AI 영상은 최대 6초예요. 먼저 나레이션 음성을 만들어 길이를 확인하거나 대본을 줄여주세요.`,
        );
        return;
      }
    }
    try {
      await regenerateClip(jobId, i);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "영상 변환 요청에 실패했어요.");
      return;
    }
    await refresh();
    startPolling();
  }

  // 텍스트 편집 저장(blur 시). 재정렬 없는 edit-line — line_id 로 현재 index 재해석 후 전송.
  async function saveText(lineId: string) {
    if (!jobId) return;
    const draft = drafts[lineId];
    if (draft === undefined) return; // 손 안 댄 줄
    const idx = indexOfLine(lineId);
    if (idx < 0) {
      clearDraft(lineId);
      return; // 그 사이 삭제된 줄
    }
    const current = linesRef.current[idx]?.text ?? "";
    if (draft === current) {
      clearDraft(lineId);
      return; // 바뀐 게 없음
    }
    setSavingText((s) => new Set(s).add(lineId));
    try {
      await editLine(jobId, idx, draft);
      if (!mountedRef.current) return;
      // 로컬 텍스트 확정 + draft 제거(저장 성공이므로 textarea 는 확정 텍스트로 자연 전환).
      // 텍스트가 바뀌면 백엔드가 subtitle_chunks 를 리셋하므로 로컬도 null 로 맞춘다(자동 분할 복귀).
      setLines((prev) =>
        prev.map((l) =>
          String(l.line_id ?? "") === lineId
            ? { ...l, text: draft, subtitle_chunks: null }
            : l,
        ),
      );
      // 텍스트가 바뀌면 자막 조각이 자동 분할로 리셋되므로, 이 줄의 자막 수정 모드도 닫는다
      // (열린 채 두면 낡은 드래프트를 되살릴 수 있음).
      setEditingSubLineId((cur) => (cur === lineId ? null : cur));
      clearDraft(lineId);
      // 줄 텍스트가 바뀌었으니 음성 재빌드 필요 표시(세션은 유지 = incremental: 바뀐 줄만 재합성).
      update({ ttsDirty: true });
    } catch (e) {
      // 실패 시 draft 를 남겨 입력을 보존(다시 blur 하면 재시도).
      if (mountedRef.current) {
        toast.error(e instanceof Error ? e.message : "텍스트 저장에 실패했어요.");
      }
    } finally {
      if (mountedRef.current) {
        setSavingText((s) => {
          const n = new Set(s);
          n.delete(lineId);
          return n;
        });
      }
    }
  }

  // 줄 삭제. line_id 동봉 → 백엔드가 현재 위치 재확인(레이스 안전). 응답으로 재정렬 전체 교체.
  async function del(lineId: string) {
    if (!jobId) return;
    playback.stop();
    if (linesRef.current.length <= 1) {
      toast.error("마지막 한 줄은 지울 수 없어요.");
      return;
    }
    const idx = indexOfLine(lineId);
    if (idx < 0) return;
    setDeleting((s) => new Set(s).add(lineId));
    try {
      const res = await deleteLine(jobId, idx, lineId);
      if (!mountedRef.current) return;
      setLines(res.lines);
      setSources(res.sources);
      clearDraft(lineId);
      update({ ttsDirty: true }); // 줄 삭제(구조 변경) → 음성 재빌드 필요
    } catch (e) {
      if (mountedRef.current) {
        toast.error(e instanceof Error ? e.message : "삭제에 실패했어요.");
      }
    } finally {
      if (mountedRef.current) {
        setDeleting((s) => {
          const n = new Set(s);
          n.delete(lineId);
          return n;
        });
      }
    }
  }

  // Enter 로 줄 나누기. 커서 앞(before)/뒤(after) 텍스트는 화면 그대로 보냄(미저장 편집 포함).
  async function doSplit(lineId: string, before: string, after: string) {
    if (!jobId) return;
    playback.stop();
    const idx = indexOfLine(lineId);
    if (idx < 0) return;
    setStructuring((s) => new Set(s).add(lineId));
    try {
      const res = await splitLine(jobId, idx, before, after);
      if (!mountedRef.current) return;
      setLines(res.lines);
      setSources(res.sources);
      clearDraft(lineId); // 서버 텍스트가 before 로 확정됨
      update({ ttsDirty: true }); // 줄 나누기(구조 변경) → 음성 재빌드 필요
      // 엔터 직후 커서를 "뒷부분(after)" 줄로 이동 — 일반 에디터 Enter 동작.
      // 백엔드 split 3분기 모두 뒷부분이 idx+1 에 온다(가운데=second, 끝=새 빈 줄, 맨 앞=기존 텍스트가 밀려남).
      // 성공 경로에서만 이동한다(실패 시 원래 줄 포커스 유지).
      const afterId = String(res.lines[idx + 1]?.line_id ?? "");
      if (afterId) {
        setActiveLineId(afterId); // 미리보기도 새 줄로 동기화
        // 새 줄은 방금 setLines 로 추가됨 — 커밋 후 useEffect 가 포커스/캐럿(맨 앞)을 적용.
        pendingFocusRef.current = { lineId: afterId, pos: 0 };
      }
    } catch (e) {
      if (mountedRef.current) {
        toast.error(e instanceof Error ? e.message : "줄 나누기에 실패했어요.");
      }
    } finally {
      if (mountedRef.current) {
        setStructuring((s) => {
          const n = new Set(s);
          n.delete(lineId);
          return n;
        });
      }
    }
  }

  // 위 줄과 합치기. 서버가 두 줄의 '서버 텍스트'를 이어붙이므로 미저장 편집을 먼저 반영한다.
  async function mergeUp(lineId: string) {
    if (!jobId) return;
    playback.stop();
    const idx = indexOfLine(lineId);
    if (idx < 1) return; // 첫 줄은 위와 합칠 수 없음
    const prevId = String(linesRef.current[idx - 1]?.line_id ?? "");
    setStructuring((s) => new Set(s).add(lineId));
    try {
      if (prevId) await saveText(prevId);
      await saveText(lineId);
      const idx2 = indexOfLine(lineId);
      if (idx2 < 1) return;
      const res = await mergeLine(jobId, idx2);
      if (!mountedRef.current) return;
      setLines(res.lines);
      setSources(res.sources);
      clearDraft(lineId);
      if (prevId) clearDraft(prevId);
      update({ ttsDirty: true }); // 줄 합치기(구조 변경) → 음성 재빌드 필요
    } catch (e) {
      if (mountedRef.current) {
        toast.error(e instanceof Error ? e.message : "줄 합치기에 실패했어요.");
      }
    } finally {
      if (mountedRef.current) {
        setStructuring((s) => {
          const n = new Set(s);
          n.delete(lineId);
          return n;
        });
      }
    }
  }

  function pickUpload(lineId: string) {
    if (!jobId || !lineId) return;
    uploadTargetRef.current = lineId;
    fileRef.current?.click();
  }
  function pickUploadClip(lineId: string) {
    if (!jobId || !lineId) return;
    uploadTargetRef.current = lineId;
    clipFileRef.current?.click();
  }

  function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = "";
    const lineId = uploadTargetRef.current;
    uploadTargetRef.current = "";
    void doUpload(lineId, file, "image");
  }
  // 영상은 업로드 전에 "쓸 구간" 선택 모달을 먼저 연다(선트림). 그 폭 = 나레이션 길이라 음성이 있어야 한다.
  function onClipChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = "";
    const lineId = uploadTargetRef.current;
    uploadTargetRef.current = "";
    if (!file || !lineId || !jobId) return;
    const i = indexOfLine(lineId);
    if (i < 0) {
      toast.error("그 줄이 사라졌어요. 다시 시도해 주세요.");
      return;
    }
    if (file.type && !CLIP_ALLOWED_TYPES.includes(file.type)) {
      toast.error("MP4, MOV, WebM, AVI 영상만 올릴 수 있어요.");
      return;
    }
    // 데스크톱 앱이면 경로 임포트라 용량 무제한, 웹이면 50MB 제한(전송해야 하므로).
    const desktop = !!window.electronAPI?.media?.getPathForFile;
    if (!desktop && file.size > CLIP_MAX_BYTES) {
      toast.error("영상은 50MB 이하만 올릴 수 있어요.");
      return;
    }
    // 나레이션 길이를 알아야 창 폭이 나온다 — 음성 미빌드/수정중이면 차단(먼저 음성 만들기).
    const needed = durationOf(lines[i]);
    if (needed == null) {
      toast.error("먼저 아래 '나레이션 음성 만들기'를 실행해 주세요. 영상에서 쓸 구간 길이를 알려면 음성이 필요해요.");
      return;
    }
    const path = window.electronAPI?.media?.getPathForFile?.(file) ?? "";
    if (path) {
      // 데스크톱: 원본이 HEVC(폰 영상)여도 브라우저가 못 읽으므로, 백엔드가 저화질 H.264 미리보기본을
      // 만들어 재생한다. 만드는 동안 모달은 "준비 중" 스피너. (최종 영상은 원본을 원화질로 잘라 씀.)
      setTrimTarget({ lineId, file, neededSec: needed, srcPath: path, previewSrc: "", preparing: true });
      makeClipProxy(jobId, path)
        .then((res) => {
          if (!mountedRef.current) return;
          setTrimTarget((t) =>
            t && t.lineId === lineId ? { ...t, previewSrc: ytUrl(res.proxy_url), preparing: false } : t,
          );
        })
        .catch(() => {
          if (!mountedRef.current) return;
          // 프록시 실패 → 로컬 재생 시도로 폴백(HEVC면 모달이 숫자 입력으로 다시 폴백).
          setTrimTarget((t) => (t && t.lineId === lineId ? { ...t, preparing: false } : t));
        });
    } else {
      // 웹: 로컬 파일 blob 재생(H.264 면 재생, HEVC 면 모달이 숫자 입력 폴백).
      setTrimTarget({ lineId, file, neededSec: needed, srcPath: "", previewSrc: "", preparing: false });
    }
  }

  // 모달 닫기(취소/완료) — 데스크톱 미리보기 임시본을 정리한다(백엔드가 확정 시엔 이미 지우지만 취소 대비).
  function closeTrim() {
    if (trimTarget?.srcPath && jobId) void cleanupClipProxy(jobId);
    setTrimTarget(null);
  }

  // 모달에서 구간 확정 → 데스크톱은 경로 임포트(무제한), 웹은 파일+구간 업로드(50MB).
  async function onTrimConfirm(inSec: number) {
    const t = trimTarget;
    if (!t || !jobId) return;
    const lineId = t.lineId;
    const i = indexOfLine(lineId);
    if (i < 0) {
      toast.error("그 줄이 사라졌어요. 다시 시도해 주세요.");
      closeTrim();
      return;
    }
    setTrimBusy(true);
    setUploading((s) => new Set(s).add(lineId));
    try {
      const res = t.srcPath
        ? await importClipSegment(jobId, i, lineId, t.srcPath, inSec, t.neededSec)
        : await uploadClip(jobId, i, t.file, { inSec, neededSec: t.neededSec });
      if (!mountedRef.current) return;
      applyUploadSuccess(lineId, "clip", res);
      await refresh();
      if (mountedRef.current) {
        const j = indexOfLine(lineId);
        toast.success(`${(j < 0 ? i : j) + 1}번째 줄 영상을 올렸어요.`);
      }
      // 확정 성공: 백엔드가 import 시 프록시를 지웠으므로 여기선 상태만 닫는다.
      setTrimTarget(null);
    } catch (err) {
      if (mountedRef.current) {
        toast.error(err instanceof Error ? err.message : "업로드에 실패했어요.");
      }
    } finally {
      if (mountedRef.current) {
        setUploading((s) => {
          const n = new Set(s);
          n.delete(lineId);
          return n;
        });
        setTrimBusy(false);
      }
    }
  }

  // 업로드 성공 시 낙관적 반영(line_id 기준). clip 이면 조각 메타·transform 리셋까지 반영.
  function applyUploadSuccess(
    lineId: string,
    kind: "image" | "clip",
    res: UploadClipResult | { asset_version?: number | null },
  ) {
    setLines((prev) =>
      prev.map((l) =>
        String(l.line_id ?? "") === lineId
          ? {
              ...l,
              status: "ready",
              asset_version: res.asset_version ?? (l.asset_version ?? 0) + 1,
              asset_step: null,
              asset_message: null,
              fail_reason: null,
              ...(kind === "clip"
                ? {
                    // 새 자산 → 위치/배율 리셋(서버와 동일). 조각 메타 반영(전체 저장이면 null).
                    transform: null,
                    clip_start: (res as UploadClipResult).clip_start ?? null,
                    clip_duration: (res as UploadClipResult).clip_duration ?? null,
                  }
                : {}),
            }
          : l,
      ),
    );
    setSources((prev) => {
      const j = indexOfLine(lineId);
      return j < 0 ? prev : prev.map((s, idx) => (idx === j ? kind : s));
    });
    // 새 자산이 들어왔으니 이 줄의 이전 편집 초안(위치/시작점)은 무효 —
    // 남아 있으면 서버 리셋값을 덮어 프리뷰가 어긋난다.
    clearLineDrafts(lineId);
  }

  // 이 줄의 위치/배율·시작점 편집 초안을 버린다(새 자산 교체·클립 삭제 시).
  function clearLineDrafts(lineId: string) {
    setTransformDrafts((d) => {
      if (!(lineId in d)) return d;
      const n = { ...d };
      delete n[lineId];
      return n;
    });
    setClipStartDrafts((d) => {
      if (!(lineId in d)) return d;
      const n = { ...d };
      delete n[lineId];
      return n;
    });
  }

  // 이미지 업로드(영상은 선트림 모달 경유 onTrimConfirm 에서 처리).
  async function doUpload(
    lineId: string,
    file: File | undefined,
    kind: "image",
  ) {
    if (!file || !lineId || !jobId) return;
    // 파일 고르는 사이 순서가 바뀌었을 수 있으니 line_id 로 현재 index 를 다시 구한다.
    const i = indexOfLine(lineId);
    if (i < 0) {
      toast.error("그 줄이 사라졌어요. 다시 시도해 주세요.");
      return;
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      toast.error("PNG, JPG, WebP 이미지만 올릴 수 있어요.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("이미지는 10MB 이하만 올릴 수 있어요.");
      return;
    }
    setUploading((s) => new Set(s).add(lineId));
    try {
      const res = await uploadImage(jobId, i, file);
      if (!mountedRef.current) return;
      // 낙관적 반영 후 refresh 로 서버 상태 동기화(refresh 실패해도 새 자산은 보장).
      applyUploadSuccess(lineId, kind, res);
      await refresh();
      if (mountedRef.current) {
        const j = indexOfLine(lineId);
        toast.success(`${(j < 0 ? i : j) + 1}번째 줄 이미지를 올렸어요.`);
      }
    } catch (err) {
      if (mountedRef.current) {
        toast.error(err instanceof Error ? err.message : "업로드에 실패했어요.");
      }
    } finally {
      if (mountedRef.current) {
        setUploading((s) => {
          const n = new Set(s);
          n.delete(lineId);
          return n;
        });
      }
    }
  }

  function imgSrc(i: number, l: ScriptLine): string {
    return `${ytUrl(`/api/jobs/${jobId}/images/${i}`)}?v=${l.asset_version ?? 0}`;
  }
  function clipSrc(i: number, l: ScriptLine): string {
    return `${ytUrl(`/api/jobs/${jobId}/clips/${i}`)}?v=${l.asset_version ?? 0}`;
  }

  // 자산 우클릭 → 다운로드 메뉴 열기(준비된 줄만).
  // 이미지/AI이미지 줄: 이미지만. 클립 줄: 영상 + (원본 이미지가 있으면) 이미지.
  // AI 변환 클립은 원본 이미지를 지우지 않아 그대로 남는다 — clip_kind="ai" 는 즉시 확정,
  // 표식 없는 옛 변환분·레거시는 이미지 파일 존재를 HEAD 로 확인해 재변환 없이 커버한다.
  async function openAssetMenu(e: React.MouseEvent, i: number, l: ScriptLine) {
    if (!isReady(l) || !jobId) return;
    e.preventDefault();
    const x = e.clientX;
    const y = e.clientY;
    const imgItem = {
      label: "이미지 다운로드",
      url: imgSrc(i, l),
      filename: `쇼츠_${i + 1}번줄_이미지.png`,
    };
    const clipItem = {
      label: "영상 다운로드",
      url: clipSrc(i, l),
      filename: `쇼츠_${i + 1}번줄_영상.mp4`,
    };
    if ((sources[i] ?? "ai") !== "clip") {
      setAssetMenu({ x, y, items: [imgItem] });
      return;
    }
    const items = [clipItem];
    if (l.clip_kind === "ai" || (await assetExists(imgItem.url))) items.push(imgItem);
    setAssetMenu({ x, y, items });
  }
  // 자산 파일이 실제로 존재하는지 가볍게 확인(HEAD, 본문 없음). 실패/부재 시 false.
  async function assetExists(url: string): Promise<boolean> {
    try {
      const res = await fetch(url, { method: "HEAD" });
      return res.ok;
    } catch {
      return false;
    }
  }
  // same-origin 프록시 URL(쿠키 인증 자동)을 blob 으로 받아 저장한다. 웹은 즉시 저장,
  // Electron 은 will-download(blob) 핸들러가 저장 대화상자를 띄운다.
  async function downloadAsset(url: string, filename: string) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      triggerDownload(await res.blob(), filename);
    } catch {
      toast.error("다운로드에 실패했어요. 잠시 후 다시 시도해 주세요.");
    }
  }

  // ── 음성 빌드 스냅샷 기반 파생값 ──────────────────────────────
  const snap = state.ttsBuild;
  const isEleven = state.ttsEngine === "elevenlabs";
  // ElevenLabs 설정(엔진=elevenlabs 일 때만). Typecast면 null.
  function elevenOptions(): ElevenLabsOptions | null {
    return isEleven
      ? {
          model_id: state.elModel,
          stability: state.elStability,
          similarity_boost: state.elSimilarity,
          style: state.elStyle,
        }
      : null;
  }
  function sameElevenOptions(
    a: ElevenLabsOptions | null | undefined,
    b: ElevenLabsOptions | null,
  ): boolean {
    if (!a && !b) return true;
    if (!a || !b) return false;
    return (
      a.model_id === b.model_id &&
      a.stability === b.stability &&
      a.similarity_boost === b.similarity_boost &&
      a.style === b.style
    );
  }
  const voiceChanged =
    !!snap &&
    (snap.voice.voiceId !== state.voiceId ||
      (snap.voice.engine ?? "typecast") !== state.ttsEngine ||
      snap.voice.speed !== state.ttsSpeed ||
      snap.voice.emotion !== state.emotion ||
      !sameElevenOptions(snap.voice.options, elevenOptions()));
  // 이 줄이 마지막 빌드 이후 바뀌었나(텍스트/미저장 draft/음성설정). 바뀌면 ▶ 시 그 줄만 재생성.
  function isLineDirty(l: ScriptLine): boolean {
    if (!snap || voiceChanged) return true;
    const id = String(l.line_id ?? "");
    if (drafts[id] !== undefined && drafts[id] !== l.text) return true;
    return snap.texts[id] !== l.text;
  }
  const anyDirty =
    !snap ||
    voiceChanged ||
    snap.lineIds.length !== lines.length ||
    lines.some(isLineDirty);
  const built = !!snap && !!state.ttsSessionId;

  // 이 줄의 자막 조각(사용자 확정값 우선, 없으면 자동 분할). 미리보기·렌더가 같은 결과.
  function lineChunks(l: ScriptLine): string[] {
    return chunksForLine(l.text ?? "", l.subtitle_chunks ?? null);
  }
  function durationOf(l: ScriptLine): number | null {
    if (!snap || isLineDirty(l)) return null;
    const idx = snap.lineIds.indexOf(String(l.line_id ?? ""));
    return idx >= 0 ? snap.durations[idx] ?? null : null;
  }
  const totalDuration =
    snap && !anyDirty ? snap.durations.reduce((a, b) => a + b, 0) : null;
  // 화면 폭을 넘치는 자막이 있는 줄들(영상 만들기 차단 대상).
  const overflowLineIdx = lines.findIndex((l) => hasOverflowChunk(lineChunks(l)));
  const hasOverflow = overflowLineIdx >= 0;
  // 올린 영상이 나레이션보다 짧은 줄(영상 만들기 차단 대상). needed 는 durationOf 로 스냅샷 조회.
  function clipShortfallOf(l: ScriptLine, i: number): number | null {
    return clipShortfallSec(sources[i] ?? "ai", l.clip_duration, durationOf(l));
  }
  const shortClipLineIdx = lines.findIndex((l, i) => clipShortfallOf(l, i) != null);
  const hasShortClip = shortClipLineIdx >= 0;

  // 음성 세션 (재)빌드 — 미저장 편집 반영 → preview-build(incremental) → 스냅샷 저장. 성공 시 새 스냅샷 반환.
  async function buildVoices(): Promise<TtsBuildSnapshot | null> {
    if (!jobId) return null;
    playback.stop();
    setBuilding(true);
    try {
      for (const id of Object.keys(drafts)) {
        await saveText(id);
      }
      const ds = await getDraftState(jobId);
      const ls = ds.lines ?? [];
      if (ls.length === 0) {
        toast.error("대본 줄이 없어요.");
        return null;
      }
      const empty = ls.findIndex((l) => !(l.text ?? "").trim());
      if (empty >= 0) {
        toast.error(`${empty + 1}번째 줄이 비어 있어요. 내용을 채우거나 줄을 삭제해주세요.`);
        return null;
      }
      const data = await ttsPreviewBuild({
        sentences: ls.map((l) => (l.text ?? "").trim()),
        voice_id: state.voiceId,
        engine: state.ttsEngine,
        speed: state.ttsSpeed,
        emotion: isEleven ? "normal" : state.emotion,
        tts_options: elevenOptions(),
        content_type: "user_assets",
        topic: state.selectedTitle,
        style: "realistic",
        line_ids: ls.map((l) => l.line_id ?? null),
        existing_session_id: state.ttsSessionId,
      });
      const lineIds = ls.map((l) => String(l.line_id ?? ""));
      const texts: Record<string, string> = {};
      ls.forEach((l) => {
        texts[String(l.line_id ?? "")] = l.text ?? "";
      });
      const newSnap: TtsBuildSnapshot = {
        sessionId: data.session_id,
        lineIds,
        texts,
        durations: data.durations,
        wordTimes: data.word_times ?? lineIds.map(() => null),
        voice: {
          voiceId: state.voiceId,
          engine: state.ttsEngine,
          options: elevenOptions(),
          speed: state.ttsSpeed,
          emotion: state.emotion,
        },
        version: (snap?.version ?? 0) + 1,
      };
      update({ ttsSessionId: data.session_id, ttsDirty: false, ttsBuild: newSnap });
      // 나레이션 길이가 바뀌었으니, 선트림 조각이 새 길이보다 짧아진 줄이 있으면 정리한다.
      void reconcileClipsWithDurations(newSnap);
      return newSnap;
    } catch (e) {
      toast.error(
        errMessage(
          e,
          `음성 생성에 실패했어요. (${isEleven ? "ElevenLabs" : "Typecast"} 키 확인)`,
        ),
      );
      return null;
    } finally {
      if (mountedRef.current) setBuilding(false);
    }
  }

  // 대본 수정으로 나레이션이 길어져 선트림 조각이 부족해졌는지 검사 → 부족 정책 실행.
  // 조각 자체가 짧으면 영상을 지우지 않고 보존한 채 안내만 한다(줄 배지·프리뷰 안내가 위치를 표시하고,
  // 영상 만들기 게이트가 렌더 진입을 막는다). 조각은 충분한데 시작점만 뒤로 밀린 경우엔 시작점을 자동으로 당긴다.
  // clip_duration 이 있는 줄만 대상(레거시 클립은 렌더 단계 실측 검증이 최후 방어).
  async function reconcileClipsWithDurations(snapshot: TtsBuildSnapshot) {
    if (!jobId) return;
    const cur = linesRef.current;
    for (let idx = 0; idx < cur.length; idx++) {
      const l = cur[idx];
      const cd = typeof l.clip_duration === "number" ? l.clip_duration : null;
      if (cd == null) continue; // 레거시/비영상 스킵
      const lid = String(l.line_id ?? "");
      const di = snapshot.lineIds.indexOf(lid);
      const needed = di >= 0 ? snapshot.durations[di] ?? null : null;
      if (needed == null) continue;
      const cs = typeof l.clip_start === "number" ? l.clip_start : 0;
      if (cd - cs + 0.05 >= needed) continue; // 충분

      if (cd + 0.05 < needed) {
        // 조각 자체가 나레이션보다 짧음 → 지우지 않고 보존 + 안내(다시 올리거나 대본을 줄이도록).
        // 줄 카드 배지·프리뷰 안내가 어느 줄인지 표시하고, 영상 만들기 게이트가 렌더 진입을 막는다.
        // AI 변환 영상(6초 고정)은 "다시 올리기"가 해법이 아니므로 문구를 분기한다.
        toast.error(
          l.clip_kind === "ai"
            ? `${idx + 1}번째 줄: 대본이 길어져 AI 영상(6초)이 나레이션(${needed.toFixed(1)}초)을 다 담지 못해요. 대본을 6초 이내로 줄이거나 영상을 직접 올려주세요.`
            : `${idx + 1}번째 줄: 대본이 길어져 영상(${cd.toFixed(1)}초)이 나레이션(${needed.toFixed(1)}초)보다 짧아요. 더 긴 구간으로 다시 올리거나 대본을 줄여주세요.`,
        );
      } else {
        // 조각은 충분한데 시작점이 뒤로 밀려 넘침 → 시작점만 당긴다(삭제 X).
        const clamped = Math.max(0, cd - needed);
        try {
          await saveLineVisual(jobId, idx, lid, { clipStart: clamped });
          if (!mountedRef.current) return;
          // 서버가 클램프한 값으로 확정 → 이 줄의 시작점 초안은 버려 프리뷰가 새 값과 일치하게.
          setClipStartDrafts((d) => {
            if (!(lid in d)) return d;
            const n = { ...d };
            delete n[lid];
            return n;
          });
          setLines((prev) =>
            prev.map((x) => (String(x.line_id ?? "") === lid ? { ...x, clip_start: clamped } : x)),
          );
        } catch {
          /* noop */
        }
      }
    }
  }

  // 재생 직전: dirty 거나 미빌드면 (재)빌드하고 최신 스냅샷을 돌려준다.
  async function ensureBuilt(): Promise<TtsBuildSnapshot | null> {
    if (built && !anyDirty && snap) return snap;
    return await buildVoices();
  }

  // 줄 ▶: 재생 중이면 정지, 아니면 (필요 시 그 줄만 재생성 후) 그 줄만 재생.
  async function playLineFor(lineId: string) {
    if (playback.nowPlayingLineId === lineId && playback.mode === "line") {
      playback.stop();
      return;
    }
    const s = await ensureBuilt();
    if (!s) return;
    const idx = s.lineIds.indexOf(lineId);
    if (idx < 0) return;
    const line = linesRef.current.find((l) => String(l.line_id ?? "") === lineId);
    setActiveLineId(lineId);
    void playback.playLine({
      sessionId: s.sessionId,
      version: s.version,
      line: {
        lineId,
        index: idx,
        chunks: line ? lineChunks(line) : [],
        durationSec: s.durations[idx] ?? 0,
        wordTimes: s.wordTimes?.[idx] ?? null,
      },
    });
  }

  function scrollLineIntoView(lineId: string) {
    if (typeof document === "undefined") return;
    const el = document.querySelector(`[data-line-card-id="${lineId}"]`);
    el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  // 전체 미리듣기: 재생 중이면 정지, 아니면 (필요 시 빌드 후) 모든 줄 음성 + BGM 을 순서대로.
  async function playAllFrom(startIndex = 0) {
    const s = await ensureBuilt();
    if (!s) return;
    const items = s.lineIds.map((lid, i) => {
      const line = linesRef.current.find((l) => String(l.line_id ?? "") === lid);
      return {
        lineId: lid,
        index: i,
        chunks: line ? lineChunks(line) : [],
        durationSec: s.durations[i] ?? 0,
        wordTimes: s.wordTimes?.[i] ?? null,
      };
    });
    void playback.playAll({
      sessionId: s.sessionId,
      version: s.version,
      items,
      startIndex,
      bgm: selectedBgm
        ? {
            url: bgmAudioUrl(selectedBgm),
            volume01: state.bgmVolume / 100,
            startSec: state.bgmStartSec,
          }
        : null,
      onLineChange: (id) => {
        setActiveLineId(id);
        scrollLineIntoView(id);
      },
    });
  }
  async function playAllToggle() {
    if (playback.mode === "all") {
      playback.stop();
      return;
    }
    await playAllFrom(0);
  }
  // 최신 토글 함수를 ref 로 보관 → 단축키 리스너가 stale closure 없이 호출.
  const playAllToggleRef = useRef(playAllToggle);
  playAllToggleRef.current = playAllToggle;

  // 자막 조각 저장(공통): 로컬 즉시 반영 + 서버 영속. 텍스트는 안 건드림 → TTS 무관.
  // 빈 배열이면 null 로 저장 → 자동 분할로 복귀(백엔드가 subtitle_chunks 를 지운다).
  async function saveChunks(l: ScriptLine, next: string[] | null) {
    const id = String(l.line_id ?? "");
    if (!id || !jobId) return;
    const value = next && next.length > 0 ? next : null;
    setLines((prev) =>
      prev.map((x) =>
        String(x.line_id ?? "") === id ? { ...x, subtitle_chunks: value } : x,
      ),
    );
    try {
      await setSubtitleChunks(jobId, id, value);
    } catch (e) {
      if (mountedRef.current) toast.error(errMessage(e, "자막 저장에 실패했어요."));
    }
  }
  // 어절 사이 간격 토글(칩 클릭): 같은 줄(·) ↔ 컷 경계(✂). 화면 줄바꿈(↵)은 여기서 안 건드림.
  async function toggleBreak(l: ScriptLine, wordIndex: number) {
    const { words, gaps } = parseSubtitleChunks(lineChunks(l));
    const gi = wordIndex - 1;
    if (gi < 0 || gi >= gaps.length || gaps[gi] === "wrap") return;
    gaps[gi] = gaps[gi] === "cut" ? "space" : "cut";
    await saveChunks(l, chunksFromWordsGaps(words, gaps));
  }

  const readyCount = lines.filter(isReady).length;
  const allReady = lines.length > 0 && readyCount === lines.length;
  // 전역 잠금: AI 생성 폴링 중이거나 업로드가 하나라도 진행 중이면 전역 액션을 막는다.
  // (업로드 도중 "모두 생성"/"다음"을 누르면 AI 워커가 업로드를 덮어쓸 수 있음 — Codex HIGH.)
  const busyGlobal = polling || uploading.size > 0;

  // 영상이 짧은 줄로 사용자를 데려간다 — 안내 + 그 줄 선택 + 스크롤. AI 영상(6초 고정)은 문구 분기.
  function focusShortClip(idx: number) {
    const line = linesRef.current[idx];
    const lid = String(line?.line_id ?? "");
    toast.error(
      line?.clip_kind === "ai"
        ? `${idx + 1}번째 줄 AI 영상(6초)이 나레이션보다 짧아요. 대본을 6초 이내로 줄이거나 영상을 직접 올려주세요.`
        : `${idx + 1}번째 줄 영상이 나레이션보다 짧아요. 더 긴 영상으로 다시 올리거나 대본을 줄여주세요.`,
    );
    if (lid) {
      setActiveLineId(lid);
      scrollLineIntoView(lid);
    }
  }

  // 영상 만들기: 자막 넘침 차단 → (필요 시 음성 빌드) → 자막 조각 확정 맵과 함께 confirm → 진행 화면.
  async function handleCreate() {
    if (creating || building) return;
    if (!jobId) {
      toast.error("작업을 찾을 수 없어요. 대본 단계부터 다시 진행해주세요.");
      return;
    }
    if (hasOverflow) {
      toast.error(`${overflowLineIdx + 1}번째 줄 자막이 화면보다 길어요. 자막을 더 잘게 끊어주세요.`);
      setActiveLineId(String(lines[overflowLineIdx]?.line_id ?? ""));
      return;
    }
    if (hasShortClip) {
      focusShortClip(shortClipLineIdx);
      return;
    }
    playback.stop();
    setCreating(true);
    try {
      let s = snap;
      if (!state.ttsSessionId || state.ttsDirty || anyDirty || !s) {
        s = await buildVoices();
        if (!s) {
          setCreating(false);
          return;
        }
        // 대본만 고치고 바로 눌렀다면 위 사전 검사(hasShortClip)는 needed=null 로 유보됐다.
        // 방금 만든 스냅샷 s 의 확정 길이로 다시 검사해, 짧은 영상이 있으면 confirm 전에 중단한다.
        const built = s;
        const shortIdx = linesRef.current.findIndex((l, i) => {
          const di = built.lineIds.indexOf(String(l.line_id ?? ""));
          const needed = di >= 0 ? built.durations[di] ?? null : null;
          return clipShortfallSec(sources[i] ?? "ai", l.clip_duration, needed) != null;
        });
        if (shortIdx >= 0) {
          focusShortClip(shortIdx);
          setCreating(false);
          return;
        }
      }
      // 화면에 보여준 자막 조각을 모든 줄에 대해 확정 전송(WYSIWYG — 렌더가 이대로 박음).
      const chunksMap: Record<string, string[]> = {};
      for (const l of linesRef.current) {
        const id = String(l.line_id ?? "");
        if (id) chunksMap[id] = lineChunks(l);
      }
      await confirmDraft(jobId, {
        tts_engine: state.ttsEngine,
        tts_speed: state.ttsSpeed,
        voice_id: state.voiceId,
        emotion: state.ttsEngine === "typecast" ? state.emotion : null,
        tts_session_id: s.sessionId,
        bgm_filename: state.bgmFilename,
        bgm_start_sec: state.bgmStartSec,
        bgm_volume: state.bgmVolume / 100,
        title: state.selectedTitle,
        title_line1: state.titleLine1,
        title_line2: state.titleLine2,
        title_font: state.titleFont,
        title_font_weight: state.titleFontWeight,
        title_font_size: state.titleFontSize,
        title_line1_size: state.titleLine1Size,
        title_line2_size: state.titleLine2Size,
        title_line_gap: state.titleLineGap,
        title_color1: state.titleColor1,
        title_color2: state.titleColor2,
        title_dx: state.titleDx,
        title_dy: state.titleDy,
        subtitle_font: state.subtitleFont,
        subtitle_font_weight: state.subtitleFontWeight,
        subtitle_font_size: state.subtitleFontSize,
        subtitle_color: state.subtitleColor,
        subtitle_dx: state.subtitleDx,
        subtitle_y: state.subtitleY,
        motion_speed: state.motionSpeed,
        layout_mode: state.layoutMode ?? "full", // 항상 전송(백엔드가 "그 외=해제" 처리)
        layout_blur_sigma: state.blurSigma, // 흐림 강도(blur 모드에서만 렌더에 반영)
        subtitle_chunks_by_line: chunksMap,
      });
      update({ screen: "progress" });
    } catch (e) {
      toast.error(errMessage(e, "영상 생성 시작에 실패했습니다."));
      setCreating(false);
    }
  }

  // 재열기 복원: 세션은 있는데 스냅샷이 없으면 매니페스트로 재구성(재빌드 없이 즉시 재생 가능).
  useEffect(() => {
    if (loading || hydratedRef.current) return;
    if (!state.ttsSessionId || state.ttsBuild || lines.length === 0) return;
    hydratedRef.current = true;
    const sessionId = state.ttsSessionId;
    (async () => {
      try {
        const man = await getTtsSessionManifest(sessionId);
        if (!mountedRef.current) return;
        if (!man.line_ids || man.line_ids.length === 0) return;
        const lineIds = man.line_ids.map((x) => String(x ?? ""));
        // 빌드 당시 원문을 매니페스트에서 복원한다(현재 대본이 아니라!). 이게 dirty 판정의 기준:
        // 재열기 후 대본을 고친 줄이 snap.texts(옛 원문) 와 달라져 isLineDirty 가 그 줄을 잡아낸다.
        // 현재 대본을 넣으면 항상 "수정 없음"으로 오판해 고친 줄이 옛 음성으로 렌더된다(이 버그의 원인).
        // line_texts 가 없으면(구세션) texts 를 비워 전 줄을 dirty 로 → '영상 만들기' 시 안전하게 전체 재빌드.
        const texts: Record<string, string> = {};
        const buildTexts = man.line_texts;
        if (Array.isArray(buildTexts)) {
          lineIds.forEach((lid, i) => {
            const t = buildTexts[i];
            if (lid && typeof t === "string") texts[lid] = t;
          });
        }
        update({
          ttsBuild: {
            sessionId: man.session_id,
            lineIds,
            texts,
            durations: man.durations,
            wordTimes: man.word_times ?? lineIds.map(() => null),
            voice: {
              voiceId: man.voice.voice_id ?? state.voiceId,
              engine: man.voice.engine ?? state.ttsEngine,
              options: man.voice.tts_options ?? elevenOptions(),
              speed: man.voice.speed ?? state.ttsSpeed,
              emotion: man.voice.emotion ?? state.emotion,
            },
            version: 1,
          },
        });
      } catch {
        // 매니페스트 없음/실패 → 스냅샷 없이 진행(재생 시 재빌드). ttsSessionId 는 유지.
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, lines.length, state.ttsSessionId, state.ttsBuild]);

  // 프리뷰에 실제로 뜨는 줄(활성 줄) — activeLineId 가 비었거나 안 맞으면 첫 줄로 폴백(activeIndex 와 동일 규칙).
  const cycleLine =
    lines.find((l) => String(l.line_id ?? "") === activeLineId) ??
    (lines.length ? lines[0] : undefined);
  const cycleLineId = cycleLine ? String(cycleLine.line_id ?? "") : "";
  const cycleChunks = cycleLine ? lineChunks(cycleLine) : [];
  const cycleChunksKey = cycleChunks.join("␟");
  const cyclePlaying = !!cycleLineId && playback.nowPlayingLineId === cycleLineId;

  // 순환 인덱스 리셋은 "선택 줄/조각 내용이 바뀔 때만". 재생·드래그 전환에는 리셋하지 않아
  // (아래 타이머 이펙트가 그때 재실행되어도) 잡고 있던/보고 있던 조각이 튀지 않는다.
  useEffect(() => {
    cycleIdxRef.current = 0;
    setCycleChunkIdx(0);
  }, [cycleLineId, cycleChunksKey]);

  // 정지 상태 자막 자동 순환 — 재생 중/자막 드래그 중/조각 1개면 멈춘다(현재 조각 유지).
  // 재개 시 현재 인덱스(cycleIdxRef)에서 이어간다. 나레이션 타이밍(word_times 비례, 없으면 글자수 추정)대로.
  useEffect(() => {
    if (cyclePlaying || subtitleDragging || cycleChunks.length <= 1) return;
    let wt: WordTime[] | null = null;
    if (snap) {
      const idx = snap.lineIds.indexOf(cycleLineId);
      wt = idx >= 0 ? snap.wordTimes[idx] ?? null : null;
    }
    const durs = chunkDisplayDurations(
      cycleChunks,
      cycleLine ? durationOf(cycleLine) : null,
      wt,
    );
    let i = Math.min(cycleIdxRef.current, cycleChunks.length - 1);
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      timer = setTimeout(() => {
        i = (i + 1) % cycleChunks.length;
        cycleIdxRef.current = i;
        setCycleChunkIdx(i);
        tick();
      }, Math.max(300, durs[i] * 1000));
    };
    tick();
    return () => clearTimeout(timer);
    // cycleChunksKey 로 조각 내용 변화만 감지(2초 폴링의 배열 재생성엔 흔들리지 않게).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycleLineId, cycleChunksKey, cyclePlaying, subtitleDragging, snap]);

  // 자막 스타일/위치·제목 위치·모션 속도가 바뀌면 draft-meta 에 디바운스 저장(confirm 없이 닫아도 보존)
  // + 이 기기 마지막 자막 스타일 기억. 위치(dx/y)·모션 속도는 기억 안 함(자막 스타일 4종만 saveLastSubtitle).
  const subtitleMetaKey = `${state.subtitleFont}|${state.subtitleFontWeight}|${state.subtitleFontSize}|${state.subtitleColor}|${state.subtitleDx}|${state.subtitleY}|${state.titleDx}|${state.titleDy}|${state.motionSpeed}|${state.layoutMode}|${state.blurSigma}`;
  const subtitleMetaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const subtitleMetaHydrated = useRef(false);
  useEffect(() => () => {
    if (subtitleMetaTimer.current) clearTimeout(subtitleMetaTimer.current);
  }, []);
  useEffect(() => {
    // 하이드레이션 직후 첫 값은 저장 스킵(불필요한 왕복·기존값 덮어쓰기 방지).
    if (!subtitleMetaHydrated.current) {
      subtitleMetaHydrated.current = true;
      return;
    }
    saveLastSubtitle({
      font: state.subtitleFont,
      weight: state.subtitleFontWeight,
      size: state.subtitleFontSize,
      color: state.subtitleColor,
    });
    if (!jobId) return;
    if (subtitleMetaTimer.current) clearTimeout(subtitleMetaTimer.current);
    subtitleMetaTimer.current = setTimeout(() => {
      saveDraftMeta(jobId, {
        subtitle_font: state.subtitleFont,
        subtitle_font_weight: state.subtitleFontWeight,
        subtitle_font_size: state.subtitleFontSize,
        subtitle_color: state.subtitleColor,
        subtitle_dx: state.subtitleDx,
        subtitle_y: state.subtitleY,
        title_dx: state.titleDx,
        title_dy: state.titleDy,
        motion_speed: state.motionSpeed,
        layout_mode: state.layoutMode ?? "full", // 항상 전송(백엔드가 "그 외=해제" 처리)
        layout_blur_sigma: state.blurSigma, // 흐림 강도(blur 모드에서만 렌더에 반영)
      }).catch(() => {
        /* 편집 즉시 저장 실패는 조용히 무시 — confirm 시 어차피 전송된다 */
      });
    }, SLIDER_COMMIT_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtitleMetaKey, jobId]);

  // 음성 설정(엔진·성우·감정·속도·EL 옵션)과 완성된 음성 세션도 draft-meta 에 디바운스 저장.
  // 예전엔 confirm(영상 만들기) 때만 저장돼서, 렌더 전에 중단한 작업을 '이전 작업'으로 다시 열면
  // voice_id 가 비어 기본 성우로 되돌아갔다(만들어 둔 음성 세션도 잃어 전 줄 재합성 → 크레딧 낭비).
  // ttsSessionId 를 키에 넣어 빌드 성공 직후에도 한 번 저장된다.
  const voiceMetaKey = `${state.ttsEngine}|${state.voiceId}|${state.emotion}|${state.ttsSpeed}|${state.elModel}|${state.elStability}|${state.elSimilarity}|${state.elStyle}|${state.ttsSessionId ?? ""}`;
  const voiceMetaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceMetaHydrated = useRef(false);
  useEffect(() => () => {
    if (voiceMetaTimer.current) clearTimeout(voiceMetaTimer.current);
  }, []);
  useEffect(() => {
    // 하이드레이션 직후 첫 값은 저장 스킵(복원한 값을 그대로 되쓰는 왕복 방지).
    if (!voiceMetaHydrated.current) {
      voiceMetaHydrated.current = true;
      return;
    }
    // 이 기기 마지막 음성도 기억 — 다음 새 영상이 이 성우로 시작한다(freshYtState).
    saveLastVoice({
      engine: state.ttsEngine,
      voiceId: state.voiceId,
      ttsSpeed: state.ttsSpeed,
      elModel: state.elModel,
      elStability: state.elStability,
      elSimilarity: state.elSimilarity,
      elStyle: state.elStyle,
    });
    if (!jobId) return;
    if (voiceMetaTimer.current) clearTimeout(voiceMetaTimer.current);
    voiceMetaTimer.current = setTimeout(() => {
      saveDraftMeta(jobId, {
        tts_engine: state.ttsEngine,
        voice_id: state.voiceId,
        // 감정은 Typecast 전용(ElevenLabs 는 confirm 과 동일하게 보내지 않는다).
        ...(isEleven ? {} : { emotion: state.emotion }),
        tts_speed: state.ttsSpeed,
        tts_options: elevenOptions(), // 엔진과 한 쌍 — Typecast 면 null 로 옛 EL 옵션을 지운다
        ...(state.ttsSessionId ? { tts_session_id: state.ttsSessionId } : {}),
      }).catch(() => {
        /* 편집 즉시 저장 실패는 조용히 무시 — confirm 시 어차피 전송된다 */
      });
    }, SLIDER_COMMIT_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voiceMetaKey, jobId]);

  // 프리뷰 프레임 폭을 창 높이에 맞춰 계산(헤더·자막페이저·설명·상단여백·하단 플로팅 플레이어 공간 제외).
  // → 짧은 창에서도 프리뷰 하단이 잘리거나 내부 스크롤되지 않고 항상 온전히 보인다.
  useEffect(() => {
    const compute = () => {
      const reserve = 360; // 프레임 외 세로 공간(우측 카드 크롬 + 상단 offset + 하단 플레이어 + 여유)
      const avail = window.innerHeight - reserve;
      const w = Math.max(210, Math.min(300, Math.floor((avail * 9) / 16)));
      setPreviewWidth(w);
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // 전체 미리듣기 단축키: Ctrl+Space(윈도우) / ⌘+Space(맥, Spotlight 가 가로채면 Ctrl 로).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "Space" && !e.repeat) {
        e.preventDefault();
        void playAllToggleRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중...
        </div>
      </div>
    );
  }

  // 우측 프리뷰용 선택 줄 해석(line_id → 현재 index, 없으면 첫 줄).
  const activeIndex = (() => {
    const j = lines.findIndex((l) => String(l.line_id ?? "") === activeLineId);
    return j >= 0 ? j : lines.length ? 0 : -1;
  })();
  const activeLine = activeIndex >= 0 ? lines[activeIndex] : undefined;
  const activeSource: LineSource =
    activeIndex >= 0 ? sources[activeIndex] ?? "ai" : "ai";
  const activeWorking =
    !!activeLine &&
    (isWorking(activeLine) || uploading.has(String(activeLine.line_id ?? "")));
  const activeLineIdStr = String(activeLine?.line_id ?? "");
  // 편집 핸들러가 이벤트 시점에 읽을 현재 대상.
  activeRef.current = { lineId: activeLineIdStr, index: activeIndex };
  // 화면에 적용할 transform: 초안 우선(드래그 중), 없으면 서버 값, 없으면 기본(cover).
  const activeTransform: LineTransform = clampTransform(
    transformDrafts[activeLineIdStr] ??
      (activeLine?.transform as LineTransform | undefined) ??
      DEFAULT_TRANSFORM,
  );
  const activeMotion = String(activeLine?.motion ?? "none");
  const baseMotions = activeSource === "clip" ? CLIP_MOTIONS : IMAGE_MOTIONS;
  // 기본 선택지에 없는 값(옛 팬 효과)이 저장돼 있으면 레거시 라벨로 뒤에 덧붙여 표시.
  const motionOptions: MotionOption[] = baseMotions.some((m) => m.value === activeMotion)
    ? baseMotions
    : [
        ...baseMotions,
        { value: activeMotion, label: LEGACY_MOTION_LABELS[activeMotion] ?? activeMotion },
      ];
  const activeEditable =
    !!activeLine && isReady(activeLine) && !activeWorking;

  // 영상 조각 시작점 미세조정 값(선트림 조각에서만 노출). needed = 그 줄 나레이션 길이.
  const activeClipDuration =
    typeof activeLine?.clip_duration === "number" ? activeLine.clip_duration : null;
  const activeNeeded = activeLine ? durationOf(activeLine) : null;
  const activeClipStart =
    clipStartDrafts[activeLineIdStr] ??
    (typeof activeLine?.clip_start === "number" ? activeLine.clip_start : 0);
  // 시작점 슬라이더 최대치: 조각 끝에서 나레이션 길이를 뺀 지점(그 뒤론 나레이션이 넘침).
  const clipStartMax =
    activeClipDuration != null && activeNeeded != null
      ? Math.max(0, activeClipDuration - activeNeeded)
      : 0;
  const showClipStartSlider =
    activeSource === "clip" && activeClipDuration != null && clipStartMax > 0.05;
  // 이 줄 영상이 나레이션보다 짧으면 부족분(초) — 프리뷰 상단에 해결 안내를 띄운다.
  const activeClipGap =
    activeIndex >= 0 && activeLine ? clipShortfallOf(activeLine, activeIndex) : null;
  // AI 변환 영상(6초 고정)이면 안내를 "대본 줄이기" 쪽으로 분기(업로드 클립은 "더 긴 영상 올리기").
  const activeClipIsAi = activeLine?.clip_kind === "ai";

  // 프리뷰 자막: 재생 중이면 그 조각을 따라가고, 정지 상태면 수동 페이저로 넘겨본다.
  const activeChunks = activeLine ? lineChunks(activeLine) : [];
  const activePlaying =
    !!activeLine && playback.nowPlayingLineId === String(activeLine.line_id ?? "");
  const activeChunkIdx = activeChunks.length
    ? Math.min(
        activePlaying ? playback.nowChunkIndex : cycleChunkIdx,
        activeChunks.length - 1,
      )
    : 0;
  const activeSubtitle = stripSubtitlePeriods(activeChunks[activeChunkIdx] ?? "");
  // 전체 미리듣기 진행 표시용: 현재 재생 줄의 스냅샷 인덱스 + 이전/다음 이동 기준.
  const playingSegIdx = snap
    ? snap.lineIds.indexOf(playback.nowPlayingLineId ?? "")
    : -1;
  const lastSeg = snap ? snap.durations.length - 1 : 0;
  const curSeg = playingSegIdx >= 0 ? playingSegIdx : 0;

  return (
    <div className="pb-20 lg:grid lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start lg:gap-5">
      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">줄별 이미지·대본</h2>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-sm text-muted-foreground marker:text-muted-foreground/60">
            <li>줄마다 AI 이미지를 만들거나 내 이미지·영상을 올리세요.</li>
            <li>글을 고친 뒤 다른 곳을 누르면 저장됩니다.</li>
            <li>
              문장 안에서 <b>Enter</b>를 누르면 두 줄로 나뉩니다.
            </li>
            <li>
              문장 맨 앞에서 <b>Backspace</b>를 누르면 윗줄과 합쳐집니다.
            </li>
          </ul>
        </div>
        <Button onClick={genAll} disabled={busyGlobal} variant="outline" className="shrink-0 gap-1.5">
          {polling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {polling ? "생성 중..." : "빈 줄 이미지 모두 생성"}
        </Button>
      </div>

      {/* 음성 설정 — 모든 줄 공통. 값이 바뀌면 전 줄 음성이 낡음(dirty) → 다음 재생 때 새로 만들어진다. */}
      <div className="mt-4">
        <VoiceSettingsBar
          engine={state.ttsEngine}
          voiceId={state.voiceId}
          emotion={state.emotion}
          ttsSpeed={state.ttsSpeed}
          elModel={state.elModel}
          elStability={state.elStability}
          elSimilarity={state.elSimilarity}
          elStyle={state.elStyle}
          disabled={building}
          onPatch={(p) => {
            playback.stop();
            update({ ...p, ttsDirty: true });
          }}
        />
        {built && voiceChanged && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            음성 설정을 바꿨어요. 다음 재생 때 모든 줄 음성을 새로 만들어요.
          </p>
        )}
      </div>

      {/* 배경음악 — 음성 설정 바로 아래. 선택하면 전체 미리듣기에 함께 섞여 들린다(선택은 필수 아님). */}
      <div className="mt-3">
        <BgmPicker
          filename={state.bgmFilename}
          startSec={state.bgmStartSec}
          volume={state.bgmVolume}
          onChange={update}
          onSelectedItem={setSelectedBgm}
        />
      </div>

      {/* 자막 스타일 — BGM 아래 같은 디자인 카드. 폰트/굵기/크기/색(위치는 프리뷰 드래그). */}
      <div className="mt-3">
        <SubtitleStylePicker />
      </div>

      {/* 레이아웃 — 자막 스타일 아래 같은 디자인 카드. 꽉 채움 / 상·하 박스. */}
      <div className="mt-3">
        <LayoutPicker onSelect={onLayoutSelect} />
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={onFileChosen}
      />
      <input
        ref={clipFileRef}
        type="file"
        accept={CLIP_ACCEPT}
        className="hidden"
        onChange={onClipChosen}
      />

      <TrimUploadModal
        open={!!trimTarget}
        file={trimTarget?.file ?? null}
        neededSec={trimTarget?.neededSec ?? 0}
        lineNo={trimTarget ? indexOfLine(trimTarget.lineId) + 1 : 0}
        busy={trimBusy}
        previewSrc={trimTarget?.previewSrc || undefined}
        preparing={trimTarget?.preparing ?? false}
        onCancel={() => {
          if (!trimBusy) closeTrim();
        }}
        onConfirm={onTrimConfirm}
      />

      {assetMenu && (
        <ImageContextMenu
          x={assetMenu.x}
          y={assetMenu.y}
          items={assetMenu.items.map((it) => ({
            label: it.label,
            onSelect: () => void downloadAsset(it.url, it.filename),
          }))}
          onClose={() => setAssetMenu(null)}
        />
      )}

      <ul className="mt-5 space-y-2.5">
        {lines.map((l, i) => {
          const ready = isReady(l);
          const failed = isFailed(l);
          const lineId = String(l.line_id ?? "");
          const hasId = lineId !== "";
          const working = isWorking(l) || uploading.has(lineId);
          // 어떤 작업으로 바쁜지(버튼별 스피너/라벨용). 업로드는 동기라 thumbnail 오버레이로 표시.
          const genImageBusy = isWorking(l) && l.asset_action === "ai_image";
          const convertBusy = isWorking(l) && l.asset_action === "ai_clip";
          const src: LineSource = sources[i] ?? "ai";
          const clipGap = clipShortfallOf(l, i); // 영상이 나레이션보다 짧으면 부족분(초)
          const savingThis = savingText.has(lineId);
          const deletingThis = deleting.has(lineId);
          const structuringThis = structuring.has(lineId);
          const editLocked = working || deletingThis || structuringThis || !hasId;
          // 주의: 텍스트칸은 구조 변경(structuringThis) 중 disabled 가 아니라 readOnly 로 둔다(아래 Textarea).
          // disabled 면 포커스를 잃고 onBlur→saveText(edit-line)가 split-line 과 경쟁해 결과를 덮어쓴다(Codex).
          // 구조 변경(나누기/합치기/삭제)은 생성 폴링·업로드 진행 중엔 막는다(재인덱싱 레이스 방지).
          const structLocked = editLocked || busyGlobal;
          const textValue = drafts[lineId] ?? l.text;
          return (
            <li
              key={l.line_id ?? i}
              data-line-card-id={lineId}
              className={cn(
                "flex gap-3 rounded-lg border bg-background p-2.5 transition-colors",
                playback.nowPlayingLineId === lineId
                  ? "border-primary ring-1 ring-primary bg-primary/5"
                  : lineId === activeLineId
                    ? "border-primary ring-1 ring-primary"
                    : "border-border",
              )}
            >
              {/* 썸네일 (클릭 시 이 줄을 우측 미리보기로 선택 · 우클릭 시 원본 다운로드) */}
              <button
                type="button"
                onClick={() => hasId && setActiveLineId(lineId)}
                onContextMenu={(e) => void openAssetMenu(e, i, l)}
                aria-label={`${i + 1}번째 줄 미리보기로 보기`}
                className="relative aspect-[9/16] w-14 shrink-0 cursor-pointer overflow-hidden rounded-md border border-border bg-muted"
              >
                {ready && src === "clip" ? (
                  <video
                    src={clipSrc(i, l)}
                    muted
                    playsInline
                    preload="metadata"
                    className="h-full w-full object-cover"
                  />
                ) : ready ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 프록시 경유 동적 이미지(서버 최적화 부적합)
                  <img
                    src={imgSrc(i, l)}
                    alt={`${i + 1}번째 줄 이미지`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    {src === "clip" ? (
                      <Film className="h-5 w-5" />
                    ) : (
                      <ImageIcon className="h-5 w-5" />
                    )}
                  </div>
                )}
                {working && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
              </button>

              {/* 본문 */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {i + 1}
                  </span>
                  <Badge variant="outline" className="px-1.5 py-0 text-[0.7rem]">
                    {SOURCE_LABEL[src]}
                  </Badge>
                  {ready && clipGap == null && (
                    <span className="inline-flex items-center gap-0.5 text-[0.7rem] text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> 준비됨
                    </span>
                  )}
                  {ready && clipGap != null && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[0.7rem] text-amber-600 dark:text-amber-400"
                      title={
                        l.clip_kind === "ai"
                          ? `AI 영상 6초 < 나레이션 ${(durationOf(l) ?? 0).toFixed(1)}초 — 대본을 6초 이내로 줄이거나 영상을 직접 올려주세요`
                          : `영상 ${(l.clip_duration ?? 0).toFixed(1)}초 < 나레이션 ${(durationOf(l) ?? 0).toFixed(1)}초 — 더 긴 영상으로 다시 올리거나 대본을 줄여주세요`
                      }
                    >
                      <AlertCircle className="h-3 w-3" /> 영상 {clipGap.toFixed(1)}초 부족
                    </span>
                  )}
                  {working && (
                    <span className="text-[0.7rem] text-muted-foreground">
                      {l.asset_message || "처리 중..."}
                    </span>
                  )}
                  {failed && (
                    <span className="inline-flex items-center gap-0.5 text-[0.7rem] text-destructive">
                      <AlertCircle className="h-3 w-3" /> 실패
                    </span>
                  )}
                  {savingThis && (
                    <span className="inline-flex items-center gap-0.5 text-[0.7rem] text-muted-foreground">
                      <Loader2 className="h-3 w-3 animate-spin" /> 저장 중
                    </span>
                  )}
                  {hasId && (() => {
                    const playingThis = playback.nowPlayingLineId === lineId;
                    const dur = durationOf(l);
                    const dirtyThis = isLineDirty(l);
                    const label = playingThis
                      ? dur != null
                        ? `재생 중 · ${formatTime(dur)}`
                        : "재생 중"
                      : building
                        ? "만드는 중…"
                        : dirtyThis
                          ? "새로 만들어 재생"
                          : dur != null
                            ? formatTime(dur)
                            : "재생";
                    return (
                      <button
                        type="button"
                        onClick={() => playLineFor(lineId)}
                        disabled={building}
                        aria-label={`${i + 1}번째 줄 음성 ${playingThis ? "정지" : "재생"}`}
                        className={cn(
                          "ml-auto inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[0.7rem] transition-colors disabled:opacity-50",
                          playingThis
                            ? "border-primary bg-primary text-primary-foreground"
                            : dirtyThis
                              ? "border-amber-500/60 text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/40"
                              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
                        )}
                      >
                        {building && !playingThis ? (
                          <Loader2 className="size-3 animate-spin" />
                        ) : playingThis ? (
                          <Pause className="size-3" />
                        ) : (
                          <Play className="size-3" />
                        )}
                        {label}
                      </button>
                    );
                  })()}
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => del(lineId)}
                    disabled={structLocked || lines.length <= 1}
                    aria-label={`${i + 1}번째 줄 삭제`}
                    title={lines.length <= 1 ? "마지막 한 줄은 지울 수 없어요" : "이 줄 삭제"}
                  >
                    {deletingThis ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
                {/* 음성 라벨 — 아래 자막 칩과 동일 스타일. 둘 다 두 글자라 칩 폭이 같아
                    입력란과 자막 어절의 시작점이 세로로 정렬된다. */}
                <div className="mt-1 flex items-start gap-1.5">
                  <span className="mt-1.5 shrink-0 rounded border border-border px-1 text-[0.6rem] font-medium leading-4 text-muted-foreground">
                    음성
                  </span>
                  <Textarea
                    data-line-id={lineId}
                    value={textValue}
                    onChange={(e) =>
                      setDrafts((d) => ({ ...d, [lineId]: e.target.value }))
                    }
                    onBlur={() => saveText(lineId)}
                    onFocus={() => hasId && setActiveLineId(lineId)}
                    onKeyDown={(e) => {
                      // Enter = 커서 위치에서 줄 나누기. Shift+Enter = 줄바꿈, IME 조합 중 Enter = 글자 확정(무시).
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing
                      ) {
                        e.preventDefault();
                        if (structLocked) {
                          toast.info(
                            "생성·업로드가 끝난 뒤에 줄을 나눌 수 있어요.",
                          );
                          return;
                        }
                        const ta = e.currentTarget;
                        const start = ta.selectionStart ?? ta.value.length;
                        const end = ta.selectionEnd ?? start;
                        void doSplit(
                          lineId,
                          ta.value.slice(0, start),
                          ta.value.slice(end),
                        );
                        return;
                      }
                      // 맨 앞에서 Backspace = 윗줄과 합치기(빈 줄이면 그 줄 삭제). 원본 쇼츠픽과 동일.
                      // IME 조합 중·Shift·선택영역이 있을 땐 일반 글자 지우기(기본 동작).
                      if (
                        e.key === "Backspace" &&
                        !e.shiftKey &&
                        !e.nativeEvent.isComposing &&
                        i > 0
                      ) {
                        const ta = e.currentTarget;
                        if (ta.selectionStart !== 0 || ta.selectionEnd !== 0) return;
                        if (structLocked) return; // 잠금 중엔 보류(맨 앞 Backspace 는 어차피 무동작)
                        e.preventDefault();
                        const prevId = String(
                          linesRef.current[i - 1]?.line_id ?? "",
                        );
                        const prevText =
                          prevId && drafts[prevId] !== undefined
                            ? drafts[prevId]
                            : linesRef.current[i - 1]?.text ?? "";
                        const restoreCaret = () => {
                          if (prevId) focusLineCaret(prevId, prevText.length);
                        };
                        if (!ta.value.trim()) {
                          void del(lineId).then(restoreCaret); // 빈 줄 → 삭제
                        } else {
                          void mergeUp(lineId).then(restoreCaret); // 윗줄과 병합
                        }
                      }
                      // 화살표 위/아래로 줄 간 커서 이동. 각 줄이 독립 textarea 라 기본으론 한 칸에 갇힌다.
                      // 줄 맨 앞에서 ↑ → 윗줄 끝, 줄 맨 끝에서 ↓ → 아랫줄 맨 앞. 그 외엔 기본 동작(텍스트 내 이동).
                      if (e.key === "ArrowUp" && !e.nativeEvent.isComposing && i > 0) {
                        const ta = e.currentTarget;
                        if (ta.selectionStart === 0 && ta.selectionEnd === 0) {
                          e.preventDefault();
                          const prevId = String(
                            linesRef.current[i - 1]?.line_id ?? "",
                          );
                          const prevText =
                            prevId && drafts[prevId] !== undefined
                              ? drafts[prevId]
                              : linesRef.current[i - 1]?.text ?? "";
                          if (prevId) focusLineCaret(prevId, prevText.length);
                        }
                        return;
                      }
                      if (
                        e.key === "ArrowDown" &&
                        !e.nativeEvent.isComposing &&
                        i < linesRef.current.length - 1
                      ) {
                        const ta = e.currentTarget;
                        const end = ta.value.length;
                        if (ta.selectionStart === end && ta.selectionEnd === end) {
                          e.preventDefault();
                          const nextId = String(
                            linesRef.current[i + 1]?.line_id ?? "",
                          );
                          if (nextId) focusLineCaret(nextId, 0);
                        }
                        return;
                      }
                    }}
                    readOnly={structuringThis}
                    disabled={working || deletingThis || !hasId || savingThis}
                    rows={2}
                    className="min-h-0 flex-1 resize-y py-1.5 text-sm"
                    aria-label={`${i + 1}번째 줄 음성 텍스트`}
                  />
                </div>
                {failed && l.fail_reason && (
                  <p className="mt-0.5 line-clamp-1 text-[0.7rem] text-destructive">
                    {l.fail_reason}
                  </p>
                )}

                {hasId &&
                  (l.text ?? "").trim() !== "" &&
                  (editingSubLineId === lineId ? (
                    <SubtitleEditRow
                      initialChunks={lineChunks(l)}
                      disabled={editLocked}
                      onCancel={() => setEditingSubLineId(null)}
                      onSave={(chunks) => {
                        setEditingSubLineId(null);
                        void saveChunks(l, chunks);
                      }}
                    />
                  ) : (
                    <SubtitleChunkRow
                      chunks={lineChunks(l)}
                      disabled={editLocked}
                      onToggle={(wi) => toggleBreak(l, wi)}
                      onEdit={() => {
                        playback.stop();
                        setEditingSubLineId(lineId);
                      }}
                      activeChunkIdx={
                        playback.nowPlayingLineId === lineId
                          ? playback.nowChunkIndex
                          : null
                      }
                    />
                  ))}

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => regen(i)}
                    disabled={working}
                  >
                    {genImageBusy ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : ready ? (
                      <RefreshCw className="size-3" />
                    ) : (
                      <Sparkles className="size-3" />
                    )}
                    {genImageBusy ? "생성 중..." : "AI 이미지 생성"}
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => pickUpload(lineId)}
                    disabled={working}
                  >
                    <ImageUp className="size-3" /> 이미지 업로드
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => pickUploadClip(lineId)}
                    disabled={working}
                  >
                    <Film className="size-3" /> 영상 업로드
                  </Button>
                  {((ready && (src === "ai" || src === "image")) ||
                    convertBusy) && (
                    <Button
                      variant="outline"
                      size="xs"
                      onClick={() => convertToClip(i)}
                      disabled={working}
                      title="이 줄의 이미지를 AI로 움직이는 영상으로 바꿔요"
                    >
                      {convertBusy ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Video className="size-3" />
                      )}
                      {convertBusy ? "변환 중..." : "AI 영상 변환"}
                    </Button>
                  )}
                  {i > 0 && (
                    <Button
                      variant="ghost"
                      size="xs"
                      className="text-muted-foreground"
                      onClick={() => mergeUp(lineId)}
                      disabled={structLocked}
                      title="이 줄을 위 줄 끝에 이어 붙입니다 (맨 앞에서 Backspace 로도 가능)"
                    >
                      {structuringThis ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <ArrowUpToLine className="size-3" />
                      )}
                      위와 합치기
                    </Button>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => update(freshYtState())}
          disabled={busyGlobal}
          className="gap-1.5"
        >
          <RotateCcw className="h-4 w-4" /> 처음부터
        </Button>
        <Button
          onClick={handleCreate}
          disabled={!allReady || busyGlobal || creating || building || hasOverflow || hasShortClip}
          title={
            hasOverflow
              ? `${overflowLineIdx + 1}번째 줄 자막이 화면보다 길어요`
              : hasShortClip
                ? `${shortClipLineIdx + 1}번째 줄 영상이 나레이션보다 짧아요`
                : allReady
                  ? ""
                  : "모든 줄의 이미지를 먼저 준비하세요"
          }
          className="gap-2"
        >
          {creating || building ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Film className="h-4 w-4" />
          )}
          {creating
            ? "영상 만드는 중..."
            : building
              ? "음성 만드는 중..."
              : hasOverflow
                ? `${overflowLineIdx + 1}번째 줄 자막이 길어요`
                : hasShortClip
                  ? `${shortClipLineIdx + 1}번째 줄 영상이 짧아요`
                  : allReady
                    ? "영상 만들기"
                    : `영상 만들기 (${readyCount}/${lines.length})`}
        </Button>
      </div>
      </div>

      {/* 우측: 선택 줄 프리뷰 (최종 쇼츠 모습 흉내 — 이미지 위 제목 오버레이).
          프리뷰 프레임을 창 높이에 맞춰 축소(previewWidth)하므로 내부 스크롤 없이 항상 온전히 들어온다. */}
      <aside className="mt-4 lg:mt-0 lg:sticky lg:top-4 lg:flex lg:flex-col lg:self-stretch lg:max-h-[calc(100vh-6rem)]">
        <div className="flex flex-col rounded-xl border border-border bg-card p-4 text-card-foreground lg:min-h-0 lg:flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-medium text-muted-foreground">
              선택 줄 프리뷰
            </p>
            {activeLine && (
              <Badge variant="outline" className="px-1.5 py-0 text-[0.7rem]">
                {SOURCE_LABEL[activeSource]}
              </Badge>
            )}
          </div>
          <p className="mt-0.5 text-sm font-semibold">
            {activeIndex >= 0 ? `${activeIndex + 1}번 줄` : "—"}
          </p>
          {/* 이 컨테이너 자체엔 overflow 를 걸지 않는다(visible). 걸면 overflow-x 도 auto 로 강제돼
              프레임 밖으로 그려지는 미디어 선택 외곽선·핸들(아래 오버레이 포털)이 잘린다.
              대신 프리뷰는 shrink-0(온전히), 컨트롤(구간 등)만 필요 시 자체 스크롤로 카드 안에 가둔다. */}
          <div className="flex flex-1 flex-col min-h-0">
          <div className="mt-3 flex shrink-0 justify-center">
            {/* relative 래퍼: 프레임(overflow-hidden) 밖으로 나가는 외곽선/핸들을 그릴
                오버레이를 프레임과 같은 좌표계의 형제로 둔다.
                우클릭 시 현재 선택 줄의 원본 이미지/영상을 다운로드한다(준비된 줄만). */}
            <div
              className="relative"
              onContextMenu={(e) => {
                if (activeLine && activeIndex >= 0) void openAssetMenu(e, activeIndex, activeLine);
              }}
            >
              {/* 제목 위치·스타일은 '제목 입력' 단계에서만 조정한다. 여기선 onTitlePosChange 를
                  넘기지 않아 제목이 드래그되지 않고, 제목 입력에서 잡은 위치·스타일 그대로
                  정적으로 보인다(titleDx/titleDy 는 공유 상태라 렌더에도 그대로 반영). */}
              <ShortsPreviewFrame
                titleLine1={state.titleLine1}
                titleLine2={state.titleLine2}
                titleFont={state.titleFont}
                titleFontWeight={state.titleFontWeight}
                titleFontSize={state.titleFontSize}
                titleColor1={state.titleColor1}
                titleColor2={state.titleColor2}
                titleLine1Size={state.titleLine1Size}
                titleLine2Size={state.titleLine2Size}
                titleLineGap={state.titleLineGap}
                titleDx={state.titleDx}
                titleDy={state.titleDy}
                subtitle={activeSubtitle}
                subtitleFont={state.subtitleFont}
                subtitleFontWeight={state.subtitleFontWeight}
                subtitleFontSize={state.subtitleFontSize}
                subtitleColor={state.subtitleColor}
                subtitleDx={state.subtitleDx}
                subtitleY={state.subtitleY}
                onSubtitlePosChange={(dx, y) => update({ subtitleDx: dx, subtitleY: y })}
                onSubtitleDragChange={setSubtitleDragging}
                layoutBoxes={(state.layoutMode ?? "full") === "boxed"}
                width={previewWidth}
              >
                {!activeLine ? (
                  <div
                    className="flex h-full w-full items-center justify-center text-xs text-zinc-500"
                    style={CHECKER_BG_STYLE}
                  >
                    생성·업로드 대기
                  </div>
                ) : isReady(activeLine) ? (
                  <TransformablePreviewMedia
                    key={`${activeLineIdStr}:${activeSource}:${activeLine.asset_version ?? 0}`}
                    src={
                      activeSource === "clip"
                        ? clipSrc(activeIndex, activeLine)
                        : imgSrc(activeIndex, activeLine)
                    }
                    kind={activeSource === "clip" ? "clip" : "image"}
                    frameWidth={previewWidth}
                    transform={activeTransform}
                    disabled={!activeEditable}
                    emptyBg={(state.layoutMode ?? "full") === "full" ? "checker" : "black"}
                    blurSigma={(state.layoutMode ?? "full") === "blur" ? state.blurSigma : null}
                    overlayEl={previewOverlayEl}
                    spotlight={sliderSpotlight}
                    clipStart={activeSource === "clip" ? activeClipStart : null}
                    clipWindow={activeSource === "clip" ? activeNeeded : null}
                    motion={activeMotion}
                    motionRate={state.motionSpeed}
                    motionDurationSec={activeNeeded ?? estimateLineSec(activeLine)}
                    onChange={onTransformChange}
                    onCommit={onTransformCommit}
                  />
                ) : activeWorking ? (
                  <div
                    className="flex h-full w-full items-center justify-center"
                    style={CHECKER_BG_STYLE}
                  >
                    <Loader2 className="h-5 w-5 animate-spin text-zinc-500" />
                  </div>
                ) : isFailed(activeLine) ? (
                  <div
                    className="flex h-full w-full items-center justify-center text-xs text-red-500"
                    style={CHECKER_BG_STYLE}
                  >
                    생성 실패
                  </div>
                ) : (
                  <div
                    className="flex h-full w-full items-center justify-center text-xs text-zinc-500"
                    style={CHECKER_BG_STYLE}
                  >
                    생성·업로드 대기
                  </div>
                )}
              </ShortsPreviewFrame>
              {/* 외곽선/핸들 포털 대상 — 자체는 이벤트를 안 먹고(핸들만 pointer-events-auto) */}
              <div ref={setPreviewOverlayEl} className="pointer-events-none absolute inset-0 z-10" />
            </div>
          </div>

          {/* 위치/배율 + 움직임 편집 컨트롤 (준비된 줄에서만).
              flex-1 + overflow-y-auto: 짧은 창에서 컨트롤(특히 구간)이 카드보다 길면 여기서만
              세로 스크롤한다. 프리뷰 외곽선은 위쪽 visible 영역에 있어 잘리지 않는다. */}
          {activeEditable ? (
            <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto">
              {activeClipGap != null ? (
                <div className="space-y-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                  {activeClipIsAi ? (
                    <p>
                      AI 영상은 최대 6초예요. 나레이션({(activeNeeded ?? 0).toFixed(1)}초)을 다 담을 수
                      없어요. 대본을 6초 이내로 줄이거나, 영상을 직접 올려주세요.
                    </p>
                  ) : (
                    <p>
                      영상({(activeClipDuration ?? 0).toFixed(1)}초)이 나레이션(
                      {(activeNeeded ?? 0).toFixed(1)}초)보다 짧아요. 더 긴 구간으로 다시 올리거나 대본을
                      줄여주세요.
                    </p>
                  )}
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => pickUploadClip(activeLineIdStr)}
                    disabled={activeWorking}
                  >
                    <Film className="size-3" /> {activeClipIsAi ? "영상 직접 올리기" : "영상 다시 올리기"}
                  </Button>
                </div>
              ) : null}
              <div className="flex items-center gap-3">
                <span className="w-9 shrink-0 text-xs font-medium text-muted-foreground">
                  크기
                </span>
                <Slider
                  className="flex-1"
                  min={Math.round(SCALE_MIN * 100)}
                  max={Math.round(SCALE_MAX * 100)}
                  step={1}
                  value={Math.round(activeTransform.scale * 100)}
                  onValueChange={(v) => onScaleSlider(v, activeTransform)}
                />
                <span className="w-10 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                  {Math.round(activeTransform.scale * 100)}%
                </span>
                <Button
                  variant="ghost"
                  size="xs"
                  className="shrink-0 text-muted-foreground"
                  onClick={onResetTransform}
                  disabled={(state.layoutMode ?? "full") === "full" && isDefaultTransform(activeTransform)}
                  title={
                    (state.layoutMode ?? "full") === "full"
                      ? "위치·크기를 화면 꽉 채움으로 되돌려요"
                      : "위치·크기를 이 레이아웃 기본(화면 안에 맞춤)으로 되돌려요"
                  }
                >
                  <RotateCcw className="size-3" /> 원래대로
                </Button>
              </div>
              <div className="flex items-center gap-3">
                <span className="w-9 shrink-0 text-xs font-medium text-muted-foreground">
                  모션
                </span>
                <Select
                  items={motionOptions}
                  value={activeMotion}
                  onValueChange={(v) => v && onMotionChange(String(v))}
                >
                  <SelectTrigger className="h-8 flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {motionOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {/* 모션 속도 — 작업 전역(모든 줄 공통). 줌 효과가 켜진 줄에서만 노출.
                  초당 속도 고정이라 짧은 영상도 빠르지 않게, 슬라이더로 자유롭게 조절.
                  값은 기준 속도(100%) 대비 % — 저장은 rate 로. */}
              {activeMotion !== "none" ? (
                <div className="flex items-center gap-3">
                  <span className="w-9 shrink-0 text-xs font-medium text-muted-foreground">
                    속도
                  </span>
                  <Slider
                    className="flex-1"
                    min={MOTION_SPEED_PCT_MIN}
                    max={MOTION_SPEED_PCT_MAX}
                    step={MOTION_SPEED_PCT_STEP}
                    value={speedPctFromRate(state.motionSpeed)}
                    onValueChange={(v) =>
                      update({ motionSpeed: rateFromSpeedPct(Number(v)) })
                    }
                  />
                  <span className="w-11 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {speedPctFromRate(state.motionSpeed)}%
                  </span>
                  <Button
                    variant="ghost"
                    size="xs"
                    className="shrink-0 text-muted-foreground"
                    onClick={() => update({ motionSpeed: rateFromSpeedPct(MOTION_SPEED_PCT_DEFAULT) })}
                    disabled={speedPctFromRate(state.motionSpeed) === MOTION_SPEED_PCT_DEFAULT}
                    title="속도를 기본(100%)으로 되돌려요"
                  >
                    <RotateCcw className="size-3" /> 원래대로
                  </Button>
                </div>
              ) : null}
              {/* 쓸 구간 조정 — 저장된 조각(여유분 포함) 위에서 나레이션 창을 드래그 */}
              {showClipStartSlider ? (
                <div className="flex items-center gap-3">
                  <span className="w-9 shrink-0 self-start pt-1 text-xs font-medium text-muted-foreground">
                    구간
                  </span>
                  <div className="flex-1">
                    <SegmentTrack
                      duration={activeClipDuration ?? 0}
                      windowSec={activeNeeded ?? 0}
                      value={activeClipStart}
                      onChange={onClipStartDrag}
                      onCommit={onClipStartCommit}
                    />
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}

          </div>
        </div>
      </aside>

      {/* 전체 미리듣기 — 뷰포트 하단 중앙에 고정(fixed)된 컴팩트 플레이어(스크롤해도 안 따라 올라옴).
          가운데 재생 버튼, 좌우 이전/다음, 왼쪽 경과/총시간, 아래 줄별 길이 비례 진행바. */}
      <div className="fixed bottom-4 left-1/2 z-30 w-[min(94vw,26rem)] -translate-x-1/2 rounded-2xl border border-border bg-card/95 px-4 py-2.5 shadow-lg backdrop-blur">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
          {/* 왼쪽: 경과 / 총 시간 (또는 상태) */}
          <span className="min-w-0 truncate justify-self-start text-[0.7rem] tabular-nums text-muted-foreground">
            {building
              ? "음성 만드는 중…"
              : built
                ? `${formatTime(playback.elapsedSec)} / ${formatTime(totalDuration ?? 0)}`
                : "전체 미리 듣기"}
          </span>

          {/* 가운데: 이전 · 재생/정지 · 다음 */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void playAllFrom(Math.max(0, curSeg - 1))}
              disabled={building || !built}
              aria-label="이전 줄부터"
              className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <SkipBack className="size-4" />
            </button>
            <button
              type="button"
              onClick={() => void playAllToggle()}
              disabled={building}
              aria-label={playback.mode === "all" ? "정지" : "재생"}
              className="inline-flex size-9 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md ring-[3px] ring-primary/20 transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
            >
              {building ? (
                <Loader2 className="size-4 animate-spin" />
              ) : playback.mode === "all" ? (
                <Pause className="size-4" />
              ) : (
                <Play className="size-4 translate-x-0.5" />
              )}
            </button>
            <button
              type="button"
              onClick={() => void playAllFrom(Math.min(lastSeg, curSeg + 1))}
              disabled={building || !built || lastSeg <= 0}
              aria-label="다음 줄부터"
              className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            >
              <SkipForward className="size-4" />
            </button>
          </div>

          {/* 오른쪽: 단축키 힌트(가운데 정렬 균형용) */}
          <span className="hidden justify-self-end text-[0.65rem] text-muted-foreground sm:block">
            Ctrl+Space
          </span>
        </div>

        {/* 줄별 진행바 — 하나의 재생 위치가 왼쪽부터 연속으로 흐르며 채워진다(오디오 실시각 동기).
            칸을 누르면 그 줄부터 재생. */}
        {built && snap && snap.durations.length > 0 && (
          <PlaybackProgressBar
            durations={snap.durations}
            lineIds={snap.lineIds}
            elapsedRef={playback.elapsedRef}
            playing={playback.mode === "all"}
            onSeek={(i) => void playAllFrom(i)}
          />
        )}
      </div>
    </div>
  );
}
