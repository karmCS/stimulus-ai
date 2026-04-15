import FollowUpChips from "@/components/FollowUpChips";

export type Answer = {
  verdictLabel: string;
  oneLineVerdict: string;
  simpleExplanation: string;
  whatMattersMore: string[];
  whoShouldCare: string;
  bottomLine: string;
  followUps: string[];
};

interface Props {
  answer: Answer;
  onFollowUpClick: (text: string) => void;
}

const AnswerCard = ({ answer, onFollowUpClick }: Props) => {
  return (
    <div className="font-body text-text-primary" style={{ whiteSpace: "pre-wrap" }}>
      <div className="mb-4">
        <span
          className="font-mono text-[11px] uppercase tracking-[0.10em]"
          style={{ color: "#8B7355" }}
        >
          {answer.verdictLabel}
        </span>
        <div className="mt-2 font-display" style={{ fontSize: 22, lineHeight: 1.45 }}>
          {answer.oneLineVerdict}
        </div>
      </div>

      <div className="text-text-secondary" style={{ fontSize: 16, lineHeight: 1.7 }}>
        {answer.simpleExplanation}
      </div>

      <div className="mt-5">
        <div className="font-mono text-[11px] uppercase tracking-[0.10em]" style={{ color: "#8B7355" }}>
          What matters more
        </div>
        <ol className="mt-2 list-decimal pl-5" style={{ color: "#2d2b27", fontSize: 16, lineHeight: 1.7 }}>
          {(answer.whatMattersMore ?? []).map((x) => (
            <li key={x}>{x}</li>
          ))}
        </ol>
      </div>

      <div className="mt-5">
        <div className="font-mono text-[11px] uppercase tracking-[0.10em]" style={{ color: "#8B7355" }}>
          Who should care
        </div>
        <div className="mt-2" style={{ fontSize: 16, lineHeight: 1.7, color: "#2d2b27" }}>
          {answer.whoShouldCare}
        </div>
      </div>

      <div className="mt-5">
        <div className="font-mono text-[11px] uppercase tracking-[0.10em]" style={{ color: "#8B7355" }}>
          Bottom line
        </div>
        <div className="mt-2" style={{ fontSize: 16, lineHeight: 1.7, color: "#2d2b27" }}>
          {answer.bottomLine}
        </div>
      </div>

      <FollowUpChips items={answer.followUps ?? []} onClick={onFollowUpClick} />
    </div>
  );
};

export default AnswerCard;

