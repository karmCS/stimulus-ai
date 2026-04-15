import { useState, useRef, useEffect, useCallback } from "react";
import Composer from "@/components/Composer";
import MessageActions from "@/components/MessageActions";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}

const threadMessages: Message[] = [
  { id: "1", role: "user", text: "Can you explain the difference between a compiler and an interpreter?" },
  { id: "2", role: "assistant", text: "A compiler translates an entire program into machine code before execution begins. The output is a standalone binary that runs directly on the hardware. An interpreter, by contrast, reads and executes code line by line at runtime, translating each statement on the fly. Compiled languages tend to run faster because the translation step happens once, ahead of time. Interpreted languages offer more flexibility — you can modify and re-run code without a separate build step, which makes them well-suited to scripting, prototyping, and interactive development." },
  { id: "3", role: "user", text: "What about JIT compilation? Where does that fit?" },
  { id: "4", role: "assistant", text: "Just-in-time compilation sits between the two. The program starts in an interpreted or bytecode form, and the runtime selectively compiles hot paths — the sections of code executed most frequently — into native machine code while the program is running. The Java Virtual Machine and modern JavaScript engines like V8 both use JIT compilation. The advantage is that the compiler can make optimisations based on actual runtime behaviour, such as inlining functions that are called repeatedly or de-optimising code paths that turn out to be rarely used. This gives you much of the performance benefit of ahead-of-time compilation while preserving the portability and developer experience of an interpreted language. The tradeoff is startup latency: the JIT compiler needs time to observe patterns before it can begin optimising, which is why JIT-compiled programs sometimes feel slower during their first few seconds of execution compared to a fully compiled binary. Over longer-running processes, however, the JIT can actually outperform static compilation because it has access to information that a static compiler cannot know — things like the actual data types flowing through a function, branch prediction statistics, and memory access patterns specific to the current workload. Modern JIT compilers also employ tiered compilation strategies, where code begins in a fast interpreter, graduates to a baseline compiler, and only reaches the optimising compiler if it proves to be genuinely performance-critical. This approach minimises the overhead of compilation while still capturing the most impactful optimisations where they matter most." },
  { id: "5", role: "user", text: "So is TypeScript compiled or interpreted?" },
  { id: "6", role: "assistant", text: "TypeScript is transpiled — its compiler converts TypeScript source code into JavaScript, which is then interpreted or JIT-compiled by a JavaScript engine. The TypeScript compiler itself performs type checking and removes type annotations, but it doesn't produce machine code. The resulting JavaScript runs in whatever environment you target: a browser's V8 engine, Node.js, Deno, or Bun." },
  { id: "7", role: "user", text: "That makes sense. What's the practical takeaway for choosing a language?" },
  { id: "8", role: "assistant", text: "Choose based on the constraints of the problem. Systems programming — operating systems, game engines, embedded devices — benefits from compiled languages like C, C++, or Rust where you need predictable performance and fine-grained memory control. Application development, scripting, and web work favours interpreted or JIT-compiled languages like Python, JavaScript, or Ruby where developer velocity and ecosystem matter more than raw throughput. Many modern projects use both: a compiled core for performance-sensitive work and a scripting layer for configuration, orchestration, and rapid iteration." },
  { id: "9", role: "user", text: "Can you give me an example of that hybrid approach?" },
  { id: "10", role: "assistant", text: "A common example is a game engine. The engine itself — the renderer, physics simulation, audio system — is written in C++ for maximum performance. But game designers and level scripters interact with it through a higher-level language like Lua, C#, or a visual scripting system. Unity uses C# as its scripting layer on top of a C++ runtime. Unreal Engine exposes Blueprints alongside C++. This separation lets engineers optimise the critical path while giving creative teams a fast feedback loop without recompiling the entire engine." },
];

const MOCK_RESPONSE = "That's a great question. The key insight is that no single paradigm wins everywhere. The best engineers choose tools based on constraints — performance budgets, team expertise, deployment targets, and iteration speed. A startup building a web app will almost always reach for JavaScript or Python first, because time-to-market matters more than microsecond-level performance. A firmware team writing code for a pacemaker will use C or Ada, because correctness and predictability are non-negotiable. The language is a means to an end, not the end itself.";

const CHARS_PER_SECOND = 30;
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
  const [messages, setMessages] = useState<Message[]>(threadMessages);
  const [composerValue, setComposerValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamComplete, setStreamComplete] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);
  const prevMessageCount = useRef(messages.length);
  const streamIntervalRef = useRef<number | null>(null);

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

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
    };
  }, []);

  const startStream = useCallback(() => {
    setIsThinking(false);
    setIsStreaming(true);
    setStreamingText("");

    let index = 0;
    const interval = 1000 / CHARS_PER_SECOND;

    streamIntervalRef.current = window.setInterval(() => {
      index++;
      if (index >= MOCK_RESPONSE.length) {
        setStreamingText(MOCK_RESPONSE);
        if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
        // Mark stream complete, then commit to messages
        setStreamComplete(true);
        setTimeout(() => {
          setIsStreaming(false);
          setStreamComplete(false);
          setStreamingText("");
          setMessages((prev) => [
            ...prev,
            { id: Date.now().toString(), role: "assistant", text: MOCK_RESPONSE },
          ]);
        }, 400);
      } else {
        setStreamingText(MOCK_RESPONSE.slice(0, index));
      }
    }, interval);
  }, []);

  const handleSend = (text: string) => {
    if (isThinking || isStreaming) return;
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: "user", text },
    ]);
    isUserScrolledUp.current = false;

    // Start thinking phase
    setIsThinking(true);
    setTimeout(() => {
      startStream();
    }, THINKING_DELAY_MS);
  };

  const handleRegenerate = useCallback((messageId: string) => {
    if (isThinking || isStreaming) return;
    // Remove the assistant message to regenerate
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    isUserScrolledUp.current = false;
    setIsThinking(true);
    setTimeout(() => {
      startStream();
    }, THINKING_DELAY_MS);
  }, [isThinking, isStreaming, startStream]);

  const handleChipClick = (text: string) => {
    setComposerValue(text);
  };

  const showEmptyState = !activeId;

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
                <div key={msg.id}>
                  {index > 0 && (
                    <div
                      className="w-full my-0"
                      style={{ height: 1, backgroundColor: "rgba(26,26,26,0.08)" }}
                    />
                  )}
                  <div
                    className="py-6 relative"
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
                    <span className="font-mono text-[11px] text-text-muted block mb-2">
                      {msg.role === "user" ? "You" : "Assistant"}
                    </span>
                    <p className="font-body text-[15px] text-text-primary" style={{ lineHeight: 1.65 }}>
                      {msg.text}
                    </p>
                  </div>
                </div>
              ))}

              {/* Thinking / Streaming turn */}
              {(isThinking || isStreaming) && (
                <>
                  <div
                    className="w-full my-0"
                    style={{ height: 1, backgroundColor: "rgba(26,26,26,0.08)" }}
                  />
                  <div className="py-6">
                    <span className="font-mono text-[11px] text-text-muted block mb-2">
                      Assistant
                    </span>

                    {isThinking && !isStreaming && (
                      <span
                        className="font-body text-[13px]"
                        style={{
                          color: "#7A7065",
                          animation: "shimmer 1.4s linear infinite",
                        }}
                      >
                        Thinking
                      </span>
                    )}

                    {isStreaming && (
                      <p
                        className="font-body text-[15px] text-text-primary"
                        style={{
                          lineHeight: 1.65,
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
                              backgroundColor: "#0E0E0E",
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
