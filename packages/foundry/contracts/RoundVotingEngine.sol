// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IERC20Permit } from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

import { ContentRegistry } from "./ContentRegistry.sol";
import { RoundLib } from "./libraries/RoundLib.sol";
import { RewardMath } from "./libraries/RewardMath.sol";
import { IFrontendRegistry } from "./interfaces/IFrontendRegistry.sol";
import { ICategoryRegistry } from "./interfaces/ICategoryRegistry.sol";
import { IVoterIdNFT } from "./interfaces/IVoterIdNFT.sol";
import { IRoundVotingEngine } from "./interfaces/IRoundVotingEngine.sol";
import { IParticipationPool } from "./interfaces/IParticipationPool.sol";

/// @title RoundVotingEngine
/// @notice Per-content round-based parimutuel voting with public votes and random settlement.
/// @dev Flow: vote (immediately public + price-moving) → random settlement (increasing probability per block) → claim.
///      Votes are public from the start — each vote shifts the content rating in real-time.
///      Settlement happens randomly with increasing probability after a minimum epoch length.
///      Early/contrarian voters get more shares per cREP staked (bonding curve dynamics).
contract RoundVotingEngine is
    IRoundVotingEngine,
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardTransient,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // --- Custom Errors ---
    error InvalidAddress();
    error InvalidConfig();
    error InvalidStake();
    error ZeroAmount();
    error Unauthorized();
    error VoterIdRequired();
    error SelfVote();
    error ContentNotActive();
    error CooldownActive();
    error ExceedsMaxStake();
    error RoundNotOpen();
    error RoundNotAccepting();
    error RoundNotExpired();
    error RoundNotSettled();
    error RoundNotSettledOrTied();
    error RoundNotCancelledOrTied();
    error NotEnoughVotes();
    error AlreadyVoted();
    error AlreadyClaimed();
    error MaxVotersReached();
    error NoVote();
    error NoStake();
    error NoPool();
    error NoApprovedStake();
    error PoolExhausted();
    error PoolDepleted();
    error NoParticipationRate();
    error IdentityAlreadyVoted();
    error EpochNotSettleable();

    // --- Access Control Roles ---
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant CONFIG_ROLE = keccak256("CONFIG_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // --- Constants ---
    uint256 public constant MIN_STAKE = 1e6; // 1 cREP (6 decimals)
    uint256 public constant MAX_STAKE = 100e6; // 100 cREP (6 decimals)
    uint256 public constant VOTE_COOLDOWN = 24 hours; // Time-based cooldown per content per voter

    // --- State ---
    IERC20 public crepToken;
    ContentRegistry public registry;
    address public rewardDistributor;
    ICategoryRegistry public categoryRegistry;
    IFrontendRegistry public frontendRegistry;
    address public treasury;

    // Round configuration (governance-tunable)
    RoundLib.RoundConfig public config;

    // Round data: contentId => roundId => Round
    mapping(uint256 => mapping(uint256 => RoundLib.Round)) public rounds;

    // Per-content round tracking
    mapping(uint256 => uint256) public currentRoundId; // contentId => active round ID (0 = none)
    mapping(uint256 => uint256) public nextRoundId; // contentId => next round ID to create

    // Votes: contentId => roundId => voter => Vote
    mapping(uint256 => mapping(uint256 => mapping(address => RoundLib.Vote))) public votes;

    // Track voters per content per round for settlement iteration
    mapping(uint256 => mapping(uint256 => address[])) internal roundVoters;

    // Prevent double voting: contentId => roundId => voter => voted
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasVoted;

    // Time-based cooldown: contentId => voter => timestamp of last vote
    mapping(uint256 => mapping(address => uint256)) public lastVoteTimestamp;

    // Reward accounting per round
    mapping(uint256 => mapping(uint256 => uint256)) public roundVoterPool; // contentId => roundId => voter pool
    mapping(uint256 => mapping(uint256 => uint256)) public roundWinningShares; // contentId => roundId => winning shares
    mapping(uint256 => mapping(uint256 => uint256)) public pendingSubmitterReward; // contentId => roundId => amount

    // Cancelled/tied round refund claims: contentId => roundId => voter => claimed
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public cancelledRoundRefundClaimed;

    // Total lifetime vote count per content (used by ContentRegistry)
    mapping(uint256 => uint256) public contentVoteCount;

    // Sybil resistance
    IVoterIdNFT public voterIdNFT;

    // Participation pool (rewards deferred to settlement)
    IParticipationPool public participationPool;

    // Consensus subsidy reserve: pre-funded + replenished by 5% of each losing pool.
    uint256 public consensusReserve;

    // Flat cREP reward per keeper operation (6 decimals). 0 = disabled.
    uint256 public keeperReward;

    // Dedicated keeper reward pool — funded independently from user stakes.
    uint256 public keeperRewardPool;

    // Config snapshot per round: prevents governance config changes from affecting in-progress rounds
    mapping(uint256 => mapping(uint256 => RoundLib.RoundConfig)) internal roundConfigSnapshot;

    // Frontend fee aggregation (computed at vote time for O(1) settlement)
    mapping(uint256 => mapping(uint256 => uint256)) public roundStakeWithApprovedFrontend;
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public roundPerFrontendStake;
    mapping(uint256 => mapping(uint256 => uint256)) public roundFrontendPool;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public frontendFeeClaimed;
    mapping(uint256 => mapping(uint256 => uint256)) public roundApprovedFrontendCount;
    mapping(uint256 => mapping(uint256 => uint256)) public roundFrontendClaimedCount;
    mapping(uint256 => mapping(uint256 => uint256)) public roundFrontendClaimedAmount;

    // Participation reward pull-based claiming (rate snapshotted at settlement)
    mapping(uint256 => mapping(uint256 => uint256)) public roundParticipationRateBps;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public participationRewardClaimed;
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public participationRewardPaid;

    // One vote per identity per round: contentId => roundId => tokenId => voted
    mapping(uint256 => mapping(uint256 => mapping(uint256 => bool))) public hasTokenIdVoted;

    // --- Events ---
    event VotePublished(
        uint256 indexed contentId,
        uint256 indexed roundId,
        address indexed voter,
        bool isUp,
        uint256 stake,
        uint256 shares,
        uint16 newRating
    );
    event RoundSettled(uint256 indexed contentId, uint256 indexed roundId, bool upWins, uint256 totalPool);
    event RoundCancelled(uint256 indexed contentId, uint256 indexed roundId);
    event RoundTied(uint256 indexed contentId, uint256 indexed roundId);
    event CancelledRoundRefundClaimed(
        uint256 indexed contentId, uint256 indexed roundId, address indexed voter, uint256 amount
    );
    event TreasuryFeeDistributed(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    event CategorySubmitterRewarded(
        uint256 indexed contentId, uint256 indexed categoryId, address indexed submitter, uint256 amount
    );
    event ConsensusReserveFunded(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    event ConsensusSubsidyDistributed(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    event SettlementSideEffectFailed(uint256 indexed contentId, uint256 indexed roundId, string reason);
    event FrontendFeeClaimed(
        uint256 indexed contentId, uint256 indexed roundId, address indexed frontend, uint256 amount
    );
    event ParticipationRewardClaimed(
        uint256 indexed contentId, uint256 indexed roundId, address indexed voter, uint256 amount
    );
    event ConfigUpdated(
        uint64 minEpochBlocks,
        uint64 maxEpochBlocks,
        uint256 maxDuration,
        uint256 minVoters,
        uint256 maxVoters,
        uint16 baseRateBps,
        uint16 growthRateBps,
        uint16 maxProbBps,
        uint256 liquidityParam
    );
    event FrontendRegistryUpdated(address frontendRegistry);
    event CategoryRegistryUpdated(address categoryRegistry);
    event VoterIdNFTUpdated(address voterIdNFT);
    event TreasuryUpdated(address treasury);
    event KeeperRewardUpdated(uint256 keeperReward);
    event KeeperRewardPoolFunded(address indexed funder, uint256 amount);
    event KeeperRewarded(address indexed keeper, uint256 amount, string operation);

    /// @dev Only callable by this contract itself (for try-catch external wrappers).
    modifier onlySelf() {
        if (msg.sender != address(this)) revert Unauthorized();
        _;
    }

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _admin, address _governance, address _crepToken, address _registry) public initializer {
        __AccessControl_init();
        __Pausable_init();

        if (_admin == address(0)) revert InvalidAddress();
        if (_governance == address(0)) revert InvalidAddress();
        if (_crepToken == address(0)) revert InvalidAddress();
        if (_registry == address(0)) revert InvalidAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, _governance);
        _grantRole(ADMIN_ROLE, _governance);
        _grantRole(CONFIG_ROLE, _governance);
        _grantRole(PAUSER_ROLE, _governance);
        _grantRole(UPGRADER_ROLE, _governance);

        if (_admin != _governance) {
            _grantRole(CONFIG_ROLE, _admin);
        }

        crepToken = IERC20(_crepToken);
        registry = ContentRegistry(_registry);

        // Default config
        config = RoundLib.RoundConfig({
            minEpochBlocks: 300, // ~1 hour at 12s blocks
            maxEpochBlocks: 7200, // ~24 hours at 12s blocks
            maxDuration: 7 days,
            minVoters: 3,
            maxVoters: 1000,
            baseRateBps: 1, // 0.01% flat settlement probability per block
            growthRateBps: 0, // No growth (flat probability)
            maxProbBps: 10, // 0.1% max per-block settlement probability
            liquidityParam: 1000e6 // 1000 cREP bonding curve liquidity
        });
    }

    // --- Configuration ---

    function setRewardDistributor(address _rewardDistributor) external onlyRole(CONFIG_ROLE) {
        if (_rewardDistributor == address(0)) revert InvalidAddress();
        rewardDistributor = _rewardDistributor;
    }

    function setFrontendRegistry(address _frontendRegistry) external onlyRole(CONFIG_ROLE) {
        if (_frontendRegistry == address(0)) revert InvalidAddress();
        frontendRegistry = IFrontendRegistry(_frontendRegistry);
        emit FrontendRegistryUpdated(_frontendRegistry);
    }

    function setCategoryRegistry(address _categoryRegistry) external onlyRole(CONFIG_ROLE) {
        if (_categoryRegistry == address(0)) revert InvalidAddress();
        categoryRegistry = ICategoryRegistry(_categoryRegistry);
        emit CategoryRegistryUpdated(_categoryRegistry);
    }

    function setTreasury(address _treasury) external onlyRole(CONFIG_ROLE) {
        if (_treasury == address(0)) revert InvalidAddress();
        treasury = _treasury;
        emit TreasuryUpdated(_treasury);
    }

    function setKeeperReward(uint256 _keeperReward) external onlyRole(CONFIG_ROLE) {
        keeperReward = _keeperReward;
        emit KeeperRewardUpdated(_keeperReward);
    }

    function setVoterIdNFT(address _voterIdNFT) external onlyRole(CONFIG_ROLE) {
        if (_voterIdNFT == address(0)) revert InvalidAddress();
        voterIdNFT = IVoterIdNFT(_voterIdNFT);
        emit VoterIdNFTUpdated(_voterIdNFT);
    }

    function setParticipationPool(address _participationPool) external onlyRole(CONFIG_ROLE) {
        if (_participationPool == address(0)) revert InvalidAddress();
        participationPool = IParticipationPool(_participationPool);
    }

    function setConfig(
        uint64 _minEpochBlocks,
        uint64 _maxEpochBlocks,
        uint256 _maxDuration,
        uint256 _minVoters,
        uint256 _maxVoters,
        uint16 _baseRateBps,
        uint16 _growthRateBps,
        uint16 _maxProbBps,
        uint256 _liquidityParam
    ) external onlyRole(CONFIG_ROLE) {
        if (_minEpochBlocks < 10) revert InvalidConfig();
        if (_maxEpochBlocks <= _minEpochBlocks) revert InvalidConfig();
        if (_maxDuration < 1 days) revert InvalidConfig();
        if (_minVoters < 2) revert InvalidConfig();
        if (_maxVoters < _minVoters || _maxVoters > 10000) revert InvalidConfig();
        if (_baseRateBps == 0 || _baseRateBps > 10000) revert InvalidConfig();
        if (_maxProbBps < _baseRateBps || _maxProbBps > 10000) revert InvalidConfig();
        if (_liquidityParam == 0) revert InvalidConfig();

        config = RoundLib.RoundConfig({
            minEpochBlocks: _minEpochBlocks,
            maxEpochBlocks: _maxEpochBlocks,
            maxDuration: _maxDuration,
            minVoters: _minVoters,
            maxVoters: _maxVoters,
            baseRateBps: _baseRateBps,
            growthRateBps: _growthRateBps,
            maxProbBps: _maxProbBps,
            liquidityParam: _liquidityParam
        });

        emit ConfigUpdated(
            _minEpochBlocks,
            _maxEpochBlocks,
            _maxDuration,
            _minVoters,
            _maxVoters,
            _baseRateBps,
            _growthRateBps,
            _maxProbBps,
            _liquidityParam
        );
    }

    /// @notice Fund the consensus subsidy reserve by transferring cREP tokens.
    function fundConsensusReserve(uint256 amount) external onlyRole(CONFIG_ROLE) {
        if (amount == 0) revert ZeroAmount();
        crepToken.safeTransferFrom(msg.sender, address(this), amount);
        consensusReserve += amount;
    }

    /// @notice Add cREP to the consensus reserve (e.g. from slashed stakes).
    function addToConsensusReserve(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        crepToken.safeTransferFrom(msg.sender, address(this), amount);
        consensusReserve += amount;
    }

    /// @notice Fund the keeper reward pool by transferring cREP tokens.
    function fundKeeperRewardPool(uint256 amount) external onlyRole(CONFIG_ROLE) {
        if (amount == 0) revert ZeroAmount();
        crepToken.safeTransferFrom(msg.sender, address(this), amount);
        keeperRewardPool += amount;
        emit KeeperRewardPoolFunded(msg.sender, amount);
    }

    /// @notice Transfer cREP reward tokens to a recipient. Only callable by RewardDistributor.
    function transferReward(address recipient, uint256 crepAmount) external {
        if (msg.sender != rewardDistributor) revert Unauthorized();
        if (recipient == address(0)) revert InvalidAddress();
        if (crepAmount > 0) {
            crepToken.safeTransfer(recipient, crepAmount);
        }
    }

    // =========================================================================
    // PUBLIC VOTING
    // =========================================================================

    // AUDIT NOTE (M-3): Votes are public and price-moving. MEV searchers can front-run
    // to get cheaper bonding curve shares. Mitigated by VoterIdNFT (one per human),
    // MAX_STAKE (100 cREP), and 24h cooldown. Consider private mempool for frontends.

    /// @notice Cast a public vote on content. Direction is immediately visible and price-moving.
    /// @dev Each vote shifts the content rating in real-time. Early/contrarian voters get more
    ///      shares per cREP staked via bonding curve dynamics (shares = stake * b / (sameDirectionStake + b)).
    /// @param contentId The content being voted on.
    /// @param isUp Whether the vote is UP (true) or DOWN (false).
    /// @param stakeAmount Amount of cREP tokens to stake (1-100).
    /// @param frontend Address of frontend operator for fee distribution.
    function vote(uint256 contentId, bool isUp, uint256 stakeAmount, address frontend)
        external
        nonReentrant
        whenNotPaused
    {
        _vote(contentId, isUp, stakeAmount, frontend);
    }

    /// @notice Cast a public vote using ERC2612 permit (single transaction).
    function voteWithPermit(
        uint256 contentId,
        bool isUp,
        uint256 stakeAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address frontend
    ) external nonReentrant whenNotPaused {
        IERC20Permit(address(crepToken)).permit(msg.sender, address(this), stakeAmount, deadline, v, r, s);
        _vote(contentId, isUp, stakeAmount, frontend);
    }

    /// @dev Internal vote logic.
    function _vote(uint256 contentId, bool isUp, uint256 stakeAmount, address frontend) internal {
        if (stakeAmount < MIN_STAKE || stakeAmount > MAX_STAKE) revert InvalidStake();

        // Voter ID check (if configured)
        uint256 voterId;
        if (address(voterIdNFT) != address(0)) {
            if (!voterIdNFT.hasVoterId(msg.sender)) revert VoterIdRequired();
            voterId = voterIdNFT.getTokenId(msg.sender);
        }

        // Prevent submitter from voting on own content (resolves delegation)
        address effectiveVoter = msg.sender;
        if (address(voterIdNFT) != address(0)) {
            address resolved = voterIdNFT.resolveHolder(msg.sender);
            if (resolved != address(0)) effectiveVoter = resolved;
        }
        if (effectiveVoter == registry.getSubmitter(contentId)) revert SelfVote();

        // Content must be active
        if (!registry.isActive(contentId)) revert ContentNotActive();

        // Time-based cooldown (24 hours)
        uint256 lastVote = lastVoteTimestamp[contentId][msg.sender];
        if (lastVote > 0) {
            if (block.timestamp < lastVote + VOTE_COOLDOWN) revert CooldownActive();
        }

        // Try to settle the prior epoch before starting a new one
        uint256 existingRoundId = currentRoundId[contentId];
        if (existingRoundId > 0) {
            RoundLib.Round storage existingRound = rounds[contentId][existingRoundId];
            if (existingRound.state == RoundLib.RoundState.Open && existingRound.voteCount > 0) {
                _trySettle(contentId, existingRoundId);
            }
        }

        // Get or create active round
        uint256 roundId = _getOrCreateRound(contentId);
        RoundLib.Round storage round = rounds[contentId][roundId];
        RoundLib.RoundConfig memory roundCfg = _getRoundConfig(contentId, roundId);

        // Round must be Open and not expired
        if (!RoundLib.acceptsVotes(round, roundCfg.maxDuration)) revert RoundNotAccepting();

        // One vote per voter per round
        if (hasVoted[contentId][roundId][msg.sender]) revert AlreadyVoted();

        // One vote per identity per round (prevents holder + delegate double voting)
        if (address(voterIdNFT) != address(0) && voterId != 0) {
            if (hasTokenIdVoted[contentId][roundId][voterId]) revert IdentityAlreadyVoted();
        }

        // Voter cap
        if (round.voteCount >= roundCfg.maxVoters) revert MaxVotersReached();

        // Check MAX_STAKE per Voter ID per content per round
        if (address(voterIdNFT) != address(0) && voterId != 0) {
            uint256 currentStake = voterIdNFT.getEpochContentStake(contentId, roundId, voterId);
            if (currentStake + stakeAmount > MAX_STAKE) revert ExceedsMaxStake();
        }

        // Transfer cREP stake
        crepToken.safeTransferFrom(msg.sender, address(this), stakeAmount);

        // Calculate shares via bonding curve: shares = stake * b / (sameDirectionStake + b)
        uint256 sameDirectionStake = isUp ? round.totalUpStake : round.totalDownStake;
        uint256 shares = RewardMath.calculateShares(stakeAmount, sameDirectionStake, roundCfg.liquidityParam);

        // Store vote
        votes[contentId][roundId][msg.sender] =
            RoundLib.Vote({ voter: msg.sender, stake: stakeAmount, shares: shares, isUp: isUp, frontend: frontend });

        // Track for iteration
        roundVoters[contentId][roundId].push(msg.sender);
        hasVoted[contentId][roundId][msg.sender] = true;
        contentVoteCount[contentId]++;

        // Mark identity as voted for this round
        if (address(voterIdNFT) != address(0) && voterId != 0) {
            hasTokenIdVoted[contentId][roundId][voterId] = true;
        }

        // Update round counters
        round.voteCount++;
        round.totalStake += stakeAmount;

        if (isUp) {
            round.totalUpStake += stakeAmount;
            round.totalUpShares += shares;
            round.upCount++;
        } else {
            round.totalDownStake += stakeAmount;
            round.totalDownShares += shares;
            round.downCount++;
        }

        // Record stake against Voter ID
        if (address(voterIdNFT) != address(0) && voterId != 0) {
            voterIdNFT.recordStake(contentId, roundId, voterId, stakeAmount);
        }

        // Aggregate frontend fee data for O(1) settlement
        if (frontend != address(0) && address(frontendRegistry) != address(0)) {
            try frontendRegistry.isApproved(frontend) returns (bool approved) {
                if (approved) {
                    roundStakeWithApprovedFrontend[contentId][roundId] += stakeAmount;
                    if (roundPerFrontendStake[contentId][roundId][frontend] == 0) {
                        roundApprovedFrontendCount[contentId][roundId]++;
                    }
                    roundPerFrontendStake[contentId][roundId][frontend] += stakeAmount;
                }
            } catch { }
        }

        // Record cooldown
        lastVoteTimestamp[contentId][msg.sender] = block.timestamp;

        // Update content rating live
        uint16 newRating = RewardMath.calculateRating(round.totalUpStake, round.totalDownStake);
        try registry.updateRatingDirect(contentId, newRating) { } catch { }

        try registry.updateActivity(contentId) { } catch { }

        emit VotePublished(contentId, roundId, msg.sender, isUp, stakeAmount, shares, newRating);
    }

    /// @dev Get or create the active round for a content item.
    function _getOrCreateRound(uint256 contentId) internal returns (uint256) {
        uint256 roundId = currentRoundId[contentId];

        // If there's an active round, use it
        if (roundId > 0) {
            RoundLib.Round storage existingRound = rounds[contentId][roundId];
            if (!RoundLib.isTerminal(existingRound)) {
                return roundId;
            }
        }

        // Create a new round
        nextRoundId[contentId]++;
        roundId = nextRoundId[contentId];
        currentRoundId[contentId] = roundId;

        rounds[contentId][roundId].startTime = block.timestamp;
        rounds[contentId][roundId].startBlock = uint64(block.number);
        rounds[contentId][roundId].state = RoundLib.RoundState.Open;

        // Record the content's current rating at epoch start
        rounds[contentId][roundId].epochStartRating = uint16(registry.getRating(contentId));

        // Snapshot config at round creation to prevent mid-round governance changes
        roundConfigSnapshot[contentId][roundId] = config;

        return roundId;
    }

    // =========================================================================
    // ROUND EXPIRY (no votes for 1 week)
    // =========================================================================

    /// @notice Cancel an expired round that didn't settle. Permissionless.
    /// @param contentId The content ID.
    /// @param roundId The round ID.
    function cancelExpiredRound(uint256 contentId, uint256 roundId) external nonReentrant whenNotPaused {
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (round.state != RoundLib.RoundState.Open) revert RoundNotOpen();
        RoundLib.RoundConfig memory roundCfg = _getRoundConfig(contentId, roundId);
        if (!RoundLib.isExpired(round, roundCfg.maxDuration)) revert RoundNotExpired();

        round.state = RoundLib.RoundState.Cancelled;

        // Restore the epoch-start rating since the round is cancelled
        try registry.updateRatingDirect(contentId, round.epochStartRating) { } catch { }

        emit RoundCancelled(contentId, roundId);
        _rewardKeeper("cancel");
    }

    // =========================================================================
    // SETTLEMENT (random with increasing probability)
    // =========================================================================

    /// @notice Attempt to settle the current round for a content item. Permissionless.
    /// @dev Settlement probability increases linearly per block after minEpochBlocks.
    ///      Anyone can call this — keepers, voters, or the vote() function itself.
    /// @param contentId The content ID.
    function trySettle(uint256 contentId) external nonReentrant whenNotPaused {
        uint256 roundId = currentRoundId[contentId];
        if (roundId == 0) revert RoundNotOpen();
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (round.state != RoundLib.RoundState.Open) revert RoundNotOpen();

        bool settled = _trySettle(contentId, roundId);
        if (settled) {
            _rewardKeeper("settle");
        }
    }

    /// @dev Internal settlement logic. Returns true if settlement occurred.
    function _trySettle(uint256 contentId, uint256 roundId) internal returns (bool) {
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (round.state != RoundLib.RoundState.Open) return false;

        RoundLib.RoundConfig memory roundCfg = _getRoundConfig(contentId, roundId);

        // Two-sided settlement: both UP and DOWN voters exist
        if (round.upCount > 0 && round.downCount > 0 && round.voteCount >= roundCfg.minVoters) {
            if (_shouldSettle(contentId, roundId, round, roundCfg)) {
                _executeSettlement(contentId, roundId, round, roundCfg);
                return true;
            }
        }

        // One-sided consensus timeout: only one direction after maxEpochBlocks
        if (round.voteCount > 0 && (round.upCount == 0 || round.downCount == 0)) {
            uint256 elapsed = block.number - round.startBlock;
            if (elapsed >= roundCfg.maxEpochBlocks) {
                _executeConsensusSettlement(contentId, roundId, round);
                return true;
            }
        }

        return false;
    }

    /// @dev Check if settlement should happen based on random probability.
    /// @return settle True if the round should settle this block.
    function _shouldSettle(
        uint256 contentId,
        uint256 roundId,
        RoundLib.Round storage round,
        RoundLib.RoundConfig memory roundCfg
    ) internal view returns (bool) {
        uint256 elapsed = block.number - round.startBlock;

        // Before minimum epoch: never settle
        if (elapsed < roundCfg.minEpochBlocks) return false;

        // After maximum epoch: always settle
        if (elapsed >= roundCfg.maxEpochBlocks) return true;

        // Linear probability increase: P = baseRate + window * growthRate, capped at maxProb
        uint256 window = elapsed - roundCfg.minEpochBlocks;
        uint256 prob = uint256(roundCfg.baseRateBps) + window * uint256(roundCfg.growthRateBps);
        if (prob > roundCfg.maxProbBps) prob = roundCfg.maxProbBps;

        // AUDIT NOTE (H-1): block.prevrandao is known to the block proposer before tx inclusion.
        // A validator-voter could withhold trySettle txs to delay unfavorable settlement.
        // Mitigations: forced settlement at maxEpochBlocks, small MAX_STAKE (100 cREP),
        // permissionless trySettle (anyone can trigger it).
        uint256 rand = uint256(keccak256(abi.encodePacked(block.prevrandao, contentId, roundId, block.number)));
        return (rand % 10000) < prob;
    }

    /// @dev Execute two-sided settlement (both UP and DOWN voters exist).
    function _executeSettlement(
        uint256 contentId,
        uint256 roundId,
        RoundLib.Round storage round,
        RoundLib.RoundConfig memory roundCfg
    ) internal {
        // Tie: equal stakes, no winners
        if (round.totalUpStake == round.totalDownStake) {
            round.state = RoundLib.RoundState.Tied;
            round.settledAt = block.timestamp;

            // Restore epoch-start rating
            try registry.updateRatingDirect(contentId, round.epochStartRating) { } catch { }

            emit RoundTied(contentId, roundId);
            return;
        }

        // Determine winner: majority stake wins
        bool upWins = round.totalUpStake > round.totalDownStake;
        round.upWins = upWins;
        round.state = RoundLib.RoundState.Settled;
        round.settledAt = block.timestamp;

        uint256 winningShares = upWins ? round.totalUpShares : round.totalDownShares;
        uint256 losingPool = upWins ? round.totalDownStake : round.totalUpStake;

        // Split the losing pool (82% voters, 10% submitter, 2% platform, 1% treasury, 5% consensus)
        (
            uint256 voterShare,
            uint256 submitterShare,
            uint256 platformShare,
            uint256 treasuryShare,
            uint256 consensusShare
        ) = RewardMath.splitPool(losingPool);

        // Store voter pool and winning shares for pull-based claims
        roundVoterPool[contentId][roundId] = voterShare;
        roundWinningShares[contentId][roundId] = winningShares;

        // Store submitter reward
        pendingSubmitterReward[contentId][roundId] = submitterShare;

        // Fund consensus reserve
        if (consensusShare > 0) {
            consensusReserve += consensusShare;
            emit ConsensusReserveFunded(contentId, roundId, consensusShare);
        }

        // Distribute platform fees
        if (platformShare > 0) {
            uint256 frontendShare = platformShare / 2;
            uint256 categorySubmitterShare = platformShare - frontendShare;

            if (frontendShare > 0) {
                if (roundStakeWithApprovedFrontend[contentId][roundId] > 0) {
                    roundFrontendPool[contentId][roundId] = frontendShare;
                } else {
                    roundVoterPool[contentId][roundId] += frontendShare;
                }
            }

            if (categorySubmitterShare > 0) {
                try this.distributeCategoryFeeExternal(contentId, roundId, categorySubmitterShare) { }
                catch {
                    roundVoterPool[contentId][roundId] += categorySubmitterShare;
                    emit SettlementSideEffectFailed(contentId, roundId, "categoryFee");
                }
            }
        }

        // Transfer treasury fee
        if (treasuryShare > 0) {
            if (treasury != address(0)) {
                try this.transferTokenExternal(treasury, treasuryShare) {
                    emit TreasuryFeeDistributed(contentId, roundId, treasuryShare);
                } catch {
                    roundVoterPool[contentId][roundId] += treasuryShare;
                    emit SettlementSideEffectFailed(contentId, roundId, "treasuryFee");
                }
            } else {
                roundVoterPool[contentId][roundId] += treasuryShare;
            }
        }

        // Snapshot participation rate
        if (address(participationPool) != address(0)) {
            try participationPool.getCurrentRateBps() returns (uint256 rate) {
                roundParticipationRateBps[contentId][roundId] = rate;
            } catch {
                emit SettlementSideEffectFailed(contentId, roundId, "participationRateSnapshot");
            }
        }

        // Check submitter stake return/slash conditions
        try this.checkSubmitterStakeExternal(contentId) { }
        catch {
            emit SettlementSideEffectFailed(contentId, roundId, "submitterStake");
        }

        emit RoundSettled(contentId, roundId, upWins, losingPool);
    }

    /// @dev Execute one-sided consensus settlement with subsidy.
    function _executeConsensusSettlement(uint256 contentId, uint256 roundId, RoundLib.Round storage round) internal {
        bool upWins = round.upCount > 0; // The only side present wins
        round.upWins = upWins;
        round.state = RoundLib.RoundState.Settled;
        round.settledAt = block.timestamp;

        uint256 winningShares = upWins ? round.totalUpShares : round.totalDownShares;
        uint256 totalStake = round.totalStake;

        // Pay from consensus reserve (5% of total stake)
        uint256 subsidy = RewardMath.calculateConsensusSubsidy(totalStake, consensusReserve);

        if (subsidy > 0) {
            consensusReserve -= subsidy;
            (uint256 voterSubsidy, uint256 submitterSubsidy) = RewardMath.splitConsensusSubsidy(subsidy);
            roundVoterPool[contentId][roundId] = voterSubsidy;
            pendingSubmitterReward[contentId][roundId] = submitterSubsidy;
            emit ConsensusSubsidyDistributed(contentId, roundId, subsidy);
        }

        roundWinningShares[contentId][roundId] = winningShares;

        // Snapshot participation rate
        if (address(participationPool) != address(0)) {
            try participationPool.getCurrentRateBps() returns (uint256 rate) {
                roundParticipationRateBps[contentId][roundId] = rate;
            } catch {
                emit SettlementSideEffectFailed(contentId, roundId, "participationRateSnapshot");
            }
        }

        // Check submitter stake
        try this.checkSubmitterStakeExternal(contentId) { }
        catch {
            emit SettlementSideEffectFailed(contentId, roundId, "submitterStake");
        }

        emit RoundSettled(contentId, roundId, upWins, 0);
    }

    // =========================================================================
    // REFUNDS (cancelled/tied rounds)
    // =========================================================================

    /// @notice Claim refund for a cancelled or tied round. Pull-based.
    /// @param contentId The content ID.
    /// @param roundId The round ID.
    function claimCancelledRoundRefund(uint256 contentId, uint256 roundId) external nonReentrant {
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (round.state != RoundLib.RoundState.Cancelled && round.state != RoundLib.RoundState.Tied) {
            revert RoundNotCancelledOrTied();
        }
        if (cancelledRoundRefundClaimed[contentId][roundId][msg.sender]) revert AlreadyClaimed();

        RoundLib.Vote storage v = votes[contentId][roundId][msg.sender];
        if (v.voter == address(0)) revert NoVote();
        if (v.stake == 0) revert NoStake();

        uint256 refundAmount = v.stake;
        cancelledRoundRefundClaimed[contentId][roundId][msg.sender] = true;

        crepToken.safeTransfer(msg.sender, refundAmount);

        emit CancelledRoundRefundClaimed(contentId, roundId, msg.sender, refundAmount);
    }

    // =========================================================================
    // PULL-BASED CLAIMS (frontend fees, participation rewards)
    // =========================================================================

    /// @notice Frontend operator claims fees for a settled round. Pull-based, permissionless.
    function claimFrontendFee(uint256 contentId, uint256 roundId, address frontend) external nonReentrant {
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (round.state != RoundLib.RoundState.Settled) revert RoundNotSettled();
        if (frontendFeeClaimed[contentId][roundId][frontend]) revert AlreadyClaimed();

        uint256 totalFrontendPool = roundFrontendPool[contentId][roundId];
        if (totalFrontendPool == 0) revert NoPool();

        uint256 frontendStake = roundPerFrontendStake[contentId][roundId][frontend];
        if (frontendStake == 0) revert NoStake();

        uint256 totalApprovedStake = roundStakeWithApprovedFrontend[contentId][roundId];
        if (totalApprovedStake == 0) revert NoApprovedStake();

        uint256 totalFrontendClaimants = roundApprovedFrontendCount[contentId][roundId];
        if (totalFrontendClaimants == 0) revert NoPool();

        uint256 claimedCount = roundFrontendClaimedCount[contentId][roundId];
        uint256 claimedAmount = roundFrontendClaimedAmount[contentId][roundId];
        if (claimedAmount > totalFrontendPool) revert PoolExhausted();

        uint256 fee;
        if (claimedCount + 1 == totalFrontendClaimants) {
            fee = totalFrontendPool - claimedAmount;
        } else {
            fee = (totalFrontendPool * frontendStake) / totalApprovedStake;
        }

        frontendFeeClaimed[contentId][roundId][frontend] = true;
        roundFrontendClaimedCount[contentId][roundId] = claimedCount + 1;
        roundFrontendClaimedAmount[contentId][roundId] = claimedAmount + fee;

        if (fee > 0) {
            crepToken.safeTransfer(address(frontendRegistry), fee);
            frontendRegistry.creditFees(frontend, fee);
        }

        emit FrontendFeeClaimed(contentId, roundId, frontend, fee);
    }

    /// @notice Claim participation reward for a settled round. Pull-based.
    function claimParticipationReward(uint256 contentId, uint256 roundId) external nonReentrant {
        if (address(participationPool) == address(0)) revert NoPool();
        if (participationRewardClaimed[contentId][roundId][msg.sender]) revert AlreadyClaimed();

        RoundLib.Round storage round = rounds[contentId][roundId];
        if (round.state != RoundLib.RoundState.Settled) revert RoundNotSettled();

        RoundLib.Vote storage v = votes[contentId][roundId][msg.sender];
        if (v.voter == address(0)) revert NoVote();
        if (v.stake == 0) revert NoStake();

        uint256 rateBps = roundParticipationRateBps[contentId][roundId];
        if (rateBps == 0) revert NoParticipationRate();

        uint256 reward = v.stake * rateBps / 10000;
        if (reward == 0) {
            participationRewardClaimed[contentId][roundId][msg.sender] = true;
            emit ParticipationRewardClaimed(contentId, roundId, msg.sender, 0);
            return;
        }

        uint256 alreadyPaid = participationRewardPaid[contentId][roundId][msg.sender];
        if (alreadyPaid >= reward) revert AlreadyClaimed();

        uint256 remainingReward = reward - alreadyPaid;
        uint256 paidReward = participationPool.distributeReward(msg.sender, remainingReward);
        if (paidReward == 0) revert PoolDepleted();

        uint256 totalPaid = alreadyPaid + paidReward;
        participationRewardPaid[contentId][roundId][msg.sender] = totalPaid;
        if (totalPaid == reward) {
            participationRewardClaimed[contentId][roundId][msg.sender] = true;
        }

        emit ParticipationRewardClaimed(contentId, roundId, msg.sender, paidReward);
    }

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    /// @dev Pay flat cREP keeper reward from the dedicated pool.
    function _rewardKeeper(string memory operation) internal {
        uint256 reward = keeperReward;
        if (reward == 0) return;
        if (keeperRewardPool >= reward) {
            keeperRewardPool -= reward;
            crepToken.safeTransfer(msg.sender, reward);
            emit KeeperRewarded(msg.sender, reward, operation);
        }
    }

    /// @dev Get the config snapshot for a round. Falls back to global config for pre-snapshot rounds.
    function _getRoundConfig(uint256 contentId, uint256 roundId) internal view returns (RoundLib.RoundConfig memory) {
        RoundLib.RoundConfig memory cfg = roundConfigSnapshot[contentId][roundId];
        if (cfg.minEpochBlocks == 0) return config; // backward-compat
        return cfg;
    }

    /// @dev Distribute category submitter fee.
    function _distributeCategoryFee(uint256 contentId, uint256 roundId, uint256 categorySubmitterShare) internal {
        uint256 categoryId = registry.getCategoryId(contentId);
        if (categoryId > 0 && address(categoryRegistry) != address(0)) {
            address categorySubmitter = categoryRegistry.getSubmitter(categoryId);
            if (categorySubmitter != address(0)) {
                crepToken.safeTransfer(categorySubmitter, categorySubmitterShare);
                emit CategorySubmitterRewarded(contentId, categoryId, categorySubmitter, categorySubmitterShare);
                return;
            }
        }
        roundVoterPool[contentId][roundId] += categorySubmitterShare;
    }

    /// @dev Check and process submitter stake return or slash based on time and rating.
    function _checkSubmitterStake(uint256 contentId) internal {
        if (registry.isSubmitterStakeReturned(contentId)) return;

        uint256 contentCreatedAt = registry.getCreatedAt(contentId);
        uint256 elapsed = block.timestamp - contentCreatedAt;

        if (elapsed >= 4 days) {
            registry.returnSubmitterStake(contentId);
            return;
        }

        if (elapsed >= 24 hours) {
            uint256 rating = registry.getRating(contentId);
            if (rating < registry.SLASH_RATING_THRESHOLD()) {
                registry.slashSubmitterStake(contentId);
            }
        }
    }

    // =========================================================================
    // EXTERNAL WRAPPERS (for try-catch in settlement — onlySelf, NOT nonReentrant)
    // =========================================================================

    function distributeCategoryFeeExternal(uint256 contentId, uint256 roundId, uint256 categorySubmitterShare)
        external
        onlySelf
    {
        _distributeCategoryFee(contentId, roundId, categorySubmitterShare);
    }

    function transferTokenExternal(address recipient, uint256 amount) external onlySelf {
        crepToken.safeTransfer(recipient, amount);
    }

    function checkSubmitterStakeExternal(uint256 contentId) external onlySelf {
        _checkSubmitterStake(contentId);
    }

    // =========================================================================
    // VIEW FUNCTIONS
    // =========================================================================

    /// @notice Get round data for a content item.
    function getRound(uint256 contentId, uint256 roundId) external view returns (RoundLib.Round memory) {
        return rounds[contentId][roundId];
    }

    /// @notice Get the active round ID for a content item (0 if none).
    function getActiveRoundId(uint256 contentId) external view returns (uint256) {
        uint256 roundId = currentRoundId[contentId];
        if (roundId == 0) return 0;
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (RoundLib.isTerminal(round)) return 0;
        return roundId;
    }

    /// @notice Get a vote for a voter in a specific round.
    function getVote(uint256 contentId, uint256 roundId, address voter) external view returns (RoundLib.Vote memory) {
        return votes[contentId][roundId][voter];
    }

    /// @notice Get the number of voters in a round.
    function getRoundVoterCount(uint256 contentId, uint256 roundId) external view returns (uint256) {
        return roundVoters[contentId][roundId].length;
    }

    /// @notice Get a voter address from a round's voter list.
    function getRoundVoter(uint256 contentId, uint256 roundId, uint256 index) external view returns (address) {
        return roundVoters[contentId][roundId][index];
    }

    /// @notice Get the config snapshot for a round.
    function getRoundConfig(uint256 contentId, uint256 roundId) external view returns (RoundLib.RoundConfig memory) {
        return _getRoundConfig(contentId, roundId);
    }

    /// @notice Get total lifetime vote count for a content item.
    function getContentVoteCount(uint256 contentId) external view returns (uint256) {
        return contentVoteCount[contentId];
    }

    /// @notice Get the frontend fee pool for a round.
    function getRoundFrontendPool(uint256 contentId, uint256 roundId) external view returns (uint256) {
        return roundFrontendPool[contentId][roundId];
    }

    /// @notice Get a frontend's stake contribution for a round.
    function getRoundPerFrontendStake(uint256 contentId, uint256 roundId, address frontend)
        external
        view
        returns (uint256)
    {
        return roundPerFrontendStake[contentId][roundId][frontend];
    }

    /// @notice Get the total approved frontend stake for a round.
    function getRoundStakeWithApprovedFrontend(uint256 contentId, uint256 roundId) external view returns (uint256) {
        return roundStakeWithApprovedFrontend[contentId][roundId];
    }

    /// @notice Check if frontend fee has been claimed for a round.
    function isFrontendFeeClaimed(uint256 contentId, uint256 roundId, address frontend) external view returns (bool) {
        return frontendFeeClaimed[contentId][roundId][frontend];
    }

    /// @notice Check if participation reward has been claimed for a round.
    function isParticipationRewardClaimed(uint256 contentId, uint256 roundId, address voter)
        external
        view
        returns (bool)
    {
        return participationRewardClaimed[contentId][roundId][voter];
    }

    /// @notice Get the snapshotted participation rate for a round.
    function getRoundParticipationRateBps(uint256 contentId, uint256 roundId) external view returns (uint256) {
        return roundParticipationRateBps[contentId][roundId];
    }

    /// @notice Check if content has active (unsettled) votes.
    function hasActiveVotes(uint256 contentId) external view returns (bool) {
        uint256 roundId = currentRoundId[contentId];
        if (roundId == 0) return false;
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (RoundLib.isTerminal(round)) return false;
        return round.voteCount > 0;
    }

    /// @notice Calculate current settlement probability for a round (in BPS, 0-10000).
    function getSettlementProbability(uint256 contentId, uint256 roundId) external view returns (uint256) {
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (round.state != RoundLib.RoundState.Open) return 0;
        if (round.startBlock == 0) return 0;

        RoundLib.RoundConfig memory roundCfg = _getRoundConfig(contentId, roundId);
        uint256 elapsed = block.number - round.startBlock;

        if (elapsed < roundCfg.minEpochBlocks) return 0;
        if (elapsed >= roundCfg.maxEpochBlocks) return 10000;

        uint256 window = elapsed - roundCfg.minEpochBlocks;
        uint256 prob = uint256(roundCfg.baseRateBps) + window * uint256(roundCfg.growthRateBps);
        return prob > roundCfg.maxProbBps ? roundCfg.maxProbBps : prob;
    }

    // --- Admin ---

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) { }

    // --- Storage Gap for UUPS Upgradeability ---
    uint256[25] private __gap;
}
