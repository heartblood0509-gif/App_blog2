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
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { toast } from "sonner";

const AISTUDIO_URL = "https://aistudio.google.com/";

export function ApiKeyPanel() {
  const [hasKey, setHasKey] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [plaintext, setPlaintext] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  // 안내 패널 펼침 상태. 키 없을 때 자동 펼침(C안), 키 있으면 접힘.
  // 초기값은 일단 false로 두고, getMasked 응답 들어온 뒤 결정한다.
  const [guideExpanded, setGuideExpanded] = useState(false);

  useEffect(() => {
    const api = window.electronAPI?.settings;
    if (!api) {
      setLoading(false);
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
    const api = window.electronAPI?.settings;
    if (!api) return;
    if (!plaintext) {
      toast.error("API 키를 입력해주세요.");
      return;
    }
    setSaving(true);
    try {
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
    <Card className="mx-auto max-w-lg">
      <CardHeader>
        <CardTitle>Gemini API 키</CardTitle>
        <CardDescription>
          글과 이미지는 Google Gemini가 만들어요. 본인 키를 한 번만 등록하면 바로 시작할 수 있고,
          등록은 간단해서 1분이면 끝납니다 — 아래 안내를 따라가세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
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
          <div className="text-sm text-muted-foreground">
            저장된 키: <span className="font-mono">{masked}</span>
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

        <div className="space-y-2">
          <label htmlFor="gemini-api-key" className="text-sm font-medium">
            새 API 키
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
            {saving ? "저장 중..." : "저장 + 재시작"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
