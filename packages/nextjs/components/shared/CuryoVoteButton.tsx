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
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={isUp ? "Vote up and raise the score" : "Vote down and lower the score"}
      className={`inline-flex min-w-[8.75rem] items-center justify-center gap-2 rounded-full border px-4 py-3 text-sm font-semibold text-[var(--curyo-warm-white)] transition-all duration-200 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgb(242_100_38_/_.42)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--curyo-surface-elevated)] disabled:cursor-not-allowed disabled:opacity-40 ${
        isUp
          ? "border-transparent bg-[var(--curyo-ember)] shadow-[0_8px_22px_rgb(242_100_38_/_0.32)] hover:-translate-y-0.5 hover:shadow-[0_10px_24px_rgb(242_100_38_/_0.4)]"
          : "border-[color:rgb(179_52_27_/_0.55)] bg-[color:rgb(179_52_27_/_0.2)] shadow-[0_8px_22px_rgb(179_52_27_/_0.2)] hover:-translate-y-0.5 hover:bg-[color:rgb(179_52_27_/_0.26)] hover:shadow-[0_10px_24px_rgb(179_52_27_/_0.28)]"
      }`}
    >
      <span
        aria-hidden
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUp ? "bg-[color:rgb(245_240_235_/_0.16)]" : "bg-[color:rgb(9_10_12_/_0.18)]"
        }`}
      >
        <Icon className="h-[18px] w-[18px] stroke-[2.25]" />
      </span>
      <span>{label}</span>
    </button>
  );
}
