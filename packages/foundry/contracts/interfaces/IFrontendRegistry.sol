// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IFrontendRegistry
/// @notice Interface for the FrontendRegistry contract that manages frontend operator registration and fees
interface IFrontendRegistry {
    error FrontendIsSlashed();
    error FrontendExitPending();

    /// @notice Fixed HREP stake required for frontend registration
    function STAKE_AMOUNT() external view returns (uint256);

    /// @notice Check if a frontend address is eligible to earn fees
    /// @param frontend The frontend address to check
    /// @return True if the frontend is fully bonded, not slashed, and not exiting
    function isEligible(address frontend) external view returns (bool);

    /// @notice Credit HREP fees to a frontend operator (called by RoundVotingEngine)
    /// @param frontend The frontend address to credit
    /// @param hrepAmount Amount of HREP fees
    function creditFees(address frontend, uint256 hrepAmount) external;

    /// @notice Get the accumulated HREP fees for a frontend
    /// @param frontend The frontend address
    /// @return hrepFees Accumulated HREP fees
    function getAccumulatedFees(address frontend) external view returns (uint256 hrepFees);

    /// @notice Whether a registered frontend can receive historical fees right now.
    /// @dev Mirrors the `claimFees` eligibility (active operator, fully bonded, not slashed,
    ///      not mid-unbonding, Voter ID active). Does NOT verify the frontend was registered
    ///      at the time the round settled; use `canClaimFeesForRound` for that round-time
    ///      guard.
    function canReceiveHistoricalFees(address frontend) external view returns (bool);

    /// @notice Whether a frontend can claim fees for a round that settled at `roundSettledAt`.
    /// @dev Combines `canReceiveHistoricalFees` with a strict registration-window check:
    ///      `frontends[frontend].registeredAt < roundSettledAt`. A frontend that
    ///      deregistered and re-registered at or after a round settled cannot claim that
    ///      round's historical fees — those should route to Protocol disposition. The strict
    ///      `<` (rather than `<=`) is intentional: same-block re-registration must not
    ///      revive fees from the round settling in that same block.
    function canClaimFeesForRound(address frontend, uint48 roundSettledAt) external view returns (bool);

    /// @notice Get frontend info
    /// @param frontend The frontend address
    /// @return operator The operator address
    /// @return stakedAmount Amount of HREP staked
    /// @return eligible Whether the frontend is currently eligible to earn fees
    /// @return slashed Whether the frontend has been slashed
    function getFrontendInfo(address frontend)
        external
        view
        returns (address operator, uint256 stakedAmount, bool eligible, bool slashed);
}
