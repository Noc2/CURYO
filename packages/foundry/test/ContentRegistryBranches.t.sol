// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { IVoterIdNFT } from "../contracts/interfaces/IVoterIdNFT.sol";
import { ICategoryRegistry } from "../contracts/interfaces/ICategoryRegistry.sol";

// =========================================================================
// MOCKS
// =========================================================================

contract MockVoterIdNFT_CR is IVoterIdNFT {
    mapping(address => bool) public holders;
    mapping(address => uint256) public tokenIds;
    mapping(uint256 => address) public tokenHolders;
    mapping(uint256 => bool) public usedNullifiers;
    uint256 private nextTokenId = 1;
    mapping(bytes32 => uint256) public stakes;
    mapping(address => address) public holderToDelegate;
    mapping(address => address) public delegateToHolder;

    function setHolder(address holder) external {
        holders[holder] = true;
        if (tokenIds[holder] == 0) {
            tokenIds[holder] = nextTokenId;
            tokenHolders[nextTokenId] = holder;
            nextTokenId++;
        }
    }

    function mint(address to, uint256 nullifier) external returns (uint256) {
        usedNullifiers[nullifier] = true;
        holders[to] = true;
        uint256 id = nextTokenId++;
        tokenIds[to] = id;
        tokenHolders[id] = to;
        return id;
    }

    function hasVoterId(address holder) external view returns (bool) {
        return holders[holder];
    }

    function getTokenId(address holder) external view returns (uint256) {
        return tokenIds[holder];
    }

    function getHolder(uint256 tokenId) external view returns (address) {
        return tokenHolders[tokenId];
    }

    function recordStake(uint256 contentId, uint256 epochId, uint256 tokenId, uint256 amount) external {
        stakes[keccak256(abi.encodePacked(contentId, epochId, tokenId))] += amount;
    }

    function getEpochContentStake(uint256 contentId, uint256 epochId, uint256 tokenId) external view returns (uint256) {
        return stakes[keccak256(abi.encodePacked(contentId, epochId, tokenId))];
    }

    function isNullifierUsed(uint256 nullifier) external view returns (bool) {
        return usedNullifiers[nullifier];
    }
    function revokeVoterId(address) external { }

    function setDelegate(address delegate) external {
        holderToDelegate[msg.sender] = delegate;
        delegateToHolder[delegate] = msg.sender;
    }

    function removeDelegate() external {
        delete delegateToHolder[holderToDelegate[msg.sender]];
        delete holderToDelegate[msg.sender];
    }

    function resolveHolder(address addr) external view returns (address) {
        if (holders[addr]) return addr;
        address h = delegateToHolder[addr];
        if (holders[h]) return h;
        return address(0);
    }

    function delegateTo(address holder) external view returns (address) {
        return holderToDelegate[holder];
    }

    function delegateOf(address delegate) external view returns (address) {
        return delegateToHolder[delegate];
    }
}

contract MockCategoryRegistry is ICategoryRegistry {
    mapping(uint256 => bool) public approved;
    mapping(uint256 => address) public submitters;

    function setApproved(uint256 id, bool val) external {
        approved[id] = val;
    }

    function setSubmitter(uint256 id, address s) external {
        submitters[id] = s;
    }

    function isApprovedCategory(uint256 categoryId) external view override returns (bool) {
        return approved[categoryId];
    }

    function getCategory(uint256) external pure override returns (Category memory) {
        revert("not impl");
    }

    function getCategoryByDomain(string calldata) external pure override returns (Category memory) {
        revert("not impl");
    }

    function getApprovedCategoryIds() external pure override returns (uint256[] memory) {
        return new uint256[](0);
    }

    function isDomainRegistered(string calldata) external pure override returns (bool) {
        return false;
    }

    function getSubmitter(uint256 categoryId) external view override returns (address) {
        return submitters[categoryId];
    }
}

// =========================================================================
// TEST CONTRACT
// =========================================================================

contract ContentRegistryBranchesTest is Test {
    CuryoReputation public crepToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    RoundRewardDistributor public rewardDistributor;
    MockVoterIdNFT_CR public mockVoterIdNFT;
    MockCategoryRegistry public mockCategoryRegistry;
    ParticipationPool public participationPool;

    address public owner = address(1);
    address public submitter = address(2);
    address public voter1 = address(3);
    address public voter2 = address(4);
    address public voter3 = address(5);
    address public keeper = address(9);
    address public treasury = address(100);
    address public bonusPool = address(101);

    uint256 public constant T0 = 1000;
    uint256 public constant STAKE = 5e6;

    function setUp() public {
        vm.warp(T0);
        vm.startPrank(owner);

        crepToken = new CuryoReputation(owner, owner);
        crepToken.grantRole(crepToken.MINTER_ROLE(), owner);

        ContentRegistry registryImpl = new ContentRegistry();
        RoundVotingEngine engineImpl = new RoundVotingEngine();
        RoundRewardDistributor distImpl = new RoundRewardDistributor();

        registry = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImpl),
                    abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(crepToken)))
                )
            )
        );
        votingEngine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engineImpl),
                    abi.encodeCall(RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry)))
                )
            )
        );
        rewardDistributor = RoundRewardDistributor(
            address(
                new ERC1967Proxy(
                    address(distImpl),
                    abi.encodeCall(
                        RoundRewardDistributor.initialize,
                        (owner, address(crepToken), address(votingEngine), address(registry))
                    )
                )
            )
        );

        registry.setVotingEngine(address(votingEngine));
        registry.setBonusPool(bonusPool);
        registry.setTreasury(treasury);
        votingEngine.setRewardDistributor(address(rewardDistributor));
        votingEngine.setTreasury(treasury);
        votingEngine.setConfig(10, 50, 7 days, 2, 200, 30, 3, 500, 1000e6);

        mockVoterIdNFT = new MockVoterIdNFT_CR();
        mockCategoryRegistry = new MockCategoryRegistry();

        participationPool = new ParticipationPool(address(crepToken), owner);
        participationPool.setAuthorizedCaller(address(registry), true);
        participationPool.setAuthorizedCaller(address(votingEngine), true);

        crepToken.mint(owner, 2_000_000e6);
        crepToken.approve(address(participationPool), 500_000e6);
        participationPool.depositPool(500_000e6);
        crepToken.approve(address(votingEngine), 500_000e6);
        votingEngine.fundConsensusReserve(500_000e6);

        address[5] memory users = [submitter, voter1, voter2, voter3, keeper];
        for (uint256 i = 0; i < users.length; i++) {
            crepToken.mint(users[i], 10_000e6);
        }

        vm.stopPrank();
    }

    function _vote(address voter, uint256 contentId, bool isUp) internal {
        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.vote(contentId, isUp, STAKE, address(0));
        vm.stopPrank();
    }

    // =========================================================================
    // submitContent BRANCHES
    // =========================================================================

    function test_SubmitContent_VoterIdRequired_RevertsWithoutId() public {
        vm.prank(owner);
        registry.setVoterIdNFT(address(mockVoterIdNFT));

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Voter ID required");
        registry.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.stopPrank();
    }

    function test_SubmitContent_VoterIdRequired_SucceedsWithId() public {
        vm.prank(owner);
        registry.setVoterIdNFT(address(mockVoterIdNFT));
        mockVoterIdNFT.setHolder(submitter);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        uint256 id = registry.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.stopPrank();
        assertEq(id, 1);
    }

    function test_SubmitContent_VoterIdNotConfigured_Succeeds() public {
        // No voterIdNFT set — should skip check
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        uint256 id = registry.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.stopPrank();
        assertEq(id, 1);
    }

    function test_SubmitContent_CategoryNotApproved_Reverts() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Category not approved");
        registry.submitContent("https://example.com/1", "goal", "tags", 99);
        vm.stopPrank();
    }

    function test_SubmitContent_CategoryRegistryNotSet_Reverts() public {
        // No categoryRegistry set but categoryId != 0
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("CategoryRegistry not set");
        registry.submitContent("https://example.com/1", "goal", "tags", 1);
        vm.stopPrank();
    }

    function test_SubmitContent_CategoryZero_SkipsValidation() public {
        // categoryId = 0 → skip category validation entirely
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        uint256 id = registry.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.stopPrank();
        assertEq(id, 1);
    }

    function test_SubmitContent_ParticipationPool_RewardGiven() public {
        vm.prank(owner);
        registry.setParticipationPool(address(participationPool));

        uint256 balBefore = crepToken.balanceOf(submitter);
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.stopPrank();

        // Submitter got participation reward (balance = before - 10e6 stake + reward)
        uint256 balAfter = crepToken.balanceOf(submitter);
        // The reward should partially offset the stake
        assertGt(balAfter, balBefore - 10e6);
    }

    function test_SubmitContent_NoParticipationPool_NoReward() public {
        // Don't set participation pool — reward is skipped
        uint256 balBefore = crepToken.balanceOf(submitter);
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.stopPrank();

        uint256 balAfter = crepToken.balanceOf(submitter);
        assertEq(balAfter, balBefore - 10e6);
    }

    function test_SubmitContent_UrlTooLong_Reverts() public {
        bytes memory longUrl = new bytes(2049);
        for (uint256 i = 0; i < longUrl.length; i++) {
            longUrl[i] = "a";
        }

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("URL too long");
        registry.submitContent(string(longUrl), "goal", "tags", 0);
        vm.stopPrank();
    }

    function test_SubmitContent_GoalTooLong_Reverts() public {
        bytes memory longGoal = new bytes(501);
        for (uint256 i = 0; i < longGoal.length; i++) {
            longGoal[i] = "a";
        }

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Goal too long");
        registry.submitContent("https://example.com/1", string(longGoal), "tags", 0);
        vm.stopPrank();
    }

    function test_SubmitContent_TagsTooLong_Reverts() public {
        bytes memory longTags = new bytes(257);
        for (uint256 i = 0; i < longTags.length; i++) {
            longTags[i] = "a";
        }

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Tags too long");
        registry.submitContent("https://example.com/1", "goal", string(longTags), 0);
        vm.stopPrank();
    }

    function test_SubmitContent_DuplicateUrl_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        registry.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.expectRevert("URL already submitted");
        registry.submitContent("https://example.com/1", "goal2", "tags2", 0);
        vm.stopPrank();
    }

    function test_SubmitContent_EmptyUrl_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("URL required");
        registry.submitContent("", "goal", "tags", 0);
        vm.stopPrank();
    }

    function test_SubmitContent_EmptyGoal_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Goal required");
        registry.submitContent("https://example.com/1", "", "tags", 0);
        vm.stopPrank();
    }

    function test_SubmitContent_EmptyTags_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Tags required");
        registry.submitContent("https://example.com/1", "goal", "", 0);
        vm.stopPrank();
    }

    // =========================================================================
    // cancelContent BRANCHES
    // =========================================================================

    function test_CancelContent_NotSubmitter_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.stopPrank();

        vm.prank(voter1);
        vm.expectRevert("Not submitter");
        registry.cancelContent(1);
    }

    function test_CancelContent_NotActive_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "tags", 0);
        registry.cancelContent(1);

        vm.expectRevert("Not active");
        registry.cancelContent(1);
        vm.stopPrank();
    }

    function test_CancelContent_HasVotes_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.stopPrank();

        // Add a vote
        _vote(voter1, 1, true);

        vm.prank(submitter);
        vm.expectRevert("Content has votes");
        registry.cancelContent(1);
    }

    function test_CancelContent_VotingEngineNotSet_AllowsCancel() public {
        // Deploy a fresh registry without votingEngine
        vm.startPrank(owner);
        ContentRegistry registryImpl2 = new ContentRegistry();
        ContentRegistry reg2 = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImpl2),
                    abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(crepToken)))
                )
            )
        );
        reg2.setBonusPool(bonusPool);
        // DON'T set votingEngine
        vm.stopPrank();

        vm.startPrank(submitter);
        crepToken.approve(address(reg2), 10e6);
        reg2.submitContent("https://example.com/1", "goal", "tags", 0);
        reg2.cancelContent(1);
        vm.stopPrank();

        ContentRegistry.Content memory c = reg2.getContent(1);
        assertEq(uint256(c.status), uint256(ContentRegistry.ContentStatus.Cancelled));
    }

    function test_CancelContent_FeeSentToBonusPool() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "tags", 0);

        uint256 bonusBefore = crepToken.balanceOf(bonusPool);
        registry.cancelContent(1);
        vm.stopPrank();

        uint256 bonusAfter = crepToken.balanceOf(bonusPool);
        assertEq(bonusAfter - bonusBefore, 1e6); // CANCELLATION_FEE
    }

    // =========================================================================
    // markDormant BRANCHES
    // =========================================================================

    function test_MarkDormant_PeriodNotElapsed_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.stopPrank();

        vm.expectRevert("Dormancy period not elapsed");
        registry.markDormant(1);
    }

    function test_MarkDormant_VotingEngineNotSet_AllowsDormant() public {
        vm.startPrank(owner);
        ContentRegistry registryImpl2 = new ContentRegistry();
        ContentRegistry reg2 = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImpl2),
                    abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(crepToken)))
                )
            )
        );
        // DON'T set votingEngine
        vm.stopPrank();

        vm.startPrank(submitter);
        crepToken.approve(address(reg2), 10e6);
        reg2.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 31 days);
        reg2.markDormant(1);

        ContentRegistry.Content memory c = reg2.getContent(1);
        assertEq(uint256(c.status), uint256(ContentRegistry.ContentStatus.Dormant));
    }

    function test_MarkDormant_Success() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 31 days);
        registry.markDormant(1);

        ContentRegistry.Content memory c = registry.getContent(1);
        assertEq(uint256(c.status), uint256(ContentRegistry.ContentStatus.Dormant));
    }

    // =========================================================================
    // slashSubmitterStake BRANCHES
    // =========================================================================

    function test_SlashSubmitterStake_TreasuryNotSet_Reverts() public {
        vm.startPrank(owner);
        ContentRegistry registryImpl2 = new ContentRegistry();
        ContentRegistry reg2 = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImpl2),
                    abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(crepToken)))
                )
            )
        );
        reg2.setVotingEngine(address(votingEngine));
        // DON'T set treasury
        vm.stopPrank();

        vm.startPrank(submitter);
        crepToken.approve(address(reg2), 10e6);
        reg2.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.stopPrank();

        vm.prank(address(votingEngine));
        vm.expectRevert("Treasury not set");
        reg2.slashSubmitterStake(1);
    }

    // =========================================================================
    // updateRating BRANCHES
    // =========================================================================

    function test_UpdateRatingDirect_CappedAt100() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.stopPrank();

        // Set rating to 110 → should clamp to 100
        vm.prank(address(votingEngine));
        registry.updateRatingDirect(1, 110);

        assertEq(registry.getRating(1), 100);
    }

    function test_UpdateRatingDirect_FlooredAt0() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.stopPrank();

        // Set rating to 0
        vm.prank(address(votingEngine));
        registry.updateRatingDirect(1, 0);

        assertEq(registry.getRating(1), 0);
    }

    function test_UpdateRatingDirect_SameValue_NoChange() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.stopPrank();

        // Set same rating (50) → no change, no event
        vm.prank(address(votingEngine));
        registry.updateRatingDirect(1, 50);

        assertEq(registry.getRating(1), 50); // unchanged
    }

    function test_SubmitContent_CategoryApproved_Succeeds() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        uint256 id = registry.submitContent("https://example.com/1", "goal", "tags", 1);
        vm.stopPrank();
        assertEq(id, 1);
        assertEq(registry.getCategoryId(1), 1);
    }
}
