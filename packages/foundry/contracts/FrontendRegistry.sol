// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IFrontendRegistry } from "./interfaces/IFrontendRegistry.sol";
import { IRoundVotingEngine } from "./interfaces/IRoundVotingEngine.sol";
import { IVoterIdNFT } from "./interfaces/IVoterIdNFT.sol";

/// @title FrontendRegistry
/// @notice Manages frontend operator registration (fixed 1,000 cREP stake) and fee distribution.
/// @dev Frontend operators stake cREP, get approved via governance, and earn cREP fees from votes using their code.
contract FrontendRegistry is
    IFrontendRegistry,
    Initializable,
    AccessControlUpgradeable,
    ReentrancyGuardTransient,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // --- Access Control Roles ---
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    bytes32 public constant FEE_CREDITOR_ROLE = keccak256("FEE_CREDITOR_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    /// @notice Maximum cREP that can be credited in a single creditFees() call (10,000 cREP with 6 decimals)
    uint256 public constant MAX_FEE_CREDIT = 10_000e6;

    /// @notice Fixed cREP stake required for frontend registration (1,000 cREP with 6 decimals)
    uint256 public constant STAKE_AMOUNT = 1000e6;

    // --- Structs ---
    struct Frontend {
        address operator;
        uint256 stakedAmount;
        uint256 crepFees;
        bool approved;
        bool slashed;
        uint256 registeredAt;
    }

    // --- State ---
    IERC20 public crepToken;
    IRoundVotingEngine public votingEngine;

    uint256 private __deprecated_minStake; // was: minStake (kept for storage layout)
    mapping(address => Frontend) public frontends;
    address[] public registeredFrontends;
    IVoterIdNFT public voterIdNFT; // Voter ID NFT for sybil resistance

    /// @dev Reserved storage gap for future upgrades
    uint256[50] private __gap;

    // --- Events ---
    event FrontendRegistered(address indexed frontend, address indexed operator, uint256 stakedAmount);
    event FrontendApproved(address indexed frontend);
    event FrontendSlashed(address indexed frontend, uint256 amount, string reason);
    event FrontendDeregistered(address indexed frontend);
    event FeesCredited(address indexed frontend, uint256 crepAmount);
    event FeesClaimed(address indexed frontend, uint256 crepAmount);
    event VoterIdNFTUpdated(address voterIdNFT);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize the frontend registry contract.
    /// @param _admin Address with temporary admin role for initial wiring.
    /// @param _governance Address with permanent governance roles (timelock).
    /// @param _crepToken cREP token address for staking and fee distribution.
    function initialize(address _admin, address _governance, address _crepToken) public initializer {
        __AccessControl_init();

        require(_admin != address(0), "Invalid admin");
        require(_governance != address(0), "Invalid governance");
        require(_crepToken != address(0), "Invalid token");

        // Governance gets all permanent roles
        _grantRole(DEFAULT_ADMIN_ROLE, _governance);
        _grantRole(ADMIN_ROLE, _governance);
        _grantRole(GOVERNANCE_ROLE, _governance);
        _grantRole(UPGRADER_ROLE, _governance);

        // Admin gets only ADMIN_ROLE for initial cross-contract wiring
        if (_admin != _governance) {
            _grantRole(ADMIN_ROLE, _admin);
        }

        crepToken = IERC20(_crepToken);
    }

    // --- View Functions ---

    /// @inheritdoc IFrontendRegistry
    function isApproved(address frontend) external view override returns (bool) {
        Frontend storage f = frontends[frontend];
        return f.approved && !f.slashed;
    }

    /// @inheritdoc IFrontendRegistry
    function getAccumulatedFees(address frontend) external view override returns (uint256 crepFees) {
        Frontend storage f = frontends[frontend];
        return f.crepFees;
    }

    /// @inheritdoc IFrontendRegistry
    function getFrontendInfo(address frontend)
        external
        view
        override
        returns (address operator, uint256 stakedAmount, bool approved, bool slashed)
    {
        Frontend storage f = frontends[frontend];
        return (f.operator, f.stakedAmount, f.approved, f.slashed);
    }

    /// @notice Get the list of all registered frontend addresses
    function getRegisteredFrontends() external view returns (address[] memory) {
        return registeredFrontends;
    }

    /// @notice Get the total number of registered frontends
    function getFrontendCount() external view returns (uint256) {
        return registeredFrontends.length;
    }

    // --- Registration Functions ---

    /// @notice Register as a frontend operator by staking 1,000 cREP
    /// @dev After registration, governance must approve before earning fees
    function register() external nonReentrant {
        // Require Voter ID if VoterIdNFT is configured
        if (address(voterIdNFT) != address(0)) {
            require(voterIdNFT.hasVoterId(msg.sender), "Voter ID required");
        }

        require(frontends[msg.sender].operator == address(0), "Already registered");

        crepToken.safeTransferFrom(msg.sender, address(this), STAKE_AMOUNT);

        frontends[msg.sender] = Frontend({
            operator: msg.sender,
            stakedAmount: STAKE_AMOUNT,
            crepFees: 0,
            approved: false,
            slashed: false,
            registeredAt: block.timestamp
        });

        registeredFrontends.push(msg.sender);

        emit FrontendRegistered(msg.sender, msg.sender, STAKE_AMOUNT);
    }

    /// @notice Voluntarily deregister and reclaim stake + pending fees (if not slashed)
    function deregister() external nonReentrant {
        Frontend storage f = frontends[msg.sender];
        require(f.operator != address(0), "Not registered");
        require(!f.slashed, "Frontend is slashed");

        uint256 refund = f.stakedAmount;
        uint256 pendingFees = f.crepFees;
        f.stakedAmount = 0;
        f.crepFees = 0;
        f.approved = false;
        f.operator = address(0); // Allow re-registration

        uint256 total = refund + pendingFees;
        if (total > 0) {
            crepToken.safeTransfer(msg.sender, total);
        }

        if (pendingFees > 0) {
            emit FeesClaimed(msg.sender, pendingFees);
        }
        emit FrontendDeregistered(msg.sender);
    }

    /// @notice Claim accumulated cREP fees
    function claimFees() external nonReentrant {
        Frontend storage f = frontends[msg.sender];
        require(f.operator != address(0), "Not registered");

        uint256 crepAmount = f.crepFees;

        require(crepAmount > 0, "No fees to claim");

        f.crepFees = 0;

        crepToken.safeTransfer(msg.sender, crepAmount);

        emit FeesClaimed(msg.sender, crepAmount);
    }

    // --- Fee Crediting (called by RoundVotingEngine) ---

    /// @inheritdoc IFrontendRegistry
    function creditFees(address frontend, uint256 crepAmount) external override onlyRole(FEE_CREDITOR_ROLE) {
        require(crepAmount <= MAX_FEE_CREDIT, "Fee credit too large");
        Frontend storage f = frontends[frontend];
        require(f.operator != address(0), "Frontend not registered");
        f.crepFees += crepAmount;
        emit FeesCredited(frontend, crepAmount);
    }

    // --- Governance Functions ---

    /// @notice Approve a frontend to start earning fees
    /// @param frontend The frontend address to approve
    function approveFrontend(address frontend) external onlyRole(GOVERNANCE_ROLE) {
        Frontend storage f = frontends[frontend];
        require(f.operator != address(0), "Frontend not registered");
        require(!f.slashed, "Frontend is slashed");

        f.approved = true;

        emit FrontendApproved(frontend);
    }

    /// @notice Revoke approval for a frontend
    /// @param frontend The frontend address to revoke
    function revokeFrontend(address frontend) external onlyRole(GOVERNANCE_ROLE) {
        Frontend storage f = frontends[frontend];
        require(f.operator != address(0), "Frontend not registered");

        f.approved = false;
    }

    /// @notice Slash a frontend's stake (partial or full)
    /// @param frontend The frontend address to slash
    /// @param amount Amount of cREP to slash
    /// @param reason Reason for the slash
    function slashFrontend(address frontend, uint256 amount, string calldata reason)
        external
        onlyRole(GOVERNANCE_ROLE)
    {
        require(address(votingEngine) != address(0), "VotingEngine not set");
        Frontend storage f = frontends[frontend];
        require(f.operator != address(0), "Frontend not registered");
        require(f.stakedAmount >= amount, "Slash exceeds stake");

        f.stakedAmount -= amount;
        f.slashed = true;
        f.approved = false;

        // Transfer slashed amount to voter pool
        if (address(votingEngine) != address(0)) {
            crepToken.forceApprove(address(votingEngine), amount);
            votingEngine.addToConsensusReserve(amount);
        }

        emit FrontendSlashed(frontend, amount, reason);
    }

    /// @notice Unslash a frontend (restore ability to operate)
    /// @param frontend The frontend address to unslash
    function unslashFrontend(address frontend) external onlyRole(GOVERNANCE_ROLE) {
        Frontend storage f = frontends[frontend];
        require(f.operator != address(0), "Frontend not registered");
        require(f.slashed, "Frontend not slashed");

        f.slashed = false;
        // Frontend must be re-approved separately
    }

    // --- Admin Functions ---

    /// @notice Update the voting engine address
    /// @param _votingEngine New voting engine address
    function setVotingEngine(address _votingEngine) external onlyRole(ADMIN_ROLE) {
        require(_votingEngine != address(0), "Invalid voting engine");
        votingEngine = IRoundVotingEngine(_votingEngine);
    }

    /// @notice Set the Voter ID NFT contract for sybil resistance
    /// @param _voterIdNFT The Voter ID NFT contract address
    function setVoterIdNFT(address _voterIdNFT) external onlyRole(ADMIN_ROLE) {
        require(_voterIdNFT != address(0), "Invalid address");
        voterIdNFT = IVoterIdNFT(_voterIdNFT);
        emit VoterIdNFTUpdated(_voterIdNFT);
    }

    /// @notice Grant fee creditor role to a contract (e.g., RoundVotingEngine)
    /// @param creditor The address to grant the role to
    function addFeeCreditor(address creditor) external onlyRole(ADMIN_ROLE) {
        _grantRole(FEE_CREDITOR_ROLE, creditor);
    }

    /// @notice Revoke fee creditor role
    /// @param creditor The address to revoke the role from
    function removeFeeCreditor(address creditor) external onlyRole(ADMIN_ROLE) {
        _revokeRole(FEE_CREDITOR_ROLE, creditor);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) { }
}
