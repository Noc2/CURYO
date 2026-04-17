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
import { RoundLib } from "./libraries/RoundLib.sol";
import { RatingLib } from "./libraries/RatingLib.sol";
import { RatingMath } from "./libraries/RatingMath.sol";
import { ProtocolConfig } from "./ProtocolConfig.sol";
import { SubmissionMediaValidator } from "./SubmissionMediaValidator.sol";

interface IQuestionRewardPoolEscrow {
    function createSubmissionRewardPoolFromRegistry(uint256 contentId, address funder, uint8 asset, uint256 amount)
        external
        returns (uint256 rewardPoolId);
}

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
    uint256 public constant REVIVAL_STAKE = 5e6; // 5 cREP (6 decimals)
    uint256 public constant DORMANCY_PERIOD = 30 days;
    uint256 public constant SUBMISSION_RESERVATION_PERIOD = 30 minutes;
    uint256 public constant RESERVED_SUBMISSION_MIN_AGE = 1 seconds;
    uint256 public constant DORMANT_EXCLUSIVE_REVIVAL_PERIOD = 1 days;
    uint8 public constant MAX_REVIVALS = 2;
    uint8 public constant SUBMISSION_REWARD_ASSET_CREP = 0;
    uint8 public constant SUBMISSION_REWARD_ASSET_USDC = 1;
    uint256 public constant DEFAULT_MIN_SUBMISSION_REWARD_POOL = 1e6;

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

    /// @notice Escrow that holds mandatory bounties.
    address public questionRewardPoolEscrow;

    /// @notice Deprecated submitter reward state retained as zeroed compatibility getters.
    mapping(uint256 => uint256) public submitterParticipationRewardOwed;
    mapping(uint256 => uint256) public submitterParticipationRewardPaid;
    mapping(uint256 => uint256) public submitterParticipationRewardReserved;
    mapping(uint256 => address) public submitterParticipationRewardPool;
    mapping(uint256 => uint256) public submitterParticipationSnapshotRateBps;
    mapping(uint256 => address) public submitterParticipationSnapshotPool;
    mapping(uint256 => bool) public milestoneZeroSubmitterTermsSnapshotted;
    mapping(uint256 => uint8) public milestoneZeroSubmitterRating;
    mapping(uint256 => uint256) public milestoneZeroSubmitterParticipationRateBps;
    mapping(uint256 => address) public milestoneZeroSubmitterParticipationPool;

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

    /// @notice Rich rating state used by the score-relative rating system.
    mapping(uint256 => RatingLib.RatingState) public ratingState;

    /// @notice Slash policy frozen at content creation so governance cannot retroactively rewrite stake terms.
    mapping(uint256 => RatingLib.SlashConfig) public contentSlashConfigSnapshot;

    SubmissionMediaValidator internal immutable SUBMISSION_MEDIA_VALIDATOR;

    /// @dev Reserved storage gap for future upgrades
    uint256[47] private __gap;

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
    event SubmissionReservationCancelled(address indexed submitter, bytes32 indexed revealCommitment);
    event SubmissionReservationExpired(address indexed submitter, bytes32 indexed revealCommitment);
    event SubmissionRewardPoolAttached(
        uint256 indexed contentId,
        address indexed submitter,
        uint8 indexed rewardAsset,
        uint256 amount,
        uint256 rewardPoolId
    );
    event ContentDormant(uint256 indexed contentId);
    event DormantSubmissionKeyReleased(uint256 indexed contentId, bytes32 indexed submissionKey);
    event ContentRevived(uint256 indexed contentId, address indexed reviver);
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
    event QuestionRewardPoolEscrowUpdated(address rewardPoolEscrow);

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

    /// @notice Set or update the bounty escrow.
    function setQuestionRewardPoolEscrow(address _questionRewardPoolEscrow) external onlyRole(CONFIG_ROLE) {
        require(_questionRewardPoolEscrow != address(0), "Invalid address");
        questionRewardPoolEscrow = _questionRewardPoolEscrow;
        emit QuestionRewardPoolEscrowUpdated(_questionRewardPoolEscrow);
    }

    /// @notice Deprecated compatibility hook. Submitter participation rewards have been removed.
    function setParticipationPool(address) external onlyRole(CONFIG_ROLE) { }

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
        require(revealCommitment != bytes32(0), "Invalid commitment");
        PendingSubmission storage pending = pendingSubmissions[revealCommitment];
        require(pending.submitter == address(0), "Reservation exists");

        pendingSubmissions[revealCommitment] = PendingSubmission({
            submitter: msg.sender,
            reservedAt: block.timestamp.toUint48(),
            expiresAt: (block.timestamp + SUBMISSION_RESERVATION_PERIOD).toUint48()
        });

        emit SubmissionReserved(msg.sender, revealCommitment, block.timestamp + SUBMISSION_RESERVATION_PERIOD);
    }

    function cancelReservedSubmission(bytes32 revealCommitment) external nonReentrant whenNotPaused {
        PendingSubmission memory pending = pendingSubmissions[revealCommitment];
        require(pending.submitter == msg.sender, "Not submitter");
        delete pendingSubmissions[revealCommitment];

        emit SubmissionReservationCancelled(msg.sender, revealCommitment);
    }

    function clearExpiredReservedSubmission(bytes32 revealCommitment) external nonReentrant whenNotPaused {
        PendingSubmission memory pending = pendingSubmissions[revealCommitment];
        require(pending.submitter != address(0), "Reservation not found");
        require(block.timestamp > pending.expiresAt, "Reservation active");
        delete pendingSubmissions[revealCommitment];

        emit SubmissionReservationExpired(pending.submitter, revealCommitment);
    }

    function submitQuestionWithMediaWithReward(
        string[] calldata imageUrls,
        string calldata videoUrl,
        string calldata title,
        string calldata description,
        string calldata tags,
        uint256 categoryId,
        bytes32 salt,
        uint8 rewardAsset,
        uint256 rewardAmount
    ) external nonReentrant whenNotPaused returns (uint256) {
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
        return _submitValidatedQuestionWithMedia(metadata, imageUrls, videoUrl, salt, rewardAsset, rewardAmount);
    }

    function submitQuestionWithReward(
        string calldata contextUrl,
        string[] calldata imageUrls,
        string calldata videoUrl,
        string calldata title,
        string calldata description,
        string calldata tags,
        uint256 categoryId,
        bytes32 salt,
        uint8 rewardAsset,
        uint256 rewardAmount
    ) external nonReentrant whenNotPaused returns (uint256) {
        SUBMISSION_MEDIA_VALIDATOR.validateContextUrl(contextUrl);
        SUBMISSION_MEDIA_VALIDATOR.validateOptionalMediaSet(imageUrls, videoUrl);
        SubmissionMetadata memory metadata = SubmissionMetadata({
            url: contextUrl, title: title, description: description, tags: tags, categoryId: categoryId
        });
        _validateTextFields(metadata);

        require(address(categoryRegistry) != address(0), "CategoryRegistry not set");
        return _submitValidatedQuestionWithMedia(metadata, imageUrls, videoUrl, salt, rewardAsset, rewardAmount);
    }

    /// @notice Submit a question with a required context link and optional preview media.
    /// @dev Attaches the governance minimum cREP bounty.
    function submitQuestion(
        string calldata contextUrl,
        string[] calldata imageUrls,
        string calldata videoUrl,
        string calldata title,
        string calldata description,
        string calldata tags,
        uint256 categoryId,
        bytes32 salt
    ) external nonReentrant whenNotPaused returns (uint256) {
        SUBMISSION_MEDIA_VALIDATOR.validateContextUrl(contextUrl);
        SUBMISSION_MEDIA_VALIDATOR.validateOptionalMediaSet(imageUrls, videoUrl);
        SubmissionMetadata memory metadata = SubmissionMetadata({
            url: contextUrl, title: title, description: description, tags: tags, categoryId: categoryId
        });
        _validateTextFields(metadata);

        require(address(categoryRegistry) != address(0), "CategoryRegistry not set");
        uint8 rewardAsset = SUBMISSION_REWARD_ASSET_CREP;
        return _submitValidatedQuestionWithMedia(
            metadata, imageUrls, videoUrl, salt, rewardAsset, _minimumSubmissionReward(rewardAsset)
        );
    }

    /// @notice Compatibility overload that attaches the governance minimum cREP bounty.
    function submitQuestionWithMedia(
        string[] calldata imageUrls,
        string calldata videoUrl,
        string calldata title,
        string calldata description,
        string calldata tags,
        uint256 categoryId,
        bytes32 salt
    ) external nonReentrant whenNotPaused returns (uint256) {
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
        uint8 rewardAsset = SUBMISSION_REWARD_ASSET_CREP;
        return _submitValidatedQuestionWithMedia(
            metadata, imageUrls, videoUrl, salt, rewardAsset, _minimumSubmissionReward(rewardAsset)
        );
    }

    /// @notice Cancel content before any votes. Attached submission bounties stay non-refundable.
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

        emit ContentCancelled(contentId);
    }

    function _validateTextFields(SubmissionMetadata memory metadata) internal pure {
        require(bytes(metadata.url).length > 0, "Context URL required");
        require(bytes(metadata.url).length <= MAX_URL_LENGTH, "URL too long");
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
        bytes32 salt,
        uint8 rewardAsset,
        uint256 rewardAmount
    ) internal returns (uint256 contentId) {
        (uint256 resolvedCategoryId, bytes32 submissionKey, PendingSubmission memory pending) =
            _prepareQuestionMediaSubmission(metadata, imageUrls, videoUrl, salt, rewardAsset, rewardAmount);
        bytes32 contentHash = keccak256(
            abi.encode(
                "curyo-question-context-v1",
                metadata.url,
                imageUrls,
                videoUrl,
                metadata.title,
                metadata.description,
                metadata.tags,
                resolvedCategoryId
            )
        );
        contentId = _storeSubmittedContent(submissionKey, pending, contentHash, resolvedCategoryId);
        uint256 rewardPoolId = _attachSubmissionRewardPool(contentId, rewardAsset, rewardAmount);
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
        emit SubmissionRewardPoolAttached(contentId, msg.sender, rewardAsset, rewardAmount, rewardPoolId);
    }

    function _prepareQuestionMediaSubmission(
        SubmissionMetadata memory metadata,
        string[] calldata imageUrls,
        string calldata videoUrl,
        bytes32 salt,
        uint8 rewardAsset,
        uint256 rewardAmount
    ) internal returns (uint256 resolvedCategoryId, bytes32 submissionKey, PendingSubmission memory pending) {
        resolvedCategoryId = _resolveQuestionSubmissionCategory(metadata);
        submissionKey = _deriveQuestionMediaSubmissionKey(metadata, imageUrls, videoUrl, resolvedCategoryId);
        require(!submissionKeyUsed[submissionKey], "Question already submitted");
        _validateSubmissionReward(rewardAsset, rewardAmount);

        bytes32 revealCommitment = _computeRevealCommitment(
            submissionKey,
            metadata.title,
            metadata.description,
            metadata.tags,
            metadata.categoryId,
            salt,
            msg.sender,
            rewardAsset,
            rewardAmount
        );
        pending = pendingSubmissions[revealCommitment];
        require(pending.submitter == msg.sender, "Reservation not found");
        require(block.timestamp <= pending.expiresAt, "Reservation expired");
        require(block.timestamp >= pending.reservedAt + RESERVED_SUBMISSION_MIN_AGE, "Reservation too new");

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
        string[] calldata,
        string calldata,
        uint256 resolvedCategoryId
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(
                "curyo-question-context-v1",
                resolvedCategoryId,
                metadata.url,
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
        contentSubmitterIdentity[contentId] = _resolveSubmitterIdentity(pending.submitter);
        contents[contentId] = Content({
            id: contentId.toUint64(),
            contentHash: contentHash,
            submitter: msg.sender,
            submitterStake: 0,
            createdAt: block.timestamp.toUint48(),
            lastActivityAt: block.timestamp.toUint48(),
            status: ContentStatus.Active,
            dormantCount: 0,
            reviver: address(0),
            submitterStakeReturned: true,
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

    function _attachSubmissionRewardPool(uint256 contentId, uint8 rewardAsset, uint256 rewardAmount)
        internal
        returns (uint256 rewardPoolId)
    {
        require(questionRewardPoolEscrow != address(0), "Bounty escrow not set");
        rewardPoolId = IQuestionRewardPoolEscrow(questionRewardPoolEscrow)
            .createSubmissionRewardPoolFromRegistry(contentId, msg.sender, rewardAsset, rewardAmount);
    }

    /// @notice Mark content as dormant if it hasn't reached milestone 0 within DORMANCY_PERIOD.
    /// @dev Anyone can call this. The mandatory submission bounty is not refunded.
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

        emit ContentDormant(contentId);
    }

    /// @notice Revive dormant content by staking REVIVAL_STAKE cREP tokens.
    /// @dev Resets the activity timer. Max MAX_REVIVALS revivals per content.
    ///      Revival stake is sent to treasury (non-refundable).
    function reviveContent(uint256 contentId) external nonReentrant whenNotPaused {
        // Revivals still require Voter ID; fresh question submissions are permissionless with a bounty.
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

    /// @notice Deprecated; submitter stake slashing has been removed.
    function isSubmitterStakeSlashable(uint256) public pure returns (bool) {
        return false;
    }

    /// @notice Deprecated; submitter stake resolution has been removed.
    function resolvePendingSubmitterStake(uint256) external {
        require(msg.sender == votingEngine, "Only VotingEngine");
    }

    /// @notice Deprecated; submitter stake slashing has been removed.
    function slashSubmitterStake(uint256) external returns (uint256) {
        require(msg.sender == votingEngine, "Only VotingEngine");
        return 0;
    }

    /// @notice Deprecated; submitter participation rewards have been removed.
    function claimSubmitterParticipationReward(uint256) external pure returns (uint256) {
        revert("Submitter rewards removed");
    }

    /// @notice Deprecated; submitter participation rewards have been removed.
    function snapshotSubmitterParticipationTerms(uint256, address, uint256) external view {
        require(msg.sender == votingEngine, "Only VotingEngine");
    }

    /// @notice Deprecated; submitter participation rewards have been removed.
    function snapshotMilestoneZeroSubmitterTerms(uint256, uint256, address, uint256) external view {
        require(msg.sender == votingEngine, "Only VotingEngine");
    }

    /// @notice Deprecated; submitter participation rewards have been removed.
    function repairMilestoneZeroSubmitterParticipationTerms(uint256, uint256) external pure {
        revert("Submitter rewards removed");
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
    function previewQuestionSubmissionKey(
        string calldata contextUrl,
        string[] calldata imageUrls,
        string calldata videoUrl,
        string calldata title,
        string calldata description,
        string calldata tags,
        uint256 categoryId
    ) external view returns (uint256 resolvedCategoryId, bytes32 submissionKey) {
        SUBMISSION_MEDIA_VALIDATOR.validateContextUrl(contextUrl);
        SUBMISSION_MEDIA_VALIDATOR.validateOptionalMediaSet(imageUrls, videoUrl);
        SubmissionMetadata memory metadata = SubmissionMetadata({
            url: contextUrl, title: title, description: description, tags: tags, categoryId: categoryId
        });
        _validateTextFields(metadata);
        require(address(categoryRegistry) != address(0), "CategoryRegistry not set");
        resolvedCategoryId = _resolveQuestionSubmissionCategory(metadata);
        submissionKey = _deriveQuestionMediaSubmissionKey(metadata, imageUrls, videoUrl, resolvedCategoryId);
    }

    /// @notice Preview the resolved category and question-level submission key for a future media-backed reveal.
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
        address submitter,
        uint8 rewardAsset,
        uint256 rewardAmount
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encode(submissionKey, title, description, tags, categoryId, salt, submitter, rewardAsset, rewardAmount)
        );
    }

    function _validateSubmissionReward(uint8 rewardAsset, uint256 rewardAmount) internal view {
        require(
            rewardAsset == SUBMISSION_REWARD_ASSET_CREP || rewardAsset == SUBMISSION_REWARD_ASSET_USDC,
            "Invalid reward asset"
        );
        require(rewardAmount >= _minimumSubmissionReward(rewardAsset), "Reward below minimum");
    }

    function _minimumSubmissionReward(uint8 rewardAsset) internal view returns (uint256 minimum) {
        if (address(protocolConfig) != address(0)) {
            minimum = rewardAsset == SUBMISSION_REWARD_ASSET_CREP
                ? protocolConfig.minSubmissionCrepPool()
                : protocolConfig.minSubmissionUsdcPool();
        }
        return minimum == 0 ? DEFAULT_MIN_SUBMISSION_REWARD_POOL : minimum;
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
