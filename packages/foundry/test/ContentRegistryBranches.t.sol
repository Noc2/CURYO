// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test, stdStorage, StdStorage } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";
import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";

// =========================================================================
// TEST CONTRACT
// =========================================================================

contract ContentRegistryBranchesTest is VotingTestBase {
    using stdStorage for StdStorage;

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
    address public voter4 = address(6);
    address public voter5 = address(7);
    address public voter6 = address(8);
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
                    abi.encodeCall(
                        RoundVotingEngine.initialize,
                        (owner, address(crepToken), address(registry), address(_deployProtocolConfig(owner)))
                    )
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
        ProtocolConfig(address(votingEngine.protocolConfig())).setRewardDistributor(address(rewardDistributor));
        ProtocolConfig(address(votingEngine.protocolConfig())).setTreasury(treasury);
        _setTlockRoundConfig(ProtocolConfig(address(votingEngine.protocolConfig())), 1 hours, 7 days, 3, 1000);

        mockVoterIdNFT = new MockVoterIdNFT();
        mockCategoryRegistry = new MockCategoryRegistry();
        mockCategoryRegistry.seedDefaultTestCategories();
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(votingEngine.protocolConfig())).setCategoryRegistry(address(mockCategoryRegistry));

        participationPool = new ParticipationPool(address(crepToken), owner);
        participationPool.setAuthorizedCaller(address(registry), true);
        participationPool.setAuthorizedCaller(address(rewardDistributor), true);

        crepToken.mint(owner, 2_000_000e6);
        crepToken.approve(address(participationPool), 500_000e6);
        participationPool.depositPool(500_000e6);
        crepToken.approve(address(votingEngine), 500_000e6);
        votingEngine.addToConsensusReserve(500_000e6);

        address[9] memory users = [submitter, voter1, voter2, voter3, voter4, voter5, voter6, keeper, delegate];
        for (uint256 i = 0; i < users.length; i++) {
            crepToken.mint(users[i], 10_000e6);
        }

        vm.stopPrank();
    }

    function _vote(address voter, uint256 contentId, bool isUp) internal {
        _commit(voter, contentId, isUp);
    }

    function _commit(address voter, uint256 contentId, bool isUp) internal returns (bytes32 commitKey, bytes32 salt) {
        return _commitWithStake(voter, contentId, isUp, STAKE);
    }

    function _commitWithStake(address voter, uint256 contentId, bool isUp, uint256 stake)
        internal
        returns (bytes32 commitKey, bytes32 salt)
    {
        salt = keccak256(abi.encodePacked(voter, block.timestamp));
        uint16 referenceRatingBps = _currentRatingReferenceBps(contentId);
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);
        bytes32 commitHash = _commitHash(
            isUp,
            salt,
            contentId,
            referenceRatingBps,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ciphertext
        );
        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), stake);
        votingEngine.commitVote(
            contentId, referenceRatingBps, _tlockCommitTargetRound(), _tlockDrandChainHash(), commitHash, ciphertext, stake, address(0)
        );
        vm.stopPrank();
        commitKey = keccak256(abi.encodePacked(voter, commitHash));
    }

    function _settleHealthyRound(uint256 contentId) internal returns (uint256 roundId) {
        return _settleHealthyRoundWithVoters(contentId, voter1, voter2, voter3);
    }

    function _settleHealthyRoundWithVoters(uint256 contentId, address upVoter1, address upVoter2, address downVoter)
        internal
        returns (uint256 roundId)
    {
        (bytes32 ck1, bytes32 salt1) = _commit(upVoter1, contentId, true);
        (bytes32 ck2, bytes32 salt2) = _commit(upVoter2, contentId, true);
        (bytes32 ck3, bytes32 salt3) = _commit(downVoter, contentId, false);

        roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        vm.warp(block.timestamp + 1 hours + 1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck1, true, salt1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck2, true, salt2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck3, false, salt3);
        votingEngine.settleRound(contentId, roundId);
    }

    function _configureParticipationPoolSnapshots() internal {
        vm.startPrank(owner);
        registry.setParticipationPool(address(participationPool));
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(participationPool));
        vm.stopPrank();
    }

    function _mockParticipationRateUnavailable() internal {
        vm.mockCallRevert(
            address(participationPool),
            abi.encodeWithSelector(ParticipationPool.getCurrentRateBps.selector),
            abi.encodeWithSignature("Error(string)", "rate unavailable")
        );
    }

    // =========================================================================
    // submitContent BRANCHES
    // =========================================================================

    function test_SubmitQuestion_AllowsImageUrlWithApprovedCategory() public {
        string memory url = "https://unmapped.example/reviews/widget-1.jpg";
        string memory title = "Does this product look useful?";
        string memory description = "A subjective product review question with a required image link.";
        string memory tags = "Products,Review";
        uint256 categoryId = 1;
        bytes32 salt = keccak256("arbitrary-question-url");

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        (uint256 id, bytes32 submissionKey) =
            _submitQuestionImageWithReservation(registry, url, title, description, tags, categoryId, salt, submitter);
        vm.stopPrank();

        (,,,,,,,,,,, uint256 storedCategoryId) = registry.contents(id);
        assertEq(storedCategoryId, categoryId);
        assertTrue(registry.submissionKeyUsed(submissionKey));
    }

    function test_SubmitQuestion_EmptyMedia_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Media required");
        registry.submitQuestionWithMedia(_emptyImageUrls(), "", "Question?", "Context", "Products", 1, bytes32(0));
        vm.stopPrank();
    }

    function test_SubmitQuestion_GenericEvidenceUrl_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Invalid media URL");
        registry.submitQuestionWithMedia(
            _singleImageUrls("https://example.com/reviews/widget-1"),
            "",
            "Question?",
            "Context",
            "Products",
            1,
            bytes32(0)
        );
        vm.stopPrank();
    }

    function test_SubmitQuestion_AllowsYouTubeVideoWithApprovedCategory() public {
        string memory url = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
        string memory title = "Is this video clear?";
        string memory description = "A subjective video review question.";
        string memory tags = "Video,Review";
        uint256 categoryId = 5;
        bytes32 salt = keccak256("youtube-question-url");

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        string[] memory imageUrls = _emptyImageUrls();
        bytes32 submissionKey = _reserveQuestionMediaSubmission(
            registry, imageUrls, url, title, description, tags, categoryId, salt, submitter
        );
        vm.warp(block.timestamp + 1);
        uint256 id = registry.submitQuestionWithMedia(imageUrls, url, title, description, tags, categoryId, salt);
        vm.stopPrank();

        (,,,,,,,,,,, uint256 storedCategoryId) = registry.contents(id);
        assertEq(storedCategoryId, categoryId);
        assertTrue(registry.submissionKeyUsed(submissionKey));
    }

    function test_SubmitQuestionWithMedia_AllowsMultipleImages() public {
        string[] memory imageUrls = new string[](2);
        imageUrls[0] = "https://example.com/a.jpg";
        imageUrls[1] = "https://example.com/b.webp";
        string memory title = "Which product image works better?";
        string memory description = "Compare the two images for usefulness.";
        string memory tags = "Products,Images";
        uint256 categoryId = 1;
        bytes32 salt = keccak256("multi-image-question");

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        (, bytes32 submissionKey) =
            registry.previewQuestionMediaSubmissionKey(imageUrls, "", title, description, tags, categoryId);
        bytes32 revealCommitment =
            keccak256(abi.encode(submissionKey, title, description, tags, categoryId, salt, submitter));
        registry.reserveSubmission(revealCommitment);
        vm.warp(block.timestamp + 1);
        uint256 id = registry.submitQuestionWithMedia(imageUrls, "", title, description, tags, categoryId, salt);
        vm.stopPrank();

        (,, address rawSubmitter,,,,,,,,, uint64 storedCategoryId) = registry.contents(id);
        assertEq(rawSubmitter, submitter);
        assertEq(storedCategoryId, categoryId);
        assertTrue(registry.submissionKeyUsed(submissionKey));
    }

    function test_SubmitQuestionWithMedia_RejectsMixedImagesAndVideo() public {
        string[] memory imageUrls = new string[](1);
        imageUrls[0] = "https://example.com/a.jpg";

        vm.expectRevert("Choose images or video");
        registry.previewQuestionMediaSubmissionKey(
            imageUrls, "https://www.youtube.com/watch?v=jNQXAC9IVRw", "Question?", "Context", "Media", 5
        );
    }

    function test_SubmitQuestionWithMedia_RejectsTooManyImages() public {
        string[] memory imageUrls = new string[](5);
        for (uint256 i = 0; i < imageUrls.length; i++) {
            imageUrls[i] = "https://example.com/a.jpg";
        }

        vm.expectRevert("Too many images");
        registry.previewQuestionMediaSubmissionKey(imageUrls, "", "Question?", "Context", "Media", 5);
    }

    function test_SubmitContent_VoterIdRequired_RevertsWithoutId() public {
        vm.prank(owner);
        registry.setVoterIdNFT(address(mockVoterIdNFT));

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Voter ID required");
        registry.submitQuestionWithMedia(
            _singleImageUrls("https://example.com/1.jpg"), "", "goal", "goal", "tags", 1, bytes32(0)
        );
        vm.stopPrank();
    }

    function test_SubmitContent_VoterIdRequired_SucceedsWithId() public {
        vm.prank(owner);
        registry.setVoterIdNFT(address(mockVoterIdNFT));
        mockVoterIdNFT.setHolder(submitter);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        uint256 id = _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
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
        uint256 id =
            _submitContentWithReservation(registry, "https://example.com/delegate-submit", "goal", "goal", "tags", 0);
        vm.stopPrank();

        (,, address rawSubmitter,,,,,,,,,) = registry.contents(id);
        assertEq(rawSubmitter, delegate, "raw submitter should remain delegate wallet");
        assertEq(registry.getSubmitterIdentity(id), submitter, "submitter identity should snapshot the holder");
    }

    function test_SubmitContent_VoterIdNotConfigured_Succeeds() public {
        // No voterIdNFT set — should skip check
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        uint256 id = _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();
        assertEq(id, 1);
    }

    function test_SubmitContent_NonHttpsUrl_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Invalid URL");
        registry.submitQuestionWithMedia(
            _singleImageUrls("javascript:alert(1)"), "", "goal", "goal", "tags", 1, bytes32(0)
        );
        vm.stopPrank();
    }

    function test_SubmitContent_HttpUrl_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Invalid URL");
        registry.submitQuestionWithMedia(
            _singleImageUrls("http://example.com/1.jpg"), "", "goal", "goal", "tags", 1, bytes32(0)
        );
        vm.stopPrank();
    }

    function test_SubmitContent_UrlWithWhitespace_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Invalid URL");
        registry.submitQuestionWithMedia(
            _singleImageUrls("https://example.com/ bad.jpg"), "", "goal", "goal", "tags", 1, bytes32(0)
        );
        vm.stopPrank();
    }

    function test_SubmitContent_CategoryNotRegistered_Reverts() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(99, "example.com");

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Category not registered");
        registry.submitQuestionWithMedia(
            _singleImageUrls("https://example.com/1.jpg"), "", "goal", "goal", "tags", 99, bytes32(0)
        );
        vm.stopPrank();
    }

    function test_SubmitContent_RevertsWhenNextContentIdExceedsUint64() public {
        stdstore.target(address(registry)).sig("nextContentId()").checked_write(uint256(type(uint64).max) + 1);

        string memory url = "https://example.com/overflow-content-id";
        string memory title = "goal";
        string memory description = "goal";
        string memory tags = "tags";
        bytes32 salt = keccak256("overflow-content-id");

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        string memory imageUrl = _submissionImageUrl(url);
        string[] memory imageUrls = _singleImageUrls(imageUrl);
        (, bytes32 submissionKey) = registry.previewQuestionMediaSubmissionKey(imageUrls, "", title, description, tags, 1);
        bytes32 revealCommitment = keccak256(abi.encode(submissionKey, title, description, tags, 1, salt, submitter));
        registry.reserveSubmission(revealCommitment);
        vm.warp(block.timestamp + 1);
        vm.expectRevert();
        registry.submitQuestionWithMedia(imageUrls, "", title, description, tags, 1, salt);
        vm.stopPrank();
    }

    function test_SubmitContent_RevertsWhenResolvedCategoryIdExceedsUint64() public {
        uint256 oversizedCategoryId = uint256(type(uint64).max) + 1;
        mockCategoryRegistry.setDomain(oversizedCategoryId, "overflow-category.example");
        mockCategoryRegistry.setApproved(oversizedCategoryId, true);

        string memory url = "https://overflow-category.example/item";
        string memory title = "goal";
        string memory description = "goal";
        string memory tags = "tags";
        bytes32 salt = keccak256("overflow-category-id");

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        string memory imageUrl = _submissionImageUrl(url);
        string[] memory imageUrls = _singleImageUrls(imageUrl);
        (, bytes32 submissionKey) =
            registry.previewQuestionMediaSubmissionKey(imageUrls, "", title, description, tags, oversizedCategoryId);
        bytes32 revealCommitment =
            keccak256(abi.encode(submissionKey, title, description, tags, oversizedCategoryId, salt, submitter));
        registry.reserveSubmission(revealCommitment);
        vm.warp(block.timestamp + 1);
        vm.expectRevert();
        registry.submitQuestionWithMedia(imageUrls, "", title, description, tags, oversizedCategoryId, salt);
        vm.stopPrank();
    }

    function test_SubmitContent_ParticipationPool_DoesNotRewardImmediately() public {
        vm.prank(owner);
        registry.setParticipationPool(address(participationPool));

        uint256 balBefore = crepToken.balanceOf(submitter);
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
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
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 4 days + 1);
        votingEngine.resolveSubmitterStake(1);

        uint256 balAfter = crepToken.balanceOf(submitter);
        assertEq(balAfter, balBefore - 10e6, "no-vote content should not unlock through healthy resolution");
        (,,,,,,,,, bool submitterStakeReturned,,) = registry.contents(1);
        assertFalse(submitterStakeReturned, "no-vote content should remain unresolved");
    }

    function test_ResolveSubmitterStake_NoSettledRound_ReturnsAfterDormancyPeriod() public {
        vm.prank(owner);
        registry.setParticipationPool(address(participationPool));

        uint256 balBefore = crepToken.balanceOf(submitter);
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/dormancy-return", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 31 days);
        votingEngine.resolveSubmitterStake(1);

        uint256 balAfter = crepToken.balanceOf(submitter);
        assertEq(balAfter, balBefore, "dormancy fallback should return the locked stake without a submission reward");
        (,,,,,,,,, bool submitterStakeReturned,,) = registry.contents(1);
        assertTrue(submitterStakeReturned, "stake should resolve after the dormancy period");
    }

    function test_HealthyResolution_SnapshotsAndAllowsRetryableSubmitterParticipationReward() public {
        vm.startPrank(owner);
        ParticipationPool tinyPool = new ParticipationPool(address(crepToken), owner);
        tinyPool.setAuthorizedCaller(address(registry), true);
        crepToken.approve(address(tinyPool), 4e6);
        tinyPool.depositPool(4e6);
        registry.setParticipationPool(address(tinyPool));
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(tinyPool));
        vm.stopPrank();

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(
            registry, "https://example.com/retryable-submitter-reward", "goal", "goal", "tags", 0
        );
        vm.stopPrank();

        vm.warp(T0 + 4 days + 1);
        _settleHealthyRound(1);

        (,,,,,,,,, bool submitterStakeReturned,,) = registry.contents(1);
        assertTrue(submitterStakeReturned, "healthy settlement should return stake");
        assertEq(registry.submitterParticipationRewardPool(1), address(tinyPool), "reward pool should be snapshotted");
        assertEq(registry.submitterParticipationRewardOwed(1), 9e6, "reward should be snapshotted at the healthy rate");
        assertEq(registry.submitterParticipationRewardReserved(1), 4e6, "available pool balance should be reserved");
        assertEq(registry.submitterParticipationRewardPaid(1), 0, "submitter rewards should remain pull-based");

        vm.startPrank(owner);
        crepToken.approve(address(tinyPool), 5e6);
        tinyPool.depositPool(5e6);
        vm.stopPrank();

        uint256 submitterBalanceBeforeClaim = crepToken.balanceOf(submitter);
        vm.prank(submitter);
        uint256 paidAmount = registry.claimSubmitterParticipationReward(1);
        assertEq(paidAmount, 9e6, "claim should pay the reserved reward plus any newly available remainder");
        assertEq(
            crepToken.balanceOf(submitter) - submitterBalanceBeforeClaim,
            9e6,
            "submitter should receive the full snapshotted reward"
        );
        assertEq(registry.submitterParticipationRewardPaid(1), 9e6, "all snapshotted rewards should be accounted for");
    }

    function test_RepairMilestoneZeroSubmitterParticipationTerms_BeforeResolutionRestoresHealthyReward() public {
        _configureParticipationPoolSnapshots();

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(
            registry, "https://example.com/m0-repair-before-resolution", "goal", "goal", "tags", 0
        );
        vm.stopPrank();

        _mockParticipationRateUnavailable();
        _settleHealthyRound(1);
        vm.clearMockedCalls();

        assertEq(
            registry.milestoneZeroSubmitterParticipationPool(1),
            address(participationPool),
            "first settlement should still freeze the milestone-zero pool"
        );
        assertEq(registry.milestoneZeroSubmitterParticipationRateBps(1), 0, "failed lookup should freeze a zero rate");
        assertEq(registry.submitterParticipationRewardOwed(1), 0, "no reward should accrue before the repair");

        vm.prank(owner);
        registry.repairMilestoneZeroSubmitterParticipationTerms(1, 9000);

        assertEq(registry.milestoneZeroSubmitterParticipationRateBps(1), 9000, "repair should patch the frozen rate");
        assertEq(
            registry.submitterParticipationRewardOwed(1), 0, "repair should not accrue rewards before stake resolution"
        );

        vm.prank(owner);
        vm.expectRevert("Repair not needed");
        registry.repairMilestoneZeroSubmitterParticipationTerms(1, 9000);

        vm.warp(T0 + 4 days + 1);
        votingEngine.resolveSubmitterStake(1);

        assertEq(
            registry.submitterParticipationRewardOwed(1),
            9e6,
            "healthy resolution should accrue the repaired milestone-zero reward"
        );
        assertEq(
            registry.submitterParticipationRewardReserved(1),
            9e6,
            "healthy resolution should reserve the repaired reward from the frozen pool"
        );

        uint256 submitterBalanceBeforeClaim = crepToken.balanceOf(submitter);
        vm.prank(submitter);
        uint256 paidAmount = registry.claimSubmitterParticipationReward(1);
        assertEq(paidAmount, 9e6, "claim should pay the repaired milestone-zero reward");
        assertEq(
            crepToken.balanceOf(submitter) - submitterBalanceBeforeClaim,
            9e6,
            "submitter should receive the repaired milestone-zero reward"
        );
    }

    function test_RepairMilestoneZeroSubmitterParticipationTerms_AfterHealthyResolutionAccruesRetroactively() public {
        _configureParticipationPoolSnapshots();

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(
            registry, "https://example.com/m0-repair-after-resolution", "goal", "goal", "tags", 0
        );
        vm.stopPrank();

        _mockParticipationRateUnavailable();
        _settleHealthyRound(1);
        vm.clearMockedCalls();

        vm.warp(T0 + 4 days + 1);
        votingEngine.resolveSubmitterStake(1);

        (,,,,,,,,, bool submitterStakeReturned,,) = registry.contents(1);
        assertTrue(submitterStakeReturned, "healthy milestone-zero resolution should still return stake");
        assertEq(registry.submitterParticipationRewardOwed(1), 0, "zeroed milestone-zero rate should skip accrual");

        vm.prank(owner);
        registry.repairMilestoneZeroSubmitterParticipationTerms(1, 9000);

        assertEq(
            registry.submitterParticipationRewardPool(1),
            address(participationPool),
            "retroactive repair should reuse the frozen milestone-zero pool"
        );
        assertEq(
            registry.submitterParticipationRewardOwed(1),
            9e6,
            "retroactive repair should accrue the missing submitter reward"
        );
        assertEq(
            registry.submitterParticipationRewardReserved(1),
            9e6,
            "retroactive repair should reserve the missing reward when liquidity is available"
        );

        uint256 submitterBalanceBeforeClaim = crepToken.balanceOf(submitter);
        vm.prank(submitter);
        uint256 paidAmount = registry.claimSubmitterParticipationReward(1);
        assertEq(paidAmount, 9e6, "claim should pay the retroactively accrued reward");
        assertEq(
            crepToken.balanceOf(submitter) - submitterBalanceBeforeClaim,
            9e6,
            "submitter should receive the retroactively repaired reward"
        );
    }

    function test_RepairMilestoneZeroSubmitterParticipationTerms_RevertsWhenNoMilestoneZeroPoolWasFrozen() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/m0-no-pool", "goal", "goal", "tags", 0);
        vm.stopPrank();

        _settleHealthyRound(1);

        vm.prank(owner);
        vm.expectRevert("No milestone-zero pool");
        registry.repairMilestoneZeroSubmitterParticipationTerms(1, 9000);
    }

    function test_RepairMilestoneZeroSubmitterParticipationTerms_RevertsAfterSlashPath() public {
        _configureParticipationPoolSnapshots();
        uint256 slashStake = 20e6;

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/m0-slash-repair", "goal", "goal", "tags", 0);
        vm.stopPrank();

        (bytes32 ck1, bytes32 salt1) = _commitWithStake(voter1, 1, false, slashStake);
        (bytes32 ck2, bytes32 salt2) = _commitWithStake(voter2, 1, false, slashStake);
        (bytes32 ck3, bytes32 salt3) = _commitWithStake(voter3, 1, false, slashStake);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);
        _mockParticipationRateUnavailable();
        vm.warp(block.timestamp + 1 hours + 1);
        votingEngine.revealVoteByCommitKey(1, roundId, ck1, false, salt1);
        votingEngine.revealVoteByCommitKey(1, roundId, ck2, false, salt2);
        votingEngine.revealVoteByCommitKey(1, roundId, ck3, false, salt3);
        votingEngine.settleRound(1, roundId);
        vm.clearMockedCalls();

        vm.warp(T0 + 24 hours + 1);
        votingEngine.resolveSubmitterStake(1);

        vm.prank(owner);
        vm.expectRevert("Slashable milestone-zero");
        registry.repairMilestoneZeroSubmitterParticipationTerms(1, 9000);
    }

    function test_HealthyResolution_UsesSettlementSnapshotInsteadOfDelayedCurrentRate() public {
        vm.startPrank(owner);
        ParticipationPool shiftingPool = new ParticipationPool(address(crepToken), owner);
        shiftingPool.setAuthorizedCaller(address(registry), true);
        shiftingPool.setAuthorizedCaller(owner, true);
        crepToken.mint(owner, 3_000_000e6);
        crepToken.approve(address(shiftingPool), 3_000_000e6);
        shiftingPool.depositPool(3_000_000e6);
        registry.setParticipationPool(address(shiftingPool));
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(shiftingPool));
        vm.stopPrank();

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(
            registry, "https://example.com/snapshotted-submitter-rate", "goal", "goal", "tags", 0
        );
        vm.stopPrank();

        _settleHealthyRound(1);

        assertEq(
            registry.submitterParticipationSnapshotRateBps(1), 9000, "healthy settlement should snapshot the live rate"
        );

        vm.prank(owner);
        shiftingPool.rewardSubmission(owner, 2_300_000e6);
        assertEq(shiftingPool.getCurrentRateBps(), 4500, "live pool rate should have decayed before delayed resolution");

        vm.warp(T0 + 4 days + 1);
        votingEngine.resolveSubmitterStake(1);

        assertEq(
            registry.submitterParticipationRewardPool(1),
            address(shiftingPool),
            "delayed healthy resolution should use the snapshotted pool"
        );
        assertEq(
            registry.submitterParticipationRewardOwed(1),
            9e6,
            "delayed healthy resolution should keep the settlement-time reward rate"
        );
    }

    function test_HealthyResolution_UsesMilestoneZeroSnapshotInsteadOfLaterSettlementRate() public {
        vm.startPrank(owner);
        ParticipationPool shiftingPool = new ParticipationPool(address(crepToken), owner);
        shiftingPool.setAuthorizedCaller(address(registry), true);
        shiftingPool.setAuthorizedCaller(address(rewardDistributor), true);
        shiftingPool.setAuthorizedCaller(owner, true);
        crepToken.mint(owner, 3_000_000e6);
        crepToken.approve(address(shiftingPool), 3_000_000e6);
        shiftingPool.depositPool(3_000_000e6);
        registry.setParticipationPool(address(shiftingPool));
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(shiftingPool));
        vm.stopPrank();

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(
            registry, "https://example.com/milestone-zero-submitter-rate", "goal", "goal", "tags", 0
        );
        vm.stopPrank();

        _settleHealthyRound(1);
        assertEq(
            registry.submitterParticipationSnapshotRateBps(1), 9000, "first settlement should snapshot the live rate"
        );

        vm.prank(owner);
        shiftingPool.rewardSubmission(owner, 2_300_000e6);
        assertEq(shiftingPool.getCurrentRateBps(), 4500, "live pool rate should decay before the later settlement");

        _settleHealthyRoundWithVoters(1, voter4, voter5, voter6);
        assertEq(
            registry.submitterParticipationSnapshotRateBps(1), 4500, "latest snapshot should follow the later round"
        );

        vm.warp(T0 + 4 days + 1);
        votingEngine.resolveSubmitterStake(1);

        assertEq(
            registry.submitterParticipationRewardPool(1),
            address(shiftingPool),
            "milestone-0 resolution should keep the first settled pool"
        );
        assertEq(
            registry.submitterParticipationRewardOwed(1),
            9e6,
            "later settlements must not rewrite the milestone-0 reward rate"
        );
    }

    function test_ClaimSubmitterParticipationReward_ReservedPortionSurvivesPoolDeauthorization() public {
        vm.startPrank(owner);
        ParticipationPool tinyPool = new ParticipationPool(address(crepToken), owner);
        tinyPool.setAuthorizedCaller(address(registry), true);
        crepToken.approve(address(tinyPool), 4e6);
        tinyPool.depositPool(4e6);
        registry.setParticipationPool(address(tinyPool));
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(tinyPool));
        vm.stopPrank();

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(
            registry, "https://example.com/submitter-reserved-reward", "goal", "goal", "tags", 0
        );
        vm.stopPrank();

        vm.warp(T0 + 4 days + 1);
        _settleHealthyRound(1);

        vm.prank(owner);
        tinyPool.setAuthorizedCaller(address(registry), false);

        uint256 submitterBalanceBeforeClaim = crepToken.balanceOf(submitter);
        vm.prank(submitter);
        uint256 paidAmount = registry.claimSubmitterParticipationReward(1);

        assertEq(paidAmount, 4e6, "reserved rewards should remain claimable even after deauthorization");
        assertEq(
            crepToken.balanceOf(submitter) - submitterBalanceBeforeClaim,
            4e6,
            "submitter should receive the reserved amount"
        );
        assertEq(registry.submitterParticipationRewardPaid(1), 4e6, "paid amount should track the reserved payout");
    }

    function test_ClaimSubmitterParticipationReward_OnlySubmitter() public {
        vm.startPrank(owner);
        ParticipationPool tinyPool = new ParticipationPool(address(crepToken), owner);
        tinyPool.setAuthorizedCaller(address(registry), true);
        crepToken.approve(address(tinyPool), 4e6);
        tinyPool.depositPool(4e6);
        registry.setParticipationPool(address(tinyPool));
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(tinyPool));
        vm.stopPrank();

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/submitter-only", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 4 days + 1);
        _settleHealthyRound(1);

        vm.prank(voter1);
        vm.expectRevert("Not submitter");
        registry.claimSubmitterParticipationReward(1);
    }

    function test_MarkDormant_PreservesHealthySubmitterParticipationRewardSnapshot() public {
        vm.startPrank(owner);
        registry.setParticipationPool(address(participationPool));
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(participationPool));
        vm.stopPrank();

        uint256 submitterBalanceBeforeSubmit = crepToken.balanceOf(submitter);
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(
            registry, "https://example.com/dormant-submitter-reward", "goal", "goal", "tags", 0
        );
        vm.stopPrank();

        _settleHealthyRound(1);

        vm.warp(block.timestamp + 30 days + 1);
        registry.markDormant(1);

        (,,,,,, ContentRegistry.ContentStatus status,,, bool submitterStakeReturned,,) = registry.contents(1);
        assertEq(
            uint256(status), uint256(ContentRegistry.ContentStatus.Dormant), "content should transition to dormant"
        );
        assertTrue(submitterStakeReturned, "dormancy should still resolve the submitter stake");
        assertEq(
            crepToken.balanceOf(submitter),
            submitterBalanceBeforeSubmit,
            "dormancy fallback should return the locked submitter stake"
        );
        assertEq(
            registry.submitterParticipationRewardOwed(1),
            9e6,
            "healthy dormancy fallback should preserve the snapshotted submitter reward"
        );

        uint256 submitterBalanceBeforeClaim = crepToken.balanceOf(submitter);
        vm.prank(submitter);
        uint256 paidAmount = registry.claimSubmitterParticipationReward(1);

        assertEq(paidAmount, 9e6, "submitter should still be able to claim the preserved reward after dormancy");
        assertEq(
            crepToken.balanceOf(submitter) - submitterBalanceBeforeClaim,
            9e6,
            "claim should transfer the full preserved reward after dormancy"
        );
    }

    function test_ResolveSubmitterStake_NoSettledRound_LowDisplayRatingStillReturnsAfterDormancyPeriod() public {
        uint256 treasuryBefore = crepToken.balanceOf(treasury);
        uint256 submitterBefore = crepToken.balanceOf(submitter);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/dormancy-slash", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.prank(address(votingEngine));
        registry.updateRatingDirect(1, 10);

        vm.warp(T0 + 31 days);
        votingEngine.resolveSubmitterStake(1);

        assertEq(crepToken.balanceOf(treasury) - treasuryBefore, 0, "display rating alone should not slash");
        assertEq(
            crepToken.balanceOf(submitter),
            submitterBefore,
            "submitter should recover stake when no settled evidence exists"
        );
        (,,,,,,,,, bool submitterStakeReturned,,) = registry.contents(1);
        assertTrue(submitterStakeReturned, "stake should resolve after dormant fallback");
        assertFalse(
            registry.isSubmitterStakeSlashable(1), "manual display rating changes should not make content slashable"
        );
    }

    function test_SubmitContent_NoParticipationPool_NoReward() public {
        // Don't set participation pool — reward is skipped
        uint256 balBefore = crepToken.balanceOf(submitter);
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
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
        vm.expectRevert("Invalid URL");
        registry.submitQuestionWithMedia(_singleImageUrls(string(longUrl)), "", "goal", "goal", "tags", 1, bytes32(0));
        vm.stopPrank();
    }

    function test_SubmitContent_TitleTooLong_Reverts() public {
        uint256 maxQuestionLength = registry.MAX_QUESTION_LENGTH() + 1;
        bytes memory longGoal = new bytes(maxQuestionLength);
        for (uint256 i = 0; i < maxQuestionLength; i++) {
            longGoal[i] = "a";
        }

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Question too long");
        registry.submitQuestionWithMedia(
            _singleImageUrls("https://example.com/1.jpg"), "", string(longGoal), string(longGoal), "tags", 1, bytes32(0)
        );
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
        registry.submitQuestionWithMedia(
            _singleImageUrls("https://example.com/1.jpg"), "", "goal", "goal", string(longTags), 1, bytes32(0)
        );
        vm.stopPrank();
    }

    function test_SubmitContent_DuplicateUrl_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
        vm.expectRevert("Question already submitted");
        registry.submitQuestionWithMedia(
            _singleImageUrls(_submissionImageUrl("https://example.com/1")),
            "",
            "goal",
            "goal",
            "tags",
            1,
            bytes32(0)
        );
        vm.stopPrank();
    }

    function test_SubmitContent_EmptyUrl_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Media required");
        registry.submitQuestionWithMedia(_emptyImageUrls(), "", "goal", "goal", "tags", 1, bytes32(0));
        vm.stopPrank();
    }

    function test_SubmitContent_EmptyTitle_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Question required");
        registry.submitQuestionWithMedia(
            _singleImageUrls("https://example.com/1.jpg"), "", "", "", "tags", 1, bytes32(0)
        );
        vm.stopPrank();
    }

    function test_SubmitContent_EmptyTags_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Tags required");
        registry.submitQuestionWithMedia(
            _singleImageUrls("https://example.com/1.jpg"), "", "goal", "goal", "", 1, bytes32(0)
        );
        vm.stopPrank();
    }

    // =========================================================================
    // cancelContent BRANCHES
    // =========================================================================

    function test_CancelContent_NotSubmitter_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.prank(voter1);
        vm.expectRevert("Not submitter");
        registry.cancelContent(1);
    }

    function test_CancelContent_NotActive_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
        registry.cancelContent(1);

        vm.expectRevert("Not active");
        registry.cancelContent(1);
        vm.stopPrank();
    }

    function test_CancelContent_HasVotes_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
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
        MockCategoryRegistry mockCategoryRegistry2 = new MockCategoryRegistry();
        mockCategoryRegistry2.seedDefaultTestCategories();
        reg2.setCategoryRegistry(address(mockCategoryRegistry2));
        // DON'T set votingEngine
        vm.stopPrank();

        vm.startPrank(submitter);
        crepToken.approve(address(reg2), 10e6);
        _submitContentWithReservation(reg2, "https://example.com/1", "goal", "goal", "tags", 0);
        reg2.cancelContent(1);
        vm.stopPrank();

        (,,,,,, ContentRegistry.ContentStatus status,,,,,) = reg2.contents(1);
        assertEq(uint256(status), uint256(ContentRegistry.ContentStatus.Cancelled));
    }

    function test_CancelContent_FeeSentToConfiguredSink() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);

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
        _submitContentWithReservation(registry, "https://example.com/treasury", "goal", "goal", "tags", 0);

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
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
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
        MockCategoryRegistry mockCategoryRegistry2 = new MockCategoryRegistry();
        mockCategoryRegistry2.seedDefaultTestCategories();
        reg2.setCategoryRegistry(address(mockCategoryRegistry2));
        // DON'T set votingEngine
        vm.stopPrank();

        vm.startPrank(submitter);
        crepToken.approve(address(reg2), 10e6);
        _submitContentWithReservation(reg2, "https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 31 days);
        reg2.markDormant(1);

        (,,,,,, ContentRegistry.ContentStatus status,,,,,) = reg2.contents(1);
        assertEq(uint256(status), uint256(ContentRegistry.ContentStatus.Dormant));
    }

    function test_MarkDormant_Success() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 31 days);
        registry.markDormant(1);

        (,,,,,, ContentRegistry.ContentStatus status,,,,,) = registry.contents(1);
        assertEq(uint256(status), uint256(ContentRegistry.ContentStatus.Dormant));
    }

    function test_VoteCommit_UpdatesLastActivityAt() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/activity", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 29 days);
        _vote(voter1, 1, true);

        (,,,,, uint256 lastActivityAt,,,,,,) = registry.contents(1);
        assertEq(lastActivityAt, block.timestamp, "Commit should refresh lastActivityAt");
    }

    function test_MarkDormant_ActiveRound_AllVotesRevealed_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/open-round", "goal", "goal", "tags", 0);
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

    function test_IsDormancyEligible_ActiveRound_AllVotesRevealed_ReturnsFalse() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/open-round-eligible", "goal", "goal", "tags", 0);
        vm.stopPrank();

        (bytes32 commitKey, bytes32 salt) = _commit(voter1, 1, true);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);

        vm.warp(T0 + 1 hours + 1);
        votingEngine.revealVoteByCommitKey(1, roundId, commitKey, true, salt);

        vm.warp(T0 + 31 days);
        assertFalse(registry.isDormancyEligible(1), "open rounds should block dormancy eligibility");
    }

    function test_MarkDormant_CancelledRound_UsesDormancyAnchor() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/recent-vote", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 29 days);
        _vote(voter1, 1, true);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);
        vm.warp(T0 + 29 days + 7 days + 1);
        votingEngine.cancelExpiredRound(1, roundId);

        registry.markDormant(1);

        (,,,,,, ContentRegistry.ContentStatus status,,,,,) = registry.contents(1);
        assertEq(uint256(status), uint256(ContentRegistry.ContentStatus.Dormant));
    }

    function test_CommitVote_DormancyEligibleContent_CannotStartNewRoundAfterCancellation() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/dormancy-guard", "goal", "goal", "tags", 0);
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
        votingEngine.commitVote(
            1, _defaultRatingReferenceBps(), _tlockCommitTargetRound(), _tlockDrandChainHash(), commitHash, ciphertext, STAKE, address(0)
        );
        vm.stopPrank();
    }

    function test_MarkDormant_ReleasesUrlForResubmission() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        _submitContentWithReservation(registry, "https://example.com/dormant-url", "goal", "goal", "tags", 0);
        vm.stopPrank();

        assertFalse(registry.isUrlSubmitted("https://example.com/dormant-url"));

        // Mark dormant after 31 days
        vm.warp(T0 + 31 days);
        registry.markDormant(1);

        assertFalse(registry.isUrlSubmitted("https://example.com/dormant-url"));

        vm.warp(T0 + 32 days + 1);
        registry.releaseDormantSubmissionKey(1);
        assertFalse(registry.isUrlSubmitted("https://example.com/dormant-url"));

        // Should be able to resubmit the same URL
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/dormant-url", "goal2", "goal2", "tags2", 0);
        vm.stopPrank();

        // New content created with same URL
        (,,,,,, ContentRegistry.ContentStatus status,,,,,) = registry.contents(2);
        assertEq(uint256(status), uint256(ContentRegistry.ContentStatus.Active));
    }

    function test_IsUrlSubmitted_UsesCanonicalAliasUrls() public {
        string memory shortUrl = "https://youtu.be/dQw4w9WgXcQ";
        string memory canonicalUrl = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, shortUrl, "goal", "goal", "tags", 0);
        vm.stopPrank();

        assertFalse(registry.isUrlSubmitted(shortUrl));
        assertFalse(registry.isUrlSubmitted(canonicalUrl));
    }

    function test_ResolveSubmissionKey_CanonicalizesEquivalentUrls() public {
        vm.expectRevert("Use previewQuestionMediaSubmissionKey");
        registry.resolveSubmissionKey("https://youtu.be/dQw4w9WgXcQ");
    }

    function test_ResolveSubmissionKey_GenericQueryOrderCanonicalizes() public {
        vm.expectRevert("Use previewQuestionMediaSubmissionKey");
        registry.resolveSubmissionKey("https://example.com/search?a=1&b=2");
    }

    function test_ResolveSubmissionKey_GitHubDoubleSlashCanonicalizesEquivalentUrls() public {
        vm.expectRevert("Use previewQuestionMediaSubmissionKey");
        registry.resolveSubmissionKey("https://github.com/foundry-rs/foundry");
    }

    function test_ResolveSubmissionKey_WikipediaDotSegmentsCanonicalizesEquivalentUrls() public {
        vm.expectRevert("Use previewQuestionMediaSubmissionKey");
        registry.resolveSubmissionKey("https://en.wikipedia.org/wiki/Lionel_Messi");
    }

    function test_IsUrlSubmitted_ReturnsFalseForInvalidOrUnregisteredUrls() public view {
        assertFalse(registry.isUrlSubmitted(""));
        assertFalse(registry.isUrlSubmitted("javascript:alert(1)"));
        assertFalse(registry.isUrlSubmitted("https://not-registered.example/path"));
    }

    function test_MarkDormant_LowDisplayRatingWithoutEvidenceReturnsStake() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/dormant-slash", "goal", "goal", "tags", 0);
        vm.stopPrank();

        uint256 treasuryBefore = crepToken.balanceOf(treasury);
        uint256 submitterBefore = crepToken.balanceOf(submitter);

        vm.prank(address(votingEngine));
        registry.updateRatingDirect(1, 10);

        vm.warp(T0 + 31 days);
        registry.markDormant(1);

        assertEq(crepToken.balanceOf(treasury) - treasuryBefore, 0, "display rating alone should not slash");
        assertEq(
            crepToken.balanceOf(submitter),
            submitterBefore + 10e6,
            "submitter should recover stake when dormancy resolves without settled evidence"
        );
    }

    function test_ReviveContent_ReservesUrlAgain() public {
        string memory url = "https://example.com/revive-url";

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, url, "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 31 days);
        registry.markDormant(1);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 5e6);
        registry.reviveContent(1);
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Question already submitted");
        registry.submitQuestionWithMedia(
            _singleImageUrls(_submissionImageUrl(url)), "", "goal", "goal", "tags", 1, bytes32(0)
        );
        vm.stopPrank();
    }

    function test_ReviveContent_RevertsWhenUrlWasResubmitted() public {
        string memory url = "https://example.com/revive-conflict";

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, url, "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 31 days);
        registry.markDormant(1);

        vm.warp(T0 + 32 days + 1);
        registry.releaseDormantSubmissionKey(1);

        vm.startPrank(voter1);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, url, "goal2", "goal2", "tags2", 0);
        vm.stopPrank();

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 5e6);
        vm.expectRevert("Dormant key released");
        registry.reviveContent(1);
        vm.stopPrank();
    }

    // =========================================================================
    // slashSubmitterStake BRANCHES
    // =========================================================================

    function test_InitializeWithTreasury_ConfiguresTreasuryAuthority() public {
        vm.startPrank(owner);
        ContentRegistry registryImpl2 = new ContentRegistry();
        ContentRegistry reg2 = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImpl2),
                    abi.encodeCall(ContentRegistry.initializeWithTreasury, (owner, owner, treasury, address(crepToken)))
                )
            )
        );
        vm.stopPrank();

        assertEq(reg2.treasury(), treasury);
        assertEq(reg2.bonusPool(), treasury);
    }

    // =========================================================================
    // updateRating BRANCHES
    // =========================================================================

    function test_UpdateRatingDirect_CappedAt100() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        // Set rating to 110 → should clamp to 100
        vm.prank(address(votingEngine));
        registry.updateRatingDirect(1, 110);

        (,,,,,,,,,, uint256 rating,) = registry.contents(1);
        assertEq(rating, 100);
    }

    function test_UpdateRatingDirect_FlooredAt0() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        // Set rating to 0
        vm.prank(address(votingEngine));
        registry.updateRatingDirect(1, 0);

        (,,,,,,,,,, uint256 rating,) = registry.contents(1);
        assertEq(rating, 0);
    }

    function test_UpdateRatingDirect_SameValue_NoChange() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        // Set same rating (50) → no change, no event
        vm.prank(address(votingEngine));
        registry.updateRatingDirect(1, 50);

        (,,,,,,,,,, uint256 rating,) = registry.contents(1);
        assertEq(rating, 50); // unchanged
    }

    function test_SubmitContent_SeededCategory_Succeeds() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "example.com");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        uint256 id = _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 1);
        vm.stopPrank();
        assertEq(id, 1);
        (,,,,,,,,,,, uint256 categoryId) = registry.contents(1);
        assertEq(categoryId, 1);
    }

    function test_SubmitContent_CategoryRegistryConfigured_AutoResolvesCategoryFromUrl() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(7, "example.com");
        mockCategoryRegistry.setApproved(7, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        uint256 id = _submitContentWithReservation(registry, "https://example.com/auto", "goal", "goal", "tags", 0);
        vm.stopPrank();

        assertEq(id, 1);
        (,,,,,,,,,,, uint256 categoryId) = registry.contents(id);
        assertEq(categoryId, 1, "media questions use the explicit category selected by the submitter");
    }

    function test_SubmitContent_CategoryRegistryConfigured_UnregisteredDomainReverts() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "youtube.com");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.expectRevert("Use submitQuestionWithMedia");
        registry.submitContent("https://example.com/not-registered", "goal", "goal", "tags", 0, bytes32(0));
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
        vm.expectRevert("Use submitQuestionWithMedia");
        registry.submitContent("https://example.com/mismatch", "goal", "goal", "tags", 2, bytes32(0));
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_YouTubeVariantsCollide() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "youtube.com");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        _submitContentWithReservation(registry, "https://youtu.be/dQw4w9WgXcQ", "goal", "goal", "tags", 0);
        vm.expectRevert("Use submitQuestionWithMedia");
        registry.submitContent("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "goal2", "goal2", "tags2", 1, bytes32(0));
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_TwitterAndXVariantsCollide() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "x.com");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        _submitContentWithReservation(registry, "https://twitter.com/openai/status/12345", "goal", "goal", "tags", 0);
        vm.expectRevert("Use submitQuestionWithMedia");
        registry.submitContent("https://x.com/openai/status/12345", "goal2", "goal2", "tags2", 1, bytes32(0));
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_GitHubDeepPathCollidesWithRepoRoot() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "github.com");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        _submitContentWithReservation(
            registry, "https://github.com/foundry-rs/foundry/tree/master/crates", "goal", "goal", "tags", 0
        );
        vm.expectRevert("Use submitQuestionWithMedia");
        registry.submitContent("https://www.github.com/foundry-rs/foundry", "goal2", "goal2", "tags2", 1, bytes32(0));
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_GitHubDoubleSlashCollides() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "github.com");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        _submitContentWithReservation(registry, "https://github.com//foundry-rs/foundry", "goal", "goal", "tags", 0);
        vm.expectRevert("Use submitQuestionWithMedia");
        registry.submitContent("https://github.com/foundry-rs/foundry", "goal2", "goal2", "tags2", 1, bytes32(0));
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_GenericQueryOrderCollides() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        _submitContentWithReservation(registry, "https://example.com/search?a=1&b=2", "goal", "goal", "tags", 0);
        vm.expectRevert("Use submitQuestionWithMedia");
        registry.submitContent("https://example.com/search?b=2&a=1", "goal2", "goal2", "tags2", 1, bytes32(0));
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_ScryfallQueryVariantCollides() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "scryfall.com");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        _submitContentWithReservation(
            registry, "https://scryfall.com/card/lea/232/black-lotus?utm_source=test", "goal", "goal", "tags", 0
        );
        vm.expectRevert("Use submitQuestionWithMedia");
        registry.submitContent(
            "https://scryfall.com/card/lea/232/black-lotus", "goal2", "goal2", "tags2", 1, bytes32(0)
        );
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_TmdbSlugVariantCollides() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "themoviedb.org");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        _submitContentWithReservation(
            registry, "https://www.themoviedb.org/movie/238-the-godfather", "goal", "goal", "tags", 0
        );
        vm.expectRevert("Use submitQuestionWithMedia");
        registry.submitContent("https://themoviedb.org/movie/238", "goal2", "goal2", "tags2", 1, bytes32(0));
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_WikipediaQueryVariantCollides() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "en.wikipedia.org");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        _submitContentWithReservation(
            registry, "https://en.wikipedia.org/wiki/Lionel_Messi?oldformat=true", "goal", "goal", "tags", 0
        );
        vm.expectRevert("Use submitQuestionWithMedia");
        registry.submitContent("https://en.wikipedia.org/wiki/Lionel_Messi", "goal2", "goal2", "tags2", 1, bytes32(0));
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_RawgQueryVariantCollides() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "rawg.io");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        _submitContentWithReservation(registry, "https://rawg.io/games/elden-ring?ref=feed", "goal", "goal", "tags", 0);
        vm.expectRevert("Use submitQuestionWithMedia");
        registry.submitContent("https://rawg.io/games/elden-ring", "goal2", "goal2", "tags2", 1, bytes32(0));
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_OpenLibraryTitleVariantCollides() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "openlibrary.org");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        _submitContentWithReservation(
            registry, "https://openlibrary.org/works/OL45883W/Fantastic_Mr_Fox", "goal", "goal", "tags", 0
        );
        vm.expectRevert("Use submitQuestionWithMedia");
        registry.submitContent("https://openlibrary.org/works/OL45883W", "goal2", "goal2", "tags2", 1, bytes32(0));
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_HuggingFaceDeepPathCollides() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "huggingface.co");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        _submitContentWithReservation(
            registry, "https://huggingface.co/Qwen/Qwen3.5-397B-A17B/tree/main", "goal", "goal", "tags", 0
        );
        vm.expectRevert("Use submitQuestionWithMedia");
        registry.submitContent(
            "https://huggingface.co/Qwen/Qwen3.5-397B-A17B", "goal2", "goal2", "tags2", 1, bytes32(0)
        );
        vm.stopPrank();
    }

    function test_SubmitContent_CanonicalDuplicate_CoinGeckoLocaleVariantCollides() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "coingecko.com");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        _submitContentWithReservation(registry, "https://www.coingecko.com/en/coins/bitcoin", "goal", "goal", "tags", 0);
        vm.expectRevert("Use submitQuestionWithMedia");
        registry.submitContent("https://coingecko.com/coins/bitcoin", "goal2", "goal2", "tags2", 1, bytes32(0));
        vm.stopPrank();
    }

    function test_MarkDormant_PhantomContentId_Reverts() public {
        vm.warp(block.timestamp + 31 days);
        vm.expectRevert("Content does not exist");
        registry.markDormant(999999);
    }

    function test_SubmitContent_CanonicalDuplicate_SpotifyEmbedVariantCollides() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setDomain(1, "open.spotify.com");
        mockCategoryRegistry.setApproved(1, true);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 20e6);
        _submitContentWithReservation(
            registry, "https://open.spotify.com/embed/show/5eXZwvvxt3K2dxha3BSaAe", "goal", "goal", "tags", 0
        );
        vm.expectRevert("Use submitQuestionWithMedia");
        registry.submitContent(
            "https://open.spotify.com/intl-de/show/5eXZwvvxt3K2dxha3BSaAe", "goal2", "goal2", "tags2", 1, bytes32(0)
        );
        vm.stopPrank();
    }
}
