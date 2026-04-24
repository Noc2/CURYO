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
