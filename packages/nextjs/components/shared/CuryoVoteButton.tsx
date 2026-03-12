import { CuryoRingMark } from "~~/components/brand/CuryoRingMark";

interface CuryoVoteButtonProps {
  direction: "up" | "down";
  disabled?: boolean;
  onClick: () => void;
}

export function CuryoVoteButton({ direction, disabled = false, onClick }: CuryoVoteButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={direction === "up" ? "Vote up" : "Vote down"}
      className="group relative h-14 w-14 rounded-full border-0 bg-transparent p-0 transition-transform duration-200 hover:scale-[1.04] active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100"
    >
      <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle,_rgba(53,158,238,0.10),_transparent_68%)] opacity-0 blur-md transition-opacity duration-200 group-hover:opacity-100 group-disabled:opacity-0" />
      <CuryoRingMark className="h-full w-full" arrow={direction} />
    </button>
  );
}
