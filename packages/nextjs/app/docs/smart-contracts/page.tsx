import type { NextPage } from "next";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";

const SmartContracts: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Smart Contracts</h1>
      <p className="lead text-base-content/60 text-lg">
        Technical reference for the Curyo smart contract architecture.
      </p>

      <h2>Architecture</h2>
      <p>
        All core contracts use <strong>UUPS upgradeable proxies</strong> (except CuryoReputation, VoterIdNFT,
        HumanFaucet, and CategoryRegistry which are non-upgradeable).
      </p>
      <p>
        The current production surface also includes one stateless helper contract, <code>SubmissionCanonicalizer</code>
        , plus the protocol libraries used by the registries and voting engine.
      </p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Contract</th>
              <th>Role</th>
              <th>Upgradeable</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-mono text-[#EF476F]">CuryoReputation</td>
              <td>ERC-20 token (cREP) with governance voting power and flash-loan protection</td>
              <td>No</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">VoterIdNFT</td>
              <td>Soulbound ERC-721 representing verified human identity (sybil resistance)</td>
              <td>No</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>Content lifecycle: submission, dormancy, rating updates, slashing</td>
              <td>UUPS</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>Core voting: tlock commit-reveal voting, epoch-weighted rewards, deterministic settlement</td>
              <td>UUPS</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RoundRewardDistributor</td>
              <td>Pull-based reward claiming for settled rounds</td>
              <td>UUPS</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">FrontendRegistry</td>
              <td>Frontend operator registration and fee distribution</td>
              <td>UUPS</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">CategoryRegistry</td>
              <td>Category/platform management via governance proposals</td>
              <td>No</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ParticipationPool</td>
              <td>Halving-tier participation rewards used by submitter and voter reward claims</td>
              <td>No</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ProfileRegistry</td>
              <td>On-chain user profiles with unique names, images, and public rating strategy text</td>
              <td>UUPS</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">HumanFaucet</td>
              <td>Sybil-resistant token distribution via Self.xyz passport verification</td>
              <td>No</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">SubmissionCanonicalizer</td>
              <td>Stateless URL/domain canonicalization helper used by ContentRegistry submissions</td>
              <td>No</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">CuryoGovernor</td>
              <td>On-chain governance with timelock (proposals, voting, execution)</td>
              <td>No</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RoundLib</td>
              <td>Library: round state management and settlement logic</td>
              <td>&mdash;</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RewardMath</td>
              <td>Library: pool split (82/5/10/2/1) and reward calculations</td>
              <td>&mdash;</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">CategoryFeeLib</td>
              <td>Library: category-fee routing for settled rounds</td>
              <td>&mdash;</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">SubmitterStakeLib</td>
              <td>Library: submitter stake return/slash policy helpers</td>
              <td>&mdash;</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">TokenTransferLib</td>
              <td>Library: narrow token transfer helpers used by reward settlement paths</td>
              <td>&mdash;</td>
            </tr>
          </tbody>
        </table>
      </div>

      <hr />

      <h2>CuryoReputation</h2>
      <p>
        ERC-20 token with ERC20Votes for governance, ERC20Permit for scoped approvals, and ERC-1363 transfer hooks for
        one-transaction voting. Fixed supply of 100M with 6 decimals.
      </p>
      <h3>Key Features</h3>
      <ul>
        <li>
          <strong>Governance voting power:</strong> Delegates can vote on proposals via CuryoGovernor.
        </li>
        <li>
          <strong>Governance lock:</strong> Tokens become non-transferable for 7 days when proposing or voting on
          governance proposals. This is a transfer lock, not a per-proposal escrowed bond.
        </li>
        <li>
          <strong>Flash-loan protection:</strong> Tracks first-receive block to prevent same-block vote attacks.
        </li>
        <li>
          <strong>Minting:</strong> Only <code>MINTER_ROLE</code> (HumanFaucet) can mint, up to <code>MAX_SUPPLY</code>.
        </li>
        <li>
          <strong>Single-tx voting:</strong> The production UI now uses <code>transferAndCall()</code> so cREP transfer
          and vote commit happen atomically in one wallet transaction.
        </li>
      </ul>
      <h3>Key Functions</h3>
      <ul>
        <li>
          <code>mint(to, amount)</code> &mdash; Mint tokens (MINTER_ROLE only).
        </li>
        <li>
          <code>lockForGovernance(account, amount)</code> &mdash; Lock tokens for 7 days (governor only).
        </li>
        <li>
          <code>getTransferableBalance(account)</code> &mdash; Returns balance minus locked amount.
        </li>
        <li>
          <code>transferAndCall(votingEngine, amount, payload)</code> &mdash; Default vote path used by the app. Sends
          cREP stake to the voting engine and atomically commits the encrypted vote payload.
        </li>
      </ul>

      <hr />

      <h2>VoterIdNFT</h2>
      <p>
        Soulbound (non-transferable) ERC-721 representing a verified human identity. Minted by HumanFaucet upon
        successful Self.xyz passport verification. Token ID 0 is reserved (indicates no Voter ID).
      </p>
      <h3>Sybil Resistance</h3>
      <p>
        VoterIdNFT is required by most contracts to perform actions: submitting content, voting, registering frontends,
        creating profiles, and submitting categories. It also enforces a per-Voter-ID stake cap of{" "}
        <strong>100 cREP per content per round</strong>, preventing a single identity from dominating any vote.
      </p>
      <h3>Key Functions</h3>
      <ul>
        <li>
          <code>mint(holder, nullifier)</code> &mdash; Mint a new Voter ID (authorized minters only, e.g., HumanFaucet).
        </li>
        <li>
          <code>revokeVoterId(holder)</code> &mdash; Revoke a Voter ID (owner/governance).
        </li>
        <li>
          <code>recordStake(contentId, roundId, tokenId, amount)</code> &mdash; Record stake against a Voter ID (voting
          engine only).
        </li>
        <li>
          <code>hasVoterId(address)</code> / <code>getTokenId(address)</code> &mdash; Check identity status (resolves
          delegates transparently).
        </li>
      </ul>
      <h3>Delegation</h3>
      <p>
        VoterIdNFT supports delegation: an SBT holder (cold wallet) can authorize a delegate (hot wallet) to act on
        their behalf. The delegate transparently passes all Voter ID checks without holding an SBT. See the{" "}
        <a href="/docs/delegation">Delegation &amp; Security</a> docs for setup instructions and security
        recommendations.
      </p>
      <ul>
        <li>
          <code>setDelegate(address)</code> &mdash; Authorize a delegate (holder only).
        </li>
        <li>
          <code>removeDelegate()</code> &mdash; Revoke delegate authorization (holder only).
        </li>
        <li>
          <code>resolveHolder(address)</code> &mdash; Returns the effective SBT holder for an address.
        </li>
      </ul>

      <hr />

      <h2>ContentRegistry</h2>
      <p>
        Manages content lifecycle. Each item has a unique ID and content hash stored on-chain; full URL and metadata are
        emitted via events.
      </p>
      <p>
        Submission canonicalization is delegated to <code>SubmissionCanonicalizer</code>, which normalizes supported
        platform URLs into a deterministic submission key before duplicate checks are applied.
      </p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Status</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Active</span>
              </td>
              <td>Accepting votes. Default state after submission.</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Dormant</span>
              </td>
              <td>No activity for 30 days. Can be revived up to 2 times (expires after 90 days).</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Cancelled</span>
              </td>
              <td>Voluntarily removed by the submitter (1 cREP cancellation fee).</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Flagged</span>
              </td>
              <td>Removed by moderator for policy violations.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>Key Functions</h3>
      <ul>
        <li>
          <code>submitContent(url, title, description, tags, categoryId)</code> &mdash; Submit content (10 cREP stake).
          Requires Voter ID. Duplicate URLs are rejected, and the title plus description are emitted in the canonical{" "}
          <code>ContentSubmitted</code> event for indexers and alternate frontends.
        </li>
        <li>
          <code>cancelContent(contentId)</code> &mdash; Cancel own content (1 cREP fee to the configured
          cancellation-fee sink, treasury by default).
        </li>
        <li>
          <code>markDormant(contentId)</code> &mdash; Mark inactive content as dormant after 30 days. Permissionless;
          reverts if content has an active open round.
        </li>
        <li>
          <code>reviveContent(contentId)</code> &mdash; Revive dormant content (5 cREP, max 2 times).
        </li>
        <li>
          <code>updateRating(contentId, upWins, ratingDelta)</code> &mdash; Called by RoundVotingEngine after
          settlement. Rating is recalculated from the final revealed UP and DOWN stake pools using the protocol&apos;s
          smoothed stake-imbalance formula.
        </li>
      </ul>
      <h3>Submitter Stake</h3>
      <ul>
        <li>
          <strong>Grace period:</strong> 24 hours. No slash possible during this time.
        </li>
        <li>
          <strong>Slash:</strong> If a settled round establishes rating below 25 after grace period, 100% of stake goes
          to the treasury.
        </li>
        <li>
          <strong>Auto-return:</strong> After ~4 days once a settled round confirms rating stays above 25 and no later
          round remains open. If no round ever settles, the stake resolves when the content reaches dormancy after all
          open rounds have been closed.
        </li>
        <li>
          <strong>Submitter participation reward:</strong> Healthy submitter rewards are snapshotted when the stake
          returns. If the ParticipationPool is temporarily depleted, the remaining amount stays claimable later instead
          of being lost.
        </li>
      </ul>

      <hr />

      <h2>RoundVotingEngine</h2>
      <p>
        Manages per-content voting rounds with tlock commit-reveal voting, epoch-weighted rewards, and deterministic
        settlement. One-sided rounds (consensus) receive a subsidy from the consensus subsidy reserve.
      </p>
      <h3>Configuration</h3>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Value</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-mono">MIN_STAKE</td>
              <td>1 cREP</td>
              <td>Minimum vote stake</td>
            </tr>
            <tr>
              <td className="font-mono">MAX_STAKE</td>
              <td>100 cREP</td>
              <td>Maximum vote stake per Voter ID per round</td>
            </tr>
            <tr>
              <td className="font-mono">epochDuration</td>
              <td>{protocolDocFacts.blindPhaseDurationLabel}</td>
              <td>Duration of each reward tier</td>
            </tr>
            <tr>
              <td className="font-mono">maxDuration</td>
              <td>{protocolDocFacts.maxRoundDurationLabel}</td>
              <td>Maximum round lifetime &mdash; expired rounds can be cancelled</td>
            </tr>
            <tr>
              <td className="font-mono">minVoters</td>
              <td>{protocolDocFacts.minVotersLabel}</td>
              <td>Minimum revealed votes required before settlement is allowed</td>
            </tr>
            <tr>
              <td className="font-mono">maxVotersPerRound</td>
              <td>{protocolDocFacts.maxVotersLabel}</td>
              <td>Cap on voters per content per round (O(1) settlement)</td>
            </tr>
            <tr>
              <td className="font-mono">revealGracePeriod</td>
              <td>{protocolDocFacts.revealGracePeriodLabel}</td>
              <td>Time after each epoch during which all past-epoch votes must be revealed before settlement</td>
            </tr>
            <tr>
              <td className="font-mono">VOTE_COOLDOWN</td>
              <td>24 hours</td>
              <td>Time before the same effective voter ID can vote on the same content again</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>Key Functions</h3>
      <ul>
        <li>
          <code>
            CuryoReputation.transferAndCall(votingEngine, stakeAmount, abi.encode(contentId, commitHash, ciphertext,
            frontend))
          </code>{" "}
          &mdash; Default one-transaction vote flow. Transfers cREP and records the tlock-encrypted commit atomically.
          Direction is hidden until the epoch ends. Requires Voter ID and enforces the same 1&ndash;100 cREP stake
          bounds.
        </li>
        <li>
          <code>commitVote(...)</code> &mdash; Lower-level integration path for bots, tests, and direct contract callers
          that prefer explicit approvals instead of the default single-transaction transfer-and-call flow.
        </li>
        <li>
          <code>revealVoteByCommitKey(contentId, roundId, commitKey, isUp, salt)</code> &mdash; Reveal a previously
          committed vote after the epoch ends. Normally called by the keeper after off-chain drand/tlock decryption, but
          any caller that knows the plaintext <code>(isUp, salt)</code> can submit it. The production UI keeps this
          mostly hidden, but connected users also have a small manual fallback link if an auto-reveal appears delayed.
          The chain binds the reveal to the exact submitted ciphertext via <code>keccak256(ciphertext)</code>, but it
          still does not prove on-chain that the ciphertext was honestly decryptable. A future hardening path here would
          be zk-based reveal proofs.
        </li>
        <li>
          <code>settleRound(contentId, roundId)</code> &mdash; Settle the current round once at least{" "}
          <code>minVoters</code> votes are revealed and all past-epoch votes have been revealed (or their{" "}
          {protocolDocFacts.revealGracePeriodLabel} reveal grace period has expired). Determines winners based on
          epoch-weighted stakes, splits reward pools, and updates content rating.
        </li>
        <li>
          <code>RoundRewardDistributor.claimFrontendFee(contentId, roundId, frontend)</code> &mdash; Frontend operators
          claim their proportional share of the 1% frontend fee pool. Pull-based, permissionless. Historical fee shares
          still follow the commit-time approval snapshot, but if the frontend is slashed or underbonded at claim time,
          the claim is redirected to the protocol instead of accruing to the operator.
        </li>
        <li>
          <code>RoundRewardDistributor.claimParticipationReward(contentId, roundId)</code> &mdash; Voters claim
          participation rewards (rate snapshotted at settlement time for fairness). Pull-based.
        </li>
        <li>
          <code>ContentRegistry.claimSubmitterParticipationReward(contentId)</code> &mdash; Claim the snapshotted
          submitter participation reward after a healthy stake return. Any amount the pool could already fund is
          reserved up front for that claim instead of depending entirely on future pool authorization state.
        </li>
        <li>
          <code>cancelExpiredRound(contentId, roundId)</code> &mdash; Cancel a round that exceeded maxDuration (
          {protocolDocFacts.maxRoundDurationLabel}) without reaching commit quorum (<code>minVoters</code> total
          commits). Refundable to participants.
        </li>
        <li>
          <code>finalizeRevealFailedRound(contentId, roundId)</code> &mdash; Finalize a round that reached commit
          quorum, but still failed to reach reveal quorum after voting closed and the final reveal grace deadline
          passed.
        </li>
        <li>
          <code>claimCancelledRoundRefund(contentId, roundId)</code> &mdash; Claim refund for a cancelled, tied, or
          reveal-failed round.
        </li>
      </ul>

      <hr />

      <h2>RoundRewardDistributor</h2>
      <p>
        Pull-based reward claiming. <strong>Not pausable</strong> &mdash; users can always withdraw their tokens.
      </p>
      <ul>
        <li>
          <code>claimReward(contentId, roundId)</code> &mdash; Claim settled-round voter payouts. Winners receive stake
          plus winnings; revealed losers receive a fixed {protocolDocFacts.revealedLoserRefundPercentLabel} rebate.
        </li>
        <li>
          <code>claimSubmitterReward(contentId, roundId)</code> &mdash; Claim submitter&apos;s 10% share.
        </li>
        <li>
          <code>sweepStrandedCrepToTreasury()</code> &mdash; Governance-only recovery path for any cREP mistakenly sent
          directly to the distributor.
        </li>
      </ul>

      <hr />

      <h2>FrontendRegistry</h2>
      <p>
        Manages frontend operator registration and fee distribution. Frontend operators stake a fixed 1,000 cREP and
        receive {protocolDocFacts.frontendShareLabel} for each settled two-sided round they facilitated votes in.
      </p>
      <h3>Key Functions</h3>
      <ul>
        <li>
          <code>register()</code> &mdash; Register as frontend operator (fixed 1,000 cREP stake). Requires Voter ID.
        </li>
        <li>
          <code>requestDeregister()</code> / <code>completeDeregister()</code> &mdash; Start voluntary exit, then
          withdraw stake + pending fees after the unbonding window elapses.
        </li>
        <li>
          <code>topUpStake(amount)</code> &mdash; Restore the fixed 1,000 cREP bond after a partial slash so governance
          can approve the frontend again.
        </li>
        <li>
          <code>approveFrontend(address)</code> / <code>revokeFrontend(address)</code> &mdash; Governance controls
          approval. Approval requires the full bond to be restored.
        </li>
        <li>
          <code>claimFees()</code> &mdash; Claim accumulated platform fees while healthy and fully bonded.
        </li>
        <li>
          <code>slashFrontend(address, amount, reason)</code> &mdash; Slash frontend stake (governance). Any already
          accrued frontend fees are confiscated to the protocol at the same time.
        </li>
      </ul>

      <hr />

      <h2>CategoryRegistry</h2>
      <p>
        Manages content categories. New categories require a governance proposal and on-chain vote for approval. Each
        category maps to a domain and includes subcategories and a ranking-question template.
      </p>
      <h3>Key Functions</h3>
      <ul>
        <li>
          <code>submitCategory(name, domain, subcategories, questionTemplate)</code> &mdash; Submit category for
          governance sponsorship (100 cREP stake). Requires Voter ID. Templates must include <code>{"{title}"}</code>{" "}
          and <code>{"{rating}"}</code>.
        </li>
        <li>
          <code>linkApprovalProposal(categoryId, descriptionHash)</code> &mdash; Link the separately created governor
          approval proposal to the pending category. Submitter only.
        </li>
        <li>
          <code>clearApprovalProposal(categoryId)</code> &mdash; Clear a linked approval proposal after it was canceled
          or expired so the submitter can retry or cancel.
        </li>
        <li>
          <code>cancelUnlinkedCategory(categoryId)</code> &mdash; Reclaim stake after 7 days if no approval proposal was
          linked.
        </li>
        <li>
          <code>approveCategory(categoryId)</code> &mdash; Approve after successful governance vote (timelock only).
        </li>
        <li>
          <code>rejectCategory(categoryId)</code> &mdash; Reject after a defeated vote (permissionless, checks proposal
          state).
        </li>
        <li>
          <code>addApprovedCategory(name, domain, subcategories, questionTemplate)</code> &mdash; Add category directly
          (ADMIN_ROLE, for bootstrapping). Templates must include <code>{"{title}"}</code> and <code>{"{rating}"}</code>
          .
        </li>
      </ul>

      <hr />

      <h2>ProfileRegistry</h2>
      <p>
        On-chain user profiles with unique names (3&ndash;20 characters), optional profile images, and an optional
        public rating strategy. Requires Voter ID.
      </p>
      <h3>Key Functions</h3>
      <ul>
        <li>
          <code>setProfile(name, imageUrl, strategy)</code> &mdash; Create or update profile. Names are case-insensitive
          unique, and <code>strategy</code> stores a short public note about how the user rates on Curyo.
        </li>
        <li>
          <code>getProfile(address)</code> &mdash; Get profile (name, imageUrl, strategy, createdAt, updatedAt).
        </li>
        <li>
          <code>getAddressByName(name)</code> &mdash; Reverse lookup: name to owner address.
        </li>
      </ul>

      <hr />

      <h2>HumanFaucet</h2>
      <p>
        Sybil-resistant token distribution using Self.xyz zero-knowledge passport verification. Five tiers from Genesis
        (10,000 cREP for the first 10 users) down to Settler (1 cREP), with each tier doubling in size while the claim
        halves. Referral bonuses are 50% of the claim amount for both claimant and referrer.
      </p>
      <p>
        On a successful claim, HumanFaucet also mints a <strong>VoterIdNFT</strong> for the claimant, enabling
        participation across the platform.
      </p>

      <hr />

      <h2>CuryoGovernor</h2>
      <p>
        OpenZeppelin Governor with timelock control. Uses cREP voting power (ERC20Votes). Tokens are locked for 7 days
        when proposing or casting votes.
      </p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Parameter</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Voting delay</td>
              <td>~1 day (7,200 blocks)</td>
            </tr>
            <tr>
              <td>Voting period</td>
              <td>~1 week (50,400 blocks)</td>
            </tr>
            <tr>
              <td>Proposal threshold</td>
              <td>100 cREP</td>
            </tr>
            <tr>
              <td>Quorum</td>
              <td>4% of circulating supply (min 10,000 cREP)</td>
            </tr>
            <tr>
              <td>Governance lock</td>
              <td>7 days transfer-locked (when proposing or voting)</td>
            </tr>
          </tbody>
        </table>
      </div>

      <hr />

      <h2>ParticipationPool</h2>
      <p>
        Distributes participation rewards to both voters and content submitters. Submitter rewards are paid immediately
        on content submission, while voter rewards are claimed after round settlement using the rate snapshotted at
        settlement time. Funded with 34M cREP. Uses a halving schedule: starting at 90% reward rate, halving each time a
        tier threshold is reached (2M, 6M, 14M, 30M cumulative), with a 1% floor rate.
      </p>

      <hr />

      <h2>Libraries</h2>
      <h3>RewardMath</h3>
      <ul>
        <li>
          <code>splitPoolAfterLoserRefund(losingPool)</code> &mdash; Reserve a 5% rebate for revealed losers, then split
          the remaining pool into 82% voters / 5% consensus subsidy / 10% submitter / 2% platform (1% frontend + 1%
          category) / 1% treasury.
        </li>
        <li>
          <code>calculateVoterReward(shares, totalWinningShares, voterPool)</code> &mdash; Share-proportional reward
          from the content-specific pool. 100% of the voter share goes to the content-specific pool.
        </li>
        <li>
          <code>calculateRating(totalUpStake, totalDownStake)</code> &mdash; Returns the final 0&ndash;100 rating using
          the protocol&apos;s smoothed stake-imbalance formula with a fixed 50 cREP parameter.
        </li>
      </ul>
      <h3>RoundLib</h3>
      <p>
        Helpers for round state management: tracks round lifecycle (Open, Settled, Cancelled, Tied, RevealFailed) and
        settlement logic.
      </p>

      <hr />

      <h2>Security</h2>
      <ul>
        <li>
          <strong>UUPS Upgradeable:</strong> Core registries and voting contracts are upgradeable via UPGRADER_ROLE
          (governance timelock).
        </li>
        <li>
          <strong>Reentrancy Guard:</strong> All token-transferring functions use ReentrancyGuard.
        </li>
        <li>
          <strong>Flash-Loan Protection:</strong> CuryoReputation tracks first-receive block to prevent same-block vote
          attacks.
        </li>
        <li>
          <strong>Sybil Resistance:</strong> VoterIdNFT (soulbound) required for all user actions. Per-identity stake
          cap of 100 cREP per content per round.
        </li>
        <li>
          <strong>Governance Lock:</strong> Tokens are transfer-locked for 7 days when proposing or voting on
          governance. Proposal eligibility is checked from the prior voting-power snapshot, so the threshold is not a
          per-proposal bond and the same voting power can support multiple concurrent proposals.
        </li>
        <li>
          <strong>Pausable:</strong> ContentRegistry, RoundVotingEngine, and HumanFaucet can be paused.
          RoundRewardDistributor cannot be paused (users can always withdraw).
        </li>
        <li>
          <strong>Governance-First Access Control:</strong> The governance timelock holds DEFAULT_ADMIN_ROLE from
          deployment. The deployer receives only temporary setup roles (CONFIG_ROLE, MINTER_ROLE) with no ability to
          grant or escalate privileges. Ownable contracts (VoterIdNFT, HumanFaucet) restrict ownership transfer to the
          immutable governance address.
        </li>
      </ul>
    </article>
  );
};

export default SmartContracts;
