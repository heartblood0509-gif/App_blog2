"use client";

// AI 제공자(Gemini / ChatGPT) 전역 토글 패널.
//   - 토글로 활성 제공자를 고른다. 글·제목·분석·이미지가 모두 그 제공자를 따른다.
//   - ChatGPT 모드일 때만 텍스트 모델(gpt-5.4-mini / gpt-5.5) 드롭다운을 노출.
//     이미지 모델은 gpt-image-2 고정.
//   - Gemini 키는 기존 ApiKeyPanel 이 담당. 여기선 OpenAI 키만 입력/저장/삭제.
//
// 저장 경로(ApiKeyPanel 과 동일 패턴):
//   - 웹(Next dev): POST/DELETE /api/settings/{ai-provider,openai-key} → .local 파일, 즉시 적용
//   - Electron: settings IPC(setAiProvider/setOpenAIKey) → settings.json, 재시작 후 적용

import { useEffect, useState } from "react";
import { Bot, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const OPENAI_KEYS_URL = "https://platform.openai.com/api-keys";

type Provider = "gemini" | "openai";
type TextModel = "gpt-5.4-mini" | "gpt-5.5";
type KeySrc = "local-file" | "env" | "none" | null;

interface AiProviderPanelProps {
  className?: string;
}

export function AiProviderPanel({ className }: AiProviderPanelProps) {
  const [provider, setProvider] = useState<Provider>("gemini");
  const [textModel, setTextModel] = useState<TextModel>("gpt-5.5");
  const [hasKey, setHasKey] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [keySource, setKeySource] = useState<KeySrc>(null);
  const [plaintext, setPlaintext] = useState("");
  const [saving, setSaving] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isWebMode, setIsWebMode] = useState(false);

  useEffect(() => {
    const api = window.electronAPI?.settings;
    if (!api) {
      setIsWebMode(true);
      Promise.all([
        fetch("/api/settings/ai-provider", { cache: "no-store" }).then(
          (r) => r.json() as Promise<{ provider: Provider; openaiTextModel: TextModel }>
        ),
        fetch("/api/settings/openai-key", { cache: "no-store" }).then(
          (r) =>
            r.json() as Promise<{
              hasKey: boolean;
              masked: string | null;
              source: "local-file" | "env" | "none";
            }>
        ),
      ])
        .then(([cfg, key]) => {
          setProvider(cfg.provider);
          setTextModel(cfg.openaiTextModel);
          setHasKey(key.hasKey);
          setMasked(key.masked);
          setKeySource(key.source);
        })
        .catch(() => {
          /* 라우트 실패 시 기본값(Gemini) 유지 */
        })
        .finally(() => setLoading(false));
      return;
    }
    Promise.all([api.getAiProvider(), api.getOpenAIMasked()])
      .then(([cfg, key]) => {
        setProvider(cfg.provider);
        setTextModel(cfg.openaiTextModel);
        setHasKey(key.hasKey);
        setMasked(key.masked);
      })
      .finally(() => setLoading(false));
  }, []);

  const openKeyPage = () => {
    if (window.electronAPI?.auth) {
      window.electronAPI.auth.openExternal(OPENAI_KEYS_URL);
    } else {
      window.open(OPENAI_KEYS_URL, "_blank", "noopener");
    }
  };

  // 토글/모델 변경 — 즉시 저장. Electron 은 재시작 후 적용.
  const applyConfig = async (partial: {
    provider?: Provider;
    openaiTextModel?: TextModel;
  }) => {
    setSwitching(true);
    try {
      const api = window.electronAPI?.settings;
      if (!api) {
        const res = await fetch("/api/settings/ai-provider", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(partial),
        });
        const r = (await res.json()) as {
          ok?: boolean;
          error?: string;
          provider?: Provider;
          openaiTextModel?: TextModel;
        };
        if (!res.ok || !r.ok) {
          toast.error(r.error || "변경에 실패했습니다.");
          return;
        }
        if (r.provider) setProvider(r.provider);
        if (r.openaiTextModel) setTextModel(r.openaiTextModel);
        toast.success(
          partial.provider
            ? `이제 ${partial.provider === "openai" ? "ChatGPT" : "Gemini"} 모드로 생성합니다.`
            : "모델이 변경되었습니다."
        );
        return;
      }
      // 모드·모델은 userData 파일에 즉시 기록되고 Next 가 매 요청 읽으므로 재시작 불필요.
      const r = await api.setAiProvider(partial);
      if (!r.ok) {
        toast.error("변경에 실패했습니다.");
        return;
      }
      setProvider(r.provider);
      setTextModel(r.openaiTextModel);
      toast.success(
        partial.provider
          ? `이제 ${partial.provider === "openai" ? "ChatGPT" : "Gemini"} 모드로 생성합니다.`
          : "모델이 변경되었습니다."
      );
    } finally {
      setSwitching(false);
    }
  };

  const saveKey = async () => {
    if (!plaintext) {
      toast.error("OpenAI API 키를 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      const api = window.electronAPI?.settings;
      if (!api) {
        const res = await fetch("/api/settings/openai-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ plaintext }),
        });
        const r = (await res.json()) as {
          ok: boolean;
          error?: string;
          masked?: string | null;
          source?: "local-file" | "env" | "none";
        };
        if (!res.ok || !r.ok) {
          toast.error(r.error || "저장에 실패했습니다.");
          return;
        }
        setPlaintext("");
        setHasKey(true);
        if (r.masked !== undefined) setMasked(r.masked);
        if (r.source) setKeySource(r.source);
        toast.success("저장되었습니다. ChatGPT 모드에서 이 키가 사용됩니다.");
        return;
      }
      const r = await api.setOpenAIKey(plaintext);
      if (!r.encryption_available) {
        toast.error("이 PC 에서 암호화 기능을 사용할 수 없습니다.");
        return;
      }
      if (!r.ok) {
        toast.error("저장에 실패했습니다.");
        return;
      }
      setPlaintext("");
      setHasKey(true);
      toast.success("저장되었습니다. 재시작 후 적용됩니다.");
      if (window.confirm("지금 앱을 재시작할까요?")) {
        await window.electronAPI?.app.relaunch();
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteKey = async () => {
    const api = window.electronAPI?.settings;
    if (!api) {
      const res = await fetch("/api/settings/openai-key", {
        method: "DELETE",
        cache: "no-store",
      });
      const r = (await res.json()) as {
        ok: boolean;
        hasKey?: boolean;
        masked?: string | null;
        source?: "local-file" | "env" | "none";
      };
      if (r.ok) {
        setHasKey(!!r.hasKey);
        setMasked(r.masked ?? null);
        if (r.source) setKeySource(r.source);
        toast.success("삭제되었습니다.");
      }
      return;
    }
    const r = await api.setOpenAIKey(""); // 빈 문자열 = 삭제
    if (r.ok) {
      setHasKey(false);
      setMasked(null);
      toast.success("삭제되었습니다. 재시작 후 적용됩니다.");
    }
  };

  const isOpenAI = provider === "openai";

  return (
    <Card className={cn("mx-auto max-w-lg border-l-4 border-l-primary bg-card shadow-sm", className)}>
      <CardHeader className="border-b bg-primary/[0.045] px-5 py-4">
        <CardTitle className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bot className="h-4 w-4" />
          </span>
          AI 제공자
        </CardTitle>
        <CardDescription className="pl-10">
          글·이미지 생성에 Gemini 와 ChatGPT 중 무엇을 쓸지 고릅니다. 블로그 글 생성에만
          적용됩니다 — 유튜브 영상·쇼츠는 별개입니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pt-4">
        {/* 제공자 토글 */}
        <div className="space-y-2">
          <div className="text-sm font-medium">제공자 선택</div>
          <div className="inline-flex gap-1 rounded-lg border p-1">
            <Button
              type="button"
              size="sm"
              variant={!isOpenAI ? "default" : "ghost"}
              onClick={() => !isOpenAI || switching ? undefined : applyConfig({ provider: "gemini" })}
              disabled={switching || loading}
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" /> Gemini 모드
            </Button>
            <Button
              type="button"
              size="sm"
              variant={isOpenAI ? "default" : "ghost"}
              onClick={() => isOpenAI || switching ? undefined : applyConfig({ provider: "openai" })}
              disabled={switching || loading}
            >
              <Bot className="mr-1 h-3.5 w-3.5" /> ChatGPT 모드
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            현재 사용 중: <span className="font-semibold text-foreground">{isOpenAI ? "ChatGPT" : "Gemini"} 모드</span>
          </div>
        </div>

        {/* ChatGPT 모드 전용: 텍스트 모델 + 이미지 안내 + 키 */}
        {isOpenAI && (
          <div className="space-y-4 rounded-md border bg-muted/20 p-3">
            <div className="space-y-1.5">
              <label htmlFor="openai-text-model" className="text-sm font-medium">
                텍스트 모델
              </label>
              <select
                id="openai-text-model"
                value={textModel}
                onChange={(e) => applyConfig({ openaiTextModel: e.target.value as TextModel })}
                disabled={switching || loading}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:opacity-50"
              >
                <option value="gpt-5.4-mini">gpt-5.4-mini (빠르고 저렴)</option>
                <option value="gpt-5.5">gpt-5.5 (고품질)</option>
              </select>
              <div className="text-xs text-muted-foreground">
                이미지 모델은 <span className="font-mono">gpt-image-2</span> 로 고정됩니다.
              </div>
            </div>

            {!loading && !hasKey && (
              <div className="rounded-md border border-amber-400/40 bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                ChatGPT 모드로 설정됐지만 OpenAI 키가 없습니다. 아래에서 등록하세요.
              </div>
            )}

            {hasKey && masked && (
              <div className="text-sm text-muted-foreground">
                저장된 OpenAI 키: <span className="font-mono">{masked}</span>
                {isWebMode && keySource === "env" && (
                  <span className="ml-2 inline-flex items-center rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-900 dark:bg-sky-900/40 dark:text-sky-100">
                    환경 파일(.env)
                  </span>
                )}
                <button
                  type="button"
                  onClick={deleteKey}
                  className="ml-2 text-xs text-destructive underline underline-offset-2 hover:opacity-80"
                >
                  지우기
                </button>
              </div>
            )}

            <div className="space-y-2">
              <label htmlFor="openai-api-key" className="text-sm font-medium">
                {hasKey ? "새 OpenAI 키로 변경" : "OpenAI API 키"}
              </label>
              <Input
                id="openai-api-key"
                type="password"
                placeholder="sk-..."
                value={plaintext}
                onChange={(e) => setPlaintext(e.target.value)}
                disabled={saving}
              />
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={openKeyPage}
                  className="text-xs text-primary underline underline-offset-2 hover:opacity-80"
                >
                  OpenAI 키 발급 (platform.openai.com)
                </button>
                <Button onClick={saveKey} disabled={saving || !plaintext} size="sm">
                  {saving ? "저장 중..." : isWebMode ? "저장" : "저장 + 재시작"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
