import { useState, useRef, useEffect } from "react";

interface Message {
  id: string;
  sender: "user" | "other";
  text: string;
  time: string;
}

const sampleMessages: Message[] = [
  { id: "1", sender: "other", text: "I've been thinking about the relationship between silence and space in film. How absence becomes the loudest presence.", time: "2:08 PM" },
  { id: "2", sender: "user", text: "That's the entire thesis of the Dreyer retrospective. Every frame is a room someone just left.", time: "2:10 PM" },
  { id: "3", sender: "other", text: "Exactly. And the clothing in those scenes — always monochrome, always structured. The fabric does the acting when the body is still.", time: "2:11 PM" },
  { id: "4", sender: "user", text: "There's a Japanese word for it — ma. The charged void. It's not emptiness, it's potential.", time: "2:12 PM" },
  { id: "5", sender: "other", text: "The quiet is never truly empty. It's where meaning collects before it takes form.", time: "2:14 PM" },
];

interface Props {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
}

const ChatMain = ({ sidebarCollapsed, onToggleSidebar }: Props) => {
  const [messages, setMessages] = useState<Message[]>(sampleMessages);
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    const now = new Date();
    const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    setMessages((prev) => [
      ...prev,
      { id: Date.now().toString(), sender: "user", text: input.trim(), time },
    ]);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex-1 flex flex-col h-screen" style={{ backgroundColor: "var(--color-page-bg)", transition: "flex 280ms cubic-bezier(0.16, 1, 0.3, 1)" }}>
      {/* Header */}
      <header className="flex items-center justify-between px-8 py-5 border-b border-divider">
        <div className="flex items-center gap-4">
          {sidebarCollapsed && (
            <button
              onClick={onToggleSidebar}
              className="font-body text-[13px] font-medium text-text-muted hover:text-text-primary transition-colors uppercase tracking-[0.08em] mr-2"
            >
              Menu
            </button>
          )}
          <h2 className="font-display text-[22px] text-text-primary leading-none">On Solitude</h2>
        </div>
        <span className="font-mono text-[12px] text-text-muted">5 messages</span>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-2xl mx-auto space-y-6">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}>
              <div
                className={`max-w-[85%] px-4 py-3 rounded-sm ${
                  msg.sender === "user"
                    ? "bg-sidebar-bg border border-divider"
                    : ""
                }`}
              >
                <p className="font-body text-[15px] text-text-primary leading-relaxed">
                  {msg.text}
                </p>
              </div>
              <span className="font-mono text-[11px] text-text-muted mt-1.5 px-1">
                {msg.time}
              </span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-divider px-8 py-4">
        <div className="max-w-2xl mx-auto flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write something…"
            rows={1}
            className="flex-1 resize-none bg-transparent font-body text-[15px] text-text-primary placeholder:text-text-muted py-2 border-b border-divider focus:border-bronze transition-colors outline-none"
            style={{ minHeight: 40, maxHeight: 120 }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim()}
            className="font-body text-[13px] font-medium uppercase tracking-[0.08em] text-bronze hover:text-text-primary disabled:text-text-muted disabled:cursor-default transition-colors pb-2"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatMain;
