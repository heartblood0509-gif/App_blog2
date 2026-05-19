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
import type { BrandProfile } from "@/types/brand";

interface BrandProfileFormProps {
  open: boolean;
  /**
   * - `BrandProfile`: 수정 모드 (id 포함 완성 프로필)
   * - `Partial<Omit<BrandProfile, "id">>`: 신규 모드 + 일부 칸 prefill (AEO 측에서 옮겨온 공용 4칸)
   * - `null` / undefined: 빈 양식
   */
  initial?: BrandProfile | Partial<Omit<BrandProfile, "id">> | null;
  onClose: () => void;
  onSave: (payload: Omit<BrandProfile, "id">) => Promise<void> | void;
}

const EMPTY_PAYLOAD = (): Omit<BrandProfile, "id"> => ({
  name: "",
  category: "",
  oneLine: "",
  coreValues: [],
  narrator: { name: "", role: "", authority: "", fixed: true },
  story: { origin: "", crisis: "", revival: "", encounter: "" },
  episodes: [],
  services: [],
  targets: { primary: "", secondary: "", tertiary: "" },
  differentiators: [],
  villains: [],
  recommendedRoutes: [],
  cta: { channels: [] },
  forbidden: { competitorNames: true, forbiddenWords: [], adStyle: true },
});

const linesToArray = (s: string): string[] =>
  s.split("\n").map((x) => x.trim()).filter(Boolean);
const arrayToLines = (a: string[] | undefined): string => (a ?? []).join("\n");

/** 평면 펼침 섹션 — 토글 없음. 헤더 + 본문 카드. */
function Section({
  title,
  hint,
  children,
}: {
  title: React.ReactNode;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded-lg border bg-card/40 p-4">
      <header>
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>
        )}
      </header>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function BrandProfileForm({ open, initial, onClose, onSave }: BrandProfileFormProps) {
  const [payload, setPayload] = useState<Omit<BrandProfile, "id">>(EMPTY_PAYLOAD());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (initial) {
        // id가 있으면 수정 모드(완성 프로필), 없으면 신규 + prefill 일부 칸
        const { id: _ignored, ...rest } = initial as Partial<BrandProfile>;
        void _ignored;
        setPayload({ ...EMPTY_PAYLOAD(), ...rest });
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
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{initial ? "브랜드 프로필 수정" : "새 브랜드 프로필 등록"}</DialogTitle>
          <DialogDescription>
            <strong>필수 2칸</strong>(브랜드명·글쓴이 이름)만 채우면 저장돼요.
            나머지는 채울수록 글이 더 정확해집니다.
            <br />
            <span className="text-[11px]">
              💡 더 쉽게 채우고 싶다면 위 [AI 도움받기] 버튼을 사용해보세요.
            </span>
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ───────── 좌측: 필수 + 스토리 ───────── */}
            <div className="space-y-4">
              <Section
                title={
                  <>
                    필수 정보 <span className="text-destructive">*</span>
                  </>
                }
              >
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="brand-name" className="text-xs">
                      브랜드명 <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="brand-name"
                      value={payload.name}
                      onChange={(e) => update("name", e.target.value)}
                      placeholder="예: 미르엔"
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
                      placeholder="예: 민감 피부 전문 화장품"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="brand-oneLine" className="text-xs">
                      한 줄 소개
                    </Label>
                    <Input
                      id="brand-oneLine"
                      value={payload.oneLine}
                      onChange={(e) => update("oneLine", e.target.value)}
                      placeholder="예: 민감 피부에 딱 맞는 자체 임상 화장품 브랜드"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">
                      글쓴이 이름 <span className="text-destructive">*</span>
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
                    <Label className="text-xs">글쓴이 직책</Label>
                    <Input
                      value={payload.narrator.role}
                      onChange={(e) =>
                        update("narrator", { ...payload.narrator, role: e.target.value })
                      }
                      placeholder="예: 대표 / 이사"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label className="text-xs">
                      글쓴이 경력·자격
                    </Label>
                    <p className="text-[11px] text-muted-foreground mt-0.5 mb-1">
                      숫자·기간·횟수 위주, 한 줄에 하나씩 — 글의 신뢰도를 결정합니다
                    </p>
                    <Textarea
                      rows={4}
                      value={payload.narrator.authority}
                      onChange={(e) =>
                        update("narrator", { ...payload.narrator, authority: e.target.value })
                      }
                      placeholder="예:&#10;미르엔 8년 운영&#10;누적 판매 1만 개&#10;자체 임상 6개월&#10;재구매율 35%"
                    />
                  </div>
                </div>
              </Section>

              <Section
                title="브랜드 스토리"
                hint="소개글 · 가치입증글에서 가장 많이 활용"
              >
                <div className="space-y-2">
                  <div>
                    <Label className="text-xs">이 브랜드를 시작하게 된 계기</Label>
                    <Textarea
                      rows={2}
                      value={payload.story.origin}
                      onChange={(e) => update("story", { ...payload.story, origin: e.target.value })}
                      placeholder="예: 예민한 피부에 맞는 제품이 없어 직접 만들어보자 시작…"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">사업하면서 겪은 가장 큰 어려움</Label>
                    <Textarea
                      rows={2}
                      value={payload.story.crisis}
                      onChange={(e) => update("story", { ...payload.story, crisis: e.target.value })}
                      placeholder="예: 첫 제품이 시장에서 외면받았을 때…"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">그 어려움을 어떻게 이겨냈는지</Label>
                    <Textarea
                      rows={2}
                      value={payload.story.revival}
                      onChange={(e) => update("story", { ...payload.story, revival: e.target.value })}
                      placeholder="예: OEM 공장을 바꾸고 처방을 다시 잡으면서…"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">지금의 방향을 잡게 만든 결정적 만남·깨달음</Label>
                    <Textarea
                      rows={2}
                      value={payload.story.encounter}
                      onChange={(e) => update("story", { ...payload.story, encounter: e.target.value })}
                      placeholder="예: 한 고객의 후기를 보고 방향을 다시 잡았던 순간…"
                    />
                  </div>
                </div>
              </Section>
            </div>

            {/* ───────── 우측: 자랑할 무기 + 주 고객 + 핵심 가치 + 금기 ───────── */}
            <div className="space-y-4">
              <Section
                title="자랑할 무기"
                hint="차별점 · 자주 폭로하는 업계 관행"
              >
                <div>
                  <Label className="text-xs">차별점 · 강점</Label>
                  <Textarea
                    rows={3}
                    value={arrayToLines(payload.differentiators)}
                    onChange={(e) => update("differentiators", linesToArray(e.target.value))}
                    placeholder="한 줄에 하나씩&#10;예: 전 일정 관광 포함&#10;추가 비용 0원"
                  />
                </div>
                <div>
                  <Label className="text-xs">자주 폭로하고 싶은 업계 관행 (3~5개 권장)</Label>
                  <Textarea
                    rows={4}
                    value={arrayToLines(payload.villains)}
                    onChange={(e) => update("villains", linesToArray(e.target.value))}
                    placeholder="한 줄에 하나씩&#10;예:&#10;미끼 가격으로 유인하는 여행사&#10;추가 옵션비 폭탄 업체&#10;다단계 모객 사기"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    ※ 1개만 적으면 정보성글이 매번 비슷하게 나옵니다. 3~5개 적어주세요.
                  </p>
                </div>
              </Section>

              <Section
                title="주 고객"
                hint="글을 누구에게 쓰는지"
              >
                <Input
                  value={payload.targets.primary}
                  onChange={(e) => update("targets", { ...payload.targets, primary: e.target.value })}
                  placeholder="예: 첫 크루즈를 꿈꾸는 40~60대 부부"
                />
              </Section>

              <Section
                title="핵심 가치"
                hint="브랜드 정체성의 한 줄들 (안 적어도 됩니다)"
              >
                <Textarea
                  rows={4}
                  value={arrayToLines(payload.coreValues)}
                  onChange={(e) => update("coreValues", linesToArray(e.target.value))}
                  placeholder="한 줄에 하나씩&#10;예:&#10;정직 / 투명 가격&#10;전문가 동행&#10;공동구매로 거품 제거"
                />
              </Section>

              <Section
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
              </Section>
            </div>
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
