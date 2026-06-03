"use client";

// API 키 설정(스텝 외 화면). 유튜브 백엔드는 키를 DB 에서 읽으므로, 여기서 저장하면 재시작 없이 즉시 반영된다.
// M1 최소 경로 — Card A E2E(제목 생성부터) 전에 최소 Gemini 키가 있어야 함. 풀 통합(블로그 설정/Electron)은 M4.

import { useEffect, useState } from "react";
import { ArrowLeft, Check, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useYt } from "../state";
import {
  getApiKeys,
  updateApiKeys,
  type ApiKeysStatus,
} from "@/lib/youtube/endpoints";

const FIELDS = [
  {
    key: "gemini",
    field: "gemini_api_key",
    label: "Gemini API 키",
    hint: "제목·나레이션·이미지 생성에 필요 (필수)",
  },
  {
    key: "typecast",
    field: "typecast_api_key",
    label: "Typecast API 키",
    hint: "음성(TTS) 생성에 필요",
  },
  {
    key: "fal",
    field: "fal_key",
    label: "FAL API 키",
    hint: "일부 영상 모드(클립 생성)에 필요",
  },
] as const;

type FieldName = (typeof FIELDS)[number]["field"];

const EMPTY: Record<FieldName, string> = {
  gemini_api_key: "",
  typecast_api_key: "",
  fal_key: "",
};

function errMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}

export function ApiKeysScreen() {
  const { update } = useYt();
  const [status, setStatus] = useState<ApiKeysStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [values, setValues] = useState<Record<FieldName, string>>(EMPTY);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setStatus(await getApiKeys());
    } catch (e) {
      toast.error(errMessage(e, "키 상태를 불러오지 못했습니다."));
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
      toast.success("API 키를 저장했어요.");
      setValues(EMPTY);
      await load();
    } catch (e) {
      toast.error(errMessage(e, "저장에 실패했습니다."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">API 키 설정</h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => update({ screen: "mode" })}
          className="gap-1.5"
        >
          <ArrowLeft className="h-4 w-4" />
          뒤로
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        영상 생성에는 외부 AI 서비스 키가 필요해요. 입력한 키는 로컬 백엔드에 암호화되어 저장되고,
        재시작 없이 바로 적용됩니다.
      </p>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중...
        </div>
      ) : (
        <div className="mt-5 space-y-5">
          {FIELDS.map((f) => {
            const set = status?.[f.key];
            return (
              <div key={f.field} className="grid gap-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor={`yt-key-${f.key}`}>{f.label}</Label>
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
                />
                <p className="text-xs text-muted-foreground">{f.hint}</p>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={saving || loading} className="gap-2">
          {saving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <KeyRound className="h-4 w-4" />
          )}
          저장
        </Button>
      </div>
    </div>
  );
}
