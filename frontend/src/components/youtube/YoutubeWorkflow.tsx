"use client";

// 유튜브(쇼츠 픽) 탭의 네이티브 React 워크플로 루트.
// 내부 화면 상태머신(모드선택 → Card A/B 단계 → 진행 → 미리보기 → 완료)을 자체 관리한다.

import { useState } from "react";
import { History } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { YoutubeWorkflowProvider, useYt, stepsForMode } from "./state";
import { Stepper } from "./Stepper";
import { YoutubeJobHistory } from "./YoutubeJobHistory";
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
      // key={jobId}: 작업이력에서 다른 작업을 열면 jobId 가 바뀌므로 강제 리마운트해
      // 새 jobId 로 줄을 다시 불러오게 한다(로드 effect 의존성이 [] 라서 필요).
      return <LineAssetEditor key={state.jobId ?? "new"} />;
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

// 유튜브 콘텐츠만 폭을 좁힌다(블로그앱 공용 셸 max-w-7xl 안에서 가운데 정렬).
// 원본 쇼츠픽처럼 대부분 화면은 좁게(≈920px → max-w-4xl). 줄별 자산 편집(lines)만 우측 프리뷰
// 패널 공간을 위해 본문을 넓힌다. 단 원본은 타임라인(.container 920px 고정)과 본문(.step-container만 확장)이
// 별개 컨테이너라, 상단 스텝퍼는 항상 좁게 두고 본문 컨테이너만 넓힌다. page.tsx 셸·다른 카드는 무변경.
function WorkflowBody() {
  const { state } = useYt();
  const [historyOpen, setHistoryOpen] = useState(false);
  const wide = state.screen === "lines";
  // "이전 작업 열기" 버튼: 스텝퍼가 보이는 Card B 단계 전체에서 노출(원래는 1단계에만 있었음).
  //  · user_assets(Card B) 한정 — AI 전체생성(Card A) 단계엔 띄우지 않는다.
  //  · 렌더 진행 중(progress)은 제외 — 이탈 시 SSE 구독이 끊겨 완료를 못 받기 때문(Stepper 잠금과 동일 취지).
  //  · 스텝 목록에 없는 화면(모드 선택 등)에선 스텝퍼처럼 숨김. completed 는 step5 match 에 포함돼 노출.
  const showHistory =
    state.mode === "user_assets" &&
    state.screen !== "progress" &&
    stepsForMode(state.mode).some(
      (s) => s.screen === state.screen || s.match?.includes(state.screen),
    );
  return (
    <div className="space-y-6">
      {/* 상단 단계 표시줄: 원본 .timeline.container 처럼 항상 좁게(≈920px → max-w-4xl) */}
      <div className="mx-auto max-w-4xl">
        <Stepper />
      </div>
      {/* 작업이력 진입: 스텝퍼와 같은 폭으로 우측 정렬해 단계가 바뀌어도 위치 고정. */}
      {showHistory && (
        <div className="mx-auto -mt-4 flex max-w-4xl justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryOpen(true)}
            className="gap-1.5"
          >
            <History className="h-4 w-4" /> 이전 작업 열기
          </Button>
        </div>
      )}
      {/* 본문: 자산(lines) 단계만 원본 .step-container 처럼 넓게, 그 외엔 좁게 */}
      <div className={cn("mx-auto", wide ? "max-w-7xl" : "max-w-4xl")}>
        <ScreenSwitch />
      </div>
      <YoutubeJobHistory open={historyOpen} onOpenChange={setHistoryOpen} />
    </div>
  );
}

export function YoutubeWorkflow() {
  return (
    <YoutubeWorkflowProvider>
      <WorkflowBody />
    </YoutubeWorkflowProvider>
  );
}
