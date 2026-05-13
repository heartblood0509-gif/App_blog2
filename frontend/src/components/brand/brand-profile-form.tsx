"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { BrandProfile } from "@/types/brand";

interface BrandProfileFormProps {
  open: boolean;
  initial?: BrandProfile | null;
  onClose: () => void;
  onSave: (payload: Omit<BrandProfile, "id">) => Promise<void> | void;
}

const EMPTY_PAYLOAD = (): Omit<BrandProfile, "id"> => ({
  label: "",
  name: "",
  category: "",
  oneLine: "",
  coreValues: [],
  narrator: { name: "", role: "", authority: "", character: "", fixed: true },
  supportingPersona: { name: "", role: "", authority: "", character: "", appearAs: "" },
  story: { origin: "", crisis: "", revival: "", encounter: "" },
  episodes: [],
  authorityAssets: [],
  services: [],
  targets: { primary: "", secondary: "", tertiary: "" },
  differentiators: [],
  villains: [],
  metaphors: [],
  signaturePhrases: [],
  recommendedRoutes: [],
  cta: { channels: [] },
  forbidden: { competitorNames: true, forbiddenWords: [], adStyle: true },
});

const linesToArray = (s: string): string[] =>
  s.split("\n").map((x) => x.trim()).filter(Boolean);
const arrayToLines = (a: string[] | undefined): string => (a ?? []).join("\n");

// 접힘 섹션 — 기본 접힘, 클릭으로 토글
function CollapsibleSection({
  title,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md py-1 text-left hover:bg-muted/40"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && <span className="text-[11px] text-muted-foreground">— {hint}</span>}
      </button>
      {open && <div className="pl-6 space-y-3">{children}</div>}
    </section>
  );
}

export function BrandProfileForm({ open, initial, onClose, onSave }: BrandProfileFormProps) {
  const [payload, setPayload] = useState<Omit<BrandProfile, "id">>(EMPTY_PAYLOAD());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (initial) {
        const { id: _ignored, ...rest } = initial;
        void _ignored;
        setPayload(rest);
      } else {
        setPayload(EMPTY_PAYLOAD());
      }
    }
  }, [open, initial]);

  const update = <K extends keyof Omit<BrandProfile, "id">>(
    key: K,
    value: Omit<BrandProfile, "id">[K]
  ) => setPayload((prev) => ({ ...prev, [key]: value }));

  const canSave =
    payload.label.trim() !== "" &&
    payload.name.trim() !== "" &&
    payload.narrator.name.trim() !== "";

  const handleSave = async () => {
    if (!canSave || submitting) return;
    setSubmitting(true);
    try {
      await onSave(payload);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initial ? "브랜드 프로필 수정" : "새 브랜드 프로필 등록"}</DialogTitle>
          <DialogDescription>
            <strong>필수 3칸</strong>만 채우면 저장돼요. 나머지는 채울수록 글이 더 정확해집니다.
            <br />
            <span className="text-[11px]">
              💡 더 쉽게 채우고 싶다면 위 [AI 도움받기] 버튼을 사용해보세요.
            </span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* ───────── 필수 영역 (항상 펼침) ───────── */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">
                필수 정보 <span className="text-destructive">*</span>
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="brand-label" className="text-xs">
                    라벨 (목록 표시명) <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="brand-label"
                    value={payload.label}
                    onChange={(e) => update("label", e.target.value)}
                    placeholder="예: 우리끼리09"
                  />
                </div>
                <div>
                  <Label htmlFor="brand-name" className="text-xs">
                    브랜드명 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="brand-name"
                    value={payload.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="예: 우리끼리09"
                  />
                </div>
                <div>
                  <Label htmlFor="brand-category" className="text-xs">
                    분야·업종
                  </Label>
                  <Input
                    id="brand-category"
                    value={payload.category}
                    onChange={(e) => update("category", e.target.value)}
                    placeholder="예: 크루즈 여행 공동구매 플랫폼"
                  />
                </div>
                <div>
                  <Label htmlFor="brand-oneLine" className="text-xs">
                    한 줄 소개
                  </Label>
                  <Input
                    id="brand-oneLine"
                    value={payload.oneLine}
                    onChange={(e) => update("oneLine", e.target.value)}
                    placeholder="예: 정직한 가격과 전문가 동행으로 첫 크루즈를 책임지는 공동구매 플랫폼"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">
                    화자 이름 <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={payload.narrator.name}
                    onChange={(e) =>
                      update("narrator", { ...payload.narrator, name: e.target.value })
                    }
                    placeholder="예: 윤희"
                  />
                </div>
                <div>
                  <Label className="text-xs">화자 직책</Label>
                  <Input
                    value={payload.narrator.role}
                    onChange={(e) =>
                      update("narrator", { ...payload.narrator, role: e.target.value })
                    }
                    placeholder="예: 대표 / 이사"
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">화자 권위·경력 (글의 신뢰도 결정)</Label>
                  <Input
                    value={payload.narrator.authority}
                    onChange={(e) =>
                      update("narrator", { ...payload.narrator, authority: e.target.value })
                    }
                    placeholder="예: 마케팅 14년, 크루즈 인솔 50회 이상"
                  />
                </div>
              </div>
            </section>

            <Separator />

            <p className="text-xs text-muted-foreground">
              아래는 선택 입력입니다. 채울수록 글이 더 풍부해져요.
            </p>

            {/* ───────── 선택 영역 (기본 접힘) ───────── */}

            <CollapsibleSection
              title="브랜드 스토리"
              hint="소개글 · 가치입증글에서 가장 많이 활용"
            >
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">왜 시작했나 (계기·동기)</Label>
                  <Textarea
                    rows={2}
                    value={payload.story.origin}
                    onChange={(e) => update("story", { ...payload.story, origin: e.target.value })}
                    placeholder="예: 여행사들의 미끼 가격에 분노해서 직접 공동구매를 시작"
                  />
                </div>
                <div>
                  <Label className="text-xs">위기·갈등</Label>
                  <Textarea
                    rows={2}
                    value={payload.story.crisis}
                    onChange={(e) => update("story", { ...payload.story, crisis: e.target.value })}
                    placeholder=""
                  />
                </div>
                <div>
                  <Label className="text-xs">극복·반전</Label>
                  <Textarea
                    rows={2}
                    value={payload.story.revival}
                    onChange={(e) => update("story", { ...payload.story, revival: e.target.value })}
                    placeholder=""
                  />
                </div>
                <div>
                  <Label className="text-xs">핵심 만남·결합점</Label>
                  <Textarea
                    rows={2}
                    value={payload.story.encounter}
                    onChange={(e) => update("story", { ...payload.story, encounter: e.target.value })}
                    placeholder=""
                  />
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="핵심 가치"
              hint="브랜드 정체성의 한 줄들"
            >
              <Textarea
                rows={4}
                value={arrayToLines(payload.coreValues)}
                onChange={(e) => update("coreValues", linesToArray(e.target.value))}
                placeholder="한 줄에 하나씩&#10;예:&#10;정직 / 투명 가격&#10;전문가 동행&#10;공동구매로 거품 제거"
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="주변 인물"
              hint="글 안에 같이 등장하는 동료 (선택)"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">이름</Label>
                  <Input
                    value={payload.supportingPersona.name}
                    onChange={(e) =>
                      update("supportingPersona", {
                        ...payload.supportingPersona,
                        name: e.target.value,
                      })
                    }
                    placeholder="예: 임두환"
                  />
                </div>
                <div>
                  <Label className="text-xs">직책</Label>
                  <Input
                    value={payload.supportingPersona.role}
                    onChange={(e) =>
                      update("supportingPersona", {
                        ...payload.supportingPersona,
                        role: e.target.value,
                      })
                    }
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">권위·경력</Label>
                  <Input
                    value={payload.supportingPersona.authority}
                    onChange={(e) =>
                      update("supportingPersona", {
                        ...payload.supportingPersona,
                        authority: e.target.value,
                      })
                    }
                  />
                </div>
              </div>
            </CollapsibleSection>

            <CollapsibleSection
              title="주 고객"
              hint="글을 누구에게 쓰는지"
            >
              <Input
                value={payload.targets.primary}
                onChange={(e) => update("targets", { ...payload.targets, primary: e.target.value })}
                placeholder="예: 첫 크루즈를 꿈꾸는 40~60대 부부"
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="자랑할 무기"
              hint="차별점 · 공통의 적 · 비유 · 시그니처 · 권위 자산"
            >
              {[
                {
                  key: "differentiators" as const,
                  label: "차별점 · 강점",
                  placeholder: "한 줄에 하나씩&#10;예: 전 일정 관광 포함&#10;추가 비용 0원",
                },
                {
                  key: "villains" as const,
                  label: "공통의 적 (자주 폭로하는 빌런)",
                  placeholder: "한 줄에 하나씩&#10;예: 미끼형 여행사&#10;거품형 패키지",
                },
                {
                  key: "authorityAssets" as const,
                  label: "권위·신뢰 자산",
                  placeholder: "한 줄에 하나씩&#10;예: 크루즈 인솔 50회 이상&#10;데이터 분석 14년",
                },
                {
                  key: "metaphors" as const,
                  label: "자주 쓰는 비유",
                  placeholder: "한 줄에 하나씩",
                },
                {
                  key: "signaturePhrases" as const,
                  label: "시그니처 표현 / 슬로건",
                  placeholder: "한 줄에 하나씩",
                },
              ].map(({ key, label, placeholder }) => (
                <div key={key}>
                  <Label className="text-xs">{label}</Label>
                  <Textarea
                    rows={3}
                    value={arrayToLines(payload[key] as string[])}
                    onChange={(e) => update(key, linesToArray(e.target.value))}
                    placeholder={placeholder}
                  />
                </div>
              ))}
            </CollapsibleSection>

            <CollapsibleSection
              title="화자 캐릭터 (세부 톤)"
              hint="성격 묘사 한 줄"
            >
              <Input
                value={payload.narrator.character}
                onChange={(e) =>
                  update("narrator", { ...payload.narrator, character: e.target.value })
                }
                placeholder="예: 꼼꼼함, 검색의 달인, '뭉치면 싸진다' 신념"
              />
            </CollapsibleSection>

            <CollapsibleSection
              title="금기 단어"
              hint="글에 절대 노출 X"
            >
              <Textarea
                rows={2}
                value={arrayToLines(payload.forbidden.forbiddenWords)}
                onChange={(e) =>
                  update("forbidden", {
                    ...payload.forbidden,
                    forbiddenWords: linesToArray(e.target.value),
                  })
                }
                placeholder="한 줄에 하나씩&#10;예: 협력사 실명, 제외 표현"
              />
              <p className="text-[11px] text-muted-foreground">
                ※ 경쟁사 실명 자동 검출 / 광고 직접 표현 금지는 기본 활성됩니다.
              </p>
            </CollapsibleSection>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            취소
          </Button>
          <Button onClick={handleSave} disabled={!canSave || submitting}>
            {submitting ? "저장 중..." : initial ? "수정 저장" : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
