import Link from "next/link";
import type { NextPage } from "next";
import { CommitRevealDiagram } from "~~/components/docs/CommitRevealDiagram";

const CommitReveal: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Commit-Reveal Scheme</h1>
      <p className="lead text-base-content/60 text-lg">
        How Curyo keeps votes private and tamper-proof using cryptographic commitments and timelock encryption.
      </p>

      <h2>Why Commit-Reveal?</h2>
      <p>
        On a public blockchain, every transaction is visible to everyone. Without protection, voters could see how
        others are voting and simply copy the majority &mdash; a problem known as <strong>herding</strong> or{" "}
        <strong>bandwagoning</strong>. Traders could <strong>front-run</strong> votes by watching the mempool and
        adjusting their own position before a transaction confirms.
      </p>
      <p>
        The commit-reveal scheme solves this by splitting each vote into two phases. During the <strong>commit</strong>{" "}
        phase, votes are encrypted and hidden from everyone. During the <strong>reveal</strong> phase, votes are
        decrypted and verified. No one &mdash; not even the voter themselves &mdash; can peek at other votes before the
        epoch ends.
      </p>

      <h2>The Three Phases</h2>
      <div className="not-prose">
        <CommitRevealDiagram />
      </div>

      <h2>Phase 1 &mdash; Commit</h2>

      <h3>What the Voter Does</h3>
      <p>
        Choose whether a content&apos;s rating will go <strong>UP</strong> or <strong>DOWN</strong>, then select a stake
        amount (1&ndash;100 cREP per Voter ID). Click vote. That&apos;s it &mdash; the rest happens automatically.
      </p>

      <h3>Under the Hood</h3>
      <ol>
        <li>
          A <strong>random 32-byte salt</strong> is generated in your browser.
        </li>
        <li>
          A <strong>commit hash</strong> is computed: <code>keccak256(abi.encodePacked(isUp, salt, contentId))</code>.
          This binds your vote to a specific content and direction.
        </li>
        <li>
          The vote data (direction + salt + content ID) is <strong>encrypted using tlock</strong>, targeting a future
          drand round that corresponds to the epoch end time within the current round.
        </li>
        <li>
          The commit hash and encrypted ciphertext are sent to the <strong>RoundVotingEngine smart contract</strong>{" "}
          on-chain.
        </li>
        <li>
          Your cREP stake is transferred and <strong>locked in the contract</strong>.
        </li>
        <li>
          The salt is <strong>backed up in your browser&apos;s localStorage</strong> as a recovery fallback.
        </li>
      </ol>

      <h3>Why the Salt Matters</h3>
      <p>
        Without the salt, there are only two possible votes per content: UP or DOWN. An attacker could simply hash both
        options and compare to the on-chain commit hash to reveal the vote instantly. The random 32-byte salt makes this
        computationally infeasible &mdash; there are 2<sup>256</sup> possible salts, making brute-force reversal
        impossible.
      </p>

      <h2>Phase 2 &mdash; Reveal</h2>

      <h3>Automatic Decryption</h3>
      <p>
        After each 15-minute epoch within a round ends, the <strong>drand beacon</strong> publishes the randomness for
        the target round. This randomness acts as the decryption key. Reveals happen <strong>per-epoch</strong>, not
        per-round &mdash; as each epoch completes, its votes can be decrypted independently. A stateless keeper
        automatically fetches the drand beacon and decrypts every vote&apos;s ciphertext. No action is needed from
        voters, and no secret reveal data is sent to the keeper.
      </p>

      <h3>Visible Inter-Epoch Tallies</h3>
      <p>
        After each epoch&apos;s votes are revealed, the tallies become <strong>publicly visible</strong>. This means
        participants can see the running vote counts and directions from prior epochs while the round remains open. Only
        votes within the <strong>current epoch</strong> remain hidden until that epoch ends.
      </p>

      <h3>Hash Verification</h3>
      <p>
        For each decrypted vote, the smart contract recomputes{" "}
        <code>keccak256(abi.encodePacked(isUp, salt, contentId))</code> and verifies it matches the original commit hash
        stored on-chain. This proves the voter did not change their vote between commit and reveal. If the hash
        doesn&apos;t match, the reveal is rejected.
      </p>

      <h3>Permissionless Reveal</h3>
      <p>
        The <code>revealVote</code> function is <strong>permissionless</strong> &mdash; anyone can call it, not just the
        original voter. Since all encrypted ciphertexts are stored on-chain and the drand beacon is public, anyone can
        decrypt and reveal any vote once the epoch ends. The keeper is fully stateless and holds no secrets. Voters do
        not need to come back online or take any action.
      </p>

      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Data</th>
              <th>During Commit</th>
              <th>After Reveal</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Vote direction</td>
              <td>Hidden in ciphertext</td>
              <td>Extracted &amp; verified</td>
            </tr>
            <tr>
              <td>Salt</td>
              <td>Hidden in ciphertext</td>
              <td>Extracted &amp; verified</td>
            </tr>
            <tr>
              <td>Content ID</td>
              <td>Visible (tx parameter)</td>
              <td>Matches commit hash</td>
            </tr>
            <tr>
              <td>Commit hash</td>
              <td>Stored on-chain</td>
              <td>Recomputed &amp; matched</td>
            </tr>
            <tr>
              <td>Stake amount</td>
              <td>Visible (token transfer)</td>
              <td>Unchanged</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Timelock Encryption (tlock)</h2>

      <h3>What is drand?</h3>
      <p>
        <strong>drand</strong> (Distributed Randomness Beacon) is a decentralized network that produces publicly
        verifiable random values at fixed intervals. Curyo uses the <strong>Quicknet</strong> network, which emits a new
        random value every <strong>3 seconds</strong>. Each value is tied to a specific &ldquo;round number&rdquo; and
        can be independently verified by anyone.
      </p>

      <h3>How tlock Works</h3>
      <p>
        tlock uses the mathematical property that a future drand round&apos;s randomness can serve as a decryption key.
        When encrypting a vote, the system targets the drand round that will be published at the epoch&apos;s end time.
        The resulting ciphertext can <strong>only be decrypted once that round&apos;s randomness is published</strong>.
        Until then, the data is cryptographically sealed &mdash; no one, not even the voter, can decrypt it early.
      </p>

      <h3>Why Not a Trusted Third Party?</h3>
      <p>
        Traditional commit-reveal schemes often rely on a centralized server to hold encryption keys. This introduces a
        single point of failure: the server operator could peek at votes early, selectively withhold decryption, or be
        compromised. tlock eliminates this entirely &mdash; the decryption key is the drand beacon itself, produced by a
        decentralized network of independent operators. No single entity controls it.
      </p>

      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Beacon network</td>
              <td>drand Quicknet</td>
            </tr>
            <tr>
              <td>Round interval</td>
              <td className="font-mono">3 seconds</td>
            </tr>
            <tr>
              <td>Genesis time</td>
              <td className="font-mono">2023-08-23 15:09:27 UTC</td>
            </tr>
            <tr>
              <td>Round formula</td>
              <td className="font-mono">floor((timestamp &minus; genesis) / 3) + 1</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Phase 3 &mdash; Settlement</h2>
      <p>
        Settlement occurs when <strong>&ge;3 votes</strong> have been revealed across all epochs in the round. Anyone
        can call <code>settleRound()</code> once enough revealed votes exist. The side with the larger total stake wins.
        Unrevealed votes from past epochs forfeit their stake. Unrevealed votes from the current (still-open) epoch are
        refunded. Rounds that do not reach 3 revealed votes within <strong>1 week</strong> are cancelled with a full
        refund to all participants. The round lifecycle is simplified: <strong>Open</strong> &rarr;{" "}
        <strong>Settled</strong> / <strong>Cancelled</strong> / <strong>Tied</strong> (no grace period, no reveal
        pending state). Winners receive their original stake back plus a share of the losing pool. The content&apos;s
        rating is updated by 1&ndash;5 points toward the winning side &mdash; this is the{" "}
        <strong>only moment the rating changes</strong>. Cancelled and tied rounds leave the rating unchanged. See{" "}
        <Link href="/docs/how-it-works">How It Works</Link> for full reward distribution and rating details.
      </p>

      <h2>Security Properties</h2>
      <ul>
        <li>
          <strong>Vote privacy:</strong> Within each epoch, no one can see vote directions. The ciphertext is opaque
          until the drand round is published. After the epoch ends, revealed votes and tallies become publicly visible.
        </li>
        <li>
          <strong>No front-running:</strong> Within each epoch, all votes are hidden, so no one can adjust their
          position based on the current epoch&apos;s tally or pending transactions. Tallies from prior epochs in the
          same round are visible, which is by design.
        </li>
        <li>
          <strong>Commit binding:</strong> The keccak256 hash binds the vote to a specific direction, salt, and content
          ID. The voter cannot change their vote after committing.
        </li>
        <li>
          <strong>Brute-force resistance:</strong> The 32-byte random salt makes it computationally infeasible to
          reverse the commit hash, even though there are only 2 possible vote directions.
        </li>
        <li>
          <strong>Trustless decryption:</strong> No centralized party holds keys. The drand beacon is the decryption
          mechanism, operated by a decentralized network.
        </li>
        <li>
          <strong>Permissionless reveal:</strong> Anyone can reveal any vote after the epoch ends. Voters do not need to
          be online or take any action. The keeper is fully stateless.
        </li>
        <li>
          <strong>Sybil resistance:</strong> Voter ID NFTs cap each verified person at 100 cREP per content per round,
          regardless of how many wallets they control.
        </li>
        <li>
          <strong>Vote cooldown:</strong> A 24-hour cooldown between votes on the same content prevents rapid re-voting
          and farming by coordinated groups.
        </li>
      </ul>

      <h2>Edge Cases</h2>

      <h3>What if the Keeper Fails?</h3>
      <p>
        Since <code>revealVote</code> is permissionless and the keeper is fully stateless, anyone can run a keeper. All
        encrypted ciphertexts are stored on-chain and the drand beacon is public &mdash; no secret reveal data is
        needed. If the primary keeper goes down, any participant can decrypt and submit reveals. Rounds that do not
        reach 3 revealed votes within 1 week are cancelled with a full refund, so voters are never permanently stuck.
      </p>

      <h3>What if I Clear My Browser Storage?</h3>
      <p>
        The salt stored in localStorage is a backup only. Under normal operation, the keeper decrypts votes using the
        tlock ciphertext stored on-chain &mdash; it does not need your local salt. Your vote will still be revealed
        automatically regardless of your browser state.
      </p>

      <h3>Can Someone See How Others Voted?</h3>
      <p>
        Within the current epoch, the number of commit transactions is visible on-chain (since each{" "}
        <code>commitVote</code> call is a public transaction), but vote <strong>directions</strong> and stake
        distribution remain hidden. After each epoch ends and votes are revealed, both the vote counts{" "}
        <strong>and directions</strong> become publicly visible. This is by design &mdash; inter-epoch tallies are
        intentionally transparent to inform later voters while intra-epoch privacy prevents herding.
      </p>
    </article>
  );
};

export default CommitReveal;
