function AgentIcon({ name }: { name: string }) {
  const iconClass = "h-5 w-5 shrink-0";

  switch (name) {
    case "Kimi":
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L13.5 9.5L21 12L13.5 14.5L12 22L10.5 14.5L3 12L10.5 9.5L12 2Z" fill="currentColor" />
        </svg>
      );
    case "Claude Code":
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L13.8 10.2L22 12L13.8 13.8L12 22L10.2 13.8L2 12L10.2 10.2L12 2Z" fill="currentColor" />
        </svg>
      );
    case "Cursor":
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L22 7V17L12 22L2 17V7L12 2Z" stroke="currentColor" strokeWidth="2" fill="none" />
          <path d="M12 7L17 9.5V14.5L12 17L7 14.5V9.5L12 7Z" fill="currentColor" />
        </svg>
      );
    case "GitHub Copilot":
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <path
            d="M8 14C8 14 9.5 16 12 16C14.5 16 16 14 16 14"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <circle cx="9" cy="10" r="1.5" fill="currentColor" />
          <circle cx="15" cy="10" r="1.5" fill="currentColor" />
        </svg>
      );
    case "OpenAI Codex":
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M12 2L20.66 7V17L12 22L3.34 17V7L12 2Z" stroke="currentColor" strokeWidth="2" />
          <path d="M12 7L16.33 9.5V14.5L12 17L7.67 14.5V9.5L12 7Z" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
        </svg>
      );
    case "Lovable":
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
            fill="currentColor"
          />
        </svg>
      );
    default:
      return (
        <svg className={iconClass} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" />
          <circle cx="12" cy="12" r="3" fill="currentColor" />
        </svg>
      );
  }
}

const AGENTS = [
  { name: "Kimi", highlighted: true },
  { name: "Claude Code" },
  { name: "Cursor" },
  { name: "GitHub Copilot" },
  { name: "OpenAI Codex" },
  { name: "Lovable" },
];

export function SupportedAgentsSection() {
  return (
    <section className="relative z-10 mt-10 w-full sm:mt-14 lg:mt-16">
      <div className="mb-8 text-center sm:mb-10">
        <h2 className="display-section text-[1.85rem] text-base-content sm:text-[2.35rem]">
          Ask your favorite AI agent
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base leading-7 text-base-content/70 sm:text-lg">
          Get verified human feedback from Curyo through any of these agents.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-4">
        {AGENTS.map(agent => {
          const isHighlighted = agent.highlighted;
          return (
            <div
              key={agent.name}
              className={`
                flex items-center gap-2.5 rounded-xl border px-4 py-2.5
                transition duration-200
                ${
                  isHighlighted
                    ? "border-primary/30 bg-primary/10 text-primary hover:-translate-y-0.5 hover:border-primary/50"
                    : "border-base-content/10 bg-[var(--curyo-surface-elevated)] text-base-content/80 hover:-translate-y-0.5 hover:border-primary/25 hover:text-base-content"
                }
              `}
            >
              <AgentIcon name={agent.name} />
              <span className="whitespace-nowrap text-sm font-semibold sm:text-base">{agent.name}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
