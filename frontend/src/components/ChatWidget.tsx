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
}

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "안녕하세요! So-Pick 도우미예요. 😊\n블로그픽·쇼츠픽 사용법, 발행/제작 오류, API 키 등 궁금한 점을 물어보세요.\n에러 화면은 캡처해서 붙여넣어(또는 끌어다 놓아) 주셔도 됩니다.",
};

// 빠른 질문 칩 — 첫 진입 시 사용자가 클릭만으로 시작할 수 있게.
const QUICK_QUESTIONS = [
  "글은 어떻게 발행하나요?",
  "쇼츠 영상은 어떻게 만드나요?",
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

  // 플로팅 버튼 안내 말풍선 — 호버 시 / 첫 방문 자동 노출.
  const [hovered, setHovered] = useState(false);
  const [autoHinted, setAutoHinted] = useState(false);
  const reduceMotion = useReducedMotion();

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const dragDepth = useRef(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  const pathname = usePathname();
  const router = useRouter();

  // 새 메시지마다 맨 아래로 스크롤. isStreaming 도 의존성에 둬서, 스트리밍이 끝나
  // "더 자세히/짧게" 버튼이 추가되는 순간에도 다시 스크롤해 버튼이 가려지지 않게 한다.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, attachment, isStreaming]);

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
  const renderLink = ({
    href,
    children,
  }: {
    href?: string;
    children?: React.ReactNode;
  }) => {
    const isInternal = href?.startsWith("/");
    return (
      <a
        href={href}
        onClick={(e) => {
          if (isInternal && href) {
            e.preventDefault();
            router.push(href);
            setOpen(false);
          }
        }}
        {...(isInternal ? {} : { target: "_blank", rel: "noreferrer" })}
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
    const startW = rect?.width ?? 384;
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
  const showBubble = !open && (hovered || autoHinted);

  // "더 자세히/짧게"는 마지막이 정상(에러 아님) 답변이고, 재답할 질문이 있을 때만 노출.
  const lastMsg = messages[messages.length - 1];
  const canRefine =
    !isStreaming &&
    !!lastMsg &&
    lastMsg.role === "assistant" &&
    !!lastMsg.content &&
    !isErrorBubble(lastMsg.content) &&
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
            className="fixed bottom-24 right-5 z-[60] flex h-[min(61rem,calc(100dvh-7rem))] w-[min(27rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
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
                <MessageCircle className="size-4" />
                <span className="text-sm font-semibold">So-Pick 도우미</span>
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
                            remarkPlugins={[remarkGfm]}
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

              {/* 빠른 질문 — 첫 인사만 있을 때 노출 */}
              {messages.length === 1 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
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
              So-Pick 도우미예요. 도와드릴게요!
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
          className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
          aria-label={open ? "챗봇 닫기" : "챗봇 열기"}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={open ? "close" : "open"}
              initial={{ opacity: 0, rotate: -45 }}
              animate={{ opacity: 1, rotate: 0 }}
              exit={{ opacity: 0, rotate: 45 }}
              transition={{ duration: 0.15 }}
            >
              {open ? (
                <X className="size-6" />
              ) : (
                <MessageCircle className="size-6" />
              )}
            </motion.span>
          </AnimatePresence>
        </button>
      </div>
    </>
  );
}
