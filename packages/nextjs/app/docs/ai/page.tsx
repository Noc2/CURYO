import Link from "next/link";
import type { NextPage } from "next";

const mcpServerSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/mcp-server";
const mcpRoutesSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/nextjs/app/api/mcp";
const ponderSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/ponder";

const AIPage: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>AI &amp; MCP</h1>
      <p className="lead text-base-content/60 text-lg">
        Curyo&apos;s hosted MCP service is live at <code>mcp.curyo.xyz</code>. It gives AI clients structured reads,
        narrow authenticated writes, and a canonical HTTP endpoint without requiring every developer to boot the
        monorepo locally.
      </p>

      <h2>Why This Matters</h2>
      <p>
        Generative AI has collapsed the cost of producing text, images, and video to near zero. Traditional quality
        signals such as likes, follower counts, and engagement are easy to game when AI systems can generate content and
        coordinate accounts at machine speed.
      </p>
      <p>
        Curyo exists to provide a stronger signal: stake-weighted ratings from verified humans, recorded publicly and
        priced by economic risk. That same quality layer is a natural fit for AI agents. Agents need structured,
        provenance-rich reads, and over time they should be able to participate through a constrained write surface
        instead of raw contract plumbing.
      </p>

      <div className="not-prose grid gap-4 sm:grid-cols-2 my-6">
        <FeatureCard
          title="Public Quality Layer"
          description="Curyo ratings are openly accessible, exportable, and useful as an input to search, ranking, recommendation, and training pipelines."
        />
        <FeatureCard
          title="One Person, One Vote"
          description="Verified human identities and Voter IDs make stake-backed quality signals harder to sybil and easier to trust."
        />
        <FeatureCard
          title="Economic Commitment"
          description="Votes require cREP stake, so persistent low-quality judgment becomes expensive instead of merely noisy."
        />
        <FeatureCard
          title="Agent-Native Access"
          description="MCP is the right interface for agents that need structured reads and a small typed write surface instead of raw contract calls."
        />
      </div>

      <h2>Hosted MCP Service</h2>
      <p>
        The canonical hosted endpoint is <code>mcp.curyo.xyz</code>. AI tools can connect directly to the live service
        instead of running their own local MCP server, Ponder stack, and supporting infrastructure.
      </p>
      <pre>
        <code>{`Live endpoint
https://mcp.curyo.xyz/mcp`}</code>
      </pre>
      <p>The live service provides:</p>
      <ul>
        <li>Hosted read access backed by a managed Ponder deployment.</li>
        <li>Stable health, readiness, auth, and observability for agent clients.</li>
        <li>Typed authenticated write tools for a small set of common Curyo actions.</li>
        <li>Vote attribution to a registered frontend code so hosted vote flow can earn protocol frontend fees.</li>
      </ul>
      <p>
        The Next.js app also publishes a canonical config document at <code>/api/mcp/config</code> so clients can read
        the endpoint URL, health/readiness URLs, docs URL, and current wallet-session settings from one place.
      </p>
      <p>
        The open-source implementation lives in the{" "}
        <a href={mcpServerSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
          MCP server package
        </a>
        , the{" "}
        <a href={mcpRoutesSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
          Next.js MCP routes
        </a>
        , and the{" "}
        <a href={ponderSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
          Ponder indexer
        </a>{" "}
        if you want to inspect or self-host the same stack.
      </p>

      <h2>Service Overview</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Area</th>
              <th>Live service behavior</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>MCP transport</td>
              <td>
                Canonical Streamable HTTP endpoint for external AI clients, with the in-repo package still available for
                local stdio workflows
              </td>
            </tr>
            <tr>
              <td>Indexer dependency</td>
              <td>Managed Ponder + Postgres behind the hosted MCP service</td>
            </tr>
            <tr>
              <td>Authentication</td>
              <td>
                Scoped bearer tokens plus wallet-signed session issuance endpoints for short-lived write-capable MCP
                sessions
              </td>
            </tr>
            <tr>
              <td>Write support</td>
              <td>
                Typed write tools in repo: vote, submit_content, claim_reward, claim_frontend_fee, with preflight
                simulation and policy guards
              </td>
            </tr>
            <tr>
              <td>Frontend fee attribution</td>
              <td>Available at protocol level, with configurable frontend attribution in bot and hosted MCP flows</td>
            </tr>
            <tr>
              <td>Ops surface</td>
              <td>HTTP rate limits, `/metrics`, health, readiness, and structured write audit events</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Read Surface</h2>
      <p>
        The live service exposes the existing content, profile, vote, category, and stats tools over a managed hosted
        endpoint. Agent clients no longer need to boot the monorepo locally just to query Curyo data.
      </p>
      <ul>
        <li>Content, profile, vote, category, and stats tools are available through the hosted MCP endpoint.</li>
        <li>Reads are backed by managed Ponder infrastructure rather than local-only defaults.</li>
        <li>
          The canonical client bootstrap document lives at <code>/api/mcp/config</code>.
        </li>
        <li>External access is token-gated and rate-limited without changing the read tool surface.</li>
      </ul>

      <h2>Write Surface</h2>
      <p>
        The hosted MCP service exposes a narrow write surface on top of the protocol. The goal is not to mirror raw
        contract access, but to offer a small number of typed actions with auth, simulation, policy checks, and audit
        logging.
      </p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Tool</th>
              <th>Purpose</th>
              <th>Expected checks</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>vote</code>
              </td>
              <td>Commit a vote on a content item with stake and direction</td>
              <td>
                Wallet binding, Voter ID or delegation, stake limits, round open, duplicate-vote prevention, simulation
              </td>
            </tr>
            <tr>
              <td>
                <code>submit_content</code>
              </td>
              <td>Submit a new content URL with metadata and category</td>
              <td>Wallet binding, Voter ID or delegation, duplicate URL checks, minimum stake, moderation policy</td>
            </tr>
            <tr>
              <td>
                <code>claim_reward</code>
              </td>
              <td>
                Claim voter, submitter, participation, or cancelled-round refund flows through one typed entry point
              </td>
              <td>Caller eligibility, round state, simulation, explicit claim kind</td>
            </tr>
            <tr>
              <td>
                <code>claim_frontend_fee</code>
              </td>
              <td>Claim a settled frontend fee for an operator</td>
              <td>Registered frontend operator binding, round settled, fee still claimable</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The <code>vote</code> tool uses the single-transaction vote payload that includes a <code>frontendAddress</code>
        so <code>mcp.curyo.xyz</code> can behave like a fee-earning frontend rather than just a transaction relay.
      </p>

      <h2>Frontend Economics</h2>
      <p>
        A hosted MCP can already fit the current protocol economics for votes. Curyo can register a frontend operator,
        post the required bond, and attribute hosted vote flow to that frontend code. On settled two-sided rounds, that
        frontend can then claim its share of the frontend fee pool.
      </p>
      <p>
        What the current protocol does <strong>not</strong> do is reward every transaction type through the frontend fee
        model. Under the existing rules, <code>vote</code> can earn frontend fees; <code>submit_content</code>,{" "}
        <code>claim_reward</code>, and <code>claim_frontend_fee</code> are still useful tools, but they do not create
        extra frontend-fee revenue on their own.
      </p>

      <h2>Security Model</h2>
      <p>
        Hosted reads stay simple. Hosted writes use a stricter auth and policy model so the public MCP endpoint remains
        narrow, attributable, and operable.
      </p>
      <ul>
        <li>Write access uses scoped per-user auth rather than a single shared static bearer secret.</li>
        <li>Each write-capable session is bound to a specific wallet or delegate wallet.</li>
        <li>Every write tool supports simulation and is dry-run friendly before live execution.</li>
        <li>The service enforces explicit limits for stake size, rate, and supported actions.</li>
        <li>Write requests, simulations, signatures, and transaction outcomes are logged for auditability.</li>
        <li>
          The public MCP surface exposes typed tools, not arbitrary contract calls or generic send-transaction access.
        </li>
      </ul>
      <p>
        The in-repo MCP package now includes token expiry metadata, HTTP rate limits, a Prometheus-style metrics
        surface, and structured write audit events. The result is a deliberately narrow production interface rather than
        a generic transaction relay.
      </p>
      <p>
        The repo now also includes a wallet-signed MCP session exchange in the Next app. Clients can request a challenge
        at <code>/api/mcp/session/challenge</code>, sign it with the bound wallet, and exchange that signature at{" "}
        <code>/api/mcp/session/token</code> for a short-lived bearer token that the hosted MCP server can verify with
        the shared session-signing secret.
      </p>
      <p>
        Delegation already makes sense for voting and submission. Frontend registration itself is still a holder-only
        action, so the frontend operator wallet for <code>mcp.curyo.xyz</code> should be treated as infrastructure, not
        reused as the signing key for normal user traffic.
      </p>

      <h2>Protocol Boundaries</h2>
      <ul>
        <li>No protocol change is required for hosted reads or for the first typed write tools.</li>
        <li>
          Vote attribution already exists through the frontend address field, so hosted vote flow can earn frontend fees
          without new contracts.
        </li>
        <li>
          If Curyo later wants the MCP or frontend layer to earn from non-vote actions too, that should be designed as a
          separate protocol feature rather than forced into the current vote-only frontend fee path.
        </li>
        <li>The public MCP service remains a typed integration layer, not a generic protocol passthrough.</li>
      </ul>

      <h2>Client Examples</h2>
      <p>
        The hosted bootstrap flow is: read <code>/api/mcp/config</code>, connect to the published HTTP endpoint, mint a
        wallet-bound bearer token when write access is needed, then attach a bearer token with the minimum scopes your
        client needs.
      </p>
      <pre>
        <code>{`Wallet-bound write session
1. POST /api/mcp/session/challenge
   { "address": "0x...", "scopes": ["mcp:read", "mcp:write:vote"], "clientName": "claude-desktop" }
2. Sign the returned message with the bound wallet
3. POST /api/mcp/session/token
   { "address": "0x...", "scopes": ["mcp:read", "mcp:write:vote"], "clientName": "claude-desktop", "challengeId": "...", "signature": "0x..." }
4. Send Authorization: Bearer <accessToken> to https://mcp.curyo.xyz/mcp`}</code>
      </pre>
      <pre>
        <code>{`Claude Desktop
{
  "mcpServers": {
    "curyo": {
      "transport": {
        "type": "streamable_http",
        "url": "https://mcp.curyo.xyz/mcp",
        "headers": {
          "Authorization": "Bearer \${CURYO_MCP_TOKEN}"
        }
      }
    }
  }
}`}</code>
      </pre>
      <p>
        The write-capable wallet bindings live on the Next.js side through{" "}
        <code>CURYO_MCP_SESSION_WALLET_BINDINGS</code>. The hosted MCP server and the Next app must share the same
        session-signing settings: <code>CURYO_MCP_HTTP_SESSION_SECRET</code>, <code>CURYO_MCP_HTTP_SESSION_KEY_ID</code>
        , <code>CURYO_MCP_HTTP_SESSION_ISSUER</code>, and <code>CURYO_MCP_HTTP_SESSION_AUDIENCE</code>.
      </p>

      <h2>WebMCP</h2>
      <p>
        WebMCP is a browser-native layer that can sit on top of the hosted MCP backend. The hosted MCP endpoint remains
        the canonical interface for durable reads, auth, and production write policy, while WebMCP stays feature-flagged
        for in-tab experiments.
      </p>
      <ul>
        <li>Use hosted MCP first for stable read and write workflows.</li>
        <li>Keep WebMCP behind an explicit feature flag in the web app.</li>
        <li>Use WebMCP for browser-context actions and read-oriented tab-local workflows.</li>
      </ul>

      <div className="not-prose mt-8 rounded-xl p-4 surface-card">
        <p className="text-base-content/60">
          For the voting lifecycle and protocol rules, see{" "}
          <Link href="/docs/how-it-works" className="link link-primary">
            How It Works
          </Link>
          ,{" "}
          <Link href="/docs/smart-contracts" className="link link-primary">
            Smart Contracts
          </Link>
          , and{" "}
          <Link href="/docs/sdk" className="link link-primary">
            SDK
          </Link>
          , and{" "}
          <Link href="/docs/frontend-codes" className="link link-primary">
            Frontend Integrations
          </Link>
          .
        </p>
      </div>
    </article>
  );
};

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="surface-card rounded-xl p-4">
      <h3 className="mb-1.5 text-base font-semibold">{title}</h3>
      <p className="text-base text-base-content/50 leading-relaxed">{description}</p>
    </div>
  );
}

export default AIPage;
