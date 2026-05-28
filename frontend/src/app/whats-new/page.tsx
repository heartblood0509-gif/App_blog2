"use client";

import { useEffect } from "react";
import { AppHeader } from "@/components/AppHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useWhatsNew, type WhatsNewItem } from "@/hooks/use-whats-new";

const TYPE_META: Record<
  WhatsNewItem["type"],
  { label: string; emoji: string }
> = {
  new: { label: "새로 생긴 기능", emoji: "✨" },
  improve: { label: "더 편해진 점", emoji: "💪" },
  fix: { label: "고친 문제", emoji: "🛠" },
};

const TYPE_ORDER: WhatsNewItem["type"][] = ["new", "improve", "fix"];

function formatDate(iso: string): string {
  // YYYY-MM-DD → YYYY.MM.DD (단순 치환, 잘못된 포맷은 원본 그대로)
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.replace(/-/g, ".") : iso;
}

export default function WhatsNewPage() {
  const { entries, loaded, markAllSeen } = useWhatsNew();

  useEffect(() => {
    if (loaded) markAllSeen();
  }, [loaded, markAllSeen]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <AppHeader
          pageTitle="새 소식"
          subtitle="Blog Pick이 어떻게 발전하고 있는지 확인하세요"
        />

        {loaded && entries.length === 0 && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            아직 표시할 새 소식이 없어요.
          </p>
        )}

        <div className="mt-8 flex flex-col gap-6">
          {entries.map((entry) => {
            const grouped = TYPE_ORDER.map((type) => ({
              type,
              items: entry.items.filter((it) => it.type === type),
            })).filter((g) => g.items.length > 0);

            return (
              <Card
                key={entry.version}
                className="border-border/40 bg-muted/40 transition-shadow hover:shadow-sm"
              >
                <CardHeader className="space-y-3">
                  {/* 버전·날짜 — 카드 배경이 회색이라 pill 색 강도를 한 단계 올려 가시성 확보 */}
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center rounded-md bg-foreground/10 px-2 py-0.5 font-mono text-xs font-medium text-foreground/80">
                      v{entry.version}
                    </span>
                    <span className="inline-flex items-center rounded-md bg-foreground/5 px-2 py-0.5 text-xs text-muted-foreground">
                      {formatDate(entry.date)}
                    </span>
                  </div>
                  <CardTitle className="text-xl leading-snug">
                    {entry.title}
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-6">
                  {grouped.map(({ type, items }) => (
                    <section key={type}>
                      {/* 타입 라벨 — 회색 카드 위에서 떠 보이도록 흰색 chip + 옅은 ring */}
                      <h3 className="mb-3">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-background px-2.5 py-1 text-sm font-semibold text-foreground/85 ring-1 ring-border/60">
                          <span aria-hidden>{TYPE_META[type].emoji}</span>
                          {TYPE_META[type].label}
                        </span>
                      </h3>
                      {/* 항목 묶음 — 왼쪽 회색 막대로 시각적 그룹화, 본문은 한 단계 키워 가독성 */}
                      <ul className="flex flex-col gap-2.5 border-l border-border/60 pl-4 text-base leading-7 text-foreground/90">
                        {items.map((item, idx) => (
                          <li
                            key={idx}
                            className="relative pl-4 before:absolute before:left-0 before:top-[0.7em] before:h-1.5 before:w-1.5 before:rounded-full before:bg-muted-foreground/60 before:content-['']"
                          >
                            {item.text}
                          </li>
                        ))}
                      </ul>
                    </section>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}
