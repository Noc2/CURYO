// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IRoundVotingEngine
/// @notice Interface for RoundVotingEngine contract used by ContentRegistry and other contracts.
interface IRoundVotingEngine {
    /// @notice Get total lifetime commit count for a content item.
    /// @param contentId The content ID to query.
    /// @return Total number of commits ever made for this content.
    function getContentCommitCount(uint256 contentId) external view returns (uint256);

    /// @notice Get the current active round ID for a content item.
    /// @param contentId The content ID to query.
    /// @return Active round ID, or 0 if there is no open round.
    function getActiveRoundId(uint256 contentId) external view returns (uint256);

    /// @notice Check if content has unrevealed votes in active rounds.
    /// @param contentId The content ID to query.
    /// @return True if there are pending unrevealed votes.
    function hasUnrevealedVotes(uint256 contentId) external view returns (bool);

    /// @notice Transfer cREP reward tokens to a recipient. Only callable by RewardDistributor.
    /// @param recipient The address to receive tokens.
    /// @param crepAmount The amount of cREP to transfer.
    function transferReward(address recipient, uint256 crepAmount) external;

    /// @notice Add cREP to the consensus reserve (e.g. from slashed stakes).
    /// @dev Permissionless — caller must have approved this contract to spend `amount`.
    /// @param amount Amount of cREP to add to the consensus reserve.
    function addToConsensusReserve(uint256 amount) external;

    /// @notice Frontend operator claims fees for a settled round. Pull-based, permissionless.
    function claimFrontendFee(uint256 contentId, uint256 roundId, address frontend) external;

    /// @notice Claim participation reward for a settled round. Pull-based.
    function claimParticipationReward(uint256 contentId, uint256 roundId) external;
}
