"use client";

// 브랜드 블로그 글쓰기 위저드 진입점
// Phase 0: 빈 placeholder. Phase 2 에서 6단계 위저드로 채워짐.

export default function BrandHome() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            브랜드 블로그 생성기
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            브랜드의 정체성을 담은 블로그 포스팅을 단계별로 생성합니다
          </p>
        </div>

        {/* Placeholder */}
        <div className="rounded-lg border border-dashed border-border bg-muted/20 p-12 text-center">
          <p className="text-base font-medium">🚧 브랜드 위저드 준비 중</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Phase 1~3 작업이 완료되면 여기에 6단계 위저드가 채워집니다.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            (현재: Phase 0 — 진입점·골격)
          </p>
        </div>

        {/* 후기성 페이지로 돌아가기 */}
        <div className="mt-8 text-center">
          <a
            href="/"
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            ← 후기성 글쓰기로 가기
          </a>
        </div>
      </div>
    </div>
  );
}
