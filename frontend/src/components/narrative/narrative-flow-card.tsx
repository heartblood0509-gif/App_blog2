"use client";

import { motion } from "framer-motion";
import { ArrowRight, Check, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

interface NarrativeFlowCardProps {
  name: string;
  description: string;
  icon: React.ElementType;
  flow: string[];
  selected: boolean;
  onClick: () => void;
  urlRequired?: boolean;
}

export function NarrativeFlowCard({
  name,
  description,
  icon: Icon,
  flow,
  selected,
  onClick,
  urlRequired = false,
}: NarrativeFlowCardProps) {
  return (
    <Card
      className={`cursor-pointer transition-all duration-200 ${
        selected
          ? "ring-2 ring-primary bg-primary/5"
          : "hover:ring-1 hover:ring-muted-foreground/30"
      }`}
      onClick={onClick}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5 text-primary" />
            <CardTitle className="text-base">{name}</CardTitle>
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
        <CardDescription className="text-xs leading-relaxed">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-1">
          {flow.map((step, i) => (
            <span key={step} className="flex items-center gap-1">
              <span
                className={`rounded-md px-2 py-0.5 text-[10px] font-medium ${
                  selected
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {step}
              </span>
              {i < flow.length - 1 && (
                <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
              )}
            </span>
          ))}
        </div>
        {urlRequired && (
          <div className="mt-3 flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-500">
            <AlertCircle className="h-3 w-3" />
            레퍼런스 URL 필수
          </div>
        )}
      </CardContent>
    </Card>
  );
}
