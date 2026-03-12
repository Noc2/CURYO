// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { RoundLib } from "../libraries/RoundLib.sol";

/// @title IRoundVotingEngine
/// @notice Interface for RoundVotingEngine contract used by ContentRegistry and other contracts.
interface IRoundVotingEngine {
    /// @notice Get total lifetime commit count for a content item.
    /// @param contentId The content ID to query.
    /// @return Total number of commits ever made for this content.
    function contentCommitCount(uint256 contentId) external view returns (uint256);

    /// @notice Get the current active round ID for a content item.
    /// @param contentId The content ID to query.
    /// @return Active round ID, or 0 if there is no open round.
    function currentRoundId(uint256 contentId) external view returns (uint256);

    function rounds(uint256 contentId, uint256 roundId)
        external
        view
        returns (
            uint256 startTime,
            RoundLib.RoundState state,
            uint256 voteCount,
            uint256 revealedCount,
            uint256 totalStake,
            uint256 upPool,
            uint256 downPool,
            uint256 upCount,
            uint256 downCount,
            bool upWins,
            uint256 settledAt,
            uint256 thresholdReachedAt,
            uint256 weightedUpPool,
            uint256 weightedDownPool
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
