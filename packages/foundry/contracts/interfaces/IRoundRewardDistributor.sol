// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IRoundRewardDistributor
/// @notice Minimal interface for direct reward-claim entrypoints.
interface IRoundRewardDistributor {
    /// @notice Claim frontend fees for a settled round.
    function claimFrontendFee(uint256 contentId, uint256 roundId, address frontend) external returns (uint256 fee);

    /// @notice Claim a participation reward for the caller on a settled round.
    function claimParticipationReward(uint256 contentId, uint256 roundId) external returns (uint256 paidReward);
}
