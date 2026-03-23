// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { RewardMath } from "../contracts/libraries/RewardMath.sol";
import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";

/// @title AdversarialTests
/// @notice Pre-deployment adversarial tests covering reward exhaustion, state transition
///         violations, double-claim vectors, cooldown bypass, consensus subsidy draining,
///         and processUnrevealedVotes edge cases.
contract AdversarialTests is VotingTestBase {
    CuryoReputation crepToken;
    ContentRegistry registry;
    RoundVotingEngine engine;
    RoundRewardDistributor distributor;

    address owner = address(0xA);
    address treasury = address(0xB);
    address submitter = address(0xC);
    address voter1 = address(0xD1);
    address voter2 = address(0xD2);
    address voter3 = address(0xD3);
    address voter4 = address(0xD4);
    address voter5 = address(0xD5);
    address attacker = address(0xF1);

    uint256 constant STAKE = 10e6;
    uint256 constant EPOCH_DURATION = 10 minutes;

    function setUp() public {
        vm.warp(1000);
        vm.roll(100);
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

        engine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engineImpl),
                    abi.encodeCall(RoundVotingEngine.initialize, (owner, address(crepToken), address(registry), address(new ProtocolConfig(owner))))
                )
            )
        );

        distributor = RoundRewardDistributor(
            address(
                new ERC1967Proxy(
                    address(distImpl),
                    abi.encodeCall(
                        RoundRewardDistributor.initialize,
                        (owner, address(crepToken), address(engine), address(registry))
                    )
                )
            )
        );

        registry.setVotingEngine(address(engine));
        MockCategoryRegistry mockCategoryRegistry = new MockCategoryRegistry();
        mockCategoryRegistry.seedDefaultTestCategories();
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(engine.protocolConfig())).setRewardDistributor(address(distributor));
        ProtocolConfig(address(engine.protocolConfig())).setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(engine.protocolConfig())).setTreasury(treasury);
        ProtocolConfig(address(engine.protocolConfig())).setConfig(EPOCH_DURATION, 7 days, 2, 200);

        // Fund consensus reserve
        uint256 reserveAmount = 1_000_000e6;
        crepToken.mint(owner, reserveAmount);
        crepToken.approve(address(engine), reserveAmount);
        engine.addToConsensusReserve(reserveAmount);

        // Fund actors
        address[6] memory users = [submitter, voter1, voter2, voter3, voter4, voter5];
        for (uint256 i = 0; i < users.length; i++) {
            crepToken.mint(users[i], 100_000e6);
        }
        crepToken.mint(attacker, 100_000e6);

        vm.stopPrank();
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _submitContent() internal returns (uint256) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/adv", "test", "test", "test", 0);
        vm.stopPrank();
        return 1;
    }

    function _submitContent2() internal returns (uint256) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/adv2", "test", "test", "test", 0);
        vm.stopPrank();
        return 2;
    }

    function _commit(address voter, uint256 contentId, bool isUp, uint256 stake)
        internal
        returns (bytes32 commitKey, bytes32 salt)
    {
        salt = keccak256(abi.encodePacked(voter, block.timestamp, contentId, isUp));
        bytes32 commitHash = _commitHash(isUp, salt, contentId);
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);
        vm.startPrank(voter);
        crepToken.approve(address(engine), stake);
        engine.commitVote(contentId, commitHash, ciphertext, stake, address(0));
        vm.stopPrank();
        commitKey = _commitKey(voter, commitHash);
    }

    function _reveal(uint256 contentId, uint256 roundId, bytes32 commitKey) internal {
        RoundLib.Commit memory c = RoundEngineReadHelpers.commit(engine, contentId, roundId, commitKey);
        if (c.revealed || c.stakeAmount == 0) return;
        bool up = uint8(c.ciphertext[0]) == 1;
        bytes32 s;
        bytes memory ct = c.ciphertext;
        assembly {
            s := mload(add(ct, 33))
        }
        engine.revealVoteByCommitKey(contentId, roundId, commitKey, up, s);
    }

    function _settleRound(uint256 contentId, uint256 roundId, bytes32[] memory commitKeys) internal {
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        // Warp past epoch + reveal grace period so unrevealed votes don't block settlement
        vm.warp(round.startTime + EPOCH_DURATION + ProtocolConfig(address(engine.protocolConfig())).revealGracePeriod() + 1);
        for (uint256 i = 0; i < commitKeys.length; i++) {
            _reveal(contentId, roundId, commitKeys[i]);
        }
        engine.settleRound(contentId, roundId);
    }

    // =========================================================================
    // 1. REWARD EXHAUSTION — sum of all winner claims ≤ winningPool + voterPool
    // =========================================================================

    /// @notice With 4 winners and 1 loser, total claimed must not exceed pool bounds
    function test_RewardExhaustion_MultipleWinners_CantExceedPool() public {
        uint256 contentId = _submitContent();

        // 4 UP voters (winners — total weighted UP = 150e6 > DOWN), 1 DOWN voter (loser)
        (bytes32 ck1,) = _commit(voter1, contentId, true, 50e6);
        (bytes32 ck2,) = _commit(voter2, contentId, true, 40e6);
        (bytes32 ck3,) = _commit(voter3, contentId, true, 30e6);
        (bytes32 ck4,) = _commit(voter4, contentId, true, 30e6);
        (bytes32 ck5,) = _commit(voter5, contentId, false, 80e6); // loser (weighted 80e6 < 150e6 UP)

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        bytes32[] memory cks = new bytes32[](5);
        cks[0] = ck1;
        cks[1] = ck2;
        cks[2] = ck3;
        cks[3] = ck4;
        cks[4] = ck5;
        _settleRound(contentId, roundId, cks);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint8(round.state), uint8(RoundLib.RoundState.Settled));
        assertTrue(round.upWins);

        uint256 voterPool = engine.roundVoterPool(contentId, roundId);
        uint256 winningRawPool = round.upPool; // raw winning stakes

        // Claim all winner rewards
        uint256 totalClaimed;
        address[4] memory winners = [voter1, voter2, voter3, voter4];
        for (uint256 i = 0; i < winners.length; i++) {
            uint256 before = crepToken.balanceOf(winners[i]);
            vm.prank(winners[i]);
            distributor.claimReward(contentId, roundId);
            totalClaimed += crepToken.balanceOf(winners[i]) - before;
        }

        // Total claimed = stake returns + rewards ≤ winningPool + voterPool
        assertLe(totalClaimed, winningRawPool + voterPool, "Claims exceed pool bounds");

        // Additionally: total rewards portion only ≤ voterPool
        uint256 totalStakeReturned = 50e6 + 40e6 + 30e6 + 30e6; // winning stakes
        uint256 rewardOnly = totalClaimed - totalStakeReturned;
        assertLe(rewardOnly, voterPool, "Reward-only portion exceeds voter pool");
    }

    /// @notice Revealed losers get the fixed rebate and do not revert
    function test_RewardExhaustion_LoserGetsRebate() public {
        uint256 contentId = _submitContent();

        // Asymmetric stakes to avoid tie
        (bytes32 ck1,) = _commit(voter1, contentId, true, 15e6);
        (bytes32 ck2,) = _commit(voter2, contentId, false, 10e6);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        bytes32[] memory cks = new bytes32[](2);
        cks[0] = ck1;
        cks[1] = ck2;
        _settleRound(contentId, roundId, cks);

        uint256 balBefore = crepToken.balanceOf(voter2);
        vm.prank(voter2);
        distributor.claimReward(contentId, roundId);
        uint256 balAfter = crepToken.balanceOf(voter2);

        assertEq(balAfter - balBefore, 500_000, "Loser should receive the 5% rebate");
    }

    // =========================================================================
    // 2. DOUBLE-CLAIM VECTORS
    // =========================================================================

    /// @notice Voter cannot claim reward twice
    function test_DoubleClaim_VoterReward_Reverts() public {
        uint256 contentId = _submitContent();

        // Asymmetric stakes to avoid tie
        (bytes32 ck1,) = _commit(voter1, contentId, true, 15e6);
        (bytes32 ck2,) = _commit(voter2, contentId, false, 10e6);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        bytes32[] memory cks = new bytes32[](2);
        cks[0] = ck1;
        cks[1] = ck2;
        _settleRound(contentId, roundId, cks);

        vm.prank(voter1);
        distributor.claimReward(contentId, roundId);

        vm.prank(voter1);
        vm.expectRevert("Already claimed");
        distributor.claimReward(contentId, roundId);
    }

    /// @notice Submitter cannot claim reward twice
    function test_DoubleClaim_SubmitterReward_Reverts() public {
        uint256 contentId = _submitContent();

        // Asymmetric stakes to avoid tie
        (bytes32 ck1,) = _commit(voter1, contentId, true, 15e6);
        (bytes32 ck2,) = _commit(voter2, contentId, false, 10e6);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        bytes32[] memory cks = new bytes32[](2);
        cks[0] = ck1;
        cks[1] = ck2;
        _settleRound(contentId, roundId, cks);

        vm.prank(submitter);
        distributor.claimSubmitterReward(contentId, roundId);

        vm.prank(submitter);
        vm.expectRevert("Already claimed");
        distributor.claimSubmitterReward(contentId, roundId);
    }

    /// @notice Voter cannot claim refund twice on cancelled round
    function test_DoubleClaim_Refund_Reverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        vm.warp(1000 + 7 days + 1);
        engine.cancelExpiredRound(contentId, 1);

        vm.prank(voter1);
        engine.claimCancelledRoundRefund(contentId, 1);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        engine.claimCancelledRoundRefund(contentId, 1);
    }

    /// @notice Voter who committed but was not revealed cannot claim reward (only refund path)
    function test_DoubleClaim_UnrevealedVoterCannotClaimReward() public {
        uint256 contentId = _submitContent();

        // Asymmetric stakes; voter1/voter3 UP, voter2 DOWN — UP wins
        (bytes32 ck1,) = _commit(voter1, contentId, true, 15e6);
        (bytes32 ck2,) = _commit(voter2, contentId, false, 10e6);
        _commit(voter3, contentId, true, STAKE); // not revealed

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        bytes32[] memory cks = new bytes32[](2);
        cks[0] = ck1;
        cks[1] = ck2;
        _settleRound(contentId, roundId, cks);

        // voter3 can't claim reward (not revealed)
        vm.prank(voter3);
        vm.expectRevert("Vote not revealed");
        distributor.claimReward(contentId, roundId);
    }

    // =========================================================================
    // 3. processUnrevealedVotes — DOUBLE PROCESSING
    // =========================================================================

    /// @notice Processing the same index range twice should not double-forfeit
    function test_ProcessUnrevealed_DoubleProcess_NoDoubleForfeit() public {
        uint256 contentId = _submitContent();

        // Asymmetric stakes: UP wins, voter3 unrevealed and epoch passed → forfeited
        (bytes32 ck1,) = _commit(voter1, contentId, true, 15e6);
        (bytes32 ck2,) = _commit(voter2, contentId, false, 10e6);
        _commit(voter3, contentId, true, 50e6); // unrevealed, same epoch

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);

        // Only reveal first two, settle
        bytes32[] memory cks = new bytes32[](2);
        cks[0] = ck1;
        cks[1] = ck2;
        _settleRound(contentId, roundId, cks);

        uint256 treasuryBefore = crepToken.balanceOf(treasury);

        // Process unrevealed (voter3's commit epoch has passed → forfeited to treasury)
        engine.processUnrevealedVotes(contentId, roundId, 0, 0);

        uint256 treasuryAfter1 = crepToken.balanceOf(treasury);
        uint256 forfeitAmount = treasuryAfter1 - treasuryBefore;
        assertGt(forfeitAmount, 0, "Some amount should be forfeited");

        // Process again — same range, reverts because nothing left to process (stakeAmount zeroed)
        vm.expectRevert(RoundVotingEngine.NothingProcessed.selector);
        engine.processUnrevealedVotes(contentId, roundId, 0, 0);
    }

    /// @notice Unrevealed voter from current epoch at settlement should be refunded, not forfeited
    function test_ProcessUnrevealed_CurrentEpochVoter_Refunded() public {
        uint256 contentId = _submitContent();

        // Epoch 1 voters
        (bytes32 ck1,) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2,) = _commit(voter2, contentId, false, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);

        // Reveal epoch 1 voters
        vm.warp(round.startTime + EPOCH_DURATION + 1);
        _reveal(contentId, roundId, ck1);
        _reveal(contentId, roundId, ck2);

        // New voter in epoch 2 (not yet revealable when we settle)
        _commit(voter3, contentId, true, 25e6);

        // Settle immediately (voter3's epoch hasn't ended)
        engine.settleRound(contentId, roundId);

        uint256 voter3Before = crepToken.balanceOf(voter3);

        // Process unrevealed — voter3 should be refunded (epoch not ended at settlement)
        engine.processUnrevealedVotes(contentId, roundId, 0, 0);

        uint256 voter3After = crepToken.balanceOf(voter3);
        assertEq(voter3After - voter3Before, 25e6, "Current-epoch voter should get full refund");
    }

    // =========================================================================
    // 4. STATE TRANSITION VIOLATIONS
    // =========================================================================

    /// @notice Cannot settle an already settled round
    function test_StateTransition_CannotSettleTwice() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1,) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2,) = _commit(voter2, contentId, false, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        bytes32[] memory cks = new bytes32[](2);
        cks[0] = ck1;
        cks[1] = ck2;
        _settleRound(contentId, roundId, cks);

        vm.expectRevert(RoundVotingEngine.RoundNotOpen.selector);
        engine.settleRound(contentId, roundId);
    }

    /// @notice Cannot cancel a settled round
    function test_StateTransition_CannotCancelSettledRound() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1,) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2,) = _commit(voter2, contentId, false, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        bytes32[] memory cks = new bytes32[](2);
        cks[0] = ck1;
        cks[1] = ck2;
        _settleRound(contentId, roundId, cks);

        vm.expectRevert(RoundVotingEngine.RoundNotOpen.selector);
        engine.cancelExpiredRound(contentId, roundId);
    }

    /// @notice Cannot cancel a round that has reached the settlement threshold
    function test_StateTransition_CannotCancelThresholdReachedRound() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1,) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2,) = _commit(voter2, contentId, false, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);

        // Reveal to reach threshold
        vm.warp(round.startTime + EPOCH_DURATION + 1);
        _reveal(contentId, roundId, ck1);
        _reveal(contentId, roundId, ck2);

        // Warp past maxDuration
        vm.warp(round.startTime + 7 days + 1);

        vm.expectRevert(RoundVotingEngine.ThresholdReached.selector);
        engine.cancelExpiredRound(contentId, roundId);
    }

    /// @notice Cannot commit to a cancelled round (new round should be created)
    function test_StateTransition_CommitAfterCancel_CreatesNewRound() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        vm.warp(1000 + 7 days + 1);
        engine.cancelExpiredRound(contentId, 1);

        // Next commit should create round 2
        vm.warp(1000 + 7 days + 1 + 24 hours + 1); // past cooldown
        (bytes32 ck2,) = _commit(voter2, contentId, false, STAKE);
        uint256 newRoundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        assertEq(newRoundId, 2, "Should create new round after cancellation");
        assertTrue(ck2 != bytes32(0));
    }

    /// @notice Cannot claim reward from a cancelled round
    function test_StateTransition_CannotClaimRewardFromCancelledRound() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        vm.warp(1000 + 7 days + 1);
        engine.cancelExpiredRound(contentId, 1);

        vm.prank(voter1);
        vm.expectRevert("Round not settled");
        distributor.claimReward(contentId, 1);
    }

    /// @notice Cannot claim refund from a settled round
    function test_StateTransition_CannotRefundFromSettledRound() public {
        uint256 contentId = _submitContent();

        // Asymmetric stakes to avoid tie
        (bytes32 ck1,) = _commit(voter1, contentId, true, 15e6);
        (bytes32 ck2,) = _commit(voter2, contentId, false, 10e6);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        bytes32[] memory cks = new bytes32[](2);
        cks[0] = ck1;
        cks[1] = ck2;
        _settleRound(contentId, roundId, cks);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.RoundNotCancelledOrTied.selector);
        engine.claimCancelledRoundRefund(contentId, roundId);
    }

    // =========================================================================
    // 5. CONSENSUS SUBSIDY DRAIN
    // =========================================================================

    /// @notice Repeated unanimous rounds cannot drain reserve beyond MAX_CONSENSUS_SUBSIDY per round
    function test_ConsensusSubsidy_CappedPerRound() public {
        uint256 contentId = _submitContent();
        uint256 reserveBefore = engine.consensusReserve();

        // Large unanimous UP round
        (bytes32 ck1,) = _commit(voter1, contentId, true, 100e6);
        (bytes32 ck2,) = _commit(voter2, contentId, true, 100e6);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        bytes32[] memory cks = new bytes32[](2);
        cks[0] = ck1;
        cks[1] = ck2;
        _settleRound(contentId, roundId, cks);

        uint256 reserveAfter = engine.consensusReserve();
        uint256 subsidyUsed = reserveBefore - reserveAfter;

        // 5% of 200e6 = 10e6, but capped at MAX_CONSENSUS_SUBSIDY (50e6)
        assertEq(subsidyUsed, 10e6, "Subsidy should be 5% of total stake");
        assertLe(subsidyUsed, 50e6, "Subsidy must not exceed MAX_CONSENSUS_SUBSIDY");
    }

    /// @notice Empty consensus reserve means unanimous rounds get zero subsidy
    function test_ConsensusSubsidy_EmptyReserve_ZeroSubsidy() public {
        // Deploy fresh setup with zero consensus reserve
        vm.startPrank(owner);
        CuryoReputation token2 = new CuryoReputation(owner, owner);
        token2.grantRole(token2.MINTER_ROLE(), owner);

        ContentRegistry reg2 = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(new ContentRegistry()),
                    abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(token2)))
                )
            )
        );

        RoundVotingEngine eng2 = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(new RoundVotingEngine()),
                    abi.encodeCall(RoundVotingEngine.initialize, (owner, address(token2), address(reg2), address(new ProtocolConfig(owner))))
                )
            )
        );

        RoundRewardDistributor dist2 = RoundRewardDistributor(
            address(
                new ERC1967Proxy(
                    address(new RoundRewardDistributor()),
                    abi.encodeCall(
                        RoundRewardDistributor.initialize, (owner, address(token2), address(eng2), address(reg2))
                    )
                )
            )
        );

        reg2.setVotingEngine(address(eng2));
        MockCategoryRegistry mockCategoryRegistry = new MockCategoryRegistry();
        mockCategoryRegistry.seedDefaultTestCategories();
        reg2.setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(eng2.protocolConfig())).setRewardDistributor(address(dist2));
        ProtocolConfig(address(eng2.protocolConfig())).setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(eng2.protocolConfig())).setTreasury(treasury);
        ProtocolConfig(address(eng2.protocolConfig())).setConfig(EPOCH_DURATION, 7 days, 2, 200);

        // NO fundConsensusReserve — reserve is zero

        token2.mint(submitter, 100_000e6);
        token2.mint(voter1, 100_000e6);
        token2.mint(voter2, 100_000e6);
        vm.stopPrank();

        // Submit content
        vm.startPrank(submitter);
        token2.approve(address(reg2), 10e6);
        _submitContentWithReservation(reg2, "https://example.com/zero", "test", "test", "test", 0);
        vm.stopPrank();

        // Unanimous votes
        bytes32 salt1 = keccak256(abi.encodePacked(voter1, block.timestamp, uint256(1)));
        bytes memory ct1 = _testCiphertext(true, salt1, 1);
        bytes32 ch1 = _commitHash(true, salt1, 1, ct1);

        vm.startPrank(voter1);
        token2.approve(address(eng2), STAKE);
        eng2.commitVote(1, ch1, ct1, STAKE, address(0));
        vm.stopPrank();

        bytes32 salt2 = keccak256(abi.encodePacked(voter2, block.timestamp, uint256(1)));
        bytes memory ct2 = _testCiphertext(true, salt2, 1);
        bytes32 ch2 = _commitHash(true, salt2, 1, ct2);

        vm.startPrank(voter2);
        token2.approve(address(eng2), STAKE);
        eng2.commitVote(1, ch2, ct2, STAKE, address(0));
        vm.stopPrank();

        bytes32 ck1 = _commitKey(voter1, ch1);
        bytes32 ck2 = _commitKey(voter2, ch2);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(eng2, 1, 1);
        vm.warp(round.startTime + EPOCH_DURATION + 1);

        // Reveal
        eng2.revealVoteByCommitKey(1, 1, ck1, true, salt1);
        eng2.revealVoteByCommitKey(1, 1, ck2, true, salt2);

        eng2.settleRound(1, 1);

        // With zero reserve, voter pool and submitter reward should both be 0
        uint256 voterPool = eng2.roundVoterPool(1, 1);
        uint256 subReward = eng2.pendingSubmitterReward(1, 1);
        assertEq(voterPool, 0, "No subsidy means zero voter pool");
        assertEq(subReward, 0, "No subsidy means zero submitter reward");
    }

    // =========================================================================
    // 6. SELF-OPPOSITION (Sybil with 2 addresses)
    // =========================================================================

    /// @notice Attacker voting both sides with equal stakes should not profit
    function test_SelfOpposition_EqualStakes_NeverProfitable() public {
        uint256 contentId = _submitContent();

        // Attacker controls both accounts, stakes equal amount on both sides
        address sybil = address(0xBEEF);
        vm.prank(owner);
        crepToken.mint(sybil, 100_000e6);

        (bytes32 ckAttack,) = _commit(attacker, contentId, true, 50e6);
        (bytes32 ckSybil,) = _commit(sybil, contentId, false, 50e6);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        bytes32[] memory cks = new bytes32[](2);
        cks[0] = ckAttack;
        cks[1] = ckSybil;
        _settleRound(contentId, roundId, cks);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);

        // With equal stakes, it's a tie — no winner
        if (round.state == RoundLib.RoundState.Tied) {
            // Tied: both get refunds only, no profit
            vm.prank(attacker);
            engine.claimCancelledRoundRefund(contentId, roundId);
            vm.prank(sybil);
            engine.claimCancelledRoundRefund(contentId, roundId);

            // Total returned = 100e6 = original stakes, no profit
            return;
        }

        // If settled (shouldn't happen with equal stakes but check anyway):
        uint256 winnerBal = crepToken.balanceOf(round.upWins ? attacker : sybil);
        vm.prank(round.upWins ? attacker : sybil);
        distributor.claimReward(contentId, roundId);
        uint256 winnerGain = crepToken.balanceOf(round.upWins ? attacker : sybil) - winnerBal;

        // Winner gets stake + reward, loser loses stake
        // Net = winnerGain - 50e6 (lost stake) - 50e6 (winner's original stake) = reward - loser stake
        // Due to fees (80% to voters, 20% to protocol), net is always negative
        uint256 totalReturned = winnerGain; // winner's stake + reward
        assertLe(totalReturned, 100e6, "Self-opposition should not be profitable");
    }

    /// @notice Attacker with asymmetric stakes loses more on the losing side
    function test_SelfOpposition_AsymmetricStakes_StillUnprofitable() public {
        uint256 contentId = _submitContent();

        address sybil = address(0xBEEF);
        vm.prank(owner);
        crepToken.mint(sybil, 100_000e6);

        // Third honest voter to prevent tie
        (bytes32 ckHonest,) = _commit(voter1, contentId, true, STAKE);

        // Attacker: big UP, small DOWN
        (bytes32 ckBig,) = _commit(attacker, contentId, true, 80e6);
        (bytes32 ckSmall,) = _commit(sybil, contentId, false, 20e6);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        bytes32[] memory cks = new bytes32[](3);
        cks[0] = ckHonest;
        cks[1] = ckBig;
        cks[2] = ckSmall;
        _settleRound(contentId, roundId, cks);

        // UP wins. Attacker gains from UP side but loses 20e6 from DOWN side
        uint256 attackerBefore = crepToken.balanceOf(attacker);
        uint256 sybilBefore = crepToken.balanceOf(sybil);

        vm.prank(attacker);
        distributor.claimReward(contentId, roundId);
        vm.prank(sybil);
        distributor.claimReward(contentId, roundId); // loser, gets fixed rebate

        uint256 attackerNet = crepToken.balanceOf(attacker) - attackerBefore;
        uint256 sybilNet = crepToken.balanceOf(sybil) - sybilBefore;

        // Total invested: 80e6 + 20e6 = 100e6
        // Total returned: attackerNet + sybilNet
        uint256 totalReturned = attackerNet + sybilNet;
        uint256 totalInvested = 80e6 + 20e6;

        // Attacker's share of the 20e6 losing pool (after 18% fees) < 20e6, so net loss
        assertLe(totalReturned, totalInvested, "Self-opposition should never profit");
    }

    // =========================================================================
    // 7. COOLDOWN BYPASS VIA DELEGATION (regression test for fix 59241a4)
    // =========================================================================

    /// @notice Token-based cooldown prevents same identity from voting twice within cooldown
    /// @dev Simulates delegation by making two addresses share the same tokenId in the mock.
    ///      In production, VoterIdNFT.hasVoterId() and getTokenId() resolve delegates to the
    ///      holder's token. Here we simulate that by directly setting mock storage.
    function test_CooldownBypass_DelegationBlocked() public {
        MockVoterIdNFT voterIdNFT = new MockVoterIdNFT();
        ProtocolConfig cfg = ProtocolConfig(address(engine.protocolConfig()));
        vm.prank(owner);
        cfg.setVoterIdNFT(address(voterIdNFT));

        address holder = address(0xA1);
        address delegate = address(0xA2);

        vm.startPrank(owner);
        crepToken.mint(holder, 100_000e6);
        crepToken.mint(delegate, 100_000e6);
        vm.stopPrank();

        // Mint VoterID to holder → tokenId=1
        voterIdNFT.mint(holder, 12345);

        // Simulate delegate resolving to the same tokenId (as real VoterIdNFT delegation does).
        // MockVoterIdNFT storage: slot 0 = holders, slot 1 = tokenIds
        bytes32 holdersSlot = keccak256(abi.encode(delegate, uint256(0)));
        vm.store(address(voterIdNFT), holdersSlot, bytes32(uint256(1))); // holders[delegate] = true
        bytes32 tokenSlot = keccak256(abi.encode(delegate, uint256(1)));
        vm.store(address(voterIdNFT), tokenSlot, bytes32(uint256(1))); // tokenIds[delegate] = 1 (same as holder)

        uint256 contentId = _submitContent();

        // Holder votes (uses token 1)
        bytes32 salt = keccak256(abi.encodePacked(holder, block.timestamp, contentId));
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = _testCiphertext(true, salt, contentId);
        vm.startPrank(holder);
        crepToken.approve(address(engine), STAKE);
        engine.commitVote(contentId, commitHash, ciphertext, STAKE, address(0));
        vm.stopPrank();

        // Delegate tries to vote immediately on DIFFERENT content (same tokenId → blocked by IdentityAlreadyCommitted
        // is per-round, but cooldown is per-content). For same content, it would be IdentityAlreadyCommitted.
        // For a NEW content item, it should be blocked by per-token cooldown.
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/adv3", "test", "test", "test", 0);
        vm.stopPrank();

        // Delegate tries to vote on SAME content — blocked by CooldownActive (checked before IdentityAlreadyCommitted)
        bytes32 salt3 = keccak256(abi.encodePacked(delegate, block.timestamp, contentId));
        bytes32 commitHash3 = _commitHash(false, salt3, contentId);
        bytes memory ciphertext3 = _testCiphertext(false, salt3, contentId);
        vm.startPrank(delegate);
        crepToken.approve(address(engine), STAKE);
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        engine.commitVote(contentId, commitHash3, ciphertext3, STAKE, address(0));
        vm.stopPrank();
    }

    /// @notice Per-token cooldown blocks same identity on same content across rounds
    function test_CooldownBypass_SameTokenAcrossRounds() public {
        MockVoterIdNFT voterIdNFT = new MockVoterIdNFT();
        ProtocolConfig cfg = ProtocolConfig(address(engine.protocolConfig()));
        vm.prank(owner);
        cfg.setVoterIdNFT(address(voterIdNFT));

        address holder = address(0xA1);
        address delegate = address(0xA2);

        vm.startPrank(owner);
        crepToken.mint(holder, 100_000e6);
        crepToken.mint(delegate, 100_000e6);
        vm.stopPrank();

        voterIdNFT.mint(holder, 12345); // tokenId=1
        // voter1 and voter2 need VoterIDs too (different tokens)
        voterIdNFT.mint(voter1, 11111); // tokenId=2
        voterIdNFT.mint(voter2, 22222); // tokenId=3

        // Make delegate resolve to same tokenId=1
        bytes32 holdersSlot = keccak256(abi.encode(delegate, uint256(0)));
        vm.store(address(voterIdNFT), holdersSlot, bytes32(uint256(1)));
        bytes32 tokenSlot = keccak256(abi.encode(delegate, uint256(1)));
        vm.store(address(voterIdNFT), tokenSlot, bytes32(uint256(1)));

        uint256 contentId = _submitContent();

        // Holder votes on round 1 (along with 2 others for settlement)
        (bytes32 ckH,) = _commit(holder, contentId, true, 15e6);
        (bytes32 ck1,) = _commit(voter1, contentId, true, 15e6);
        (bytes32 ck2,) = _commit(voter2, contentId, false, 10e6);

        // Settle round 1 quickly (after epoch 1)
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        bytes32[] memory cks = new bytes32[](3);
        cks[0] = ckH;
        cks[1] = ck1;
        cks[2] = ck2;
        _settleRound(contentId, roundId, cks);

        // Now within 24h of holder's vote, delegate tries to vote on round 2 (same content)
        // The holder voted at t=1000. _settleRound warped to startTime+EPOCH+1 ≈ 1601.
        // Cooldown = 24h = 86400s. We're at ~1601, cooldown expires at ~87400.
        // So delegate should be blocked.
        bytes32 salt2 = keccak256(abi.encodePacked(delegate, block.timestamp, contentId, false));
        bytes32 commitHash2 = _commitHash(false, salt2, contentId);
        bytes memory ciphertext2 = _testCiphertext(false, salt2, contentId);
        vm.startPrank(delegate);
        crepToken.approve(address(engine), STAKE);
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        engine.commitVote(contentId, commitHash2, ciphertext2, STAKE, address(0));
        vm.stopPrank();
    }

    // =========================================================================
    // 8. TIED ROUND — FULL REFUND
    // =========================================================================

    /// @notice In a tied round, every voter gets their full stake back
    function test_TiedRound_FullRefundForAll() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1,) = _commit(voter1, contentId, true, 50e6);
        (bytes32 ck2,) = _commit(voter2, contentId, false, 50e6);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        bytes32[] memory cks = new bytes32[](2);
        cks[0] = ck1;
        cks[1] = ck2;

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        vm.warp(round.startTime + EPOCH_DURATION + 1);
        _reveal(contentId, roundId, ck1);
        _reveal(contentId, roundId, ck2);

        // Both in epoch 1, same stake — weighted pools are equal → tie
        engine.settleRound(contentId, roundId);

        round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint8(round.state), uint8(RoundLib.RoundState.Tied));

        uint256 v1Before = crepToken.balanceOf(voter1);
        uint256 v2Before = crepToken.balanceOf(voter2);

        vm.prank(voter1);
        engine.claimCancelledRoundRefund(contentId, roundId);
        vm.prank(voter2);
        engine.claimCancelledRoundRefund(contentId, roundId);

        assertEq(crepToken.balanceOf(voter1) - v1Before, 50e6, "Voter1 full refund");
        assertEq(crepToken.balanceOf(voter2) - v2Before, 50e6, "Voter2 full refund");
    }

    // =========================================================================
    // 9. EPOCH WEIGHT REWARD RATIO — early voters get more
    // =========================================================================

    /// @notice Epoch-1 voter earns ~4× more per cREP staked than epoch-2 voter
    function test_EpochWeight_EarlyVoterEarns4x() public {
        uint256 contentId = _submitContent();

        // Epoch 1: voter1 UP (large stake to ensure UP wins), voter2 DOWN (loser provides pool)
        // Weighted UP epoch1: 100e6, Weighted DOWN epoch1: 10e6. UP wins.
        (bytes32 ck1,) = _commit(voter1, contentId, true, 100e6);
        (bytes32 ck2,) = _commit(voter2, contentId, false, 10e6); // loser

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);

        // Wait for epoch 1 to end
        vm.warp(round.startTime + EPOCH_DURATION + 1);
        _reveal(contentId, roundId, ck1);
        _reveal(contentId, roundId, ck2);

        // Epoch 2: voter3 also votes UP with same stake as voter1
        (bytes32 ck3,) = _commit(voter3, contentId, true, 100e6);

        // Wait for epoch 2 to end, reveal voter3
        vm.warp(round.startTime + 2 * EPOCH_DURATION + 1);
        _reveal(contentId, roundId, ck3);

        // Settle
        engine.settleRound(contentId, roundId);

        // Claim rewards
        uint256 v1Before = crepToken.balanceOf(voter1);
        uint256 v3Before = crepToken.balanceOf(voter3);

        vm.prank(voter1);
        distributor.claimReward(contentId, roundId);
        vm.prank(voter3);
        distributor.claimReward(contentId, roundId);

        // Both staked 100e6, subtract stake return to get reward-only
        uint256 v1Reward = crepToken.balanceOf(voter1) - v1Before - 100e6;
        uint256 v3Reward = crepToken.balanceOf(voter3) - v3Before - 100e6;

        // Epoch 1 weight = 10000 (100%), epoch 2 weight = 2500 (25%)
        // With same stake: v1Reward / v3Reward ≈ 4
        // Allow some tolerance for rounding
        assertGt(v1Reward, v3Reward * 3, "Epoch-1 voter should earn >3x epoch-2 voter");
        assertLt(v1Reward, v3Reward * 5, "Epoch-1 voter should earn <5x epoch-2 voter");
    }

    // =========================================================================
    // 10. REVEAL TIMING — cannot reveal before epoch ends
    // =========================================================================

    /// @notice Revealing before epoch end reverts
    function test_RevealTiming_BeforeEpoch_Reverts() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, block.timestamp, contentId, true));
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = _testCiphertext(true, salt, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(engine), STAKE);
        engine.commitVote(contentId, commitHash, ciphertext, STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        bytes32 commitKey = _commitKey(voter1, commitHash);

        // Try to reveal immediately (before epoch end)
        vm.expectRevert(RoundVotingEngine.EpochNotEnded.selector);
        engine.revealVoteByCommitKey(contentId, roundId, commitKey, true, salt);
    }

    /// @notice Cannot reveal with wrong salt (commit hash mismatch)
    function test_RevealTiming_WrongSalt_Reverts() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, block.timestamp, contentId, true));
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = _testCiphertext(true, salt, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(engine), STAKE);
        engine.commitVote(contentId, commitHash, ciphertext, STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        bytes32 commitKey = _commitKey(voter1, commitHash);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        vm.warp(round.startTime + EPOCH_DURATION + 1);

        bytes32 wrongSalt = keccak256("wrong");
        vm.expectRevert(RoundVotingEngine.HashMismatch.selector);
        engine.revealVoteByCommitKey(contentId, roundId, commitKey, true, wrongSalt);
    }

    /// @notice Cannot reveal with wrong direction
    function test_RevealTiming_WrongDirection_Reverts() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, block.timestamp, contentId, true));
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = _testCiphertext(true, salt, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(engine), STAKE);
        engine.commitVote(contentId, commitHash, ciphertext, STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        bytes32 commitKey = _commitKey(voter1, commitHash);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        vm.warp(round.startTime + EPOCH_DURATION + 1);

        vm.expectRevert(RoundVotingEngine.HashMismatch.selector);
        engine.revealVoteByCommitKey(contentId, roundId, commitKey, false, salt); // wrong direction
    }

    // =========================================================================
    // 11. ENGINE BALANCE SOLVENCY — after full cycle engine holds ≥ obligations
    // =========================================================================

    /// @notice After settle + all claims, engine balance ≥ consensus reserve + keeper pool
    function test_Solvency_AfterFullCycle() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1,) = _commit(voter1, contentId, true, 50e6);
        (bytes32 ck2,) = _commit(voter2, contentId, false, 30e6);
        (bytes32 ck3,) = _commit(voter3, contentId, true, 20e6);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        bytes32[] memory cks = new bytes32[](3);
        cks[0] = ck1;
        cks[1] = ck2;
        cks[2] = ck3;
        _settleRound(contentId, roundId, cks);

        // Claim all
        vm.prank(voter1);
        distributor.claimReward(contentId, roundId);
        vm.prank(voter3);
        distributor.claimReward(contentId, roundId);
        vm.prank(voter2);
        distributor.claimReward(contentId, roundId); // loser, gets fixed rebate
        vm.prank(submitter);
        distributor.claimSubmitterReward(contentId, roundId);

        // Process unrevealed (none in this case — reverts to prevent no-op keeper reward drain)
        vm.expectRevert(RoundVotingEngine.NothingProcessed.selector);
        engine.processUnrevealedVotes(contentId, roundId, 0, 0);

        uint256 engineBalance = crepToken.balanceOf(address(engine));
        uint256 obligations = engine.consensusReserve();

        assertGe(engineBalance, obligations, "Engine insolvent after full cycle");
    }

    // =========================================================================
    // 12. SUBMITTER SELF-VOTE PREVENTION
    // =========================================================================

    /// @notice Submitter cannot vote on their own content
    function test_SelfVote_SubmitterBlocked() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(submitter, block.timestamp, contentId, true));
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = _testCiphertext(true, salt, contentId);

        vm.startPrank(submitter);
        crepToken.approve(address(engine), STAKE);
        vm.expectRevert(RoundVotingEngine.SelfVote.selector);
        engine.commitVote(contentId, commitHash, ciphertext, STAKE, address(0));
        vm.stopPrank();
    }

    // =========================================================================
    // 13. STAKE BOUNDS
    // =========================================================================

    /// @notice Stake below MIN_STAKE reverts
    function test_StakeBounds_BelowMin_Reverts() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, block.timestamp, contentId));
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = _testCiphertext(true, salt, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(engine), 1); // tiny amount
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        engine.commitVote(contentId, commitHash, ciphertext, 1, address(0));
        vm.stopPrank();
    }

    /// @notice Stake above MAX_STAKE reverts
    function test_StakeBounds_AboveMax_Reverts() public {
        uint256 contentId = _submitContent();

        uint256 tooMuch = 200e6 + 1; // MAX_STAKE = 200e6
        bytes32 salt = keccak256(abi.encodePacked(voter1, block.timestamp, contentId));
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = _testCiphertext(true, salt, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(engine), tooMuch);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        engine.commitVote(contentId, commitHash, ciphertext, tooMuch, address(0));
        vm.stopPrank();
    }

    // =========================================================================
    // 14. REWARD MATH — splitPool sums to input
    // =========================================================================

    /// @notice All pool split components sum exactly to the input losingPool
    function test_RewardMath_SplitPool_SumsToInput() public pure {
        uint256[5] memory inputs = [uint256(100e6), 1e6, 1, 999_999e6, 10_000_000e6];

        for (uint256 i = 0; i < inputs.length; i++) {
            (uint256 v, uint256 s, uint256 p, uint256 t, uint256 c) = RewardMath.splitPool(inputs[i]);
            assertEq(v + s + p + t + c, inputs[i], "Split must sum to input");
        }
    }

    /// @notice calculateVoterReward: sum of all voter rewards ≤ voterPool (fuzz)
    function testFuzz_RewardMath_VoterRewards_DontExceedPool(
        uint256 stake1,
        uint256 stake2,
        uint256 stake3,
        uint256 losingPool
    ) public pure {
        stake1 = bound(stake1, 1e6, 100e6);
        stake2 = bound(stake2, 1e6, 100e6);
        stake3 = bound(stake3, 1e6, 100e6);
        losingPool = bound(losingPool, 1e6, 1_000_000e6);

        (uint256 voterPool,,,,) = RewardMath.splitPool(losingPool);

        // All three are winners with epoch-1 weight (10000 BPS)
        uint256 eff1 = stake1; // weight 100% → same as stake
        uint256 eff2 = stake2;
        uint256 eff3 = stake3;
        uint256 totalWeighted = eff1 + eff2 + eff3;

        uint256 r1 = RewardMath.calculateVoterReward(eff1, totalWeighted, voterPool);
        uint256 r2 = RewardMath.calculateVoterReward(eff2, totalWeighted, voterPool);
        uint256 r3 = RewardMath.calculateVoterReward(eff3, totalWeighted, voterPool);

        assertLe(r1 + r2 + r3, voterPool, "Sum of rewards must not exceed voter pool");
    }
}
