import { InformationCircleIcon } from "@heroicons/react/24/outline";

interface InfoTooltipProps {
  text: string;
  position?: "top" | "bottom" | "left" | "right";
  className?: string;
}

/**
 * Reusable info icon with tooltip on hover.
 * Uses DaisyUI tooltip component.
 */
export const InfoTooltip = ({ text, position = "top", className = "" }: InfoTooltipProps) => {
  const positionClass = {
    top: "tooltip-top",
    bottom: "tooltip-bottom",
    left: "tooltip-left",
    right: "tooltip-right",
  }[position];

  return (
    <span
      className={`tooltip ${positionClass} ${className}`}
      data-tip={text}
      tabIndex={0}
      role="note"
      aria-label={text}
    >
      <InformationCircleIcon className="w-4 h-4 text-base-content/40 hover:text-base-content/60 cursor-help" />
    </span>
  );
};
