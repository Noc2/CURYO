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
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { ICategoryRegistry } from "../contracts/interfaces/ICategoryRegistry.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";
import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";

// =========================================================================
// MOCKS
// =========================================================================

contract MockCategoryRegistry is ICategoryRegistry {
    mapping(uint256 => bool) public approved;
    mapping(uint256 => address) public submitters;
    mapping(uint256 => string) public domains;
    mapping(bytes32 => uint256) public domainToId;

    function setApproved(uint256 id, bool val) external {
        approved[id] = val;
    }

    function setDomain(uint256 id, string calldata domain) external {
        string memory normalized = _normalizeDomain(domain);
        domains[id] = normalized;
        domainToId[keccak256(bytes(normalized))] = id;
    }

    function setSubmitter(uint256 id, address s) external {
        submitters[id] = s;
    }

    function isApprovedCategory(uint256 categoryId) external view override returns (bool) {
        return approved[categoryId];
    }

    function getCategory(uint256 categoryId) external view override returns (Category memory) {
        require(bytes(domains[categoryId]).length != 0, "Category does not exist");
        return _category(categoryId);
    }

    function getCategoryByDomain(string calldata domain) external view override returns (Category memory) {
        uint256 categoryId = domainToId[keccak256(bytes(_normalizeDomain(domain)))];
        require(categoryId != 0, "Domain not registered");
        return _category(categoryId);
    }

    function getApprovedCategoryIds() external pure override returns (uint256[] memory) {
        return new uint256[](0);
    }

    function isDomainRegistered(string calldata domain) external view override returns (bool) {
        return domainToId[keccak256(bytes(_normalizeDomain(domain)))] != 0;
    }

    function getSubmitter(uint256 categoryId) external view override returns (address) {
        return submitters[categoryId];
    }

    function _category(uint256 categoryId) internal view returns (Category memory) {
        string[] memory subcategories = new string[](0);
        return Category({
            id: categoryId,
            name: "",
            domain: domains[categoryId],
            subcategories: subcategories,
            rankingQuestion: "",
            submitter: submitters[categoryId],
            stakeAmount: 0,
            status: approved[categoryId] ? CategoryStatus.Approved : CategoryStatus.Pending,
            proposalId: 0,
            createdAt: 0
        });
    }

    function _normalizeDomain(string memory domain) internal pure returns (string memory) {
        bytes memory b = bytes(domain);
        uint256 startIndex = 0;

        if (b.length >= 8 && b[0] == "h" && b[1] == "t" && b[2] == "t" && b[3] == "p") {
            if (b[4] == "s" && b[5] == ":" && b[6] == "/" && b[7] == "/") {
                startIndex = 8;
            } else if (b[4] == ":" && b[5] == "/" && b[6] == "/") {
                startIndex = 7;
            }
        }

        if (
            b.length >= startIndex + 4 && (b[startIndex] == "w" || b[startIndex] == "W")
                && (b[startIndex + 1] == "w" || b[startIndex + 1] == "W")
                && (b[startIndex + 2] == "w" || b[startIndex + 2] == "W") && b[startIndex + 3] == "."
        ) {
            startIndex += 4;
        }

        if (
            b.length >= startIndex + 2 && b[startIndex + 1] == "."
                && ((b[startIndex] >= 0x61 && b[startIndex] <= 0x7A)
                    || (b[startIndex] >= 0x41 && b[startIndex] <= 0x5A))
        ) {
            bool hasMoreDots = false;
            for (uint256 j = startIndex + 2; j < b.length; j++) {
                if (b[j] == "/" || b[j] == ":" || b[j] == "?" || b[j] == "#") break;
                if (b[j] == ".") {
                    hasMoreDots = true;
                    break;
                }
            }
            if (hasMoreDots) {
                startIndex += 2;
            }
        }

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

        if (resultIndex > 0 && result[resultIndex - 1] == ".") {
            resultIndex--;
        }

        bytes memory trimmed = new bytes(resultIndex);
        for (uint256 i = 0; i < resultIndex; i++) {
            trimmed[i] = result[i];
        }
        return string(trimmed);
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
    address public delegate = address(102);

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
        participationPool.setAuthorizedCaller(address(rewardDistributor), true);

        crepToken.mint(owner, 2_000_000e6);
        crepToken.approve(address(participationPool), 500_000e6);
        participationPool.depositPool(500_000e6);
        crepToken.approve(address(votingEngine), 500_000e6);
        votingEngine.addToConsensusReserve(500_000e6);

        address[6] memory users = [submitter, voter1, voter2, voter3, keeper, delegate];
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

    function _settleHealthyRound(uint256 contentId) internal returns (uint256 roundId) {
        (bytes32 ck1, bytes32 salt1) = _commit(voter1, contentId, true);
        (bytes32 ck2, bytes32 salt2) = _commit(voter2, contentId, true);
        (bytes32 ck3, bytes32 salt3) = _commit(voter3, contentId, false);

        roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        vm.warp(block.timestamp + 1 hours + 1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck1, true, salt1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck2, true, salt2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck3, false, salt3);
        votingEngine.settleRound(contentId, roundId);
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
        registry.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();
    }

    function test_SubmitContent_VoterIdRequired_SucceedsWithId() public {
        vm.prank(owner);
        registry.setVoterIdNFT(address(mockVoterIdNFT));
        mockVoterIdNFT.setHolder(submitter);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        uint256 id = registry.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();
        assertEq(id, 1);
    }

    function test_SubmitContent_SnapshotsCanonicalSubmitterIdentityForDelegate() public {
        vm.prank(owner);
        registry.setVoterIdNFT(address(mockVoterIdNFT));

        mockVoterIdNFT.setHolder(submitter);
        vm.prank(submitter);
        mockVoterIdNFT.setDelegate(delegate);

        vm.startPrank(delegate);
        crepToken.approve(address(registry), 10e6);
        uint256 id = registry.submitContent("https://example.com/delegate-submit", "goal", "goal", "tags", 0);
        vm.stopPrank();

        assertEq(registry.getSubmitter(id), delegate, "raw submitter should remain delegate wallet");
        assertEq(registry.getSubmitterIdentity(id), submitter, "submitter identity should snapshot the holder");
    }

    function test_GetSubmitterIdentity_ResolvesLegacyRawSubmitterViaCurrentDelegateMapping() public {
        vm.startPrank(delegate);
        crepToken.approve(address(registry), 10e6);
        uint256 id = registry.submitContent("https://example.com/legacy-delegate-submit", "goal", "goal", "tags", 0);
        vm.stopPrank();

        assertEq(registry.getSubmitterIdentity(id), delegate, "legacy content should default to raw submitter");

        vm.prank(owner);
        registry.setVoterIdNFT(address(mockVoterIdNFT));
        mockVoterIdNFT.setHolder(submitter);
        vm.prank(submitter);
        mockVoterIdNFT.setDelegate(delegate);

        assertEq(registry.getSubmitterIdentity(id), submitter, "current delegate mapping should refine legacy identity");
    }

    function test_SubmitContent_VoterIdNotConfigured_Succeeds() public {
        // No voterIdNFT set — should skip check
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        uint256 id = registry.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();
        assertEq(id, 1);
    }

    function test_SubmitContent_NonHttpsUrl_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Invalid URL");
        registry.submitContent("javascript:alert(1)", "goal", "goal", "tags", 0);
        vm.stopPrank();
    }

    function test_SubmitContent_UrlWithWhitespace_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Invalid URL");
        registry.submitContent("https://example.com/ bad", "goal", "goal", "tags", 0);
        vm.stopPrank();
    }

    function test_SubmitContent_CategoryNotApproved_Reverts() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(99, "example.com");

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Category not approved");
        registry.submitContent("https://example.com/1", "goal", "goal", "tags", 99);
        vm.stopPrank();
    }

    function test_SubmitContent_CategoryZero_SkipsValidation_WhenRegistryUnset() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        uint256 id = registry.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();
        assertEq(id, 1);
    }

    function test_SubmitContent_ParticipationPool_DoesNotRewardImmediately() public {
        vm.prank(owner);
        registry.setParticipationPool(address(participationPool));

        uint256 balBefore = crepToken.balanceOf(submitter);
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        uint256 balAfter = crepToken.balanceOf(submitter);
        assertEq(balAfter, balBefore - 10e6, "submission should only lock stake until healthy resolution");
    }

    function test_ResolveSubmitterStake_NoSettledRound_LeavesStakeLocked() public {
        vm.prank(owner);
        registry.setParticipationPool(address(participationPool));

        uint256 balBefore = crepToken.balanceOf(submitter);
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 4 days + 1);
        votingEngine.resolveSubmitterStake(1);

        uint256 balAfter = crepToken.balanceOf(submitter);
        assertEq(balAfter, balBefore - 10e6, "no-vote content should not unlock through healthy resolution");
        assertFalse(registry.isSubmitterStakeReturned(1), "no-vote content should remain unresolved");
    }

    function test_ResolveSubmitterStake_NoSettledRound_ReturnsAfterDormancyPeriod() public {
        vm.prank(owner);
        registry.setParticipationPool(address(participationPool));

        uint256 balBefore = crepToken.balanceOf(submitter);
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/dormancy-return", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 31 days);
        votingEngine.resolveSubmitterStake(1);

        uint256 balAfter = crepToken.balanceOf(submitter);
        assertEq(balAfter, balBefore, "dormancy fallback should return the locked stake without a submission reward");
        assertTrue(registry.isSubmitterStakeReturned(1), "stake should resolve after the dormancy period");
    }

    function test_HealthyResolution_SnapshotsAndAllowsRetryableSubmitterParticipationReward() public {
        vm.startPrank(owner);
        ParticipationPool tinyPool = new ParticipationPool(address(crepToken), owner);
        tinyPool.setAuthorizedCaller(address(registry), true);
        crepToken.approve(address(tinyPool), 4e6);
        tinyPool.depositPool(4e6);
        registry.setParticipationPool(address(tinyPool));
        votingEngine.setParticipationPool(address(tinyPool));
        vm.stopPrank();

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/retryable-submitter-reward", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 4 days + 1);
        _settleHealthyRound(1);

        assertTrue(registry.isSubmitterStakeReturned(1), "healthy settlement should return stake");
        assertEq(registry.submitterParticipationRewardPool(1), address(tinyPool), "reward pool should be snapshotted");
        assertEq(registry.submitterParticipationRewardOwed(1), 9e6, "reward should be snapshotted at the healthy rate");
        assertEq(registry.submitterParticipationRewardPaid(1), 4e6, "initial best-effort payout should be tracked");

        vm.startPrank(owner);
        crepToken.approve(address(tinyPool), 5e6);
        tinyPool.depositPool(5e6);
        vm.stopPrank();

        uint256 submitterBalanceBeforeClaim = crepToken.balanceOf(submitter);
        vm.prank(submitter);
        uint256 paidAmount = registry.claimSubmitterParticipationReward(1);
        assertEq(paidAmount, 5e6, "claim should pay the remaining reward once the pool is refilled");
        assertEq(crepToken.balanceOf(submitter) - submitterBalanceBeforeClaim, 5e6, "submitter should receive the remaining reward");
        assertEq(registry.submitterParticipationRewardPaid(1), 9e6, "all snapshotted rewards should be accounted for");
    }

    function test_ClaimSubmitterParticipationReward_OnlySubmitter() public {
        vm.startPrank(owner);
        ParticipationPool tinyPool = new ParticipationPool(address(crepToken), owner);
        tinyPool.setAuthorizedCaller(address(registry), true);
        crepToken.approve(address(tinyPool), 4e6);
        tinyPool.depositPool(4e6);
        registry.setParticipationPool(address(tinyPool));
        votingEngine.setParticipationPool(address(tinyPool));
        vm.stopPrank();

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/submitter-only", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 4 days + 1);
        _settleHealthyRound(1);

        vm.prank(voter1);
        vm.expectRevert("Not submitter");
        registry.claimSubmitterParticipationReward(1);
    }

    function test_ResolveSubmitterStake_NoSettledRound_LowRatingSlashesAfterDormancyPeriod() public {
        uint256 treasuryBefore = crepToken.balanceOf(treasury);
        uint256 submitterBefore = crepToken.balanceOf(submitter);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/dormancy-slash", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.prank(address(votingEngine));
        registry.updateRatingDirect(1, 10);

        vm.warp(T0 + 31 days);
        votingEngine.resolveSubmitterStake(1);

        assertEq(crepToken.balanceOf(treasury) - treasuryBefore, 10e6, "low-rated dormant fallback should slash");
        assertEq(
            crepToken.balanceOf(submitter),
            submitterBefore - 10e6,
            "submitter should not recover stake after dormant fallback slash"
        );
        assertTrue(registry.isSubmitterStakeReturned(1), "stake should resolve after dormant fallback slash");
    }

    function test_SubmitContent_NoParticipationPool_NoReward() public {
        // Don't set participation pool — reward is skipped
        uint256 balBefore = crepToken.balanceOf(submitter);
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
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
        registry.submitContent(string(longUrl), "goal", "goal", "tags", 0);
        vm.stopPrank();
    }

    function test_SubmitContent_TitleTooLong_Reverts() public {
        bytes memory longGoal = new bytes(501);
        for (uint256 i = 0; i < longGoal.length; i++) {
            longGoal[i] = "a";
        }

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Title too long");
        registry.submitContent("https://example.com/1", string(longGoal), string(longGoal), "tags", 0);
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
        registry.submitContent("https://example.com/1", "goal", "goal", string(longTags), 0);
        vm.stopPrank();
    }

    function test_SubmitContent_DuplicateUrl_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        registry.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
        vm.expectRevert("URL already submitted");
        registry.submitContent("https://example.com/1", "goal2", "goal2", "tags2", 0);
        vm.stopPrank();
    }

    function test_SubmitContent_EmptyUrl_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("URL required");
        registry.submitContent("", "goal", "goal", "tags", 0);
        vm.stopPrank();
    }

    function test_SubmitContent_EmptyTitle_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Title required");
        registry.submitContent("https://example.com/1", "", "", "tags", 0);
        vm.stopPrank();
    }

    function test_SubmitContent_EmptyTags_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Tags required");
        registry.submitContent("https://example.com/1", "goal", "goal", "", 0);
        vm.stopPrank();
    }

    // =========================================================================
    // cancelContent BRANCHES
    // =========================================================================

    function test_CancelContent_NotSubmitter_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.prank(voter1);
        vm.expectRevert("Not submitter");
        registry.cancelContent(1);
    }

    function test_CancelContent_NotActive_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
        registry.cancelContent(1);

        vm.expectRevert("Not active");
        registry.cancelContent(1);
        vm.stopPrank();
    }

    function test_CancelContent_HasVotes_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
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
        reg2.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
        reg2.cancelContent(1);
        vm.stopPrank();

        ContentRegistry.Content memory c = reg2.getContent(1);
        assertEq(uint256(c.status), uint256(ContentRegistry.ContentStatus.Cancelled));
    }

    function test_CancelContent_FeeSentToConfiguredSink() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "goal", "tags", 0);

        uint256 bonusBefore = crepToken.balanceOf(bonusPool);
        registry.cancelContent(1);
        vm.stopPrank();

        uint256 bonusAfter = crepToken.balanceOf(bonusPool);
        assertEq(bonusAfter - bonusBefore, 1e6); // CANCELLATION_FEE
    }

    function test_CancelContent_FeeCanBeSentToTreasury() public {
        vm.prank(owner);
        registry.setBonusPool(treasury);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/treasury", "goal", "goal", "tags", 0);

        uint256 treasuryBefore = crepToken.balanceOf(treasury);
        registry.cancelContent(1);
        vm.stopPrank();

        uint256 treasuryAfter = crepToken.balanceOf(treasury);
        assertEq(treasuryAfter - treasuryBefore, 1e6);
    }

    // =========================================================================
    // markDormant BRANCHES
    // =========================================================================

    function test_MarkDormant_PeriodNotElapsed_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
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
        reg2.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 31 days);
        reg2.markDormant(1);

        ContentRegistry.Content memory c = reg2.getContent(1);
        assertEq(uint256(c.status), uint256(ContentRegistry.ContentStatus.Dormant));
    }

    function test_MarkDormant_Success() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 31 days);
        registry.markDormant(1);

        ContentRegistry.Content memory c = registry.getContent(1);
        assertEq(uint256(c.status), uint256(ContentRegistry.ContentStatus.Dormant));
    }

    function test_VoteCommit_UpdatesLastActivityAt() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/activity", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 29 days);
        _vote(voter1, 1, true);

        ContentRegistry.Content memory c = registry.getContent(1);
        assertEq(c.lastActivityAt, block.timestamp, "Commit should refresh lastActivityAt");
    }

    function test_MarkDormant_ActiveRound_AllVotesRevealed_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/open-round", "goal", "goal", "tags", 0);
        vm.stopPrank();

        (bytes32 commitKey, bytes32 salt) = _commit(voter1, 1, true);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);

        vm.warp(T0 + 1 hours + 1);
        votingEngine.revealVoteByCommitKey(1, roundId, commitKey, true, salt);

        assertEq(RoundEngineReadHelpers.activeRoundId(votingEngine, 1), roundId, "Round should still be open");
        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, 1, roundId);
        assertEq(round.voteCount, round.revealedCount, "All votes are revealed");

        vm.warp(T0 + 31 days);
        vm.expectRevert("Content has active round");
        registry.markDormant(1);
    }

    function test_MarkDormant_CancelledRound_UsesDormancyAnchor() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/recent-vote", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 29 days);
        _vote(voter1, 1, true);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);
        vm.warp(T0 + 29 days + 7 days + 1);
        votingEngine.cancelExpiredRound(1, roundId);

        registry.markDormant(1);

        ContentRegistry.Content memory c = registry.getContent(1);
        assertEq(uint256(c.status), uint256(ContentRegistry.ContentStatus.Dormant));
    }

    function test_CommitVote_DormancyEligibleContent_CannotStartNewRoundAfterCancellation() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/dormancy-guard", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 29 days);
        _vote(voter1, 1, true);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);
        vm.warp(T0 + 29 days + 7 days + 1);
        votingEngine.cancelExpiredRound(1, roundId);

        bytes32 salt = keccak256(abi.encodePacked(voter2, block.timestamp));
        bytes memory ciphertext = _testCiphertext(true, salt, 1);
        bytes32 commitHash = _commitHash(true, salt, 1, ciphertext);

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(RoundVotingEngine.DormancyWindowElapsed.selector);
        votingEngine.commitVote(1, commitHash, ciphertext, STAKE, address(0));
        vm.stopPrank();
    }

    function test_MarkDormant_ReleasesUrlForResubmission() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        registry.submitContent("https://example.com/dormant-url", "goal", "goal", "tags", 0);
        vm.stopPrank();

        // Mark dormant after 31 days
        vm.warp(T0 + 31 days);
        registry.markDormant(1);

        // Should be able to resubmit the same URL
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/dormant-url", "goal2", "goal2", "tags2", 0);
        vm.stopPrank();

        // New content created with same URL
        ContentRegistry.Content memory c2 = registry.getContent(2);
        assertEq(uint256(c2.status), uint256(ContentRegistry.ContentStatus.Active));
    }

    function test_MarkDormant_LowRatedContent_SlashesUnresolvedStake() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/dormant-slash", "goal", "goal", "tags", 0);
        vm.stopPrank();

        uint256 treasuryBefore = crepToken.balanceOf(treasury);
        uint256 submitterBefore = crepToken.balanceOf(submitter);

        vm.prank(address(votingEngine));
        registry.updateRatingDirect(1, 10);

        vm.warp(T0 + 31 days);
        registry.markDormant(1);

        assertEq(crepToken.balanceOf(treasury) - treasuryBefore, 10e6, "low-rated dormant content should be slashed");
        assertEq(
            crepToken.balanceOf(submitter),
            submitterBefore,
            "submitter should not recover stake after low-rated content goes dormant"
        );
    }

    function test_ReviveContent_ReservesUrlAgain() public {
        string memory url = "https://example.com/revive-url";

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent(url, "goal", "goal", "tags", 0);
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
        registry.submitContent(url, "goal2", "goal2", "tags2", 0);
        vm.stopPrank();
    }

    function test_ReviveContent_RevertsWhenUrlWasResubmitted() public {
        string memory url = "https://example.com/revive-conflict";

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent(url, "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 31 days);
        registry.markDormant(1);

        vm.startPrank(voter1);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent(url, "goal2", "goal2", "tags2", 0);
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
        reg2.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
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
        registry.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        // Set rating to 110 → should clamp to 100
        vm.prank(address(votingEngine));
        registry.updateRatingDirect(1, 110);

        assertEq(registry.getRating(1), 100);
    }

    function test_UpdateRatingDirect_FlooredAt0() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        // Set rating to 0
        vm.prank(address(votingEngine));
        registry.updateRatingDirect(1, 0);

        assertEq(registry.getRating(1), 0);
    }

    function test_UpdateRatingDirect_SameValue_NoChange() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        // Set same rating (50) → no change, no event
        vm.prank(address(votingEngine));
        registry.updateRatingDirect(1, 50);

        assertEq(registry.getRating(1), 50); // unchanged
    }

    function test_SubmitContent_CategoryApproved_Succeeds() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "example.com");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        uint256 id = registry.submitContent("https://example.com/1", "goal", "goal", "tags", 1);
        vm.stopPrank();
        assertEq(id, 1);
        assertEq(registry.getCategoryId(1), 1);
    }

    function test_SubmitContent_CategoryRegistryConfigured_AutoResolvesCategoryFromUrl() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(7, "example.com");
        mockCategoryRegistry.setApproved(7, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        uint256 id = registry.submitContent("https://example.com/auto", "goal", "goal", "tags", 0);
        vm.stopPrank();

        assertEq(id, 1);
        assertEq(registry.getCategoryId(id), 7, "configured registries should derive the category from the URL");
    }

    function test_SubmitContent_CategoryRegistryConfigured_UnapprovedDomainReverts() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "youtube.com");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Domain not approved");
        registry.submitContent("https://example.com/not-approved", "goal", "goal", "tags", 0);
        vm.stopPrank();
    }

    function test_SubmitContent_CategoryRegistryConfigured_MismatchedCategoryReverts() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "example.com");
        mockCategoryRegistry.setApproved(1, true);
        mockCategoryRegistry.setDomain(2, "youtube.com");
        mockCategoryRegistry.setApproved(2, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Category mismatch");
        registry.submitContent("https://example.com/mismatch", "goal", "goal", "tags", 2);
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_YouTubeVariantsCollide() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "youtube.com");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        registry.submitContent("https://youtu.be/dQw4w9WgXcQ", "goal", "goal", "tags", 0);
        vm.expectRevert("URL already submitted");
        registry.submitContent("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "goal2", "goal2", "tags2", 1);
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_TwitterAndXVariantsCollide() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "x.com");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        registry.submitContent("https://twitter.com/openai/status/12345", "goal", "goal", "tags", 0);
        vm.expectRevert("URL already submitted");
        registry.submitContent("https://x.com/openai/status/12345", "goal2", "goal2", "tags2", 1);
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_GitHubDeepPathCollidesWithRepoRoot() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "github.com");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        registry.submitContent("https://github.com/foundry-rs/foundry/tree/master/crates", "goal", "goal", "tags", 0);
        vm.expectRevert("URL already submitted");
        registry.submitContent("https://www.github.com/foundry-rs/foundry", "goal2", "goal2", "tags2", 1);
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_ScryfallQueryVariantCollides() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "scryfall.com");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        registry.submitContent("https://scryfall.com/card/lea/232/black-lotus?utm_source=test", "goal", "goal", "tags", 0);
        vm.expectRevert("URL already submitted");
        registry.submitContent("https://scryfall.com/card/lea/232/black-lotus", "goal2", "goal2", "tags2", 1);
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_TmdbSlugVariantCollides() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "themoviedb.org");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        registry.submitContent("https://www.themoviedb.org/movie/238-the-godfather", "goal", "goal", "tags", 0);
        vm.expectRevert("URL already submitted");
        registry.submitContent("https://themoviedb.org/movie/238", "goal2", "goal2", "tags2", 1);
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_WikipediaQueryVariantCollides() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "en.wikipedia.org");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        registry.submitContent("https://en.wikipedia.org/wiki/Lionel_Messi?oldformat=true", "goal", "goal", "tags", 0);
        vm.expectRevert("URL already submitted");
        registry.submitContent("https://en.wikipedia.org/wiki/Lionel_Messi", "goal2", "goal2", "tags2", 1);
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_RawgQueryVariantCollides() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "rawg.io");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        registry.submitContent("https://rawg.io/games/elden-ring?ref=feed", "goal", "goal", "tags", 0);
        vm.expectRevert("URL already submitted");
        registry.submitContent("https://rawg.io/games/elden-ring", "goal2", "goal2", "tags2", 1);
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_OpenLibraryTitleVariantCollides() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "openlibrary.org");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        registry.submitContent("https://openlibrary.org/works/OL45883W/Fantastic_Mr_Fox", "goal", "goal", "tags", 0);
        vm.expectRevert("URL already submitted");
        registry.submitContent("https://openlibrary.org/works/OL45883W", "goal2", "goal2", "tags2", 1);
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_HuggingFaceDeepPathCollides() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "huggingface.co");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        registry.submitContent("https://huggingface.co/Qwen/Qwen3.5-397B-A17B/tree/main", "goal", "goal", "tags", 0);
        vm.expectRevert("URL already submitted");
        registry.submitContent("https://huggingface.co/Qwen/Qwen3.5-397B-A17B", "goal2", "goal2", "tags2", 1);
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_CoinGeckoLocaleVariantCollides() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "coingecko.com");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        registry.submitContent("https://www.coingecko.com/en/coins/bitcoin", "goal", "goal", "tags", 0);
        vm.expectRevert("URL already submitted");
        registry.submitContent("https://coingecko.com/coins/bitcoin", "goal2", "goal2", "tags2", 1);
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_SpotifyEmbedVariantCollides() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "open.spotify.com");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        registry.submitContent("https://open.spotify.com/embed/show/5eXZwvvxt3K2dxha3BSaAe", "goal", "goal", "tags", 0);
        vm.expectRevert("URL already submitted");
        registry.submitContent("https://open.spotify.com/intl-de/show/5eXZwvvxt3K2dxha3BSaAe", "goal2", "goal2", "tags2", 1);
        vm.stopPrank();
    }
}
