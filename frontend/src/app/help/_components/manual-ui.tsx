// 사용 매뉴얼 본문 공용 UI 컴포넌트.
// 페이지(/help/start, /help/usage, /help/tools)에서 공통으로 사용.

import { cn } from "@/lib/utils";

/** 본문 최외곽 article — 폭 1100px + 폰트·행간·자간 통일.
 *  스크린샷·표를 시원하게 보여줄 수 있는 폭. 텍스트도 너무 길지 않게 균형.
 */
export function ManualArticle({ children }: { children: React.ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-[1100px] text-[18px] leading-[1.95] tracking-[0.005em] text-foreground/90">
      {children}
    </article>
  );
}

/** 페이지 상단 인트로 박스 — 어떤 페이지인지 한 줄 안내 */
export function PageIntro({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-14 rounded-2xl bg-muted/30 px-7 py-6 ring-1 ring-foreground/5">
      <p className="text-[17px] leading-[1.85] text-foreground/80">{children}</p>
    </div>
  );
}

/** 큰 섹션 (h2) — primary 강조 배경 + 좌측 strip.
 *  number prop으로 좌측 목차의 항목 번호와 일관성 유지 (예: "02"). */
export function Section({
  id,
  number,
  title,
  tone,
  children,
}: {
  id: string;
  number?: string;
  title: string;
  tone?: "warning";
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "mb-24 scroll-mt-6",
        tone === "warning" &&
          "rounded-2xl bg-amber-500/[0.06] px-8 py-8 ring-1 ring-amber-500/20 dark:bg-amber-400/[0.04] dark:ring-amber-400/15",
      )}
    >
      {/* L1 Section 헤더 — 배경 없는 단순 헤더 (목차 톤). 좌측 strip + chip + 큰 텍스트. */}
      <div className="mb-12 flex items-center gap-3.5">
        <span
          className={cn(
            "block h-8 w-[3px] shrink-0 rounded-full",
            tone === "warning" ? "bg-amber-500" : "bg-primary",
          )}
          aria-hidden
        />
        <h2
          className={cn(
            "font-heading text-[32px] font-bold tracking-tight leading-snug",
            tone === "warning"
              ? "text-amber-900 dark:text-amber-100"
              : "text-foreground",
          )}
        >
          {number && (
            <span
              className={cn(
                "mr-3.5 inline-flex h-10 items-center justify-center rounded-md px-2.5 align-middle font-mono text-[18px] font-semibold",
                tone === "warning"
                  ? "bg-amber-500/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300"
                  : "bg-primary/15 text-primary",
              )}
            >
              {number}
            </span>
          )}
          {title}
        </h2>
      </div>

      <div
        className={cn(
          "space-y-6 text-[18px] leading-[1.95]",
          "[&_ul:not(.check-list)]:list-disc [&_ul:not(.check-list)]:space-y-2.5 [&_ul:not(.check-list)]:pl-6",
          "[&_ul:not(.check-list)]:marker:text-primary/40",
          "[&_ol]:list-decimal [&_ol]:space-y-2.5 [&_ol]:pl-6",
          "[&_ol]:marker:text-primary/50 [&_ol]:marker:font-medium",
          "[&_.check-list]:space-y-3 [&_.check-list]:pl-0 [&_.check-list_li]:relative [&_.check-list_li]:pl-9",
          "[&_.check-list_li]:before:absolute [&_.check-list_li]:before:left-0 [&_.check-list_li]:before:top-[0.45em]",
          "[&_.check-list_li]:before:flex [&_.check-list_li]:before:h-[22px] [&_.check-list_li]:before:w-[22px]",
          "[&_.check-list_li]:before:items-center [&_.check-list_li]:before:justify-center",
          "[&_.check-list_li]:before:rounded-md [&_.check-list_li]:before:bg-primary/10",
          "[&_.check-list_li]:before:text-[12px] [&_.check-list_li]:before:font-bold [&_.check-list_li]:before:text-primary",
          "[&_.check-list_li]:before:content-['✓']",
          "[&_strong]:font-semibold [&_strong]:text-foreground",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** 단계 헤딩 (L2) — 정석 docs 패턴: 가로선 + h2 큰 텍스트.
 *  장식 없이 폰트 사이즈와 위 가로선만으로 단계 구분.
 *  id prop으로 좌측 목차 sub-item anchor와 매칭.
 *
 *  사용:
 *    <StageHeading id="wizard-review-step-1" step="1" title="글 구조 — 제품 + 서사 + 말투" />
 */
export function StageHeading({
  id,
  step,
  title,
}: {
  id?: string;
  step: string;
  title: string;
}) {
  return (
    <div
      id={id}
      className="mt-16 first:mt-4 -mx-3 flex items-center gap-3.5 rounded-xl bg-muted/40 px-6 py-5 ring-1 ring-foreground/[0.06] scroll-mt-6"
    >
      <span
        className="block h-7 w-[3px] shrink-0 rounded-full bg-primary"
        aria-hidden
      />
      <h3 className="font-heading text-[24px] font-bold tracking-tight text-foreground leading-snug">
        <span className="text-primary">{step}단계</span>
        <span className="mx-2 text-foreground/30">·</span>
        {title}
      </h3>
    </div>
  );
}

/** 서브 헤딩 (L4) — 번호 없는 부제. 정석 h5 톤 (가장 작은 헤딩). */
export function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h5 className="mt-6 mb-2 font-heading text-[16px] font-semibold tracking-tight text-foreground/85">
      {children}
    </h5>
  );
}

/** 번호 배지 — 옅은 보라 배경 + 보라 폰트 (chip 톤).
 *  캡처와 본문이 같은 시각 언어를 쓰도록 통일. */
export function NumberBadge({
  children,
  size = "md",
}: {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const sizing =
    size === "sm"
      ? "h-7 w-7 text-[13px]"
      : size === "lg"
        ? "h-11 w-11 text-[20px]"
        : "h-9 w-9 text-[17px]";
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg bg-primary/[0.12] font-mono font-bold text-primary ring-1 ring-primary/15",
        sizing,
      )}
      aria-hidden
    >
      {children}
    </span>
  );
}

/** 번호가 있는 서브 헤딩 (L3) — 정석 docs 패턴: h3 인라인 번호 + 제목.
 *  suffix는 같은 줄에 옅은 회색으로 인라인 표시.
 *
 *  사용:
 *    <NumberedSubHeading number="②" title="제품 선택" suffix="— 무엇에 대한 후기인가요?" />
 */
export function NumberedSubHeading({
  number,
  title,
  suffix,
}: {
  number: string;
  title: string;
  suffix?: string;
}) {
  return (
    <h4 className="mt-10 mb-3 font-heading text-[20px] font-semibold tracking-tight text-foreground leading-snug">
      <span className="mr-2 text-[26px] leading-none text-primary align-[-2px]">
        {number}
      </span>
      {title}
      {suffix && (
        <span className="ml-1.5 text-[16px] font-normal text-foreground/55">
          {suffix}
        </span>
      )}
    </h4>
  );
}

/** 인라인 코드 — primary tint */
export function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-primary/[0.08] px-2 py-0.5 font-mono text-[0.9em] tracking-normal text-primary/90">
      {children}
    </code>
  );
}

/** 콜아웃 — 좌측 strip + 옅은 배경 */
export function Callout({
  tone,
  children,
}: {
  tone: "warning" | "danger";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "danger"
      ? "border-l-red-500/70 bg-red-500/[0.05] dark:bg-red-400/[0.04]"
      : "border-l-amber-500/70 bg-amber-500/[0.05] dark:bg-amber-400/[0.04]";
  return (
    <div
      className={cn(
        "my-6 rounded-r-lg border-l-[3px] px-6 py-5 text-[17px] leading-[1.85]",
        toneClass,
      )}
    >
      {children}
    </div>
  );
}

/** 정의 리스트 (카드형) — 부가기능, 도메인, 로그 위치 등 */
export function DefList({
  items,
}: {
  items: { term: React.ReactNode; desc: React.ReactNode }[];
}) {
  return (
    <dl className="my-5 divide-y divide-foreground/5 overflow-hidden rounded-xl ring-1 ring-foreground/5">
      {items.map((it, i) => (
        <div
          key={i}
          className="grid grid-cols-[minmax(140px,190px)_1fr] gap-6 bg-muted/20 px-6 py-5"
        >
          <dt className="text-[16px] font-semibold text-foreground">
            {it.term}
          </dt>
          <dd className="text-[17px] leading-[1.8] text-foreground/80">
            {it.desc}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** 페이지 푸터 한 줄 안내 */
export function ManualFooterNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-16 border-t border-foreground/5 pt-7 text-[14px] text-muted-foreground">
      {children}
    </p>
  );
}
