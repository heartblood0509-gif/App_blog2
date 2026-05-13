"use client";

// §F — Gemini API 키 사용자 입력. 평문은 renderer 변수로만 잠깐 갖고, 즉시 IPC 로 main 에 위임.
// main 이 safeStorage 로 잠가 settings.json 에 저장. 다음 부팅 시 NextServerManager env 로 주입.
//
// 키 변경 후엔 Next 서버를 재시작해야 적용되므로 "지금 재시작" 안내.

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  forceFirstRun?: boolean; // 첫 부팅 시 키 없을 때 닫기 불가 모드
}

export function SettingsModal({ open, onOpenChange, forceFirstRun }: SettingsModalProps) {
  const [hasKey, setHasKey] = useState(false);
  const [masked, setMasked] = useState<string | null>(null);
  const [encryptionAvailable, setEncryptionAvailable] = useState(true);
  const [plaintext, setPlaintext] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const api = typeof window !== "undefined" ? window.electronAPI?.settings : undefined;
    if (!api) return;
    if (!open) return;
    api.getMasked().then((r) => {
      setHasKey(r.hasKey);
      setMasked(r.masked);
      setEncryptionAvailable(r.encryption_available);
    });
  }, [open]);

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
        toast.error("이 PC 에서 암호화 기능을 사용할 수 없습니다.");
        return;
      }
      if (!r.ok) {
        toast.error("저장에 실패했습니다.");
        return;
      }
      toast.success("저장되었습니다. 재시작 후 적용됩니다.");
      setPlaintext("");
      const ok = confirm("지금 앱을 재시작할까요?");
      if (ok) {
        await window.electronAPI?.app.relaunch();
      } else {
        onOpenChange(false);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        // 첫 부팅 강제 모드일 땐 닫기 불가
        if (forceFirstRun && !hasKey && !o) return;
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>설정 — Gemini API 키</DialogTitle>
          <DialogDescription>
            글 생성·이미지 생성에 Google Gemini API 를 사용합니다. Google AI Studio 에서 발급받은 키를 입력하세요.
          </DialogDescription>
        </DialogHeader>

        {!encryptionAvailable && (
          <div className="rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm">
            이 PC 에서 암호화 기능을 사용할 수 없습니다. Windows 사용자 프로필을 점검해주세요.
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

        <DialogFooter className="gap-2">
          {!forceFirstRun || hasKey ? (
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              취소
            </Button>
          ) : null}
          <Button onClick={save} disabled={!encryptionAvailable || saving || !plaintext}>
            {saving ? "저장 중..." : "저장 + 재시작"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
