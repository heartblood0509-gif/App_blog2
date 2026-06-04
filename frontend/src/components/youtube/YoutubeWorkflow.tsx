"use client";

// 유튜브(쇼츠 픽) 탭의 네이티브 React 워크플로 루트.
// 내부 화면 상태머신(모드선택 → Card A/B 단계 → 진행 → 미리보기 → 완료)을 자체 관리한다.

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
  return (
    <YoutubeWorkflowProvider>
      <div className="space-y-6">
        <Stepper />
        <ScreenSwitch />
      </div>
    </YoutubeWorkflowProvider>
  );
}
