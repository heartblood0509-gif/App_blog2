"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { ThreadsAnalysisMode, ThreadsSettings } from "@/types";

interface StepThreadsSettingsProps {
  settings: ThreadsSettings;
  onChange: (settings: ThreadsSettings) => void;
  analysisMode: ThreadsAnalysisMode;
}

export function StepThreadsSettings({
  settings,
  onChange,
  analysisMode,
}: StepThreadsSettingsProps) {
  const isImageMode = analysisMode === "image";

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-2xl sm:text-3xl font-extrabold mb-3">글 설정</h2>
        <p className="text-base sm:text-lg text-muted-foreground">
          {isImageMode
            ? "레퍼런스 스타일로 작성할 주제를 입력하세요"
            : "쓰레드 작성 시 추가로 반영할 내용을 입력하세요"}
        </p>
      </div>

      <div className="grid gap-6 max-w-lg mx-auto">
        {isImageMode && (
          <div className="space-y-2">
            <Label htmlFor="threadsTopic" className="text-base font-semibold">
              주제 <span className="text-destructive">*</span>
            </Label>
            <Input
              id="threadsTopic"
              placeholder="예: 크루즈 여행 꿀팁, 탈모 샴푸 추천, 여름 스킨케어"
              value={settings.topic}
              onChange={(e) => onChange({ ...settings, topic: e.target.value })}
              className="text-base"
            />
            <p className="text-sm text-muted-foreground">
              레퍼런스와 유사한 구조로 작성할 주제를 입력하세요
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label
            htmlFor="threadsRequirements"
            className="text-base font-semibold"
          >
            추가 요구사항
          </Label>
          <Textarea
            id="threadsRequirements"
            placeholder="예: 20대 타겟, 특정 관점 강조, 특정 정보 포함 등"
            value={settings.requirements}
            onChange={(e) =>
              onChange({ ...settings, requirements: e.target.value })
            }
            className="min-h-[120px] resize-y text-base"
          />
          <p className="text-sm text-muted-foreground">
            쓰레드 작성 시 특별히 반영할 내용을 자유롭게 입력하세요 (선택사항)
          </p>
        </div>
      </div>
    </div>
  );
}
