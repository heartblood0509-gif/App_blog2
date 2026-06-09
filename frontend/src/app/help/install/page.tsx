// /help/install — "설치" 카테고리.
// Windows·Mac 설치 + 보안경고 통과 + 방화벽/백신 + 재설치·완전삭제 + FAQ.
// (So-Pick 노션 설치 가이드 내용을 앱 매뉴얼로 통합)

import {
  ManualArticle,
  PageIntro,
  Section,
  SubHeading,
  StageHeading,
  Code,
  Callout,
  DefList,
  ManualFooterNote,
} from "../_components/manual-ui";

export default function HelpInstallPage() {
  return (
    <ManualArticle>
      <PageIntro>
        블로그픽을 처음 설치하시는 분을 위한 안내입니다.{" "}
        <strong className="font-semibold text-foreground">
          위에서부터 한 줄씩 따라 하시면 30분 안에 첫 글 발행까지 가능합니다.
        </strong>{" "}
        설치 전 <strong>Gemini API 키</strong>는{" "}
        <Code>API 키</Code> 카테고리에서 발급 방법을 확인하세요.
      </PageIntro>

      {/* ─────────── Windows 설치 ─────────── */}
      <Section id="install-windows" number="01" title="Windows 설치">
        <SubHeading>준비물 체크리스트</SubHeading>
        <ul className="check-list">
          <li>Windows 10 이상 (Windows 11 권장)</li>
          <li>네이버 계정 (글을 올릴 네이버 블로그 계정)</li>
          <li>Gemini API 키 (무료 발급 — “API 키” 카테고리 참고)</li>
          <li>안정적인 인터넷 연결</li>
        </ul>

        <StageHeading step="1" title="설치 파일 다운로드" />
        <ul>
          <li>
            공식 배포처(GitHub Releases)에서 <Code>Blog-Pick-Windows-….exe</Code>{" "}
            파일을 받습니다.
          </li>
          <li>
            다운로드가 안 되면 주소를 복사해{" "}
            <strong>크롬 브라우저</strong> 주소창에 붙여넣고 엔터하세요. (엣지 등
            다른 브라우저에서 막힐 수 있습니다)
          </li>
          <li>32bit / 64bit 구분이 안 보이면 64bit를 받으면 됩니다.</li>
        </ul>

        <StageHeading step="2" title="설치 실행 — 여기서 가장 많이 막힙니다" />
        <p>
          <Code>.exe</Code> 파일을 더블클릭하면 파란 경고창{" "}
          <strong>“Windows에서 PC를 보호했습니다”</strong>(SmartScreen)가 뜰 수
          있습니다.
        </p>
        <Callout tone="warning">
          <strong className="block text-foreground">공식 파일이 맞다면:</strong>
          <span className="mt-1 block text-foreground/80">
            ① 창의 작은 글씨 <strong>“추가 정보”</strong> 클릭 → ② 아래 나타나는{" "}
            <strong>“실행”</strong> 버튼 클릭. 이 경고는 새 앱에 대해 Windows가
            항상 띄우는 일반 안내입니다. 단, 출처가 불분명한 파일이라면 절대
            실행하지 마세요.
          </span>
        </Callout>

        <StageHeading step="3" title="설치 진행" />
        <ul>
          <li>설치 위치: 기본값 그대로 두기</li>
          <li>“바탕화면 바로가기 만들기”: 체크 권장</li>
          <li>설치가 끝나면 자동으로 블로그픽이 실행됩니다</li>
        </ul>

        <StageHeading step="4" title="첫 실행 시 권한 허용" />
        <DefList
          items={[
            {
              term: "방화벽 알림",
              desc: '"개인 네트워크"만 체크하고 "액세스 허용" 클릭. AI(Gemini)와 통신하려면 이 권한이 필요합니다.',
            },
            {
              term: "백신 차단",
              desc: "V3·알약·Defender가 차단하면, 공식 파일이 확실할 때만 백신의 “예외 등록 / 신뢰할 수 있는 항목”으로 추가하세요.",
            },
          ]}
        />

        <StageHeading step="5" title="로그인 + API 키 + 네이버 계정 등록" />
        <ol>
          <li>가입 시 사용한 이메일/비밀번호로 로그인</li>
          <li>
            우측 상단 <strong>🔑 열쇠 아이콘</strong> → “API 키 설정” → Gemini 키
            붙여넣기 → 저장
          </li>
          <li>
            발행할 <strong>네이버 계정</strong> 등록 (비밀번호는 컴퓨터에
            암호화 저장 — 외부로 전송되지 않음)
          </li>
        </ol>
        <Callout tone="warning">
          <strong className="block text-foreground">
            네이버 2단계 인증은 끄지 마세요
          </strong>
          <span className="mt-1 block text-foreground/80">
            발행 시 OTP 입력 창이 뜰 수 있으니 휴대폰을 곁에 두세요. 보안을 위해
            2단계 인증은 계속 켜두는 것을 권장합니다.
          </span>
        </Callout>

        <SubHeading>자동 업데이트</SubHeading>
        <p>
          Windows는 자동 업데이트가 켜져 있어, 새 버전이 나오면 앱이 알려주고
          클릭 한 번으로 설치됩니다. 새 파일을 다시 받지 않아도 됩니다.
        </p>
      </Section>

      {/* ─────────── Mac 설치 ─────────── */}
      <Section id="install-mac" number="02" title="Mac 설치">
        <SubHeading>준비물 체크리스트</SubHeading>
        <ul className="check-list">
          <li>macOS 11 (Big Sur) 이상 (최신 macOS 권장)</li>
          <li>네이버 계정 · Gemini API 키 · 안정적인 인터넷</li>
        </ul>

        <StageHeading step="1" title="받을 파일 확인" />
        <p>
          블로그픽 맥 버전은 <strong>Apple Silicon(M1~M4 칩)</strong> 용 하나예요.
          요즘 맥은 대부분 여기에 해당합니다.
        </p>

        <StageHeading step="2" title="설치 파일 다운로드" />
        <p>
          공식 배포처(GitHub Releases)에서{" "}
          <Code>Blog-Pick-Mac-….dmg</Code> 파일을 받습니다.
        </p>

        <StageHeading step="3" title=".dmg 열고 응용 프로그램으로 드래그" />
        <ol>
          <li>다운로드한 <Code>.dmg</Code> 더블클릭</li>
          <li>
            작은 창이 열리면 <strong>Blog Pick 아이콘</strong>을 오른쪽{" "}
            <strong>응용 프로그램(Applications) 폴더</strong>로 드래그 (이게
            “설치”입니다)
          </li>
          <li>복사가 끝나면 .dmg 창을 닫고 디스크 아이콘은 “꺼내기”</li>
        </ol>

        <StageHeading step="4" title="첫 실행 — 보안 경고 통과 (가장 많이 막힘)" />
        <p>
          <strong>“확인되지 않은 개발자가 만든 앱이라 열 수 없습니다”</strong>{" "}
          경고가 뜨면, 공식 파일이 맞을 때 아래 방법으로 엽니다.
        </p>
        <DefList
          items={[
            {
              term: "방법 A (권장)",
              desc: "응용 프로그램 폴더에서 Blog Pick 아이콘을 Control + 클릭(우클릭) → “열기” → 다시 뜨는 창에서 “열기”.",
            },
            {
              term: "방법 B",
              desc: "경고창 ‘완료’ → Apple 메뉴 → 시스템 설정 → 개인정보 보호 및 보안 → 아래로 스크롤 → “Blog Pick 사용이 차단되었습니다” 옆 “그래도 열기”.",
            },
          ]}
        />
        <Callout tone="warning">
          이 작업은 처음 한 번만 하면 됩니다. 이후엔 일반 앱처럼 열립니다. (Apple
          공증을 받지 않은 모든 앱에 동일하게 나오는 안내입니다)
        </Callout>

        <StageHeading step="5" title="권한 허용 + 로그인 + 등록" />
        <ul>
          <li>
            데스크탑 폴더 접근 → “허용”, <strong>키체인 접근 → “항상 허용”</strong>{" "}
            (네이버 비밀번호 안전 저장에 필요)
          </li>
          <li>일부 macOS는 접근성(Accessibility) 권한에서 Blog Pick 체크</li>
          <li>
            로그인 → 🔑 열쇠 아이콘에서 Gemini 키 저장 → 네이버 계정 등록(키체인
            암호화 저장)
          </li>
        </ul>

        <Callout tone="warning">
          <strong className="block text-foreground">
            Mac은 수동 업데이트입니다
          </strong>
          <span className="mt-1 block text-foreground/80">
            새 버전이 나오면 새 .dmg를 받아 3~4단계와 동일하게 다시 설치(덮어쓰기)
            하세요. 등록한 계정·이미지·보관함은 그대로 유지됩니다.
          </span>
        </Callout>
      </Section>

      {/* ─────────── 설치 FAQ ─────────── */}
      <Section id="install-faq" number="03" title="설치 FAQ">
        <SubHeading>설치 파일이 안 열려요 (Windows)</SubHeading>
        <p>
          “추가 정보 → 실행” 절차를 다시 확인하세요. 그래도 안 되면 다운로드
          출처가 공식 배포처인지 확인하세요.
        </p>

        <SubHeading>백신이 바이러스라고 경고해요</SubHeading>
        <p>
          공식 파일이 맞다면 백신의 예외 등록으로 처리할 수 있습니다. 출처가
          불확실하면 절대 실행하지 말고 먼저 문의하세요.
        </p>

        <SubHeading>(Mac) “손상된 파일이라 휴지통으로 이동” 경고</SubHeading>
        <p>
          경고창은 “취소”를 누르고(휴지통으로 보내지 마세요), 위 보안 경고 통과
          단계의{" "}
          <strong>“시스템 설정 → 개인정보 보호 및 보안 → 그래도 열기”</strong>를
          따라 하세요. 대부분 해결됩니다. (아주 오래된 macOS에서 그래도 안 열리면
          인앱 도움말의 “터미널” 최후수단을 참고하세요.)
        </p>

        <SubHeading>회사 컴퓨터 방화벽이 막아요</SubHeading>
        <p>회사 IT팀에 아래 도메인 허용을 요청하세요.</p>
        <ul>
          <li>
            <Code>*.googleapis.com</Code> — Gemini API
          </li>
          <li>
            <Code>*.naver.com</Code>, <Code>*.pstatic.net</Code> — 네이버 발행
          </li>
          <li>
            <Code>github.com</Code>, <Code>objects.githubusercontent.com</Code> —
            자동 업데이트
          </li>
        </ul>
      </Section>

      {/* ─────────── 재설치 · 완전 삭제 ─────────── */}
      <Section id="install-remove" number="04" title="재설치 · 완전 삭제">
        <SubHeading>다시 설치하고 싶어요</SubHeading>
        <p>
          기존 앱을 삭제하고 새 설치 파일로 다시 설치하면 됩니다. 이때 등록한
          계정·이미지·보관함은 <strong>그대로 유지</strong>됩니다 (앱 본체만 다시
          깔리는 것이라).
        </p>

        <SubHeading>완전 삭제 (데이터까지 모두 지우기)</SubHeading>
        <Callout tone="danger">
          <strong className="block text-foreground">
            경고: 등록한 네이버 계정·API 키·생성 이미지·보관함이 전부 사라집니다.
          </strong>
          <span className="mt-1 block text-foreground/80">
            백업이 필요하면 “도구 & 관리”의 데이터 백업·PC 이전 섹션을 먼저
            보세요.
          </span>
        </Callout>
        <DefList
          items={[
            {
              term: "Windows",
              desc: (
                <>
                  제어판 → 프로그램 추가/제거 → “Blog Pick” 제거 → 탐색기 주소창에{" "}
                  <Code>%APPDATA%\app-blog2-desktop</Code> 입력 후 폴더 삭제.
                </>
              ),
            },
            {
              term: "Mac",
              desc: (
                <>
                  응용 프로그램의 Blog Pick을 휴지통으로 → Finder “폴더로
                  이동”(⌘⇧G) →{" "}
                  <Code>~/Library/Application Support/app-blog2-desktop</Code>{" "}
                  삭제 → 휴지통 비우기.
                </>
              ),
            },
          ]}
        />
      </Section>

      <ManualFooterNote>
        설치가 끝났다면 “시작 전” → “사용방법” 순서로 넘어가 첫 글을
        발행해보세요. Gemini API 키 발급·결제는 “API 키” 카테고리를 참고하세요.
      </ManualFooterNote>
    </ManualArticle>
  );
}
