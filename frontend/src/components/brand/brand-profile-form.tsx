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

  const canSave = payload.label.trim() !== "" && payload.name.trim() !== "" && payload.narrator.name.trim() !== "";

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
            모든 항목은 글 품질에 영향을 줍니다. 비워두어도 저장은 되지만 채워둘수록 결과가 정확해집니다.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* 기본 정보 */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">기본 정보</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="brand-label" className="text-xs">라벨 (목록 표시명) *</Label>
                  <Input id="brand-label" value={payload.label} onChange={(e) => update("label", e.target.value)} placeholder="예: 우리끼리09" />
                </div>
                <div>
                  <Label htmlFor="brand-name" className="text-xs">브랜드명 *</Label>
                  <Input id="brand-name" value={payload.name} onChange={(e) => update("name", e.target.value)} placeholder="예: 우리끼리09" />
                </div>
                <div>
                  <Label htmlFor="brand-category" className="text-xs">카테고리/업종</Label>
                  <Input id="brand-category" value={payload.category} onChange={(e) => update("category", e.target.value)} placeholder="예: 크루즈 여행 공동구매 플랫폼" />
                </div>
                <div>
                  <Label htmlFor="brand-oneLine" className="text-xs">한 줄 소개</Label>
                  <Input id="brand-oneLine" value={payload.oneLine} onChange={(e) => update("oneLine", e.target.value)} placeholder="" />
                </div>
              </div>
              <div>
                <Label className="text-xs">핵심 가치 (한 줄에 하나씩)</Label>
                <Textarea
                  rows={4}
                  value={arrayToLines(payload.coreValues)}
                  onChange={(e) => update("coreValues", linesToArray(e.target.value))}
                  placeholder="정직 / 투명 가격&#10;동행 (관리 ≠ 동행)&#10;..."
                />
              </div>
            </section>

            <Separator />

            {/* 화자 (1인칭 고정) */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">1인칭 화자 (글의 주인공) *</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">이름 *</Label>
                  <Input
                    value={payload.narrator.name}
                    onChange={(e) => update("narrator", { ...payload.narrator, name: e.target.value })}
                    placeholder="예: 윤희"
                  />
                </div>
                <div>
                  <Label className="text-xs">직책/역할</Label>
                  <Input
                    value={payload.narrator.role}
                    onChange={(e) => update("narrator", { ...payload.narrator, role: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">권위/근거</Label>
                  <Input
                    value={payload.narrator.authority}
                    onChange={(e) => update("narrator", { ...payload.narrator, authority: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">캐릭터</Label>
                  <Input
                    value={payload.narrator.character}
                    onChange={(e) => update("narrator", { ...payload.narrator, character: e.target.value })}
                  />
                </div>
              </div>
            </section>

            <Separator />

            {/* 주변 인물 */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">주변 인물 (선택 — 글 안에 등장)</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">이름</Label>
                  <Input
                    value={payload.supportingPersona.name}
                    onChange={(e) => update("supportingPersona", { ...payload.supportingPersona, name: e.target.value })}
                    placeholder="예: 임두환"
                  />
                </div>
                <div>
                  <Label className="text-xs">직책/역할</Label>
                  <Input
                    value={payload.supportingPersona.role}
                    onChange={(e) => update("supportingPersona", { ...payload.supportingPersona, role: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">권위/근거</Label>
                  <Input
                    value={payload.supportingPersona.authority}
                    onChange={(e) => update("supportingPersona", { ...payload.supportingPersona, authority: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">캐릭터</Label>
                  <Input
                    value={payload.supportingPersona.character}
                    onChange={(e) => update("supportingPersona", { ...payload.supportingPersona, character: e.target.value })}
                  />
                </div>
              </div>
            </section>

            <Separator />

            {/* 타겟 */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">타겟 고객</h3>
              <div className="space-y-2">
                <div>
                  <Label className="text-xs">주 타겟</Label>
                  <Input
                    value={payload.targets.primary}
                    onChange={(e) => update("targets", { ...payload.targets, primary: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">보조 타겟</Label>
                  <Input
                    value={payload.targets.secondary ?? ""}
                    onChange={(e) => update("targets", { ...payload.targets, secondary: e.target.value })}
                  />
                </div>
              </div>
            </section>

            <Separator />

            {/* 자유 입력 항목들 (한 줄에 하나씩) */}
            {[
              { key: "differentiators" as const, label: "차별점 / 강점" },
              { key: "villains" as const, label: "공통의 적 (자주 폭로하는 빌런)" },
              { key: "metaphors" as const, label: "자주 쓰는 비유" },
              { key: "signaturePhrases" as const, label: "시그니처 표현 / 슬로건" },
              { key: "authorityAssets" as const, label: "권위·신뢰 자산" },
              { key: "services" as const, label: "추가 서비스" },
              { key: "recommendedRoutes" as const, label: "추천 코스/상품 (있으면)" },
            ].map(({ key, label }) => (
              <section key={key} className="space-y-2">
                <Label className="text-xs">{label} (한 줄에 하나씩)</Label>
                <Textarea
                  rows={3}
                  value={arrayToLines(payload[key] as string[])}
                  onChange={(e) => update(key, linesToArray(e.target.value))}
                />
              </section>
            ))}

            <Separator />

            {/* CTA */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">CTA 채널 (한 줄에 하나씩)</h3>
              <Textarea
                rows={2}
                value={arrayToLines(payload.cta.channels)}
                onChange={(e) => update("cta", { channels: linesToArray(e.target.value) })}
                placeholder="커뮤니티 단체 카카오톡방&#10;공동구매 웹사이트"
              />
            </section>

            <Separator />

            {/* 금기 */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">금기 단어 (글에 절대 노출 X)</h3>
              <Textarea
                rows={2}
                value={arrayToLines(payload.forbidden.forbiddenWords)}
                onChange={(e) => update("forbidden", { ...payload.forbidden, forbiddenWords: linesToArray(e.target.value) })}
                placeholder="예: 협력사 실명, 제외 표현 등"
              />
              <p className="text-[11px] text-muted-foreground">
                ※ 경쟁사 실명 자동 검출 / 광고 직접 표현 금지는 기본 활성됩니다.
              </p>
            </section>
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
