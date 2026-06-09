// /help/shortspick-guide — "쇼츠픽 · 영상 만들기" 카테고리.
// 영상 제작 5단계 + 왜 '직접 제공'을 권하는가.

import {
  ManualArticle,
  PageIntro,
  Section,
  SubHeading,
  StageHeading,
  Callout,
  DefList,
  ManualFooterNote,
} from "../_components/manual-ui";

export default function HelpShortsGuidePage() {
  return (
    <ManualArticle>
      <PageIntro>
        영상 한 편을 처음부터 끝까지 만드는 순서입니다.{" "}
        <strong className="font-semibold text-foreground">
          제목·대본 → 이미지/영상 → 음성 → 배경음악 → 제작
        </strong>{" "}
        5단계만 따라오면 됩니다.
      </PageIntro>

      {/* ─────────── 5단계 흐름 ─────────── */}
      <Section id="shorts-flow" number="01" title="영상 제작 5단계 흐름">
        <DefList
          items={[
            {
              term: "1 · 제목·대본",
              desc: "대본을 붙여넣으면 문장 단위로 자동 정리됩니다.",
            },
            {
              term: "2 · 자산",
              desc: "장면별 이미지·영상을 AI로 생성하거나 직접 업로드합니다.",
            },
            { term: "3 · 음성", desc: "대본을 읽어줄 나레이션을 입힙니다." },
            { term: "4 · BGM", desc: "영상에 깔릴 배경음악을 선택합니다." },
            {
              term: "5 · 영상 제작",
              desc: "모든 요소를 합쳐 하나의 영상으로 완성합니다.",
            },
          ]}
        />
        <Callout tone="warning">
          <strong className="block text-foreground">
            시작할 때 두 갈래 길 — “AI 모두 생성” vs “내가 직접 제공”
          </strong>
          <span className="mt-1 block text-foreground/80">
            이 가이드는 <strong>“내가 직접 제공”</strong>(제목·대본을 직접
            준비해 넣는 방식)을 기준으로 안내합니다. 결과물 완성도가 확실히 높기
            때문입니다. 이유는 맨 아래 “왜 직접 제공인가”에서 설명합니다.
          </span>
        </Callout>
      </Section>

      {/* ─────────── 직접 만들어보기 ─────────── */}
      <Section id="shorts-make" number="02" title="직접 한 편 만들어보기">
        <Callout tone="warning">
          <strong className="block text-foreground">
            시작 전 딱 한 번 — API 키 3개 등록
          </strong>
          <span className="mt-1 block text-foreground/80">
            쇼츠픽은 글을 쓰는 <strong>제미나이</strong>, 목소리를 만드는{" "}
            <strong>타입캐스트</strong>, 영상을 만드는 <strong>FAL</strong> 세
            가지 AI를 사용합니다. 화면 오른쪽 위 “API 키 입력”에서 세 키를 각각
            등록하세요. (발급법·비용은 “API 키 · 비용” 카테고리 참고)
          </span>
        </Callout>

        <StageHeading id="shorts-step-1" step="1" title="제목과 대본 넣기" />
        <ul>
          <li>
            <strong>제목</strong>은 영상 맨 위에 <strong>두 줄</strong>로
            표시됩니다. 윗줄·아랫줄로 끊으면 짧은 쇼츠 화면에서도 메시지가 한눈에
            들어옵니다. (예: 윗줄 “얼굴 빨개지는” / 아랫줄 “의외의 진짜 이유”)
          </li>
          <li>
            <strong>대본</strong>은 준비한 글을 입력창에 붙여넣습니다. 한 번에
            최대 <strong>5,000자</strong>까지. 붙여넣은 뒤 “대본 쪼개기” 버튼을
            누르면 문장 단위로 나뉩니다.
          </li>
        </ul>

        <StageHeading id="shorts-step-2" step="2" title="장면마다 이미지·영상 채우기" />
        <p>
          나뉜 장면(줄)마다 화면에 보일 이미지나 영상을 채웁니다. 오른쪽
          프리뷰에서 실제 영상에 어떻게 보이는지 실시간으로 확인할 수 있습니다.
        </p>
        <DefList
          items={[
            {
              term: "AI 이미지 생성",
              desc: "줄 대본에 맞는 이미지를 AI가 생성. ‘이미지 없는 줄 일괄 AI 생성’으로 빈 줄을 한 번에 채울 수도 있습니다.",
            },
            {
              term: "AI 영상 변환",
              desc: "이미지가 생기면 ‘AI 영상 변환’ 버튼이 나타나, 정지 이미지를 움직이는 영상으로 바꿉니다.",
            },
            {
              term: "직접 업로드",
              desc: "가진 사진·영상을 그 줄에 직접 올릴 수도 있습니다.",
            },
          ]}
        />
        <Callout tone="warning">
          <strong className="block text-foreground">
            ✅ 가장 추천 — 직접 찍은 사진·영상
          </strong>
          <span className="mt-1 block text-foreground/80">
            이미지를 전부 AI로 만드는 건 권하지 않습니다(실사 느낌이 약함).
            대표님 제품을 스마트폰으로 직접 찍기만 해도 훨씬 진짜 같고 신뢰가
            가는 화면이 됩니다. 직접 촬영 + 부족한 부분만 AI를 섞는 방식을
            추천합니다.
          </span>
        </Callout>
        <Callout tone="danger">
          <strong className="block text-foreground">
            직접 찍은 영상은 그 줄 나레이션보다 길어야 합니다
          </strong>
          <span className="mt-1 block text-foreground/80">
            대본 읽는 데 5초인데 올린 영상이 3초면, 영상이 먼저 끝나 나머지 2초가
            검은 화면이 됩니다. 넉넉하게 길게 찍어두세요. (자막 한 줄이 너무 길면
            Enter로 줄을 나누거나 다시 합칠 수 있고, 필요 없는 줄은 삭제
            가능합니다.)
          </span>
        </Callout>

        <StageHeading id="shorts-step-3" step="3" title="음성 입히기" />
        <ul>
          <li>
            <strong>음성 선택</strong> — 여러 목소리 중 선택. 재생 버튼(▶)으로
            미리 들어볼 수 있습니다.
          </li>
          <li>
            <strong>감정/톤</strong> — 보통·기쁨·밝게·슬픔·화남·차분하게·속삭임
            중 선택.
          </li>
          <li>
            <strong>TTS 속도</strong> — 기본 1.0배, 0.5배~2배 조절.
          </li>
        </ul>
        <Callout tone="warning">
          추천 설정: 성우 <strong>혜리</strong> · 감정 <strong>보통</strong> ·
          속도 <strong>1.1~1.2배</strong>. 설정 후 “나레이션 음성 만들기”를
          누르면 대본 전체에 목소리가 입혀집니다.
        </Callout>

        <StageHeading id="shorts-step-4" step="4" title="배경음악(BGM) 깔기" />
        <DefList
          items={[
            {
              term: "BGM 업로드",
              desc: "내 음악 파일 직접 업로드 (MP3·WAV·OGG, 최대 20MB).",
            },
            {
              term: "YouTube 오디오 보관함",
              desc: "유튜브가 무료 제공하는 음악을 장르·분위기·아티스트별로 검색해 선택.",
            },
          ]}
        />
        <p>
          BGM 볼륨은 나레이션을 덮지 않게 낮게. 기본값 <strong>12%</strong>가
          적당합니다.
        </p>
        <Callout tone="danger">
          <strong className="block text-foreground">
            유튜브 오디오 보관함 음악의 함정
          </strong>
          <span className="mt-1 block text-foreground/80">
            이 무료 음악은 <strong>유튜브에서만</strong> 쓸 수 있습니다. 인스타·틱톡
            등 다른 곳에 올리면 저작권 문제가 생길 수 있어요. ① 어디서나 자유로운
            음원(완전 무료·직접·AI 음악)을 쓰거나, ② 여기선 BGM 없이 넘어가고 각
            플랫폼에 올릴 때 그 플랫폼 음악을 입히는 방법을 권합니다.
          </span>
        </Callout>

        <StageHeading id="shorts-step-5" step="5" title="영상 만들고 확인하기" />
        <p>
          “영상 제작”을 누르면 제목·대본·이미지·음성·BGM이 하나로 합쳐집니다.
          진행률(%)과 현재 작업 상태가 표시되고, 완성되면 그 자리에서 바로 재생해
          확인할 수 있습니다. 고칠 곳이 있으면 이전 단계로 돌아가 다시 만들 수
          있습니다.
        </p>
        <Callout tone="danger">
          <strong className="block text-foreground">
            “영상 다운로드” 또는 “새 영상 만들기”를 누르면 되돌릴 수 없습니다
          </strong>
          <span className="mt-1 block text-foreground/80">
            둘 중 하나라도 누르면 프로그램이 “이 작업은 끝났다”로 받아들여 더는
            이전 단계로 못 돌아갑니다. <strong>영상을 충분히 확인하고 고칠 곳이
            없을 때</strong> 다운로드를 누르세요.
          </span>
        </Callout>
      </Section>

      {/* ─────────── 왜 직접 제공인가 ─────────── */}
      <Section id="shorts-why" number="03" title="왜 ‘직접 제공’을 권하는가">
        <p>
          영상을 만드는 일 자체는 어렵지 않습니다. 진짜 차이를 만드는 건{" "}
          <strong>어떤 대본으로 시작하느냐</strong>입니다.
        </p>
        <SubHeading>AI는 받은 만큼만 돌려줍니다</SubHeading>
        <p>
          “AI 모두 생성”은 키워드 몇 개로 누구에게나 해당될 무난한 글을 써냅니다.
          대표님 브랜드의 결도, 고객도, 꼭 담고 싶은 이야기도 모른 채 쓴 글이라
          무난하지만 남는 게 없습니다.
        </p>
        <SubHeading>좋은 대본은 ‘충분한 대화’에서 나옵니다</SubHeading>
        <p>
          ChatGPT·제미나이 웹에서 브랜드 이야기·제품 특징·메시지·자료를 충분히
          주고 다듬으면 깊이 있고 나다운 대본이 나옵니다. 그렇게 잘 뽑은 제목·대본을
          쇼츠픽에 “직접 제공”으로 넣고, <strong>영상으로 만드는 일만 쇼츠픽에
          맡기는</strong> 것이 가장 좋은 흐름입니다.
        </p>
        <Callout tone="warning">
          매출을 만드는 것은 뾰족한 기획이지 편집이 아닙니다. 기획(대본)은
          대표님이, 반복되는 영상 제작은 쇼츠픽이 — 이 역할 분담이 ‘직접 제공’의
          핵심입니다.
        </Callout>
      </Section>

      <ManualFooterNote>
        영상 제작에 필요한 API 키 발급과 모델별 비용은 “API 키 · 비용”
        카테고리를 참고하세요.
      </ManualFooterNote>
    </ManualArticle>
  );
}
