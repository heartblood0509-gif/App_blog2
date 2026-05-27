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

        <div className="mt-8 flex flex-col gap-4">
          {entries.map((entry) => {
            const grouped = TYPE_ORDER.map((type) => ({
              type,
              items: entry.items.filter((it) => it.type === type),
            })).filter((g) => g.items.length > 0);

            return (
              <Card key={entry.version}>
                <CardHeader>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-mono">v{entry.version}</span>
                    <span aria-hidden>·</span>
                    <span>{formatDate(entry.date)}</span>
                  </div>
                  <CardTitle className="mt-1 text-lg">{entry.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  {grouped.map(({ type, items }) => (
                    <section key={type}>
                      <h3 className="mb-2 text-sm font-semibold">
                        <span className="mr-1.5" aria-hidden>
                          {TYPE_META[type].emoji}
                        </span>
                        {TYPE_META[type].label}
                      </h3>
                      <ul className="flex flex-col gap-1.5 pl-1 text-sm leading-relaxed text-foreground/90">
                        {items.map((item, idx) => (
                          <li
                            key={idx}
                            className="before:mr-2 before:text-muted-foreground before:content-['•']"
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
