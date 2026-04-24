// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { HumanReputation } from "../contracts/HumanReputation.sol";
import { FeedbackBonusEscrow } from "../contracts/FeedbackBonusEscrow.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { IFrontendRegistry } from "../contracts/interfaces/IFrontendRegistry.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";
import { MockERC20 } from "../contracts/mocks/MockERC20.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { QuestionRewardPoolEscrow } from "../contracts/QuestionRewardPoolEscrow.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";

contract SlashedFrontendRegistryMock is IFrontendRegistry {
    address public immutable frontend;

    constructor(address frontend_) {
        frontend = frontend_;
    }

    function STAKE_AMOUNT() external pure returns (uint256) {
        return 1;
    }

    function isEligible(address frontend_) external view returns (bool) {
        return frontend_ == frontend;
    }

    function creditFees(address, uint256) external { }

    function getAccumulatedFees(address) external pure returns (uint256 hrepFees) {
        return 0;
    }

    function getFrontendInfo(address frontend_)
        external
        view
        returns (address operator, uint256 stakedAmount, bool eligible, bool slashed)
    {
        if (frontend_ == frontend) {
            return (frontend, 1, true, true);
        }
        return (address(0), 0, false, false);
    }
}

contract FeedbackBonusEscrowTest is VotingTestBase {
    HumanReputation public hrepToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    RoundRewardDistributor public rewardDistributor;
    FrontendRegistry public frontendRegistry;
    QuestionRewardPoolEscrow public questionRewardPoolEscrow;
    FeedbackBonusEscrow public feedbackBonusEscrow;
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
    address public frontend1 = address(9);
    address public treasury = address(100);

    uint256 public constant STAKE = 5e6;
    uint256 public constant EPOCH_DURATION = 10 minutes;
    uint256 public constant BONUS_AMOUNT = 100e6;
    bytes32 public constant FEEDBACK_HASH = keccak256("curyo-feedback-v1:test");

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
        QuestionRewardPoolEscrow questionRewardPoolImpl = new QuestionRewardPoolEscrow();
        FeedbackBonusEscrow feedbackBonusImpl = new FeedbackBonusEscrow();

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
        questionRewardPoolEscrow = QuestionRewardPoolEscrow(
            address(
                new ERC1967Proxy(
                    address(questionRewardPoolImpl),
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
        feedbackBonusEscrow = FeedbackBonusEscrow(
            address(
                new ERC1967Proxy(
                    address(feedbackBonusImpl),
                    abi.encodeCall(
                        FeedbackBonusEscrow.initialize,
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
        registry.setQuestionRewardPoolEscrow(address(questionRewardPoolEscrow));

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

        vm.stopPrank();
    }

    function testVotingEngineCanBeUpdatedByConfigRole() public {
        address newEngine = address(0xBEEF);

        vm.prank(owner);
        vm.expectEmit(false, false, false, true);
        emit FeedbackBonusEscrow.VotingEngineUpdated(newEngine);
        feedbackBonusEscrow.setVotingEngine(newEngine);

        assertEq(address(feedbackBonusEscrow.votingEngine()), newEngine);
    }

    function testSetVotingEngineRejectsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert("Invalid engine");
        feedbackBonusEscrow.setVotingEngine(address(0));
    }

    function testSetVotingEngineRequiresConfigRole() public {
        vm.prank(voter1);
        vm.expectRevert();
        feedbackBonusEscrow.setVotingEngine(address(0xBEEF));
    }

    function testAwardPaysRevealedVoterAndVoteAttributedFrontend() public {
        _registerFrontend(frontend1);
        uint256 contentId = _submitQuestion("");
        uint256 poolId = _createFeedbackBonusPool(contentId);
        uint256 roundId = _settleRoundWithFrontend(_threeVoters(), contentId, _directions(true, true, false), frontend1);

        vm.prank(funder);
        uint256 recipientAmount = feedbackBonusEscrow.awardFeedbackBonus(poolId, voter1, FEEDBACK_HASH, 10e6);

        assertEq(roundId, 1);
        assertEq(recipientAmount, 9_700_000);
        assertEq(usdc.balanceOf(voter1), 1_009_700_000);
        assertEq(usdc.balanceOf(frontend1), 1_000_300_000);
        (,,,,,,,,,,,, uint256 remainingAmount,,) = feedbackBonusEscrow.feedbackBonusPools(poolId);
        assertEq(remainingAmount, 90e6);
    }

    function testAwardFallsBackToVoterWhenFrontendWasNotEligibleAtCommit() public {
        uint256 contentId = _submitQuestion("");
        uint256 poolId = _createFeedbackBonusPool(contentId);
        _settleRoundWithFrontend(_threeVoters(), contentId, _directions(true, true, false), frontend1);
        _registerFrontend(frontend1);

        vm.prank(funder);
        uint256 recipientAmount = feedbackBonusEscrow.awardFeedbackBonus(poolId, voter1, FEEDBACK_HASH, 10e6);

        assertEq(recipientAmount, 10e6);
        assertEq(usdc.balanceOf(voter1), 1_010e6);
        assertEq(usdc.balanceOf(frontend1), 1_000e6);
    }

    function testAwardFallsBackToVoterWhenSnapshotFrontendIsSlashed() public {
        SlashedFrontendRegistryMock slashedFrontendRegistry = new SlashedFrontendRegistryMock(frontend1);
        vm.prank(owner);
        protocolConfig.setFrontendRegistry(address(slashedFrontendRegistry));

        uint256 contentId = _submitQuestion("");
        uint256 poolId = _createFeedbackBonusPool(contentId);
        _settleRoundWithFrontend(_threeVoters(), contentId, _directions(true, true, false), frontend1);

        vm.prank(funder);
        uint256 recipientAmount = feedbackBonusEscrow.awardFeedbackBonus(poolId, voter1, FEEDBACK_HASH, 10e6);

        assertEq(recipientAmount, 10e6);
        assertEq(usdc.balanceOf(voter1), 1_010e6);
        assertEq(usdc.balanceOf(frontend1), 1_000e6);
    }

    function testFunderCannotReceiveFeedbackBonus() public {
        uint256 contentId = _submitQuestion("");
        uint256 poolId = _createFeedbackBonusPool(contentId);

        address[] memory voters = new address[](4);
        voters[0] = funder;
        voters[1] = voter1;
        voters[2] = voter2;
        voters[3] = voter3;
        _settleRoundWith(voters, contentId, _directions(true, true, true, false));

        vm.prank(funder);
        vm.expectRevert("Excluded voter");
        feedbackBonusEscrow.awardFeedbackBonus(poolId, funder, FEEDBACK_HASH, 10e6);
    }

    function testAwardRequiresRevealedVote() public {
        uint256 contentId = _submitQuestion("");
        uint256 poolId = _createFeedbackBonusPool(contentId);
        _settleRoundWith(_threeVoters(), contentId, _directions(true, true, false));

        vm.prank(funder);
        vm.expectRevert("No commit");
        feedbackBonusEscrow.awardFeedbackBonus(poolId, voter4, FEEDBACK_HASH, 10e6);
    }

    function testCannotAwardSameVoterOrFeedbackHashTwice() public {
        uint256 contentId = _submitQuestion("");
        uint256 poolId = _createFeedbackBonusPool(contentId);
        _settleRoundWith(_threeVoters(), contentId, _directions(true, true, false));

        vm.startPrank(funder);
        feedbackBonusEscrow.awardFeedbackBonus(poolId, voter1, FEEDBACK_HASH, 10e6);
        vm.expectRevert("Voter already awarded");
        feedbackBonusEscrow.awardFeedbackBonus(poolId, voter1, keccak256("second-feedback"), 10e6);
        vm.expectRevert("Feedback already awarded");
        feedbackBonusEscrow.awardFeedbackBonus(poolId, voter2, FEEDBACK_HASH, 10e6);
        vm.stopPrank();
    }

    function testExpiredRemainderForfeitsToTreasury() public {
        uint256 contentId = _submitQuestion("");
        uint256 poolId = _createFeedbackBonusPool(contentId);
        _settleRoundWith(_threeVoters(), contentId, _directions(true, true, false));

        vm.prank(funder);
        feedbackBonusEscrow.awardFeedbackBonus(poolId, voter1, FEEDBACK_HASH, 10e6);

        vm.warp(block.timestamp + 8 days);
        uint256 treasuryBalanceBefore = usdc.balanceOf(treasury);
        uint256 forfeitedAmount = feedbackBonusEscrow.forfeitExpiredFeedbackBonus(poolId);

        assertEq(forfeitedAmount, 90e6);
        assertEq(usdc.balanceOf(treasury), treasuryBalanceBefore + 90e6);
        (,,,,,,,,,,,, uint256 remainingAmount, bool forfeited,) = feedbackBonusEscrow.feedbackBonusPools(poolId);
        assertEq(remainingAmount, 0);
        assertTrue(forfeited);
    }

    function testAwarderOnlyCanAward() public {
        uint256 contentId = _submitQuestion("");
        uint256 poolId = _createFeedbackBonusPool(contentId);
        _settleRoundWith(_threeVoters(), contentId, _directions(true, true, false));

        vm.prank(voter2);
        vm.expectRevert("Only awarder");
        feedbackBonusEscrow.awardFeedbackBonus(poolId, voter1, FEEDBACK_HASH, 10e6);
    }

    function _submitQuestion(string memory url) internal returns (uint256 contentId) {
        string memory mediaUrl = bytes(url).length == 0 ? DEFAULT_MEDIA_URL : url;
        string[] memory imageUrls = new string[](1);
        imageUrls[0] = mediaUrl;
        activeTlockContentRegistry = registry;
        bytes32 salt =
            keccak256(abi.encode(mediaUrl, QUESTION, DESCRIPTION, TAGS, CATEGORY_ID, submitter, block.timestamp));

        vm.startPrank(submitter);
        _reserveQuestionMediaSubmission(
            registry,
            "https://example.com/context",
            imageUrls,
            "",
            QUESTION,
            DESCRIPTION,
            TAGS,
            CATEGORY_ID,
            salt,
            submitter
        );
        vm.warp(block.timestamp + 1);
        contentId = registry.submitQuestion(
            "https://example.com/context", imageUrls, "", QUESTION, DESCRIPTION, TAGS, CATEGORY_ID, salt
        );
        vm.stopPrank();
    }

    function _createFeedbackBonusPool(uint256 contentId) internal returns (uint256 poolId) {
        vm.startPrank(funder);
        usdc.approve(address(feedbackBonusEscrow), BONUS_AMOUNT);
        poolId =
            feedbackBonusEscrow.createFeedbackBonusPool(contentId, 1, BONUS_AMOUNT, block.timestamp + 7 days, funder);
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

    function _registerFrontend(address frontend) internal {
        vm.startPrank(frontend);
        hrepToken.approve(address(frontendRegistry), frontendRegistry.STAKE_AMOUNT());
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

    function _directions(bool a, bool b, bool c, bool d) internal pure returns (bool[] memory directions) {
        directions = new bool[](4);
        directions[0] = a;
        directions[1] = b;
        directions[2] = c;
        directions[3] = d;
    }
}
