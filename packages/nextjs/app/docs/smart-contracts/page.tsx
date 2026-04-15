import type { NextPage } from "next";
import { protocolDocFacts } from "~~/lib/docs/protocolFacts";

const contractsSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/foundry/contracts";
const deploymentsSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/foundry/deployments";
const tsContractsSourceHref = "https://github.com/Noc2/CURYO/tree/main/packages/contracts";

const SmartContracts: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Smart Contracts</h1>
      <p className="lead text-base-content/60 text-lg">
        Technical reference for the Curyo smart contract architecture.
      </p>

      <h2>Architecture</h2>
      <p>
        The upgradeable control-plane contracts use <strong>transparent proxies</strong> managed by timelock-owned proxy
        admins: ContentRegistry, ProtocolConfig, RoundVotingEngine, RoundRewardDistributor, FrontendRegistry, and
        ProfileRegistry. Token, identity, faucet, participation, governance, and helper contracts are intentionally
        non-upgradeable.
      </p>
      <p>
        The current production surface also includes one stateless helper contract, <code>SubmissionCanonicalizer</code>
        , plus the protocol libraries used by the registries and voting engine.
      </p>
      <p>
        The Solidity sources live in{" "}
        <a href={contractsSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
          packages/foundry/contracts
        </a>
        , deployment artifacts live in{" "}
        <a href={deploymentsSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
          packages/foundry/deployments
        </a>
        , and the shared TypeScript ABIs and address helpers used by the app and SDK live in{" "}
        <a href={tsContractsSourceHref} target="_blank" rel="noopener noreferrer" className="link link-primary">
          packages/contracts
        </a>
        .
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
              <td className="font-mono text-primary">CuryoReputation</td>
              <td>ERC-20 token (cREP) with governance voting power, ERC-1363 hooks, and governance locks</td>
              <td>No</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">VoterIdNFT</td>
              <td>Soulbound ERC-721 representing verified human identity (sybil resistance)</td>
              <td>No</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">ContentRegistry</td>
              <td>Content lifecycle: submission, dormancy, rating updates, slashing</td>
              <td>Transparent</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">ProtocolConfig</td>
              <td>Governance-controlled address book and round configuration for RoundVotingEngine</td>
              <td>Transparent</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">RoundVotingEngine</td>
              <td>Core voting: tlock commit-reveal voting, epoch-weighted rewards, deterministic settlement</td>
              <td>Transparent</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">RoundRewardDistributor</td>
              <td>Pull-based reward claiming for settled rounds</td>
              <td>Transparent</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">FrontendRegistry</td>
              <td>Frontend operator registration and fee distribution</td>
              <td>Transparent</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">CategoryRegistry</td>
              <td>Category/platform management via governance proposals</td>
              <td>No</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">ParticipationPool</td>
              <td>Halving-tier participation rewards used by submitter and voter reward claims</td>
              <td>No</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">ProfileRegistry</td>
              <td>On-chain user profiles with unique names, images, and public rating strategy text</td>
              <td>Transparent</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">HumanFaucet</td>
              <td>Sybil-resistant token distribution via Self.xyz passport or biometric ID verification</td>
              <td>No</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">SubmissionCanonicalizer</td>
              <td>Stateless URL/domain canonicalization helper used by ContentRegistry submissions</td>
              <td>No</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">CuryoGovernor</td>
              <td>On-chain governance with timelock (proposals, voting, execution)</td>
              <td>No</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">RoundLib</td>
              <td>Library: round state management and settlement logic</td>
              <td>&mdash;</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">RewardMath</td>
              <td>Library: pool split (82/5/10/2/1) and reward calculations</td>
              <td>&mdash;</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">CategoryFeeLib</td>
              <td>Library: category-fee routing for settled rounds</td>
              <td>&mdash;</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">SubmitterStakeLib</td>
              <td>Library: submitter stake return/slash policy helpers</td>
              <td>&mdash;</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">TokenTransferLib</td>
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
          <strong>Snapshot-based governance:</strong> ERC20Votes provides historical voting-power snapshots for
          governance, while cREP transfer locks apply after proposing or voting.
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
        successful Self.xyz passport or biometric ID verification. Token ID 0 is reserved (indicates no Voter ID).
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
        their behalf for flows that accept delegated identities, notably content submission and voting. Holder-only
        actions such as frontend registration, profile management, and category submission still require the SBT holder
        address itself. Setup and security guidance now live in the <code>/settings?tab=delegation</code> flow.
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
              <td>
                No meaningful activity for 30 days. The original submitter can revive it up to 2 times during the 1-day
                exclusive revival window before the dormant key becomes releasable.
              </td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-secondary badge-sm">Cancelled</span>
              </td>
              <td>Voluntarily removed by the submitter (1 cREP cancellation fee).</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h3>Key Functions</h3>
      <ul>
        <li>
          <code>reserveSubmission(revealCommitment)</code>, then{" "}
          <code>submitContent(url, title, description, tags, categoryId, salt)</code> &mdash; Reserve a hidden content
          submission, then reveal it with a 10 cREP stake. Requires Voter ID. Duplicate URLs are rejected, and the title
          plus description are emitted in the canonical <code>ContentSubmitted</code> event for indexers and alternate
          frontends. Current frontends reserve <code>vertical:&lt;slug&gt;</code> tags for trust vertical discovery
          while keeping <code>categoryId</code> as the approved source/platform category.
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
          <code>reviveContent(contentId)</code> &mdash; Revive dormant content (5 cREP, max 2 times). Only the original
          submitter identity can do this, and only during the 1-day exclusive revival window.
        </li>
        <li>
          <code>updateRatingDirect(contentId, newRating)</code> &mdash; Called by RoundVotingEngine after settlement
          with the new rating data. In the planned redeploy, this becomes a richer score-relative update path fed by the
          round&apos;s snapshotted reference score, epoch-weighted revealed evidence, and conservative rating bound.
        </li>
      </ul>
      <h3>Submitter Stake</h3>
      <ul>
        <li>
          <strong>Grace period:</strong> 24 hours. No slash possible during this time.
        </li>
        <li>
          <strong>Slash:</strong> In the redesigned redeploy, submitter stake only becomes slashable once a conservative
          low-rating bound stays below the governed threshold after grace period and the content has accumulated enough
          evidence, enough settled rounds, and enough time below threshold.
        </li>
        <li>
          <strong>Auto-return:</strong> After ~4 days once a settled round confirms the conservative rating bound is
          healthy again and no later round remains open. If no round ever settles, the stake resolves when the content
          reaches dormancy after all open rounds have been closed.
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
        Manages per-content voting rounds with tlock commit-reveal voting, explicit drand metadata binding,
        epoch-weighted rewards, and deterministic settlement. One-sided rounds (consensus) receive a subsidy from the
        consensus subsidy reserve.
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
            CuryoReputation.transferAndCall(votingEngine, stakeAmount, abi.encode(contentId, roundReferenceRatingBps,
            commitHash, ciphertext, frontend, targetRound, drandChainHash))
          </code>{" "}
          &mdash; Default one-transaction vote flow. Transfers cREP and records the tlock-encrypted commit atomically.
          Direction is hidden until the epoch ends. Requires Voter ID and enforces the same 1&ndash;100 cREP stake
          bounds. The redeployed contract rejects malformed or non-armored ciphertexts, binds the canonical round
          reference score into the vote payload, and binds the reveal-target metadata on-chain.
        </li>
        <li>
          <code>commitVote(...)</code> &mdash; Lower-level integration path for bots, tests, and direct contract callers
          that prefer explicit approvals instead of the default single-transaction transfer-and-call flow.
        </li>
        <li>
          <strong>VoteCommitted event:</strong> emits the commit hash, <code>targetRound</code>, and{" "}
          <code>drandChainHash</code> so indexers can observe the exact reveal metadata attached to each vote. The
          planned redeploy also snapshots <code>roundReferenceRatingBps</code> per round so every frontend can recover
          the exact score anchor users voted against.
        </li>
        <li>
          <code>revealVoteByCommitKey(contentId, roundId, commitKey, isUp, salt)</code> &mdash; Reveal a previously
          committed vote after the epoch ends. This remains the keeper-assisted/self-reveal path: the keeper normally
          performs off-chain drand/tlock decryption after validating the stored stanza metadata and submits the reveal,
          but any caller that knows the plaintext <code>(isUp, salt)</code> can submit it. The production UI keeps this
          mostly hidden, but connected users also have a small manual fallback link if an auto-reveal appears delayed.
          The chain binds the reveal to the exact submitted ciphertext via <code>keccak256(ciphertext)</code> and now
          rejects malformed/non-armored commits on-chain, but it still does not prove on-chain that the ciphertext was
          honestly decryptable. A future hardening path here would be zk-based reveal proofs.
        </li>
        <li>
          <code>settleRound(contentId, roundId)</code> &mdash; Settle the current round once at least{" "}
          <code>minVoters</code> votes are revealed and all past-epoch votes have been revealed (or their{" "}
          {protocolDocFacts.revealGracePeriodLabel} reveal grace period has expired). Determines winners based on
          epoch-weighted stakes, splits reward pools, and updates content rating from the round reference score using
          the governed score-relative rating model.
        </li>
        <li>
          <code>RoundRewardDistributor.claimFrontendFee(contentId, roundId, frontend)</code> &mdash; Frontend operators
          claim their proportional share of the 3% frontend fee pool. Pull-based and operator-only. Historical fee
          shares still follow the commit-time eligibility snapshot, but if the frontend is slashed or underbonded at
          claim time, governance can route the claim to the protocol instead of accruing it to the operator.
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

      <h2>ProtocolConfig</h2>
      <p>
        Governance-controlled address book and parameter store for <code>RoundVotingEngine</code>. The engine snapshots
        round config and reveal grace period at round creation so mid-round governance changes do not change an already
        open round.
      </p>
      <ul>
        <li>
          <code>setConfig(epochDuration, maxDuration, minVoters, maxVoters)</code> &mdash; Update round parameters for
          future rounds.
        </li>
        <li>
          <code>setRevealGracePeriod(seconds)</code> &mdash; Update the grace period used for future round snapshots.
        </li>
        <li>
          <code>setRewardDistributor(...)</code>, <code>setFrontendRegistry(...)</code>,{" "}
          <code>setCategoryRegistry(...)</code>, <code>setVoterIdNFT(...)</code>, <code>setParticipationPool(...)</code>
          , and <code>setTreasury(...)</code> &mdash; Maintain the engine&apos;s governance-controlled address book.
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
          <code>topUpStake(amount)</code> &mdash; Restore the fixed 1,000 cREP bond after a partial slash so the
          frontend becomes fee-eligible again.
        </li>
        <li>
          <code>claimFees()</code> &mdash; Claim accumulated platform fees while healthy, fully bonded, and not exiting.
        </li>
        <li>
          <code>slashFrontend(address, amount, reason)</code> &mdash; Slash frontend stake (governance). Any already
          accrued frontend fees are confiscated to the protocol at the same time.
        </li>
      </ul>

      <hr />

      <h2>CategoryRegistry</h2>
      <p>
        Manages approved source/platform categories. New categories require a governance proposal and on-chain vote for
        approval. Each category maps to a domain and includes legacy subcategories. Public discovery verticals are an
        application/indexer taxonomy layered through reserved submission tags, not a separate contract registry.
      </p>
      <h3>Key Functions</h3>
      <ul>
        <li>
          <code>submitCategory(name, domain, subcategories)</code> &mdash; Submit category for governance sponsorship
          (500 cREP stake). Requires Voter ID.
        </li>
        <li>
          <code>linkApprovalProposal(categoryId, descriptionHash)</code> &mdash; Link the separately created governor
          approval proposal to the pending category. Submitter only, and only for proposals created after that
          submission.
        </li>
        <li>
          <code>clearApprovalProposal(categoryId)</code> &mdash; Clear a linked approval proposal after it was canceled
          or expired, or after it stayed succeeded but unqueued past the timeout, so the submitter can retry or cancel.
        </li>
        <li>
          <code>cancelUnlinkedCategory(categoryId)</code> &mdash; Reclaim stake after 7 days if no approval proposal was
          linked.
        </li>
        <li>
          <code>approveCategory(categoryId, descriptionHash, approvalDigest)</code> &mdash; Approve after successful
          governance vote for the exact linked proposal and current submission binding (timelock only).
        </li>
        <li>
          <code>rejectCategory(categoryId)</code> &mdash; Reject after a defeated vote (permissionless, checks proposal
          state).
        </li>
        <li>
          <code>addApprovedCategory(name, domain, subcategories)</code> &mdash; Add category directly (ADMIN_ROLE, for
          bootstrapping).
        </li>
      </ul>

      <hr />

      <h2>ProfileRegistry</h2>
      <p>
        On-chain user profiles with unique names (3&ndash;20 characters) and an optional public rating strategy. Profile
        settings also support an on-chain generated avatar color override. Requires Voter ID.
      </p>
      <h3>Key Functions</h3>
      <ul>
        <li>
          <code>setProfile(name, strategy)</code> &mdash; Create or update profile. Names are case-insensitive unique,
          and <code>strategy</code> stores a short public note about how the user rates on Curyo.
        </li>
        <li>
          <code>getProfile(address)</code> &mdash; Get profile (name, strategy, createdAt, updatedAt).
        </li>
        <li>
          <code>getAddressByName(name)</code> &mdash; Reverse lookup: name to owner address.
        </li>
        <li>
          <code>setAvatarAccent(rgb)</code> and <code>clearAvatarAccent()</code> &mdash; Set or remove the generated
          avatar color override.
        </li>
        <li>
          <code>getAvatarAccent(address)</code> &mdash; Read whether an avatar color override is set and the stored RGB
          value.
        </li>
      </ul>

      <hr />

      <h2>HumanFaucet</h2>
      <p>
        Sybil-resistant token distribution using Self.xyz zero-knowledge passport or biometric ID-card verification.
        Five tiers run from Genesis (10,000 cREP for the first 10 users) down to Settler (1 cREP), with claim sizes
        stepping down 10x at claimant thresholds 10 / 1,000 / 10,000 / 1,000,000. Referral bonuses are 50% of the claim
        amount for both claimant and referrer.
      </p>
      <p>
        On a successful claim, HumanFaucet attempts to mint a <strong>VoterIdNFT</strong> for the claimant, enabling
        participation across the platform. Governance can retry the mint if the claim succeeds but the NFT mint fails.
      </p>
      <p>Privileged sweeps of accounted faucet funds are disabled in the current launch hardening.</p>

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
              <td>{protocolDocFacts.governanceProposalThresholdLabel}</td>
            </tr>
            <tr>
              <td>Quorum</td>
              <td>{protocolDocFacts.governanceQuorumLabel}</td>
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
        Distributes participation rewards to both voters and content submitters. Voter rewards are claimed after round
        settlement using the rate snapshotted at settlement time. Submitter rewards are snapshotted only when a healthy
        submitter stake return resolves after a settled round. Funded with 34M cREP. Uses a halving schedule: starting
        at 90% reward rate, halving each time a tier threshold is reached (2M, 6M, 14M, 30M cumulative), with a 1% floor
        rate.
      </p>
      <p>
        Privileged sweeps of accounted participation rewards are disabled; only reward accounting and surplus recovery
        move funds.
      </p>

      <hr />

      <h2>Libraries</h2>
      <h3>RewardMath</h3>
      <ul>
        <li>
          <code>splitPoolAfterLoserRefund(losingPool)</code> &mdash; Reserve a 5% rebate for revealed losers, then split
          the remaining pool into 80% voters / 5% consensus subsidy / 10% submitter / 4% platform (3% frontend + 1%
          category) / 1% treasury.
        </li>
        <li>
          <code>calculateVoterReward(shares, totalWinningShares, voterPool)</code> &mdash; Share-proportional reward
          from the content-specific pool. 100% of the voter share goes to the content-specific pool.
        </li>
        <li>
          <code>calculateRating(totalUpStake, totalDownStake)</code> &mdash; Legacy deployments use this smoothed
          stake-imbalance helper. The planned redeploy replaces it with a dedicated score-relative rating math library
          that consumes the round reference score, epoch-weighted evidence, dynamic confidence, and conservative-bound
          logic.
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
          <strong>Transparent proxies:</strong> Core registries and voting contracts are upgradeable through
          timelock-owned proxy admins.
        </li>
        <li>
          <strong>Reentrancy protection:</strong> Core registry, voting, reward, frontend, category, and participation
          flows use reentrancy guards; HumanFaucet uses a dedicated claim lock.
        </li>
        <li>
          <strong>Snapshot-based governance:</strong> CuryoGovernor uses ERC20Votes snapshots for proposal voting power,
          and governance participation also applies a 7-day cREP transfer lock.
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
          <strong>Governance-owned access control:</strong> The governor/timelock owns upgrade, config, and treasury
          roles from launch. The initial 10M treasury allocation also sits there, while the deployer receives only
          temporary setup roles and renounces them after deployment.
        </li>
      </ul>
    </article>
  );
};

export default SmartContracts;
