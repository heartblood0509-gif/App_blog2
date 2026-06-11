"use client";

// "AI 생성에 필요한 키" 통합 패널 — Gemini(필수) / fal(강력 권장) / Typecast(필수·쇼츠 전용)
// 를 한 카드에 키별 행으로 모은다. 회사별·그룹별로 쪼개던 기존 3패널(ApiKeyPanel·AiProviderPanel·
// YoutubeKeysPanel)을 대체한다.
//
// 표시 규칙:
//   - Gemini·fal 은 블로그·쇼츠 공용 → 항상 1행씩(중복 입력칸 없음).
//   - Typecast 행은 쇼츠 구매자(youtubeAllowed)에게만.
//   - ChatGPT(OpenAI) 토글·키·모델선택은 CHATGPT_ENABLED=false 동안 비표시(출시되면 복귀).
//
// 저장 흐름은 기존 검증된 로직을 그대로 이식했다:
//   - Gemini : web POST /api/settings/gemini-key | Electron settings.setGeminiKey + youtube push
//   - fal    : web POST /api/settings/fal-key   | Electron settings.setFalKey   + youtube push
//   - Typecast: youtube 백엔드 PUT(updateApiKeys) + Electron settings.setTypecastKey(부팅 시드)

import { useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ImageIcon,
  KeyRound,
  Mic,
  Sparkles,
} from "lucide-react";
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
import { getApiKeys, updateApiKeys } from "@/lib/youtube/endpoints";

const AISTUDIO_URL = "https://aistudio.google.com/";
const FAL_KEYS_URL = "https://fal.ai/dashboard/keys";
const TYPECAST_URL = "https://typecast.ai";

type KeySource = "local-file" | "env" | "none" | null;

// 같은 키를 유튜브 로컬 백엔드에도 즉시 반영(best-effort). 백엔드 미가동 시 조용히 넘어간다.
async function pushGeminiToYoutube(key: string): Promise<void> {
  try {
    await updateApiKeys({ gemini_api_key: key });
  } catch {
    /* 유튜브 백엔드 미가동 등 — 무시 */
  }
}
async function pushFalToYoutube(key: string): Promise<void> {
  try {
    await updateApiKeys({ fal_key: key });
  } catch {
    /* 무시 */
  }
}

interface AiKeysPanelProps {
  /** 쇼츠 구매자 여부 — true 일 때만 Typecast 행을 보여준다. */
  youtubeAllowed: boolean;
  className?: string;
}

export function AiKeysPanel({ youtubeAllowed, className }: AiKeysPanelProps) {
  // 공통
  const [isWebMode, setIsWebMode] = useState(false);
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);

  // ── Gemini ──
  const [gHasKey, setGHasKey] = useState(false);
  const [gMasked, setGMasked] = useState<string | null>(null);
  const [gSource, setGSource] = useState<KeySource>(null);
  const [gPlain, setGPlain] = useState("");
  const [gSaving, setGSaving] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  // ── fal ──
  const [fHasKey, setFHasKey] = useState(false);
  const [fMasked, setFMasked] = useState<string | null>(null);
  const [fPlain, setFPlain] = useState("");
  const [fSaving, setFSaving] = useState(false);

  // ── Typecast (쇼츠) ──
  const [tcSet, setTcSet] = useState<string | null>(null);
  const [tcPlain, setTcPlain] = useState("");
  const [tcSaving, setTcSaving] = useState(false);
  const [tcLoadError, setTcLoadError] = useState(false);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    type ServerKeyResponse = {
      hasKey: boolean;
      masked: string | null;
      source: "local-file" | "env" | "none";
    };
    const api = window.electronAPI?.settings;

    if (!api) {
      // ── 웹(Next dev) 모드 ──
      setIsWebMode(true);
      Promise.all([
        fetch("/api/settings/gemini-key", { cache: "no-store" })
          .then((r) => r.json() as Promise<ServerKeyResponse>)
          .catch(() => null),
        fetch("/api/settings/fal-key", { cache: "no-store" })
          .then((r) => r.json() as Promise<ServerKeyResponse>)
          .catch(() => null),
      ])
        .then(([g, f]) => {
          if (g) {
            setGHasKey(g.hasKey);
            setGMasked(g.masked);
            setGSource(g.source);
          }
          if (f) {
            setFHasKey(f.hasKey);
            setFMasked(f.masked);
          }
        })
        .finally(() => setLoading(false));
    } else {
      // ── Electron 데스크톱 모드 ──
      Promise.all([api.getMasked(), api.getFalMasked()])
        .then(([g, f]) => {
          setGHasKey(g.hasKey);
          setGMasked(g.masked);
          setEncryptionAvailable(g.encryption_available);
          setFHasKey(f.hasKey);
          setFMasked(f.masked);
        })
        .finally(() => setLoading(false));
    }

    // Typecast 상태는 쇼츠 구매자에게만 — youtube 백엔드에서 로드.
    if (youtubeAllowed) {
      getApiKeys()
        .then((s) => {
          setTcSet(s.typecast);
          setTcLoadError(false);
        })
        .catch(() => setTcLoadError(true));
    }
  }, [youtubeAllowed]);

  const openExternal = (url: string) => {
    if (window.electronAPI?.auth) window.electronAPI.auth.openExternal(url);
    else window.open(url, "_blank", "noopener");
  };

  const saveLabel = (saving: boolean) =>
    saving ? "저장 중..." : isWebMode ? "저장" : "저장 + 재시작";

  // ── Gemini 저장 ──
  const saveGemini = async () => {
    if (!gPlain) {
      toast.error("Gemini API 키를 입력해주세요.");
      return;
    }
    setGSaving(true);
    try {
      const api = window.electronAPI?.settings;
      if (!api) {
        const res = await fetch("/api/settings/gemini-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ plaintext: gPlain }),
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
        const saved = gPlain;
        setGPlain("");
        setGHasKey(true);
        if (r.masked !== undefined) setGMasked(r.masked);
        if (r.source) setGSource(r.source);
        setGuideOpen(false);
        await pushGeminiToYoutube(saved);
        toast.success("저장되었습니다. 다음 생성부터 새 키가 사용됩니다.");
        return;
      }
      const r = await api.setGeminiKey(gPlain);
      if (!r.encryption_available) {
        setEncryptionAvailable(false);
        toast.error("이 PC 에서 암호화 기능을 사용할 수 없습니다.");
        return;
      }
      if (!r.ok) {
        toast.error("저장에 실패했습니다.");
        return;
      }
      const saved = gPlain;
      setGPlain("");
      setGHasKey(true);
      setGuideOpen(false);
      await pushGeminiToYoutube(saved);
      toast.success("저장되었습니다. 재시작 후 적용됩니다.");
      if (window.confirm("지금 앱을 재시작할까요?")) {
        await window.electronAPI?.app.relaunch();
      }
    } finally {
      setGSaving(false);
    }
  };

  // ── fal 저장/삭제 ──
  const saveFal = async () => {
    if (!fPlain) {
      toast.error("fal API 키를 입력해주세요.");
      return;
    }
    setFSaving(true);
    try {
      const api = window.electronAPI?.settings;
      if (!api) {
        const res = await fetch("/api/settings/fal-key", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({ plaintext: fPlain }),
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
        const saved = fPlain;
        setFPlain("");
        setFHasKey(true);
        if (r.masked !== undefined) setFMasked(r.masked);
        await pushFalToYoutube(saved);
        toast.success("저장되었습니다. 이미지 생성 시 fal 이 사용됩니다.");
        return;
      }
      const r = await api.setFalKey(fPlain);
      if (!r.encryption_available) {
        toast.error("이 PC 에서 암호화 기능을 사용할 수 없습니다.");
        return;
      }
      if (!r.ok) {
        toast.error("저장에 실패했습니다.");
        return;
      }
      const saved = fPlain;
      setFPlain("");
      setFHasKey(true);
      await pushFalToYoutube(saved);
      toast.success("저장되었습니다. 재시작 후 적용됩니다.");
      if (window.confirm("지금 앱을 재시작할까요?")) {
        await window.electronAPI?.app.relaunch();
      }
    } finally {
      setFSaving(false);
    }
  };

  const deleteFal = async () => {
    const api = window.electronAPI?.settings;
    if (!api) {
      const res = await fetch("/api/settings/fal-key", {
        method: "DELETE",
        cache: "no-store",
      });
      const r = (await res.json()) as { ok: boolean; hasKey?: boolean; masked?: string | null };
      if (r.ok) {
        setFHasKey(!!r.hasKey);
        setFMasked(r.masked ?? null);
        await pushFalToYoutube("");
        toast.success("삭제되었습니다.");
      }
      return;
    }
    const r = await api.setFalKey("");
    if (r.ok) {
      setFHasKey(false);
      setFMasked(null);
      await pushFalToYoutube("");
      toast.success("삭제되었습니다. 재시작 후 적용됩니다.");
    }
  };

  // ── Typecast 저장/삭제 (youtube 백엔드 PUT + Electron 시드) ──
  const persistTypecastToElectron = async (value: string) => {
    const api = window.electronAPI?.settings;
    if (!api) return;
    try {
      await api.setTypecastKey(value);
    } catch {
      /* youtube DB 에는 이미 반영됨 — 부팅 시드 보관만 실패 */
    }
  };

  const saveTypecast = async () => {
    if (!tcPlain.trim()) {
      toast.error("Typecast API 키를 입력해주세요.");
      return;
    }
    setTcSaving(true);
    try {
      const v = tcPlain.trim();
      await updateApiKeys({ typecast_api_key: v });
      await persistTypecastToElectron(v);
      setTcPlain("");
      toast.success("저장되었습니다. 재시작 없이 바로 적용돼요.");
      const s = await getApiKeys();
      setTcSet(s.typecast);
      setTcLoadError(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "저장에 실패했습니다. (키가 올바른지 확인해주세요)"
      );
    } finally {
      setTcSaving(false);
    }
  };

  const clearTypecast = async () => {
    if (tcSaving) return;
    setTcSaving(true);
    try {
      await updateApiKeys({ typecast_api_key: "" });
      await persistTypecastToElectron("");
      setTcPlain("");
      setTcSet(null);
      toast.success("키를 지웠어요.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setTcSaving(false);
    }
  };

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
            <KeyRound className="h-4 w-4" />
          </span>
          AI 생성에 필요한 키
        </CardTitle>
        <CardDescription className="pl-10">
          글·제목·이미지{youtubeAllowed ? " · 쇼츠 영상" : ""} 생성에 필요한 키를 한 곳에서
          관리합니다. 한 번 등록해두면 이후 생성 단계에서 자동으로 사용됩니다.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-0 px-5 py-1">
        {!encryptionAvailable && (
          <div className="my-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            이 PC 에서 암호화 기능을 사용할 수 없어 키를 안전하게 저장할 수 없습니다. Windows
            사용자 프로필 설정을 점검해주세요.
          </div>
        )}

        {/* ───────────────── Gemini (필수) ───────────────── */}
        <KeyRow
          icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
          title="Gemini API 키"
          badge={<Badge tone="required">필수</Badge>}
          description={
            youtubeAllowed
              ? "블로그 글·이미지와 쇼츠 자막·이미지를 모두 이 키로 만들어요. (블로그·쇼츠 공용)"
              : "블로그 글·제목·이미지를 모두 이 키로 만들어요."
          }
          loading={loading}
          hasKey={gHasKey}
          masked={gMasked}
          envBadge={isWebMode && gSource === "env"}
          value={gPlain}
          onChange={setGPlain}
          placeholder="AIza..."
          onSave={saveGemini}
          saving={gSaving}
          saveLabel={saveLabel(gSaving)}
          disabled={!encryptionAvailable}
          issueLabel="발급 방법 (처음이라면 클릭)"
          onIssue={() => setGuideOpen((v) => !v)}
          issueIsToggle
          issueOpen={guideOpen}
          extraTop={guideOpen ? <GeminiGuide onOpenStudio={() => openExternal(AISTUDIO_URL)} /> : null}
        />

        {/* ───────────────── fal (강력 권장) ───────────────── */}
        <KeyRow
          icon={<ImageIcon className="h-4 w-4 text-muted-foreground" />}
          title="fal API 키"
          badge={
            <>
              <Badge tone="recommended">강력 권장</Badge>
              {youtubeAllowed && (
                <span className="text-xs text-muted-foreground">· 블로그·쇼츠 공용</span>
              )}
            </>
          }
          warning={
            <div className="flex items-start gap-2 rounded-md bg-amber-100 p-3 text-xs leading-relaxed text-amber-900 dark:bg-amber-900/30 dark:text-amber-100">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span>
                이미지를 한 번에 여러 장 만들면, fal 키가 없을 땐{" "}
                <span className="font-semibold">‘잠시 후 다시 시도’ 오류가 자주</span> 떠요. fal
                키를 넣으면 <span className="font-semibold">끊김 없이 한 번에</span> 만들어집니다.
                필수는 아니지만 이미지를 자주 쓴다면 꼭 권합니다.
              </span>
            </div>
          }
          loading={loading}
          hasKey={fHasKey}
          masked={fMasked}
          envBadge={false}
          value={fPlain}
          onChange={setFPlain}
          placeholder="키 입력"
          onSave={saveFal}
          onDelete={fHasKey ? deleteFal : undefined}
          saving={fSaving}
          saveLabel={saveLabel(fSaving)}
          issueLabel="fal 키 발급 (fal.ai)"
          onIssue={() => openExternal(FAL_KEYS_URL)}
        />

        {/* ───────────────── Typecast (필수·쇼츠 전용) ───────────────── */}
        {youtubeAllowed && (
          <KeyRow
            icon={<Mic className="h-4 w-4 text-muted-foreground" />}
            title="Typecast API 키"
            badge={
              <>
                <Badge tone="required">필수</Badge>
                <span className="text-xs text-muted-foreground">· 쇼츠 전용</span>
              </>
            }
            description="쇼츠 영상의 나레이션 음성(TTS)을 만들어요."
            warning={
              tcLoadError ? (
                <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                  유튜브 백엔드 상태를 불러오지 못했어요. 키는 입력·저장할 수 있고, 앱을 다시 실행하면
                  상태가 정상 표시됩니다.
                </div>
              ) : null
            }
            loading={loading}
            hasKey={!!tcSet}
            masked={tcSet ? "설정됨" : null}
            maskedIsLabel
            envBadge={false}
            value={tcPlain}
            onChange={setTcPlain}
            placeholder="키 입력"
            onSave={saveTypecast}
            onDelete={tcSet ? clearTypecast : undefined}
            saving={tcSaving}
            saveLabel={tcSaving ? "저장 중..." : "저장"}
            issueLabel="Typecast 키 발급 (typecast.ai)"
            onIssue={() => openExternal(TYPECAST_URL)}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
// 작은 배지
// ─────────────────────────────────────────────
function Badge({ tone, children }: { tone: "required" | "recommended"; children: ReactNode }) {
  const cls =
    tone === "required"
      ? "bg-primary/10 text-primary"
      : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
  return (
    <span className={cn("rounded px-2 py-0.5 text-xs font-medium", cls)}>{children}</span>
  );
}

// ─────────────────────────────────────────────
// 키 한 행 — 아이콘+라벨+배지 / 설명·경고 / 저장된 키·지우기 / 입력+저장 / 발급 링크
// ─────────────────────────────────────────────
function KeyRow(props: {
  icon: ReactNode;
  title: string;
  badge: ReactNode;
  description?: string;
  warning?: ReactNode;
  /** 입력칸 위에 끼워 넣을 추가 영역(예: Gemini 발급 가이드) */
  extraTop?: ReactNode;
  loading: boolean;
  hasKey: boolean;
  masked: string | null;
  /** masked 값이 실제 키 일부가 아니라 "설정됨" 같은 라벨일 때 monospace 해제 */
  maskedIsLabel?: boolean;
  envBadge: boolean;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  onSave: () => void;
  onDelete?: () => void;
  saving: boolean;
  saveLabel: string;
  disabled?: boolean;
  issueLabel: string;
  onIssue: () => void;
  /** 발급 링크가 외부 링크가 아니라 가이드 토글일 때 */
  issueIsToggle?: boolean;
  issueOpen?: boolean;
}) {
  const {
    icon,
    title,
    badge,
    description,
    warning,
    extraTop,
    loading,
    hasKey,
    masked,
    maskedIsLabel,
    envBadge,
    value,
    onChange,
    placeholder,
    onSave,
    onDelete,
    saving,
    saveLabel,
    disabled,
    issueLabel,
    onIssue,
    issueIsToggle,
    issueOpen,
  } = props;

  return (
    <div className="space-y-2 border-t border-border/60 py-4 first:border-t-0">
      <div className="flex flex-wrap items-center gap-2">
        {icon}
        <span className="text-sm font-medium">{title}</span>
        {badge}
      </div>
      {description && <p className="pl-6 text-xs text-muted-foreground">{description}</p>}
      {warning && <div className="pl-6">{warning}</div>}

      {!loading && hasKey && masked && (
        <div className="pl-6 text-xs text-muted-foreground">
          저장된 키:{" "}
          <span className={maskedIsLabel ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-mono"}>
            {masked}
          </span>
          {envBadge && (
            <span className="ml-2 inline-flex items-center rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-900 dark:bg-sky-900/40 dark:text-sky-100">
              환경 파일(.env)
            </span>
          )}
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={saving}
              className="ml-2 text-destructive underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
            >
              지우기
            </button>
          )}
        </div>
      )}

      {extraTop && <div className="pl-6">{extraTop}</div>}

      <div className="space-y-1.5 pl-6">
        <Input
          type="password"
          autoComplete="off"
          placeholder={hasKey ? "새 키 입력 시 교체" : placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={saving || disabled}
        />
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onIssue}
            aria-expanded={issueIsToggle ? issueOpen : undefined}
            className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:opacity-80"
          >
            {issueIsToggle &&
              (issueOpen ? (
                <ChevronDown className="h-3 w-3" aria-hidden />
              ) : (
                <ChevronRight className="h-3 w-3" aria-hidden />
              ))}
            {issueLabel}
          </button>
          <Button onClick={onSave} disabled={saving || !value || disabled} size="sm">
            {saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Gemini 발급 가이드 (기존 ApiKeyPanel 의 4단계·무료/유료 안내 이식)
// ─────────────────────────────────────────────
function GeminiGuide({ onOpenStudio }: { onOpenStudio: () => void }) {
  return (
    <div className="space-y-4 rounded-md border bg-muted/20 p-3 text-sm">
      <div className="rounded-md bg-muted/40 p-3">
        💡 블로그 글 생성은 <span className="font-semibold">무료로 충분</span>합니다. AI 이미지
        생성은 <span className="font-semibold">유료(Tier 1) 등록</span>이 필요합니다.
      </div>
      <div>
        <div className="mb-2 font-medium">📋 발급 4단계</div>
        <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
          <li>
            <button
              type="button"
              onClick={onOpenStudio}
              className="cursor-pointer text-primary underline underline-offset-2 hover:opacity-80"
            >
              Google AI Studio
            </button>{" "}
            접속 (Gmail 계정으로 로그인)
          </li>
          <li>
            화면 좌측 상단의 <span className="font-semibold">&quot;Get API key&quot;</span> 메뉴 클릭
          </li>
          <li>
            <span className="font-semibold">&quot;Create API key&quot;</span> 버튼 클릭 → 새 프로젝트가
            자동으로 만들어지고, <span className="font-mono font-semibold">AIza...</span>로 시작하는 긴
            문자열이 표시됩니다
          </li>
          <li>
            그 문자열을 전부 복사 → 아래 입력칸에 붙여넣고{" "}
            <span className="font-semibold">[저장]</span> 버튼 누르기
          </li>
        </ol>
      </div>
      <div>
        <div className="mb-2 font-medium">💰 무료 vs 유료 (Tier 1)</div>
        <div className="space-y-2 text-muted-foreground">
          <div>
            <div className="font-semibold text-foreground">무료 등급 (Free)</div>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                블로그 글 같은 텍스트 생성은 <span className="font-semibold">무료로 충분</span>
              </li>
              <li>분당·하루 호출 횟수 제한 있지만 개인 사용에는 거의 부딪히지 않음</li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-foreground">유료 등급 (Tier 1)</div>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                AI 이미지 생성은 반드시 <span className="font-semibold">Tier 1부터 가능</span>
              </li>
              <li>
                Google AI Studio → &quot;Get API key&quot; → &quot;Set up Billing&quot;에서 카드
                등록하면 자동 승급
              </li>
              <li>
                월 정액 아님 — <span className="font-semibold">사용한 만큼만</span> 과금 (Pay as you
                go), 이미지 생성을 안 하면 청구액 0원
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div>
        <div className="mb-2 font-medium">⚠️ 주의</div>
        <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
          <li>키는 비밀번호와 같습니다 — 절대 남에게 공유하지 마세요</li>
          <li>노출됐다면 Google AI Studio에서 즉시 삭제 후 새로 발급</li>
        </ul>
      </div>
    </div>
  );
}
