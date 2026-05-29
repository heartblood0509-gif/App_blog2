// /help/start — "시작 전" 카테고리.
// 주의사항 + 시작 전 빠른 점검.

import {
  ManualArticle,
  PageIntro,
  Section,
  ManualFooterNote,
} from "../_components/manual-ui";

export default function HelpStartPage() {
  return (
    <ManualArticle>
      <PageIntro>
        블로그픽을 처음 켜기 전에{" "}
        <strong className="font-semibold text-foreground">
          꼭 알아두실 두 가지
        </strong>{" "}
        — 주의사항과 빠른 점검 체크리스트입니다.
      </PageIntro>

      <Section id="warning" number="01" title="주의사항" tone="warning">
        <p>
          이 도구는 <strong>네이버의 자동 로그인·자동 발행</strong> 기능을
          사용합니다.
        </p>
        <ul>
          <li>
            네이버 서비스 이용약관과 충돌할 가능성이 있으며, 이로 인한{" "}
            <strong>계정 제한·차단의 책임은 사용자에게 있습니다</strong>.
          </li>
          <li>
            캡차(보안 문자)·인증 우회 시도는 금지되어 있으므로,{" "}
            <strong>캡차가 뜨면 직접 풀어주세요</strong>.
          </li>
          <li>
            사용 중 네이버에서 이상 접속 경고가 뜨면{" "}
            <strong>즉시 사용을 중단</strong>하고 휴식 시간을 가지세요.
          </li>
          <li>
            <strong>자동 발행은 하루 최대 4편(계정 2개 × 계정당 2편)을
            권장합니다.</strong>{" "}
            글이 더 필요하시다면 블로그픽으로 본문만 생성한 뒤{" "}
            <strong>직접 네이버 블로그에 복사·붙여넣어</strong> 발행해주세요. 그
            이상 자동 발행을 무리하게 돌리면 계정 차단 위험이 커서 권장하지
            않습니다.
          </li>
        </ul>
      </Section>

      <Section id="prereq" number="02" title="시작 전 빠른 점검">
        <ul className="check-list">
          <li>
            <strong>API 키 등록</strong> 했나요? (상단 열쇠 아이콘에서 확인)
          </li>
          <li>
            <strong>네이버 계정</strong> 등록 했나요?
          </li>
          <li>
            <strong>인터넷 연결</strong> OK?
          </li>
        </ul>
        <p>
          셋 중 하나라도 안 됐으면 <strong>먼저 설치 매뉴얼</strong>을 다시
          보세요.
        </p>
      </Section>

      <ManualFooterNote>
        준비가 끝났다면 좌측 목차에서 <strong>"사용방법"</strong> 카테고리로
        넘어가세요.
      </ManualFooterNote>
    </ManualArticle>
  );
}
