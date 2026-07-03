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

import { useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowUpToLine,
  CheckCircle2,
  CornerDownLeft,
  Film,
  ImageIcon,
  ImageUp,
  Loader2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Trash2,
  Video,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { initialYtState, useYt } from "../state";
import { ytUrl } from "@/lib/youtube/api";
import { cn } from "@/lib/utils";
import { ShortsPreviewFrame } from "../ShortsPreviewFrame";
import {
  deleteLine,
  editLine,
  generateMissingImages,
  getDraftState,
  mergeLine,
  regenerateClip,
  regenerateImage,
  splitLine,
  uploadClip,
  uploadImage,
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
      setLines((prev) =>
        prev.map((l) =>
          String(l.line_id ?? "") === lineId ? { ...l, text: draft } : l,
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

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_390px] lg:items-start lg:gap-5">
      <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">줄별 이미지·대본</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            줄마다 AI 이미지를 만들거나 내 이미지·영상을 올리세요. 이미지는 AI로 영상 변환도 돼요.{" "}
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
              className={cn(
                "flex gap-3 rounded-lg border bg-background p-2.5 transition-colors",
                lineId === activeLineId
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

      {/* 우측: 선택 줄 프리뷰 (최종 쇼츠 모습 흉내 — 이미지 위 제목 오버레이) */}
      <aside className="mt-4 lg:mt-0 lg:sticky lg:top-4">
        <div className="rounded-xl border border-border bg-card p-4 text-card-foreground">
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
          <div className="mt-3 flex justify-center">
            <ShortsPreviewFrame
              titleLine1={state.titleLine1}
              titleLine2={state.titleLine2}
              titleFont={state.titleFont}
              titleFontWeight={state.titleFontWeight}
              titleFontSize={state.titleFontSize}
              width={350}
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
          <p className="mt-2 text-center text-xs text-muted-foreground">
            최종 쇼츠에 표시될 모습이에요.
          </p>
        </div>
      </aside>
    </div>
  );
}
