// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RoundLib
/// @notice Helpers for per-content round state transitions and timing.
/// @dev Rounds replace global epochs. Each content item has independent rounds that
///      accumulate votes across 15-minute tlock epochs. Settlement triggers when ≥3
///      votes are revealed. If 1 week passes without ≥3 votes, the round cancels with full refunds.
///      Tlock is the primary reveal mechanism — votes are encrypted to the epoch end time
///      and become decryptable via drand after each 15-minute window.
library RoundLib {
    // --- Enums ---

    enum RoundState {
        Open, // Accepting votes in 15-minute epochs; reveals happen after each epoch
        Settled, // ≥3 votes revealed, rewards distributed
        Cancelled, // Expired (1 week) without ≥3 votes, or no reveals — full refund
        Tied // Equal pools after ≥3 votes — refund revealed voters
    }

    // --- Structs ---

    struct RoundConfig {
        uint256 epochDuration; // Duration of each voting epoch (default: 15 minutes)
        uint256 maxDuration; // Max time before round expires (default: 7 days)
        uint256 minVoters; // Minimum revealed votes to trigger settlement (default: 3)
        uint256 maxVoters; // Gas safety cap (default: 200)
    }

    struct Round {
        uint256 startTime; // When first vote was committed
        RoundState state;
        uint256 voteCount; // Total commits across all epochs
        uint256 revealedCount; // Total revealed votes
        uint256 totalStake; // Total staked across all voters
        uint256 upPool; // Total staked by UP voters (updated as votes are revealed)
        uint256 downPool; // Total staked by DOWN voters (updated as votes are revealed)
        uint256 upCount; // Number of UP voters (updated as votes are revealed)
        uint256 downCount; // Number of DOWN voters (updated as votes are revealed)
        bool upWins; // Set after settlement
        uint256 settledAt; // Timestamp when round was settled/tied (for forfeit cutoff)
        uint256 thresholdReachedAt; // When revealedCount first reached minVoters (0 = not yet)
    }

    struct Commit {
        address voter;
        uint256 stakeAmount;
        bytes ciphertext; // tlock-encrypted payload (decryptable after epoch end via drand)
        address frontend; // Frontend operator address (for fee distribution)
        uint256 revealableAfter; // Epoch end timestamp — reveals allowed after this time
        bool revealed;
        bool isUp; // Set after reveal
    }

    // --- State checks ---

    /// @notice Check if a round has expired without reaching settlement.
    function isExpired(Round storage round, uint256 maxDuration) internal view returns (bool) {
        return round.state == RoundState.Open && round.startTime > 0 && block.timestamp >= round.startTime + maxDuration;
    }

    /// @notice Check if a round is in a terminal state.
    function isTerminal(Round storage round) internal view returns (bool) {
        return
            round.state == RoundState.Settled || round.state == RoundState.Cancelled || round.state == RoundState.Tied;
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
        uint256 elapsed = commitTimestamp - round.startTime;
        uint256 epochIndex = elapsed / epochDuration;
        return round.startTime + (epochIndex + 1) * epochDuration;
    }
}
