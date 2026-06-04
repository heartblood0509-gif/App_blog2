"use client";

// Gemini API 키 입력 패널. SettingsModal의 저장 로직을 그대로 이식했다.
// 평문은 컴포넌트 state에만 잠깐 머물고, IPC로 main에 위임해 safeStorage가 잠근다.
// 저장 후엔 setPlaintext("")로 즉시 clear한다.
//
// 화면 구성:
//   1. CardHeader  — 제목 + 부제(왜 키 등록이 필요한지)
//   2. 안내 패널   — 키 없을 때 자동 펼침 / 발급 4단계 메뉴얼 + 유료(Tier 1) 안내
//   3. 입력칸      — 새 API 키 입력 + 저장 버튼

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
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

const AISTUDIO_URL = "https://aistudio.google.com/";

// 같은 Gemini 키를 유튜브 로컬 백엔드에도 즉시 반영(재시작 없이 DB 갱신). best-effort —
// 유튜브 백엔드가 안 떠 있으면 조용히 넘어가고(다음 부팅 시 env 시드), 블로그 저장은 그대로 유지한다.
async function pushGeminiToYoutube(key: string): Promise<void> {
  try {
    await updateApiKeys({ gemini_api_key: key });
  } catch {
    // 유튜브 백엔드 미가동 등 — 무시.
  }
}

interface ApiKeyPanelProps {
  className?: string;
}

export function ApiKeyPanel({ className }: ApiKeyPanelProps) {
  const [hasKey, setHasKey] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [plaintext, setPlaintext] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  // 안내 패널 펼침 상태. 키 없을 때 자동 펼침(C안), 키 있으면 접힘.
  // 초기값은 일단 false로 두고, getMasked 응답 들어온 뒤 결정한다.
  const [guideExpanded, setGuideExpanded] = useState(false);
  // 웹(Next dev) 모드 여부 — Electron IPC 부재로 판단. 마운트 시 1회 결정.
  const [isWebMode, setIsWebMode] = useState(false);
  // 웹 모드에서 키가 어디에 저장돼 있는지 — env(.env) 또는 local-file(.gemini-key.local).
  // Electron 모드에서는 null. UI 안내 문구 분기에 사용.
  const [keySource, setKeySource] = useState<"local-file" | "env" | "none" | null>(null);

  type ServerKeyResponse = {
    hasKey: boolean;
    masked: string | null;
    source: "local-file" | "env" | "none";
  };

  useEffect(() => {
    const api = window.electronAPI?.settings;
    if (!api) {
      // 웹(Next dev) 환경 — Electron IPC 가 없으니 신규 API 라우트로 키 상태 확인.
      // 이 모드에서도 [저장] 시 POST 로 .gemini-key.local 에 기록 → 즉시 적용.
      setIsWebMode(true);
      fetch("/api/settings/gemini-key", { cache: "no-store" })
        .then((res) => res.json() as Promise<ServerKeyResponse>)
        .then((r) => {
          setHasKey(r.hasKey);
          setMasked(r.masked);
          setKeySource(r.source);
          setGuideExpanded(!r.hasKey);
        })
        .catch(() => {
          // 라우트 호출 실패해도 기존 동작(키 없음 화면) 그대로 유지.
          setGuideExpanded(true);
        })
        .finally(() => setLoading(false));
      return;
    }
    api.getMasked().then((r) => {
      setHasKey(r.hasKey);
      setMasked(r.masked);
      setEncryptionAvailable(r.encryption_available);
      // 키 없으면 안내 자동 펼침
      setGuideExpanded(!r.hasKey);
      setLoading(false);
    });
  }, []);

  const openAiStudio = () => {
    window.electronAPI?.auth.openExternal(AISTUDIO_URL);
  };

  const save = async () => {
    if (!plaintext) {
      toast.error("API 키를 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
      const api = window.electronAPI?.settings;
      // ── 웹(Next dev) 모드: POST /api/settings/gemini-key 로 비밀 파일에 저장. 즉시 적용.
      if (!api) {
        try {
          const res = await fetch("/api/settings/gemini-key", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({ plaintext }),
          });
          const r = (await res.json()) as {
            ok: boolean;
            error?: string;
            hasKey?: boolean;
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
          setGuideExpanded(false);
          await pushGeminiToYoutube(plaintext);
          toast.success("저장되었습니다. 다음 글 생성부터 새 키가 사용됩니다.");
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          toast.error(`저장 중 오류: ${msg}`);
        }
        return;
      }

      // ── Electron 데스크톱 모드: safeStorage IPC + 재시작 안내 (기존 흐름 유지)
      const r = await api.setGeminiKey(plaintext);
      if (!r.encryption_available) {
        setEncryptionAvailable(false);
        toast.error("이 PC 에서 암호화 기능을 사용할 수 없습니다.");
        return;
      }
      if (!r.ok) {
        toast.error("저장에 실패했습니다.");
        return;
      }
      setPlaintext("");
      setHasKey(true);
      // 유튜브 백엔드엔 재시작 없이 즉시 반영. 블로그 백엔드는 env 주입이라 재시작 필요(아래 안내).
      await pushGeminiToYoutube(plaintext);
      toast.success("저장되었습니다. 재시작 후 적용됩니다.");
      const ok = window.confirm("지금 앱을 재시작할까요?");
      if (ok) {
        await window.electronAPI?.app.relaunch();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className={cn("mx-auto max-w-lg border-l-4 border-l-primary bg-card shadow-sm", className)}>
      <CardHeader className="border-b bg-primary/[0.045] px-5 py-4">
        <CardTitle className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Sparkles className="h-4 w-4" />
          </span>
          Gemini API 키
        </CardTitle>
        <CardDescription className="pl-10">
          글과 이미지 생성을 위한 설정입니다. 한 번 등록해두면 이후 생성 단계에서 자동으로 사용됩니다.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-5 pt-1">
        {!encryptionAvailable && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
            이 PC 에서 암호화 기능을 사용할 수 없어 키를 안전하게 저장할 수 없습니다. Windows
            사용자 프로필 설정을 점검해주세요.
          </div>
        )}

        {!loading && !hasKey && encryptionAvailable && (
          <div className="rounded-md border bg-muted/30 p-3 text-sm">
            아직 API 키가 등록되어 있지 않습니다. 글 생성을 시작하려면 키를 등록하세요.
          </div>
        )}

        {hasKey && masked && (
          <div className="space-y-2">
            <div className="text-sm text-muted-foreground">
              저장된 키: <span className="font-mono">{masked}</span>
              {isWebMode && keySource === "local-file" && (
                <span className="ml-2 inline-flex items-center rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100">
                  이 화면에서 등록
                </span>
              )}
              {isWebMode && keySource === "env" && (
                <span className="ml-2 inline-flex items-center rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-900 dark:bg-sky-900/40 dark:text-sky-100">
                  환경 파일(.env)
                </span>
              )}
            </div>
            {isWebMode && (
              <div className="rounded-md border bg-muted/30 p-3 text-sm">
                {keySource === "local-file" ? (
                  <>이 화면에서 직접 등록한 키를 사용 중입니다. 새 키로 바꾸려면 아래 칸에 붙여넣고 저장하세요.</>
                ) : (
                  <>현재 환경 파일(.env)에 등록된 키를 사용 중입니다. 아래 칸에 다른 키를 붙여넣고 저장하면 즉시 그 키로 바뀝니다.</>
                )}
              </div>
            )}
          </div>
        )}

        {/* ──────────────────────────────────────────────────────────
            API 키 발급 방법 안내 패널 (접힘/펼침 토글)
            - 키가 없으면 자동 펼침 (C안)
            - 키가 있으면 접힘 — 헤더만 보임
           ────────────────────────────────────────────────────────── */}
        <div className="rounded-md border">
          <button
            type="button"
            onClick={() => setGuideExpanded((v) => !v)}
            className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium hover:bg-muted/50"
            aria-expanded={guideExpanded}
            aria-controls="api-key-guide-content"
          >
            <span>📘 API 키 발급 방법 (처음이라면 클릭)</span>
            {guideExpanded ? (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            ) : (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
          </button>

          {guideExpanded && (
            <div
              id="api-key-guide-content"
              className="space-y-4 border-t px-3 py-3 text-sm"
            >
              {/* ① 한 줄 요약 박스 */}
              <div className="rounded-md bg-muted/30 p-3">
                💡 블로그 글 생성은 <span className="font-semibold">무료로 충분</span>합니다. AI
                이미지 생성은 <span className="font-semibold">유료(Tier 1) 등록</span>이 필요합니다.
              </div>

              {/* ② 발급 4단계 */}
              <div>
                <div className="mb-2 font-medium">📋 발급 4단계</div>
                <ol className="list-decimal space-y-2 pl-5 text-muted-foreground">
                  <li>
                    <button
                      type="button"
                      onClick={openAiStudio}
                      className="cursor-pointer text-primary underline underline-offset-2 hover:opacity-80"
                    >
                      Google AI Studio
                    </button>{" "}
                    접속 (Gmail 계정으로 로그인)
                  </li>
                  <li>
                    화면 좌측 상단의 <span className="font-semibold">&quot;Get API key&quot;</span>{" "}
                    메뉴 클릭
                  </li>
                  <li>
                    <span className="font-semibold">&quot;Create API key&quot;</span> 버튼 클릭 →
                    새 프로젝트가 자동으로 만들어지고,{" "}
                    <span className="font-mono font-semibold">AIza...</span>로 시작하는 긴 문자열이
                    표시됩니다
                  </li>
                  <li>
                    그 문자열을 전부 복사 → 아래{" "}
                    <span className="font-semibold">&quot;새 API 키&quot;</span> 칸에 붙여넣고{" "}
                    <span className="font-semibold">[저장 + 재시작]</span> 버튼 누르기
                  </li>
                </ol>
              </div>

              {/* ③ 무료 vs 유료 (Tier 1) */}
              <div>
                <div className="mb-2 font-medium">💰 무료 vs 유료 (Tier 1)</div>
                <div className="space-y-2 text-muted-foreground">
                  <div>
                    <div className="font-semibold text-foreground">무료 등급 (Free)</div>
                    <ul className="ml-4 list-disc space-y-1">
                      <li>
                        블로그 글 같은 텍스트 생성은{" "}
                        <span className="font-semibold">무료로 충분</span>
                      </li>
                      <li>
                        분당·하루 호출 횟수 제한 있지만 개인 사용에는 거의 부딪히지 않음
                      </li>
                    </ul>
                  </div>
                  <div>
                    <div className="font-semibold text-foreground">유료 등급 (Tier 1)</div>
                    <ul className="ml-4 list-disc space-y-1">
                      <li>
                        AI 이미지 생성은 반드시{" "}
                        <span className="font-semibold">Tier 1부터 가능</span>
                      </li>
                      <li>
                        Google AI Studio → &quot;Get API key&quot; → &quot;Set up Billing&quot;에서
                        카드 등록하면 자동 승급
                      </li>
                      <li>
                        월 정액 아님 — <span className="font-semibold">사용한 만큼만</span> 과금
                        (Pay as you go)
                      </li>
                      <li>이미지 생성을 안 하면 청구액 0원</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* ④ 주의사항 */}
              <div>
                <div className="mb-2 font-medium">⚠️ 주의</div>
                <ul className="ml-4 list-disc space-y-1 text-muted-foreground">
                  <li>키는 비밀번호와 같습니다 — 절대 남에게 공유하지 마세요</li>
                  <li>
                    노출됐다면 Google AI Studio에서 즉시 삭제 후 새로 발급
                  </li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* 입력칸 — Electron/웹 모두에서 노출. 키 있어도 "다른 키로 변경" 가능. */}
        <div className="space-y-2">
          <label htmlFor="gemini-api-key" className="text-sm font-medium">
            {hasKey ? "새 API 키로 변경" : "새 API 키"}
          </label>
          <Input
            id="gemini-api-key"
            type="password"
            placeholder="AIza..."
            value={plaintext}
            onChange={(e) => setPlaintext(e.target.value)}
            disabled={!encryptionAvailable || saving}
          />
        </div>

        <div className="flex justify-end">
          <Button
            onClick={save}
            disabled={!encryptionAvailable || saving || !plaintext}
          >
            {saving
              ? "저장 중..."
              : isWebMode
              ? "저장"
              : "저장 + 재시작"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
