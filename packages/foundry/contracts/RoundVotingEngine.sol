// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Permit.sol";

import {ContentRegistry} from "./ContentRegistry.sol";
import {RoundLib} from "./libraries/RoundLib.sol";
import {RewardMath} from "./libraries/RewardMath.sol";
import {IFrontendRegistry} from "./interfaces/IFrontendRegistry.sol";
import {ICategoryRegistry} from "./interfaces/ICategoryRegistry.sol";
import {IRoundRewardDistributor} from "./interfaces/IRoundRewardDistributor.sol";
import {IVoterIdNFT} from "./interfaces/IVoterIdNFT.sol";
import {IRoundVotingEngine} from "./interfaces/IRoundVotingEngine.sol";
import {IParticipationPool} from "./interfaces/IParticipationPool.sol";

/// @title RoundVotingEngine
/// @notice Per-content round-based parimutuel voting with tlock commit-reveal and epoch-weighted rewards.
/// @dev Flow: commitVote (tlock-encrypted to epoch end) → epoch ends → revealVote (anyone decrypts via drand) → settleRound (≥3 votes).
///      Rounds accumulate votes across 20-minute epochs. After each epoch, tlock ciphertexts
///      become decryptable and anyone can call revealVote(). Settlement triggers when ≥3 votes
///      are revealed. If 1 week passes without ≥3 revealed votes, the round cancels with full refunds.
///      Epoch-weighting: epoch-1 (blind) = 100% reward weight; epoch-2+ (informed) = 25%.
///      Win condition uses weighted pools, not raw stake, preventing late-voter herding.
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
    error RewardDistributorLocked();
    error VoterIdRequired();
    error SelfVote();
    error ContentNotActive();
    error CooldownActive();
    error CiphertextTooLarge();
    error InvalidCiphertext();
    error ExceedsMaxStake();
    error RoundNotOpen();
    error RoundNotAccepting();
    error RoundNotExpired();
    error RoundNotSettled();
    error RoundNotSettledOrTied();
    error RoundNotCancelledOrTied();
    error ThresholdReached();
    error RevealGraceActive();

    error NotEnoughVotes();
    error AlreadyCommitted();
    error AlreadyRevealed();
    error AlreadyClaimed();
    error MaxVotersReached();
    error CommitHashUsed();
    error EpochNotEnded();
    error HashMismatch();
    error NoCommit();
    error NoStake();
    error NoPool();
    error NoApprovedStake();
    error PoolExhausted();
    error PoolDepleted();
    error VoteNotRevealed();
    error NoParticipationRate();
    error IndexOutOfBounds();
    error IdentityAlreadyCommitted();
    error UnrevealedPastEpochVotes();
    error NothingProcessed();
    error NotWinningSide();
    error SnapshotAlreadySet();

    // --- Access Control Roles ---
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant CONFIG_ROLE = keccak256("CONFIG_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // --- Constants ---
    uint256 public constant MIN_STAKE = 1e6; // 1 cREP (6 decimals)
    uint256 public constant MAX_STAKE = 100e6; // 100 cREP (6 decimals)
    uint256 public constant VOTE_COOLDOWN = 24 hours; // Time-based cooldown per content per voter
    uint256 public constant MAX_CIPHERTEXT_SIZE = 10_240; // 10 KB max ciphertext to prevent storage bloat

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

    // Commits: contentId => roundId => commitKey => Commit
    mapping(uint256 => mapping(uint256 => mapping(bytes32 => RoundLib.Commit))) public commits;

    // Track commit keys per round for iteration (reveal/settlement)
    mapping(uint256 => mapping(uint256 => bytes32[])) internal roundCommitHashes;

    // Track voters per content per round for settlement iteration
    mapping(uint256 => mapping(uint256 => address[])) internal roundVoters;

    // Prevent double voting: contentId => roundId => voter => committed
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public hasCommitted;

    // Time-based cooldown: contentId => voter => timestamp of last vote
    mapping(uint256 => mapping(address => uint256)) public lastVoteTimestamp;

    // Reward accounting per round
    mapping(uint256 => mapping(uint256 => uint256)) public roundVoterPool; // contentId => roundId => voter pool
    mapping(uint256 => mapping(uint256 => uint256)) public roundWinningStake; // contentId => roundId => epoch-weighted winning stake
    mapping(uint256 => mapping(uint256 => uint256)) public pendingSubmitterReward; // contentId => roundId => amount

    // Track which frontend each revealed vote used: contentId => roundId => voter => frontend
    mapping(uint256 => mapping(uint256 => mapping(address => address))) public voteFrontend;

    // Cancelled/tied round refund claims: contentId => roundId => voter => claimed
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public cancelledRoundRefundClaimed;

    // Total lifetime commit count per content (used by ContentRegistry)
    mapping(uint256 => uint256) public contentCommitCount;

    // Sybil resistance
    IVoterIdNFT public voterIdNFT;

    // Participation pool (rewards deferred to settlement)
    IParticipationPool public participationPool;

    // Consensus subsidy reserve: pre-funded + replenished by 5% of each losing pool.
    // Pays out on unanimous rounds (losingPool == 0) to incentivize voting on obvious content.
    uint256 public consensusReserve;

    // Flat cREP reward per keeper operation (6 decimals). 0 = disabled.
    uint256 public keeperReward;

    // Dedicated keeper reward pool — funded independently from user stakes.
    uint256 public keeperRewardPool;

    // Config snapshot per round: prevents governance config changes from affecting in-progress rounds
    mapping(uint256 => mapping(uint256 => RoundLib.RoundConfig)) internal roundConfigSnapshot;

    // Voter to commit hash lookup: contentId => roundId => voter => commitHash (O(1) claim lookups)
    mapping(uint256 => mapping(uint256 => mapping(address => bytes32))) public voterCommitHash;

    // Original public commit hash for a commit key.
    mapping(uint256 => mapping(uint256 => mapping(bytes32 => bytes32))) public commitHashByKey;

    // Deprecated: was commitHashToVoter for hash-based reveals (removed). Slot preserved for UUPS layout.
    mapping(uint256 => mapping(uint256 => mapping(bytes32 => address))) private __deprecated_commitHashToVoter;

    // Frontend fee aggregation (computed incrementally during revealVote for O(1) settlement)
    mapping(uint256 => mapping(uint256 => uint256)) internal roundStakeWithApprovedFrontend;
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) internal roundPerFrontendStake;
    mapping(uint256 => mapping(uint256 => uint256)) internal roundFrontendPool;
    // Deprecated claim-tracking slots preserved for upgrade safety. RoundRewardDistributor now owns claim state.
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) internal frontendFeeClaimed;
    mapping(uint256 => mapping(uint256 => uint256)) internal roundApprovedFrontendCount;
    mapping(uint256 => mapping(uint256 => uint256)) internal roundFrontendClaimedCount;
    mapping(uint256 => mapping(uint256 => uint256)) internal roundFrontendClaimedAmount;

    // Participation reward snapshots (claim state now lives in RoundRewardDistributor)
    mapping(uint256 => mapping(uint256 => address)) internal roundParticipationPool;
    mapping(uint256 => mapping(uint256 => uint256)) internal roundParticipationRateBps;
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) internal participationRewardClaimed;
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) internal participationRewardPaid;

    // --- Events ---
    event VoteCommitted(
        uint256 indexed contentId, uint256 indexed roundId, address indexed voter, bytes32 commitHash, uint256 stake
    );
    event VoteRevealed(uint256 indexed contentId, uint256 indexed roundId, address indexed voter, bool isUp);
    event RoundSettled(uint256 indexed contentId, uint256 indexed roundId, bool upWins, uint256 losingPool);
    event RoundCancelled(uint256 indexed contentId, uint256 indexed roundId);
    event RoundTied(uint256 indexed contentId, uint256 indexed roundId);
    event RoundRevealFailed(uint256 indexed contentId, uint256 indexed roundId);
    event CancelledRoundRefundClaimed(
        uint256 indexed contentId, uint256 indexed roundId, address indexed voter, uint256 amount
    );
    event ForfeitedFundsAddedToTreasury(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    event CurrentEpochRefunded(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    event TreasuryFeeDistributed(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    event CategorySubmitterRewarded(
        uint256 indexed contentId, uint256 indexed categoryId, address indexed submitter, uint256 amount
    );
    event ConsensusReserveFunded(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    event ConsensusSubsidyDistributed(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    event SettlementSideEffectFailed(uint256 indexed contentId, uint256 indexed roundId, uint8 reason);
    event FrontendFeeClaimed(
        uint256 indexed contentId, uint256 indexed roundId, address indexed frontend, uint256 amount
    );
    event ParticipationRewardClaimed(
        uint256 indexed contentId, uint256 indexed roundId, address indexed voter, uint256 amount
    );
    event ConfigUpdated(uint256 epochDuration, uint256 maxDuration, uint256 minVoters, uint256 maxVoters);
    event FrontendRegistryUpdated(address frontendRegistry);
    event CategoryRegistryUpdated(address categoryRegistry);
    event VoterIdNFTUpdated(address voterIdNFT);
    event TreasuryUpdated(address treasury);
    event KeeperRewardUpdated(uint256 keeperReward);
    event KeeperRewardPoolFunded(address indexed funder, uint256 amount);
    event KeeperRewarded(address indexed keeper, uint256 amount, uint8 operation);
    event RevealGracePeriodUpdated(uint256 revealGracePeriod);

    // Settlement side-effect failure reason codes
    uint8 internal constant REASON_CATEGORY_FEE = 1;
    uint8 internal constant REASON_TREASURY_FEE = 2;
    uint8 internal constant REASON_UPDATE_RATING = 3;
    uint8 internal constant REASON_UPDATE_ACTIVITY = 4;
    uint8 internal constant REASON_PARTICIPATION_RATE = 5;
    uint8 internal constant REASON_SUBMITTER_STAKE = 6;
    uint8 internal constant REASON_FORFEITED_TRANSFER = 7;

    // Keeper operation codes
    uint8 internal constant OP_CANCEL = 1;
    uint8 internal constant OP_SETTLE = 2;
    uint8 internal constant OP_PROCESS_UNREVEALED = 3;
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

        // Default config: 20-minute epochs, 7-day max, 3 min voters
        config = RoundLib.RoundConfig({epochDuration: 20 minutes, maxDuration: 7 days, minVoters: 3, maxVoters: 1000});

        // Default reveal grace period: 60 minutes (3 epochs)
        revealGracePeriod = 60 minutes;
    }

    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    function setRewardDistributor(address _rewardDistributor) external onlyRole(CONFIG_ROLE) {
        if (_rewardDistributor == address(0)) revert InvalidAddress();
        if (rewardDistributor != address(0)) revert RewardDistributorLocked();
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

    function setRevealGracePeriod(uint256 _revealGracePeriod) external onlyRole(CONFIG_ROLE) {
        if (_revealGracePeriod < config.epochDuration) revert InvalidConfig();
        revealGracePeriod = _revealGracePeriod;
        emit RevealGracePeriodUpdated(_revealGracePeriod);
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

    /// @notice One-time governance backfill for settled legacy rounds that lack a pool snapshot.
    function backfillParticipationRewardSnapshot(
        uint256 contentId,
        uint256 roundId,
        address rewardPoolAddress,
        uint256 rateBps
    ) external onlyRole(CONFIG_ROLE) {
        if (rewardPoolAddress == address(0)) revert InvalidAddress();
        if (rateBps == 0) revert NoParticipationRate();

        RoundLib.Round storage round = rounds[contentId][roundId];
        if (round.state != RoundLib.RoundState.Settled) revert RoundNotSettled();
        if (roundParticipationPool[contentId][roundId] != address(0)) revert SnapshotAlreadySet();

        uint256 existingRateBps = roundParticipationRateBps[contentId][roundId];
        if (existingRateBps != 0 && existingRateBps != rateBps) revert InvalidConfig();

        roundParticipationPool[contentId][roundId] = rewardPoolAddress;
        if (existingRateBps == 0) {
            roundParticipationRateBps[contentId][roundId] = rateBps;
        }
    }

    function setConfig(uint256 _epochDuration, uint256 _maxDuration, uint256 _minVoters, uint256 _maxVoters)
        external
        onlyRole(CONFIG_ROLE)
    {
        if (_epochDuration < 5 minutes) revert InvalidConfig();
        if (_maxDuration < 1 days) revert InvalidConfig();
        if (_minVoters < 2) revert InvalidConfig();
        if (_maxVoters < _minVoters || _maxVoters > 10000) revert InvalidConfig();

        config = RoundLib.RoundConfig({
            epochDuration: _epochDuration, maxDuration: _maxDuration, minVoters: _minVoters, maxVoters: _maxVoters
        });

        emit ConfigUpdated(_epochDuration, _maxDuration, _minVoters, _maxVoters);
    }

    /// @notice Fund the consensus subsidy reserve (admin-only, initial/top-up funding).
    /// @dev AUDIT NOTE (I-1): This is the admin-gated entry point for treasury-funded top-ups.
    ///      `addToConsensusReserve` below is intentionally permissionless so that any contract
    ///      (e.g. FrontendRegistry slashing) can route forfeited cREP into the reserve via
    ///      safeTransferFrom, without requiring a role grant.
    function fundConsensusReserve(uint256 amount) external onlyRole(CONFIG_ROLE) {
        if (amount == 0) revert ZeroAmount();
        crepToken.safeTransferFrom(msg.sender, address(this), amount);
        consensusReserve += amount;
    }

    /// @notice Add cREP to the consensus reserve (e.g. from slashed stakes).
    /// @dev Permissionless by design — caller must have approved cREP; see fundConsensusReserve above.
    function addToConsensusReserve(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        crepToken.safeTransferFrom(msg.sender, address(this), amount);
        consensusReserve += amount;
    }

    /// @notice Fund the keeper reward pool.
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

    /// @notice Credit or directly pay a frontend fee. Only callable by RewardDistributor.
    function payoutFrontendFee(address frontend, uint256 fee) external {
        if (msg.sender != rewardDistributor) revert Unauthorized();
        if (fee == 0) return;

        address frontendOperator;
        bool frontendSlashed;
        (frontendOperator,,, frontendSlashed) = frontendRegistry.getFrontendInfo(frontend);
        if (frontendSlashed) revert IFrontendRegistry.FrontendIsSlashed();

        if (frontendOperator == address(0)) {
            crepToken.safeTransfer(frontend, fee);
        } else {
            crepToken.safeTransfer(address(frontendRegistry), fee);
            frontendRegistry.creditFees(frontend, fee);
        }
    }

    /// @notice Distribute a participation reward from the configured pool snapshot. Only callable by RewardDistributor.
    function distributeParticipationReward(address rewardPoolAddress, address voter, uint256 rewardAmount)
        external
        returns (uint256 paidReward)
    {
        if (msg.sender != rewardDistributor) revert Unauthorized();
        if (rewardPoolAddress == address(0)) revert NoPool();
        return IParticipationPool(rewardPoolAddress).distributeReward(voter, rewardAmount);
    }

    // =========================================================================
    // COMMIT PHASE
    // =========================================================================

    /// @notice Commit a blind vote on content. Direction is hidden via tlock encryption.
    /// @param contentId The content being voted on.
    /// @param commitHash keccak256(abi.encodePacked(isUp, salt, contentId, keccak256(ciphertext))).
    /// @param ciphertext Tlock-encrypted payload (decryptable after epoch end via drand).
    /// @param stakeAmount Amount of cREP tokens to stake (1-100).
    /// @param frontend Address of frontend operator for fee distribution.
    function commitVote(
        uint256 contentId,
        bytes32 commitHash,
        bytes calldata ciphertext,
        uint256 stakeAmount,
        address frontend
    ) external nonReentrant whenNotPaused {
        _commitVote(contentId, commitHash, ciphertext, stakeAmount, frontend);
    }

    /// @notice Commit a blind vote using ERC2612 permit (single transaction).
    /// @dev Uses try-catch around permit to mitigate front-running grief (EIP-2612 known issue).
    ///      If an attacker front-runs the permit signature, the allowance is already set and
    ///      safeTransferFrom in _commitVote succeeds using the existing allowance.
    function commitVoteWithPermit(
        uint256 contentId,
        bytes32 commitHash,
        bytes calldata ciphertext,
        uint256 stakeAmount,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s,
        address frontend
    ) external nonReentrant whenNotPaused {
        try IERC20Permit(address(crepToken)).permit(msg.sender, address(this), stakeAmount, deadline, v, r, s) {}
            catch {}
        _commitVote(contentId, commitHash, ciphertext, stakeAmount, frontend);
    }

    function _commitVote(
        uint256 contentId,
        bytes32 commitHash,
        bytes calldata ciphertext,
        uint256 stakeAmount,
        address frontend
    ) internal {
        if (stakeAmount < MIN_STAKE || stakeAmount > MAX_STAKE) revert InvalidStake();
        if (ciphertext.length == 0) revert InvalidCiphertext();
        if (ciphertext.length > MAX_CIPHERTEXT_SIZE) revert CiphertextTooLarge();

        // Voter ID check (if configured)
        uint256 voterId;
        if (address(voterIdNFT) != address(0)) {
            if (!voterIdNFT.hasVoterId(msg.sender)) revert VoterIdRequired();
            voterId = voterIdNFT.getTokenId(msg.sender);
        }

        // Prevent submitter from voting on own content
        address effectiveVoter = msg.sender;
        if (address(voterIdNFT) != address(0)) {
            address resolved = voterIdNFT.resolveHolder(msg.sender);
            if (resolved != address(0)) effectiveVoter = resolved;
        }
        if (effectiveVoter == registry.getSubmitter(contentId)) revert SelfVote();

        // Content must be active
        if (!registry.isActive(contentId)) revert ContentNotActive();

        // Time-based cooldown (24 hours) — per identity when VoterID is configured
        if (address(voterIdNFT) != address(0) && voterId != 0) {
            uint256 lastVote = lastVoteTimestampByToken[contentId][voterId];
            if (lastVote > 0 && block.timestamp < lastVote + VOTE_COOLDOWN) revert CooldownActive();
        } else {
            uint256 lastVote = lastVoteTimestamp[contentId][msg.sender];
            if (lastVote > 0 && block.timestamp < lastVote + VOTE_COOLDOWN) revert CooldownActive();
        }

        // Get or create active round
        uint256 roundId = _getOrCreateRound(contentId);
        RoundLib.Round storage round = rounds[contentId][roundId];
        RoundLib.RoundConfig memory roundCfg = _getRoundConfig(contentId, roundId);

        // Round must be Open and not expired
        if (!RoundLib.acceptsVotes(round, roundCfg.maxDuration)) revert RoundNotAccepting();

        // One vote per voter per round
        if (hasCommitted[contentId][roundId][msg.sender]) revert AlreadyCommitted();

        // One vote per identity per round (prevents holder + delegate double voting)
        if (address(voterIdNFT) != address(0) && voterId != 0) {
            if (hasTokenIdCommitted[contentId][roundId][voterId]) revert IdentityAlreadyCommitted();
        }

        // Voter cap
        if (round.voteCount >= roundCfg.maxVoters) revert MaxVotersReached();

        // Per-voter commit key prevents mempool griefing via copied commit hashes
        bytes32 commitKey = _buildCommitKey(msg.sender, commitHash);
        if (commits[contentId][roundId][commitKey].voter != address(0)) revert CommitHashUsed();

        // Check MAX_STAKE per Voter ID per content per round
        if (address(voterIdNFT) != address(0) && voterId != 0) {
            uint256 currentStake = voterIdNFT.getEpochContentStake(contentId, roundId, voterId);
            if (currentStake + stakeAmount > MAX_STAKE) revert ExceedsMaxStake();
        }

        // Transfer cREP stake
        crepToken.safeTransferFrom(msg.sender, address(this), stakeAmount);

        // Compute epoch end time and epoch index for this commit
        uint256 epochEnd = RoundLib.computeEpochEnd(round, roundCfg.epochDuration, block.timestamp);
        uint32 epochIdx = RoundLib.computeEpochIndex(round, roundCfg.epochDuration, block.timestamp);

        // Store commit with epoch index (determines reward weight)
        commits[contentId][roundId][commitKey] = RoundLib.Commit({
            voter: msg.sender,
            stakeAmount: stakeAmount,
            ciphertext: ciphertext,
            frontend: frontend,
            revealableAfter: epochEnd,
            revealed: false,
            isUp: false,
            epochIndex: epochIdx
        });
        commitHashByKey[contentId][roundId][commitKey] = commitHash;

        if (frontend != address(0) && address(frontendRegistry) != address(0)) {
            try frontendRegistry.isApproved(frontend) returns (bool approved) {
                if (approved) {
                    frontendEligibleAtCommit[contentId][roundId][commitKey] = true;
                }
            } catch {
                // Frontend registry call failed — treat as ineligible
            }
        }

        // Track for iteration
        roundCommitHashes[contentId][roundId].push(commitKey);
        hasCommitted[contentId][roundId][msg.sender] = true;

        // Track unrevealed count per epoch (selective revelation prevention)
        epochUnrevealedCount[contentId][roundId][epochEnd]++;
        if (epochEnd > lastCommitRevealableAfter[contentId][roundId]) {
            lastCommitRevealableAfter[contentId][roundId] = epochEnd;
        }
        voterCommitHash[contentId][roundId][msg.sender] = commitHash;
        contentCommitCount[contentId]++;

        // Mark identity as committed for this round
        if (address(voterIdNFT) != address(0) && voterId != 0) {
            hasTokenIdCommitted[contentId][roundId][voterId] = true;
        }

        // Update round counters
        round.voteCount++;
        round.totalStake += stakeAmount;

        // Record stake against Voter ID
        if (address(voterIdNFT) != address(0) && voterId != 0) {
            voterIdNFT.recordStake(contentId, roundId, voterId, stakeAmount);
        }

        // Record cooldown (per identity + per address)
        lastVoteTimestamp[contentId][msg.sender] = block.timestamp;
        if (address(voterIdNFT) != address(0) && voterId != 0) {
            lastVoteTimestampByToken[contentId][voterId] = block.timestamp;
        }

        // Vote commits count as content activity for dormancy tracking.
        registry.updateActivity(contentId);

        emit VoteCommitted(contentId, roundId, msg.sender, commitHash, stakeAmount);
    }

    /// @dev Get or create the active round for a content item.
    function _getOrCreateRound(uint256 contentId) internal returns (uint256) {
        uint256 roundId = currentRoundId[contentId];

        // If there's an active round, use it
        if (roundId > 0) {
            RoundLib.Round storage existingRound = rounds[contentId][roundId];
            if (
                existingRound.state == RoundLib.RoundState.Open
                    && _canFinalizeRevealFailedRound(contentId, roundId, existingRound)
            ) {
                existingRound.state = RoundLib.RoundState.RevealFailed;
                existingRound.settledAt = block.timestamp;
                emit RoundRevealFailed(contentId, roundId);
            }
            if (!RoundLib.isTerminal(existingRound)) {
                return roundId;
            }
        }

        // Create a new round
        nextRoundId[contentId]++;
        roundId = nextRoundId[contentId];
        currentRoundId[contentId] = roundId;

        rounds[contentId][roundId].startTime = block.timestamp;
        rounds[contentId][roundId].state = RoundLib.RoundState.Open;

        // Snapshot config at round creation to prevent mid-round governance changes
        roundConfigSnapshot[contentId][roundId] = config;
        roundRevealGracePeriodSnapshot[contentId][roundId] = revealGracePeriod;

        return roundId;
    }

    // =========================================================================
    // ROUND EXPIRY
    // =========================================================================

    /// @notice Cancel an expired round that didn't reach the minimum voter threshold. Permissionless.
    function cancelExpiredRound(uint256 contentId, uint256 roundId) external nonReentrant whenNotPaused {
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (round.state != RoundLib.RoundState.Open) revert RoundNotOpen();
        RoundLib.RoundConfig memory roundCfg = _getRoundConfig(contentId, roundId);
        if (!RoundLib.isExpired(round, roundCfg.maxDuration)) revert RoundNotExpired();
        // Cannot cancel once the round has meaningful commit quorum.
        if (round.voteCount >= roundCfg.minVoters) revert ThresholdReached();

        round.state = RoundLib.RoundState.Cancelled;

        emit RoundCancelled(contentId, roundId);
        _rewardKeeper(OP_CANCEL);
    }

    /// @notice Finalize a round whose reveal quorum never materialized after commit quorum was already reached.
    function finalizeRevealFailedRound(uint256 contentId, uint256 roundId) external nonReentrant whenNotPaused {
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (round.state != RoundLib.RoundState.Open) revert RoundNotOpen();
        RoundLib.RoundConfig memory roundCfg = _getRoundConfig(contentId, roundId);
        if (round.voteCount < roundCfg.minVoters) revert NotEnoughVotes();
        if (round.revealedCount >= roundCfg.minVoters) revert ThresholdReached();
        if (!_canFinalizeRevealFailedRound(contentId, roundId, round)) revert RevealGraceActive();

        round.state = RoundLib.RoundState.RevealFailed;
        round.settledAt = block.timestamp;

        emit RoundRevealFailed(contentId, roundId);
    }

    // =========================================================================
    // REVEAL PHASE (tlock-primary, permissionless)
    // =========================================================================

    /// @notice Reveal a specific commit by commit key. Permissionless — anyone can call.
    /// @dev The caller decrypts the tlock ciphertext off-chain using the drand beacon,
    ///      then submits the plaintext (isUp, salt) here for on-chain verification.
    function revealVoteByCommitKey(uint256 contentId, uint256 roundId, bytes32 commitKey, bool isUp, bytes32 salt)
        external
        nonReentrant
        whenNotPaused
    {
        bytes32 commitHash = commitHashByKey[contentId][roundId][commitKey];
        if (commitHash == bytes32(0)) revert NoCommit();
        _revealVoteInternal(contentId, roundId, commitKey, commitHash, isUp, salt);
    }

    // =========================================================================
    // SETTLEMENT
    // =========================================================================

    /// @notice Settle a round after ≥minVoters votes have been revealed. Permissionless.
    /// @dev Win condition uses epoch-weighted pools to prevent late-voter herding.
    ///      Rating update uses raw revealed pools for accurate crowd opinion representation.
    function settleRound(uint256 contentId, uint256 roundId) external nonReentrant whenNotPaused {
        RoundLib.Round storage round = rounds[contentId][roundId];

        if (round.state != RoundLib.RoundState.Open) revert RoundNotOpen();

        RoundLib.RoundConfig memory roundCfg = _getRoundConfig(contentId, roundId);

        // Must have ≥ minVoters revealed votes
        if (round.revealedCount < roundCfg.minVoters) revert NotEnoughVotes();

        // Prevent selective revelation: all past-epoch commits must be revealed
        // (or their grace period must have expired) before settlement is allowed.
        // Loop is bounded: votes can only be committed during maxDuration, so no
        // epochUnrevealedCount entries exist beyond startTime + maxDuration + epochDuration.
        {
            uint256 _gracePeriod = _getRoundRevealGracePeriod(contentId, roundId);
            uint256 epochEnd = round.startTime + roundCfg.epochDuration;
            uint256 maxEpochEnd = round.startTime + roundCfg.maxDuration + roundCfg.epochDuration;
            while (epochEnd <= block.timestamp && epochEnd <= maxEpochEnd) {
                if (epochUnrevealedCount[contentId][roundId][epochEnd] > 0 && block.timestamp < epochEnd + _gracePeriod)
                {
                    revert UnrevealedPastEpochVotes();
                }
                epochEnd += roundCfg.epochDuration;
            }
        }

        // Tie: equal weighted pools, no winners
        if (round.weightedUpPool == round.weightedDownPool) {
            round.state = RoundLib.RoundState.Tied;
            round.settledAt = block.timestamp;
            emit RoundTied(contentId, roundId);
            return;
        }

        // Determine winner: weighted majority wins (anti-herding)
        bool upWins = round.weightedUpPool > round.weightedDownPool;
        round.upWins = upWins;
        round.state = RoundLib.RoundState.Settled;
        round.settledAt = block.timestamp;

        // Epoch-weighted winning stake — used for proportional reward distribution
        uint256 weightedWinningStake = upWins ? round.weightedUpPool : round.weightedDownPool;

        // Raw losing pool — 5% is reserved for revealed losers, the remainder is
        // redistributed to winners, protocol, treasury, and the consensus reserve.
        uint256 losingPool = upWins ? round.downPool : round.upPool;

        if (losingPool > 0) {
            (
                uint256 _loserRefundShare,
                uint256 voterShare,
                uint256 submitterShare,
                uint256 platformShare,
                uint256 treasuryShare,
                uint256 consensusShare
            ) = RewardMath.splitPoolAfterLoserRefund(losingPool);
            _loserRefundShare;

            // Store voter pool and weighted winning stake (used for proportional reward claims).
            // Loser rebates are paid directly from raw losing stake during claimReward().
            roundVoterPool[contentId][roundId] = voterShare;
            roundWinningStake[contentId][roundId] = weightedWinningStake;

            // Store submitter reward
            pendingSubmitterReward[contentId][roundId] = submitterShare;

            // Fund consensus reserve (5% of losing pool)
            if (consensusShare > 0) {
                consensusReserve += consensusShare;
                emit ConsensusReserveFunded(contentId, roundId, consensusShare);
            }

            // Distribute platform fees (1% frontend + 1% category)
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
                    try this.distributeCategoryFeeExternal(contentId, roundId, categorySubmitterShare) {}
                    catch {
                        roundVoterPool[contentId][roundId] += categorySubmitterShare;
                        emit SettlementSideEffectFailed(contentId, roundId, REASON_CATEGORY_FEE);
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
                        emit SettlementSideEffectFailed(contentId, roundId, REASON_TREASURY_FEE);
                    }
                } else {
                    roundVoterPool[contentId][roundId] += treasuryShare;
                }
            }

        } else {
            // Unanimous: losingPool == 0, pay from consensus reserve
            uint256 totalStake = round.upPool + round.downPool;
            uint256 subsidy = RewardMath.calculateConsensusSubsidy(totalStake, consensusReserve);

            if (subsidy > 0) {
                consensusReserve -= subsidy;
                (uint256 voterSubsidy, uint256 submitterSubsidy) = RewardMath.splitConsensusSubsidy(subsidy);
                roundVoterPool[contentId][roundId] = voterSubsidy;
                pendingSubmitterReward[contentId][roundId] = submitterSubsidy;
                emit ConsensusSubsidyDistributed(contentId, roundId, subsidy);
            }

            // All voters are winners; use weighted total stake
            roundWinningStake[contentId][roundId] = weightedWinningStake;
        }

        // Update content rating using raw revealed pools (accurate crowd opinion)
        uint16 newRating = RewardMath.calculateRating(round.upPool, round.downPool);
        try registry.updateRatingDirect(contentId, newRating) {}
        catch {
            emit SettlementSideEffectFailed(contentId, roundId, REASON_UPDATE_RATING);
        }

        try registry.updateActivity(contentId) {}
        catch {
            emit SettlementSideEffectFailed(contentId, roundId, REASON_UPDATE_ACTIVITY);
        }

        // Snapshot participation rate for pull-based claiming
        IParticipationPool currentParticipationPool = participationPool;
        if (address(currentParticipationPool) != address(0)) {
            roundParticipationPool[contentId][roundId] = address(currentParticipationPool);
            try currentParticipationPool.getCurrentRateBps() returns (uint256 rate) {
                roundParticipationRateBps[contentId][roundId] = rate;
            } catch {
                emit SettlementSideEffectFailed(contentId, roundId, REASON_PARTICIPATION_RATE);
            }
        }

        // Check submitter stake return/slash conditions
        try this.checkSubmitterStakeExternal(contentId) {}
        catch {
            emit SettlementSideEffectFailed(contentId, roundId, REASON_SUBMITTER_STAKE);
        }

        emit RoundSettled(contentId, roundId, upWins, losingPool);
        _rewardKeeper(OP_SETTLE);
    }

    // =========================================================================
    // REFUNDS (cancelled/tied/reveal-failed rounds)
    // =========================================================================

    /// @notice Claim refund for a cancelled, tied, or reveal-failed round. Pull-based.
    /// @dev AUDIT NOTE (I-7): No forfeiture deadline is intentional — refundable terminal-round stakes
    ///      belong to voters indefinitely. Adding a deadline would create a governance extraction vector.
    function claimCancelledRoundRefund(uint256 contentId, uint256 roundId) external nonReentrant {
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (
            round.state != RoundLib.RoundState.Cancelled && round.state != RoundLib.RoundState.Tied
                && round.state != RoundLib.RoundState.RevealFailed
        ) {
            revert RoundNotCancelledOrTied();
        }
        if (cancelledRoundRefundClaimed[contentId][roundId][msg.sender]) revert AlreadyClaimed();

        bytes32 commitHash = voterCommitHash[contentId][roundId][msg.sender];
        if (commitHash == bytes32(0)) revert NoCommit();
        bytes32 commitKey = _buildCommitKey(msg.sender, commitHash);

        RoundLib.Commit storage commit = commits[contentId][roundId][commitKey];
        if (commit.stakeAmount == 0) revert NoStake();
        if (round.state != RoundLib.RoundState.Cancelled && !commit.revealed) revert VoteNotRevealed();

        uint256 refundAmount = commit.stakeAmount;
        commit.stakeAmount = 0;
        cancelledRoundRefundClaimed[contentId][roundId][msg.sender] = true;

        crepToken.safeTransfer(msg.sender, refundAmount);

        emit CancelledRoundRefundClaimed(contentId, roundId, msg.sender, refundAmount);
    }

    // =========================================================================
    // PULL-BASED CLAIMS (frontend fees, participation rewards)
    // =========================================================================

    /// @notice Frontend operator claims fees for a settled round. Pull-based, permissionless.
    function claimFrontendFee(uint256 contentId, uint256 roundId, address frontend) external {
        uint256 fee = IRoundRewardDistributor(rewardDistributor).claimFrontendFee(contentId, roundId, frontend);
        emit FrontendFeeClaimed(contentId, roundId, frontend, fee);
    }

    /// @notice Claim participation reward for a settled round. Pull-based.
    function claimParticipationReward(uint256 contentId, uint256 roundId) external {
        uint256 paidReward = IRoundRewardDistributor(rewardDistributor).claimParticipationRewardFor(
            msg.sender, contentId, roundId
        );
        emit ParticipationRewardClaimed(contentId, roundId, msg.sender, paidReward);
    }

    // =========================================================================
    // UNREVEALED VOTE PROCESSING
    // =========================================================================

    /// @notice Process unrevealed votes in batches after settlement. Permissionless.
    /// @dev For settled/tied rounds: unrevealed votes from past epochs are forfeited to treasury.
    ///      Current/future-epoch votes at settlement/tie time are refunded because they had no chance.
    ///      For reveal-failed rounds: all unrevealed votes are forfeited because the final reveal grace has passed.
    function processUnrevealedVotes(uint256 contentId, uint256 roundId, uint256 startIndex, uint256 count)
        external
        nonReentrant
        whenNotPaused
    {
        RoundLib.Round storage round = rounds[contentId][roundId];

        if (
            round.state != RoundLib.RoundState.Settled && round.state != RoundLib.RoundState.Tied
                && round.state != RoundLib.RoundState.RevealFailed
        ) {
            revert RoundNotSettledOrTied();
        }

        bytes32[] storage commitKeys = roundCommitHashes[contentId][roundId];
        uint256 len = commitKeys.length;
        if (startIndex >= len) revert IndexOutOfBounds();

        uint256 endIndex = (count == 0 || startIndex + count > len) ? len : startIndex + count;
        uint256 forfeitedCrep = 0;
        uint256 refundedCrep = 0;

        for (uint256 i = startIndex; i < endIndex; i++) {
            RoundLib.Commit storage commit = commits[contentId][roundId][commitKeys[i]];
            if (!commit.revealed && commit.stakeAmount > 0) {
                uint256 amount = commit.stakeAmount;
                commit.stakeAmount = 0;

                if (round.state == RoundLib.RoundState.RevealFailed || commit.revealableAfter <= round.settledAt) {
                    // Past epoch: ciphertext was decryptable but voter/keeper didn't reveal
                    forfeitedCrep += amount;
                } else {
                    // Current/future epoch: voter had no chance — refund
                    try this.transferTokenExternal(commit.voter, amount) {
                        refundedCrep += amount;
                    } catch {
                        forfeitedCrep += amount;
                    }
                }
            }
        }

        if (forfeitedCrep > 0) {
            if (treasury != address(0)) {
                try this.transferTokenExternal(treasury, forfeitedCrep) {
                    emit ForfeitedFundsAddedToTreasury(contentId, roundId, forfeitedCrep);
                } catch {
                    emit SettlementSideEffectFailed(contentId, roundId, REASON_FORFEITED_TRANSFER);
                }
            }
        }

        if (refundedCrep > 0) {
            emit CurrentEpochRefunded(contentId, roundId, refundedCrep);
        }

        if (forfeitedCrep == 0 && refundedCrep == 0) revert NothingProcessed();
        if (forfeitedCrep > 0 && !roundCleanupRewarded[contentId][roundId]) {
            roundCleanupRewarded[contentId][roundId] = true;
            _rewardKeeper(OP_PROCESS_UNREVEALED);
        }
    }

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    function _rewardKeeper(uint8 operation) internal {
        uint256 reward = keeperReward;
        if (reward == 0) return;
        if (keeperRewardPool >= reward) {
            keeperRewardPool -= reward;
            crepToken.safeTransfer(msg.sender, reward);
            emit KeeperRewarded(msg.sender, reward, operation);
        }
    }

    function _getRoundConfig(uint256 contentId, uint256 roundId) internal view returns (RoundLib.RoundConfig memory) {
        RoundLib.RoundConfig memory cfg = roundConfigSnapshot[contentId][roundId];
        if (cfg.epochDuration == 0) return config;
        return cfg;
    }

    function _getRoundRevealGracePeriod(uint256 contentId, uint256 roundId) internal view returns (uint256) {
        uint256 gracePeriod = roundRevealGracePeriodSnapshot[contentId][roundId];
        if (gracePeriod == 0) return revealGracePeriod;
        return gracePeriod;
    }

    function _buildCommitKey(address voter, bytes32 commitHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(voter, commitHash));
    }

    function _canFinalizeRevealFailedRound(uint256 contentId, uint256 roundId, RoundLib.Round storage round)
        internal
        view
        returns (bool)
    {
        if (round.state != RoundLib.RoundState.Open) return false;

        RoundLib.RoundConfig memory roundCfg = _getRoundConfig(contentId, roundId);
        if (round.voteCount < roundCfg.minVoters) return false;
        if (round.revealedCount >= roundCfg.minVoters) return false;

        uint256 lastRevealableAt = lastCommitRevealableAfter[contentId][roundId];
        if (lastRevealableAt == 0) return false;

        return block.timestamp >= lastRevealableAt + _getRoundRevealGracePeriod(contentId, roundId);
    }

    function _revealVoteInternal(
        uint256 contentId,
        uint256 roundId,
        bytes32 commitKey,
        bytes32 commitHash,
        bool isUp,
        bytes32 salt
    ) internal {
        RoundLib.Round storage round = rounds[contentId][roundId];

        if (round.state != RoundLib.RoundState.Open) revert RoundNotOpen();

        RoundLib.Commit storage commit = commits[contentId][roundId][commitKey];
        if (commit.voter == address(0)) revert NoCommit();
        if (commit.revealed) revert AlreadyRevealed();

        // Epoch must have ended — tlock ciphertext decryptable after this time
        if (block.timestamp < commit.revealableAfter) revert EpochNotEnded();

        // Verify commit hash
        bytes32 expectedHash = keccak256(abi.encodePacked(isUp, salt, contentId, keccak256(commit.ciphertext)));
        if (commitHash != expectedHash) revert HashMismatch();

        // Mark as revealed
        commit.revealed = true;
        commit.isUp = isUp;

        // Decrement unrevealed count for this epoch (selective revelation prevention)
        epochUnrevealedCount[contentId][roundId][commit.revealableAfter]--;

        // Increment revealed count
        round.revealedCount++;

        // Track which frontend this vote used
        voteFrontend[contentId][roundId][commit.voter] = commit.frontend;

        // Update raw pools (used for rating calculation and refund accounting)
        if (isUp) {
            round.upPool += commit.stakeAmount;
            round.upCount++;
        } else {
            round.downPool += commit.stakeAmount;
            round.downCount++;
        }

        // Update epoch-weighted pools (used for win condition and reward distribution)
        uint256 w = RoundLib.epochWeightBps(commit.epochIndex);
        uint256 effectiveStk = (commit.stakeAmount * w) / 10000;
        if (isUp) {
            round.weightedUpPool += effectiveStk;
        } else {
            round.weightedDownPool += effectiveStk;
        }

        // Track when settlement threshold is first reached
        RoundLib.RoundConfig memory roundCfg = _getRoundConfig(contentId, roundId);
        if (round.revealedCount >= roundCfg.minVoters && round.thresholdReachedAt == 0) {
            round.thresholdReachedAt = block.timestamp;
        }

        // Track voter for settlement iteration
        roundVoters[contentId][roundId].push(commit.voter);

        // Aggregate frontend fee data using commit-time eligibility, not reveal-time status.
        if (commit.frontend != address(0) && frontendEligibleAtCommit[contentId][roundId][commitKey]) {
            roundStakeWithApprovedFrontend[contentId][roundId] += commit.stakeAmount;
            if (roundPerFrontendStake[contentId][roundId][commit.frontend] == 0) {
                roundApprovedFrontendCount[contentId][roundId]++;
            }
            roundPerFrontendStake[contentId][roundId][commit.frontend] += commit.stakeAmount;
        }

        emit VoteRevealed(contentId, roundId, commit.voter, isUp);
    }

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

    function _checkSubmitterStake(uint256 contentId) internal {
        if (registry.isSubmitterStakeReturned(contentId)) return;

        uint256 contentCreatedAt = registry.getCreatedAt(contentId);
        uint256 elapsed = block.timestamp - contentCreatedAt;

        if (elapsed >= 24 hours) {
            uint256 rating = registry.getRating(contentId);
            if (rating < registry.SLASH_RATING_THRESHOLD()) {
                registry.slashSubmitterStake(contentId);
                return;
            }
        }

        if (elapsed >= 4 days) {
            registry.returnSubmitterStake(contentId);
        }
    }

    // =========================================================================
    // EXTERNAL WRAPPERS (for try-catch in settlement — onlySelf)
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

    function getRound(uint256 contentId, uint256 roundId) external view returns (RoundLib.Round memory) {
        return rounds[contentId][roundId];
    }

    function getActiveRoundId(uint256 contentId) external view returns (uint256) {
        uint256 roundId = currentRoundId[contentId];
        if (roundId == 0) return 0;
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (RoundLib.isTerminal(round)) return 0;
        return roundId;
    }

    /// @notice Get all commit keys for a round (used by keeper for batch reveal).
    function getRoundCommitHashes(uint256 contentId, uint256 roundId) external view returns (bytes32[] memory) {
        return roundCommitHashes[contentId][roundId];
    }

    function getRoundConfig(uint256 contentId, uint256 roundId) external view returns (RoundLib.RoundConfig memory) {
        return _getRoundConfig(contentId, roundId);
    }

    function getRoundVoterCount(uint256 contentId, uint256 roundId) external view returns (uint256) {
        return roundVoters[contentId][roundId].length;
    }

    function getRoundVoter(uint256 contentId, uint256 roundId, uint256 index) external view returns (address) {
        return roundVoters[contentId][roundId][index];
    }

    function getCommit(uint256 contentId, uint256 roundId, bytes32 commitKey)
        external
        view
        returns (RoundLib.Commit memory)
    {
        return commits[contentId][roundId][commitKey];
    }

    function getContentCommitCount(uint256 contentId) external view returns (uint256) {
        return contentCommitCount[contentId];
    }

    /// @notice Return the fee-claim snapshot needed by RewardDistributor.
    function getFrontendFeeSnapshot(uint256 contentId, uint256 roundId, address frontend)
        external
        view
        returns (
            uint256 totalFrontendPool,
            uint256 frontendStake,
            uint256 totalApprovedStake,
            uint256 totalFrontendClaimants
        )
    {
        return (
            roundFrontendPool[contentId][roundId],
            roundPerFrontendStake[contentId][roundId][frontend],
            roundStakeWithApprovedFrontend[contentId][roundId],
            roundApprovedFrontendCount[contentId][roundId]
        );
    }

    /// @notice Return the snapshotted participation reward pool and rate for a settled round.
    function getParticipationRewardSnapshot(uint256 contentId, uint256 roundId)
        external
        view
        returns (address rewardPoolAddress, uint256 rateBps)
    {
        rewardPoolAddress = roundParticipationPool[contentId][roundId];
        rateBps = roundParticipationRateBps[contentId][roundId];
    }

    function hasUnrevealedVotes(uint256 contentId) external view returns (bool) {
        uint256 roundId = currentRoundId[contentId];
        if (roundId == 0) return false;
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (RoundLib.isTerminal(round)) return false;
        return round.voteCount > round.revealedCount;
    }

    // Note: computeCurrentEpochEnd removed to fit size limit.
    // Use config().epochDuration + getRound().startTime to compute off-chain.

    // --- Admin ---

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) {}

    // =========================================================================
    // POST-UPGRADE STORAGE — UUPS LAYOUT COMPATIBILITY
    // =========================================================================
    // AUDIT NOTE (I-6): These variables were appended after the initial deployment to support
    // new features (sybil resistance, streak rewards). They MUST remain at the end of the
    // contract storage and MUST NOT be reordered or moved above the __gap. The __gap size
    // was reduced accordingly to preserve total slot count.

    // One vote per identity per round
    mapping(uint256 => mapping(uint256 => mapping(uint256 => bool))) public hasTokenIdCommitted;

    // --- Deprecated streak tracking ---
    // Preserved as inert storage slots for upgrade safety. The product streak UI is indexed off VoteCommitted events.
    mapping(address => uint256) internal __deprecated_voterLastActiveDay;
    mapping(address => uint256) internal __deprecated_voterCurrentStreak;
    mapping(address => uint256) internal __deprecated_voterLastMilestoneDay;

    // Per-identity cooldown: contentId => tokenId => timestamp (prevents cooldown bypass via delegation)
    mapping(uint256 => mapping(uint256 => uint256)) public lastVoteTimestampByToken;

    // Per-epoch unrevealed commit counter: prevents selective vote revelation (front-running keeper).
    // contentId => roundId => epochEnd => number of unrevealed commits for that epoch.
    mapping(uint256 => mapping(uint256 => mapping(uint256 => uint256))) public epochUnrevealedCount;

    // Minimum time after epoch end during which all past-epoch votes must be revealed before settlement.
    // After this period, unrevealed votes no longer block settlement (forfeited post-settlement).
    uint256 public revealGracePeriod;

    // Per-round reveal grace period snapshot for governance consistency across open rounds.
    mapping(uint256 => mapping(uint256 => uint256)) public roundRevealGracePeriodSnapshot;

    // Latest revealableAfter timestamp among all commits in a round.
    mapping(uint256 => mapping(uint256 => uint256)) public lastCommitRevealableAfter;

    // Commit-time frontend approval snapshot to prevent retroactive fee eligibility changes.
    mapping(uint256 => mapping(uint256 => mapping(bytes32 => bool))) public frontendEligibleAtCommit;

    // Keeper cleanup rewards can only be paid once per round, and only when actual forfeitures occur.
    mapping(uint256 => mapping(uint256 => bool)) public roundCleanupRewarded;

    // --- Storage Gap for UUPS Upgradeability ---
    uint256[14] private __gap;
}
