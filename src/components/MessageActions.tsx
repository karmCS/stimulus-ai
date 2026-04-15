import { useState, useRef, useCallback } from "react";
import { Copy, RefreshCw } from "lucide-react";

interface Props {
  text: string;
  onRegenerate: () => void;
}

const MessageActions = ({ text, onRegenerate }: Props) => {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);
  const copiedTimerRef = useRef<number | null>(null);

  const handleMouseEnter = useCallback(() => {
    hoverTimerRef.current = window.setTimeout(() => {
      setVisible(true);
    }, 120);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setVisible(false);
  }, []);

  const handleCopy = useCallback(async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = window.setTimeout(() => {
      setCopied(false);
    }, 1500);
  }, [text]);

  return (
    <div
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Action buttons — absolutely positioned, no reflow */}
      <div
        className="absolute top-0 right-0 flex items-center gap-2"
        style={{
          opacity: visible ? 1 : 0,
          transition: "opacity 150ms ease",
          pointerEvents: visible ? "auto" : "none",
        }}
      >
        {copied && (
          <span
            className="font-mono text-[11px]"
            style={{
              color: "#8B7355",
              animation: "message-enter 150ms ease both",
            }}
          >
            Copied
          </span>
        )}
        <button
          onClick={handleCopy}
          className="transition-colors duration-100"
          style={{ color: "#7A7065" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#0E0E0E"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#7A7065"; }}
          aria-label="Copy message"
        >
          <Copy size={16} strokeWidth={1.25} />
        </button>
        <button
          onClick={onRegenerate}
          className="transition-colors duration-100"
          style={{ color: "#7A7065" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#0E0E0E"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#7A7065"; }}
          aria-label="Regenerate response"
        >
          <RefreshCw size={16} strokeWidth={1.25} />
        </button>
      </div>
    </div>
  );
};

export default MessageActions;
