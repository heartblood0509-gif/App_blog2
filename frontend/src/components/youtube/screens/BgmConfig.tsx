"use client";

// Card A 5단계 — BGM 설정 + 영상 생성(마지막 입력 단계). 원본처럼 이 단계의 메인 버튼이 곧 작업 생성이다.
// BGM 은 선택 사항(없이도 진행 가능). 볼륨은 0~50%(백엔드 0~0.5 로 환산), 시작 지점은 선택한 곡 길이 내.
// promo_comment 는 여기서 expanded_sentences 기준으로 이미지 프롬프트를 생성한 뒤 job 을 만든다.

import { useEffect, useRef, useState } from "react";
import { Film, Loader2, Music, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useYt } from "../state";
import { ytUrl } from "@/lib/youtube/api";
import {
  confirmDraft,
  createJob,
  deleteBgm,
  generateImagePrompts,
  listBgm,
  uploadBgm,
  type BgmItem,
} from "@/lib/youtube/endpoints";

const MAX_BGM = 3;
const MAX_BYTES = 20 * 1024 * 1024;

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function errMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export function BgmConfig() {
  const { state, update } = useYt();
  const isUserAssets = state.mode === "user_assets";
  const isCosmetics = state.category === "cosmetics";
  const contentType = isCosmetics ? state.contentType : null;
  const isPromoComment = contentType === "promo_comment";

  const [bgms, setBgms] = useState<BgmItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [creating, setCreating] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function reload() {
    setListLoading(true);
    try {
      setBgms(await listBgm());
    } catch (e) {
      toast.error(errMessage(e, "BGM 목록을 불러오지 못했습니다."));
    } finally {
      setListLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  const selected = bgms.find((b) => b.filename === state.bgmFilename) ?? null;

  function selectBgm(item: BgmItem) {
    // 같은 곡을 다시 누르면 선택 해제(= BGM 없음).
    if (state.bgmFilename === item.filename) {
      update({ bgmFilename: null, bgmStartSec: 0 });
    } else {
      update({ bgmFilename: item.filename, bgmStartSec: 0 });
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = ""; // 같은 파일 재선택 허용
    if (!file) return;
    if (bgms.length >= MAX_BGM) {
      toast.error(`BGM 은 최대 ${MAX_BGM}개까지 등록할 수 있어요.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("파일 크기는 20MB 이하만 가능합니다.");
      return;
    }
    setUploading(true);
    try {
      await uploadBgm(file);
      await reload();
      toast.success("BGM 을 추가했어요.");
    } catch (e) {
      toast.error(errMessage(e, "업로드에 실패했습니다."));
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(item: BgmItem) {
    try {
      await deleteBgm(item.id ?? item.filename);
      if (state.bgmFilename === item.filename) {
        update({ bgmFilename: null, bgmStartSec: 0 });
      }
      await reload();
    } catch (e) {
      toast.error(errMessage(e, "삭제에 실패했습니다."));
    }
  }

  async function handleCreate() {
    if (creating) return;

    // Card B(user_assets): draft job 에 음성·BGM·제목을 채워 confirm → 렌더.
    // (Card A 의 createJob 과 달리 이미 만들어둔 draft 를 confirm 만 한다.)
    if (isUserAssets) {
      if (!state.jobId) {
        toast.error("작업을 찾을 수 없어요. 대본 단계부터 다시 진행해주세요.");
        return;
      }
      // 음성이 아직 없거나(ttsSessionId 없음), 줄을 고쳐 음성이 낡았으면(ttsDirty) 음성 단계로 보낸다.
      // → 거기서 incremental 재빌드(바뀐 줄만)로 자막·음성을 맞춘 뒤 다시 진행. (stale 음성 렌더 방지)
      if (!state.ttsSessionId || state.ttsDirty) {
        toast.error(
          state.ttsDirty
            ? "대본이 바뀌었어요. 음성을 다시 만들어주세요. (음성 단계)"
            : "나레이션 음성을 먼저 만들어주세요. (음성 단계)",
        );
        update({ screen: "tts" });
        return;
      }
      setCreating(true);
      try {
        await confirmDraft(state.jobId, {
          tts_engine: state.ttsEngine,
          tts_speed: state.ttsSpeed,
          voice_id: state.voiceId,
          emotion: state.ttsEngine === "typecast" ? state.emotion : null,
          tts_session_id: state.ttsSessionId,
          bgm_filename: state.bgmFilename,
          bgm_start_sec: state.bgmStartSec,
          bgm_volume: state.bgmVolume / 100,
          title: state.selectedTitle,
          title_line1: state.titleLine1,
          title_line2: state.titleLine2,
          title_font: state.titleFont,
          title_font_weight: state.titleFontWeight,
          title_font_size: state.titleFontSize,
        });
        update({ screen: "progress" });
      } catch (e) {
        toast.error(errMessage(e, "영상 생성 시작에 실패했습니다."));
        setCreating(false);
      }
      return;
    }

    // 정보성은 제품 강제 제외, 홍보성은 제품 필수(제품 등록 화면은 추후 단계).
    const productImageId = contentType === "info" ? null : state.productImageId;
    if (contentType === "promo" && !productImageId) {
      toast.error("홍보성 영상은 제품 이미지가 필요해요. (제품 등록 화면은 준비 중입니다)");
      return;
    }

    setCreating(true);
    try {
      let lines = state.scriptLines;
      // promo_comment: 분리된 문장 기준으로 이미지 프롬프트를 지금 생성.
      if (isPromoComment) {
        const narrationForPrompts =
          state.expandedSentences ?? state.narration.map((l) => l.text.trim());
        const res = await generateImagePrompts({
          narration_lines: narrationForPrompts,
          style: "realistic",
          topic: state.topic.trim(),
          category: state.category,
          content_type: isCosmetics ? state.contentType : undefined,
        });
        lines = res.lines;
      }
      if (!lines || lines.length === 0) {
        toast.error("이미지 구성이 준비되지 않았습니다. 나레이션 단계부터 다시 진행해주세요.");
        setCreating(false); // 막다른 분기에서 버튼 잠금 해제
        return;
      }

      const job = await createJob({
        topic: state.topic,
        style: "realistic",
        video_mode: "kenburns",
        tts_engine: state.ttsEngine,
        tts_speed: state.ttsSpeed,
        voice_id: state.voiceId,
        emotion: state.ttsEngine === "typecast" ? state.emotion : null,
        title: state.selectedTitle,
        title_line1: state.titleLine1,
        title_line2: state.titleLine2,
        lines,
        bgm_volume: state.bgmVolume / 100,
        bgm_filename: state.bgmFilename,
        bgm_start_sec: state.bgmStartSec,
        product_image_id: productImageId,
        tts_session_id: state.ttsSessionId,
      });
      update({ jobId: job.job_id, screen: "progress" });
    } catch (e) {
      toast.error(errMessage(e, "영상 생성 시작에 실패했습니다."));
      setCreating(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-lg font-semibold">배경 음악 (BGM)</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        영상에 깔 배경 음악을 고르세요. 선택은 필수가 아니에요 — 없이도 만들 수 있어요.
      </p>

      {/* 업로드 */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".mp3,.wav,.ogg"
          hidden
          onChange={handleUpload}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => fileRef.current?.click()}
          disabled={uploading || bgms.length >= MAX_BGM}
          className="gap-1.5"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload className="h-3.5 w-3.5" />
          )}
          BGM 업로드
        </Button>
        <span className="text-xs text-muted-foreground">
          MP3·WAV·OGG · 최대 20MB · {bgms.length}/{MAX_BGM}
        </span>
      </div>

      {/* 목록 */}
      <div className="mt-4 space-y-2">
        {listLoading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중...
          </div>
        ) : bgms.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
            등록된 BGM 이 없어요. 업로드하거나 BGM 없이 진행하세요.
          </p>
        ) : (
          bgms.map((item) => {
            const sel = item.filename === state.bgmFilename;
            return (
              <div
                key={item.filename}
                className={cn(
                  "flex items-center gap-3 rounded-lg border p-3",
                  sel
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background",
                )}
              >
                <button
                  type="button"
                  onClick={() => selectBgm(item)}
                  className="flex flex-1 items-center gap-3 text-left"
                >
                  <span
                    className={cn(
                      "flex size-8 flex-shrink-0 items-center justify-center rounded-full",
                      sel
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Music className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">
                      {item.filename}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {formatTime(item.duration)}
                    </span>
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDelete(item)}
                  aria-label="BGM 삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            );
          })
        )}
      </div>

      {/* 선택한 곡: 미리듣기 + 시작 지점 */}
      {selected && (
        <div className="mt-4 space-y-4 rounded-lg border border-border bg-muted/30 p-4">
          <audio controls src={ytUrl(selected.url)} className="w-full" />
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label>시작 지점</Label>
              <span className="text-sm tabular-nums text-muted-foreground">
                {formatTime(state.bgmStartSec)}
              </span>
            </div>
            <Slider
              min={0}
              max={Math.max(1, Math.floor(selected.duration))}
              step={0.1}
              value={state.bgmStartSec}
              onValueChange={(v) => update({ bgmStartSec: v })}
            />
          </div>
        </div>
      )}

      {/* 볼륨 */}
      <div className="mt-4 grid gap-2">
        <div className="flex items-center justify-between">
          <Label>볼륨</Label>
          <span className="text-sm tabular-nums text-muted-foreground">
            {state.bgmVolume}%
          </span>
        </div>
        <Slider
          min={0}
          max={50}
          step={1}
          value={state.bgmVolume}
          onValueChange={(v) => update({ bgmVolume: v })}
        />
      </div>

      {/* 영상 생성 */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-xs text-muted-foreground">
          {state.bgmFilename ? `선택: ${state.bgmFilename}` : "BGM 없이 진행"}
        </p>
        <Button onClick={handleCreate} disabled={creating} className="gap-2">
          {creating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Film className="h-4 w-4" />
          )}
          {creating ? "영상 만드는 중..." : "영상 만들기"}
        </Button>
      </div>
    </div>
  );
}
