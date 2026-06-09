// /help/marketing — "마케팅 가이드" 카테고리.
// 마케팅 퍼널(고객 구매여정)과 브랜드 블로그 적용법.

import {
  ManualArticle,
  PageIntro,
  Section,
  SubHeading,
  Callout,
  DefList,
  ManualFooterNote,
} from "../_components/manual-ui";

export default function HelpMarketingPage() {
  return (
    <ManualArticle>
      <PageIntro>
        블로그 글이 “읽히는 것”에서 끝나지 않고{" "}
        <strong className="font-semibold text-foreground">
          행동으로 이어지게
        </strong>{" "}
        하려면 마케팅 퍼널을 이해해야 합니다. 글쓰기 전에 한 번 읽어두면 글의
        목적이 또렷해집니다.
      </PageIntro>

      {/* ─────────── 마케팅 퍼널 ─────────── */}
      <Section id="funnel" number="01" title="마케팅 퍼널 이해하기">
        <p>
          <strong>마케팅 퍼널</strong>이란 소비자가 제품(서비스)을 결제하기까지의
          과정을 말합니다. ‘고객 구매여정’이라고도 합니다.
        </p>

        <SubHeading>고객은 보통 이렇게 구매합니다</SubHeading>
        <ol>
          <li>
            <strong>인지</strong> — 네이버에 검색해 눈에 띄는 곳을 클릭
          </li>
          <li>
            <strong>흥미</strong> — 원하는 조건이면 관심을 갖고 더 탐색
          </li>
          <li>
            <strong>고려</strong> — 마음에 드는 2~5곳을 두고 어디를 고를지 비교
          </li>
          <li>
            <strong>구매</strong> — 의문·불편이 없으면 결제
          </li>
        </ol>

        <Callout tone="warning">
          <strong className="block text-foreground">
            블로그로 ‘구매’를 직접 유도하면 안 됩니다
          </strong>
          <span className="mt-1 block text-foreground/80">
            블로그 글의 목적지는 결제가 아니라{" "}
            <strong>브랜드 키워드 검색 또는 상세페이지 이동</strong>입니다. 글에서
            바로 결제를 압박하면 역효과가 납니다.
          </span>
        </Callout>

        <SubHeading>글쓰기에 적용하면</SubHeading>
        <DefList
          items={[
            { term: "제목", desc: "후킹으로 ‘인지’시키기" },
            { term: "오프닝", desc: "신뢰로 ‘흥미’를 느끼게" },
            { term: "메리트", desc: "자랑으로 ‘고려’하게" },
            {
              term: "클로징",
              desc: "행동유도 — 결제(X)가 아니라 ‘원하는 목적지’로 도달하게",
            },
          ]}
        />

        <SubHeading>브랜드 블로그 템플릿에 대입하면</SubHeading>
        <DefList
          items={[
            { term: "인지", desc: "정보성 글" },
            { term: "흥미", desc: "소개글" },
            { term: "고려", desc: "가치 입증 글" },
            { term: "결제", desc: "상세 페이지 글" },
          ]}
        />
      </Section>

      <ManualFooterNote>
        브랜드 블로그 5단계 실제 작성법은 “사용방법” 카테고리를 참고하세요.
      </ManualFooterNote>
    </ManualArticle>
  );
}
