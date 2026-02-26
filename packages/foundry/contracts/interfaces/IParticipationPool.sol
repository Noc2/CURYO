// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IParticipationPool
/// @notice Interface for the Participation Pool — proportional-to-stake rewards with halving schedule
interface IParticipationPool {
    /// @notice Reward a voter for casting a vote
    /// @param voter The address to reward
    /// @param stakeAmount The amount staked on this vote (reward = stake × currentRate)
    function rewardVote(address voter, uint256 stakeAmount) external;

    /// @notice Reward a submitter for submitting content
    /// @param submitter The address to reward
    /// @param stakeAmount The submitter stake amount (reward = stake × currentRate)
    function rewardSubmission(address submitter, uint256 stakeAmount) external;

    /// @notice Get the current reward rate in basis points based on the halving schedule
    /// @return The current rate in BPS (e.g. 9000 = 90%)
    function getCurrentRateBps() external view returns (uint256);

    /// @notice Distribute a pre-computed reward amount to a voter.
    /// @dev Called by RoundVotingEngine for pull-based participation reward claims.
    /// @param voter The address to reward.
    /// @param amount The pre-computed reward amount.
    /// @return paidAmount The actual amount distributed (can be less than requested if pool is depleted).
    function distributeReward(address voter, uint256 amount) external returns (uint256 paidAmount);
}
