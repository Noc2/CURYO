// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { ICategoryRegistry } from "./interfaces/ICategoryRegistry.sol";
import { IRoundVotingEngine } from "./interfaces/IRoundVotingEngine.sol";
import { IVoterIdNFT } from "./interfaces/IVoterIdNFT.sol";
import { IParticipationPool } from "./interfaces/IParticipationPool.sol";
import { RoundLib } from "./libraries/RoundLib.sol";
import { RatingLib } from "./libraries/RatingLib.sol";
import { RatingMath } from "./libraries/RatingMath.sol";
import { ProtocolConfig } from "./ProtocolConfig.sol";
import { SubmissionMediaValidator } from "./SubmissionMediaValidator.sol";

/// @title ContentRegistry
/// @notice Manages content lifecycle: submission → active → dormant → revived / cancelled.
/// @dev Stores only a metadata hash on-chain; full URL/question/description are emitted in events.
contract ContentRegistry is Initializable, AccessControlUpgradeable, PausableUpgradeable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    // --- Access Control Roles ---
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant CONFIG_ROLE = keccak256("CONFIG_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");
    bytes32 public constant TREASURY_ADMIN_ROLE = keccak256("TREASURY_ADMIN_ROLE");

    // --- Constants ---
    uint256 public constant MIN_SUBMITTER_STAKE = 10e6; // 10 cREP (6 decimals)
    uint256 public constant REVIVAL_STAKE = 5e6; // 5 cREP (6 decimals)
    uint256 public constant CANCELLATION_FEE = 1e6; // 1 cREP (prevents submit-cancel spam)
    uint256 public constant DORMANCY_PERIOD = 30 days;
    uint256 public constant SUBMISSION_RESERVATION_PERIOD = 30 minutes;
    uint256 public constant RESERVED_SUBMISSION_MIN_AGE = 1 seconds;
    uint256 public constant DORMANT_EXCLUSIVE_REVIVAL_PERIOD = 1 days;
    uint8 public constant MAX_REVIVALS = 2;

    // Submitter stake rules
    uint256 public constant SLASH_RATING_THRESHOLD = 25; // Rating below this triggers slash
    uint16 public constant DEFAULT_SLASH_THRESHOLD_BPS = 2500;
    uint16 public constant DEFAULT_MIN_SLASH_SETTLED_ROUNDS = 2;
    uint48 public constant DEFAULT_MIN_SLASH_LOW_DURATION = 7 days;
    uint256 public constant DEFAULT_MIN_SLASH_EVIDENCE = 200e6;
    uint256 public constant DEFAULT_CONFIDENCE_MASS_INITIAL = 80e6;

    // String length limits (prevent storage bloat)
    uint256 public constant MAX_URL_LENGTH = 2048;
    uint256 public constant MAX_QUESTION_LENGTH = 120;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 280;
    uint256 public constant MAX_TAGS_LENGTH = 256;
    uint256 public constant MAX_IMAGE_URLS = 4;

    // --- Enums ---
    enum ContentStatus {
        Active,
        Dormant,
        Cancelled
    }

    // --- Structs ---
    struct Content {
        uint64 id;
        bytes32 contentHash;
        address submitter;
        uint64 submitterStake;
        uint48 createdAt;
        uint48 lastActivityAt;
        ContentStatus status;
        uint8 dormantCount;
        address reviver;
        bool submitterStakeReturned;
        uint8 rating; // 0-100, starts at 50
        uint64 categoryId; // Reference to seeded discovery category
    }

    struct PendingSubmission {
        address submitter;
        address submitterIdentity;
        uint64 reservedStake;
        uint48 reservedAt;
        uint48 expiresAt;
    }

    struct SubmissionMetadata {
        string url;
        string title;
        string description;
        string tags;
        uint256 categoryId;
    }

    // --- State ---
    IERC20 public crepToken;
    address public votingEngine;
    ICategoryRegistry public categoryRegistry;
    address public bonusPool; // Cancellation fee sink (anti-spam), typically the treasury
    address public treasury; // Receives 100% of slashed stakes (governance timelock)
    uint256 public nextContentId;
    mapping(uint256 => Content) public contents;
    mapping(bytes32 => bool) public submissionKeyUsed; // Canonical submission keys prevent duplicate content variants
    IVoterIdNFT public voterIdNFT; // Voter ID NFT for sybil resistance

    /// @notice Participation pool for rewarding submitters
    IParticipationPool public participationPool;

    /// @notice Snapshotted submitter participation reward entitlement per content.
    mapping(uint256 => uint256) public submitterParticipationRewardOwed;

    /// @notice Amount of the snapshotted submitter participation reward already paid.
    mapping(uint256 => uint256) public submitterParticipationRewardPaid;

    /// @notice Amount of the snapshotted reward that was durably reserved for this content's future claim.
    mapping(uint256 => uint256) public submitterParticipationRewardReserved;

    /// @notice Participation pool snapshot used to pay submitter participation rewards.
    mapping(uint256 => address) public submitterParticipationRewardPool;

    /// @notice Canonical submission key per content ID (for releasing/reserving uniqueness on status changes)
    mapping(uint256 => bytes32) internal contentSubmissionKey;

    /// @notice Canonical submitter identity snapshot (holder address if submitted through a delegate).
    mapping(uint256 => address) internal contentSubmitterIdentity;

    /// @notice Meaningful-activity anchor used for dormancy checks.
    /// @dev Vote commits still update `lastActivityAt` for UI/analytics, but only submission, revival,
    ///      and milestone-0 settlement move the dormancy window forward.
    mapping(uint256 => uint256) internal dormancyAnchorAt;

    /// @notice ProtocolConfig used for governance-tunable rating and slash parameters.
    ProtocolConfig public protocolConfig;

    /// @notice Hidden, time-bounded reservations for future content reveals.
    mapping(bytes32 => PendingSubmission) public pendingSubmissions;

    /// @notice Timestamp after which a dormant content key may be publicly released for replacement.
    mapping(uint256 => uint256) public dormantKeyReleasableAt;

    /// @notice Snapshotted participation reward rate captured at the latest successful settlement.
    mapping(uint256 => uint256) public submitterParticipationSnapshotRateBps;

    /// @notice Snapshotted participation pool captured at the latest successful settlement.
    mapping(uint256 => address) public submitterParticipationSnapshotPool;

    /// @notice Whether milestone-0 submitter resolution terms have been frozen for this content.
    mapping(uint256 => bool) public milestoneZeroSubmitterTermsSnapshotted;

    /// @notice Rich rating state used by the score-relative rating system.
    mapping(uint256 => RatingLib.RatingState) public ratingState;

    /// @notice Slash policy frozen at content creation so governance cannot retroactively rewrite stake terms.
    mapping(uint256 => RatingLib.SlashConfig) public contentSlashConfigSnapshot;

    /// @notice Frozen rating from the first settled round (milestone 0).
    mapping(uint256 => uint8) public milestoneZeroSubmitterRating;

    /// @notice Frozen participation reward rate from the first settled round (milestone 0).
    mapping(uint256 => uint256) public milestoneZeroSubmitterParticipationRateBps;

    /// @notice Frozen participation reward pool from the first settled round (milestone 0).
    mapping(uint256 => address) public milestoneZeroSubmitterParticipationPool;

    SubmissionMediaValidator internal immutable SUBMISSION_MEDIA_VALIDATOR;

    /// @dev Reserved storage gap for future upgrades
    uint256[36] private __gap;

    // --- Events ---
    event ContentSubmitted(
        uint256 indexed contentId,
        address indexed submitter,
        bytes32 contentHash,
        string url,
        string title,
        string description,
        string tags,
        uint256 indexed categoryId
    );
    event ContentMediaSubmitted(uint256 indexed contentId, string[] imageUrls, string videoUrl);
    event ContentCancelled(uint256 indexed contentId);
    event SubmissionReserved(address indexed submitter, bytes32 indexed revealCommitment, uint256 expiresAt);
    event SubmissionReservationCancelled(address indexed submitter, bytes32 indexed revealCommitment, uint256 refund);
    event SubmissionReservationExpired(address indexed submitter, bytes32 indexed revealCommitment, uint256 refund);
    event ContentDormant(uint256 indexed contentId);
    event DormantSubmissionKeyReleased(uint256 indexed contentId, bytes32 indexed submissionKey);
    event ContentRevived(uint256 indexed contentId, address indexed reviver);
    event SubmitterStakeReturned(uint256 indexed contentId, uint256 amount);
    event SubmitterStakeSlashed(uint256 indexed contentId, uint256 slashedAmount);
    event SubmitterParticipationRewardAccrued(
        uint256 indexed contentId, address indexed submitter, address indexed rewardPool, uint256 amount
    );
    event SubmitterParticipationRewardClaimed(uint256 indexed contentId, address indexed submitter, uint256 amount);
    event SubmitterParticipationReservationFailed(uint256 indexed contentId, address rewardPool, uint256 amount);
    event MilestoneZeroSubmitterParticipationRepairNeeded(uint256 indexed contentId, address indexed rewardPool);
    event MilestoneZeroSubmitterParticipationTermsRepaired(
        uint256 indexed contentId, address indexed rewardPool, uint256 rewardRateBps, uint256 rewardAmount
    );
    event RatingUpdated(uint256 indexed contentId, uint256 oldRating, uint256 newRating);
    event RatingStateUpdated(
        uint256 indexed contentId,
        uint256 indexed roundId,
        uint16 referenceRatingBps,
        uint16 oldRatingBps,
        uint16 newRatingBps,
        uint16 conservativeRatingBps,
        uint256 confidenceMass,
        uint256 effectiveEvidence,
        uint32 settledRounds
    );
    event VoterIdNFTUpdated(address voterIdNFT);
    event ProtocolConfigUpdated(address protocolConfig);

    /// @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
    constructor() {
        SUBMISSION_MEDIA_VALIDATOR = new SubmissionMediaValidator();
        _disableInitializers();
    }

    function initialize(address _admin, address _governance, address _crepToken) public initializer {
        _initialize(_admin, _governance, _governance, _crepToken);
    }

    function initializeWithTreasury(address _admin, address _governance, address _treasuryAuthority, address _crepToken)
        public
        initializer
    {
        _initialize(_admin, _governance, _treasuryAuthority, _crepToken);
    }

    function _initialize(address _admin, address _governance, address _treasuryAuthority, address _crepToken) internal {
        __AccessControl_init();
        __Pausable_init();

        require(_admin != address(0), "Invalid admin");
        require(_governance != address(0), "Invalid governance");
        require(_treasuryAuthority != address(0), "Invalid treasury authority");
        require(_crepToken != address(0), "Invalid cREP token");

        // Governance gets all permanent roles
        _grantRole(DEFAULT_ADMIN_ROLE, _governance);
        _grantRole(ADMIN_ROLE, _governance);
        _grantRole(CONFIG_ROLE, _governance);
        _grantRole(PAUSER_ROLE, _governance);
        _setRoleAdmin(TREASURY_ROLE, TREASURY_ADMIN_ROLE);
        _setRoleAdmin(TREASURY_ADMIN_ROLE, TREASURY_ADMIN_ROLE);
        _grantRole(TREASURY_ADMIN_ROLE, _treasuryAuthority);
        _grantRole(TREASURY_ROLE, _treasuryAuthority);

        // Admin gets only CONFIG_ROLE for initial cross-contract wiring
        if (_admin != _governance) {
            _grantRole(CONFIG_ROLE, _admin);
        }

        crepToken = IERC20(_crepToken);
        nextContentId = 1;
        treasury = _treasuryAuthority;
        bonusPool = _treasuryAuthority;
    }

    /// @notice Set the VotingEngine address (can only be called by CONFIG_ROLE).
    function setVotingEngine(address _votingEngine) external onlyRole(CONFIG_ROLE) {
        require(_votingEngine != address(0), "Invalid address");
        votingEngine = _votingEngine;
    }

    /// @notice Set the CategoryRegistry address (can only be called by CONFIG_ROLE).
    function setCategoryRegistry(address _categoryRegistry) external onlyRole(CONFIG_ROLE) {
        require(_categoryRegistry != address(0), "Invalid address");
        categoryRegistry = ICategoryRegistry(_categoryRegistry);
    }

    function setProtocolConfig(address _protocolConfig) external onlyRole(CONFIG_ROLE) {
        require(_protocolConfig != address(0), "Invalid address");
        protocolConfig = ProtocolConfig(_protocolConfig);
        emit ProtocolConfigUpdated(_protocolConfig);
    }

    /// @notice Set the Voter ID NFT contract for sybil resistance
    /// @param _voterIdNFT The Voter ID NFT contract address
    function setVoterIdNFT(address _voterIdNFT) external onlyRole(CONFIG_ROLE) {
        require(_voterIdNFT != address(0), "Invalid address");
        voterIdNFT = IVoterIdNFT(_voterIdNFT);
        emit VoterIdNFTUpdated(_voterIdNFT);
    }

    /// @notice Set or update the participation pool contract
    /// @param _participationPool Address of the ParticipationPool contract
    function setParticipationPool(address _participationPool) external onlyRole(CONFIG_ROLE) {
        require(_participationPool != address(0), "Invalid address");
        participationPool = IParticipationPool(_participationPool);
    }

    /// @notice Set the cancellation fee sink address (can only be called by TREASURY_ROLE).
    function setBonusPool(address _bonusPool) external onlyRole(TREASURY_ROLE) {
        require(_bonusPool != address(0), "Invalid address");
        bonusPool = _bonusPool;
    }

    /// @notice Set the treasury address that receives slashed stakes (can only be called by TREASURY_ROLE).
    function setTreasury(address _treasury) external onlyRole(TREASURY_ROLE) {
        require(_treasury != address(0), "Invalid address");
        treasury = _treasury;
    }

    // --- Content Lifecycle ---

    /// @notice Reserve a hidden submission commitment before revealing the public content metadata.
    /// @param revealCommitment Keccak-256 hash of the future submission reveal payload.
    function reserveSubmission(bytes32 revealCommitment) external nonReentrant whenNotPaused {
        // Require Voter ID if VoterIdNFT is configured
        if (address(voterIdNFT) != address(0)) {
            require(voterIdNFT.hasVoterId(msg.sender), "Voter ID required");
        }

        require(revealCommitment != bytes32(0), "Invalid commitment");
        PendingSubmission storage pending = pendingSubmissions[revealCommitment];
        require(pending.submitter == address(0), "Reservation exists");

        crepToken.safeTransferFrom(msg.sender, address(this), MIN_SUBMITTER_STAKE);

        pendingSubmissions[revealCommitment] = PendingSubmission({
            submitter: msg.sender,
            submitterIdentity: _resolveSubmitterIdentity(msg.sender),
            reservedStake: MIN_SUBMITTER_STAKE.toUint64(),
            reservedAt: block.timestamp.toUint48(),
            expiresAt: (block.timestamp + SUBMISSION_RESERVATION_PERIOD).toUint48()
        });

        emit SubmissionReserved(msg.sender, revealCommitment, block.timestamp + SUBMISSION_RESERVATION_PERIOD);
    }

    function cancelReservedSubmission(bytes32 revealCommitment) external nonReentrant whenNotPaused {
        PendingSubmission memory pending = pendingSubmissions[revealCommitment];
        require(pending.submitter == msg.sender, "Not submitter");
        delete pendingSubmissions[revealCommitment];

        uint256 refund = _refundReservedSubmission(pending, msg.sender);
        emit SubmissionReservationCancelled(msg.sender, revealCommitment, refund);
    }

    function clearExpiredReservedSubmission(bytes32 revealCommitment) external nonReentrant whenNotPaused {
        PendingSubmission memory pending = pendingSubmissions[revealCommitment];
        require(pending.submitter != address(0), "Reservation not found");
        require(block.timestamp > pending.expiresAt, "Reservation active");
        delete pendingSubmissions[revealCommitment];

        uint256 refund = _refundReservedSubmission(pending, pending.submitter);
        emit SubmissionReservationExpired(pending.submitter, revealCommitment, refund);
    }

    function submitQuestionWithMedia(
        string[] calldata imageUrls,
        string calldata videoUrl,
        string calldata title,
        string calldata description,
        string calldata tags,
        uint256 categoryId,
        bytes32 salt
    ) external nonReentrant whenNotPaused returns (uint256) {
        // Require Voter ID if VoterIdNFT is configured
        if (address(voterIdNFT) != address(0)) {
            require(voterIdNFT.hasVoterId(msg.sender), "Voter ID required");
        }

        SUBMISSION_MEDIA_VALIDATOR.validateMediaSet(imageUrls, videoUrl);
        SubmissionMetadata memory metadata = SubmissionMetadata({
            url: bytes(videoUrl).length != 0 ? videoUrl : imageUrls[0],
            title: title,
            description: description,
            tags: tags,
            categoryId: categoryId
        });
        _validateTextFields(metadata);

        require(address(categoryRegistry) != address(0), "CategoryRegistry not set");
        return _submitValidatedQuestionWithMedia(metadata, imageUrls, videoUrl, salt);
    }

    /// @notice Cancel content before any votes. Returns submitter stake in cREP.
    /// @dev Only callable by the submitter. VotingEngine must confirm 0 votes.
    function cancelContent(uint256 contentId) external nonReentrant whenNotPaused {
        require(bonusPool != address(0), "Bonus pool not set");
        Content storage c = contents[contentId];
        require(c.submitter == msg.sender, "Not submitter");
        require(c.status == ContentStatus.Active, "Not active");
        if (votingEngine != address(0)) {
            require(!IRoundVotingEngine(votingEngine).hasCommits(contentId), "Content has votes");
        }

        c.status = ContentStatus.Cancelled;

        // Release the canonical submission key so the content can be resubmitted.
        bytes32 submissionKey = contentSubmissionKey[contentId];
        if (submissionKey != bytes32(0)) {
            submissionKeyUsed[submissionKey] = false;
        }

        // Return stake minus cancellation fee (fee goes to the configured anti-spam sink)
        if (!c.submitterStakeReturned) {
            c.submitterStakeReturned = true;
            uint256 fee = c.submitterStake >= CANCELLATION_FEE ? CANCELLATION_FEE : c.submitterStake;
            uint256 refund = c.submitterStake - fee;
            if (fee > 0 && bonusPool != address(0)) {
                crepToken.safeTransfer(bonusPool, fee);
            }
            if (refund > 0) {
                crepToken.safeTransfer(msg.sender, refund);
            }
        }

        emit ContentCancelled(contentId);
    }

    function _validateTextFields(SubmissionMetadata memory metadata) internal pure {
        require(bytes(metadata.title).length > 0, "Question required");
        require(bytes(metadata.title).length <= MAX_QUESTION_LENGTH, "Question too long");
        require(bytes(metadata.description).length > 0, "Description required");
        require(bytes(metadata.description).length <= MAX_DESCRIPTION_LENGTH, "Description too long");
        require(bytes(metadata.tags).length > 0, "Tags required");
        require(bytes(metadata.tags).length <= MAX_TAGS_LENGTH, "Tags too long");
    }

    function _submitValidatedQuestionWithMedia(
        SubmissionMetadata memory metadata,
        string[] calldata imageUrls,
        string calldata videoUrl,
        bytes32 salt
    ) internal returns (uint256 contentId) {
        (uint256 resolvedCategoryId, bytes32 submissionKey, PendingSubmission memory pending) =
            _prepareQuestionMediaSubmission(metadata, imageUrls, videoUrl, salt);
        bytes32 contentHash = keccak256(
            abi.encode(
                "curyo-question-media-v1",
                imageUrls,
                videoUrl,
                metadata.title,
                metadata.description,
                metadata.tags,
                resolvedCategoryId
            )
        );
        contentId = _storeSubmittedContent(submissionKey, pending, contentHash, resolvedCategoryId);
        emit ContentSubmitted(
            contentId,
            msg.sender,
            contentHash,
            metadata.url,
            metadata.title,
            metadata.description,
            metadata.tags,
            resolvedCategoryId
        );
        emit ContentMediaSubmitted(contentId, imageUrls, videoUrl);
    }

    function _prepareQuestionMediaSubmission(
        SubmissionMetadata memory metadata,
        string[] calldata imageUrls,
        string calldata videoUrl,
        bytes32 salt
    ) internal returns (uint256 resolvedCategoryId, bytes32 submissionKey, PendingSubmission memory pending) {
        resolvedCategoryId = _resolveQuestionSubmissionCategory(metadata);
        submissionKey = _deriveQuestionMediaSubmissionKey(metadata, imageUrls, videoUrl, resolvedCategoryId);
        require(!submissionKeyUsed[submissionKey], "Question already submitted");

        bytes32 revealCommitment = _computeRevealCommitment(
            submissionKey, metadata.title, metadata.description, metadata.tags, metadata.categoryId, salt, msg.sender
        );
        pending = pendingSubmissions[revealCommitment];
        require(pending.submitter == msg.sender, "Reservation not found");
        require(block.timestamp <= pending.expiresAt, "Reservation expired");
        require(block.timestamp >= pending.reservedAt + RESERVED_SUBMISSION_MIN_AGE, "Reservation too new");
        require(_resolveSubmitterIdentity(msg.sender) == pending.submitterIdentity, "Submitter identity changed");

        delete pendingSubmissions[revealCommitment];
        submissionKeyUsed[submissionKey] = true;
    }

    function _resolveQuestionSubmissionCategory(SubmissionMetadata memory metadata)
        internal
        view
        returns (uint256 resolvedCategoryId)
    {
        require(metadata.categoryId != 0, "Category required");
        require(categoryRegistry.isApprovedCategory(metadata.categoryId), "Category not registered");
        return metadata.categoryId;
    }

    function _deriveQuestionMediaSubmissionKey(
        SubmissionMetadata memory metadata,
        string[] calldata imageUrls,
        string calldata videoUrl,
        uint256 resolvedCategoryId
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                "curyo-question-media-v1",
                resolvedCategoryId,
                imageUrls,
                videoUrl,
                metadata.title,
                metadata.description,
                metadata.tags
            )
        );
    }

    function _storeSubmittedContent(
        bytes32 submissionKey,
        PendingSubmission memory pending,
        bytes32 contentHash,
        uint256 resolvedCategoryId
    ) internal returns (uint256 contentId) {
        contentId = nextContentId++;
        contentSubmissionKey[contentId] = submissionKey;
        contentSubmitterIdentity[contentId] = pending.submitterIdentity;
        contents[contentId] = Content({
            id: contentId.toUint64(),
            contentHash: contentHash,
            submitter: msg.sender,
            submitterStake: pending.reservedStake,
            createdAt: block.timestamp.toUint48(),
            lastActivityAt: block.timestamp.toUint48(),
            status: ContentStatus.Active,
            dormantCount: 0,
            reviver: address(0),
            submitterStakeReturned: false,
            rating: 50,
            categoryId: resolvedCategoryId.toUint64()
        });
        ratingState[contentId] = RatingLib.RatingState({
            ratingLogitX18: int128(RatingLib.DEFAULT_RATING_LOGIT_X18),
            confidenceMass: uint128(_getInitialConfidenceMass()),
            effectiveEvidence: 0,
            settledRounds: 0,
            ratingBps: RatingLib.DEFAULT_RATING_BPS,
            conservativeRatingBps: RatingLib.DEFAULT_RATING_BPS,
            lastUpdatedAt: 0,
            lowSince: 0
        });
        contentSlashConfigSnapshot[contentId] = _getCurrentSlashConfig();
        dormancyAnchorAt[contentId] = block.timestamp;
        delete dormantKeyReleasableAt[contentId];
    }

    /// @notice Mark content as dormant if it hasn't reached milestone 0 within DORMANCY_PERIOD.
    /// @dev Anyone can call this. Returns submitter stake in cREP.
    function markDormant(uint256 contentId) external nonReentrant {
        Content storage c = contents[contentId];
        require(c.id != 0, "Content does not exist");
        require(c.status == ContentStatus.Active, "Not active");
        require(block.timestamp > _getDormancyAnchor(contentId) + DORMANCY_PERIOD, "Dormancy period not elapsed");
        require(!_hasOpenRound(contentId), "Content has active round");

        c.status = ContentStatus.Dormant;

        bytes32 submissionKey = contentSubmissionKey[contentId];
        if (submissionKey != bytes32(0)) {
            dormantKeyReleasableAt[contentId] = block.timestamp + DORMANT_EXCLUSIVE_REVIVAL_PERIOD;
        }

        _resolvePendingSubmitterStake(contentId, c);

        emit ContentDormant(contentId);
    }

    /// @notice Revive dormant content by staking REVIVAL_STAKE cREP tokens.
    /// @dev Resets the activity timer. Max MAX_REVIVALS revivals per content.
    ///      Revival stake is sent to treasury (non-refundable).
    function reviveContent(uint256 contentId) external nonReentrant whenNotPaused {
        // M-4 fix: require Voter ID (same sybil check as submitContent)
        if (address(voterIdNFT) != address(0)) {
            require(voterIdNFT.hasVoterId(msg.sender), "Voter ID required");
        }

        Content storage c = contents[contentId];
        require(c.status == ContentStatus.Dormant, "Not dormant");
        require(c.dormantCount < MAX_REVIVALS, "Max revivals reached");

        bytes32 submissionKey = contentSubmissionKey[contentId];
        if (submissionKey != bytes32(0)) {
            require(submissionKeyUsed[submissionKey], "Dormant key released");
            require(
                contentSubmitterIdentity[contentId] == _resolveSubmitterIdentity(msg.sender), "Not original submitter"
            );
            require(block.timestamp <= dormantKeyReleasableAt[contentId], "Revival window elapsed");
        }

        // M-1/M-2 fix: send revival stake to treasury instead of leaving it unaccounted
        require(treasury != address(0), "Treasury not set");
        crepToken.safeTransferFrom(msg.sender, treasury, REVIVAL_STAKE);

        c.status = ContentStatus.Active;
        c.dormantCount++;
        c.lastActivityAt = uint48(block.timestamp);
        dormancyAnchorAt[contentId] = block.timestamp;
        delete dormantKeyReleasableAt[contentId];
        c.reviver = msg.sender;

        emit ContentRevived(contentId, msg.sender);
    }

    /// @notice Release a dormant content key after the exclusive revival window expires.
    function releaseDormantSubmissionKey(uint256 contentId) external nonReentrant {
        Content storage c = contents[contentId];
        require(c.id != 0, "Content does not exist");
        require(c.status == ContentStatus.Dormant, "Not dormant");

        bytes32 submissionKey = contentSubmissionKey[contentId];
        require(submissionKey != bytes32(0), "No submission key");
        require(submissionKeyUsed[submissionKey], "Key already released");
        require(block.timestamp > dormantKeyReleasableAt[contentId], "Revival window active");

        submissionKeyUsed[submissionKey] = false;

        emit DormantSubmissionKeyReleased(contentId, submissionKey);
    }

    // --- VotingEngine callbacks ---

    /// @notice Called by VotingEngine to update raw activity timestamp after commits.
    /// @dev Vote commits refresh UI-facing activity without extending the dormancy window.
    function updateActivity(uint256 contentId) external {
        require(msg.sender == votingEngine, "Only VotingEngine");
        contents[contentId].lastActivityAt = uint48(block.timestamp);
    }

    /// @notice Called by VotingEngine when content reaches milestone 0 through a settled round.
    function recordMeaningfulActivity(uint256 contentId) external {
        require(msg.sender == votingEngine, "Only VotingEngine");
        contents[contentId].lastActivityAt = uint48(block.timestamp);
        dormancyAnchorAt[contentId] = block.timestamp;
    }

    function updateRatingState(
        uint256 contentId,
        uint256 roundId,
        uint16 referenceRatingBps,
        RatingLib.RatingState calldata nextState
    ) external {
        require(msg.sender == votingEngine, "Only VotingEngine");

        Content storage c = contents[contentId];
        require(c.id != 0, "Content does not exist");

        RatingLib.RatingState storage state = ratingState[contentId];
        uint16 oldRatingBps = state.ratingBps == 0 ? uint16(uint256(c.rating) * 100) : state.ratingBps;
        uint8 oldDisplayRating = c.rating;
        uint16 clampedRatingBps = RatingMath.clampRatingBps(nextState.ratingBps);
        uint16 clampedConservativeRatingBps =
            nextState.conservativeRatingBps > clampedRatingBps ? clampedRatingBps : nextState.conservativeRatingBps;

        state.ratingLogitX18 = nextState.ratingLogitX18;
        state.confidenceMass = nextState.confidenceMass;
        state.effectiveEvidence = nextState.effectiveEvidence;
        state.settledRounds = nextState.settledRounds;
        state.ratingBps = clampedRatingBps;
        state.conservativeRatingBps = clampedConservativeRatingBps;
        state.lastUpdatedAt = nextState.lastUpdatedAt == 0 ? uint48(block.timestamp) : nextState.lastUpdatedAt;
        state.lowSince = nextState.lowSince;

        uint8 newDisplayRating = RatingMath.displayRatingFromBps(clampedRatingBps);
        if (newDisplayRating != oldDisplayRating) {
            c.rating = newDisplayRating;
            emit RatingUpdated(contentId, oldDisplayRating, newDisplayRating);
        }

        emit RatingStateUpdated(
            contentId,
            roundId,
            referenceRatingBps,
            oldRatingBps,
            clampedRatingBps,
            clampedConservativeRatingBps,
            nextState.confidenceMass,
            nextState.effectiveEvidence,
            nextState.settledRounds
        );
    }

    /// @notice Called by VotingEngine to return submitter stake with a snapshotted submission reward rate.
    /// @dev This avoids coupling the submitter reward to whatever the live participation rate is when the
    ///      stake finally gets returned.
    function returnSubmitterStakeWithRewardRate(uint256 contentId, uint256 rewardRateBps) external {
        address rewardPool = submitterParticipationSnapshotPool[contentId];
        if (rewardPool == address(0)) {
            rewardPool = address(participationPool);
        }
        _returnSubmitterStake(contentId, rewardPool, rewardRateBps);
    }

    /// @notice Called by VotingEngine to return submitter stake using frozen milestone-0 reward terms.
    function returnSubmitterStakeWithMilestoneZeroTerms(uint256 contentId) external {
        address rewardPool = milestoneZeroSubmitterParticipationPool[contentId];
        if (rewardPool == address(0)) {
            rewardPool = address(participationPool);
        }
        _returnSubmitterStake(contentId, rewardPool, milestoneZeroSubmitterParticipationRateBps[contentId]);
    }

    /// @notice Called by VotingEngine to snapshot the submitter participation terms at settlement time.
    function snapshotSubmitterParticipationTerms(uint256 contentId, address rewardPool, uint256 rewardRateBps)
        external
    {
        require(msg.sender == votingEngine, "Only VotingEngine");
        Content storage c = contents[contentId];
        require(c.id != 0, "Content does not exist");
        if (c.submitterStakeReturned) return;

        submitterParticipationSnapshotPool[contentId] = rewardPool;
        submitterParticipationSnapshotRateBps[contentId] = rewardRateBps;
    }

    /// @notice Called by VotingEngine to freeze milestone-0 submitter resolution terms on the first settled round.
    function snapshotMilestoneZeroSubmitterTerms(
        uint256 contentId,
        uint256 rating,
        address rewardPool,
        uint256 rewardRateBps
    ) external {
        require(msg.sender == votingEngine, "Only VotingEngine");
        Content storage c = contents[contentId];
        require(c.id != 0, "Content does not exist");
        if (c.submitterStakeReturned || milestoneZeroSubmitterTermsSnapshotted[contentId]) return;

        milestoneZeroSubmitterTermsSnapshotted[contentId] = true;
        milestoneZeroSubmitterRating[contentId] = rating > 100 ? 100 : uint8(rating);
        milestoneZeroSubmitterParticipationPool[contentId] = rewardPool;
        milestoneZeroSubmitterParticipationRateBps[contentId] = rewardRateBps;

        if (rewardPool != address(0) && rewardRateBps == 0) {
            emit MilestoneZeroSubmitterParticipationRepairNeeded(contentId, rewardPool);
        }
    }

    /// @notice Governance-only repair hook for milestone-zero snapshots that were frozen with a zero participation rate.
    /// @dev Only repairs healthy first-settlement outcomes and can be used once before any submitter reward state exists.
    function repairMilestoneZeroSubmitterParticipationTerms(uint256 contentId, uint256 rewardRateBps)
        external
        nonReentrant
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        Content storage c = contents[contentId];
        require(c.id != 0, "Content does not exist");
        require(milestoneZeroSubmitterTermsSnapshotted[contentId], "Milestone-zero terms missing");

        address rewardPool = milestoneZeroSubmitterParticipationPool[contentId];
        require(rewardPool != address(0), "No milestone-zero pool");
        require(milestoneZeroSubmitterParticipationRateBps[contentId] == 0, "Repair not needed");
        require(rewardRateBps > 0 && rewardRateBps <= 9000, "Invalid reward rate");
        require(
            ratingState[contentId].conservativeRatingBps >= _getSlashConfigForContent(contentId).slashThresholdBps,
            "Slashable milestone-zero"
        );
        require(submitterParticipationRewardOwed[contentId] == 0, "Reward already accrued");
        require(submitterParticipationRewardPaid[contentId] == 0, "Reward already claimed");
        require(submitterParticipationRewardReserved[contentId] == 0, "Reward already reserved");

        milestoneZeroSubmitterParticipationRateBps[contentId] = rewardRateBps;

        uint256 rewardAmount = c.submitterStake * rewardRateBps / 10000;
        if (c.submitterStakeReturned) {
            _accrueSubmitterParticipationReward(contentId, c, rewardPool, rewardRateBps);
        }

        emit MilestoneZeroSubmitterParticipationTermsRepaired(contentId, rewardPool, rewardRateBps, rewardAmount);
    }

    /// @notice Called by VotingEngine once the dormancy window elapses without any settled round.
    function resolvePendingSubmitterStake(uint256 contentId) external {
        require(msg.sender == votingEngine, "Only VotingEngine");
        Content storage c = contents[contentId];
        require(c.id != 0, "Content does not exist");
        _resolvePendingSubmitterStake(contentId, c);
    }

    function _returnSubmitterStake(uint256 contentId, address rewardPool, uint256 rewardRateBps) internal {
        require(msg.sender == votingEngine, "Only VotingEngine");
        Content storage c = contents[contentId];
        require(!c.submitterStakeReturned, "Already returned");

        c.submitterStakeReturned = true;
        crepToken.safeTransfer(c.submitter, c.submitterStake);

        _accrueSubmitterParticipationReward(contentId, c, rewardPool, rewardRateBps);

        emit SubmitterStakeReturned(contentId, c.submitterStake);
    }

    /// @notice Claim a snapshotted submitter participation reward after the healthy submitter path resolves.
    /// @dev Uses the participation pool snapshot captured when the submitter stake was returned.
    function claimSubmitterParticipationReward(uint256 contentId) external nonReentrant returns (uint256 paidAmount) {
        Content storage c = contents[contentId];
        require(c.id != 0, "Content does not exist");
        require(msg.sender == c.submitter, "Not submitter");
        (paidAmount,) = _claimSubmitterParticipationReward(contentId, c);
    }

    function _resolvePendingSubmitterStake(uint256 contentId, Content storage c) internal {
        if (c.submitterStakeReturned) return;

        bool useMilestoneZeroTerms = milestoneZeroSubmitterTermsSnapshotted[contentId];

        if (isSubmitterStakeSlashable(contentId)) {
            require(treasury != address(0), "Treasury not set");
            c.submitterStakeReturned = true;
            crepToken.safeTransfer(treasury, c.submitterStake);
            emit SubmitterStakeSlashed(contentId, c.submitterStake);
            return;
        }

        if (useMilestoneZeroTerms) {
            if (block.timestamp < uint256(c.createdAt) + 4 days) {
                return;
            }

            if (ratingState[contentId].lowSince != 0) {
                return;
            }
        }

        c.submitterStakeReturned = true;
        crepToken.safeTransfer(c.submitter, c.submitterStake);

        address rewardPool = useMilestoneZeroTerms
            ? milestoneZeroSubmitterParticipationPool[contentId]
            : submitterParticipationSnapshotPool[contentId];
        uint256 rewardRateBps = useMilestoneZeroTerms
            ? milestoneZeroSubmitterParticipationRateBps[contentId]
            : submitterParticipationSnapshotRateBps[contentId];

        _accrueSubmitterParticipationReward(contentId, c, rewardPool, rewardRateBps);
        emit SubmitterStakeReturned(contentId, c.submitterStake);
    }

    function _accrueSubmitterParticipationReward(
        uint256 contentId,
        Content storage c,
        address rewardPool,
        uint256 rewardRateBps
    ) internal {
        if (rewardPool == address(0)) return;

        uint256 rewardAmount = c.submitterStake * rewardRateBps / 10000;

        if (rewardAmount == 0) return;

        submitterParticipationRewardPool[contentId] = rewardPool;
        submitterParticipationRewardOwed[contentId] = rewardAmount;
        emit SubmitterParticipationRewardAccrued(contentId, c.submitter, rewardPool, rewardAmount);

        try IParticipationPool(rewardPool).reserveReward(address(this), rewardAmount) returns (uint256 reservedAmount) {
            if (reservedAmount > 0) {
                submitterParticipationRewardReserved[contentId] = reservedAmount;
            }
        } catch {
            emit SubmitterParticipationReservationFailed(contentId, rewardPool, rewardAmount);
        }
    }

    function _claimSubmitterParticipationReward(uint256 contentId, Content storage c)
        internal
        returns (uint256 paidAmount, uint256 remainingReward)
    {
        uint256 totalReward = submitterParticipationRewardOwed[contentId];
        require(totalReward > 0, "No reward");

        uint256 alreadyPaid = submitterParticipationRewardPaid[contentId];
        require(alreadyPaid < totalReward, "Already claimed");

        address rewardPool = submitterParticipationRewardPool[contentId];
        require(rewardPool != address(0), "No reward pool");

        uint256 reservedAmount = submitterParticipationRewardReserved[contentId];
        uint256 reservedRemaining = reservedAmount > alreadyPaid ? reservedAmount - alreadyPaid : 0;
        if (reservedRemaining > 0) {
            uint256 reservedPayout =
                IParticipationPool(rewardPool).withdrawReservedReward(c.submitter, reservedRemaining);
            paidAmount += reservedPayout;
            alreadyPaid += reservedPayout;
        }

        if (alreadyPaid < totalReward) {
            remainingReward = totalReward - alreadyPaid;
            try IParticipationPool(rewardPool).distributeReward(c.submitter, remainingReward) returns (
                uint256 streamedReward
            ) {
                paidAmount += streamedReward;
                alreadyPaid += streamedReward;
            } catch { }
        }

        require(paidAmount > 0, "Pool depleted");

        submitterParticipationRewardPaid[contentId] = alreadyPaid;
        emit SubmitterParticipationRewardClaimed(contentId, c.submitter, paidAmount);
    }

    /// @notice Called by VotingEngine to slash submitter stake after milestone 0 resolves unfavorably.
    /// @dev 100% of stake is slashed and sent to the treasury.
    /// @return slashAmount The amount that was slashed.
    function slashSubmitterStake(uint256 contentId) external returns (uint256 slashAmount) {
        require(msg.sender == votingEngine, "Only VotingEngine");
        Content storage c = contents[contentId];
        require(!c.submitterStakeReturned, "Already returned");
        require(treasury != address(0), "Treasury not set");
        require(isSubmitterStakeSlashable(contentId), "Not slashable");

        c.submitterStakeReturned = true;
        slashAmount = c.submitterStake; // 100% slashed

        crepToken.safeTransfer(treasury, slashAmount);

        emit SubmitterStakeSlashed(contentId, slashAmount);
    }

    // --- View functions ---

    function getSubmitterIdentity(uint256 contentId) external view returns (address) {
        if (contents[contentId].submitter == address(0)) return address(0);
        return contentSubmitterIdentity[contentId];
    }

    function getContentSubmitter(uint256 contentId) external view returns (address) {
        return contents[contentId].submitter;
    }

    function getRatingState(uint256 contentId) external view returns (RatingLib.RatingState memory state) {
        state = ratingState[contentId];
    }

    function getSlashConfigForContent(uint256 contentId)
        external
        view
        returns (RatingLib.SlashConfig memory slashConfig)
    {
        slashConfig = _getSlashConfigForContent(contentId);
    }

    function getRating(uint256 contentId) external view returns (uint16) {
        uint16 ratingBps = ratingState[contentId].ratingBps;
        if (ratingBps == 0) return uint16(uint256(contents[contentId].rating) * 100);
        return ratingBps;
    }

    function getConservativeRating(uint256 contentId) external view returns (uint16) {
        uint16 conservativeRatingBps = ratingState[contentId].conservativeRatingBps;
        if (conservativeRatingBps == 0) return uint16(uint256(contents[contentId].rating) * 100);
        return conservativeRatingBps;
    }

    function isSubmitterStakeSlashable(uint256 contentId) public view returns (bool) {
        Content storage c = contents[contentId];
        if (c.id == 0 || c.submitterStakeReturned) return false;
        if (block.timestamp < uint256(c.createdAt) + 24 hours) return false;

        RatingLib.RatingState memory state = ratingState[contentId];
        RatingLib.SlashConfig memory slashConfig = _getSlashConfigForContent(contentId);

        if (state.conservativeRatingBps >= slashConfig.slashThresholdBps) return false;
        if (state.effectiveEvidence < slashConfig.minSlashEvidence) return false;
        if (state.settledRounds < slashConfig.minSlashSettledRounds) return false;
        if (state.lowSince == 0) return false;

        return block.timestamp >= uint256(state.lowSince) + slashConfig.minSlashLowDuration;
    }

    function isContentActive(uint256 contentId) external view returns (bool) {
        Content storage c = contents[contentId];
        return c.id != 0 && c.status == ContentStatus.Active;
    }

    function isDormancyEligible(uint256 contentId) external view returns (bool) {
        Content storage c = contents[contentId];
        if (c.id == 0 || c.status != ContentStatus.Active) return false;
        if (block.timestamp <= _getDormancyAnchor(contentId) + DORMANCY_PERIOD) return false;
        return !_hasOpenRound(contentId);
    }

    /// @notice Preview the resolved category and question-level submission key for a future multi-media reveal.
    function previewQuestionMediaSubmissionKey(
        string[] calldata imageUrls,
        string calldata videoUrl,
        string calldata title,
        string calldata description,
        string calldata tags,
        uint256 categoryId
    ) external view returns (uint256 resolvedCategoryId, bytes32 submissionKey) {
        SUBMISSION_MEDIA_VALIDATOR.validateMediaSet(imageUrls, videoUrl);
        SubmissionMetadata memory metadata = SubmissionMetadata({
            url: bytes(videoUrl).length != 0 ? videoUrl : imageUrls[0],
            title: title,
            description: description,
            tags: tags,
            categoryId: categoryId
        });
        _validateTextFields(metadata);
        require(address(categoryRegistry) != address(0), "CategoryRegistry not set");
        resolvedCategoryId = _resolveQuestionSubmissionCategory(metadata);
        submissionKey = _deriveQuestionMediaSubmissionKey(metadata, imageUrls, videoUrl, resolvedCategoryId);
    }

    function _computeRevealCommitment(
        bytes32 submissionKey,
        string memory title,
        string memory description,
        string memory tags,
        uint256 categoryId,
        bytes32 salt,
        address submitter
    ) internal pure returns (bytes32) {
        return keccak256(abi.encode(submissionKey, title, description, tags, categoryId, salt, submitter));
    }

    function _refundReservedSubmission(PendingSubmission memory pending, address recipient)
        internal
        returns (uint256 refund)
    {
        uint256 reservedStake = pending.reservedStake;
        if (reservedStake == 0) return 0;

        uint256 fee = reservedStake >= CANCELLATION_FEE ? CANCELLATION_FEE : reservedStake;
        refund = reservedStake - fee;

        if (fee > 0) {
            address feeSink = bonusPool != address(0) ? bonusPool : treasury;
            require(feeSink != address(0), "Fee sink not set");
            crepToken.safeTransfer(feeSink, fee);
        }
        if (refund > 0) {
            crepToken.safeTransfer(recipient, refund);
        }
    }

    function _resolveSubmitterIdentity(address submitter) internal view returns (address) {
        if (submitter == address(0)) return address(0);
        if (address(voterIdNFT) != address(0)) {
            address resolved = voterIdNFT.resolveHolder(submitter);
            if (resolved != address(0)) {
                return resolved;
            }
        }
        return submitter;
    }

    function _getDormancyAnchor(uint256 contentId) internal view returns (uint256) {
        return dormancyAnchorAt[contentId];
    }

    function _hasOpenRound(uint256 contentId) internal view returns (bool) {
        if (votingEngine == address(0)) return false;

        uint256 activeRoundId = IRoundVotingEngine(votingEngine).currentRoundId(contentId);
        if (activeRoundId == 0) return false;

        (, RoundLib.RoundState roundState,,,,,,,,,,,,) =
            IRoundVotingEngine(votingEngine).rounds(contentId, activeRoundId);
        return roundState == RoundLib.RoundState.Open;
    }

    function _getInitialConfidenceMass() internal view returns (uint256) {
        if (address(protocolConfig) == address(0)) {
            return DEFAULT_CONFIDENCE_MASS_INITIAL;
        }

        uint256 initialConfidenceMass = protocolConfig.getInitialConfidenceMass();
        return initialConfidenceMass == 0 ? DEFAULT_CONFIDENCE_MASS_INITIAL : initialConfidenceMass;
    }

    function _getCurrentSlashConfig() internal view returns (RatingLib.SlashConfig memory slashConfig) {
        if (address(protocolConfig) == address(0)) {
            slashConfig = RatingLib.SlashConfig({
                slashThresholdBps: DEFAULT_SLASH_THRESHOLD_BPS,
                minSlashSettledRounds: DEFAULT_MIN_SLASH_SETTLED_ROUNDS,
                minSlashLowDuration: DEFAULT_MIN_SLASH_LOW_DURATION,
                minSlashEvidence: DEFAULT_MIN_SLASH_EVIDENCE
            });
            return slashConfig;
        }

        (
            slashConfig.slashThresholdBps,
            slashConfig.minSlashSettledRounds,
            slashConfig.minSlashLowDuration,
            slashConfig.minSlashEvidence
        ) = protocolConfig.slashConfig();
    }

    function _getSlashConfigForContent(uint256 contentId)
        internal
        view
        returns (RatingLib.SlashConfig memory slashConfig)
    {
        slashConfig = contentSlashConfigSnapshot[contentId];
        if (slashConfig.slashThresholdBps == 0) {
            return _getCurrentSlashConfig();
        }
    }

    // --- Admin ---

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }
}
