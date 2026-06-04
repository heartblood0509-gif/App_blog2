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
import { NarrationReview } from "./screens/NarrationReview";
import { ScriptInput } from "./screens/ScriptInput";
import { LineAssetEditor } from "./screens/LineAssetEditor";
import { TtsConfig } from "./screens/TtsConfig";
import { BgmConfig } from "./screens/BgmConfig";
import { ProgressView } from "./screens/ProgressView";
import { ImagePreview } from "./screens/ImagePreview";
import { CompletedView } from "./screens/CompletedView";
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
      return <NarrationReview />;
    case "script":
      return <ScriptInput />;
    case "lines":
      return <LineAssetEditor />;
    case "tts":
      return <TtsConfig />;
    case "bgm":
      return <BgmConfig />;
    case "progress":
      return <ProgressView />;
    case "preview":
      return <ImagePreview />;
    case "clips":
      return <Placeholder label="클립 미리보기" />;
    case "completed":
      return <CompletedView />;
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
