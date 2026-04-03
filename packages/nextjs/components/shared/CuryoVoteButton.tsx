interface CuryoVoteButtonProps {
  direction: "up" | "down";
  disabled?: boolean;
  onClick: () => void;
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
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="drop-shadow-sm"
            aria-hidden
          >
            {isUp ? (
              <>
                <path d="M12 18V7" />
                <path d="M7 12L12 7L17 12" />
              </>
            ) : (
              <>
                <path d="M12 6V17" />
                <path d="M7 12L12 17L17 12" />
              </>
            )}
          </svg>
        </span>
      </button>
    </div>
  );
}
