import { useState, useRef, useEffect, useCallback } from "react";
import { ArrowUp } from "lucide-react";

interface ComposerProps {
  onSend: (text: string) => void;
  initialValue?: string;
  onValueChange?: (value: string) => void;
  error?: boolean;
  onRetry?: () => void;
}

const LINE_HEIGHT = 22;
const MIN_ROWS = 1;
const MAX_ROWS = 6;

const Composer = ({ onSend, initialValue, onValueChange, error, onRetry }: ComposerProps) => {
  const [value, setValue] = useState(initialValue ?? "");
  const [sending, setSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync external initialValue changes (e.g. chip clicks)
  useEffect(() => {
    if (initialValue !== undefined) {
      setValue(initialValue);
    }
  }, [initialValue]);

  // Auto-resize textarea
  const resize = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const maxHeight = LINE_HEIGHT * MAX_ROWS + 16; // 16 for py
    ta.style.height = Math.min(ta.scrollHeight, maxHeight) + "px";
  }, []);

  useEffect(() => {
    resize();
  }, [value, resize]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    onValueChange?.(e.target.value);
  };

  const handleSend = () => {
    if (!value.trim() || sending) return;
    onSend(value.trim());
    setValue("");
    onValueChange?.("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const hasContent = value.trim().length > 0;

  return (
    <div
      className="px-8 py-4"
      style={{
        backgroundColor: "#FAF7F2",
        borderTop: `1px solid ${error ? "#8B3A3A" : "rgba(26,26,26,0.08)"}`,
        transition: "border-color 150ms ease",
      }}
    >
      <div className="mx-auto flex items-end gap-3" style={{ maxWidth: 720 }}>
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          disabled={sending}
          placeholder="Send a message"
          rows={MIN_ROWS}
          className="flex-1 resize-none bg-transparent font-body text-[15px] text-text-primary placeholder:text-text-muted py-2 outline-none border-none"
          style={{
            minHeight: LINE_HEIGHT + 16,
            maxHeight: LINE_HEIGHT * MAX_ROWS + 16,
            lineHeight: `${LINE_HEIGHT}px`,
          }}
        />
        <div
          className="pb-2 flex items-center"
          style={{
            opacity: hasContent ? 1 : 0,
            transition: "opacity 150ms ease",
            pointerEvents: hasContent ? "auto" : "none",
          }}
        >
          <button
            onClick={handleSend}
            disabled={!hasContent || sending}
            className="text-text-primary hover:text-bronze transition-colors duration-150 disabled:text-text-muted"
            aria-label="Send message"
          >
            <ArrowUp size={18} strokeWidth={1.25} />
          </button>
        </div>
      </div>
      {error && (
        <div className="mx-auto mt-1" style={{ maxWidth: 720 }}>
          <button
            onClick={onRetry}
            className="font-mono text-[11px] hover:underline"
            style={{ color: "#8B3A3A" }}
          >
            Failed to send. Retry
          </button>
        </div>
      )}
    </div>
  );
};

export default Composer;
