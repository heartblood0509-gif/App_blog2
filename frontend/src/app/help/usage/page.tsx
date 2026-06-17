// /help/usage — "사용방법" 카테고리.
// 모드 선택 가이드 + 후기성/브랜드/AEO 5단계 + 자주 막히는 함정.

import {
  ManualArticle,
  PageIntro,
  Section,
  SubHeading,
  NumberedSubHeading,
  StageHeading,
  Code,
  Callout,
  DefList,
  ManualFooterNote,
} from "../_components/manual-ui";

export default function HelpUsagePage() {
  return (
    <ManualArticle>
      <PageIntro>
        글 한 편을 처음부터 끝까지 따라하는 가이드입니다.{" "}
        <strong className="font-semibold text-foreground">
          본인이 쓰려는 글의 성격을 먼저 고르고, 해당 모드 섹션을 위에서 아래로
          따라가세요.
        </strong>
      </PageIntro>

      {/* ─────────── 모드 결정 가이드 ─────────── */}
      <Section id="choose-mode" number="01" title="어떤 모드를 골라야 하나요?">
        <p>
          블로그픽은 글의 성격에 따라 <strong>3가지 모드</strong>를 제공합니다.
          본인이 쓰려는 글의 성격을 찾고, 아래 본인 모드 섹션을 따라가세요.
        </p>
        <DefList
          items={[
            {
              term: "후기성 블로그",
              desc: "제품을 직접 써본 듯한 자연스러운 후기·체험기·사용 경험 풀어쓰기",
            },
            {
              term: "브랜드 블로그",
              desc: "우리 브랜드 공식 콘텐츠 — 브랜드 소개, 제품 정보, 가치 입증, 상세 페이지",
            },
            {
              term: "AEO 블로그",
              desc: "정보성·질문형 글 — 네이버 검색 + ChatGPT·Gemini AI 답변에 양쪽 노출",
            },
          ]}
        />
        <Callout tone="warning">
          <strong className="block text-foreground">
            ⚠️ 1단계에서 모드를 바꾸면 입력값이 초기화됩니다
          </strong>
          <span className="mt-1 block text-foreground/80">
            제품·서사·말투·템플릿·프로필 같은 모드 전용 입력은 모드 변경 시
            사라집니다. 모드를 확정한 뒤 진행하세요.
          </span>
        </Callout>
      </Section>

      {/* ─────────── 후기성 블로그 ─────────── */}
      <Section id="wizard-review" number="02" title="후기성 블로그 5단계">
        <Callout tone="warning">
          <strong className="block text-foreground">
            사전 준비 · 제품 등록 (필수)
          </strong>
          <span className="mt-1 block text-foreground/80">
            &quot;제품 관리&quot; 페이지에서 발행할 제품을 먼저 등록해주세요. 제품이
            등록돼 있지 않으면 1단계에서 진행이 막힙니다.
          </span>
        </Callout>

        <StageHeading id="wizard-review-step-1" step="1" title="글 구조 — 제품 + 서사 + 말투" />
        <p>
          글의 뼈대를 잡는 단계입니다. 한 화면에서{" "}
          <strong>제품 · 서사 · 말투</strong> 세 가지를 차례로 정합니다. 이
          세 가지가 뒤이어 생성될 글의 톤과 흐름을 결정해요.
        </p>

        {/* ─── ① 제품 선택 ─── */}
        <NumberedSubHeading
          number="①"
          title="제품 선택"
          suffix="— 무엇에 대한 후기인가요?"
        />
        <p>
          글에 등장할 제품을 <strong>1개 이상</strong> 골라주세요. 후기성 글의
          핵심이라 <strong>제품 없이는 진행할 수 없습니다</strong>.
        </p>
        <DefList
          items={[
            {
              term: "제품 1개 선택",
              desc: "한 제품을 깊게 다루는 단일 후기. 가장 자연스럽고 검색 노출도 잘 됩니다.",
            },
            {
              term: "제품 여러 개 선택",
              desc: "비교 후기 · 라인업 소개 · 세트 추천. AI가 제품 간 차이를 자동으로 풀어줍니다.",
            },
          ]}
        />
        <Callout tone="warning">
          <strong className="block text-foreground">
            등록된 제품이 없으신가요?
          </strong>
          <span className="mt-1 block text-foreground/80">
            상단의 <strong>&quot;+ 새 등록 (직접)&quot;</strong> 버튼을 누르거나, 우상단의{" "}
            <strong>&quot;AI 도움받기&quot;</strong> 로 빠르게 등록하세요. 또는{" "}
            <strong>제품 관리 페이지</strong>에서 미리 여러 개 등록해두면
            편합니다.
          </span>
        </Callout>

        {/* ─── ② 서사 구조 ─── */}
        <NumberedSubHeading
          number="②"
          title="서사 구조"
          suffix="— 어떤 흐름으로 풀어쓸 건가요?"
        />
        <p>
          글이 처음부터 끝까지 짜이는 <strong>전체 흐름</strong>입니다. 두 가지
          중 본인이 쓰려는 글 톤에 맞는 걸로 골라주세요.
        </p>
        <DefList
          items={[
            {
              term: "감정 선공형",
              desc: (
                <>
                  <strong>스트레스로 시작</strong> → 악화 → 시도/실패 → 깨달음 →
                  제품 발견 → 변화 → 마무리 <em className="text-foreground/55">(11단계)</em>
                  <br />
                  <span className="text-foreground/70">
                    어울리는 글: 회복 스토리, 변화 강조, 감정 공감이 핵심인 후기
                  </span>
                </>
              ),
            },
            {
              term: "결론 선공형",
              desc: (
                <>
                  <strong>&quot;지금은 괜찮아졌다&quot;</strong>로 시작 → 과거 문제 회상 →
                  시도/실패 → 깨달음 → 변화 → 마무리{" "}
                  <em className="text-foreground/55">(9단계)</em>
                  <br />
                  <span className="text-foreground/70">
                    어울리는 글: 결론부터 빠르게 보여주는 직설적·정보 중심 후기
                  </span>
                </>
              ),
            },
          ]}
        />
        <p className="text-foreground/70">
          💡 <strong>처음이라면 감정 선공형</strong>이 블로그 후기 톤에 가장
          자연스럽습니다. 정보를 빠르게 던지고 싶을 때만 결론 선공형으로
          가세요.
        </p>

        {/* ─── ③ 말투 선택 ─── */}
        <NumberedSubHeading
          number="③"
          title="말투"
          suffix="— 누구한테 얘기하는 글인가요?"
        />
        <p>
          타깃 독자에 맞춰 톤을 정합니다. 같은 내용도 말투에 따라{" "}
          <strong>독자가 받는 인상이 완전히 달라져요</strong>.
        </p>
        <DefList
          items={[
            {
              term: "존댓말",
              desc: "친한 언니/형이 카페에서 조언해주는 느낌. 정보·후기 균형. 폭넓은 독자에게 무난.",
            },
            {
              term: "반말",
              desc: "같은 또래 친구한테 편하게 얘기하는 느낌. 친근함·솔직함 강조. 20~30대 타깃에 좋음.",
            },
            {
              term: "음슴체",
              desc: "커뮤니티 후기 느낌. 건조하지만 솔직한 톤. 디시·더쿠 같은 커뮤니티 친화 후기에 어울림.",
            },
          ]}
        />
        <Callout tone="warning">
          <strong className="block text-foreground">
            💡 말투 예시는 직접 편집 가능합니다
          </strong>
          <span className="mt-1 block text-foreground/80">
            선택한 말투 아래에 <strong>예시 5줄</strong>이 보입니다. 본인의
            평소 말투를 더 살리고 싶다면 이 예시를 직접 수정하세요. AI가 이
            예시를 그대로 참고해서 글 전체의 톤을 맞춥니다.
          </span>
        </Callout>

        {/* ─── ④ 다음 단계 ─── */}
        <NumberedSubHeading number="④" title="다음 단계로" />
        <p>
          세 가지(제품 · 서사 · 말투)를 모두 선택했으면 우하단의{" "}
          <strong>&quot;다음: 글 설정&quot;</strong> 버튼을 누르세요. 2단계(메인 키워드 +
          AI 추천)로 넘어갑니다.
        </p>

        <StageHeading id="wizard-review-step-2" step="2" title="글 설정 — 메인 키워드 + AI 도구" />
        <p>
          글의 <strong>주제·키워드·디테일</strong>을 정합니다. 메인 키워드 한
          줄만 채워도 다음으로 갈 수 있고, AI 도구로 글 주제를 자동으로
          만들어달라고 할 수도 있어요.
        </p>

        {/* ─── ① 메인 키워드 ─── */}
        <NumberedSubHeading
          number="①"
          title="메인 키워드"
          suffix="— 왜 필수일까요?"
        />
        <p>
          검색에 잡히는 글의 <strong>출발점</strong>입니다. 네이버·구글이 이
          키워드를 보고 글을 색인하고, AI가 글 톤을 잡을 때도 첫 기준이 돼요.{" "}
          <strong>비우면 다음 단계로 진행할 수 없습니다.</strong>
        </p>
        <DefList
          items={[
            {
              term: "좋은 예시",
              desc: "\"겨울철 두피 관리\", \"민감성 두피 샴푸 추천\", \"각질 두피 케어\" — 검색 의도가 분명한 한 줄",
            },
            {
              term: "피해야 할 예시",
              desc: "\"샴푸\" (너무 광범위) · \"미르엔 탈모샴푸 3개월 사용 후기\" (너무 길고 좁아서 검색 매칭 어려움)",
            },
          ]}
        />

        {/* ─── ② AI 도구 ─── */}
        <NumberedSubHeading
          number="②"
          title="AI 도구"
          suffix="— 글 주제를 자동으로 만들어주는 두 가지 버튼"
        />
        <p>
          &quot;무엇에 대해 쓰고 싶나요?&quot; 칸을 <strong>비워둬도 글은 생성됩니다</strong>{" "}
          (메인 키워드 + 제품 정보로 AI가 알아서 구성). 다만 더 풍부한 글을
          원한다면 두 가지 도구를 활용하세요.
        </p>
        <DefList
          items={[
            {
              term: "✨ AI 추천",
              desc: "메인 키워드 + 선택한 제품 정보만으로 AI가 글 주제 뼈대를 자동 제안. 클릭 한 번. 빠르게 시작하고 싶을 때.",
            },
            {
              term: "📝 질문에 답하기",
              desc: "3가지 질문(누구의 이야기? · 어떤 고민·증상? · 어떤 회복·성과?)에 답하면 페르소나와 주제가 자동 정리됨. 본인 경험·관점을 명확히 반영하고 싶을 때.",
            },
          ]}
        />
        <p className="text-foreground/70">
          💡 <strong>처음이면 ✨ AI 추천</strong>으로 빠르게 시작 → 결과가
          밋밋하면 📝 질문에 답하기로 다시 정리하는 흐름이 자연스럽습니다.
        </p>

        {/* ─── ③ 보조 옵션 ─── */}
        <NumberedSubHeading
          number="③"
          title="서브 키워드 · 추가 요구사항"
          suffix="(둘 다 선택)"
        />
        <p>
          필수는 아니지만 채우면 글 품질이 올라가는 두 가지 보조 옵션입니다.
        </p>
        <DefList
          items={[
            {
              term: "# 서브 키워드",
              desc: "본문에 자연스럽게 포함될 보조 키워드. 쉼표로 구분 (예: \"두피케어, 민감성두피, 각질\"). SEO 보강 + 메인 키워드 주변의 의미 강화.",
            },
            {
              term: "추가 요구사항",
              desc: "AI에게 줄 특별 지시. 예: \"광고 느낌 빼고 솔직한 톤으로\", \"제품명은 마지막에만 한 번 언급\", \"문장은 짧게\".",
            },
          ]}
        />

        {/* ─── ④ 다음 단계 ─── */}
        <NumberedSubHeading number="④" title="다음: 제목 선택" />
        <p>
          메인 키워드를 채웠으면 우하단 <strong>&quot;다음: 제목 선택&quot;</strong>{" "}
          버튼이 활성화됩니다. 클릭하면 3단계로 넘어가요.
        </p>

        <StageHeading id="wizard-review-step-3" step="3" title="제목 선택" />
        <p>
          제품 컨텍스트 + 선택한 말투·서사를 바탕으로 제목 후보가 자동
          생성됩니다. 마음에 드는 걸 고르세요.
        </p>

        <StageHeading id="wizard-review-step-4" step="4" title="본문 생성" />
        <ul>
          <li>
            후기 톤의 본문이 자동 생성됩니다. 보통 <strong>30초~2분</strong>{" "}
            소요. 닫지 말고 기다리세요.
          </li>
          <li>
            에러가 나면: 보통 <strong>API 키 한도 초과</strong> 또는{" "}
            <strong>인터넷 끊김</strong>. API 키 확인 후 재시도.
          </li>
        </ul>
        <p>
          본문은 SmartEditor(네이버 블로그 에디터와 같은 UI)에서 자유롭게 편집
          가능. <strong>편집 시 절대 누르지 말 것</strong>:
        </p>
        <Callout tone="danger">
          <strong className="block text-foreground">
            Cmd+A (Mac) / Ctrl+A (Win) → Delete
          </strong>
          <span className="mt-1 block text-foreground/80">
            전체 선택 후 한 번에 지우면 편집기가 <strong>흰 화면</strong>이
            되는 알려진 문제가 있습니다. 통째로 지우려면 모달을 닫고 처음부터
            다시 생성하세요.
          </span>
        </Callout>

        <p>
          글이 생성되면, <strong>이미지를 만들기 전에 글을 먼저 한 번 읽어봐
          주세요.</strong> AI가 작성하다 보니 대부분은 잘 나오지만, 가끔 규칙을
          어겨 가독성이 떨어질 때가 있습니다. (해외에서는 AI를 두고{" "}
          <strong>&apos;단기 기억상실증에 걸린 천재 신입사원&apos;</strong>이라
          부를 정도예요. 그래서 제작사들도 &apos;AI는 실수할 수 있습니다&apos;라고
          안내합니다.)
        </p>
        <p>
          다행히 글 생성 비용은 거의 들지 않으니, 아래 경우엔 부담 없이{" "}
          <strong>&quot;재생성&quot;</strong>을 한 번 눌러주세요. 보통 깔끔하게 다시
          나옵니다.
        </p>
        <ul>
          <li>
            <strong>문장이 너무 길게 이어질 때</strong> — 온라인 글은 문장을 짧게
            끊어 줄바꿈을 해줘야 읽기 편합니다.
          </li>
          <li>
            <strong>긴 문단·문장 사이에 이미지 자리가 잘 들어갔는지</strong>{" "}
            확인해 주세요.
          </li>
        </ul>
        <p className="text-foreground/70">
          💡 이미지를 만들기 전에 확인하면, 재생성할 때 이미지를 다시 만드는
          수고를 줄일 수 있어요.
        </p>

        <StageHeading id="wizard-review-step-5" step="5" title="발행" />
        <Callout tone="warning">
          <strong className="block text-foreground">
            ⚠️ 발행 중에는 그 창 안의 어떤 것도 클릭하지 마세요 (가장 중요)
          </strong>
          <span className="mt-1 block text-foreground/80">
            발행 버튼을 누르면 크롬 창이 뜨면서 글이{" "}
            <strong>한 글자씩 자동으로 입력</strong>됩니다(사람이 직접
            타이핑하듯 천천히). 이때 그 창 안에서 뜬 팝업이나 본문 등을 클릭하면{" "}
            <strong>입력 위치가 틀어져 글이 엉키고 일부가 사라집니다.</strong>
            <br />❌ 입력 중인 그 창 안에서의 모든 클릭 금지 (팝업·본문 등)
            <br />✅ 입력 중인 창에서 다른 탭을 띄우거나, 평소 쓰시던 다른 크롬
            창에서 작업하시는 건 괜찮습니다.
          </span>
        </Callout>
        <ol>
          <li>
            발행할 <strong>네이버 계정 선택</strong>
          </li>
          <li>
            <strong>카테고리·태그·공개 설정</strong> 확인
          </li>
          <li>
            <strong>&quot;발행&quot;</strong> 버튼 클릭
          </li>
          <li>
            크롬 창이 뜨고 글이 한 글자씩 자동 입력됩니다 →{" "}
            <strong>입력이 끝날 때까지 그 창을 클릭하지 마세요</strong>
          </li>
          <li>
            발행 완료되면 토스트 메시지와 함께 <strong>글 URL</strong>이
            표시됩니다
          </li>
        </ol>
        <p>
          <strong>입력이 다 끝나면, 바로 발행하지 말고 직접 한 번 검수해
          주세요.</strong> 이때는 클릭·수정·엔터 등을 자유롭게 하셔도 됩니다.
          실제 사람이 글을 읽고 수정하고 머문 시간이 네이버에 함께 기록되면서{" "}
          <strong>&quot;사람이 직접 쓴 글&quot;로 인식</strong>되거든요. 프로그램이
          글을 사람처럼 한 글자씩 천천히 입력하도록 만든 것도 같은 이유입니다.
          그래서 검수 겸 직접 움직여 주시면 글도 더 깔끔해지고 계정도 안전하게
          운영하실 수 있습니다. 🙂
        </p>
      </Section>

      {/* ─────────── 브랜드 블로그 ─────────── */}
      <Section id="wizard-brand" number="03" title="브랜드 블로그 5단계">
        <Callout tone="warning">
          <strong className="block text-foreground">
            사전 준비 · 브랜드 프로필 등록 (필수)
          </strong>
          <span className="mt-1 block text-foreground/80">
            &quot;브랜드 프로필&quot; 페이지에서 우리 브랜드의 톤·스타일·자주 쓰는 표현을
            미리 정의해주세요. 없으면 1단계에서 등록 안내 모달이 뜹니다.
          </span>
        </Callout>

        <StageHeading id="wizard-brand-step-1" step="1" title="글 구조 — 브랜드 프로필 + 템플릿" />
        <ol>
          <li>
            <strong>브랜드 프로필 선택</strong> — 등록해둔 프로필 중 하나
          </li>
          <li>
            <strong>글 템플릿 선택</strong> — 4가지 중 하나
          </li>
        </ol>
        <DefList
          items={[
            {
              term: "소개글",
              desc: "브랜드 소개, 문화, 가치 — \"우리는 어떤 곳인가\"",
            },
            {
              term: "정보성글",
              desc: "제품 정보·활용법·사용 사례 (구조형 / 사용자 직접형 두 변형 중 선택)",
            },
            {
              term: "가치 입증글",
              desc: "신뢰도·후기 인용·검증 — \"왜 우리를 믿어야 하는가\"",
            },
            {
              term: "상세 페이지글",
              desc: "상세 사양·비교·기술 (변형 옵션 있음)",
            },
          ]}
        />

        <StageHeading id="wizard-brand-step-2" step="2" title="글 설정 — 주제 + 키워드" />
        <ul>
          <li>
            <strong>주제 (선택)</strong> — 비워두면 AI가 알아서 정합니다
          </li>
          <li>
            <strong>메인 키워드 (선택, 권장)</strong> — 검색 노출을 신경 쓰신다면
            입력
          </li>
        </ul>

        <StageHeading id="wizard-brand-step-3" step="3" title="제목 선택" />
        <p>
          브랜드 톤 + 선택한 템플릿을 바탕으로 제목 후보가 자동 생성됩니다.
        </p>

        <StageHeading id="wizard-brand-step-4" step="4" title="본문 생성 — 글 적합성 자동 점검" />
        <Callout tone="warning">
          <strong className="block text-foreground">
            ⚠️ 생성 직전 AI가 주제·템플릿·브랜드의 궁합을 검사합니다
          </strong>
          <span className="mt-1 block text-foreground/80">
            맞지 않다고 판단되면 경고 모달이 뜹니다. 3가지 선택:
            <br />① <strong>제안 받아들이고 주제 바꾸기</strong> (가장 안전)
            <br />② <strong>이전 단계로 돌아가기</strong>
            <br />③ <strong>무시하고 그대로 생성</strong>
          </span>
        </Callout>
        <p>
          통과되면 브랜드 톤의 본문이 자동 생성됩니다. 보통{" "}
          <strong>30초~2분</strong> 소요.
        </p>
        <Callout tone="danger">
          <strong className="block text-foreground">
            편집 시 절대 누르지 말 것 — Cmd+A / Ctrl+A → Delete
          </strong>
          <span className="mt-1 block text-foreground/80">
            전체 선택 후 한 번에 지우면 편집기가 흰 화면이 됩니다. 통째로
            지우려면 모달을 닫고 처음부터 다시 생성하세요.
          </span>
        </Callout>

        <StageHeading id="wizard-brand-step-5" step="5" title="발행" />
        <p>
          네이버 계정 선택 → 카테고리·태그·공개 설정 → 발행. 발행을 누르면 글이{" "}
          <strong>한 글자씩 자동 입력</strong>되는데, 그 동안{" "}
          <strong>그 창 안을 클릭하지 마세요</strong>(클릭하면 입력 위치가
          틀어져 글이 엉킵니다). 다른 크롬 창에서의 작업은 괜찮습니다. 입력이
          끝나면 바로 발행하지 말고 한 번 검수해 주세요. 완료되면 글 URL이
          표시됩니다.{" "}
          <span className="text-foreground/70">
            (자세한 내용은 위 &quot;후기성 블로그 5단계&quot;의 발행 설명을 참고하세요.)
          </span>
        </p>
      </Section>

      {/* ─────────── AEO 블로그 ─────────── */}
      <Section id="wizard-aeo" number="04" title="AEO 블로그 5단계">
        <Callout tone="warning">
          <strong className="block text-foreground">
            사전 준비 · AEO 프로필 등록 (필수)
          </strong>
          <span className="mt-1 block text-foreground/80">
            AEO 프로필 페이지에서 도메인 영역과 전문성 기준을 먼저 설정하세요.
          </span>
        </Callout>

        <StageHeading id="wizard-aeo-step-1" step="1" title="글 구조 — AEO 프로필 + 글 의도" />
        <ol>
          <li>
            <strong>AEO 프로필 선택</strong> — 등록해둔 프로필 중 하나
          </li>
          <li>
            <strong>글 의도 선택</strong> — 5가지 중 하나. 어떤 질문에 답하는
            글인지 정합니다
          </li>
        </ol>
        <DefList
          items={[
            {
              term: "AI에게 맡기기",
              desc: "기본값. 의도를 AI가 자동 추정. 어떤 걸 골라야 할지 모르면 이걸 선택하세요.",
            },
            {
              term: "정보 탐색형",
              desc: "개념·기본 정보 중심. \"두피 건선이 뭔가요?\" 같은 글.",
            },
            {
              term: "비교 검토형",
              desc: "차이·기준·장단점 중심. \"두피 샴푸 A vs B\" 같은 글.",
            },
            {
              term: "구매 전 고민형",
              desc: "체크 포인트·기준·실수 방지. \"두피 케어 제품 사기 전 알아야 할 것\" 같은 글.",
            },
            {
              term: "문제 해결형",
              desc: "원인·해결법·관리 중심. \"두피 가려움이 안 잡힐 때\" 같은 글.",
            },
          ]}
        />
        <p>
          &quot;AI에게 맡기기&quot; 외 4개 중 하나를 고르면{" "}
          <strong>글 의도 자동 반영(Intent Mode)</strong>이 켜져서, 본문 어휘·
          구조·이미지가 의도에 맞춰 자동으로 조정됩니다.
        </p>

        <StageHeading id="wizard-aeo-step-2" step="2" title="글 설정 — 주제 + 키워드" />
        <ul>
          <li>
            <strong>주제 (선택)</strong>
          </li>
          <li>
            <strong>메인 키워드 (선택, 권장)</strong> — 검색 노출을 신경 쓰신다면
            입력
          </li>
        </ul>

        <StageHeading id="wizard-aeo-step-3" step="3" title="제목 선택" />
        <p>
          선택한 의도 1개의 각도 안에서 <strong>5개 제목이 변주</strong>되어
          생성됩니다. 의도가 흩어지지 않게 자동 통제됩니다.
        </p>

        <StageHeading id="wizard-aeo-step-4" step="4" title="본문 생성" />
        <p>&quot;AI에게 맡기기&quot;가 아닌 의도를 고르신 경우 자동 조정 사항:</p>
        <ul>
          <li>
            도입·어휘·주의점·FAQ 패턴이 의도별로 강제됨 — 글이 의도에서 벗어나지
            않게
          </li>
          <li>
            이미지 12장 → <strong>4장 하드 캡</strong> (정보성 글의 미니멀
            정책)
          </li>
        </ul>
        <p>
          &quot;AI에게 맡기기&quot; 선택 시 기존 동작(제한 없음)으로 생성됩니다. 보통{" "}
          <strong>30초~2분</strong> 소요.
        </p>
        <Callout tone="danger">
          <strong className="block text-foreground">
            편집 시 절대 누르지 말 것 — Cmd+A / Ctrl+A → Delete
          </strong>
          <span className="mt-1 block text-foreground/80">
            전체 선택 후 한 번에 지우면 편집기가 흰 화면이 됩니다. 통째로
            지우려면 모달을 닫고 처음부터 다시 생성하세요.
          </span>
        </Callout>

        <StageHeading id="wizard-aeo-step-5" step="5" title="발행" />
        <p>
          네이버 계정 선택 → 카테고리·태그·공개 설정 → 발행. 발행을 누르면 글이{" "}
          <strong>한 글자씩 자동 입력</strong>되는데, 그 동안{" "}
          <strong>그 창 안을 클릭하지 마세요</strong>(클릭하면 입력 위치가
          틀어져 글이 엉킵니다). 다른 크롬 창에서의 작업은 괜찮습니다. 입력이
          끝나면 바로 발행하지 말고 한 번 검수해 주세요. 완료되면 글 URL이
          표시됩니다.{" "}
          <span className="text-foreground/70">
            (자세한 내용은 위 &quot;후기성 블로그 5단계&quot;의 발행 설명을 참고하세요.)
          </span>
        </p>
      </Section>

      {/* ─────────── 자주 막히는 함정 ─────────── */}
      <Section id="pitfalls" number="05" title="자주 막히는 함정">
        <p className="text-foreground/70">꼭 한번 읽어주세요.</p>

        <SubHeading>AI가 글을 너무 길게 써서 읽기 불편해요</SubHeading>
        <ul>
          <li>
            AI 특성상 가끔 문장을 짧게 끊지 않고 길게 이어 쓸 때가 있습니다.
            온라인 글은 짧게 끊어 줄바꿈해야 읽기 편해요.
          </li>
          <li>
            <strong>이미지를 만들기 전에</strong> 글을 한 번 확인하고, 문장이
            너무 길면 <strong>&quot;재생성&quot;</strong>을 눌러주세요. 보통 다시
            깔끔하게 나옵니다.
          </li>
        </ul>

        <SubHeading>발행 중 글이 틀어졌어요 / 실수로 창을 클릭했어요</SubHeading>
        <ul>
          <li>
            자동 입력 중에 그 창을 클릭하면 입력 위치가 틀어져 글이 엉킵니다.
            입력이 끝날 때까지 그 창은 클릭하지 마세요.
          </li>
          <li>
            이미 틀어진 게 보이면 <strong>그 크롬 창을 닫으면 발행이 취소</strong>
            됩니다. 프로그램은 멀쩡하니 <strong>다시 발행</strong>하시면 됩니다.
          </li>
        </ul>

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

        <SubHeading>네이버가 &quot;비정상 접속&quot;으로 차단했어요</SubHeading>
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
            위 &quot;4단계. 본문 생성&quot;의 경고(Ctrl+A → Delete)를 안 지키신 경우입니다.
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

      <ManualFooterNote>
        글 발행이 익숙해지셨다면 좌측 목차에서{" "}
        <strong>&quot;도구 & 관리&quot;</strong> 카테고리로 넘어가 부가 기능과 데이터
        백업을 확인하세요.
      </ManualFooterNote>
    </ManualArticle>
  );
}
