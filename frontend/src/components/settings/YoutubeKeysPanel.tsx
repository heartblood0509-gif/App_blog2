"use client";

// 유튜브 쇼츠 전용 API 키(Typecast·FAL) 설정 패널 — 블로그 설정 화면에 배치.
// Gemini 는 위 ApiKeyPanel 이 단일 입력처(블로그+유튜브 공유)라 여기선 다루지 않는다.
// 유튜브 로컬 백엔드는 키를 DB 에서 읽으므로, 여기서 저장하면 재시작 없이 즉시 반영된다
// (저장 = 프록시 PUT /api/youtube/api/auth/api-keys → 외부 검증 후 DB 갱신).
//
// M4a: 유튜브 탭 안에 있던 임시 키 화면(ApiKeysScreen)을 이 패널로 흡수해 설정을 한 곳으로 모았다.

import { useEffect, useState } from "react";
import { Check, KeyRound, Loader2, Music, Video } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getApiKeys,
  updateApiKeys,
  type ApiKeysStatus,
} from "@/lib/youtube/endpoints";

const FIELDS = [
  {
    key: "typecast",
    field: "typecast_api_key",
    label: "Typecast API 키",
    hint: "나레이션 음성(TTS) 생성에 필요해요.",
    url: "https://typecast.ai",
  },
  {
    key: "fal",
    field: "fal_key",
    label: "FAL API 키 (선택)",
    hint: "일부 영상 모드(AI 클립)에만 필요해요. 없어도 기본 영상은 만들 수 있어요.",
    url: "https://fal.ai/dashboard/keys",
  },
] as const;

type FieldName = (typeof FIELDS)[number]["field"];
type FieldKey = (typeof FIELDS)[number]["key"];

const EMPTY: Record<FieldName, string> = {
  typecast_api_key: "",
  fal_key: "",
};

function errMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

function openKeyUrl(url: string) {
  const ext = window.electronAPI?.auth?.openExternal;
  if (ext) void ext(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

interface YoutubeKeysPanelProps {
  className?: string;
}

export function YoutubeKeysPanel({ className }: YoutubeKeysPanelProps) {
  const [status, setStatus] = useState<ApiKeysStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [values, setValues] = useState<Record<FieldName, string>>(EMPTY);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setStatus(await getApiKeys());
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleClear(field: FieldName) {
    if (saving) return;
    setSaving(true);
    try {
      await updateApiKeys({ [field]: "" });
      toast.success("키를 지웠어요.");
      setValues((v) => ({ ...v, [field]: "" }));
      await load();
    } catch (e) {
      toast.error(errMessage(e, "삭제에 실패했습니다."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSave() {
    const payload: Record<string, string> = {};
    for (const f of FIELDS) {
      const v = values[f.field].trim();
      if (v) payload[f.field] = v;
    }
    if (Object.keys(payload).length === 0) {
      toast.error("입력한 키가 없어요.");
      return;
    }
    setSaving(true);
    try {
      await updateApiKeys(payload);
      toast.success("저장되었습니다. 재시작 없이 바로 적용돼요.");
      setValues(EMPTY);
      await load();
    } catch (e) {
      toast.error(errMessage(e, "저장에 실패했습니다. (키가 올바른지 확인해주세요)"));
    } finally {
      setSaving(false);
    }
  }

  const Icon = { typecast: Music, fal: Video } as const;

  return (
    <Card
      className={cn(
        "mx-auto max-w-lg border-l-4 border-l-primary bg-card shadow-sm",
        className,
      )}
    >
      <CardHeader className="border-b bg-primary/[0.045] px-5 py-4">
        <CardTitle className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <KeyRound className="h-4 w-4" />
          </span>
          유튜브 쇼츠 전용 키
        </CardTitle>
        <CardDescription className="pl-10">
          음성·영상 생성을 위한 추가 키입니다. Gemini 키는 위에서 설정한 것을 함께 사용하니
          여기엔 입력하지 않아도 돼요.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5 px-5 pt-4">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중...
          </div>
        ) : loadError ? (
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            유튜브 백엔드에 연결할 수 없어 키 상태를 불러오지 못했어요. 앱을 다시 실행한 뒤
            열어주세요.
          </div>
        ) : (
          <>
            {FIELDS.map((f) => {
              const set = status?.[f.key as FieldKey];
              const FieldIcon = Icon[f.key as FieldKey];
              return (
                <div key={f.field} className="grid gap-1.5">
                  <div className="flex items-center justify-between">
                    <Label
                      htmlFor={`yt-key-${f.key}`}
                      className="flex items-center gap-1.5"
                    >
                      <FieldIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      {f.label}
                    </Label>
                    {set ? (
                      <span className="flex items-center gap-2 text-xs">
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <Check className="h-3 w-3" /> 설정됨 ({set})
                        </span>
                        <button
                          type="button"
                          onClick={() => handleClear(f.field)}
                          disabled={saving}
                          className="text-muted-foreground underline-offset-2 hover:text-destructive hover:underline disabled:opacity-50"
                        >
                          지우기
                        </button>
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">미설정</span>
                    )}
                  </div>
                  <Input
                    id={`yt-key-${f.key}`}
                    type="password"
                    autoComplete="off"
                    placeholder={set ? "새 키 입력 시 교체" : "키 입력"}
                    value={values[f.field]}
                    onChange={(e) =>
                      setValues((v) => ({ ...v, [f.field]: e.target.value }))
                    }
                    disabled={saving}
                  />
                  <p className="text-xs text-muted-foreground">
                    {f.hint}{" "}
                    <button
                      type="button"
                      onClick={() => openKeyUrl(f.url)}
                      className="text-primary underline underline-offset-2 hover:opacity-80"
                    >
                      키 발급 →
                    </button>
                  </p>
                </div>
              );
            })}

            <div className="flex justify-end">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                저장
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
