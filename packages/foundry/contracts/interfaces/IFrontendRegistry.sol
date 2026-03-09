// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IFrontendRegistry
/// @notice Interface for the FrontendRegistry contract that manages frontend operator registration and fees
interface IFrontendRegistry {
    error FrontendIsSlashed();

    /// @notice Check if a frontend address is approved to earn fees
    /// @param frontend The frontend address to check
    /// @return True if the frontend is approved and not slashed
    function isApproved(address frontend) external view returns (bool);

    /// @notice Credit cREP fees to a frontend operator (called by RoundVotingEngine)
    /// @param frontend The frontend address to credit
    /// @param crepAmount Amount of cREP fees
    function creditFees(address frontend, uint256 crepAmount) external;

    /// @notice Get the accumulated cREP fees for a frontend
    /// @param frontend The frontend address
    /// @return crepFees Accumulated cREP fees
    function getAccumulatedFees(address frontend) external view returns (uint256 crepFees);

    /// @notice Get frontend info
    /// @param frontend The frontend address
    /// @return operator The operator address
    /// @return stakedAmount Amount of cREP staked
    /// @return approved Whether the frontend is approved
    /// @return slashed Whether the frontend has been slashed
    function getFrontendInfo(address frontend)
        external
        view
        returns (address operator, uint256 stakedAmount, bool approved, bool slashed);
}
