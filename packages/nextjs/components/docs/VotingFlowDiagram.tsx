const STEPS = [
  {
    label: "Commit",
    badge: "badge-secondary",
    duration: "1–100 cREP",
    description: "Choose UP or DOWN, stake is locked, direction is hidden (tlock)",
    icon: "🔒",
  },
  {
    label: "Reveal",
    badge: "badge-secondary",
    duration: "~20 min",
    description: "Keeper reveals votes after epoch ends via drand",
    icon: "🔓",
  },
  {
    label: "Settle",
    badge: "badge-secondary",
    duration: "~20 min delay",
    description: "Majority wins after min 3 voters + settlement delay",
    icon: "⚖️",
  },
  {
    label: "Claim",
    badge: "badge-secondary",
    duration: "",
    description: "Winners withdraw stake + rewards",
    icon: "💰",
  },
];

export function VotingFlowDiagram() {
  return (
    <div className="my-6 flex flex-col sm:flex-row items-stretch gap-0 text-base">
      {STEPS.map((step, i) => (
        <div key={step.label} className="flex items-center flex-1 min-w-0">
          <div className="flex flex-col items-center text-center flex-1 min-w-0 px-2">
            <span className={`badge ${step.badge} badge-sm mb-1.5`}>{step.label}</span>
            <span className="text-2xl mb-1">{step.icon}</span>
            <span className="text-base text-base-content/60 leading-tight">{step.description}</span>
            {step.duration && <span className="text-sm font-mono text-base-content/40 mt-1">{step.duration}</span>}
          </div>
          {i < STEPS.length - 1 && <div className="text-base-content/30 text-lg shrink-0 hidden sm:block">→</div>}
          {i < STEPS.length - 1 && (
            <div className="text-base-content/30 text-lg shrink-0 sm:hidden self-center py-1">↓</div>
          )}
        </div>
      ))}
    </div>
  );
}
