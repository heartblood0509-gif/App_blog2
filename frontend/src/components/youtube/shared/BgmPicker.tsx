"use client";

// 배경음악 선택 카드 — 목록/업로드/삭제 + 선택 곡의 시작 지점·볼륨. (선택은 필수 아님)
// 선택된 곡(url·길이)은 onSelectedItem 으로 부모(전체 미리듣기 믹서)에게 넘긴다.

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Loader2, Music, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { ytUrl } from "@/lib/youtube/api";
import { deleteBgm, listBgm, uploadBgm, type BgmItem } from "@/lib/youtube/endpoints";

const MAX_BGM = 3;
const MAX_BYTES = 20 * 1024 * 1024;

export function formatTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}
function errMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export interface BgmChange {
  bgmFilename?: string | null;
  bgmStartSec?: number;
  bgmVolume?: number;
}

export function BgmPicker({
  filename,
  startSec,
  volume,
  onChange,
  onSelectedItem,
  disabled,
}: {
  filename: string | null;
  startSec: number;
  volume: number; // 0~50 (UI 스케일)
  onChange: (p: BgmChange) => void;
  onSelectedItem?: (item: BgmItem | null) => void;
  disabled?: boolean;
}) {
  const [bgms, setBgms] = useState<BgmItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  // 선택(옵션) 카드라 기본은 접힘. 곡이 선택돼 있으면(복원 등) 자동으로 펼친다.
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (filename) setOpen(true);
  }, [filename]);

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

  const selected = bgms.find((b) => b.filename === filename) ?? null;

  // 선택 곡(url·길이)을 부모에게 알림(전체 미리듣기 믹서용). 목록 로드/선택 변경 시 갱신.
  useEffect(() => {
    onSelectedItem?.(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.filename, selected?.url, selected?.duration]);

  function selectBgm(item: BgmItem) {
    if (filename === item.filename) {
      onChange({ bgmFilename: null, bgmStartSec: 0 });
    } else {
      onChange({ bgmFilename: item.filename, bgmStartSec: 0 });
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
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
      setOpen(true);
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
      if (filename === item.filename) onChange({ bgmFilename: null, bgmStartSec: 0 });
      await reload();
    } catch (e) {
      toast.error(errMessage(e, "삭제에 실패했습니다."));
    }
  }

  return (
    <div className="rounded-lg border border-muted-foreground/20 bg-muted/50 p-3 text-card-foreground">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex flex-1 items-center gap-2 text-left"
        >
          <Music className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">배경음악</span>
          <span className="text-xs text-muted-foreground">(선택)</span>
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".mp3,.wav,.ogg"
          hidden
          onChange={handleUpload}
        />
        <Button
          variant="outline"
          size="xs"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || uploading || bgms.length >= MAX_BGM}
          className="gap-1"
        >
          {uploading ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Upload className="size-3" />
          )}
          올리기
        </Button>
      </div>
      {open && (
        <>

      <div className="mt-3 space-y-1.5">
        {listLoading ? (
          <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> 불러오는 중...
          </div>
        ) : bgms.length === 0 ? (
          <p className="rounded-lg border border-dashed border-muted-foreground px-3 py-4 text-center text-xs text-muted-foreground">
            등록된 BGM 이 없어요.
          </p>
        ) : (
          bgms.map((item) => {
            const sel = item.filename === filename;
            return (
              <div
                key={item.filename}
                className={cn(
                  "flex items-center gap-2 rounded-lg border px-2.5 py-2",
                  sel ? "border-primary bg-primary/5" : "border-border bg-background",
                )}
              >
                <button
                  type="button"
                  onClick={() => selectBgm(item)}
                  disabled={disabled}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <span
                    className={cn(
                      "flex size-6 flex-shrink-0 items-center justify-center rounded-full",
                      sel
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    <Music className="h-3 w-3" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">
                    {item.filename}
                  </span>
                  <span className="text-[0.7rem] text-muted-foreground">
                    {formatTime(item.duration)}
                  </span>
                </button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleDelete(item)}
                  disabled={disabled}
                  aria-label="BGM 삭제"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            );
          })
        )}
      </div>

      {selected && (
        <div className="mt-3 grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">시작 지점</Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatTime(startSec)}
            </span>
          </div>
          <Slider
            min={0}
            max={Math.max(1, Math.floor(selected.duration))}
            step={0.1}
            value={startSec}
            disabled={disabled}
            onValueChange={(v) => onChange({ bgmStartSec: v })}
          />
        </div>
      )}

      <div className="mt-3 grid gap-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs">볼륨</Label>
          <span className="text-xs tabular-nums text-muted-foreground">{volume}%</span>
        </div>
        <Slider
          min={0}
          max={50}
          step={1}
          value={volume}
          disabled={disabled}
          onValueChange={(v) => onChange({ bgmVolume: v })}
        />
      </div>
        </>
      )}
    </div>
  );
}

/** 선택된 BGM 파일의 프록시 경유 재생 URL(<audio> src 용). */
export function bgmAudioUrl(item: BgmItem): string {
  return ytUrl(item.url);
}
