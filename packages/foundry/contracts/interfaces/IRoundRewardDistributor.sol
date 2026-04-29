// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IRoundRewardDistributor
/// @notice Minimal interface for direct reward-claim entrypoints.
interface IRoundRewardDistributor {
    /// @notice Voting engine this distributor is allowed to pay claims for.
    function votingEngine() external view returns (address);

    /// @notice Snapshot and reserve participation rewards for a newly settled round.
    /// @dev Callable only by the voting engine during settlement.
    function snapshotParticipationRewards(
        uint256 contentId,
        uint256 roundId,
        address rewardPool,
        uint256 rewardRateBps,
        uint256 winningStake
    ) external;

    /// @notice Claim frontend fees for a settled round.
    function claimFrontendFee(uint256 contentId, uint256 roundId, address frontend) external returns (uint256 fee);

    /// @notice Route a settled frontend fee to protocol once the frontend is slashed or underbonded.
    function confiscateFrontendFee(uint256 contentId, uint256 roundId, address frontend) external returns (uint256 fee);

    /// @notice Claim a participation reward for the caller on a settled round.
    function claimParticipationReward(uint256 contentId, uint256 roundId) external returns (uint256 paidReward);
}
