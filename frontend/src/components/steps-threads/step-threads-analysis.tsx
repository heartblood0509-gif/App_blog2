"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { CrawlInput } from "./crawl-input";
import { FileUpload } from "./file-upload";
import { AnalysisDisplay } from "./analysis-display";
import { useStreaming } from "@/hooks/use-streaming";
import {
  getAllTemplates,
  saveTemplate,
  deleteTemplate,
  type AnalysisTemplate,
} from "@/lib/threads-templates";
import {
  BookOpen,
  Search,
  Loader2,
  FileText,
  Check,
  ChevronRight,
  Save,
  Trash2,
  ImagePlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import type {
  ThreadsAnalysisMode,
  ThreadsState,
  UploadedImage,
} from "@/types";

interface StepThreadsAnalysisProps {
  threads: ThreadsState;
  onChange: (partial: Partial<ThreadsState>) => void;
}

/**
 * commitAnalysis 헬퍼: 모든 진입점(템플릿 선택, 이미지 분석 완료, 텍스트 입력 완료)에서
 * 반드시 한 번에 호출되어야 하는 부모-state 갱신 묶음.
 */
type CommitArgs = {
  analysisResult: string;
  referenceText: string;
  source: string;
  mode: ThreadsAnalysisMode;
  selectedTemplateId?: string | null;
};

export function StepThreadsAnalysis({
  threads,
  onChange,
}: StepThreadsAnalysisProps) {
  // 화면 모드(내부 UI 표시용). 부모의 analysisMode와는 다를 수 있음(예: image 카드 진입 후 텍스트 완료 시 부모 mode는 crawl).
  const [internalMode, setInternalMode] = useState<ThreadsAnalysisMode>(
    threads.analysisMode === "crawl" ? "image" : threads.analysisMode
  );
  const templateSelectedRef = useRef(false);

  // 부모 mode 변경 시 내부 동기화 (뒤로가기 등) — 템플릿 선택 직후는 제외
  useEffect(() => {
    if (templateSelectedRef.current) {
      templateSelectedRef.current = false;
      return;
    }
    if (threads.analysisMode === null) {
      setInternalMode(null);
    } else if (threads.analysisMode === "template") {
      setInternalMode("template");
    } else {
      // image, crawl 모두 image 화면을 보여줌
      setInternalMode("image");
    }
  }, [threads.analysisMode]);

  const [templates, setTemplates] = useState<AnalysisTemplate[]>([]);
  const [textConfirmed, setTextConfirmed] = useState(
    threads.analysisMode === "crawl"
  );

  const imageInputRef = useRef<HTMLInputElement>(null);

  // 저장 다이얼로그 상태
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDescription, setSaveDescription] = useState("");

  useEffect(() => {
    setTemplates(getAllTemplates());
  }, []);

  const refreshTemplates = () => setTemplates(getAllTemplates());

  const commitAnalysis = useCallback(
    (args: CommitArgs) => {
      onChange({
        analysisMode: args.mode,
        analysisResult: args.analysisResult,
        referenceText: args.referenceText,
        referenceSource: args.source,
        ...(args.selectedTemplateId !== undefined
          ? { selectedTemplateId: args.selectedTemplateId }
          : {}),
      });
    },
    [onChange]
  );

  const {
    data: analysisResult,
    isStreaming: isAnalyzing,
    startStream,
    abortStream,
  } = useStreaming({
    onComplete: (fullText: string) => {
      commitAnalysis({
        analysisResult: fullText,
        referenceText: "",
        source: "이미지 분석",
        mode: "image",
      });
      toast.success("이미지 분석이 완료되었습니다.");
    },
    onError: (msg: string) => toast.error(msg),
  });

  // 페이스트 리스너
  const handlePaste = useCallback(
    (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (blob) {
            const reader = new FileReader();
            reader.onload = (event) => {
              const base64 = event.target?.result as string;
              onChange({
                uploadedImages: [
                  ...threads.uploadedImages,
                  { data: base64, mimeType: item.type },
                ],
              });
            };
            reader.readAsDataURL(blob);
          }
        }
      }
    },
    [onChange, threads.uploadedImages]
  );

  useEffect(() => {
    if (internalMode !== "image") return;
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [internalMode, handlePaste]);

  const handleFileUploadImages = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newImages: UploadedImage[] = [];
    let pending = files.length;
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = event.target?.result as string;
        newImages.push({ data: base64, mimeType: file.type });
        pending--;
        if (pending === 0) {
          onChange({
            uploadedImages: [...threads.uploadedImages, ...newImages],
          });
        }
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    onChange({
      uploadedImages: threads.uploadedImages.filter((_, i) => i !== index),
    });
  };

  const handleImageAnalyze = () => {
    if (threads.uploadedImages.length === 0) {
      toast.error("이미지를 1장 이상 업로드해주세요.");
      return;
    }
    startStream("/api/analyze-threads-image", {
      images: threads.uploadedImages,
    });
  };

  const handleSelectTemplate = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    templateSelectedRef.current = true;
    setInternalMode("template");
    // sourceMode가 image면 부모 mode를 image로 (생성 단계에서 analysis 프롬프트 사용)
    const mode: ThreadsAnalysisMode =
      template.sourceMode === "image" ? "image" : "template";
    commitAnalysis({
      analysisResult: template.analysisResult,
      referenceText: "",
      source: `템플릿: ${template.name}`,
      mode,
      selectedTemplateId: templateId,
    });
    toast.success(`"${template.name}" 템플릿이 선택되었습니다.`);
  };

  const handleDeleteTemplate = (
    e: React.MouseEvent,
    templateId: string
  ) => {
    e.stopPropagation();
    deleteTemplate(templateId);
    refreshTemplates();
    if (threads.selectedTemplateId === templateId) {
      onChange({ selectedTemplateId: null });
    }
    toast.success("템플릿이 삭제되었습니다.");
  };

  const handleCrawled = (title: string, content: string, plat: string) => {
    const text = title ? `# ${title}\n\n${content}` : content;
    onChange({
      referenceText: text,
      referenceSource: `${plat} 크롤링`,
    });
    setTextConfirmed(false);
    toast.success(`${plat} 크롤링 완료`);
  };

  const handleConfirmText = () => {
    const text = threads.referenceText;
    if (text.trim().length < 50) {
      toast.error("텍스트는 50자 이상이어야 합니다.");
      return;
    }
    setTextConfirmed(true);
    commitAnalysis({
      analysisResult: text,
      referenceText: text,
      source: threads.referenceSource || "직접 입력",
      mode: "crawl",
    });
    toast.success("기사 텍스트가 입력되었습니다.");
  };

  const handleSaveAsTemplate = () => {
    if (!saveName.trim()) {
      toast.error("템플릿 이름을 입력해주세요.");
      return;
    }
    if (!analysisResult && !threads.analysisResult) {
      toast.error("저장할 분석 결과가 없습니다.");
      return;
    }
    saveTemplate({
      name: saveName.trim(),
      description: saveDescription.trim() || "사용자 저장 템플릿",
      analysisResult: analysisResult || threads.analysisResult,
      sourceMode: "image", // crawl 모드에서는 저장 버튼이 안 보이므로 항상 image
    });
    refreshTemplates();
    setShowSaveDialog(false);
    setSaveName("");
    setSaveDescription("");
    toast.success("분석 결과가 템플릿으로 저장되었습니다.");
  };

  const setMode = (m: ThreadsAnalysisMode) => {
    setInternalMode(m);
    onChange({ analysisMode: m });
  };

  // ─────────────────────────────────────────────
  // Mode selection screen
  // ─────────────────────────────────────────────
  if (!internalMode) {
    return (
      <div className="space-y-6">
        <div className="mb-6 text-center">
          <h2 className="text-2xl font-semibold">분석 방식</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            템플릿을 활용하거나, 레퍼런스를 직접 분석할 수 있습니다
          </p>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Card
            className="cursor-pointer hover:border-blue-500/50 transition-colors group"
            onClick={() => setMode("template")}
          >
            <CardContent className="p-8 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center mb-5 group-hover:bg-blue-500/20 transition-colors">
                <FileText className="h-8 w-8 text-blue-500" />
              </div>
              <h3 className="text-lg font-bold mb-2">템플릿 활용</h3>
              <p className="text-sm text-muted-foreground">
                미리 분석된 스타일을 선택하여 바로 생성합니다
              </p>
            </CardContent>
          </Card>

          <Card
            className="cursor-pointer hover:border-green-500/50 transition-colors group"
            onClick={() => setMode("image")}
          >
            <CardContent className="p-8 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mb-5 group-hover:bg-green-500/20 transition-colors">
                <ImagePlus className="h-8 w-8 text-green-500" />
              </div>
              <h3 className="text-lg font-bold mb-2">레퍼런스 분석</h3>
              <p className="text-sm text-muted-foreground">
                URL, 텍스트, 이미지 캡처로 레퍼런스를 분석합니다
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // Template selection
  // ─────────────────────────────────────────────
  if (internalMode === "template") {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 mb-3">
          <Button
            variant="ghost"
            size="sm"
            className="text-base"
            onClick={() => {
              setMode(null);
              onChange({
                selectedTemplateId: null,
                analysisResult: "",
                referenceSource: "",
              });
            }}
          >
            ← 돌아가기
          </Button>
          <h3 className="text-lg font-bold">템플릿 선택</h3>
        </div>

        <div className="grid gap-3">
          {templates.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-30" />
              <p className="text-base font-medium mb-1">
                아직 등록된 템플릿이 없습니다
              </p>
              <p className="text-sm">
                레퍼런스 분석 후 템플릿으로 저장할 수 있습니다
              </p>
            </div>
          )}
          {templates.map((template) => {
            const isSelected = threads.selectedTemplateId === template.id;
            return (
              <Card
                key={template.id}
                className={`cursor-pointer transition-all ${
                  isSelected
                    ? "border-blue-500 bg-blue-500/5"
                    : "hover:border-blue-500/30"
                }`}
                onClick={() => handleSelectTemplate(template.id)}
              >
                <CardContent className="p-5 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <h4 className="text-base font-semibold">
                        {template.name}
                      </h4>
                      {template.isBuiltIn && (
                        <Badge variant="outline" className="text-xs">
                          기본
                        </Badge>
                      )}
                      {isSelected && (
                        <Badge className="bg-blue-500 text-white text-xs">
                          <Check className="h-3 w-3 mr-1" />
                          선택됨
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {template.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0 ml-3">
                    {!template.isBuiltIn && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        onClick={(e) => handleDeleteTemplate(e, template.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {threads.selectedTemplateId && (
          <p className="text-base text-center text-green-500 font-semibold">
            템플릿이 선택되었습니다. 다음 단계로 이동하세요.
          </p>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // Image / crawl analysis (combined screen)
  // ─────────────────────────────────────────────
  // 분석 결과(스트리밍 중) — 부모 state의 analysisResult가 우선
  const displayedAnalysis = analysisResult || threads.analysisResult;
  const showSaveButton =
    threads.analysisMode === "image" && !!displayedAnalysis && !isAnalyzing;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-3">
        <Button
          variant="ghost"
          size="sm"
          className="text-base"
          onClick={() => {
            setMode(null);
            onChange({
              uploadedImages: [],
              referenceText: "",
              referenceSource: "",
              analysisResult: "",
            });
            setTextConfirmed(false);
          }}
        >
          ← 돌아가기
        </Button>
        <h3 className="text-lg font-bold flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-purple-500" />
          레퍼런스 분석
        </h3>
      </div>

      {/* URL 크롤링 */}
      <CrawlInput
        onCrawled={handleCrawled}
        onError={(msg) => toast.error(msg)}
      />

      {/* 파일 업로드 + 안내 */}
      <div className="flex items-center gap-2">
        <FileUpload
          onFileLoaded={(content, filename) => {
            onChange({
              referenceText: content,
              referenceSource: `파일: ${filename}`,
            });
            setTextConfirmed(false);
            toast.success(`${filename} 파일을 불러왔습니다.`);
          }}
          onError={(msg) => toast.error(msg)}
        />
        <span className="text-sm text-muted-foreground">
          또는 아래에 직접 텍스트를 붙여넣기
        </span>
      </div>

      <Textarea
        placeholder="뉴스 기사 또는 레퍼런스 텍스트를 붙여넣으세요..."
        value={threads.referenceText}
        onChange={(e) => {
          onChange({ referenceText: e.target.value });
          setTextConfirmed(false);
        }}
        rows={6}
        disabled={isAnalyzing}
      />
      {threads.referenceText && (
        <div className="text-xs text-muted-foreground">
          {threads.referenceText.replace(/\s/g, "").length.toLocaleString()}자
          (공백 제외) /{" "}
          {threads.referenceText.length.toLocaleString()}자 (공백 포함)
        </div>
      )}

      {/* 텍스트 입력 완료 버튼 */}
      {threads.referenceText.trim().length >= 50 &&
        !textConfirmed &&
        !displayedAnalysis && (
          <Button
            size="sm"
            onClick={handleConfirmText}
            className="gap-1.5 bg-purple-600 hover:bg-purple-700"
          >
            <Check className="h-3.5 w-3.5" />
            텍스트 입력 완료
          </Button>
        )}

      {textConfirmed && (
        <p className="text-sm text-center text-green-500 font-semibold">
          텍스트 입력이 완료되었습니다. 다음 단계로 이동하세요.
        </p>
      )}

      <Separator />

      {/* 이미지 캡처 분석 */}
      <h4 className="text-sm font-semibold flex items-center gap-1.5">
        <ImagePlus className="h-4 w-4 text-purple-500" />
        이미지 캡처 분석
      </h4>
      <div
        className="border-2 border-dashed rounded-lg p-6 text-center cursor-pointer hover:border-purple-500/50 transition-colors"
        onClick={() => imageInputRef.current?.click()}
      >
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileUploadImages}
        />
        <ImagePlus className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
        <p className="text-sm font-medium mb-1">
          클릭하여 업로드 또는 Ctrl+V(Cmd+V)로 붙여넣기
        </p>
        <p className="text-xs text-muted-foreground">
          쓰레드 캡처를 여러 장 업로드할 수 있습니다
        </p>
      </div>

      {/* 이미지 미리보기 */}
      {threads.uploadedImages.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {threads.uploadedImages.map((img, idx) => (
            <div key={idx} className="relative group">
              <img
                src={img.data}
                alt={`업로드 ${idx + 1}`}
                className="h-32 rounded-md border object-cover"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => removeImage(idx)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground w-full">
            {threads.uploadedImages.length}장 업로드됨
          </p>
        </div>
      )}

      {/* 분석 버튼 */}
      {threads.uploadedImages.length > 0 && !textConfirmed && (
        <div className="flex gap-2">
          {isAnalyzing ? (
            <>
              <Button variant="destructive" onClick={abortStream} size="sm">
                분석 중단
              </Button>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                AI가 이미지를 분석하고 있습니다...
              </div>
            </>
          ) : (
            <Button
              onClick={handleImageAnalyze}
              disabled={threads.uploadedImages.length === 0}
              className="gap-1.5 bg-purple-600 hover:bg-purple-700"
              size="sm"
            >
              <Search className="h-3.5 w-3.5" />
              이미지 분석
            </Button>
          )}
        </div>
      )}

      {/* 분석 결과 */}
      {(displayedAnalysis || isAnalyzing) && (
        <>
          <Separator />
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-base font-semibold text-purple-500">
                분석 결과
              </h4>
              {/* crawl 모드(텍스트 입력 완료)에서는 저장 버튼 숨김 */}
              {showSaveButton && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-7 text-xs"
                  onClick={() => setShowSaveDialog(true)}
                >
                  <Save className="h-3 w-3" />
                  템플릿으로 저장
                </Button>
              )}
            </div>
            <AnalysisDisplay
              content={displayedAnalysis}
              isLoading={isAnalyzing}
            />
          </div>

          {/* 저장 다이얼로그 */}
          {showSaveDialog && (
            <>
              <Separator />
              <div className="space-y-3 rounded-md border p-4 bg-muted/30">
                <h4 className="text-sm font-medium">템플릿으로 저장</h4>
                <div className="space-y-2">
                  <Input
                    placeholder="템플릿 이름 (예: 크루즈 여행 쓰레드)"
                    value={saveName}
                    onChange={(e) => setSaveName(e.target.value)}
                  />
                  <Input
                    placeholder="간단한 설명 (선택)"
                    value={saveDescription}
                    onChange={(e) => setSaveDescription(e.target.value)}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleSaveAsTemplate}
                    disabled={!saveName.trim()}
                    className="gap-1.5"
                  >
                    <Save className="h-3.5 w-3.5" />
                    저장
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowSaveDialog(false);
                      setSaveName("");
                      setSaveDescription("");
                    }}
                  >
                    취소
                  </Button>
                </div>
              </div>
            </>
          )}

          {displayedAnalysis && !isAnalyzing && !textConfirmed && (
            <p className="text-base text-center text-green-500 font-semibold">
              이미지 분석이 완료되었습니다. 다음 단계로 이동하세요.
            </p>
          )}
        </>
      )}
    </div>
  );
}
