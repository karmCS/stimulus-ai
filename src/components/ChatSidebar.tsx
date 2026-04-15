import { useState } from "react";

interface Conversation {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  unread?: boolean;
}

const conversations: Conversation[] = [
  { id: "1", title: "On Solitude", lastMessage: "The quiet is never truly empty…", timestamp: "2:14 PM", unread: true },
  { id: "2", title: "Material Study", lastMessage: "Linen over silk, always.", timestamp: "Yesterday" },
  { id: "3", title: "Screenplay Notes", lastMessage: "Act II needs restraint.", timestamp: "Mar 12" },
  { id: "4", title: "Exhibition Brief", lastMessage: "White walls. Nothing else.", timestamp: "Mar 10" },
  { id: "5", title: "Travel — Kyoto", lastMessage: "The temple at dawn.", timestamp: "Mar 8" },
];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  activeId: string;
  onSelect: (id: string) => void;
}

const ChatSidebar = ({ collapsed, onToggle, activeId, onSelect }: Props) => {
  return (
    <aside
      className="h-screen flex-shrink-0 flex flex-col transition-all duration-300 ease-in-out border-r border-divider"
      style={{
        width: collapsed ? 0 : 280,
        minWidth: collapsed ? 0 : 280,
        backgroundColor: "var(--color-sidebar-bg)",
        overflow: "hidden",
      }}
    >
      <div className="px-6 pt-8 pb-4 flex items-center justify-between">
        <h1 className="font-display text-[28px] text-text-primary tracking-tight leading-none">
          Dialogue
        </h1>
        <button
          onClick={onToggle}
          className="text-text-muted hover:text-text-primary transition-colors font-body text-[13px] font-medium uppercase tracking-[0.08em]"
        >
          Close
        </button>
      </div>

      <div className="px-6 pb-4">
        <div className="border-b border-divider" />
      </div>

      <nav className="flex-1 overflow-y-auto px-3">
        {conversations.map((conv) => (
          <button
            key={conv.id}
            onClick={() => onSelect(conv.id)}
            className={`w-full text-left px-3 py-3 rounded-sm transition-colors duration-150 group ${
              activeId === conv.id ? "bg-divider" : "hover:bg-divider"
            }`}
          >
            <div className="flex items-baseline justify-between mb-1">
              <span className="font-body text-[14px] font-medium text-text-primary truncate pr-2">
                {conv.title}
              </span>
              <span className="font-mono text-[11px] text-text-muted whitespace-nowrap">
                {conv.timestamp}
              </span>
            </div>
            <p className="font-body text-[13px] text-text-muted truncate leading-snug">
              {conv.lastMessage}
            </p>
            {conv.unread && (
              <div className="w-1.5 h-1.5 rounded-full bg-bronze mt-1.5" />
            )}
          </button>
        ))}
      </nav>

      <div className="px-6 py-5">
        <button className="w-full py-2.5 border border-divider rounded-sm font-body text-[13px] font-medium text-text-secondary hover:text-text-primary hover:border-text-muted transition-colors tracking-[0.02em]">
          New Conversation
        </button>
      </div>
    </aside>
  );
};

export default ChatSidebar;
