// /help/tools — "도구 & 관리" 카테고리.
// 부가 기능 + 데이터 백업·PC 이전.

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

export default function HelpToolsPage() {
  return (
    <ManualArticle>
      <PageIntro>
        글쓰기 외에 알아두면 좋은{" "}
        <strong className="font-semibold text-foreground">
          블로그픽의 부가 도구와 데이터 관리 방법
        </strong>
        입니다.
      </PageIntro>

      <Section id="extras" number="01" title="부가 기능">
        <DefList
          items={[
            {
              term: "보관함",
              desc: "생성한 이미지·글을 저장하고 다시 꺼내 쓸 수 있어요",
            },
            {
              term: "브랜드 프로필",
              desc: "브랜드의 톤·자주 쓰는 표현·비주얼 스타일을 미리 설정 → 모든 글에 자동 반영",
            },
            {
              term: "제품 관리",
              desc: "자주 쓰는 제품 등록 → 키워드 없이 클릭만으로 글 생성",
            },
            {
              term: "기기 관리",
              desc: "한 계정으로 여러 PC에서 쓸 때 기기별 로그인 상태 확인·관리",
            },
            {
              term: "다크모드",
              desc: "우측 상단 토글",
            },
            {
              term: "자동 업데이트",
              desc: (
                <>
                  <strong>Windows는 자동</strong>으로 새 버전 알림 → 클릭 한
                  번. <strong>Mac은 수동</strong>: 배포처에서 새 .dmg를 받아
                  재설치
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section id="backup" number="02" title="내 데이터 백업 · 다른 PC로 옮기기">
        <p>
          블로그픽의 모든 데이터(등록한 제품, 브랜드 프로필, 보관함 이미지 등)는
          다음 폴더에 있습니다.
        </p>
        <DefList
          items={[
            {
              term: "Windows",
              desc: (
                <>
                  <Code>%APPDATA%\app-blog2-desktop\</Code> (파일 탐색기
                  주소창에 그대로 입력)
                </>
              ),
            },
            {
              term: "Mac",
              desc: (
                <>
                  <Code>~/Library/Application Support/app-blog2-desktop/</Code>{" "}
                  (Finder → 이동 → 폴더로 이동)
                </>
              ),
            },
          ]}
        />

        <SubHeading>백업하기</SubHeading>
        <ol>
          <li>
            위 폴더를 통째로 <strong>압축</strong> (zip)
          </li>
          <li>클라우드·외장하드 등 안전한 곳에 보관</li>
        </ol>

        <SubHeading>다른 PC로 옮기기 (PC 교체 시)</SubHeading>
        <ol>
          <li>기존 PC에서 위 폴더를 압축 → 새 PC로 옮기기</li>
          <li>
            새 PC에 Blog Pick <strong>설치 → 종료</strong> (한 번 실행해서
            폴더 생성 후 종료)
          </li>
          <li>새 PC의 동일 경로 폴더에 백업본을 풀어 덮어쓰기</li>
          <li>새 PC에서 Blog Pick 실행</li>
        </ol>

        <Callout tone="warning">
          <strong className="block text-foreground">주의 사항</strong>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-foreground/80 marker:text-foreground/40">
            <li>
              <strong>네이버 비밀번호는 OS 키체인 기반</strong>이라 새 PC에서{" "}
              <strong>반드시 재등록</strong>해야 합니다. (보안상 의도된 동작)
            </li>
            <li>
              <strong>Gemini API 키</strong>는 파일로 옮겨가므로 재등록 불필요.
            </li>
            <li>
              새 PC에서 로그인할 때 <strong>"기기 관리"</strong>에서 기존 PC
              등록을 해제하거나, 다른 기기로 추가하세요.
            </li>
          </ul>
        </Callout>
      </Section>

      <ManualFooterNote>
        이 매뉴얼이 도움이 안 되거나 누락된 부분이 있다면 알려주세요. 다음
        버전에서 보완하겠습니다.
      </ManualFooterNote>
    </ManualArticle>
  );
}
