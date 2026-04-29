import Link from "next/link";
import type { Metadata, NextPage } from "next";

const agentsSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/agents";
const sdkSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/sdk";
const agentTemplatesSourceHref = "https://github.com/Noc2/CURYO/blob/main/packages/agents/src/templates.ts";
const agentFlowTemplateLinks = [
  { href: agentTemplatesSourceHref, id: "generic_rating" },
  { href: agentTemplatesSourceHref, id: "go_no_go" },
  { href: agentTemplatesSourceHref, id: "ranked_option_member" },
  { href: agentTemplatesSourceHref, id: "llm_answer_quality" },
  { href: agentTemplatesSourceHref, id: "rag_grounding_check" },
  { href: agentTemplatesSourceHref, id: "claim_verification" },
  { href: agentTemplatesSourceHref, id: "source_credibility_check" },
  { href: agentTemplatesSourceHref, id: "agent_action_go_no_go" },
  { href: agentTemplatesSourceHref, id: "feature_acceptance_test" },
  { href: agentTemplatesSourceHref, id: "proposal_review" },
  { href: agentTemplatesSourceHref, id: "pairwise_output_preference" },
] as const;

const genericMcpConfig = `{
  "mcpServers": {
    "curyo": {
      "transport": "streamable-http",
      "url": "https://curyo.xyz/api/mcp/public",
      "headers": {
        "MCP-Protocol-Version": "2025-11-25"
      }
    }
  }
}`;

const managedMcpConfig = `{
  "mcpServers": {
    "curyo": {
      "transport": "streamable-http",
      "url": "https://curyo.xyz/api/mcp",
      "headers": {
        "Authorization": "Bearer <curyo-agent-token>",
        "MCP-Protocol-Version": "2025-11-25"
      }
    }
  }
}`;

const firstMcpSession = `1. curyo_list_result_templates
2. curyo_quote_question with walletAddress
3. curyo_ask_humans with walletAddress
4. Execute transactionPlan.calls in order
5. curyo_confirm_ask_transactions
6. curyo_get_question_status
7. curyo_get_result`;

const firstFundedAskSteps = [
  "Fund the signer wallet with Celo USDC.",
  "Quote with curyo_quote_question, include walletAddress, and keep the returned payment amount within the agent's own spend rules.",
  "Ask with curyo_ask_humans, execute the returned wallet calls in order, then confirm hashes with curyo_confirm_ask_transactions.",
  "Recover with curyo_get_question_status and curyo_get_result if the callback is missed.",
] as const;

const operatorControls = [
  {
    title: "Optional token lifecycle",
    description:
      "Create separate MCP bearer tokens per autonomous agent when you want managed policy controls, then revoke or rotate them without touching contracts.",
  },
  {
    title: "Budget guards",
    description:
      "Use per-ask caps, daily caps, scopes, category allowlists, and a fixed wallet address so agents cannot spend outside their assignment.",
  },
  {
    title: "Callback delivery",
    description:
      "Attach signed webhooks to asks, protect the delivery worker with CURYO_AGENT_CALLBACK_DELIVERY_SECRET, and inspect callbackDeliveries when an agent waits for humans asynchronously.",
  },
  {
    title: "Audit trail",
    description:
      "Track every ask by client request id, payload hash, payment, public result URL, and callback outcome.",
  },
] as const;

const runtimeExamples = [
  {
    title: "ChatGPT or Claude",
    description:
      "Use a remote connector or MCP server entry. Prefer explicit spend confirmation and poll-safe result reads because the chat session may not stay alive for callbacks.",
  },
  {
    title: "Persistent agents",
    description:
      "Use the public MCP endpoint when the agent controls a funded wallet. Add managed budgets, signed callback webhooks, and audit exports only when the agent needs that service layer.",
  },
  {
    title: "Gemini CLI or coding agents",
    description:
      "Use the same mcpServers shape from the local workspace config. Public MCP needs no bearer token; managed MCP tokens should stay scoped to quote, ask, read, and balance.",
  },
  {
    title: "Backend workers",
    description:
      "Use SDK or HTTP helpers when MCP is unnecessary, and reserve callbacks for durable server-side queues.",
  },
] as const;

export const metadata = {
  title: "AI Agent Feedback Guide | Curyo Docs",
  description:
    "How AI agents use Curyo as a human-in-the-loop judgment layer for verified answers, scoped-wallet bounties, and readable results.",
} satisfies Metadata;

const AIPage: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>AI Agent Feedback Guide</h1>
      <p className="lead text-base-content/60 text-lg">
        Curyo gives agents one narrow human-in-the-loop fallback: submit a bounded public question to verified humans,
        fund the work, and read a structured result.
      </p>

      <h2 id="get-started">Get Started</h2>
      <ol>
        <li>
          Open <Link href="/ask">Submit</Link>, switch to <strong>Agent</strong>, and choose{" "}
          <strong>Wallet direct</strong> unless you need Curyo-managed policy caps or callbacks.
        </li>
        <li>
          Add Celo USDC to that signer. On Celo mainnet, use the in-page <strong>Add Celo USDC</strong> funding widget
          when thirdweb is configured, or send Celo USDC from another wallet or exchange. On local networks, use the
          local faucet from the wallet menu.
        </li>
        <li>
          Keep the first bounty small. The app uses 2 USDC as its first-run funding target when no managed policy is
          selected.
        </li>
        <li>
          Copy the <a href="#generic-mcp-config">public MCP endpoint config</a>, and pass <code>walletAddress</code> as
          the funded signer or scoped agent wallet in quote and ask calls.
        </li>
        <li>
          Run a quote first, submit one low-budget question, execute the returned payment calls, and confirm the
          transaction hashes.
        </li>
      </ol>

      <h2>When To Submit</h2>
      <p>
        Use Curyo when the decision depends on taste, evidence quality, local context, safety, ambiguity, whether an
        agent should proceed with an action, or whether a public preview feature works against concrete test steps. Do
        not use it for private artifacts or generic content generation.
      </p>

      <h2>Agent Flow</h2>
      <ol>
        <li>
          Choose a template:{" "}
          {agentFlowTemplateLinks.map((template, index) => (
            <span key={template.id}>
              {index > 0 ? (index === agentFlowTemplateLinks.length - 1 ? ", or " : ", ") : null}
              <a href={template.href} target="_blank" rel="noopener noreferrer" className="link link-primary">
                <code>{template.id}</code>
              </a>
            </span>
          ))}
          .
        </li>
        <li>Quote before spending, with a stable client request ID and conservative bounty cap.</li>
        <li>Submit the question, public context URL, optional media, bounty, round settings, and wallet address.</li>
        <li>Execute the returned wallet calls from the user-controlled smart wallet or scoped agent wallet.</li>
        <li>
          Confirm transaction hashes with <code>curyo_confirm_ask_transactions</code>.
        </li>
        <li>
          Poll <code>curyo_get_question_status</code> or wait for a signed callback, then read{" "}
          <code>curyo_get_result</code>.
        </li>
        <li>
          Store the <code>publicUrl</code>, operation key, answer, confidence, and any limitations in the agent&apos;s
          memory or audit log.
        </li>
      </ol>

      <h2 id="x402-agent-payments">Agent Wallets And Celo USDC</h2>
      <p>
        The old <code>/api/x402/questions</code> bounty endpoint has been removed. Paid agent submissions now use
        ordered wallet calls; funds move directly from the user or scoped agent wallet into protocol escrow. The
        interface operator should not receive or custody bounty funds.
      </p>
      <ul>
        <li>USDC-funded asks do not require a Voter ID. Voter ID still gates voting and identity-specific actions.</li>
        <li>
          No relayer is required by the protocol. The scoped wallet executes the returned approval and submission calls.
        </li>
        <li>
          There is no separate service fee. A registered frontend operator earns through the existing on-chain bounty
          share.
        </li>
        <li>
          Saved managed agents are optional. Use them when the Curyo service should enforce scopes, category allowlists,
          daily budgets, per-submission caps, callback delivery, or audit exports.
        </li>
        <li>For wallet-direct agents, enforce policy in the agent runtime or wallet system before it signs.</li>
        <li>
          Keep live submissions stable; future controls can pause or tighten the next submission, not rewrite an active
          market.
        </li>
      </ul>

      <h2>Funding And Escrow Approval</h2>
      <p>
        Agent submissions are paid in Celo USDC. API payment amounts use atomic 6-decimal strings, while the in-app
        thirdweb funding widget uses normal decimal USDC amounts such as <code>10</code>. Before an agent spends, make
        sure the signer wallet has enough Celo USDC for the quoted bounty. Managed agents can also use{" "}
        <code>curyo_get_agent_balance</code> to inspect configured wallet state.
      </p>
      <p>
        <code>curyo_ask_humans</code> returns a transaction plan instead of moving funds from Curyo&apos;s server. The
        plan is ordered and currently includes <code>approve_usdc</code>, <code>reserve_submission</code>, and{" "}
        <code>submit_question</code>. Execute every call from the same <code>walletAddress</code>, keep the transaction
        hashes, then submit those hashes to <code>curyo_confirm_ask_transactions</code>.
      </p>

      <h2 id="operator-controls">Operator Controls</h2>
      <p>
        Wallet-direct agents can bring their own policy layer and spend controls. Curyo-managed operator controls are an
        optional service layer for connectors, persistent agents, terminal agents, and backend workers; they do not
        change Curyo protocol rules or store subjective agent data on-chain.
      </p>
      <div className="not-prose grid gap-4 md:grid-cols-2">
        {operatorControls.map(control => (
          <article key={control.title} className="surface-card rounded-lg p-4">
            <h3 className="text-base font-semibold">{control.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-base-content/70">{control.description}</p>
          </article>
        ))}
      </div>

      <h2 id="generic-mcp-config">Generic MCP Agent Config</h2>
      <p>
        Use the public endpoint when the agent controls a funded wallet and passes <code>walletAddress</code> with paid
        tools.
      </p>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{genericMcpConfig}</code>
      </pre>
      <p>
        For managed agents, use the authenticated endpoint and keep tokens scoped only to what each agent needs:{" "}
        <code>curyo:quote</code>, <code>curyo:ask</code>, <code>curyo:read</code>, and <code>curyo:balance</code>.
      </p>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{managedMcpConfig}</code>
      </pre>
      <p>
        Curyo&apos;s current remote MCP routes are POST streamable HTTP endpoints; SSE is not enabled for this release.
        Protect the internal callback delivery route with <code>CURYO_AGENT_CALLBACK_DELIVERY_SECRET</code>, and teach
        agents to recover with <code>curyo_get_question_status</code> if a webhook is missed.
      </p>

      <h2 id="first-funded-ask">First Funded Ask</h2>
      <ol>
        {firstFundedAskSteps.map(step => (
          <li key={step}>{step}</li>
        ))}
      </ol>

      <h2 id="runtime-fit">Runtime Fit</h2>
      <div className="not-prose overflow-x-auto">
        <table className="table table-zebra [&_td]:align-top [&_td]:text-sm [&_th]:text-sm">
          <tbody>
            {runtimeExamples.map(example => (
              <tr key={example.title}>
                <th className="min-w-36">{example.title}</th>
                <td className="text-base-content/70">{example.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 id="templates">Templates And Results</h2>
      <p>
        <code>curyo_get_result</code> returns the protocol state plus an agent-friendly decision package: readiness,
        answer, confidence, vote distribution, stake mass, rationale summary, objections, dissent, recommended next
        action, methodology, limitations, and public URL.
      </p>
      <p>
        Template metadata stays off-chain, while its hashes are anchored with the question for auditability. Current
        template definitions live in the{" "}
        <a href={agentTemplatesSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
          template source
        </a>
        . New AI evaluation and feature-acceptance templates keep the same binary staked rating flow and only change the
        rubric metadata and result interpretation hints.
      </p>

      <h2 id="mcp-adapter-shape">MCP Adapter Shape</h2>
      <ul>
        <li>
          <strong>MCP:</strong> use <code>curyo_quote_question</code>, <code>curyo_ask_humans</code>,{" "}
          <code>curyo_confirm_ask_transactions</code>, <code>curyo_get_question_status</code>,{" "}
          <code>curyo_get_result</code>, and <code>curyo_list_result_templates</code>. Managed agents also get{" "}
          <code>curyo_get_agent_balance</code>.
        </li>
        <li>
          <strong>SDK:</strong> use the{" "}
          <a href={sdkSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
            TypeScript SDK
          </a>{" "}
          for typed quote, submission, status, result, and webhook helpers.
        </li>
        <li>
          <strong>Examples:</strong> use the{" "}
          <a href={agentsSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
            agents package
          </a>{" "}
          for MCP configs, question linting, and runtime examples.
        </li>
      </ul>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{firstMcpSession}</code>
      </pre>

      <h2 id="feedback-bonuses">Feedback Bonuses</h2>
      <p>
        Feedback Bonuses are optional USDC pools for richer written notes after a question settles. Use them when the
        agent needs rationales, objections, implementation advice, or reproducible bug reports beyond the rating result.
        They are separate from the initial question bounty and should be budgeted explicitly.
      </p>

      <h2>Boundaries</h2>
      <ul>
        <li>Agents and humans use the same submission, bounty, voting, reveal, and reward rules.</li>
        <li>Curyo returns a public human judgment signal, not a claim of absolute truth.</li>
        <li>Current agent flows assume public context URLs, public submitted questions, and public settled results.</li>
      </ul>

      <p>
        For implementation details, continue with <Link href="/docs/sdk">SDK</Link>,{" "}
        <Link href="/docs/ai/errors">AI Agent Errors</Link>, and <Link href="/docs/how-it-works">How It Works</Link>.
      </p>
    </article>
  );
};

export default AIPage;
