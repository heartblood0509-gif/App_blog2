"use client";

// 사용 매뉴얼 페이지.
// 콘텐츠 원본은 docs/manuals/USER-GUIDE.md — 수정 시 두 곳 같이 손봐야 한다.
// (모달 형태에서 페이지로 이관됨 — 가독성·공유성·인쇄 편의를 위해)

import { AppHeader } from "@/components/AppHeader";
import { cn } from "@/lib/utils";

type Section = {
  id: string;
  title: string;
};

const SECTIONS: Section[] = [
  { id: "warning", title: "주의사항" },
  { id: "prereq", title: "시작 전 빠른 점검" },
  { id: "wizard", title: "글쓰기 5단계" },
  { id: "extras", title: "부가 기능" },
  { id: "pitfalls", title: "자주 막히는 함정" },
  { id: "backup", title: "데이터 백업 · PC 이전" },
  { id: "network", title: "회사 망 · 프록시" },
  { id: "support", title: "문제가 생기면" },
];

export default function HelpPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <AppHeader
          pageTitle="사용 매뉴얼"
          subtitle="위에서부터 차근차근 따라하시면 첫 글 발행까지 가능합니다."
        />

        <div className="grid grid-cols-1 gap-10 md:grid-cols-[260px_1fr] lg:gap-14">
          <HelpToc />
          <HelpBody />
        </div>
      </div>
    </div>
  );
}

function HelpToc() {
  return (
    <nav
      aria-label="목차"
      className="md:sticky md:top-6 md:self-start md:max-h-[calc(100vh-3rem)] md:overflow-y-auto"
    >
      <div className="rounded-2xl bg-gradient-to-b from-muted/40 to-muted/15 px-3 py-6 ring-1 ring-foreground/5">
        {/* 헤더 — primary dot + 라벨 */}
        <div className="mb-4 flex items-center gap-2 px-3">
          <span
            className="block h-1.5 w-1.5 rounded-full bg-primary"
            aria-hidden
          />
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-foreground/70">
            목차
          </p>
        </div>

        <ul className="space-y-1">
          {SECTIONS.map((s, i) => (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                className={cn(
                  "group relative flex items-center gap-3.5 rounded-lg px-3 py-3 text-[15px] font-medium tracking-[-0.005em] text-foreground/70",
                  "transition-all duration-150",
                  "hover:bg-background hover:text-foreground hover:shadow-sm hover:ring-1 hover:ring-foreground/[0.06]",
                )}
              >
                {/* 좌측 strip — hover 시 등장 */}
                <span
                  className={cn(
                    "absolute left-0 top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-r-full bg-primary",
                    "opacity-0 transition-opacity duration-150 group-hover:opacity-100",
                  )}
                  aria-hidden
                />

                {/* 인덱스 chip */}
                <span
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
                    "bg-foreground/[0.05] font-mono text-[12px] font-semibold text-foreground/50",
                    "transition-colors duration-150",
                    "group-hover:bg-primary/15 group-hover:text-primary",
                  )}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>

                <span className="truncate">{s.title}</span>
              </a>
            </li>
          ))}
        </ul>

        <p className="mt-6 border-t border-foreground/5 px-3 pt-4 text-[12px] leading-relaxed text-muted-foreground/80">
          항목을 누르면 해당 위치로
          <br />
          바로 이동합니다.
        </p>
      </div>
    </nav>
  );
}

function HelpBody() {
  return (
    <article className="mx-auto w-full max-w-[840px] text-[18px] leading-[1.95] tracking-[0.005em] text-foreground/90">
      {/* 시작 안내 */}
      <div className="mb-16 rounded-2xl bg-muted/30 px-7 py-6 ring-1 ring-foreground/5">
        <p className="text-[17px] leading-[1.85] text-foreground/80">
          앱을 처음 켜셨다면 위에서 아래로 차근차근 읽어주세요.{" "}
          <strong className="font-semibold text-foreground">
            5단계만 따라 하시면 글 한 편이 네이버 블로그에 자동으로
            올라갑니다.
          </strong>
        </p>
      </div>

      <Section id="warning" title="주의사항" tone="warning">
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
            <strong>
              자동 발행은 하루 최대 4편(계정 2개 × 계정당 2편)을 권장합니다.
            </strong>{" "}
            글이 더 필요하시다면 블로그픽으로 본문만 생성한 뒤{" "}
            <strong>직접 네이버 블로그에 복사·붙여넣어</strong> 발행해주세요. 그
            이상 자동 발행을 무리하게 돌리면 계정 차단 위험이 커서 권장하지
            않습니다.
          </li>
        </ul>
      </Section>

      <Section id="prereq" title="시작 전 빠른 점검">
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

      <Section id="wizard" title="글쓰기 5단계 위저드">
        <SubHeading>1단계 · 글쓰기 모드 고르기</SubHeading>
        <ul>
          <li>
            <strong>SEO/AEO 통합형</strong> — 네이버 검색 + AI
            검색(ChatGPT·Gemini)에 잘 잡히는 글.{" "}
            <strong>대부분 이걸 고르시면 됩니다.</strong>
          </li>
          <li>
            <strong>브랜드 블로그</strong> — 브랜드 톤·스타일을 일관되게 유지.{" "}
            <strong>브랜드 프로필</strong>을 미리 만들어두면 자동 반영됩니다.
          </li>
        </ul>

        <SubHeading>2단계 · 주제·키워드·제품 입력</SubHeading>
        <ul>
          <li>
            <strong>키워드형</strong>: "겨울철 두피 관리" 같은 메인 키워드 한
            줄
          </li>
          <li>
            <strong>제품형</strong>: 미리 등록해둔 제품 중 선택 → 제품 정보가
            글에 자동 반영
          </li>
          <li>
            <strong>제목 공식</strong> (선택): 예) "[질문형 제목]" 입력하면
            AI가 그 공식대로 제목을 만듭니다
          </li>
        </ul>

        <SubHeading>3단계 · 생성 (AI가 글을 씁니다)</SubHeading>
        <ul>
          <li>
            보통 <strong>30초 ~ 2분</strong> 소요. 닫지 말고 기다리세요.
          </li>
          <li>진행률이 보이면 정상 작동 중입니다.</li>
          <li>
            에러가 나면: 보통 <strong>API 키 한도 초과</strong> 또는{" "}
            <strong>인터넷 끊김</strong>. API 키 확인 후 재시도.
          </li>
        </ul>

        <SubHeading>4단계 · 검토·편집</SubHeading>
        <p>
          생성된 글이 <strong>SmartEditor</strong>(네이버 블로그 에디터와
          동일한 UI)에 나옵니다. 자유롭게 수정 가능. 단,{" "}
          <strong>다음은 절대 누르지 마세요</strong>:
        </p>
        <Callout tone="danger">
          <strong className="block text-foreground">
            Cmd+A (Mac) / Ctrl+A (Win) → Delete
          </strong>
          <span className="mt-1 block text-foreground/80">
            전체 선택 후 한 번에 지우면 편집기가 <strong>흰 화면</strong>이
            되는 알려진 문제가 있습니다. 글을 통째로 지우고 싶다면 → 모달을
            닫고 처음부터 다시 생성하는 게 안전합니다.
          </span>
        </Callout>
        <ul>
          <li>
            <strong>이미지 첨부</strong>: 자동으로 들어간 이미지 외에 직접 추가
            가능
          </li>
          <li>
            <strong>제품 첨부</strong>: 제품 카드를 글 중간중간 끼워 넣을 수
            있음
          </li>
        </ul>

        <SubHeading>5단계 · 발행</SubHeading>
        <ol>
          <li>
            발행할 <strong>네이버 계정 선택</strong>
          </li>
          <li>
            <strong>카테고리·태그·공개 설정</strong> 확인
          </li>
          <li>
            <strong>"발행"</strong> 버튼 클릭
          </li>
          <li>
            자동화 창이 잠깐 떴다가 닫힙니다 →{" "}
            <strong>그 동안 키보드·마우스 건드리지 마세요</strong>
          </li>
          <li>
            발행 완료되면 토스트 메시지와 함께 <strong>글 URL</strong>이
            표시됩니다
          </li>
        </ol>
      </Section>

      <Section id="extras" title="부가 기능">
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

      <Section id="pitfalls" title="자주 막히는 함정">
        <p className="text-foreground/70">꼭 한번 읽어주세요.</p>

        <SubHeading>네이버 2단계 인증을 켜뒀어요</SubHeading>
        <ul>
          <li>발행할 때 OTP 입력 창이 떠요. 휴대폰 보안 앱을 켜두세요.</li>
          <li>
            <strong>2단계 인증은 끄지 않는 것을 권장</strong>합니다 (계정 보호
            우선).
          </li>
          <li>
            자동 발행 빈도가 잦으면 발행 전용 부계정을 따로 만드시되, 그
            부계정도 2단계 인증은 유지하세요.
          </li>
        </ul>

        <SubHeading>네이버가 "비정상 접속"으로 차단했어요</SubHeading>
        <ul>
          <li>같은 IP에서 너무 자주 자동 발행하면 일시적으로 막힙니다.</li>
          <li>
            <strong>하루 10편 이하</strong> 권장. 차단되면 한동안 사용을 멈추고
            자연스럽게 회복되길 기다리세요.
          </li>
        </ul>

        <SubHeading>SmartEditor가 흰 화면이 됐어요</SubHeading>
        <ul>
          <li>
            위 "4단계. 검토·편집"의 경고(Ctrl+A → Delete)를 안 지키신
            경우입니다.
          </li>
          <li>
            모달을 닫고 글을 다시 생성하세요. 저장된 이미지는 보관함에 남아
            있을 수 있습니다.
          </li>
        </ul>

        <SubHeading>발행이 중간에 멈췄어요</SubHeading>
        <ul>
          <li>
            캡차가 떴을 가능성이 큽니다. 자동화 창에 캡차가 보이면{" "}
            <strong>직접 풀어주시면</strong> 이어집니다.
          </li>
          <li>자동화 창을 닫지 마세요.</li>
        </ul>

        <SubHeading>API 키 한도 초과 에러가 나요</SubHeading>
        <ul>
          <li>Gemini는 무료 한도가 있습니다.</li>
          <li>
            다음 날 자동으로 풀리거나, Google Cloud에서 결제 연결로 한도를
            늘릴 수 있습니다.
          </li>
          <li>
            자세한 요금:{" "}
            <Code>https://ai.google.dev/gemini-api/docs/billing</Code>
          </li>
        </ul>
      </Section>

      <Section id="backup" title="내 데이터 백업 · 다른 PC로 옮기기">
        <p>
          블로그픽의 모든 데이터(등록한 제품, 브랜드 프로필, 보관함 이미지
          등)는 다음 폴더에 있습니다.
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

      <Section id="network" title="회사 컴퓨터 · 회사 망에서 쓰시나요?">
        <p>
          블로그픽은 인터넷으로 다음 도메인에 접속합니다. 회사 방화벽에
          막힌다면{" "}
          <strong>IT팀에 아래 화이트리스트를 요청</strong>하세요.
        </p>
        <DefList
          items={[
            {
              term: <Code>*.googleapis.com</Code>,
              desc: "Gemini AI 호출",
            },
            {
              term: (
                <>
                  <Code>*.naver.com</Code>, <Code>*.pstatic.net</Code>
                </>
              ),
              desc: "네이버 로그인·발행",
            },
            {
              term: (
                <>
                  <Code>github.com</Code>,{" "}
                  <Code>objects.githubusercontent.com</Code>
                </>
              ),
              desc: "자동 업데이트 (Windows만)",
            },
            {
              term: "인증 서비스 도메인",
              desc: "앱 로그인",
            },
          ]}
        />

        <SubHeading>프록시 환경</SubHeading>
        <ul>
          <li>시스템 프록시 설정을 따릅니다.</li>
          <li>
            PAC 스크립트·인증 프록시 환경은 정상 작동을 보장하지 않습니다.
          </li>
        </ul>

        <SubHeading>오프라인에서는?</SubHeading>
        <ul>
          <li>
            글 생성·발행 모두 <strong>불가능</strong> (AI와 네이버에 연결되어야
            합니다)
          </li>
          <li>
            다만 <strong>보관함의 기존 이미지·글 열람</strong>은 가능합니다
          </li>
        </ul>
      </Section>

      <Section id="support" title="문제가 생기면">
        <SubHeading>1 · 로그 파일 위치</SubHeading>
        <p>문의 전, 아래 로그 파일을 첨부해주시면 훨씬 빠르게 해결됩니다.</p>
        <DefList
          items={[
            {
              term: "Windows",
              desc: (
                <>
                  <Code>%APPDATA%\app-blog2-desktop\logs\</Code> 안의{" "}
                  <Code>main.log</Code>, <Code>backend.log</Code>
                </>
              ),
            },
            {
              term: "Mac",
              desc: (
                <>
                  <Code>~/Library/Logs/app-blog2-desktop/</Code> 또는{" "}
                  <Code>
                    ~/Library/Application Support/app-blog2-desktop/logs/
                  </Code>
                </>
              ),
            },
          ]}
        />

        <SubHeading>2 · 공유 시 절대 보내지 말 것</SubHeading>
        <ul>
          <li>
            <strong>네이버 비밀번호</strong> 원문
          </li>
          <li>
            <strong>Gemini API 키 전체 값</strong> (앞 4자리·뒤 4자리만 보이게
            가리고 보내주세요. 예: <Code>AIza...A1B2</Code>)
          </li>
          <li>개인 정보가 담긴 생성 이미지</li>
        </ul>

        <SubHeading>3 · 문의 채널</SubHeading>
        <p className="text-muted-foreground">
          (배포 담당자가 채울 자리 — 이메일 / 카카오톡 채널 / 노션 폼 등)
        </p>
      </Section>

      <p className="mt-16 border-t border-foreground/5 pt-7 text-[14px] text-muted-foreground">
        이 매뉴얼이 도움이 안 되거나 누락된 부분이 있다면 위 문의 채널로
        알려주세요. 다음 버전에서 보완하겠습니다.
      </p>
    </article>
  );
}

/* ------------------- subcomponents (기존 HelpModal에서 그대로 이식) ------------------- */

function Section({
  id,
  title,
  tone,
  children,
}: {
  id: string;
  title: string;
  tone?: "warning";
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "mb-24 scroll-mt-6",
        tone === "warning" &&
          "rounded-2xl bg-amber-500/[0.06] px-8 py-8 ring-1 ring-amber-500/20 dark:bg-amber-400/[0.04] dark:ring-amber-400/15",
      )}
    >
      <div
        className={cn(
          "mb-10 -mx-3 flex items-center gap-3.5 rounded-xl px-6 py-5",
          tone === "warning"
            ? "bg-gradient-to-r from-amber-500/15 via-amber-500/[0.06] to-transparent ring-1 ring-amber-500/20 dark:from-amber-400/15 dark:via-amber-400/[0.05]"
            : "bg-gradient-to-r from-primary/[0.12] via-primary/[0.05] to-transparent ring-1 ring-primary/15",
        )}
      >
        <span
          className={cn(
            "block h-8 w-[3.5px] shrink-0 rounded-full",
            tone === "warning" ? "bg-amber-500" : "bg-primary",
          )}
          aria-hidden
        />
        <h2
          className={cn(
            "font-heading text-[28px] font-semibold tracking-tight leading-snug",
            tone === "warning"
              ? "text-amber-900 dark:text-amber-100"
              : "text-foreground",
          )}
        >
          {title}
        </h2>
      </div>

      <div
        className={cn(
          "space-y-6 text-[18px] leading-[1.95]",
          "[&_ul:not(.check-list)]:list-disc [&_ul:not(.check-list)]:space-y-2.5 [&_ul:not(.check-list)]:pl-6",
          "[&_ul:not(.check-list)]:marker:text-primary/40",
          "[&_ol]:list-decimal [&_ol]:space-y-2.5 [&_ol]:pl-6",
          "[&_ol]:marker:text-primary/50 [&_ol]:marker:font-medium",
          "[&_.check-list]:space-y-3 [&_.check-list]:pl-0 [&_.check-list_li]:relative [&_.check-list_li]:pl-9",
          "[&_.check-list_li]:before:absolute [&_.check-list_li]:before:left-0 [&_.check-list_li]:before:top-[0.45em]",
          "[&_.check-list_li]:before:flex [&_.check-list_li]:before:h-[22px] [&_.check-list_li]:before:w-[22px]",
          "[&_.check-list_li]:before:items-center [&_.check-list_li]:before:justify-center",
          "[&_.check-list_li]:before:rounded-md [&_.check-list_li]:before:bg-primary/10",
          "[&_.check-list_li]:before:text-[12px] [&_.check-list_li]:before:font-bold [&_.check-list_li]:before:text-primary",
          "[&_.check-list_li]:before:content-['✓']",
          "[&_strong]:font-semibold [&_strong]:text-foreground",
        )}
      >
        {children}
      </div>
    </section>
  );
}

function SubHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mt-12 mb-4 flex items-center gap-2.5 font-heading text-[19px] font-semibold tracking-tight text-foreground">
      <span
        className="block h-[16px] w-[3px] rounded-full bg-primary/70"
        aria-hidden
      />
      {children}
    </h3>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md bg-primary/[0.08] px-2 py-0.5 font-mono text-[0.9em] tracking-normal text-primary/90">
      {children}
    </code>
  );
}

function Callout({
  tone,
  children,
}: {
  tone: "warning" | "danger";
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "danger"
      ? "border-l-red-500/70 bg-red-500/[0.05] dark:bg-red-400/[0.04]"
      : "border-l-amber-500/70 bg-amber-500/[0.05] dark:bg-amber-400/[0.04]";
  return (
    <div
      className={cn(
        "my-6 rounded-r-lg border-l-[3px] px-6 py-5 text-[17px] leading-[1.85]",
        toneClass,
      )}
    >
      {children}
    </div>
  );
}

function DefList({
  items,
}: {
  items: { term: React.ReactNode; desc: React.ReactNode }[];
}) {
  return (
    <dl className="my-5 divide-y divide-foreground/5 overflow-hidden rounded-xl ring-1 ring-foreground/5">
      {items.map((it, i) => (
        <div
          key={i}
          className="grid grid-cols-[minmax(140px,190px)_1fr] gap-6 bg-muted/20 px-6 py-5"
        >
          <dt className="text-[16px] font-semibold text-foreground">
            {it.term}
          </dt>
          <dd className="text-[17px] leading-[1.8] text-foreground/80">
            {it.desc}
          </dd>
        </div>
      ))}
    </dl>
  );
}
