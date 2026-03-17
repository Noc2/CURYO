// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ICategoryRegistry } from "./interfaces/ICategoryRegistry.sol";
import { IRoundVotingEngine } from "./interfaces/IRoundVotingEngine.sol";
import { IVoterIdNFT } from "./interfaces/IVoterIdNFT.sol";
import { IParticipationPool } from "./interfaces/IParticipationPool.sol";
import { RoundLib } from "./libraries/RoundLib.sol";
import { SubmissionCanonicalizer } from "./SubmissionCanonicalizer.sol";

/// @title ContentRegistry
/// @notice Manages content lifecycle: submission → active → dormant → revived / cancelled.
/// @dev Stores only a metadata hash on-chain; full URL/title/description are emitted in events.
contract ContentRegistry is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardTransient,
    UUPSUpgradeable
{
    using SafeERC20 for IERC20;

    // --- Access Control Roles ---
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant CONFIG_ROLE = keccak256("CONFIG_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // --- Constants ---
    uint256 public constant MIN_SUBMITTER_STAKE = 10e6; // 10 cREP (6 decimals)
    uint256 public constant REVIVAL_STAKE = 5e6; // 5 cREP (6 decimals)
    uint256 public constant CANCELLATION_FEE = 1e6; // 1 cREP (prevents submit-cancel spam)
    uint256 public constant DORMANCY_PERIOD = 30 days;
    uint8 public constant MAX_REVIVALS = 2;

    // Submitter stake rules
    uint256 public constant SLASH_RATING_THRESHOLD = 25; // Rating below this triggers slash

    // String length limits (prevent storage bloat)
    uint256 public constant MAX_URL_LENGTH = 2048;
    uint256 public constant MAX_TITLE_LENGTH = 96;
    uint256 public constant MAX_DESCRIPTION_LENGTH = 500;
    uint256 public constant MAX_TAGS_LENGTH = 256;

    // --- Enums ---
    enum ContentStatus {
        Active,
        Dormant,
        Cancelled
    }

    // --- Structs ---
    struct Content {
        uint256 id;
        bytes32 contentHash;
        address submitter;
        uint256 submitterStake;
        uint256 createdAt;
        uint256 lastActivityAt;
        ContentStatus status;
        uint8 dormantCount;
        address reviver;
        bool submitterStakeReturned;
        uint256 rating; // 0-100, starts at 50
        uint256 categoryId; // Reference to approved category
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

    /// @notice Snapshotted participation reward rate captured at the latest successful settlement.
    mapping(uint256 => uint256) public submitterParticipationSnapshotRateBps;

    /// @notice Snapshotted participation pool captured at the latest successful settlement.
    mapping(uint256 => address) public submitterParticipationSnapshotPool;

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

    /// @dev Stateless helper used to resolve canonical submission keys without bloating the registry runtime.
    SubmissionCanonicalizer internal immutable SUBMISSION_CANONICALIZER;

    /// @dev Reserved storage gap for future upgrades
    uint256[42] private __gap;

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
    event ContentCancelled(uint256 indexed contentId);
    event ContentDormant(uint256 indexed contentId);
    event ContentRevived(uint256 indexed contentId, address indexed reviver);
    event SubmitterStakeReturned(uint256 indexed contentId, uint256 amount);
    event SubmitterStakeSlashed(uint256 indexed contentId, uint256 slashedAmount);
    event SubmitterParticipationRewardAccrued(
        uint256 indexed contentId, address indexed submitter, address indexed rewardPool, uint256 amount
    );
    event SubmitterParticipationRewardClaimed(uint256 indexed contentId, address indexed submitter, uint256 amount);
    event RatingUpdated(uint256 indexed contentId, uint256 oldRating, uint256 newRating);
    event VoterIdNFTUpdated(address voterIdNFT);

    /// @custom:oz-upgrades-unsafe-allow constructor state-variable-immutable
    constructor() {
        SUBMISSION_CANONICALIZER = new SubmissionCanonicalizer();
        _disableInitializers();
    }

    function initialize(address _admin, address _governance, address _crepToken) public initializer {
        __AccessControl_init();
        __Pausable_init();

        require(_admin != address(0), "Invalid admin");
        require(_governance != address(0), "Invalid governance");
        require(_crepToken != address(0), "Invalid cREP token");

        // Governance gets all permanent roles
        _grantRole(DEFAULT_ADMIN_ROLE, _governance);
        _grantRole(ADMIN_ROLE, _governance);
        _grantRole(CONFIG_ROLE, _governance);
        _grantRole(PAUSER_ROLE, _governance);
        _grantRole(UPGRADER_ROLE, _governance);

        // Admin gets only CONFIG_ROLE for initial cross-contract wiring
        if (_admin != _governance) {
            _grantRole(CONFIG_ROLE, _admin);
        }

        crepToken = IERC20(_crepToken);
        nextContentId = 1;
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

    /// @notice Set the cancellation fee sink address (can only be called by CONFIG_ROLE).
    function setBonusPool(address _bonusPool) external onlyRole(CONFIG_ROLE) {
        require(_bonusPool != address(0), "Invalid address");
        bonusPool = _bonusPool;
    }

    /// @notice Set the treasury address that receives slashed stakes (can only be called by CONFIG_ROLE).
    function setTreasury(address _treasury) external onlyRole(CONFIG_ROLE) {
        require(_treasury != address(0), "Invalid address");
        treasury = _treasury;
    }

    // --- Content Lifecycle ---

    /// @notice Submit new content. Locks MIN_SUBMITTER_STAKE cREP tokens.
    /// @param url The content URL (stored in event only).
    /// @param title The content title (stored in event only).
    /// @param description The content description (stored in event only).
    /// @param tags Comma-separated subcategory tags (stored in event only).
    /// @param categoryId The category ID hint. The URL determines the effective category and this hint must either
    ///        match it or be 0.
    function submitContent(
        string calldata url,
        string calldata title,
        string calldata description,
        string calldata tags,
        uint256 categoryId
    )
        external
        nonReentrant
        whenNotPaused
        returns (uint256)
    {
        // Require Voter ID if VoterIdNFT is configured
        if (address(voterIdNFT) != address(0)) {
            require(voterIdNFT.hasVoterId(msg.sender), "Voter ID required");
        }

        require(bytes(url).length > 0, "URL required");
        require(bytes(url).length <= MAX_URL_LENGTH, "URL too long");
        require(_isValidSubmissionUrl(url), "Invalid URL");
        require(bytes(title).length > 0, "Title required");
        require(bytes(title).length <= MAX_TITLE_LENGTH, "Title too long");
        require(bytes(description).length > 0, "Description required");
        require(bytes(description).length <= MAX_DESCRIPTION_LENGTH, "Description too long");
        require(bytes(tags).length > 0, "Tags required");
        require(bytes(tags).length <= MAX_TAGS_LENGTH, "Tags too long");

        require(address(categoryRegistry) != address(0), "CategoryRegistry not set");
        (uint256 resolvedCategoryId, bytes32 submissionKey) =
            SUBMISSION_CANONICALIZER.resolveCategoryAndSubmissionKey(categoryRegistry, url, categoryId);

        require(!submissionKeyUsed[submissionKey], "URL already submitted");
        submissionKeyUsed[submissionKey] = true;

        bytes32 contentHash = keccak256(abi.encode(url, title, description, tags));
        address submitterIdentity = _resolveSubmitterIdentity(msg.sender);

        crepToken.safeTransferFrom(msg.sender, address(this), MIN_SUBMITTER_STAKE);

        uint256 contentId = nextContentId++;
        contentSubmissionKey[contentId] = submissionKey;
        contentSubmitterIdentity[contentId] = submitterIdentity;
        contents[contentId] = Content({
            id: contentId,
            contentHash: contentHash,
            submitter: msg.sender,
            submitterStake: MIN_SUBMITTER_STAKE,
            createdAt: block.timestamp,
            lastActivityAt: block.timestamp,
            status: ContentStatus.Active,
            dormantCount: 0,
            reviver: address(0),
            submitterStakeReturned: false,
            rating: 50,
            categoryId: resolvedCategoryId
        });
        dormancyAnchorAt[contentId] = block.timestamp;

        emit ContentSubmitted(contentId, msg.sender, contentHash, url, title, description, tags, resolvedCategoryId);

        return contentId;
    }

    /// @notice Cancel content before any votes. Returns submitter stake in cREP.
    /// @dev Only callable by the submitter. VotingEngine must confirm 0 votes.
    function cancelContent(uint256 contentId) external nonReentrant whenNotPaused {
        require(bonusPool != address(0), "Bonus pool not set");
        Content storage c = contents[contentId];
        require(c.submitter == msg.sender, "Not submitter");
        require(c.status == ContentStatus.Active, "Not active");
        if (votingEngine != address(0)) {
            require(IRoundVotingEngine(votingEngine).contentCommitCount(contentId) == 0, "Content has votes");
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

    function _isValidSubmissionUrl(string calldata url) internal pure returns (bool) {
        bytes memory urlBytes = bytes(url);
        bytes memory prefix = bytes("https://");
        if (urlBytes.length < prefix.length) {
            return false;
        }

        for (uint256 i = 0; i < prefix.length; i++) {
            if (urlBytes[i] != prefix[i]) {
                return false;
            }
        }

        for (uint256 i = 0; i < urlBytes.length; i++) {
            bytes1 char = urlBytes[i];
            if (char <= 0x20 || char == 0x7F) {
                return false;
            }
        }

        return true;
    }

    /// @notice Mark content as dormant if it hasn't reached milestone 0 within DORMANCY_PERIOD.
    /// @dev Anyone can call this. Returns submitter stake in cREP.
    function markDormant(uint256 contentId) external nonReentrant {
        Content storage c = contents[contentId];
        require(c.status == ContentStatus.Active, "Not active");
        require(block.timestamp > _getDormancyAnchor(contentId) + DORMANCY_PERIOD, "Dormancy period not elapsed");
        require(!_hasOpenRound(contentId), "Content has active round");

        c.status = ContentStatus.Dormant;

        // Release canonical uniqueness so the content can be resubmitted (M-07 fix).
        bytes32 submissionKey = contentSubmissionKey[contentId];
        if (submissionKey != bytes32(0)) {
            submissionKeyUsed[submissionKey] = false;
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
            require(!submissionKeyUsed[submissionKey], "URL already submitted");
            submissionKeyUsed[submissionKey] = true;
        }

        // M-1/M-2 fix: send revival stake to treasury instead of leaving it unaccounted
        require(treasury != address(0), "Treasury not set");
        crepToken.safeTransferFrom(msg.sender, treasury, REVIVAL_STAKE);

        c.status = ContentStatus.Active;
        c.dormantCount++;
        c.lastActivityAt = block.timestamp;
        dormancyAnchorAt[contentId] = block.timestamp;
        c.reviver = msg.sender;

        emit ContentRevived(contentId, msg.sender);
    }

    // --- VotingEngine callbacks ---

    /// @notice Called by VotingEngine to update raw activity timestamp after commits.
    /// @dev Vote commits refresh UI-facing activity without extending the dormancy window.
    function updateActivity(uint256 contentId) external {
        require(msg.sender == votingEngine, "Only VotingEngine");
        contents[contentId].lastActivityAt = block.timestamp;
    }

    /// @notice Called by VotingEngine when content reaches milestone 0 through a settled round.
    function recordMeaningfulActivity(uint256 contentId) external {
        require(msg.sender == votingEngine, "Only VotingEngine");
        contents[contentId].lastActivityAt = block.timestamp;
        dormancyAnchorAt[contentId] = block.timestamp;
    }

    /// @notice Called by VotingEngine to set content rating directly (live updates on each vote).
    /// @param contentId The content ID.
    /// @param newRating The new rating value [0, 100].
    function updateRatingDirect(uint256 contentId, uint16 newRating) external {
        require(msg.sender == votingEngine, "Only VotingEngine");

        Content storage c = contents[contentId];
        uint256 oldRating = c.rating;
        uint256 clampedRating = newRating > 100 ? 100 : uint256(newRating);

        if (clampedRating == oldRating) return;

        c.rating = clampedRating;
        emit RatingUpdated(contentId, oldRating, clampedRating);
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

    /// @notice Called by VotingEngine to snapshot the submitter participation terms at settlement time.
    function snapshotSubmitterParticipationTerms(uint256 contentId, address rewardPool, uint256 rewardRateBps) external {
        require(msg.sender == votingEngine, "Only VotingEngine");
        Content storage c = contents[contentId];
        require(c.id != 0, "Content does not exist");
        if (c.submitterStakeReturned) return;

        submitterParticipationSnapshotPool[contentId] = rewardPool;
        submitterParticipationSnapshotRateBps[contentId] = rewardRateBps;
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

        if (block.timestamp >= c.createdAt + 24 hours && c.rating < SLASH_RATING_THRESHOLD) {
            require(treasury != address(0), "Treasury not set");
            c.submitterStakeReturned = true;
            crepToken.safeTransfer(treasury, c.submitterStake);
            emit SubmitterStakeSlashed(contentId, c.submitterStake);
            return;
        }

        c.submitterStakeReturned = true;
        crepToken.safeTransfer(c.submitter, c.submitterStake);
        _accrueSubmitterParticipationReward(
            contentId, c, submitterParticipationSnapshotPool[contentId], submitterParticipationSnapshotRateBps[contentId]
        );
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
        } catch { }
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
            uint256 reservedPayout = IParticipationPool(rewardPool).withdrawReservedReward(c.submitter, reservedRemaining);
            paidAmount += reservedPayout;
            alreadyPaid += reservedPayout;
        }

        if (alreadyPaid < totalReward) {
            remainingReward = totalReward - alreadyPaid;
            try IParticipationPool(rewardPool).distributeReward(c.submitter, remainingReward) returns (uint256 streamedReward) {
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

    function isDormancyEligible(uint256 contentId) external view returns (bool) {
        Content storage c = contents[contentId];
        if (c.id == 0 || c.status != ContentStatus.Active) return false;
        if (block.timestamp <= _getDormancyAnchor(contentId) + DORMANCY_PERIOD) return false;
        return !_hasOpenRound(contentId);
    }

    function isUrlSubmitted(string calldata url) external view returns (bool) {
        if (bytes(url).length == 0 || !_isValidSubmissionUrl(url)) return false;

        if (address(categoryRegistry) == address(0)) {
            return submissionKeyUsed[keccak256(abi.encodePacked(url))];
        }

        try SUBMISSION_CANONICALIZER.resolveCategoryAndSubmissionKey(categoryRegistry, url, 0) returns (
            uint256,
            bytes32 submissionKey
        ) {
            return submissionKeyUsed[submissionKey];
        } catch {
            return false;
        }
    }

    /// @notice Resolve the canonical submission key for a URL using the configured CategoryRegistry.
    function resolveSubmissionKey(string calldata url) external view returns (bytes32 submissionKey) {
        require(address(categoryRegistry) != address(0), "CategoryRegistry not set");
        (, submissionKey) = SUBMISSION_CANONICALIZER.resolveCategoryAndSubmissionKey(categoryRegistry, url, 0);
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

        (, RoundLib.RoundState roundState,,,,,,,,,,,,) = IRoundVotingEngine(votingEngine).rounds(contentId, activeRoundId);
        return roundState == RoundLib.RoundState.Open;
    }

    // --- Admin ---

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) { }
}
