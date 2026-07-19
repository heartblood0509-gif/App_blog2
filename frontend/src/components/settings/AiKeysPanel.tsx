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
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  CreditCard,
  ExternalLink,
  Eye,
  EyeOff,
  HelpCircle,
  ImageIcon,
  Info,
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
const FAL_KEYS_URL = "https://fal.ai/dashboard";
const TYPECAST_URL = "https://typecast.ai/developers/api";
const GUIDE_URL =
  "https://pickso.notion.site/36f2aa17591b80fca1b2c1969403422c?v=36f2aa17591b80aa8542000cc68cb670";
const GEMINI_KEY_GUIDE_URL =
  "https://pickso.notion.site/API-36f2aa17591b804d9bcafa52bcaa3200?pvs=74";
const FAL_KEY_GUIDE_URL =
  "https://pickso.notion.site/FAL-API-36f2aa17591b8041a97ae35a050f5e2d";
const TYPECAST_KEY_GUIDE_URL =
  "https://pickso.notion.site/API-36f2aa17591b80c3b01aca0d761e6396";

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
  const [falGuideOpen, setFalGuideOpen] = useState(false);

  // ── Typecast (쇼츠) ──
  const [tcSet, setTcSet] = useState<string | null>(null);
  const [tcPlain, setTcPlain] = useState("");
  const [tcSaving, setTcSaving] = useState(false);
  const [tcLoadError, setTcLoadError] = useState(false);
  const [tcGuideOpen, setTcGuideOpen] = useState(false);

  // ── ElevenLabs (쇼츠, 선택) ──
  const [elSet, setElSet] = useState<string | null>(null);
  const [elPlain, setElPlain] = useState("");
  const [elSaving, setElSaving] = useState(false);
  const [elGuideOpen, setElGuideOpen] = useState(false);

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

    // Typecast·ElevenLabs 상태는 쇼츠 구매자에게만 — youtube 백엔드에서 로드.
    if (youtubeAllowed) {
      getApiKeys()
        .then((s) => {
          setTcSet(s.typecast);
          setElSet(s.elevenlabs);
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

  const deleteGemini = async () => {
    const api = window.electronAPI?.settings;
    if (!api) {
      const res = await fetch("/api/settings/gemini-key", {
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
        setGHasKey(!!r.hasKey);
        setGMasked(r.masked ?? null);
        if (r.source) setGSource(r.source);
        await pushGeminiToYoutube("");
        toast.success("삭제되었습니다.");
      }
      return;
    }
    const r = await api.setGeminiKey("");
    if (r.ok) {
      setGHasKey(false);
      setGMasked(null);
      await pushGeminiToYoutube("");
      toast.success("삭제되었습니다. 재시작 후 적용됩니다.");
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

  // ── ElevenLabs 저장/삭제 (youtube 백엔드 PUT + Electron 시드) ──
  const persistElevenLabsToElectron = async (value: string) => {
    const api = window.electronAPI?.settings;
    if (!api) return;
    try {
      await api.setElevenLabsKey(value);
    } catch {
      /* youtube DB 에는 이미 반영됨 — 부팅 시드 보관만 실패 */
    }
  };

  const saveElevenLabs = async () => {
    if (!elPlain.trim()) {
      toast.error("ElevenLabs API 키를 입력해주세요.");
      return;
    }
    setElSaving(true);
    try {
      const v = elPlain.trim();
      await updateApiKeys({ elevenlabs_api_key: v });
      await persistElevenLabsToElectron(v);
      setElPlain("");
      toast.success("저장되었습니다. 재시작 없이 바로 적용돼요.");
      const s = await getApiKeys();
      setElSet(s.elevenlabs);
      setTcLoadError(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "저장에 실패했습니다. (키가 올바른지 확인해주세요)"
      );
    } finally {
      setElSaving(false);
    }
  };

  const clearElevenLabs = async () => {
    if (elSaving) return;
    setElSaving(true);
    try {
      await updateApiKeys({ elevenlabs_api_key: "" });
      await persistElevenLabsToElectron("");
      setElPlain("");
      setElSet(null);
      toast.success("키를 지웠어요.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "삭제에 실패했습니다.");
    } finally {
      setElSaving(false);
    }
  };

  return (
    <div className={cn("mx-auto flex max-w-lg flex-col gap-10", className)}>
      <UsageGuideCard
        youtubeAllowed={youtubeAllowed}
        onOpenGuide={() => openExternal(GUIDE_URL)}
      />

      <Card className="bg-card pt-0 shadow-sm">
      <CardHeader className="border-b bg-primary/[0.045] px-5 py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <KeyRound className="h-4 w-4" />
          </span>
          API 키 입력
        </CardTitle>
        <CardDescription className="pl-10">
          Ctrl + C (복사) 가 안눌렸을 수 있습니다
          <br />
          API 키가 제대로 입력 됐는지 확인 하시고 저장을 꼭 눌러주세요
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3 px-5 pb-4 pt-4">
        {!encryptionAvailable && (
          <div className="my-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            이 PC 에서 암호화 기능을 사용할 수 없어 키를 안전하게 저장할 수 없습니다. Windows
            사용자 프로필 설정을 점검해주세요.
          </div>
        )}

        {/* ───────────────── Gemini (필수) ───────────────── */}
        <KeyRow
          icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
          title="Gemini API 키를 입력해주세요"
          badge={null}
          loading={loading}
          hasKey={gHasKey}
          masked={gMasked}
          envBadge={isWebMode && gSource === "env"}
          value={gPlain}
          onChange={setGPlain}
          placeholder="AIza..."
          onSave={saveGemini}
          onDelete={gHasKey ? deleteGemini : undefined}
          saving={gSaving}
          saveLabel={saveLabel(gSaving)}
          disabled={!encryptionAvailable}
          issueLabel="반드시 읽어주세요 (필독)"
          onIssue={() => setGuideOpen((v) => !v)}
          issueIsToggle
          issueOpen={guideOpen}
          extraBottom={
            guideOpen ? (
              <GeminiGuide
                onOpenStudio={() => openExternal(AISTUDIO_URL)}
                onOpenGuide={() => openExternal(GEMINI_KEY_GUIDE_URL)}
                onCollapse={() => setGuideOpen(false)}
              />
            ) : null
          }
        />

        {/* ───────────────── fal (강력 권장) ───────────────── */}
        <KeyRow
          icon={<ImageIcon className="h-4 w-4 text-muted-foreground" />}
          title="fal API 키를 입력해주세요"
          badge={null}
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
          issueLabel="반드시 읽어주세요 (필독)"
          onIssue={() => setFalGuideOpen((v) => !v)}
          issueIsToggle
          issueOpen={falGuideOpen}
          extraBottom={
            falGuideOpen ? (
              <FalGuide
                onOpenSite={() => openExternal(FAL_KEYS_URL)}
                onOpenGuide={() => openExternal(FAL_KEY_GUIDE_URL)}
                onCollapse={() => setFalGuideOpen(false)}
              />
            ) : null
          }
        />

        {/* ───────────────── Typecast (필수·쇼츠 전용) ───────────────── */}
        {youtubeAllowed && (
          <KeyRow
            icon={<Mic className="h-4 w-4 text-muted-foreground" />}
            title="Typecast API 키를 입력해주세요"
            badge={null}
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
            masked={tcSet}
            envBadge={false}
            value={tcPlain}
            onChange={setTcPlain}
            placeholder="키 입력"
            onSave={saveTypecast}
            onDelete={tcSet ? clearTypecast : undefined}
            saving={tcSaving}
            saveLabel={tcSaving ? "저장 중..." : "저장"}
            issueLabel="반드시 읽어주세요 (필독)"
            onIssue={() => setTcGuideOpen((v) => !v)}
            issueIsToggle
            issueOpen={tcGuideOpen}
            extraBottom={
              tcGuideOpen ? (
                <TypecastGuide
                  onOpenSite={() => openExternal(TYPECAST_URL)}
                  onOpenGuide={() => openExternal(TYPECAST_KEY_GUIDE_URL)}
                  onCollapse={() => setTcGuideOpen(false)}
                />
              ) : null
            }
          />
        )}

        {/* ───────────────── ElevenLabs (선택·쇼츠 전용) ───────────────── */}
        {youtubeAllowed && (
          <KeyRow
            icon={<AudioLines className="h-4 w-4 text-muted-foreground" />}
            title="ElevenLabs API 키를 입력해주세요 (선택)"
            badge={null}
            description="입력하면 쇼츠 음성에서 ElevenLabs와 보이스 클론을 쓸 수 있어요. 안 넣으면 Typecast만 사용돼요."
            loading={loading}
            hasKey={!!elSet}
            masked={elSet}
            envBadge={false}
            value={elPlain}
            onChange={setElPlain}
            placeholder="키 입력 (sk_...)"
            onSave={saveElevenLabs}
            onDelete={elSet ? clearElevenLabs : undefined}
            saving={elSaving}
            saveLabel={elSaving ? "저장 중..." : "저장"}
            issueLabel="키 발급 방법"
            onIssue={() => setElGuideOpen((v) => !v)}
            issueIsToggle
            issueOpen={elGuideOpen}
            extraBottom={
              elGuideOpen ? (
                <ElevenLabsGuide
                  onCollapse={() => setElGuideOpen(false)}
                />
              ) : null
            }
          />
        )}
      </CardContent>
      </Card>

      <FaqCard />
    </div>
  );
}

// ─────────────────────────────────────────────
// 자주 묻는 질문 (FAQ) — 키 입력 카드 아래. 각 질문은 <details> 토글로 펼침/접힘.
// ─────────────────────────────────────────────
function FaqCard() {
  // 외부 가이드 열기 — Electron 은 기본 브라우저, 웹은 새 탭 (메인 패널의 openExternal 과 동일 규칙).
  const openGuide = (url: string) => {
    if (window.electronAPI?.auth) window.electronAPI.auth.openExternal(url);
    else window.open(url, "_blank", "noopener");
  };
  const items: { q: string; a: ReactNode }[] = [
    {
      q: "저는 이미 제미나이를 구독하고 있는데, API 키도 따로 결제해야 하나요?",
      a: (
        <>
          네, <strong>따로 필요합니다.</strong> 두 가지가 같은 ‘제미나이’라서 헷갈리기
          쉽지만, 구글 안에서 서로 다른 상품이에요.
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            <li>
              <strong>제미나이 구독</strong>은 대표님이 직접 제미나이 사이트·앱에 들어가
              채팅할 때 쓰는 요금입니다.
            </li>
            <li>
              <strong>API 키</strong>는 블로그픽 프로그램이 대표님 대신 제미나이에게
              자동으로 글을 요청할 때 쓰는 통로입니다.
            </li>
          </ul>
        </>
      ),
    },
    {
      q: "생성 중에 오류가 나면서 멈췄어요",
      a: (
        <>
          당황하지 마세요. 이건 <strong>프로그램(앱) 고장이 아니에요.</strong> 생성이 안 될
          때는 90% 이상이 아래 세 가지 중 하나예요.
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            <li><strong>API 키를 잘못 입력</strong>한 경우</li>
            <li><strong>결제가 제대로 안 된</strong> 경우</li>
            <li>
              <strong>구글 측 시스템 반영이 지연</strong>되는 경우 (최소 3일 ~ 일주일 — 이때는
              기다리면 해결돼요)
            </li>
          </ul>
          <p className="mt-2">대부분 아래 방법으로 해결되니 순서대로 확인해보세요.</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              먼저 <strong>오류 화면을 스크린샷</strong>으로 찍어두세요(원인 확인·문의에 도움).
            </li>
            <li>
              오류에 적힌 <strong>숫자 코드</strong>를 확인하고 아래 <strong>400·429</strong>{" "}
              항목을 보세요.
            </li>
          </ul>
        </>
      ),
    },
    {
      q: "오류에 'code: 400' 이 떠요",
      a: (
        <>
          <strong>Gemini 키를 잘못 입력</strong>한 거예요(가장 흔함).
          <p className="mt-2 font-medium text-foreground">이런 경우예요</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>복사할 때 앞뒤 공백·줄바꿈이 섞이거나 키 일부만 붙여넣어진 경우</li>
            <li>
              fal 등 다른 서비스 키를 Gemini 칸에 넣었거나, Google AI Studio가 아닌 다른 키를
              넣은 경우
            </li>
          </ul>
          <p className="mt-2 font-medium text-foreground">해결</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              Gemini 입력칸 위 미리보기가 <strong>“AIza…”로 시작</strong>하는지 확인하세요.
            </li>
            <li>발급받은 API 키와 입력한 API 키가 <strong>동일한지</strong> 확인하세요.</li>
            <li>다르다면 Google AI Studio에서 키를 <strong>다시 복사</strong>해 붙여넣으세요.</li>
          </ul>
        </>
      ),
    },
    {
      q: "오류에 'code: 429' 가 떠요",
      a: (
        <>
          키는 정상인데 <strong>사용량 한도를 넘은</strong> 거예요.
          <p className="mt-2 font-medium text-foreground">이런 경우예요</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              무료 등급 한도 초과 (짧은 시간에 여러 번 생성, 구글 정책상 무료로는 원활치 않음)
            </li>
            <li>결제는 했는데 <strong>유료 등급 반영이 지연</strong>되는 경우</li>
          </ul>
          <p className="mt-2 font-medium text-foreground">해결</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              유료(Tier 1) 결제를 안 했다면 <strong>카드를 등록하고 크레딧을 충전</strong>
              해주세요.
            </li>
            <li>
              크레딧이 떨어지면 또 에러가 발생합니다. <strong>자동 충전도 꼭! 등록</strong>
              해주세요.
            </li>
            <li>
              이미 결제했다면 구글 측 시스템 지연으로 유료 등급이 제대로 반영되기까지{" "}
              <strong>최소 3일 ~ 일주일</strong> 정도 걸릴 수 있어요. 대부분 그 사이 기다리면 정상
              반영되어 글 생성이 다시 잘 됩니다.
            </li>
          </ul>
        </>
      ),
    },
    {
      q: "오류에 'code: 503' 이 떠요",
      a: (
        <>
          <strong>구글 측 AI 서버가 일시적으로 몰려서(과부하)</strong> 생긴 거예요. 키나 결제
          문제가 아니니 안심하세요.
          <p className="mt-2 font-medium text-foreground">이런 경우예요</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>이용자가 몰리는 시간대에 구글 AI 서버가 잠시 바쁠 때</li>
            <li>대부분 금방 풀리는 <strong>일시적인 현상</strong>이에요</li>
          </ul>
          <p className="mt-2 font-medium text-foreground">해결</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              키·결제를 건드릴 필요 없어요. <strong>잠시(1~2분) 기다렸다가 다시 시도</strong>
              하세요.
            </li>
            <li>계속 뜨면 시간을 조금 더 두거나, 이용자가 적은 시간대에 다시 해보세요.</li>
          </ul>
        </>
      ),
    },
    {
      q: "이미지를 만들려는데 'API 키 권한/결제'라고 떠요",
      a: (
        <>
          <p className="mb-2">
            <button
              type="button"
              onClick={() => openGuide(FAL_KEY_GUIDE_URL)}
              className="font-medium text-primary hover:underline"
            >
              📄 FAL API 키 발급·충전 방법 — 가이드 바로가기 →
            </button>
          </p>
          이미지는 <strong>fal</strong> 로 만들어지는데, fal 쪽에서{" "}
          <strong>“지금은 만들어 줄 수 없다(결제·크레딧 문제)”</strong>고 거절했다는
          표시예요. <strong>거의 대부분 fal에 크레딧(이용 금액)이 충전되지 않아서</strong>{" "}
          생깁니다.
          <p className="mt-2">
            교통카드에 잔액이 없으면 개찰구가 안 열리는 것과 같아요 — fal에 금액을 채워
            두어야 이미지가 만들어집니다.
          </p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            <li>
              <strong>fal.ai</strong>에 접속해 <strong>결제 수단(카드)을 등록</strong>하고{" "}
              <strong>크레딧을 충전</strong>하세요. 충전한 뒤 다시 생성하면 됩니다.
            </li>
            <li>
              이미 충전돼 있는데도 계속 뜨면, 앱에 입력한 fal 키가 fal.ai의 키와{" "}
              <strong>같은지</strong> 확인하세요(자세한 점검은 아래 “이미지/동영상 생성
              실패가 떠요” 항목 참고).
            </li>
          </ul>
        </>
      ),
    },
    {
      q: "이미지/동영상 생성 실패가 떠요",
      a: (
        <>
          이미지는 <strong>fal 키</strong>로 만들어져서, 이것도 대부분 fal 키 문제예요. 아래
          순서로 확인하세요.
          <ul className="mt-1.5 list-disc space-y-1 pl-5">
            <li>
              <strong>fal.ai</strong>에 접속해 <strong>크레딧이 충전</strong>돼 있는지
              확인하세요(잔액이 없으면 생성되지 않아요).
            </li>
            <li>
              크레딧이 있다면 fal.ai의 키와 앱에 입력된 키가 <strong>같은지</strong> 확인하세요.
              복사 실수로 Gemini·Typecast 키가 fal 칸에 들어갔을 수 있어요(입력칸{" "}
              <strong>눈 아이콘</strong>으로 확인).
            </li>
            <li>
              키가 같은데도 계속 실패하면 fal.ai에서 <strong>기존 키를 삭제</strong>하고{" "}
              <strong>“Add key”로 새 키를 발급</strong>해 앱에 다시 입력·저장하세요. 99%
              해결됩니다.
            </li>
          </ul>
        </>
      ),
    },
    {
      q: "글이 이상하게 나오거나 가독성이 떨어져요",
      a: (
        <>
          AI 특성상 가끔 규칙을 어겨, <strong>프롬프트(생성 지시문)가 글에 섞이거나</strong>{" "}
          줄바꿈이 안 돼 가독성이 떨어질 때가 있어요. AI도 가끔 실수해요(제작사들도 “AI는 실수할
          수 있다”고 안내하죠). 해결은 두 가지예요.
          <p className="mt-2 font-medium text-foreground">① 간단한 수정이면 — 직접 고치기 (권장)</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              스마트에디터에 글이 다 입력된 뒤, 이상한 부분을 <strong>백스페이스로 직접
              지우세요.</strong>
            </li>
            <li>
              오히려 계정 운영에 도움이 돼요 — 글 입력 후 마우스·휠·엔터·백스페이스 등 모든
              행동이 데이터로 네이버에 전달되거든요. <strong>마지막엔 꼭 직접 검토</strong>하시는
              걸 권장해요.
            </li>
            <li>
              프로그램이 글을 <strong>사람처럼 한 글자씩 천천히 입력</strong>하도록 만든 것도 같은
              이유예요 — 실제 사람이 쓴 글처럼 인식돼 계정이 더 안전해지거든요.
            </li>
          </ul>
          <p className="mt-2 font-medium text-foreground">② 많이 이상하면 — 재생성</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>
              <strong>글 생성은 비용이 거의 들지 않으니</strong> 부담 없이{" "}
              <strong>재생성</strong>을 한 번 눌러보세요. 보통 깔끔하게 다시 나와요.
            </li>
            <li>
              단, 재생성하면 <strong>이미지가 사라져요.</strong> 이미지를 먼저 다운로드해
              두세요.
            </li>
          </ul>
          <p className="mt-2">
            <strong>글 가독성을 먼저 쭉 훑어본 뒤</strong> 이미지를 업로드·변환하시는 걸
            권장해요.
          </p>
        </>
      ),
    },
    {
      q: "발행하면 글이 엉키거나 일부가 사라져요",
      a: (
        <>
          발행 중에는 <strong>자동 입력 창(크롬)을 절대 건드리지 마세요.</strong> 클릭하면 글이
          틀어져요.
          <p className="mt-2 font-medium text-foreground">왜 그런가요</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>발행을 누르면 크롬 창이 뜨고 글이 <strong>한 글자씩 자동 입력</strong>돼요.</li>
            <li>
              이때 그 창 안의 <strong>팝업·본문 등을 클릭하면</strong> 입력 위치가 틀어져 글이
              엉키고 일부가 사라져요.
            </li>
            <li><strong>아이디·비밀번호 저장 팝업</strong>도 누르지 마세요.</li>
          </ul>
          <p className="mt-2 font-medium text-foreground">이렇게 하세요</p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            <li>입력이 끝날 때까지 그 창을 <strong>클릭하지 말고 기다리세요.</strong></li>
            <li>
              다른 탭을 띄우거나 <strong>평소 쓰던 다른 크롬 창</strong>에서 작업하는 건
              괜찮아요.
            </li>
            <li>
              실수로 건드려 <strong>글이 꼬이기 시작했다면</strong>, 그 창을 닫으면 발행이
              취소돼요. 프로그램은 멀쩡하니 <strong>다시 발행</strong>을 누르면 됩니다.
            </li>
          </ul>
        </>
      ),
    },
  ];

  return (
    <Card className="bg-card pt-0 shadow-sm">
      <CardHeader className="border-b bg-primary/[0.045] px-5 py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HelpCircle className="h-4 w-4" />
          </span>
          자주 묻는 질문 (FAQ)
        </CardTitle>
      </CardHeader>

      <CardContent className="px-5 py-1.5">
        {items.map((it, i) => (
          <details
            key={i}
            className="group border-b border-border/60 py-3 last:border-b-0"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
              <span>{it.q}</span>
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <div className="pt-2.5 text-sm leading-relaxed text-muted-foreground">
              {it.a}
            </div>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}

// ─────────────────────────────────────────────
// 키 용도 한눈에 보기 (별도 카드) — "무엇을 만들 때 어떤 키가 필요한지 + 결제 여부"
// 글 안 읽어도 색 배지(노랑=결제 필요 / 초록=무료)만으로 구분되게.
// ─────────────────────────────────────────────
function UsageGuideCard({
  youtubeAllowed,
  onOpenGuide,
}: {
  youtubeAllowed: boolean;
  onOpenGuide: () => void;
}) {
  return (
    <Card className="bg-card pt-0 shadow-sm">
      <CardHeader className="border-b bg-primary/[0.045] px-5 py-4">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Info className="h-4 w-4" />
          </span>
          어떤 키가 무엇을 만드나요?
        </CardTitle>
        <CardDescription className="pl-10">
          <button
            type="button"
            onClick={onOpenGuide}
            className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
          >
            블로그 픽 사용 가이드 바로 가기
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </button>
        </CardDescription>
      </CardHeader>

      <CardContent className="px-5 pb-4 pt-4">
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-muted/60 text-left text-xs font-medium text-muted-foreground">
                <th className="px-3.5 py-2">용도</th>
                <th className="px-3.5 py-2">필요한 키</th>
                <th className="px-3.5 py-2">결제</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              <GuideRow
                icon={<Sparkles className="h-4 w-4" />}
                use="제목 · 글 작성"
                keyName="Gemini API 키"
                pay="paid"
              />
              <GuideRow
                icon={<ImageIcon className="h-4 w-4" />}
                use="이미지 · 영상"
                keyName="fal API 키"
                pay="paid"
              />
              {youtubeAllowed && (
                <GuideRow
                  icon={<Mic className="h-4 w-4" />}
                  use="AI 목소리"
                  keyName="Typecast API 키"
                  pay="free"
                />
              )}
              {youtubeAllowed && (
                <GuideRow
                  icon={<AudioLines className="h-4 w-4" />}
                  use="AI 목소리 (선택)"
                  keyName="ElevenLabs API 키"
                  pay="paid"
                />
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Gemini · fal 키는 각 사이트에서 카드를 등록하고 미리 금액을 충전해 두면 사용한 만큼
            차감됩니다.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

function GuideRow({
  icon,
  use,
  keyName,
  pay,
}: {
  icon: ReactNode;
  use: string;
  keyName: string;
  pay: "paid" | "free";
}) {
  return (
    <tr>
      <td className="px-3.5 py-3">
        <span className="flex items-center gap-2">
          <span className="shrink-0 text-muted-foreground">{icon}</span>
          <span className="font-medium">{use}</span>
        </span>
      </td>
      <td className="px-3.5 py-3 text-muted-foreground">{keyName}</td>
      <td className="px-3.5 py-3">
        {pay === "paid" ? (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
            <CreditCard className="h-3 w-3" aria-hidden />
            카드 등록 · 선불 충전
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
            <Check className="h-3 w-3" aria-hidden />
            결제 필요 없음
          </span>
        )}
      </td>
    </tr>
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
  /** 입력칸 아래에 끼워 넣을 추가 영역(예: Gemini 발급 가이드) */
  extraBottom?: ReactNode;
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
    extraBottom,
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

  const [showKey, setShowKey] = useState(false);

  return (
    <div className="space-y-2 rounded-lg border p-4">
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

      <div className="space-y-1.5 pl-6">
        <div className="relative">
          <Input
            type={showKey ? "text" : "password"}
            autoComplete="off"
            placeholder={hasKey ? "새 키 입력 시 교체" : placeholder}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={saving || disabled}
            className={cn(value && "pr-10", showKey && "font-mono")}
          />
          {value && (
            <button
              type="button"
              onClick={() => setShowKey((s) => !s)}
              aria-label={showKey ? "키 가리기" : "키 전체 보기"}
              aria-pressed={showKey}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground"
            >
              {showKey ? (
                <EyeOff className="h-4 w-4" aria-hidden />
              ) : (
                <Eye className="h-4 w-4" aria-hidden />
              )}
            </button>
          )}
        </div>
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

      {extraBottom && <div className="pl-6">{extraBottom}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────
// Gemini 발급 가이드 (기존 ApiKeyPanel 의 4단계·무료/유료 안내 이식)
// ─────────────────────────────────────────────
function GeminiGuide({
  onOpenStudio,
  onOpenGuide,
  onCollapse,
}: {
  onOpenStudio: () => void;
  onOpenGuide: () => void;
  onCollapse: () => void;
}) {
  return (
    <div className="space-y-12 pt-1 text-sm">
      {/* 왜 유료(Tier 1)가 필요한가 */}
      <div className="space-y-5 leading-relaxed text-muted-foreground">
        <div className="space-y-2">
          <p className="text-xl font-medium text-foreground">💳 카드 등록 + 선불 충전이 꼭 필요해요</p>
          <p>구글 정책이 바뀌어서, 이제 무료 티어로는 콘텐츠 생성이 원활하지 않습니다.</p>
          <p>
            카드를 등록하고 크레딧을 선불로 충전하면 자동으로 무료 티어 → Tier 1로 올라갑니다.
          </p>
          <p>
            이때 드는 <span className="font-medium text-foreground">API 사용 비용</span>은 Gemini 웹
            서비스(구독) 요금과는 별개예요.
          </p>
        </div>
        <div className="space-y-2">
          <p>단, Tier 1 등급이 제대로 반영되기까지 시간이 걸립니다 (3일 ~ 최대 1주일).</p>
          <p>
            충전을 마쳐도 바로 적용되진 않아요. 그 전까지는 제목·글을 만들 때 오류 팝업이 뜰 수
            있습니다.
          </p>
          <p>👉 대부분 시간이 지나면 자동으로 정상 반영되니, 며칠 기다렸다가 다시 시도해 주세요.</p>
        </div>
      </div>

      {/* 발급 방법 */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xl font-medium">📋 Gemini API 키 발급 방법</span>
          <button
            type="button"
            onClick={onOpenGuide}
            className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:opacity-80"
          >
            키 발급 방법 바로가기
            <ExternalLink className="h-3 w-3" aria-hidden />
          </button>
        </div>
        <ol className="list-decimal space-y-2.5 pl-5 text-muted-foreground">
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
            화면 우측 상단 <span className="font-semibold">Get started</span> 클릭
          </li>
          <li>
            화면 좌측 하단의 <span className="font-semibold">Get API key</span> 클릭
          </li>
          <li>
            화면 우측 상단의 <span className="font-semibold">API 키 만들기</span> 버튼 클릭
          </li>
          <li>
            <span className="font-semibold">키 만들기</span> 클릭
          </li>
          <li>
            생성된 키 우측의 결제 등급 아래 <span className="font-semibold">결제 설정</span> 클릭
          </li>
          <li>개인 정보 + 카드 정보 입력</li>
          <li>
            생성된 키 우측의 결제 등급 아래 <span className="font-semibold">My Billing Account</span>{" "}
            클릭
          </li>
          <li>
            <span className="font-semibold">크레딧 구매하기</span> 클릭
          </li>
          <li>
            충전된 금액 확인 후 <span className="font-semibold">자동 충전 관리</span> 클릭
          </li>
          <li>
            <span className="font-semibold">자동 충전 등록</span>
          </li>
          <li>블로그 픽 API 키 입력란에 Gemini API 키 복사·붙여넣기</li>
        </ol>
        <p className="mt-2 text-xs text-muted-foreground">
          ※ 구글 계정 언어 설정에 따라 버튼 이름이 영문·한글로 다르게 보일 수 있어요.
        </p>
      </div>

      {/* 무료 vs 유료 */}
      <div>
        <div className="mb-2 text-xl font-medium">💰 무료 vs 유료 (Tier 1)</div>
        <div className="space-y-4 text-muted-foreground">
          <div>
            <div className="font-semibold text-foreground">무료 등급 (Free)</div>
            <ul className="ml-4 list-disc space-y-1.5">
              <li>
                구글의 정책 변경으로 <span className="font-semibold">무료 할당량이 대폭 감소</span>
              </li>
              <li>
                <span className="font-semibold">유료 전환 필수</span>
              </li>
            </ul>
          </div>
          <div>
            <div className="font-semibold text-foreground">유료 등급 (Tier 1)</div>
            <ul className="ml-4 list-disc space-y-1.5">
              <li>
                AI 이미지 생성은 반드시 <span className="font-semibold">Tier 1부터 가능</span>
              </li>
              <li>
                Google AI Studio → &quot;Get API key&quot; → &quot;Set up Billing&quot;에서 카드
                등록하면 자동 승급
              </li>
              <li>
                <span className="font-semibold">사용한 만큼만 과금</span>(월 정액 아님) — 이미지
                생성을 안 하면 청구액 0원
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* 주의 */}
      <div>
        <div className="mb-2 text-xl font-medium">⚠️ 주의</div>
        <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
          <li>키는 비밀번호와 같습니다 — 절대 남에게 공유하지 마세요</li>
          <li>노출됐다면 Google AI Studio에서 즉시 삭제 후 새로 발급</li>
        </ul>
      </div>

      <div className="border-t pt-3">
        <button
          type="button"
          onClick={onCollapse}
          className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:opacity-80"
        >
          <ChevronUp className="h-3 w-3" aria-hidden />
          접기
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// fal 발급/안내 가이드 (토글 내용 — 추후 본문 채움)
// ─────────────────────────────────────────────
function FalGuide({
  onOpenSite,
  onOpenGuide,
  onCollapse,
}: {
  onOpenSite: () => void;
  onOpenGuide: () => void;
  onCollapse: () => void;
}) {
  return (
    <div className="space-y-8 pt-1 text-sm">
      {/* 왜 fal 키를 쓰나 */}
      <div className="space-y-2 leading-relaxed text-muted-foreground">
        <p className="text-xl font-medium text-foreground">⚡ fal 키를 함께 쓰면 더 안정적이에요</p>
        <p>
          Gemini API 키는 불안정해서 오류가 자주 납니다 — 특정 사용자 문제가 아니라 전 세계적으로
          발생하는 이슈예요.
        </p>
        <p>
          fal은 구글의 공식 협력사라, 똑같이 구글의 이미지·영상 생성 모델을 쓰면서도{" "}
          <span className="font-medium text-foreground">훨씬 안정적이라 오류가 적습니다.</span>
        </p>
        <p>단, fal도 Gemini처럼 카드 등록 + 선불 결제가 필요합니다.</p>
      </div>

      {/* 발급 방법 */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xl font-medium">📋 fal API 키 발급 방법</span>
          <button
            type="button"
            onClick={onOpenGuide}
            className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:opacity-80"
          >
            키 발급 방법 바로가기
            <ExternalLink className="h-3 w-3" aria-hidden />
          </button>
        </div>
        <ol className="list-decimal space-y-2.5 pl-5 text-muted-foreground">
          <li>
            <button
              type="button"
              onClick={onOpenSite}
              className="cursor-pointer text-primary underline underline-offset-2 hover:opacity-80"
            >
              fal.ai
            </button>{" "}
            접속 (Gmail 계정으로 로그인)
          </li>
          <li>
            <span className="font-semibold">Set up billing</span> 버튼 클릭
          </li>
          <li>
            <span className="font-semibold">Add card</span> 버튼 클릭
          </li>
          <li>개인 정보 + 카드 정보 입력</li>
          <li>
            화면 좌측 <span className="font-semibold">API keys</span> 클릭
          </li>
          <li>
            <span className="font-semibold">Add key</span> 클릭
          </li>
          <li>
            <span className="font-semibold">Create key</span> 버튼 클릭
          </li>
          <li>
            키를 복사해 메모장 등 안전한 곳에 보관{" "}
            <span className="font-semibold">(이후 다시 복사할 수 없으니 꼭 저장하세요)</span>
          </li>
          <li>
            우측 상단 <span className="font-semibold">Credit</span> 클릭
          </li>
          <li>
            <span className="font-semibold">Quick buy $10.00</span> 클릭 (또는{" "}
            <span className="font-semibold">Custom</span>으로 원하는 금액 선택)
          </li>
          <li>자동 결제 활성화</li>
          <li>
            마지막으로 API 키를 앱 입력란에 붙여넣고 <span className="font-semibold">저장</span>
          </li>
        </ol>
      </div>

      {/* 주의 */}
      <div>
        <div className="mb-2 text-xl font-medium">⚠️ 주의</div>
        <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
          <li>크레딧을 충전하지 않으면 이미지, 영상 생성이 안 됩니다</li>
          <li>사용한 만큼만 과금(월 정액 아님) — 이미지 생성을 안 하면 청구액 0원</li>
          <li>fal API 키는 발급 후 복사해 메모장 같은 안전한 곳에 보관하세요</li>
          <li>키는 비밀번호와 같습니다 — 절대 남에게 공유하지 마세요</li>
          <li>노출됐다면 즉시 삭제 후 새로 발급</li>
        </ul>
      </div>

      <div className="border-t pt-3">
        <button
          type="button"
          onClick={onCollapse}
          className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:opacity-80"
        >
          <ChevronUp className="h-3 w-3" aria-hidden />
          접기
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ElevenLabs 발급/안내 가이드
// ─────────────────────────────────────────────
function ElevenLabsGuide({
  onCollapse,
}: {
  onCollapse: () => void;
}) {
  return (
    <div className="space-y-8 pt-1 text-sm">
      {/* 영상 보고 따라 하기 */}
      <div className="space-y-2 leading-relaxed text-muted-foreground">
        <p className="text-xl font-medium text-foreground">📺 처음이라면 영상 보고 따라 하기</p>
        <p>
          ElevenLabs는 영어 사이트라 처음엔 낯설 수 있어요. 아래 두 가지는 유튜브에 검색하면
          그대로 따라 하기 쉬운 영상이 많습니다:
        </p>
        <ul className="ml-4 list-disc space-y-1">
          <li>
            내 목소리 학습(보이스 클론) 만드는 법 → 유튜브에{" "}
            <span className="font-medium text-foreground">‘일레븐랩스 보이스 클론’</span> 검색
          </li>
          <li>
            API 키 발급받는 법 → 유튜브에{" "}
            <span className="font-medium text-foreground">‘일레븐랩스 API 키 발급’</span> 검색
          </li>
        </ul>
        <p>
          영상 보고 ① 내 목소리를 학습시키고 ② 키를 발급받아 아래 입력란에 넣으면,
          학습시킨 목소리를 앱에서 바로 쓸 수 있어요.
        </p>
      </div>

      {/* 주의 */}
      <div>
        <div className="mb-2 text-xl font-medium">⚠️ 주의</div>
        <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
          <li>키는 비밀번호와 같습니다 — 절대 남에게 공유하지 마세요</li>
          <li>노출됐다면 즉시 삭제 후 새로 발급</li>
        </ul>
      </div>

      <div className="border-t pt-3">
        <button
          type="button"
          onClick={onCollapse}
          className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:opacity-80"
        >
          <ChevronUp className="h-3 w-3" aria-hidden />
          접기
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Typecast 발급/안내 가이드 (토글 내용 — 추후 본문 채움)
// ─────────────────────────────────────────────
function TypecastGuide({
  onOpenSite,
  onOpenGuide,
  onCollapse,
}: {
  onOpenSite: () => void;
  onOpenGuide: () => void;
  onCollapse: () => void;
}) {
  return (
    <div className="space-y-8 pt-1 text-sm">
      {/* 왜 Typecast 키를 쓰나 */}
      <div className="space-y-2 leading-relaxed text-muted-foreground">
        <p className="text-xl font-medium text-foreground">🎙️ AI 목소리, API 키로 무료로 시작해요</p>
        <p>Typecast 키는 유튜브 영상을 만들 때 AI 나레이션 목소리를 생성하는 데 써요.</p>
        <p>
          타입캐스트 웹 서비스는 월 39,000원이지만,{" "}
          <span className="font-medium text-foreground">API 키를 쓰면 매월 3만 크레딧이 무료</span>
          예요. 3만 크레딧을 다 쓴 뒤 더 쓰고 싶으면 결제해서 이어서 쓸 수 있습니다.
        </p>
      </div>

      {/* 발급 방법 */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xl font-medium">📋 Typecast API 키 발급 방법</span>
          <button
            type="button"
            onClick={onOpenGuide}
            className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:opacity-80"
          >
            키 발급 방법 바로가기
            <ExternalLink className="h-3 w-3" aria-hidden />
          </button>
        </div>
        <ol className="list-decimal space-y-2.5 pl-5 text-muted-foreground">
          <li>
            타입캐스트{" "}
            <button
              type="button"
              onClick={onOpenSite}
              className="cursor-pointer text-primary underline underline-offset-2 hover:opacity-80"
            >
              developers
            </button>{" "}
            접속
          </li>
          <li>
            <span className="font-semibold">무료로 시작하기</span> 버튼 클릭
          </li>
          <li>구글 계정으로 로그인</li>
          <li>
            상단 <span className="font-semibold">API 키</span> 클릭 → 복사
          </li>
          <li>
            블로그 앱 입력란에 붙여넣고 <span className="font-semibold">저장</span>
          </li>
        </ol>
      </div>

      {/* 주의 */}
      <div>
        <div className="mb-2 text-xl font-medium">⚠️ 주의</div>
        <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
          <li>키는 비밀번호와 같습니다 — 절대 남에게 공유하지 마세요</li>
          <li>노출됐다면 즉시 삭제 후 새로 발급</li>
        </ul>
      </div>

      <div className="border-t pt-3">
        <button
          type="button"
          onClick={onCollapse}
          className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 hover:opacity-80"
        >
          <ChevronUp className="h-3 w-3" aria-hidden />
          접기
        </button>
      </div>
    </div>
  );
}
