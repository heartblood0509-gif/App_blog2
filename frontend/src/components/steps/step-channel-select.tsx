"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Layers,
  MessageSquare,
  SquarePlay,
  LayoutGrid,
  Check,
} from "lucide-react";
import type { Channel } from "@/types";

const CHANNELS: Array<{
  id: Channel;
  name: string;
  description: string;
  icon: React.ElementType;
  logoSrc?: string;
  enabled: boolean;
}> = [
  { id: "blog", name: "블로그", description: "네이버 블로그 후기형 포스팅", icon: Layers, logoSrc: "/channel-logos/blog.svg", enabled: true },
  { id: "thread", name: "쓰레드", description: "짧은 호흡의 SNS 포스팅", icon: MessageSquare, logoSrc: "/channel-logos/thread.svg", enabled: true },
  { id: "youtube", name: "유튜브", description: "영상 스크립트 / 자막", icon: SquarePlay, logoSrc: "/channel-logos/youtube.svg", enabled: false },
  { id: "detail-page", name: "상세페이지", description: "쇼핑몰 상품 상세", icon: LayoutGrid, logoSrc: "/channel-logos/detail-page.svg", enabled: false },
];

interface StepChannelSelectProps {
  channel: Channel | null;
  onChannelChange: (channel: Channel) => void;
}

export function StepChannelSelect({ channel, onChannelChange }: StepChannelSelectProps) {
  return (
    <div className="space-y-6">
      <section>
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-semibold">채널 선택</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            어떤 채널의 콘텐츠를 만들지 선택하세요
          </p>
        </div>

        <div className="mx-auto grid w-full max-w-5xl grid-cols-2 gap-4 sm:grid-cols-4 sm:gap-5">
          {CHANNELS.map((ch) => {
            const selected = channel === ch.id;
            const Icon = ch.icon;
            const disabled = !ch.enabled;

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
                    className="absolute right-3 top-3 text-[10px]"
                  >
                    준비 중
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
