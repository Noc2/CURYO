// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";
import { MockERC20 } from "../contracts/mocks/MockERC20.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { QuestionRewardPoolEscrow } from "../contracts/QuestionRewardPoolEscrow.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";

contract QuestionRewardPoolEscrowTest is VotingTestBase {
    CuryoReputation public crepToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    RoundRewardDistributor public rewardDistributor;
    FrontendRegistry public frontendRegistry;
    QuestionRewardPoolEscrow public rewardPoolEscrow;
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

        crepToken = new CuryoReputation(owner, owner);
        crepToken.grantRole(crepToken.MINTER_ROLE(), owner);

        ContentRegistry registryImpl = new ContentRegistry();
        RoundVotingEngine engineImpl = new RoundVotingEngine();
        RoundRewardDistributor distImpl = new RoundRewardDistributor();
        FrontendRegistry frontendRegistryImpl = new FrontendRegistry();
        QuestionRewardPoolEscrow rewardPoolImpl = new QuestionRewardPoolEscrow();

        ProtocolConfig protocolConfig = _deployProtocolConfig(owner);
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
                        (owner, address(crepToken), address(registry), address(protocolConfig))
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

        usdc = new MockERC20("USD Coin", "USDC", 6);
        voterIdNFT = new MockVoterIdNFT();
        frontendRegistry = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(frontendRegistryImpl),
                    abi.encodeCall(FrontendRegistry.initialize, (owner, owner, address(crepToken)))
                )
            )
        );
        rewardPoolEscrow = QuestionRewardPoolEscrow(
            address(
                new ERC1967Proxy(
                    address(rewardPoolImpl),
                    abi.encodeCall(
                        QuestionRewardPoolEscrow.initialize,
                        (owner, address(usdc), address(registry), address(votingEngine), address(voterIdNFT))
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
        crepToken.mint(owner, reserveAmount);
        crepToken.approve(address(votingEngine), reserveAmount);
        votingEngine.addToConsensusReserve(reserveAmount);

        address[7] memory humans = [submitter, funder, voter1, voter2, voter3, voter4, frontend1];
        for (uint256 i = 0; i < humans.length; i++) {
            voterIdNFT.setHolder(humans[i]);
            crepToken.mint(humans[i], 10_000e6);
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
        vm.expectRevert("Reward pool expired");
        rewardPoolEscrow.claimQuestionReward(rewardPoolId, secondRoundId);

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

        vm.prank(voter1);
        vm.expectRevert("Earlier round qualifies");
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

        vm.prank(voter1);
        uint256 reward = rewardPoolEscrow.claimQuestionReward(rewardPoolId, eligibleRoundId);
        assertEq(reward, REWARD_POOL_AMOUNT / 3);
    }

    function testInactiveNoExpiryPoolCanRefundUnallocatedFunds() public {
        uint256 contentId = _submitQuestion("");
        uint256 rewardPoolId = _createRewardPool(contentId, REWARD_POOL_AMOUNT, 3, 1);

        vm.prank(submitter);
        registry.cancelContent(contentId);

        uint256 funderBalanceBefore = usdc.balanceOf(funder);
        uint256 refundAmount = rewardPoolEscrow.refundInactiveRewardPool(rewardPoolId);

        assertEq(refundAmount, REWARD_POOL_AMOUNT);
        assertEq(usdc.balanceOf(funder), funderBalanceBefore + REWARD_POOL_AMOUNT);
    }

    function testRewardPoolAmountMustCoverEachRequiredRound() public {
        uint256 contentId = _submitQuestion("");

        vm.startPrank(funder);
        usdc.approve(address(rewardPoolEscrow), 1);
        vm.expectRevert("Amount too small");
        rewardPoolEscrow.createRewardPool(contentId, 1, 3, 2, 0);
        vm.stopPrank();
    }

    function _submitQuestion(string memory url) internal returns (uint256 contentId) {
        string memory mediaUrl = bytes(url).length == 0 ? DEFAULT_MEDIA_URL : url;
        string[] memory imageUrls = new string[](1);
        imageUrls[0] = mediaUrl;
        activeTlockContentRegistry = registry;
        bytes32 salt =
            keccak256(abi.encode(mediaUrl, QUESTION, DESCRIPTION, TAGS, CATEGORY_ID, submitter, block.timestamp));
        (, bytes32 submissionKey) =
            registry.previewQuestionMediaSubmissionKey(imageUrls, "", QUESTION, DESCRIPTION, TAGS, CATEGORY_ID);
        bytes32 revealCommitment =
            keccak256(abi.encode(submissionKey, QUESTION, DESCRIPTION, TAGS, CATEGORY_ID, salt, submitter));

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.reserveSubmission(revealCommitment);
        vm.warp(block.timestamp + 1);
        contentId = registry.submitQuestionWithMedia(imageUrls, "", QUESTION, DESCRIPTION, TAGS, CATEGORY_ID, salt);
        vm.stopPrank();
    }

    function _createRewardPool(uint256 contentId, uint256 amount, uint256 requiredVoters, uint256 requiredSettledRounds)
        internal
        returns (uint256 rewardPoolId)
    {
        return _createRewardPoolWithExpiry(contentId, amount, requiredVoters, requiredSettledRounds, 0);
    }

    function _createRewardPoolWithExpiry(
        uint256 contentId,
        uint256 amount,
        uint256 requiredVoters,
        uint256 requiredSettledRounds,
        uint256 expiresAt
    ) internal returns (uint256 rewardPoolId) {
        vm.startPrank(funder);
        usdc.approve(address(rewardPoolEscrow), amount);
        rewardPoolId =
            rewardPoolEscrow.createRewardPool(contentId, amount, requiredVoters, requiredSettledRounds, expiresAt);
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
                    crepToken: crepToken,
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

    function _registerFrontend(address frontend) internal {
        vm.startPrank(frontend);
        crepToken.approve(address(frontendRegistry), frontendRegistry.STAKE_AMOUNT());
        frontendRegistry.register();
        vm.stopPrank();
    }

    function _threeVoters() internal view returns (address[] memory voters) {
        voters = new address[](3);
        voters[0] = voter1;
        voters[1] = voter2;
        voters[2] = voter3;
    }

    function _directions(bool a, bool b, bool c) internal pure returns (bool[] memory directions) {
        directions = new bool[](3);
        directions[0] = a;
        directions[1] = b;
        directions[2] = c;
    }
}
