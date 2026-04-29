// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { IFrontendRegistry } from "./interfaces/IFrontendRegistry.sol";
import { IRoundVotingEngine } from "./interfaces/IRoundVotingEngine.sol";
import { IVoterIdNFT } from "./interfaces/IVoterIdNFT.sol";

/// @title FrontendRegistry
/// @notice Manages frontend operator registration (fixed 1,000 HREP stake) and fee distribution.
/// @dev Frontend operators stake HREP, can be slashed by governance, and earn HREP fees from votes using their code.
contract FrontendRegistry is IFrontendRegistry, Initializable, AccessControlUpgradeable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    // --- Access Control Roles ---
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant GOVERNANCE_ROLE = keccak256("GOVERNANCE_ROLE");
    bytes32 public constant FEE_CREDITOR_ROLE = keccak256("FEE_CREDITOR_ROLE");

    /// @notice Maximum HREP that can be credited in a single creditFees() call (50,000 HREP with 6 decimals)
    /// @dev Launch round caps allow at most about 38,000 HREP of frontend fees in one round.
    uint256 public constant MAX_FEE_CREDIT = 50_000e6;
    /// @notice Maximum bytes allowed in a slashing reason.
    uint256 public constant MAX_SLASH_REASON_LENGTH = 280;

    /// @notice Fixed HREP stake required for frontend registration (1,000 HREP with 6 decimals)
    uint256 public constant STAKE_AMOUNT = 1000e6;

    /// @notice Slashable cooldown before a frontend can complete a voluntary exit.
    uint256 public constant UNBONDING_PERIOD = 14 days;

    // --- Structs ---
    struct Frontend {
        address operator;
        uint64 stakedAmount;
        uint128 hrepFees;
        bool slashed;
        uint48 registeredAt;
    }

    // --- State ---
    IERC20 public hrepToken;
    IRoundVotingEngine public votingEngine;

    mapping(address => Frontend) public frontends;
    address[] public registeredFrontends;
    mapping(address => uint256) private registeredFrontendIndexPlusOne;
    IVoterIdNFT public voterIdNFT; // Voter ID NFT for sybil resistance
    mapping(address => uint256) public frontendExitAvailableAt;
    bool public initialFeeCreditorConfigured;
    address public feeCreditor;

    /// @dev Reserved storage gap for future upgrades
    uint256[47] private __gap;

    // --- Events ---
    event FrontendRegistered(address indexed frontend, address indexed operator, uint256 stakedAmount);
    event FrontendSlashed(address indexed frontend, uint256 amount, string reason);
    event FrontendUnslashed(address indexed frontend);
    event FrontendExitRequested(address indexed frontend, uint256 availableAt);
    event FrontendDeregistered(address indexed frontend);
    event FrontendStakeToppedUp(address indexed frontend, uint256 amount, uint256 newStakedAmount);
    event FeesCredited(address indexed frontend, uint256 hrepAmount);
    event FeesClaimed(address indexed frontend, uint256 hrepAmount);
    event FeesConfiscated(address indexed frontend, uint256 hrepAmount);
    event VotingEngineUpdated(address votingEngine);
    event VoterIdNFTUpdated(address voterIdNFT);
    event FeeCreditorUpdated(address indexed oldCreditor, address indexed newCreditor);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize the frontend registry contract.
    /// @param _admin Address with temporary admin role for initial wiring.
    /// @param _governance Address with permanent governance roles (timelock).
    /// @param _hrepToken HREP token address for staking and fee distribution.
    function initialize(address _admin, address _governance, address _hrepToken) public initializer {
        __AccessControl_init();

        require(_admin != address(0), "Invalid admin");
        require(_governance != address(0), "Invalid governance");
        require(_hrepToken != address(0), "Invalid token");

        // Governance gets all permanent roles
        _grantRole(DEFAULT_ADMIN_ROLE, _governance);
        _grantRole(ADMIN_ROLE, _governance);
        _grantRole(GOVERNANCE_ROLE, _governance);

        // Admin gets only ADMIN_ROLE for initial cross-contract wiring
        if (_admin != _governance) {
            _grantRole(ADMIN_ROLE, _admin);
        }

        hrepToken = IERC20(_hrepToken);
    }

    // --- View Functions ---

    /// @inheritdoc IFrontendRegistry
    function isEligible(address frontend) external view override returns (bool) {
        Frontend storage f = frontends[frontend];
        return _isEligible(frontend, f);
    }

    /// @inheritdoc IFrontendRegistry
    function getAccumulatedFees(address frontend) external view override returns (uint256 hrepFees) {
        Frontend storage f = frontends[frontend];
        return uint256(f.hrepFees);
    }

    /// @inheritdoc IFrontendRegistry
    function canReceiveHistoricalFees(address frontend) external view override returns (bool) {
        Frontend storage f = frontends[frontend];
        return f.operator != address(0) && !f.slashed && uint256(f.stakedAmount) >= STAKE_AMOUNT
            && _hasActiveOperatorVoterId(frontend);
    }

    /// @inheritdoc IFrontendRegistry
    function getFrontendInfo(address frontend)
        external
        view
        override
        returns (address operator, uint256 stakedAmount, bool eligible, bool slashed)
    {
        Frontend storage f = frontends[frontend];
        return (f.operator, uint256(f.stakedAmount), _isEligible(frontend, f), f.slashed);
    }

    /// @notice Get a paginated slice of the registered frontend addresses
    /// @param offset Index to start from
    /// @param limit Maximum number of addresses to return
    /// @return addresses The slice of frontend addresses
    /// @return total The total number of registered frontends
    function getRegisteredFrontendsPaginated(uint256 offset, uint256 limit)
        external
        view
        returns (address[] memory addresses, uint256 total)
    {
        total = registeredFrontends.length;
        if (offset >= total || limit == 0) {
            return (new address[](0), total);
        }
        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        uint256 resultLength = end - offset;
        addresses = new address[](resultLength);
        for (uint256 i = 0; i < resultLength; i++) {
            addresses[i] = registeredFrontends[offset + i];
        }
    }

    // --- Registration Functions ---

    /// @notice Register as a frontend operator by staking 1,000 HREP
    /// @dev Fully bonded, unslashed frontends can earn fees immediately after registration.
    function register() external nonReentrant {
        require(address(voterIdNFT) != address(0), "VoterIdNFT not set");
        require(voterIdNFT.hasVoterId(msg.sender), "Voter ID required");
        require(voterIdNFT.resolveHolder(msg.sender) == msg.sender, "Frontend operator must hold Voter ID");

        require(frontends[msg.sender].operator == address(0), "Already registered");

        hrepToken.safeTransferFrom(msg.sender, address(this), STAKE_AMOUNT);

        frontends[msg.sender] = Frontend({
            operator: msg.sender,
            stakedAmount: STAKE_AMOUNT.toUint64(),
            hrepFees: 0,
            slashed: false,
            registeredAt: block.timestamp.toUint48()
        });

        registeredFrontends.push(msg.sender);
        registeredFrontendIndexPlusOne[msg.sender] = registeredFrontends.length;

        emit FrontendRegistered(msg.sender, msg.sender, STAKE_AMOUNT);
    }

    /// @notice Start voluntary deregistration. Stake remains slashable during unbonding.
    function requestDeregister() external nonReentrant {
        _requestDeregister(msg.sender);
    }

    /// @notice Complete deregistration after the unbonding window has elapsed.
    function completeDeregister() external nonReentrant {
        Frontend storage f = frontends[msg.sender];
        require(f.operator != address(0), "Not registered");
        require(!f.slashed, "Frontend is slashed");
        uint256 availableAt = frontendExitAvailableAt[msg.sender];
        require(availableAt != 0, "Exit not requested");
        require(block.timestamp >= availableAt, "Unbonding period active");

        uint256 refund = uint256(f.stakedAmount);
        uint256 pendingFees = uint256(f.hrepFees);
        f.stakedAmount = 0;
        f.hrepFees = 0;
        f.operator = address(0); // Allow re-registration
        delete frontendExitAvailableAt[msg.sender];
        _removeRegisteredFrontend(msg.sender);

        bool activeOperatorVoterId = _hasActiveOperatorVoterId(msg.sender);
        uint256 payoutFees = activeOperatorVoterId ? pendingFees : 0;
        uint256 total = refund + payoutFees;
        if (total > 0) {
            hrepToken.safeTransfer(msg.sender, total);
        }

        if (payoutFees > 0) {
            emit FeesClaimed(msg.sender, payoutFees);
        } else if (pendingFees > 0) {
            _routeFeesToConsensusReserve(msg.sender, pendingFees);
        }
        emit FrontendDeregistered(msg.sender);
    }

    /// @notice Claim accumulated HREP fees
    function claimFees() external nonReentrant {
        Frontend storage f = frontends[msg.sender];
        require(f.operator != address(0), "Not registered");
        require(!f.slashed, "Frontend is slashed");
        if (frontendExitAvailableAt[msg.sender] != 0) revert FrontendExitPending();
        require(uint256(f.stakedAmount) >= STAKE_AMOUNT, "Frontend is underbonded");
        require(_hasActiveOperatorVoterId(msg.sender), "Voter ID required");

        uint256 hrepAmount = uint256(f.hrepFees);

        require(hrepAmount > 0, "No fees to claim");

        f.hrepFees = 0;

        hrepToken.safeTransfer(msg.sender, hrepAmount);

        emit FeesClaimed(msg.sender, hrepAmount);
    }

    // --- Fee Crediting (called by RoundVotingEngine) ---

    /// @inheritdoc IFrontendRegistry
    /// @dev No eligibility check here — commit-time eligibility is snapshotted in RoundVotingEngine.
    ///      Slashed or underbonded frontends cannot accrue newly claimed historical fees.
    function creditFees(address frontend, uint256 hrepAmount) external override onlyRole(FEE_CREDITOR_ROLE) {
        require(msg.sender == feeCreditor, "Unauthorized fee creditor");
        require(hrepAmount <= MAX_FEE_CREDIT, "Fee credit too large");
        Frontend storage f = frontends[frontend];
        require(f.operator != address(0), "Frontend not registered");
        require(!f.slashed, "Frontend is slashed");
        require(uint256(f.stakedAmount) >= STAKE_AMOUNT, "Frontend is underbonded");
        require(_hasActiveOperatorVoterId(frontend), "Voter ID required");
        f.hrepFees = (uint256(f.hrepFees) + hrepAmount).toUint128();
        emit FeesCredited(frontend, hrepAmount);
    }

    /// @notice Restore stake after a partial slash so the frontend can earn fees again.
    /// @param amount Additional HREP to bond.
    function topUpStake(uint256 amount) external nonReentrant {
        Frontend storage f = frontends[msg.sender];
        require(f.operator != address(0), "Not registered");
        if (frontendExitAvailableAt[msg.sender] != 0) revert FrontendExitPending();
        require(amount > 0, "Invalid top-up amount");
        require(uint256(f.stakedAmount) < STAKE_AMOUNT, "Already fully bonded");

        uint256 missingStake = STAKE_AMOUNT - uint256(f.stakedAmount);
        require(amount <= missingStake, "Top-up exceeds requirement");

        hrepToken.safeTransferFrom(msg.sender, address(this), amount);
        f.stakedAmount += amount.toUint64();

        emit FrontendStakeToppedUp(msg.sender, amount, uint256(f.stakedAmount));
    }

    // --- Governance Functions ---

    /// @notice Slash a frontend's stake (partial or full)
    /// @param frontend The frontend address to slash
    /// @param amount Amount of HREP to slash
    /// @param reason Reason for the slash
    function slashFrontend(address frontend, uint256 amount, string calldata reason)
        external
        nonReentrant
        onlyRole(GOVERNANCE_ROLE)
    {
        require(bytes(reason).length <= MAX_SLASH_REASON_LENGTH, "Slash reason too long");
        require(address(votingEngine) != address(0), "VotingEngine not set");
        Frontend storage f = frontends[frontend];
        require(f.operator != address(0), "Frontend not registered");
        require(uint256(f.stakedAmount) >= amount, "Slash exceeds stake");

        uint256 confiscatedFees = uint256(f.hrepFees);
        f.stakedAmount -= amount.toUint64();
        f.hrepFees = 0;
        f.slashed = true;

        uint256 totalToReserve = amount + confiscatedFees;
        if (totalToReserve > 0) {
            hrepToken.forceApprove(address(votingEngine), totalToReserve);
            votingEngine.addToConsensusReserve(totalToReserve);
        }

        if (confiscatedFees > 0) {
            emit FeesConfiscated(frontend, confiscatedFees);
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
        emit FrontendUnslashed(frontend);
    }

    // --- Admin Functions ---

    /// @notice Update the voting engine address
    /// @param _votingEngine New voting engine address
    function setVotingEngine(address _votingEngine) external onlyRole(ADMIN_ROLE) {
        require(_votingEngine != address(0), "Invalid voting engine");
        votingEngine = IRoundVotingEngine(_votingEngine);
        emit VotingEngineUpdated(_votingEngine);
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
    function addFeeCreditor(address creditor) external onlyRole(GOVERNANCE_ROLE) {
        require(creditor != address(0), "Invalid fee creditor");
        address oldCreditor = feeCreditor;
        if (oldCreditor != address(0) && oldCreditor != creditor) {
            _revokeRole(FEE_CREDITOR_ROLE, oldCreditor);
        }
        feeCreditor = creditor;
        _grantRole(FEE_CREDITOR_ROLE, creditor);
        emit FeeCreditorUpdated(oldCreditor, creditor);
    }

    /// @notice Revoke fee creditor role
    /// @param creditor The address to revoke the role from
    function removeFeeCreditor(address creditor) external onlyRole(GOVERNANCE_ROLE) {
        if (creditor == feeCreditor) {
            feeCreditor = address(0);
            emit FeeCreditorUpdated(creditor, address(0));
        }
        _revokeRole(FEE_CREDITOR_ROLE, creditor);
    }

    /// @notice One-shot deploy-time fee creditor wiring before the registry is connected to VotingEngine.
    /// @param creditor The initial contract allowed to credit frontend fees.
    function initializeFeeCreditor(address creditor) external onlyRole(ADMIN_ROLE) {
        require(!initialFeeCreditorConfigured, "Initial fee creditor set");
        require(address(votingEngine) == address(0), "Setup complete");
        require(creditor != address(0), "Invalid fee creditor");
        initialFeeCreditorConfigured = true;
        feeCreditor = creditor;
        _grantRole(FEE_CREDITOR_ROLE, creditor);
        emit FeeCreditorUpdated(address(0), creditor);
    }

    function _requestDeregister(address frontend) internal {
        Frontend storage f = frontends[frontend];
        require(f.operator != address(0), "Not registered");
        require(!f.slashed, "Frontend is slashed");
        if (frontendExitAvailableAt[frontend] != 0) revert FrontendExitPending();

        uint256 availableAt = block.timestamp + UNBONDING_PERIOD;
        frontendExitAvailableAt[frontend] = availableAt;

        emit FrontendExitRequested(frontend, availableAt);
    }

    function _removeRegisteredFrontend(address frontend) internal {
        uint256 indexPlusOne = registeredFrontendIndexPlusOne[frontend];
        if (indexPlusOne == 0) {
            return;
        }

        uint256 index = indexPlusOne - 1;
        uint256 lastIndex = registeredFrontends.length - 1;

        if (index != lastIndex) {
            address movedFrontend = registeredFrontends[lastIndex];
            registeredFrontends[index] = movedFrontend;
            registeredFrontendIndexPlusOne[movedFrontend] = index + 1;
        }

        registeredFrontends.pop();
        delete registeredFrontendIndexPlusOne[frontend];
    }

    function _isEligible(address frontend, Frontend storage f) internal view returns (bool) {
        return f.operator != address(0) && !f.slashed && uint256(f.stakedAmount) >= STAKE_AMOUNT
            && frontendExitAvailableAt[frontend] == 0 && _hasActiveOperatorVoterId(frontend);
    }

    function _hasActiveOperatorVoterId(address frontend) internal view returns (bool) {
        if (address(voterIdNFT) == address(0)) return false;
        return voterIdNFT.hasVoterId(frontend) && voterIdNFT.resolveHolder(frontend) == frontend;
    }

    function _routeFeesToConsensusReserve(address frontend, uint256 amount) internal {
        require(address(votingEngine) != address(0), "VotingEngine not set");
        hrepToken.forceApprove(address(votingEngine), amount);
        votingEngine.addToConsensusReserve(amount);
        emit FeesConfiscated(frontend, amount);
    }
}
