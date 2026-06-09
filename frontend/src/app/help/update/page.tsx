// /help/update — "업데이트" 카테고리.
// 새 버전이 나왔을 때 Windows·Mac에서 받아 설치하는 법 + 자주 겪는 문제.

import {
  ManualArticle,
  PageIntro,
  Section,
  StageHeading,
  SubHeading,
  Code,
  Callout,
  DefList,
  ManualFooterNote,
} from "../_components/manual-ui";

export default function HelpUpdatePage() {
  return (
    <ManualArticle>
      <PageIntro>
        새 버전이 나왔을 때{" "}
        <strong className="font-semibold text-foreground">
          받아서 설치하는 방법
        </strong>
        입니다. 한 번도 해본 적 없어도 그대로 따라 할 수 있도록 한 단계씩
        적었습니다.
      </PageIntro>

      {/* ─────────── 새 버전 알림 확인 ─────────── */}
      <Section id="notify" number="01" title="새 버전 알림 확인">
        <p>
          블로그픽을 켜놓고 계시면, 새 버전이 있을 때{" "}
          <strong>화면 왼쪽 아래에 작은 알림 창</strong>이 자동으로 뜹니다.
          알림에는 새 버전 번호(예: <Code>v0.2.9</Code>)와 버튼 한 개가 보입니다.
          버튼 이름은 OS에 따라 다릅니다.
        </p>
        <DefList
          items={[
            {
              term: "Windows",
              desc: (
                <>
                  버튼 이름: <strong>업데이트</strong>
                </>
              ),
            },
            {
              term: "Mac",
              desc: (
                <>
                  버튼 이름: <strong>다운로드 페이지 열기</strong>
                </>
              ),
            },
          ]}
        />
        <Callout tone="warning">
          알림이 안 뜨나요? 아래 <strong>「자주 겪는 문제」</strong>의 「업데이트
          알림이 안 떠요」 항목을 참고하세요.
        </Callout>
      </Section>

      {/* ─────────── Windows ─────────── */}
      <Section id="windows" number="02" title="Windows에서 업데이트하기">
        <p>
          난이도: <strong>매우 쉬움</strong>. 클릭 두세 번이면 끝납니다.
        </p>

        <StageHeading
          id="windows-step-1"
          step="1"
          title="알림에서 「업데이트」 누르기"
        />
        <p>
          화면 왼쪽 아래에 뜬 알림에서 <strong>「업데이트」</strong>를 누릅니다.
        </p>

        <StageHeading id="windows-step-2" step="2" title="잠시 기다리기" />
        <p>
          블로그픽 메인 창이 잠깐 사라지고, 작은 다운로드 진행률 창이 뜹니다.
        </p>
        <ul>
          <li>
            <Code>다운로드 중... 32%</Code>처럼 퍼센트가 올라갑니다.
          </li>
          <li>
            인터넷 속도에 따라 <strong>10초 ~ 2분</strong> 정도 걸립니다.
          </li>
        </ul>

        <StageHeading
          id="windows-step-3"
          step="3"
          title="보안 경고가 뜨면 「예」 누르기"
        />
        <p>
          다운로드가 끝나면 자동으로 설치가 시작됩니다. 설치 중에 Windows 보안
          경고가 뜰 수 있어요.
        </p>
        <Callout tone="warning">
          <strong className="block text-foreground">
            「이 앱이 디바이스를 변경하도록 허용하시겠습니까?」
          </strong>
          <span className="mt-1 block text-foreground/80">
            → <strong>「예」</strong>를 눌러주세요. 이 경고는 블로그픽 설치의
            정상적인 과정이니 무서워하지 않으셔도 됩니다.
          </span>
        </Callout>

        <StageHeading id="windows-step-4" step="4" title="끝!" />
        <p>설치가 끝나면 새 버전 블로그픽이 자동으로 다시 켜집니다.</p>

        <Callout tone="warning">
          <strong className="block text-foreground">참고</strong>
          <span className="mt-1 block text-foreground/80">
            다운로드 도중에 <strong>「취소」</strong> 버튼을 누를 수 있어요.
            인터넷이 너무 느리거나 급한 일이 있을 때만 누르세요. 취소해도 다음에
            알림이 다시 뜨면 처음부터 다시 받습니다.
          </span>
        </Callout>
      </Section>

      {/* ─────────── Mac ─────────── */}
      <Section id="mac" number="03" title="Mac에서 업데이트하기">
        <p>
          난이도: <strong>처음엔 단계가 좀 있지만, 한 번 익히면 1~2분</strong>이면
          끝납니다. Mac은 보안이 엄격해서 같은 흐름이 매번 반복되니까 한 번만
          익혀두시면 됩니다.
        </p>

        <StageHeading id="mac-step-1" step="1" title="dmg 파일 받기" />
        <ol>
          <li>
            알림에서 <strong>「다운로드 페이지 열기」</strong> 버튼을 누릅니다. →
            기본 브라우저(Safari, Chrome 등)가 열리면서{" "}
            <strong>GitHub Releases 페이지</strong>가 뜹니다.
          </li>
          <li>
            페이지를 아래로 스크롤하면 <strong>Assets</strong>(또는 「첨부 파일」)
            목록이 있어요. 그중 <Code>arm64.dmg</Code>가 들어간 파일을 받습니다.
            (파일명은 <Code>Blog-Pick-…-mac-arm64.dmg</Code> 형태 — 보통 다운로드
            폴더에 저장돼요.)
          </li>
        </ol>

        <StageHeading id="mac-step-2" step="2" title="기존 블로그픽 종료하기" />
        <Callout tone="danger">
          <strong className="block text-foreground">
            중요 — 이 단계를 빼먹으면 설치가 실패합니다.
          </strong>
          <span className="mt-1 block text-foreground/80">
            화면 위쪽 메뉴바에 <Code>Blog Pick</Code> 글자가 보이면, 그 옆에
            마우스를 갖다 대고 <strong>「Blog Pick 종료」</strong>를 누릅니다.
            또는 단축키 <Code>⌘ + Q</Code>를 누르셔도 됩니다.
          </span>
        </Callout>
        <p>
          <strong>종료됐는지 확인하는 법:</strong> 화면 아래 Dock의 블로그픽
          아이콘 밑에 <strong>작은 점(●)이 없으면</strong> 종료된 상태입니다.
        </p>

        <StageHeading id="mac-step-3" step="3" title="dmg로 새 버전 설치하기" />
        <ol>
          <li>
            다운로드된 파일(예: <Code>Blog-Pick-0.2.9-arm64.dmg</Code>)을{" "}
            <strong>더블클릭</strong>합니다. → 창이 하나 뜨고, 그 안에 왼쪽{" "}
            <strong>Blog Pick 아이콘</strong>과 오른쪽{" "}
            <strong>Applications 폴더 아이콘</strong>이 보입니다.
          </li>
          <li>
            왼쪽 <strong>Blog Pick 아이콘</strong>을 꾹 눌러서 → 오른쪽{" "}
            <strong>Applications 폴더</strong> 위로 드래그 → 손 떼기.
          </li>
          <li>
            「이미 같은 이름의 항목이 있습니다. 바꾸시겠습니까?」 창이 뜨면 →{" "}
            <strong>「바꾸기」</strong>를 누르세요. 이게 기존 버전이 새 버전으로
            교체되는 순간입니다.
          </li>
          <li>복사 진행률 막대가 잠깐 떴다가 사라지면 → 설치 완료.</li>
        </ol>
        <SubHeading>dmg 정리 (선택사항)</SubHeading>
        <p>
          설치가 끝나면 dmg 창은 닫고, 바탕화면에 「Blog Pick」 디스크 아이콘이
          있으면 오른쪽 클릭 → <strong>꺼내기</strong> 하세요. 안 꺼내도 사용에는
          문제 없습니다.
        </p>

        <StageHeading
          id="mac-step-4"
          step="4"
          title="첫 실행 시 보안 경고 통과하기"
        />
        <p>
          Mac에서 <strong>처음 한 번만</strong> 거치는 과정입니다. 다음부터는
          거의 안 거쳐도 됩니다.
        </p>
        <ol>
          <li>
            <strong>Finder → 응용 프로그램(Applications) 폴더</strong>로 가서
            블로그픽을 더블클릭합니다.
          </li>
          <li>
            「확인되지 않은 개발자가 배포…」 또는 「Apple에서 검사할 수 없으며…」
            경고가 뜨면, 일단 <strong>「확인」</strong> 또는{" "}
            <strong>「완료」</strong>를 눌러 창을 닫습니다.
          </li>
          <li>
            화면 왼쪽 위 사과 아이콘 → <strong>「시스템 설정」</strong> → 왼쪽
            메뉴 <strong>「개인정보 보호 및 보안」</strong> 클릭.
          </li>
          <li>
            오른쪽 내용을 아래로 스크롤하면 「Blog Pick 사용이 차단되었습니다」
            문구가 보입니다. 옆의 <strong>「그래도 열기」</strong>(macOS 버전에
            따라 「확인 없이 열기」로 보일 수 있어요) 버튼을 누릅니다.
          </li>
          <li>
            Mac 비밀번호 입력 → 다시 한 번 <strong>「열기」</strong> → 블로그픽이
            켜집니다. 완료!
          </li>
        </ol>
        <Callout tone="warning">
          이 보안 경고는 Mac이 모든 외부 앱에 대해 한 번씩 거치는 과정이에요.
          다음 업데이트부터는 <strong>dmg를 받아 Applications 폴더로
          드래그하기만</strong> 하면 바로 실행됩니다. (가끔 한두 번 더 뜰 수는
          있어요.)
        </Callout>
      </Section>

      {/* ─────────── 자주 겪는 문제 ─────────── */}
      <Section id="troubleshoot" number="04" title="자주 겪는 문제와 해결법">
        <SubHeading>
          (Mac) 「손상되어 열 수 없습니다. 휴지통으로 이동…」 경고가 떠요
        </SubHeading>
        <p>
          이 경고가 떠도 <strong>「취소」</strong>를 누르세요(휴지통으로 보내지
          마세요!). 대부분 위 <strong>03단계의 「그래도 열기」 방법</strong>으로
          그대로 해결됩니다 — 사과 아이콘 →{" "}
          <strong>「시스템 설정」 → 「개인정보 보호 및 보안」</strong> → 아래로
          스크롤 → <strong>「그래도 열기」</strong> 버튼.
        </p>
        <Callout tone="warning">
          <strong className="block text-foreground">
            그래도 안 열린다면 (주로 오래된 macOS)
          </strong>
          <span className="mt-1 block text-foreground/80">
            구형 macOS에서는 「그래도 열기」 버튼이 안 보일 수 있어요. 그럴 때만
            아래를 쓰세요: <Code>⌘ + Space</Code> → <Code>터미널</Code> 입력 →
            엔터 → 검은 화면에 아래 한 줄을 그대로 복사해 붙여넣고 엔터.
          </span>
          <span className="mt-2 block">
            <Code>{"xattr -cr /Applications/Blog\\ Pick.app"}</Code>
          </span>
          <span className="mt-2 block text-foreground/80">
            (Mac이 잘못 붙인 「위험 표시」만 떼는 안전한 명령이에요. 시스템은 안
            건드립니다.) 그다음 응용 프로그램에서 블로그픽을 다시 실행하세요.
          </span>
        </Callout>

        <SubHeading>(Windows) 「다운로드 중」에서 멈춰요</SubHeading>
        <p>1분 이상 진행률이 그대로면:</p>
        <ol>
          <li>「취소」 버튼 누르기</li>
          <li>인터넷 연결 확인</li>
          <li>알림이 다시 뜨면 「업데이트」 다시 누르기</li>
        </ol>
        <p>
          그래도 안 되면 블로그픽을 <strong>완전히 종료</strong>한 뒤 다시
          실행하세요. 알림이 다시 뜹니다.
        </p>

        <SubHeading>업데이트 알림이 안 떠요. 새 버전이 있는지 모르겠어요</SubHeading>
        <ol>
          <li>
            브라우저 주소창에 아래 주소를 직접 입력:{" "}
            <Code>
              https://github.com/heartblood0509-gif/App_blog2/releases/latest
            </Code>
          </li>
          <li>페이지 상단에 가장 최신 버전 번호가 표시됩니다.</li>
          <li>
            블로그픽 안의 버전 번호와 비교 → 다르면 위의{" "}
            <strong>Windows</strong> 또는 <strong>Mac</strong> 절차로 받으세요.
            (Windows는 받은 <Code>.exe</Code> 파일을 더블클릭하면 자동 설치)
          </li>
        </ol>

        <SubHeading>
          업데이트 후에 「내 정보(API 키·글 목록…)」가 다 사라졌어요!
        </SubHeading>
        <p>
          걱정하지 마세요. <strong>사라지지 않습니다.</strong> 설정과 데이터는
          별도 폴더에 저장되어 있어서 업데이트해도 그대로 유지됩니다. 만약 정말로
          안 보이면 → 블로그픽을 완전히 종료한 뒤 다시 실행해보세요. 그래도
          이상하면 개발자에게 알려주세요.
        </p>

        <SubHeading>
          (Mac) 「바꾸시겠습니까?」 창이 안 떠요. 그냥 복사만 돼요
        </SubHeading>
        <p>
          기존 블로그픽이 아직 <strong>켜져 있는 상태</strong>입니다. 위의{" "}
          <strong>3-2단계(기존 블로그픽 종료하기)</strong>부터 다시 하세요.
        </p>
      </Section>

      {/* ─────────── 한눈에 요약 ─────────── */}
      <Section id="summary" number="05" title="한눈에 요약">
        <DefList
          items={[
            {
              term: "Windows",
              desc: (
                <>
                  알림에서 「업데이트」 클릭 → 끝까지 자동(「예」만 누르면 됨).{" "}
                  <strong>1~3분</strong>. 기존 데이터 그대로 보존.
                </>
              ),
            },
            {
              term: "Mac",
              desc: (
                <>
                  다운로드 → Applications 폴더로 드래그 → 시스템 설정에서 한 번
                  허용. <strong>첫 회 약 5분 / 이후 1~2분</strong>. 기존 데이터
                  그대로 보존.
                </>
              ),
            },
          ]}
        />
        <Callout tone="warning">
          <strong className="block text-foreground">한 줄 정리</strong>
          <span className="mt-1 block text-foreground/80">
            Windows는 클릭 한 번에 끝. Mac은{" "}
            <strong>
              「다운로드 → Applications 폴더로 드래그 → 시스템 설정에서 한 번
              허용」
            </strong>{" "}
            이 3단계만 기억하세요.
          </span>
        </Callout>
      </Section>

      <ManualFooterNote>
        이 매뉴얼이 도움이 안 되거나 누락된 부분이 있다면 알려주세요. 다음
        버전에서 보완하겠습니다.
      </ManualFooterNote>
    </ManualArticle>
  );
}
