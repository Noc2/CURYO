interface CuryoVoteButtonProps {
  direction: "up" | "down";
  disabled?: boolean;
  onClick: () => void;
}

export function CuryoVoteButton({ direction, disabled = false, onClick }: CuryoVoteButtonProps) {
  const isUp = direction === "up";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "up" ? "Vote up" : "Vote down"}
      className={`vote-btn ${isUp ? "vote-yes" : "vote-no"}`}
    >
      <span className="vote-bg" />
      <span className="vote-symbol">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="drop-shadow-sm"
        >
          <path d={isUp ? "M12 6 L6 18 L18 18 Z" : "M12 18 L6 6 L18 6 Z"} />
        </svg>
      </span>
    </button>
  );
}
