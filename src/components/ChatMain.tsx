import { useState, useRef, useEffect, useCallback } from "react";
import Composer from "@/components/Composer";
import MessageActions from "@/components/MessageActions";
import { ask } from "@/lib/ask";
import AnswerCard, { type Answer } from "@/components/AnswerCard";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  answer?: Answer;
}

const THINKING_DELAY_MS = 1500;

const suggestedPrompts = [
  "What is creatine?",
  "Draft an upper lower split",
  "Explain joint actions",
];

interface Props {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  activeId: string | null;
}

const ChatMain = ({ sidebarCollapsed, onToggleSidebar, activeId }: Props) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [composerValue, setComposerValue] = useState("");
  const [hasStartedChat, setHasStartedChat] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);
  const prevMessageCount = useRef(messages.length);
  const abortRef = useRef<AbortController | null>(null);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const threshold = 80;
    isUserScrolledUp.current = el.scrollHeight - el.scrollTop - el.clientHeight > threshold;
  }, []);

  useEffect(() => {
    if (messages.length > prevMessageCount.current && !isUserScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
    prevMessageCount.current = messages.length;
  }, [messages]);

  // Auto-scroll during streaming
  useEffect(() => {
    if (isThinking && !isUserScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [isThinking]);

  // Cleanup in-flight stream on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const streamAnswer = useCallback(async (question: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsThinking(true);

    try {
      let finalText = "";
      let finalAnswerObj: Answer | null = null;

      await ask(question, {
        signal: controller.signal,
        onEvent: (evt) => {
          if (evt.type === "stage") return;
          if (evt.type === "error") {
            finalText = `Server error: ${evt.message}`;
            return;
          }
          if (evt.type === "final") {
            const payload = evt.data;
            if (payload && typeof payload === "object") {
              finalAnswerObj = payload as Answer;
              finalText = (payload as any)?.oneLineVerdict ?? "";
            }
          }
        },
      });

      setIsThinking(false);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          text: finalText || "Sorry — something went wrong. Please try again.",
          answer: finalAnswerObj ?? undefined,
        },
      ]);
    } catch (err) {
      if ((err as any)?.name === "AbortError") return;
      console.error("ask() failed", err);
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : "Unknown error";
      setIsThinking(false);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          text: `Couldn't reach the server: ${msg}`,
        },
      ]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const handleSend = (text: string) => {
    setHasStartedChat(true);
    if (isThinking) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: "user", text },
    ]);
    isUserScrolledUp.current = false;

    // Start thinking phase
    setIsThinking(true);
    setTimeout(() => {
      streamAnswer(text);
    }, THINKING_DELAY_MS);
  };

  const handleRegenerate = useCallback((messageId: string) => {
    if (isThinking) return;
    // Remove the assistant message to regenerate
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    isUserScrolledUp.current = false;
    setIsThinking(true);
    setTimeout(() => {
      const lastUser = [...messages].reverse().find((m) => m.role === "user")?.text;
      if (lastUser) streamAnswer(lastUser);
    }, THINKING_DELAY_MS);
  }, [isThinking, messages, streamAnswer]);

  const handleChipClick = (text: string) => {
    setComposerValue(text);
  };

  const showEmptyState = !hasStartedChat;

  return (
    <div className="flex-1 flex flex-col h-screen" style={{ backgroundColor: "var(--color-page-bg)", transition: "flex 280ms cubic-bezier(0.16, 1, 0.3, 1)" }}>
      {showEmptyState ? (
        <>
          {sidebarCollapsed && (
            <header className="flex items-center px-8 py-5">
              <button
                onClick={onToggleSidebar}
                className="font-body text-[13px] font-medium text-text-muted hover:text-text-primary transition-colors uppercase tracking-[0.08em]"
              >
                Menu
              </button>
            </header>
          )}

          <div className="flex-1 flex items-center justify-center" style={{ padding: "0 10vw" }}>
            <div className="w-full" style={{ maxWidth: 720 }}>
              <h1 className="font-display text-[44px] font-normal text-text-primary leading-tight">
                What's on your mind.
              </h1>
              <div className="flex flex-wrap gap-3 mt-6">
                {suggestedPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    onClick={() => handleChipClick(prompt)}
                    className="font-body text-[13px] font-normal text-text-secondary px-4 py-2 rounded-sm transition-colors duration-150 hover:bg-page"
                    style={{
                      border: "1px solid rgba(26,26,26,0.08)",
                      backgroundColor: "#F5F1EA",
                      borderRadius: 4,
                    }}
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Composer
            onSend={handleSend}
            initialValue={composerValue}
            onValueChange={setComposerValue}
            isThinking={isThinking}
          />
        </>
      ) : (
        <>
          {sidebarCollapsed && (
            <header className="flex items-center px-8 py-5">
              <button
                onClick={onToggleSidebar}
                className="font-body text-[13px] font-medium text-text-muted hover:text-text-primary transition-colors uppercase tracking-[0.08em]"
              >
                Menu
              </button>
            </header>
          )}

          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto thread-scroll"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            <style>{`.thread-scroll::-webkit-scrollbar { display: none; }`}</style>
            <div
              className="mx-auto"
              style={{ maxWidth: 720, paddingTop: 48, paddingBottom: 120 }}
            >
              {messages.map((msg, index) => (
                <div
                  key={msg.id}
                  className="relative"
                  style={{
                    paddingTop: 56,
                    paddingBottom: 56,
                    borderBottom: "0.5px solid rgba(0,0,0,0.12)",
                  }}
                >
                  <div
                    className="relative"
                    style={{
                      animation: "message-enter 400ms cubic-bezier(0.16, 1, 0.3, 1) both",
                    }}
                  >
                    {msg.role === "assistant" && (
                      <MessageActions
                        text={msg.text}
                        onRegenerate={() => handleRegenerate(msg.id)}
                      />
                    )}
                    <div className="flex items-center gap-3 mb-3">
                      <span
                        className="block whitespace-nowrap font-mono"
                        style={{
                          fontSize: 9.5,
                          letterSpacing: "0.22em",
                          color: "#9a9188",
                          textTransform: "lowercase",
                        }}
                      >
                        {msg.role === "user" ? "You" : "Assistant"}
                      </span>
                      <span
                        className="block flex-1"
                        style={{ height: 0.5, backgroundColor: "rgba(0,0,0,0.12)" }}
                        aria-hidden="true"
                      />
                    </div>
                    {msg.role === "assistant" && msg.answer ? (
                      <AnswerCard
                        answer={msg.answer}
                        onFollowUpClick={(text) => handleChipClick(text)}
                      />
                    ) : (
                      <p
                        className={msg.role === "user" ? "font-display" : "font-body"}
                        style={{
                          fontSize: msg.role === "user" ? 22 : 18,
                          lineHeight: msg.role === "user" ? 1.45 : 1.75,
                          color: msg.role === "user" ? "#1a1814" : "#2d2b27",
                          fontWeight: msg.role === "user" ? 400 : 400,
                          whiteSpace: "pre-wrap",
                        }}
                      >
                        {msg.text}
                      </p>
                    )}
                  </div>
                </div>
              ))}

              {/* Thinking / Streaming turn */}
              {isThinking && (
                <>
                  <div
                    className="relative"
                    style={{
                      paddingTop: 56,
                      paddingBottom: 56,
                      borderBottom: "0.5px solid rgba(0,0,0,0.12)",
                    }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <span
                        className="block whitespace-nowrap font-mono"
                        style={{
                          fontSize: 9.5,
                          letterSpacing: "0.22em",
                          color: "#9a9188",
                          textTransform: "lowercase",
                        }}
                      >
                        Assistant
                      </span>
                      <span
                        className="block flex-1"
                        style={{ height: 0.5, backgroundColor: "rgba(0,0,0,0.12)" }}
                        aria-hidden="true"
                      />
                    </div>

                    <span
                      className="font-body"
                      style={{
                        fontSize: 18,
                        lineHeight: 1.75,
                        color: "#2d2b27",
                        animation: "shimmer 1.4s linear infinite",
                      }}
                    >
                      Thinking
                    </span>
                  </div>
                </>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          <Composer onSend={handleSend} isThinking={isThinking} isStreaming={false} />
        </>
      )}
    </div>
  );
};

export default ChatMain;
