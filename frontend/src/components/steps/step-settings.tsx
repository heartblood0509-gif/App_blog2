"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Search, User, FileText, Hash, Type, Link as LinkIcon, MessageCircleQuestion } from "lucide-react";
import type { WizardState, CharCountRange } from "@/types";
import type { AeoProfile, AeoSource } from "@/types/aeo";
import { TargetQuerySelector } from "@/components/aeo/target-query-selector";

const PERSONA_PRESETS = [
  "20대 여성 직장인",
  "30대 주부",
  "40대 남성",
  "20대 남성 대학생",
  "30대 여성 워킹맘",
  "50대 여성",
];

const CHAR_COUNT_OPTIONS: CharCountRange[] = [
  { min: 0, max: 0, label: "레퍼런스 맞춤" },
  { min: 1500, max: 2000, label: "1500~2000자" },
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

  // AEO 모드: 선택된 프로필 객체 fetch (TargetQuerySelector에 전달)
  const [aeoProfile, setAeoProfile] = useState<AeoProfile | null>(null);
  useEffect(() => {
    if (state.postCategory !== "aeo" || !state.selectedAeoProfileId) {
      return;
    }
    let aborted = false;
    fetch("/api/aeo/profiles", { cache: "no-store" })
      .then((res) => res.json())
      .then((list: AeoProfile[]) => {
        if (aborted) return;
        const found = Array.isArray(list)
          ? list.find((p) => p.id === state.selectedAeoProfileId) ?? null
          : null;
        setAeoProfile(found);
      })
      .catch(() => {
        if (!aborted) setAeoProfile(null);
      });
    return () => {
      aborted = true;
    };
  }, [state.postCategory, state.selectedAeoProfileId]);

  const handleAeoTargetQueriesChange = useCallback(
    (queries: string[]) => {
      onChange({ aeoTargetQueries: queries });
    },
    [onChange]
  );

  const updateAeoSource = useCallback(
    (index: number, partial: Partial<AeoSource>) => {
      const next = [...state.aeoSources];
      next[index] = { ...next[index], ...partial };
      onChange({ aeoSources: next });
    },
    [state.aeoSources, onChange]
  );

  const addAeoSource = useCallback(() => {
    onChange({ aeoSources: [...state.aeoSources, { url: "", note: "" }] });
  }, [state.aeoSources, onChange]);

  const removeAeoSource = useCallback(
    (index: number) => {
      onChange({
        aeoSources: state.aeoSources.filter((_, i) => i !== index),
      });
    },
    [state.aeoSources, onChange]
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
          {/* Topic — 선택 입력. 비우면 키워드만 보고 AI가 알아서 판단. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" />
                주제
                <Badge variant="secondary" className="text-[10px]">
                  선택
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                placeholder="비워두면 키워드만 보고 AI가 알아서 글을 구성합니다.&#10;채워두면 입력한 주제에 정확히 맞춰 제목과 본문이 만들어집니다."
                value={state.topic}
                onChange={(e) => onChange({ topic: e.target.value })}
                rows={3}
              />
            </CardContent>
          </Card>

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

          {/* Persona — 브랜드·AEO 모드에선 작성자 신원이 프로필에 있어서 노출 X */}
          {state.postCategory !== "brand" && state.postCategory !== "aeo" && (
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
          )}
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

      {/* AEO 전용 — 타겟 자연어 질문 + 출처/근거 */}
      {state.postCategory === "aeo" && (
        <>
          <Separator className="my-2" />
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <MessageCircleQuestion className="h-4 w-4" />
                타겟 자연어 질문
                <Badge variant="secondary" className="text-[10px]">AEO</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TargetQuerySelector
                profile={state.postCategory === "aeo" ? aeoProfile : null}
                mainKeyword={state.mainKeyword}
                subKeywords={state.subKeywords}
                topic={state.topic}
                queries={state.aeoTargetQueries}
                onChange={handleAeoTargetQueriesChange}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <LinkIcon className="h-4 w-4" />
                출처·근거 (URL 또는 메모)
                <Badge variant="secondary" className="text-[10px]">선택</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                식약처·논문·협회 가이드 등 권위 있는 자료를 추가하면 AI 인용률이 크게 올라갑니다.
                비워두면 다음 단계에서 한 번 더 알려드릴게요.
              </p>
              {state.aeoSources.length === 0 ? (
                <Button variant="outline" size="sm" onClick={addAeoSource} className="gap-1">
                  + 출처 추가
                </Button>
              ) : (
                <div className="space-y-2">
                  {state.aeoSources.map((src, i) => (
                    <div key={i} className="flex gap-2">
                      <Input
                        placeholder="URL (선택)"
                        value={src.url ?? ""}
                        onChange={(e) => updateAeoSource(i, { url: e.target.value })}
                        className="flex-1"
                      />
                      <Input
                        placeholder='메모 (예: "식약처 의약외품 고시")'
                        value={src.note ?? ""}
                        onChange={(e) => updateAeoSource(i, { note: e.target.value })}
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeAeoSource(i)}
                        className="shrink-0 text-muted-foreground"
                      >
                        삭제
                      </Button>
                    </div>
                  ))}
                  <Button variant="outline" size="sm" onClick={addAeoSource} className="gap-1">
                    + 출처 추가
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
