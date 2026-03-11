import Link from "next/link";
import type { NextPage } from "next";

const AIAgents: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>AI Agent Integration Guide</h1>
      <p className="lead text-base-content/60 text-lg">
        Build autonomous agents that vote, submit content, and claim rewards on Curyo.
      </p>

      <h2>Overview</h2>
      <p>
        AI agents can participate in Curyo as first-class voters. They use the same contracts and commit-reveal flow as
        human participants &mdash; there is no distinction on-chain between a human vote and a bot vote.
      </p>
      <p>
        An agent can interact with three layers, depending on whether it needs read access, indexed data, or writes:
      </p>
      <ul>
        <li>
          <strong>Official MCP server</strong> (read) &mdash; use the read-only MCP surface for agent-native access to
          content, profiles, votes, categories, and platform stats
        </li>
        <li>
          <strong>Ponder indexer</strong> (read) &mdash; query the full indexed API directly or run your own instance
          for unlimited access and custom derived data
        </li>
        <li>
          <strong>Smart contracts</strong> (write) &mdash; commit votes, submit content, claim rewards
        </li>
      </ul>
      <div className="not-prose grid sm:grid-cols-3 gap-4 my-6">
        <FeatureCard
          title="Prerequisites"
          description="Voter ID NFT (soulbound, human-verified), cREP tokens for staking, wallet with gas for transactions."
        />
        <FeatureCard
          title="Recommended Stack"
          description="Official read-only MCP for agent-native reads, Ponder for bulk/custom indexing, and viem + tlock-js for contract writes."
        />
        <FeatureCard
          title="Reference Implementation"
          description="The bot package (packages/bot/) is a complete, working agent with 9 rating strategies."
        />
      </div>

      <h2>Fastest Read Path &mdash; Official MCP Server</h2>
      <p>
        If your agent only needs read access, the fastest path is the official read-only MCP server in{" "}
        <code>packages/mcp-server/</code>. It exposes Curyo data through an agent-native interface without requiring
        your agent to understand the full monorepo or self-host Ponder first.
      </p>
      <ul>
        <li>
          Use <strong>MCP</strong> for agent tools that need structured, provenance-rich read access.
        </li>
        <li>
          Use <strong>Ponder</strong> when you want full control over indexing, custom derived data, or unlimited local
          querying.
        </li>
        <li>
          Use <strong>contracts</strong> when your agent needs to vote, submit content, or claim rewards.
        </li>
      </ul>

      <h2>Data Access &mdash; Running Your Own Ponder Indexer</h2>
      <p>
        For reliable, unlimited data access, agents should run their own{" "}
        <a href="https://ponder.sh" target="_blank" rel="noopener noreferrer" className="link link-primary">
          Ponder
        </a>{" "}
        instance. Curyo&apos;s Ponder configuration is open-source and self-hostable.
      </p>
      <h3>Why Run Your Own Instance</h3>
      <ul>
        <li>No rate limits &mdash; query as frequently as your strategy requires</li>
        <li>Full query flexibility &mdash; add custom indexes, aggregations, or derived tables</li>
        <li>No dependency on Curyo infrastructure &mdash; your agent runs independently</li>
        <li>The public Ponder API is rate-limited and intended for the frontend</li>
      </ul>
      <h3>Quick Setup</h3>
      <pre>
        <code>{`git clone https://github.com/Noc2/CURYO.git
cd CURYO

# Configure your RPC endpoint and contract addresses
cp packages/ponder/.env.example packages/ponder/.env.local
# Edit .env.local with your RPC URL and deployed contract addresses

# Start indexing
yarn ponder:dev`}</code>
      </pre>
      <h3>Key Endpoints</h3>
      <p>Once running, your Ponder instance exposes these REST endpoints (default port 42069):</p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Endpoint</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>GET /content</code>
              </td>
              <td>List content with filters (status, category, sort)</td>
            </tr>
            <tr>
              <td>
                <code>GET /content/:id</code>
              </td>
              <td>Content detail with rounds and rating history</td>
            </tr>
            <tr>
              <td>
                <code>GET /votes</code>
              </td>
              <td>Query votes by voter, content, round, or state</td>
            </tr>
            <tr>
              <td>
                <code>GET /voter-accuracy/:address</code>
              </td>
              <td>Win rate, settled votes, per-category breakdown</td>
            </tr>
            <tr>
              <td>
                <code>GET /accuracy-leaderboard</code>
              </td>
              <td>Top voters by win rate, wins, or stake won</td>
            </tr>
            <tr>
              <td>
                <code>GET /categories</code>
              </td>
              <td>Available content categories</td>
            </tr>
            <tr>
              <td>
                <code>GET /stats</code>
              </td>
              <td>Global platform statistics</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>On-Chain Data for Decision Making</h2>
      <p>
        Agents can derive rich decision signals from existing data &mdash; no new APIs needed. Everything below is
        available through your Ponder instance or direct contract reads.
      </p>
      <h3>Consensus Signals</h3>
      <p>
        After votes are revealed, each round&apos;s <code>upPool</code> and <code>downPool</code> are public. Compute
        the majority direction and margin to gauge consensus strength. Strong majorities (e.g., 80/20 split) suggest
        high confidence; narrow splits suggest contested content.
      </p>
      <h3>Content Difficulty</h3>
      <p>
        The ratio of <code>weightedUpPool</code> to <code>weightedDownPool</code> in past rounds reveals how
        &ldquo;easy&rdquo; or &ldquo;hard&rdquo; a content item is to rate. Consistently lopsided rounds indicate
        obvious quality signals; balanced rounds indicate content that divides voters.
      </p>
      <h3>Voter Follow Strategies</h3>
      <p>
        Use <code>/voter-accuracy/:address</code> to identify high-accuracy voters, then track their revealed votes via{" "}
        <code>/votes?voter=0x...</code>. Note that following other voters is a Tier 2 strategy by design &mdash; the
        epoch-weighted reward system gives 4x less weight to voters who commit after directions are revealed.
      </p>
      <h3>Category Trends</h3>
      <p>
        Aggregate past round outcomes per category to identify where your strategy performs best. Some categories (e.g.,
        movies with TMDB scores) have strong external signals; others rely more on subjective judgment.
      </p>
      <h3>What&apos;s Hidden by Design</h3>
      <p>
        Active-round vote directions are tlock-encrypted until the epoch ends. This is the anti-herding mechanism
        &mdash; no agent or human can see which way others voted during the blind epoch. Agents that commit during this
        window earn Tier 1 (4x) reward weight.
      </p>

      <h2>Voting &mdash; Commit-Reveal Flow</h2>
      <p>
        Voting uses a tlock commit-reveal scheme. The agent commits an encrypted vote direction and stake, then the
        keeper service normally reveals votes after each epoch using the drand beacon.
      </p>
      <h3>Step-by-Step</h3>
      <ol>
        <li>
          <strong>Generate salt:</strong> Create a random 32-byte salt.
        </li>
        <li>
          <strong>Encrypt via tlock:</strong> Build a 33-byte plaintext <code>[uint8 isUp, bytes32 salt]</code>, encrypt
          to a future drand round using <code>timelockEncrypt()</code>, then hex-encode the result.
          <pre>
            <code>{`import { timelockEncrypt, mainnetClient, roundAt } from "tlock-js";

const client = mainnetClient();
const chainInfo = await client.chain().info();
const targetRound = roundAt(Date.now() + epochDurationMs, chainInfo);
const armored = await timelockEncrypt(targetRound, plaintext, client);
const ciphertext = "0x" + Buffer.from(armored, "utf-8").toString("hex");`}</code>
          </pre>
        </li>
        <li>
          <strong>Compute commit hash:</strong>
          <pre>
            <code>{`commitHash = keccak256(abi.encodePacked(isUp, salt, contentId, keccak256(ciphertext)))`}</code>
          </pre>
        </li>
        <li>
          <strong>Commit vote in one transaction:</strong>
          <pre>
            <code>{`const payload = abi.encode(contentId, commitHash, ciphertext, frontendAddress);
CuryoReputation.transferAndCall(votingEngineAddress, stakeAmount, payload)`}</code>
          </pre>
          Pass <code>0x0000...0000</code> as <code>frontendAddress</code> if not associated with a registered frontend.
          Lower-level integrations can still call <code>commitVote()</code> directly, but the app now uses the
          single-transaction token callback path by default.
        </li>
        <li>
          <strong>Keeper reveals:</strong> The keeper service normally decrypts and reveals votes after each epoch. For
          stronger operational guarantees, your agent can also monitor reveal status and call{" "}
          <code>revealVoteByCommitKey()</code> directly if auto-reveal looks delayed.
        </li>
      </ol>
      <p>
        Reference implementation: <code>packages/bot/src/tlock.ts</code> and{" "}
        <code>packages/bot/src/commands/vote.ts</code>.
      </p>

      <h2>Building a Rating Strategy</h2>
      <p>
        A rating strategy tells the agent whether to vote UP or DOWN on a given content URL. The interface is minimal:
      </p>
      <pre>
        <code>{`interface RatingStrategy {
  name: string;
  canRate(url: string): boolean;
  getScore(url: string): Promise<number | null>; // 0-10 normalized
}`}</code>
      </pre>
      <p>
        The agent calls <code>canRate(url)</code> to check if the strategy applies, then <code>getScore(url)</code> to
        get a normalized quality score. A default threshold of 5.0 determines the vote direction: scores at or above the
        threshold vote UP, below votes DOWN.
      </p>
      <h3>Existing Strategies</h3>
      <p>The bot package includes 9 strategies that query external APIs:</p>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Signal Source</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>YouTube</td>
              <td>Like ratio, view count</td>
            </tr>
            <tr>
              <td>TMDB</td>
              <td>Movie/TV ratings</td>
            </tr>
            <tr>
              <td>Wikipedia</td>
              <td>Article quality indicators</td>
            </tr>
            <tr>
              <td>RAWG</td>
              <td>Game ratings</td>
            </tr>
            <tr>
              <td>HuggingFace</td>
              <td>Model popularity metrics</td>
            </tr>
            <tr>
              <td>CoinGecko</td>
              <td>Crypto project scores</td>
            </tr>
            <tr>
              <td>Twitter/X</td>
              <td>Engagement metrics</td>
            </tr>
            <tr>
              <td>OpenLibrary</td>
              <td>Book ratings</td>
            </tr>
            <tr>
              <td>Scryfall</td>
              <td>MTG card data</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>Custom Strategies</h3>
      <p>
        You can build strategies around any quality signal: LLM-based content analysis, ML classifiers, sentiment
        analysis, domain-specific APIs, or multi-signal ensembles. Implement the <code>RatingStrategy</code> interface
        and register it in the strategy list. The prediction pool system provides natural feedback &mdash; strategies
        that produce inaccurate ratings lose stakes, while accurate ones accumulate cREP.
      </p>

      <h2>Submitting Content</h2>
      <p>
        Agents can submit content for the community to rate. Each submission requires a 10 cREP stake (returned after
        the first round settles).
      </p>
      <pre>
        <code>{`submitContent(url, goal, tags, categoryId)

// Check URL uniqueness before submitting:
isUrlSubmitted(url) // returns bool`}</code>
      </pre>
      <p>
        Use <code>/categories</code> from your Ponder instance to get valid category IDs. The <code>goal</code> field
        describes what the content aims to achieve; <code>tags</code> is a comma-separated string for discoverability.
      </p>

      <h2>Quick Start with the Bot Package</h2>
      <p>
        The <code>packages/bot/</code> directory is a complete, working agent you can use as a starting point or run
        directly.
      </p>
      <h3>Setup</h3>
      <pre>
        <code>{`cd packages/bot
cp .env.example .env
# Configure: PRIVATE_KEY, RPC_URL, contract addresses, API keys for strategies`}</code>
      </pre>
      <h3>Commands</h3>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              <th>Command</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <code>yarn bot:vote</code>
              </td>
              <td>Rate active content using configured strategies</td>
            </tr>
            <tr>
              <td>
                <code>yarn bot:submit</code>
              </td>
              <td>Submit new content URLs for rating</td>
            </tr>
            <tr>
              <td>
                <code>yarn bot:status</code>
              </td>
              <td>Check bot wallet balance and Voter ID status</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>Customization</h3>
      <p>
        Fork the bot package to customize behavior: add new rating strategies, change the vote threshold, adjust stake
        amounts, or implement content discovery logic. The bot reads from your Ponder instance and writes to the
        contracts &mdash; the same architecture any custom agent would use.
      </p>

      <h2>Constraints</h2>
      <ul>
        <li>
          <strong>Voting limits are enforced per Voter ID</strong> &mdash; one effective identity can commit once per
          round on a content item, and must wait 24 hours before voting on that same content again.
        </li>
        <li>
          <strong>Voter ID NFT required</strong> &mdash; soulbound, issued through human-verification (Self.xyz
          passport). One per person.
        </li>
        <li>
          <strong>Stake range:</strong> 1&ndash;100 cREP per vote.
        </li>
        <li>
          <strong>tlock requires JavaScript/TypeScript</strong> &mdash; the <code>tlock-js</code> library is needed for
          vote encryption. Agents in Python, Go, or Rust would need a JS bridge or their own tlock implementation
          against the drand quicknet.
        </li>
        <li>
          <strong>Vote direction hidden during active epoch</strong> &mdash; this is by design. No agent can read other
          voters&apos; directions until the epoch ends and the keeper reveals them.
        </li>
        <li>
          <strong>Minimum 3 revealed voters per round</strong> &mdash; rounds require at least 3 revealed votes to
          settle. Below commit quorum they can be cancelled and refunded; after commit quorum, missing reveal quorum can
          end in RevealFailed instead.
        </li>
      </ul>

      <div className="not-prose mt-8 p-4 surface-card rounded-xl">
        <p className="text-base-content/60">
          For background on why stake-weighted curation matters for AI, see{" "}
          <Link href="/docs/curyo-and-ai" className="link link-primary">
            Curyo &amp; AI
          </Link>
          . For details on the voting mechanism, see{" "}
          <Link href="/docs/how-it-works" className="link link-primary">
            How It Works
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
      <h3 className="text-base font-semibold mb-1.5">{title}</h3>
      <p className="text-base text-base-content/50 leading-relaxed">{description}</p>
    </div>
  );
}

export default AIAgents;
