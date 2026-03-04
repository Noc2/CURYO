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
/// @notice Per-content round-based parimutuel voting with tlock commit-reveal and epoch-weighted rewards.
/// @dev Flow: commitVote (tlock-encrypted to epoch end) → epoch ends → revealVote (anyone decrypts via drand) → settleRound (≥3 votes).
///      Rounds accumulate votes across 1-hour epochs. After each epoch, tlock ciphertexts
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
    error SettlementDelayNotElapsed();
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

    // --- Events ---
    event VoteCommitted(
        uint256 indexed contentId, uint256 indexed roundId, address indexed voter, bytes32 commitHash, uint256 stake
    );
    event VoteRevealed(uint256 indexed contentId, uint256 indexed roundId, address indexed voter, bool isUp);
    event RoundSettled(uint256 indexed contentId, uint256 indexed roundId, bool upWins, uint256 losingPool);
    event RoundCancelled(uint256 indexed contentId, uint256 indexed roundId);
    event RoundTied(uint256 indexed contentId, uint256 indexed roundId);
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
    event SettlementSideEffectFailed(uint256 indexed contentId, uint256 indexed roundId, string reason);
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

    function initialize(address _admin, address _governance, address _crepToken, address _registry)
        public
        initializer
    {
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

        // Default config: 1-hour epochs, 7-day max, 3 min voters
        config = RoundLib.RoundConfig({ epochDuration: 1 hours, maxDuration: 7 days, minVoters: 3, maxVoters: 1000 });
    }

    // =========================================================================
    // CONFIGURATION
    // =========================================================================

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

    /// @notice Fund the consensus subsidy reserve.
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

    // =========================================================================
    // COMMIT PHASE
    // =========================================================================

    /// @notice Commit a blind vote on content. Direction is hidden via tlock encryption.
    /// @param contentId The content being voted on.
    /// @param commitHash keccak256(abi.encodePacked(isUp, salt, contentId)).
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
        try IERC20Permit(address(crepToken)).permit(msg.sender, address(this), stakeAmount, deadline, v, r, s) { }
            catch { }
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

        // Time-based cooldown (24 hours)
        uint256 lastVote = lastVoteTimestamp[contentId][msg.sender];
        if (lastVote > 0) {
            if (block.timestamp < lastVote + VOTE_COOLDOWN) revert CooldownActive();
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

        // Track for iteration
        roundCommitHashes[contentId][roundId].push(commitKey);
        hasCommitted[contentId][roundId][msg.sender] = true;
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

        // Record cooldown
        lastVoteTimestamp[contentId][msg.sender] = block.timestamp;

        emit VoteCommitted(contentId, roundId, msg.sender, commitHash, stakeAmount);
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
        rounds[contentId][roundId].state = RoundLib.RoundState.Open;

        // Snapshot config at round creation to prevent mid-round governance changes
        roundConfigSnapshot[contentId][roundId] = config;

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
        // Cannot cancel if settlement threshold was reached
        if (round.thresholdReachedAt != 0) revert ThresholdReached();

        round.state = RoundLib.RoundState.Cancelled;

        emit RoundCancelled(contentId, roundId);
        _rewardKeeper("cancel");
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

        // Settlement delay: wait one epoch after threshold to let current-epoch votes be revealed
        if (block.timestamp < round.thresholdReachedAt + roundCfg.epochDuration) revert SettlementDelayNotElapsed();

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

        // Raw losing pool — redistributed to winners, protocol, treasury, reserve
        uint256 losingPool = upWins ? round.downPool : round.upPool;

        if (losingPool > 0) {
            (
                uint256 voterShare,
                uint256 submitterShare,
                uint256 platformShare,
                uint256 treasuryShare,
                uint256 consensusShare
            ) = RewardMath.splitPool(losingPool);

            // Store voter pool and weighted winning stake (used for proportional reward claims)
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
        try registry.updateRatingDirect(contentId, newRating) { }
        catch {
            emit SettlementSideEffectFailed(contentId, roundId, "updateRating");
        }

        try registry.updateActivity(contentId) { }
        catch {
            emit SettlementSideEffectFailed(contentId, roundId, "updateActivity");
        }

        // Snapshot participation rate for pull-based claiming
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
        _rewardKeeper("settle");
    }

    // =========================================================================
    // REFUNDS (cancelled/tied rounds)
    // =========================================================================

    /// @notice Claim refund for a cancelled or tied round. Pull-based.
    function claimCancelledRoundRefund(uint256 contentId, uint256 roundId) external nonReentrant {
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (round.state != RoundLib.RoundState.Cancelled && round.state != RoundLib.RoundState.Tied) {
            revert RoundNotCancelledOrTied();
        }
        if (cancelledRoundRefundClaimed[contentId][roundId][msg.sender]) revert AlreadyClaimed();

        bytes32 commitHash = voterCommitHash[contentId][roundId][msg.sender];
        if (commitHash == bytes32(0)) revert NoCommit();
        bytes32 commitKey = _buildCommitKey(msg.sender, commitHash);

        RoundLib.Commit storage commit = commits[contentId][roundId][commitKey];
        if (commit.stakeAmount == 0) revert NoStake();

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

        bytes32 commitHash = voterCommitHash[contentId][roundId][msg.sender];
        if (commitHash == bytes32(0)) revert NoCommit();
        bytes32 commitKey = _buildCommitKey(msg.sender, commitHash);

        RoundLib.Commit storage commit = commits[contentId][roundId][commitKey];
        if (!commit.revealed) revert VoteNotRevealed();
        if (commit.stakeAmount == 0) revert NoStake();

        uint256 rateBps = roundParticipationRateBps[contentId][roundId];
        if (rateBps == 0) revert NoParticipationRate();

        uint256 reward = commit.stakeAmount * rateBps / 10000;
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
    // UNREVEALED VOTE PROCESSING
    // =========================================================================

    /// @notice Process unrevealed votes in batches after settlement. Permissionless.
    /// @dev For settled/tied rounds: unrevealed votes from past epochs (revealableAfter < settledAt)
    ///      are forfeited to treasury. Unrevealed votes from the current/future epoch at settlement
    ///      time are refunded to voters since they had no chance to be revealed.
    function processUnrevealedVotes(uint256 contentId, uint256 roundId, uint256 startIndex, uint256 count)
        external
        nonReentrant
        whenNotPaused
    {
        RoundLib.Round storage round = rounds[contentId][roundId];

        if (round.state != RoundLib.RoundState.Settled && round.state != RoundLib.RoundState.Tied) {
            revert RoundNotSettledOrTied();
        }

        bytes32[] storage commitKeys = roundCommitHashes[contentId][roundId];
        uint256 len = commitKeys.length;
        if (startIndex > len) revert IndexOutOfBounds();

        uint256 endIndex = (count == 0 || startIndex + count > len) ? len : startIndex + count;
        uint256 forfeitedCrep = 0;
        uint256 refundedCrep = 0;

        for (uint256 i = startIndex; i < endIndex; i++) {
            RoundLib.Commit storage commit = commits[contentId][roundId][commitKeys[i]];
            if (!commit.revealed && commit.stakeAmount > 0) {
                uint256 amount = commit.stakeAmount;
                commit.stakeAmount = 0;

                if (round.state == RoundLib.RoundState.Tied) {
                    try this.transferTokenExternal(commit.voter, amount) {
                        refundedCrep += amount;
                    } catch {
                        forfeitedCrep += amount;
                    }
                } else if (commit.revealableAfter <= round.settledAt) {
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
                    emit SettlementSideEffectFailed(contentId, roundId, "forfeitedFundsTransfer");
                }
            }
        }

        if (refundedCrep > 0) {
            emit CurrentEpochRefunded(contentId, roundId, refundedCrep);
        }

        _rewardKeeper("processUnrevealed");
    }

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    function _rewardKeeper(string memory operation) internal {
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

    function _buildCommitKey(address voter, bytes32 commitHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(voter, commitHash));
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
        bytes32 expectedHash = keccak256(abi.encodePacked(isUp, salt, contentId));
        if (commitHash != expectedHash) revert HashMismatch();

        // Mark as revealed
        commit.revealed = true;
        commit.isUp = isUp;

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

        // Aggregate frontend fee data for O(1) settlement
        if (commit.frontend != address(0) && address(frontendRegistry) != address(0)) {
            try frontendRegistry.isApproved(commit.frontend) returns (bool approved) {
                if (approved) {
                    roundStakeWithApprovedFrontend[contentId][roundId] += commit.stakeAmount;
                    if (roundPerFrontendStake[contentId][roundId][commit.frontend] == 0) {
                        roundApprovedFrontendCount[contentId][roundId]++;
                    }
                    roundPerFrontendStake[contentId][roundId][commit.frontend] += commit.stakeAmount;
                }
            } catch {
                // Frontend registry call failed — treat as not approved
            }
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

    function getRoundCommitCount(uint256 contentId, uint256 roundId) external view returns (uint256) {
        return roundCommitHashes[contentId][roundId].length;
    }

    function getRoundCommitHash(uint256 contentId, uint256 roundId, uint256 index) external view returns (bytes32) {
        return roundCommitHashes[contentId][roundId][index];
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

    function getVoterCommitHash(uint256 contentId, uint256 roundId, address voter) external view returns (bytes32) {
        return voterCommitHash[contentId][roundId][voter];
    }

    function getContentCommitCount(uint256 contentId) external view returns (uint256) {
        return contentCommitCount[contentId];
    }

    function getRoundFrontendPool(uint256 contentId, uint256 roundId) external view returns (uint256) {
        return roundFrontendPool[contentId][roundId];
    }

    function getRoundPerFrontendStake(uint256 contentId, uint256 roundId, address frontend)
        external
        view
        returns (uint256)
    {
        return roundPerFrontendStake[contentId][roundId][frontend];
    }

    function getRoundStakeWithApprovedFrontend(uint256 contentId, uint256 roundId) external view returns (uint256) {
        return roundStakeWithApprovedFrontend[contentId][roundId];
    }

    function isFrontendFeeClaimed(uint256 contentId, uint256 roundId, address frontend) external view returns (bool) {
        return frontendFeeClaimed[contentId][roundId][frontend];
    }

    function isParticipationRewardClaimed(uint256 contentId, uint256 roundId, address voter)
        external
        view
        returns (bool)
    {
        return participationRewardClaimed[contentId][roundId][voter];
    }

    function getRoundParticipationRateBps(uint256 contentId, uint256 roundId) external view returns (uint256) {
        return roundParticipationRateBps[contentId][roundId];
    }

    function hasUnrevealedVotes(uint256 contentId) external view returns (bool) {
        uint256 roundId = currentRoundId[contentId];
        if (roundId == 0) return false;
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (RoundLib.isTerminal(round)) return false;
        return round.voteCount > round.revealedCount;
    }

    /// @notice Compute the end timestamp of the current epoch for a content's active round.
    /// @dev Used by the frontend to generate tlock ciphertext targeting the correct epoch.
    function computeCurrentEpochEnd(uint256 contentId) external view returns (uint256) {
        uint256 roundId = currentRoundId[contentId];
        if (roundId == 0) {
            // No active round: estimate from now (first commit will create round)
            return block.timestamp + config.epochDuration;
        }
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (RoundLib.isTerminal(round)) {
            return block.timestamp + config.epochDuration;
        }
        return RoundLib.computeEpochEnd(round, config.epochDuration, block.timestamp);
    }

    // --- Admin ---

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) { }

    // One vote per identity per round
    mapping(uint256 => mapping(uint256 => mapping(uint256 => bool))) public hasTokenIdCommitted;

    // --- Storage Gap for UUPS Upgradeability ---
    uint256[25] private __gap;
}
