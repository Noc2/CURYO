// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test, stdStorage, StdStorage } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { HumanReputation } from "../contracts/HumanReputation.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";
import { MockQuestionRewardPoolEscrow } from "./mocks/MockQuestionRewardPoolEscrow.sol";
import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";

// =========================================================================
// TEST CONTRACT
// =========================================================================

contract ContentRegistryBranchesTest is VotingTestBase {
    using stdStorage for StdStorage;

    HumanReputation public hrepToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    RoundRewardDistributor public rewardDistributor;
    MockVoterIdNFT public mockVoterIdNFT;
    MockCategoryRegistry public mockCategoryRegistry;
    MockQuestionRewardPoolEscrow public mockQuestionRewardPoolEscrow;
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

    struct QuestionReservation {
        string contextUrl;
        string[] imageUrls;
        string videoUrl;
        string title;
        string description;
        string tags;
        uint256 categoryId;
        bytes32 salt;
        address submitterAddress;
        ContentRegistry.SubmissionRewardTerms rewardTerms;
        RoundLib.RoundConfig roundConfig;
    }

    function setUp() public {
        vm.warp(T0);
        vm.startPrank(owner);

        hrepToken = new HumanReputation(owner, owner);
        hrepToken.grantRole(hrepToken.MINTER_ROLE(), owner);

        ContentRegistry registryImpl = new ContentRegistry();
        RoundVotingEngine engineImpl = new RoundVotingEngine();
        RoundRewardDistributor distImpl = new RoundRewardDistributor();

        registry = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImpl),
                    abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(hrepToken)))
                )
            )
        );
        votingEngine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engineImpl),
                    abi.encodeCall(
                        RoundVotingEngine.initialize,
                        (owner, address(hrepToken), address(registry), address(_deployProtocolConfig(owner)))
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
                        (owner, address(hrepToken), address(votingEngine), address(registry))
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
        mockQuestionRewardPoolEscrow = new MockQuestionRewardPoolEscrow();
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        registry.setProtocolConfig(address(votingEngine.protocolConfig()));
        registry.setQuestionRewardPoolEscrow(address(mockQuestionRewardPoolEscrow));
        ProtocolConfig(address(votingEngine.protocolConfig())).setCategoryRegistry(address(mockCategoryRegistry));

        participationPool = new ParticipationPool(address(hrepToken), owner);
        participationPool.setAuthorizedCaller(address(registry), true);
        participationPool.setAuthorizedCaller(address(rewardDistributor), true);

        hrepToken.mint(owner, 2_000_000e6);
        hrepToken.approve(address(participationPool), 500_000e6);
        participationPool.depositPool(500_000e6);
        hrepToken.approve(address(votingEngine), 500_000e6);
        votingEngine.addToConsensusReserve(500_000e6);

        address[9] memory users = [submitter, voter1, voter2, voter3, voter4, voter5, voter6, keeper, delegate];
        for (uint256 i = 0; i < users.length; i++) {
            hrepToken.mint(users[i], 10_000e6);
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
            voter,
            contentId,
            referenceRatingBps,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ciphertext
        );
        vm.startPrank(voter);
        hrepToken.approve(address(votingEngine), stake);
        votingEngine.commitVote(
            contentId,
            referenceRatingBps,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            commitHash,
            ciphertext,
            stake,
            address(0)
        );
        vm.stopPrank();
        commitKey = keccak256(abi.encodePacked(voter, commitHash));
    }

    function _reserveQuestionSubmissionWithRewardTerms(
        string memory contextUrl,
        string[] memory imageUrls,
        string memory videoUrl,
        string memory title,
        string memory description,
        string memory tags,
        uint256 categoryId,
        bytes32 salt,
        address submitterAddress,
        uint8 rewardAsset,
        uint256 rewardAmount,
        uint256 requiredVoters,
        uint256 requiredSettledRounds,
        uint256 rewardPoolExpiresAt
    ) internal returns (bytes32 submissionKey) {
        QuestionReservation memory reservation;
        reservation.contextUrl = contextUrl;
        reservation.imageUrls = imageUrls;
        reservation.videoUrl = videoUrl;
        reservation.title = title;
        reservation.description = description;
        reservation.tags = tags;
        reservation.categoryId = categoryId;
        reservation.salt = salt;
        reservation.submitterAddress = submitterAddress;
        reservation.rewardTerms = ContentRegistry.SubmissionRewardTerms({
            asset: rewardAsset,
            amount: rewardAmount,
            requiredVoters: requiredVoters,
            requiredSettledRounds: requiredSettledRounds,
            bountyClosesAt: rewardPoolExpiresAt,
            feedbackClosesAt: rewardPoolExpiresAt
        });
        reservation.roundConfig =
            RoundLib.RoundConfig({ epochDuration: 1 hours, maxDuration: 7 days, minVoters: 3, maxVoters: 1000 });
        return _reserveQuestionSubmission(reservation);
    }

    function _reserveQuestionSubmissionWithRewardTermsAndRoundConfig(
        string memory contextUrl,
        string[] memory imageUrls,
        string memory videoUrl,
        string memory title,
        string memory description,
        string memory tags,
        uint256 categoryId,
        bytes32 salt,
        address submitterAddress,
        ContentRegistry.SubmissionRewardTerms memory rewardTerms,
        RoundLib.RoundConfig memory roundConfig
    ) internal returns (bytes32 submissionKey) {
        QuestionReservation memory reservation;
        reservation.contextUrl = contextUrl;
        reservation.imageUrls = imageUrls;
        reservation.videoUrl = videoUrl;
        reservation.title = title;
        reservation.description = description;
        reservation.tags = tags;
        reservation.categoryId = categoryId;
        reservation.salt = salt;
        reservation.submitterAddress = submitterAddress;
        reservation.rewardTerms = rewardTerms;
        reservation.roundConfig = roundConfig;
        return _reserveQuestionSubmission(reservation);
    }

    function _submissionRewardTerms(
        uint8 rewardAsset,
        uint256 rewardAmount,
        uint256 requiredVoters,
        uint256 requiredSettledRounds,
        uint256 rewardPoolExpiresAt
    ) internal pure returns (ContentRegistry.SubmissionRewardTerms memory) {
        return ContentRegistry.SubmissionRewardTerms({
            asset: rewardAsset,
            amount: rewardAmount,
            requiredVoters: requiredVoters,
            requiredSettledRounds: requiredSettledRounds,
            bountyClosesAt: rewardPoolExpiresAt,
            feedbackClosesAt: rewardPoolExpiresAt
        });
    }

    function _defaultContentRoundConfig() internal pure returns (RoundLib.RoundConfig memory) {
        return RoundLib.RoundConfig({ epochDuration: 1 hours, maxDuration: 7 days, minVoters: 3, maxVoters: 1000 });
    }

    function _reserveQuestionSubmission(QuestionReservation memory reservation)
        internal
        returns (bytes32 submissionKey)
    {
        (, submissionKey) = registry.previewQuestionSubmissionKey(
            reservation.contextUrl,
            reservation.imageUrls,
            reservation.videoUrl,
            reservation.title,
            reservation.description,
            reservation.tags,
            reservation.categoryId
        );
        bytes32 revealCommitment = _questionRevealCommitment(
            submissionKey,
            _submissionMediaHash(reservation.imageUrls, reservation.videoUrl),
            reservation.title,
            reservation.description,
            reservation.tags,
            reservation.categoryId,
            reservation.salt,
            reservation.submitterAddress,
            reservation.rewardTerms,
            reservation.roundConfig
        );
        registry.reserveSubmission(revealCommitment);
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

    function test_SubmitQuestion_AllowsImageUrlWithCategory() public {
        string memory url = "https://unmapped.example/reviews/widget-1.jpg";
        string memory title = "Does this product look useful?";
        string memory description = "A subjective product review question with a required image link.";
        string memory tags = "Products,Review";
        uint256 categoryId = 1;
        bytes32 salt = keccak256("arbitrary-question-url");

        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        (uint256 id, bytes32 submissionKey) =
            _submitQuestionImageWithReservation(registry, url, title, description, tags, categoryId, salt, submitter);
        vm.stopPrank();

        (,,,,,,,,, uint256 storedCategoryId) = registry.contents(id);
        assertEq(storedCategoryId, categoryId);
        assertTrue(registry.submissionKeyUsed(submissionKey));
    }

    function test_SubmitQuestion_AllowsEmptyOptionalMedia() public {
        string memory contextUrl = "https://example.com/context";
        string[] memory imageUrls = _emptyImageUrls();
        bytes32 salt = keccak256("empty-optional-media");

        vm.startPrank(submitter);
        _reserveQuestionSubmissionWithRewardTerms(
            contextUrl,
            imageUrls,
            "",
            "Question?",
            "Context",
            "Products",
            1,
            salt,
            submitter,
            DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
            _defaultSubmissionRewardAmount(registry),
            DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS,
            DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS,
            DEFAULT_SUBMISSION_REWARD_EXPIRES_AT
        );
        vm.warp(block.timestamp + 1);
        uint256 id = registry.submitQuestion(contextUrl, imageUrls, "", "Question?", "Context", "Products", 1, salt);
        vm.stopPrank();

        assertEq(id, 1);
    }

    function test_SubmitQuestion_GenericEvidenceUrl_Reverts() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        vm.expectRevert("Invalid media URL");
        registry.submitQuestion(
            "https://example.com/context",
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

    function test_SubmitQuestion_AllowsYouTubeVideoWithCategory() public {
        string memory url = "https://www.youtube.com/watch?v=jNQXAC9IVRw";
        string memory title = "Is this video clear?";
        string memory description = "A subjective video review question.";
        string memory tags = "Video,Review";
        uint256 categoryId = 5;
        bytes32 salt = keccak256("youtube-question-url");

        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        string[] memory imageUrls = _emptyImageUrls();
        bytes32 submissionKey = _reserveQuestionMediaSubmission(
            registry,
            "https://example.com/context",
            imageUrls,
            url,
            title,
            description,
            tags,
            categoryId,
            salt,
            submitter
        );
        vm.warp(block.timestamp + 1);
        uint256 id = registry.submitQuestion(
            "https://example.com/context", imageUrls, url, title, description, tags, categoryId, salt
        );
        vm.stopPrank();

        (,,,,,,,,, uint256 storedCategoryId) = registry.contents(id);
        assertEq(storedCategoryId, categoryId);
        assertTrue(registry.submissionKeyUsed(submissionKey));
    }

    function test_SubmitQuestion_AllowsMultipleOptionalImages() public {
        string[] memory imageUrls = new string[](2);
        imageUrls[0] = "https://example.com/a.jpg";
        imageUrls[1] = "https://example.com/b.webp";
        string memory title = "Which product image works better?";
        string memory description = "Compare the two images for usefulness.";
        string memory tags = "Products,Images";
        uint256 categoryId = 1;
        bytes32 salt = keccak256("multi-image-question");

        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        bytes32 submissionKey = _reserveQuestionSubmissionWithRewardTerms(
            "https://example.com/context",
            imageUrls,
            "",
            title,
            description,
            tags,
            categoryId,
            salt,
            submitter,
            DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
            _defaultSubmissionRewardAmount(registry),
            DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS,
            DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS,
            DEFAULT_SUBMISSION_REWARD_EXPIRES_AT
        );
        vm.warp(block.timestamp + 1);
        uint256 id = registry.submitQuestion(
            "https://example.com/context", imageUrls, "", title, description, tags, categoryId, salt
        );
        vm.stopPrank();

        (,, address rawSubmitter,,,,,,, uint64 storedCategoryId) = registry.contents(id);
        assertEq(rawSubmitter, submitter);
        assertEq(storedCategoryId, categoryId);
        assertTrue(registry.submissionKeyUsed(submissionKey));
    }

    function test_SubmitQuestion_RevertsWhenReservedMediaChanges() public {
        string[] memory reservedImageUrls = new string[](2);
        reservedImageUrls[0] = "https://example.com/reserved-a.jpg";
        reservedImageUrls[1] = "https://example.com/reserved-b.webp";
        string[] memory changedImageUrls = new string[](2);
        changedImageUrls[0] = reservedImageUrls[0];
        changedImageUrls[1] = "https://example.com/changed-b.webp";
        string memory title = "Which media set is better?";
        string memory description = "The reservation should bind every image URL.";
        string memory tags = "Products,Images";
        uint256 categoryId = 1;
        bytes32 salt = keccak256("media-change-question");

        vm.startPrank(submitter);
        _reserveQuestionMediaSubmission(
            registry,
            "https://example.com/context",
            reservedImageUrls,
            "",
            title,
            description,
            tags,
            categoryId,
            salt,
            submitter
        );
        vm.warp(block.timestamp + 1);
        vm.expectRevert("Reservation not found");
        registry.submitQuestion(
            "https://example.com/context", changedImageUrls, "", title, description, tags, categoryId, salt
        );
        vm.stopPrank();
    }

    function test_SubmitQuestion_RevertsWhenReservedOptionalMediaChanges() public {
        string memory contextUrl = "https://example.com/context";
        string[] memory reservedImageUrls = _singleImageUrls("https://example.com/reserved-preview.jpg");
        string[] memory changedImageUrls = _singleImageUrls("https://example.com/changed-preview.jpg");
        string memory title = "Should this context be trusted?";
        string memory description = "The reservation should bind optional preview media.";
        string memory tags = "Context,Images";
        uint256 categoryId = 1;
        bytes32 salt = keccak256("context-media-change-question");

        vm.startPrank(submitter);
        _reserveQuestionSubmissionWithRewardTerms(
            contextUrl,
            reservedImageUrls,
            "",
            title,
            description,
            tags,
            categoryId,
            salt,
            submitter,
            DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
            _defaultSubmissionRewardAmount(registry),
            DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS,
            DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS,
            DEFAULT_SUBMISSION_REWARD_EXPIRES_AT
        );
        vm.warp(block.timestamp + 1);
        vm.expectRevert("Reservation not found");
        registry.submitQuestion(contextUrl, changedImageUrls, "", title, description, tags, categoryId, salt);
        vm.stopPrank();
    }

    function test_SubmitQuestionWithReward_UsesFlexibleSubmissionBountyTerms() public {
        string memory contextUrl = "https://example.com/flexible-bounty";
        string memory title = "How useful is this comparison?";
        string memory description = "Rate whether voters have enough detail.";
        string memory tags = "Products,Bounty";
        uint256 categoryId = 1;
        bytes32 salt = keccak256("flexible-submission-bounty");
        string[] memory imageUrls = _emptyImageUrls();
        uint256 rewardAmount = _defaultSubmissionRewardAmount(registry);
        uint256 requiredVoters = 5;
        uint256 requiredSettledRounds = 2;
        uint256 rewardPoolExpiresAt = block.timestamp + 14 days;
        ContentRegistry.SubmissionRewardTerms memory rewardTerms = _submissionRewardTerms(
            DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
            rewardAmount,
            requiredVoters,
            requiredSettledRounds,
            rewardPoolExpiresAt
        );

        vm.startPrank(submitter);
        hrepToken.approve(address(mockQuestionRewardPoolEscrow), rewardAmount);
        _reserveQuestionSubmissionWithRewardTerms(
            contextUrl,
            imageUrls,
            "",
            title,
            description,
            tags,
            categoryId,
            salt,
            submitter,
            DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
            rewardAmount,
            requiredVoters,
            requiredSettledRounds,
            rewardPoolExpiresAt
        );
        vm.warp(block.timestamp + 1);
        uint256 id = registry.submitQuestionWithRewardAndRoundConfig(
            contextUrl,
            imageUrls,
            "",
            title,
            description,
            tags,
            categoryId,
            salt,
            rewardTerms,
            _defaultContentRoundConfig()
        );
        vm.stopPrank();

        assertEq(mockQuestionRewardPoolEscrow.lastContentId(), id);
        assertEq(mockQuestionRewardPoolEscrow.lastFunder(), submitter);
        assertEq(mockQuestionRewardPoolEscrow.lastAsset(), DEFAULT_SUBMISSION_REWARD_ASSET_HREP);
        assertEq(mockQuestionRewardPoolEscrow.lastAmount(), rewardAmount);
        assertEq(mockQuestionRewardPoolEscrow.lastRequiredVoters(), requiredVoters);
        assertEq(mockQuestionRewardPoolEscrow.lastRequiredSettledRounds(), requiredSettledRounds);
        assertEq(mockQuestionRewardPoolEscrow.lastBountyClosesAt(), rewardPoolExpiresAt);
        assertEq(mockQuestionRewardPoolEscrow.lastFeedbackClosesAt(), rewardPoolExpiresAt);
    }

    function test_SubmitQuestionWithRewardAndRoundConfig_StoresConfigAndSnapshotsRound() public {
        string memory contextUrl = "https://example.com/custom-round";
        string memory title = "How quickly should this bounty settle?";
        string memory description = "Check that custom timing sticks to the question.";
        string memory tags = "Products,Bounty";
        uint256 categoryId = 1;
        bytes32 salt = keccak256("custom-round-config");
        string[] memory imageUrls = _emptyImageUrls();
        ContentRegistry.SubmissionRewardTerms memory rewardTerms = ContentRegistry.SubmissionRewardTerms({
            asset: DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
            amount: _defaultSubmissionRewardAmount(registry),
            requiredVoters: 5,
            requiredSettledRounds: 2,
            bountyClosesAt: block.timestamp + 14 days,
            feedbackClosesAt: block.timestamp + 14 days
        });
        RoundLib.RoundConfig memory roundConfig =
            RoundLib.RoundConfig({ epochDuration: 1 hours, maxDuration: 2 hours, minVoters: 4, maxVoters: 5 });

        vm.startPrank(submitter);
        hrepToken.approve(address(mockQuestionRewardPoolEscrow), rewardTerms.amount);
        _reserveQuestionSubmissionWithRewardTermsAndRoundConfig(
            contextUrl, imageUrls, "", title, description, tags, categoryId, salt, submitter, rewardTerms, roundConfig
        );
        vm.warp(block.timestamp + 1);
        uint256 id = registry.submitQuestionWithRewardAndRoundConfig(
            contextUrl, imageUrls, "", title, description, tags, categoryId, salt, rewardTerms, roundConfig
        );
        vm.stopPrank();

        RoundLib.RoundConfig memory storedConfig = registry.getContentRoundConfig(id);
        assertEq(storedConfig.epochDuration, roundConfig.epochDuration);
        assertEq(storedConfig.maxDuration, roundConfig.maxDuration);
        assertEq(storedConfig.minVoters, roundConfig.minVoters);
        assertEq(storedConfig.maxVoters, roundConfig.maxVoters);
        assertEq(mockQuestionRewardPoolEscrow.lastRequiredVoters(), rewardTerms.requiredVoters);

        _commit(voter1, id, true);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, id);
        RoundLib.RoundConfig memory snapshottedConfig = RoundEngineReadHelpers.roundConfig(votingEngine, id, roundId);
        assertEq(snapshottedConfig.epochDuration, roundConfig.epochDuration);
        assertEq(snapshottedConfig.maxDuration, roundConfig.maxDuration);
        assertEq(snapshottedConfig.minVoters, roundConfig.minVoters);
        assertEq(snapshottedConfig.maxVoters, roundConfig.maxVoters);
    }

    function test_SubmitQuestionWithRoundConfig_BindsReservationToSelectedConfig() public {
        string memory contextUrl = "https://example.com/round-config-commitment";
        string memory title = "Should this resolve with a tight cap?";
        string memory description = "The reservation must bind the selected round settings.";
        string memory tags = "Products,Bounty";
        uint256 categoryId = 1;
        bytes32 salt = keccak256("round-config-commitment");
        string[] memory imageUrls = _emptyImageUrls();
        ContentRegistry.SubmissionRewardTerms memory rewardTerms = ContentRegistry.SubmissionRewardTerms({
            asset: DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
            amount: _defaultSubmissionRewardAmount(registry),
            requiredVoters: DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS,
            requiredSettledRounds: DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS,
            bountyClosesAt: DEFAULT_SUBMISSION_REWARD_EXPIRES_AT,
            feedbackClosesAt: DEFAULT_SUBMISSION_REWARD_EXPIRES_AT
        });
        RoundLib.RoundConfig memory reservedConfig =
            RoundLib.RoundConfig({ epochDuration: 1 hours, maxDuration: 2 hours, minVoters: 3, maxVoters: 4 });
        RoundLib.RoundConfig memory alteredConfig =
            RoundLib.RoundConfig({ epochDuration: 1 hours, maxDuration: 3 hours, minVoters: 3, maxVoters: 4 });

        vm.startPrank(submitter);
        hrepToken.approve(address(mockQuestionRewardPoolEscrow), rewardTerms.amount);
        _reserveQuestionSubmissionWithRewardTermsAndRoundConfig(
            contextUrl,
            imageUrls,
            "",
            title,
            description,
            tags,
            categoryId,
            salt,
            submitter,
            rewardTerms,
            reservedConfig
        );
        vm.warp(block.timestamp + 1);
        vm.expectRevert("Reservation not found");
        registry.submitQuestionWithRoundConfig(
            contextUrl, imageUrls, "", title, description, tags, categoryId, salt, alteredConfig
        );

        uint256 id = registry.submitQuestionWithRoundConfig(
            contextUrl, imageUrls, "", title, description, tags, categoryId, salt, reservedConfig
        );
        vm.stopPrank();

        RoundLib.RoundConfig memory storedConfig = registry.getContentRoundConfig(id);
        assertEq(storedConfig.maxDuration, reservedConfig.maxDuration);
    }

    function test_SubmitQuestionWithReward_RejectsTooFewSubmissionBountyVoters() public {
        string[] memory imageUrls = _emptyImageUrls();
        uint256 rewardAmount = _defaultSubmissionRewardAmount(registry);

        vm.startPrank(submitter);
        vm.expectRevert("Too few voters");
        registry.submitQuestionWithRewardAndRoundConfig(
            "https://example.com/too-few-voters",
            imageUrls,
            "",
            "Question?",
            "Context voters should consider",
            "Products",
            1,
            keccak256("too-few-voters"),
            _submissionRewardTerms(
                DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
                rewardAmount,
                2,
                DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS,
                DEFAULT_SUBMISSION_REWARD_EXPIRES_AT
            ),
            _defaultContentRoundConfig()
        );
        vm.stopPrank();
    }

    function test_SubmitQuestionWithReward_RejectsTooFewSubmissionBountyRounds() public {
        string[] memory imageUrls = _emptyImageUrls();
        uint256 rewardAmount = _defaultSubmissionRewardAmount(registry);

        vm.startPrank(submitter);
        vm.expectRevert("Too few rounds");
        registry.submitQuestionWithRewardAndRoundConfig(
            "https://example.com/too-few-rounds",
            imageUrls,
            "",
            "Question?",
            "Context voters should consider",
            "Products",
            1,
            keccak256("too-few-rounds"),
            _submissionRewardTerms(
                DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
                rewardAmount,
                DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS,
                0,
                DEFAULT_SUBMISSION_REWARD_EXPIRES_AT
            ),
            _defaultContentRoundConfig()
        );
        vm.stopPrank();
    }

    function test_SubmitQuestionWithReward_RejectsRewardBelowFlexibleTerms() public {
        string[] memory imageUrls = _emptyImageUrls();
        uint256 rewardAmount = _defaultSubmissionRewardAmount(registry);

        vm.startPrank(submitter);
        vm.expectRevert("Reward too small");
        registry.submitQuestionWithRewardAndRoundConfig(
            "https://example.com/reward-too-small",
            imageUrls,
            "",
            "Question?",
            "Context voters should consider",
            "Products",
            1,
            keccak256("reward-too-small"),
            _submissionRewardTerms(
                DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
                rewardAmount,
                rewardAmount + 1,
                DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS,
                DEFAULT_SUBMISSION_REWARD_EXPIRES_AT
            ),
            _defaultContentRoundConfig()
        );
        vm.stopPrank();
    }

    function test_SubmitQuestionWithReward_RejectsExpiredSubmissionBounty() public {
        string[] memory imageUrls = _emptyImageUrls();
        uint256 rewardAmount = _defaultSubmissionRewardAmount(registry);

        vm.startPrank(submitter);
        vm.expectRevert("Invalid bounty close");
        registry.submitQuestionWithRewardAndRoundConfig(
            "https://example.com/expired-bounty",
            imageUrls,
            "",
            "Question?",
            "Context voters should consider",
            "Products",
            1,
            keccak256("expired-bounty"),
            _submissionRewardTerms(
                DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
                rewardAmount,
                DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS,
                DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS,
                block.timestamp
            ),
            _defaultContentRoundConfig()
        );
        vm.stopPrank();
    }

    function test_SubmitQuestionBundleWithReward_RejectsSingleQuestionBundle() public {
        ContentRegistry.BundleQuestionInput[] memory questions = new ContentRegistry.BundleQuestionInput[](1);
        questions[0] = ContentRegistry.BundleQuestionInput({
            contextUrl: "https://example.com/single-bundle",
            imageUrls: _emptyImageUrls(),
            videoUrl: "",
            title: "Question?",
            description: "Context voters should consider",
            tags: "Products",
            categoryId: 1,
            salt: keccak256("single-bundle"),
            spec: _defaultQuestionSpec()
        });
        ContentRegistry.SubmissionRewardTerms memory rewardTerms = _submissionRewardTerms(
            DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
            _defaultSubmissionRewardAmount(registry),
            DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS,
            DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS,
            DEFAULT_SUBMISSION_REWARD_EXPIRES_AT
        );

        vm.startPrank(submitter);
        vm.expectRevert("Bundle needs multiple questions");
        registry.submitQuestionBundleWithRewardAndRoundConfig(questions, rewardTerms, _defaultContentRoundConfig());
        vm.stopPrank();
    }

    function test_SubmitQuestionBundleWithReward_RejectsMultipleSettledRounds() public {
        ContentRegistry.BundleQuestionInput[] memory questions = new ContentRegistry.BundleQuestionInput[](2);
        questions[0] = ContentRegistry.BundleQuestionInput({
            contextUrl: "https://example.com/bundle-rounds-a",
            imageUrls: _emptyImageUrls(),
            videoUrl: "",
            title: "Question A?",
            description: "Context voters should consider",
            tags: "Products",
            categoryId: 1,
            salt: keccak256("bundle-rounds-a"),
            spec: _defaultQuestionSpec()
        });
        questions[1] = ContentRegistry.BundleQuestionInput({
            contextUrl: "https://example.com/bundle-rounds-b",
            imageUrls: _emptyImageUrls(),
            videoUrl: "",
            title: "Question B?",
            description: "Context voters should consider",
            tags: "Products",
            categoryId: 1,
            salt: keccak256("bundle-rounds-b"),
            spec: _defaultQuestionSpec()
        });
        ContentRegistry.SubmissionRewardTerms memory rewardTerms = _submissionRewardTerms(
            DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
            _defaultSubmissionRewardAmount(registry) * 2,
            DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS,
            DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS + 1,
            DEFAULT_SUBMISSION_REWARD_EXPIRES_AT
        );

        vm.startPrank(submitter);
        vm.expectRevert("Bundle settled rounds unsupported");
        registry.submitQuestionBundleWithRewardAndRoundConfig(questions, rewardTerms, _defaultContentRoundConfig());
        vm.stopPrank();
    }

    function test_SubmitQuestionBundleWithReward_RequiresBountyClose() public {
        ContentRegistry.BundleQuestionInput[] memory questions = new ContentRegistry.BundleQuestionInput[](2);
        questions[0] = ContentRegistry.BundleQuestionInput({
            contextUrl: "https://example.com/bundle-expiry-a",
            imageUrls: _emptyImageUrls(),
            videoUrl: "",
            title: "Question A?",
            description: "Context voters should consider",
            tags: "Products",
            categoryId: 1,
            salt: keccak256("bundle-expiry-a"),
            spec: _defaultQuestionSpec()
        });
        questions[1] = ContentRegistry.BundleQuestionInput({
            contextUrl: "https://example.com/bundle-expiry-b",
            imageUrls: _emptyImageUrls(),
            videoUrl: "",
            title: "Question B?",
            description: "Context voters should consider",
            tags: "Products",
            categoryId: 1,
            salt: keccak256("bundle-expiry-b"),
            spec: _defaultQuestionSpec()
        });
        ContentRegistry.SubmissionRewardTerms memory rewardTerms = _submissionRewardTerms(
            DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
            _defaultSubmissionRewardAmount(registry) * 2,
            DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS,
            DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS,
            0
        );

        vm.startPrank(submitter);
        vm.expectRevert("Bundle bounty close required");
        registry.submitQuestionBundleWithRewardAndRoundConfig(questions, rewardTerms, _defaultContentRoundConfig());
        vm.stopPrank();
    }

    function test_SubmitQuestionWithReward_RequiresReservationForMatchingBountyTerms() public {
        string memory contextUrl = "https://example.com/bounty-terms-mismatch";
        string memory title = "Question?";
        string memory description = "Context voters should consider";
        string memory tags = "Products";
        uint256 categoryId = 1;
        bytes32 salt = keccak256("bounty-terms-mismatch");
        string[] memory imageUrls = _emptyImageUrls();
        uint256 rewardAmount = _defaultSubmissionRewardAmount(registry);

        vm.startPrank(submitter);
        _reserveQuestionSubmissionWithRewardTerms(
            contextUrl,
            imageUrls,
            "",
            title,
            description,
            tags,
            categoryId,
            salt,
            submitter,
            DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
            rewardAmount,
            DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS,
            DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS,
            DEFAULT_SUBMISSION_REWARD_EXPIRES_AT
        );
        vm.warp(block.timestamp + 1);
        vm.expectRevert("Reservation not found");
        registry.submitQuestionWithRewardAndRoundConfig(
            contextUrl,
            imageUrls,
            "",
            title,
            description,
            tags,
            categoryId,
            salt,
            _submissionRewardTerms(
                DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
                rewardAmount,
                DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS + 1,
                DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS,
                DEFAULT_SUBMISSION_REWARD_EXPIRES_AT
            ),
            _defaultContentRoundConfig()
        );
        vm.stopPrank();
    }

    function test_SubmitQuestion_RejectsMixedImagesAndVideo() public {
        string[] memory imageUrls = new string[](1);
        imageUrls[0] = "https://example.com/a.jpg";

        vm.expectRevert("Choose images or video");
        registry.previewQuestionSubmissionKey(
            "https://example.com/context",
            imageUrls,
            "https://www.youtube.com/watch?v=jNQXAC9IVRw",
            "Question?",
            "Context",
            "Media",
            5
        );
    }

    function test_SubmitQuestion_RejectsTooManyImages() public {
        string[] memory imageUrls = new string[](5);
        for (uint256 i = 0; i < imageUrls.length; i++) {
            imageUrls[i] = "https://example.com/a.jpg";
        }

        vm.expectRevert("Too many images");
        registry.previewQuestionSubmissionKey(
            "https://example.com/context", imageUrls, "", "Question?", "Context", "Media", 5
        );
    }

    function test_SubmitContent_VoterIdConfigured_AllowsWithoutId() public {
        vm.prank(owner);
        registry.setVoterIdNFT(address(mockVoterIdNFT));

        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        uint256 id = _submitContentWithReservation(registry, "https://example.com/no-id", "goal", "goal", "tags", 0);
        vm.stopPrank();
        assertEq(id, 1);
    }

    function test_SubmitContent_VoterIdConfigured_SucceedsWithId() public {
        vm.prank(owner);
        registry.setVoterIdNFT(address(mockVoterIdNFT));
        mockVoterIdNFT.setHolder(submitter);

        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
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
        hrepToken.approve(address(registry), 10e6);
        uint256 id =
            _submitContentWithReservation(registry, "https://example.com/delegate-submit", "goal", "goal", "tags", 0);
        vm.stopPrank();

        (,, address rawSubmitter,,,,,,,) = registry.contents(id);
        assertEq(rawSubmitter, delegate, "raw submitter should remain delegate wallet");
        assertEq(registry.getSubmitterIdentity(id), submitter, "submitter identity should snapshot the holder");
    }

    function test_SubmitContent_VoterIdNotConfigured_Succeeds() public {
        // No voterIdNFT set — should skip check
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        uint256 id = _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();
        assertEq(id, 1);
    }

    function test_SubmitContent_NonHttpsUrl_Reverts() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        vm.expectRevert("Invalid URL");
        registry.submitQuestion(
            "https://example.com/context",
            _singleImageUrls("javascript:alert(1)"),
            "",
            "goal",
            "goal",
            "tags",
            1,
            bytes32(0)
        );
        vm.stopPrank();
    }

    function test_SubmitContent_HttpUrl_Reverts() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        vm.expectRevert("Invalid URL");
        registry.submitQuestion(
            "https://example.com/context",
            _singleImageUrls("http://example.com/1.jpg"),
            "",
            "goal",
            "goal",
            "tags",
            1,
            bytes32(0)
        );
        vm.stopPrank();
    }

    function test_SubmitContent_UrlWithWhitespace_Reverts() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        vm.expectRevert("Invalid URL");
        registry.submitQuestion(
            "https://example.com/context",
            _singleImageUrls("https://example.com/ bad.jpg"),
            "",
            "goal",
            "goal",
            "tags",
            1,
            bytes32(0)
        );
        vm.stopPrank();
    }

    function test_SubmitContent_CategoryNotRegistered_Reverts() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setSlug(99, "example.com");

        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        vm.expectRevert("Category not registered");
        registry.submitQuestion(
            "https://example.com/context",
            _singleImageUrls("https://example.com/1.jpg"),
            "",
            "goal",
            "goal",
            "tags",
            99,
            bytes32(0)
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
        hrepToken.approve(address(registry), 10e6);
        string memory imageUrl = _submissionImageUrl(url);
        string[] memory imageUrls = _singleImageUrls(imageUrl);
        _reserveQuestionSubmissionWithRewardTerms(
            "https://example.com/context",
            imageUrls,
            "",
            title,
            description,
            tags,
            1,
            salt,
            submitter,
            DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
            _defaultSubmissionRewardAmount(registry),
            DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS,
            DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS,
            DEFAULT_SUBMISSION_REWARD_EXPIRES_AT
        );
        vm.warp(block.timestamp + 1);
        vm.expectRevert();
        registry.submitQuestion("https://example.com/context", imageUrls, "", title, description, tags, 1, salt);
        vm.stopPrank();
    }

    function test_SubmitContent_RevertsWhenResolvedCategoryIdExceedsUint64() public {
        uint256 oversizedCategoryId = uint256(type(uint64).max) + 1;
        mockCategoryRegistry.setSlug(oversizedCategoryId, "overflow-category.example");
        mockCategoryRegistry.setCategoryExists(oversizedCategoryId, true);

        string memory url = "https://overflow-category.example/item";
        string memory title = "goal";
        string memory description = "goal";
        string memory tags = "tags";
        bytes32 salt = keccak256("overflow-category-id");

        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        string memory imageUrl = _submissionImageUrl(url);
        string[] memory imageUrls = _singleImageUrls(imageUrl);
        _reserveQuestionSubmissionWithRewardTerms(
            "https://example.com/context",
            imageUrls,
            "",
            title,
            description,
            tags,
            oversizedCategoryId,
            salt,
            submitter,
            DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
            _defaultSubmissionRewardAmount(registry),
            DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS,
            DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS,
            DEFAULT_SUBMISSION_REWARD_EXPIRES_AT
        );
        vm.warp(block.timestamp + 1);
        vm.expectRevert();
        registry.submitQuestion(
            "https://example.com/context", imageUrls, "", title, description, tags, oversizedCategoryId, salt
        );
        vm.stopPrank();
    }

    function test_SubmitContent_DoesNotCreateSubmitterStakeOrReward() public {
        uint256 balBefore = hrepToken.balanceOf(submitter);
        vm.startPrank(submitter);
        _submitContentWithReservation(registry, "https://example.com/no-submitter-upside", "goal", "goal", "tags", 0);
        vm.stopPrank();

        uint256 balAfter = hrepToken.balanceOf(submitter);
        assertEq(balAfter, balBefore, "mock bounty escrow does not pull funds in branch tests");
    }

    function test_SubmitContent_UrlTooLong_Reverts() public {
        string memory longUrl = _validLengthUrl(2049, bytes("https://example.com/"), bytes(".jpg"));

        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        vm.expectRevert("Invalid URL");
        registry.submitQuestion(
            "https://example.com/context", _singleImageUrls(longUrl), "", "goal", "goal", "tags", 1, bytes32(0)
        );
        vm.stopPrank();
    }

    function test_SubmitQuestion_AllowsMaxLengthImageUrl() public view {
        string memory maxUrl = _validLengthUrl(2048, bytes("https://example.com/"), bytes(".jpg"));

        registry.previewQuestionSubmissionKey(
            "https://example.com/context", _singleImageUrls(maxUrl), "", "Question?", "Context.", "tags", 1
        );
    }

    function test_SubmitQuestion_VideoUrlTooLong_Reverts() public {
        string memory longVideoUrl = _validLengthUrl(2049, bytes("https://youtu.be/"), bytes("a"));

        vm.expectRevert("Invalid URL");
        registry.previewQuestionSubmissionKey(
            "https://example.com/context", _emptyImageUrls(), longVideoUrl, "Question?", "Context.", "tags", 1
        );
    }

    function _validLengthUrl(uint256 length, bytes memory prefix, bytes memory suffix)
        internal
        pure
        returns (string memory)
    {
        require(length >= prefix.length + suffix.length, "Invalid test URL length");
        bytes memory out = new bytes(length);
        for (uint256 i = 0; i < prefix.length; i++) {
            out[i] = prefix[i];
        }
        uint256 suffixOffset = length - suffix.length;
        for (uint256 i = prefix.length; i < suffixOffset; i++) {
            out[i] = "a";
        }
        for (uint256 i = 0; i < suffix.length; i++) {
            out[suffixOffset + i] = suffix[i];
        }
        return string(out);
    }

    function test_SubmitContent_TitleTooLong_Reverts() public {
        uint256 maxQuestionLength = registry.MAX_QUESTION_LENGTH() + 1;
        bytes memory longGoal = new bytes(maxQuestionLength);
        for (uint256 i = 0; i < maxQuestionLength; i++) {
            longGoal[i] = "a";
        }

        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        vm.expectRevert("Question too long");
        registry.submitQuestion(
            "https://example.com/context",
            _singleImageUrls("https://example.com/1.jpg"),
            "",
            string(longGoal),
            string(longGoal),
            "tags",
            1,
            bytes32(0)
        );
        vm.stopPrank();
    }

    function test_SubmitContent_TagsTooLong_Reverts() public {
        bytes memory longTags = new bytes(257);
        for (uint256 i = 0; i < longTags.length; i++) {
            longTags[i] = "a";
        }

        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        vm.expectRevert("Tags too long");
        registry.submitQuestion(
            "https://example.com/context",
            _singleImageUrls("https://example.com/1.jpg"),
            "",
            "goal",
            "goal",
            string(longTags),
            1,
            bytes32(0)
        );
        vm.stopPrank();
    }

    function test_SubmitContent_DuplicateUrl_Reverts() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 20e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
        vm.expectRevert("Question already submitted");
        registry.submitQuestion(
            "https://example.com/1", _emptyImageUrls(), "", "goal", "goal", "tags", 1, keccak256("dup1-salt")
        );
        vm.stopPrank();
    }

    function test_SubmitContent_EmptyUrl_Reverts() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        vm.expectRevert("Invalid URL");
        registry.submitQuestion("", _emptyImageUrls(), "", "goal", "goal", "tags", 1, bytes32(0));
        vm.stopPrank();
    }

    function test_SubmitContent_EmptyTitle_Reverts() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        vm.expectRevert("Question required");
        registry.submitQuestion(
            "https://example.com/context",
            _singleImageUrls("https://example.com/1.jpg"),
            "",
            "",
            "",
            "tags",
            1,
            bytes32(0)
        );
        vm.stopPrank();
    }

    function test_SubmitContent_EmptyTags_Reverts() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        vm.expectRevert("Tags required");
        registry.submitQuestion(
            "https://example.com/context",
            _singleImageUrls("https://example.com/1.jpg"),
            "",
            "goal",
            "goal",
            "",
            1,
            bytes32(0)
        );
        vm.stopPrank();
    }

    // =========================================================================
    // cancelContent BRANCHES
    // =========================================================================

    function test_CancelContent_NotSubmitter_Reverts() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.prank(voter1);
        vm.expectRevert("Not submitter");
        registry.cancelContent(1);
    }

    function test_CancelContent_UsesCurrentCanonicalSubmitterIdentity() public {
        vm.prank(owner);
        registry.setVoterIdNFT(address(mockVoterIdNFT));

        mockVoterIdNFT.setHolder(submitter);
        vm.prank(submitter);
        mockVoterIdNFT.setDelegate(delegate);

        vm.startPrank(delegate);
        hrepToken.approve(address(registry), 10e6);
        uint256 contentId =
            _submitContentWithReservation(registry, "https://example.com/delegated-cancel", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.prank(submitter);
        mockVoterIdNFT.removeDelegate();

        vm.prank(delegate);
        vm.expectRevert("Not submitter");
        registry.cancelContent(contentId);

        vm.prank(submitter);
        registry.cancelContent(contentId);
    }

    function test_CancelContent_NotActive_Reverts() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
        registry.cancelContent(1);

        vm.expectRevert("Not active");
        registry.cancelContent(1);
        vm.stopPrank();
    }

    function test_CancelContent_HasVotes_Reverts() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
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
                    abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(hrepToken)))
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
        hrepToken.approve(address(reg2), 10e6);
        _submitContentWithReservation(reg2, "https://example.com/1", "goal", "goal", "tags", 0);
        reg2.cancelContent(1);
        vm.stopPrank();

        (,,,,, ContentRegistry.ContentStatus status,,,,) = reg2.contents(1);
        assertEq(uint256(status), uint256(ContentRegistry.ContentStatus.Cancelled));
    }

    function test_CancelContent_DoesNotChargeDeprecatedFee() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);

        uint256 bonusBefore = hrepToken.balanceOf(bonusPool);
        registry.cancelContent(1);
        vm.stopPrank();

        uint256 bonusAfter = hrepToken.balanceOf(bonusPool);
        assertEq(bonusAfter - bonusBefore, 0);
    }

    function test_CancelContent_DeprecatedFeeNotSentToTreasury() public {
        vm.prank(owner);
        registry.setBonusPool(treasury);

        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/treasury", "goal", "goal", "tags", 0);

        uint256 treasuryBefore = hrepToken.balanceOf(treasury);
        registry.cancelContent(1);
        vm.stopPrank();

        uint256 treasuryAfter = hrepToken.balanceOf(treasury);
        assertEq(treasuryAfter - treasuryBefore, 0);
    }

    // =========================================================================
    // markDormant BRANCHES
    // =========================================================================

    function test_MarkDormant_PeriodNotElapsed_Reverts() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
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
                    abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(hrepToken)))
                )
            )
        );
        MockCategoryRegistry mockCategoryRegistry2 = new MockCategoryRegistry();
        mockCategoryRegistry2.seedDefaultTestCategories();
        reg2.setCategoryRegistry(address(mockCategoryRegistry2));
        // DON'T set votingEngine
        vm.stopPrank();

        vm.startPrank(submitter);
        hrepToken.approve(address(reg2), 10e6);
        _submitContentWithReservation(reg2, "https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 31 days);
        reg2.markDormant(1);

        (,,,,, ContentRegistry.ContentStatus status,,,,) = reg2.contents(1);
        assertEq(uint256(status), uint256(ContentRegistry.ContentStatus.Dormant));
    }

    function test_MarkDormant_Success() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 31 days);
        registry.markDormant(1);

        (,,,,, ContentRegistry.ContentStatus status,,,,) = registry.contents(1);
        assertEq(uint256(status), uint256(ContentRegistry.ContentStatus.Dormant));
    }

    function test_VoteCommit_UpdatesLastActivityAt() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/activity", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 29 days);
        _vote(voter1, 1, true);

        (,,,, uint256 lastActivityAt,,,,,) = registry.contents(1);
        assertEq(lastActivityAt, block.timestamp, "Commit should refresh lastActivityAt");
    }

    function test_MarkDormant_ActiveRound_AllVotesRevealed_Reverts() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
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
        hrepToken.approve(address(registry), 10e6);
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
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/recent-vote", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 29 days);
        _vote(voter1, 1, true);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);
        vm.warp(T0 + 29 days + 7 days + 1);
        votingEngine.cancelExpiredRound(1, roundId);

        registry.markDormant(1);

        (,,,,, ContentRegistry.ContentStatus status,,,,) = registry.contents(1);
        assertEq(uint256(status), uint256(ContentRegistry.ContentStatus.Dormant));
    }

    function test_CommitVote_DormancyEligibleContent_CannotStartNewRoundAfterCancellation() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/dormancy-guard", "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 29 days);
        _vote(voter1, 1, true);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);
        vm.warp(T0 + 29 days + 7 days + 1);
        votingEngine.cancelExpiredRound(1, roundId);

        bytes32 salt = keccak256(abi.encodePacked(voter2, block.timestamp));
        bytes memory ciphertext = _testCiphertext(true, salt, 1);
        bytes32 commitHash = _commitHash(true, salt, voter2, 1, ciphertext);

        vm.startPrank(voter2);
        hrepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(RoundVotingEngine.DormancyWindowElapsed.selector);
        votingEngine.commitVote(
            1,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            commitHash,
            ciphertext,
            STAKE,
            address(0)
        );
        vm.stopPrank();
    }

    function test_MarkDormant_ReleasesUrlForResubmission() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 20e6);
        _submitContentWithReservation(registry, "https://example.com/dormant-url", "goal", "goal", "tags", 0);
        vm.stopPrank();

        // Mark dormant after 31 days
        vm.warp(T0 + 31 days);
        registry.markDormant(1);

        vm.warp(T0 + 32 days + 1);
        registry.releaseDormantSubmissionKey(1);

        // Should be able to resubmit the same URL
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/dormant-url", "goal2", "goal2", "tags2", 0);
        vm.stopPrank();

        // New content created with same URL
        (,,,,, ContentRegistry.ContentStatus status,,,,) = registry.contents(2);
        assertEq(uint256(status), uint256(ContentRegistry.ContentStatus.Active));
    }

    function test_ReviveContent_ReservesUrlAgain() public {
        string memory url = "https://example.com/revive-url";

        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, url, "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 31 days);
        registry.markDormant(1);

        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 5e6);
        registry.reviveContent(1);
        vm.stopPrank();

        vm.startPrank(voter2);
        hrepToken.approve(address(registry), 10e6);
        vm.expectRevert("Question already submitted");
        registry.submitQuestion(
            url, _emptyImageUrls(), "", "goal", "goal", "tags", 1, keccak256("revive-conflict-salt")
        );
        vm.stopPrank();
    }

    function test_ReviveContent_RevertsWhenUrlWasResubmitted() public {
        string memory url = "https://example.com/revive-conflict";

        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, url, "goal", "goal", "tags", 0);
        vm.stopPrank();

        vm.warp(T0 + 31 days);
        registry.markDormant(1);

        vm.warp(T0 + 32 days + 1);
        registry.releaseDormantSubmissionKey(1);

        vm.startPrank(voter1);
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, url, "goal2", "goal2", "tags2", 0);
        vm.stopPrank();

        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 5e6);
        vm.expectRevert("Dormant key released");
        registry.reviveContent(1);
        vm.stopPrank();
    }

    // =========================================================================
    // initializeWithTreasury BRANCHES
    // =========================================================================

    function test_InitializeWithTreasury_ConfiguresTreasuryAuthority() public {
        address governance = address(0xB0B);
        address newTreasuryOperator = address(0xBEEF);

        vm.startPrank(owner);
        ContentRegistry registryImpl2 = new ContentRegistry();
        ContentRegistry reg2 = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImpl2),
                    abi.encodeCall(
                        ContentRegistry.initializeWithTreasury, (owner, governance, treasury, address(hrepToken))
                    )
                )
            )
        );
        vm.stopPrank();

        assertEq(reg2.treasury(), treasury);
        assertEq(reg2.bonusPool(), treasury);
        assertTrue(reg2.hasRole(reg2.DEFAULT_ADMIN_ROLE(), governance));
        assertTrue(reg2.hasRole(reg2.TREASURY_ADMIN_ROLE(), governance));
        assertTrue(reg2.hasRole(reg2.TREASURY_ADMIN_ROLE(), treasury));
        assertTrue(reg2.hasRole(reg2.TREASURY_ROLE(), treasury));
        assertFalse(reg2.hasRole(reg2.TREASURY_ROLE(), governance));

        bytes32 treasuryRole = reg2.TREASURY_ROLE();
        vm.prank(governance);
        reg2.grantRole(treasuryRole, newTreasuryOperator);

        assertTrue(reg2.hasRole(treasuryRole, newTreasuryOperator));
    }

    function test_SubmitContent_SeededCategory_Succeeds() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setSlug(1, "example.com");
        mockCategoryRegistry.setCategoryExists(1, true);

        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        uint256 id = _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 1);
        vm.stopPrank();
        assertEq(id, 1);
        (,,,,,,,,, uint256 categoryId) = registry.contents(1);
        assertEq(categoryId, 1);
    }

    function test_SubmitContent_CategoryRegistryConfigured_AutoResolvesCategoryFromUrl() public {
        vm.prank(owner);
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        mockCategoryRegistry.setSlug(7, "example.com");
        mockCategoryRegistry.setCategoryExists(7, true);

        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        uint256 id = _submitContentWithReservation(registry, "https://example.com/auto", "goal", "goal", "tags", 0);
        vm.stopPrank();

        assertEq(id, 1);
        (,,,,,,,,, uint256 categoryId) = registry.contents(id);
        assertEq(categoryId, 1, "media questions use the explicit category selected by the submitter");
    }

    function test_MarkDormant_PhantomContentId_Reverts() public {
        vm.warp(block.timestamp + 31 days);
        vm.expectRevert("Content does not exist");
        registry.markDormant(999999);
    }

    // --- Security fix: salt != 0 required on submissions ---

    function test_SubmitQuestion_RequiresNonZeroSalt() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        // All other inputs valid; salt=0 should revert with "Salt required" now that
        // the check runs after URL/category/submissionKey validation.
        vm.expectRevert("Salt required");
        registry.submitQuestion(
            "https://example.com/salt-required", _emptyImageUrls(), "", "Question?", "Context.", "tag", 1, bytes32(0)
        );
        vm.stopPrank();
    }

    // --- Security fix: reservations are scoped by submitter ---

    function test_ReserveSubmission_SameHashDifferentSubmittersBothSucceed() public {
        bytes32 hash = keccak256("front-run-demo");
        // First submitter reserves the hash.
        vm.prank(submitter);
        registry.reserveSubmission(hash);
        // A different submitter should NOT collide on the same hash -- the mapping is
        // keyed by (hash, msg.sender) so each caller has their own namespace.
        vm.prank(voter1);
        registry.reserveSubmission(hash);
        // Both submitters can cancel their own reservation without affecting the other.
        vm.prank(submitter);
        registry.cancelReservedSubmission(hash);
        vm.prank(voter1);
        registry.cancelReservedSubmission(hash);
    }
}
