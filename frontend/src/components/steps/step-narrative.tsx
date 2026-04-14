"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Heart, Zap, ArrowRight, Check } from "lucide-react";
import type { NarrativeType, ToneType } from "@/types";

// Local narrative data (from server-only narrative-templates.ts)
const NARRATIVES: {
  id: NarrativeType;
  name: string;
  description: string;
  icon: React.ElementType;
  flow: string[];
}[] = [
  {
    id: "empathy-first",
    name: "감정 선공형",
    description:
      "공감 먼저 때리는 구조. 스트레스 상황으로 시작해서 독자의 공감을 얻은 뒤, 자연스럽게 해결 과정으로 이어지는 흐름.",
    icon: Heart,
    flow: [
      "스트레스",
      "문제 인식",
      "악화",
      "시도",
      "실패",
      "깨달음",
      "기준 변화",
      "제품 발견",
      "변화",
      "루틴",
      "마무리",
    ],
  },
  {
    id: "conclusion-first",
    name: "결론 선공형",
    description:
      "결과 먼저 보여주는 구조. '지금은 괜찮아졌다'로 시작해서 어떻게 여기까지 왔는지 과거를 회상하는 흐름.",
    icon: Zap,
    flow: [
      "현재 상태",
      "과거 문제",
      "스트레스",
      "시도들",
      "실패",
      "깨달음",
      "새 접근",
      "변화",
      "마무리",
    ],
  },
];

// Local tone data (from server-only tone-rules.ts)
const TONES: {
  type: ToneType;
  description: string;
  example: string;
}[] = [
  {
    type: "존댓말",
    description: "친한 언니/형이 카페에서 조언해주는 느낌",
    example: `처음에는 그냥 그러려니 했거든요
별로 심각하게 생각 안 했어요
근데 어느 순간부터 계속 신경 쓰이기 시작했어요
이게 반복되니까 스트레스가 쌓이더라고요
그래서 이것저것 알아보기 시작했어요`,
  },
  {
    type: "반말",
    description: "같은 또래 친구한테 편하게 얘기하는 느낌",
    example: `처음에는 그냥 그러려니 했거든
별로 심각하게 생각 안 했어
근데 어느 순간부터 계속 신경 쓰이기 시작했어
이게 반복되니까 스트레스가 쌓이더라
그래서 이것저것 알아보기 시작했어`,
  },
  {
    type: "음슴체",
    description: "커뮤니티 후기 느낌. 건조하지만 솔직한 톤",
    example: `처음엔 별 생각 없었음
그냥 그러려니 했음
근데 이게 계속 반복됨
점점 신경 쓰이기 시작했음
그래서 알아보기 시작함`,
  },
];

interface StepNarrativeProps {
  narrativeType: NarrativeType | null;
  toneType: ToneType | null;
  onNarrativeChange: (type: NarrativeType) => void;
  onToneChange: (type: ToneType) => void;
}

export function StepNarrative({
  narrativeType,
  toneType,
  onNarrativeChange,
  onToneChange,
}: StepNarrativeProps) {
  return (
    <div className="space-y-10">
      {/* Narrative Structure Section */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">서사 구조</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            글의 전체적인 흐름을 선택하세요
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {NARRATIVES.map((narrative) => {
            const selected = narrativeType === narrative.id;
            const Icon = narrative.icon;

            return (
              <Card
                key={narrative.id}
                className={`cursor-pointer transition-all duration-200 ${
                  selected
                    ? "ring-2 ring-primary bg-primary/5"
                    : "hover:ring-1 hover:ring-muted-foreground/30"
                }`}
                onClick={() => onNarrativeChange(narrative.id)}
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">{narrative.name}</CardTitle>
                    </div>
                    {selected && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="flex h-6 w-6 items-center justify-center rounded-full bg-primary"
                      >
                        <Check className="h-3.5 w-3.5 text-primary-foreground" />
                      </motion.div>
                    )}
                  </div>
                  <CardDescription className="text-xs leading-relaxed">
                    {narrative.description}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Flow Visualization */}
                  <div className="flex flex-wrap items-center gap-1">
                    {narrative.flow.map((step, i) => (
                      <span key={step} className="flex items-center gap-1">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                            selected
                              ? "bg-primary/15 text-primary"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {step}
                        </span>
                        {i < narrative.flow.length - 1 && (
                          <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                        )}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <Separator />

      {/* Tone Section */}
      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold">말투 선택</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            글의 어조와 문체를 선택하세요
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          {TONES.map((tone) => {
            const selected = toneType === tone.type;
            return (
              <Button
                key={tone.type}
                variant={selected ? "default" : "outline"}
                size="lg"
                className={`h-auto flex-col items-start gap-1 px-5 py-3 ${
                  selected ? "" : ""
                }`}
                onClick={() => onToneChange(tone.type)}
              >
                <span className="text-sm font-semibold">{tone.type}</span>
                <span
                  className={`text-[11px] font-normal ${
                    selected
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  }`}
                >
                  {tone.description}
                </span>
              </Button>
            );
          })}
        </div>

        {/* Tone Example Preview */}
        <AnimatePresence mode="wait">
          {toneType && (
            <motion.div
              key={toneType}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="mt-5"
            >
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">
                    {toneType} 예시
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <pre className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground font-sans">
                    {TONES.find((t) => t.type === toneType)?.example}
                  </pre>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
