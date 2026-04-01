// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RoundLib
/// @notice Helpers for per-content round state transitions and timing.
/// @dev Rounds replace global epochs. Each content item has independent rounds that
///      accumulate votes across 20-minute tlock epochs. Settlement triggers when ≥3
///      votes are revealed. If 1 week passes below commit quorum the round cancels with refunds;
///      once commit quorum exists, failure to reach reveal quorum can finalize as RevealFailed.
///      Tlock is the primary reveal mechanism — votes are encrypted to the epoch end time
///      and become decryptable via drand after each epoch window.
///      Epoch-weighting: epoch-1 (blind) = 100% reward weight; epoch-2+ (informed) = 25%.
library RoundLib {
    // --- Enums ---

    enum RoundState {
        Open, // Accepting votes in 20-minute epochs; reveals happen after each epoch
        Settled, // ≥3 votes revealed, rewards distributed
        Cancelled, // Expired with commit count below minVoters — full refund
        Tied, // Equal weighted pools after ≥3 reveals — revealed voters refund, unrevealed cleaned separately
        RevealFailed // Commit quorum reached, but reveal quorum never did before the final reveal grace deadline
    }

    // --- Structs ---

    struct RoundConfig {
        uint32 epochDuration; // Duration of each voting epoch (default: 20 minutes)
        uint32 maxDuration; // Max time before round expires (default: 7 days)
        uint16 minVoters; // Minimum revealed votes to trigger settlement (default: 3)
        uint16 maxVoters; // Gas safety cap (default: 1000)
    }

    struct Round {
        uint48 startTime; // When first vote was committed
        RoundState state;
        uint16 voteCount; // Total commits across all epochs
        uint16 revealedCount; // Total revealed votes
        uint64 totalStake; // Total staked across all voters
        uint64 upPool; // Total raw stake by UP voters (updated as votes are revealed)
        uint64 downPool; // Total raw stake by DOWN voters (updated as votes are revealed)
        uint16 upCount; // Number of UP voters (updated as votes are revealed)
        uint16 downCount; // Number of DOWN voters (updated as votes are revealed)
        bool upWins; // Set after settlement
        uint48 settledAt; // Timestamp when round was settled/tied (for forfeit cutoff)
        uint48 thresholdReachedAt; // When revealedCount first reached minVoters (0 = not yet)
        uint64 weightedUpPool; // Epoch-weighted effective stake for UP side (100% epoch-1, 25% epoch-2+)
        uint64 weightedDownPool; // Epoch-weighted effective stake for DOWN side
    }

    struct Commit {
        address voter;
        uint64 stakeAmount;
        bytes ciphertext; // tlock-encrypted payload (decryptable after epoch end via drand)
        uint64 targetRound; // drand round targeted by the ciphertext
        bytes32 drandChainHash; // drand chain hash bound into the commitment
        address frontend; // Frontend operator address (for fee distribution)
        uint48 revealableAfter; // Epoch end timestamp — reveals allowed after this time
        bool revealed;
        bool isUp; // Set after reveal
        uint8 epochIndex; // 0 = epoch 1 (blind, 100% weight), 1 = epoch 2+ (saw results, 25% weight)
    }

    // --- Epoch weight ---

    /// @notice Return epoch weight in BPS: epoch-1 = 10000 (100%), epoch-2+ = 2500 (25%).
    function epochWeightBps(uint8 epochIndex) internal pure returns (uint256) {
        return epochIndex == 0 ? 10000 : 2500;
    }

    /// @notice Compute epoch-weighted effective stake for a commit.
    function effectiveStake(Commit storage commit) internal view returns (uint256) {
        return (uint256(commit.stakeAmount) * epochWeightBps(commit.epochIndex)) / 10000;
    }

    // --- State checks ---

    /// @notice Check if a round has expired without reaching settlement.
    function isExpired(Round storage round, uint256 maxDuration) internal view returns (bool) {
        return round.state == RoundState.Open && round.startTime > 0
            && block.timestamp >= uint256(round.startTime) + maxDuration;
    }

    /// @notice Check if a round is in a terminal state.
    function isTerminal(Round storage round) internal view returns (bool) {
        return round.state == RoundState.Settled || round.state == RoundState.Cancelled
            || round.state == RoundState.Tied || round.state == RoundState.RevealFailed;
    }

    /// @notice Check if a round accepts new votes (Open and not expired).
    function acceptsVotes(Round storage round, uint256 maxDuration) internal view returns (bool) {
        return round.state == RoundState.Open && !isExpired(round, maxDuration);
    }

    /// @notice Compute the epoch end time for a vote committed at the given timestamp.
    /// @param round The round containing the vote.
    /// @param epochDuration Duration of each epoch in seconds.
    /// @param commitTimestamp The block.timestamp when the vote was committed.
    /// @return epochEnd The timestamp when this vote's epoch ends (and it becomes revealable).
    function computeEpochEnd(Round storage round, uint256 epochDuration, uint256 commitTimestamp)
        internal
        view
        returns (uint256)
    {
        uint256 elapsed = commitTimestamp - uint256(round.startTime);
        uint256 epochIdx = elapsed / epochDuration;
        return uint256(round.startTime) + (epochIdx + 1) * epochDuration;
    }

    /// @notice Compute the epoch index for a vote committed at the given timestamp (capped at 1).
    /// @param round The round.
    /// @param epochDuration Duration of each epoch in seconds.
    /// @param commitTimestamp The block.timestamp when the vote was committed.
    /// @return epochIdx 0 if in epoch-1, 1 if in epoch-2 or later.
    function computeEpochIndex(Round storage round, uint256 epochDuration, uint256 commitTimestamp)
        internal
        view
        returns (uint8)
    {
        uint256 elapsed = commitTimestamp - uint256(round.startTime);
        uint256 idx = elapsed / epochDuration;
        return idx == 0 ? 0 : 1; // binary two-tier
    }
}
