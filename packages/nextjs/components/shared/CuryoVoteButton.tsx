import { HandThumbDownIcon, HandThumbUpIcon } from "@heroicons/react/24/outline";

interface CuryoVoteButtonProps {
  direction: "up" | "down";
  disabled?: boolean;
  onClick: () => void;
  size?: "default" | "sm";
  attention?: boolean;
}

interface VoteDirectionIconProps {
  direction: "up" | "down";
  className?: string;
}

export function VoteDirectionIcon({
  direction,
  className = "h-[22px] w-[22px] drop-shadow-sm",
}: VoteDirectionIconProps) {
  const Icon = direction === "up" ? HandThumbUpIcon : HandThumbDownIcon;

  return <Icon className={className} aria-hidden />;
}

export function CuryoVoteButton({
  direction,
  disabled = false,
  onClick,
  size = "default",
  attention = false,
}: CuryoVoteButtonProps) {
  const isUp = direction === "up";
  const label = isUp ? "Raise score" : "Lower score";
  const iconClassName = size === "sm" ? "h-5 w-5 drop-shadow-sm" : "h-[22px] w-[22px] drop-shadow-sm";

  return (
    <div className="tooltip tooltip-bottom" data-tip={label}>
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-label={isUp ? "Vote up and raise the score" : "Vote down and lower the score"}
        title={label}
        className={`vote-btn ${size === "sm" ? "vote-btn-sm" : ""} ${isUp ? "vote-yes" : "vote-no"} ${
          attention ? "vote-btn-attention" : ""
        }`}
      >
        <span className="vote-bg" />
        <span className="vote-symbol">
          <VoteDirectionIcon direction={direction} className={iconClassName} />
        </span>
      </button>
    </div>
  );
}
