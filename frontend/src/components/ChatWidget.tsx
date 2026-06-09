"use client";

// 고객 지원 / FAQ 챗봇 — 화면 우측 하단 플로팅 위젯.
// 전역 레이아웃(layout.tsx)에 마운트되어 앱 전체에서 항상 떠 있다.
// 두뇌: /api/chat (Gemini + 지식 베이스). 새 의존성 없이 기존 스택만 사용.

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "안녕하세요! 블로그픽 도우미예요. 😊\n사용 방법, 발행 오류, 데이터 백업 등 궁금한 점을 물어보세요.",
};

// 빠른 질문 칩 — 첫 진입 시 사용자가 클릭만으로 시작할 수 있게.
const QUICK_QUESTIONS = [
  "글은 어떻게 발행하나요?",
  "API 키는 어디서 등록하나요?",
  "편집기가 흰 화면이 됐어요",
  "다른 PC로 데이터를 옮기고 싶어요",
];

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const pathname = usePathname();
  const router = useRouter();

  // 새 메시지마다 맨 아래로 스크롤.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, open]);

  // 열릴 때 입력창 포커스.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isStreaming) return;

      const nextMessages: ChatMessage[] = [
        ...messages,
        { role: "user", content: trimmed },
      ];
      // user 메시지 + 빈 assistant 자리(스트리밍으로 채움)를 한 번에 반영.
      setMessages([...nextMessages, { role: "assistant", content: "" }]);
      setInput("");
      setIsStreaming(true);

      abortRef.current = new AbortController();

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: nextMessages, currentPage: pathname }),
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
          // 마지막(assistant) 메시지를 누적 텍스트로 갱신.
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
            copy[copy.length - 1] = {
              role: "assistant",
              content: `⚠️ ${msg}`,
            };
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
  // 외부 링크(http...)는 기본 동작(새 탭/브라우저).
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
    send(input);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <>
      {/* 채팅 패널 */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="fixed bottom-24 right-5 z-[60] flex h-[min(32rem,calc(100dvh-7rem))] w-[min(24rem,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-2xl"
            role="dialog"
            aria-label="고객 지원 챗봇"
          >
            {/* 헤더 */}
            <div className="flex items-center justify-between border-b border-border bg-primary px-4 py-3 text-primary-foreground">
              <div className="flex items-center gap-2">
                <MessageCircle className="size-4" />
                <span className="text-sm font-semibold">블로그픽 도우미</span>
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
                      onClick={() => send(q)}
                      className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground/80 transition-colors hover:bg-muted"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 입력 영역 */}
            <form
              onSubmit={onSubmit}
              className="flex items-end gap-2 border-t border-border p-3"
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="궁금한 점을 입력하세요…"
                className="max-h-28 min-h-9 flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none placeholder:text-foreground/40 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || isStreaming}
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

      {/* 플로팅 토글 버튼 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-5 right-5 z-[60] flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95"
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
    </>
  );
}
