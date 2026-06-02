// 사용 매뉴얼 좌측 목차 구조 (카테고리 그룹).
// 각 그룹은 /help/{slug} 페이지 하나에 대응한다.
//   - 시작 전 → /help/start
//   - 사용방법 → /help/usage
//   - 도구 & 관리 → /help/tools

export type TocSubItem = {
  /** StageHeading id (예: wizard-review-step-1) */
  id: string;
  title: string;
};

export type TocItem = {
  /** Section의 HTML id (페이지 내 hash anchor) */
  id: string;
  title: string;
  /** 하위 항목 (예: 후기성 5단계의 각 단계) */
  children?: TocSubItem[];
};

export type TocGroup = {
  /** 그룹 라벨 (좌측 목차 상단 헤더) */
  label: string;
  /** 이 그룹의 페이지 경로 — 항목 클릭 시 `${page}#${id}` 로 이동 */
  page: string;
  items: TocItem[];
};

// 모드별 5단계 sub-item — 모드 3개가 동일 패턴이라 함수로 추출
function wizardSteps(prefix: string): TocSubItem[] {
  return [
    { id: `${prefix}-step-1`, title: "1단계 · 글 구조" },
    { id: `${prefix}-step-2`, title: "2단계 · 글 설정" },
    { id: `${prefix}-step-3`, title: "3단계 · 제목 선택" },
    { id: `${prefix}-step-4`, title: "4단계 · 본문 생성" },
    { id: `${prefix}-step-5`, title: "5단계 · 발행" },
  ];
}

export const TOC_GROUPS: TocGroup[] = [
  {
    label: "시작 전",
    page: "/help/start",
    items: [
      { id: "warning", title: "주의사항" },
      { id: "prereq", title: "시작 전 빠른 점검" },
    ],
  },
  {
    label: "사용방법",
    page: "/help/usage",
    items: [
      { id: "choose-mode", title: "어떤 모드를 골라야 하나요?" },
      {
        id: "wizard-review",
        title: "후기성 블로그 5단계",
        children: wizardSteps("wizard-review"),
      },
      {
        id: "wizard-brand",
        title: "브랜드 블로그 5단계",
        children: wizardSteps("wizard-brand"),
      },
      {
        id: "wizard-aeo",
        title: "AEO 블로그 5단계",
        children: wizardSteps("wizard-aeo"),
      },
      { id: "pitfalls", title: "자주 막히는 함정" },
    ],
  },
  {
    label: "도구 & 관리",
    page: "/help/tools",
    items: [
      { id: "extras", title: "부가 기능" },
      { id: "backup", title: "데이터 백업 · PC 이전" },
    ],
  },
  {
    label: "업데이트",
    page: "/help/update",
    items: [
      { id: "notify", title: "새 버전 알림 확인" },
      {
        id: "windows",
        title: "Windows 업데이트",
        children: [
          { id: "windows-step-1", title: "1단계 · 알림에서 업데이트" },
          { id: "windows-step-2", title: "2단계 · 잠시 기다리기" },
          { id: "windows-step-3", title: "3단계 · 보안 경고 통과" },
          { id: "windows-step-4", title: "4단계 · 완료" },
        ],
      },
      {
        id: "mac",
        title: "Mac 업데이트",
        children: [
          { id: "mac-step-1", title: "1단계 · dmg 파일 받기" },
          { id: "mac-step-2", title: "2단계 · 기존 앱 종료" },
          { id: "mac-step-3", title: "3단계 · dmg로 설치" },
          { id: "mac-step-4", title: "4단계 · 보안 경고 통과" },
        ],
      },
      { id: "troubleshoot", title: "자주 겪는 문제" },
      { id: "summary", title: "한눈에 요약" },
    ],
  },
];

/** 페이지 경로로 그룹을 찾는 헬퍼 */
export function findGroupByPage(pathname: string): TocGroup | undefined {
  return TOC_GROUPS.find((g) => pathname.startsWith(g.page));
}
