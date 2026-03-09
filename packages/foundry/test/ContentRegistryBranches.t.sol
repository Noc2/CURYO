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
import { ICategoryRegistry } from "../contracts/interfaces/ICategoryRegistry.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";
import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";

// =========================================================================
// MOCKS
// =========================================================================

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

contract ContentRegistryBranchesTest is VotingTestBase {
    CuryoReputation public crepToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    RoundRewardDistributor public rewardDistributor;
    MockVoterIdNFT public mockVoterIdNFT;
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
        votingEngine.setConfig(1 hours, 7 days, 3, 1000);

        mockVoterIdNFT = new MockVoterIdNFT();
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
        _commit(voter, contentId, isUp);
    }

    function _commit(address voter, uint256 contentId, bool isUp) internal returns (bytes32 commitKey, bytes32 salt) {
        vm.startPrank(voter);
        salt = keccak256(abi.encodePacked(voter, block.timestamp));
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);
        bytes32 commitHash = _commitHash(isUp, salt, contentId, ciphertext);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, commitHash, ciphertext, STAKE, address(0));
        vm.stopPrank();
        commitKey = keccak256(abi.encodePacked(voter, commitHash));
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

    function test_VoteCommit_UpdatesLastActivityAt() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/activity", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 29 days);
        _vote(voter1, 1, true);

        ContentRegistry.Content memory c = registry.getContent(1);
        assertEq(c.lastActivityAt, block.timestamp, "Commit should refresh lastActivityAt");
    }

    function test_MarkDormant_ActiveRound_AllVotesRevealed_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/open-round", "goal", "tags", 0);
        vm.stopPrank();

        (bytes32 commitKey, bytes32 salt) = _commit(voter1, 1, true);
        uint256 roundId = votingEngine.getActiveRoundId(1);

        vm.warp(T0 + 1 hours + 1);
        votingEngine.revealVoteByCommitKey(1, roundId, commitKey, true, salt);

        assertEq(votingEngine.getActiveRoundId(1), roundId, "Round should still be open");
        assertFalse(votingEngine.hasUnrevealedVotes(1), "All votes are revealed");

        vm.warp(T0 + 31 days);
        vm.expectRevert("Content has active round");
        registry.markDormant(1);
    }

    function test_MarkDormant_CancelledRound_StillUsesLastVoteTimestamp() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/recent-vote", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 29 days);
        _vote(voter1, 1, true);

        uint256 roundId = votingEngine.getActiveRoundId(1);
        vm.warp(T0 + 29 days + 7 days + 1);
        votingEngine.cancelExpiredRound(1, roundId);

        vm.expectRevert("Dormancy period not elapsed");
        registry.markDormant(1);
    }

    function test_MarkDormant_ReleasesUrlForResubmission() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        registry.submitContent("https://example.com/dormant-url", "goal", "tags", 0);
        vm.stopPrank();

        // URL should be marked as submitted
        assertTrue(registry.isUrlSubmitted("https://example.com/dormant-url"));

        // Mark dormant after 31 days
        vm.warp(T0 + 31 days);
        registry.markDormant(1);

        // URL should now be released
        assertFalse(registry.isUrlSubmitted("https://example.com/dormant-url"));

        // Should be able to resubmit the same URL
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/dormant-url", "goal2", "tags2", 0);
        vm.stopPrank();

        // New content created with same URL
        ContentRegistry.Content memory c2 = registry.getContent(2);
        assertEq(uint256(c2.status), uint256(ContentRegistry.ContentStatus.Active));
    }

    function test_ReviveContent_ReservesUrlAgain() public {
        string memory url = "https://example.com/revive-url";

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent(url, "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 31 days);
        registry.markDormant(1);

        vm.startPrank(voter1);
        crepToken.approve(address(registry), 5e6);
        registry.reviveContent(1);
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("URL already submitted");
        registry.submitContent(url, "goal2", "tags2", 0);
        vm.stopPrank();
    }

    function test_ReviveContent_RevertsWhenUrlWasResubmitted() public {
        string memory url = "https://example.com/revive-conflict";

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent(url, "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 31 days);
        registry.markDormant(1);

        vm.startPrank(voter1);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent(url, "goal2", "tags2", 0);
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(registry), 5e6);
        vm.expectRevert("URL already submitted");
        registry.reviveContent(1);
        vm.stopPrank();
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
