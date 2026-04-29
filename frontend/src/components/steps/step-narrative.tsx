"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Heart,
  Zap,
  Link as LinkIcon,
  ArrowRight,
  Check,
  AlertCircle,
  Search,
  Loader2,
  ClipboardList,
  ChevronDown,
  ChevronUp,
  Pencil,
  Save,
  X,
} from "lucide-react";
import type { NarrativeSource, ToneType } from "@/types";

type NarrativeOption = {
  id: NarrativeSource;
  name: string;
  description: string;
  icon: React.ElementType;
  flow: string[];
  /** URL 입력 UX: required(필수) | optional(선택) | none(없음) */
  urlInput: "required" | "optional" | "none";
  urlHint?: string;
};

const NARRATIVES: NarrativeOption[] = [
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
    urlInput: "none",
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
    urlInput: "none",
  },
  {
    id: "custom-reference",
    name: "직접 레퍼런스 제공",
    description:
      "참고할 블로그 글 URL을 직접 제공하면, 그 글의 톤과 구조를 그대로 따라 작성합니다.",
    icon: LinkIcon,
    flow: ["레퍼런스 URL 기반 자유 구조"],
    urlInput: "required",
    urlHint: "참고할 블로그 글 URL을 입력하세요.",
  },
];

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
  narrativeSource: NarrativeSource | null;
  referenceUrl: string;
  toneType: ToneType | null;
  toneExample: string;
  onNarrativeSourceChange: (source: NarrativeSource) => void;
  onReferenceUrlChange: (url: string) => void;
  onToneChange: (type: ToneType) => void;
  onToneExampleChange: (example: string) => void;
  // 레퍼런스 분석 (URL 입력 후 명시적 [분석] 버튼으로 트리거)
  referenceAnalysis: string;
  isAnalyzing: boolean;
  onAnalyze: () => void;
  onReferenceAnalysisChange: (value: string) => void;
}

export function StepNarrative({
  narrativeSource,
  referenceUrl,
  toneType,
  toneExample,
  onNarrativeSourceChange,
  onReferenceUrlChange,
  onToneChange,
  onToneExampleChange,
  referenceAnalysis,
  isAnalyzing,
  onAnalyze,
  onReferenceAnalysisChange,
}: StepNarrativeProps) {
  const selectedOption = NARRATIVES.find((n) => n.id === narrativeSource) ?? null;

  // 레퍼런스 분석 보기/수정 패널 상태
  const [isAnalysisOpen, setIsAnalysisOpen] = useState(true);
  const [isAnalysisEditing, setIsAnalysisEditing] = useState(false);
  const [analysisDraft, setAnalysisDraft] = useState(referenceAnalysis);
  // 분석 결과가 갱신될 때 draft 동기화 (편집 중이 아닐 때만)
  if (!isAnalysisEditing && analysisDraft !== referenceAnalysis) {
    setAnalysisDraft(referenceAnalysis);
  }
  const hasAnalysis = referenceAnalysis.trim().length > 0;
  const canAnalyze = referenceUrl.trim().length > 0 && !isAnalyzing;

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

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {NARRATIVES.map((narrative) => {
            const selected = narrativeSource === narrative.id;
            const Icon = narrative.icon;

            return (
              <Card
                key={narrative.id}
                className={`cursor-pointer transition-all duration-200 ${
                  selected
                    ? "ring-2 ring-primary bg-primary/5"
                    : "hover:ring-1 hover:ring-muted-foreground/30"
                }`}
                onClick={() => onNarrativeSourceChange(narrative.id)}
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
                  {narrative.urlInput === "required" && (
                    <div className="mt-3 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-500">
                      <AlertCircle className="h-3 w-3" />
                      레퍼런스 URL 필수
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Reference URL Input (필요한 선택지에서만 노출) */}
        <AnimatePresence mode="wait">
          {selectedOption && selectedOption.urlInput !== "none" && (
            <motion.div
              key={selectedOption.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="mt-5"
            >
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <LinkIcon className="h-4 w-4" />
                    레퍼런스 URL
                    <Badge variant="destructive" className="text-[10px]">
                      필수
                    </Badge>
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {selectedOption.urlHint}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Input
                    type="url"
                    placeholder="https://blog.naver.com/..."
                    value={referenceUrl}
                    onChange={(e) => onReferenceUrlChange(e.target.value)}
                  />

                  {/* 서사 구조 분석 버튼 */}
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted-foreground">
                      {hasAnalysis
                        ? "✓ 분석 완료. 아래에서 결과를 확인하거나 수정할 수 있어요."
                        : "URL을 넣고 [서사 구조 분석] 버튼을 눌러 분석하세요."}
                    </p>
                    <Button
                      type="button"
                      size="sm"
                      onClick={onAnalyze}
                      disabled={!canAnalyze}
                      className="gap-2 shrink-0"
                    >
                      {isAnalyzing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Search className="h-4 w-4" />
                      )}
                      {isAnalyzing
                        ? "분석 중..."
                        : hasAnalysis
                        ? "다시 분석"
                        : "서사 구조 분석"}
                    </Button>
                  </div>

                  {/* 분석 결과 보기/수정 패널 */}
                  {hasAnalysis && (
                    <Card className="bg-muted/20">
                      <CardHeader className="pb-3">
                        <button
                          type="button"
                          onClick={() => setIsAnalysisOpen((v) => !v)}
                          className="flex w-full items-center gap-2 text-left"
                        >
                          <ClipboardList className="h-4 w-4" />
                          <CardTitle className="text-sm">분석 결과</CardTitle>
                          {isAnalysisOpen ? (
                            <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
                          )}
                        </button>
                      </CardHeader>

                      {isAnalysisOpen && (
                        <CardContent className="space-y-3">
                          {!isAnalysisEditing && (
                            <>
                              <div className="flex items-center justify-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="gap-2"
                                  onClick={() => {
                                    setAnalysisDraft(referenceAnalysis);
                                    setIsAnalysisEditing(true);
                                  }}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  수정
                                </Button>
                              </div>
                              <ScrollArea className="h-[520px] w-full rounded-md border bg-background">
                                <div className="px-4 py-3 text-sm leading-relaxed [&>*:first-child]:mt-0">
                                  <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    components={{
                                      h1: (props) => (
                                        <h1 className="mt-5 mb-2 text-base font-bold" {...props} />
                                      ),
                                      h2: (props) => (
                                        <h2 className="mt-5 mb-2 text-sm font-bold" {...props} />
                                      ),
                                      h3: (props) => (
                                        <h3 className="mt-4 mb-1.5 text-sm font-semibold" {...props} />
                                      ),
                                      h4: (props) => (
                                        <h4 className="mt-3 mb-1 text-sm font-semibold" {...props} />
                                      ),
                                      p: (props) => (
                                        <p className="my-2 text-sm leading-relaxed" {...props} />
                                      ),
                                      ul: (props) => (
                                        <ul className="my-2 ml-5 list-disc space-y-1 text-sm" {...props} />
                                      ),
                                      ol: (props) => (
                                        <ol className="my-2 ml-5 list-decimal space-y-1 text-sm" {...props} />
                                      ),
                                      li: (props) => (
                                        <li className="text-sm leading-relaxed" {...props} />
                                      ),
                                      strong: (props) => (
                                        <strong className="font-semibold" {...props} />
                                      ),
                                      em: (props) => <em className="italic" {...props} />,
                                      code: (props) => (
                                        <code
                                          className="rounded bg-muted px-1 py-0.5 font-mono text-xs"
                                          {...props}
                                        />
                                      ),
                                      pre: (props) => (
                                        <pre
                                          className="my-2 overflow-x-auto rounded bg-muted p-3 font-mono text-xs"
                                          {...props}
                                        />
                                      ),
                                      blockquote: (props) => (
                                        <blockquote
                                          className="my-2 border-l-2 border-muted-foreground/30 pl-3 italic text-muted-foreground"
                                          {...props}
                                        />
                                      ),
                                      hr: () => <hr className="my-4 border-border" />,
                                      // 표는 박스 폭을 넘으면 가로 스크롤
                                      table: (props) => (
                                        <div className="my-3 overflow-x-auto">
                                          <table
                                            className="w-full border-collapse text-xs"
                                            {...props}
                                          />
                                        </div>
                                      ),
                                      thead: (props) => (
                                        <thead className="bg-muted/60" {...props} />
                                      ),
                                      th: (props) => (
                                        <th
                                          className="border border-border px-2 py-1.5 text-left font-semibold"
                                          {...props}
                                        />
                                      ),
                                      td: (props) => (
                                        <td
                                          className="border border-border px-2 py-1.5 align-top"
                                          {...props}
                                        />
                                      ),
                                    }}
                                  >
                                    {referenceAnalysis}
                                  </ReactMarkdown>
                                </div>
                              </ScrollArea>
                              <p className="text-xs text-muted-foreground">
                                💡 분석 결과가 마음에 들면 [다음] 버튼으로 진행하세요.
                              </p>
                            </>
                          )}

                          {isAnalysisEditing && (
                            <>
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="gap-2"
                                  onClick={() => {
                                    setAnalysisDraft(referenceAnalysis);
                                    setIsAnalysisEditing(false);
                                  }}
                                >
                                  <X className="h-3.5 w-3.5" />
                                  취소
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="gap-2"
                                  onClick={() => {
                                    onReferenceAnalysisChange(analysisDraft);
                                    setIsAnalysisEditing(false);
                                  }}
                                >
                                  <Save className="h-3.5 w-3.5" />
                                  저장
                                </Button>
                              </div>
                              <Textarea
                                value={analysisDraft}
                                onChange={(e) => setAnalysisDraft(e.target.value)}
                                className="min-h-[420px] font-mono text-sm"
                                placeholder="분석 결과를 직접 수정하세요"
                              />
                              <p className="text-xs text-muted-foreground">
                                저장 후 [다음] 버튼을 누르면 수정된 분석으로 글이 생성됩니다.
                              </p>
                            </>
                          )}
                        </CardContent>
                      )}
                    </Card>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
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
                  <CardDescription className="text-xs">
                    이 예시를 수정하면 AI가 수정된 말투를 참고하여 글을 작성합니다
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Textarea
                    value={toneExample || TONES.find((t) => t.type === toneType)?.example || ""}
                    onChange={(e) => onToneExampleChange(e.target.value)}
                    className="min-h-[140px] text-sm leading-relaxed font-sans"
                    placeholder="말투 예시를 입력하세요..."
                  />
                  {toneExample && toneExample !== TONES.find((t) => t.type === toneType)?.example && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-xs text-muted-foreground"
                      onClick={() => onToneExampleChange(TONES.find((t) => t.type === toneType)?.example || "")}
                    >
                      기본 예시로 되돌리기
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </div>
  );
}
