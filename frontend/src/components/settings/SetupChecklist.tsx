"use client";

// "내 정보" 페이지 상단의 시작 가이드 카드.
// 필수 2개(API 키 / 블로그 계정) + 권장 1개(첫 프로필) 진행 상태를 한눈에 보여주고,
// 미완료 항목 클릭 시 해당 탭으로 이동.
//
// 다 완료되면 카드 자체 숨김 → 한 번 끝낸 사용자에게 다시 표시되지 않음.
//
// 디자인: 기존 Card + 시맨틱 토큰 (bg-card, border, text-foreground/muted-foreground)
// 다크모드 자동 호환.

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Circle, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface SetupChecklistProps {
  /** 사이드바 탭으로 이동시키는 콜백. id 는 MyInfoLayout 의 TabId 와 동일 */
  onGoToTab: (tabId: string) => void;
}

interface ChecklistState {
  loaded: boolean;
  hasApiKey: boolean;
  hasBlogAccount: boolean;
  hasAnyProfile: boolean;
}

const INITIAL_STATE: ChecklistState = {
  loaded: false,
  hasApiKey: false,
  hasBlogAccount: false,
  hasAnyProfile: false,
};

export function SetupChecklist({ onGoToTab }: SetupChecklistProps) {
  const [state, setState] = useState<ChecklistState>(INITIAL_STATE);

  const checkAll = useCallback(async () => {
    // 4개 fetch 를 병렬 — 한 군데 실패해도 다른 항목은 표시.
    const safeFetch = async (url: string): Promise<unknown> => {
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) return null;
        return await res.json();
      } catch {
        return null;
      }
    };

    const [keyRes, accRes, prodRes, brandRes, aeoRes] = await Promise.all([
      safeFetch("/api/settings/gemini-key"),
      safeFetch("/api/accounts"),
      safeFetch("/api/products"),
      safeFetch("/api/brand/profiles"),
      safeFetch("/api/aeo/profiles"),
    ]);

    const hasApiKey = Boolean((keyRes as { hasKey?: boolean } | null)?.hasKey);
    const hasBlogAccount = Array.isArray(accRes) && accRes.length > 0;
    const hasAnyProfile =
      (Array.isArray(prodRes) && prodRes.length > 0) ||
      (Array.isArray(brandRes) && brandRes.length > 0) ||
      (Array.isArray(aeoRes) && aeoRes.length > 0);

    setState({ loaded: true, hasApiKey, hasBlogAccount, hasAnyProfile });
  }, []);

  useEffect(() => {
    void checkAll();
  }, [checkAll]);

  // 다 완료됐거나 아직 로드 안 됐으면 카드 자체 숨김.
  if (!state.loaded) return null;
  const allDone =
    state.hasApiKey && state.hasBlogAccount && state.hasAnyProfile;
  if (allDone) return null;

  return (
    <div className="rounded-lg border-2 border-primary/30 bg-primary/[0.04] p-5">
      <div className="mb-3 flex items-center gap-2">
        <Rocket className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold text-foreground">
          🚀 시작 가이드
        </h3>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        글을 만들 준비를 마쳐주세요. 필수 항목을 채우면 바로 글 작성이 가능합니다.
      </p>

      <ul className="space-y-2.5">
        <ChecklistItem
          done={state.hasApiKey}
          required
          title="Gemini API 키 등록"
          description="글과 이미지 생성을 위한 핵심 설정"
          onClick={() => onGoToTab("api-generation")}
        />
        <ChecklistItem
          done={state.hasBlogAccount}
          required
          title="블로그 발행 계정 추가"
          description="작성한 글을 네이버 블로그에 발행하기 위한 계정"
          onClick={() => onGoToTab("blog-account")}
        />
        <ChecklistItem
          done={state.hasAnyProfile}
          required={false}
          title="첫 프로필 등록 (권장)"
          description="제품·브랜드·AEO 중 만들려는 글 종류에 맞춰 1개라도 등록"
          onClick={() => onGoToTab("products")}
        />
      </ul>
    </div>
  );
}

function ChecklistItem({
  done,
  required,
  title,
  description,
  onClick,
}: {
  done: boolean;
  required: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <li className="flex items-start gap-3 rounded-md bg-background/60 px-3 py-2.5">
      {done ? (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
      ) : (
        <Circle
          className={cn(
            "mt-0.5 h-5 w-5 shrink-0",
            required ? "text-primary" : "text-muted-foreground"
          )}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "text-sm font-medium",
              done ? "text-muted-foreground line-through" : "text-foreground"
            )}
          >
            {title}
          </span>
          {required && !done && (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
              필수
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      {!done && (
        <Button size="sm" variant="ghost" className="shrink-0 gap-1" onClick={onClick}>
          등록하러 가기
          <ArrowRight className="h-3 w-3" />
        </Button>
      )}
    </li>
  );
}
