"use client";

// Card A 1단계 — 주제 설정. 카테고리/영상목적에 따라 조건부 필드가 나타나고,
// "제목 생성하기" 로 백엔드(/api/generate/titles)를 호출해 제목 후보를 받아 다음 단계로.
// (제품 이미지 그리드는 다음 하위 단계에서 추가 — 제목 생성에는 불필요.)

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useYt } from "../state";
import { categoryFields, generateTitles } from "@/lib/youtube/endpoints";

const SELECT_CLS =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

export function TopicInput() {
  const { state, update } = useYt();
  const [busy, setBusy] = useState(false);

  const isCosmetics = state.category === "cosmetics";
  // promo(페인포인트/제품 연동)는 promo 만. promo_comment 는 주제만으로 생성하는 별도 경로.
  const isPromo = isCosmetics && state.contentType === "promo";
  const isInfo = isCosmetics && state.contentType === "info";

  const canGenerate =
    state.topic.trim().length > 0 && (!isPromo || state.painPoint.trim().length > 0);

  async function handleGenerate() {
    if (!canGenerate || busy) return;
    setBusy(true);
    try {
      const { titles } = await generateTitles({
        topic: state.topic.trim(),
        ...categoryFields({
          category: state.category,
          contentType: state.contentType,
          painPoint: state.painPoint,
          ingredient: state.ingredient,
          keyword: state.keyword,
        }),
      });
      if (!titles?.length) throw new Error("제목을 생성하지 못했습니다.");
      update({
        titleOptions: titles,
        selectedTitle: "",
        titleLine1: "",
        titleLine2: "",
        // 제목이 새로 생성됐으니 하위 단계 산출물은 모두 무효화.
        narration: [],
        scriptLines: null,
        ttsSessionId: null,
        // info 타입 키워드 불일치 경고용 스냅샷.
        keywordAtTitleGen: isInfo ? state.keyword.trim() : "",
        screen: "titles",
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "제목 생성에 실패했습니다.";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 text-card-foreground">
      <h2 className="text-lg font-semibold">1. 주제 설정</h2>

      <div className="mt-5 space-y-5">
        <div className="grid gap-1.5">
          <Label htmlFor="yt-category">카테고리</Label>
          <select
            id="yt-category"
            className={SELECT_CLS}
            value={state.category}
            onChange={(e) =>
              update({ category: e.target.value as typeof state.category })
            }
          >
            <option value="cosmetics">화장품</option>
            <option value="general">일반</option>
          </select>
        </div>

        {isCosmetics && (
          <div className="grid gap-1.5">
            <Label htmlFor="yt-content-type">영상 목적</Label>
            <select
              id="yt-content-type"
              className={SELECT_CLS}
              value={state.contentType}
              onChange={(e) =>
                update({
                  contentType: e.target.value as typeof state.contentType,
                })
              }
            >
              <option value="info">정보성 (순수 정보 전달)</option>
              <option value="promo_comment">홍보성 (고정댓글 유도형)</option>
              {/* '홍보성(블로그 유입용)'은 제품 이미지 연동이 필요해 제품 등록 화면 구현 후 활성화 */}
            </select>
          </div>
        )}

        <div className="grid gap-1.5">
          <Label htmlFor="yt-topic">주제</Label>
          <Input
            id="yt-topic"
            placeholder="피부 고민 또는 관리 주제"
            maxLength={200}
            value={state.topic}
            onChange={(e) => update({ topic: e.target.value })}
          />
        </div>

        {isPromo && (
          <>
            <div className="grid gap-1.5">
              <Label htmlFor="yt-painpoint">타겟 고민 / 페인포인트</Label>
              <Input
                id="yt-painpoint"
                placeholder="타겟의 피부 증상 (예: 얼굴 빨개짐)"
                maxLength={100}
                value={state.painPoint}
                onChange={(e) => update({ painPoint: e.target.value })}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="yt-ingredient">핵심 성분 또는 제품 역할 (선택)</Label>
              <Input
                id="yt-ingredient"
                placeholder="성분 또는 제품이 해결하는 방식"
                maxLength={200}
                value={state.ingredient}
                onChange={(e) => update({ ingredient: e.target.value })}
              />
            </div>
          </>
        )}

        {isInfo && (
          <div className="grid gap-1.5">
            <Label htmlFor="yt-keyword">영상에서 다룰 핵심 키워드 (선택)</Label>
            <Input
              id="yt-keyword"
              placeholder="예: 맥주효모 / 비오틴 / 판토텐산"
              maxLength={100}
              value={state.keyword}
              onChange={(e) => update({ keyword: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              성분·원리·개념만 입력하세요. 제품명·브랜드명은 정보성 영상에서 금지입니다.
            </p>
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleGenerate} disabled={!canGenerate || busy} className="gap-2">
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          제목 생성하기
        </Button>
      </div>
    </div>
  );
}
