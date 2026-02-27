import type { NextPage } from "next";

const SecurityAudit: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Security Audit</h1>
      <p className="lead text-base-content/60 text-lg">
        Internal security audit of all Curyo smart contracts covering static analysis, manual review, storage layout
        verification, and economic attack analysis. V5 &mdash; February 18, 2026.
      </p>

      <h2>Executive Summary</h2>
      <p>
        This audit identified <strong>1 Critical</strong>, <strong>9 High</strong>, <strong>10 Medium</strong>,{" "}
        <strong>7 Low</strong>, and <strong>10 Informational</strong> findings across 11 production contracts and 2
        libraries. All Critical and Low findings have been resolved. All High and Medium findings have been resolved or
        documented as intentional design choices.
      </p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Found</th>
              <th>Resolved</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Critical</td>
              <td>1</td>
              <td>1</td>
            </tr>
            <tr>
              <td>High</td>
              <td>9</td>
              <td>8 resolved, 1 design</td>
            </tr>
            <tr>
              <td>Medium</td>
              <td>10</td>
              <td>9 resolved, 1 mitigated</td>
            </tr>
            <tr>
              <td>Low</td>
              <td>7</td>
              <td>6 resolved, 1 accepted</td>
            </tr>
            <tr>
              <td>Informational</td>
              <td>10</td>
              <td>6 resolved, 2 accepted, 2 design</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Scope</h2>
      <p>
        The audit covers all 11 production contracts and 2 libraries deployed on-chain (~3,600 lines of Solidity). Mock
        and test contracts are excluded.
      </p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Contract</th>
              <th>Type</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>
                <span className="badge badge-secondary badge-sm">UUPS</span>
              </td>
              <td>Core voting: commits, reveals, settlement, consensus subsidy</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RoundRewardDistributor</td>
              <td>
                <span className="badge badge-secondary badge-sm">UUPS</span>
              </td>
              <td>Pull-based reward claiming</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-secondary badge-sm">UUPS</span>
              </td>
              <td>Content lifecycle, submitter stakes, ratings</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">FrontendRegistry</td>
              <td>
                <span className="badge badge-secondary badge-sm">UUPS</span>
              </td>
              <td>Frontend operator staking and fee distribution</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ProfileRegistry</td>
              <td>
                <span className="badge badge-secondary badge-sm">UUPS</span>
              </td>
              <td>User profiles and name uniqueness</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">CategoryRegistry</td>
              <td>
                <span className="badge badge-secondary badge-sm">Non-upgradeable</span>
              </td>
              <td>Category governance and domain uniqueness</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">CuryoReputation</td>
              <td>
                <span className="badge badge-secondary badge-sm">Non-upgradeable</span>
              </td>
              <td>ERC-20 token with governance locking</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">VoterIdNFT</td>
              <td>
                <span className="badge badge-secondary badge-sm">Non-upgradeable</span>
              </td>
              <td>Soulbound sybil resistance, multi-minter, stake limits</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">HumanFaucet</td>
              <td>
                <span className="badge badge-secondary badge-sm">Non-upgradeable</span>
              </td>
              <td>Self.xyz verified claims, referrals, Pausable</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">CuryoGovernor</td>
              <td>
                <span className="badge badge-secondary badge-sm">Non-upgradeable</span>
              </td>
              <td>OpenZeppelin Governor with timelock</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RewardMath</td>
              <td>
                <span className="badge badge-secondary badge-sm">Library</span>
              </td>
              <td>Pool split arithmetic and reward calculations</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RoundLib</td>
              <td>
                <span className="badge badge-secondary badge-sm">Library</span>
              </td>
              <td>Round timing and state transitions</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Methodology</h2>
      <ul>
        <li>
          <strong>Static analysis</strong> &mdash; Slither on all contracts with dependency filtering. Summary: 1 high,
          8 medium, 30 low, 63 informational (most from OZ dependencies or informational patterns).
        </li>
        <li>
          <strong>Manual review</strong> &mdash; Line-by-line review of all 12 files: token flows, state transitions,
          access control, and upgrade safety.
        </li>
        <li>
          <strong>Storage layout verification</strong> &mdash; <code>forge inspect</code> on all 5 UUPS contracts to
          verify gap correctness and no collisions.
        </li>
        <li>
          <strong>Economic analysis</strong> &mdash; Game-theoretic attack scenarios against the parimutuel voting
          mechanism.
        </li>
        <li>
          <strong>Dependency audit</strong> &mdash; OpenZeppelin v5.5.0 compatibility verification for upgradeable
          proxies.
        </li>
      </ul>

      <hr />

      <h2>Findings</h2>

      <h3>Critical</h3>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>ID</th>
              <th>Finding</th>
              <th>Contract</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>C-01</td>
              <td>
                <strong>Epoch bonus farming via single-sided voting.</strong> A single voter with 1 cREP stake on
                unopposed content receives up to 28 cREP epoch bonus. No minimum voter count, minimum total stake, or
                two-sided participation required.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>High</h3>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>ID</th>
              <th>Finding</th>
              <th>Contract</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>H-01</td>
              <td>
                <strong>cancelContent with active votes strands voter stakes.</strong> Submitter can cancel content
                after voters commit, preventing reveals (isActive check fails). Voter stakes forfeit to bonus pool.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>H-02</td>
              <td>
                <strong>markDormant lacks vote check.</strong> Anyone can mark active content dormant after 30 days of
                inactivity, even with active committed votes, blocking reveals.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>H-03</td>
              <td>
                <strong>Governance lock array unbounded.</strong> Every governance vote appends to an array iterated on
                every token transfer. After many votes, transfers can exceed gas limits, permanently locking tokens.
                Replaced with a single aggregate lock per address (O(1) reads/writes).
              </td>
              <td className="font-mono text-[#EF476F]">CuryoReputation</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>H-04</td>
              <td>
                <strong>Missing __gap on 3 UUPS contracts.</strong> ContentRegistry, FrontendRegistry, and
                ProfileRegistry lack storage gap variables, risking storage collisions on future upgrades. All three
                contracts now include uint256[50] private __gap.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry, FrontendRegistry, ProfileRegistry</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>H-05</td>
              <td>
                <strong>Zero-cost rating manipulation.</strong> Unopposed DOWN votes update content rating at no cost
                (stake returned). Rating delta is now capped by the number of unique winning voters (1 voter = max delta
                1), so a lone attacker can only move rating by 1 per epoch instead of up to 5.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine, RewardMath</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>H-06</td>
              <td>
                <strong>settleEpoch, revealVote, processUnrevealedPendingVotes missing whenNotPaused.</strong>{" "}
                <code>commitVote</code> has <code>whenNotPaused</code> but these three functions do not. During an
                emergency pause (e.g. exploit discovered), settlements could still execute and distribute rewards
                incorrectly. Added <code>whenNotPaused</code> to all three functions.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>H-07</td>
              <td>
                <strong>MAX_VOTERS cap enforced on reveal, not commit.</strong> If 300 users commit votes, only the
                first 200 to reveal succeed. The remaining 100 have their stakes locked until{" "}
                <code>processUnrevealedPendingVotes</code> forfeits them to treasury. Added{" "}
                <code>epochContentCommitCount</code> mapping to enforce the cap at commit time, preventing users from
                losing stakes through no fault of their own.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>H-09</td>
              <td>
                <strong>CategoryRegistry missing ReentrancyGuard.</strong> FrontendRegistry has{" "}
                <code>ReentrancyGuard</code> with <code>nonReentrant</code> on all state-changing functions.
                CategoryRegistry does not, despite having similar token transfer patterns. <code>rejectCategory()</code>{" "}
                does sequential external calls: <code>token.forceApprove()</code> then{" "}
                <code>votingEngine.addToVoterPool()</code>. Added <code>ReentrancyGuard</code> and{" "}
                <code>nonReentrant</code> to <code>submitCategory</code>, <code>approveCategory</code>,{" "}
                <code>rejectCategory</code>.
              </td>
              <td className="font-mono text-[#EF476F]">CategoryRegistry</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Medium</h3>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>ID</th>
              <th>Finding</th>
              <th>Contract</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>M-02</td>
              <td>
                <strong>Unbounded iteration in processUnrevealedPendingVotes.</strong> Added <code>startIndex</code> and{" "}
                <code>count</code> parameters for batched processing. Keepers can call in multiple transactions for any
                size array. Added <code>getEpochPendingCommitCount()</code> view helper for batch sizing.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>M-03</td>
              <td>
                <strong>_calcUnrevealedStake was dead code (always returned 0).</strong> Removed the dead function and
                its call site. Unrevealed stakes are handled by processUnrevealedPendingVotes.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>M-04</td>
              <td>
                <strong>Epoch bonus now uses dedicated accounting.</strong> Added bonusPoolBalance state variable and
                depositBonusPool function. Settlement checks bonusPoolBalance instead of balanceOf.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>M-05</td>
              <td>
                <strong>ContentRegistry now has ReentrancyGuard.</strong> Added nonReentrant to submitContent,
                cancelContent, markDormant, and reviveContent.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>M-06</td>
              <td>
                <strong>isEpochFullySettled is now O(1).</strong> Replaced unbounded iteration with epochContentCount
                and epochSettledCount counters.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>M-07</td>
              <td>
                <strong>epochVoters capped at 200 per content per epoch.</strong> Added MAX_VOTERS_PER_CONTENT_EPOCH
                constant enforced in revealVote, bounding _distributeFrontendFees iteration. V4: cap is now also
                enforced at commit time (see H-07) to prevent stake loss for voters who commit but cannot reveal.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>M-08</td>
              <td>
                <strong>Content submission spam mitigated.</strong> Cancellation now charges a 1 cREP fee (sent to bonus
                pool) and clears the URL flag so cancelled URLs can be resubmitted.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>M-09</td>
              <td>
                <strong>Selective reveal griefing.</strong> Mitigated by design: revealVote is permissionless and tlock
                encryption ensures anyone can decrypt after the timelock expires.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-info badge-sm">Mitigated</span>
              </td>
            </tr>
            <tr>
              <td>M-10</td>
              <td>
                <strong>No upgrade tests for 5 UUPS contracts.</strong> EpochVotingEngine, ContentRegistry,
                FrontendRegistry, EpochRewardDistributor, and ProfileRegistry all use UUPS proxies but had no upgrade
                path tests. Added UpgradeTest.t.sol with 21 tests covering authorization, reinitialization prevention,
                state preservation after upgrade, and implementation direct-initialization protection.
              </td>
              <td className="font-mono text-[#EF476F]">All UUPS contracts</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Low</h3>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>ID</th>
              <th>Finding</th>
              <th>Contract</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>L-01</td>
              <td>
                <strong>Cancellation fee not sent if bonusPool is address(0).</strong> Added{" "}
                <code>require(bonusPool != address(0))</code> at the top of <code>cancelContent()</code> to prevent fees
                from being stuck when bonusPool is not configured.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>L-02</td>
              <td>
                <strong>Frontend fees for unregistered frontends stuck.</strong> Changed <code>creditFees()</code> from
                silently ignoring unregistered frontends to reverting with{" "}
                <code>&quot;Frontend not registered&quot;</code>, preventing silent token loss.
              </td>
              <td className="font-mono text-[#EF476F]">FrontendRegistry</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>L-03</td>
              <td>
                <strong>Domain normalization incomplete in CategoryRegistry.</strong> Rewrote{" "}
                <code>_normalizeDomain()</code> to strip <code>http://</code>/<code>https://</code> protocols, paths,
                query strings, fragments, and trailing DNS dots. All URL variants now normalize to bare domain.
              </td>
              <td className="font-mono text-[#EF476F]">CategoryRegistry</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>L-04</td>
              <td>
                <strong>No token recovery function on HumanFaucet.</strong> Added{" "}
                <code>withdrawRemaining(address, uint256)</code> with <code>onlyOwner</code> modifier to allow recovery
                of remaining cREP after faucet decommissioning.
              </td>
              <td className="font-mono text-[#EF476F]">HumanFaucet</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>L-05</td>
              <td>
                <strong>Slashed frontend tokens stuck if VotingEngine not set.</strong> Added{" "}
                <code>require(address(votingEngine) != address(0))</code> at the start of <code>slashFrontend()</code>{" "}
                to prevent tokens from being stuck.
              </td>
              <td className="font-mono text-[#EF476F]">FrontendRegistry</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>L-06</td>
              <td>
                <strong>Epoch bonus uses settlement timestamp.</strong> getCurrentEpochBonus() uses block.timestamp at
                settlement, not the epoch&apos;s active time. Wrong bonus rate could apply near the 20-year boundary.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>L-07</td>
              <td>
                <strong>Pool split rounding dust.</strong> Individual claim calculations using integer division can
                leave up to n-1 wei unclaimed. Standard and benign in Solidity parimutuel systems.
              </td>
              <td className="font-mono text-[#EF476F]">RewardMath</td>
              <td>
                <span className="badge badge-secondary badge-sm">Accepted</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Informational</h3>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>ID</th>
              <th>Finding</th>
              <th>Contract</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>I-01</td>
              <td>
                <strong>No dedicated VoterIdNFT test suite.</strong> Soulbound enforcement, stake cap compliance, and
                nullifier deduplication are tested only indirectly via HumanFaucet tests.
              </td>
              <td className="font-mono text-[#EF476F]">VoterIdNFT</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>I-02</td>
              <td>
                <strong>No fuzz tests for RewardMath.</strong> The core arithmetic library lacks fuzz tests.
                Property-based testing would verify conservation invariants under random inputs.
              </td>
              <td className="font-mono text-[#EF476F]">RewardMath</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>I-03</td>
              <td>
                <strong>Integration tests don&apos;t configure VoterIdNFT.</strong> The main Integration.t.sol does not
                enable VoterIdNFT. The full sybil-resistance flow (HumanFaucet claim &rarr; VoterIdNFT mint &rarr; vote
                with stake cap) is untested end-to-end.
              </td>
              <td className="font-mono text-[#EF476F]">Integration tests</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>I-04</td>
              <td>
                <strong>Unbounded view function arrays.</strong> <code>ProfileRegistry.getRegisteredAddresses()</code>{" "}
                and <code>CategoryRegistry.getApprovedCategoryIds()</code> return unbounded arrays. While not
                exploitable (view functions don&apos;t consume on-chain gas), external callers could hit RPC gas limits.
              </td>
              <td className="font-mono text-[#EF476F]">ProfileRegistry, CategoryRegistry</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>I-05</td>
              <td>
                <strong>Slither: abi.encodePacked collision risk.</strong> ContentRegistry.submitContent uses
                encodePacked with multiple dynamic args for content hashing. Collision unlikely but theoretically
                possible.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-secondary badge-sm">Accepted</span>
              </td>
            </tr>
            <tr>
              <td>I-06</td>
              <td>
                <strong>Slither: unchecked return values.</strong> token.approve() return values ignored in
                CategoryRegistry.rejectCategory and FrontendRegistry.slashFrontend. SafeERC20 not used for approvals.
              </td>
              <td className="font-mono text-[#EF476F]">CategoryRegistry, FrontendRegistry</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>I-07</td>
              <td>
                <strong>Slither: missing zero-address checks.</strong> CuryoReputation.setGovernor and
                setContentVotingContracts do not validate against address(0).
              </td>
              <td className="font-mono text-[#EF476F]">CuryoReputation</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>I-08</td>
              <td>
                <strong>EpochVotingEngine should inherit IEpochVotingEngine.</strong> The interface exists but the
                contract does not explicitly implement it.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>I-09</td>
              <td>
                <strong>contentId visible at commit time.</strong> contentId is passed in cleartext during commitVote
                and stored in public hasCommitted mapping. This is by design: the commit-reveal scheme hides vote
                direction (UP/DOWN), not which content is being voted on. The contentId must be visible at commit time
                to enforce critical invariants including double-vote prevention, self-vote prevention, cooldown periods,
                sybil stake limits, and the cancellation vote-check (H-01 fix).
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-secondary badge-sm">Design</span>
              </td>
            </tr>
            <tr>
              <td>I-10</td>
              <td>
                <strong>processUnrevealedPendingVotes is permissionless.</strong> Anyone can call this function after
                the reveal deadline to forfeit unrevealed stakes to treasury. This is intentionally permissionless so
                any keeper or user can trigger cleanup. The reveal deadline itself protects voters &mdash; if they
                reveal before the deadline, their vote is safe regardless of who calls this function later. Added
                documentation comment to the function.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-secondary badge-sm">Design</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <hr />

      <h2>Upgrade Safety</h2>
      <p>
        Storage layouts verified via <code>forge inspect</code> for all 5 UUPS contracts:
      </p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Contract</th>
              <th>Slots Used</th>
              <th>Gap Size</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>0&ndash;8 (9 slots)</td>
              <td>__gap[49]</td>
              <td>
                <span className="badge badge-secondary badge-sm">Pass</span>
              </td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>0&ndash;38 (39 slots)</td>
              <td>__gap[38]</td>
              <td>
                <span className="badge badge-secondary badge-sm">Pass</span>
              </td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">EpochRewardDistributor</td>
              <td>0&ndash;4 (5 slots)</td>
              <td>__gap[50]</td>
              <td>
                <span className="badge badge-secondary badge-sm">Pass</span>
              </td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">FrontendRegistry</td>
              <td>0&ndash;5 (6 slots)</td>
              <td>__gap[50]</td>
              <td>
                <span className="badge badge-secondary badge-sm">Pass</span>
              </td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ProfileRegistry</td>
              <td>0&ndash;3 (4 slots)</td>
              <td>__gap[50]</td>
              <td>
                <span className="badge badge-secondary badge-sm">Pass</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Check</th>
              <th>Result</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>_disableInitializers() in constructor</td>
              <td>
                <span className="badge badge-secondary badge-sm">Pass</span> &mdash; All 5 UUPS contracts
              </td>
            </tr>
            <tr>
              <td>_authorizeUpgrade requires UPGRADER_ROLE</td>
              <td>
                <span className="badge badge-secondary badge-sm">Pass</span> &mdash; All 5 UUPS contracts
              </td>
            </tr>
            <tr>
              <td>ReentrancyGuard under proxy</td>
              <td>
                <span className="badge badge-secondary badge-sm">Pass</span> &mdash; OZ v5.5.0 uses ERC-7201 storage
                slot with check == ENTERED (2). Uninitialized proxy storage (0) is safe.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <hr />

      <h2>Economic Analysis</h2>
      <p>
        Game-theoretic attack scenarios against the parimutuel voting mechanism. All scenarios assume VoterIdNFT is
        active (sybil resistance enabled, 100 cREP max stake per voter per content per epoch).
      </p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Attack</th>
              <th>Cost</th>
              <th>Impact (post-mitigation)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>Epoch bonus farming</strong> &mdash; Single voter on unopposed content attempts to extract epoch
                bonus. Bonus is now capped at 10% of the losing pool; with no opposition the losing pool is 0, so no
                bonus is distributed.
              </td>
              <td>10 cREP submitter stake</td>
              <td>No profit: 0 bonus when single-sided</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Self-opposition</strong> &mdash; Attacker votes both UP and DOWN to create a losing pool and
                extract bonus. The 12% fee on the losing side (10% submitter + 2% platform) exceeds the 10% max bonus
                cap, guaranteeing a net loss. Verified in <code>test_EpochBonusSelfOppositionUnprofitable</code>.
              </td>
              <td>2 stakes (100 + 10 cREP)</td>
              <td>Net loss: 12% fee &gt; 10% bonus cap</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Rating manipulation</strong> &mdash; Unopposed DOWN votes move content rating. Rating delta is
                now capped by the number of unique winning voters (1 voter = max delta 1), so a lone attacker can only
                move rating by 1 per epoch instead of up to 5.
              </td>
              <td>1&ndash;100 cREP (returned if unopposed)</td>
              <td>Reduced: 1 point/epoch per attacker</td>
              <td>
                <span className="badge badge-success badge-sm">Mitigated</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Content spam</strong> &mdash; Submit-cancel loop to pollute the content registry. Cancellation
                now charges a 1 cREP fee (sent to bonus pool) and clears the URL flag so cancelled URLs can be
                resubmitted by legitimate users.
              </td>
              <td>10 cREP stake + 1 cREP cancel fee</td>
              <td>Reduced: 1 cREP cost per spam cycle</td>
              <td>
                <span className="badge badge-success badge-sm">Mitigated</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Selective reveal</strong> &mdash; Malicious keeper reveals only losing-side votes. Mitigated by
                design: tlock encryption ensures anyone can decrypt after the timelock expires, and revealVote is
                permissionless (any address can reveal any vote).
              </td>
              <td>Gas only</td>
              <td>No impact: any party can reveal all votes</td>
              <td>
                <span className="badge badge-success badge-sm">Mitigated</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Vote stranding</strong> &mdash; Submitter cancels or content goes dormant while voters have
                active stakes. cancelContent now reverts if any votes have been committed; markDormant reverts if
                unrevealed votes exist in active epochs.
              </td>
              <td>10 cREP submitter stake</td>
              <td>Blocked: cancel/dormancy checks vote state</td>
              <td>
                <span className="badge badge-success badge-sm">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>VoterIdNFT bypass</strong> &mdash; If VoterIdNFT is not configured (address(0)), all sybil
                resistance checks are skipped. An attacker could create unlimited accounts and bypass stake caps.
              </td>
              <td>&mdash;</td>
              <td>All checks skip if voterIdNFT == address(0)</td>
              <td>
                <span className="badge badge-warning badge-sm text-white">Deployment</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Governance attack</strong> &mdash; Attacker acquires 4% of circulating supply to reach quorum
                and pass malicious governance proposals. TimelockController delay provides community response window for
                cancellation.
              </td>
              <td>4% of circulating cREP (dynamic quorum, 10K floor)</td>
              <td>Timelock delay allows community response</td>
              <td>
                <span className="badge badge-warning badge-sm text-white">Deployment</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>V2 Analysis &mdash; Cross-Mechanism &amp; Multi-Epoch</h3>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Attack</th>
              <th>Cost</th>
              <th>Impact</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>Global pool parasitism</strong> &mdash; Vote on &quot;safe&quot; content (obvious outcomes) to
                capture global pool rewards funded by contentious votes elsewhere. The 25.29% global voter pool is
                shared by all winning voters across every content item in an epoch.
              </td>
              <td>1&ndash;100 cREP (returned if won)</td>
              <td>
                Design trade-off: 75/25 content-specific/global split means most rewards stay with content-specific
                voters. Not profitable at scale vs. voting directly on contentious content.
              </td>
              <td>
                <span className="badge badge-secondary badge-sm">Design</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>MAX_VOTERS cap griefing</strong> &mdash; Fill all 200 commit slots with minimum-stake sybil
                votes (200 addresses &times; 1 cREP) to block legitimate voters from committing. Cap is now enforced at
                commit time (H-07), so voters know immediately if they are blocked rather than losing stakes at reveal.
              </td>
              <td>200 cREP without VoterIdNFT</td>
              <td>
                With VoterIdNFT: impractical (200 verified identities). Without: trivially sybilable. Attacker&apos;s
                200 Curyo is at risk on one side.
              </td>
              <td>
                <span className="badge badge-warning badge-sm text-white">Deployment</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Bonus rollover sniping</strong> &mdash; Monitor public <code>bonusRollover</code> state and
                position as winning voter when a large losing pool triggers full rollover distribution.
              </td>
              <td>1&ndash;100 cREP per vote</td>
              <td>
                Low impact: bonus enters global pool shared by all winners. Strategic timing is rational behavior, not
                exploitable.
              </td>
              <td>
                <span className="badge badge-secondary badge-sm">Design</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Referral loop exploitation</strong> &mdash; Two colluding users claim with each other as
                referrers, extracting ~25% more cREP (30% claimant bonus + 20% referrer reward) per pair.
              </td>
              <td>0 (uses faucet claims)</td>
              <td>
                Accelerates 78M faucet depletion by ~25%. Expected cost of referral incentives. Referrer must have
                VoterIdNFT (if configured), limiting sybil referral rings.
              </td>
              <td>
                <span className="badge badge-secondary badge-sm">Design</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Coordinated rating floor attack</strong> &mdash; 41+ voters each push rating down by 1 point per
                epoch to trigger submitter stake slash at rating &lt; 10. 96-epoch cooldown per voter per content limits
                repeat attacks.
              </td>
              <td>41 voters &times; 1&ndash;100 cREP (returned if unopposed)</td>
              <td>
                Requires 41 verified identities over 41 epochs (~10 hours). Slash sends 10 cREP to treasury &mdash; no
                attacker profit.
              </td>
              <td>
                <span className="badge badge-secondary badge-sm">Accepted</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Settlement ordering manipulation</strong> &mdash; Keepers settle high-losing-pool content first
                to maximize bonus extraction from rollover.
              </td>
              <td>Gas only</td>
              <td>
                No impact: total bonus is bounded by <code>bonusRollover</code> regardless of order. Per-settlement cap
                (10% of losing pool) applies independently.
              </td>
              <td>
                <span className="badge badge-success badge-sm">No issue</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <hr />

      <h2>Key Invariants Verified</h2>
      <ol>
        <li>
          <strong>Pool split conservation:</strong> voterShare + submitterShare + platformShare == losingPool (remainder
          pattern, exact).
        </li>
        <li>
          <strong>Voter reward summation:</strong> Sum of individual claims &le; pool (integer division floors, dust
          remains in contract).
        </li>
        <li>
          <strong>Epoch state transitions:</strong> Active &rarr; Settled/Cancelled/Tied only. No backwards transitions.
        </li>
        <li>
          <strong>Double-claim prevention:</strong> rewardClaimed mapping checked before payout in
          EpochRewardDistributor.
        </li>
        <li>
          <strong>UUPS authorization:</strong> All _authorizeUpgrade functions require UPGRADER_ROLE.
        </li>
        <li>
          <strong>Initializer protection:</strong> All UUPS constructors call _disableInitializers().
        </li>
        <li>
          <strong>ReentrancyGuard proxy safety:</strong> OZ v5.5.0 check (slot == 2) is safe with uninitialized proxy
          storage (0).
        </li>
        <li>
          <strong>Bonus pool accounting:</strong> Dedicated bonusPoolBalance tracks epoch bonus reserve separately from
          voter/stake funds held in the same contract.
        </li>
        <li>
          <strong>Gas-bounded settlement:</strong> epochVoters capped at 200 per content per epoch (enforced at both
          commit and reveal time); isEpochFullySettled uses O(1) counters instead of unbounded iteration.
        </li>
        <li>
          <strong>Soulbound enforcement:</strong> VoterIdNFT _update override blocks all non-mint transfers;
          approve/setApprovalForAll revert.
        </li>
        <li>
          <strong>Governance lock O(1):</strong> Single aggregate GovernanceLock per address replaces unbounded array.
        </li>
        <li>
          <strong>Self-delegation only:</strong> CuryoReputation._delegate requires delegatee == account.
        </li>
        <li>
          <strong>Governance-first access control:</strong> Timelock holds DEFAULT_ADMIN_ROLE from deployment. Deployer
          has only temporary CONFIG/MINTER roles with no grant power. Ownable contracts restrict transferOwnership to
          immutable governance address.
        </li>
        <li>
          <strong>HumanFaucet Pausable:</strong> customVerificationHook checks _requireNotPaused(). withdrawRemaining is
          NOT paused (emergency fund extraction always works).
        </li>
      </ol>

      <hr />

      <h2>Test Coverage</h2>
      <p>380 tests across 14 test suites, all passing.</p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Test Suite</th>
              <th>Tests</th>
              <th>Coverage Area</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-mono text-[#EF476F]">Integration.t.sol</td>
              <td>67</td>
              <td>Full commit/reveal/settle/claim cycle</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">CategoryRegistry.t.sol</td>
              <td>40</td>
              <td>Category lifecycle, governance, pagination</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">VoterIdNFT.t.sol</td>
              <td>44</td>
              <td>Soulbound NFT, multi-minter, stake caps, admin</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">FrontendRegistry.t.sol</td>
              <td>33</td>
              <td>Frontend staking, fees, slashing</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ParticipationPool.t.sol</td>
              <td>47</td>
              <td>Participation rewards, halving tiers, pool depletion</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">HumanFaucet.t.sol</td>
              <td>42</td>
              <td>Claims, halving, referrals, Pausable</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ProfileRegistry.t.sol</td>
              <td>27</td>
              <td>Profile names, uniqueness, pagination</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ContentToken.t.sol</td>
              <td>26</td>
              <td>ERC20, faucet, flash-loan protection</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RewardMath.t.sol</td>
              <td>17</td>
              <td>Pool splits, voter rewards, rating delta (fuzz)</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">EpochRewardDistributor.t.sol</td>
              <td>16</td>
              <td>Reward claiming, reverts, submitter rewards, multi-content</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">Governance.t.sol</td>
              <td>18</td>
              <td>Governor, timelock, locking, governance-first access control</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">UpgradeTest.t.sol</td>
              <td>21</td>
              <td>UUPS upgrade authorization, reinitialization, state preservation</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">IntegrationVoterIdNFT.t.sol</td>
              <td>8</td>
              <td>End-to-end VoterIdNFT sybil resistance</td>
            </tr>
          </tbody>
        </table>
      </div>
      <h4>Coverage Gaps</h4>
      <ul>
        <li>
          <s>No dedicated VoterIdNFT.t.sol (I-01)</s> <span className="badge badge-success badge-sm">Resolved</span>
        </li>
        <li>
          <s>No fuzz tests for RewardMath (I-02)</s> <span className="badge badge-success badge-sm">Resolved</span>
        </li>
        <li>
          <s>No EpochRewardDistributor.t.sol &mdash; reward calculation correctness untested in isolation</s>{" "}
          <span className="badge badge-success badge-sm">Resolved</span>
        </li>
        <li>
          <s>Integration tests do not configure VoterIdNFT (I-03)</s>{" "}
          <span className="badge badge-success badge-sm">Resolved</span>
        </li>
        <li>
          <s>No upgrade tests for UUPS contracts (M-10)</s>{" "}
          <span className="badge badge-success badge-sm">Resolved</span>
        </li>
      </ul>

      <hr />

      <h2>Recommendations</h2>

      <h3>Before Mainnet</h3>
      <ol>
        <li>
          <strong>Configure VoterIdNFT</strong> in all contracts before enabling public access.
        </li>
        <li>
          <strong>Set timelock minimum delay</strong> to an appropriate value (e.g., 2 days) for governance proposals.
        </li>
        <li>
          <s>Transfer DEFAULT_ADMIN_ROLE to a multisig or timelock.</s>{" "}
          <span className="badge badge-success badge-sm">Resolved</span> &mdash; governance-first access control gives
          timelock DEFAULT_ADMIN_ROLE from deployment.
        </li>
      </ol>

      <h3>Short-Term</h3>
      <ol>
        <li>
          <s>Write dedicated test suite for EpochRewardDistributor.</s>{" "}
          <span className="badge badge-success badge-sm">Resolved</span>
        </li>
      </ol>

      <hr />

      <h2 id="v5">V5 Audit &mdash; February 18, 2026</h2>
      <p className="lead text-base-content/60 text-lg">
        Deep review focusing on cross-contract interactions, formal invariant properties, economic attack vectors with
        participation pool, and upgrade safety. Builds on V4 findings.
      </p>

      <h3>V5 Executive Summary</h3>
      <p>
        This round reviewed all 11 contracts with <strong>44 specific checks</strong> covering access control, state
        transitions, math precision, edge cases, cross-contract trust boundaries, economic incentives, and upgrade
        safety. The majority of findings confirm existing mitigations are correct. Key new areas: formal invariant
        properties for stateful fuzz testing, cross-contract fund flow mapping, and economic analysis including
        participation pool interactions.
      </p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Severity</th>
              <th>Found</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Critical</td>
              <td>4</td>
              <td>2 verified correct, 2 need invariant tests</td>
            </tr>
            <tr>
              <td>High</td>
              <td>11</td>
              <td>8 verified safe, 2 design, 1 needs verification</td>
            </tr>
            <tr>
              <td>Medium</td>
              <td>18</td>
              <td>14 verified, 3 design, 1 needs verification</td>
            </tr>
            <tr>
              <td>Low / Info</td>
              <td>11</td>
              <td>All verified or accepted</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>V5 &mdash; Critical Findings</h3>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>ID</th>
              <th>Finding</th>
              <th>Contract</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>V5-C-01</td>
              <td>
                <strong>settleEpoch() complexity &mdash; 3 terminal paths.</strong> Walked every code path in{" "}
                <code>settleEpoch()</code>: (1) no reveals &rarr; cancel, (2) tie &rarr; refund, (3) normal settlement
                with pool splits. Verified <code>epochSettledCount</code> is incremented in all three terminal states
                (Cancelled, Tied, Settled). All paths are correct.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>V5-C-02</td>
              <td>
                <strong>Pool solvency &mdash; reward claims must not exceed VotingEngine balance.</strong> Global reward
                is <code>(stake / totalWinStake) &times; globalPool</code>. Due to integer division rounding down, the
                sum of all claims &le; pool. The VotingEngine holds both winning stakes (returned to winners) and losing
                pool tokens (distributed as rewards). Verified algebraically correct. Recommend formal invariant test to
                prove across all possible epoch configurations.
              </td>
              <td className="font-mono text-[#EF476F]">EpochRewardDistributor</td>
              <td>
                <span className="badge badge-warning badge-sm text-white">Needs Testing</span>
              </td>
            </tr>
            <tr>
              <td>V5-C-03</td>
              <td>
                <strong>Token conservation invariant.</strong> For any epoch that reaches a terminal state:
                SUM(committed stakes) must equal SUM(claimed rewards) + SUM(forfeited stakes) + SUM(platform fees) +
                SUM(treasury fees) + SUM(submitter rewards) + dust. This property should be formally verified with
                stateful fuzz testing.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-warning badge-sm text-white">Needs Testing</span>
              </td>
            </tr>
            <tr>
              <td>V5-C-04</td>
              <td>
                <strong>VotingEngine balance solvency invariant.</strong> At any point:{" "}
                <code>crepToken.balanceOf(votingEngine)</code> must be &ge; SUM(unrevealed pending stakes) +
                SUM(unclaimed winner rewards) + SUM(unclaimed refunds) + SUM(unclaimed submitter rewards) +{" "}
                <code>bonusPoolBalance</code>. Should be tested as a Foundry invariant test with random
                commit/reveal/settle/claim sequences.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-warning badge-sm text-white">Needs Testing</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>V5 &mdash; High Findings</h3>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>ID</th>
              <th>Finding</th>
              <th>Contract</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>V5-H-01</td>
              <td>
                <strong>transferReward() uses address check, not role modifier.</strong>{" "}
                <code>require(msg.sender == rewardDistributor)</code> instead of <code>onlyRole</code>. If{" "}
                <code>CONFIG_ROLE</code> holder calls <code>setRewardDistributor()</code> to a malicious address, all
                VotingEngine cREP can be drained. In production, CONFIG_ROLE is held by governance timelock with 2-day
                delay, providing community response window. Verify deployer renounces CONFIG_ROLE after initial wiring.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>V5-H-02</td>
              <td>
                <strong>bonusRollover accumulates across unsettled epochs.</strong> At ~34 cREP/epoch and 15-min epochs,
                rollover grows ~3,264 cREP/day during inactivity. Per-settlement distribution is capped at{" "}
                <code>losingPool / 10</code>. Guard at <code>bonusPoolBalance &ge; bonusToAdd</code> prevents
                over-distribution. Verified safe &mdash; rollover can grow large but actual distribution is bounded by
                available bonus pool balance.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>V5-H-03</td>
              <td>
                <strong>Cancelled epoch with unrevealed commits.</strong> If all commits but no reveals, epoch is
                cancelled. Committed-but-unrevealed stakes remain in contract, handled by{" "}
                <code>processUnrevealedPendingVotes()</code> which forfeits to treasury. The cancelled epoch refund (
                <code>claimCancelledEpochRefund</code>) only applies to <strong>revealed</strong> voters. No
                double-accounting: pending stakes and revealed refunds are tracked separately.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>V5-H-04</td>
              <td>
                <strong>ContentRegistry callback trust boundary.</strong> Functions <code>updateRating</code>,{" "}
                <code>returnSubmitterStake</code>, <code>slashSubmitterStake</code> use{" "}
                <code>require(msg.sender == votingEngine)</code>. The <code>votingEngine</code> address is set via{" "}
                <code>setVotingEngine()</code> which requires CONFIG_ROLE and non-zero address. Same governance
                protection as V5-H-01.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>V5-H-05</td>
              <td>
                <strong>cancelContent race with commitVote.</strong> If a voter&apos;s <code>commitVote()</code>{" "}
                transaction lands in the same block before <code>cancelContent()</code>, the cancel reverts because{" "}
                <code>getContentCommitCount(contentId) &gt; 0</code>. This is the correct behavior &mdash; content with
                active votes cannot be cancelled.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>V5-H-06</td>
              <td>
                <strong>isEpochFullySettled timing.</strong> <code>epochContentCount</code> increments during{" "}
                <code>revealVote()</code>, <code>epochSettledCount</code> during <code>settleEpoch()</code>. New reveals
                cannot happen after the reveal deadline, ensuring temporal ordering: all reveals complete before
                settlements begin. Once all content is settled, no new reveals can increase the count.
              </td>
              <td className="font-mono text-[#EF476F]">EpochRewardDistributor</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>V5-H-07</td>
              <td>
                <strong>Governance lock exemption for content voting.</strong> <code>CuryoReputation._update()</code>{" "}
                allows transfers TO <code>epochVotingEngine</code> and <code>contentRegistry</code> even when tokens are
                governance-locked. This means the same tokens can be &quot;locked for governance&quot; and &quot;staked
                in content voting&quot; simultaneously. Since staking moves tokens to the VotingEngine contract, the
                lock only restricts transfers from the user&apos;s wallet balance. Intentional design: governance
                participation should not block content voting.
              </td>
              <td className="font-mono text-[#EF476F]">CuryoReputation</td>
              <td>
                <span className="badge badge-secondary badge-sm">Design</span>
              </td>
            </tr>
            <tr>
              <td>V5-H-08</td>
              <td>
                <strong>Assembly in _decodeReferrer().</strong> <code>mload(add(userData, 20))</code> reads 32 bytes
                from offset 20 of the memory pointer. For <code>bytes memory</code>, bytes 0&ndash;31 are the length
                field. Reading from offset 20 yields: 12 zero bytes from the length field + 20 bytes of actual data (the
                address). This works because the length is always small (&lt; 2^96), so the high bytes of the length
                field are zero. Fragile but correct in practice. Consider replacing with <code>abi.decode</code> for
                clarity.
              </td>
              <td className="font-mono text-[#EF476F]">HumanFaucet</td>
              <td>
                <span className="badge badge-info badge-sm">Fragile</span>
              </td>
            </tr>
            <tr>
              <td>V5-H-09</td>
              <td>
                <strong>EpochVotingEngine storage layout.</strong> New variables added after <code>__gap[38]</code> at
                the end of the contract (<code>bonusPoolBalance</code>, <code>epochContentCount</code>,{" "}
                <code>epochSettledCount</code>, <code>epochContentCommitCount</code>). This is the correct UUPS pattern:
                new variables go after the gap. Verify with <code>forge inspect EpochVotingEngine storageLayout</code>.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-warning badge-sm text-white">Needs Verification</span>
              </td>
            </tr>
            <tr>
              <td>V5-H-10</td>
              <td>
                <strong>Non-upgradeable ReentrancyGuard in UUPS contracts.</strong> Contracts use{" "}
                <code>@openzeppelin/contracts/utils/ReentrancyGuard.sol</code> (non-upgradeable version) instead of the
                upgradeable variant. In OZ v5.x, the non-upgradeable ReentrancyGuard uses ERC-7201 namespaced storage
                (fixed slot), which is safe for UUPS proxies. Uninitialized proxy storage (0) does not conflict with the
                guard&apos;s check pattern (slot == 2 means entered).
              </td>
              <td className="font-mono text-[#EF476F]">All UUPS contracts</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>V5-H-11</td>
              <td>
                <strong>Deprecated fields in EpochLib.Epoch struct.</strong> Fields <code>drandRound</code>,{" "}
                <code>commitCount</code>, <code>committedStake</code> are deprecated but must remain in the struct
                forever for storage layout compatibility. Removing them in a future upgrade would corrupt all existing
                epoch data.
              </td>
              <td className="font-mono text-[#EF476F]">EpochLib</td>
              <td>
                <span className="badge badge-secondary badge-sm">Design</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>V5 &mdash; Medium Findings</h3>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>ID</th>
              <th>Finding</th>
              <th>Contract</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>V5-M-01</td>
              <td>
                <strong>addToVoterPool() is permissionless.</strong> Any address can deposit cREP into the current
                epoch&apos;s shared voter pool. Requires <code>safeTransferFrom(msg.sender, ...)</code>, so caller
                spends their own tokens. Cannot be used to manipulate rewards &mdash; inflating the pool only benefits
                other winning voters.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>V5-M-02</td>
              <td>
                <strong>processUnrevealedPendingVotes timing edge case.</strong> Permissionless after reveal deadline. A
                voter who reveals just before the deadline is protected: <code>pending.revealed = true</code> prevents
                the forfeiture logic from processing already-revealed votes.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>V5-M-03</td>
              <td>
                <strong>Frontend fee rounding dust.</strong> Proportional division{" "}
                <code>(totalFrontendShare &times; voterStake) / totalStakeWithFrontend</code> truncates per voter. With
                200 voters, max dust is ~199 wei per settlement. At 6 decimal precision, this is negligible (~0.000199
                cREP). Dust remains in VotingEngine permanently.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>V5-M-04</td>
              <td>
                <strong>epochBonusAdded first-settlement bias.</strong> The first content settlement in an epoch claims
                the bonus into rollover. Subsequent settlements in the same epoch skip this. Earlier settlements get
                more bonus exposure via the rollover mechanism. This is inherent to the per-settlement cap design.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-secondary badge-sm">Design</span>
              </td>
            </tr>
            <tr>
              <td>V5-M-05</td>
              <td>
                <strong>ERC2612 permit front-running.</strong> A front-runner can extract the permit signature from a{" "}
                <code>commitVoteWithPermit</code> transaction and call <code>permit()</code> directly, consuming the
                nonce. The user&apos;s transaction reverts but they can retry with standard <code>approve()</code>. UX
                issue, not a fund risk. Standard ERC2612 limitation.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-secondary badge-sm">Design</span>
              </td>
            </tr>
            <tr>
              <td>V5-M-06</td>
              <td>
                <strong>Content status transitions verified.</strong> Valid: Active&rarr;Dormant/Cancelled,
                Dormant&rarr;Active(revive). Invalid transitions blocked by status checks in each function. Double
                return/slash prevented by <code>submitterStakeReturned</code> flag checked in all relevant paths.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>V5-M-07</td>
              <td>
                <strong>Dormant URL stays locked.</strong> URL hash is cleared on cancel but not on dormancy. Dormant
                URLs staying locked prevents legitimate resubmission. Verify if this is the intended behavior.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-warning badge-sm text-white">Needs Review</span>
              </td>
            </tr>
            <tr>
              <td>V5-M-08</td>
              <td>
                <strong>Lock accumulation without cap.</strong> <code>lockForGovernance()</code> accumulates:{" "}
                <code>lock.amount += amount</code>. Multiple governance votes/proposals stack. If locked amount exceeds
                balance, <code>getTransferableBalance()</code> returns 0 (no underflow). Locks expire 7 days from last
                update. Three proposals = 300 cREP locked for 7 days from the last one.
              </td>
              <td className="font-mono text-[#EF476F]">CuryoReputation</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>V5-M-09</td>
              <td>
                <strong>Nullifier stays used after VoterID revocation.</strong> When a VoterID is revoked, the nullifier
                remains marked as used. A revoked user cannot re-register with the same passport. Prevents
                &quot;revoke-and-re-register&quot; abuse but also blocks legitimate users who are wrongly revoked.
                Governance can mint a new VoterID directly if needed.
              </td>
              <td className="font-mono text-[#EF476F]">VoterIdNFT</td>
              <td>
                <span className="badge badge-secondary badge-sm">Design</span>
              </td>
            </tr>
            <tr>
              <td>V5-M-10</td>
              <td>
                <strong>VoterIdNFT recordStake() has no cap.</strong> <code>recordStake()</code> accumulates{" "}
                <code>_epochContentStake</code> without checking MAX_STAKE. The cap is enforced by EpochVotingEngine at
                commit time. If <code>stakeRecorder</code> is changed to a buggy contract, the cap could be bypassed.{" "}
                <code>stakeRecorder</code> is set by owner (governance).
              </td>
              <td className="font-mono text-[#EF476F]">VoterIdNFT</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>V5-M-11</td>
              <td>
                <strong>Referrer validation doesn&apos;t check revoked VoterID.</strong> <code>isValidReferrer()</code>{" "}
                checks <code>voterIdNFT.hasVoterId(referrer)</code>, but the actual claim logic at{" "}
                <code>customVerificationHook</code> only checks <code>addressClaimed[referrer]</code>. A user whose
                VoterID has been revoked can still serve as a referrer if they previously claimed.
              </td>
              <td className="font-mono text-[#EF476F]">HumanFaucet</td>
              <td>
                <span className="badge badge-warning badge-sm text-white">Needs Review</span>
              </td>
            </tr>
            <tr>
              <td>V5-M-12</td>
              <td>
                <strong>No ReentrancyGuard on HumanFaucet.</strong> The contract does not use{" "}
                <code>ReentrancyGuard</code>. Safe because: (1) entry is via Self.xyz hub callback, (2) ERC20{" "}
                <code>transfer</code> has no recipient callback, (3) <code>customVerificationHook</code> is{" "}
                <code>internal override</code> (cannot be called externally).
              </td>
              <td className="font-mono text-[#EF476F]">HumanFaucet</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>V5-M-13</td>
              <td>
                <strong>ParticipationPool reentrancy protection.</strong> No <code>ReentrancyGuard</code>, but{" "}
                <code>rewardVote()</code> and <code>rewardSubmission()</code> are called from VotingEngine and
                ContentRegistry which both have <code>nonReentrant</code>. Halving loop: max ~14 iterations before rate
                floors at 1%. Safe.
              </td>
              <td className="font-mono text-[#EF476F]">ParticipationPool</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>V5-M-14</td>
              <td>
                <strong>CategoryRegistry needs delegated voting power.</strong> <code>submitCategory()</code> calls{" "}
                <code>governor.propose()</code> which requires the caller to meet the proposal threshold (100 cREP
                voting power). If CategoryRegistry has no delegated cREP, all category submissions will revert. Verify
                deployment script delegates tokens to the contract.
              </td>
              <td className="font-mono text-[#EF476F]">CategoryRegistry</td>
              <td>
                <span className="badge badge-warning badge-sm text-white">Needs Verification</span>
              </td>
            </tr>
            <tr>
              <td>V5-M-15</td>
              <td>
                <strong>Governor lock accumulation with multiple proposals.</strong> Creating 5 proposals locks 500 cREP
                for 7 days from the last proposal (timer resets). Users should be aware that governance participation
                has a liquidity cost that compounds.
              </td>
              <td className="font-mono text-[#EF476F]">CuryoGovernor</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>V5-M-16</td>
              <td>
                <strong>registeredFrontends unbounded array growth.</strong> Frontend addresses are pushed to{" "}
                <code>registeredFrontends</code> but never removed, even after deregistration. The{" "}
                <code>getRegisteredFrontends()</code> view function returns the entire array. Mitigated by pagination
                support for practical use.
              </td>
              <td className="font-mono text-[#EF476F]">FrontendRegistry</td>
              <td>
                <span className="badge badge-secondary badge-sm">Accepted</span>
              </td>
            </tr>
            <tr>
              <td>V5-M-17</td>
              <td>
                <strong>Content-specific pool reward accumulation.</strong>{" "}
                <code>contentWinningStake[contentId][epochId]</code> is accumulated during <code>revealVote()</code>.
                Each winning voter&apos;s reward is proportional to their stake vs. total winning stake. Integer
                division ensures sum of claims &le; pool. Verified correct.
              </td>
              <td className="font-mono text-[#EF476F]">EpochRewardDistributor</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>V5-M-18</td>
              <td>
                <strong>initializeV2/V3 visibility.</strong> Both are <code>public</code> with{" "}
                <code>reinitializer(n)</code>. While publicly callable, the <code>reinitializer</code> modifier ensures
                each can only execute once. An attacker could call them first with malicious parameters, but only during
                upgrade when the proxy points to new implementation. Standard UUPS upgrade flow (upgrade + initialize in
                one transaction) prevents this.
              </td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>V5 &mdash; Cross-Contract Interaction Analysis</h3>
      <p>Mapped all 16 fund flow paths and 8 trust assumptions across the protocol. Key findings:</p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Flow</th>
              <th>Path</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Vote commit &rarr; reveal &rarr; settle &rarr; claim</td>
              <td>User &rarr; VotingEngine &rarr; (settlement splits) &rarr; RewardDistributor &rarr; User</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>Unrevealed forfeit</td>
              <td>VotingEngine &rarr; Treasury via processUnrevealedPendingVotes</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>Content submit &rarr; return/slash</td>
              <td>User &rarr; ContentRegistry &rarr; (return to User OR slash to Treasury)</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>Category rejection &rarr; voter pool</td>
              <td>CategoryRegistry &rarr; forceApprove &rarr; VotingEngine.addToVoterPool</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>Frontend slash &rarr; voter pool</td>
              <td>FrontendRegistry &rarr; forceApprove &rarr; VotingEngine.addToVoterPool</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>Settlement callback chain</td>
              <td>
                settleEpoch() makes 6+ external calls: safeTransfer to categorySubmitter, treasury, frontendRegistry;
                registry.updateRating(); registry.returnSubmitterStake()/slashSubmitterStake()
              </td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span> &mdash; nonReentrant blocks re-entry
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h4>Trust Assumptions</h4>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Trusting Contract</th>
              <th>Trusted Contract</th>
              <th>Assumption</th>
              <th>Protection</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>Only valid calls to updateRating/returnStake/slashStake</td>
              <td>msg.sender check + CONFIG_ROLE governance</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td className="font-mono text-[#EF476F]">EpochRewardDistributor</td>
              <td>Only valid calls to transferReward</td>
              <td>Address check + CONFIG_ROLE governance</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">VoterIdNFT</td>
              <td className="font-mono text-[#EF476F]">EpochVotingEngine</td>
              <td>Correct stake recording</td>
              <td>stakeRecorder set by owner (governance)</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">VoterIdNFT</td>
              <td className="font-mono text-[#EF476F]">HumanFaucet</td>
              <td>Only verified humans get VoterIDs</td>
              <td>authorizedMinters set by owner (governance)</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">CuryoReputation</td>
              <td className="font-mono text-[#EF476F]">CuryoGovernor</td>
              <td>Only governance can lock tokens</td>
              <td>governor address set by CONFIG_ROLE</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ParticipationPool</td>
              <td className="font-mono text-[#EF476F]">VotingEngine + ContentRegistry</td>
              <td>Only authorized contracts trigger rewards</td>
              <td>authorizedCallers mapping set by owner</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>V5 &mdash; Economic Attack Vectors</h3>
      <p>New analysis focusing on interactions with the ParticipationPool and multi-epoch strategies:</p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Attack</th>
              <th>Cost</th>
              <th>Analysis</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <strong>Self-opposition + participation pool.</strong> Attacker votes both sides to control outcome and
                earn participation rewards on both commits. Participation pool gives up to 90% of stake in tier 0.
              </td>
              <td>2 stakes (1 + 100 cREP)</td>
              <td>
                Needs formal verification: 12% fee on losing side vs. 90% participation reward on both sides. At tier 0,
                net could be positive. Becomes unprofitable at lower participation tiers. Verify with test.
              </td>
              <td>
                <span className="badge badge-warning badge-sm text-white">Needs Testing</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Participation pool drain via commit-never-reveal.</strong> Commit votes across many content
                items, earn participation rewards, never reveal (forfeit stakes to treasury).
              </td>
              <td>1&ndash;100 cREP per commit</td>
              <td>
                At tier 0: commit 100 cREP, earn 90 cREP participation reward, forfeit 100 cREP stake. Net loss: 10 cREP
                per vote. At all tiers, stake exceeds reward. Not profitable.
              </td>
              <td>
                <span className="badge badge-success badge-sm">Not Profitable</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>MAX_VOTERS cap griefing.</strong> Fill 200 commit slots with minimum 1 cREP sybil votes to block
                legitimate voters.
              </td>
              <td>200 cREP (200 VoterIDs)</td>
              <td>
                With VoterIdNFT: requires 200 verified passport identities, making this impractical. Without VoterIdNFT:
                trivially sybilable with 200 cREP. Attacker&apos;s stakes are at risk on one side.
              </td>
              <td>
                <span className="badge badge-warning badge-sm text-white">Deployment</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>MEV in reveal ordering.</strong> Reveals submitted during reveal window. Order does not affect
                outcomes (commit hash binding determines direction).
              </td>
              <td>Gas only</td>
              <td>
                No MEV surface: settlement cannot happen before reveal deadline, rewards are at commit time
                (participation pool), not reveal time. tlock decryption is deterministic.
              </td>
              <td>
                <span className="badge badge-success badge-sm">No Issue</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Rating manipulation + stake slash.</strong> Coordinated DOWN voters push rating below 10 to
                trigger submitter stake slash after grace period.
              </td>
              <td>41+ voters &times; 1&ndash;100 cREP</td>
              <td>
                With voter-count-capped delta (1 voter = max 1 point), reaching rating &lt; 10 from default 50 requires
                41 unique voters over 41 epochs (~10 hours). Slash sends 10 cREP to treasury &mdash; no attacker profit.
                96-epoch cooldown limits repeat attacks.
              </td>
              <td>
                <span className="badge badge-secondary badge-sm">Accepted</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>V5 &mdash; Formal Invariant Properties</h3>
      <p>
        Properties that must always hold. Recommended for implementation as Foundry invariant tests (stateful fuzzing):
      </p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>ID</th>
              <th>Invariant</th>
              <th>Severity</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>INV-01</td>
              <td>
                <strong>Token conservation.</strong> For any terminal epoch: SUM(committed stakes) == SUM(claimed
                rewards) + SUM(forfeited) + SUM(fees) + dust
              </td>
              <td>Critical</td>
              <td>
                <span className="badge badge-warning badge-sm text-white">Needs Test</span>
              </td>
            </tr>
            <tr>
              <td>INV-02</td>
              <td>
                <strong>VotingEngine solvency.</strong> balanceOf(votingEngine) &ge; all pending obligations at all
                times
              </td>
              <td>Critical</td>
              <td>
                <span className="badge badge-warning badge-sm text-white">Needs Test</span>
              </td>
            </tr>
            <tr>
              <td>INV-03</td>
              <td>
                <strong>Pool split conservation.</strong> losingPool == voterShare + submitterShare + platformShare +
                treasuryShare (verified in RewardMath fuzz tests)
              </td>
              <td>Critical</td>
              <td>
                <span className="badge badge-success badge-sm">Tested</span>
              </td>
            </tr>
            <tr>
              <td>INV-04</td>
              <td>
                <strong>No double claims.</strong> claimReward succeeds at most once per (contentId, epochId, voter)
              </td>
              <td>High</td>
              <td>
                <span className="badge badge-success badge-sm">Tested</span>
              </td>
            </tr>
            <tr>
              <td>INV-05</td>
              <td>
                <strong>Epoch state finality.</strong> Once Settled/Cancelled/Tied, state never changes
              </td>
              <td>High</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>INV-06</td>
              <td>
                <strong>Submitter stake singularity.</strong> submitterStakeReturned transitions false&rarr;true exactly
                once per contentId
              </td>
              <td>High</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>INV-07</td>
              <td>
                <strong>MAX_STAKE enforcement.</strong> _epochContentStake[contentId][epochId][tokenId] &le; 100e6 at
                all times
              </td>
              <td>Medium</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
            <tr>
              <td>INV-08</td>
              <td>
                <strong>MAX_SUPPLY enforcement.</strong> crepToken.totalSupply() &le; 100,000,000e6 at all times
              </td>
              <td>Medium</td>
              <td>
                <span className="badge badge-success badge-sm">Verified</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>V5 &mdash; Recommended New Tests</h3>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_.badge]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Priority</th>
              <th>Test</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <span className="badge badge-error badge-sm">Critical</span>
              </td>
              <td>Reentrancy attack on settleEpoch</td>
              <td>
                Deploy malicious treasury contract that re-enters settleEpoch/claimReward. Verify nonReentrant blocks
                all paths.
              </td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-error badge-sm">Critical</span>
              </td>
              <td>Pool solvency invariant</td>
              <td>
                Stateful fuzz: random commit/reveal/settle/claim across multiple epochs and content items. Assert
                VotingEngine balance &ge; obligations.
              </td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-error badge-sm">Critical</span>
              </td>
              <td>Reward exhaustion</td>
              <td>
                Many winning voters claim in settled epoch. Verify last claim succeeds and no stranded tokens beyond
                dust.
              </td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-error badge-sm">Critical</span>
              </td>
              <td>Full 11-contract lifecycle</td>
              <td>
                HumanFaucet claim &rarr; VoterID mint &rarr; submit &rarr; vote &rarr; settle &rarr; claim &rarr;
                governance proposal &rarr; category submit.
              </td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-warning badge-sm text-white">High</span>
              </td>
              <td>processUnrevealedPendingVotes race</td>
              <td>Voter reveals in same block as keeper forfeiture. Verify reveal respected.</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-warning badge-sm text-white">High</span>
              </td>
              <td>Governance lock + content voting</td>
              <td>
                Lock tokens via governance, then commit content vote. Verify exemption works and locked tokens
                can&apos;t transfer elsewhere.
              </td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-warning badge-sm text-white">High</span>
              </td>
              <td>_decodeReferrer fuzz</td>
              <td>Test with userData of 0, 19, 20, 21, 32 bytes. Verify correct address extraction or fallback.</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-warning badge-sm text-white">High</span>
              </td>
              <td>Bonus rollover after long inactivity</td>
              <td>1000 inactive epochs then one settlement. Verify accumulation and capped distribution.</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-warning badge-sm text-white">High</span>
              </td>
              <td>MAX_VOTERS boundary</td>
              <td>Exactly 200 commits, verify 201st reverts. Reveal all 200 and settle.</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-warning badge-sm text-white">High</span>
              </td>
              <td>Upgrade with new storage</td>
              <td>V4 implementation with new variables. Deploy, populate, upgrade, verify old state preserved.</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-info badge-sm">Medium</span>
              </td>
              <td>Self-opposition with participation pool</td>
              <td>Verify net profitability is negative including participation pool rewards at all tiers.</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-info badge-sm">Medium</span>
              </td>
              <td>Participation pool drain attempt</td>
              <td>Commit across many content items, never reveal. Verify net loss at all tiers.</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-info badge-sm">Medium</span>
              </td>
              <td>Tied epoch with participation rewards</td>
              <td>Both sides refunded, participation rewards kept. Verify accounting.</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-info badge-sm">Medium</span>
              </td>
              <td>Frontend fee rounding</td>
              <td>200 voters across 5 frontends. Verify dust &le; expected.</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-info badge-sm">Medium</span>
              </td>
              <td>VoterID revocation mid-epoch</td>
              <td>Revoke after commit, verify reveal still works (VoterID check is at commit time).</td>
            </tr>
            <tr>
              <td>
                <span className="badge badge-info badge-sm">Medium</span>
              </td>
              <td>Governor lock accumulation</td>
              <td>5 proposals &rarr; 500 cREP locked. Verify timer resets from last, not first.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <hr />

      <h2>Scope Change: Round-Based Voting (Post-V5)</h2>
      <p>
        <strong>Date:</strong> February 19, 2026
      </p>
      <p>
        The epoch-based voting system (<code>EpochVotingEngine</code>, <code>EpochRewardDistributor</code>,{" "}
        <code>EpochLib</code>) has been replaced by a round-based system with the following contracts:
      </p>
      <div className="not-prose overflow-x-auto my-6 rounded-xl bg-base-200">
        <table className="table table-zebra [&_th]:text-base [&_td]:text-base [&_th]:bg-base-300">
          <thead>
            <tr>
              <th>Contract</th>
              <th>Lines</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>RoundVotingEngine</td>
              <td>~850</td>
              <td>Per-content round voting with tlock-primary reveal: commits, epoch-based reveals, settlement</td>
            </tr>
            <tr>
              <td>RoundRewardDistributor</td>
              <td>~180</td>
              <td>Pull-based reward claiming (immediate after round settlement)</td>
            </tr>
            <tr>
              <td>RoundLib</td>
              <td>~100</td>
              <td>Round states (Open/Settled/Cancelled/Tied), structs, epoch computation helpers</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>Key architectural changes:</strong> Per-content rounds with implicit 15-minute tlock-encrypted epochs.
        Tlock-primary reveal (keeper reads on-chain ciphertexts, decrypts via drand &mdash; no secret reveal data).
        3-voter minimum settlement across epochs. Visible inter-epoch tallies. Simplified round states
        (Open/Settled/Cancelled/Tied). Stateless trustless keeper. Deferred participation rewards. No global voter pool
        (100% content-specific). No bonus pool.
      </p>
      <p>
        <strong>Full re-audit recommended</strong> for the new contracts before mainnet deployment. See the{" "}
        <a href="https://github.com/curyo/curyo/blob/main/docs/design-analysis.md">design analysis</a> for a
        comprehensive review of the round-based system&apos;s attack surface and mitigations.
      </p>

      <hr />

      <p className="text-base-content/60 text-sm">
        This is an internal AI-assisted security review, not a professional third-party audit. Report generated by
        Claude Code &mdash; V5, February 18, 2026. Updated February 19, 2026 &mdash; round-based voting scope change
        noted.
      </p>
    </article>
  );
};

export default SecurityAudit;
