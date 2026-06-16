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
import { CheckCircle2, Circle, Rocket } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthContext } from "@/lib/auth/auth-context";
import { YOUTUBE_FEATURE_ENABLED } from "@/lib/youtube-feature";
import { getApiKeys } from "@/lib/youtube/endpoints";

interface SetupChecklistProps {
  /** 사이드바 탭으로 이동시키는 콜백. id 는 MyInfoLayout 의 TabId 와 동일 */
  onGoToTab: (tabId: string) => void;
}

interface ChecklistState {
  loaded: boolean;
  hasApiKey: boolean;
  hasBlogAccount: boolean;
  hasAnyProfile: boolean;
  /** 쇼츠 구매자일 때만 의미 있음 — Typecast(음성) 키 등록 여부 */
  hasTypecast: boolean;
}

const INITIAL_STATE: ChecklistState = {
  loaded: false,
  hasApiKey: false,
  hasBlogAccount: false,
  hasAnyProfile: false,
  hasTypecast: false,
};

export function SetupChecklist({ onGoToTab }: SetupChecklistProps) {
  const [state, setState] = useState<ChecklistState>(INITIAL_STATE);
  // 쇼츠 구매자(plan!=='blog')에게만 Typecast(음성) 키를 필수 항목으로 추가.
  const { plan } = useAuthContext();
  const youtubeAllowed = YOUTUBE_FEATURE_ENABLED && plan !== "blog";

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

    const [
      provRes,
      geminiKeyRes,
      openaiKeyRes,
      falKeyRes,
      accRes,
      prodRes,
      brandRes,
      aeoRes,
    ] = await Promise.all([
      safeFetch("/api/settings/ai-provider"),
      safeFetch("/api/settings/gemini-key"),
      safeFetch("/api/settings/openai-key"),
      safeFetch("/api/settings/fal-key"),
      safeFetch("/api/accounts"),
      safeFetch("/api/products"),
      safeFetch("/api/brand/profiles"),
      safeFetch("/api/aeo/profiles"),
    ]);

    // 2축 provider — 글 키 AND 이미지 키가 모두 있어야 "등록됨".
    //   글=ChatGPT → OpenAI 키 / 글=Gemini → Gemini 키
    //   이미지=ChatGPT → OpenAI 키 / 이미지=Gemini → fal 키 또는 Gemini 키
    const cfg = provRes as { provider?: string; imageProvider?: string } | null;
    const textProvider = cfg?.provider === "openai" ? "openai" : "gemini";
    const imageProvider =
      (cfg?.imageProvider ?? cfg?.provider) === "openai" ? "openai" : "gemini";
    const hasGemini = Boolean((geminiKeyRes as { hasKey?: boolean } | null)?.hasKey);
    const hasOpenai = Boolean((openaiKeyRes as { hasKey?: boolean } | null)?.hasKey);
    const hasFal = Boolean((falKeyRes as { hasKey?: boolean } | null)?.hasKey);

    const textKeyOk = textProvider === "openai" ? hasOpenai : hasGemini;
    const imageKeyOk =
      imageProvider === "openai" ? hasOpenai : hasFal || hasGemini;
    const hasApiKey = textKeyOk && imageKeyOk;

    const hasBlogAccount = Array.isArray(accRes) && accRes.length > 0;
    const hasAnyProfile =
      (Array.isArray(prodRes) && prodRes.length > 0) ||
      (Array.isArray(brandRes) && brandRes.length > 0) ||
      (Array.isArray(aeoRes) && aeoRes.length > 0);

    // 쇼츠 구매자만 Typecast 상태 확인(youtube 백엔드). 미가동/실패 시 false 로 두되,
    // 아래 allDone 에는 youtubeAllowed 일 때만 반영하므로 블로그 사용자엔 영향 없음.
    let hasTypecast = false;
    if (youtubeAllowed) {
      try {
        hasTypecast = Boolean((await getApiKeys()).typecast);
      } catch {
        hasTypecast = false;
      }
    }

    setState({ loaded: true, hasApiKey, hasBlogAccount, hasAnyProfile, hasTypecast });
  }, [youtubeAllowed]);

  useEffect(() => {
    // checkAll 내부 setState는 병렬 fetch await 이후 비동기로 실행 → effect 동기 구간이 아니라
    // 룰의 보수적 추적이 잡은 사실상 오탐.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void checkAll();
  }, [checkAll]);

  // 다 완료됐거나 아직 로드 안 됐으면 카드 자체 숨김.
  if (!state.loaded) return null;
  const typecastOk = !youtubeAllowed || state.hasTypecast;
  const allDone =
    state.hasApiKey && state.hasBlogAccount && state.hasAnyProfile && typecastOk;
  if (allDone) return null;

  return (
    <div className="max-w-3xl rounded-lg border-2 border-primary/30 bg-primary/[0.04] p-5">
      <div className="mb-3 flex items-center gap-2">
        <Rocket className="h-5 w-5 text-primary" />
        <h3 className="text-base font-semibold text-foreground">
          시작 가이드
        </h3>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        콘텐츠를 생산할 준비를 마쳐주세요. 필수 항목을 채우면 바로 글 작성이 가능합니다.
      </p>

      <ul className="space-y-2.5">
        <ChecklistItem
          done={state.hasApiKey}
          required
          title="AI API 키 등록"
          description="글·이미지 생성에 필요한 키 (Gemini, Fal.ai)"
          onClick={() => onGoToTab("api-generation")}
        />
        {youtubeAllowed && (
          <ChecklistItem
            done={state.hasTypecast}
            required
            title="Typecast 키 등록 (쇼츠 음성)"
            description="쇼츠 영상의 나레이션 음성(TTS)을 만드는 데 필요한 키"
            onClick={() => onGoToTab("api-generation")}
          />
        )}
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
    <li
      className={cn(
        "flex items-start gap-3 rounded-md border border-border bg-background/60 px-3 py-2.5",
        !done && "cursor-pointer hover:bg-background"
      )}
      onClick={done ? undefined : onClick}
    >
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
    </li>
  );
}
