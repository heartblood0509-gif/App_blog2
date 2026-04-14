"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  RefreshCw,
  Check,
  Pencil,
  Loader2,
  Sparkles,
  Type,
} from "lucide-react";
import type { TitleSuggestion } from "@/types";

interface StepTitleSelectProps {
  titles: TitleSuggestion[];
  selectedTitle: string;
  onSelect: (title: string) => void;
  onRegenerate: () => void;
  isLoading: boolean;
}

export function StepTitleSelect({
  titles,
  selectedTitle,
  onSelect,
  onRegenerate,
  isLoading,
}: StepTitleSelectProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [customTitle, setCustomTitle] = useState("");

  const handleCustomTitleConfirm = () => {
    if (customTitle.trim()) {
      onSelect(customTitle.trim());
      setIsEditing(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">제목 선택</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            생성된 제목 중 하나를 선택하거나 직접 입력하세요
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={onRegenerate}
          disabled={isLoading}
          className="gap-2"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4" />
          )}
          재생성
        </Button>
      </div>

      {/* Loading State */}
      {isLoading && titles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="mt-4 text-sm text-muted-foreground">
            제목을 생성하고 있습니다...
          </p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && titles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20">
          <Sparkles className="h-10 w-10 text-muted-foreground/50" />
          <p className="mt-4 text-sm text-muted-foreground">
            이전 단계를 완료하면 제목이 자동으로 생성됩니다
          </p>
        </div>
      )}

      {/* Title Cards */}
      {titles.length > 0 && (
        <div className="space-y-3">
          {titles.map((suggestion, index) => {
            const isSelected = selectedTitle === suggestion.title;
            return (
              <motion.div
                key={`${suggestion.title}-${index}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card
                  className={`cursor-pointer transition-all duration-200 ${
                    isSelected
                      ? "ring-2 ring-primary bg-primary/5"
                      : "hover:ring-1 hover:ring-muted-foreground/30"
                  }`}
                  onClick={() => onSelect(suggestion.title)}
                >
                  <CardContent className="flex items-center gap-3 px-4 py-3">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {isSelected ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        index + 1
                      )}
                    </div>
                    <span
                      className={`flex-1 text-sm ${
                        isSelected ? "font-medium" : ""
                      }`}
                    >
                      {suggestion.title}
                    </span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                      {suggestion.type}
                    </Badge>
                  </CardContent>
                </Card>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Custom Title Input */}
      <Separator className="my-6" />

      <div>
        {!isEditing ? (
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setIsEditing(true)}
          >
            <Pencil className="h-4 w-4" />
            직접 입력
          </Button>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <Label className="flex items-center gap-2 text-sm">
              <Type className="h-4 w-4" />
              직접 제목 입력
            </Label>
            <div className="flex gap-2">
              <Input
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                placeholder="원하는 제목을 입력하세요"
                className="flex-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCustomTitleConfirm();
                }}
              />
              <Button
                size="default"
                onClick={handleCustomTitleConfirm}
                disabled={!customTitle.trim()}
              >
                확인
              </Button>
              <Button
                variant="outline"
                size="default"
                onClick={() => {
                  setIsEditing(false);
                  setCustomTitle("");
                }}
              >
                취소
              </Button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Selected Title Display */}
      {selectedTitle && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-6 rounded-lg border border-primary/30 bg-primary/5 p-4"
        >
          <p className="text-xs text-muted-foreground">선택된 제목</p>
          <p className="mt-1 font-medium">{selectedTitle}</p>
        </motion.div>
      )}
    </div>
  );
}
