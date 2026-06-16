import { describe, it, expect } from "vitest";
import { buildBrandContext, buildBrandDataMap } from "../brand-context";
import type { BrandProfile } from "@/types/brand";

const PROFILE: BrandProfile = {
  id: "p1",
  name: "미르엔",
  category: "민감 피부 화장품",
  oneLine: "민감 피부 전용 자체 임상 브랜드",
  coreValues: ["올바른 성분"],
  narrator: { name: "윤희", role: "대표", authority: "미르엔 8년 운영\n재구매율 35%", fixed: true },
  story: {
    origin: "민감 피부 때문에 직접 만들기 시작",
    crisis: "사용감·안정화 안 돼 수개월 고생",
    revival: "오기로 버텨 첫 샴푸 완성",
    encounter: "입소문으로 재구매가 늘며 방향 확신",
  },
  episodes: [],
  services: [],
  targets: { primary: "민감 피부로 제품 선택이 어려운 분" },
  differentiators: ["자체 임상 6개월", "높은 재구매율"],
  villains: ["성분 표기 속임", "과장 광고"],
  customerCases: ["두피 진정 효과로 재구매한 분 많음", "트러블 가라앉았다는 후기 다수"],
  recommendedRoutes: [],
  cta: { channels: [] },
  forbidden: { competitorNames: true, forbiddenWords: [], adStyle: true },
};

describe("buildBrandContext — 모드별 필터링", () => {
  it('"full"(기본): 고객사례 미렌더, 빌런은 [공통의 적], 스토리 full', () => {
    const ctx = buildBrandContext(PROFILE);
    expect(ctx).not.toContain("고객 사례·후기");
    expect(ctx).toContain("[공통의 적");
    expect(ctx).toContain("[브랜드 스토리]");
    expect(ctx).toContain("부활:"); // 스토리 4칸 전부
  });

  it('"intro": 빌런 제외, 고객사례 포함, 스토리 full', () => {
    const ctx = buildBrandContext(PROFILE, "intro");
    expect(ctx).not.toContain("공통의 적");
    expect(ctx).not.toContain("시장 폭로"); // 폭로 헤더 없음
    expect(ctx).toContain("[브랜드 스토리]");
    expect(ctx).toContain("고객 사례·후기");
    expect(ctx).toContain("두피 진정 효과로 재구매한 분 많음");
  });

  it('"value-proof": 스토리 펼침 없음(1줄 압축), 빌런 폭로 헤더, 고객사례 제3자 증명 헤더', () => {
    const ctx = buildBrandContext(PROFILE, "value-proof");
    expect(ctx).not.toContain("[브랜드 스토리]"); // 펼치지 않음
    expect(ctx).toContain("탄생 배경"); // 1줄 압축 + 10% 캡
    expect(ctx).toContain("한계 인식"); // 빌런 목적 태그
    expect(ctx).toContain("제3자 증명"); // 고객사례 목적 태그
  });

  it("고객사례는 detail/custom(=full)에 절대 새지 않음 (회귀 가드)", () => {
    expect(buildBrandContext(PROFILE, "full")).not.toContain("두피 진정 효과");
  });
});

describe("buildBrandDataMap", () => {
  it('"intro"은 시행착오→현장 감정 라우팅 포함', () => {
    expect(buildBrandDataMap("intro")).toContain("시행착오");
  });
  it('"value-proof"은 10% 캡 지침 포함', () => {
    expect(buildBrandDataMap("value-proof")).toContain("10% 미만");
  });
  it('"full"은 빈 문자열', () => {
    expect(buildBrandDataMap("full")).toBe("");
  });
});
