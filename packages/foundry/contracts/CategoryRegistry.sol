// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { IGovernor } from "@openzeppelin/contracts/governance/IGovernor.sol";
import { ICategoryRegistry } from "./interfaces/ICategoryRegistry.sol";
import { IRoundVotingEngine } from "./interfaces/IRoundVotingEngine.sol";
import { IVoterIdNFT } from "./interfaces/IVoterIdNFT.sol";

/// @title CategoryRegistry
/// @notice Manages content categories/platforms with governance-based approval.
/// @dev Categories require 500 cREP stake and a separately sponsored governance approval proposal to become active.
///      Rejected categories lose their stake to the consensus reserve.
contract CategoryRegistry is ICategoryRegistry, AccessControl, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    // --- Access Control Roles ---
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    // --- Constants ---
    uint256 public constant CATEGORY_STAKE = 500e6; // 500 cREP (6 decimals)
    uint256 public constant MAX_NAME_LENGTH = 64;
    uint256 public constant MAX_DOMAIN_LENGTH = 256;
    uint256 public constant MAX_SUBCATEGORIES = 20;
    uint256 public constant MAX_SUBCATEGORY_LENGTH = 32;
    uint256 public constant SPONSORSHIP_WINDOW = 7 days;
    uint256 public constant STALE_LINKED_PROPOSAL_TIMEOUT = 14 days;

    // --- State ---
    IERC20 public immutable token;
    IGovernor public governor;
    address public timelock;
    IRoundVotingEngine public votingEngine;

    uint256 public nextCategoryId;
    mapping(uint256 => Category) private _categories;
    mapping(bytes32 => uint256) private _approvedDomainToCategory; // domain hash => approved categoryId
    mapping(bytes32 => uint256) private _pendingDomainReservation; // domain hash => pending linked categoryId
    mapping(uint256 => uint256) private _proposalLinkedAt; // categoryId => timestamp when current proposal was linked
    uint256[] private _approvedCategoryIds;
    IVoterIdNFT public voterIdNFT; // Voter ID NFT for sybil resistance

    // --- Events ---
    event VoterIdNFTUpdated(address voterIdNFT);
    event GovernanceUpdated(address indexed governor, address indexed timelock);

    // --- Constructor ---
    constructor(address _admin, address _token, address _governor, address _timelock, address _votingEngine) {
        require(_admin != address(0), "Invalid admin");
        require(_token != address(0), "Invalid token");
        require(_governor != address(0), "Invalid governor");
        require(_timelock != address(0), "Invalid timelock");
        require(_votingEngine != address(0), "Invalid voting engine");

        // Timelock (governance) gets all permanent roles
        _grantRole(DEFAULT_ADMIN_ROLE, _timelock);
        _grantRole(ADMIN_ROLE, _timelock);

        // Admin gets only ADMIN_ROLE for initial category seeding
        if (_admin != _timelock) {
            _grantRole(ADMIN_ROLE, _admin);
        }

        token = IERC20(_token);
        governor = IGovernor(_governor);
        timelock = _timelock;
        votingEngine = IRoundVotingEngine(_votingEngine);
        nextCategoryId = 1;
    }

    // --- Admin Functions ---

    /// @notice Set the Voter ID NFT contract for sybil resistance
    /// @param _voterIdNFT The Voter ID NFT contract address
    function setVoterIdNFT(address _voterIdNFT) external onlyRole(ADMIN_ROLE) {
        require(_voterIdNFT != address(0), "Invalid address");
        voterIdNFT = IVoterIdNFT(_voterIdNFT);
        emit VoterIdNFTUpdated(_voterIdNFT);
    }

    /// @notice Update the governor and timelock references after a governance migration.
    /// @dev Transfers the permanent timelock roles to the new timelock address.
    function updateGovernance(address _governor, address _timelock) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_governor != address(0), "Invalid governor");
        require(_timelock != address(0), "Invalid timelock");

        address previousTimelock = timelock;
        governor = IGovernor(_governor);
        timelock = _timelock;

        if (_timelock != previousTimelock) {
            _grantRole(DEFAULT_ADMIN_ROLE, _timelock);
            _grantRole(ADMIN_ROLE, _timelock);
            _revokeRole(ADMIN_ROLE, previousTimelock);
            _revokeRole(DEFAULT_ADMIN_ROLE, previousTimelock);
        }

        emit GovernanceUpdated(_governor, _timelock);
    }

    // --- Category Submission ---

    /// @notice Submit a new category draft for governance approval sponsorship.
    /// @dev Requires 500 cREP stake. The domain is only reserved once a sponsored approval proposal is linked.
    /// @param name The category name (e.g., "YouTube", "MTG")
    /// @param domain The category domain (e.g., "youtube.com", "gatherer.wizards.com")
    /// @param subcategories Array of subcategory names (e.g., ["Education", "Gaming"])
    /// @return categoryId The ID of the submitted category
    function submitCategory(string calldata name, string calldata domain, string[] calldata subcategories)
        external
        nonReentrant
        returns (uint256 categoryId)
    {
        // Require Voter ID if VoterIdNFT is configured
        if (address(voterIdNFT) != address(0)) {
            require(voterIdNFT.hasVoterId(msg.sender), "Voter ID required");
            require(voterIdNFT.resolveHolder(msg.sender) == msg.sender, "Category submitter must hold Voter ID");
        }

        // Validate inputs
        require(bytes(name).length > 0 && bytes(name).length <= MAX_NAME_LENGTH, "Invalid name length");
        require(bytes(domain).length > 0 && bytes(domain).length <= MAX_DOMAIN_LENGTH, "Invalid domain length");
        require(subcategories.length > 0 && subcategories.length <= MAX_SUBCATEGORIES, "Invalid subcategories count");

        // Validate subcategories
        for (uint256 i = 0; i < subcategories.length; i++) {
            require(
                bytes(subcategories[i]).length > 0 && bytes(subcategories[i]).length <= MAX_SUBCATEGORY_LENGTH,
                "Invalid subcategory length"
            );
        }

        string memory normalizedDomain = _normalizeDomain(domain);
        require(bytes(normalizedDomain).length > 0, "Empty domain after normalization"); // L-13 fix

        // Approved or already-linked domains cannot be drafted again.
        bytes32 domainHash = keccak256(abi.encodePacked(normalizedDomain));
        require(_approvedDomainToCategory[domainHash] == 0, "Domain already registered");
        require(_pendingDomainReservation[domainHash] == 0, "Domain already registered");

        // Take stake from user
        token.safeTransferFrom(msg.sender, address(this), CATEGORY_STAKE);

        // Create category
        categoryId = nextCategoryId++;
        _categories[categoryId] = Category({
            id: categoryId,
            name: name,
            domain: normalizedDomain,
            subcategories: subcategories,
            submitter: msg.sender,
            stakeAmount: CATEGORY_STAKE,
            status: CategoryStatus.Pending,
            proposalId: 0,
            createdAt: block.timestamp
        });

        emit CategorySubmitted(categoryId, msg.sender, name, normalizedDomain, 0);
    }

    /// @notice Link the separately created governor approval proposal for a pending category.
    /// @param categoryId The pending category ID.
    /// @param descriptionHash Keccak-256 hash of the exact governor proposal description.
    /// @return proposalId The canonical governor proposal ID for this category.
    function linkApprovalProposal(uint256 categoryId, bytes32 descriptionHash)
        external
        nonReentrant
        returns (uint256 proposalId)
    {
        Category storage cat = _categories[categoryId];
        require(cat.id != 0, "Category does not exist");
        require(cat.submitter == msg.sender, "Not submitter");
        require(cat.status == CategoryStatus.Pending, "Not pending");
        require(cat.proposalId == 0, "Proposal already linked");
        require(block.timestamp <= cat.createdAt + SPONSORSHIP_WINDOW, "Sponsorship window expired");

        proposalId = getApprovalProposalId(categoryId, descriptionHash);
        require(governor.proposalProposer(proposalId) != address(0), "Proposal not found");
        require(_isLinkableProposalState(governor.state(proposalId)), "Proposal not linkable");

        bytes32 domainHash = keccak256(abi.encodePacked(cat.domain));
        require(_approvedDomainToCategory[domainHash] == 0, "Domain already registered");
        require(_pendingDomainReservation[domainHash] == 0, "Domain already registered");

        cat.proposalId = proposalId;
        _proposalLinkedAt[categoryId] = block.timestamp;
        _pendingDomainReservation[domainHash] = categoryId;
        emit CategoryProposalLinked(categoryId, proposalId, descriptionHash);
    }

    /// @notice Clear a linked approval proposal after it was canceled, expired, or left succeeded but unqueued past
    ///         the stale timeout.
    /// @dev This lets the submitter either relink a fresh proposal before the sponsorship window ends
    ///      or reclaim stake via cancelUnlinkedCategory() after the window has passed.
    function clearApprovalProposal(uint256 categoryId) external nonReentrant {
        Category storage cat = _categories[categoryId];
        require(cat.id != 0, "Category does not exist");
        require(cat.submitter == msg.sender, "Not submitter");
        require(cat.status == CategoryStatus.Pending, "Not pending");
        require(cat.proposalId != 0, "Proposal not linked");

        IGovernor.ProposalState proposalState = governor.state(cat.proposalId);
        require(
            proposalState == IGovernor.ProposalState.Canceled || proposalState == IGovernor.ProposalState.Expired
                || (
                    proposalState == IGovernor.ProposalState.Succeeded
                        && block.timestamp > _proposalLinkedAt[categoryId] + STALE_LINKED_PROPOSAL_TIMEOUT
                ),
            "Proposal not clearable"
        );

        cat.proposalId = 0;
        delete _proposalLinkedAt[categoryId];
        _releasePendingDomain(cat, categoryId);
    }

    /// @notice Cancel an unsponsored category after the sponsorship window and reclaim the submitter stake.
    /// @dev Only possible while no approval proposal has been linked.
    function cancelUnlinkedCategory(uint256 categoryId) external nonReentrant {
        Category storage cat = _categories[categoryId];
        require(cat.id != 0, "Category does not exist");
        require(cat.submitter == msg.sender, "Not submitter");
        require(cat.status == CategoryStatus.Pending, "Not pending");
        require(cat.proposalId == 0, "Proposal already linked");
        require(block.timestamp > cat.createdAt + SPONSORSHIP_WINDOW, "Sponsorship window active");

        cat.status = CategoryStatus.Canceled;

        _releasePendingDomain(cat, categoryId);

        token.safeTransfer(cat.submitter, cat.stakeAmount);
        emit CategoryCanceled(categoryId);
    }

    // --- Governance Callbacks ---

    /// @notice Approve a category after successful governance vote
    /// @dev Only callable by the timelock while the exact linked proposal is being executed from the queued state.
    /// @param categoryId The pending category to approve.
    /// @param descriptionHash Keccak-256 hash of the exact governor proposal description linked to the category.
    function approveCategory(uint256 categoryId, bytes32 descriptionHash) external nonReentrant {
        require(msg.sender == timelock, "Only timelock");

        Category storage cat = _categories[categoryId];
        require(cat.id != 0, "Category does not exist");
        require(cat.status == CategoryStatus.Pending, "Not pending");
        require(cat.proposalId != 0, "Proposal not linked");

        uint256 expectedProposalId = getApprovalProposalId(categoryId, descriptionHash);
        require(expectedProposalId == cat.proposalId, "Wrong proposal");
        require(governor.state(expectedProposalId) == IGovernor.ProposalState.Queued, "Proposal not queued");

        bytes32 domainHash = keccak256(abi.encodePacked(cat.domain));
        require(_approvedDomainToCategory[domainHash] == 0, "Domain already registered");
        require(_pendingDomainReservation[domainHash] == categoryId, "Domain not reserved for category");

        cat.status = CategoryStatus.Approved;
        delete _proposalLinkedAt[categoryId];
        delete _pendingDomainReservation[domainHash];
        _approvedDomainToCategory[domainHash] = categoryId;
        _approvedCategoryIds.push(categoryId);

        // Return stake to submitter
        token.safeTransfer(cat.submitter, cat.stakeAmount);

        emit CategoryApproved(categoryId);
    }

    /// @notice Reject a category after governance vote is defeated
    /// @dev Can be called by anyone after the linked proposal is defeated
    function rejectCategory(uint256 categoryId) external nonReentrant {
        Category storage cat = _categories[categoryId];
        require(cat.id != 0, "Category does not exist");
        require(cat.status == CategoryStatus.Pending, "Not pending");
        require(cat.proposalId != 0, "Proposal not linked");

        // Check that the governance proposal has failed
        IGovernor.ProposalState proposalState = governor.state(cat.proposalId);
        require(proposalState == IGovernor.ProposalState.Defeated, "Proposal not defeated");

        cat.status = CategoryStatus.Rejected;
        delete _proposalLinkedAt[categoryId];

        _releasePendingDomain(cat, categoryId);

        // Send stake to consensus reserve (0% return on rejection)
        token.forceApprove(address(votingEngine), cat.stakeAmount);
        votingEngine.addToConsensusReserve(cat.stakeAmount);

        emit CategoryRejected(categoryId);
    }

    // --- Admin Functions ---

    /// @notice Add an approved category directly (for initial seeding)
    /// @dev Only callable by admin. No stake required.
    function addApprovedCategory(
        string calldata name,
        string calldata domain,
        string[] calldata subcategories
    ) external onlyRole(ADMIN_ROLE) returns (uint256 categoryId) {
        // Validate inputs
        require(bytes(name).length > 0 && bytes(name).length <= MAX_NAME_LENGTH, "Invalid name length");
        require(bytes(domain).length > 0 && bytes(domain).length <= MAX_DOMAIN_LENGTH, "Invalid domain length");
        require(subcategories.length > 0 && subcategories.length <= MAX_SUBCATEGORIES, "Invalid subcategories count");

        // Check domain uniqueness
        string memory normalizedDomain = _normalizeDomain(domain);
        require(bytes(normalizedDomain).length > 0, "Empty domain after normalization"); // L-13 fix
        bytes32 domainHash = keccak256(abi.encodePacked(normalizedDomain));
        require(_approvedDomainToCategory[domainHash] == 0, "Domain already registered");
        require(_pendingDomainReservation[domainHash] == 0, "Domain already registered");

        // Create category
        categoryId = nextCategoryId++;
        _categories[categoryId] = Category({
            id: categoryId,
            name: name,
            domain: normalizedDomain,
            subcategories: subcategories,
            submitter: msg.sender,
            stakeAmount: 0, // No stake for admin-added categories
            status: CategoryStatus.Approved,
            proposalId: 0, // No proposal for admin-added categories
            createdAt: block.timestamp
        });

        // Register domain
        _approvedDomainToCategory[domainHash] = categoryId;
        _approvedCategoryIds.push(categoryId);

        emit CategoryAdded(categoryId, name, normalizedDomain);
    }

    /// @notice Update voting engine address
    function setVotingEngine(address _votingEngine) external onlyRole(ADMIN_ROLE) {
        require(_votingEngine != address(0), "Invalid voting engine");
        votingEngine = IRoundVotingEngine(_votingEngine);
    }

    // --- View Functions ---

    /// @inheritdoc ICategoryRegistry
    function isApprovedCategory(uint256 categoryId) external view override returns (bool) {
        return _categories[categoryId].status == CategoryStatus.Approved;
    }

    /// @inheritdoc ICategoryRegistry
    function getCategory(uint256 categoryId) external view override returns (Category memory) {
        require(_categories[categoryId].id != 0, "Category does not exist");
        return _categories[categoryId];
    }

    /// @inheritdoc ICategoryRegistry
    function getCategoryByDomain(string calldata domain) external view override returns (Category memory) {
        bytes32 domainHash = keccak256(abi.encodePacked(_normalizeDomain(domain)));
        uint256 categoryId = _approvedDomainToCategory[domainHash];
        require(categoryId != 0, "Domain not registered");
        return _categories[categoryId];
    }

    /// @inheritdoc ICategoryRegistry
    /// @param offset The starting index
    /// @param limit The maximum number of IDs to return
    /// @return categoryIds The paginated array of approved category IDs
    /// @return total The total number of approved categories
    function getApprovedCategoryIdsPaginated(uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory categoryIds, uint256 total)
    {
        total = _approvedCategoryIds.length;
        if (offset >= total || limit == 0) {
            return (new uint256[](0), total);
        }
        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }
        uint256 resultLength = end - offset;
        categoryIds = new uint256[](resultLength);
        for (uint256 i = 0; i < resultLength; i++) {
            categoryIds[i] = _approvedCategoryIds[offset + i];
        }
    }

    /// @inheritdoc ICategoryRegistry
    function isDomainRegistered(string calldata domain) external view override returns (bool) {
        bytes32 domainHash = keccak256(abi.encodePacked(_normalizeDomain(domain)));
        return _approvedDomainToCategory[domainHash] != 0 || _pendingDomainReservation[domainHash] != 0;
    }

    /// @notice Compute the governor proposal ID for approving a category with the supplied description hash.
    function getApprovalProposalId(uint256 categoryId, bytes32 descriptionHash)
        public
        view
        returns (uint256 proposalId)
    {
        address[] memory targets = new address[](1);
        targets[0] = address(this);

        uint256[] memory values = new uint256[](1);
        values[0] = 0;

        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeWithSelector(this.approveCategory.selector, categoryId, descriptionHash);

        proposalId = governor.getProposalId(targets, values, calldatas, descriptionHash);
    }

    /// @notice Get category status
    function getCategoryStatus(uint256 categoryId) external view returns (CategoryStatus) {
        require(_categories[categoryId].id != 0, "Category does not exist");
        return _categories[categoryId].status;
    }

    /// @notice Get category's subcategories
    function getSubcategories(uint256 categoryId) external view returns (string[] memory) {
        require(_categories[categoryId].id != 0, "Category does not exist");
        return _categories[categoryId].subcategories;
    }

    /// @inheritdoc ICategoryRegistry
    function getSubmitter(uint256 categoryId) external view override returns (address) {
        return _categories[categoryId].submitter;
    }

    // --- Internal Helpers ---

    function _isLinkableProposalState(IGovernor.ProposalState proposalState) internal pure returns (bool) {
        return proposalState == IGovernor.ProposalState.Pending || proposalState == IGovernor.ProposalState.Active
            || proposalState == IGovernor.ProposalState.Succeeded || proposalState == IGovernor.ProposalState.Queued;
    }

    function _releasePendingDomain(Category storage cat, uint256 categoryId) internal {
        bytes32 domainHash = keccak256(abi.encodePacked(cat.domain));
        if (_pendingDomainReservation[domainHash] == categoryId) {
            delete _pendingDomainReservation[domainHash];
        }
    }

    /// @dev Normalize domain: strip protocol, www., path/query/fragment, trailing dot, and lowercase.
    function _normalizeDomain(string memory domain) internal pure returns (string memory) {
        bytes memory b = bytes(domain);
        uint256 startIndex = 0;

        // Step 1: Strip protocol prefix ("https://" = 8 chars, "http://" = 7 chars)
        if (b.length >= 8 && b[0] == "h" && b[1] == "t" && b[2] == "t" && b[3] == "p") {
            if (b[4] == "s" && b[5] == ":" && b[6] == "/" && b[7] == "/") {
                startIndex = 8;
            } else if (b[4] == ":" && b[5] == "/" && b[6] == "/") {
                startIndex = 7;
            }
        }

        // Step 2: Strip "www." prefix
        if (
            b.length >= startIndex + 4 && (b[startIndex] == "w" || b[startIndex] == "W")
                && (b[startIndex + 1] == "w" || b[startIndex + 1] == "W")
                && (b[startIndex + 2] == "w" || b[startIndex + 2] == "W") && b[startIndex + 3] == "."
        ) {
            startIndex += 4;
        }

        // Step 2b: Strip common single-char subdomains (m., i., etc.)
        // This handles m.youtube.com → youtube.com and similar mobile/regional prefixes
        if (
            b.length >= startIndex + 2 && b[startIndex + 1] == "."
                && ((b[startIndex] >= 0x61 && b[startIndex] <= 0x7A)
                    || (b[startIndex] >= 0x41 && b[startIndex] <= 0x5A))
        ) {
            // Verify there's still a valid domain after the subdomain (at least "x.y")
            bool hasMoreDots = false;
            for (uint256 j = startIndex + 2; j < b.length; j++) {
                if (b[j] == "/" || b[j] == ":" || b[j] == "?" || b[j] == "#") break;// forgefmt: disable-next-line
                if (b[j] == ".") { hasMoreDots = true; break; }
            }
            if (hasMoreDots) {
                startIndex += 2;
            }
        }

        // Step 3: Lowercase and stop at first "/" or ":" or "?" or "#" (strip path, port, query, fragment)
        bytes memory result = new bytes(b.length - startIndex);
        uint256 resultIndex = 0;
        for (uint256 i = startIndex; i < b.length; i++) {
            bytes1 char = b[i];
            if (char == "/" || char == ":" || char == "?" || char == "#") break;
            if (char >= 0x41 && char <= 0x5A) {
                result[resultIndex] = bytes1(uint8(char) + 32);
            } else {
                result[resultIndex] = char;
            }
            resultIndex++;
        }

        // Step 4: Strip trailing dot (DNS root)
        if (resultIndex > 0 && result[resultIndex - 1] == ".") {
            resultIndex--;
        }

        // Trim to actual length
        bytes memory trimmed = new bytes(resultIndex);
        for (uint256 i = 0; i < resultIndex; i++) {
            trimmed[i] = result[i];
        }
        return _canonicalizeDomainAlias(string(trimmed));
    }

    function _canonicalizeDomainAlias(string memory domain) internal pure returns (string memory) {
        if (_equals(domain, "youtu.be") || _equals(domain, "m.youtube.com")) return "youtube.com";
        if (_equals(domain, "clips.twitch.tv") || _equals(domain, "m.twitch.tv")) return "twitch.tv";
        if (_equals(domain, "twitter.com") || _equals(domain, "mobile.twitter.com")) return "x.com";
        return domain;
    }

    function _equals(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
