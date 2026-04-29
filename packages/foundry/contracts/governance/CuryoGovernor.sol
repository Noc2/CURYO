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
import { HumanReputation } from "../HumanReputation.sol";

/// @title CuryoGovernor
/// @notice On-chain governance for the Curyo protocol using HREP voting power.
/// @dev Implements OpenZeppelin Governor with:
///      - Simple counting (For/Against/Abstain)
///      - Votes from HREP token (which implements ERC20Votes)
    ///      - Dynamic quorum: 4% of circulating supply (total minus protocol-controlled balances)
    ///      - Bootstrap quorum floor of 1M HREP to prevent early capture while circulation is thin
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
    /// @notice HREP token used for historical locked-balance checks
    IVotes public immutable hrepToken;
    /// @notice Address authorized to perform one-time quorum exclusion initialization
    address public immutable poolsInitializer;
    /// @notice Protocol-controlled holders whose balances are excluded from quorum calculation.
    address[] private _excludedHolders;
    mapping(address => bool) public isExcludedHolder;
    mapping(address => uint48) public excludedHolderEffectiveBlock;
    /// @notice Whether excluded holders have been set.
    bool public poolsInitialized;
    /// @notice Bootstrap proposal threshold regardless of early faucet claim sizes (1K HREP with 6 decimals)
    uint256 public constant BOOTSTRAP_PROPOSAL_THRESHOLD = 1_000 * 1e6;
    /// @notice Minimum quorum regardless of circulating supply (1M HREP with 6 decimals)
    uint256 public constant MINIMUM_QUORUM = 1_000_000 * 1e6;
    /// @notice Highest threshold governance may set, preventing self-bricked proposal creation.
    uint256 public constant MAX_PROPOSAL_THRESHOLD = MINIMUM_QUORUM;
    /// @notice Highest voting delay governance may set (~1 week on 1s Celo blocks).
    uint48 public constant MAX_VOTING_DELAY_BLOCKS = 604_800;
    /// @notice Voting period bounds governance may set (~1 day to ~30 days on 1s Celo blocks).
    uint32 public constant MIN_VOTING_PERIOD_BLOCKS = 86_400;
    uint32 public constant MAX_VOTING_PERIOD_BLOCKS = 2_592_000;
    /// @notice Hard cap to keep quorum evaluation bounded and proposals cheap to evaluate.
    uint256 public constant MAX_EXCLUDED_HOLDERS = 16;
    /// @notice Minimum blocks a proposer must wait between successful proposals (~1 day on 1s Celo blocks).
    uint256 public constant PROPOSAL_COOLDOWN_BLOCKS = 86_400;
    /// @notice Block number where each proposal was created.
    mapping(uint256 => uint256) public proposalCreatedBlock;
    /// @notice Earliest block where each proposer may submit another proposal.
    mapping(address => uint256) public nextProposalBlock;

    error ExcludedHolderCannotGovern(address holder);
    error InvalidExcludedHolder();
    error ProposalCooldownActive(address proposer, uint256 nextProposalBlock);
    error InvalidProposalThreshold();
    error InvalidGovernanceTiming();

    event ExcludedHolderReplaced(address indexed oldHolder, address indexed newHolder);

    /// @notice Deploy the governor with HREP token and timelock
    /// @param _hrepToken The HREP voting token address
    /// @param _timelock The timelock controller address
    constructor(IVotes _hrepToken, TimelockController _timelock)
        Governor("CuryoGovernor")
        GovernorSettings(
            86_400, // Voting delay: ~1 day on 1s Celo blocks
            604_800, // Voting period: ~1 week on 1s Celo blocks
            BOOTSTRAP_PROPOSAL_THRESHOLD
        )
        GovernorVotes(_hrepToken)
        GovernorVotesQuorumFraction(4) // 4% of circulating supply
        GovernorTimelockControl(_timelock)
    {
        hrepToken = _hrepToken;
        poolsInitializer = msg.sender;
    }

    /// @notice One-time initialization of protocol-controlled holders excluded from dynamic quorum.
    /// @dev Can only be called once by the deployment initializer.
    ///      Initial holders are effective for all historical quorum lookups.
    function initializePools(address[] calldata excludedHolders) external {
        require(!poolsInitialized, "Pools already initialized");
        require(msg.sender == poolsInitializer || msg.sender == timelock(), "Only pools initializer");
        require(excludedHolders.length > 0, "No excluded holders");
        require(excludedHolders.length <= MAX_EXCLUDED_HOLDERS, "Too many excluded holders");

        for (uint256 i = 0; i < excludedHolders.length; i++) {
            address holder = excludedHolders[i];
            require(holder != address(0), "Invalid address");
            require(!isExcludedHolder[holder], "Duplicate holder");
            isExcludedHolder[holder] = true;
            excludedHolderEffectiveBlock[holder] = 0;
            _excludedHolders.push(holder);
        }
        poolsInitialized = true;
    }

    /// @notice Add a migrated protocol holder to future quorum exclusions.
    /// @dev Timelock-only via Governor.onlyGovernance. The old holder remains excluded so
    ///      past quorum snapshots keep their original exclusion set and dust cannot block migration.
    function replaceExcludedHolder(address oldHolder, address newHolder) external onlyGovernance {
        if (!poolsInitialized || !isExcludedHolder[oldHolder] || newHolder == address(0) || isExcludedHolder[newHolder])
        {
            revert InvalidExcludedHolder();
        }
        require(_excludedHolders.length < MAX_EXCLUDED_HOLDERS, "Too many excluded holders");

        isExcludedHolder[newHolder] = true;
        excludedHolderEffectiveBlock[newHolder] = uint48(block.number);
        _excludedHolders.push(newHolder);
        emit ExcludedHolderReplaced(oldHolder, newHolder);
    }

    /// @notice Return the full set of holders excluded from quorum calculations.
    function getExcludedHolders() external view returns (address[] memory) {
        return _excludedHolders;
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

    function _setVotingDelay(uint48 newVotingDelay) internal override {
        if (newVotingDelay > MAX_VOTING_DELAY_BLOCKS) revert InvalidGovernanceTiming();
        super._setVotingDelay(newVotingDelay);
    }

    function _setVotingPeriod(uint32 newVotingPeriod) internal override {
        if (newVotingPeriod < MIN_VOTING_PERIOD_BLOCKS || newVotingPeriod > MAX_VOTING_PERIOD_BLOCKS) {
            revert InvalidGovernanceTiming();
        }
        super._setVotingPeriod(newVotingPeriod);
    }

    function _setProposalThreshold(uint256 newProposalThreshold) internal override {
        if (newProposalThreshold == 0 || newProposalThreshold > MAX_PROPOSAL_THRESHOLD) {
            revert InvalidProposalThreshold();
        }
        super._setProposalThreshold(newProposalThreshold);
    }

    /// @notice Dynamic quorum: 4% of circulating supply (total minus excluded protocol-controlled balances)
    /// @dev Uses historical excluded-holder balances at `blockNumber` to align with snapshotted total supply.
    ///      Returns at least MINIMUM_QUORUM to keep early bootstrap governance intentionally conservative.
    function quorum(uint256 blockNumber) public view override(Governor, GovernorVotesQuorumFraction) returns (uint256) {
        uint256 totalSupply = token().getPastTotalSupply(blockNumber);
        uint256 locked = 0;
        uint256 excludedHoldersLength = _excludedHolders.length;
        for (uint256 i = 0; i < excludedHoldersLength; i++) {
            address holder = _excludedHolders[i];
            if (excludedHolderEffectiveBlock[holder] <= blockNumber) {
                locked += hrepToken.getPastVotes(holder, blockNumber);
            }
        }
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

    function _requireNonExcludedGovernor(address account) internal view {
        if (isExcludedHolder[account]) {
            revert ExcludedHolderCannotGovern(account);
        }
    }

    /// @dev Override _castVote to lock the voting power used for 7 days
    function _castVote(uint256 proposalId, address account, uint8 support, string memory reason, bytes memory params)
        internal
        virtual
        override
        returns (uint256 weight)
    {
        _requireNonExcludedGovernor(account);

        weight = super._castVote(proposalId, account, support, reason, params);

        // Lock the voting power that was used
        if (weight > 0) {
            HumanReputation(address(token())).lockForGovernance(account, weight);
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
        _requireNonExcludedGovernor(msg.sender);
        uint256 nextBlock = nextProposalBlock[msg.sender];
        if (block.number < nextBlock) {
            revert ProposalCooldownActive(msg.sender, nextBlock);
        }

        uint256 proposalId = super.propose(targets, values, calldatas, description);
        proposalCreatedBlock[proposalId] = block.number;
        nextProposalBlock[msg.sender] = block.number + PROPOSAL_COOLDOWN_BLOCKS;

        // Lock proposal threshold amount for the proposer
        HumanReputation(address(token())).lockForGovernance(msg.sender, proposalThreshold());

        return proposalId;
    }
}
