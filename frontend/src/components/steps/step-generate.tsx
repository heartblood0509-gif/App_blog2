"use client";

import { motion } from "framer-motion";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  RefreshCw,
  Copy,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  FileText,
  Hash,
  Type,
  BarChart3,
  ShieldAlert,
  Heading,
  Wrench,
} from "lucide-react";
import type { QualityResult } from "@/types";
import { BlogContentRenderer } from "@/components/blog-content-renderer";

interface StepGenerateProps {
  content: string;
  qualityResult: QualityResult | null;
  keyword: string;
  isLoading: boolean;
  onRegenerate: () => void;
  onCopy: () => void;
  onQualityFix: () => void;
}

function MetricRow({
  icon: Icon,
  label,
  value,
  status,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  status?: "pass" | "fail" | "warn";
}) {
  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{value}</span>
        {status === "pass" && (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        )}
        {status === "fail" && <XCircle className="h-4 w-4 text-red-500" />}
        {status === "warn" && (
          <AlertTriangle className="h-4 w-4 text-yellow-500" />
        )}
      </div>
    </div>
  );
}

export function StepGenerate({
  content,
  qualityResult,
  keyword,
  isLoading,
  onRegenerate,
  onCopy,
  onQualityFix,
}: StepGenerateProps) {
  // renderContent는 BlogContentRenderer 컴포넌트로 대체

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">글 생성 & 미리보기</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            생성된 글을 확인하고 품질 검증 결과를 검토하세요
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCopy}
            disabled={!content || isLoading}
            className="gap-2"
          >
            <Copy className="h-4 w-4" />
            복사
          </Button>
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
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left: Content Preview (60%) */}
        <div className="flex-[3]">
          <Card className="h-full">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4" />
                생성된 글
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading && !content && (
                <div className="flex flex-col items-center justify-center py-20">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="mt-4 text-sm text-muted-foreground">
                    글을 생성하고 있습니다...
                  </p>
                </div>
              )}

              {!isLoading && !content && (
                <div className="flex flex-col items-center justify-center py-20">
                  <FileText className="h-10 w-10 text-muted-foreground/50" />
                  <p className="mt-4 text-sm text-muted-foreground">
                    이전 단계를 완료하면 글이 자동으로 생성됩니다
                  </p>
                </div>
              )}

              {content && (
                <ScrollArea className="h-[500px] pr-4">
                  <div>
                    {isLoading && (
                      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        생성 중...
                      </div>
                    )}
                    <BlogContentRenderer text={content} />
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Quality Panel (40%) */}
        <div className="flex-[2]">
          <Card className="h-full">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <BarChart3 className="h-4 w-4" />
                  품질 검증
                </CardTitle>
                {qualityResult && (
                  <Badge
                    variant={qualityResult.isPass ? "default" : "destructive"}
                  >
                    {qualityResult.isPass ? "통과" : "미통과"}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!qualityResult && (
                <div className="flex flex-col items-center justify-center py-16">
                  <BarChart3 className="h-8 w-8 text-muted-foreground/50" />
                  <p className="mt-3 text-xs text-muted-foreground">
                    글이 생성되면 품질 검증이 자동으로 실행됩니다
                  </p>
                </div>
              )}

              {qualityResult && (
                <div className="space-y-1">
                  {/* Fail Reasons + Fix Button */}
                  {!qualityResult.isPass && qualityResult.failReasons.length > 0 && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="mb-3 rounded-md border border-red-500/20 bg-red-500/5 p-3"
                    >
                      <p className="mb-1.5 text-xs font-medium text-red-500">미통과 사유</p>
                      {qualityResult.failReasons.map((reason, i) => (
                        <p key={i} className="text-xs text-red-400">
                          - {reason}
                        </p>
                      ))}
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-3 w-full gap-2 border-red-500/30 text-red-500 hover:bg-red-500/10"
                        onClick={onQualityFix}
                        disabled={isLoading}
                      >
                        {isLoading ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Wrench className="h-3.5 w-3.5" />
                        )}
                        {isLoading ? "수정 중..." : "품질 자동 수정"}
                      </Button>
                    </motion.div>
                  )}

                  {/* Character Count */}
                  <MetricRow
                    icon={Type}
                    label="글자수 (공백 포함)"
                    value={`${qualityResult.charCount.toLocaleString()}자`}
                  />
                  <MetricRow
                    icon={Type}
                    label="글자수 (공백 제외)"
                    value={`${qualityResult.charCountWithoutSpaces.toLocaleString()}자`}
                    status={
                      qualityResult.charCountWithoutSpaces >= 1500 &&
                      qualityResult.charCountWithoutSpaces <= 2200
                        ? "pass"
                        : "fail"
                    }
                  />

                  <Separator />

                  {/* Keyword */}
                  <MetricRow
                    icon={Hash}
                    label={`키워드 "${keyword}" 횟수`}
                    value={`${qualityResult.keywordCount}회`}
                    status={
                      qualityResult.keywordCount >= 3
                        ? "pass"
                        : qualityResult.keywordCount >= 1
                          ? "warn"
                          : "fail"
                    }
                  />
                  <MetricRow
                    icon={BarChart3}
                    label="키워드 밀도"
                    value={`${qualityResult.keywordDensity.toFixed(1)}%`}
                    status={
                      qualityResult.keywordDensity <= 3
                        ? "pass"
                        : "warn"
                    }
                  />

                  <Separator />

                  {/* Structure */}
                  <MetricRow
                    icon={Heading}
                    label="소제목 수"
                    value={`${qualityResult.subheadingCount}개`}
                    status={
                      qualityResult.subheadingCount >= 3
                        ? "pass"
                        : "warn"
                    }
                  />
                  <MetricRow
                    icon={Hash}
                    label="해시태그 수"
                    value={`${qualityResult.hashtagCount}개`}
                    status={
                      qualityResult.hashtagCount >= 5
                        ? "pass"
                        : "warn"
                    }
                  />

                  <Separator />

                  {/* Forbidden Words */}
                  <div className="py-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <ShieldAlert className="h-4 w-4" />
                      <span>금지어 검출</span>
                      <Badge
                        variant={
                          qualityResult.forbiddenWords.length === 0
                            ? "secondary"
                            : "destructive"
                        }
                        className="ml-auto text-[10px]"
                      >
                        {qualityResult.forbiddenWords.length}건
                      </Badge>
                    </div>
                    {qualityResult.forbiddenWords.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-2 space-y-1"
                      >
                        {qualityResult.forbiddenWords.map((fw, i) => (
                          <div
                            key={i}
                            className="flex items-center gap-2 text-xs"
                          >
                            <span className="text-red-400 line-through">
                              {fw.word}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            <span className="text-green-400">
                              {fw.replacement}
                            </span>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </div>

                  {/* Ad Expressions */}
                  <div className="py-2">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="h-4 w-4" />
                      <span>광고성 표현</span>
                      <Badge
                        variant={
                          qualityResult.adExpressions.length === 0
                            ? "secondary"
                            : "destructive"
                        }
                        className="ml-auto text-[10px]"
                      >
                        {qualityResult.adExpressions.length}건
                      </Badge>
                    </div>
                    {qualityResult.adExpressions.length > 0 && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="mt-2 flex flex-wrap gap-1"
                      >
                        {qualityResult.adExpressions.map((expr, i) => (
                          <Badge
                            key={i}
                            variant="outline"
                            className="text-[10px] text-red-400"
                          >
                            {expr}
                          </Badge>
                        ))}
                      </motion.div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
