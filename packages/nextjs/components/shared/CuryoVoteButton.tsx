import { ArrowDownIcon, ArrowUpIcon } from "@heroicons/react/24/outline";

interface CuryoVoteButtonProps {
  direction: "up" | "down";
  disabled?: boolean;
  onClick: () => void;
}

export function CuryoVoteButton({ direction, disabled = false, onClick }: CuryoVoteButtonProps) {
  const isUp = direction === "up";
  const label = isUp ? "Raise score" : "Lower score";
  const Icon = isUp ? ArrowUpIcon : ArrowDownIcon;

  return (
    <div className="tooltip tooltip-bottom" data-tip={label}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={isUp ? "Vote up and raise the score" : "Vote down and lower the score"}
        title={label}
        className={`vote-btn ${isUp ? "vote-yes" : "vote-no"}`}
      >
        <span className="vote-bg" />
        <span className="vote-symbol">
          <Icon className="h-[22px] w-[22px] stroke-[2.5] drop-shadow-sm" aria-hidden />
        </span>
      </button>
    </div>
  );
}
