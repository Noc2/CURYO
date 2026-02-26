"use client";

const PHASES = [
  {
    label: "Commit",
    duration: "15 min epoch",
    icon: "🔒",
    steps: [
      "Choose UP or DOWN",
      "Generate random salt",
      "Compute commit hash",
      "Encrypt vote with tlock",
      "Store on-chain",
    ],
  },
  {
    label: "Reveal",
    duration: "15 min window",
    icon: "🔓",
    steps: ["drand round published", "Keeper decrypts votes", "Hash verified on-chain", "Pools updated (UP/DOWN)"],
  },
  {
    label: "Settle",
    duration: "< 30 sec",
    icon: "⚖️",
    steps: ["Majority side wins", "Rewards distributed", "Rating updated", "Winners can claim"],
  },
];

export function CommitRevealDiagram() {
  return (
    <div className="my-6 flex flex-col sm:flex-row items-stretch gap-0 text-base">
      {PHASES.map((phase, i) => (
        <div key={phase.label} className="flex items-center flex-1 min-w-0">
          <div className="flex flex-col items-center text-center flex-1 min-w-0 px-3 py-2">
            <span className="badge badge-secondary badge-sm mb-1.5">{phase.label}</span>
            <span className="text-2xl mb-1">{phase.icon}</span>
            <span className="text-sm font-mono text-base-content/40 mb-2">{phase.duration}</span>
            <ul className="text-sm text-base-content/60 leading-relaxed space-y-0.5 text-left list-none p-0 m-0">
              {phase.steps.map(step => (
                <li key={step} className="before:content-['›'] before:mr-1.5 before:text-base-content/30">
                  {step}
                </li>
              ))}
            </ul>
          </div>
          {i < PHASES.length - 1 && <div className="text-base-content/30 text-lg shrink-0 hidden sm:block">→</div>}
          {i < PHASES.length - 1 && (
            <div className="text-base-content/30 text-lg shrink-0 sm:hidden self-center py-1">↓</div>
          )}
        </div>
      ))}
    </div>
  );
}
