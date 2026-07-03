"use client";

/**
 * 이미지 비율 선택 공용 컴포넌트.
 * 슬롯 패널(step-generate)과 본문 인라인 이미지 자리(editable-image-slot)가 함께 쓴다.
 *
 * value 는 의도적으로 `string` — 활성 슬롯들의 비율이 제각각이면 "" 를 넘겨
 * "아무 것도 강조 안 함(혼합)" 상태를 표현한다. 3-리터럴 타입으로 좁히거나
 * "" 를 "1:1" 로 강제하면 혼합 상태가 깨진다.
 */

/** 지원 비율 옵션 (슬롯별 토글 + 전체 세터 공용) */
export const ASPECT_OPTIONS: { value: string; label: string }[] = [
  { value: "16:9", label: "16:9" },
  { value: "1:1", label: "1:1" },
  { value: "9:16", label: "9:16" },
];

/** 비율 문자열 → 미리보기 박스 Tailwind aspect 클래스 */
export function aspectToClass(a: string): string {
  return a === "1:1"
    ? "aspect-square"
    : a === "9:16"
      ? "aspect-[9/16]"
      : "aspect-video";
}

/** 컴팩트한 비율 3버튼 토글 */
export function AspectToggle({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (ratio: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex overflow-hidden rounded-md border border-border">
      {ASPECT_OPTIONS.map((opt, i) => {
        const active = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={`px-2 py-1 text-[11px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              i > 0 ? "border-l border-border" : ""
            } ${
              active
                ? "bg-primary text-primary-foreground"
                : "bg-transparent text-muted-foreground hover:bg-muted"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
