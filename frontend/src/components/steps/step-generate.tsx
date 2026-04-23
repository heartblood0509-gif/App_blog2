"use client";

import { motion } from "framer-motion";
import { useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
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
  ImageIcon,
  Upload,
  Sparkles,
  Trash2,
} from "lucide-react";
import type {
  QualityResult,
  ImageSlot,
  UserPhoto,
} from "@/types";
import { BlogContentRenderer } from "@/components/blog-content-renderer";

interface StepGenerateProps {
  content: string;
  qualityResult: QualityResult | null;
  keyword: string;
  isLoading: boolean;
  onRegenerate: () => void;
  onCopy: () => void;
  onQualityFix: () => void;

  // 이미지 관련
  imageSlots: ImageSlot[];
  userPhotosBySlot: Record<string, UserPhoto>;
  excludedSlotIds: string[];
  generatedImages: Record<string, string>;
  isGeneratingBySlot: Record<string, boolean>;
  isImageGenerating: boolean;
  onUserPhotoChange: (slotId: string, photo: UserPhoto | null) => void;
  onUserInstructionChange: (slotId: string, instruction: string) => void;
  onToggleExcluded: (slotId: string, excluded: boolean) => void;
  onGenerateImages: () => void;
  onGenerateSlotAI: (slotId: string) => void;
  onTransformSlot: (slotId: string) => void;
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

// 파일 → base64 변환
async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [prefix, base64] = result.split(",");
      const mime = prefix.match(/data:(.+);base64/)?.[1] || file.type || "image/jpeg";
      resolve({ base64, mimeType: mime });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function SlotCard({
  slot,
  partner,
  userPhoto,
  excluded,
  generatedBase64,
  isGenerating,
  onUserPhotoChange,
  onInstructionChange,
  onToggleExcluded,
  onGenerateAI,
  onTransform,
}: {
  slot: ImageSlot;
  partner?: ImageSlot;
  userPhoto?: UserPhoto;
  excluded: boolean;
  generatedBase64?: string;
  isGenerating: boolean;
  onUserPhotoChange: (photo: UserPhoto | null) => void;
  onInstructionChange: (instruction: string) => void;
  onToggleExcluded: (excluded: boolean) => void;
  onGenerateAI: () => void;
  onTransform: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    const { base64, mimeType } = await fileToBase64(file);
    onUserPhotoChange({
      base64,
      mimeType,
      instruction: userPhoto?.instruction || "",
    });
  };

  const hasPhoto = !!userPhoto;

  return (
    <div
      className={`rounded-lg border bg-card p-4 transition-opacity ${
        excluded ? "opacity-40" : "opacity-100"
      }`}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-[10px]">
              #{slot.index + 1}
            </Badge>
            {slot.index === 0 && (
              <Badge className="text-[10px] bg-amber-500 hover:bg-amber-500 text-white">
                후킹 · 최상단
              </Badge>
            )}
            {slot.groupId && (
              <Badge variant="secondary" className="text-[10px]">
                페어 {slot.pairRole === "first" ? "1" : "2"}
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground line-clamp-2">
            {slot.description}
          </p>
        </div>
        {partner && (
          <Button
            size="sm"
            variant={excluded ? "outline" : "ghost"}
            className="h-7 gap-1 text-[11px]"
            onClick={() => onToggleExcluded(!excluded)}
            title={excluded ? "이 슬롯 사용" : "이 슬롯 제외 (페어 중 1장만 사용)"}
          >
            <Trash2 className="h-3 w-3" />
            {excluded ? "복구" : "제외"}
          </Button>
        )}
      </div>

      {!excluded && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file) await handleFile(file);
              e.target.value = "";
            }}
          />

          {/* 액션 버튼: AI 생성 + (내 사진 | AI 변환) */}
          <div className="mb-3 flex gap-2">
            <Button
              size="sm"
              variant="outline"
              className="flex-1 h-8 gap-1 text-xs"
              onClick={onGenerateAI}
              disabled={isGenerating}
            >
              {isGenerating ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="h-3 w-3" />
              )}
              AI 생성
            </Button>
            {hasPhoto ? (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 gap-1 text-xs"
                onClick={onTransform}
                disabled={isGenerating}
                title="업로드된 사진을 AI로 변환"
              >
                {isGenerating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RefreshCw className="h-3 w-3" />
                )}
                AI 변환
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 h-8 gap-1 text-xs"
                onClick={() => fileInputRef.current?.click()}
                disabled={isGenerating}
              >
                <Upload className="h-3 w-3" />
                내 사진
              </Button>
            )}
          </div>

          {/* 원본 사진 미리보기 + 변환 지시 입력 (사진 업로드 후) */}
          {hasPhoto && (
            <div className="mb-3 space-y-2">
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`data:${userPhoto.mimeType};base64,${userPhoto.base64}`}
                  alt="원본 사진"
                  className="w-full h-20 rounded object-cover"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute top-1 right-1 h-6 px-2 text-[10px]"
                  onClick={() => onUserPhotoChange(null)}
                  title="원본 사진 제거"
                >
                  제거
                </Button>
                <Badge
                  variant="secondary"
                  className="absolute bottom-1 left-1 text-[9px] px-1.5 py-0"
                >
                  원본
                </Badge>
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute bottom-1 right-1 h-6 px-2 text-[10px]"
                  onClick={() => fileInputRef.current?.click()}
                  title="다른 사진으로 교체"
                >
                  교체
                </Button>
              </div>
              <Textarea
                value={userPhoto.instruction || ""}
                onChange={(e) => onInstructionChange(e.target.value)}
                placeholder="AI 변환 지시 (비워두면 거의 그대로. 예: 각도를 살짝 틀거나 배경 정리)"
                rows={2}
                className="text-xs"
              />
              <label className="flex items-center gap-2 cursor-pointer select-none text-[11px] text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3 w-3 cursor-pointer"
                  checked={!!userPhoto.useProModel}
                  onChange={(e) =>
                    onUserPhotoChange({
                      ...userPhoto,
                      useProModel: e.target.checked,
                    })
                  }
                />
                고품질 변환 (Pro 모델 · 느리지만 원본 유사도 더 높음)
              </label>
            </div>
          )}

          {/* 최종 출력 미리보기 */}
          <div className="relative">
            {generatedBase64 ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`data:image/png;base64,${generatedBase64}`}
                alt={slot.description}
                className="w-full h-32 rounded object-cover"
              />
            ) : (
              <div className="flex h-32 items-center justify-center rounded border border-dashed border-border bg-muted/30">
                {isGenerating ? (
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                ) : (
                  <ImageIcon className="h-5 w-5 text-muted-foreground/60" />
                )}
              </div>
            )}
          </div>
        </>
      )}
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
  imageSlots,
  userPhotosBySlot,
  excludedSlotIds,
  generatedImages,
  isGeneratingBySlot,
  isImageGenerating,
  onUserPhotoChange,
  onUserInstructionChange,
  onToggleExcluded,
  onGenerateImages,
  onGenerateSlotAI,
  onTransformSlot,
}: StepGenerateProps) {
  const excludedSet = new Set(excludedSlotIds);
  const activeSlots = imageSlots.filter((s) => !excludedSet.has(s.id));
  const doneCount = activeSlots.filter((s) => generatedImages[s.id]).length;
  const emptyCount = activeSlots.filter(
    (s) => !generatedImages[s.id] && !userPhotosBySlot[s.id]
  ).length;

  // 페어 파트너 맵 (슬롯 id → 같은 그룹의 다른 슬롯)
  const partnerBySlot: Record<string, ImageSlot | undefined> = {};
  for (const slot of imageSlots) {
    if (slot.groupId) {
      const partner = imageSlots.find(
        (s) => s.groupId === slot.groupId && s.id !== slot.id
      );
      partnerBySlot[slot.id] = partner;
    }
  }

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
                    <BlogContentRenderer
                      text={content}
                      imagesByMarkerIndex={Object.fromEntries(
                        imageSlots
                          .filter((s) => generatedImages[s.id])
                          .map((s) => [s.index, { base64: generatedImages[s.id] }])
                      )}
                      excludedIndices={
                        new Set(
                          imageSlots
                            .filter((s) => excludedSet.has(s.id))
                            .map((s) => s.index)
                        )
                      }
                    />
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
                    status={
                      qualityResult.charCount >= 1500 &&
                      qualityResult.charCount <= 2500
                        ? "pass"
                        : "fail"
                    }
                  />
                  <MetricRow
                    icon={Type}
                    label="글자수 (공백 제외)"
                    value={`${qualityResult.charCountWithoutSpaces.toLocaleString()}자`}
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
                  <MetricRow
                    icon={ImageIcon}
                    label="이미지 마커 수"
                    value={`${qualityResult.imageMarkerCount ?? 0}개`}
                    status={
                      (qualityResult.imageMarkerCount ?? 0) >= 8
                        ? "pass"
                        : (qualityResult.imageMarkerCount ?? 0) >= 4
                          ? "warn"
                          : "fail"
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

      {/* 이미지 슬롯 패널 */}
      {imageSlots.length > 0 && (
        <div className="mt-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <ImageIcon className="h-4 w-4" />
                  이미지 슬롯
                  <Badge variant="outline" className="ml-2 text-[10px]">
                    {doneCount} / {activeSlots.length} 생성됨
                  </Badge>
                </CardTitle>
                <Button
                  size="sm"
                  onClick={onGenerateImages}
                  disabled={isImageGenerating || emptyCount === 0}
                  className="gap-2"
                  title="아직 아무것도 없는 슬롯만 AI로 일괄 생성합니다 (사진 업로드된 슬롯은 제외)"
                >
                  {isImageGenerating ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  {isImageGenerating
                    ? "이미지 생성 중..."
                    : emptyCount === 0
                      ? "모두 채워짐"
                      : `빈 슬롯 ${emptyCount}개 AI 일괄 생성`}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {imageSlots.map((slot) => (
                  <SlotCard
                    key={slot.id}
                    slot={slot}
                    partner={partnerBySlot[slot.id]}
                    userPhoto={userPhotosBySlot[slot.id]}
                    excluded={excludedSet.has(slot.id)}
                    generatedBase64={generatedImages[slot.id]}
                    isGenerating={
                      !!isGeneratingBySlot[slot.id] || isImageGenerating
                    }
                    onUserPhotoChange={(p) => onUserPhotoChange(slot.id, p)}
                    onInstructionChange={(instr) =>
                      onUserInstructionChange(slot.id, instr)
                    }
                    onToggleExcluded={(excl) => onToggleExcluded(slot.id, excl)}
                    onGenerateAI={() => onGenerateSlotAI(slot.id)}
                    onTransform={() => onTransformSlot(slot.id)}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
