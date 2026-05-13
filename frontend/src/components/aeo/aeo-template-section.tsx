"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, ListChecks, Check } from "lucide-react";
import type { AeoTemplateId } from "@/types/aeo";

type TemplateCard = {
  id: AeoTemplateId;
  name: string;
  description: string;
  icon: React.ElementType;
  enabled: boolean;
};

const TEMPLATES: TemplateCard[] = [
  {
    id: "informational",
    name: "정보성글",
    description: "원리·원인·해결법을 직답 구조로 정리. AI가 '왜·어떻게' 질문에 인용하기 좋음.",
    icon: BookOpen,
    enabled: true,
  },
  {
    id: "comparison",
    name: "비교·추천글",
    description: "여러 옵션을 기준대로 비교하고 상황별 추천. AI가 '추천해줘' 질문에 가장 자주 인용하는 형식.",
    icon: ListChecks,
    enabled: true,
  },
];

interface AeoTemplateSectionProps {
  selectedTemplate: AeoTemplateId | null;
  onTemplateChange: (template: AeoTemplateId) => void;
}

export function AeoTemplateSection({
  selectedTemplate,
  onTemplateChange,
}: AeoTemplateSectionProps) {
  return (
    <section>
      <div className="mb-4">
        <h2 className="text-xl font-semibold">글 타입</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          어떤 종류의 AEO 글을 만들지 선택하세요 (AI에 어떤 질문으로 노출되고 싶은지)
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {TEMPLATES.map((tpl) => {
          const selected = selectedTemplate === tpl.id;
          const Icon = tpl.icon;
          const disabled = !tpl.enabled;

          return (
            <Card
              key={tpl.id}
              onClick={() => !disabled && onTemplateChange(tpl.id)}
              className={`transition-all duration-200 ${
                disabled
                  ? "opacity-50 cursor-not-allowed"
                  : "cursor-pointer hover:ring-1 hover:ring-muted-foreground/30"
              } ${selected ? "ring-2 ring-primary bg-primary/5" : ""}`}
            >
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Icon className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">{tpl.name}</CardTitle>
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
              </CardHeader>
              <CardContent>
                <CardDescription className="text-xs leading-relaxed">
                  {tpl.description}
                </CardDescription>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
