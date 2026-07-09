"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Layers,
  MessageSquare,
  SquarePlay,
  Check,
  Lock,
} from "lucide-react";
import type { Channel } from "@/types";
import { useAuthContext } from "@/lib/auth/auth-context";
import { YOUTUBE_FEATURE_ENABLED } from "@/lib/youtube-feature";

const CHANNELS: Array<{
  id: Channel;
  name: string;
  description: string;
  icon: React.ElementType;
  logoSrc?: string;
  enabled: boolean;
}> = [
  { id: "blog", name: "블로그", description: "네이버 블로그 포스팅", icon: Layers, logoSrc: "/channel-logos/blog.svg", enabled: true },
  { id: "thread", name: "쓰레드", description: "짧은 호흡의 SNS 포스팅", icon: MessageSquare, logoSrc: "/channel-logos/thread.svg", enabled: true },
  { id: "youtube", name: "숏폼", description: "유튜브 · 릴스 · 틱톡", icon: SquarePlay, logoSrc: "/channel-logos/youtube.svg", enabled: true },
];

interface StepChannelSelectProps {
  channel: Channel | null;
  onChannelChange: (channel: Channel) => void;
}

export function StepChannelSelect({ channel, onChannelChange }: StepChannelSelectProps) {
  const { plan } = useAuthContext();
  // 전역 킬스위치가 켜져 있을 때만 plan 게이팅 적용(명시적 'blog'=유튜브 미구매만 차단,
  // null/blog_youtube 는 허용). 킬스위치가 꺼져 있으면 plan 무관하게 "준비 중"으로 잠근다.
  const youtubePlanAllowed = plan !== "blog";

  return (
    <div className="space-y-6">
      <section>
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-semibold">채널 선택</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            어떤 채널의 콘텐츠를 만들지 선택하세요
          </p>
        </div>

        <div className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
          {CHANNELS.map((ch) => {
            const selected = channel === ch.id;
            const Icon = ch.icon;
            // 유튜브 카드: 킬스위치 OFF면 전체 "준비 중", ON이면 plan 미구매자만 "구매 필요".
            const isComingSoon = ch.id === "youtube" && !YOUTUBE_FEATURE_ENABLED;
            const isPlanLocked =
              ch.id === "youtube" && YOUTUBE_FEATURE_ENABLED && !youtubePlanAllowed;
            const disabled = isComingSoon || isPlanLocked || !ch.enabled;

            return (
              <Card
                key={ch.id}
                onClick={disabled ? undefined : () => onChannelChange(ch.id)}
                aria-disabled={disabled}
                role="button"
                tabIndex={disabled ? -1 : 0}
                onKeyDown={(e) => {
                  if (disabled) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onChannelChange(ch.id);
                  }
                }}
                className={`group relative aspect-square transition-all duration-200 ${
                  disabled
                    ? "cursor-not-allowed opacity-50 grayscale"
                    : selected
                      ? "cursor-pointer ring-2 ring-primary bg-primary/5"
                      : "cursor-pointer hover:ring-1 hover:ring-muted-foreground/30 hover:-translate-y-0.5"
                }`}
              >
                {disabled && (
                  <Badge
                    variant="secondary"
                    className="absolute right-3 top-3 flex items-center gap-1 text-[10px]"
                  >
                    {isPlanLocked ? (
                      <>
                        <Lock className="h-2.5 w-2.5" />
                        구매 필요
                      </>
                    ) : (
                      "준비 중"
                    )}
                  </Badge>
                )}
                {!disabled && selected && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-primary"
                  >
                    <Check className="h-4 w-4 text-primary-foreground" />
                  </motion.div>
                )}

                <CardContent className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                  {ch.logoSrc ? (
                    <Image
                      src={ch.logoSrc}
                      alt={`${ch.name} 로고`}
                      width={64}
                      height={64}
                      className="h-16 w-16 rounded-2xl object-contain"
                    />
                  ) : (
                    <div
                      className={`flex h-16 w-16 items-center justify-center rounded-2xl transition-colors ${
                        selected
                          ? "bg-primary/15 text-primary"
                          : "bg-muted text-muted-foreground group-hover:bg-muted/80"
                      }`}
                    >
                      <Icon className="h-8 w-8" />
                    </div>
                  )}
                  <div>
                    <h3 className="text-lg font-semibold leading-tight">
                      {ch.name}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      {ch.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
