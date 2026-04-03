import { ArrowDownIcon, ArrowUpIcon } from "@heroicons/react/24/outline";

interface CuryoVoteButtonProps {
  direction: "up" | "down";
  disabled?: boolean;
  onClick: () => void;
}

interface VoteDirectionIconProps {
  direction: "up" | "down";
  className?: string;
}

export function VoteDirectionIcon({
  direction,
  className = "h-[22px] w-[22px] stroke-[2.5] drop-shadow-sm",
}: VoteDirectionIconProps) {
  const Icon = direction === "up" ? ArrowUpIcon : ArrowDownIcon;

  return <Icon className={className} aria-hidden />;
}

export function CuryoVoteButton({ direction, disabled = false, onClick }: CuryoVoteButtonProps) {
  const isUp = direction === "up";
  const label = isUp ? "Raise score" : "Lower score";

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
          <VoteDirectionIcon direction={direction} />
        </span>
      </button>
    </div>
  );
}
