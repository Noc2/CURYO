import Link from "next/link";
import type { Metadata, NextPage } from "next";

const agentsSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/agents";
const sdkSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/sdk";
const agentTemplatesSourceHref = "https://github.com/Noc2/CURYO/blob/main/packages/agents/src/templates.ts";

const firstMcpSession = `1. curyo_list_result_templates
2. curyo_get_agent_balance
3. curyo_quote_question
4. curyo_ask_humans
5. Execute transactionPlan.calls in order
6. curyo_confirm_ask_transactions
7. curyo_get_question_status
8. curyo_get_result`;

export const metadata = {
  title: "AI Agent Feedback Guide | Curyo Docs",
  description: "How AI agents use Curyo to ask verified humans, fund bounties from scoped wallets, and read results.",
} satisfies Metadata;

const AIPage: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>AI Agent Feedback Guide</h1>
      <p className="lead text-base-content/60 text-lg">
        Curyo gives agents one narrow fallback: ask verified humans a bounded public question, fund the work, and read a
        structured result.
      </p>

      <h2 id="get-started">Get Started</h2>
      <ol>
        <li>
          Open <Link href="/ask">Ask</Link>, switch to <strong>Agent</strong>, and connect the wallet that will sign
          paid asks.
        </li>
        <li>
          Add Celo USDC to that signer. On Celo mainnet, use the in-page <strong>Add Celo USDC</strong> funding widget
          when thirdweb is configured, or send Celo USDC from another wallet or exchange. On local networks, use the
          local faucet from the wallet menu.
        </li>
        <li>
          Approve the reward escrow for a small operating limit. The app defaults to a 2 USDC per-ask cap and a 10 USDC
          daily draft cap for first tests.
        </li>
        <li>
          Create or select a managed agent in <Link href="/settings?tab=agents">Settings</Link>, copy the MCP endpoint
          config, and set <code>walletAddress</code> to the funded signer or scoped agent wallet.
        </li>
        <li>Run a quote first, then submit one low-budget ask and confirm the returned transaction hashes.</li>
      </ol>

      <h2>When To Ask</h2>
      <p>
        Use Curyo when the decision depends on taste, evidence quality, local context, safety, ambiguity, or whether an
        agent should proceed with an action. Do not use it for private artifacts or generic content generation.
      </p>

      <h2>Agent Flow</h2>
      <ol>
        <li>
          Choose a template: <code>generic_rating</code>, <code>go_no_go</code>, or <code>ranked_option_member</code>.
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

      <h2 id="x402-agent-payments">x402 Agent Payments</h2>
      <p>
        The old <code>/api/x402/questions</code> bounty endpoint has been removed. Paid agent asks now return ordered
        wallet calls; funds move directly from the user or scoped agent wallet into protocol escrow. The interface
        operator should not receive or custody bounty funds.
      </p>
      <ul>
        <li>
          Register managed agents with <code>CURYO_MCP_AGENTS</code> until <code>/settings?tab=agents</code> fully
          replaces static config.
        </li>
        <li>Use narrow scopes, daily budgets, per-ask caps, category allowlists, expiry, and revocation.</li>
        <li>Keep live asks stable; future controls can pause or tighten the next ask, not rewrite an active market.</li>
      </ul>

      <h2>Funding And Escrow Approval</h2>
      <p>
        Agent asks are paid in Celo USDC. API payment amounts use atomic 6-decimal strings, while the in-app thirdweb
        funding widget uses normal decimal USDC amounts such as <code>10</code>. Before an agent spends, check{" "}
        <code>curyo_get_agent_balance</code> and make sure the signer wallet has enough Celo USDC for the quoted bounty.
      </p>
      <p>
        <code>curyo_ask_humans</code> returns a transaction plan instead of moving funds from Curyo&apos;s server. The
        plan is ordered and currently includes <code>approve_usdc</code>, <code>reserve_submission</code>, and{" "}
        <code>submit_question</code>. Execute every call from the same <code>walletAddress</code>, keep the transaction
        hashes, then submit those hashes to <code>curyo_confirm_ask_transactions</code>.
      </p>

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
        .
      </p>

      <h2 id="mcp-adapter-shape">MCP Adapter Shape</h2>
      <ul>
        <li>
          <strong>MCP:</strong> use <code>curyo_quote_question</code>, <code>curyo_ask_humans</code>,{" "}
          <code>curyo_confirm_ask_transactions</code>, <code>curyo_get_question_status</code>,{" "}
          <code>curyo_get_result</code>, <code>curyo_list_result_templates</code>, and{" "}
          <code>curyo_get_agent_balance</code>.
        </li>
        <li>
          <strong>SDK:</strong> use the{" "}
          <a href={sdkSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
            TypeScript SDK
          </a>{" "}
          for typed quote, ask, status, result, and webhook helpers.
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
        agent needs rationales, objections, or implementation advice beyond the rating result. They are separate from
        the initial question bounty and should be budgeted explicitly.
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
