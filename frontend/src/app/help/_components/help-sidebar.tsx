"use client";

// 매뉴얼 좌측 사이드바.
// 모든 /help/* 페이지에서 공유 (layout.tsx에 위치).
//
// 활성 표시 2단계:
//   1. 페이지 활성 — 현재 URL이 속한 그룹의 카테고리 라벨이 primary로 강조
//   2. 섹션 활성 (scrollspy) — 현재 viewport 상단에 보이는 Section의 항목이
//      배경+strip+chip 으로 강조

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { TOC_GROUPS, PRODUCT_ORDER, findGroupByPage } from "./sections-data";

/** 현재 스크롤 위치 기준으로 활성 섹션 ID를 결정.
 *
 * 동작:
 *   - 화면 상단에서 35% 지점에 가상의 "리딩 라인"을 그음
 *   - 그 라인 위쪽에 시작점이 있는 섹션들 중 가장 아래에 있는 것을 활성으로
 *   - 즉 "방금 지나간 섹션" 이 활성 — docs 사이트 표준 동작
 *
 * IntersectionObserver는 큰 섹션이 viewport에 걸쳐 있을 때 부정확해서 사용 안 함.
 */
function useScrollSpy(sectionIds: string[]): string | null {
  const idsKey = sectionIds.join("|");
  const [activeId, setActiveId] = useState<string | null>(
    sectionIds[0] ?? null,
  );

  useEffect(() => {
    if (sectionIds.length === 0) return;

    const compute = () => {
      const lineY = window.scrollY + window.innerHeight * 0.35;
      let lastPassedId = sectionIds[0] ?? null;

      for (const id of sectionIds) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top + window.scrollY;
        if (top <= lineY) {
          lastPassedId = id;
        }
      }

      // 페이지 하단 도달 시 마지막 섹션 강제 활성
      // — 마지막 섹션이 짧아서 리딩 라인까지 못 올라오는 경우 보정.
      const bottomReached =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 80;
      if (bottomReached && sectionIds.length > 0) {
        lastPassedId = sectionIds[sectionIds.length - 1] ?? lastPassedId;
      }

      setActiveId(lastPassedId);
    };

    // rAF 기반 throttle (성능)
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        compute();
        ticking = false;
      });
    };

    // 초기 1회 + 다음 paint 후 1회 (Section DOM이 막 렌더링됐을 수 있어 한 번 더)
    compute();
    requestAnimationFrame(compute);

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
    // sectionIds 배열 자체보다 안정적인 의존성 (참조 동등성 회피)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  return activeId;
}

export function HelpSidebar() {
  const pathname = usePathname() ?? "";
  const currentGroup = findGroupByPage(pathname);

  // 현재 페이지의 모든 anchor ID (Section + Stage sub-items) 를 scrollspy 대상으로
  const currentSectionIds =
    currentGroup?.items.flatMap((i) => [
      i.id,
      ...(i.children?.map((c) => c.id) ?? []),
    ]) ?? [];
  const activeSectionId = useScrollSpy(currentSectionIds);

  /** Anchor 클릭 시 같은 페이지면 직접 스크롤.
   *  Next.js Link는 동일 URL 클릭을 무시하므로,
   *  scrollspy가 activeId를 갱신한 후 같은 항목 재클릭 시 동작 안 함.
   *  이걸 막기 위해 같은 페이지일 땐 항상 명시적으로 scrollIntoView 호출.
   */
  const handleAnchorClick = (e: React.MouseEvent, targetPage: string, sectionId: string) => {
    if (pathname !== targetPage) return; // 다른 페이지면 Next.js Link 기본 동작
    e.preventDefault();
    const el = document.getElementById(sectionId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    // URL hash 동기화 (뒤로가기·공유 시 유지)
    if (typeof window !== "undefined") {
      window.history.replaceState(null, "", `${targetPage}#${sectionId}`);
    }
  };

  return (
    <nav
      aria-label="목차"
      className="md:sticky md:top-6 md:self-start md:max-h-[calc(100vh-3rem)] md:overflow-y-auto"
    >
      <div className="rounded-2xl bg-gradient-to-b from-muted/40 to-muted/15 px-3 py-6 ring-1 ring-foreground/5">
        {/* 헤더 — primary dot + 라벨 */}
        <div className="mb-5 flex items-center gap-2 px-3">
          <span
            className="block h-1.5 w-1.5 rounded-full bg-primary"
            aria-hidden
          />
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-foreground/70">
            목차
          </p>
        </div>

        <div className="space-y-1">
          {PRODUCT_ORDER.map((product, pi) => {
            const groups = TOC_GROUPS.filter((g) => g.product === product);
            if (groups.length === 0) return null;
            return (
              <div
                key={product}
                className={cn(
                  pi > 0 && "mt-6 border-t-2 border-foreground/10 pt-5",
                )}
              >
                {/* 제품 헤더 */}
                <div className="mb-3 flex items-center gap-2 px-3">
                  <span
                    className="block h-3.5 w-[3px] rounded-full bg-primary"
                    aria-hidden
                  />
                  <p className="text-[13px] font-bold tracking-tight text-foreground">
                    {product}
                  </p>
                </div>
                {groups.map((group, gi) => {
                  const isCurrentGroup = group.page === currentGroup?.page;
                  return (
                    <div
                      key={group.label}
                      className={cn(
                        gi > 0 &&
                          "mt-4 border-t border-foreground/[0.07] pt-4",
                      )}
                    >
                <p
                  className={cn(
                    "mb-2 px-3 text-[10.5px] font-semibold uppercase tracking-[0.16em] transition-colors",
                    isCurrentGroup
                      ? "text-primary"
                      : "text-foreground/45",
                  )}
                >
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map((s, i) => {
                    const isItemActive =
                      isCurrentGroup && activeSectionId === s.id;
                    // 하위 항목 중 하나가 active면 부모도 활성 그룹으로 간주
                    const isChildActive =
                      isCurrentGroup &&
                      s.children?.some(
                        (c) => c.id === activeSectionId,
                      );
                    const isHighlighted = isItemActive || isChildActive;
                    return (
                      <li key={s.id}>
                        <Link
                          href={`${group.page}#${s.id}`}
                          onClick={(e) => handleAnchorClick(e, group.page, s.id)}
                          className={cn(
                            "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium tracking-[-0.005em] transition-all duration-150",
                            isHighlighted
                              ? "bg-background text-foreground shadow-sm ring-1 ring-foreground/[0.06]"
                              : "text-foreground/70 hover:bg-background hover:text-foreground hover:shadow-sm hover:ring-1 hover:ring-foreground/[0.06]",
                          )}
                          aria-current={isItemActive ? "location" : undefined}
                        >
                          {/* 좌측 strip — 활성 또는 hover 시 등장 */}
                          <span
                            className={cn(
                              "absolute left-0 top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-r-full bg-primary transition-opacity duration-150",
                              isHighlighted
                                ? "opacity-100"
                                : "opacity-0 group-hover:opacity-100",
                            )}
                            aria-hidden
                          />

                          {/* 인덱스 chip — 활성 시 primary tint */}
                          <span
                            className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md font-mono text-[12px] font-semibold transition-colors duration-150",
                              isHighlighted
                                ? "bg-primary/15 text-primary"
                                : "bg-foreground/[0.05] text-foreground/50 group-hover:bg-primary/15 group-hover:text-primary",
                            )}
                          >
                            {String(i + 1).padStart(2, "0")}
                          </span>

                          <span className="truncate">{s.title}</span>
                        </Link>

                        {/* 하위 항목 (단계 등) — 부모가 활성/현재 그룹일 때만 표시 */}
                        {s.children && isHighlighted && (
                          <ul className="mt-1 mb-2 ml-[44px] space-y-0.5 border-l border-foreground/10 pl-2">
                            {s.children.map((c) => {
                              const isSubActive =
                                isCurrentGroup && activeSectionId === c.id;
                              return (
                                <li key={c.id}>
                                  <Link
                                    href={`${group.page}#${c.id}`}
                                    onClick={(e) => handleAnchorClick(e, group.page, c.id)}
                                    className={cn(
                                      "relative block rounded-md px-2.5 py-1.5 text-[13.5px] tracking-[-0.005em] transition-all duration-150",
                                      isSubActive
                                        ? "font-semibold text-primary"
                                        : "text-foreground/55 hover:text-foreground",
                                    )}
                                    aria-current={
                                      isSubActive ? "location" : undefined
                                    }
                                  >
                                    {isSubActive && (
                                      <span
                                        className="absolute -left-2.5 top-1/2 h-3 w-[2px] -translate-y-1/2 rounded-r-full bg-primary"
                                        aria-hidden
                                      />
                                    )}
                                    {c.title}
                                  </Link>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                </ul>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        <p className="mt-6 border-t border-foreground/5 px-3 pt-4 text-[12px] leading-relaxed text-muted-foreground/80">
          항목을 누르면 해당 위치로
          <br />
          바로 이동합니다.
        </p>
      </div>
    </nav>
  );
}
