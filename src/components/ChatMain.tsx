import { useState, useRef, useEffect, useCallback } from "react";
import Composer from "@/components/Composer";

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
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const isUserScrolledUp = useRef(false);
  const prevMessageCount = useRef(messages.length);

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

  const handleSend = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), role: "user", text },
    ]);
    isUserScrolledUp.current = false;
  };

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
            className="flex-1 overflow-y-auto"
            style={{
              scrollbarWidth: "none",
              msOverflowStyle: "none",
            }}
          >
            <style>{`.thread-scroll::-webkit-scrollbar { display: none; }`}</style>
            <div
              className="mx-auto thread-scroll"
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
                    className="py-6 message-enter"
                    style={{
                      animation: "message-enter 400ms cubic-bezier(0.16, 1, 0.3, 1) both",
                    }}
                  >
                    <span className="font-mono text-[11px] text-text-muted block mb-2">
                      {msg.role === "user" ? "You" : "Assistant"}
                    </span>
                    <p className="font-body text-[15px] text-text-primary" style={{ lineHeight: 1.65 }}>
                      {msg.text}
                    </p>
                  </div>
                </div>
              ))}
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
