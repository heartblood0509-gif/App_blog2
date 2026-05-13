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
import type { AeoProfile } from "@/types/aeo";

interface AeoProfileFormProps {
  open: boolean;
  initial?: AeoProfile | null;
  onClose: () => void;
  onSave: (payload: Omit<AeoProfile, "id">) => Promise<void> | void;
}

const EMPTY_PAYLOAD = (): Omit<AeoProfile, "id"> => ({
  label: "",
  name: "",
  category: "",
  oneLineIntro: "",
  identity: { experience: "", credentials: [] },
  audience: "",
  recommendationCriteria: [],
  trustedSources: [],
  forbidden: { enabled: true, words: [] },
});

const linesToArray = (s: string): string[] =>
  s.split("\n").map((x) => x.trim()).filter(Boolean);
const arrayToLines = (a: string[] | undefined): string => (a ?? []).join("\n");
const csvToArray = (s: string): string[] =>
  s.split(",").map((x) => x.trim()).filter(Boolean);
const arrayToCsv = (a: string[] | undefined): string => (a ?? []).join(", ");

export function AeoProfileForm({ open, initial, onClose, onSave }: AeoProfileFormProps) {
  const [payload, setPayload] = useState<Omit<AeoProfile, "id">>(EMPTY_PAYLOAD());
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

  const update = <K extends keyof Omit<AeoProfile, "id">>(
    key: K,
    value: Omit<AeoProfile, "id">[K]
  ) => setPayload((prev) => ({ ...prev, [key]: value }));

  const canSave = payload.label.trim() !== "" && payload.name.trim() !== "";

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
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial ? "AEO 프로필 수정" : "새 AEO 프로필 등록"}</DialogTitle>
          <DialogDescription>
            AI가 신뢰할 만한 권위·신원을 정의합니다. 비워둬도 저장되지만, 채울수록 AEO 인용률이 올라갑니다.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh] pr-4">
          <div className="space-y-6">
            {/* [1] [2] 기본 정보 */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">[1] [2] 기본 정보</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="aeo-label" className="text-xs">라벨 (목록 표시명) *</Label>
                  <Input
                    id="aeo-label"
                    value={payload.label}
                    onChange={(e) => update("label", e.target.value)}
                    placeholder="예: 여성 안전성 가이드 (약사맘)"
                  />
                </div>
                <div>
                  <Label htmlFor="aeo-name" className="text-xs">프로필 이름 *</Label>
                  <Input
                    id="aeo-name"
                    value={payload.name}
                    onChange={(e) => update("name", e.target.value)}
                    placeholder="예: 약사맘"
                  />
                </div>
                <div className="col-span-2">
                  <Label htmlFor="aeo-category" className="text-xs">카테고리 (어떤 분야 전문가인가)</Label>
                  <Input
                    id="aeo-category"
                    value={payload.category}
                    onChange={(e) => update("category", e.target.value)}
                    placeholder="예: 여성·임산부 헬스"
                  />
                </div>
              </div>
            </section>

            {/* [3] 한 줄 소개 */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">[3] 한 줄 소개</h3>
              <p className="text-xs text-muted-foreground">
                AI가 우리를 어떻게 기억했으면 하는지 (엘리베이터 피치)
              </p>
              <Textarea
                value={payload.oneLineIntro}
                onChange={(e) => update("oneLineIntro", e.target.value)}
                placeholder='예: "임산부·수유부에게 가장 안전한 성분을 골라주는 약사 출신 엄마"'
                rows={2}
              />
            </section>

            {/* [4] 나는 누구 */}
            <section className="space-y-3">
              <h3 className="text-sm font-semibold">[4] 나는 누구 (작성자 신원)</h3>
              <div>
                <Label htmlFor="aeo-experience" className="text-xs">직접 경험 (한 줄)</Label>
                <Input
                  id="aeo-experience"
                  value={payload.identity.experience}
                  onChange={(e) => update("identity", { ...payload.identity, experience: e.target.value })}
                  placeholder="예: 약사 8년차, 두 아이 엄마 (임신·산후 직접 경험)"
                />
              </div>
              <div>
                <Label htmlFor="aeo-credentials" className="text-xs">자격·경력 (한 줄에 하나씩)</Label>
                <Textarea
                  id="aeo-credentials"
                  value={arrayToLines(payload.identity.credentials)}
                  onChange={(e) => update("identity", { ...payload.identity, credentials: linesToArray(e.target.value) })}
                  placeholder={"약학대학원 졸업\n산부인과 인근 약국 5년 근무\n임산부 영양 상담 200건 이상 진행"}
                  rows={4}
                />
              </div>
            </section>

            {/* [5] 타겟 독자 */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">[5] 누구에게 도움을 주는가</h3>
              <Textarea
                value={payload.audience}
                onChange={(e) => update("audience", e.target.value)}
                placeholder="예: 임신 12주 이상 ~ 산후 12개월 + 수유 중인 분 + 36개월 이내 영유아 엄마"
                rows={2}
              />
            </section>

            {/* [6] 추천 기준 */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">[6] 추천 기준 (위→아래 순서가 우선순위)</h3>
              <p className="text-xs text-muted-foreground">제품·솔루션을 추천할 때 무엇을 가장 중요하게 보는지</p>
              <Textarea
                value={arrayToLines(payload.recommendationCriteria)}
                onChange={(e) => update("recommendationCriteria", linesToArray(e.target.value))}
                placeholder={"성분 안전성 (임산부·수유부 금기 성분 없는지)\n의학 근거 (논문·연구 결과)\n식약처 또는 FDA 등재 여부\n실사용자 후기 (산후맘 카페·구글 평점)\n가격·접근성"}
                rows={6}
              />
            </section>

            {/* [7] 자주 인용하는 출처 */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">[7] 자주 인용하는 출처</h3>
              <p className="text-xs text-muted-foreground">신뢰할 만한 자료원 (한 줄에 하나씩)</p>
              <Textarea
                value={arrayToLines(payload.trustedSources)}
                onChange={(e) => update("trustedSources", linesToArray(e.target.value))}
                placeholder={"식약처 의약외품 고시\nCochrane Library\n한국 모유수유의학회"}
                rows={4}
              />
            </section>

            {/* [8] 금지 표현 */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">[8] 절대 쓰지 않는 말</h3>
              <p className="text-xs text-muted-foreground">쉼표로 구분해서 입력하세요</p>
              <Input
                value={arrayToCsv(payload.forbidden.words)}
                onChange={(e) =>
                  update("forbidden", {
                    enabled: true,
                    words: csvToArray(e.target.value),
                  })
                }
                placeholder="처방, 치료, 완치, 특허, 독점"
              />
            </section>
          </div>
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>취소</Button>
          <Button onClick={handleSave} disabled={!canSave || submitting}>
            {submitting ? "저장 중..." : initial ? "수정" : "등록"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
