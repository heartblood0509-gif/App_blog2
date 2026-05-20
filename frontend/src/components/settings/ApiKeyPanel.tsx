"use client";

// Gemini API 키 입력 패널. SettingsModal의 저장 로직을 그대로 이식했다.
// 평문은 컴포넌트 state에만 잠깐 머물고, IPC로 main에 위임해 safeStorage가 잠근다.
// 저장 후엔 setPlaintext("")로 즉시 clear한다.

import { useEffect, useState } from "react";
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

export function ApiKeyPanel() {
  const [hasKey, setHasKey] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [plaintext, setPlaintext] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

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
      setLoading(false);
    });
  }, []);

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
          글 생성·이미지 생성에 Google Gemini API 를 사용합니다. Google AI Studio 에서 발급받은
          키를 입력하세요.
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
