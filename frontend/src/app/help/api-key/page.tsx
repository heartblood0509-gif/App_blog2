// /help/api-key — "API 키" 카테고리.
// Gemini API 키 발급(무료) + 유료(Tier 1) 전환 + 선불 결제(429 에러 해결).

import {
  ManualArticle,
  PageIntro,
  Section,
  SubHeading,
  Code,
  Callout,
  ManualFooterNote,
} from "../_components/manual-ui";

export default function HelpApiKeyPage() {
  return (
    <ManualArticle>
      <PageIntro>
        블로그픽이 AI로 글을 쓰려면 Google의{" "}
        <strong className="font-semibold text-foreground">
          Gemini API 키
        </strong>
        가 필요합니다. 발급은 무료이며, 사용량이 많아지면 유료 설정으로 한도를
        늘릴 수 있습니다.
      </PageIntro>

      {/* ─────────── 발급 (무료) ─────────── */}
      <Section id="apikey-issue" number="01" title="Gemini API 키 발급 (무료 · 5분)">
        <ol>
          <li>
            웹브라우저에서{" "}
            <Code>https://aistudio.google.com/app/api-keys</Code> 접속
          </li>
          <li>Google 계정으로 로그인 (기존 Gmail 계정 사용 가능)</li>
          <li>
            <strong>“Create API key”</strong>(API 키 만들기) 버튼 클릭
          </li>
          <li>
            (키 생성 버튼이 안 보이면) <strong>“Projects” → “Import projects”</strong>
            로 기존 프로젝트를 가져온 뒤 다시 시도
          </li>
          <li>
            발급된 키(<Code>AIzaSy...</Code>로 시작하는 긴 문자열)를 안전한 곳에
            임시 저장
          </li>
        </ol>
        <Callout tone="danger">
          키는 비밀번호처럼 다뤄야 합니다. <strong>절대 SNS·공개 채팅에 올리지
          마세요.</strong>
        </Callout>
        <p>
          발급한 키는 블로그픽 우측 상단 <strong>🔑 열쇠 아이콘 → “API 키 설정”</strong>
          에서 붙여넣고 저장하면 됩니다.
        </p>

        <SubHeading>비용 안내</SubHeading>
        <ul>
          <li>무료 한도 내에서 사용 가능합니다.</li>
          <li>사용량이 많아지면 결제(유료) 설정이 필요할 수 있습니다.</li>
          <li>
            현재 요금 정책:{" "}
            <Code>https://ai.google.dev/gemini-api/docs/billing</Code>
          </li>
        </ul>
      </Section>

      {/* ─────────── 유료(Tier 1) 전환 ─────────── */}
      <Section id="apikey-paid" number="02" title="유료(Tier 1) 전환">
        <p>
          무료 한도를 자주 초과한다면 <strong>Tier 1</strong>로 올려 한도를 크게
          늘릴 수 있습니다. Tier 1 후불은 보통 <strong>월 250달러 한도</strong>로,
          무리하게 사용되는 것을 막아줍니다.
        </p>
        <SubHeading>① 무료 등급 키 만들기</SubHeading>
        <ol>
          <li>구글에서 “구글 ai 스튜디오”를 검색해 Google AI Studio 접속</li>
          <li>우측 상단 <strong>“Get started”</strong> → 이용 동의에 체크 후 확인</li>
          <li>
            좌측 하단 <strong>“Get API key”</strong> → <strong>“API 키 만들기”</strong>{" "}
            → 키 이름·프로젝트를 두고 <strong>“키 만들기”</strong>
          </li>
          <li>키가 생성되면 창을 <Code>x</Code>로 닫습니다 (무료 등급 키 완성)</li>
        </ol>
        <SubHeading>② 결제 등록해 Tier 1으로 올리기</SubHeading>
        <ol>
          <li>
            방금 만든 키 행의 <strong>“결제 설정”</strong> 클릭 → Google Cloud
            Billing 계정 설정 → 확인
          </li>
          <li>
            <strong>본인 인증</strong> — 이름·주민등록번호·이동통신사·휴대폰번호
            입력 후, 문자로 받은 인증코드 입력
          </li>
          <li>
            <strong>카드 등록</strong> — ① 카드번호 ② 비밀번호 앞 2자리 ③
            유효기간(MM/YY) 입력 후 제출
          </li>
          <li>
            설정이 완료되면 결제 등급이 <strong>“Tier 1 · 후불”</strong>로
            바뀝니다.
          </li>
          <li>
            마지막으로 키 옆 <strong>복사 버튼</strong>으로 API 키를 복사해 앱
            상단 🔑에 등록하세요.
          </li>
        </ol>
        <Callout tone="warning">
          <strong className="block text-foreground">
            결제 등급이 “Tier 1 · 선불”로 표시되나요?
          </strong>
          <span className="mt-1 block text-foreground/80">
            구글이 요금 방식을 순차적으로 <strong>선불(미리 충전)</strong>로
            바꾸고 있어, 계정에 따라 선불로 표시될 수 있습니다. 이 경우 아래 “선불
            결제”를 따라 충전해주세요.
          </span>
        </Callout>
      </Section>

      {/* ─────────── 선불 결제 (429 에러) ─────────── */}
      <Section id="apikey-prepaid" number="03" title="선불 결제 · 429 에러 해결">
        <SubHeading>왜 충전이 필요한가요?</SubHeading>
        <p>
          글·이미지 생성 중 갑자기 <strong>“429 에러”</strong>(
          <Code>RESOURCE_EXHAUSTED / prepayment credits are depleted</Code>)가
          뜨며 생성이 안 될 때가 있습니다. 앱 문제가 아니라, 구글이 요금 방식을{" "}
          <strong>후불 → 선불(미리 충전 후 사용)</strong>로 바꿨기 때문입니다. 잘
          쓰다가 어느 순간 막히면 선불로 바뀐 시점이라고 보시면 됩니다.
        </p>
        <p>
          확인은 이렇게 합니다 — Google AI Studio의 결제 등급이{" "}
          <strong>“Tier 1 · 선불”</strong>로 표시되고, 좌측 <strong>“프로젝트”</strong>
          에서 <strong>“크레딧 없음”</strong>이 떠 있습니다. 해결법은 간단합니다.
          크레딧만 채우면 다시 정상 작동하고, 한 번만 세팅하면 끝입니다.
        </p>

        <SubHeading>① 크레딧 충전</SubHeading>
        <ol>
          <li>
            (결제 카드를 아직 등록 안 했다면, 위 “유료 전환”의 카드 등록부터
            먼저 진행)
          </li>
          <li>
            API 키 목록에서 <strong>“내 결제 계정(My Billing Account)”</strong>{" "}
            클릭 → Gemini API 결제 화면
          </li>
          <li>
            <strong>“크레딧 구매하기”</strong> → 결제 금액 입력 (충전 최소 금액{" "}
            <strong>16,000원</strong>) → <strong>“결제하기”</strong>
          </li>
        </ol>

        <SubHeading>② 자동 충전 설정 (한 번만)</SubHeading>
        <ol>
          <li>크레딧 잔액이 확인되면 <strong>“자동 충전 관리”</strong> 클릭</li>
          <li><strong>“기타 금액”</strong> 클릭 → 충전 금액 <strong>16,000원</strong> 입력</li>
          <li>
            <strong>“크레딧 잔액이 1,000원 미만이면 충전”</strong>으로 설정 →{" "}
            <strong>저장</strong>
          </li>
          <li>“자동 충전이 사용 설정되었습니다” → <strong>완료</strong></li>
        </ol>
        <Callout tone="warning">
          마지막으로 “크레딧 없음” 표시가 사라졌는지 확인한 뒤, API 키를 복사해 앱
          🔑에 다시 등록하면 끝입니다. 화면이 헷갈리면 카카오 채널로 문의해주세요.
        </Callout>
      </Section>

      <ManualFooterNote>
        API 키를 등록했다면 “사용방법” 카테고리로 넘어가 첫 글을 작성해보세요.
      </ManualFooterNote>
    </ManualArticle>
  );
}
