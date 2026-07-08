"use client";

// 고객 지원 / FAQ 챗봇 — 화면 우측 하단 플로팅 위젯.
// 전역 레이아웃(layout.tsx)에 마운트되어 앱 전체에서 항상 떠 있다.
// 두뇌: /api/chat (Gemini + 지식 베이스). 이미지(스크린샷) 첨부 지원.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { MessageCircle, X, Send, Loader2, Paperclip, ImageUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Verbosity } from "@/lib/chatbot/knowledge";
import { remarkChatLinkify, safeUrl } from "@/lib/chatbot/linkify";
import { SUPPORT_CHAT_URL, SUPPORT_HOURS_NOTE } from "@/lib/chatbot/support";

/** 첨부 이미지 (자동 축소 후). base64 는 data URL prefix 없는 순수 값. */
interface Attachment {
  dataUrl: string;
  base64: string;
  mimeType: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  image?: Attachment;
  // 하드코딩 고정 FAQ 답변 표시 — "더 자세히/짧게"(AI 재생성) 버튼을 숨긴다.
  instant?: boolean;
}

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "안녕하세요! Blog Pick 도우미예요. 😊 24시간 언제든 바로 답해드려요.\n블로그픽·쇼츠픽 사용법, 발행/제작 오류, API 키 등 무엇이든 물어보세요.\n에러가 나면 그 화면을 캡처해 붙여넣어(또는 끌어다 놓아) 주세요 — 바로 분석해 드릴게요.",
};

// 가장 많이 묻는 질문 — AI(/api/chat)를 거치지 않고 즉답하는 고정 FAQ.
// 1·2순위 문의(이미지·영상 생성 실패 / 설치·실행 오류)라 답변 문구·가이드 링크를
// 코드에 박아 즉시 노출한다. 빠른 질문 칩 맨 앞에 순서대로 배치된다.
const INSTANT_FAQS = [
  {
    question: "이미지 / 영상이 생성되지 않아요",
    answer: [
      "이미지·영상은 외부 AI(fal.ai)에서 만들어져요. fal.ai는 쓴 만큼 비용이 드는 유료 서비스라, **fal.ai에 결제·크레딧이 준비되지 않으면 이미지·영상 생성이 실패합니다.**",
      "",
      "가장 흔한 원인은 **fal.ai 크레딧이 0원**인 경우예요. (카드만 등록되고 실제 충전은 안 된 상태)",
      "👉 **fal.ai에서 크레딧을 직접 충전**(약 $10~20, 자동충전 권장)하시면 바로 생성됩니다.",
      "",
      "자세한 발급·충전 방법은 아래 가이드를 참고하세요 👇",
      "- [FAL API 키 발급 방법 (카드 등록 + 크레딧 충전)](https://pickso.notion.site/FAL-API-36f2aa17591b8041a97ae35a050f5e2d)",
      "- [이미지·영상이 생성되지 않아요 (해결 가이드)](https://pickso.notion.site/3872aa17591b8001aed5ed00c1139810)",
    ].join("\n"),
  },
  {
    question: "프로그램이 설치·실행되지 않아요",
    answer: [
      "설치·업데이트·실행이 안 되는 건 대부분 **PC 환경**(보안 차단·저장 공간·브라우저) 문제예요. 프로그램 고장이 아니라, 막힌 것만 한 번 풀어주면 정상 작동합니다.",
      "",
      "이런 경우가 많아요. 내 증상에 맞게 따라 해 보세요.",
      "- **설치하려는데 '위험할 수 있는 앱'이라며 막혀요** → 경고창의 '추가 정보 → 실행'을 누르면 설치돼요. (바이러스 아니에요!)",
      "- **설치·업데이트 중 영어 팝업이 뜨며 멈춰요** → 블로그픽을 완전히 끈 뒤 다시 설치하세요.",
      "- **업데이트 후 프로그램·아이콘이 사라진 것 같아요** → 지워진 게 아니라 새 버전으로 바뀌는 중이에요. PC 성능에 따라 최대 10분까지 걸릴 수 있으니, 그동안 누르지 말고 기다려 주세요.",
      "- **설치 파일이 다운로드가 안 돼요** → 엣지 말고 크롬으로 받아주세요.",
      "- **글은 써지는데 발행만 안 돼요** → C드라이브 공간이 부족한 거예요. 공간을 비우고 다시 설치하세요.",
      "",
      "더 자세한 내용은 아래 가이드를 참고하세요 👇👇👇",
      "- [설치·업데이트 오류 해결](https://pickso.notion.site/3882aa17591b8066a887ec493c97c031)",
      "- [윈도우 버전 설치 방법](https://pickso.notion.site/36f2aa17591b81fab31cec43e2c27954)",
      "- [맥 버전 설치 방법](https://pickso.notion.site/MAC-36f2aa17591b80f299c8f86db47759b4)",
      "",
      "📥 **최신 버전 바로 다운로드** (클릭하면 바로 받아져요)",
      "- [윈도우 다운로드](https://github.com/heartblood0509-gif/App_blog2/releases/latest/download/Blog-Pick-Windows.exe)",
      "- [맥 · 애플 실리콘 다운로드](https://github.com/heartblood0509-gif/App_blog2/releases/latest/download/Blog-Pick-Mac-AppleSilicon.dmg)",
      "- [맥 · 인텔 다운로드](https://github.com/heartblood0509-gif/App_blog2/releases/latest/download/Blog-Pick-Mac-Intel.dmg)",
    ].join("\n"),
  },
  {
    question: "포맷 후 영상 생성 실패 (윈도우 보안)",
    answer: [
      "음성 '샘플 듣기'가 안 되거나, '영상 생성 실패'가 뜨시나요? 두 증상 모두 원인이 같아요 — **윈도우 보안 기능(Smart App Control)이 프로그램의 영상·소리 처리 도구를 막은** 거예요. 바이러스도, 프로그램 고장도 아니에요. 👇",
      "",
      "**이런 증상이에요**",
      "- 🔊 음성 **'샘플 듣기'**를 눌러도 소리가 안 나고 오류가 떠요.",
      "- 🎬 영상 만들기 끝에 **'영상 생성 실패'**가 떠요.",
      "",
      "**왜 이런가요?**",
      "윈도우 11의 'Smart App Control'은 아직 정식 서명이 없는 프로그램의 일부 도구를 자동으로 막는 보안 기능이에요. 특히 **PC를 포맷하거나 새로 설치한 직후** 이 기능이 자동으로 켜지면서, 잘 되던 기능이 갑자기 실패할 수 있어요.",
      "",
      "**해결 방법 (1분이면 돼요)**",
      "1. 작업 표시줄 검색창에 **'Windows 보안'**을 검색해 열어요.",
      "2. 왼쪽 메뉴에서 **'앱 및 브라우저 컨트롤'**을 눌러요.",
      "3. **'Smart App Control'**을 찾아 **'끔'**으로 바꿔요.",
      "4. 블로그픽을 껐다 켠 뒤 다시 해 보세요. 정상 작동합니다.",
      "",
      "**⚠️ 끄고 난 뒤에는 이것만 지켜주세요**",
      "Smart App Control은 나쁜 프로그램을 막아주는 보안 기능이에요. 끈 뒤에는 **아무 프로그램이나 함부로 설치하지 마시고, 출처가 분명한 검증된 프로그램만** 설치하세요. **낯선 사이트의 파일 다운로드는 특히 조심해주세요.**",
      "",
      "**참고**",
      "- 나중에 같은 자리에서 다시 켤 수 있어요.",
      "- 회사에서 관리하는 PC라면 직접 못 끌 수 있어요. 이 경우 IT 관리자에게 문의하세요.",
      "- 블로그픽도 **곧 정식 서명을 적용**해, 앞으로는 이 과정 없이도 되게 할 예정이에요.",
    ].join("\n"),
  },
  {
    question: "계정·기기는 몇 대까지 쓸 수 있나요?",
    answer: [
      "자주 묻는 계정·기기 정책을 정리했어요. 👇",
      "",
      "**🔐 프로그램 로그인 계정**",
      "구글 계정 **1개**만 사용할 수 있어요.",
      "",
      "**💻 설치 기기**",
      "**최대 3대**까지 등록해서 쓸 수 있어요. 단, **동시 접속은 안 돼요.** 한 대에서 로그인하면 다른 기기는 **자동으로 로그아웃**돼요. (예: 회사 PC에서 쓰다가 집 PC에서 로그인하면 회사 PC는 로그아웃됨)",
      "",
      "ℹ️ 하나의 계정을 여러 사람이 동시에 나눠 쓰는 것을 방지하기 위한 정책이에요. 정당하게 구매하신 분들을 보호하기 위한 것이니 양해 부탁드려요. 🙏",
    ].join("\n"),
  },
  {
    question: "네이버 아이디는 몇 개까지 등록되나요?",
    answer: [
      "**📝 네이버 발행 아이디**",
      "발행에 쓸 네이버 아이디는 **개수 제한 없이** 등록할 수 있어요.",
      "다만 계정 안전을 위해 **아이디 1개당 하루 2개**, 전체적으로는 **하루 4개 이내** 발행을 권장해요.",
    ].join("\n"),
  },
  {
    question: "쇼츠 영상은 어떻게 만드나요?",
    answer: [
      "영상은 앱 첫 화면 **'채널 선택'에서 '유튜브'를 선택**하면 만들 수 있어요. 처음 만드실 때 아래 3가지만 기억하시면 훨씬 수월해요. 👇",
      "",
      "**🎬 영상은 이렇게 만들어요**",
      "사진·영상을 **AI로 생성**할 수도 있어요. 다만 더 자연스러운(AI 티 안 나는) 결과물을 원하시면 **직접 촬영한 사진이나 영상을 업로드하시는 걸 적극 권장**해요. AI는 소스가 부족할 때 중간중간 섞어 쓰시면 좋아요.",
      "대본에 어울리는 영상만 잘 매칭해 주시면, **편집(쪼개기·합치기 등)은 프로그램이 알아서 해줘요.**",
      "",
      "**✂️ 대본은 한 줄에 한 문장씩, 3초 이하로 넣어 주세요**",
      "AI 영상 생성은 **한 컷당 최대 6초**까지 만들어져요. 만약 한 줄에 10초 분량의 대본을 넣으면, 영상은 6초까지만 나오고 **나머지는 검은 화면**이 돼요.",
      "그래서 **한 줄에 한 문장씩, 3초 이하**로 넣는 걸 추천해요. 3초는 생각보다 길어서 보통 한 문장이면 충분히 들어가고, 한 장면이 너무 길면 **시청자가 지루함**을 느껴요.",
      "",
      "**🔊 음성·배경음악**",
      "음성(내레이션)은 Typecast API 키가 필요해요. (fal API 키 입력란과 헷갈리지 않게 주의!)",
      "배경음악(BGM)은 **직접 만든 음악을 올리거나, 유튜브 오디오 라이브러리의 무료 음악**을 받아서 올리면 돼요.",
      "⚠️ 단, 유튜브 오디오 라이브러리 음악은 **유튜브에 올릴 때만** 쓸 수 있어요. 인스타·틱톡에 올리실 거면, 스마트폰으로 업로드할 때 **각 앱이 제공하는 음악**을 직접 입혀 주세요.",
      "",
      "자세한 제작 방법은 아래 가이드를 참고하세요 👇",
      "- [쇼츠 영상 만드는 방법 (전체 가이드)](https://pickso.notion.site/c8f2aa17591b83a8beb3811b9bc5005c?pvs=74)",
    ].join("\n"),
  },
] as const;

// 빠른 질문 칩 — 첫 진입 시 사용자가 클릭만으로 시작할 수 있게. (이 4개는 AI가 답변)
const QUICK_QUESTIONS = [
  "글은 어떻게 발행하나요?",
  "API 키는 어디서 등록하나요?",
  "편집기가 흰 화면이 됐어요",
];

const MAX_DIM = 1568; // 이미지 최대 한 변(px) — Gemini 권장. 큰 스크린샷 자동 축소.
const MAX_IMAGE_B64 = 7_000_000; // 첨부 base64 최대 길이 — 서버 route.ts 의 MAX_IMAGE_B64 와 값 일치.
// 축소가 필요할 때 PNG(무손실, 글씨 선명) 대신 JPEG로 폴백할지 가르는 base64 길이 한도.
// 이보다 작으면 PNG 유지, 크면(주로 사진) 고품질 JPEG로 용량을 잡는다. 하드 한도(MAX_IMAGE_B64)보다 충분히 낮게.
const PNG_BUDGET_B64 = 3_000_000; // ≈ 2.2MB
const KEEP_IMAGES = 2; // 서버로 실어 보낼 직전 이미지 보존 수 — 서버 route.ts 의 KEEP_IMAGES 와 값 일치.

/** 파일을 data URL 문자열로 읽는다. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

/**
 * 첨부 이미지를 캡처 판독에 맞게 정리한다.
 * - 줄일 필요 없으면(원본이 maxDim 이내) 재인코딩하지 않고 원본 그대로 → 글씨 100% 보존.
 * - 줄여야 하면 글자에 강한 PNG(무손실) 우선, PNG가 너무 크면(주로 사진) 고품질 JPEG로 폴백.
 */
function downscale(dataUrl: string, maxDim: number): Promise<Attachment> {
  return new Promise((resolve) => {
    const fallback = (): Attachment => ({
      dataUrl,
      base64: dataUrl.split(",")[1] ?? "",
      mimeType: (dataUrl.match(/^data:(image\/[\w.+-]+);/)?.[1] ?? "image/png"),
    });
    const toAttachment = (url: string, mimeType: string): Attachment => ({
      dataUrl: url,
      base64: url.split(",")[1] ?? "",
      mimeType,
    });
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        // 줄일 필요가 없으면 원본 그대로 — 재압축으로 글씨를 뭉개지 않는다.
        if (scale === 1) return resolve(fallback());

        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(fallback());
        ctx.drawImage(img, 0, 0, w, h);

        // 글자에 강한 PNG(무손실) 우선. 예산을 넘으면(사진 등) 고품질 JPEG로 폴백.
        const png = canvas.toDataURL("image/png");
        const pngB64 = png.split(",")[1] ?? "";
        if (pngB64 && pngB64.length <= PNG_BUDGET_B64) {
          return resolve(toAttachment(png, "image/png"));
        }
        return resolve(toAttachment(canvas.toDataURL("image/jpeg", 0.92), "image/jpeg"));
      } catch {
        resolve(fallback());
      }
    };
    img.onerror = () => resolve(fallback());
    img.src = dataUrl;
  });
}

/** 답변 끝에 붙는 "도움말에서 자세히 보기" 마크다운 링크 한 줄을 제거 (프롬프트가 어겨도 코드로 확실히). */
function stripHelpLink(text: string): string {
  const stripped = text.replace(
    /\n*\[[^\]]*(?:📖|도움말에서 자세히 보기)[^\]]*\]\([^)]*\)\s*$/u,
    ""
  );
  return stripped === text ? text : stripped.trimEnd();
}

/** 에러 말풍선 판별 — "⚠️"로 시작하는 답변엔 "더 자세히/짧게" 버튼을 숨긴다(실패 반복 방지). */
function isErrorBubble(content: string): boolean {
  return content.trim().startsWith("⚠️");
}

/** 서버로 보낼 wire 메시지 (이미지는 base64 만). */
type WireMessage = {
  role: "user" | "assistant";
  content: string;
  image?: { data: string; mimeType: string };
};

/** 메시지 배열 → wire. 이미지는 서버 정책과 동일하게 최근 KEEP_IMAGES개만 포함. */
function buildWire(msgs: ChatMessage[]): WireMessage[] {
  const imageIdxs = msgs.map((m, i) => (m.image ? i : -1)).filter((i) => i >= 0);
  const keep = new Set(imageIdxs.slice(-KEEP_IMAGES));
  return msgs.map((m, i) => ({
    role: m.role,
    content: m.content,
    ...(m.image && keep.has(i)
      ? { image: { data: m.image.base64, mimeType: m.image.mimeType } }
      : {}),
  }));
}

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  // 답변 후 "다른 질문 보기"를 누르면 빠른 질문 칩을 다시 펼친다(대화는 유지).
  const [showQuickAgain, setShowQuickAgain] = useState(false);

  // 플로팅 버튼 안내 말풍선 — 호버 시 / 첫 방문 자동 노출.
  const [hovered, setHovered] = useState(false);
  const [autoHinted, setAutoHinted] = useState(false);
  // 아래로 스크롤하면 라벨 알약을 동그라미로 접는다(본문 가림 최소화).
  const [collapsed, setCollapsed] = useState(false);
  const reduceMotion = useReducedMotion();

  const scrollRef = useRef<HTMLDivElement>(null);
  const lastUserMsgRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dragDepth = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const pathname = usePathname();
  const router = useRouter();

  // 새 질문(칩 클릭·직접 입력)이 추가되면 그 질문을 스크롤 영역 맨 위에 고정한다(pin-to-top).
  // 답변이 길어도 화면이 답변 끝으로 따라 내려가지 않고, 사용자가 질문→답변을 위에서부터
  // 자연스럽게 읽어 내려가도록 한다. 의존성은 "유저 메시지 수"라서 스트리밍 중 본문이 길어져도
  // 다시 스크롤하지 않는다(질문이 위에 고정된 채 답변만 아래에서 채워진다).
  const userMsgCount = messages.filter((m) => m.role === "user").length;
  useEffect(() => {
    const el = scrollRef.current;
    const q = lastUserMsgRef.current;
    if (!el || !q) return;
    const elRect = el.getBoundingClientRect();
    const qRect = q.getBoundingClientRect();
    el.scrollTop += qRect.top - elRect.top - 12; // 질문 위에 약간의 여백
  }, [userMsgCount, open]);

  // 열릴 때 입력창 포커스.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // 첫 방문 1회만 안내 말풍선 자동 노출 (2.5초 뒤 등장 → 4초 유지 후 숨김).
  useEffect(() => {
    let safe = true;
    try {
      if (localStorage.getItem("sopick-chat-hint-shown")) return;
    } catch {
      return; // localStorage 접근 불가(프라이빗 모드 등) — 조용히 건너뜀
    }
    const t1 = setTimeout(() => {
      if (!safe) return;
      setAutoHinted(true);
      try {
        localStorage.setItem("sopick-chat-hint-shown", "1");
      } catch {
        // 기록 실패해도 노출 자체는 진행
      }
    }, 2500);
    const t2 = setTimeout(() => {
      if (safe) setAutoHinted(false);
    }, 6500);
    return () => {
      safe = false;
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  // 스크롤 감지 → 버튼 접힘. 메인/도움말은 window 스크롤, 블로그 분할 모드는
  // body가 잠기고 [data-blog-pick-root]가 스크롤한다. capture 리스너 하나로
  // 두 경우(내부 요소 스크롤 포함)를 모두 잡는다.
  useEffect(() => {
    const THRESHOLD = 80;
    const read = () => {
      const root = document.querySelector<HTMLElement>("[data-blog-pick-root]");
      const y =
        root && root.scrollHeight > root.clientHeight
          ? root.scrollTop
          : window.scrollY;
      const next = y > THRESHOLD;
      setCollapsed((prev) => (prev === next ? prev : next));
    };
    read();
    const opts: AddEventListenerOptions = { passive: true, capture: true };
    window.addEventListener("scroll", read, opts);
    return () => window.removeEventListener("scroll", read, opts);
  }, []);

  // 파일(이미지)을 받아 축소 후 첨부로 등록.
  const attachFile = useCallback(async (file: File | null | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("이미지 파일만 첨부할 수 있어요.");
      return;
    }
    try {
      const dataUrl = await readAsDataUrl(file);
      const att = await downscale(dataUrl, MAX_DIM);
      if (!att.base64) {
        toast.error("이미지를 불러오지 못했어요. 다시 시도해 주세요.");
        return;
      }
      // 서버가 말없이 버리던 용량 초과를 클라에서 선제 차단 (base64 길이 = 서버 MAX_IMAGE_B64 기준).
      if (att.base64.length > MAX_IMAGE_B64) {
        toast.error("이미지가 너무 커요. 더 작은 캡처로 보내주세요.");
        return;
      }
      setAttachment(att);
    } catch {
      // readAsDataUrl(파일 읽기) 실패 경로. downscale 실패는 fallback 으로 흡수돼 여기 안 옴.
      toast.error("이미지를 불러오지 못했어요. 다시 시도해 주세요.");
    }
  }, []);

  // 공통 스트리밍: /api/chat 호출 → 마지막(빈) assistant 메시지에 누적 → 완료 시 도움말 링크 푸터 제거.
  // 실패는 throw (호출자가 롤백/토스트). 호출 전에 마지막 메시지로 빈 assistant 를 넣어둬야 한다.
  const streamAssistant = useCallback(
    async (wire: WireMessage[], verbosity?: Verbosity) => {
      abortRef.current = new AbortController();
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: wire,
          currentPage: pathname,
          ...(verbosity ? { verbosity } : {}),
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || "응답을 받지 못했습니다.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }

      // 완료 후 도움말 링크 푸터 제거 (프롬프트가 어겨도 코드로 확실히).
      const cleaned = stripHelpLink(acc);
      if (cleaned !== acc) {
        setMessages((prev) => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: "assistant", content: cleaned };
          return copy;
        });
      }
    },
    [pathname]
  );

  const send = useCallback(
    async (text: string, image: Attachment | null) => {
      const trimmed = text.trim();
      if ((!trimmed && !image) || isStreaming) return;

      const userMsg: ChatMessage = {
        role: "user",
        content: trimmed,
        image: image ?? undefined,
      };
      const nextMessages: ChatMessage[] = [...messages, userMsg];
      setMessages([...nextMessages, { role: "assistant", content: "" }]);
      setInput("");
      setAttachment(null);
      setShowQuickAgain(false);
      setIsStreaming(true);

      try {
        await streamAssistant(buildWire(nextMessages));
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // 사용자가 닫음 — 무시
        } else {
          const msg =
            err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
          // 전송 실패 — 추가했던 사용자/빈 답변을 되돌리고, 입력·첨부를 복구해
          // 같은 내용으로 바로 재전송할 수 있게 한다 (특히 어렵게 캡처한 이미지 보존).
          setMessages(messages);
          setInput(trimmed);
          setAttachment(image ?? null);
          toast.error(`전송 실패: ${msg}`);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, isStreaming, streamAssistant]
  );

  // 고정 FAQ 즉답 — 가장 많은 문의(이미지·영상 실패)는 AI를 거치지 않고
  // 질문+미리 박아둔 답변을 바로 메시지에 추가한다(네트워크 호출 0, 즉시 노출).
  const answerInstant = useCallback(
    (question: string, answer: string) => {
      if (isStreaming) return;
      setMessages((prev) => [
        ...prev,
        { role: "user", content: question },
        { role: "assistant", content: answer, instant: true },
      ]);
      // send()와 동일하게 입력칸·첨부를 비운다 — 칩을 누르기 전 써둔 텍스트나
      // 붙여둔 스크린샷이 그대로 남아 다음 전송에 딸려 나가는 오전송을 막는다.
      setInput("");
      setAttachment(null);
      setShowQuickAgain(false);
    },
    [isStreaming]
  );

  // "더 자세히/짧게" — 원래 답은 남기고 새 답을 아래에 추가(append).
  // 모델엔 직전 대화 전체(질문+짧은 답)를 보내고, 끝에 "이 답을 더 자세히/짧게" 지시 턴을
  // wire 에만 덧붙인다(화면엔 안 보임) → 모델이 무엇을 확장/요약할지 알게 한다.
  const regenerateLast = useCallback(
    async (verbosity: Verbosity) => {
      if (isStreaming) return;
      const last = messages[messages.length - 1];
      if (
        !last ||
        last.role !== "assistant" ||
        !last.content ||
        isErrorBubble(last.content)
      )
        return;
      if (!messages.some((m) => m.role === "user")) return; // 재답할 질문 존재

      const instruction =
        verbosity === "detailed"
          ? "방금 답변을 매뉴얼 수준으로 더 자세히, 빠짐없이 다시 설명해 주세요."
          : "방금 답변을 핵심만 1~3줄로 짧게 요약해 주세요.";
      // 직전 대화(이미지 KEEP_IMAGES 유지) + 지시 턴(user). 서버 가드(마지막 role=user) 충족.
      const wire: WireMessage[] = [
        ...buildWire(messages),
        { role: "user", content: instruction },
      ];

      const snapshot = messages;
      setMessages([...messages, { role: "assistant", content: "" }]);
      setIsStreaming(true);

      try {
        await streamAssistant(wire, verbosity);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // 무시
        } else {
          const msg =
            err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
          setMessages(snapshot); // append 한 빈 답변 제거(이전 상태 복구)
          toast.error(`다시 답변 실패: ${msg}`);
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, isStreaming, streamAssistant]
  );

  // 도움말 딥링크(/help/...)는 새로고침 없이 앱 내에서 이동하고 패널을 닫는다.
  // href 는 safeUrl 로 검증 — javascript:/data: 등은 링크가 아니라 평문으로 렌더(보안).
  const renderLink = ({
    href,
    children,
  }: {
    href?: string;
    children?: React.ReactNode;
  }) => {
    const safe = href ? safeUrl(href) : null;
    if (!safe) return <>{children}</>;
    const isInternal = safe.startsWith("/");
    return (
      <a
        href={safe}
        onClick={(e) => {
          if (isInternal) {
            e.preventDefault();
            router.push(safe);
            setOpen(false);
          }
        }}
        {...(isInternal ? {} : { target: "_blank", rel: "noopener noreferrer" })}
      >
        {children}
      </a>
    );
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input, attachment);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input, attachment);
    }
  };

  // 붙여넣기(Ctrl+V)로 이미지 첨부.
  const onPaste = (e: React.ClipboardEvent) => {
    const item = Array.from(e.clipboardData.items).find((it) =>
      it.type.startsWith("image/")
    );
    if (item) {
      e.preventDefault();
      attachFile(item.getAsFile());
    }
  };

  // 드래그앤드롭으로 이미지 첨부 (패널 전체가 드롭 영역).
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files);
    const image = files.find((f) => f.type.startsWith("image/"));
    if (image) {
      attachFile(image);
    } else if (files.length > 0) {
      // 파일은 떨궜는데 이미지가 하나도 없으면 조용히 무시하지 않고 알린다.
      toast.error("이미지 파일만 첨부할 수 있어요.");
    }
  };
  const onDragEnter = (e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.types).includes("Files")) {
      e.preventDefault();
      dragDepth.current += 1;
      setIsDragging(true);
    }
  };
  const onDragOver = (e: React.DragEvent) => {
    if (Array.from(e.dataTransfer.types).includes("Files")) e.preventDefault();
  };
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDragging(false);
  };

  // 좌상단 모서리 드래그로 채팅창 크기 조절 (패널은 우하단 고정이라 위·왼쪽으로 커짐).
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const rect = panelRef.current?.getBoundingClientRect();
    const startW = rect?.width ?? 480;
    const startH = rect?.height ?? 512;
    const onMove = (ev: PointerEvent) => {
      const maxW = Math.min(window.innerWidth - 36, 760);
      const maxH = window.innerHeight - 112;
      const w = Math.max(300, Math.min(maxW, startW + (startX - ev.clientX)));
      const h = Math.max(360, Math.min(maxH, startH + (startY - ev.clientY)));
      setSize({ w, h });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const canSend = (!!input.trim() || !!attachment) && !isStreaming;
  // 알약(라벨 노출) 상태에선 라벨 자체가 안내라 말풍선을 띄우지 않는다.
  // (접힌 동그라미 상태에서만 호버/첫방문 말풍선 — 모바일 좌측 오버플로도 방지)
  const showBubble = !open && collapsed && (hovered || autoHinted);

  // 하단 "1:1 채팅 문의" 링크 — 순수 <a>라 linkify를 안 거치므로 safeUrl로 검증.
  const supportHref = safeUrl(SUPPORT_CHAT_URL);

  // 마지막 유저(질문) 메시지의 인덱스 — pin-to-top 스크롤 대상.
  const lastUserIndex = messages.reduce(
    (acc, m, i) => (m.role === "user" ? i : acc),
    -1
  );

  // "더 자세히/짧게"는 마지막이 정상(에러 아님) 답변이고, 재답할 질문이 있을 때만 노출.
  const lastMsg = messages[messages.length - 1];
  const canRefine =
    !isStreaming &&
    !!lastMsg &&
    lastMsg.role === "assistant" &&
    !!lastMsg.content &&
    !isErrorBubble(lastMsg.content) &&
    !lastMsg.instant && // 하드코딩 고정 FAQ 답변엔 재생성 버튼 숨김
    messages.some((m) => m.role === "user");

  return (
    <>
      {/* 채팅 패널 */}
      <AnimatePresence>
        {open && (
          <motion.div
            ref={panelRef}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={size ? { width: size.w, height: size.h } : undefined}
            className="fixed bottom-24 right-5 z-[60] flex h-[min(61rem,calc(100dvh-7rem))] w-[min(30rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
            role="dialog"
            aria-label="고객 지원 챗봇"
            onDragEnter={onDragEnter}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {/* 좌상단 크기 조절 핸들 */}
            <div
              onPointerDown={startResize}
              className="absolute left-0 top-0 z-20 size-5 cursor-nwse-resize"
              style={{ touchAction: "none" }}
              role="separator"
              aria-label="채팅창 크기 조절"
              title="드래그해서 크기 조절"
            >
              <span className="pointer-events-none absolute left-1.5 top-1.5 size-2 rounded-tl-[3px] border-l-2 border-t-2 border-primary-foreground/70" />
            </div>

            {/* 드래그 오버레이 */}
            {isDragging && (
              <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-primary/10 backdrop-blur-sm ring-2 ring-inset ring-primary/40">
                <ImageUp className="size-8 text-primary" />
                <span className="text-sm font-semibold text-primary">
                  이미지를 여기에 놓으세요
                </span>
              </div>
            )}

            {/* 헤더 */}
            <div className="flex items-center justify-between border-b border-border bg-primary px-4 py-3 text-primary-foreground">
              <div className="flex items-center gap-2">
                <MessageCircle className="size-4 shrink-0" />
                <div className="flex flex-col leading-tight">
                  <span className="text-sm font-semibold">Blog Pick 도우미</span>
                  <span className="text-[11px] font-normal text-primary-foreground/80">
                    24시간 즉시 답변
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 transition-colors hover:bg-white/15"
                aria-label="닫기"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* 메시지 목록 */}
            <div
              ref={scrollRef}
              className="flex-1 space-y-3 overflow-y-auto px-4 py-4"
            >
              {messages.map((m, i) => (
                <div
                  key={i}
                  ref={i === lastUserIndex ? lastUserMsgRef : undefined}
                  className={cn(
                    "flex",
                    m.role === "user" ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] whitespace-pre-wrap break-keep break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed",
                      m.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    )}
                  >
                    {/* 첨부 이미지 썸네일 */}
                    {m.image && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={m.image.dataUrl}
                        alt="첨부 이미지"
                        className="mb-1.5 max-h-48 w-auto rounded-lg"
                      />
                    )}
                    {m.role === "assistant" ? (
                      m.content ? (
                        <div className="chat-markdown">
                          <ReactMarkdown
                            remarkPlugins={
                              isStreaming && i === messages.length - 1
                                ? [remarkGfm]
                                : [remarkGfm, remarkChatLinkify]
                            }
                            components={{ a: renderLink }}
                          >
                            {m.content}
                          </ReactMarkdown>
                        </div>
                      ) : (
                        <Loader2 className="size-4 animate-spin text-foreground/50" />
                      )
                    ) : (
                      m.content
                    )}
                  </div>
                </div>
              ))}

              {/* 답변 깊이 조절 — 마지막 정상 답변 아래에만 노출 */}
              {canRefine && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => regenerateLast("detailed")}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-muted"
                  >
                    더 자세히
                  </button>
                  <button
                    type="button"
                    onClick={() => regenerateLast("concise")}
                    className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-muted"
                  >
                    짧게
                  </button>
                </div>
              )}

              {/* 빠른 질문 — 첫 인사 시, 또는 "다른 질문 보기"를 눌렀을 때 노출 */}
              {(messages.length === 1 || showQuickAgain) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {/* 1·2순위 고정 FAQ — 맨 앞. 클릭 시 AI 없이 즉답. */}
                  {INSTANT_FAQS.map((faq) => (
                    <button
                      key={faq.question}
                      type="button"
                      onClick={() => answerInstant(faq.question, faq.answer)}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-muted"
                    >
                      {faq.question}
                    </button>
                  ))}
                  {QUICK_QUESTIONS.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q, null)}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-muted"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}

              {/* "다른 질문 보기" — 답변이 있고 빠른 질문이 접혀 있을 때, 다시 펼치는 진입점 */}
              {!isStreaming &&
                !showQuickAgain &&
                messages.length > 1 &&
                lastMsg?.role === "assistant" &&
                !!lastMsg.content && (
                  <div className="flex pt-1">
                    <button
                      type="button"
                      onClick={() => setShowQuickAgain(true)}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground/60 transition-colors hover:bg-muted"
                    >
                      ＋ 다른 질문 보기
                    </button>
                  </div>
                )}
            </div>

            {/* 첨부 미리보기 */}
            {attachment && (
              <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-3 py-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={attachment.dataUrl}
                  alt="첨부 미리보기"
                  className="size-12 rounded-md object-cover ring-1 ring-border"
                />
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-xs text-foreground/60">
                    이미지 1장 첨부됨
                  </span>
                  <span className="text-[11px] leading-snug text-foreground/45">
                    분석을 위해 외부(Google)로 전송돼요. 비밀번호·API 키 등 민감정보는 가려주세요.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  className="rounded-md p-1 text-foreground/50 transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="첨부 제거"
                >
                  <X className="size-4" />
                </button>
              </div>
            )}

            {/* 입력 영역 */}
            <form
              onSubmit={onSubmit}
              className="flex items-end gap-2 border-t border-border p-3"
            >
              {/* 이미지 첨부 버튼 */}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  attachFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => fileRef.current?.click()}
                aria-label="이미지 첨부"
                title="이미지 첨부 (붙여넣기·드래그도 가능)"
              >
                <Paperclip className="size-4" />
              </Button>

              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
                rows={1}
                placeholder="궁금한 점을 입력하세요…"
                className="max-h-28 min-h-9 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-foreground/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!canSend}
                aria-label="보내기"
              >
                {isStreaming ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </form>

            {/* 1:1 채팅 문의 — 챗봇으로 해결 안 될 때의 확실한 경로(항상 노출) */}
            <div className="border-t border-border bg-muted/30 px-3 py-2 text-center">
              {supportHref && (
                <a
                  href={supportHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                >
                  해결이 안 되나요? 1:1 채팅 문의 →
                </a>
              )}
              <p className="mt-0.5 text-[11px] leading-snug text-foreground/45">
                {SUPPORT_HOURS_NOTE}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 플로팅 토글 버튼 + 안내 말풍선 (wrapper 기준으로 말풍선이 버튼 왼쪽에 정렬) */}
      <div className="fixed bottom-5 right-5 z-[60]">
        {/* 안내 말풍선 — 호버 또는 첫 방문 자동 노출 시 */}
        <AnimatePresence>
          {showBubble && (
            <motion.div
              key="chat-hint"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
              animate={reduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.8 }}
              transition={
                reduceMotion
                  ? { duration: 0.15 }
                  : { type: "spring", stiffness: 500, damping: 18 }
              }
              style={{ transformOrigin: "right center" }}
              aria-hidden
              className="pointer-events-none absolute right-full top-1/2 mr-3 w-max max-w-[min(15rem,calc(100vw-5rem))] -translate-y-1/2 whitespace-normal break-keep rounded-xl bg-primary px-3.5 py-2 text-sm font-medium text-primary-foreground shadow-lg"
            >
              막히면 여기서 바로 물어보세요. 24시간 즉시 답해드려요 🙂
              {/* 꼬리 — 버튼 쪽을 가리킴 */}
              <span className="absolute right-0 top-1/2 size-2.5 -translate-y-1/2 translate-x-1/2 rotate-45 bg-primary" />
            </motion.div>
          )}
        </AnimatePresence>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="flex h-14 items-center justify-center rounded-full bg-primary px-4 text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
          aria-label={open ? "챗봇 닫기" : "도움이 필요하세요? — 챗봇 열기"}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={open ? "close" : "open"}
              initial={{ opacity: 0, rotate: -45 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 45 }}
              transition={{ duration: 0.15 }}
              className="shrink-0"
            >
              {open ? (
                <X className="size-6" />
              ) : (
                <MessageCircle className="size-6" />
              )}
            </motion.span>
          </AnimatePresence>
          {/* 닫혀 있고 페이지 상단일 때만 라벨 노출(알약). 스크롤하면 동그라미로 접힘. */}
          <AnimatePresence initial={false}>
            {!open && !collapsed && (
              <motion.span
                key="fab-label"
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, width: 0 }}
                animate={reduceMotion ? { opacity: 1 } : { opacity: 1, width: "auto" }}
                exit={reduceMotion ? { opacity: 0 } : { opacity: 0, width: 0 }}
                transition={{ duration: reduceMotion ? 0.12 : 0.2, ease: "easeOut" }}
                className="overflow-hidden whitespace-nowrap text-sm font-semibold"
              >
                <span className="pl-2 pr-0.5">도움이 필요하세요?</span>
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </>
  );
}
