"use client";

// Card B 2단계(M3a) — 줄별 자산 편집(이미지 전용).
// 대본을 쪼갠 줄마다: AI 그림 생성/재생성 + 내 사진 올리기. 진행 상태는 draft-state 폴링으로 추적.
//
// M3a 범위: 줄 구조는 고정(엔터 분할/합치기/삭제·텍스트 인라인 수정은 M3c). 영상 클립은 M3d.
//   → 줄 index 가 바뀌지 않으므로 index 기반 업로드/재생성의 레이스 걱정이 없다.
//
// 줄별 비동기 생성은 job.status 가 아니라 **줄별 status**(pending→ready/failed)로 끝나므로,
// draft-state(lines[].status / asset_step / asset_version)를 2초마다 폴링해 갱신한다.
// 캐시버스팅은 줄이 들고 있는 asset_version 을 ?v 로 붙여 처리(재생성/업로드 시 백엔드가 +1).

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUpToLine,
  CheckCircle2,
  CornerDownLeft,
  ImageIcon,
  ImageUp,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { initialYtState, useYt } from "../state";
import { ytUrl } from "@/lib/youtube/api";
import {
  deleteLine,
  editLine,
  generateMissingImages,
  getDraftState,
  mergeLine,
  regenerateImage,
  splitLine,
  uploadImage,
  type LineSource,
  type ScriptLine,
} from "@/lib/youtube/endpoints";

const ACCEPT = "image/png,image/jpeg,image/webp";
const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;
const POLL_MS = 2000;
// 정체 감지: 한 줄이라도 완료되면 연장. 이 시간 동안 진척이 전혀 없으면 폴링 중단(영구 잠금 방지).
// Card B 이미지는 순서대로 생성(~16~32초/줄)이라 첫 줄도 이 안에 든다.
const STALL_MS = 150_000;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const isReady = (l: ScriptLine) => l.status === "ready";
const isFailed = (l: ScriptLine) => l.status === "failed";
// 생성/업로드 진행 중: 아직 pending 인데 단계(asset_step)가 찍혀 있음.
const isWorking = (l: ScriptLine) => l.status === "pending" && !!l.asset_step;
const anyWorking = (ls: ScriptLine[]) => ls.some(isWorking);

const SOURCE_LABEL: Record<LineSource, string> = {
  ai: "AI",
  image: "내 사진",
  clip: "영상",
};

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

  const mountedRef = useRef(true);
  const pollingRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // 업로드 대상 줄의 line_id. 파일 대화상자가 열린 사이 split/delete 로 순서가 바뀌어도
  // 전송 직전 line_id → 현재 index 로 재해석해 엉뚱한 줄에 안 올라가게 한다(Codex #7).
  const uploadTargetRef = useRef<string>("");
  // 항상 최신 lines 를 가리키는 거울. blur 저장·삭제 시 line_id → 현재 index 를
  // 이걸로 재해석한다(폴링/삭제로 순서가 바뀌어도 엉뚱한 줄을 안 건드리게).
  const linesRef = useRef<ScriptLine[]>([]);
  useEffect(() => {
    linesRef.current = lines;
  }, [lines]);

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
        if (!anyWorking(ls)) break;
      }
      if (Date.now() > stallAt) {
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
      setLines((prev) =>
        prev.map((l) =>
          String(l.line_id ?? "") === lineId ? { ...l, text: draft } : l,
        ),
      );
      clearDraft(lineId);
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
    const idx = indexOfLine(lineId);
    if (idx < 0) return;
    setStructuring((s) => new Set(s).add(lineId));
    try {
      const res = await splitLine(jobId, idx, before, after);
      if (!mountedRef.current) return;
      setLines(res.lines);
      setSources(res.sources);
      clearDraft(lineId); // 서버 텍스트가 before 로 확정됨
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

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.target;
    const file = input.files?.[0];
    input.value = "";
    const lineId = uploadTargetRef.current;
    uploadTargetRef.current = "";
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
      toast.error("파일은 10MB 이하만 올릴 수 있어요.");
      return;
    }
    setUploading((s) => new Set(s).add(lineId));
    try {
      const res = await uploadImage(jobId, i, file);
      if (!mountedRef.current) return;
      // 낙관적 반영(line_id 기준): 업로드 응답의 asset_version 으로 즉시 캐시버스팅 + 소스 image 전환.
      // (뒤이은 refresh 가 실패해도 새 그림이 보장된다.)
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
        return j < 0 ? prev : prev.map((s, idx) => (idx === j ? "image" : s));
      });
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

  const readyCount = lines.filter(isReady).length;
  const allReady = lines.length > 0 && readyCount === lines.length;
  // 전역 잠금: AI 생성 폴링 중이거나 업로드가 하나라도 진행 중이면 전역 액션을 막는다.
  // (업로드 도중 "모두 생성"/"다음"을 누르면 AI 워커가 업로드를 덮어쓸 수 있음 — Codex HIGH.)
  const busyGlobal = polling || uploading.size > 0;

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중...
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">줄별 이미지·대본</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            줄마다 AI 그림을 만들거나 내 사진을 올리세요.{" "}
            <b className="text-foreground">
              {readyCount}/{lines.length}
            </b>{" "}
            줄 준비됨.
          </p>
          <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
            <CornerDownLeft className="mt-0.5 size-3 shrink-0" />
            <span>
              글을 고친 뒤 다른 곳을 누르면 저장돼요. 문장 안에서 <b>Enter</b>를 누르면 그
              자리에서 두 줄로 나뉘고, 맨 앞에서 <b>Backspace</b>를 누르면 윗줄과 합쳐져요.
            </span>
          </p>
        </div>
        <Button onClick={genAll} disabled={busyGlobal} variant="outline" className="shrink-0 gap-1.5">
          {polling ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {polling ? "생성 중..." : "비어있는 줄 모두 AI 생성"}
        </Button>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={onFileChosen}
      />

      <ul className="mt-5 space-y-2.5">
        {lines.map((l, i) => {
          const ready = isReady(l);
          const failed = isFailed(l);
          const lineId = String(l.line_id ?? "");
          const hasId = lineId !== "";
          const working = isWorking(l) || uploading.has(lineId);
          const src: LineSource = sources[i] ?? "ai";
          const savingThis = savingText.has(lineId);
          const deletingThis = deleting.has(lineId);
          const structuringThis = structuring.has(lineId);
          const editLocked = working || deletingThis || structuringThis || !hasId;
          // 구조 변경(나누기/합치기/삭제)은 생성 폴링·업로드 진행 중엔 막는다(재인덱싱 레이스 방지).
          const structLocked = editLocked || busyGlobal;
          const textValue = drafts[lineId] ?? l.text;
          return (
            <li
              key={l.line_id ?? i}
              className="flex gap-3 rounded-lg border border-border bg-background p-2.5"
            >
              {/* 썸네일 */}
              <div className="relative aspect-[9/16] w-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                {ready && src !== "clip" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 프록시 경유 동적 이미지(서버 최적화 부적합)
                  <img
                    src={imgSrc(i, l)}
                    alt={`${i + 1}번째 줄 이미지`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <ImageIcon className="h-5 w-5" />
                  </div>
                )}
                {working && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
              </div>

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
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto shrink-0 text-muted-foreground hover:text-destructive"
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
                  }}
                  disabled={editLocked || savingThis}
                  rows={2}
                  className="mt-1 min-h-0 resize-y py-1.5 text-sm"
                  aria-label={`${i + 1}번째 줄 텍스트`}
                />
                {failed && l.fail_reason && (
                  <p className="mt-0.5 line-clamp-1 text-[0.7rem] text-destructive">
                    {l.fail_reason}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => regen(i)}
                    disabled={working}
                  >
                    {ready ? (
                      <RefreshCw className="size-3" />
                    ) : (
                      <Sparkles className="size-3" />
                    )}
                    {ready ? "다시" : "AI 그림"}
                  </Button>
                  <Button
                    variant="outline"
                    size="xs"
                    onClick={() => pickUpload(lineId)}
                    disabled={working}
                  >
                    <ImageUp className="size-3" /> 올리기
                  </Button>
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
          onClick={() => update({ ...initialYtState })}
          disabled={busyGlobal}
          className="gap-1.5"
        >
          <RotateCcw className="h-4 w-4" /> 처음부터
        </Button>
        <Button
          onClick={() => update({ screen: "tts" })}
          disabled={!allReady || busyGlobal}
          title={allReady ? "" : "모든 줄의 이미지를 먼저 준비하세요"}
        >
          {allReady ? "다음: 음성" : `다음: 음성 (${readyCount}/${lines.length})`}
        </Button>
      </div>
    </div>
  );
}
