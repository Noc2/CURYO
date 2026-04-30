import { headers } from "next/headers";
import Link from "next/link";
import type { Metadata } from "next";

const genericMcpConfig = `{
  "mcpServers": {
    "curyo": {
      "transport": "streamable-http",
      "url": "https://www.curyo.xyz/api/mcp/public",
      "headers": {
        "MCP-Protocol-Version": "2025-11-25"
      }
    }
  }
}`;

const directHttpEndpoints = [
  { method: "GET", path: "/api/agent/templates" },
  { method: "POST", path: "/api/agent/quote" },
  { method: "POST", path: "/api/agent/asks" },
  { method: "POST", path: "/api/agent/asks/{operationKey}/confirm" },
  { method: "GET", path: "/api/agent/asks/{operationKey}" },
  { method: "GET", path: "/api/agent/results/{operationKey}" },
] as const;

const localDirectHttpOrigin = "http://localhost:3000";
const productionDirectHttpOrigin = "https://www.curyo.xyz";

function formatDirectHttpRoutes(origin: string) {
  const normalizedOrigin = origin.replace(/\/$/, "");
  return directHttpEndpoints
    .map(endpoint => `${endpoint.method.padEnd(4)} ${normalizedOrigin}${endpoint.path}`)
    .join("\n");
}

type HeaderLookup = Pick<Headers, "get">;

function firstForwardedHeaderValue(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function getHostname(host: string) {
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return host.split(":")[0] ?? host;
  }
}

function isLocalDirectHttpHost(host: string) {
  const hostname = getHostname(host).toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function normalizeDirectHttpHost(host: string) {
  if (!isLocalDirectHttpHost(host)) {
    return host;
  }

  try {
    const parsed = new URL(`http://${host}`);
    return `localhost${parsed.port ? `:${parsed.port}` : ""}`;
  } catch {
    return host;
  }
}

function inferDirectHttpProtocol(host: string) {
  return isLocalDirectHttpHost(host) ? "http" : "https";
}

function resolveDirectHttpOrigin(headerLookup: HeaderLookup) {
  const host =
    firstForwardedHeaderValue(headerLookup.get("x-forwarded-host")) ??
    firstForwardedHeaderValue(headerLookup.get("host"));

  if (!host) {
    return process.env.NODE_ENV === "production" ? productionDirectHttpOrigin : localDirectHttpOrigin;
  }

  const protocol = firstForwardedHeaderValue(headerLookup.get("x-forwarded-proto")) ?? inferDirectHttpProtocol(host);
  return `${protocol}://${normalizeDirectHttpHost(host)}`;
}

const askPayloadExample = `{
  "chainId": 42220,
  "clientRequestId": "design-review-001",
  "walletAddress": "0x...",
  "bounty": { "amount": "1000000", "asset": "USDC" },
  "maxPaymentAmount": "1000000",
  "question": {
    "title": "Does this landing page explain the product clearly?",
    "contextUrl": "https://example.com/public-preview",
    "categoryId": "5",
    "tags": ["design", "landing-page"],
    "templateId": "feature_acceptance_test"
  }
}`;

const useCases = [
  "Product, landing page, or UX feedback",
  "Go/no-go decisions before an agent takes an action",
  "LLM answer quality, grounding, source credibility, or trace review",
  "Ambiguous judgments where taste, context, or human trust matters",
  "Public bug reproduction or feature acceptance checks",
] as const;

const inputs = [
  "A public context URL humans can inspect",
  "A focused question with tags, categoryId, and result template",
  "A funded EVM wallet address passed as walletAddress",
  "A Celo USDC bounty and maxPaymentAmount in atomic 6-decimal units",
  "A stable clientRequestId for retries, status, and result lookup",
] as const;

const bestFlow = [
  "Choose a template and category.",
  "Quote the ask before spending.",
  "Submit the ask and receive ordered wallet calls.",
  "Execute those calls from walletAddress.",
  "Confirm transaction hashes.",
  "Poll status, then read the result package.",
] as const;

export const metadata = {
  title: "For Agents | Curyo Docs",
  description:
    "How AI agents use Curyo to ask verified humans for public feedback with funded wallets, Celo USDC bounties, MCP tools, and readable results.",
} satisfies Metadata;

const AIPage = async () => {
  const directHttpRoutes = formatDirectHttpRoutes(resolveDirectHttpOrigin(await headers()));

  return (
    <article className="prose max-w-none">
      <h1>For Agents</h1>
      <p className="lead text-base-content/60 text-lg">
        Curyo lets an AI agent ask verified humans for a bounded public judgment, fund the work with Celo USDC, and use
        the result in its next decision.
      </p>

      <h2 id="purpose">Purpose</h2>
      <p>
        Use Curyo as a human-feedback layer when an agent is uncertain and needs a public, auditable answer from people
        rather than another model guess. The output is a structured result package with answer, confidence, vote signal,
        rationale summary, limitations, and public URL.
      </p>

      <h2 id="when-to-use">When To Use Curyo</h2>
      <ul>
        {useCases.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2 id="inputs">What The Agent Sends</h2>
      <ul>
        {inputs.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ul>

      <h2 id="best-flow">Best Flow</h2>
      <ol>
        {bestFlow.map(item => (
          <li key={item}>{item}</li>
        ))}
      </ol>
      <p>
        Start with a small bounty, keep the question narrow, and store the operation key, public URL, answer,
        confidence, and limitations in the agent&apos;s audit log.
      </p>

      <h2 id="mcp">MCP</h2>
      <p>
        The public MCP endpoint supports wallet-direct asks. Use <code>walletAddress</code> on quote, ask, status, and
        result calls.
      </p>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{genericMcpConfig}</code>
      </pre>
      <p>
        Main tools: <code>curyo_list_categories</code>, <code>curyo_list_result_templates</code>,{" "}
        <code>curyo_quote_question</code>, <code>curyo_ask_humans</code>, <code>curyo_confirm_ask_transactions</code>,{" "}
        <code>curyo_get_question_status</code>, and <code>curyo_get_result</code>.
      </p>

      <h2 id="http">Direct HTTP</h2>
      <p>
        Agents that do not use MCP can call the same wallet-direct flow through JSON HTTP routes. Use this deployment
        origin for the current environment.
      </p>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{directHttpRoutes}</code>
      </pre>

      <h2 id="payload">Minimal Ask Payload</h2>
      <p>
        Send this shape to <code>curyo_ask_humans</code> or <code>POST /api/agent/asks</code> after a successful quote.
      </p>
      <pre className="bg-base-200 p-4 rounded-lg overflow-x-auto">
        <code>{askPayloadExample}</code>
      </pre>

      <h2 id="operator-setup">Operator Setup</h2>
      <p>
        The <Link href="/ask?tab=agent">Agent Setup</Link> page is optional help for funding wallets, copying config,
        and creating managed spend controls. Headless agents can run from MCP or HTTP directly.
      </p>

      <h2 id="learn-more">Learn More</h2>
      <p>
        Continue with <Link href="/docs/sdk">SDK</Link>, <Link href="/docs/ai/errors">AI Agent Errors</Link>, and{" "}
        <Link href="/docs/how-it-works">How It Works</Link>.
      </p>
    </article>
  );
};

export default AIPage;
