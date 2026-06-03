"use client";

// 유튜브(쇼츠 픽) 탭의 네이티브 React 워크플로 루트.
// 내부 화면 상태머신(모드선택 → Card A/B 단계 → 진행 → 미리보기 → 완료)을 자체 관리한다.
// 화면은 마일스톤별로 채워진다(M1: 모드선택 + Card A 입력).
//
// 개발용 임시 토글: localStorage 'yt_legacy_iframe' === '1' 이면 검증된 기존 iframe 을 표시.
// (재작성 진행 중에도 동작하는 경로 확보. M5 에서 제거.)

import { useSyncExternalStore } from "react";
import { StepYoutubeEmbed } from "@/components/steps/step-youtube-embed";
import { YoutubeWorkflowProvider, useYt } from "./state";
import { Stepper } from "./Stepper";
import { ModeSelect } from "./screens/ModeSelect";
import { TopicInput } from "./screens/TopicInput";
import { TitleSelect } from "./screens/TitleSelect";
import { Placeholder } from "./screens/Placeholder";

const noopSubscribe = () => () => {};
function readLegacyFlag(): boolean {
  try {
    return window.localStorage.getItem("yt_legacy_iframe") === "1";
  } catch {
    return false;
  }
}
function useLegacyIframe(): boolean {
  return useSyncExternalStore(noopSubscribe, readLegacyFlag, () => false);
}

function ScreenSwitch() {
  const { state } = useYt();
  switch (state.screen) {
    case "mode":
      return <ModeSelect />;
    case "topic":
      return <TopicInput />;
    case "titles":
      return <TitleSelect />;
    case "narration":
      return <Placeholder label="나레이션 확인" />;
    case "script":
      return <Placeholder label="제목·대본 입력" />;
    case "lines":
      return <Placeholder label="줄별 자산 편집" />;
    case "tts":
      return <Placeholder label="음성 설정" />;
    case "bgm":
      return <Placeholder label="BGM 설정" />;
    case "progress":
      return <Placeholder label="영상 생성 진행" />;
    case "preview":
      return <Placeholder label="이미지 미리보기" />;
    case "clips":
      return <Placeholder label="클립 미리보기" />;
    case "completed":
      return <Placeholder label="완성" />;
    default:
      return <ModeSelect />;
  }
}

export function YoutubeWorkflow() {
  const legacy = useLegacyIframe();
  if (legacy) return <StepYoutubeEmbed />;

  return (
    <YoutubeWorkflowProvider>
      <div className="space-y-6">
        <Stepper />
        <ScreenSwitch />
      </div>
    </YoutubeWorkflowProvider>
  );
}
