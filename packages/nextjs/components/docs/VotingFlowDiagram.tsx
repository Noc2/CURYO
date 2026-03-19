import { BanknotesIcon, LockClosedIcon, LockOpenIcon, ScaleIcon } from "@heroicons/react/24/outline";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";

const STEPS = [
  {
    label: "Vote",
    duration: "1–100 cREP",
    description: "Choose UP or DOWN, stake is locked, direction is encrypted",
    Icon: LockClosedIcon,
  },
  {
    label: "Reveal",
    duration: protocolDocFacts.blindPhaseDurationLabel,
    description: "Votes revealed after blind phase ends",
    Icon: LockOpenIcon,
  },
  {
    label: "Resolve",
    duration: "",
    description: `Majority wins after min ${protocolDocFacts.minVotersLabel} voters revealed`,
    Icon: ScaleIcon,
  },
  {
    label: "Claim",
    duration: "",
    description: "Winners withdraw stake + rewards",
    Icon: BanknotesIcon,
  },
];

export function VotingFlowDiagram() {
  return (
    <div className="my-6 flex flex-col sm:flex-row items-stretch gap-0 text-base">
      {STEPS.map((step, i) => (
        <div key={step.label} className="flex items-center flex-1 min-w-0">
          <div className="flex flex-col items-center text-center flex-1 min-w-0 px-2">
            <span className="mb-2 inline-flex min-h-8 items-center rounded-full border border-primary/20 bg-primary/15 px-4 text-sm font-medium text-primary">
              {step.label}
            </span>
            <span className="mb-2 inline-flex h-14 w-14 items-center justify-center rounded-full border border-primary/15 bg-primary/10 shadow-[0_0_24px_rgba(242,100,38,0.12)]">
              <step.Icon className="h-7 w-7 text-primary/85" aria-hidden="true" />
            </span>
            <span className="text-base text-base-content/60 leading-tight">{step.description}</span>
            {step.duration && <span className="mt-1 text-sm font-mono text-primary/70">{step.duration}</span>}
          </div>
          {i < STEPS.length - 1 && <div className="hidden shrink-0 text-lg text-primary/35 sm:block">→</div>}
          {i < STEPS.length - 1 && <div className="shrink-0 self-center py-1 text-lg text-primary/35 sm:hidden">↓</div>}
        </div>
      ))}
    </div>
  );
}
