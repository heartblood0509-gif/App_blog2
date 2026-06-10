/**
 * 텍스트 생성(제목·본문) 실패 시 사용자에게 보여줄 원인별 toast 문구 (클라이언트).
 *
 * 서버 라우트가 geminiErrorResponse 로 내려준 reasonCode 를 받아, 짧은 배지 라벨
 * (image-bulk 의 reasonCodeToLabel) 대신 제목 + 설명 + (필요 시) 액션 링크로 안내한다.
 */
import { toast } from "sonner";
import type { ReasonCode } from "@/lib/ai/retry-classify";

export interface ToastInfo {
  title: string;
  description?: string;
  /** 무료등급 묶임처럼 사용자가 직접 조치해야 할 때만 — 링크 버튼. */
  action?: { label: string; href: string };
}

export function reasonToToast(
  code: ReasonCode | undefined,
  fallbackMessage?: string
): ToastInfo {
  switch (code) {
    case "quota_free_tier":
      return {
        title: "무료 등급 한도에 걸렸어요",
        description:
          "이 API 키가 무료 등급 한도(또는 결제 잔액 소진)에 묶여 있어요. " +
          "Google AI Studio에서 새 프로젝트를 만들어 키를 다시 발급하면 해결됩니다.",
        action: {
          label: "키 발급 방법",
          href: "https://aistudio.google.com/apikey",
        },
      };
    case "quota":
      return {
        title: "요청이 잠시 몰렸어요",
        description: "Gemini 서버가 혼잡합니다. 잠시 후 다시 시도해주세요.",
      };
    case "unavailable":
    case "internal":
      return {
        title: "Gemini가 일시적으로 불안정해요",
        description: "잠시 후 다시 시도해주세요.",
      };
    case "auth":
    case "permission":
      return {
        title: "API 키를 다시 확인해주세요",
        description:
          "먼저 API 키를 제대로 입력하고 저장했는지 꼭 확인해주세요. " +
          "키가 정확하다면 결제·권한 설정 문제일 수 있어요.",
      };
    default: {
      // 원본 메시지가 JSON 덩어리면 노출하지 않고 일반 안내로 폴백.
      const clean =
        fallbackMessage && !fallbackMessage.trimStart().startsWith("{")
          ? fallbackMessage
          : undefined;
      return {
        title: "생성에 실패했어요",
        description:
          clean ??
          "잠시 후 다시 시도하거나, 문제가 계속되면 API 키 설정을 확인해주세요.",
      };
    }
  }
}

/**
 * 실패 응답(res)에서 error/reasonCode를 뽑아 Error에 실어 반환 — `throw await ...` 용.
 * not-ok 지점에서 reasonCode를 잃지 않고 catch까지 전달한다.
 */
export async function parseGenErrorResponse(
  res: Response,
  fallback: string
): Promise<Error & { reasonCode?: ReasonCode }> {
  const body = (await res.json().catch(() => ({}))) as {
    error?: string;
    reasonCode?: ReasonCode;
  };
  const e = new Error(body.error || fallback) as Error & {
    reasonCode?: ReasonCode;
  };
  e.reasonCode = body.reasonCode;
  return e;
}

/**
 * catch에서 호출 — 에러의 reasonCode로 원인별 안내 toast.
 * 자동으로 사라지지 않고(X 버튼으로만 닫힘), 무료등급 묶임이면 키 발급 링크 버튼을 단다.
 */
export function showGenErrorToast(err: unknown): void {
  const reasonCode = (err as { reasonCode?: ReasonCode })?.reasonCode;
  const message = err instanceof Error ? err.message : undefined;
  const info = reasonToToast(reasonCode, message);
  toast.error(info.title, {
    description: info.description,
    duration: Infinity,
    closeButton: true,
    action: info.action
      ? {
          label: info.action.label,
          onClick: () =>
            window.open(info.action!.href, "_blank", "noopener,noreferrer"),
        }
      : undefined,
  });
}
