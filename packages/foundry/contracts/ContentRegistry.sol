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
    uint256 public constant CONTENT_EXPIRY = 90 days;
    uint8 public constant MAX_REVIVALS = 2;

    // Submitter stake rules
    uint256 public constant STAKE_GRACE_EPOCHS = 96; // Grace period before slash possible (~24 hours at 15-min epochs)
    uint256 public constant STAKE_RETURN_EPOCHS = 384; // Auto-return after this many epochs (~4 days at 15-min epochs)
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
        uint256 categoryId; // Reference to approved category (0 = legacy content)
    }

    // --- State ---
    IERC20 public crepToken;
    address public votingEngine;
    ICategoryRegistry public categoryRegistry;
    address public bonusPool; // Receives cancellation fees (anti-spam)
    address public treasury; // Receives 100% of slashed stakes (governance timelock)
    uint256 public nextContentId;
    mapping(uint256 => Content) public contents;
    mapping(bytes32 => bool) public urlSubmitted; // Track submitted URLs to prevent duplicates
    IVoterIdNFT public voterIdNFT; // Voter ID NFT for sybil resistance

    /// @notice Participation pool for rewarding submitters
    IParticipationPool public participationPool;

    /// @notice URL hash per content ID (for clearing urlSubmitted on cancel)
    mapping(uint256 => bytes32) internal contentUrlHash;

    /// @dev Reserved storage gap for future upgrades
    uint256[49] private __gap;

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

    /// @notice Set the bonus pool address that receives cancellation fees (can only be called by CONFIG_ROLE).
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
    /// @param categoryId The category ID (must be approved, or 0 for legacy content).
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
        require(bytes(goal).length > 0, "Goal required");
        require(bytes(goal).length <= MAX_GOAL_LENGTH, "Goal too long");
        require(bytes(tags).length > 0, "Tags required");
        require(bytes(tags).length <= MAX_TAGS_LENGTH, "Tags too long");

        // Validate category is approved (categoryId = 0 allowed for legacy content)
        if (categoryId != 0) {
            require(address(categoryRegistry) != address(0), "CategoryRegistry not set");
            require(categoryRegistry.isApprovedCategory(categoryId), "Category not approved");
        }

        // Prevent duplicate URL submissions
        bytes32 urlHash = keccak256(abi.encodePacked(url));
        require(!urlSubmitted[urlHash], "URL already submitted");
        urlSubmitted[urlHash] = true;

        bytes32 contentHash = keccak256(abi.encode(url, goal, tags));

        crepToken.safeTransferFrom(msg.sender, address(this), MIN_SUBMITTER_STAKE);

        uint256 contentId = nextContentId++;
        contentUrlHash[contentId] = urlHash;
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
            categoryId: categoryId
        });

        emit ContentSubmitted(contentId, msg.sender, contentHash, url, goal, tags, categoryId);

        // Participation reward (if pool is configured)
        if (address(participationPool) != address(0)) {
            participationPool.rewardSubmission(msg.sender, MIN_SUBMITTER_STAKE);
        }

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
            require(IRoundVotingEngine(votingEngine).getContentVoteCount(contentId) == 0, "Content has votes");
        }

        c.status = ContentStatus.Cancelled;

        // Clear URL submission flag so the URL can be resubmitted
        bytes32 urlHash = contentUrlHash[contentId];
        if (urlHash != bytes32(0)) {
            urlSubmitted[urlHash] = false;
        }

        // Return stake minus cancellation fee (fee goes to bonus pool to prevent spam)
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

    /// @notice Mark content as dormant if it hasn't reached milestone 0 within DORMANCY_PERIOD.
    /// @dev Anyone can call this. Returns submitter stake in cREP.
    function markDormant(uint256 contentId) external nonReentrant {
        Content storage c = contents[contentId];
        require(c.status == ContentStatus.Active, "Not active");
        require(block.timestamp > c.lastActivityAt + DORMANCY_PERIOD, "Dormancy period not elapsed");
        // Prevent dormancy if content has active votes in an open round
        if (votingEngine != address(0)) {
            require(!IRoundVotingEngine(votingEngine).hasActiveVotes(contentId), "Content has active votes");
        }

        c.status = ContentStatus.Dormant;

        // Return submitter stake if not already returned
        if (!c.submitterStakeReturned) {
            c.submitterStakeReturned = true;
            crepToken.safeTransfer(c.submitter, c.submitterStake);
            emit SubmitterStakeReturned(contentId, c.submitterStake);
        }

        emit ContentDormant(contentId);
    }

    /// @notice Revive dormant content by staking REVIVAL_STAKE cREP tokens.
    /// @dev Resets the activity timer. Max MAX_REVIVALS revivals per content.
    function reviveContent(uint256 contentId) external nonReentrant whenNotPaused {
        Content storage c = contents[contentId];
        require(c.status == ContentStatus.Dormant, "Not dormant");
        require(c.dormantCount < MAX_REVIVALS, "Max revivals reached");

        crepToken.safeTransferFrom(msg.sender, address(this), REVIVAL_STAKE);

        c.status = ContentStatus.Active;
        c.dormantCount++;
        c.lastActivityAt = block.timestamp;
        c.reviver = msg.sender;

        emit ContentRevived(contentId, msg.sender);
    }

    // --- VotingEngine callbacks ---

    /// @notice Called by VotingEngine to update last activity timestamp.
    function updateActivity(uint256 contentId) external {
        require(msg.sender == votingEngine, "Only VotingEngine");
        contents[contentId].lastActivityAt = block.timestamp;
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
        require(msg.sender == votingEngine, "Only VotingEngine");
        Content storage c = contents[contentId];
        require(!c.submitterStakeReturned, "Already returned");

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

    // --- View functions ---

    function getContent(uint256 contentId) external view returns (Content memory) {
        return contents[contentId];
    }

    function getSubmitter(uint256 contentId) external view returns (address) {
        return contents[contentId].submitter;
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

    function isSubmitterStakeReturned(uint256 contentId) external view returns (bool) {
        return contents[contentId].submitterStakeReturned;
    }

    function isUrlSubmitted(string calldata url) external view returns (bool) {
        return urlSubmitted[keccak256(abi.encodePacked(url))];
    }

    function getCategoryId(uint256 contentId) external view returns (uint256) {
        return contents[contentId].categoryId;
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
