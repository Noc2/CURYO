import Link from "next/link";
import type { NextPage } from "next";
import { VotingFlowDiagram } from "~~/components/docs/VotingFlowDiagram";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";

const BlindVoting: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Blind Voting</h1>
      <p className="lead text-base-content/60 text-lg">
        How encrypted voting hides vote directions to prevent herding, with phase-weighted rewards that give early
        voters a {protocolDocFacts.earlyVoterAdvantageLabel} advantage.
      </p>

      <h2>Why Blind Voting?</h2>
      <p>
        Curyo uses <strong>blind voting</strong> to prevent herding &mdash; the tendency for later voters to copy the
        majority rather than assess quality independently. When you place a vote, your stake amount is visible on-chain,
        but your <strong>vote direction (up or down) is encrypted</strong> using time-locked encryption. No one can
        decrypt your vote direction until the blind phase ends.
      </p>
      <p>
        This ensures that during the blind phase, all voters are making predictions based on their own assessment of
        content quality. Combined with phase-weighted rewards, this creates a strong incentive structure that rewards
        independent judgment over bandwagoning.
      </p>

      <h2>The Voting Flow</h2>
      <div className="not-prose">
        <VotingFlowDiagram />
      </div>

      <h2>Phase-Weighted Rewards</h2>
      <p>
        Rewards are distributed based on <strong>phase-weighted effective stake</strong>, not raw stake amounts. The
        phase in which you place your vote determines your reward weight:
      </p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Phase</th>
              <th>When</th>
              <th>Reward Weight</th>
              <th>Effective Stake</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-mono">Blind phase</td>
              <td>First {protocolDocFacts.blindPhaseDurationLabel}</td>
              <td className="font-mono">{protocolDocFacts.blindPhaseWeightLabel}</td>
              <td>Full stake counts toward rewards</td>
            </tr>
            <tr>
              <td className="font-mono">Open phase</td>
              <td>After blind phase ends</td>
              <td className="font-mono">{protocolDocFacts.openPhaseWeightLabel}</td>
              <td>Only {protocolDocFacts.openPhaseWeightLabel} of stake counts toward rewards</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        This creates a <strong>{protocolDocFacts.earlyVoterAdvantageLabel} early-voter advantage</strong>. A blind phase
        voter staking 10 cREP has the same effective stake as an open phase voter staking 40 cREP. The system rewards
        conviction under uncertainty &mdash; voters who vote while directions are hidden take on more risk and are
        compensated accordingly.
      </p>

      <h2>How the Phases Work</h2>
      <p>
        Each blind phase lasts <strong>{protocolDocFacts.blindPhaseDurationLabel}</strong> (configurable by governance).
        When the first vote on a content item is placed, the round begins and the phase clock starts. During the blind
        phase, all vote directions are encrypted &mdash; no one can see which way anyone voted.
      </p>
      <p>
        After the blind phase ends, the decryption material for that time period becomes available. The keeper normally
        uses it to reveal eligible votes in the background, and connected users can self-reveal if needed. Revealing is
        also permissionless &mdash; anyone who knows the plaintext for a vote can reveal it after its blind phase ends.
      </p>
      <p>
        Votes placed after the blind phase (open phase) can see previously revealed directions, which is why they
        receive a lower reward weight. They have more information and take on less uncertainty.
      </p>

      <h2>Resolution</h2>
      <p>
        Resolution requires at least <strong>{protocolDocFacts.minVotersLabel} votes</strong> to be revealed (the
        minimum voter threshold). Once the threshold is reached, the round can be resolved once all past-epoch votes are
        revealed or their {protocolDocFacts.revealGracePeriodLabel} reveal grace period has expired. A keeper normally
        handles the reveal and settlement flow automatically, and connected users also have a small manual fallback if a
        reveal appears delayed. Resolution determines the majority side, splits the reward pools, and updates the
        content rating.
      </p>
      <p>
        Rounds that exceed the <strong>maximum duration</strong> ({protocolDocFacts.maxRoundDurationLabel}) without
        reaching commit quorum are cancelled and refundable. If commit quorum is reached but reveal quorum still never
        materializes by the final reveal grace deadline, the round can instead finalize as RevealFailed: revealed votes
        remain refundable, while unrevealed stakes are forfeited.
      </p>

      <h2>One-Sided Rounds (Consensus)</h2>
      <p>
        If all revealed voters agree (only up or only down votes) and the round resolves, an{" "}
        <strong>consensus subsidy</strong> triggers. The system pays a small subsidy from the consensus subsidy reserve
        to reward unanimous agreement, since there are no losing stakes to redistribute. This incentivizes voting on
        uncontroversial content where the &ldquo;correct&rdquo; answer is obvious.
      </p>

      <h2>Security Properties</h2>
      <ul>
        <li>
          <strong>Anti-herding (encrypted voting):</strong> Vote directions are encrypted using time-locked encryption.
          During the blind phase, no one can determine which way anyone voted, preventing bandwagon effects.
        </li>
        <li>
          <strong>Unpredictable reveal:</strong> The decryption key for each phase is unpredictable until it is
          published, ensuring no one can decrypt votes early.
        </li>
        <li>
          <strong>Identity verification:</strong> Voter IDs cap each verified person at 100 cREP per content per round,
          regardless of how many wallets they control.
        </li>
        <li>
          <strong>Vote cooldown:</strong> A 24-hour cooldown between votes on the same content prevents rapid re-voting
          and farming by coordinated groups.
        </li>
        <li>
          <strong>Open resolution:</strong> The automated service is fully stateless and holds no secrets. If the
          primary service goes down, anyone can reveal votes and trigger resolution using the publicly available
          decryption key.
        </li>
      </ul>

      <p>
        See <Link href="/docs/how-it-works">How It Works</Link> for the full round lifecycle and{" "}
        <Link href="/docs/tokenomics">Tokenomics</Link> for reward distribution details.
      </p>
    </article>
  );
};

export default BlindVoting;
