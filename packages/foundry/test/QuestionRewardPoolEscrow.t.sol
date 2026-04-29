// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { HumanReputation } from "../contracts/HumanReputation.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";
import { MockERC20 } from "../contracts/mocks/MockERC20.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { QuestionRewardPoolEscrow } from "../contracts/QuestionRewardPoolEscrow.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { Eip3009Authorization, X402QuestionSubmitter } from "../contracts/X402QuestionSubmitter.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";

contract QuestionRewardPoolEscrowTest is VotingTestBase {
    HumanReputation public hrepToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    RoundRewardDistributor public rewardDistributor;
    FrontendRegistry public frontendRegistry;
    QuestionRewardPoolEscrow public rewardPoolEscrow;
    X402QuestionSubmitter public x402QuestionSubmitter;
    ProtocolConfig public protocolConfig;
    MockERC20 public usdc;
    MockVoterIdNFT public voterIdNFT;

    address public owner = address(1);
    address public submitter = address(2);
    address public funder = address(3);
    address public voter1 = address(4);
    address public voter2 = address(5);
    address public voter3 = address(6);
    address public voter4 = address(7);
    address public delegate1 = address(8);
    address public frontend1 = address(9);
    address public treasury = address(100);

    uint256 public constant STAKE = 5e6;
    uint256 public constant EPOCH_DURATION = 10 minutes;
    uint256 public constant REWARD_POOL_AMOUNT = 100e6;

    string internal constant QUESTION = "Would you recommend this hotel?";
    string internal constant DESCRIPTION = "Vote based on the overall stay quality.";
    string internal constant TAGS = "travel";
    string internal constant DEFAULT_MEDIA_URL = "https://example.com/hotel-room.jpg";
    uint256 internal constant CATEGORY_ID = 1;
    uint8 internal constant REWARD_ASSET_HREP = 0;
    uint8 internal constant REWARD_ASSET_USDC = 1;
    uint256 internal constant BUNDLE_CLAIM_GRACE = 7 days;

    event RewardPoolCreated(
        uint256 indexed rewardPoolId,
        uint256 indexed contentId,
        address indexed funder,
        uint256 funderVoterId,
        uint256 amount,
        uint256 requiredVoters,
        uint256 requiredSettledRounds,
        uint256 startRoundId,
        uint256 bountyOpensAt,
        uint256 bountyClosesAt,
        uint256 feedbackClosesAt,
        uint256 frontendFeeBps,
        uint8 asset,
        bool nonRefundable
    );

    struct X402TestQuestion {
        string contextUrl;
        string title;
        string description;
        string tags;
        string[] imageUrls;
        RoundLib.RoundConfig roundConfig;
        ContentRegistry.SubmissionRewardTerms rewardTerms;
        ContentRegistry.QuestionSpecCommitment spec;
        bytes32 salt;
    }

    function _tlockDrandChainHash() internal pure override returns (bytes32) {
        return DEFAULT_DRAND_CHAIN_HASH;
    }

    function _tlockDrandGenesisTime() internal pure override returns (uint64) {
        return DEFAULT_DRAND_GENESIS_TIME;
    }

    function _tlockDrandPeriod() internal pure override returns (uint64) {
        return DEFAULT_DRAND_PERIOD;
    }

    function _tlockEpochDuration() internal pure override returns (uint256) {
        return EPOCH_DURATION;
    }

    function setUp() public {
        vm.warp(1000);
        vm.roll(100);

        vm.startPrank(owner);

        hrepToken = new HumanReputation(owner, owner);
        hrepToken.grantRole(hrepToken.MINTER_ROLE(), owner);

        ContentRegistry registryImpl = new ContentRegistry();
        RoundVotingEngine engineImpl = new RoundVotingEngine();
        RoundRewardDistributor distImpl = new RoundRewardDistributor();
        FrontendRegistry frontendRegistryImpl = new FrontendRegistry();
        QuestionRewardPoolEscrow rewardPoolImpl = new QuestionRewardPoolEscrow();

        protocolConfig = _deployProtocolConfig(owner);
        registry = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImpl),
                    abi.encodeCall(ContentRegistry.initializeWithTreasury, (owner, owner, owner, address(hrepToken)))
                )
            )
        );
        votingEngine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engineImpl),
                    abi.encodeCall(
                        RoundVotingEngine.initialize,
                        (owner, address(hrepToken), address(registry), address(protocolConfig))
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

        usdc = new MockERC20("USD Coin", "USDC", 6);
        voterIdNFT = new MockVoterIdNFT();
        frontendRegistry = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(frontendRegistryImpl),
                    abi.encodeCall(FrontendRegistry.initialize, (owner, owner, address(hrepToken)))
                )
            )
        );
        rewardPoolEscrow = QuestionRewardPoolEscrow(
            address(
                new ERC1967Proxy(
                    address(rewardPoolImpl),
                    abi.encodeCall(
                        QuestionRewardPoolEscrow.initialize,
                        (
                            owner,
                            address(hrepToken),
                            address(usdc),
                            address(registry),
                            address(votingEngine),
                            address(voterIdNFT)
                        )
                    )
                )
            )
        );

        MockCategoryRegistry mockCategoryRegistry = new MockCategoryRegistry();
        mockCategoryRegistry.seedDefaultTestCategories();

        registry.setVotingEngine(address(votingEngine));
        registry.setProtocolConfig(address(protocolConfig));
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        registry.setVoterIdNFT(address(voterIdNFT));
        registry.setQuestionRewardPoolEscrow(address(rewardPoolEscrow));
        x402QuestionSubmitter = new X402QuestionSubmitter(registry, address(usdc), address(rewardPoolEscrow));
        registry.grantRole(registry.X402_GATEWAY_ROLE(), address(x402QuestionSubmitter));

        frontendRegistry.setVotingEngine(address(votingEngine));
        frontendRegistry.setVoterIdNFT(address(voterIdNFT));

        protocolConfig.setRewardDistributor(address(rewardDistributor));
        protocolConfig.setCategoryRegistry(address(mockCategoryRegistry));
        protocolConfig.setFrontendRegistry(address(frontendRegistry));
        protocolConfig.setTreasury(treasury);
        protocolConfig.setVoterIdNFT(address(voterIdNFT));
        _setTlockDrandConfig(protocolConfig, DEFAULT_DRAND_CHAIN_HASH, DEFAULT_DRAND_GENESIS_TIME, DEFAULT_DRAND_PERIOD);
        _setTlockRoundConfig(protocolConfig, EPOCH_DURATION, 7 days, 3, 200);

        uint256 reserveAmount = 1_000_000e6;
        hrepToken.mint(owner, reserveAmount);
        hrepToken.approve(address(votingEngine), reserveAmount);
        votingEngine.addToConsensusReserve(reserveAmount);

        address[7] memory humans = [submitter, funder, voter1, voter2, voter3, voter4, frontend1];
        for (uint256 i = 0; i < humans.length; i++) {
            voterIdNFT.setHolder(humans[i]);
            hrepToken.mint(humans[i], 10_000e6);
            usdc.mint(humans[i], 1_000e6);
        }
        usdc.mint(delegate1, 1_000e6);

        vm.stopPrank();
    }

    function testMediaQuestionCanReceiveRewardPoolAndPayRevealedVotersEqually() public {
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        address[] memory voters = _threeVoters();
        bool[] memory directions = _directions(true, true, false);
        uint256 roundId = _settleRoundWith(voters, contentId, directions);

        vm.prank(voter1);
        uint256 reward1 = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
        vm.prank(voter2);
        uint256 reward2 = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
        vm.prank(voter3);
        uint256 reward3 = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);

        assertEq(reward1, REWARD_POOL_AMOUNT / 3);
        assertEq(reward2, REWARD_POOL_AMOUNT / 3);
        assertEq(reward1 + reward2 + reward3, REWARD_POOL_AMOUNT);
        assertEq(usdc.balanceOf(voter1), 1_000e6 + reward1);
        assertEq(usdc.balanceOf(address(rewardPoolEscrow)), 0);
    }

    function testCreateRewardPoolRejectsStaleRegistryEscrow() public {
        uint256 contentId = _submitQuestion("");
        QuestionRewardPoolEscrow replacementEscrow = QuestionRewardPoolEscrow(
            address(
                new ERC1967Proxy(
                    address(new QuestionRewardPoolEscrow()),
                    abi.encodeCall(
                        QuestionRewardPoolEscrow.initialize,
                        (
                            owner,
                            address(hrepToken),
                            address(usdc),
                            address(registry),
                            address(votingEngine),
                            address(voterIdNFT)
                        )
                    )
                )
            )
        );

        vm.startPrank(owner);
        registry.pause();
        registry.setQuestionRewardPoolEscrow(address(replacementEscrow));
        registry.unpause();
        vm.stopPrank();

        vm.startPrank(funder);
        usdc.approve(address(rewardPoolEscrow), REWARD_POOL_AMOUNT);
        vm.expectRevert("Stale escrow");
        rewardPoolEscrow.createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1, block.timestamp + 30 days, 0);
        vm.stopPrank();
    }

    function testQuestionRewardCannotReplayAfterVoterIdRemintWithSameNullifier() public {
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);
        uint256 nullifier = 111_111;
        voterIdNFT.mint(voter1, nullifier);

        address[] memory voters = _threeVoters();
        bool[] memory directions = _directions(true, true, false);
        uint256 roundId = _settleRoundWith(voters, contentId, directions);

        vm.prank(voter1);
        uint256 firstReward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
        assertEq(firstReward, REWARD_POOL_AMOUNT / 3);

        voterIdNFT.resetNullifier(nullifier);
        voterIdNFT.mint(voter1, nullifier);

        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, roundId, voter1), 0);
        vm.prank(voter1);
        vm.expectRevert("Already claimed");
        rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
    }

    function testQuestionRewardClaimSucceedsWhileEscrowPaused() public {
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        address[] memory voters = _threeVoters();
        bool[] memory directions = _directions(true, true, false);
        uint256 roundId = _settleRoundWith(voters, contentId, directions);

        vm.prank(owner);
        rewardPoolEscrow.pause();

        vm.prank(voter1);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
        assertEq(reward, REWARD_POOL_AMOUNT / 3);
    }

    function testQuestionRewardClaimWaitsForUnrevealedCleanup() public {
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);
        uint256 roundId = _settleRoundWithOneUnrevealed(contentId);

        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, roundId, voter1), 0);
        vm.expectRevert(bytes("Cleanup pending"));
        vm.prank(voter1);
        rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);

        votingEngine.processUnrevealedVotes(contentId, roundId, 0, 0);

        vm.prank(voter1);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
        assertGt(reward, 0);
    }

    function testQualifyRoundWaitsForUnrevealedCleanup() public {
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);
        uint256 roundId = _settleRoundWithOneUnrevealed(contentId);

        vm.expectRevert("Cleanup pending");
        rewardPoolEscrow.qualifyRound(rewardPoolId, roundId);

        votingEngine.processUnrevealedVotes(contentId, roundId, 0, 0);

        rewardPoolEscrow.qualifyRound(rewardPoolId, roundId);
        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, roundId, voter1), REWARD_POOL_AMOUNT / 3);
    }

    function testRefundableRewardPoolAmountUsesQuestionSelectedVoterCap() public {
        RoundLib.RoundConfig memory roundConfig =
            RoundLib.RoundConfig({ epochDuration: 10 minutes, maxDuration: 1 hours, minVoters: 3, maxVoters: 4 });
        uint256 contentId = _submitQuestionWithRoundConfig("https://example.com/small-cap.jpg", roundConfig);

        uint256 rewardPoolId = _createRewardPool(contentId, 4, 3, 1);

        assertEq(rewardPoolId, 2);
        assertEq(rewardPoolEscrow.nextRewardPoolId(), 3);
        assertEq(usdc.balanceOf(address(rewardPoolEscrow)), 4);
    }

    function testRewardPoolRejectsRequiredVotersAboveQuestionCap() public {
        RoundLib.RoundConfig memory roundConfig =
            RoundLib.RoundConfig({ epochDuration: 10 minutes, maxDuration: 1 hours, minVoters: 3, maxVoters: 4 });
        uint256 contentId = _submitQuestionWithRoundConfig("https://example.com/impossible-cap.jpg", roundConfig);

        vm.startPrank(funder);
        usdc.approve(address(rewardPoolEscrow), REWARD_POOL_AMOUNT);
        vm.expectRevert("Voters exceed max");
        rewardPoolEscrow.createRewardPool(contentId, REWARD_POOL_AMOUNT, 5, 1, block.timestamp + 30 days, 0);
        vm.stopPrank();
    }

    function testEligibleFrontendReceivesThreePercentFromQuestionRewardClaims() public {
        _registerFrontend(frontend1);

        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        address[] memory voters = _threeVoters();
        bool[] memory directions = _directions(true, true, false);
        uint256 roundId = _settleRoundWithFrontend(voters, contentId, directions, frontend1);

        uint256 frontendBalanceBefore = usdc.balanceOf(frontend1);
        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, roundId, voter1), 32_333_333);

        vm.prank(voter1);
        uint256 reward1 = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
        vm.prank(voter2);
        uint256 reward2 = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
        vm.prank(voter3);
        uint256 reward3 = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);

        assertEq(reward1, 32_333_333);
        assertEq(reward2, 32_333_333);
        assertEq(reward3, 32_333_334);
        assertEq(reward1 + reward2 + reward3, 97e6);
        assertEq(usdc.balanceOf(frontend1), frontendBalanceBefore + 3e6);
        assertEq(usdc.balanceOf(address(rewardPoolEscrow)), 0);
    }

    function testFrontendTransferFailureFallsBackToQuestionRewardVoter() public {
        _registerFrontend(frontend1);

        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        address[] memory voters = _threeVoters();
        bool[] memory directions = _directions(true, true, false);
        uint256 roundId = _settleRoundWithFrontend(voters, contentId, directions, frontend1);

        usdc.setBlockedRecipient(frontend1, true);

        uint256 voterBalanceBefore = usdc.balanceOf(voter1);
        uint256 frontendBalanceBefore = usdc.balanceOf(frontend1);

        vm.prank(voter1);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);

        assertEq(reward, REWARD_POOL_AMOUNT / 3);
        assertEq(usdc.balanceOf(voter1), voterBalanceBefore + REWARD_POOL_AMOUNT / 3);
        assertEq(usdc.balanceOf(frontend1), frontendBalanceBefore);
    }

    function testExitPendingFrontendReceivesHistoricalQuestionRewardFees() public {
        _registerFrontend(frontend1);

        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        address[] memory voters = _threeVoters();
        bool[] memory directions = _directions(true, true, false);
        uint256 roundId = _settleRoundWithFrontend(voters, contentId, directions, frontend1);

        vm.prank(frontend1);
        frontendRegistry.requestDeregister();

        uint256 frontendBalanceBefore = usdc.balanceOf(frontend1);
        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, roundId, voter1), 32_333_333);

        vm.prank(voter1);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);

        assertEq(reward, 32_333_333);
        assertEq(usdc.balanceOf(frontend1), frontendBalanceBefore + 1e6);
    }

    function testUnregisteredFrontendFeeShareFallsBackToVoterReward() public {
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        address[] memory voters = _threeVoters();
        bool[] memory directions = _directions(true, true, false);
        uint256 roundId = _settleRoundWithFrontend(voters, contentId, directions, frontend1);

        uint256 frontendBalanceBefore = usdc.balanceOf(frontend1);
        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, roundId, voter1), REWARD_POOL_AMOUNT / 3);

        vm.prank(voter1);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);

        assertEq(reward, REWARD_POOL_AMOUNT / 3);
        assertEq(usdc.balanceOf(frontend1), frontendBalanceBefore);
    }

    function testDefaultFrontendFeeCanBeConfiguredWithinCap() public {
        assertEq(rewardPoolEscrow.defaultFrontendFeeBps(), 300);

        vm.prank(owner);
        rewardPoolEscrow.setDefaultFrontendFeeBps(500);
        assertEq(rewardPoolEscrow.defaultFrontendFeeBps(), 500);

        vm.prank(owner);
        vm.expectRevert("Fee too high");
        rewardPoolEscrow.setDefaultFrontendFeeBps(501);
    }

    function testVotingEngineIsPinnedAfterInitialization() public {
        address newEngine = address(0xBEEF);

        vm.prank(owner);
        (bool ok,) = address(rewardPoolEscrow).call(abi.encodeWithSignature("setVotingEngine(address)", newEngine));
        assertFalse(ok);

        (,,, address configuredVotingEngine,) = rewardPoolEscrow.getWiring();
        assertEq(configuredVotingEngine, address(votingEngine));
    }

    function testRegistrySubmissionRewardRejectsStaleEscrowAfterEngineRotation() public {
        RoundVotingEngine replacementEngine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(new RoundVotingEngine()),
                    abi.encodeCall(
                        RoundVotingEngine.initialize,
                        (owner, address(hrepToken), address(registry), address(protocolConfig))
                    )
                )
            )
        );

        vm.startPrank(owner);
        registry.pause();
        registry.setVotingEngine(address(replacementEngine));
        registry.unpause();
        vm.stopPrank();

        string[] memory imageUrls = new string[](1);
        imageUrls[0] = DEFAULT_MEDIA_URL;
        bytes32 salt = keccak256("stale-engine-reward");
        uint256 rewardAmount = _defaultSubmissionRewardAmount(registry);
        ContentRegistry.SubmissionRewardTerms memory rewardTerms = _defaultSubmissionRewardTerms(registry);
        RoundLib.RoundConfig memory roundConfig = RoundLib.RoundConfig({
            epochDuration: uint32(EPOCH_DURATION), maxDuration: uint32(7 days), minVoters: 3, maxVoters: 200
        });
        (, bytes32 submissionKey) = registry.previewQuestionSubmissionKey(
            "https://example.com/context", imageUrls, "", QUESTION, DESCRIPTION, TAGS, CATEGORY_ID
        );
        bytes32 revealCommitment = _questionRevealCommitment(
            submissionKey,
            _submissionMediaHash(imageUrls, ""),
            QUESTION,
            DESCRIPTION,
            TAGS,
            CATEGORY_ID,
            salt,
            submitter,
            rewardTerms,
            roundConfig
        );

        uint256 submitterBalanceBefore = hrepToken.balanceOf(submitter);
        uint256 escrowBalanceBefore = hrepToken.balanceOf(address(rewardPoolEscrow));
        uint256 nextContentIdBefore = registry.nextContentId();

        vm.startPrank(submitter);
        hrepToken.approve(address(rewardPoolEscrow), rewardAmount);
        registry.reserveSubmission(revealCommitment);
        vm.warp(block.timestamp + 1);
        vm.expectRevert("Stale engine");
        registry.submitQuestionWithRewardAndRoundConfig(
            "https://example.com/context",
            imageUrls,
            "",
            QUESTION,
            DESCRIPTION,
            TAGS,
            CATEGORY_ID,
            salt,
            rewardTerms,
            roundConfig,
            _defaultQuestionSpec()
        );
        vm.stopPrank();

        assertEq(registry.nextContentId(), nextContentIdBefore);
        assertEq(hrepToken.balanceOf(submitter), submitterBalanceBefore);
        assertEq(hrepToken.balanceOf(address(rewardPoolEscrow)), escrowBalanceBefore);
    }

    function testSetVotingEngineRejectsZeroAddress() public {
        vm.prank(owner);
        (bool ok,) = address(rewardPoolEscrow).call(abi.encodeWithSignature("setVotingEngine(address)", address(0)));
        assertFalse(ok);
    }

    function testSetVotingEngineAlwaysReverts() public {
        vm.prank(voter1);
        (bool ok,) =
            address(rewardPoolEscrow).call(abi.encodeWithSignature("setVotingEngine(address)", address(0xBEEF)));
        assertFalse(ok);
    }

    function testDelegateCanClaimByUnderlyingVoterIdOnlyOnce() public {
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        vm.prank(voter1);
        voterIdNFT.setDelegate(delegate1);

        address[] memory voters = _threeVoters();
        bool[] memory directions = _directions(true, true, false);
        uint256 roundId = _settleRoundWith(voters, contentId, directions);

        vm.prank(delegate1);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
        assertEq(usdc.balanceOf(voter1), 1_000e6 + reward);
        assertEq(usdc.balanceOf(delegate1), 1_000e6);

        vm.prank(voter1);
        vm.expectRevert("Already claimed");
        rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
    }

    function testOpenRoundUsesVoterIdSnapshotAfterMigration() public {
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        bytes32 salt1 = keccak256("snapshot-voter-1");
        bytes32 commitKey1 = _commitTestVote(
            DirectTestCommitRequest({
                engine: votingEngine,
                hrepToken: hrepToken,
                voter: voter1,
                contentId: contentId,
                isUp: true,
                stake: STAKE,
                frontend: address(0),
                salt: salt1
            })
        );
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        assertEq(votingEngine.roundVoterIdNFTSnapshot(contentId, roundId), address(voterIdNFT));

        MockVoterIdNFT migratedVoterIdNFT = _migrateVoterIdsWithDifferentIds();
        assertNotEq(migratedVoterIdNFT.getTokenId(voter2), voterIdNFT.getTokenId(voter2));

        bytes32 salt2 = keccak256("snapshot-voter-2");
        bytes32 commitKey2 = _commitTestVote(
            DirectTestCommitRequest({
                engine: votingEngine,
                hrepToken: hrepToken,
                voter: voter2,
                contentId: contentId,
                isUp: true,
                stake: STAKE,
                frontend: address(0),
                salt: salt2
            })
        );
        bytes32 salt3 = keccak256("snapshot-voter-3");
        bytes32 commitKey3 = _commitTestVote(
            DirectTestCommitRequest({
                engine: votingEngine,
                hrepToken: hrepToken,
                voter: voter3,
                contentId: contentId,
                isUp: false,
                stake: STAKE,
                frontend: address(0),
                salt: salt3
            })
        );

        _warpPastTlockRevealTime(block.timestamp + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId, roundId, commitKey1, true, salt1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, commitKey2, true, salt2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, commitKey3, false, salt3);
        votingEngine.settleRound(contentId, roundId);

        vm.prank(voter2);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
        assertEq(reward, REWARD_POOL_AMOUNT / 3);
    }

    function testFunderExclusionUsesRoundVoterIdSnapshotAfterMigration() public {
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        address[] memory voters = new address[](4);
        voters[0] = funder;
        voters[1] = voter1;
        voters[2] = voter2;
        voters[3] = voter3;
        bool[] memory directions = _directions(true, true, true, false);
        uint256 roundId = _settleRoundWith(voters, contentId, directions);

        MockVoterIdNFT migratedVoterIdNFT = _migrateVoterIdsWithDifferentIds();
        assertNotEq(migratedVoterIdNFT.getTokenId(funder), voterIdNFT.getTokenId(funder));

        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, roundId, funder), 0);
        vm.prank(funder);
        vm.expectRevert("Excluded voter");
        rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
    }

    function testStoredFunderVoterIdDoesNotExcludeDifferentSnapshotHolder() public {
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);
        uint256 oldFunderVoterId = voterIdNFT.getTokenId(funder);

        MockVoterIdNFT migratedVoterIdNFT = _migrateVoterIdsWithVoter1AtOldFunderId();
        assertEq(migratedVoterIdNFT.getTokenId(voter1), oldFunderVoterId);
        assertEq(migratedVoterIdNFT.getTokenId(funder), 0);

        uint256 roundId = _settleRoundWith(_threeVoters(), contentId, _directions(true, true, false));

        vm.prank(voter1);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
        assertEq(reward, REWARD_POOL_AMOUNT / 3);
    }

    function testBundleClaimUsesRoundSpecificVoterIdsAfterMigration() public {
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleId = _createSubmissionBundle(contentIds, funder, REWARD_ASSET_USDC, REWARD_POOL_AMOUNT, 3);

        address[] memory voters = new address[](3);
        voters[0] = voter2;
        voters[1] = voter3;
        voters[2] = voter4;
        bool[] memory directions = _directions(true, true, false);

        uint256 firstRoundId = _settleRoundWith(voters, contentIds[0], directions);
        assertEq(votingEngine.roundVoterIdNFTSnapshot(contentIds[0], firstRoundId), address(voterIdNFT));

        MockVoterIdNFT migratedVoterIdNFT = _migrateVoterIdsWithDifferentIds();
        assertNotEq(migratedVoterIdNFT.getTokenId(voter2), voterIdNFT.getTokenId(voter2));

        uint256 secondRoundId = _settleRoundWith(voters, contentIds[1], directions);
        assertEq(votingEngine.roundVoterIdNFTSnapshot(contentIds[1], secondRoundId), address(migratedVoterIdNFT));

        assertGt(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter2), 0);

        vm.prank(voter2);
        uint256 reward = rewardPoolEscrow.claimQuestionBundleReward(bundleId, 0);

        assertEq(reward, REWARD_POOL_AMOUNT / 3);
        assertEq(usdc.balanceOf(voter2), 1_000e6 + reward);
        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter2), 0);
    }

    function testBundleRewardsSnapshotAllCompletersAboveMinimum() public {
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleId = _createSubmissionBundle(contentIds, funder, REWARD_ASSET_USDC, REWARD_POOL_AMOUNT, 3);

        address[] memory voters = _fourVoters();
        bool[] memory directions = _directions(true, true, false, true);

        _settleRoundWith(voters, contentIds[0], directions);
        _settleRoundWith(voters, contentIds[1], directions);

        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter1), REWARD_POOL_AMOUNT / 4);
        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter4), REWARD_POOL_AMOUNT / 4);

        uint256 totalClaimed;
        for (uint256 i = 0; i < voters.length; i++) {
            vm.prank(voters[i]);
            totalClaimed += rewardPoolEscrow.claimQuestionBundleReward(bundleId, 0);
        }

        assertEq(totalClaimed, REWARD_POOL_AMOUNT);
        assertEq(usdc.balanceOf(address(rewardPoolEscrow)), 0);
    }

    function testBundleClaimSupportsMultipleRoundSets() public {
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleAmount = 120e6;
        uint256 bundleId = _createSubmissionBundle(contentIds, funder, REWARD_ASSET_USDC, bundleAmount, 3, 2);

        address[] memory voters = new address[](3);
        voters[0] = voter2;
        voters[1] = voter3;
        voters[2] = voter4;
        bool[] memory directions = _directions(true, true, false);

        _settleRoundWith(voters, contentIds[0], directions);
        _settleRoundWith(voters, contentIds[1], directions);
        assertGt(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter2), 0);
        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 1, voter2), 0);

        vm.warp(block.timestamp + 25 hours);
        _settleRoundWith(voters, contentIds[0], directions);
        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 1, voter2), 0);

        _settleRoundWith(voters, contentIds[1], directions);
        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 1, voter2), 20e6);

        vm.prank(voter2);
        uint256 firstReward = rewardPoolEscrow.claimQuestionBundleReward(bundleId, 0);
        vm.prank(voter2);
        uint256 secondReward = rewardPoolEscrow.claimQuestionBundleReward(bundleId, 1);

        assertEq(firstReward, 20e6);
        assertEq(secondReward, 20e6);
        assertEq(usdc.balanceOf(voter2), 1_000e6 + firstReward + secondReward);
    }

    function testBundleRewardCannotReplayAfterVoterIdRemintWithSameNullifier() public {
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleId = _createSubmissionBundle(contentIds, funder, REWARD_ASSET_USDC, REWARD_POOL_AMOUNT, 3);
        uint256 nullifier = 222_222;
        voterIdNFT.mint(voter2, nullifier);

        address[] memory voters = new address[](3);
        voters[0] = voter2;
        voters[1] = voter3;
        voters[2] = voter4;
        bool[] memory directions = _directions(true, true, false);

        _settleRoundWith(voters, contentIds[0], directions);
        _settleRoundWith(voters, contentIds[1], directions);

        vm.prank(voter2);
        uint256 firstReward = rewardPoolEscrow.claimQuestionBundleReward(bundleId, 0);
        assertEq(firstReward, REWARD_POOL_AMOUNT / 3);

        voterIdNFT.resetNullifier(nullifier);
        voterIdNFT.mint(voter2, nullifier);

        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter2), 0);
        vm.prank(voter2);
        vm.expectRevert("Already claimed");
        rewardPoolEscrow.claimQuestionBundleReward(bundleId, 0);
    }

    function testBundleRoundSetCountsCompleterAfterVoterIdRemintWithSameNullifier() public {
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleId = _createSubmissionBundle(contentIds, funder, REWARD_ASSET_USDC, REWARD_POOL_AMOUNT, 3);
        uint256 nullifier = 222_223;
        voterIdNFT.mint(voter2, nullifier);

        address[] memory voters = new address[](3);
        voters[0] = voter2;
        voters[1] = voter3;
        voters[2] = voter4;
        bool[] memory directions = _directions(true, true, false);

        _settleRoundWith(voters, contentIds[0], directions);
        voterIdNFT.revokeVoterId(voter2);
        voterIdNFT.resetNullifier(nullifier);
        voterIdNFT.mint(voter2, nullifier);
        _settleRoundWith(voters, contentIds[1], directions);

        uint256 claimable = rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter2);
        assertEq(claimable, REWARD_POOL_AMOUNT / 3);
    }

    function testBundleFunderNullifierStaysExcludedAfterRemintToDifferentAddress() public {
        address remintedFunder = address(0xF00D);
        uint256 nullifier = 222_224;
        voterIdNFT.mint(funder, nullifier);
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleId = _createSubmissionBundle(contentIds, funder, REWARD_ASSET_USDC, REWARD_POOL_AMOUNT, 3);

        voterIdNFT.revokeVoterId(funder);
        voterIdNFT.resetNullifier(nullifier);
        voterIdNFT.mint(remintedFunder, nullifier);
        vm.prank(owner);
        hrepToken.mint(remintedFunder, 10_000e6);

        address[] memory voters = new address[](3);
        voters[0] = remintedFunder;
        voters[1] = voter2;
        voters[2] = voter3;
        bool[] memory directions = _directions(true, true, false);

        _settleRoundWith(voters, contentIds[0], directions);
        _settleRoundWith(voters, contentIds[1], directions);

        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, remintedFunder), 0);
        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter2), 0);
    }

    function testBundleDelegatedFunderStaysExcludedAfterAgentReassignment() public {
        address voter5 = address(0x55);
        voterIdNFT.setHolder(voter5);
        vm.prank(owner);
        hrepToken.mint(voter5, 10_000e6);
        vm.prank(owner);
        hrepToken.mint(delegate1, 10_000e6);

        uint256[] memory contentIds = _submitBundleQuestions();
        vm.prank(voter1);
        voterIdNFT.setDelegate(delegate1);
        uint256 bundleId = _createSubmissionBundle(contentIds, delegate1, REWARD_ASSET_USDC, REWARD_POOL_AMOUNT, 3);
        vm.prank(voter1);
        voterIdNFT.removeDelegate();
        vm.prank(voter3);
        voterIdNFT.setDelegate(delegate1);

        address[] memory voters = new address[](4);
        voters[0] = delegate1;
        voters[1] = voter2;
        voters[2] = voter4;
        voters[3] = voter5;
        bool[] memory directions = _directions(true, true, false, true);

        _settleRoundWith(voters, contentIds[0], directions);
        _settleRoundWith(voters, contentIds[1], directions);

        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter3), 0);
        vm.prank(voter3);
        vm.expectRevert("Excluded voter");
        rewardPoolEscrow.claimQuestionBundleReward(bundleId, 0);
    }

    function testBundleSubmitterNullifierStaysExcludedAfterRemintToDifferentAddress() public {
        address remintedSubmitter = address(0x5A1D);
        uint256 nullifier = 222_225;
        voterIdNFT.mint(submitter, nullifier);
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleId = _createSubmissionBundle(contentIds, funder, REWARD_ASSET_USDC, REWARD_POOL_AMOUNT, 3);

        voterIdNFT.revokeVoterId(submitter);
        voterIdNFT.resetNullifier(nullifier);
        voterIdNFT.mint(remintedSubmitter, nullifier);
        vm.prank(owner);
        hrepToken.mint(remintedSubmitter, 10_000e6);

        _expectSelfVoteCommitRevert(remintedSubmitter, contentIds[0], keccak256("bundle-reminted-submitter"));

        address[] memory voters = new address[](3);
        voters[0] = voter2;
        voters[1] = voter3;
        voters[2] = voter4;
        bool[] memory directions = _directions(true, true, false);

        _settleRoundWith(voters, contentIds[0], directions);
        _settleRoundWith(voters, contentIds[1], directions);

        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, remintedSubmitter), 0);
        assertGt(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter2), 0);
    }

    function testBundleClaimRecordsOutOfOrderFutureRoundSetTerminal() public {
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleId = _createSubmissionBundle(contentIds, funder, REWARD_ASSET_USDC, 120e6, 3, 2);

        address[] memory firstSetVoters = new address[](3);
        firstSetVoters[0] = voter2;
        firstSetVoters[1] = voter3;
        firstSetVoters[2] = voter4;
        address[] memory secondSetVoters = new address[](3);
        secondSetVoters[0] = address(20);
        secondSetVoters[1] = address(21);
        secondSetVoters[2] = address(22);
        vm.startPrank(owner);
        for (uint256 i = 0; i < secondSetVoters.length; i++) {
            voterIdNFT.setHolder(secondSetVoters[i]);
            hrepToken.mint(secondSetVoters[i], 10_000e6);
        }
        vm.stopPrank();
        bool[] memory directions = _directions(true, true, false);

        _settleRoundWith(firstSetVoters, contentIds[0], directions);
        _settleRoundWith(secondSetVoters, contentIds[0], directions);
        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter2), 0);

        _settleRoundWith(firstSetVoters, contentIds[1], directions);
        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter2), 20e6);
        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 1, secondSetVoters[0]), 0);

        _settleRoundWith(secondSetVoters, contentIds[1], directions);
        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 1, secondSetVoters[0]), 20e6);
    }

    function testBundleRoundSetDoesNotQualifyWithoutRequiredCompleterIntersection() public {
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleId = _createSubmissionBundle(contentIds, funder, REWARD_ASSET_USDC, REWARD_POOL_AMOUNT, 3);

        address[] memory firstQuestionVoters = new address[](3);
        firstQuestionVoters[0] = voter1;
        firstQuestionVoters[1] = voter2;
        firstQuestionVoters[2] = voter3;
        address[] memory secondQuestionVoters = new address[](3);
        secondQuestionVoters[0] = voter2;
        secondQuestionVoters[1] = voter3;
        secondQuestionVoters[2] = voter4;
        bool[] memory directions = _directions(true, true, false);

        _settleRoundWith(firstQuestionVoters, contentIds[0], directions);
        _settleRoundWith(secondQuestionVoters, contentIds[1], directions);

        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter2), 0);

        vm.prank(voter2);
        vm.expectRevert("Bundle not claimable");
        rewardPoolEscrow.claimQuestionBundleReward(bundleId, 0);
    }

    function testBundleRoundSetRetriesAfterInsufficientCompleterIntersection() public {
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleId = _createSubmissionBundle(contentIds, funder, REWARD_ASSET_USDC, REWARD_POOL_AMOUNT, 3);

        address[] memory firstQuestionVoters = new address[](3);
        firstQuestionVoters[0] = voter1;
        firstQuestionVoters[1] = voter2;
        firstQuestionVoters[2] = voter3;
        address[] memory secondQuestionVoters = new address[](3);
        secondQuestionVoters[0] = voter2;
        secondQuestionVoters[1] = voter3;
        secondQuestionVoters[2] = voter4;
        bool[] memory directions = _directions(true, true, false);

        _settleRoundWith(firstQuestionVoters, contentIds[0], directions);
        _settleRoundWith(secondQuestionVoters, contentIds[1], directions);
        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter2), 0);

        vm.warp(block.timestamp + 25 hours);
        _settleRoundWith(firstQuestionVoters, contentIds[0], directions);
        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter2), 0);
        _settleRoundWith(firstQuestionVoters, contentIds[1], directions);

        uint256 claimable = rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter2);
        assertEq(claimable, REWARD_POOL_AMOUNT / 3);
        vm.prank(voter2);
        uint256 reward = rewardPoolEscrow.claimQuestionBundleReward(bundleId, 0);
        assertEq(reward, claimable);
    }

    function testBundleRoundSetRetriesWhenAllocationCannotPayAllCompleters() public {
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleId = _createSubmissionBundle(contentIds, funder, REWARD_ASSET_USDC, 3, 3);

        address[] memory overfullVoters = _fourVoters();
        bool[] memory overfullDirections = _directions(true, true, false, true);

        _settleRoundWith(overfullVoters, contentIds[0], overfullDirections);
        _settleRoundWith(overfullVoters, contentIds[1], overfullDirections);
        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter1), 0);

        vm.prank(voter1);
        vm.expectRevert("Bundle not claimable");
        rewardPoolEscrow.claimQuestionBundleReward(bundleId, 0);

        vm.warp(block.timestamp + 25 hours);
        address[] memory retryVoters = new address[](3);
        retryVoters[0] = voter2;
        retryVoters[1] = voter3;
        retryVoters[2] = voter4;
        bool[] memory retryDirections = _directions(true, true, false);

        _settleRoundWith(retryVoters, contentIds[0], retryDirections);
        _settleRoundWith(retryVoters, contentIds[1], retryDirections);

        uint256 claimable = rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter2);
        assertEq(claimable, 1);
        vm.prank(voter2);
        assertEq(rewardPoolEscrow.claimQuestionBundleReward(bundleId, 0), claimable);
    }

    function testBundleRoundSetRetryIgnoresFutureRoundsRecordedBeforeReset() public {
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleId = _createSubmissionBundle(contentIds, funder, REWARD_ASSET_USDC, 120e6, 3, 2);

        address staleCompleter1 = address(20);
        address staleCompleter2 = address(21);
        address staleCompleter3 = address(22);
        address retryCompleter1 = address(23);
        address retryCompleter2 = address(24);
        address retryCompleter3 = address(25);
        address[] memory extraVoters = new address[](6);
        extraVoters[0] = staleCompleter1;
        extraVoters[1] = staleCompleter2;
        extraVoters[2] = staleCompleter3;
        extraVoters[3] = retryCompleter1;
        extraVoters[4] = retryCompleter2;
        extraVoters[5] = retryCompleter3;
        vm.startPrank(owner);
        for (uint256 i = 0; i < extraVoters.length; i++) {
            voterIdNFT.setHolder(extraVoters[i]);
            hrepToken.mint(extraVoters[i], 10_000e6);
        }
        vm.stopPrank();

        address[] memory firstQuestionVoters = new address[](3);
        firstQuestionVoters[0] = voter1;
        firstQuestionVoters[1] = voter2;
        firstQuestionVoters[2] = voter3;
        address[] memory secondQuestionVoters = new address[](3);
        secondQuestionVoters[0] = voter2;
        secondQuestionVoters[1] = voter3;
        secondQuestionVoters[2] = voter4;
        address[] memory staleCompleters = new address[](3);
        staleCompleters[0] = staleCompleter1;
        staleCompleters[1] = staleCompleter2;
        staleCompleters[2] = staleCompleter3;
        address[] memory retryCompleters = new address[](3);
        retryCompleters[0] = retryCompleter1;
        retryCompleters[1] = retryCompleter2;
        retryCompleters[2] = retryCompleter3;
        bool[] memory directions = _directions(true, true, false);

        _settleRoundWith(firstQuestionVoters, contentIds[0], directions);
        vm.warp(block.timestamp + 2 days);
        _settleRoundWith(staleCompleters, contentIds[0], directions);
        _settleRoundWith(secondQuestionVoters, contentIds[1], directions);

        vm.warp(block.timestamp + 2 days);
        _settleRoundWith(retryCompleters, contentIds[0], directions);
        _settleRoundWith(retryCompleters, contentIds[1], directions);
        assertGt(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, retryCompleter1), 0);

        vm.warp(block.timestamp + 2 days);
        _settleRoundWith(staleCompleters, contentIds[1], directions);
        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 1, staleCompleter1), 0);
    }

    function testBundleRoundSetCountsDelegateCommitAfterDelegateRemoval() public {
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleId = _createSubmissionBundle(contentIds, funder, REWARD_ASSET_USDC, REWARD_POOL_AMOUNT, 3);
        vm.prank(owner);
        hrepToken.mint(delegate1, 10_000e6);

        vm.prank(voter2);
        voterIdNFT.setDelegate(delegate1);

        address[] memory firstQuestionVoters = new address[](3);
        firstQuestionVoters[0] = delegate1;
        firstQuestionVoters[1] = voter3;
        firstQuestionVoters[2] = voter4;
        address[] memory secondQuestionVoters = new address[](3);
        secondQuestionVoters[0] = voter2;
        secondQuestionVoters[1] = voter3;
        secondQuestionVoters[2] = voter4;
        bool[] memory directions = _directions(true, true, false);

        _settleRoundWith(firstQuestionVoters, contentIds[0], directions);
        vm.prank(voter2);
        voterIdNFT.removeDelegate();
        _settleRoundWith(secondQuestionVoters, contentIds[1], directions);

        uint256 claimable = rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter2);
        assertEq(claimable, REWARD_POOL_AMOUNT / 3);
    }

    function testBundleRewardPaysVoterIdHolderWhenNewDelegateClaims() public {
        address newDelegate = address(0xD1E);
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleId = _createSubmissionBundle(contentIds, funder, REWARD_ASSET_USDC, REWARD_POOL_AMOUNT, 3);
        vm.prank(owner);
        hrepToken.mint(delegate1, 10_000e6);

        vm.prank(voter1);
        voterIdNFT.setDelegate(delegate1);

        address[] memory voters = new address[](3);
        voters[0] = delegate1;
        voters[1] = voter2;
        voters[2] = voter3;
        bool[] memory directions = _directions(true, true, false);
        _settleRoundWith(voters, contentIds[0], directions);
        _settleRoundWith(voters, contentIds[1], directions);

        vm.prank(voter1);
        voterIdNFT.removeDelegate();
        vm.prank(voter1);
        voterIdNFT.setDelegate(newDelegate);

        uint256 holderBalanceBefore = usdc.balanceOf(voter1);
        uint256 delegateBalanceBefore = usdc.balanceOf(newDelegate);

        vm.prank(newDelegate);
        uint256 reward = rewardPoolEscrow.claimQuestionBundleReward(bundleId, 0);

        assertEq(reward, REWARD_POOL_AMOUNT / 3);
        assertEq(usdc.balanceOf(voter1), holderBalanceBefore + reward);
        assertEq(usdc.balanceOf(newDelegate), delegateBalanceBefore);
    }

    function testFunderAndSubmitterVoterIdsAreExcludedFromRewardPoolClaims() public {
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        address[] memory voters = new address[](4);
        voters[0] = funder;
        voters[1] = voter1;
        voters[2] = voter2;
        voters[3] = voter3;
        bool[] memory directions = new bool[](4);
        directions[0] = true;
        directions[1] = true;
        directions[2] = true;
        directions[3] = false;
        uint256 roundId = _settleRoundWith(voters, contentId, directions);

        vm.prank(funder);
        vm.expectRevert("Excluded voter");
        rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);

        vm.prank(voter1);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
        assertEq(reward, REWARD_POOL_AMOUNT / 3);
    }

    function testSubmitterSnapshotKeepsOldVoterIdExcludedAfterRemint() public {
        uint256 contentId = _submitQuestion("");
        uint256 submitterSnapshotVoterId = voterIdNFT.getTokenId(submitter);
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        voterIdNFT.mint(submitter, 999);
        assertNotEq(voterIdNFT.getTokenId(submitter), submitterSnapshotVoterId);

        uint256 roundId = 1;
        _mockSettledRound(contentId, roundId, 3);
        _mockRevealedCommitForVoterId(contentId, roundId, submitterSnapshotVoterId, submitter);
        _mockRevealedCommitForVoterId(contentId, roundId, voterIdNFT.getTokenId(voter1), voter1);

        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, roundId, voter1), 0);
        vm.prank(voter1);
        vm.expectRevert("Too few eligible voters");
        rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
    }

    function testDelegatedFunderStaysExcludedAfterDelegateRemoval() public {
        uint256 contentId = _submitQuestion("");

        vm.prank(voter1);
        voterIdNFT.setDelegate(delegate1);
        uint256 rewardPoolId = _createRewardPoolAs(delegate1, contentId, REWARD_POOL_AMOUNT, 3, 1);
        vm.prank(voter1);
        voterIdNFT.removeDelegate();

        address[] memory voters = new address[](4);
        voters[0] = voter1;
        voters[1] = voter2;
        voters[2] = voter3;
        voters[3] = voter4;
        uint256 roundId = _settleRoundWith(voters, contentId, _directions(true, true, true, false));

        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, roundId, voter1), 0);
        vm.prank(voter1);
        vm.expectRevert("Excluded voter");
        rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);

        vm.prank(voter2);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
        assertEq(reward, REWARD_POOL_AMOUNT / 3);
    }

    function testFunderNullifierStaysExcludedAfterRemint() public {
        voterIdNFT.mint(funder, 333_001);
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        voterIdNFT.revokeVoterId(funder);
        voterIdNFT.resetNullifier(333_001);
        voterIdNFT.mint(voter1, 333_001);

        address[] memory voters = new address[](4);
        voters[0] = voter1;
        voters[1] = voter2;
        voters[2] = voter3;
        voters[3] = voter4;
        uint256 roundId = _settleRoundWith(voters, contentId, _directions(true, true, true, false));

        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, roundId, voter1), 0);
        vm.prank(voter1);
        vm.expectRevert("Excluded voter");
        rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);

        vm.prank(voter2);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
        assertEq(reward, REWARD_POOL_AMOUNT / 3);
    }

    function testSubmitterNullifierStaysExcludedAfterRemint() public {
        voterIdNFT.mint(submitter, 333_002);
        uint256 contentId = _submitQuestion("");
        assertEq(registry.contentSubmitterNullifier(contentId), 333_002);

        voterIdNFT.revokeVoterId(submitter);
        voterIdNFT.resetNullifier(333_002);
        voterIdNFT.mint(voter1, 333_002);

        _expectSelfVoteCommitRevert(voter1, contentId, keccak256("reminted-submitter-self-vote"));
    }

    function testRemintedSubmitterCannotVoteOnOwnQuestion() public {
        voterIdNFT.mint(submitter, 333_003);
        uint256 contentId = _submitQuestion("");
        assertEq(registry.contentSubmitterNullifier(contentId), 333_003);

        voterIdNFT.revokeVoterId(submitter);
        voterIdNFT.resetNullifier(333_003);
        address remintedSubmitter = address(0x5A1D);
        voterIdNFT.mint(remintedSubmitter, 333_003);
        vm.prank(owner);
        hrepToken.mint(remintedSubmitter, 10_000e6);

        _expectSelfVoteCommitRevert(remintedSubmitter, contentId, keccak256("reminted-submitter-self-vote-2"));
    }

    function testDelegatedFunderStaysExcludedAfterAgentReassignment() public {
        uint256 contentId = _submitQuestion("");

        vm.prank(voter1);
        voterIdNFT.setDelegate(delegate1);
        uint256 rewardPoolId = _createRewardPoolAs(delegate1, contentId, REWARD_POOL_AMOUNT, 3, 1);
        vm.prank(voter1);
        voterIdNFT.removeDelegate();
        vm.prank(voter3);
        voterIdNFT.setDelegate(delegate1);

        address[] memory voters = new address[](5);
        voters[0] = voter1;
        voters[1] = voter3;
        voters[2] = voter2;
        voters[3] = voter4;
        voters[4] = funder;
        bool[] memory directions = new bool[](5);
        directions[0] = true;
        directions[1] = true;
        directions[2] = true;
        directions[3] = true;
        directions[4] = false;
        uint256 roundId = _settleRoundWith(voters, contentId, directions);

        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, roundId, voter1), 0);
        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, roundId, voter3), 0);

        vm.prank(voter1);
        vm.expectRevert("Excluded voter");
        rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);

        vm.prank(voter3);
        vm.expectRevert("Excluded voter");
        rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);

        vm.prank(voter2);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
        assertEq(reward, REWARD_POOL_AMOUNT / 3);
    }

    function testDelegatedFunderCannotQualifyRoundAfterDelegateRemoval() public {
        uint256 contentId = _submitQuestion("");

        vm.prank(voter1);
        voterIdNFT.setDelegate(delegate1);
        uint256 rewardPoolId = _createRewardPoolAs(delegate1, contentId, REWARD_POOL_AMOUNT, 3, 1);
        vm.prank(voter1);
        voterIdNFT.removeDelegate();

        address[] memory voters = new address[](3);
        voters[0] = voter1;
        voters[1] = voter2;
        voters[2] = voter3;
        uint256 roundId = _settleRoundWith(voters, contentId, _directions(true, true, false));

        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, roundId, voter2), 0);
        vm.prank(voter2);
        vm.expectRevert("Too few eligible voters");
        rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
    }

    function testDelegatedFunderStaysExcludedAfterDelegateRemovalAndVoterIdMigration() public {
        uint256 contentId = _submitQuestion("");

        vm.prank(voter2);
        voterIdNFT.setDelegate(delegate1);
        uint256 originalVoterId = voterIdNFT.getTokenId(voter2);
        uint256 rewardPoolId = _createRewardPoolAs(delegate1, contentId, REWARD_POOL_AMOUNT, 3, 1);
        vm.prank(voter2);
        voterIdNFT.removeDelegate();

        MockVoterIdNFT migratedVoterIdNFT = _migrateVoterIdsWithDifferentIds();
        assertNotEq(migratedVoterIdNFT.getTokenId(voter2), originalVoterId);

        address[] memory voters = new address[](4);
        voters[0] = voter2;
        voters[1] = voter1;
        voters[2] = voter3;
        voters[3] = voter4;
        uint256 roundId = _settleRoundWith(voters, contentId, _directions(true, true, true, false));

        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, roundId, voter2), 0);
        vm.prank(voter2);
        vm.expectRevert("Excluded voter");
        rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);

        vm.prank(voter1);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
        assertEq(reward, REWARD_POOL_AMOUNT / 3);
    }

    function testQuestionRewardPaysVoterIdHolderWhenNewDelegateClaims() public {
        address newDelegate = address(0xD1E);
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        vm.prank(owner);
        hrepToken.mint(delegate1, 10_000e6);
        vm.prank(voter1);
        voterIdNFT.setDelegate(delegate1);

        address[] memory voters = new address[](3);
        voters[0] = delegate1;
        voters[1] = voter2;
        voters[2] = voter3;
        uint256 roundId = _settleRoundWith(voters, contentId, _directions(true, true, false));

        vm.prank(voter1);
        voterIdNFT.removeDelegate();
        vm.prank(voter1);
        voterIdNFT.setDelegate(newDelegate);

        uint256 holderBalanceBefore = usdc.balanceOf(voter1);
        uint256 delegateBalanceBefore = usdc.balanceOf(newDelegate);

        vm.prank(newDelegate);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);

        assertEq(reward, REWARD_POOL_AMOUNT / 3);
        assertEq(usdc.balanceOf(voter1), holderBalanceBefore + reward);
        assertEq(usdc.balanceOf(newDelegate), delegateBalanceBefore);
    }

    function testSettledRoundCanQualifyAfterPoolExpires() public {
        uint256 contentId = _submitQuestion("");
        uint256 expiresAt = block.timestamp + EPOCH_DURATION + 10;
        uint256 rewardPoolId = _createRewardPoolWithExpiry(contentId, REWARD_POOL_AMOUNT, 3, 1, expiresAt);

        address[] memory voters = _threeVoters();
        bool[] memory directions = _directions(true, true, false);
        uint256 roundId = _settleRoundWith(voters, contentId, directions);

        vm.warp(expiresAt + 1);

        vm.expectRevert("Bounty has qualifying round");
        rewardPoolEscrow.refundExpiredRewardPool(rewardPoolId);

        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, roundId, voter1), REWARD_POOL_AMOUNT / 3);

        vm.prank(voter1);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
        assertEq(reward, REWARD_POOL_AMOUNT / 3);
    }

    function testCompletedPoolRefundRequiresGraceAndSweepsUnclaimedRewards() public {
        uint256 contentId = _submitQuestion("");
        uint256 expiresAt = block.timestamp + EPOCH_DURATION + 10;
        uint256 rewardPoolId = _createRewardPoolWithExpiry(contentId, REWARD_POOL_AMOUNT, 3, 1, expiresAt);

        address[] memory voters = _threeVoters();
        uint256 roundId = _settleRoundWith(voters, contentId, _directions(true, true, false));

        vm.prank(voter1);
        uint256 claimed = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);

        vm.warp(expiresAt + 1);
        vm.expectRevert("Grace");
        rewardPoolEscrow.refundExpiredRewardPool(rewardPoolId);

        vm.warp(expiresAt + BUNDLE_CLAIM_GRACE + 1);
        uint256 funderBalanceBefore = usdc.balanceOf(funder);
        uint256 refundAmount = rewardPoolEscrow.refundExpiredRewardPool(rewardPoolId);
        assertEq(refundAmount, REWARD_POOL_AMOUNT - claimed);
        assertEq(usdc.balanceOf(funder), funderBalanceBefore + refundAmount);
        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, roundId, voter2), 0);
    }

    function testCompletedOpenEndedSubmissionPoolCanForfeitUnclaimedRewardsAfterGrace() public {
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = rewardPoolEscrow.nextRewardPoolId() - 1;
        uint256 rewardAmount = _defaultSubmissionRewardAmount(registry);

        address[] memory voters = _threeVoters();
        uint256 roundId = _settleRoundWith(voters, contentId, _directions(true, true, false));

        vm.prank(voter1);
        uint256 claimed = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);

        vm.expectRevert("Grace");
        rewardPoolEscrow.refundExpiredRewardPool(rewardPoolId);

        vm.warp(block.timestamp + BUNDLE_CLAIM_GRACE + 1);
        uint256 treasuryBalanceBefore = hrepToken.balanceOf(treasury);
        uint256 refundAmount = rewardPoolEscrow.refundExpiredRewardPool(rewardPoolId);

        assertEq(refundAmount, rewardAmount - claimed);
        assertEq(hrepToken.balanceOf(treasury), treasuryBalanceBefore + refundAmount);
        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, roundId, voter2), 0);
    }

    function testSettledRoundCanQualifyAfterContentDormant() public {
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        address[] memory voters = _threeVoters();
        bool[] memory directions = _directions(true, true, false);
        uint256 roundId = _settleRoundWith(voters, contentId, directions);

        vm.warp(block.timestamp + 31 days);
        registry.markDormant(contentId);
        assertFalse(registry.isContentActive(contentId));

        // Submitter has a 24h exclusive revival window after markDormant; the inactive-pool
        // refund is gated on it. Forfeit attempts during the window revert early, so warp
        // past it to reach the "pending qualifying round" check this test is asserting.
        vm.warp(block.timestamp + 2 days);

        vm.expectRevert("Bounty has qualifying round");
        rewardPoolEscrow.refundInactiveRewardPool(rewardPoolId);

        vm.prank(voter1);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
        assertEq(reward, REWARD_POOL_AMOUNT / 3);
    }

    function testExpiredPoolBlocksNewQualificationButLeavesQualifiedClaimsPayable() public {
        uint256 contentId = _submitQuestion("");
        uint256 expiresAt = block.timestamp + 1 days;
        uint256 rewardPoolId = _createRewardPoolWithExpiry(contentId, REWARD_POOL_AMOUNT, 3, 2, expiresAt);

        address[] memory voters = _threeVoters();
        bool[] memory directions = _directions(true, true, false);
        uint256 firstRoundId = _settleRoundWith(voters, contentId, directions);
        rewardPoolEscrow.qualifyRound(rewardPoolId, firstRoundId);

        vm.warp(expiresAt + 1);
        vm.warp(block.timestamp + 25 hours);
        uint256 secondRoundId = _settleRoundWith(voters, contentId, directions);

        vm.prank(voter1);
        vm.expectRevert("Too few eligible voters");
        rewardPoolEscrow.claimQuestionReward(rewardPoolId, secondRoundId);

        (uint256 skipped, uint256 nextRoundToEvaluate) = rewardPoolEscrow.advanceQualificationCursor(rewardPoolId, 1);
        assertEq(skipped, 1);
        assertEq(nextRoundToEvaluate, secondRoundId + 1);

        uint256 funderBalanceBefore = usdc.balanceOf(funder);
        uint256 refundAmount = rewardPoolEscrow.refundExpiredRewardPool(rewardPoolId);
        assertEq(refundAmount, REWARD_POOL_AMOUNT / 2);
        assertEq(usdc.balanceOf(funder), funderBalanceBefore + refundAmount);

        assertEq(
            rewardPoolEscrow.claimableQuestionReward(rewardPoolId, firstRoundId, voter1), (REWARD_POOL_AMOUNT / 2) / 3
        );

        vm.prank(voter1);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, firstRoundId);
        assertEq(reward, (REWARD_POOL_AMOUNT / 2) / 3);
    }

    function testPartialExpiredPoolCanSweepUnclaimedAllocatedRewardsAfterGrace() public {
        uint256 contentId = _submitQuestion("");
        uint256 expiresAt = block.timestamp + 1 days;
        uint256 rewardPoolId = _createRewardPoolWithExpiry(contentId, 120e6, 3, 2, expiresAt);

        address[] memory voters = _threeVoters();
        uint256 firstRoundId = _settleRoundWith(voters, contentId, _directions(true, true, false));
        rewardPoolEscrow.qualifyRound(rewardPoolId, firstRoundId);

        vm.warp(expiresAt + 1);
        uint256 funderBalanceBefore = usdc.balanceOf(funder);
        uint256 unallocatedRefund = rewardPoolEscrow.refundExpiredRewardPool(rewardPoolId);
        assertEq(unallocatedRefund, 60e6);
        assertEq(usdc.balanceOf(funder), funderBalanceBefore + unallocatedRefund);

        vm.prank(voter1);
        uint256 claimed = rewardPoolEscrow.claimQuestionReward(rewardPoolId, firstRoundId);
        assertEq(claimed, 20e6);

        vm.warp(expiresAt + BUNDLE_CLAIM_GRACE + 1);
        uint256 finalRefund = rewardPoolEscrow.refundExpiredRewardPool(rewardPoolId);
        assertEq(finalRefund, 40e6);
        assertEq(usdc.balanceOf(funder), funderBalanceBefore + unallocatedRefund + finalRefund);
        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, firstRoundId, voter2), 0);
        assertEq(usdc.balanceOf(address(rewardPoolEscrow)), 0);
    }

    function testLaterEligibleRoundCannotSkipEarlierEligibleRound() public {
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        address[] memory voters = _threeVoters();
        bool[] memory directions = _directions(true, true, false);
        uint256 firstRoundId = _settleRoundWith(voters, contentId, directions);

        vm.warp(block.timestamp + 25 hours);
        uint256 secondRoundId = _settleRoundWith(voters, contentId, directions);

        (uint256 skipped, uint256 nextRoundToEvaluate) = rewardPoolEscrow.advanceQualificationCursor(rewardPoolId, 1);
        assertEq(skipped, 0);
        assertEq(nextRoundToEvaluate, firstRoundId);

        vm.prank(voter1);
        vm.expectRevert("Round out of order");
        rewardPoolEscrow.claimQuestionReward(rewardPoolId, secondRoundId);

        vm.prank(voter1);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, firstRoundId);
        assertEq(reward, REWARD_POOL_AMOUNT / 3);
    }

    function testIneligibleEarlierRoundCanBeSkippedForLaterEligibleRound() public {
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        address[] memory ineligibleVoters = new address[](3);
        ineligibleVoters[0] = funder;
        ineligibleVoters[1] = voter1;
        ineligibleVoters[2] = voter2;
        bool[] memory directions = _directions(true, true, false);
        _settleRoundWith(ineligibleVoters, contentId, directions);

        vm.warp(block.timestamp + 25 hours);
        uint256 eligibleRoundId = _settleRoundWith(_threeVoters(), contentId, directions);

        (uint256 skipped, uint256 nextRoundToEvaluate) = rewardPoolEscrow.advanceQualificationCursor(rewardPoolId, 1);
        assertEq(skipped, 1);
        assertEq(nextRoundToEvaluate, eligibleRoundId);

        vm.prank(voter1);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, eligibleRoundId);
        assertEq(reward, REWARD_POOL_AMOUNT / 3);

        uint256 funderBalanceBefore = usdc.balanceOf(funder);
        vm.warp(block.timestamp + 31 days + BUNDLE_CLAIM_GRACE + 1);
        uint256 refund = rewardPoolEscrow.refundExpiredRewardPool(rewardPoolId);
        assertEq(refund, REWARD_POOL_AMOUNT - reward);
        assertEq(usdc.balanceOf(funder), funderBalanceBefore + refund);
    }

    function testAdvanceQualificationCursorSkipsIneligibleRoundsInChunks() public {
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        uint256 nextCommitAt = block.timestamp;
        bool[] memory directions = _directions(true, true, false);
        for (uint256 i = 0; i < 5; i++) {
            vm.warp(nextCommitAt);
            _settleRoundWith(_ineligibleVoters(), contentId, directions);
            nextCommitAt += 25 hours;
        }
        vm.warp(nextCommitAt);
        uint256 eligibleRoundId = _settleRoundWith(_threeVoters(), contentId, directions);

        (uint256 skipped, uint256 nextRoundToEvaluate) = rewardPoolEscrow.advanceQualificationCursor(rewardPoolId, 2);
        assertEq(skipped, 2);
        assertEq(nextRoundToEvaluate, 3);

        (skipped, nextRoundToEvaluate) = rewardPoolEscrow.advanceQualificationCursor(rewardPoolId, 2);
        assertEq(skipped, 2);
        assertEq(nextRoundToEvaluate, 5);

        (skipped, nextRoundToEvaluate) = rewardPoolEscrow.advanceQualificationCursor(rewardPoolId, 2);
        assertEq(skipped, 1);
        assertEq(nextRoundToEvaluate, eligibleRoundId);

        vm.prank(voter1);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, eligibleRoundId);
        assertEq(reward, REWARD_POOL_AMOUNT / 3);
    }

    function testInactiveUnexpiredPoolCanRefundUnallocatedFunds() public {
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        vm.prank(submitter);
        registry.cancelContent(contentId);

        uint256 funderBalanceBefore = usdc.balanceOf(funder);
        uint256 refundAmount = rewardPoolEscrow.refundInactiveRewardPool(rewardPoolId);

        assertEq(refundAmount, REWARD_POOL_AMOUNT);
        assertEq(usdc.balanceOf(funder), funderBalanceBefore + REWARD_POOL_AMOUNT);
    }

    function testBundleDoesNotFailOnUnsettledTerminalRound() public {
        uint256[] memory contentIds = new uint256[](2);
        contentIds[0] = _submitQuestionWithContext("https://example.com/bundle-a", "https://example.com/bundle-a.jpg");
        contentIds[1] = _submitQuestionWithContext("https://example.com/bundle-b", "https://example.com/bundle-b.jpg");
        uint256 bundleId = 1;
        uint8 rewardAsset = REWARD_ASSET_HREP;
        uint256 bountyClosesAt = block.timestamp + 30 days;

        vm.prank(submitter);
        hrepToken.approve(address(rewardPoolEscrow), REWARD_POOL_AMOUNT);

        vm.prank(address(registry));
        rewardPoolEscrow.createSubmissionBundleFromRegistry(
            bundleId, contentIds, submitter, rewardAsset, REWARD_POOL_AMOUNT, 3, 1, bountyClosesAt, bountyClosesAt
        );

        vm.prank(address(votingEngine));
        rewardPoolEscrow.recordBundleQuestionTerminal(contentIds[0], 1, false);

        vm.expectRevert("Bundle active");
        rewardPoolEscrow.refundQuestionBundleReward(bundleId);
    }

    function testRewardPoolRequiresExpiry() public {
        uint256 contentId = _submitQuestion("");

        vm.startPrank(funder);
        usdc.approve(address(rewardPoolEscrow), REWARD_POOL_AMOUNT);
        vm.expectRevert("Bad close");
        rewardPoolEscrow.createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1, 0, 0);
        vm.stopPrank();
    }

    function testRewardPoolAmountMustCoverEachRequiredRound() public {
        uint256 contentId = _submitQuestion("");

        vm.startPrank(funder);
        usdc.approve(address(rewardPoolEscrow), 1);
        vm.expectRevert("Amount too small");
        rewardPoolEscrow.createRewardPool(contentId, 1, 3, 2, block.timestamp + 30 days, 0);
        vm.stopPrank();
    }

    function testRewardPoolRejectsTooManyRequiredRounds() public {
        uint256 contentId = _submitQuestion("");

        vm.startPrank(funder);
        usdc.approve(address(rewardPoolEscrow), REWARD_POOL_AMOUNT);
        vm.expectRevert("Too many rounds");
        rewardPoolEscrow.createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 17, block.timestamp + 30 days, 0);
        vm.stopPrank();
    }

    function testRewardPoolAmountMustCoverMaxVotersForEachRequiredRound() public {
        uint256 contentId = _submitQuestion("");

        vm.startPrank(funder);
        usdc.approve(address(rewardPoolEscrow), 199);
        vm.expectRevert("Amount too small");
        rewardPoolEscrow.createRewardPool(contentId, 199, 3, 1, block.timestamp + 30 days, 0);
        vm.stopPrank();
    }

    function testStandaloneUsdcRewardPoolRejectsFunderWithoutVoterId() public {
        uint256 contentId = _submitQuestion("");
        address unverifiedFunder = address(0xB0B);
        usdc.mint(unverifiedFunder, REWARD_POOL_AMOUNT);

        vm.startPrank(unverifiedFunder);
        usdc.approve(address(rewardPoolEscrow), REWARD_POOL_AMOUNT);
        vm.expectRevert("Voter ID required");
        rewardPoolEscrow.createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1, block.timestamp + 30 days, 0);
        vm.stopPrank();
        assertEq(usdc.balanceOf(address(rewardPoolEscrow)), 0);
    }

    function testAgentWalletQuestionSubmissionFundsEscrowFromSigningWallet() public {
        address agentWallet = address(0xA11CE);
        string memory contextUrl = "https://example.com/agent-funded-context";
        string memory title = "Which supplier should the agent shortlist?";
        string memory description = "Check that direct agent submissions fund escrow from the signer.";
        string memory tags = "agents,bounty";
        string[] memory imageUrls = new string[](1);
        imageUrls[0] = "https://example.com/agent-funded-context.jpg";
        RoundLib.RoundConfig memory roundConfig = RoundLib.RoundConfig({
            epochDuration: uint32(EPOCH_DURATION), maxDuration: uint32(7 days), minVoters: 3, maxVoters: 200
        });
        ContentRegistry.SubmissionRewardTerms memory rewardTerms = ContentRegistry.SubmissionRewardTerms({
            asset: REWARD_ASSET_USDC,
            amount: REWARD_POOL_AMOUNT,
            requiredVoters: 3,
            requiredSettledRounds: 1,
            bountyClosesAt: block.timestamp + 30 days,
            feedbackClosesAt: block.timestamp + 30 days
        });
        bytes32 salt = keccak256("agent-wallet-usdc-submission-bounty");
        activeTlockContentRegistry = registry;

        vm.prank(submitter);
        voterIdNFT.setDelegate(agentWallet);
        usdc.mint(agentWallet, REWARD_POOL_AMOUNT);

        (, bytes32 submissionKey) =
            registry.previewQuestionSubmissionKey(contextUrl, imageUrls, "", title, description, tags, CATEGORY_ID);
        bytes32 revealCommitment = _questionRevealCommitment(
            submissionKey,
            _submissionMediaHash(imageUrls, ""),
            title,
            description,
            tags,
            CATEGORY_ID,
            salt,
            agentWallet,
            rewardTerms,
            roundConfig
        );

        vm.startPrank(agentWallet);
        usdc.approve(address(rewardPoolEscrow), rewardTerms.amount);
        registry.reserveSubmission(revealCommitment);
        vm.warp(block.timestamp + 1);

        uint256 escrowBalanceBefore = usdc.balanceOf(address(rewardPoolEscrow));
        uint256 agentBalanceBefore = usdc.balanceOf(agentWallet);
        uint256 expectedContentId = registry.nextContentId();

        uint256 contentId = registry.submitQuestionWithRewardAndRoundConfig(
            contextUrl,
            imageUrls,
            "",
            title,
            description,
            tags,
            CATEGORY_ID,
            salt,
            rewardTerms,
            roundConfig,
            _defaultQuestionSpec()
        );
        vm.stopPrank();

        assertEq(contentId, expectedContentId);
        (,, address storedSubmitter,,,,,,,) = registry.contents(contentId);
        assertEq(storedSubmitter, agentWallet);
        assertEq(registry.getSubmitterIdentity(contentId), submitter);
        assertEq(usdc.balanceOf(address(rewardPoolEscrow)), escrowBalanceBefore + rewardTerms.amount);
        assertEq(usdc.balanceOf(agentWallet), agentBalanceBefore - rewardTerms.amount);
    }

    function testUndelegatedAgentQuestionSubmissionWithUsdcRewardRequiresVoterId() public {
        address agentWallet = address(0xA11CE);
        uint256 nextContentIdBefore = registry.nextContentId();
        uint256 nextRewardPoolIdBefore = rewardPoolEscrow.nextRewardPoolId();

        _submitAgentQuestionWithUsdcReward(agentWallet, "agent-undelegated-no-voter-id", true);

        assertEq(registry.nextContentId(), nextContentIdBefore);
        assertEq(rewardPoolEscrow.nextRewardPoolId(), nextRewardPoolIdBefore);
    }

    function testX402QuestionSubmissionRequiresVoterId() public {
        address agentWallet = address(0xA11CE);
        X402TestQuestion memory question = _x402TestQuestion();
        Eip3009Authorization memory authorization = _x402Authorization(agentWallet, question);

        usdc.mint(agentWallet, question.rewardTerms.amount);
        uint256 escrowBalanceBefore = usdc.balanceOf(address(rewardPoolEscrow));
        uint256 agentBalanceBefore = usdc.balanceOf(agentWallet);
        uint256 nextContentIdBefore = registry.nextContentId();

        _reserveX402Question(agentWallet, question);
        vm.warp(block.timestamp + 1);

        vm.expectRevert("Voter ID required");
        x402QuestionSubmitter.submitQuestionWithX402Payment(
            question.contextUrl,
            question.imageUrls,
            "",
            question.title,
            question.description,
            question.tags,
            CATEGORY_ID,
            question.salt,
            question.rewardTerms,
            question.roundConfig,
            question.spec,
            authorization
        );

        assertFalse(usdc.authorizationState(agentWallet, authorization.nonce));
        assertEq(registry.nextContentId(), nextContentIdBefore);
        assertEq(usdc.balanceOf(address(rewardPoolEscrow)), escrowBalanceBefore);
        assertEq(usdc.balanceOf(agentWallet), agentBalanceBefore);
    }

    function testX402QuestionSubmissionRequiresReservationBeforeUsdcAuthorization() public {
        address agentWallet = address(0xA11CE);
        X402TestQuestion memory question = _x402TestQuestion();
        Eip3009Authorization memory authorization = _x402Authorization(agentWallet, question);

        vm.prank(submitter);
        voterIdNFT.setDelegate(agentWallet);
        usdc.mint(agentWallet, question.rewardTerms.amount);
        uint256 escrowBalanceBefore = usdc.balanceOf(address(rewardPoolEscrow));
        uint256 agentBalanceBefore = usdc.balanceOf(agentWallet);
        uint256 nextContentIdBefore = registry.nextContentId();

        vm.expectRevert("Reservation not found");
        x402QuestionSubmitter.submitQuestionWithX402Payment(
            question.contextUrl,
            question.imageUrls,
            "",
            question.title,
            question.description,
            question.tags,
            CATEGORY_ID,
            question.salt,
            question.rewardTerms,
            question.roundConfig,
            question.spec,
            authorization
        );

        assertFalse(usdc.authorizationState(agentWallet, authorization.nonce));
        assertEq(registry.nextContentId(), nextContentIdBefore);
        assertEq(usdc.balanceOf(address(rewardPoolEscrow)), escrowBalanceBefore);
        assertEq(usdc.balanceOf(agentWallet), agentBalanceBefore);
    }

    function testX402QuestionSubmissionRejectsTooNewReservationBeforeUsdcAuthorization() public {
        address agentWallet = address(0xA11CE);
        X402TestQuestion memory question = _x402TestQuestion();
        Eip3009Authorization memory authorization = _x402Authorization(agentWallet, question);

        vm.prank(submitter);
        voterIdNFT.setDelegate(agentWallet);
        usdc.mint(agentWallet, question.rewardTerms.amount);
        uint256 escrowBalanceBefore = usdc.balanceOf(address(rewardPoolEscrow));
        uint256 agentBalanceBefore = usdc.balanceOf(agentWallet);
        uint256 nextContentIdBefore = registry.nextContentId();

        _reserveX402Question(agentWallet, question);

        vm.expectRevert("Reservation too new");
        x402QuestionSubmitter.submitQuestionWithX402Payment(
            question.contextUrl,
            question.imageUrls,
            "",
            question.title,
            question.description,
            question.tags,
            CATEGORY_ID,
            question.salt,
            question.rewardTerms,
            question.roundConfig,
            question.spec,
            authorization
        );

        assertFalse(usdc.authorizationState(agentWallet, authorization.nonce));
        assertEq(registry.nextContentId(), nextContentIdBefore);
        assertEq(usdc.balanceOf(address(rewardPoolEscrow)), escrowBalanceBefore);
        assertEq(usdc.balanceOf(agentWallet), agentBalanceBefore);
    }

    function testX402QuestionSubmissionRejectsStaleEscrowBeforeUsdcAuthorization() public {
        address agentWallet = address(0xA11CE);
        X402TestQuestion memory question = _x402TestQuestion();
        Eip3009Authorization memory authorization = _x402Authorization(agentWallet, question);

        vm.prank(submitter);
        voterIdNFT.setDelegate(agentWallet);
        usdc.mint(agentWallet, question.rewardTerms.amount);
        uint256 escrowBalanceBefore = usdc.balanceOf(address(rewardPoolEscrow));
        uint256 agentBalanceBefore = usdc.balanceOf(agentWallet);
        uint256 nextContentIdBefore = registry.nextContentId();

        _reserveX402Question(agentWallet, question);
        vm.warp(block.timestamp + 1);

        QuestionRewardPoolEscrow replacementEscrow = QuestionRewardPoolEscrow(
            address(
                new ERC1967Proxy(
                    address(new QuestionRewardPoolEscrow()),
                    abi.encodeCall(
                        QuestionRewardPoolEscrow.initialize,
                        (
                            owner,
                            address(hrepToken),
                            address(usdc),
                            address(registry),
                            address(votingEngine),
                            address(voterIdNFT)
                        )
                    )
                )
            )
        );

        vm.startPrank(owner);
        registry.pause();
        registry.setQuestionRewardPoolEscrow(address(replacementEscrow));
        registry.unpause();
        vm.stopPrank();

        vm.expectRevert("Stale escrow");
        x402QuestionSubmitter.submitQuestionWithX402Payment(
            question.contextUrl,
            question.imageUrls,
            "",
            question.title,
            question.description,
            question.tags,
            CATEGORY_ID,
            question.salt,
            question.rewardTerms,
            question.roundConfig,
            question.spec,
            authorization
        );

        assertFalse(usdc.authorizationState(agentWallet, authorization.nonce));
        assertEq(registry.nextContentId(), nextContentIdBefore);
        assertEq(usdc.balanceOf(address(rewardPoolEscrow)), escrowBalanceBefore);
        assertEq(usdc.balanceOf(agentWallet), agentBalanceBefore);
    }

    function testX402QuestionSubmissionConsumesUsdcAuthorizationWithDelegatedVoterId() public {
        address agentWallet = address(0xA11CE);
        X402TestQuestion memory question = _x402TestQuestion();
        Eip3009Authorization memory authorization = _x402Authorization(agentWallet, question);

        vm.prank(submitter);
        voterIdNFT.setDelegate(agentWallet);
        usdc.mint(agentWallet, question.rewardTerms.amount);
        uint256 escrowBalanceBefore = usdc.balanceOf(address(rewardPoolEscrow));
        uint256 agentBalanceBefore = usdc.balanceOf(agentWallet);

        _reserveX402Question(agentWallet, question);
        vm.warp(block.timestamp + 1);

        uint256 contentId = x402QuestionSubmitter.submitQuestionWithX402Payment(
            question.contextUrl,
            question.imageUrls,
            "",
            question.title,
            question.description,
            question.tags,
            CATEGORY_ID,
            question.salt,
            question.rewardTerms,
            question.roundConfig,
            question.spec,
            authorization
        );

        (,, address storedSubmitter,,,,,,,) = registry.contents(contentId);
        assertEq(storedSubmitter, agentWallet);
        assertEq(registry.getSubmitterIdentity(contentId), submitter);
        assertEq(
            registry.contentSubmitterNullifier(contentId), voterIdNFT.getNullifier(voterIdNFT.getTokenId(submitter))
        );
        assertTrue(usdc.authorizationState(agentWallet, authorization.nonce));
        assertEq(usdc.balanceOf(address(rewardPoolEscrow)), escrowBalanceBefore + question.rewardTerms.amount);
        assertEq(usdc.balanceOf(agentWallet), agentBalanceBefore - question.rewardTerms.amount);
    }

    function testDelegatedAgentSubmitterHolderCannotClaimQuestionReward() public {
        address agentWallet = address(0xA11CE);
        vm.prank(submitter);
        voterIdNFT.setDelegate(agentWallet);

        (uint256 contentId, uint256 rewardPoolId) =
            _submitAgentQuestionWithUsdcReward(agentWallet, "agent-delegated-claim", false);
        uint256 roundId = 1;
        uint256 submitterVoterId = voterIdNFT.getTokenId(submitter);

        _mockSettledRound(contentId, roundId, 4);
        _mockRevealedCommitForVoterId(contentId, roundId, submitterVoterId, submitter);
        _mockRevealedCommitForVoterId(contentId, roundId, voterIdNFT.getTokenId(voter1), voter1);
        _mockRevealedCommitForVoterId(contentId, roundId, voterIdNFT.getTokenId(voter2), voter2);
        _mockRevealedCommitForVoterId(contentId, roundId, voterIdNFT.getTokenId(voter3), voter3);

        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, roundId, submitter), 0);
        vm.prank(submitter);
        vm.expectRevert("Too few eligible voters");
        rewardPoolEscrow.claimQuestionReward(rewardPoolId, roundId);
    }

    function testUnderfundedRoundDoesNotQualifyAndCanBeSkipped() public {
        vm.startPrank(owner);
        protocolConfig.setSubmissionRewardMinimums(3, 3);
        vm.stopPrank();

        RoundLib.RoundConfig memory roundConfig = RoundLib.RoundConfig({
            epochDuration: uint32(EPOCH_DURATION), maxDuration: uint32(7 days), minVoters: 3, maxVoters: 4
        });
        uint256 contentId = _submitQuestionWithRoundConfig("https://example.com/underfunded.jpg", roundConfig);
        uint256 rewardPoolId = 1;

        uint256 underfundedRoundId = _settleRoundWith(_fourVoters(), contentId, _directions(true, true, false, true));

        assertEq(rewardPoolEscrow.claimableQuestionReward(rewardPoolId, underfundedRoundId, voter1), 0);
        vm.prank(voter1);
        vm.expectRevert("Small allocation");
        rewardPoolEscrow.claimQuestionReward(rewardPoolId, underfundedRoundId);

        vm.warp(block.timestamp + 25 hours);
        uint256 eligibleRoundId = _settleRoundWith(_threeVoters(), contentId, _directions(true, true, false));

        (uint256 skipped, uint256 nextRoundToEvaluate) = rewardPoolEscrow.advanceQualificationCursor(rewardPoolId, 1);
        assertEq(skipped, 1);
        assertEq(nextRoundToEvaluate, eligibleRoundId);

        vm.prank(voter1);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, eligibleRoundId);
        assertEq(reward, 1);
    }

    function _submitBundleQuestions() internal returns (uint256[] memory contentIds) {
        contentIds = new uint256[](2);
        contentIds[0] = _submitQuestionWithContext("https://example.com/bundle-a", "https://example.com/bundle-a.jpg");
        contentIds[1] = _submitQuestionWithContext("https://example.com/bundle-b", "https://example.com/bundle-b.jpg");
    }

    function _createSubmissionBundle(
        uint256[] memory contentIds,
        address bundleFunder,
        uint8 asset,
        uint256 amount,
        uint256 requiredCompleters
    ) internal returns (uint256 bundleId) {
        return _createSubmissionBundle(contentIds, bundleFunder, asset, amount, requiredCompleters, 1);
    }

    function _createSubmissionBundle(
        uint256[] memory contentIds,
        address bundleFunder,
        uint8 asset,
        uint256 amount,
        uint256 requiredCompleters,
        uint256 requiredSettledRounds
    ) internal returns (uint256 bundleId) {
        bundleId = 1;
        vm.startPrank(bundleFunder);
        if (asset == REWARD_ASSET_HREP) {
            hrepToken.approve(address(rewardPoolEscrow), amount);
        } else {
            usdc.approve(address(rewardPoolEscrow), amount);
        }
        vm.stopPrank();

        uint256 bountyClosesAt = block.timestamp + 30 days;
        vm.prank(address(registry));
        rewardPoolEscrow.createSubmissionBundleFromRegistry(
            bundleId,
            contentIds,
            bundleFunder,
            asset,
            amount,
            requiredCompleters,
            requiredSettledRounds,
            bountyClosesAt,
            bountyClosesAt
        );
    }

    function _submitQuestion(string memory url) internal returns (uint256 contentId) {
        string memory mediaUrl = bytes(url).length == 0 ? DEFAULT_MEDIA_URL : url;
        return _submitQuestionWithContext("https://example.com/context", mediaUrl);
    }

    function _submitQuestionWithContext(string memory contextUrl, string memory mediaUrl)
        internal
        returns (uint256 contentId)
    {
        string[] memory imageUrls = new string[](1);
        imageUrls[0] = mediaUrl;
        activeTlockContentRegistry = registry;
        bytes32 salt = keccak256(
            abi.encode(contextUrl, mediaUrl, QUESTION, DESCRIPTION, TAGS, CATEGORY_ID, submitter, block.timestamp)
        );

        vm.startPrank(submitter);
        _reserveQuestionMediaSubmission(
            registry, contextUrl, imageUrls, "", QUESTION, DESCRIPTION, TAGS, CATEGORY_ID, salt, submitter
        );
        vm.warp(block.timestamp + 1);
        contentId = registry.submitQuestion(
            contextUrl, imageUrls, "", QUESTION, DESCRIPTION, TAGS, CATEGORY_ID, salt, _defaultQuestionSpec()
        );
        vm.stopPrank();
    }

    function _submitQuestionWithRoundConfig(string memory url, RoundLib.RoundConfig memory roundConfig)
        internal
        returns (uint256 contentId)
    {
        string[] memory imageUrls = new string[](1);
        imageUrls[0] = url;
        activeTlockContentRegistry = registry;
        bytes32 salt = keccak256(abi.encode(url, QUESTION, DESCRIPTION, TAGS, CATEGORY_ID, submitter, block.timestamp));

        (, bytes32 submissionKey) = registry.previewQuestionSubmissionKey(
            "https://example.com/context", imageUrls, "", QUESTION, DESCRIPTION, TAGS, CATEGORY_ID
        );
        uint256 rewardAmount = _defaultSubmissionRewardAmount(registry);
        bytes32 revealCommitment = _questionRevealCommitment(
            submissionKey,
            _submissionMediaHash(imageUrls, ""),
            QUESTION,
            DESCRIPTION,
            TAGS,
            CATEGORY_ID,
            salt,
            submitter,
            ContentRegistry.SubmissionRewardTerms({
                asset: DEFAULT_SUBMISSION_REWARD_ASSET_HREP,
                amount: rewardAmount,
                requiredVoters: DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS,
                requiredSettledRounds: DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS,
                bountyClosesAt: DEFAULT_SUBMISSION_REWARD_EXPIRES_AT,
                feedbackClosesAt: DEFAULT_SUBMISSION_REWARD_EXPIRES_AT
            }),
            roundConfig
        );

        vm.startPrank(submitter);
        hrepToken.approve(address(rewardPoolEscrow), rewardAmount);
        registry.reserveSubmission(revealCommitment);
        vm.warp(block.timestamp + 1);
        contentId = registry.submitQuestionWithRewardAndRoundConfig(
            "https://example.com/context",
            imageUrls,
            "",
            QUESTION,
            DESCRIPTION,
            TAGS,
            CATEGORY_ID,
            salt,
            _defaultSubmissionRewardTerms(registry),
            roundConfig,
            _defaultQuestionSpec()
        );
        vm.stopPrank();
    }

    function _x402TestQuestion() internal view returns (X402TestQuestion memory question) {
        question.contextUrl = "https://example.com/x402-agent-question";
        question.title = "Should the agent proceed with this supplier?";
        question.description = "Review the supplied context and vote on whether the agent should continue.";
        question.tags = "agents,bounty";
        question.imageUrls = new string[](1);
        question.imageUrls[0] = "https://example.com/x402-agent-question.jpg";
        question.roundConfig = RoundLib.RoundConfig({
            epochDuration: uint32(EPOCH_DURATION), maxDuration: uint32(7 days), minVoters: 3, maxVoters: 200
        });
        question.rewardTerms = ContentRegistry.SubmissionRewardTerms({
            asset: REWARD_ASSET_USDC,
            amount: REWARD_POOL_AMOUNT,
            requiredVoters: 3,
            requiredSettledRounds: 1,
            bountyClosesAt: block.timestamp + 30 days,
            feedbackClosesAt: block.timestamp + 30 days
        });
        question.spec = ContentRegistry.QuestionSpecCommitment({
            questionMetadataHash: keccak256("x402-question-metadata"), resultSpecHash: keccak256("x402-result-spec")
        });
        question.salt = keccak256("x402-usdc-no-voter-id");
    }

    function _reserveX402Question(address agentWallet, X402TestQuestion memory question)
        internal
        returns (bytes32 revealCommitment)
    {
        (, bytes32 submissionKey) = registry.previewQuestionSubmissionKey(
            question.contextUrl,
            question.imageUrls,
            "",
            question.title,
            question.description,
            question.tags,
            CATEGORY_ID
        );
        revealCommitment = _questionRevealCommitment(
            submissionKey,
            _submissionMediaHash(question.imageUrls, ""),
            question.title,
            question.description,
            question.tags,
            CATEGORY_ID,
            question.salt,
            agentWallet,
            question.rewardTerms,
            question.roundConfig,
            question.spec
        );

        vm.prank(agentWallet);
        registry.reserveSubmission(revealCommitment);
    }

    function _x402Authorization(address agentWallet, X402TestQuestion memory question)
        internal
        view
        returns (Eip3009Authorization memory authorization)
    {
        uint256 validAfter = block.timestamp - 1;
        uint256 validBefore = block.timestamp + 30 minutes;
        ContentRegistry.SubmissionMetadata memory metadata = ContentRegistry.SubmissionMetadata({
            url: question.contextUrl,
            title: question.title,
            description: question.description,
            tags: question.tags,
            categoryId: CATEGORY_ID
        });
        authorization = Eip3009Authorization({
            from: agentWallet,
            to: address(x402QuestionSubmitter),
            value: question.rewardTerms.amount,
            validAfter: validAfter,
            validBefore: validBefore,
            nonce: x402QuestionSubmitter.computeX402QuestionPaymentNonce(
                metadata,
                question.imageUrls,
                "",
                question.salt,
                question.rewardTerms,
                question.roundConfig,
                question.spec,
                agentWallet,
                address(x402QuestionSubmitter),
                question.rewardTerms.amount,
                validAfter,
                validBefore
            ),
            v: 27,
            r: bytes32(0),
            s: bytes32(0)
        });
    }

    function _submitAgentQuestionWithUsdcReward(address agentWallet, string memory path, bool expectVoterIdRevert)
        internal
        returns (uint256 contentId, uint256 rewardPoolId)
    {
        string memory contextUrl = string(abi.encodePacked("https://example.com/", path));
        string[] memory imageUrls = new string[](1);
        imageUrls[0] = string(abi.encodePacked(contextUrl, ".jpg"));
        RoundLib.RoundConfig memory roundConfig = RoundLib.RoundConfig({
            epochDuration: uint32(EPOCH_DURATION), maxDuration: uint32(7 days), minVoters: 3, maxVoters: 200
        });
        ContentRegistry.SubmissionRewardTerms memory rewardTerms = ContentRegistry.SubmissionRewardTerms({
            asset: REWARD_ASSET_USDC,
            amount: REWARD_POOL_AMOUNT,
            requiredVoters: 3,
            requiredSettledRounds: 1,
            bountyClosesAt: block.timestamp + 30 days,
            feedbackClosesAt: block.timestamp + 30 days
        });
        bytes32 salt = keccak256(abi.encodePacked(path, agentWallet));
        activeTlockContentRegistry = registry;

        usdc.mint(agentWallet, rewardTerms.amount);
        (, bytes32 submissionKey) =
            registry.previewQuestionSubmissionKey(contextUrl, imageUrls, "", QUESTION, DESCRIPTION, TAGS, CATEGORY_ID);
        bytes32 revealCommitment = _questionRevealCommitment(
            submissionKey,
            _submissionMediaHash(imageUrls, ""),
            QUESTION,
            DESCRIPTION,
            TAGS,
            CATEGORY_ID,
            salt,
            agentWallet,
            rewardTerms,
            roundConfig
        );

        vm.startPrank(agentWallet);
        usdc.approve(address(rewardPoolEscrow), rewardTerms.amount);
        registry.reserveSubmission(revealCommitment);
        vm.warp(block.timestamp + 1);
        rewardPoolId = rewardPoolEscrow.nextRewardPoolId();
        if (expectVoterIdRevert) {
            vm.expectRevert("Voter ID required");
        }
        contentId = registry.submitQuestionWithRewardAndRoundConfig(
            contextUrl,
            imageUrls,
            "",
            QUESTION,
            DESCRIPTION,
            TAGS,
            CATEGORY_ID,
            salt,
            rewardTerms,
            roundConfig,
            _defaultQuestionSpec()
        );
        vm.stopPrank();
    }

    function _expectSelfVoteCommitRevert(address voter, uint256 contentId, bytes32 salt) internal {
        TestCommitArtifacts memory artifacts =
            _buildTestCommitArtifacts(address(votingEngine), voter, true, salt, contentId);
        vm.startPrank(voter);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext1 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), artifacts.roundReferenceRatingBps);
        vm.expectRevert(RoundVotingEngine.SelfVote.selector);
        votingEngine.commitVote(
            contentId,
            cachedRoundContext1,
            artifacts.targetRound,
            artifacts.drandChainHash,
            artifacts.commitHash,
            artifacts.ciphertext,
            STAKE,
            address(0)
        );
        vm.stopPrank();
    }

    function _createRewardPool(uint256 contentId, uint256 amount, uint256 requiredVoters, uint256 requiredSettledRounds)
        internal
        returns (uint256 rewardPoolId)
    {
        return _createRewardPoolWithExpiry(
            contentId, amount, requiredVoters, requiredSettledRounds, block.timestamp + 30 days
        );
    }

    function _createRewardPoolWithExpiry(
        uint256 contentId,
        uint256 amount,
        uint256 requiredVoters,
        uint256 requiredSettledRounds,
        uint256 expiresAt
    ) internal returns (uint256 rewardPoolId) {
        rewardPoolId = _createRewardPoolAs(funder, contentId, amount, requiredVoters, requiredSettledRounds, expiresAt);
    }

    function _createRewardPoolAs(
        address poolFunder,
        uint256 contentId,
        uint256 amount,
        uint256 requiredVoters,
        uint256 requiredSettledRounds
    ) internal returns (uint256 rewardPoolId) {
        rewardPoolId = _createRewardPoolAs(
            poolFunder, contentId, amount, requiredVoters, requiredSettledRounds, block.timestamp + 30 days
        );
    }

    function _createRewardPoolAs(
        address poolFunder,
        uint256 contentId,
        uint256 amount,
        uint256 requiredVoters,
        uint256 requiredSettledRounds,
        uint256 expiresAt
    ) internal returns (uint256 rewardPoolId) {
        vm.startPrank(poolFunder);
        usdc.approve(address(rewardPoolEscrow), amount);
        rewardPoolId =
            rewardPoolEscrow.createRewardPool(contentId, amount, requiredVoters, requiredSettledRounds, expiresAt, 0);
        vm.stopPrank();
    }

    function _settleRoundWith(address[] memory voters, uint256 contentId, bool[] memory directions)
        internal
        returns (uint256 roundId)
    {
        return _settleRoundWithFrontend(voters, contentId, directions, address(0));
    }

    function _settleRoundWithFrontend(
        address[] memory voters,
        uint256 contentId,
        bool[] memory directions,
        address frontend
    ) internal returns (uint256 roundId) {
        bytes32[] memory salts = new bytes32[](voters.length);
        bytes32[] memory commitKeys = new bytes32[](voters.length);

        for (uint256 i = 0; i < voters.length; i++) {
            salts[i] = keccak256(abi.encodePacked(voters[i], contentId, directions[i], i));
            commitKeys[i] = _commitTestVote(
                DirectTestCommitRequest({
                    engine: votingEngine,
                    hrepToken: hrepToken,
                    voter: voters[i],
                    contentId: contentId,
                    isUp: directions[i],
                    stake: STAKE,
                    frontend: frontend,
                    salt: salts[i]
                })
            );
        }

        roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        _warpPastTlockRevealTime(block.timestamp + EPOCH_DURATION);

        for (uint256 i = 0; i < voters.length; i++) {
            votingEngine.revealVoteByCommitKey(contentId, roundId, commitKeys[i], directions[i], salts[i]);
        }

        votingEngine.settleRound(contentId, roundId);
    }

    function _settleRoundWithOneUnrevealed(uint256 contentId) internal returns (uint256 roundId) {
        address[] memory voters = _fourVoters();
        bool[] memory directions = _directions(true, true, false, true);
        bytes32[] memory salts = new bytes32[](voters.length);
        bytes32[] memory commitKeys = new bytes32[](voters.length);

        for (uint256 i = 0; i < voters.length; i++) {
            salts[i] = keccak256(abi.encodePacked(voters[i], contentId, directions[i], i));
            commitKeys[i] = _commitTestVote(
                DirectTestCommitRequest({
                    engine: votingEngine,
                    hrepToken: hrepToken,
                    voter: voters[i],
                    contentId: contentId,
                    isUp: directions[i],
                    stake: STAKE,
                    frontend: address(0),
                    salt: salts[i]
                })
            );
        }

        roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(round.startTime) + EPOCH_DURATION);

        for (uint256 i = 0; i < voters.length - 1; i++) {
            votingEngine.revealVoteByCommitKey(contentId, roundId, commitKeys[i], directions[i], salts[i]);
        }

        vm.warp(round.startTime + 7 days + protocolConfig.revealGracePeriod() + 1);
        votingEngine.settleRound(contentId, roundId);
        assertEq(votingEngine.roundUnrevealedCleanupRemaining(contentId, roundId), 1);
    }

    function _mockSettledRound(uint256 contentId, uint256 roundId, uint16 revealedCount) internal {
        vm.mockCall(
            address(votingEngine),
            abi.encodeWithSignature("rounds(uint256,uint256)", contentId, roundId),
            abi.encode(
                uint48(block.timestamp),
                RoundLib.RoundState.Settled,
                revealedCount,
                revealedCount,
                uint64(0),
                uint64(0),
                uint64(0),
                uint16(0),
                uint16(0),
                true,
                uint48(block.timestamp),
                uint48(block.timestamp),
                uint64(0),
                uint64(0)
            )
        );
    }

    function _mockRevealedCommitForVoterId(uint256 contentId, uint256 roundId, uint256 voterId, address voter)
        internal
    {
        bytes32 commitKey = keccak256(abi.encode(contentId, roundId, voterId, voter));
        vm.mockCall(
            address(votingEngine),
            abi.encodeWithSignature("voterIdCommitKey(uint256,uint256,uint256)", contentId, roundId, voterId),
            abi.encode(commitKey)
        );
        uint256 nullifier = voterIdNFT.getNullifier(voterId);
        if (nullifier != 0) {
            vm.mockCall(
                address(votingEngine),
                abi.encodeWithSignature(
                    "voterNullifierCommitKey(uint256,uint256,uint256)", contentId, roundId, nullifier
                ),
                abi.encode(commitKey)
            );
        }
        vm.mockCall(
            address(votingEngine),
            abi.encodeWithSignature("commitVoterId(uint256,uint256,bytes32)", contentId, roundId, commitKey),
            abi.encode(voterId)
        );
        vm.mockCall(
            address(votingEngine),
            abi.encodeWithSignature("commits(uint256,uint256,bytes32)", contentId, roundId, commitKey),
            abi.encode(
                voter, uint64(STAKE), bytes(""), uint64(0), bytes32(0), address(0), uint48(0), true, true, uint8(0)
            )
        );
        // Escrow reads via the narrow commitCore getter for gas; mock it too so tests
        // that rely on synthetic reveals behave identically to the legacy commits() path.
        vm.mockCall(
            address(votingEngine),
            abi.encodeWithSignature("commitCore(uint256,uint256,bytes32)", contentId, roundId, commitKey),
            abi.encode(voter, uint64(STAKE), address(0), uint48(0), true, true, uint8(0))
        );
    }

    function _registerFrontend(address frontend) internal {
        vm.startPrank(frontend);
        hrepToken.approve(address(frontendRegistry), frontendRegistry.STAKE_AMOUNT());
        frontendRegistry.register();
        vm.stopPrank();
    }

    function _migrateVoterIdsWithDifferentIds() internal returns (MockVoterIdNFT migratedVoterIdNFT) {
        migratedVoterIdNFT = new MockVoterIdNFT();
        address[7] memory migratedHumans = [voter3, voter2, voter1, submitter, funder, voter4, frontend1];
        for (uint256 i = 0; i < migratedHumans.length; i++) {
            migratedVoterIdNFT.setHolder(migratedHumans[i]);
        }

        vm.startPrank(owner);
        protocolConfig.setVoterIdNFT(address(migratedVoterIdNFT));
        registry.setVoterIdNFT(address(migratedVoterIdNFT));
        frontendRegistry.setVoterIdNFT(address(migratedVoterIdNFT));
        rewardPoolEscrow.setVoterIdNFT(address(migratedVoterIdNFT));
        vm.stopPrank();
    }

    function _migrateVoterIdsWithVoter1AtOldFunderId() internal returns (MockVoterIdNFT migratedVoterIdNFT) {
        migratedVoterIdNFT = new MockVoterIdNFT();
        address[6] memory migratedHumans = [submitter, voter1, voter2, voter3, voter4, frontend1];
        for (uint256 i = 0; i < migratedHumans.length; i++) {
            migratedVoterIdNFT.setHolder(migratedHumans[i]);
        }

        vm.startPrank(owner);
        protocolConfig.setVoterIdNFT(address(migratedVoterIdNFT));
        registry.setVoterIdNFT(address(migratedVoterIdNFT));
        frontendRegistry.setVoterIdNFT(address(migratedVoterIdNFT));
        rewardPoolEscrow.setVoterIdNFT(address(migratedVoterIdNFT));
        vm.stopPrank();
    }

    function _threeVoters() internal view returns (address[] memory voters) {
        voters = new address[](3);
        voters[0] = voter1;
        voters[1] = voter2;
        voters[2] = voter3;
    }

    function _ineligibleVoters() internal view returns (address[] memory voters) {
        voters = new address[](3);
        voters[0] = funder;
        voters[1] = voter1;
        voters[2] = voter2;
    }

    function _fourVoters() internal view returns (address[] memory voters) {
        voters = new address[](4);
        voters[0] = voter1;
        voters[1] = voter2;
        voters[2] = voter3;
        voters[3] = voter4;
    }

    function _directions(bool a, bool b, bool c) internal pure returns (bool[] memory directions) {
        directions = new bool[](3);
        directions[0] = a;
        directions[1] = b;
        directions[2] = c;
    }

    function _directions(bool a, bool b, bool c, bool d) internal pure returns (bool[] memory directions) {
        directions = new bool[](4);
        directions[0] = a;
        directions[1] = b;
        directions[2] = c;
        directions[3] = d;
    }

    // --- Security fix: BUNDLE_CLAIM_GRACE ---

    function testBundleRefund_NoRecordedRoundSetStillWaitsForGraceAtBountyClose() public {
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleId = _createSubmissionBundle(contentIds, funder, REWARD_ASSET_USDC, REWARD_POOL_AMOUNT, 3);

        vm.warp(block.timestamp + 31 days);
        vm.expectRevert("Grace");
        rewardPoolEscrow.refundQuestionBundleReward(bundleId);

        vm.warp(block.timestamp + BUNDLE_CLAIM_GRACE + 1);
        uint256 treasuryBalanceBefore = usdc.balanceOf(treasury);
        uint256 refundAmount = rewardPoolEscrow.refundQuestionBundleReward(bundleId);
        assertEq(refundAmount, REWARD_POOL_AMOUNT);
        assertEq(usdc.balanceOf(treasury), treasuryBalanceBefore + refundAmount);
    }

    function testBundleRefund_ClaimGraceBlocksRaceAtBountyClose() public {
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleId = _createSubmissionBundle(contentIds, funder, REWARD_ASSET_USDC, REWARD_POOL_AMOUNT, 3);

        address[] memory voters = new address[](3);
        voters[0] = voter2;
        voters[1] = voter3;
        voters[2] = voter4;
        bool[] memory directions = _directions(true, true, false);

        _settleRoundWith(voters, contentIds[0], directions);
        _settleRoundWith(voters, contentIds[1], directions);

        // Voter2 claims their bundle reward; voter3 has not yet claimed, so the bundle
        // is still claim-open and BUNDLE_CLAIM_GRACE should apply.
        vm.prank(voter2);
        rewardPoolEscrow.claimQuestionBundleReward(bundleId, 0);
        assertGt(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, 0, voter3), 0);

        // Jump past bountyClosesAt (helper sets +30 days).
        vm.warp(block.timestamp + 31 days);
        vm.expectRevert("Grace");
        rewardPoolEscrow.refundQuestionBundleReward(bundleId);

        // Jump past the 7-day grace; refund now allowed (forfeits to treasury since
        // registry-initiated bundles are nonRefundable).
        vm.warp(block.timestamp + 7 days + 1);
        uint256 treasuryBalanceBefore = usdc.balanceOf(treasury);
        uint256 refundAmount = rewardPoolEscrow.refundQuestionBundleReward(bundleId);
        assertGt(refundAmount, 0);
        assertEq(usdc.balanceOf(treasury), treasuryBalanceBefore + refundAmount);
    }

    function testBundleRefund_WaitsForUnrevealedCleanupAfterGrace() public {
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleId = _createSubmissionBundle(contentIds, funder, REWARD_ASSET_USDC, REWARD_POOL_AMOUNT, 3);

        uint256 cleanupRoundId = _settleRoundWithOneUnrevealed(contentIds[0]);

        address[] memory voters = new address[](3);
        voters[0] = voter1;
        voters[1] = voter2;
        voters[2] = voter3;
        bool[] memory directions = _directions(true, true, false);
        _settleRoundWith(voters, contentIds[1], directions);

        vm.warp(block.timestamp + 31 days + BUNDLE_CLAIM_GRACE + 1);
        vm.expectRevert("Cleanup pending");
        rewardPoolEscrow.refundQuestionBundleReward(bundleId);

        votingEngine.processUnrevealedVotes(contentIds[0], cleanupRoundId, 0, 0);
        uint256 treasuryBalanceBefore = usdc.balanceOf(treasury);
        uint256 refundAmount = rewardPoolEscrow.refundQuestionBundleReward(bundleId);
        assertGt(refundAmount, 0);
        assertEq(usdc.balanceOf(treasury), treasuryBalanceBefore + refundAmount);
    }
}
