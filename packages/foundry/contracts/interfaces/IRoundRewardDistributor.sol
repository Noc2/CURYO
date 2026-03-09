// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IRoundRewardDistributor
/// @notice Minimal interface used by RoundVotingEngine for delegated pull-claim handling.
interface IRoundRewardDistributor {
    /// @notice Claim frontend fees for a settled round. Callable through RoundVotingEngine.
    function claimFrontendFee(uint256 contentId, uint256 roundId, address frontend) external returns (uint256 fee);

    /// @notice Claim a participation reward for a voter. Callable through RoundVotingEngine.
    function claimParticipationRewardFor(address voter, uint256 contentId, uint256 roundId)
        external
        returns (uint256 paidReward);
}
