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
const EMPTY_LIST_TEXT = {
  differentiators: "",
  villains: "",
  coreValues: "",
  forbiddenWords: "",
};

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
  const [listText, setListText] = useState(EMPTY_LIST_TEXT);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      if (initial) {
        // id가 있으면 수정 모드(완성 프로필), 없으면 신규 + prefill 일부 칸
        const { id: _ignored, ...rest } = initial as Partial<BrandProfile>;
        void _ignored;
        const merged = { ...EMPTY_PAYLOAD(), ...rest };
        setPayload(merged);
        setListText({
          differentiators: arrayToLines(merged.differentiators),
          villains: arrayToLines(merged.villains),
          coreValues: arrayToLines(merged.coreValues),
          forbiddenWords: arrayToLines(merged.forbidden.forbiddenWords),
        });
      } else {
        setPayload(EMPTY_PAYLOAD());
        setListText(EMPTY_LIST_TEXT);
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
    const normalized: Omit<BrandProfile, "id"> = {
      ...payload,
      differentiators: linesToArray(listText.differentiators),
      villains: linesToArray(listText.villains),
      coreValues: linesToArray(listText.coreValues),
      forbidden: {
        ...payload.forbidden,
        forbiddenWords: linesToArray(listText.forbiddenWords),
      },
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
    <Dialog
      open={open}
      onOpenChange={(v, details) => {
        if (!v) {
          if (details.reason === "outside-press" || details.reason === "escape-key") return;
          onClose();
        }
      }}
    >
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
                      placeholder="예: 바디/헤어케어"
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
                      placeholder="예: 올바른 성분의 힘, 민감성 피부 종착지 미르엔"
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
                      placeholder="예: 이사"
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
                      placeholder={"예:\n미르엔 8년 운영\n누적 판매 50만 개\n자체 임상 6개월 운영\n재구매율 35%"}
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
                      placeholder="예: 시중에 좋다고 광고하는 제품은 많았지만 난 특별한 효과를 보지 못했기 때문에 안전한 성분으로 꼭 효과를 볼수 있는 제품을 만들고 싶었음"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">사업하면서 겪은 가장 큰 어려움</Label>
                    <Textarea
                      rows={2}
                      value={payload.story.crisis}
                      onChange={(e) => update("story", { ...payload.story, crisis: e.target.value })}
                      placeholder="예: 진정으로 안전하고 효과적인 제품을 개발하려고 성분 공부해가며 제조사 연구원분들이랑 함량·비율을 치열하게 소통. 성분은 만족스럽게 나왔는데 사용감이랑 안정화가 안돼서 수개월 고생…"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">그 어려움을 어떻게 이겨냈는지</Label>
                    <Textarea
                      rows={2}
                      value={payload.story.revival}
                      onChange={(e) => update("story", { ...payload.story, revival: e.target.value })}
                      placeholder="예: '적당히 타협하고 출시할까' 유혹도 있었지만 오기로 버팀. 될 때까지 샘플링·테스트, 밤낮으로 매달린 끝에 성분과 사용감 다 잡은 첫 자식 같은 '샴푸' 탄생…"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">지금의 방향을 잡게 만든 결정적 만남·깨달음</Label>
                    <Textarea
                      rows={2}
                      value={payload.story.encounter}
                      onChange={(e) => update("story", { ...payload.story, encounter: e.target.value })}
                      placeholder={"예: 출시 후 고객 피드백 들으면서 계속 업그레이드. 큰 광고 없이 입소문만으로 사용자들이 먼저 알아채고 다시 사러 오심. '좋은 성분 쓰고 진심으로 대하면 결국 통하는구나'를 깨달은 순간…"}
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
                    value={listText.differentiators}
                    onChange={(e) => {
                      setListText((prev) => ({ ...prev, differentiators: e.target.value }));
                      update("differentiators", linesToArray(e.target.value));
                    }}
                    placeholder={"한 줄에 하나씩\n\n예:\n대충 만든 제품은 없다, 그리고 높은 재구매율!\n올바른성분: 우리아이도 안심하고 바를 수 있는 제품\n지속적인 업그레이드: 고객 의견 들으면 무조건 또 발전\n입소문과 재구매: 화려한 광고 없이도 인정받는 재구매율"}
                  />
                </div>
                <div>
                  <Label className="text-xs">자주 폭로하고 싶은 업계 관행 (3~5개 권장)</Label>
                  <Textarea
                    rows={4}
                    value={listText.villains}
                    onChange={(e) => {
                      setListText((prev) => ({ ...prev, villains: e.target.value }));
                      update("villains", linesToArray(e.target.value));
                    }}
                    placeholder={"한 줄에 하나씩\n\n예:\n성분 표기 속임\n과장 광고\n자연유래 소량 첨가 후 주성분처럼 광고\n'원료 자체의 효능'을 마치 '화장품의 효능'인 것처럼 눈속임"}
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
                  placeholder="예: 민감 피부(두피)로 제품 선택에 어려움 겪는 분들"
                />
              </Section>

              <Section
                title="핵심 가치"
                hint="브랜드 정체성의 한 줄들 (안 적어도 됩니다)"
              >
                <Textarea
                  rows={4}
                  value={listText.coreValues}
                  onChange={(e) => {
                    setListText((prev) => ({ ...prev, coreValues: e.target.value }));
                    update("coreValues", linesToArray(e.target.value));
                  }}
                  placeholder={"한 줄에 하나씩\n\n예:\n올바른성분\n검증된 안전성\n민감 피부 전문성\n고객 공감\n지속적인 연구\n우리아이도 안심하고 쓸수있는 제품"}
                />
              </Section>

              <Section
                title="금기 단어"
                hint="글에 절대 노출 X"
              >
                <Textarea
                  rows={2}
                  value={listText.forbiddenWords}
                  onChange={(e) => {
                    setListText((prev) => ({ ...prev, forbiddenWords: e.target.value }));
                    update("forbidden", {
                      ...payload.forbidden,
                      forbiddenWords: linesToArray(e.target.value),
                    });
                  }}
                  placeholder={"한 줄에 하나씩\n\n예:\n완치\n치료\n독점"}
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
