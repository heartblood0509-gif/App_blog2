// /help/shortspick-api — "쇼츠픽 · API 키 · 비용" 카테고리.
// API 키 3개 등록 + 모델별 비용 + 타입캐스트/FAL 발급 안내.

import {
  ManualArticle,
  PageIntro,
  Section,
  SubHeading,
  Code,
  Callout,
  DefList,
  ManualFooterNote,
} from "../_components/manual-ui";

export default function HelpShortsApiPage() {
  return (
    <ManualArticle>
      <PageIntro>
        쇼츠픽은 영상을 만들 때 세 가지 AI를 사용합니다 —{" "}
        <strong className="font-semibold text-foreground">
          제미나이(글) · 타입캐스트(음성) · FAL(영상)
        </strong>
        . 각 키를 한 번만 발급·등록하면 됩니다.
      </PageIntro>

      {/* ─────────── API 키 3개 등록 ─────────── */}
      <Section id="shorts-api" number="01" title="API 키 3개 등록">
        <DefList
          items={[
            { term: "제미나이 (글)", desc: "대본·이미지 생성에 사용." },
            { term: "타입캐스트 (음성)", desc: "나레이션 목소리 생성에 사용." },
            { term: "FAL (영상)", desc: "이미지를 움직이는 영상으로 변환." },
          ]}
        />
        <p>
          세 키를 모두 발급받았다면 화면 오른쪽 위{" "}
          <strong>“API 키 입력”</strong> 버튼을 눌러 각각 등록하세요. 등록이
          끝나면 영상을 만들 준비가 완료됩니다.
        </p>
        <Callout tone="warning">
          <strong className="block text-foreground">
            비용이 부담되면 조금씩 충전하세요
          </strong>
          <span className="mt-1 block text-foreground/80">
            AI 이미지 생성·영상 변환은 API 사용 금액이 듭니다. 한 번에 많이
            충전하기보다 조금씩 충전해 쓰는 걸 권합니다. 참고로{" "}
            <strong>대본 쪼개기·편집은 추가 금액이 전혀 들지 않습니다.</strong>
          </span>
        </Callout>
      </Section>

      {/* ─────────── 모델별 비용 ─────────── */}
      <Section id="shorts-cost" number="02" title="API 모델별 비용 정리">
        <DefList
          items={[
            {
              term: "제미나이 (글)",
              desc: "글(대본)은 신경 안 써도 될 만큼 저렴합니다. 비용은 거의 ‘이미지 장수’에서 나옵니다.",
            },
            {
              term: "타입캐스트 (음성)",
              desc: "원래 월 39,000원인데, API로 쓰면 매달 무료입니다.",
            },
            {
              term: "FAL (이미지→영상)",
              desc: "가장 비용이 많이 나오는 곳. 컷이 많을수록 올라가고, 구글 정책에 따라 요금이 바뀔 수 있습니다.",
            },
          ]}
        />
      </Section>

      {/* ─────────── 타입캐스트 ─────────── */}
      <Section id="shorts-typecast" number="03" title="타입캐스트 API 키 (음성)">
        <p>
          나레이션 음성에 필요한 키입니다. <strong>API로 쓰면 매달 무료</strong>
          (원래 월 39,000원 pro 요금제 수준의 월 30,000 크레딧)로 사용할 수
          있습니다.
        </p>
        <SubHeading>발급 순서</SubHeading>
        <ol>
          <li>구글에서 <strong>“타입캐스트 api”</strong> 검색</li>
          <li>
            검색 결과 중 타입캐스트 공식{" "}
            <strong>“The Most Expressive Text-to-Speech API”</strong> 클릭
          </li>
          <li>
            TTS API 페이지에서 <strong>“무료로 시작하기”</strong> 클릭
          </li>
          <li><strong>구글 계정</strong>으로 로그인 → 기본 정보(거주 국가 등) 입력</li>
          <li>
            약관 동의 — <strong>“API 이용약관”</strong> 체크 후 확인
          </li>
          <li>
            상단 <strong>“API 키”</strong> 탭 → 키를 선택하고{" "}
            <strong>“복사”</strong> 버튼 클릭 (클립보드에 복사됨)
          </li>
          <li>
            쇼츠픽 상단 <strong>“API 키 입력”</strong> → Typecast API 키 칸에
            붙여넣고 저장
          </li>
        </ol>
      </Section>

      {/* ─────────── FAL ─────────── */}
      <Section id="shorts-fal" number="04" title="FAL API 키 (영상 변환)">
        <p>
          이미지를 영상으로 변환할 때 사용하는 키입니다. 이 과정에서{" "}
          <strong>선결제된 크레딧이 차감</strong>됩니다.
        </p>
        <SubHeading>① 키 발급</SubHeading>
        <ol>
          <li>구글에서 <strong>“fal.ai”</strong> 검색 → fal.ai 접속</li>
          <li>우측 상단 로그인 → <strong>“Continue with Google”</strong></li>
          <li>
            <strong>“For myself”</strong> → <strong>“Build with Code”</strong> →
            (유입 경로 선택) Continue
          </li>
          <li>Dashboard에서 <strong>“Set up billing”</strong> 클릭</li>
          <li>
            Settings → Billing → Payment Methods의 <strong>“Add card”</strong>
          </li>
          <li>
            Billing Address(영어 주소) 입력 — 모르면 ChatGPT·제미나이에 한글
            주소를 주고 “영어로 바꿔줘”라고 요청하면 됩니다. (Tax ID는 선택 —
            사업자번호가 있으면 <Code>brn</Code>으로 바꿔 입력)
          </li>
          <li>
            Address Saved → <strong>“Continue to Checkout”</strong> → 카드 정보
            입력 → 저장 → 결제 비밀번호 입력 후 submit
          </li>
          <li>
            Settings 좌측 <strong>“API Keys”</strong> → <strong>“Add key”</strong>{" "}
            → <strong>“Create Key”</strong> → <strong>“Copy Key”</strong>로 키
            복사
          </li>
        </ol>
        <Callout tone="danger">
          <strong className="block text-foreground">
            FAL 키는 이때 꼭 안전한 곳에 저장하세요
          </strong>
          <span className="mt-1 block text-foreground/80">
            다른 키와 달리 <strong>한 번만 보입니다.</strong> 저장해두지 않으면 새
            키를 다시 발급해야 합니다.
          </span>
        </Callout>
        <p>
          복사한 키는 쇼츠픽 <strong>“API 키 입력”</strong>의 FAL API 키 칸에
          붙여넣고 저장합니다.
        </p>

        <SubHeading>② 크레딧 충전 (영상 생성에 필수)</SubHeading>
        <p>
          키만 등록해선 끝이 아닙니다. <strong>선불 크레딧을 충전</strong>해야 AI
          영상 생성이 됩니다.
        </p>
        <ol>
          <li>
            fal 우측 상단 <strong>Credits / Billing</strong>로 이동 → Add
            Credits에서 <strong>“Quick Buy $10”</strong> 등으로 충전
          </li>
          <li>
            (선택) <strong>Auto Top-up</strong> — 잔액이 $10 이하로 내려가면 $20
            자동 충전되도록 설정 후 <strong>“Enable Auto Top-up”</strong>
          </li>
        </ol>

        <SubHeading>비용 안내</SubHeading>
        <ul>
          <li>
            현재 가장 가성비 좋은 <strong>veo 3.1 lite</strong> 모델을 기본으로
            적용해 두었습니다. 컷이 많을수록 비용이 올라갑니다.
          </li>
        </ul>
        <Callout tone="warning">
          <strong className="block text-foreground">비용이 부담스럽다면</strong>
          <span className="mt-1 block text-foreground/80">
            <strong>Gemini 웹 버전</strong>에서 영상을 직접 생성한 뒤 쇼츠픽에
            업로드해 제작하는 방법을 추천합니다. (FAL 영상 변환 없이도 제작 가능)
          </span>
        </Callout>
      </Section>

      <ManualFooterNote>
        키를 모두 등록했다면 “영상 만들기” 카테고리로 돌아가 첫 영상을
        만들어보세요. 쇼츠픽 관련 문의는 카카오 채널(평일 오전 10시~오후 5시)을 이용해주세요.
      </ManualFooterNote>
    </ManualArticle>
  );
}
