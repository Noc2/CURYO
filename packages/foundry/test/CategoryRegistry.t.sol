// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test, console } from "forge-std/Test.sol";
import { CategoryRegistry } from "../contracts/CategoryRegistry.sol";
import { ICategoryRegistry } from "../contracts/interfaces/ICategoryRegistry.sol";
import { IRoundVotingEngine } from "../contracts/interfaces/IRoundVotingEngine.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { IGovernor } from "@openzeppelin/contracts/governance/IGovernor.sol";

/// @title Mock Governor for testing CategoryRegistry
contract MockGovernor {
    uint256 public nextProposalId = 1;
    mapping(uint256 => IGovernor.ProposalState) public proposalStates;

    function propose(address[] memory, uint256[] memory, bytes[] memory, string memory) external returns (uint256) {
        uint256 proposalId = nextProposalId++;
        proposalStates[proposalId] = IGovernor.ProposalState.Pending;
        return proposalId;
    }

    function state(uint256 proposalId) external view returns (IGovernor.ProposalState) {
        return proposalStates[proposalId];
    }

    function setProposalState(uint256 proposalId, IGovernor.ProposalState newState) external {
        proposalStates[proposalId] = newState;
    }
}

/// @title Mock RoundVotingEngine for testing CategoryRegistry
contract MockVotingEngine is IRoundVotingEngine {
    uint256 public totalAddedToReserve;

    function addToConsensusReserve(uint256 amount) external override {
        totalAddedToReserve += amount;
    }

    function getContentCommitCount(uint256) external pure override returns (uint256) {
        return 0;
    }

    function getActiveRoundId(uint256) external pure override returns (uint256) {
        return 0;
    }

    function hasUnrevealedVotes(uint256) external pure override returns (bool) {
        return false;
    }

    function transferReward(address, uint256) external override { }
    function claimFrontendFee(uint256, uint256, address) external override { }
    function claimParticipationReward(uint256, uint256) external override { }
}

/// @title CategoryRegistry Test Suite
contract CategoryRegistryTest is Test {
    CategoryRegistry public registry;
    CuryoReputation public token;
    MockGovernor public governor;
    MockVotingEngine public votingEngine;

    address public admin = address(1);
    address public timelock = address(2);
    address public user1 = address(4);
    address public user2 = address(5);

    uint256 public constant STAKE = 100e6; // 100 cREP

    function setUp() public {
        vm.startPrank(admin);

        // Deploy token, governor, and voting engine
        token = new CuryoReputation(admin, admin);
        governor = new MockGovernor();
        votingEngine = new MockVotingEngine();

        // Grant minter role to admin
        token.grantRole(token.MINTER_ROLE(), admin);

        // Deploy registry
        registry = new CategoryRegistry(admin, address(token), address(governor), timelock, address(votingEngine));

        // Mint tokens for users (not transfer, to avoid governance lock checks)
        token.mint(user1, 10_000e6);
        token.mint(user2, 10_000e6);
        token.mint(address(registry), 10_000e6); // For governance voting

        vm.stopPrank();

        // Advance blocks to activate voting power
        vm.roll(block.number + 5);
    }

    // --- Constructor Tests ---

    function test_Deployment() public view {
        assertEq(address(registry.token()), address(token));
        assertEq(address(registry.governor()), address(governor));
        assertEq(registry.timelock(), timelock);
        assertEq(address(registry.votingEngine()), address(votingEngine));
        assertEq(registry.nextCategoryId(), 1);
    }

    function test_RevertDeploymentInvalidAdmin() public {
        vm.expectRevert("Invalid admin");
        new CategoryRegistry(address(0), address(token), address(governor), timelock, address(votingEngine));
    }

    function test_RevertDeploymentInvalidToken() public {
        vm.expectRevert("Invalid token");
        new CategoryRegistry(admin, address(0), address(governor), timelock, address(votingEngine));
    }

    function test_RevertDeploymentInvalidGovernor() public {
        vm.expectRevert("Invalid governor");
        new CategoryRegistry(admin, address(token), address(0), timelock, address(votingEngine));
    }

    function test_RevertDeploymentInvalidTimelock() public {
        vm.expectRevert("Invalid timelock");
        new CategoryRegistry(admin, address(token), address(governor), address(0), address(votingEngine));
    }

    function test_RevertDeploymentInvalidVotingEngine() public {
        vm.expectRevert("Invalid voting engine");
        new CategoryRegistry(admin, address(token), address(governor), timelock, address(0));
    }

    // --- Admin Add Approved Category Tests ---

    function test_AddApprovedCategory() public {
        string[] memory subcategories = new string[](2);
        subcategories[0] = "Education";
        subcategories[1] = "Gaming";

        vm.prank(admin);
        uint256 categoryId =
            registry.addApprovedCategory("YouTube", "youtube.com", subcategories, "What is the best YouTube video?");

        assertEq(categoryId, 1);
        assertTrue(registry.isApprovedCategory(categoryId));

        ICategoryRegistry.Category memory cat = registry.getCategory(categoryId);
        assertEq(cat.name, "YouTube");
        assertEq(cat.domain, "youtube.com");
        assertEq(cat.subcategories.length, 2);
        assertEq(cat.subcategories[0], "Education");
        assertEq(cat.rankingQuestion, "What is the best YouTube video?");
        assertEq(cat.submitter, admin);
        assertEq(cat.stakeAmount, 0); // No stake for admin-added
        assertEq(uint256(cat.status), uint256(ICategoryRegistry.CategoryStatus.Approved));
    }

    function test_AddApprovedCategoryNormalizesDomain() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.prank(admin);
        uint256 categoryId =
            registry.addApprovedCategory("YouTube", "WWW.YouTube.COM", subcategories, "What is the best?");

        ICategoryRegistry.Category memory cat = registry.getCategory(categoryId);
        assertEq(cat.domain, "youtube.com"); // www removed, lowercased
    }

    function test_RevertAddApprovedCategoryNonAdmin() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.prank(user1);
        vm.expectRevert();
        registry.addApprovedCategory("YouTube", "youtube.com", subcategories, "What is the best?");
    }

    function test_RevertAddApprovedCategoryEmptyName() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.prank(admin);
        vm.expectRevert("Invalid name length");
        registry.addApprovedCategory("", "youtube.com", subcategories, "What is the best?");
    }

    function test_RevertAddApprovedCategoryDuplicateDomain() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.startPrank(admin);
        registry.addApprovedCategory("YouTube", "youtube.com", subcategories, "What is the best?");

        vm.expectRevert("Domain already registered");
        registry.addApprovedCategory("YouTube 2", "youtube.com", subcategories, "What is the best?");
        vm.stopPrank();
    }

    function test_RevertAddApprovedCategoryEmptySubcategories() public {
        string[] memory subcategories = new string[](0);

        vm.prank(admin);
        vm.expectRevert("Invalid subcategories count");
        registry.addApprovedCategory("YouTube", "youtube.com", subcategories, "What is the best?");
    }

    // --- Submit Category Tests ---

    function test_SubmitCategory() public {
        string[] memory subcategories = new string[](2);
        subcategories[0] = "Standard";
        subcategories[1] = "Commander";

        vm.startPrank(user1);
        token.approve(address(registry), STAKE);
        uint256 categoryId =
            registry.submitCategory("MTG", "gatherer.wizards.com", subcategories, "What is the best Magic card?");
        vm.stopPrank();

        assertEq(categoryId, 1);
        assertFalse(registry.isApprovedCategory(categoryId)); // Not approved yet

        ICategoryRegistry.Category memory cat = registry.getCategory(categoryId);
        assertEq(cat.name, "MTG");
        assertEq(cat.submitter, user1);
        assertEq(cat.stakeAmount, STAKE);
        assertEq(uint256(cat.status), uint256(ICategoryRegistry.CategoryStatus.Pending));
        assertTrue(cat.proposalId > 0); // Proposal was created

        // Verify stake was transferred
        assertEq(token.balanceOf(address(registry)), 10_000e6 + STAKE);
    }

    function test_RevertSubmitCategoryInsufficientStake() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.startPrank(user1);
        token.approve(address(registry), STAKE - 1);
        vm.expectRevert();
        registry.submitCategory("MTG", "gatherer.wizards.com", subcategories, "What is the best?");
        vm.stopPrank();
    }

    // --- Approve Category Tests ---

    function test_ApproveCategory() public {
        // Submit category
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.startPrank(user1);
        token.approve(address(registry), STAKE);
        uint256 categoryId = registry.submitCategory("MTG", "gatherer.wizards.com", subcategories, "What is the best?");
        vm.stopPrank();

        uint256 userBalanceBefore = token.balanceOf(user1);

        // Approve via timelock
        vm.prank(timelock);
        registry.approveCategory(categoryId);

        assertTrue(registry.isApprovedCategory(categoryId));

        ICategoryRegistry.Category memory cat = registry.getCategory(categoryId);
        assertEq(uint256(cat.status), uint256(ICategoryRegistry.CategoryStatus.Approved));

        // Stake should be returned to user
        assertEq(token.balanceOf(user1), userBalanceBefore + STAKE);
    }

    function test_RevertApproveCategoryNonTimelock() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.startPrank(user1);
        token.approve(address(registry), STAKE);
        uint256 categoryId = registry.submitCategory("MTG", "gatherer.wizards.com", subcategories, "What is the best?");
        vm.stopPrank();

        vm.prank(user1);
        vm.expectRevert("Only timelock");
        registry.approveCategory(categoryId);
    }

    function test_RevertApproveCategoryAlreadyApproved() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.startPrank(user1);
        token.approve(address(registry), STAKE);
        uint256 categoryId = registry.submitCategory("MTG", "gatherer.wizards.com", subcategories, "What is the best?");
        vm.stopPrank();

        vm.prank(timelock);
        registry.approveCategory(categoryId);

        vm.prank(timelock);
        vm.expectRevert("Not pending");
        registry.approveCategory(categoryId);
    }

    // --- Reject Category Tests ---

    function test_RejectCategory() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.startPrank(user1);
        token.approve(address(registry), STAKE);
        uint256 categoryId = registry.submitCategory("MTG", "gatherer.wizards.com", subcategories, "What is the best?");
        vm.stopPrank();

        ICategoryRegistry.Category memory cat = registry.getCategory(categoryId);

        // Set proposal to defeated
        governor.setProposalState(cat.proposalId, IGovernor.ProposalState.Defeated);

        uint256 voterPoolBefore = votingEngine.totalAddedToReserve();

        // Anyone can call reject after proposal fails
        vm.prank(user2);
        registry.rejectCategory(categoryId);

        cat = registry.getCategory(categoryId);
        assertEq(uint256(cat.status), uint256(ICategoryRegistry.CategoryStatus.Rejected));

        // Stake should go to voter pool
        assertEq(votingEngine.totalAddedToReserve(), voterPoolBefore + STAKE);

        // Domain should be released
        assertFalse(registry.isDomainRegistered("gatherer.wizards.com"));
    }

    function test_RevertRejectCategoryProposalNotFailed() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.startPrank(user1);
        token.approve(address(registry), STAKE);
        uint256 categoryId = registry.submitCategory("MTG", "gatherer.wizards.com", subcategories, "What is the best?");
        vm.stopPrank();

        // Proposal is still Pending
        vm.expectRevert("Proposal not failed");
        registry.rejectCategory(categoryId);
    }

    // --- View Functions Tests ---

    function test_GetCategoryByDomain() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.prank(admin);
        registry.addApprovedCategory("YouTube", "youtube.com", subcategories, "What is the best?");

        ICategoryRegistry.Category memory cat = registry.getCategoryByDomain("youtube.com");
        assertEq(cat.name, "YouTube");
    }

    function test_GetCategoryByDomainCaseInsensitive() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.prank(admin);
        registry.addApprovedCategory("YouTube", "youtube.com", subcategories, "What is the best?");

        ICategoryRegistry.Category memory cat = registry.getCategoryByDomain("YOUTUBE.COM");
        assertEq(cat.name, "YouTube");
    }

    function test_GetApprovedCategoryIds() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.startPrank(admin);
        registry.addApprovedCategory("YouTube", "youtube.com", subcategories, "What is the best?");
        registry.addApprovedCategory("Twitch", "twitch.tv", subcategories, "What is the best?");
        vm.stopPrank();

        uint256[] memory ids = registry.getApprovedCategoryIds();
        assertEq(ids.length, 2);
        assertEq(ids[0], 1);
        assertEq(ids[1], 2);
    }

    function test_ApprovedCategoryCount() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        assertEq(registry.approvedCategoryCount(), 0);

        vm.startPrank(admin);
        registry.addApprovedCategory("YouTube", "youtube.com", subcategories, "What is the best?");
        vm.stopPrank();

        assertEq(registry.approvedCategoryCount(), 1);
    }

    function test_GetSubcategories() public {
        string[] memory subcategories = new string[](3);
        subcategories[0] = "Education";
        subcategories[1] = "Gaming";
        subcategories[2] = "Music";

        vm.prank(admin);
        uint256 categoryId = registry.addApprovedCategory("YouTube", "youtube.com", subcategories, "What is the best?");

        string[] memory result = registry.getSubcategories(categoryId);
        assertEq(result.length, 3);
        assertEq(result[0], "Education");
        assertEq(result[1], "Gaming");
        assertEq(result[2], "Music");
    }

    function test_IsDomainRegistered() public {
        assertFalse(registry.isDomainRegistered("youtube.com"));

        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.prank(admin);
        registry.addApprovedCategory("YouTube", "youtube.com", subcategories, "What is the best?");

        assertTrue(registry.isDomainRegistered("youtube.com"));
        assertTrue(registry.isDomainRegistered("YOUTUBE.COM")); // Case insensitive
        assertTrue(registry.isDomainRegistered("www.youtube.com")); // www normalized
    }

    // --- Pagination Tests ---

    function test_GetApprovedCategoryIdsPaginated() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.startPrank(admin);
        registry.addApprovedCategory("YouTube", "youtube.com", subcategories, "Best video?");
        registry.addApprovedCategory("Twitch", "twitch.tv", subcategories, "Best stream?");
        registry.addApprovedCategory("Reddit", "reddit.com", subcategories, "Best post?");
        registry.addApprovedCategory("Twitter", "x.com", subcategories, "Best tweet?");
        registry.addApprovedCategory("TikTok", "tiktok.com", subcategories, "Best clip?");
        vm.stopPrank();

        // Page 1: offset=0, limit=2
        (uint256[] memory page1, uint256 total1) = registry.getApprovedCategoryIdsPaginated(0, 2);
        assertEq(total1, 5);
        assertEq(page1.length, 2);
        assertEq(page1[0], 1);
        assertEq(page1[1], 2);

        // Page 2: offset=2, limit=2
        (uint256[] memory page2, uint256 total2) = registry.getApprovedCategoryIdsPaginated(2, 2);
        assertEq(total2, 5);
        assertEq(page2.length, 2);
        assertEq(page2[0], 3);
        assertEq(page2[1], 4);

        // Page 3: offset=4, limit=10 (exceeds remaining)
        (uint256[] memory page3, uint256 total3) = registry.getApprovedCategoryIdsPaginated(4, 10);
        assertEq(total3, 5);
        assertEq(page3.length, 1);
        assertEq(page3[0], 5);
    }

    function test_GetApprovedCategoryIdsPaginated_OffsetBeyondLength() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.prank(admin);
        registry.addApprovedCategory("YouTube", "youtube.com", subcategories, "Best video?");

        (uint256[] memory result, uint256 total) = registry.getApprovedCategoryIdsPaginated(5, 2);
        assertEq(total, 1);
        assertEq(result.length, 0);
    }

    function test_GetApprovedCategoryIdsPaginated_ZeroLimit() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.prank(admin);
        registry.addApprovedCategory("YouTube", "youtube.com", subcategories, "Best video?");

        (uint256[] memory result, uint256 total) = registry.getApprovedCategoryIdsPaginated(0, 0);
        assertEq(total, 1);
        assertEq(result.length, 0);
    }

    // --- Admin Functions Tests ---

    function test_SetVotingEngine() public {
        address newVotingEngine = address(100);

        vm.prank(admin);
        registry.setVotingEngine(newVotingEngine);

        assertEq(address(registry.votingEngine()), newVotingEngine);
    }

    function test_RevertSetVotingEngineNonAdmin() public {
        vm.prank(user1);
        vm.expectRevert();
        registry.setVotingEngine(address(100));
    }

    function test_RevertSetVotingEngineZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert("Invalid voting engine");
        registry.setVotingEngine(address(0));
    }

    // --- Domain Normalization Tests ---

    function test_DomainNormalizationRemovesWww() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.prank(admin);
        uint256 categoryId =
            registry.addApprovedCategory("Example", "www.example.com", subcategories, "What is the best?");

        ICategoryRegistry.Category memory cat = registry.getCategory(categoryId);
        assertEq(cat.domain, "example.com");
    }

    function test_DomainNormalizationLowercases() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.prank(admin);
        uint256 categoryId = registry.addApprovedCategory("Example", "EXAMPLE.COM", subcategories, "What is the best?");

        ICategoryRegistry.Category memory cat = registry.getCategory(categoryId);
        assertEq(cat.domain, "example.com");
    }

    // --- L-03: Enhanced domain normalization tests ---

    function test_DomainNormalizationStripsHttps() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.prank(admin);
        uint256 categoryId =
            registry.addApprovedCategory("Example", "https://example.com", subcategories, "What is the best?");

        ICategoryRegistry.Category memory cat = registry.getCategory(categoryId);
        assertEq(cat.domain, "example.com");
    }

    function test_DomainNormalizationStripsHttp() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.prank(admin);
        uint256 categoryId =
            registry.addApprovedCategory("Example", "http://example.com", subcategories, "What is the best?");

        ICategoryRegistry.Category memory cat = registry.getCategory(categoryId);
        assertEq(cat.domain, "example.com");
    }

    function test_DomainNormalizationStripsPath() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.prank(admin);
        uint256 categoryId =
            registry.addApprovedCategory("YouTube", "youtube.com/channel", subcategories, "What is the best?");

        ICategoryRegistry.Category memory cat = registry.getCategory(categoryId);
        assertEq(cat.domain, "youtube.com");
    }

    function test_DomainNormalizationStripsTrailingSlash() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.prank(admin);
        uint256 categoryId = registry.addApprovedCategory("YouTube", "youtube.com/", subcategories, "What is the best?");

        ICategoryRegistry.Category memory cat = registry.getCategory(categoryId);
        assertEq(cat.domain, "youtube.com");
    }

    function test_DomainNormalizationStripsTrailingDot() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.prank(admin);
        uint256 categoryId = registry.addApprovedCategory("Example", "example.com.", subcategories, "What is the best?");

        ICategoryRegistry.Category memory cat = registry.getCategory(categoryId);
        assertEq(cat.domain, "example.com");
    }

    function test_DomainNormalizationFullUrl() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        // Full URL with protocol, www, path, and mixed case should normalize
        vm.prank(admin);
        uint256 categoryId = registry.addApprovedCategory(
            "YouTube", "https://WWW.YouTube.COM/channel?v=abc", subcategories, "What is the best?"
        );

        ICategoryRegistry.Category memory cat = registry.getCategory(categoryId);
        assertEq(cat.domain, "youtube.com");
    }

    function test_DomainNormalizationDuplicateDetectionAcrossFormats() public {
        string[] memory subcategories = new string[](1);
        subcategories[0] = "General";

        vm.startPrank(admin);
        // Register with plain domain
        registry.addApprovedCategory("YouTube", "youtube.com", subcategories, "What is the best?");

        // Attempt to register with full URL — should revert as duplicate
        vm.expectRevert("Domain already registered");
        registry.addApprovedCategory("YouTube 2", "https://youtube.com/channel", subcategories, "Best YouTube?");
        vm.stopPrank();
    }
}
