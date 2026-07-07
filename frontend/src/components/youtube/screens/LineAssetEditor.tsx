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

import { Fragment, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpToLine,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CornerDownLeft,
  Film,
  ImageIcon,
  ImageUp,
  Loader2,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  SkipBack,
  SkipForward,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { freshYtState, useYt, type TtsBuildSnapshot } from "../state";
import { ytUrl } from "@/lib/youtube/api";
import { cn } from "@/lib/utils";
import { ShortsPreviewFrame } from "../ShortsPreviewFrame";
import { VoiceSettingsBar } from "../shared/VoiceSettingsBar";
import { BgmPicker, bgmAudioUrl, formatTime } from "../shared/BgmPicker";
import { PlaybackProgressBar } from "../shared/PlaybackProgressBar";
import { useTtsSessionPlayback } from "../useTtsSessionPlayback";
import {
  breakSetFromChunks,
  chunksForLine,
  chunksFromBreaks,
  displayLen,
  gapKinds,
  hasOverflowChunk,
  MAX_DISPLAY,
  wordsOf,
} from "@/lib/youtube/subtitle-split";
import {
  confirmDraft,
  deleteLine,
  editLine,
  generateMissingImages,
  getDraftState,
  getTtsSessionManifest,
  mergeLine,
  regenerateClip,
  regenerateImage,
  setSubtitleChunks,
  splitLine,
  ttsPreviewBuild,
  uploadClip,
  uploadImage,
  type BgmItem,
  type LineSource,
  type ScriptLine,
} from "@/lib/youtube/endpoints";

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

function errMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

// 자막 조각 편집 행 — 자막 어절을 칩으로 나열, 어절 사이(·)를 눌러 끊거나(⏎) 다시 합친다.
// 어절 '안'의 글자 사이를 누르면 자막에서만 띄어쓴다(음성·대본 그대로 — 발음용으로 붙여 쓴 말 교정).
// 그렇게 생긴 간격에는 ␣ 칩이 붙고, 누르면 다시 붙는다.
// 12자 초과 조각은 경고색으로 표시(최종 영상이 화면 밖으로 넘침 → 영상 만들기 차단). 재생 중 조각은 강조.
function SubtitleChunkRow({
  text,
  chunks,
  onToggle,
  onSplit,
  onUnsplit,
  disabled,
  activeChunkIdx,
}: {
  text: string;
  chunks: string[];
  onToggle: (wordIndex: number) => void;
  onSplit: (wordIndex: number, charOffset: number) => void;
  onUnsplit: (gapIndex: number) => void;
  disabled?: boolean;
  activeChunkIdx?: number | null;
}) {
  // 자막 어절은 chunks 에서 도출(자막 전용 띄어쓰기 반영). 대본 어절과 정렬해 간격 종류를 구분.
  const words = wordsOf(chunks.join(" "));
  if (words.length === 0) return null;
  const kinds = gapKinds(wordsOf(text), words) ?? words.map(() => "natural" as const);
  const breaks = breakSetFromChunks(chunks);
  // 각 어절이 몇 번째 조각에 속하는지 + 조각별 12자 초과 여부.
  const chunkOfWord: number[] = [];
  {
    let ci = 0;
    for (let i = 0; i < words.length; i++) {
      if (i > 0 && breaks.has(i)) ci++;
      chunkOfWord.push(ci);
    }
  }
  const chunkOverflow = chunks.map((c) => displayLen(c) > MAX_DISPLAY);
  const anyOverflow = chunkOverflow.some(Boolean);
  const singleWordOverflow =
    anyOverflow && chunks.some((c) => displayLen(c) > MAX_DISPLAY && wordsOf(c).length <= 1);

  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-y-1 text-xs">
      <span className="mr-1.5 inline-flex shrink-0 items-center gap-1 text-muted-foreground">
        <span className="rounded border border-border px-1 text-[0.6rem] font-medium">자막</span>
      </span>
      {words.map((w, i) => {
        const over = chunkOverflow[chunkOfWord[i]];
        const playing = activeChunkIdx != null && activeChunkIdx === chunkOfWord[i];
        const chars = Array.from(w);
        return (
          <Fragment key={i}>
            {i > 0 && (
              <button
                type="button"
                onClick={() => onToggle(i)}
                disabled={disabled}
                aria-label={breaks.has(i) ? "여기서 합치기" : "여기서 끊기"}
                className={cn(
                  "mx-0.5 inline-flex h-5 items-center justify-center rounded transition-colors disabled:opacity-40",
                  breaks.has(i)
                    ? "w-5 bg-primary text-primary-foreground"
                    : "w-3 text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
                title={breaks.has(i) ? "이 줄바꿈을 없애 합쳐요" : "여기서 자막을 끊어요"}
              >
                {breaks.has(i) ? <CornerDownLeft className="size-3" /> : "·"}
              </button>
            )}
            {i > 0 && kinds[i] === "split" && (
              <button
                type="button"
                onClick={() => onUnsplit(i)}
                disabled={disabled}
                aria-label="자막 띄어쓰기 취소"
                title="자막에서만 띄어 쓴 자리예요 — 누르면 다시 붙어요"
                className="mr-0.5 inline-flex h-5 items-center rounded bg-primary/10 px-1 font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
              >
                ␣
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
              {chars.map((ch, ci) => (
                <Fragment key={ci}>
                  {ci > 0 && (
                    // 히트 영역은 넓게(양옆 글자 위까지 겹침) — 근처만 가도 활성화.
                    // 보이는 선은 안쪽 얇은 막대로, hover 시에만 표시.
                    <button
                      type="button"
                      onClick={() => onSplit(i, ci)}
                      disabled={disabled}
                      aria-label="자막에서만 띄어쓰기"
                      title="누르면 자막에서만 띄어 써요 (음성은 그대로)"
                      className="group/split relative z-10 -mx-2 inline-flex h-4 w-4 cursor-text items-center justify-center align-middle disabled:pointer-events-none"
                    >
                      <span className="h-3.5 w-[3px] rounded-full bg-primary/70 opacity-0 transition-opacity group-hover/split:opacity-100" />
                    </button>
                  )}
                  {ch}
                </Fragment>
              ))}
            </span>
          </Fragment>
        );
      })}
      {anyOverflow && (
        <span className="ml-1.5 inline-flex items-center gap-1 text-[0.7rem] text-amber-700 dark:text-amber-400">
          <AlertTriangle className="size-3" />
          {singleWordOverflow
            ? "너무 긴 단어예요 — 글자 사이를 누르면 자막에서만 띄어 쓸 수 있어요"
            : "화면보다 길어요 — 끊어주세요"}
        </span>
      )}
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

  // 음성 재생 컨트롤러(줄별 ▶ / 전체 미리듣기 + BGM 믹스 + 자막 조각 추적).
  const playback = useTtsSessionPlayback();
  // 음성 세션 빌드/영상 확정 진행 표시.
  const [building, setBuilding] = useState(false);
  const [creating, setCreating] = useState(false);
  // 선택된 BGM(전체 미리듣기 믹서에 넘길 url·길이). BgmPicker 가 알려준다.
  const [selectedBgm, setSelectedBgm] = useState<BgmItem | null>(null);
  // 정지 상태에서 선택 줄 자막을 넘겨보는 수동 페이저 인덱스.
  const [previewChunkIdx, setPreviewChunkIdx] = useState(0);
  // 프리뷰 프레임 폭 — 창 높이에 맞춰 자동(짧으면 축소, 크면 상한). 고정 크기면 짧은 창에서 잘림.
  const [previewWidth, setPreviewWidth] = useState(300);
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
  function onClipChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = "";
    const lineId = uploadTargetRef.current;
    uploadTargetRef.current = "";
    void doUpload(lineId, file, "clip");
  }

  // 이미지/영상 공통 업로드. kind 에 따라 검증·업로드함수·소스·메시지만 다르다.
  async function doUpload(
    lineId: string,
    file: File | undefined,
    kind: "image" | "clip",
  ) {
    if (!file || !lineId || !jobId) return;
    // 파일 고르는 사이 순서가 바뀌었을 수 있으니 line_id 로 현재 index 를 다시 구한다.
    const i = indexOfLine(lineId);
    if (i < 0) {
      toast.error("그 줄이 사라졌어요. 다시 시도해 주세요.");
      return;
    }
    if (kind === "image") {
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error("PNG, JPG, WebP 이미지만 올릴 수 있어요.");
        return;
      }
      if (file.size > MAX_BYTES) {
        toast.error("이미지는 10MB 이하만 올릴 수 있어요.");
        return;
      }
    } else {
      // 영상은 일부 브라우저가 MIME 을 비워 줄 수 있어, 빈 타입은 통과시키고 서버 검증에 맡긴다.
      if (file.type && !CLIP_ALLOWED_TYPES.includes(file.type)) {
        toast.error("MP4, MOV, WebM, AVI 영상만 올릴 수 있어요.");
        return;
      }
      if (file.size > CLIP_MAX_BYTES) {
        toast.error("영상은 50MB 이하만 올릴 수 있어요.");
        return;
      }
    }
    setUploading((s) => new Set(s).add(lineId));
    try {
      const res =
        kind === "image"
          ? await uploadImage(jobId, i, file)
          : await uploadClip(jobId, i, file);
      if (!mountedRef.current) return;
      // 낙관적 반영(line_id 기준): 업로드 응답의 asset_version 으로 즉시 캐시버스팅 + 소스 전환.
      // (뒤이은 refresh 가 실패해도 새 자산이 보장된다.)
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
              }
            : l,
        ),
      );
      setSources((prev) => {
        const j = indexOfLine(lineId);
        return j < 0 ? prev : prev.map((s, idx) => (idx === j ? kind : s));
      });
      await refresh();
      if (mountedRef.current) {
        const j = indexOfLine(lineId);
        const what = kind === "image" ? "이미지" : "영상";
        toast.success(`${(j < 0 ? i : j) + 1}번째 줄 ${what}을 올렸어요.`);
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

  // ── 음성 빌드 스냅샷 기반 파생값 ──────────────────────────────
  const snap = state.ttsBuild;
  const voiceChanged =
    !!snap &&
    (snap.voice.voiceId !== state.voiceId ||
      snap.voice.speed !== state.ttsSpeed ||
      snap.voice.emotion !== state.emotion);
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
        speed: state.ttsSpeed,
        emotion: state.emotion,
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
        voice: { voiceId: state.voiceId, speed: state.ttsSpeed, emotion: state.emotion },
        version: (snap?.version ?? 0) + 1,
      };
      update({ ttsSessionId: data.session_id, ttsDirty: false, ttsBuild: newSnap });
      return newSnap;
    } catch (e) {
      toast.error(errMessage(e, "음성 생성에 실패했어요. (Typecast 키 확인)"));
      return null;
    } finally {
      if (mountedRef.current) setBuilding(false);
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
  async function saveChunks(l: ScriptLine, next: string[]) {
    const id = String(l.line_id ?? "");
    if (!id || !jobId) return;
    setLines((prev) =>
      prev.map((x) =>
        String(x.line_id ?? "") === id ? { ...x, subtitle_chunks: next } : x,
      ),
    );
    try {
      await setSubtitleChunks(jobId, id, next);
    } catch (e) {
      if (mountedRef.current) toast.error(errMessage(e, "자막 저장에 실패했어요."));
    }
  }
  // 이 줄의 자막 어절(자막 전용 띄어쓰기 반영 — 대본 어절과 다를 수 있음).
  function displayWords(l: ScriptLine): string[] {
    return wordsOf(lineChunks(l).join(" "));
  }
  // 자막 조각 끊김 토글(어절 사이 클릭).
  async function toggleBreak(l: ScriptLine, wordIndex: number) {
    const current = lineChunks(l);
    const words = displayWords(l);
    const breaks = breakSetFromChunks(current);
    if (breaks.has(wordIndex)) breaks.delete(wordIndex);
    else breaks.add(wordIndex);
    await saveChunks(l, chunksFromBreaks(words, breaks));
  }
  // 자막 전용 띄어쓰기: 어절 안 글자 사이 클릭 → 자막에서만 띄운다(대본·음성 그대로).
  async function splitWord(l: ScriptLine, wordIndex: number, charOffset: number) {
    const current = lineChunks(l);
    const words = displayWords(l);
    const chars = Array.from(words[wordIndex] ?? "");
    if (charOffset <= 0 || charOffset >= chars.length) return;
    // 쪼개진 어절 뒤의 끊김 위치는 한 칸씩 밀린다.
    const breaks = new Set<number>();
    for (const b of breakSetFromChunks(current)) breaks.add(b > wordIndex ? b + 1 : b);
    const next = [
      ...words.slice(0, wordIndex),
      chars.slice(0, charOffset).join(""),
      chars.slice(charOffset).join(""),
      ...words.slice(wordIndex + 1),
    ];
    await saveChunks(l, chunksFromBreaks(next, breaks));
  }
  // 자막 전용 띄어쓰기 취소(␣ 클릭): 간격 앞뒤 어절을 다시 붙인다. 그 자리 끊김도 함께 제거.
  async function unsplitGap(l: ScriptLine, gapIndex: number) {
    const current = lineChunks(l);
    const words = displayWords(l);
    if (gapIndex <= 0 || gapIndex >= words.length) return;
    const breaks = new Set<number>();
    for (const b of breakSetFromChunks(current)) {
      if (b === gapIndex) continue;
      breaks.add(b > gapIndex ? b - 1 : b);
    }
    const next = [
      ...words.slice(0, gapIndex - 1),
      words[gapIndex - 1] + words[gapIndex],
      ...words.slice(gapIndex + 1),
    ];
    await saveChunks(l, chunksFromBreaks(next, breaks));
  }

  const readyCount = lines.filter(isReady).length;
  const allReady = lines.length > 0 && readyCount === lines.length;
  // 전역 잠금: AI 생성 폴링 중이거나 업로드가 하나라도 진행 중이면 전역 액션을 막는다.
  // (업로드 도중 "모두 생성"/"다음"을 누르면 AI 워커가 업로드를 덮어쓸 수 있음 — Codex HIGH.)
  const busyGlobal = polling || uploading.size > 0;

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
        title_color1: state.titleColor1,
        title_color2: state.titleColor2,
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
        const texts: Record<string, string> = {};
        linesRef.current.forEach((l) => {
          texts[String(l.line_id ?? "")] = l.text ?? "";
        });
        update({
          ttsBuild: {
            sessionId: man.session_id,
            lineIds,
            texts,
            durations: man.durations,
            wordTimes: man.word_times ?? lineIds.map(() => null),
            voice: {
              voiceId: man.voice.voice_id ?? state.voiceId,
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

  // 선택 줄이 바뀌면 자막 수동 페이저를 처음으로.
  useEffect(() => {
    setPreviewChunkIdx(0);
  }, [activeLineId]);

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

  // 프리뷰 자막: 재생 중이면 그 조각을 따라가고, 정지 상태면 수동 페이저로 넘겨본다.
  const activeChunks = activeLine ? lineChunks(activeLine) : [];
  const activePlaying =
    !!activeLine && playback.nowPlayingLineId === String(activeLine.line_id ?? "");
  const activeChunkIdx = activeChunks.length
    ? Math.min(
        activePlaying ? playback.nowChunkIndex : previewChunkIdx,
        activeChunks.length - 1,
      )
    : 0;
  const activeSubtitle = activeChunks[activeChunkIdx] ?? "";
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
          voiceId={state.voiceId}
          emotion={state.emotion}
          ttsSpeed={state.ttsSpeed}
          disabled={building}
          onPatch={(p) => {
            playback.stop();
            update({ ...p, ttsDirty: true });
          }}
        />
        {built && voiceChanged && (
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            성우·속도·감정을 바꿨어요. 다음 재생 때 모든 줄 음성을 새로 만들어요.
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
              {/* 썸네일 (클릭 시 이 줄을 우측 미리보기로 선택) */}
              <button
                type="button"
                onClick={() => hasId && setActiveLineId(lineId)}
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
                  {ready && (
                    <span className="inline-flex items-center gap-0.5 text-[0.7rem] text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> 준비됨
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
                  className="mt-1 min-h-0 resize-y py-1.5 text-sm"
                  aria-label={`${i + 1}번째 줄 텍스트`}
                />
                {failed && l.fail_reason && (
                  <p className="mt-0.5 line-clamp-1 text-[0.7rem] text-destructive">
                    {l.fail_reason}
                  </p>
                )}

                {hasId && (l.text ?? "").trim() !== "" && (
                  <SubtitleChunkRow
                    text={l.text ?? ""}
                    chunks={lineChunks(l)}
                    disabled={editLocked}
                    onToggle={(wi) => toggleBreak(l, wi)}
                    onSplit={(wi, co) => splitWord(l, wi, co)}
                    onUnsplit={(gi) => unsplitGap(l, gi)}
                    activeChunkIdx={
                      playback.nowPlayingLineId === lineId
                        ? playback.nowChunkIndex
                        : null
                    }
                  />
                )}

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
          disabled={!allReady || busyGlobal || creating || building || hasOverflow}
          title={
            hasOverflow
              ? `${overflowLineIdx + 1}번째 줄 자막이 화면보다 길어요`
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
          {/* 카드에 남는 세로 여백을 흡수해 프레임·자막 페이저·설명을 세로 중앙에 모은다.
              → 스티키로 따라오다 스크롤 최하단에서 카드 하단이 좌측 카드 하단과 맞물린다. */}
          <div className="flex flex-1 flex-col justify-center">
          <div className="mt-3 flex justify-center">
            <ShortsPreviewFrame
              titleLine1={state.titleLine1}
              titleLine2={state.titleLine2}
              titleFont={state.titleFont}
              titleFontWeight={state.titleFontWeight}
              titleFontSize={state.titleFontSize}
              titleColor1={state.titleColor1}
              titleColor2={state.titleColor2}
              subtitle={activeSubtitle}
              width={previewWidth}
            >
              {!activeLine ? (
                <div className="flex h-full w-full items-center justify-center text-xs text-white/50">
                  생성·업로드 대기
                </div>
              ) : isReady(activeLine) && activeSource !== "clip" ? (
                // eslint-disable-next-line @next/next/no-img-element -- 프록시 경유 동적 이미지(서버 최적화 부적합)
                <img
                  src={imgSrc(activeIndex, activeLine)}
                  alt={`${activeIndex + 1}번 줄 미리보기`}
                  className="h-full w-full object-cover"
                />
              ) : isReady(activeLine) && activeSource === "clip" ? (
                <video
                  key={clipSrc(activeIndex, activeLine)}
                  src={clipSrc(activeIndex, activeLine)}
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="h-full w-full object-cover"
                />
              ) : activeWorking ? (
                <div className="flex h-full w-full items-center justify-center">
                  <Loader2 className="h-5 w-5 animate-spin text-white/70" />
                </div>
              ) : isFailed(activeLine) ? (
                <div className="flex h-full w-full items-center justify-center text-xs text-red-300">
                  생성 실패
                </div>
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs text-white/50">
                  생성·업로드 대기
                </div>
              )}
            </ShortsPreviewFrame>
          </div>

          {/* 자막 조각 페이저 — 정지 상태에서 선택 줄의 자막을 넘겨본다(재생 중엔 자동 추종). */}
          {activeChunks.length > 0 && (
            <div className="mt-2 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <button
                type="button"
                aria-label="이전 자막"
                disabled={activePlaying || activeChunkIdx <= 0}
                onClick={() => setPreviewChunkIdx((n) => Math.max(0, n - 1))}
                className="inline-flex size-5 items-center justify-center rounded hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="size-3.5" />
              </button>
              <span className="tabular-nums">
                자막 {activeChunkIdx + 1}/{activeChunks.length}
              </span>
              <button
                type="button"
                aria-label="다음 자막"
                disabled={activePlaying || activeChunkIdx >= activeChunks.length - 1}
                onClick={() =>
                  setPreviewChunkIdx((n) => Math.min(activeChunks.length - 1, n + 1))
                }
                className="inline-flex size-5 items-center justify-center rounded hover:bg-muted disabled:opacity-40"
              >
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          )}
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
