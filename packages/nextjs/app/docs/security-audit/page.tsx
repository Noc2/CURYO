import type { NextPage } from "next";

const SecurityAudit: NextPage = () => {
  return (
    <article className="prose max-w-none">
      <h1>Security Audit</h1>
      <p className="lead text-base-content/60 text-lg">
        Consolidated internal security audit of all Curyo smart contracts covering static analysis, manual review,
        storage layout verification, and economic attack analysis. Consolidated from 5 prior review rounds (V1&ndash;V5,
        Feb 2025&ndash;Feb 2026). March 4, 2026.
      </p>

      <h2>Executive Summary</h2>
      <p>
        This audit identified <strong>3 Critical</strong>, <strong>16 High</strong>, <strong>21 Medium</strong>,{" "}
        <strong>11 Low</strong>, and <strong>10 Informational</strong> findings across 11 production contracts and 2
        libraries. All findings have been resolved, verified safe, documented as intentional design choices, or flagged
        for pre-mainnet testing.
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
              <td>3</td>
              <td>3 need invariant testing</td>
            </tr>
            <tr>
              <td>High</td>
              <td>16</td>
              <td>12 resolved, 2 verified, 1 design, 1 fragile</td>
            </tr>
            <tr>
              <td>Medium</td>
              <td>21</td>
              <td>14 resolved/verified, 3 design, 2 needs review, 2 accepted</td>
            </tr>
            <tr>
              <td>Low</td>
              <td>11</td>
              <td>8 resolved, 2 accepted, 1 design</td>
            </tr>
            <tr>
              <td>Informational</td>
              <td>10</td>
              <td>7 resolved, 1 accepted, 2 design</td>
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
                <span className="badge badge-secondary whitespace-nowrap">UUPS</span>
              </td>
              <td>
                Core voting: tlock commit-reveal, epoch-weighted rewards, deterministic settlement, consensus subsidy
              </td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RoundRewardDistributor</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">UUPS</span>
              </td>
              <td>Pull-based reward claiming</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">UUPS</span>
              </td>
              <td>Content lifecycle, submitter stakes, ratings</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">FrontendRegistry</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">UUPS</span>
              </td>
              <td>Frontend operator staking and fee distribution</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ProfileRegistry</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">UUPS</span>
              </td>
              <td>User profiles and name uniqueness</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">CategoryRegistry</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Non-upgradeable</span>
              </td>
              <td>Category governance and domain uniqueness</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">CuryoReputation</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Non-upgradeable</span>
              </td>
              <td>ERC-20 token with governance locking</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">VoterIdNFT</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Non-upgradeable</span>
              </td>
              <td>Soulbound sybil resistance, delegation, stake limits</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ParticipationPool</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Non-upgradeable</span>
              </td>
              <td>Halving-tier participation rewards</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">HumanFaucet</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Non-upgradeable</span>
              </td>
              <td>Self.xyz verified claims, referrals, Pausable</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">CuryoGovernor</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Non-upgradeable</span>
              </td>
              <td>OpenZeppelin Governor with timelock</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RewardMath</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Library</span>
              </td>
              <td>Pool split arithmetic and reward calculations</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RoundLib</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Library</span>
              </td>
              <td>Round states, timing, settlement probability</td>
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
          <strong>Manual review</strong> &mdash; Line-by-line review of all 13 files: token flows, state transitions,
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
      <p className="text-base-content/60 text-sm">
        Iterative review across 5 rounds (V1&ndash;V5) plus final consolidation. Updated for the tlock commit-reveal +
        epoch-weighted settlement architecture. New round-based findings from inline audit notes incorporated.
      </p>

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
                <strong>Pool solvency &mdash; reward claims must not exceed VotingEngine balance.</strong> Reward is{" "}
                <code>(stake / totalWinStake) &times; pool</code>. Due to integer division rounding down, the sum of all
                claims &le; pool. The VotingEngine holds both winning stakes (returned to winners) and losing pool
                tokens (distributed as rewards). Algebraically correct. Recommend formal invariant test to prove across
                all possible round configurations.
              </td>
              <td className="font-mono text-[#EF476F]">RoundRewardDistributor</td>
              <td>
                <span className="badge badge-warning whitespace-nowrap text-white">Needs Testing</span>
              </td>
            </tr>
            <tr>
              <td>C-02</td>
              <td>
                <strong>Token conservation invariant.</strong> For any round that reaches a terminal state: SUM(vote
                stakes) must equal SUM(claimed rewards) + SUM(platform fees) + SUM(treasury fees) + SUM(submitter
                rewards) + dust. Should be formally verified with stateful fuzz testing.
              </td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>
                <span className="badge badge-warning whitespace-nowrap text-white">Needs Testing</span>
              </td>
            </tr>
            <tr>
              <td>C-03</td>
              <td>
                <strong>VotingEngine balance solvency invariant.</strong> At any point:{" "}
                <code>crepToken.balanceOf(votingEngine)</code> must be &ge; SUM(open round stakes) + SUM(unclaimed
                winner rewards) + SUM(unclaimed refunds) + SUM(unclaimed submitter rewards). Should be tested as a
                Foundry invariant test with random vote/settle/claim sequences.
              </td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>
                <span className="badge badge-warning whitespace-nowrap text-white">Needs Testing</span>
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
                after voters have voted, preventing settlement (isActive check fails). Voter stakes forfeit. Fix:
                cancelContent now reverts if any votes have been cast.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>H-02</td>
              <td>
                <strong>markDormant lacks vote check.</strong> Anyone can mark active content dormant after 30 days of
                inactivity, even with an active open round, blocking settlement. Fix: markDormant reverts if an active
                open round exists.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>H-03</td>
              <td>
                <strong>Governance lock array unbounded.</strong> Every governance vote appended to an array iterated on
                every token transfer. After many votes, transfers can exceed gas limits. Replaced with a single
                aggregate lock per address (O(1) reads/writes).
              </td>
              <td className="font-mono text-[#EF476F]">CuryoReputation</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>H-04</td>
              <td>
                <strong>Missing __gap on 3 UUPS contracts.</strong> ContentRegistry, FrontendRegistry, and
                ProfileRegistry lacked storage gap variables, risking storage collisions on future upgrades. All three
                contracts now include <code>uint256[50] private __gap</code>.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry, FrontendRegistry, ProfileRegistry</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>H-05</td>
              <td>
                <strong>Zero-cost rating manipulation.</strong> Unopposed DOWN votes update content rating at no cost
                (stake returned). Rating delta is now capped by the number of unique winning voters (1 voter = max delta
                1), so a lone attacker can only move rating by 1 per round instead of up to 5.
              </td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine, RewardMath</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>H-06</td>
              <td>
                <strong>Critical functions missing whenNotPaused.</strong> <code>vote</code> has{" "}
                <code>whenNotPaused</code> but <code>trySettle</code> did not. During an emergency pause, settlements
                could still execute and distribute rewards incorrectly. Added <code>whenNotPaused</code> to settlement
                functions.
              </td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>H-07</td>
              <td>
                <strong>MAX_VOTERS cap enforced at vote time.</strong> Cap is enforced when the vote is cast, preventing
                users from losing stakes through no fault of their own.
              </td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>H-08</td>
              <td>
                <strong>CategoryRegistry missing ReentrancyGuard.</strong> FrontendRegistry has{" "}
                <code>ReentrancyGuard</code> with <code>nonReentrant</code> on all state-changing functions.
                CategoryRegistry did not, despite having similar token transfer patterns. Added{" "}
                <code>ReentrancyGuard</code> and <code>nonReentrant</code> to <code>submitCategory</code>,{" "}
                <code>approveCategory</code>, <code>rejectCategory</code>.
              </td>
              <td className="font-mono text-[#EF476F]">CategoryRegistry</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>H-09</td>
              <td>
                <strong>transferReward() uses address check, not role modifier.</strong>{" "}
                <code>require(msg.sender == rewardDistributor)</code> instead of <code>onlyRole</code>. If{" "}
                <code>CONFIG_ROLE</code> holder calls <code>setRewardDistributor()</code> to a malicious address, all
                VotingEngine cREP can be drained. In production, CONFIG_ROLE is held by governance timelock with 2-day
                delay, providing community response window.
              </td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Verified</span>
              </td>
            </tr>
            <tr>
              <td>H-10</td>
              <td>
                <strong>ContentRegistry callback trust boundary.</strong> Functions <code>updateRating</code>,{" "}
                <code>returnSubmitterStake</code>, <code>slashSubmitterStake</code> use{" "}
                <code>require(msg.sender == votingEngine)</code>. The <code>votingEngine</code> address is set via{" "}
                <code>setVotingEngine()</code> which requires CONFIG_ROLE and non-zero address. Same governance
                protection as H-09.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Verified</span>
              </td>
            </tr>
            <tr>
              <td>H-11</td>
              <td>
                <strong>Mock mode disabled on non-local chains.</strong> The mock verification mode for HumanFaucet must
                be restricted to local development chains only. Production deployment must enforce real Self.xyz
                verification.
              </td>
              <td className="font-mono text-[#EF476F]">HumanFaucet</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>H-12</td>
              <td>
                <strong>VoterIdNFT identity chaining prevented.</strong> A user with an existing VoterID cannot mint a
                second one. The <code>customVerificationHook</code> checks <code>addressClaimed[msg.sender]</code>{" "}
                before minting, preventing identity chaining via delegation.
              </td>
              <td className="font-mono text-[#EF476F]">VoterIdNFT</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>H-13</td>
              <td>
                <strong>Failed refund handling in batch processing.</strong> If a token transfer fails during batch
                processing of cancelled round refunds, the entire batch reverts. Individual try-catch or skip logic
                ensures one failed refund does not block processing of remaining claims.
              </td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>H-14</td>
              <td>
                <strong>Assembly in _decodeReferrer().</strong> <code>mload(add(userData, 20))</code> reads 32 bytes
                from offset 20. For <code>bytes memory</code>, bytes 0&ndash;31 are the length field. Works because
                length is always small (&lt; 2^96), so high bytes of length field are zero. Fragile but correct in
                practice. Consider replacing with <code>abi.decode</code> for clarity.
              </td>
              <td className="font-mono text-[#EF476F]">HumanFaucet</td>
              <td>
                <span className="badge badge-info whitespace-nowrap">Fragile</span>
              </td>
            </tr>
            <tr>
              <td>H-15</td>
              <td>
                <strong>Non-upgradeable ReentrancyGuard in UUPS contracts.</strong> Contracts use{" "}
                <code>@openzeppelin/contracts/utils/ReentrancyGuard.sol</code> (non-upgradeable version). In OZ v5.x,
                this uses ERC-7201 namespaced storage (fixed slot), which is safe for UUPS proxies. Uninitialized proxy
                storage (0) does not conflict with the guard&apos;s check pattern (slot == 2 means entered).
              </td>
              <td className="font-mono text-[#EF476F]">All UUPS contracts</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Verified</span>
              </td>
            </tr>
            <tr>
              <td>H-16</td>
              <td>
                <strong>Governance lock exemption for content voting.</strong> <code>CuryoReputation._update()</code>{" "}
                allows transfers TO <code>votingEngine</code> and <code>contentRegistry</code> even when tokens are
                governance-locked. The same tokens can be &quot;locked for governance&quot; and &quot;staked in content
                voting&quot; simultaneously. Intentional design: governance participation should not block content
                voting.
              </td>
              <td className="font-mono text-[#EF476F]">CuryoReputation</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Design</span>
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
              <td>M-01</td>
              <td>
                <strong>Unbounded iteration in batch refund processing.</strong> Added <code>startIndex</code> and{" "}
                <code>count</code> parameters for batched processing. Keepers can call in multiple transactions for any
                size array.
              </td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>M-02</td>
              <td>
                <strong>ContentRegistry now has ReentrancyGuard.</strong> Added <code>nonReentrant</code> to{" "}
                <code>submitContent</code>, <code>cancelContent</code>, <code>markDormant</code>, and{" "}
                <code>reviveContent</code>.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>M-03</td>
              <td>
                <strong>Content submission spam mitigated.</strong> Cancellation now charges a 1 cREP fee and clears the
                URL flag so cancelled URLs can be resubmitted by legitimate users.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>M-04</td>
              <td>
                <strong>Settlement timing manipulation.</strong> Mitigated by design: <code>trySettle</code> is
                permissionless and settlement probability is determined by <code>block.prevrandao</code> randomness. No
                single party can deterministically control when settlement occurs.
              </td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>
                <span className="badge badge-info whitespace-nowrap">Mitigated</span>
              </td>
            </tr>
            <tr>
              <td>M-05</td>
              <td>
                <strong>UUPS upgrade tests added.</strong> All 5 UUPS contracts now have upgrade path tests covering
                authorization, reinitialization prevention, state preservation after upgrade, and implementation
                direct-initialization protection.
              </td>
              <td className="font-mono text-[#EF476F]">All UUPS contracts</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>M-06</td>
              <td>
                <strong>Content status transitions verified.</strong> Valid: Active&rarr;Dormant/Cancelled,
                Dormant&rarr;Active(revive). Invalid transitions blocked by status checks. Double return/slash prevented
                by <code>submitterStakeReturned</code> flag checked in all relevant paths.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Verified</span>
              </td>
            </tr>
            <tr>
              <td>M-07</td>
              <td>
                <strong>Dormant URL stays locked.</strong> URL hash is cleared on cancel but not on dormancy. Dormant
                URLs staying locked prevents legitimate resubmission. Verify if this is the intended behavior.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-warning whitespace-nowrap text-white">Needs Review</span>
              </td>
            </tr>
            <tr>
              <td>M-08</td>
              <td>
                <strong>Lock accumulation without cap.</strong> <code>lockForGovernance()</code> accumulates:{" "}
                <code>lock.amount += amount</code>. Multiple governance votes/proposals stack. If locked amount exceeds
                balance, <code>getTransferableBalance()</code> returns 0 (no underflow). Locks expire 7 days from last
                update.
              </td>
              <td className="font-mono text-[#EF476F]">CuryoReputation</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Verified</span>
              </td>
            </tr>
            <tr>
              <td>M-09</td>
              <td>
                <strong>Nullifier stays used after VoterID revocation.</strong> When a VoterID is revoked, the nullifier
                remains marked as used. Prevents &quot;revoke-and-re-register&quot; abuse but also blocks legitimate
                users who are wrongly revoked. Governance can mint a new VoterID directly if needed.
              </td>
              <td className="font-mono text-[#EF476F]">VoterIdNFT</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Design</span>
              </td>
            </tr>
            <tr>
              <td>M-10</td>
              <td>
                <strong>VoterIdNFT recordStake() has no cap.</strong> <code>recordStake()</code> accumulates{" "}
                <code>_epochContentStake</code> without checking MAX_STAKE. The cap is enforced by RoundVotingEngine at
                vote time. If <code>stakeRecorder</code> is changed to a buggy contract, the cap could be bypassed.{" "}
                <code>stakeRecorder</code> is set by owner (governance).
              </td>
              <td className="font-mono text-[#EF476F]">VoterIdNFT</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Verified</span>
              </td>
            </tr>
            <tr>
              <td>M-11</td>
              <td>
                <strong>Referrer validation doesn&apos;t check revoked VoterID.</strong> The actual claim logic at{" "}
                <code>customVerificationHook</code> only checks <code>addressClaimed[referrer]</code>. A user whose
                VoterID has been revoked can still serve as a referrer if they previously claimed.
              </td>
              <td className="font-mono text-[#EF476F]">HumanFaucet</td>
              <td>
                <span className="badge badge-warning whitespace-nowrap text-white">Needs Review</span>
              </td>
            </tr>
            <tr>
              <td>M-12</td>
              <td>
                <strong>No ReentrancyGuard on HumanFaucet.</strong> Safe because: (1) entry is via Self.xyz hub
                callback, (2) ERC20 <code>transfer</code> has no recipient callback, (3){" "}
                <code>customVerificationHook</code> is <code>internal override</code> (cannot be called externally).
              </td>
              <td className="font-mono text-[#EF476F]">HumanFaucet</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Verified</span>
              </td>
            </tr>
            <tr>
              <td>M-13</td>
              <td>
                <strong>ParticipationPool reentrancy protection.</strong> No <code>ReentrancyGuard</code>, but{" "}
                <code>rewardVote()</code> and <code>rewardSubmission()</code> are called from VotingEngine and
                ContentRegistry which both have <code>nonReentrant</code>. Halving loop: max ~14 iterations before rate
                floors at 1%.
              </td>
              <td className="font-mono text-[#EF476F]">ParticipationPool</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Verified</span>
              </td>
            </tr>
            <tr>
              <td>M-14</td>
              <td>
                <strong>CategoryRegistry needs delegated voting power.</strong> <code>submitCategory()</code> calls{" "}
                <code>governor.propose()</code> which requires the caller to meet the proposal threshold (100 cREP
                voting power). If CategoryRegistry has no delegated cREP, all category submissions will revert. Verify
                deployment script delegates tokens to the contract.
              </td>
              <td className="font-mono text-[#EF476F]">CategoryRegistry</td>
              <td>
                <span className="badge badge-warning whitespace-nowrap text-white">Needs Verification</span>
              </td>
            </tr>
            <tr>
              <td>M-15</td>
              <td>
                <strong>Governor lock accumulation with multiple proposals.</strong> Creating 5 proposals locks 500 cREP
                for 7 days from the last proposal (timer resets). Users should be aware that governance participation
                has a liquidity cost that compounds.
              </td>
              <td className="font-mono text-[#EF476F]">CuryoGovernor</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Verified</span>
              </td>
            </tr>
            <tr>
              <td>M-16</td>
              <td>
                <strong>registeredFrontends unbounded array growth.</strong> Frontend addresses are pushed to{" "}
                <code>registeredFrontends</code> but never removed, even after deregistration. Mitigated by pagination
                support for practical use.
              </td>
              <td className="font-mono text-[#EF476F]">FrontendRegistry</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Accepted</span>
              </td>
            </tr>
            <tr>
              <td>M-17</td>
              <td>
                <strong>initializeV2/V3 visibility.</strong> Both are <code>public</code> with{" "}
                <code>reinitializer(n)</code>. While publicly callable, the <code>reinitializer</code> modifier ensures
                each can only execute once. Standard UUPS upgrade flow (upgrade + initialize in one transaction)
                prevents front-running.
              </td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Verified</span>
              </td>
            </tr>
            <tr>
              <td>M-18</td>
              <td>
                <strong>Cannot cancel round if threshold reached.</strong> Once the minimum voter threshold for a round
                has been met, the round cannot be cancelled. Submitter cannot use cancellation to avoid negative ratings
                or stake loss.
              </td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>M-19</td>
              <td>
                <strong>Consensus reserve may deplete to 0.</strong> The consensus subsidy (5% of totalStake for
                unanimous rounds) is drawn from a reserve. If the reserve is exhausted, unanimous rounds receive no
                subsidy. This is a graceful degradation &mdash; voting still works, just without the bonus.
              </td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Design</span>
              </td>
            </tr>
            <tr>
              <td>M-20</td>
              <td>
                <strong>No on-chain maxSupply on VoterIdNFT.</strong> The VoterIdNFT has no on-chain cap on total
                supply. Supply is limited in practice by Self.xyz passport verification (one per person). If governance
                adds a permissive minter, unlimited VoterIDs could be minted.
              </td>
              <td className="font-mono text-[#EF476F]">VoterIdNFT</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Accepted</span>
              </td>
            </tr>
            <tr>
              <td>M-21</td>
              <td>
                <strong>ERC2612 permit front-running.</strong> A front-runner can extract the permit signature from a{" "}
                <code>voteWithPermit</code> transaction and call <code>permit()</code> directly, consuming the nonce.
                The user&apos;s transaction reverts but they can retry with standard <code>approve()</code>. UX issue,
                not a fund risk. Standard ERC2612 limitation.
              </td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Design</span>
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
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
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
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>L-03</td>
              <td>
                <strong>Domain normalization incomplete in CategoryRegistry.</strong> Rewrote{" "}
                <code>_normalizeDomain()</code> to strip protocols, paths, query strings, fragments, and trailing DNS
                dots. All URL variants now normalize to bare domain.
              </td>
              <td className="font-mono text-[#EF476F]">CategoryRegistry</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
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
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
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
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>L-06</td>
              <td>
                <strong>Bonus timestamp uses settlement time.</strong> Bonus calculation uses block.timestamp at
                settlement, not the round&apos;s active time. Wrong bonus rate could apply near the 20-year boundary.
              </td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
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
                <span className="badge badge-secondary whitespace-nowrap">Accepted</span>
              </td>
            </tr>
            <tr>
              <td>L-08</td>
              <td>
                <strong>Dual-purpose tokens &mdash; governance + content voting.</strong> The same cREP tokens serve
                both governance voting power and content voting stakes. Governance locks allow staking into the
                VotingEngine, meaning governance influence and content stakes are not fully independent.
              </td>
              <td className="font-mono text-[#EF476F]">CuryoReputation</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Design</span>
              </td>
            </tr>
            <tr>
              <td>L-09</td>
              <td>
                <strong>Self-referral possible with two passports.</strong> A user with two passport-verified identities
                can refer themselves for a 20% bonus. Limited by the cost and difficulty of obtaining multiple
                passports.
              </td>
              <td className="font-mono text-[#EF476F]">HumanFaucet</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Accepted</span>
              </td>
            </tr>
            <tr>
              <td>L-10</td>
              <td>
                <strong>Treasury transfer try-catch for robustness.</strong> Treasury transfers during settlement use a
                direct <code>safeTransfer</code>. If the treasury address is a contract that reverts, settlement fails.
                Consider wrapping in try-catch for robustness.
              </td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>L-11</td>
              <td>
                <strong>Tier transitions are discrete cliffs.</strong> ParticipationPool tier boundaries create
                cliff-like transitions where the last claim at a higher tier gets significantly more than the first
                claim at a lower tier. This is inherent to the halving design.
              </td>
              <td className="font-mono text-[#EF476F]">ParticipationPool</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Design</span>
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
                nullifier deduplication were tested only indirectly. Dedicated VoterIdNFT.t.sol with 63 tests now added.
              </td>
              <td className="font-mono text-[#EF476F]">VoterIdNFT</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>I-02</td>
              <td>
                <strong>No fuzz tests for RewardMath.</strong> The core arithmetic library lacked fuzz tests.
                Property-based testing now verifies conservation invariants under random inputs.
              </td>
              <td className="font-mono text-[#EF476F]">RewardMath</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>I-03</td>
              <td>
                <strong>Integration tests don&apos;t configure VoterIdNFT.</strong> The full sybil-resistance flow
                (HumanFaucet claim &rarr; VoterIdNFT mint &rarr; vote with stake cap) was untested end-to-end. Now
                covered by RoundIntegration.t.sol.
              </td>
              <td className="font-mono text-[#EF476F]">Integration tests</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>I-04</td>
              <td>
                <strong>Unbounded view function arrays.</strong> <code>ProfileRegistry.getRegisteredAddresses()</code>{" "}
                and <code>CategoryRegistry.getApprovedCategoryIds()</code> return unbounded arrays. While not
                exploitable (view functions don&apos;t consume on-chain gas), external callers could hit RPC gas limits.
                Pagination added.
              </td>
              <td className="font-mono text-[#EF476F]">ProfileRegistry, CategoryRegistry</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>I-05</td>
              <td>
                <strong>Slither: abi.encodePacked collision risk.</strong> ContentRegistry.submitContent previously used{" "}
                <code>encodePacked</code> with multiple dynamic args for content hashing. Now uses{" "}
                <code>abi.encode</code> instead, eliminating collision risk.
              </td>
              <td className="font-mono text-[#EF476F]">ContentRegistry</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>I-06</td>
              <td>
                <strong>Slither: unchecked return values.</strong> token.approve() return values were ignored in
                CategoryRegistry.rejectCategory and FrontendRegistry.slashFrontend. Now uses SafeERC20{" "}
                <code>forceApprove</code>.
              </td>
              <td className="font-mono text-[#EF476F]">CategoryRegistry, FrontendRegistry</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>I-07</td>
              <td>
                <strong>Slither: missing zero-address checks.</strong> CuryoReputation.setGovernor and
                setContentVotingContracts now validate against address(0).
              </td>
              <td className="font-mono text-[#EF476F]">CuryoReputation</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>I-08</td>
              <td>
                <strong>VotingEngine should inherit interface.</strong> The interface exists but the contract did not
                explicitly implement it. Now inherits <code>IRoundVotingEngine</code>.
              </td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>I-09</td>
              <td>
                <strong>Vote direction encrypted at commit time.</strong> Vote direction (UP/DOWN) is encrypted via
                tlock at commit time and only revealed after the epoch ends. By design: the commit-reveal model uses
                tlock encryption and epoch-weighted rewards to incentivize independent assessment. Commit hashes enable
                double-vote prevention, self-vote prevention, cooldown periods, and sybil stake limits.
              </td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Design</span>
              </td>
            </tr>
            <tr>
              <td>I-10</td>
              <td>
                <strong>trySettle is permissionless.</strong> Anyone can call <code>trySettle(contentId)</code> to
                attempt settlement after the minimum epoch length has passed. Intentionally permissionless so any keeper
                or user can trigger settlement. The probabilistic mechanism using <code>block.prevrandao</code> prevents
                deterministic timing manipulation.
              </td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Design</span>
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
              <td>0&ndash;10 (11 slots)</td>
              <td>__gap[49]</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Pass</span>
              </td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>0&ndash;43 (44 slots)</td>
              <td>__gap[25]</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Pass</span>
              </td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RoundRewardDistributor</td>
              <td>0&ndash;4 (5 slots)</td>
              <td>__gap[50]</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Pass</span>
              </td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">FrontendRegistry</td>
              <td>0&ndash;5 (6 slots)</td>
              <td>__gap[50]</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Pass</span>
              </td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ProfileRegistry</td>
              <td>0&ndash;3 (4 slots)</td>
              <td>__gap[50]</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Pass</span>
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
                <span className="badge badge-secondary whitespace-nowrap">Pass</span> &mdash; All 5 UUPS contracts
              </td>
            </tr>
            <tr>
              <td>_authorizeUpgrade requires UPGRADER_ROLE</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Pass</span> &mdash; All 5 UUPS contracts
              </td>
            </tr>
            <tr>
              <td>ReentrancyGuard under proxy</td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Pass</span> &mdash; OZ v5.5.0 uses ERC-7201
                storage slot with check == ENTERED (2). Uninitialized proxy storage (0) is safe.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <hr />

      <h2>Economic Analysis</h2>
      <p>
        Game-theoretic attack scenarios against the round-based parimutuel voting mechanism. All scenarios assume
        VoterIdNFT is active (sybil resistance enabled, 100 cREP max stake per voter per content per round). No global
        voter pool (100% content-specific). No bonus pool.
      </p>
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
                <strong>Rating manipulation</strong> &mdash; Unopposed DOWN votes move content rating. Rating delta is
                capped by the number of unique winning voters (1 voter = max delta 1), so a lone attacker can only move
                rating by 1 per round.
              </td>
              <td>1&ndash;100 cREP (returned if unopposed)</td>
              <td>Reduced: 1 point/round per attacker</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Mitigated</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Content spam</strong> &mdash; Submit-cancel loop to pollute the content registry. Cancellation
                charges a 1 cREP fee and clears the URL flag so cancelled URLs can be resubmitted.
              </td>
              <td>10 cREP stake + 1 cREP cancel fee</td>
              <td>Reduced: 1 cREP cost per spam cycle</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Mitigated</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Settlement timing manipulation</strong> &mdash; Malicious keeper attempts to control settlement
                timing. Mitigated: settlement probability is determined by <code>block.prevrandao</code> randomness, and{" "}
                <code>trySettle</code> is permissionless.
              </td>
              <td>Gas only</td>
              <td>No impact: any party can attempt settlement</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Mitigated</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Vote stranding</strong> &mdash; Submitter cancels or content goes dormant while voters have
                active stakes. cancelContent reverts if votes have been cast; markDormant reverts if an active open
                round exists.
              </td>
              <td>10 cREP submitter stake</td>
              <td>Blocked: cancel/dormancy checks vote state</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Resolved</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>VoterIdNFT bypass</strong> &mdash; If VoterIdNFT is not configured (address(0)), all sybil
                resistance checks are skipped.
              </td>
              <td>&mdash;</td>
              <td>All checks skip if voterIdNFT == address(0)</td>
              <td>
                <span className="badge badge-warning whitespace-nowrap text-white">Deployment</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Governance attack</strong> &mdash; Attacker acquires 4% of circulating supply to reach quorum
                and pass malicious proposals. TimelockController delay provides community response window.
              </td>
              <td>4% of circulating cREP (dynamic quorum, 10K floor)</td>
              <td>Timelock delay allows community response</td>
              <td>
                <span className="badge badge-warning whitespace-nowrap text-white">Deployment</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Settlement ordering</strong> &mdash; Keepers settle rounds in specific order to manipulate
                outcomes.
              </td>
              <td>Gas only</td>
              <td>No impact: round pools are 100% content-specific, no shared pool affected by ordering</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">No Issue</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Participation pool drain via losing votes</strong> &mdash; Vote across many content items to
                earn participation rewards, regardless of round outcome.
              </td>
              <td>1&ndash;100 cREP per vote</td>
              <td>
                At tier 0: vote 100 cREP, earn 90 cREP participation reward, but losing side forfeits stake. Net loss if
                on losing side. At all tiers, participation reward is less than stake.
              </td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Not Profitable</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Self-opposition + participation pool</strong> &mdash; Vote both sides to control outcome and
                earn participation rewards on both votes.
              </td>
              <td>2 stakes (1 + 100 cREP)</td>
              <td>
                12% fee on losing side vs. participation reward on both sides. Needs formal verification: may be
                profitable at tier 0 but becomes unprofitable at lower tiers.
              </td>
              <td>
                <span className="badge badge-warning whitespace-nowrap text-white">Needs Testing</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>MAX_VOTERS cap griefing</strong> &mdash; Fill voter slots with minimum-stake sybil votes.
              </td>
              <td>200 cREP (200 VoterIDs)</td>
              <td>
                With VoterIdNFT: impractical (requires verified identities). Without: trivially sybilable. Cap enforced
                at vote time.
              </td>
              <td>
                <span className="badge badge-warning whitespace-nowrap text-white">Deployment</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Coordinated rating floor attack</strong> &mdash; 41+ voters push rating below 25 to trigger
                submitter stake slash. 24-hour cooldown per voter per content limits repeats.
              </td>
              <td>41 voters &times; 1&ndash;100 cREP (returned if unopposed)</td>
              <td>
                Requires 41 verified identities over 41 rounds. Slash sends 10 cREP to treasury &mdash; no attacker
                profit.
              </td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Accepted</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>MEV in settlement timing</strong> &mdash; Attempting to time settlement for favorable outcomes.
              </td>
              <td>Gas only</td>
              <td>
                No MEV surface: settlement is probabilistic via block.prevrandao, no party can deterministically control
                timing.
              </td>
              <td>
                <span className="badge badge-success whitespace-nowrap">No Issue</span>
              </td>
            </tr>
            <tr>
              <td>
                <strong>Referral loop exploitation</strong> &mdash; Two colluding users claim with each other as
                referrers, extracting ~25% more cREP per pair.
              </td>
              <td>0 (uses faucet claims)</td>
              <td>
                Accelerates 78M faucet depletion by ~25%. Expected cost of referral incentives. Referrer must have
                VoterIdNFT.
              </td>
              <td>
                <span className="badge badge-secondary whitespace-nowrap">Design</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <hr />

      <h2>Cross-Contract Interaction Analysis</h2>
      <p>Mapped fund flow paths and trust assumptions across the protocol:</p>
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
              <td>Vote &rarr; settle &rarr; claim</td>
              <td>User &rarr; VotingEngine &rarr; (settlement splits) &rarr; RewardDistributor &rarr; User</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Verified</span>
              </td>
            </tr>
            <tr>
              <td>Consensus subsidy</td>
              <td>ConsensusReserve &rarr; VotingEngine (one-sided round payouts)</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Verified</span>
              </td>
            </tr>
            <tr>
              <td>Content submit &rarr; return/slash</td>
              <td>User &rarr; ContentRegistry &rarr; (return to User OR slash to Treasury)</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Verified</span>
              </td>
            </tr>
            <tr>
              <td>Frontend slash &rarr; treasury</td>
              <td>FrontendRegistry &rarr; forceApprove &rarr; Treasury</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Verified</span>
              </td>
            </tr>
            <tr>
              <td>Category rejection &rarr; treasury</td>
              <td>CategoryRegistry &rarr; forceApprove &rarr; Treasury</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Verified</span>
              </td>
            </tr>
            <tr>
              <td>Settlement callback chain</td>
              <td>
                trySettle() makes external calls: safeTransfer to treasury, frontendRegistry; registry.updateRating();
                registry.returnSubmitterStake()/slashSubmitterStake()
              </td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Verified</span> &mdash; nonReentrant blocks
                re-entry
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>Trust Assumptions</h3>
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
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td>Only valid calls to updateRating/returnStake/slashStake</td>
              <td>msg.sender check + CONFIG_ROLE governance</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
              <td className="font-mono text-[#EF476F]">RoundRewardDistributor</td>
              <td>Only valid calls to transferReward</td>
              <td>Address check + CONFIG_ROLE governance</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">VoterIdNFT</td>
              <td className="font-mono text-[#EF476F]">RoundVotingEngine</td>
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

      <hr />

      <h2>Key Invariants</h2>
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
          <strong>Round state transitions:</strong> Open &rarr; Settled/Cancelled/Tied only. No backwards transitions.
        </li>
        <li>
          <strong>Double-claim prevention:</strong> rewardClaimed mapping checked before payout in
          RoundRewardDistributor.
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
          <strong>Gas-bounded settlement:</strong> Round voters capped per content (enforced at vote time); O(1)
          settlement gas cost.
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
      <p>1032 tests across 41 test suites.</p>
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
              <td className="font-mono text-[#EF476F]">RoundVotingEngineBranchesTest</td>
              <td>71</td>
              <td>Voting engine branch coverage</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">VoterIdNFTTest</td>
              <td>63</td>
              <td>Soulbound NFT, delegation, multi-minter, stake caps</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">FrontendRegistryCoverageTest</td>
              <td>49</td>
              <td>Frontend registry coverage</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ContentRegistryCoverageTest</td>
              <td>47</td>
              <td>Content lifecycle, cancel, dormancy, rating</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ParticipationPoolTest</td>
              <td>47</td>
              <td>Participation rewards, halving tiers, pool depletion</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">HumanFaucetTest</td>
              <td>47</td>
              <td>Claims, halving, referrals, Pausable</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RoundSettlementEdgeCaseTest</td>
              <td>43</td>
              <td>Settlement edge cases, tied rounds, cancellations</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">CategoryRegistryTest</td>
              <td>40</td>
              <td>Category lifecycle, governance, pagination</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RoundIntegrationTest</td>
              <td>36</td>
              <td>Full vote/settle/claim cycles</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">HumanFaucetCoverageTest</td>
              <td>35</td>
              <td>Faucet branch and edge case coverage</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">SettlementEdgeCasesTest</td>
              <td>31</td>
              <td>Settlement edge cases</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RoundSettlementEdgeCase3Test</td>
              <td>30</td>
              <td>Additional settlement edge cases</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RewardMathTest</td>
              <td>30</td>
              <td>Pool splits, voter rewards, rating delta (fuzz)</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ContentRegistryBranchesTest</td>
              <td>28</td>
              <td>Content registry branch coverage</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">FrontendRegistryTest</td>
              <td>28</td>
              <td>Frontend staking, fees, slashing</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">HumanFaucetBranchTest</td>
              <td>27</td>
              <td>Branch coverage for faucet edge cases</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ProfileRegistryTest</td>
              <td>27</td>
              <td>Profile names, uniqueness, pagination</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">HumanFaucetTierEdgeCaseTest</td>
              <td>26</td>
              <td>Faucet tier edge cases</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">SecurityAccessControlTest</td>
              <td>23</td>
              <td>Access control for all contracts</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">GovernanceTest</td>
              <td>23</td>
              <td>Governor, timelock, locking</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">CuryoReputationBranchesTest</td>
              <td>23</td>
              <td>Token branch coverage</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">CuryoReputationCoverageTest</td>
              <td>22</td>
              <td>Token governance locks, delegation</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">ParticipationPoolBranchesTest</td>
              <td>22</td>
              <td>Participation pool branch coverage</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">UpgradeTest</td>
              <td>21</td>
              <td>UUPS upgrade auth, reinitialization, state preservation</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">HumanFaucetCoverageTest (CoverageGaps)</td>
              <td>21</td>
              <td>Additional faucet coverage</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RoundSettlementBranchTest</td>
              <td>20</td>
              <td>Settlement branch coverage</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">FrontendRegistryBranchTest</td>
              <td>20</td>
              <td>Frontend registry branch coverage</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">FrontendRegistryEdgeCaseTest</td>
              <td>20</td>
              <td>Frontend registry edge cases</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">FrontendRegistryCoverageTest (CoverageGaps)</td>
              <td>16</td>
              <td>Additional frontend coverage</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">RoundRewardDistributorBranchesTest</td>
              <td>14</td>
              <td>Reward distributor branch coverage</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">NormalizeDomainTest</td>
              <td>14</td>
              <td>Category domain normalization</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">FormalVerification_GameTheory</td>
              <td>14</td>
              <td>Self-opposition, participation pool drain</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">FormalVerification_RoundLifecycle</td>
              <td>12</td>
              <td>Round state machine formal properties</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">FormalVerification_ParticipationPool</td>
              <td>10</td>
              <td>Participation pool invariants</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">FormalVerification_Governance</td>
              <td>10</td>
              <td>Governance quorum, locking properties</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">GameTheoryImprovementsTest</td>
              <td>5</td>
              <td>Game theory improvements</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">SecurityPermitTest</td>
              <td>5</td>
              <td>ERC2612 permit security</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">SecurityReentrancyTest</td>
              <td>4</td>
              <td>Reentrancy protection</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">SecuritySettlementTimingTest</td>
              <td>4</td>
              <td>Settlement timing conditions</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">GovernanceOwnableTest</td>
              <td>2</td>
              <td>Ownership restrictions</td>
            </tr>
            <tr>
              <td className="font-mono text-[#EF476F]">CategoryRegistryBranchesTest</td>
              <td>2</td>
              <td>Category registry branch coverage</td>
            </tr>
          </tbody>
        </table>
      </div>

      <hr />

      <h2>Formal Invariant Properties</h2>
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
                <strong>Token conservation.</strong> For any terminal round: SUM(vote stakes) == SUM(claimed rewards) +
                SUM(fees) + dust
              </td>
              <td>Critical</td>
              <td>
                <span className="badge badge-warning whitespace-nowrap text-white">Needs Test</span>
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
                <span className="badge badge-warning whitespace-nowrap text-white">Needs Test</span>
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
                <span className="badge badge-success whitespace-nowrap">Tested</span>
              </td>
            </tr>
            <tr>
              <td>INV-04</td>
              <td>
                <strong>No double claims.</strong> claimReward succeeds at most once per (contentId, roundId, voter)
              </td>
              <td>High</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Tested</span>
              </td>
            </tr>
            <tr>
              <td>INV-05</td>
              <td>
                <strong>Round state finality.</strong> Once Settled/Cancelled/Tied, state never changes
              </td>
              <td>High</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Verified</span>
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
                <span className="badge badge-success whitespace-nowrap">Verified</span>
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
                <span className="badge badge-success whitespace-nowrap">Verified</span>
              </td>
            </tr>
            <tr>
              <td>INV-08</td>
              <td>
                <strong>MAX_SUPPLY enforcement.</strong> crepToken.totalSupply() &le; 100,000,000e6 at all times
              </td>
              <td>Medium</td>
              <td>
                <span className="badge badge-success whitespace-nowrap">Verified</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

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
          <strong>Implement invariant tests</strong> for C-01, C-02, C-03 (pool solvency, token conservation, balance
          solvency).
        </li>
        <li>
          <strong>Verify CategoryRegistry delegation</strong> (M-14) &mdash; ensure deployment script delegates tokens
          to the contract.
        </li>
        <li>
          <strong>Review dormant URL locking</strong> (M-07) &mdash; decide if dormant URLs should be unlocked for
          resubmission.
        </li>
        <li>
          <strong>Test self-opposition profitability</strong> with participation pool at all tiers.
        </li>
      </ol>

      <h3>Short-Term</h3>
      <ol>
        <li>
          <strong>Replace assembly in _decodeReferrer</strong> (H-14) with <code>abi.decode</code> for clarity and
          safety.
        </li>
        <li>
          <strong>Review referrer validation</strong> (M-11) &mdash; decide if revoked VoterID holders should still
          serve as referrers.
        </li>
      </ol>

      <hr />

      <p className="text-base-content/60 text-sm">
        This is an internal AI-assisted security review, not a professional third-party audit. Consolidated audit
        &mdash; March 4, 2026. Covers 5 prior review rounds (V1&ndash;V5, Feb 2025&ndash;Feb 2026). Report generated by
        Claude Code.
      </p>
    </article>
  );
};

export default SecurityAudit;
