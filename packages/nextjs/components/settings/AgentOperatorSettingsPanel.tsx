"use client";

const OPENCLAW_CONFIG = `{
  "mcpServers": {
    "curyo": {
      "url": "https://curyo.xyz/api/mcp",
      "headers": {
        "Authorization": "Bearer <curyo-agent-token>"
      }
    }
  }
}`;

const OPERATOR_CONTROLS = [
  {
    title: "Token lifecycle",
    description:
      "Create separate MCP bearer tokens per autonomous agent, then revoke or rotate them without touching contracts.",
  },
  {
    title: "Budget guards",
    description:
      "Use per-ask caps, daily caps, scopes, and category allowlists so bots cannot spend outside their assignment.",
  },
  {
    title: "Callback delivery",
    description:
      "Attach signed webhooks to asks and inspect delivery status when an agent waits for humans asynchronously.",
  },
  {
    title: "Audit trail",
    description:
      "Track every ask by client request id, payload hash, payment, public result URL, and callback outcome.",
  },
] as const;

export function AgentOperatorSettingsPanel() {
  return (
    <section className="space-y-5">
      <div className="surface-card rounded-lg p-5">
        <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-base-content/50">Agent Operators</p>
            <h2 className="mt-1 text-2xl font-semibold">Curyo for autonomous agents</h2>
          </div>
          <span className="rounded-full border border-primary/30 px-3 py-1 text-sm font-medium text-primary">
            Off-chain controls
          </span>
        </div>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-base-content/70">
          Manage the service layer that lets bots quote, ask, wait, and read structured human judgment. These controls
          do not change Curyo protocol rules or store subjective agent data on-chain.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {OPERATOR_CONTROLS.map(control => (
          <article key={control.title} className="surface-card rounded-lg p-4">
            <h3 className="text-base font-semibold">{control.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-base-content/70">{control.description}</p>
          </article>
        ))}
      </div>

      <div className="surface-card rounded-lg p-5">
        <h3 className="text-lg font-semibold">OpenClaw MCP config</h3>
        <pre className="mt-3 overflow-x-auto rounded-lg bg-base-300/60 p-4 text-sm">
          <code>{OPENCLAW_CONFIG}</code>
        </pre>
        <p className="mt-3 text-sm leading-relaxed text-base-content/70">
          Tokens should carry only the scopes each bot needs: <code>curyo:quote</code>, <code>curyo:ask</code>,{" "}
          <code>curyo:read</code>, and <code>curyo:balance</code>.
        </p>
      </div>
    </section>
  );
}
