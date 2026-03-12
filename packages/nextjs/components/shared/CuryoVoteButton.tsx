import { CuryoRingMark } from "~~/components/brand/CuryoRingMark";

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
      className="group relative h-16 w-16 rounded-full border-0 bg-transparent p-0 transition-transform duration-200 hover:scale-[1.05] active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100"
    >
      <span
        className={`absolute inset-0 rounded-full opacity-0 blur-md transition-opacity duration-200 group-hover:opacity-100 ${
          isUp
            ? "bg-[radial-gradient(circle,_rgba(3,206,164,0.22),_transparent_68%)]"
            : "bg-[radial-gradient(circle,_rgba(239,71,111,0.24),_transparent_68%)]"
        }`}
      />
      <CuryoRingMark className="h-full w-full" arrow={direction} palette={isUp ? "positive" : "negative"} />
    </button>
  );
}
