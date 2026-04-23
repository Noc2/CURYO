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
              <td>Seeded discovery category metadata</td>
              <td>No</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">ParticipationPool</td>
              <td>Halving-tier cREP Bootstrap Pool rewards used by voter reward claims</td>
              <td>No</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">QuestionRewardPoolEscrow</td>
              <td>Question-scoped cREP or USDC custody, voter rewards, and the frontend-operator reward share</td>
              <td>No</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">FeedbackBonusEscrow</td>
              <td>Question-scoped USDC bonuses for awarded voter feedback hashes</td>
              <td>Transparent</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">ProfileRegistry</td>
              <td>On-chain user profiles with unique names, images, and public self-reported audience context</td>
              <td>Transparent</td>
            </tr>
            <tr>
              <td className="font-mono text-primary">HumanFaucet</td>
              <td>Sybil-resistant token distribution via Self.xyz age, document, and sanctions verification</td>
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
              <td>Library: pool split (90/5/4/1) and reward calculations</td>
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
        successful Self.xyz passport or biometric ID verification for an eligible 18+ claimant. Token ID 0 is reserved
        (indicates no Voter ID).
      </p>
      <h3>Sybil Resistance</h3>
      <p>
        VoterIdNFT is required for voting, registering frontends, creating profiles, and creating categories. Question
        submission itself is permissionless and uses bounty funding instead of Voter ID. VoterIdNFT also enforces a
        per-Voter-ID stake cap of <strong>100 cREP per content per round</strong>, preventing a single identity from
        dominating any vote.
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
        ContentRegistry validates submitted media links against CategoryRegistry before deriving the question submission
        key from the submitted metadata. The docs now describe the question-first flow: a required context URL with
        optional image or YouTube preview media, plus a mandatory non-refundable bounty attached at submission in cREP
        or USDC.
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
          <code>submitQuestionWithRewardAndRoundConfig(..., rewardTerms, roundConfig, spec)</code> &mdash; Reserve a
          hidden question, then reveal it with the exact attached bounty terms, creator-selected round config, and two
          non-zero metadata hashes: <code>questionMetadataHash</code> and <code>resultSpecHash</code>. Question text is
          capped at 120 characters, the context/media submission key is checked for duplicates, and the question plus
          description are emitted in the canonical <code>ContentSubmitted</code> event for indexers and alternate
          frontends. The subjective template, rationale, and interpretation data stays off-chain; the contract only
          commits to its hashes and emits <code>QuestionSpecAnchored</code>. The hosted x402 route uses this same
          function after settling a Celo USDC payment from the bot wallet.
        </li>
        <li>
          <code>getContentRoundConfig(contentId)</code> &mdash; Returns the blind phase, maximum duration, settlement
          voters, and voter cap selected for that question. Existing submit functions without an explicit round config
          still use the governed default.
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
          <code>updateRatingState(contentId, roundId, referenceRatingBps, nextState)</code> &mdash; Called by
          RoundVotingEngine after settlement with the score-relative update derived from the round&apos;s snapshotted
          reference score, epoch-weighted revealed evidence, and conservative rating bound.
        </li>
      </ul>
      <h3>Submission Economics</h3>
      <p>
        Question submissions no longer carry refundable creator deposits or creator-side bootstrap rewards. The attached
        bounty is non-refundable and routes to eligible voters plus the eligible frontend operator.
      </p>

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
              <td>Default duration of each reward tier; question creators can select within governance bounds.</td>
            </tr>
            <tr>
              <td className="font-mono">maxDuration</td>
              <td>{protocolDocFacts.maxRoundDurationLabel}</td>
              <td>Default maximum round lifetime; question creators can select within governance bounds.</td>
            </tr>
            <tr>
              <td className="font-mono">minVoters</td>
              <td>{protocolDocFacts.minVotersLabel}</td>
              <td>Default minimum revealed votes required before settlement is allowed.</td>
            </tr>
            <tr>
              <td className="font-mono">maxVotersPerRound</td>
              <td>{protocolDocFacts.maxVotersLabel}</td>
              <td>Default cap on voters per content per round and upper bound for bounty voter requirements.</td>
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
          redeployed engine also snapshots <code>roundReferenceRatingBps</code> and emits{" "}
          <code>RoundConfigSnapshotted</code> per round so every frontend can recover the exact score anchor and round
          settings users voted against.
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
          <code>minVoters</code> votes from the round snapshot are revealed and all past-epoch votes have been revealed
          (or their {protocolDocFacts.revealGracePeriodLabel} reveal grace period has expired). Determines winners based
          on epoch-weighted stakes, splits bounties, and updates content rating from the round reference score using the
          governed score-relative rating model.
        </li>
        <li>
          <code>RoundRewardDistributor.claimFrontendFee(contentId, roundId, frontend)</code> &mdash; Frontend operators
          claim their proportional share of the 3% frontend fee pool. Pull-based and operator-only. Historical fee
          shares still follow the commit-time eligibility snapshot, but if the frontend is slashed or underbonded at
          claim time, governance can route the claim to the protocol instead of accruing it to the operator.
        </li>
        <li>
          <code>QuestionRewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId)</code> &mdash; Claim the USDC-backed
          bounty for a revealed voter. New bounties default to a 3% frontend-operator share, attributed from the vote
          commit; unpayable frontend shares remain with the voter claim.
        </li>
        <li>
          <code>FeedbackBonusEscrow.awardFeedbackBonus(poolId, recipient, feedbackHash, grossAmount)</code> &mdash; Pay
          an awarded feedback hash directly to a revealed, independent voter. The awarder pays this transaction, the
          recipient receives USDC immediately, and an eligible vote-attributed frontend receives the 3% share.
        </li>
        <li>
          <code>FeedbackBonusEscrow.forfeitExpiredFeedbackBonus(poolId)</code> &mdash; Send expired unawarded Feedback
          Bonus USDC to treasury.
        </li>
        <li>
          <code>RoundRewardDistributor.claimParticipationReward(contentId, roundId)</code> &mdash; Voters claim
          bootstrap rewards (rate snapshotted at settlement time for fairness). Pull-based.
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
        Governance-controlled address book and parameter store for <code>RoundVotingEngine</code>. Governance sets the
        default round config and creator bounds; each question then stores its selected config, and the engine snapshots
        that config plus reveal grace at round creation so mid-round governance changes do not change an already open
        round.
      </p>
      <ul>
        <li>
          <code>setConfig(epochDuration, maxDuration, minVoters, maxVoters)</code> &mdash; Update round parameters for
          future questions that use the default config.
        </li>
        <li>
          <code>setRoundConfigBounds(...)</code> and <code>validateRoundConfig(...)</code> &mdash; Define and enforce
          the allowed creator-selected range for blind phase, max duration, settlement voters, and voter cap.
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
          <code>claimParticipationReward(contentId, roundId)</code> &mdash; Claim the cREP bootstrap reward for eligible
          winning revealed voters, using the rate snapshotted at settlement.
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
        Stores simple seeded discovery categories. Categories are metadata used to help people find and interpret
        content; they do not require user staking or governance approval proposals.
      </p>
      <h3>Key Functions</h3>
      <ul>
        <li>
          <code>addCategory(name, slug, subcategories)</code> &mdash; Add seeded category metadata (ADMIN_ROLE).
        </li>
      </ul>

      <hr />

      <h2>ProfileRegistry</h2>
      <p>
        On-chain user profiles with unique names (3&ndash;20 characters) and optional public self-reported audience
        context. Profile settings also support an on-chain generated avatar color override. Requires Voter ID.
      </p>
      <h3>Key Functions</h3>
      <ul>
        <li>
          <code>setProfile(name, selfReport)</code> &mdash; Create or update profile. Names are case-insensitive unique,
          and <code>selfReport</code> stores public, self-reported, unverified audience context.
        </li>
        <li>
          <code>getProfile(address)</code> &mdash; Get profile (name, selfReport, createdAt, updatedAt).
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
        Claims require a supported credential, proof that the claimant is 18 or older, OFAC sanctions clearance, and the
        configured sanctioned-country exclusion check, currently covering Cuba, Iran, North Korea, and Syria. Five tiers
        run from Genesis (10,000 cREP for the first 10 users) down to Settler (1 cREP), with claim sizes stepping down
        10x at claimant thresholds 10 / 1,000 / 10,000 / 1,000,000. Referral bonuses are 50% of the claim amount for
        both claimant and referrer.
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
        Implements the user-facing Bootstrap Pool for voters. Voter rewards are claimed after round settlement using the
        rate snapshotted at settlement time. Funded with 12M cREP. Uses a halving schedule: starting at 90% reward rate,
        halving each time a tier threshold is reached (1.5M, 4.5M, 10.5M, 22.5M cumulative), with a 1% floor rate.
      </p>
      <p>
        Privileged sweeps of accounted bootstrap rewards are disabled; only reward accounting and surplus recovery move
        funds.
      </p>

      <hr />

      <h2>Libraries</h2>
      <h3>RewardMath</h3>
      <ul>
        <li>
          <code>splitPoolAfterLoserRefund(losingPool)</code> &mdash; Reserve a 5% rebate for revealed losers, then split
          the remaining pool into 90% voters / 5% consensus subsidy / 4% frontend / 1% treasury.
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
          <strong>Sybil Resistance:</strong> VoterIdNFT (soulbound) remains required for voting and other identity-gated
          actions. Per-identity stake cap of 100 cREP per content per round, plus question-first submission guardrails
          and claim gating. Question submission is the same for humans, bots, and delegated agents.
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
          roles from launch. The initial 32M treasury allocation also sits there, while the deployer receives only
          temporary setup roles and renounces them after deployment.
        </li>
      </ul>
    </article>
  );
};

export default SmartContracts;
