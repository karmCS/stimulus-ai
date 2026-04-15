interface Props {
  items: string[];
  onClick: (text: string) => void;
}

const FollowUpChips = ({ items, onClick }: Props) => {
  if (!items?.length) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-4">
      {items.map((t) => (
        <button
          key={t}
          onClick={() => onClick(t)}
          className="font-body text-[13px] font-normal text-text-secondary px-3 py-1.5 rounded-sm transition-colors duration-150 hover:bg-page"
          style={{
            border: "1px solid rgba(26,26,26,0.10)",
            backgroundColor: "#F5F1EA",
            borderRadius: 999,
          }}
        >
          {t}
        </button>
      ))}
    </div>
  );
};

export default FollowUpChips;

