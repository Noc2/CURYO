// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Governor } from "@openzeppelin/contracts/governance/Governor.sol";
import { GovernorCountingSimple } from "@openzeppelin/contracts/governance/extensions/GovernorCountingSimple.sol";
import { GovernorVotes } from "@openzeppelin/contracts/governance/extensions/GovernorVotes.sol";
import {
    GovernorVotesQuorumFraction
} from "@openzeppelin/contracts/governance/extensions/GovernorVotesQuorumFraction.sol";
import { GovernorTimelockControl } from "@openzeppelin/contracts/governance/extensions/GovernorTimelockControl.sol";
import { GovernorSettings } from "@openzeppelin/contracts/governance/extensions/GovernorSettings.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IVotes } from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import { CuryoReputation } from "../CuryoReputation.sol";

/// @title CuryoGovernor
/// @notice On-chain governance for the Curyo protocol using cREP voting power.
/// @dev Implements OpenZeppelin Governor with:
///      - Simple counting (For/Against/Abstain)
///      - Votes from cREP token (which implements ERC20Votes)
///      - Dynamic quorum: 4% of circulating supply (total minus locked pool balances)
///      - Minimum quorum floor of 10K cREP to prevent trivial early proposals
///      - Timelock execution for security
///      - 7-day token lock when voting or proposing
contract CuryoGovernor is
    Governor,
    GovernorSettings,
    GovernorCountingSimple,
    GovernorVotes,
    GovernorVotesQuorumFraction,
    GovernorTimelockControl
{
    /// @notice cREP token used for historical locked-balance checks
    IVotes public immutable crepToken;
    /// @notice Address authorized to perform one-time pool initialization
    address public immutable poolsInitializer;
    /// @notice Pool contracts whose balances are excluded from quorum calculation
    address public humanFaucet;
    address public participationPool;
    address public rewardDistributor;
    /// @notice Whether pool addresses have been set (one-time initialization)
    bool public poolsInitialized;
    /// @notice Minimum quorum regardless of circulating supply (10K cREP with 6 decimals)
    uint256 public constant MINIMUM_QUORUM = 10_000 * 1e6;

    /// @notice Deploy the governor with cREP token and timelock
    /// @param _crepToken The cREP voting token address
    /// @param _timelock The timelock controller address
    constructor(IVotes _crepToken, TimelockController _timelock)
        Governor("CuryoGovernor")
        GovernorSettings(
            7200, // Voting delay: ~1 day (assuming 12s blocks)
            50400, // Voting period: ~1 week
            100e6 // Proposal threshold: 100 cREP (with 6 decimals)
        )
        GovernorVotes(_crepToken)
        GovernorVotesQuorumFraction(4) // 4% of circulating supply
        GovernorTimelockControl(_timelock)
    {
        crepToken = _crepToken;
        poolsInitializer = msg.sender;
    }

    /// @notice One-time initialization of pool addresses for dynamic quorum calculation.
    /// @dev Can only be called once by the deployment initializer.
    ///      After initialization, pool addresses cannot be changed — the quorum formula is fixed.
    // AUDIT NOTE (L-1): Pool addresses are immutable after initialization. If wrong
    // addresses are passed, dynamic quorum is permanently broken. This is intentional
    // to prevent governance manipulation of the quorum formula.
    function initializePools(address _humanFaucet, address _participationPool, address _rewardDistributor) external {
        require(!poolsInitialized, "Pools already initialized");
        require(msg.sender == poolsInitializer, "Only pools initializer");
        require(
            _humanFaucet != address(0) && _participationPool != address(0) && _rewardDistributor != address(0),
            "Invalid address"
        );
        require(
            _humanFaucet != _participationPool && _humanFaucet != _rewardDistributor
                && _participationPool != _rewardDistributor,
            "Duplicate pool"
        );
        humanFaucet = _humanFaucet;
        participationPool = _participationPool;
        rewardDistributor = _rewardDistributor;
        poolsInitialized = true;
    }

    // --- Required Overrides ---

    function votingDelay() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingDelay();
    }

    function votingPeriod() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.votingPeriod();
    }

    function proposalThreshold() public view override(Governor, GovernorSettings) returns (uint256) {
        return super.proposalThreshold();
    }

    /// @notice Dynamic quorum: 4% of circulating supply (total minus locked pool balances)
    /// @dev Uses historical pool balances at `blockNumber` to align with snapshotted total supply.
    ///      Returns at least MINIMUM_QUORUM to prevent trivial early proposals.
    function quorum(uint256 blockNumber) public view override(Governor, GovernorVotesQuorumFraction) returns (uint256) {
        uint256 totalSupply = token().getPastTotalSupply(blockNumber);
        uint256 locked = crepToken.getPastVotes(humanFaucet, blockNumber)
            + crepToken.getPastVotes(participationPool, blockNumber)
            + crepToken.getPastVotes(rewardDistributor, blockNumber);
        uint256 circulating = totalSupply > locked ? totalSupply - locked : 0;
        uint256 dynamicQuorum = (circulating * quorumNumerator(blockNumber)) / quorumDenominator();
        return dynamicQuorum > MINIMUM_QUORUM ? dynamicQuorum : MINIMUM_QUORUM;
    }

    function state(uint256 proposalId) public view override(Governor, GovernorTimelockControl) returns (ProposalState) {
        return super.state(proposalId);
    }

    function proposalNeedsQueuing(uint256 proposalId)
        public
        view
        override(Governor, GovernorTimelockControl)
        returns (bool)
    {
        return super.proposalNeedsQueuing(proposalId);
    }

    function _queueOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint48) {
        return super._queueOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _executeOperations(
        uint256 proposalId,
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) {
        super._executeOperations(proposalId, targets, values, calldatas, descriptionHash);
    }

    function _cancel(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        bytes32 descriptionHash
    ) internal override(Governor, GovernorTimelockControl) returns (uint256) {
        return super._cancel(targets, values, calldatas, descriptionHash);
    }

    function _executor() internal view override(Governor, GovernorTimelockControl) returns (address) {
        return super._executor();
    }

    // --- Governance Lock Integration ---

    /// @dev Override _castVote to lock the voting power used for 7 days
    function _castVote(uint256 proposalId, address account, uint8 support, string memory reason, bytes memory params)
        internal
        virtual
        override
        returns (uint256 weight)
    {
        weight = super._castVote(proposalId, account, support, reason, params);

        // Lock the voting power that was used
        if (weight > 0) {
            CuryoReputation(address(token())).lockForGovernance(account, weight);
        }

        return weight;
    }

    /// @dev Override propose to lock the proposal threshold amount for 7 days
    function propose(
        address[] memory targets,
        uint256[] memory values,
        bytes[] memory calldatas,
        string memory description
    ) public virtual override(Governor) returns (uint256) {
        uint256 proposalId = super.propose(targets, values, calldatas, description);

        // Lock proposal threshold amount for the proposer
        CuryoReputation(address(token())).lockForGovernance(msg.sender, proposalThreshold());

        return proposalId;
    }
}
