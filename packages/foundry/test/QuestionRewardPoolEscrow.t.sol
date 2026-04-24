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
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";

contract QuestionRewardPoolEscrowTest is VotingTestBase {
    HumanReputation public hrepToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    RoundRewardDistributor public rewardDistributor;
    FrontendRegistry public frontendRegistry;
    QuestionRewardPoolEscrow public rewardPoolEscrow;
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

    function testRefundableRewardPoolAmountUsesQuestionSelectedVoterCap() public {
        RoundLib.RoundConfig memory roundConfig =
            RoundLib.RoundConfig({ epochDuration: 10 minutes, maxDuration: 1 hours, minVoters: 3, maxVoters: 4 });
        uint256 contentId = _submitQuestionWithRoundConfig("https://example.com/small-cap.jpg", roundConfig);

        uint256 rewardPoolId = _createRewardPool(contentId, 4, 3, 1);

        assertEq(rewardPoolId, 2);
        assertEq(rewardPoolEscrow.nextRewardPoolId(), 3);
        assertEq(usdc.balanceOf(address(rewardPoolEscrow)), 4);
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

        (,,,,, uint256 frontendFeeAllocation, uint256 voterClaimedAmount, uint256 frontendClaimedAmount) =
            rewardPoolEscrow.roundSnapshots(rewardPoolId, roundId);
        assertEq(frontendFeeAllocation, 3e6);
        assertEq(voterClaimedAmount, 97e6);
        assertEq(frontendClaimedAmount, 3e6);
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

    function testVotingEngineCanBeUpdatedByConfigRole() public {
        address newEngine = address(0xBEEF);

        vm.prank(owner);
        vm.expectEmit(false, false, false, true);
        emit QuestionRewardPoolEscrow.VotingEngineUpdated(newEngine);
        rewardPoolEscrow.setVotingEngine(newEngine);

        assertEq(address(rewardPoolEscrow.votingEngine()), newEngine);
    }

    function testSetVotingEngineRejectsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("Invalid engine");
        rewardPoolEscrow.setVotingEngine(address(0));
    }

    function testSetVotingEngineRequiresConfigRole() public {
        vm.prank(voter1);
        vm.expectRevert();
        rewardPoolEscrow.setVotingEngine(address(0xBEEF));
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
        assertEq(usdc.balanceOf(delegate1), 1_000e6 + reward);

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

        vm.warp(block.timestamp + EPOCH_DURATION + 1);
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

    function testBundleClaimUsesRoundSpecificVoterIdsAfterMigration() public {
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleId =
            _createSubmissionBundle(contentIds, funder, rewardPoolEscrow.REWARD_ASSET_USDC(), REWARD_POOL_AMOUNT, 3);

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

        assertGt(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, voter2), 0);

        vm.prank(voter2);
        uint256 reward = rewardPoolEscrow.claimQuestionBundleReward(bundleId);

        assertEq(reward, REWARD_POOL_AMOUNT / 3);
        assertEq(usdc.balanceOf(voter2), 1_000e6 + reward);
        assertEq(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, voter2), 0);
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
        uint8 rewardAsset = rewardPoolEscrow.REWARD_ASSET_HREP();
        uint256 bountyClosesAt = block.timestamp + 30 days;

        vm.prank(submitter);
        hrepToken.approve(address(rewardPoolEscrow), REWARD_POOL_AMOUNT);

        vm.prank(address(registry));
        rewardPoolEscrow.createSubmissionBundleFromRegistry(
            bundleId, contentIds, submitter, rewardAsset, REWARD_POOL_AMOUNT, 3, bountyClosesAt, bountyClosesAt
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
        vm.expectRevert("Invalid bounty close");
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

    function testRewardPoolAmountMustCoverMaxVotersForEachRequiredRound() public {
        uint256 contentId = _submitQuestion("");

        vm.startPrank(funder);
        usdc.approve(address(rewardPoolEscrow), 199);
        vm.expectRevert("Amount too small");
        rewardPoolEscrow.createRewardPool(contentId, 199, 3, 1, block.timestamp + 30 days, 0);
        vm.stopPrank();
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
        vm.expectRevert("Reward allocation too small");
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
        bundleId = 1;
        vm.startPrank(bundleFunder);
        if (asset == rewardPoolEscrow.REWARD_ASSET_HREP()) {
            hrepToken.approve(address(rewardPoolEscrow), amount);
        } else {
            usdc.approve(address(rewardPoolEscrow), amount);
        }
        vm.stopPrank();

        uint256 bountyClosesAt = block.timestamp + 30 days;
        vm.prank(address(registry));
        rewardPoolEscrow.createSubmissionBundleFromRegistry(
            bundleId, contentIds, bundleFunder, asset, amount, requiredCompleters, bountyClosesAt, bountyClosesAt
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
        contentId = registry.submitQuestion(contextUrl, imageUrls, "", QUESTION, DESCRIPTION, TAGS, CATEGORY_ID, salt);
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
        contentId = registry.submitQuestionWithRoundConfig(
            "https://example.com/context", imageUrls, "", QUESTION, DESCRIPTION, TAGS, CATEGORY_ID, salt, roundConfig
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
        vm.warp(block.timestamp + EPOCH_DURATION + 1);

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
        vm.warp(round.startTime + EPOCH_DURATION + 1);

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

    function testBundleRefund_ClaimGraceBlocksRaceAtBountyClose() public {
        uint256[] memory contentIds = _submitBundleQuestions();
        uint256 bundleId =
            _createSubmissionBundle(contentIds, funder, rewardPoolEscrow.REWARD_ASSET_USDC(), REWARD_POOL_AMOUNT, 3);

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
        rewardPoolEscrow.claimQuestionBundleReward(bundleId);
        assertGt(rewardPoolEscrow.claimableQuestionBundleReward(bundleId, voter3), 0);

        // Jump past bountyClosesAt (helper sets +30 days).
        vm.warp(block.timestamp + 31 days);
        vm.expectRevert("Claim grace active");
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
        uint256 bundleId =
            _createSubmissionBundle(contentIds, funder, rewardPoolEscrow.REWARD_ASSET_USDC(), REWARD_POOL_AMOUNT, 3);

        uint256 cleanupRoundId = _settleRoundWithOneUnrevealed(contentIds[0]);

        address[] memory voters = new address[](3);
        voters[0] = voter1;
        voters[1] = voter2;
        voters[2] = voter3;
        bool[] memory directions = _directions(true, true, false);
        _settleRoundWith(voters, contentIds[1], directions);

        vm.warp(block.timestamp + 31 days + rewardPoolEscrow.BUNDLE_CLAIM_GRACE() + 1);
        vm.expectRevert("Cleanup pending");
        rewardPoolEscrow.refundQuestionBundleReward(bundleId);

        votingEngine.processUnrevealedVotes(contentIds[0], cleanupRoundId, 0, 0);
        uint256 treasuryBalanceBefore = usdc.balanceOf(treasury);
        uint256 refundAmount = rewardPoolEscrow.refundQuestionBundleReward(bundleId);
        assertGt(refundAmount, 0);
        assertEq(usdc.balanceOf(treasury), treasuryBalanceBefore + refundAmount);
    }
}
