import Link from "next/link";
import type { NextPage } from "next";

const AIPage: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>AI &amp; MCP</h1>
      <p className="lead text-base-content/60 text-lg">
        Curyo now has an in-repo MCP path for hosted reads and narrow authenticated writes. The remaining job is turning
        that into a canonical managed endpoint at <code>mcp.curyo.xyz</code>.
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

      <h2>Hosted MCP Target</h2>
      <p>
        The target shape is a canonical hosted endpoint at <code>mcp.curyo.xyz</code> that AI tools can connect to
        directly instead of asking every developer to boot the monorepo, run Ponder, and host their own MCP server.
      </p>
      <pre>
        <code>{`Planned endpoint
https://mcp.curyo.xyz/mcp`}</code>
      </pre>
      <p>The hosted service should provide:</p>
      <ul>
        <li>Hosted read access backed by a managed Ponder deployment.</li>
        <li>Stable health, readiness, auth, and observability for agent clients.</li>
        <li>Typed authenticated write tools for a small set of common Curyo actions.</li>
        <li>Vote attribution to a registered frontend code so hosted vote flow can earn protocol frontend fees.</li>
      </ul>

      <h2>Current State Vs Target</h2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Area</th>
              <th>Current repo state</th>
              <th>Hosted target</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>MCP transport</td>
              <td>Read and hosted-write MCP package with stdio and Streamable HTTP transports</td>
              <td>Canonical hosted HTTP endpoint for external AI clients</td>
            </tr>
            <tr>
              <td>Indexer dependency</td>
              <td>
                Defaults to local Ponder at <code>localhost:42069</code>
              </td>
              <td>Managed Ponder + Postgres behind the hosted MCP</td>
            </tr>
            <tr>
              <td>Authentication</td>
              <td>
                Scoped bearer tokens with optional expiry, session metadata, and identity binding for hosted writes
              </td>
              <td>Scoped per-user auth for writes, with auditable wallet binding</td>
            </tr>
            <tr>
              <td>Write support</td>
              <td>
                Typed write tools in repo: vote, submit_content, claim_reward, claim_frontend_fee, with preflight
                simulation and policy guards
              </td>
              <td>Small typed write surface, not arbitrary contract calls</td>
            </tr>
            <tr>
              <td>Frontend fee attribution</td>
              <td>Available at protocol level, with configurable frontend attribution in bot and hosted MCP flows</td>
              <td>Hosted vote path includes a registered frontend code by default</td>
            </tr>
            <tr>
              <td>Ops surface</td>
              <td>HTTP rate limits, `/metrics`, health, readiness, and structured write audit events</td>
              <td>Managed alerts, dashboards, and policy-backed hosted operations</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Phase 1: Hosted Read Rollout</h2>
      <p>
        The repo already contains the MCP read surface with stdio and Streamable HTTP transport. The rollout work for
        phase 1 is hosting it against managed infrastructure so developers and agent clients no longer need to boot the
        whole monorepo locally.
      </p>
      <ul>
        <li>Keep the existing content, profile, vote, category, and stats tools.</li>
        <li>Back them with hosted Ponder rather than local-only defaults.</li>
        <li>Publish one official MCP config for agent clients.</li>
        <li>Rate-limit or token-gate external access as needed without changing the tool surface.</li>
      </ul>
      <p>
        The repo now also has the beginnings of that official config shape in <code>/api/mcp/config</code>, which can
        publish the canonical endpoint URL, health URLs, docs URL, and the current WebMCP experiment flag from one
        place.
      </p>

      <h2>Phase 2: Hosted Write Rollout</h2>
      <p>
        The first narrow write tools are now implemented in the MCP package. Phase 2 is about rolling them out with
        stronger production auth, signer isolation, policy controls, and monitoring rather than expanding the on-chain
        surface area.
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
        Hosted reads can stay simple. Hosted writes need a stricter auth and policy model than the current static bearer
        token setup.
      </p>
      <ul>
        <li>Use scoped per-user auth for writes, not a shared static bearer secret.</li>
        <li>Bind each write-capable session to a specific wallet or delegate wallet.</li>
        <li>Simulate and dry-run every write tool before live execution.</li>
        <li>Keep explicit limits for stake size, rate, and supported actions.</li>
        <li>Log every write request, simulation result, signature, and on-chain transaction outcome.</li>
        <li>Do not expose arbitrary contract calls, arbitrary calldata, or generic send-transaction tools.</li>
      </ul>
      <p>
        The in-repo MCP package now includes token expiry metadata, HTTP rate limits, a Prometheus-style metrics
        surface, and structured write audit events. That is a solid hosted beta foundation, but it is still not the same
        thing as a fully managed production auth and signer platform.
      </p>
      <p>
        Delegation already makes sense for voting and submission. Frontend registration itself is still a holder-only
        action, so the frontend operator wallet for <code>mcp.curyo.xyz</code> should be treated as infrastructure, not
        reused as the signing key for normal user traffic.
      </p>

      <h2>Rollout Backlog</h2>
      <h3>packages/mcp-server</h3>
      <ul>
        <li>Deploy the existing read and write tool surface behind the canonical hosted endpoint.</li>
        <li>Provision production token issuance, secret rotation, and scope management for external AI clients.</li>
        <li>Publish official MCP client examples for hosted reads and the authenticated write tools.</li>
        <li>
          Keep runtime metadata for chain, frontend code, and write capability state aligned with deployment config.
        </li>
      </ul>

      <h3>Signer Service</h3>
      <ul>
        <li>
          The repo currently embeds the signing runtime inside <code>packages/mcp-server</code>; production should
          extract or harden that into a dedicated signer or transaction-policy service.
        </li>
        <li>Support wallet binding, delegated wallet support, and managed agent wallets.</li>
        <li>Run simulation, nonce management, gas policy, retries, and transaction submission in one place.</li>
        <li>Prefer HSM or external signer integration over raw long-lived private keys on the MCP host.</li>
        <li>Store full audit logs for every signing decision and transaction lifecycle event.</li>
      </ul>

      <h3>Ops Worker</h3>
      <ul>
        <li>
          Run keeper-style reveal and settlement monitoring so hosted agent traffic does not depend on third parties to
          finish rounds.
        </li>
        <li>
          The keeper now supports optional hosted frontend fee sweeping; deploy it with the hosted frontend operator
          wallet.
        </li>
        <li>Monitor frontend stake health, slash state, and rebonding requirements.</li>
        <li>Alert on Ponder lag, MCP readiness failures, signer failures, and stuck transactions.</li>
      </ul>

      <h3>Contract-Touching Changes</h3>
      <ul>
        <li>No protocol change is required for the hosted read MVP or for the first typed write tools.</li>
        <li>
          Vote attribution already exists through the frontend address field, so hosted vote flow can earn frontend fees
          without new contracts.
        </li>
        <li>
          If Curyo later wants the MCP or frontend layer to earn from non-vote actions too, that should be designed as a
          separate protocol feature rather than forced into the current vote-only frontend fee path.
        </li>
      </ul>

      <h3>Docs And Rollout</h3>
      <ul>
        <li>Publish this page as the canonical AI documentation entry under the Technical section.</li>
        <li>Retire the old conceptual AI page behind a redirect so legacy links continue to work.</li>
        <li>Document the difference between implemented repo support and the remaining hosted deployment work.</li>
        <li>Provide official agent-client examples for hosted read access once the endpoint exists.</li>
        <li>
          Document auth scopes, wallet models, and write-tool safety limits before enabling external write access.
        </li>
      </ul>

      <h2>Client Examples</h2>
      <p>
        The intended hosted bootstrap flow is: read <code>/api/mcp/config</code>, connect to the published HTTP
        endpoint, then attach a bearer token with the minimum scopes your client needs.
      </p>
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

      <h2>WebMCP</h2>
      <p>
        WebMCP still makes sense only as a later browser-native layer on top of the hosted MCP backend. The hosted MCP
        endpoint should remain the canonical interface for durable reads, auth, and production write policy, while
        WebMCP stays feature-flagged for in-tab experiments.
      </p>
      <ul>
        <li>Use hosted MCP first for stable read and write workflows.</li>
        <li>Keep WebMCP behind an explicit feature flag in the web app.</li>
        <li>Start with read-oriented browser actions before considering browser-mediated writes.</li>
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
