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
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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

/** 파일을 data URL 문자열로 읽는다. */
function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("파일을 읽지 못했습니다."));
    reader.readAsDataURL(file);
  });
}

/** 큰 이미지를 max 한 변 기준으로 축소하고 JPEG로 재인코딩 (토큰·용량 절약). */
function downscale(dataUrl: string, maxDim: number): Promise<Attachment> {
  return new Promise((resolve) => {
    const fallback = (): Attachment => ({
      dataUrl,
      base64: dataUrl.split(",")[1] ?? "",
      mimeType: (dataUrl.match(/^data:(image\/[\w.+-]+);/)?.[1] ?? "image/png"),
    });
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return resolve(fallback());
        ctx.drawImage(img, 0, 0, w, h);
        const out = canvas.toDataURL("image/jpeg", 0.9);
        resolve({
          dataUrl: out,
          base64: out.split(",")[1] ?? "",
          mimeType: "image/jpeg",
        });
      } catch {
        resolve(fallback());
      }
    };
    img.onerror = () => resolve(fallback());
    img.src = dataUrl;
  });
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

  // 새 메시지마다 맨 아래로 스크롤.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open, attachment]);

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
    if (!file || !file.type.startsWith("image/")) return;
    try {
      const dataUrl = await readAsDataUrl(file);
      const att = await downscale(dataUrl, MAX_DIM);
      if (att.base64) setAttachment(att);
    } catch {
      // 무시 — 첨부 실패해도 텍스트 대화는 가능
    }
  }, []);

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

      abortRef.current = new AbortController();

      // 서버로 보낼 형태로 변환 (이미지는 base64 만).
      const wire = nextMessages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.image
          ? { image: { data: m.image.base64, mimeType: m.image.mimeType } }
          : {}),
      }));

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: wire, currentPage: pathname }),
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
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // 사용자가 닫음 — 무시
        } else {
          const msg =
            err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.";
          setMessages((prev) => {
            const copy = [...prev];
            copy[copy.length - 1] = { role: "assistant", content: `⚠️ ${msg}` };
            return copy;
          });
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, isStreaming, pathname]
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
    const file = Array.from(e.dataTransfer.files).find((f) =>
      f.type.startsWith("image/")
    );
    if (file) attachFile(file);
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
                <span className="flex-1 truncate text-xs text-foreground/60">
                  이미지 1장 첨부됨
                </span>
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
