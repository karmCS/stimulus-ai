import { useState, useRef, useEffect, useCallback } from "react";
import Composer from "@/components/Composer";
import MessageActions from "@/components/MessageActions";
import { ask } from "@/lib/ask";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const THINKING_DELAY_MS = 1500;

const suggestedPrompts = [
  "Summarise a document",
  "Draft an email",
  "Explain a concept",
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
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamComplete, setStreamComplete] = useState(false);
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
    if ((isStreaming || isThinking) && !isUserScrolledUp.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [streamingText, isThinking, isStreaming]);

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
    setIsStreaming(false);
    setStreamComplete(false);
    setStreamingText("");

    try {
      const stream = ask(question, { signal: controller.signal });
      const reader = stream.getReader();
      const decoder = new TextDecoder();

      let fullText = "";
      let started = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;

        if (!started) {
          started = true;
          setIsThinking(false);
          setIsStreaming(true);
        }

        const chunkText = decoder.decode(value, { stream: true });
        if (!chunkText) continue;

        fullText += chunkText;

        // Update UI character-by-character as chunks arrive
        for (const ch of chunkText) {
          setStreamingText((prev) => prev + ch);
        }
      }

      setStreamComplete(true);
      setTimeout(() => {
        setIsStreaming(false);
        setStreamComplete(false);
        setStreamingText("");
        setMessages((prev) => [
          ...prev,
          { id: Date.now().toString(), role: "assistant", text: fullText },
        ]);
      }, 400);
    } catch (err) {
      if ((err as any)?.name === "AbortError") return;
      setIsThinking(false);
      setIsStreaming(false);
      setStreamComplete(false);
      setStreamingText("");
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          role: "assistant",
          text: "Sorry — I couldn't reach the server right now. Please try again.",
        },
      ]);
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const handleSend = (text: string) => {
    setHasStartedChat(true);
    if (isThinking || isStreaming) return;
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
    if (isThinking || isStreaming) return;
    // Remove the assistant message to regenerate
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    isUserScrolledUp.current = false;
    setIsThinking(true);
    setTimeout(() => {
      const lastUser = [...messages].reverse().find((m) => m.role === "user")?.text;
      if (lastUser) streamAnswer(lastUser);
    }, THINKING_DELAY_MS);
  }, [isThinking, isStreaming, messages, streamAnswer]);

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
                    <p
                      className={msg.role === "user" ? "font-display" : "font-body"}
                      style={{
                        fontSize: msg.role === "user" ? 22 : 18,
                        lineHeight: msg.role === "user" ? 1.45 : 1.75,
                        color: msg.role === "user" ? "#1a1814" : "#2d2b27",
                        fontWeight: msg.role === "user" ? 400 : 400,
                      }}
                    >
                      {msg.text}
                    </p>
                  </div>
                </div>
              ))}

              {/* Thinking / Streaming turn */}
              {(isThinking || isStreaming) && (
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

                    {isThinking && !isStreaming && (
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
                    )}

                    {isStreaming && (
                      <p
                        className="font-body"
                        style={{
                          fontSize: 18,
                          lineHeight: 1.75,
                          color: "#2d2b27",
                          opacity: streamComplete ? 1 : undefined,
                          animation: streamComplete
                            ? "message-enter 400ms cubic-bezier(0.16, 1, 0.3, 1) both"
                            : undefined,
                        }}
                      >
                        {streamingText}
                        {!streamComplete && (
                          <span
                            className="inline-block align-baseline ml-px"
                            style={{
                              width: 1,
                              height: "1em",
                              backgroundColor: "#1a1814",
                              animation: "blink-cursor 500ms step-end infinite",
                            }}
                          />
                        )}
                      </p>
                    )}
                  </div>
                </>
              )}

              <div ref={bottomRef} />
            </div>
          </div>

          <Composer onSend={handleSend} />
        </>
      )}
    </div>
  );
};

export default ChatMain;
