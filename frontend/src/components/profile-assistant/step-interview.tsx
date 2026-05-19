"use client";

/**
 * 단계별 인터뷰 공용 컴포넌트.
 *
 * 브랜드·AEO 도우미가 공유. 질문 배열을 받아 한 칸씩 묻고,
 * 각 칸에 예시 박스를 시각적으로 강조해서 사용자가 막막함 없이 답하게 한다.
 *
 * [잘 모르겠음 → 다음] 버튼으로 스킵 가능. 마지막에 모든 답변을 부모에 전달하면
 * 부모가 자유텍스트로 직렬화 후 기존 /api/.../profile-assist 호출.
 */
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ArrowLeft, ArrowRight, SkipForward } from "lucide-react";

export type InterviewQuestionKind = "text" | "textarea" | "list" | "two-fields";

export interface InterviewQuestion {
  /** 부모가 답변을 구분하기 위한 키 (예: "name", "narratorAuthority") */
  id: string;
  /** 화면에 보여주는 친절 서술문 질문 */
  label: string;
  /** 예시 박스에 표시되는 텍스트. 여러 줄 가능 */
  example: string;
  /** 입력 형태 */
  kind: InterviewQuestionKind;
  /** two-fields 전용 — 두 input의 라벨 */
  fieldA?: string;
  fieldB?: string;
  /** 필수 여부 — 필수면 빈 답으로 다음 못 감 (잘 모르겠음 버튼은 따로 동작) */
  required?: boolean;
}

/** 한 질문에 대한 사용자 답변 */
export interface InterviewAnswer {
  /** 사용자가 직접 답했는지 ([잘 모르겠음] 누르면 false) */
  answered: boolean;
  /** text/textarea: string, list: string[](줄바꿈 split), two-fields: {a, b} */
  value: string | string[] | { a: string; b: string };
}

export type InterviewAnswers = Record<string, InterviewAnswer>;

interface StepInterviewProps {
  questions: InterviewQuestion[];
  /** 모든 단계 끝나면 호출. answers는 questions.id 키로 매핑된 답변 */
  onComplete: (answers: InterviewAnswers) => void;
  /** 사용자가 인터뷰를 취소 (이전 단계 모드 선택으로 돌아가기 등) */
  onCancel: () => void;
  /** 인터뷰 화면 상단에 표시되는 헤더 라벨 (예: "AI 브랜드 프로필 도우미") */
  headerLabel?: string;
}

const EMPTY_VALUE = (kind: InterviewQuestionKind): InterviewAnswer["value"] => {
  switch (kind) {
    case "text":
    case "textarea":
      return "";
    case "list":
      return [];
    case "two-fields":
      return { a: "", b: "" };
  }
};

const isAnswerEmpty = (q: InterviewQuestion, v: InterviewAnswer["value"]): boolean => {
  switch (q.kind) {
    case "text":
    case "textarea":
      return !(v as string).trim();
    case "list":
      return (v as string[]).length === 0;
    case "two-fields": {
      const tf = v as { a: string; b: string };
      return !tf.a.trim() && !tf.b.trim();
    }
  }
};

export function StepInterview({
  questions,
  onComplete,
  onCancel,
  headerLabel = "AI 도우미",
}: StepInterviewProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState<InterviewAnswers>(() => {
    const init: InterviewAnswers = {};
    for (const q of questions) {
      init[q.id] = { answered: false, value: EMPTY_VALUE(q.kind) };
    }
    return init;
  });

  const total = questions.length;
  const q = questions[stepIdx];
  const current = answers[q.id];

  const progressDots = useMemo(() => {
    return Array.from({ length: total }).map((_, i) => (i <= stepIdx ? "●" : "○")).join("");
  }, [stepIdx, total]);

  const updateValue = (next: InterviewAnswer["value"]) => {
    setAnswers((prev) => ({
      ...prev,
      [q.id]: { answered: true, value: next },
    }));
  };

  const handleSkip = () => {
    // 잘 모르겠음 → 비우고 다음
    setAnswers((prev) => ({
      ...prev,
      [q.id]: { answered: false, value: EMPTY_VALUE(q.kind) },
    }));
    advance();
  };

  const advance = () => {
    if (stepIdx + 1 < total) {
      setStepIdx(stepIdx + 1);
    } else {
      onComplete(answers);
    }
  };

  const handleNext = () => {
    // 답이 비어있으면 [잘 모르겠음]과 동일 처리. 필수일 경우만 막음.
    if (isAnswerEmpty(q, current.value)) {
      if (q.required) return;
      handleSkip();
      return;
    }
    advance();
  };

  const handlePrev = () => {
    if (stepIdx > 0) setStepIdx(stepIdx - 1);
  };

  /**
   * 공용 키보드 핸들러 — 모든 입력 종류에서:
   *   - Enter → 다음 단계 (Shift+Enter는 textarea/list에선 줄바꿈)
   *   - IME(한글 조합) 중 Enter는 무시 — 조합 완료 신호로 잡혀서 다음으로 넘어가는 사고 방지
   */
  const handleEnterKey = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    if (e.shiftKey) return; // Shift+Enter → 기본 동작(textarea에서 줄바꿈)
    // 한글 등 IME 조합 중에는 무시
    const nativeEvt = e.nativeEvent as KeyboardEvent;
    if (nativeEvt.isComposing || nativeEvt.keyCode === 229) return;
    e.preventDefault();
    handleNext();
  };

  const renderInput = () => {
    if (q.kind === "text") {
      return (
        <Input
          autoFocus
          value={(current.value as string) ?? ""}
          onChange={(e) => updateValue(e.target.value)}
          onKeyDown={handleEnterKey}
        />
      );
    }
    if (q.kind === "textarea") {
      return (
        <>
          <Textarea
            autoFocus
            rows={5}
            value={(current.value as string) ?? ""}
            onChange={(e) => updateValue(e.target.value)}
            onKeyDown={handleEnterKey}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            * Enter로 다음 단계 / Shift+Enter로 줄바꿈
          </p>
        </>
      );
    }
    if (q.kind === "list") {
      const lines = current.value as string[];
      return (
        <>
          <Textarea
            autoFocus
            rows={5}
            value={lines.join("\n")}
            onChange={(e) =>
              updateValue(e.target.value.split("\n").map((s) => s.trim()).filter(Boolean))
            }
            onKeyDown={handleEnterKey}
            placeholder="한 줄에 하나씩 (Shift+Enter로 줄 추가)"
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            * Shift+Enter로 항목 추가 / Enter로 다음 단계
          </p>
        </>
      );
    }
    // two-fields
    const tf = current.value as { a: string; b: string };
    return (
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">{q.fieldA ?? "A"}</Label>
          <Input
            autoFocus
            value={tf.a}
            onChange={(e) => updateValue({ ...tf, a: e.target.value })}
            onKeyDown={handleEnterKey}
          />
        </div>
        <div>
          <Label className="text-xs">{q.fieldB ?? "B"}</Label>
          <Input
            value={tf.b}
            onChange={(e) => updateValue({ ...tf, b: e.target.value })}
            onKeyDown={handleEnterKey}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 헤더 + 진행률 */}
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-muted-foreground">{headerLabel}</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {stepIdx + 1} / {total} <span className="ml-2 tracking-tighter">{progressDots}</span>
        </div>
      </div>

      {/* 질문 */}
      <div className="space-y-1">
        <h3 className="text-base font-semibold leading-relaxed">
          Q{stepIdx + 1}. {q.label}
        </h3>
      </div>

      {/* 예시 박스 — 강조 표시 */}
      <div className="rounded-lg border bg-amber-50 dark:bg-amber-950/20 p-3 text-sm">
        <div className="text-[11px] font-semibold text-amber-900 dark:text-amber-200 mb-1">
          💡 예시 (이렇게 적으면 돼요)
        </div>
        <pre className="whitespace-pre-wrap font-sans text-[13px] leading-relaxed text-amber-950 dark:text-amber-100">
          {q.example}
        </pre>
      </div>

      {/* 입력 */}
      <div className="space-y-1">
        {renderInput()}
      </div>

      {/* 액션 */}
      <div className="flex items-center justify-between pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={stepIdx === 0 ? onCancel : handlePrev}
          className="gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          {stepIdx === 0 ? "취소" : "이전"}
        </Button>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="gap-1 text-muted-foreground"
            disabled={q.required}
            title={q.required ? "이 단계는 필수입니다" : "이 칸은 비우고 다음 단계로"}
          >
            <SkipForward className="h-3 w-3" />
            잘 모르겠음
          </Button>
          <Button
            size="sm"
            onClick={handleNext}
            disabled={q.required && isAnswerEmpty(q, current.value)}
            className="gap-1"
          >
            {stepIdx + 1 === total ? "완료" : "다음"}
            <ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * 인터뷰 답변을 LLM에 보낼 자유텍스트로 직렬화.
 *
 * 사용자가 답한 칸만 포함. [잘 모르겠음] 누른 칸은 제외 → LLM이 빈 칸으로 인식하고 추론.
 */
export function serializeInterviewAnswers(
  questions: InterviewQuestion[],
  answers: InterviewAnswers,
): string {
  const lines: string[] = [];
  for (const q of questions) {
    const a = answers[q.id];
    if (!a || !a.answered) continue;
    if (isAnswerEmpty(q, a.value)) continue;
    if (q.kind === "two-fields") {
      const tf = a.value as { a: string; b: string };
      const parts: string[] = [];
      if (tf.a.trim()) parts.push(`${q.fieldA ?? "A"}: ${tf.a.trim()}`);
      if (tf.b.trim()) parts.push(`${q.fieldB ?? "B"}: ${tf.b.trim()}`);
      if (parts.length) lines.push(`${q.label}\n  ${parts.join("\n  ")}`);
    } else if (q.kind === "list") {
      const items = a.value as string[];
      if (items.length) {
        lines.push(`${q.label}\n${items.map((s) => `- ${s}`).join("\n")}`);
      }
    } else {
      const v = (a.value as string).trim();
      if (v) lines.push(`${q.label}\n${v}`);
    }
  }
  return lines.join("\n\n");
}

/** 사용자가 직접 답한 필드 ID 목록 (잘 모르겠음으로 비운 것 제외) */
export function getAnsweredFieldIds(
  questions: InterviewQuestion[],
  answers: InterviewAnswers,
): string[] {
  return questions
    .filter((q) => {
      const a = answers[q.id];
      if (!a || !a.answered) return false;
      return !isAnswerEmpty(q, a.value);
    })
    .map((q) => q.id);
}
