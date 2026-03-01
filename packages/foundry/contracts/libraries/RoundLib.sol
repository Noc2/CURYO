// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RoundLib
/// @notice Helpers for per-content round state transitions and timing.
/// @dev Rounds replace global epochs. Each content item has independent rounds that
///      accumulate public votes. Settlement happens randomly with increasing probability
///      per block after a minimum epoch length. Early voters get more shares per cREP
///      staked via bonding curve dynamics.
library RoundLib {
    // --- Enums ---

    enum RoundState {
        Open, // Accepting votes; settlement can trigger randomly after minEpochBlocks
        Settled, // Settlement triggered, rewards distributed
        Cancelled, // Expired (maxDuration) without enough voters — full refund
        Tied // Equal pools after settlement — refund all voters
    }

    // --- Structs ---

    struct RoundConfig {
        uint64 minEpochBlocks; // Minimum blocks before settlement possible (default: 150 ~30min)
        uint64 maxEpochBlocks; // Maximum blocks before forced settlement (default: 1800 ~6hrs)
        uint256 maxDuration; // Max wall-clock time before round expires (default: 7 days)
        uint256 minVoters; // Minimum voters for settlement (default: 3)
        uint256 maxVoters; // Gas safety cap (default: 1000)
        uint16 baseRateBps; // Base settlement probability per block in BPS (default: 30)
        uint16 growthRateBps; // Probability growth per block in BPS (default: 3)
        uint16 maxProbBps; // Maximum per-block settlement probability in BPS (default: 500)
        uint256 liquidityParam; // Bonding curve liquidity parameter b (default: 1000e6)
    }

    struct Round {
        uint256 startTime; // When first vote was cast (wall-clock for expiry)
        uint64 startBlock; // Block number when first vote was cast (for settlement probability)
        RoundState state;
        uint256 voteCount; // Total votes cast
        uint256 totalStake; // Total staked across all voters
        uint256 totalUpStake; // Total staked by UP voters
        uint256 totalDownStake; // Total staked by DOWN voters
        uint256 totalUpShares; // Total shares held by UP voters
        uint256 totalDownShares; // Total shares held by DOWN voters
        uint256 upCount; // Number of UP voters
        uint256 downCount; // Number of DOWN voters
        bool upWins; // Set after settlement
        uint256 settledAt; // Timestamp when round was settled/tied
        uint16 epochStartRating; // Content rating when epoch started (for live updates)
    }

    struct Vote {
        address voter;
        uint256 stake;
        uint256 shares; // Bonding curve shares: stake * b / (sameDirectionStake + b)
        bool isUp;
        address frontend; // Frontend operator address (for fee distribution)
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
}
