/**
 * SEO·AEO Intent Mode — 4개 의도 템플릿 정의.
 *
 * 글 구조(7단계)는 모든 의도가 공통이고, 의도별로 다른 부분만 "오버레이"로
 * 베이스 프롬프트에 합쳐진다. 코드 베이스 보호를 위해:
 * - 기존 함수(buildSeoAeoGenerationPrompt 등)는 한 줄도 손대지 않음
 * - templateType === "auto" 면 기존 함수 그대로 호출 (회귀 0)
 * - "auto" 가 아닐 때만 buildSeoAeoIntent*Prompt 새 함수 경로
 *
 * 오버레이 텍스트는 .claude/plans/sequential-yawning-robin-prompts.md 사용자 승인본과 동일.
 */
import type { SeoAeoTemplateType } from "@/types";
import {
  Sparkles,
  BookOpen,
  Scale,
  ShoppingCart,
  Wrench,
  type LucideIcon,
} from "lucide-react";

export type SeoAeoIntentType = Exclude<SeoAeoTemplateType, "auto">;

// 카드 라벨 (사용자분 원안 기준 — "정보 탐색형/비교 검토형/구매 전 고민형/문제 해결형")
// auto는 "AI에게 맡기기" (사용자분 결정)
export const INTENT_LABELS: Record<SeoAeoTemplateType, string> = {
  auto: "AI에게 맡기기",
  informational: "정보 탐색형",
  comparison: "비교 검토형",
  preBuy: "구매 전 고민형",
  problemSolving: "문제 해결형",
};

// 카드 설명 (사용자분 원안 — 각 타입의 작성 방향 설명)
export const INTENT_EXAMPLES: Record<SeoAeoTemplateType, string> = {
  auto: "의도를 정하지 않으면 AI가 글에 맞춰 알아서 작성합니다",
  informational: "개념 설명과 기본 정보 중심으로 작성한다",
  comparison: "차이점 비교 선택 기준 장단점 중심으로 작성한다",
  preBuy: "구매 전 확인할 기준 주의사항 선택 체크포인트 중심으로 작성한다",
  problemSolving: "독자의 고민 원인 해결 방향 관리 방법 중심으로 작성한다",
};

// 카드 좌상단 아이콘 (브랜드 글 템플릿과 동일 패턴 — lucide-react)
export const INTENT_ICONS: Record<SeoAeoTemplateType, LucideIcon> = {
  auto: Sparkles,
  informational: BookOpen,
  comparison: Scale,
  preBuy: ShoppingCart,
  problemSolving: Wrench,
};

// 카드 표시 순서 — "AI에게 맡기기"가 맨 앞 (사용자분 결정)
export const INTENT_ORDER: readonly SeoAeoTemplateType[] = [
  "auto",
  "informational",
  "comparison",
  "preBuy",
  "problemSolving",
] as const;

const OVERLAY_INFORMATIONAL = `이 글의 의도는 **개념 설명과 기본 정보 전달**입니다.

[도입부 패턴 권장 — 초보자 안내형]
처음 접하는 독자를 기준으로, 가장 먼저 확인해야 할 것을 쉽게 안내하는 흐름으로 시작합니다.
"○○가 처음이라면", "○○에 대해 잘 모른다면" 같은 진입 문구가 어울립니다.

[본문 2 의무 어휘 — 최소 1회씩 자연스럽게 등장]
- "기본"
- "이해"
- "차이"

[본문 2 자연 연결 톤]
제품·서비스를 강하게 추천하지 마세요. "이런 기준이 있을 때 어떤 선택지가 있다" 정도로 약하게 1개만 언급.

[본문 3 주의점 각도]
**잘못된 정보**에 속지 않는 법 중심. 흔히 떠도는 오해, 검증 안 된 통념을 짚어줍니다.

[FAQ 질문 시작 패턴 — 4개 중 2개 이상이 이 형태]
- "~란 무엇인가요"
- "~ 종류는 어떻게 되나요"
- "~는 왜 생기나요"

[피해야 할 어휘]
"더 낫다", "최고", "1위" 같은 단정적 비교는 절대 금지.
이 글은 비교가 아닌 이해를 목적으로 합니다.`;

const OVERLAY_COMPARISON = `이 글의 의도는 **선택지 간 차이와 비교 기준 제시**입니다.

[도입부 패턴 권장 — 비교형]
"○○는 종류·제품·브랜드마다 차이가 크다"는 점을 먼저 설명하고, 그래서 비교 기준이 필요하다는 흐름으로 시작합니다.

[본문 2 의무 어휘 — 최소 1회씩 자연스럽게 등장]
- "vs" 또는 "대"
- "차이"
- "장단점"
- "기준"

[본문 2 자연 연결 톤]
제품·서비스·옵션을 비교 후보 중 하나로 자연스럽게 등장시킵니다.
"이런 기준에서는 A가, 저런 기준에서는 B가 어울린다" 같은 균형 잡힌 표현.

[본문 3 주의점 각도]
**잘못된 비교 기준**에 빠지지 않는 법 중심. 가격만 본다거나, 한 가지 후기에 휘둘리는 실수를 짚어줍니다.

[FAQ 질문 시작 패턴 — 4개 중 2개 이상이 이 형태]
- "A와 B 중 어느 게 나아요"
- "A와 B 차이가 뭔가요"
- "○○ 살 때 A를 골라야 하나요"

[피해야 할 어휘]
"A가 무조건 좋다" 같은 단정적 결론 금지. 비교는 기준 중심으로.
한쪽만 일방적으로 띄우는 표현 피하기.`;

const OVERLAY_PRE_BUY = `이 글의 의도는 **구매 전 확인해야 할 기준과 체크포인트 제시**입니다.

[도입부 패턴 권장 — 실수 방지형]
"○○를 살 때 흔히 하는 실수"를 먼저 짚고, 후회하지 않기 위한 판단 기준을 제시하는 흐름으로 시작합니다.

[본문 2 의무 어휘 — 최소 1회씩 자연스럽게 등장]
- "기준"
- "체크" 또는 "확인"
- "후회"

[본문 2 자연 연결 톤]
제품·서비스·장소를 "이 기준에 맞는 선택지" 로 자연스럽게 연결.
마지막 본문 2 끝부분에서 자연스러운 행동 유도 한 줄 가능 (강한 광고체 X).

[본문 3 주의점 각도]
**구매 후 후회 포인트** 중심. "이거 안 보고 사면 나중에 후회한다" 식의 실제 위험 신호를 구체적으로.

[FAQ 질문 시작 패턴 — 4개 중 2개 이상이 이 형태]
- "사기 전에 뭘 봐야 하나요"
- "초보자도 괜찮을까요"
- "가격대가 어느 정도가 적정한가요"
- "환불·교환은 어떻게 되나요"

[피해야 할 어휘]
"무조건 사세요", "지금이 기회" 같은 강한 광고체 절대 금지.
"이 기준에 맞으면 좋은 선택" 정도의 결정 보조 톤만.`;

const OVERLAY_PROBLEM_SOLVING = `이 글의 의도는 **독자의 고민·증상·문제에 대한 원인 진단과 해결 방향 제시**입니다.

[도입부 패턴 권장 — 고민 공감형]
"○○ 때문에 불편함을 느끼는 상황"에 공감한 뒤, 그 원인과 해결 방향이 필요하다는 흐름으로 시작합니다.

[본문 2 의무 어휘 — 최소 1회씩 자연스럽게 등장]
- "원인"
- "관리" 또는 "방법"
- "단계"

[본문 2 자연 연결 톤]
제품·서비스를 **관리·해결 도구**로 자연스럽게 연결.
"이런 원인에는 이런 관리법이 도움이 되고, 그중 ○○ 같은 도구가 한 선택지" 흐름.

[본문 3 주의점 각도]
**잘못된 자가 진단**과 위험한 자가 처방 중심.
"이 증상은 다른 원인일 수도 있다", "이런 신호면 전문가 상담" 같은 안전 가드를 자연스럽게.

[FAQ 질문 시작 패턴 — 4개 중 2개 이상이 이 형태]
- "왜 ○○ 현상이 생기나요"
- "어떻게 해야 ○○이 줄어드나요"
- "○○하면 정말 해결되나요"
- "병원에 가야 할까요" (의료·건강 주제일 때)

[피해야 할 어휘]
"치료된다", "완치", "보장", "100%" 같은 효능 단정 절대 금지.
의료·건강 주제는 "~로 알려져 있어요", "~할 수 있어요" 완화 표현 의무.`;

const BODY_OVERLAYS: Record<SeoAeoIntentType, string> = {
  informational: OVERLAY_INFORMATIONAL,
  comparison: OVERLAY_COMPARISON,
  preBuy: OVERLAY_PRE_BUY,
  problemSolving: OVERLAY_PROBLEM_SOLVING,
};

export function buildIntentBodyOverlay(intent: SeoAeoIntentType): string {
  return BODY_OVERLAYS[intent];
}

// 제목 생성용 짧은 오버레이 — 5개 후보를 의도 1개의 각도 안에서만 변주
const TITLE_OVERLAYS: Record<SeoAeoIntentType, string> = {
  informational: `이번 글은 개념 설명·기본 정보 전달이 목적입니다.
제목 5개 모두 "이해형" 각도로 작성합니다.
- "~란?", "~ 종류 정리", "○○ 기본 가이드", "처음 ○○ 이해하기" 같은 패턴
- 비교형·구매형 제목은 만들지 마세요.`,
  comparison: `이번 글은 선택지 비교가 목적입니다.
제목 5개 모두 "비교형" 각도로 작성합니다.
- "A vs B", "어느 게 나을까요", "차이 정리", "○○와 ○○ 비교" 같은 패턴
- 단순 이해형이나 구매 유도형 제목은 만들지 마세요.`,
  preBuy: `이번 글은 구매 전 판단 기준 제시가 목적입니다.
제목 5개 모두 "판단형" 각도로 작성합니다.
- "사기 전 체크리스트", "고를 때 후회 안 하려면", "○○ 고르는 기준", "○○ 살 때 확인할 것" 같은 패턴
- 단정적 추천·홍보형 제목은 만들지 마세요.`,
  problemSolving: `이번 글은 문제·증상의 원인과 해결 방향 제시가 목적입니다.
제목 5개 모두 "해결형" 각도로 작성합니다.
- "왜 ○○이 생길까요", "○○ 해결 방법", "○○ 관리법 정리", "○○ 줄이는 법" 같은 패턴
- 효능 단정·치료 단정 표현 절대 금지.`,
};

export function buildIntentTitleOverlay(intent: SeoAeoIntentType): string {
  return TITLE_OVERLAYS[intent];
}

export function isIntentMode(
  templateType: SeoAeoTemplateType
): templateType is SeoAeoIntentType {
  return templateType !== "auto";
}
