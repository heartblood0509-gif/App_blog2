// /help/shortspick — "쇼츠픽 · 소개" 카테고리.
// 쇼츠픽이 무엇인지 + 블로그픽 앱으로 통합 예정 안내.

import {
  ManualArticle,
  PageIntro,
  Section,
  SubHeading,
  Callout,
  ManualFooterNote,
} from "../_components/manual-ui";

export default function HelpShortsPickPage() {
  return (
    <ManualArticle>
      <PageIntro>
        <strong className="font-semibold text-foreground">
          쇼츠픽(Shorts Pick)
        </strong>
        은 대본만 있으면 자막·이미지·음성·배경음악을 한 번에 얹어 숏폼 영상을
        완성해주는 도구입니다.{" "}
        <strong className="font-semibold text-foreground">
          반복되는 편집 노동을 0으로 만들어
        </strong>{" "}
        대표님이 기획과 대본에만 집중할 수 있게 돕습니다.
      </PageIntro>

      {/* ─────────── 쇼츠픽이란 ─────────── */}
      <Section id="shorts-about" number="01" title="쇼츠픽이란">
        <p>영상 한 편을 완성하려면 크게 두 가지 일이 필요합니다.</p>
        <ul>
          <li>
            <strong>기획·대본</strong> — “무엇을 말할 것인가”. 브랜드의 본질에
            닿은, 대표님만이 할 수 있는 일입니다.
          </li>
          <li>
            <strong>편집</strong> — 자막을 얹고 이미지를 붙이고 컷을 다듬는, 한 번
            익히면 누구나 똑같이 해내는 반복 노동입니다.
          </li>
        </ul>
        <p>
          그리고 매출과 직결되는 것은 편집이 아니라{" "}
          <strong>뾰족한 기획</strong>입니다.
          <br />
          쇼츠픽은 바로 그 편집 노동을 대신 맡아, 대표님이 기획과 대본에 시간을
          쏟을 수 있게 만듭니다.
        </p>
        <Callout tone="warning">
          <strong className="block text-foreground">
            쇼츠픽은 “켜면 매출이 따라오는 마법 버튼”이 아닙니다
          </strong>
          <span className="mt-1 block text-foreground/80">
            만드는 수고를 덜어드릴 뿐, 무엇을 말하고 어떻게 브랜드로 쌓을지는
            여전히 대표님의 기획에서 나옵니다.
            <br />
            다만 그 기획에 쓸 시간을 최대한 벌어드립니다.
          </span>
        </Callout>
      </Section>

      {/* ─────────── 블로그픽 통합 안내 ─────────── */}
      <Section id="shorts-integration" number="02" title="블로그픽 앱으로 통합 예정">
        <p>
          현재 쇼츠픽 웹 페이지를 <strong>블로그픽 앱으로 통합</strong>하는 작업을
          진행하고 있습니다.
          <br />
          블로그와 유튜브(쇼츠) 작업을 한 흐름에서 매끄럽게 이어갈 수 있도록 두
          서비스를 한곳으로 모으는 과정입니다.
        </p>
        <SubHeading>통합되면 쇼츠를 두 가지 방식으로 만들 수 있어요</SubHeading>
        <ul>
          <li>
            <strong>블로그 글로 변환해 제작</strong> — 작성한 블로그 글을 그대로
            쇼츠 영상으로 바꿔줍니다.
          </li>
          <li>
            <strong>직접 내용 넣어 제작</strong> — 블로그 없이도 원하는 내용만
            직접 넣으면 바로 쇼츠가 만들어집니다.
          </li>
        </ul>
        <Callout tone="warning">
          <strong className="block text-foreground">
            기존 쇼츠픽 웹 페이지는 곧 종료될 예정입니다
          </strong>
          <span className="mt-1 block text-foreground/80">
            화면(UI)은 지금과 거의 똑같이 옮겨오므로 쓰시던 방식 그대로 사용하실
            수 있습니다.
            <br />
            통합 전까지는 기존 쇼츠픽 웹에서{" "}
            <strong>승인받은 구글 계정</strong>으로 로그인해 사용하시면 됩니다.
          </span>
        </Callout>
        <p className="text-foreground/70">
          접속 링크·계정 승인 등은 카카오 채널로 문의해주세요. (평일 오전 11시 ~
          오후 5시)
        </p>
      </Section>

      <ManualFooterNote>
        실제 영상 제작 순서는 “영상 만들기”, 필요한 API 키와 비용은 “API 키 ·
        비용” 카테고리를 참고하세요.
      </ManualFooterNote>
    </ManualArticle>
  );
}
