"use client";

// AI 생성 설정 허브 — 글/이미지 provider 토글 + 블로그용 추가 키(OpenAI·fal) 입력.
//   - 글·제목 토글(provider)과 이미지 토글(imageProvider)을 "독립적으로" 고른다.
//     · 글=Gemini/ChatGPT, 이미지=Gemini/ChatGPT 를 따로 선택 가능.
//   - 이미지=Gemini 면 fal 키가 있을 때 fal(같은 Gemini 모델·429 회피), 없으면 Gemini 직접 폴백.
//   - 이미지=ChatGPT 면 gpt-image-2.
//   - 키는 "한 번만 입력"하도록 모두 노출(사용처 라벨 부착). Gemini 키는 위 ApiKeyPanel 담당.
//
// 마이그레이션(코덱스 High ①): imageProvider 미설정이면 글 provider 를 따른다(?? provider).
//   분리 전부터 ChatGPT 로 이미지를 쓰던 사용자 동작 보존. 사용자가 이미지 토글을 만지기 전엔
//   "글 토글을 따라" 표시가 같이 움직이고, 한 번 만지면 그때부터 독립(서버에 명시 저장).
//
// 저장 경로:
//   - 웹(Next dev): POST /api/settings/{ai-provider,openai-key,fal-key} → .local 파일, 즉시 적용
//   - Electron: settings IPC(setAiProvider/setOpenAIKey/setFalKey) → settings.json, 재시작 후 적용
//   - fal 키는 저장 시 유튜브 로컬 백엔드에도 best-effort 반영(블로그+유튜브 공용 키).

import { useEffect, useState, type ReactNode } from "react";
import { Bot, ImageIcon, KeyRound, Sparkles } from "lucide-react";
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
import { updateApiKeys } from "@/lib/youtube/endpoints";

const OPENAI_KEYS_URL = "https://platform.openai.com/api-keys";
const FAL_KEYS_URL = "https://fal.ai/dashboard/keys";

// ChatGPT(OpenAI) 글·이미지 생성은 아직 품질·검증 미완 → 토글을 "준비 중"으로 비활성.
// 준비되면 이 플래그만 true 로 → 버튼·자동정리 로직이 함께 원복된다.
// (`: boolean` 명시로 항상-false 상수 폴딩에 의한 lint/unreachable 경고를 피한다.)
const CHATGPT_ENABLED: boolean = false;

type Provider = "gemini" | "openai";
type TextModel = "gpt-5.4-mini" | "gpt-5.5";
type KeySrc = "local-file" | "env" | "none" | null;

// 로드된 설정 → 화면 표시값 + (필요 시) 무토스트 정리 partial.
// CHATGPT 비활성 동안엔 화면을 항상 gemini 로 두고, 저장된 openai 는 gemini 로 정리한다.
function resolveProviders(cfg: { provider: Provider; imageProvider?: Provider }): {
  provider: Provider;
  imageProvider: Provider;
  imageExplicit: boolean;
  cleanup: { provider?: Provider; imageProvider?: Provider } | null;
} {
  const imageExplicit = cfg.imageProvider != null;
  if (CHATGPT_ENABLED) {
    return {
      provider: cfg.provider,
      imageProvider: cfg.imageProvider ?? cfg.provider,
      imageExplicit,
      cleanup: null,
    };
  }
  const cleanup: { provider?: Provider; imageProvider?: Provider } = {};
  if (cfg.provider === "openai") cleanup.provider = "gemini";
  if (cfg.imageProvider === "openai") cleanup.imageProvider = "gemini";
  return {
    provider: "gemini",
    imageProvider: "gemini",
    imageExplicit,
    cleanup: cleanup.provider || cleanup.imageProvider ? cleanup : null,
  };
}

// ChatGPT 비활성 동안 저장된 openai → gemini 로 조용히 정리(토스트·재시작 없음).
// 웹=POST, Electron=IPC. 실패해도 화면은 gemini 로 표시되고 다음 로드에서 재시도.
async function persistProviderCleanup(partial: {
  provider?: Provider;
  imageProvider?: Provider;
}): Promise<void> {
  try {
    const api = window.electronAPI?.settings;
    if (!api) {
      await fetch("/api/settings/ai-provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify(partial),
      });
    } else {
      await api.setAiProvider(partial);
    }
  } catch {
    /* 정리 실패 무시 — 표시는 이미 gemini */
  }
}

// 같은 fal 키를 유튜브 로컬 백엔드에도 즉시 반영(best-effort). 백엔드 미가동 시 조용히 넘어간다.
async function pushFalToYoutube(key: string): Promise<void> {
  try {
    await updateApiKeys({ fal_key: key });
  } catch {
    // 유튜브 백엔드 미가동 등 — 블로그 저장은 그대로 유지.
  }
}

interface AiProviderPanelProps {
  className?: string;
}

export function AiProviderPanel({ className }: AiProviderPanelProps) {
  const [provider, setProvider] = useState<Provider>("gemini");
  const [imageProvider, setImageProvider] = useState<Provider>("gemini");
  // 이미지 provider 가 서버에 "명시 저장"됐는지. false 면 글 provider 를 따라 표시가 움직인다.
  const [imageExplicit, setImageExplicit] = useState(false);
  const [textModel, setTextModel] = useState<TextModel>("gpt-5.5");

  // OpenAI 키 상태
  const [hasKey, setHasKey] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [keySource, setKeySource] = useState<KeySrc>(null);
  const [plaintext, setPlaintext] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  // fal 키 상태
  const [falHasKey, setFalHasKey] = useState(false);
  const [falMasked, setFalMasked] = useState<string | null>(null);
  const [falPlaintext, setFalPlaintext] = useState("");
  const [savingFal, setSavingFal] = useState(false);

  const [switching, setSwitching] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isWebMode, setIsWebMode] = useState(false);

  useEffect(() => {
    const api = window.electronAPI?.settings;
    if (!api) {
      setIsWebMode(true);
      Promise.all([
        fetch("/api/settings/ai-provider", { cache: "no-store" }).then(
          (r) =>
            r.json() as Promise<{
              provider: Provider;
              imageProvider?: Provider;
              openaiTextModel: TextModel;
            }>
        ),
        fetch("/api/settings/openai-key", { cache: "no-store" }).then(
          (r) =>
            r.json() as Promise<{
              hasKey: boolean;
              masked: string | null;
              source: "local-file" | "env" | "none";
            }>
        ),
        fetch("/api/settings/fal-key", { cache: "no-store" }).then(
          (r) =>
            r.json() as Promise<{
              hasKey: boolean;
              masked: string | null;
              source: "local-file" | "env" | "none";
            }>
        ),
      ])
        .then(([cfg, oa, fl]) => {
          const rp = resolveProviders(cfg);
          setProvider(rp.provider);
          setImageProvider(rp.imageProvider);
          setImageExplicit(rp.imageExplicit);
          setTextModel(cfg.openaiTextModel);
          setHasKey(oa.hasKey);
          setMasked(oa.masked);
          setKeySource(oa.source);
          setFalHasKey(fl.hasKey);
          setFalMasked(fl.masked);
          if (rp.cleanup) void persistProviderCleanup(rp.cleanup);
        })
        .catch(() => {
          /* 라우트 실패 시 기본값(Gemini) 유지 */
        })
        .finally(() => setLoading(false));
      return;
    }
    Promise.all([
      api.getAiProvider(),
      api.getOpenAIMasked(),
      api.getFalMasked?.(),
    ])
      .then(([cfg, oa, fl]) => {
        const rp = resolveProviders(cfg);
        setProvider(rp.provider);
        setImageProvider(rp.imageProvider);
        setImageExplicit(rp.imageExplicit);
        setTextModel(cfg.openaiTextModel);
        setHasKey(oa.hasKey);
        setMasked(oa.masked);
        if (fl) {
          setFalHasKey(fl.hasKey);
          setFalMasked(fl.masked);
        }
        if (rp.cleanup) void persistProviderCleanup(rp.cleanup);
      })
      .finally(() => setLoading(false));
  }, []);

  const openExternal = (url: string) => {
    if (window.electronAPI?.auth) {
      window.electronAPI.auth.openExternal(url);
    } else {
      window.open(url, "_blank", "noopener");
    }
  };

  // 토글/모델 변경 — 즉시 저장. Electron 은 재시작 없이 파일로 즉시 반영(provider/모델 한정).
  const applyConfig = async (partial: {
    provider?: Provider;
    imageProvider?: Provider;
    openaiTextModel?: TextModel;
  }) => {
    setSwitching(true);
    try {
      const api = window.electronAPI?.settings;
      let result: {
        ok?: boolean;
        error?: string;
        provider?: Provider;
        imageProvider?: Provider;
        openaiTextModel?: TextModel;
      };
      if (!api) {
        const res = await fetch("/api/settings/ai-provider", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(partial),
        });
        result = await res.json();
        if (!res.ok || !result.ok) {
          toast.error(result.error || "변경에 실패했습니다.");
          return;
        }
      } else {
        const r = await api.setAiProvider(partial);
        if (!r.ok) {
          toast.error("변경에 실패했습니다.");
          return;
        }
        result = r;
      }

      if (result.provider) {
        setProvider(result.provider);
        // 이미지를 아직 명시하지 않았고 이번에 글 provider 만 바꿨다면, 이미지 표시도 따라 움직인다.
        if (!imageExplicit && partial.imageProvider === undefined) {
          setImageProvider(result.provider);
        }
      }
      if (result.imageProvider) {
        setImageProvider(result.imageProvider);
        setImageExplicit(true);
      }
      if (result.openaiTextModel) setTextModel(result.openaiTextModel);

      toast.success(
        partial.imageProvider
          ? `이미지를 ${partial.imageProvider === "openai" ? "ChatGPT" : "Gemini"} 로 생성합니다.`
          : partial.provider
            ? `글·제목을 ${partial.provider === "openai" ? "ChatGPT" : "Gemini"} 로 생성합니다.`
            : "모델이 변경되었습니다."
      );
    } finally {
      setSwitching(false);
    }
  };

  // ── OpenAI 키 저장/삭제 ──
  const saveOpenAIKey = async () => {
    if (!plaintext) {
      toast.error("OpenAI API 키를 입력해주세요.");
      return;
    }
    setSavingKey(true);
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
      setSavingKey(false);
    }
  };

  const deleteOpenAIKey = async () => {
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
    const r = await api.setOpenAIKey("");
    if (r.ok) {
      setHasKey(false);
      setMasked(null);
      toast.success("삭제되었습니다. 재시작 후 적용됩니다.");
    }
  };

  // ── fal 키 저장/삭제 ──
  const saveFalKey = async () => {
    if (!falPlaintext) {
      toast.error("fal API 키를 입력해주세요.");
      return;
    }
    setSavingFal(true);
    try {
      const api = window.electronAPI?.settings;
      if (!api) {
        const res = await fetch("/api/settings/fal-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ plaintext: falPlaintext }),
        });
        const r = (await res.json()) as {
          ok: boolean;
          error?: string;
          masked?: string | null;
        };
        if (!res.ok || !r.ok) {
          toast.error(r.error || "저장에 실패했습니다.");
          return;
        }
        const saved = falPlaintext;
        setFalPlaintext("");
        setFalHasKey(true);
        if (r.masked !== undefined) setFalMasked(r.masked);
        await pushFalToYoutube(saved);
        toast.success("저장되었습니다. 이미지 생성 시 fal 이 사용됩니다.");
        return;
      }
      const r = await api.setFalKey(falPlaintext);
      if (!r.encryption_available) {
        toast.error("이 PC 에서 암호화 기능을 사용할 수 없습니다.");
        return;
      }
      if (!r.ok) {
        toast.error("저장에 실패했습니다.");
        return;
      }
      const saved = falPlaintext;
      setFalPlaintext("");
      setFalHasKey(true);
      await pushFalToYoutube(saved);
      toast.success("저장되었습니다. 재시작 후 적용됩니다.");
      if (window.confirm("지금 앱을 재시작할까요?")) {
        await window.electronAPI?.app.relaunch();
      }
    } finally {
      setSavingFal(false);
    }
  };

  const deleteFalKey = async () => {
    const api = window.electronAPI?.settings;
    if (!api) {
      const res = await fetch("/api/settings/fal-key", {
        method: "DELETE",
        cache: "no-store",
      });
      const r = (await res.json()) as {
        ok: boolean;
        hasKey?: boolean;
        masked?: string | null;
      };
      if (r.ok) {
        setFalHasKey(!!r.hasKey);
        setFalMasked(r.masked ?? null);
        await pushFalToYoutube("");
        toast.success("삭제되었습니다.");
      }
      return;
    }
    const r = await api.setFalKey("");
    if (r.ok) {
      setFalHasKey(false);
      setFalMasked(null);
      await pushFalToYoutube("");
      toast.success("삭제되었습니다. 재시작 후 적용됩니다.");
    }
  };

  const isOpenAIText = provider === "openai";
  const isOpenAIImage = imageProvider === "openai";
  const saveLabel = (saving: boolean) =>
    saving ? "저장 중..." : isWebMode ? "저장" : "저장 + 재시작";

  return (
    <Card
      className={cn(
        "mx-auto max-w-lg border-l-4 border-l-primary bg-card shadow-sm",
        className
      )}
    >
      <CardHeader className="border-b bg-primary/[0.045] px-5 py-4">
        <CardTitle className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Bot className="h-4 w-4" />
          </span>
          AI 생성 방식 & 추가 키
        </CardTitle>
        <CardDescription className="pl-10">
          {CHATGPT_ENABLED ? (
            "글·제목과 이미지를 각각 Gemini / ChatGPT 중 무엇으로 만들지 고르고, 필요한 키를 입력합니다. 블로그 글 생성에 적용됩니다."
          ) : (
            <>
              글·제목과 이미지 생성에 필요한 키를 입력합니다. 블로그 글 생성에 적용됩니다.{" "}
              <span className="text-muted-foreground">
                (ChatGPT 생성은 준비 중 — 지금은 Gemini 로 동작합니다.)
              </span>
            </>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 px-5 pt-4">
        {/* ── 키 입력 (OpenAI · fal). Gemini 키는 위 카드에서 입력. ── */}
        <div className="space-y-4">
          <div className="text-sm font-semibold">API 키</div>

          {/* OpenAI 키 */}
          <KeyField
            icon={<Bot className="h-3.5 w-3.5 text-muted-foreground" />}
            label="OpenAI(ChatGPT) API 키"
            usage="사용처: 블로그 (글·제목 또는 이미지를 ChatGPT 로 만들 때)"
            placeholder="sk-..."
            hasKey={hasKey}
            masked={masked}
            envBadge={isWebMode && keySource === "env"}
            value={plaintext}
            onChange={setPlaintext}
            onSave={saveOpenAIKey}
            onDelete={deleteOpenAIKey}
            saving={savingKey}
            saveLabel={saveLabel(savingKey)}
            issueUrl={OPENAI_KEYS_URL}
            issueLabel="OpenAI 키 발급 (platform.openai.com)"
            onIssue={() => openExternal(OPENAI_KEYS_URL)}
            loading={loading}
          />

          {/* fal 키 */}
          <KeyField
            icon={<ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />}
            label="fal API 키"
            usage="사용처: 블로그 이미지 · 유튜브 (이미지를 안정적으로 생성)"
            placeholder="키 입력"
            hasKey={falHasKey}
            masked={falMasked}
            envBadge={false}
            value={falPlaintext}
            onChange={setFalPlaintext}
            onSave={saveFalKey}
            onDelete={deleteFalKey}
            saving={savingFal}
            saveLabel={saveLabel(savingFal)}
            issueUrl={FAL_KEYS_URL}
            issueLabel="fal 키 발급 (fal.ai/dashboard/keys)"
            onIssue={() => openExternal(FAL_KEYS_URL)}
            loading={loading}
          />
        </div>

        {/* ── 글·제목 생성 provider ── */}
        <div className="space-y-2">
          <div className="text-sm font-semibold">글·제목 생성</div>
          <div className="inline-flex gap-1 rounded-lg border p-1">
            <Button
              type="button"
              size="sm"
              variant={!isOpenAIText ? "default" : "ghost"}
              onClick={() =>
                !isOpenAIText || switching
                  ? undefined
                  : applyConfig({ provider: "gemini" })
              }
              disabled={switching || loading}
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" /> Gemini
            </Button>
            <Button
              type="button"
              size="sm"
              variant={CHATGPT_ENABLED && isOpenAIText ? "default" : "ghost"}
              onClick={() =>
                !CHATGPT_ENABLED || isOpenAIText || switching
                  ? undefined
                  : applyConfig({ provider: "openai" })
              }
              disabled={!CHATGPT_ENABLED || switching || loading}
              title={CHATGPT_ENABLED ? undefined : "ChatGPT 생성 기능은 준비 중입니다"}
            >
              <Bot className="mr-1 h-3.5 w-3.5" />{" "}
              {CHATGPT_ENABLED ? "ChatGPT" : "ChatGPT 준비 중"}
            </Button>
          </div>

          {isOpenAIText && (
            <div className="space-y-1.5 rounded-md border bg-muted/20 p-3">
              <label htmlFor="openai-text-model" className="text-sm font-medium">
                ChatGPT 텍스트 모델
              </label>
              <select
                id="openai-text-model"
                value={textModel}
                onChange={(e) =>
                  applyConfig({ openaiTextModel: e.target.value as TextModel })
                }
                disabled={switching || loading}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm disabled:opacity-50"
              >
                <option value="gpt-5.4-mini">gpt-5.4-mini (빠르고 저렴)</option>
                <option value="gpt-5.5">gpt-5.5 (고품질)</option>
              </select>
              {!loading && !hasKey && (
                <div className="text-xs text-amber-700 dark:text-amber-300">
                  ChatGPT 로 글을 만들려면 위 OpenAI 키가 필요합니다.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── 이미지 생성 provider ── */}
        <div className="space-y-2">
          <div className="text-sm font-semibold">이미지 생성</div>
          <div className="inline-flex gap-1 rounded-lg border p-1">
            <Button
              type="button"
              size="sm"
              variant={!isOpenAIImage ? "default" : "ghost"}
              onClick={() =>
                !isOpenAIImage || switching
                  ? undefined
                  : applyConfig({ imageProvider: "gemini" })
              }
              disabled={switching || loading}
            >
              <Sparkles className="mr-1 h-3.5 w-3.5" /> Gemini
            </Button>
            <Button
              type="button"
              size="sm"
              variant={CHATGPT_ENABLED && isOpenAIImage ? "default" : "ghost"}
              onClick={() =>
                !CHATGPT_ENABLED || isOpenAIImage || switching
                  ? undefined
                  : applyConfig({ imageProvider: "openai" })
              }
              disabled={!CHATGPT_ENABLED || switching || loading}
              title={CHATGPT_ENABLED ? undefined : "ChatGPT 생성 기능은 준비 중입니다"}
            >
              <Bot className="mr-1 h-3.5 w-3.5" />{" "}
              {CHATGPT_ENABLED ? "ChatGPT" : "ChatGPT 준비 중"}
            </Button>
          </div>

          {/* 설명 박스 — 이미지 provider 별 동작 */}
          {isOpenAIImage ? (
            <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
              이미지는 <span className="font-mono">gpt-image-2</span> 로 생성됩니다. 위 OpenAI
              키가 필요합니다.
            </div>
          ) : (
            <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
              {falHasKey ? (
                <>
                  <span className="font-medium text-foreground">fal</span> 로 이미지를
                  생성합니다 — fal 을 통해 같은 Gemini 이미지 모델을 쓰되, 요청이 몰려도 안정적이라
                  429 오류를 피할 수 있어요. fal 에 문제가 있으면 그때는 오류로 알려드립니다(자동
                  우회 안 함).
                </>
              ) : (
                <>
                  Gemini 로 직접 이미지를 생성합니다. 위 <KeyRound className="inline h-3 w-3" />{" "}
                  <span className="font-medium text-foreground">fal 키</span>를 넣으면, 같은
                  Gemini 모델을 fal 을 통해 더 안정적으로(429 회피) 사용합니다.
                </>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// 공통 키 입력 필드 — 라벨 + 사용처 + 마스킹 상태 + 입력칸 + 저장/삭제 + 발급 링크.
function KeyField(props: {
  icon: ReactNode;
  label: string;
  usage: string;
  placeholder: string;
  hasKey: boolean;
  masked: string | null;
  envBadge: boolean;
  value: string;
  onChange: (v: string) => void;
  onSave: () => void;
  onDelete: () => void;
  saving: boolean;
  saveLabel: string;
  issueUrl: string;
  issueLabel: string;
  onIssue: () => void;
  loading: boolean;
}) {
  const {
    icon,
    label,
    usage,
    placeholder,
    hasKey,
    masked,
    envBadge,
    value,
    onChange,
    onSave,
    onDelete,
    saving,
    saveLabel,
    issueLabel,
    onIssue,
    loading,
  } = props;

  return (
    <div className="grid gap-1.5 rounded-md border bg-muted/10 p-3">
      <div className="flex items-center gap-1.5 text-sm font-medium">
        {icon}
        {label}
      </div>
      <div className="text-xs text-muted-foreground">{usage}</div>

      {!loading && hasKey && masked && (
        <div className="text-xs text-muted-foreground">
          저장된 키: <span className="font-mono">{masked}</span>
          {envBadge && (
            <span className="ml-2 inline-flex items-center rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-900 dark:bg-sky-900/40 dark:text-sky-100">
              환경 파일(.env)
            </span>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="ml-2 text-destructive underline underline-offset-2 hover:opacity-80"
          >
            지우기
          </button>
        </div>
      )}

      <Input
        type="password"
        autoComplete="off"
        placeholder={hasKey ? "새 키 입력 시 교체" : placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={saving}
      />
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onIssue}
          className="text-xs text-primary underline underline-offset-2 hover:opacity-80"
        >
          {issueLabel}
        </button>
        <Button onClick={onSave} disabled={saving || !value} size="sm">
          {saveLabel}
        </Button>
      </div>
    </div>
  );
}
