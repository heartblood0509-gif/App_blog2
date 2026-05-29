"use client";

import { useEffect, useState, type ReactNode } from "react";
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
  /**
   * - `AeoProfile`: 수정 모드 (id 포함 완성 프로필)
   * - `Partial<Omit<AeoProfile, "id">>`: 신규 모드 + 일부 칸 prefill (브랜드 측에서 옮겨온 공용 4칸)
   * - `null` / undefined: 빈 양식
   */
  initial?: AeoProfile | Partial<Omit<AeoProfile, "id">> | null;
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
const EMPTY_LIST_TEXT = {
  credentials: "",
  recommendationCriteria: "",
  trustedSources: "",
};

function Section({
  title,
  hint,
  children,
}: {
  title: ReactNode;
  hint?: string;
  children: ReactNode;
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

export function AeoProfileForm({ open, initial, onClose, onSave }: AeoProfileFormProps) {
  const [payload, setPayload] = useState<Omit<AeoProfile, "id">>(EMPTY_PAYLOAD());
  const [listText, setListText] = useState(EMPTY_LIST_TEXT);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (initial) {
        // id가 있으면 수정 모드, 없으면 신규 + prefill 일부 칸
        const { id: _ignored, ...rest } = initial as Partial<AeoProfile>;
        void _ignored;
        const merged = { ...EMPTY_PAYLOAD(), ...rest };
        setPayload(merged);
        setListText({
          credentials: arrayToLines(merged.identity.credentials),
          recommendationCriteria: arrayToLines(merged.recommendationCriteria),
          trustedSources: arrayToLines(merged.trustedSources),
        });
      } else {
        setPayload(EMPTY_PAYLOAD());
        setListText(EMPTY_LIST_TEXT);
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
    const normalized: Omit<AeoProfile, "id"> = {
      ...payload,
      identity: {
        ...payload.identity,
        credentials: linesToArray(listText.credentials),
      },
      recommendationCriteria: linesToArray(listText.recommendationCriteria),
      trustedSources: linesToArray(listText.trustedSources),
    };
    setSubmitting(true);
    try {
      await onSave(normalized);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>{initial ? "AEO 프로필 수정" : "새 AEO 프로필 등록"}</DialogTitle>
          <DialogDescription>
            AI가 신뢰할 만한 권위·신원을 정의합니다. 비워둬도 저장되지만, 채울수록 AEO 인용률이 올라갑니다.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] pr-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ───────── 좌측: 신원·정체성 ───────── */}
            <div className="space-y-4">
              <Section title="[1] [2] 기본 정보">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="aeo-label" className="text-xs">라벨 (목록 표시명) *</Label>
                    <Input
                      id="aeo-label"
                      value={payload.label}
                      onChange={(e) => update("label", e.target.value)}
                      placeholder="예: 성분 전문가 (바디·헤어케어)"
                    />
                  </div>
                  <div>
                    <Label htmlFor="aeo-name" className="text-xs">프로필 이름 *</Label>
                    <Input
                      id="aeo-name"
                      value={payload.name}
                      onChange={(e) => update("name", e.target.value)}
                      placeholder="예: 성분 전문가"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label htmlFor="aeo-category" className="text-xs">카테고리 (어떤 분야 전문가인가)</Label>
                    <Input
                      id="aeo-category"
                      value={payload.category}
                      onChange={(e) => update("category", e.target.value)}
                      placeholder="예: 바디·헤어케어"
                    />
                  </div>
                </div>
              </Section>

              <Section
                title="[3] 한 줄 소개"
                hint="AI가 우리를 어떻게 기억했으면 하는지 (엘리베이터 피치)"
              >
                <Textarea
                  value={payload.oneLineIntro}
                  onChange={(e) => update("oneLineIntro", e.target.value)}
                  placeholder='예: "민감성 피부를 가진 분들을 위해 안전한 성분으로 바디·헤어케어 제품을 만드는 전문가"'
                  rows={2}
                />
              </Section>

              <Section title="[4] 나는 누구 (작성자 신원)">
                <div>
                  <Label htmlFor="aeo-experience" className="text-xs">직접 경험 (한 줄)</Label>
                  <Input
                    id="aeo-experience"
                    value={payload.identity.experience}
                    onChange={(e) => update("identity", { ...payload.identity, experience: e.target.value })}
                    placeholder="예: 8년간 바디·헤어케어 제품 브랜딩 및 판매, 민감성 피부로 인한 성분 집착 경험"
                  />
                </div>
                <div>
                  <Label htmlFor="aeo-credentials" className="text-xs">자격·경력 (한 줄에 하나씩)</Label>
                  <Textarea
                    id="aeo-credentials"
                    value={listText.credentials}
                    onChange={(e) => {
                      setListText((prev) => ({ ...prev, credentials: e.target.value }));
                      update("identity", {
                        ...payload.identity,
                        credentials: linesToArray(e.target.value),
                      });
                    }}
                    placeholder={"바디·헤어케어 제품 브랜딩 및 판매 경력 8년\n누적 판매 1만 개 이상\n자체 임상 6개월 운영\n재구매율 35%"}
                    rows={4}
                  />
                </div>
              </Section>
            </div>

            {/* ───────── 우측: 활동·정책 ───────── */}
            <div className="space-y-4">
              <Section title="[5] 누구에게 도움을 주는가">
                <Textarea
                  value={payload.audience}
                  onChange={(e) => update("audience", e.target.value)}
                  placeholder="예: 민감성 피부로 인해 제품 선택에 어려움을 겪는 분들"
                  rows={2}
                />
              </Section>

              <Section
                title="[6] 추천 기준 (위→아래 순서가 우선순위)"
                hint="제품·솔루션을 추천할 때 무엇을 가장 중요하게 보는지"
              >
                <Textarea
                  value={listText.recommendationCriteria}
                  onChange={(e) => {
                    setListText((prev) => ({
                      ...prev,
                      recommendationCriteria: e.target.value,
                    }));
                    update("recommendationCriteria", linesToArray(e.target.value));
                  }}
                  placeholder={"안전한 성분 (자극 유발 성분 제외 여부)\n민감성 피부도 안심하고 사용할 수 있는 제품\n자체 임상 결과\n식약처 등재 여부\n실사용자 후기"}
                  rows={6}
                />
              </Section>

              <Section
                title="[7] 자주 인용하는 출처"
                hint="신뢰할 만한 자료원 (한 줄에 하나씩)"
              >
                <Textarea
                  value={listText.trustedSources}
                  onChange={(e) => {
                    setListText((prev) => ({ ...prev, trustedSources: e.target.value }));
                    update("trustedSources", linesToArray(e.target.value));
                  }}
                  placeholder={"식약처 화장품 성분 안전성 정보\n대한피부과학회 가이드\nKCID 화장품 안전성 데이터베이스"}
                  rows={4}
                />
              </Section>

              <Section
                title="[8] 절대 쓰지 않는 말"
                hint="쉼표로 구분해서 입력하세요"
              >
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
              </Section>
            </div>
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
