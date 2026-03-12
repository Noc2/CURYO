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

/// @title ContentRegistry
/// @notice Manages content lifecycle: submission → active → dormant → revived / cancelled.
/// @dev Stores only content hash on-chain; full URL/goal emitted in events.
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
    uint256 public constant MAX_GOAL_LENGTH = 500;
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
        uint256 categoryId; // Reference to approved category (0 only for legacy/unconfigured setups)
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

    /// @notice Canonical submission key per content ID (for releasing/reserving uniqueness on status changes)
    mapping(uint256 => bytes32) internal contentSubmissionKey;

    /// @notice Canonical submitter identity snapshot (holder address if submitted through a delegate).
    mapping(uint256 => address) internal contentSubmitterIdentity;

    /// @notice Meaningful-activity anchor used for dormancy checks.
    /// @dev Vote commits still update `lastActivityAt` for UI/analytics, but only submission, revival,
    ///      and milestone-0 settlement move the dormancy window forward.
    mapping(uint256 => uint256) internal dormancyAnchorAt;

    /// @dev Reserved storage gap for future upgrades
    uint256[47] private __gap;

    // --- Events ---
    event ContentSubmitted(
        uint256 indexed contentId,
        address indexed submitter,
        bytes32 contentHash,
        string url,
        string goal,
        string tags,
        uint256 indexed categoryId
    );
    event ContentCancelled(uint256 indexed contentId);
    event ContentDormant(uint256 indexed contentId);
    event ContentRevived(uint256 indexed contentId, address indexed reviver);
    event SubmitterStakeReturned(uint256 indexed contentId, uint256 amount);
    event SubmitterStakeSlashed(uint256 indexed contentId, uint256 slashedAmount);
    event SubmitterIdentityBackfilled(uint256 indexed contentId, address indexed submitterIdentity);
    event RatingUpdated(uint256 indexed contentId, uint256 oldRating, uint256 newRating);
    event VoterIdNFTUpdated(address voterIdNFT);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
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

    /// @notice Set the participation pool contract (one-time configuration)
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
    /// @param goal The goal description (stored in event only).
    /// @param tags Comma-separated subcategory tags (stored in event only).
    /// @param categoryId The category ID hint. When CategoryRegistry is configured, the URL determines the
    ///        effective category and this hint must either match or be 0.
    function submitContent(string calldata url, string calldata goal, string calldata tags, uint256 categoryId)
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
        require(bytes(goal).length > 0, "Goal required");
        require(bytes(goal).length <= MAX_GOAL_LENGTH, "Goal too long");
        require(bytes(tags).length > 0, "Tags required");
        require(bytes(tags).length <= MAX_TAGS_LENGTH, "Tags too long");

        uint256 resolvedCategoryId = categoryId;
        bytes32 submissionKey;
        if (address(categoryRegistry) != address(0)) {
            (resolvedCategoryId, submissionKey) = _resolveCategoryAndSubmissionKey(url, categoryId);
        } else {
            // Preserve legacy/test behavior until the category registry is wired.
            require(categoryId == 0, "CategoryRegistry not set");
            submissionKey = keccak256(abi.encodePacked(url));
        }

        require(!submissionKeyUsed[submissionKey], "URL already submitted");
        submissionKeyUsed[submissionKey] = true;

        bytes32 contentHash = keccak256(abi.encode(url, goal, tags));
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

        emit ContentSubmitted(contentId, msg.sender, contentHash, url, goal, tags, resolvedCategoryId);

        return contentId;
    }

    /// @notice Cancel content before any votes. Returns submitter stake in cREP.
    /// @dev Only callable by the submitter. VotingEngine must confirm 0 votes.
    function cancelContent(uint256 contentId) external nonReentrant {
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
        require(block.timestamp > _getDormancyAnchor(contentId, c) + DORMANCY_PERIOD, "Dormancy period not elapsed");
        // Prevent dormancy while any round is still open, even if all votes have been revealed.
        if (votingEngine != address(0)) {
            uint256 activeRoundId = IRoundVotingEngine(votingEngine).currentRoundId(contentId);
            if (activeRoundId != 0) {
                (, RoundLib.RoundState roundState,,,,,,,,,,,,) =
                    IRoundVotingEngine(votingEngine).rounds(contentId, activeRoundId);
                require(roundState != RoundLib.RoundState.Open, "Content has active round");
            }
        }

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
    function reviveContent(uint256 contentId) external nonReentrant whenNotPaused {
        Content storage c = contents[contentId];
        require(c.status == ContentStatus.Dormant, "Not dormant");
        require(c.dormantCount < MAX_REVIVALS, "Max revivals reached");

        bytes32 submissionKey = contentSubmissionKey[contentId];
        if (submissionKey != bytes32(0)) {
            require(!submissionKeyUsed[submissionKey], "URL already submitted");
            submissionKeyUsed[submissionKey] = true;
        }

        crepToken.safeTransferFrom(msg.sender, address(this), REVIVAL_STAKE);

        c.status = ContentStatus.Active;
        c.dormantCount++;
        c.lastActivityAt = block.timestamp;
        dormancyAnchorAt[contentId] = block.timestamp;
        c.reviver = msg.sender;

        emit ContentRevived(contentId, msg.sender);
    }

    // --- VotingEngine callbacks ---

    /// @notice Called by VotingEngine to update raw activity timestamp after commits.
    /// @dev Legacy content lazily seeds `dormancyAnchorAt` from the pre-upgrade activity value so
    ///      post-upgrade commit spam cannot keep extending dormancy indefinitely.
    function updateActivity(uint256 contentId) external {
        require(msg.sender == votingEngine, "Only VotingEngine");
        Content storage c = contents[contentId];
        if (dormancyAnchorAt[contentId] == 0) {
            dormancyAnchorAt[contentId] = c.lastActivityAt;
        }
        c.lastActivityAt = block.timestamp;
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

    /// @notice Called by VotingEngine to return submitter stake after milestone 0 resolves favorably.
    function returnSubmitterStake(uint256 contentId) external {
        _returnSubmitterStake(contentId, 0, false);
    }

    /// @notice Called by VotingEngine to return submitter stake with a snapshotted submission reward rate.
    /// @dev This avoids coupling the submitter reward to whatever the live participation rate is when the
    ///      stake finally gets returned.
    function returnSubmitterStakeWithRewardRate(uint256 contentId, uint256 rewardRateBps) external {
        _returnSubmitterStake(contentId, rewardRateBps, true);
    }

    /// @notice Called by VotingEngine once the dormancy window elapses without any settled round.
    function resolvePendingSubmitterStake(uint256 contentId) external {
        require(msg.sender == votingEngine, "Only VotingEngine");
        Content storage c = contents[contentId];
        require(c.id != 0, "Content does not exist");
        _resolvePendingSubmitterStake(contentId, c);
    }

    function _returnSubmitterStake(uint256 contentId, uint256 rewardRateBps, bool useSnapshottedReward) internal {
        require(msg.sender == votingEngine, "Only VotingEngine");
        Content storage c = contents[contentId];
        require(!c.submitterStakeReturned, "Already returned");

        c.submitterStakeReturned = true;
        crepToken.safeTransfer(c.submitter, c.submitterStake);

        // Submission participation rewards are only earned once the stake resolves on the healthy path.
        if (address(participationPool) != address(0)) {
            if (useSnapshottedReward) {
                uint256 rewardAmount = c.submitterStake * rewardRateBps / 10000;
                if (rewardAmount > 0) {
                    try participationPool.distributeReward(c.submitter, rewardAmount) { } catch { }
                }
            } else {
                try participationPool.rewardSubmission(c.submitter, c.submitterStake) { } catch { }
            }
        }

        emit SubmitterStakeReturned(contentId, c.submitterStake);
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
        emit SubmitterStakeReturned(contentId, c.submitterStake);
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

    /// @notice Backfill canonical submitter identity for legacy content created before identity snapshots existed.
    function backfillSubmitterIdentity(uint256 contentId, address submitterIdentity) external onlyRole(CONFIG_ROLE) {
        require(submitterIdentity != address(0), "Invalid address");
        Content storage c = contents[contentId];
        require(c.id != 0, "Content does not exist");

        address currentIdentity = contentSubmitterIdentity[contentId];
        require(currentIdentity == address(0) || currentIdentity == c.submitter, "Submitter identity already set");

        contentSubmitterIdentity[contentId] = submitterIdentity;
        emit SubmitterIdentityBackfilled(contentId, submitterIdentity);
    }

    // --- View functions ---

    function getContent(uint256 contentId) external view returns (Content memory) {
        return contents[contentId];
    }

    function getSubmitter(uint256 contentId) external view returns (address) {
        return contents[contentId].submitter;
    }

    function getSubmitterIdentity(uint256 contentId) external view returns (address) {
        address submitterIdentity = contentSubmitterIdentity[contentId];
        address submitter = contents[contentId].submitter;
        if (submitter == address(0)) return address(0);

        address resolvedSubmitter = _resolveSubmitterIdentity(submitter);
        if (submitterIdentity == address(0) || submitterIdentity == submitter) {
            return resolvedSubmitter;
        }
        return submitterIdentity;
    }

    function isActive(uint256 contentId) external view returns (bool) {
        Content storage c = contents[contentId];
        return c.id != 0 && c.status == ContentStatus.Active;
    }

    function getRating(uint256 contentId) external view returns (uint256) {
        return contents[contentId].rating;
    }

    function getCreatedAt(uint256 contentId) external view returns (uint256) {
        return contents[contentId].createdAt;
    }

    function getDormancyAnchorAt(uint256 contentId) external view returns (uint256) {
        Content storage c = contents[contentId];
        if (c.id == 0) return 0;
        return _getDormancyAnchor(contentId, c);
    }

    function isSubmitterStakeReturned(uint256 contentId) external view returns (bool) {
        return contents[contentId].submitterStakeReturned;
    }

    function isDormancyEligible(uint256 contentId) external view returns (bool) {
        Content storage c = contents[contentId];
        if (c.id == 0 || c.status != ContentStatus.Active) return false;
        return block.timestamp > _getDormancyAnchor(contentId, c) + DORMANCY_PERIOD;
    }

    function isUrlSubmitted(string calldata url) external view returns (bool) {
        if (bytes(url).length == 0 || !_isValidSubmissionUrl(url)) return false;

        if (address(categoryRegistry) == address(0)) {
            return submissionKeyUsed[keccak256(abi.encodePacked(url))];
        }

        try this.resolveSubmissionKey(url) returns (bytes32 submissionKey) {
            return submissionKeyUsed[submissionKey];
        } catch {
            return false;
        }
    }

    function getCategoryId(uint256 contentId) external view returns (uint256) {
        return contents[contentId].categoryId;
    }

    /// @notice Resolve the canonical submission key for a URL using the configured CategoryRegistry.
    /// @dev Exposed for frontend/tests and used internally via try/catch in isUrlSubmitted.
    function resolveSubmissionKey(string calldata url) external view returns (bytes32) {
        require(address(categoryRegistry) != address(0), "CategoryRegistry not set");
        (, bytes32 submissionKey) = _resolveCategoryAndSubmissionKey(url, 0);
        return submissionKey;
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

    function _getDormancyAnchor(uint256 contentId, Content storage c) internal view returns (uint256) {
        uint256 anchor = dormancyAnchorAt[contentId];
        return anchor == 0 ? c.lastActivityAt : anchor;
    }

    function _resolveCategoryAndSubmissionKey(string memory url, uint256 categoryIdHint)
        internal
        view
        returns (uint256 resolvedCategoryId, bytes32 submissionKey)
    {
        ICategoryRegistry.Category memory category = _resolveApprovedCategory(url);
        resolvedCategoryId = category.id;
        require(resolvedCategoryId != 0, "Domain not approved");
        require(categoryRegistry.isApprovedCategory(resolvedCategoryId), "Category not approved");
        if (categoryIdHint != 0) {
            require(categoryIdHint == resolvedCategoryId, "Category mismatch");
        }

        submissionKey = _deriveSubmissionKey(url, category.domain);
    }

    function _resolveApprovedCategory(string memory url)
        internal
        view
        returns (ICategoryRegistry.Category memory category)
    {
        try categoryRegistry.getCategoryByDomain(url) returns (ICategoryRegistry.Category memory directCategory) {
            if (directCategory.id != 0) {
                return directCategory;
            }
        } catch { }

        string memory normalizedHost = _extractNormalizedHost(url);
        string memory aliasDomain = _applyDomainAlias(normalizedHost);
        if (bytes(aliasDomain).length != 0) {
            try categoryRegistry.getCategoryByDomain(aliasDomain) returns (
                ICategoryRegistry.Category memory aliasedCategory
            ) {
                if (aliasedCategory.id != 0) {
                    return aliasedCategory;
                }
            } catch { }
        }

        revert("Domain not approved");
    }

    function _deriveSubmissionKey(string memory url, string memory resolvedDomain) internal pure returns (bytes32) {
        if (_equals(resolvedDomain, "youtube.com")) {
            string memory videoId = _extractYouTubeId(url);
            if (bytes(videoId).length != 0) {
                return keccak256(abi.encodePacked("youtube:", videoId));
            }
        } else if (_equals(resolvedDomain, "twitch.tv")) {
            (string memory kind, string memory twitchId) = _extractTwitchKey(url);
            if (bytes(twitchId).length != 0) {
                return keccak256(abi.encodePacked("twitch:", kind, ":", twitchId));
            }
        } else if (_equals(resolvedDomain, "x.com")) {
            string memory tweetId = _extractTwitterStatusId(url);
            if (bytes(tweetId).length != 0) {
                return keccak256(abi.encodePacked("x:", tweetId));
            }
        } else if (_equals(resolvedDomain, "github.com")) {
            (string memory owner, string memory repo) = _extractGitHubRepo(url);
            if (bytes(owner).length != 0 && bytes(repo).length != 0) {
                return keccak256(abi.encodePacked("github:", owner, "/", repo));
            }
        } else if (_equals(resolvedDomain, "scryfall.com")) {
            (string memory setCode, string memory collectorNumber) = _extractScryfallCard(url);
            if (bytes(setCode).length != 0 && bytes(collectorNumber).length != 0) {
                return keccak256(abi.encodePacked("scryfall:", setCode, "/", collectorNumber));
            }
        } else if (_equals(resolvedDomain, "themoviedb.org")) {
            string memory movieId = _extractTmdbMovieId(url);
            if (bytes(movieId).length != 0) {
                return keccak256(abi.encodePacked("tmdb:", movieId));
            }
        } else if (_equals(resolvedDomain, "en.wikipedia.org")) {
            string memory articleTitle = _extractWikipediaTitle(url);
            if (bytes(articleTitle).length != 0) {
                return keccak256(abi.encodePacked("wikipedia:", articleTitle));
            }
        } else if (_equals(resolvedDomain, "rawg.io")) {
            string memory gameSlug = _extractRawgSlug(url);
            if (bytes(gameSlug).length != 0) {
                return keccak256(abi.encodePacked("rawg:", gameSlug));
            }
        } else if (_equals(resolvedDomain, "openlibrary.org")) {
            (string memory kind, string memory openLibraryId) = _extractOpenLibraryKey(url);
            if (bytes(kind).length != 0 && bytes(openLibraryId).length != 0) {
                return keccak256(abi.encodePacked("openlibrary:", kind, ":", openLibraryId));
            }
        } else if (_equals(resolvedDomain, "huggingface.co")) {
            string memory modelId = _extractHuggingFaceModelId(url);
            if (bytes(modelId).length != 0) {
                return keccak256(abi.encodePacked("huggingface:", modelId));
            }
        } else if (_equals(resolvedDomain, "coingecko.com")) {
            string memory coinSlug = _extractCoinGeckoSlug(url);
            if (bytes(coinSlug).length != 0) {
                return keccak256(abi.encodePacked("coingecko:", coinSlug));
            }
        } else if (_equals(resolvedDomain, "open.spotify.com")) {
            (string memory kind, string memory spotifyId) = _extractSpotifyKey(url);
            if (bytes(kind).length != 0 && bytes(spotifyId).length != 0) {
                return keccak256(abi.encodePacked("spotify:", kind, ":", spotifyId));
            }
        }

        return keccak256(abi.encodePacked("url:", _normalizeGenericUrl(url, resolvedDomain)));
    }

    function _applyDomainAlias(string memory host) internal pure returns (string memory) {
        if (_equals(host, "youtu.be") || _equals(host, "m.youtube.com")) return "youtube.com";
        if (_equals(host, "clips.twitch.tv") || _equals(host, "m.twitch.tv")) return "twitch.tv";
        if (_equals(host, "twitter.com") || _equals(host, "mobile.twitter.com")) return "x.com";
        return "";
    }

    function _extractYouTubeId(string memory url) internal pure returns (string memory) {
        string memory host = _extractNormalizedHost(url);
        if (_equals(host, "youtu.be")) {
            return _getPathSegment(url, 0);
        }

        if (_equals(host, "youtube.com") || _equals(host, "m.youtube.com")) {
            string memory watchPath = _normalizePath(url);
            if (_equals(watchPath, "/watch")) {
                return _getQueryParam(url, "v");
            }

            if (_startsWithString(watchPath, "/embed/")) {
                return _sliceString(watchPath, 7, bytes(watchPath).length);
            }
        }

        return "";
    }

    function _extractTwitchKey(string memory url) internal pure returns (string memory kind, string memory contentId) {
        string memory host = _extractNormalizedHost(url);
        if (_equals(host, "clips.twitch.tv")) {
            contentId = _getPathSegment(url, 0);
            if (bytes(contentId).length != 0) return ("clip", contentId);
        }

        if (_equals(host, "twitch.tv") || _equals(host, "m.twitch.tv")) {
            string memory first = _getPathSegment(url, 0);
            string memory second = _getPathSegment(url, 1);
            string memory third = _getPathSegment(url, 2);

            if (_equals(first, "videos") && bytes(second).length != 0) {
                return ("video", second);
            }

            if (bytes(first).length != 0 && _equals(second, "clip") && bytes(third).length != 0) {
                return ("clip", third);
            }

            if (bytes(first).length != 0 && bytes(second).length == 0) {
                return ("channel", _toLower(first));
            }
        }

        return ("", "");
    }

    function _extractTwitterStatusId(string memory url) internal pure returns (string memory) {
        string memory host = _extractNormalizedHost(url);
        if (
            !_equals(host, "x.com") && !_equals(host, "twitter.com") && !_equals(host, "mobile.twitter.com")
                && !_equals(host, "www.x.com") && !_equals(host, "www.twitter.com")
        ) {
            return "";
        }

        string memory second = _getPathSegment(url, 1);
        if (!_equals(second, "status")) return "";
        return _getPathSegment(url, 2);
    }

    function _extractGitHubRepo(string memory url) internal pure returns (string memory owner, string memory repo) {
        string memory host = _extractNormalizedHost(url);
        if (!_equals(host, "github.com")) return ("", "");

        owner = _toLower(_getPathSegment(url, 0));
        repo = _toLower(_getPathSegment(url, 1));
        if (bytes(owner).length == 0 || bytes(repo).length == 0) return ("", "");

        if (
            _equals(owner, "settings") || _equals(owner, "explore") || _equals(owner, "topics")
                || _equals(owner, "trending") || _equals(owner, "collections") || _equals(owner, "sponsors")
                || _equals(owner, "issues") || _equals(owner, "pulls") || _equals(owner, "marketplace")
                || _equals(owner, "features") || _equals(owner, "enterprise") || _equals(owner, "pricing")
                || _equals(owner, "login") || _equals(owner, "signup") || _equals(owner, "join")
                || _equals(owner, "organizations") || _equals(owner, "notifications") || _equals(owner, "new")
                || _equals(owner, "about") || _equals(owner, "contact") || _equals(owner, "security")
                || _equals(owner, "customer-stories")
        ) {
            return ("", "");
        }
    }

    function _extractScryfallCard(string memory url)
        internal
        pure
        returns (string memory setCode, string memory collectorNumber)
    {
        string memory host = _extractNormalizedHost(url);
        if (!_equals(host, "scryfall.com")) return ("", "");
        if (!_equals(_getPathSegment(url, 0), "card")) return ("", "");

        setCode = _toLower(_getPathSegment(url, 1));
        collectorNumber = _toLower(_getPathSegment(url, 2));
        if (bytes(setCode).length == 0 || bytes(collectorNumber).length == 0) {
            return ("", "");
        }
    }

    function _extractTmdbMovieId(string memory url) internal pure returns (string memory) {
        string memory host = _extractNormalizedHost(url);
        if (!_equals(host, "themoviedb.org")) return "";
        if (!_equals(_getPathSegment(url, 0), "movie")) return "";

        return _extractLeadingDigits(_getPathSegment(url, 1));
    }

    function _extractWikipediaTitle(string memory url) internal pure returns (string memory) {
        string memory host = _extractNormalizedHost(url);
        if (!_equals(host, "en.wikipedia.org")) return "";

        string memory path = _normalizePath(url);
        if (!_startsWithString(path, "/wiki/")) return "";
        return _sliceString(path, 6, bytes(path).length);
    }

    function _extractRawgSlug(string memory url) internal pure returns (string memory) {
        string memory host = _extractNormalizedHost(url);
        if (!_equals(host, "rawg.io")) return "";
        if (!_equals(_getPathSegment(url, 0), "games")) return "";

        return _toLower(_getPathSegment(url, 1));
    }

    function _extractOpenLibraryKey(string memory url) internal pure returns (string memory kind, string memory id) {
        string memory host = _extractNormalizedHost(url);
        if (!_equals(host, "openlibrary.org")) return ("", "");

        kind = _getPathSegment(url, 0);
        id = _toUpper(_getPathSegment(url, 1));

        if (_equals(kind, "works") && _isOpenLibraryId(id, "W")) return (kind, id);
        if (_equals(kind, "books") && _isOpenLibraryId(id, "M")) return (kind, id);
        return ("", "");
    }

    function _extractHuggingFaceModelId(string memory url) internal pure returns (string memory) {
        string memory host = _extractNormalizedHost(url);
        if (!_equals(host, "huggingface.co")) return "";

        string memory owner = _getPathSegment(url, 0);
        string memory model = _getPathSegment(url, 1);
        if (bytes(owner).length == 0 || bytes(model).length == 0) return "";
        if (_isReservedHuggingFaceNamespace(owner)) return "";

        return string(abi.encodePacked(owner, "/", model));
    }

    function _extractCoinGeckoSlug(string memory url) internal pure returns (string memory) {
        string memory host = _extractNormalizedHost(url);
        if (!_equals(host, "coingecko.com")) return "";

        string memory first = _getPathSegment(url, 0);
        string memory second = _getPathSegment(url, 1);
        string memory third = _getPathSegment(url, 2);

        if (_equals(first, "coins") && bytes(second).length != 0) {
            return _toLower(second);
        }

        if (bytes(first).length == 2 && _equals(second, "coins") && bytes(third).length != 0) {
            return _toLower(third);
        }

        return "";
    }

    function _extractSpotifyKey(string memory url) internal pure returns (string memory kind, string memory id) {
        string memory host = _extractNormalizedHost(url);
        if (!_equals(host, "open.spotify.com")) return ("", "");

        uint256 index = 0;
        string memory first = _getPathSegment(url, index);
        if (_startsWithString(first, "intl-")) {
            index++;
            first = _getPathSegment(url, index);
        }

        if (_equals(first, "embed")) {
            index++;
            first = _getPathSegment(url, index);
        }

        if (!_equals(first, "show") && !_equals(first, "episode")) return ("", "");

        kind = first;
        id = _getPathSegment(url, index + 1);
        if (!_isAlphaNumeric(id)) return ("", "");
        return (kind, id);
    }

    function _normalizeGenericUrl(string memory url, string memory resolvedDomain)
        internal
        pure
        returns (string memory)
    {
        string memory path = _normalizePath(url);
        string memory query = _normalizeQuery(url);
        return string(abi.encodePacked("https://", resolvedDomain, path, query));
    }

    function _extractNormalizedHost(string memory url) internal pure returns (string memory) {
        bytes memory urlBytes = bytes(url);
        uint256 start = 8; // Skip https:// after _isValidSubmissionUrl.
        uint256 end = start;
        while (end < urlBytes.length) {
            bytes1 char = urlBytes[end];
            if (char == "/" || char == ":" || char == "?" || char == "#") break;
            end++;
        }

        if (end <= start) return "";

        bytes memory host = new bytes(end - start);
        for (uint256 i = start; i < end; i++) {
            bytes1 char = urlBytes[i];
            if (char >= 0x41 && char <= 0x5A) {
                host[i - start] = bytes1(uint8(char) + 32);
            } else {
                host[i - start] = char;
            }
        }

        uint256 hostStart = 0;
        if (host.length >= 4 && host[0] == "w" && host[1] == "w" && host[2] == "w" && host[3] == ".") {
            hostStart = 4;
        }

        uint256 hostEnd = host.length;
        if (hostEnd > hostStart && host[hostEnd - 1] == ".") {
            hostEnd--;
        }

        return _sliceBytesToString(host, hostStart, hostEnd);
    }

    function _normalizePath(string memory url) internal pure returns (string memory) {
        bytes memory urlBytes = bytes(url);
        uint256 authorityEnd = 8;
        while (authorityEnd < urlBytes.length) {
            bytes1 char = urlBytes[authorityEnd];
            if (char == "/" || char == "?" || char == "#") break;
            authorityEnd++;
        }

        if (authorityEnd >= urlBytes.length || urlBytes[authorityEnd] != "/") {
            return "/";
        }

        uint256 pathEnd = authorityEnd;
        while (pathEnd < urlBytes.length) {
            bytes1 char = urlBytes[pathEnd];
            if (char == "?" || char == "#") break;
            pathEnd++;
        }

        while (pathEnd > authorityEnd + 1 && urlBytes[pathEnd - 1] == "/") {
            pathEnd--;
        }

        return _sliceBytesToString(urlBytes, authorityEnd, pathEnd);
    }

    function _normalizeQuery(string memory url) internal pure returns (string memory) {
        bytes memory urlBytes = bytes(url);
        uint256 queryStart = 0;
        while (queryStart < urlBytes.length && urlBytes[queryStart] != "?") {
            if (urlBytes[queryStart] == "#") return "";
            queryStart++;
        }
        if (queryStart >= urlBytes.length || urlBytes[queryStart] != "?") return "";

        uint256 queryEnd = queryStart + 1;
        while (queryEnd < urlBytes.length && urlBytes[queryEnd] != "#") {
            queryEnd++;
        }

        if (queryEnd == queryStart + 1) return "";
        return string(abi.encodePacked("?", _sliceBytesToString(urlBytes, queryStart + 1, queryEnd)));
    }

    function _getPathSegment(string memory url, uint256 segmentIndex) internal pure returns (string memory) {
        bytes memory pathBytes = bytes(_normalizePath(url));
        if (pathBytes.length <= 1) return "";

        uint256 currentIndex = 0;
        uint256 segmentStart = 1;
        while (segmentStart < pathBytes.length) {
            uint256 segmentEnd = segmentStart;
            while (segmentEnd < pathBytes.length && pathBytes[segmentEnd] != "/") {
                segmentEnd++;
            }

            if (currentIndex == segmentIndex) {
                return _sliceBytesToString(pathBytes, segmentStart, segmentEnd);
            }

            currentIndex++;
            segmentStart = segmentEnd + 1;
        }

        return "";
    }

    function _getQueryParam(string memory url, string memory key) internal pure returns (string memory) {
        bytes memory queryBytes = bytes(_normalizeQuery(url));
        if (queryBytes.length <= 1) return "";

        bytes memory keyBytes = bytes(key);
        uint256 cursor = 1; // skip '?'
        while (cursor < queryBytes.length) {
            uint256 pairEnd = cursor;
            while (pairEnd < queryBytes.length && queryBytes[pairEnd] != "&") {
                pairEnd++;
            }

            uint256 eqIndex = cursor;
            while (eqIndex < pairEnd && queryBytes[eqIndex] != "=") {
                eqIndex++;
            }

            if (eqIndex > cursor && eqIndex - cursor == keyBytes.length) {
                bool matches = true;
                for (uint256 i = 0; i < keyBytes.length; i++) {
                    if (queryBytes[cursor + i] != keyBytes[i]) {
                        matches = false;
                        break;
                    }
                }

                if (matches && eqIndex < pairEnd) {
                    return _sliceBytesToString(queryBytes, eqIndex + 1, pairEnd);
                }
            }

            cursor = pairEnd + 1;
        }

        return "";
    }

    function _startsWithString(string memory value, string memory prefix) internal pure returns (bool) {
        bytes memory valueBytes = bytes(value);
        bytes memory prefixBytes = bytes(prefix);
        if (valueBytes.length < prefixBytes.length) return false;
        for (uint256 i = 0; i < prefixBytes.length; i++) {
            if (valueBytes[i] != prefixBytes[i]) return false;
        }
        return true;
    }

    function _sliceString(string memory value, uint256 start, uint256 end) internal pure returns (string memory) {
        return _sliceBytesToString(bytes(value), start, end);
    }

    function _sliceBytesToString(bytes memory value, uint256 start, uint256 end) internal pure returns (string memory) {
        if (end <= start) return "";
        bytes memory out = new bytes(end - start);
        for (uint256 i = start; i < end; i++) {
            out[i - start] = value[i];
        }
        return string(out);
    }

    function _toLower(string memory value) internal pure returns (string memory) {
        bytes memory data = bytes(value);
        bytes memory lowered = new bytes(data.length);
        for (uint256 i = 0; i < data.length; i++) {
            bytes1 char = data[i];
            if (char >= 0x41 && char <= 0x5A) {
                lowered[i] = bytes1(uint8(char) + 32);
            } else {
                lowered[i] = char;
            }
        }
        return string(lowered);
    }

    function _toUpper(string memory value) internal pure returns (string memory) {
        bytes memory data = bytes(value);
        bytes memory upper = new bytes(data.length);
        for (uint256 i = 0; i < data.length; i++) {
            bytes1 char = data[i];
            if (char >= 0x61 && char <= 0x7A) {
                upper[i] = bytes1(uint8(char) - 32);
            } else {
                upper[i] = char;
            }
        }
        return string(upper);
    }

    function _extractLeadingDigits(string memory value) internal pure returns (string memory) {
        bytes memory data = bytes(value);
        uint256 end = 0;
        while (end < data.length && data[end] >= 0x30 && data[end] <= 0x39) {
            end++;
        }
        return _sliceBytesToString(data, 0, end);
    }

    function _isOpenLibraryId(string memory value, bytes1 suffix) internal pure returns (bool) {
        bytes memory data = bytes(value);
        if (data.length < 3 || data[0] != "O" || data[1] != "L" || data[data.length - 1] != suffix) return false;
        for (uint256 i = 2; i + 1 < data.length; i++) {
            if (data[i] < 0x30 || data[i] > 0x39) return false;
        }
        return true;
    }

    function _isReservedHuggingFaceNamespace(string memory value) internal pure returns (bool) {
        return _equals(value, "docs") || _equals(value, "spaces") || _equals(value, "datasets")
            || _equals(value, "models") || _equals(value, "tasks") || _equals(value, "blog")
            || _equals(value, "pricing") || _equals(value, "enterprise") || _equals(value, "login")
            || _equals(value, "join") || _equals(value, "settings") || _equals(value, "notifications")
            || _equals(value, "papers");
    }

    function _isAlphaNumeric(string memory value) internal pure returns (bool) {
        bytes memory data = bytes(value);
        if (data.length == 0) return false;
        for (uint256 i = 0; i < data.length; i++) {
            bytes1 char = data[i];
            bool isDigit = char >= 0x30 && char <= 0x39;
            bool isUpper = char >= 0x41 && char <= 0x5A;
            bool isLower = char >= 0x61 && char <= 0x7A;
            if (!isDigit && !isUpper && !isLower) return false;
        }
        return true;
    }

    function _equals(string memory left, string memory right) internal pure returns (bool) {
        return keccak256(bytes(left)) == keccak256(bytes(right));
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
