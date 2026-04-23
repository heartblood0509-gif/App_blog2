"use client";

import { useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Search, User, FileText, Hash, Type } from "lucide-react";
import type { WizardState, CharCountRange } from "@/types";

const PERSONA_PRESETS = [
  "20대 여성 직장인",
  "30대 주부",
  "40대 남성",
  "20대 남성 대학생",
  "30대 여성 워킹맘",
  "50대 여성",
];

const CHAR_COUNT_OPTIONS: CharCountRange[] = [
  { min: 1500, max: 2000, label: "1500~2000자" },
  { min: 0, max: 0, label: "레퍼런스 맞춤" },
];

interface StepSettingsProps {
  state: WizardState;
  onChange: (partial: Partial<WizardState>) => void;
}

export function StepSettings({ state, onChange }: StepSettingsProps) {
  const handleCharCountSelect = useCallback(
    (option: CharCountRange) => {
      onChange({ charCountRange: option });
    },
    [onChange]
  );

  const handlePersonaPreset = useCallback(
    (preset: string) => {
      onChange({ persona: preset });
    },
    [onChange]
  );

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-xl font-semibold">글 설정</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          키워드, 페르소나, 기타 요구사항을 설정하세요
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Left Column */}
        <div className="space-y-6">
          {/* Main Keyword */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Search className="h-4 w-4" />
                메인 키워드
                <Badge variant="destructive" className="text-[10px]">
                  필수
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="예: 탈모샴푸 추천"
                value={state.mainKeyword}
                onChange={(e) => onChange({ mainKeyword: e.target.value })}
              />
            </CardContent>
          </Card>

          {/* Sub Keywords */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Hash className="h-4 w-4" />
                서브 키워드
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Input
                placeholder="쉼표로 구분 (예: 두피케어, 민감성두피)"
                value={state.subKeywords}
                onChange={(e) => onChange({ subKeywords: e.target.value })}
              />
              <p className="mt-2 text-xs text-muted-foreground">
                본문에 자연스럽게 포함될 서브 키워드를 입력하세요
              </p>
            </CardContent>
          </Card>

          {/* Persona */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <User className="h-4 w-4" />
                페르소나
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-3 flex flex-wrap gap-2">
                {PERSONA_PRESETS.map((preset) => (
                  <Button
                    key={preset}
                    variant={state.persona === preset ? "default" : "outline"}
                    size="xs"
                    onClick={() => handlePersonaPreset(preset)}
                  >
                    {preset}
                  </Button>
                ))}
              </div>
              <Textarea
                placeholder="글을 작성하는 사람의 페르소나를 설정하세요"
                value={state.persona}
                onChange={(e) => onChange({ persona: e.target.value })}
                className="min-h-[60px]"
              />
            </CardContent>
          </Card>
        </div>

        {/* Right Column */}
        <div className="space-y-6">
          {/* Requirements */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" />
                추가 요구사항
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="특별히 강조하고 싶은 내용이나 포함/제외할 내용을 작성하세요"
                value={state.requirements}
                onChange={(e) => onChange({ requirements: e.target.value })}
                className="min-h-[100px]"
              />
            </CardContent>
          </Card>

          {/* Character Count */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Type className="h-4 w-4" />
                글자수 설정
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex gap-3">
                {CHAR_COUNT_OPTIONS.map((option) => {
                  const selected =
                    state.charCountRange.label === option.label;
                  return (
                    <Button
                      key={option.label}
                      variant={selected ? "default" : "outline"}
                      size="sm"
                      className="flex-1"
                      onClick={() => handleCharCountSelect(option)}
                    >
                      {option.label}
                    </Button>
                  );
                })}
              </div>
              {state.charCountRange.label === "레퍼런스 맞춤" && (
                <p className="mt-2 text-xs text-muted-foreground">
                  레퍼런스 글의 글자수에 맞춰 생성됩니다
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
