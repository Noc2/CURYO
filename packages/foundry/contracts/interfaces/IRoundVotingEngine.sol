// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { RoundLib } from "../libraries/RoundLib.sol";

/// @title IRoundVotingEngine
/// @notice Interface for RoundVotingEngine contract used by ContentRegistry and other contracts.
interface IRoundVotingEngine {
    /// @notice Whether the content item has ever received at least one vote commit.
    function hasCommits(uint256 contentId) external view returns (bool);

    /// @notice Get the current active round ID for a content item.
    /// @param contentId The content ID to query.
    /// @return Active round ID, or 0 if there is no open round.
    function currentRoundId(uint256 contentId) external view returns (uint256);

    function rounds(uint256 contentId, uint256 roundId)
        external
        view
        returns (
            uint48 startTime,
            RoundLib.RoundState state,
            uint16 voteCount,
            uint16 revealedCount,
            uint64 totalStake,
            uint64 upPool,
            uint64 downPool,
            uint16 upCount,
            uint16 downCount,
            bool upWins,
            uint48 settledAt,
            uint48 thresholdReachedAt,
            uint64 weightedUpPool,
            uint64 weightedDownPool
        );

    /// @notice Transfer cREP reward tokens to a recipient. Only callable by RewardDistributor.
    /// @param recipient The address to receive tokens.
    /// @param crepAmount The amount of cREP to transfer.
    function transferReward(address recipient, uint256 crepAmount) external;

    /// @notice Add cREP to the consensus reserve (e.g. from slashed stakes).
    /// @dev Permissionless — caller must have approved this contract to spend `amount`.
    /// @param amount Amount of cREP to add to the consensus reserve.
    function addToConsensusReserve(uint256 amount) external;
}
