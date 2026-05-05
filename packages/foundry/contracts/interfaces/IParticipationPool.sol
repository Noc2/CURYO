// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IParticipationPool
/// @notice Interface for the user-facing Bootstrap Pool — proportional-to-stake rewards with halving schedule
interface IParticipationPool {
    /// @notice Get the current reward rate in basis points based on the halving schedule
    /// @return The current rate in BPS (e.g. 9000 = 90%)
    function getCurrentRateBps() external view returns (uint256);

    /// @notice Distribute a pre-computed reward amount to a voter.
    /// @dev Called by RoundVotingEngine for pull-based bootstrap reward claims.
    /// @param voter The address to reward.
    /// @param amount The pre-computed reward amount.
    /// @return paidAmount The actual amount distributed (can be less than requested if pool is depleted).
    function distributeReward(address voter, uint256 amount) external returns (uint256 paidAmount);

    /// @notice Reserve a reward amount for a beneficiary contract without paying it out yet.
    /// @dev Used to snapshot claimable rewards so later claims do not rely entirely on future authorization state.
    /// @param beneficiary The contract that will later withdraw the reserved reward.
    /// @param amount The amount to reserve.
    /// @return reservedAmount The actual amount reserved (capped by the currently available pool balance).
    function reserveReward(address beneficiary, uint256 amount) external returns (uint256 reservedAmount);

    /// @notice Withdraw previously reserved rewards to a recipient.
    /// @dev Callable only by the beneficiary contract that owns the reserved balance.
    /// @param recipient The address that should receive the withdrawn reward.
    /// @param amount The amount to withdraw.
    /// @return paidAmount The amount withdrawn.
    function withdrawReservedReward(address recipient, uint256 amount) external returns (uint256 paidAmount);

    /// @notice Release part of the caller's reserved reward back into the pool.
    /// @dev Used when snapshotted rewards include unclaimable rounding dust.
    /// @param amount The amount to release.
    /// @return releasedAmount The amount released back into the pool.
    function releaseReservedReward(uint256 amount) external returns (uint256 releasedAmount);
}
