interface Conversation {
  id: string;
  title: string;
  timestamp: string;
}

interface Section {
  label: string;
  items: Conversation[];
}

const sections: Section[] = [];

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  activeId: string;
  onSelect: (id: string) => void;
}

const ChatSidebar = ({ collapsed, onToggle, activeId, onSelect }: Props) => {
  return (
    <aside
      className="h-screen flex-shrink-0 flex flex-col border-r border-divider"
      style={{
        width: collapsed ? 0 : 280,
        minWidth: collapsed ? 0 : 280,
        backgroundColor: "#F5F1EA",
        overflow: "hidden",
        transition: "width 280ms cubic-bezier(0.16, 1, 0.3, 1), min-width 280ms cubic-bezier(0.16, 1, 0.3, 1)",
      }}
    >
      {/* Toggle button */}
      <div className="flex items-center justify-end px-4 pt-4 pb-1">
        <button
          onClick={onToggle}
          className="text-text-muted hover:text-text-primary transition-colors duration-150"
          aria-label="Collapse sidebar"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4L7 9L12 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </div>

      {/* New Chat button */}
      <div className="border-b" style={{ borderColor: "rgba(26,26,26,0.08)" }}>
        <button
          className="w-full text-left px-5 py-3 font-body text-[13px] font-medium text-text-primary hover:bg-page transition-colors duration-150"
        >
          New Chat
        </button>
      </div>

      {/* Chat history */}
      <nav
        className="flex-1 overflow-y-auto px-3 pt-4"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        <style>{`nav::-webkit-scrollbar { display: none; }`}</style>
        {sections.map((section) => (
          <div key={section.label} className="mb-4">
            <div className="px-2 pb-2">
              <span className="font-mono text-[11px] font-normal uppercase tracking-[0.08em] text-bronze">
                {section.label}
              </span>
            </div>
            {section.items.map((item) => {
              const isActive = activeId === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelect(item.id)}
                  className="w-full text-left px-2 py-2.5 transition-colors duration-150 group"
                  style={{
                    borderLeft: isActive ? "1.5px solid #8B7355" : "1.5px solid transparent",
                    backgroundColor: "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) e.currentTarget.style.backgroundColor = "#FAF7F2";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
                >
                  <div className="pl-1.5">
                    <p className="font-body text-[14px] font-normal text-text-primary truncate leading-snug">
                      {item.title}
                    </p>
                    <span className="font-mono text-[11px] text-text-muted mt-0.5 block">
                      {item.timestamp}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
};

export default ChatSidebar;
