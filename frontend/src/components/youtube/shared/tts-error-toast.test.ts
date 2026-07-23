// @vitest-environment jsdom

// 크레딧 소진 토스트 계약 테스트.
//
// 백엔드(core/tts_engines.py)와 이 헬퍼는 "타입캐스트 월 크레딧" 이라는 표식 문자열로만
// 연결돼 있다. 한쪽 문구만 바꾸면 버튼이 조용히 사라지는데, 문구 자체는 그대로 나와서
// 눈으로는 알아채기 어렵다. 그래서 백엔드가 실제로 보내는 문장을 그대로 넣고 검증한다.
// 이 테스트가 깨지면 두 파일의 문구를 다시 맞춰야 한다는 뜻이다.

import { beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a) } }));

import { ttsErrorToast } from "./tts-error-toast";

// youtube-backend/core/tts_engines.py 의 TYPECAST_CREDIT_MESSAGE 원문.
const BACKEND_CREDIT_MESSAGE =
  "타입캐스트 월 크레딧을 모두 사용하셨습니다. 크레딧은 매달 결제일에 자동으로 다시 채워져요. " +
  "기다리지 않고 바로 더 만들려면 타입캐스트 요금제를 업그레이드해 주세요. " +
  "사용량 확인: https://studio.typecast.ai/developers/api";

const USAGE_URL = "https://studio.typecast.ai/developers/api";

type ToastOptions = { action?: { label: string; onClick: () => void }; duration?: number };

function lastToast(): [string, ToastOptions | undefined] {
  return toastError.mock.calls.at(-1) as [string, ToastOptions | undefined];
}

describe("ttsErrorToast", () => {
  beforeEach(() => {
    toastError.mockClear();
    delete (window as { electronAPI?: unknown }).electronAPI;
  });

  it("크레딧 소진이면 '사용량 확인' 버튼을 붙인다", () => {
    ttsErrorToast(new Error(BACKEND_CREDIT_MESSAGE), "폴백");
    const [, opts] = lastToast();
    expect(opts?.action?.label).toBe("사용량 확인");
  });

  it("본문에서 URL 꼬리를 떼되 원인·해결 안내는 남긴다", () => {
    ttsErrorToast(new Error(BACKEND_CREDIT_MESSAGE), "폴백");
    const [body] = lastToast();
    // URL 이 글자로 남으면 버튼과 중복돼 지저분해진다.
    expect(body).not.toContain("http");
    expect(body).not.toContain("사용량 확인:");
    // 떼는 과정에서 안내가 잘려나가면 안 된다.
    expect(body).toContain("타입캐스트 월 크레딧을 모두 사용하셨습니다");
    expect(body).toContain("업그레이드");
    expect(body.endsWith("업그레이드해 주세요.")).toBe(true);
  });

  it("버튼을 누르면 Electron 이 대시보드를 연다", () => {
    const openExternal = vi.fn();
    (window as { electronAPI?: unknown }).electronAPI = { auth: { openExternal } };
    ttsErrorToast(new Error(BACKEND_CREDIT_MESSAGE), "폴백");
    lastToast()[1]?.action?.onClick();
    expect(openExternal).toHaveBeenCalledWith(USAGE_URL);
  });

  it("웹 모드(Electron 아님)에서는 새 탭으로 연다", () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    ttsErrorToast(new Error(BACKEND_CREDIT_MESSAGE), "폴백");
    lastToast()[1]?.action?.onClick();
    expect(open).toHaveBeenCalledWith(USAGE_URL, "_blank", "noopener");
    open.mockRestore();
  });

  it("다른 실패는 버튼 없이 그대로 보여준다", () => {
    ttsErrorToast(new Error("Typecast rate limit (429)"), "폴백");
    const [body, opts] = lastToast();
    expect(body).toBe("Typecast rate limit (429)");
    expect(opts?.action).toBeUndefined();
  });

  it("Error 가 아닌 값이면 폴백 문구를 쓴다", () => {
    ttsErrorToast("문자열 예외", "음성 생성에 실패했습니다.");
    expect(lastToast()[0]).toBe("음성 생성에 실패했습니다.");
  });
});
