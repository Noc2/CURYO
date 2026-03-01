// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { IFrontendRegistry } from "../contracts/interfaces/IFrontendRegistry.sol";

/// @title Round-based integration tests for public voting with random settlement.
/// @dev Covers: full lifecycle, multi-voter, concurrent rounds, tied rounds,
///      cancelled/expired rounds, consensus settlement, config snapshots.
contract RoundIntegrationTest is Test {
    CuryoReputation public crepToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    RoundRewardDistributor public rewardDistributor;

    address public owner = address(1);
    address public submitter = address(2);
    address public voter1 = address(3);
    address public voter2 = address(4);
    address public voter3 = address(5);
    address public voter4 = address(6);
    address public voter5 = address(7);
    address public voter6 = address(8);
    address public treasury = address(100);

    uint256 public constant STAKE = 5e6; // 5 cREP

    function setUp() public {
        // Set a predictable start time and block
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
        votingEngine.setRewardDistributor(address(rewardDistributor));
        votingEngine.setTreasury(treasury);

        // setConfig(minEpochBlocks, maxEpochBlocks, maxDuration, minVoters, maxVoters,
        //           baseRateBps, growthRateBps, maxProbBps, liquidityParam)
        votingEngine.setConfig(10, 50, 7 days, 2, 200, 30, 3, 500, 1000e6);

        // Fund consensus reserve
        uint256 reserveAmount = 1_000_000e6;
        crepToken.mint(owner, reserveAmount);
        crepToken.approve(address(votingEngine), reserveAmount);
        votingEngine.fundConsensusReserve(reserveAmount);

        // Mint cREP to all test users
        address[7] memory users = [submitter, voter1, voter2, voter3, voter4, voter5, voter6];
        for (uint256 i = 0; i < users.length; i++) {
            crepToken.mint(users[i], 10_000e6);
        }

        vm.stopPrank();
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _submitContent() internal returns (uint256 contentId) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "test goal", "test", 0);
        vm.stopPrank();
        contentId = 1;
    }

    /// @dev Submit content with a unique URL suffix to avoid duplicate-URL conflicts.
    function _submitContentN(uint256 n) internal returns (uint256 contentId) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        string memory url = string(abi.encodePacked("https://example.com/", vm.toString(n)));
        registry.submitContent(url, "test goal", "test", 0);
        vm.stopPrank();
        contentId = n;
    }

    function _vote(address voter, uint256 contentId, bool isUp, uint256 stakeAmount) internal {
        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), stakeAmount);
        votingEngine.vote(contentId, isUp, stakeAmount, address(0));
        vm.stopPrank();
    }

    /// @dev Roll past maxEpochBlocks (50 + 1 = 51 blocks) and call trySettle.
    function _forceSettle(uint256 contentId) internal {
        vm.roll(block.number + 51);
        votingEngine.trySettle(contentId);
    }

    // =========================================================================
    // 1. FULL ROUND LIFECYCLE — submit → vote(s) → trySettle → claim reward
    // =========================================================================

    function test_FullRoundLifecycle_UpWins() public {
        uint256 contentId = _submitContent();

        // Two UP voters, one DOWN voter (UP wins by majority stake)
        _vote(voter1, contentId, true, STAKE);
        _vote(voter2, contentId, true, STAKE);
        _vote(voter3, contentId, false, STAKE);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        assertEq(roundId, 1, "Round 1 should be active");

        // Verify round state
        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(round.voteCount, 3, "Should have 3 votes");
        assertEq(round.totalUpStake, 2 * STAKE, "UP stake should be 2x");
        assertEq(round.totalDownStake, STAKE, "DOWN stake should be 1x");
        assertEq(round.upCount, 2, "UP count should be 2");
        assertEq(round.downCount, 1, "DOWN count should be 1");

        // Force settlement
        _forceSettle(contentId);

        round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled), "Round should be settled");
        assertTrue(round.upWins, "UP should win");

        // Winner claims reward
        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        assertGt(crepToken.balanceOf(voter1), balBefore, "Winner should receive reward");

        // Loser claims nothing
        uint256 loserBal = crepToken.balanceOf(voter3);
        vm.prank(voter3);
        rewardDistributor.claimReward(contentId, roundId);
        assertEq(crepToken.balanceOf(voter3), loserBal, "Loser should receive nothing");
    }

    // =========================================================================
    // 2. MULTIPLE VOTERS — UP wins and DOWN wins
    // =========================================================================

    function test_MultipleVoters_DownWins() public {
        uint256 contentId = _submitContent();

        // One UP voter, two DOWN voters (DOWN wins by majority stake)
        _vote(voter1, contentId, true, STAKE);
        _vote(voter2, contentId, false, STAKE);
        _vote(voter3, contentId, false, STAKE);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        _forceSettle(contentId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled), "Round should be settled");
        assertFalse(round.upWins, "DOWN should win");

        // DOWN voter (winner) claims reward
        uint256 balBefore = crepToken.balanceOf(voter2);
        vm.prank(voter2);
        rewardDistributor.claimReward(contentId, roundId);
        assertGt(crepToken.balanceOf(voter2), balBefore, "DOWN winner should receive reward");

        // UP voter (loser) gets nothing
        uint256 upBal = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        assertEq(crepToken.balanceOf(voter1), upBal, "UP loser should receive nothing");
    }

    function test_MultipleVoters_BothWinnersClaimProportionally() public {
        uint256 contentId = _submitContent();

        // Two UP voters with different stakes, one DOWN voter
        _vote(voter1, contentId, true, 10e6);
        _vote(voter2, contentId, true, 5e6);
        _vote(voter3, contentId, false, STAKE);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        _forceSettle(contentId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertTrue(round.upWins, "UP should win");

        // Both winners claim
        uint256 bal1Before = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        uint256 reward1 = crepToken.balanceOf(voter1) - bal1Before;

        uint256 bal2Before = crepToken.balanceOf(voter2);
        vm.prank(voter2);
        rewardDistributor.claimReward(contentId, roundId);
        uint256 reward2 = crepToken.balanceOf(voter2) - bal2Before;

        // Both should get rewards; voter1 staked more and was first (more shares), so should get more
        assertGt(reward1, 0, "Voter1 should receive reward");
        assertGt(reward2, 0, "Voter2 should receive reward");
        assertGt(reward1, reward2, "Voter1 (larger stake, first voter) should receive more");
    }

    // =========================================================================
    // 3. CONCURRENT ROUNDS ON DIFFERENT CONTENT
    // =========================================================================

    function test_ConcurrentRoundsOnDifferentContent() public {
        uint256 contentId1 = _submitContentN(1);
        uint256 contentId2 = _submitContentN(2);

        // Vote on content 1
        _vote(voter1, contentId1, true, STAKE);
        _vote(voter2, contentId1, false, STAKE);

        // Vote on content 2
        _vote(voter3, contentId2, true, STAKE);
        _vote(voter4, contentId2, false, STAKE);

        uint256 round1 = votingEngine.getActiveRoundId(contentId1);
        uint256 round2 = votingEngine.getActiveRoundId(contentId2);
        assertEq(round1, 1, "Content 1 should have round 1");
        assertEq(round2, 1, "Content 2 should have round 1");

        // Settle content 1 — content 2 should remain open
        _forceSettle(contentId1);

        RoundLib.Round memory r1 = votingEngine.getRound(contentId1, round1);
        assertEq(uint256(r1.state), uint256(RoundLib.RoundState.Tied), "Content 1 round should be tied (equal stakes)");

        // Content 2 is still open (its startBlock is the same, but it also gets settled
        // since we rolled 51 blocks total from its start)
        // We need to call trySettle for content 2 separately
        votingEngine.trySettle(contentId2);

        RoundLib.Round memory r2 = votingEngine.getRound(contentId2, round2);
        assertEq(uint256(r2.state), uint256(RoundLib.RoundState.Tied), "Content 2 round should be tied");
    }

    function test_ConcurrentRoundsSettleIndependently() public {
        uint256 contentId1 = _submitContentN(1);

        // Vote on content 1 first
        _vote(voter1, contentId1, true, STAKE);
        _vote(voter2, contentId1, false, STAKE);
        _vote(voter3, contentId1, true, STAKE);

        // Roll a few blocks, then submit content 2
        vm.roll(block.number + 5);
        uint256 contentId2 = _submitContentN(2);
        _vote(voter4, contentId2, true, STAKE);
        _vote(voter5, contentId2, false, STAKE);

        // Roll enough to settle content 1 but not necessarily content 2
        // Content 1 started at block 100, needs 51 more = block 151
        // Content 2 started at block 105, needs 51 more = block 156
        vm.roll(100 + 51);
        votingEngine.trySettle(contentId1);

        RoundLib.Round memory r1 = votingEngine.getRound(contentId1, 1);
        assertEq(uint256(r1.state), uint256(RoundLib.RoundState.Settled), "Content 1 should be settled");
        assertTrue(r1.upWins, "UP should win content 1");

        // Content 2 should still be open (started 5 blocks later)
        RoundLib.Round memory r2 = votingEngine.getRound(contentId2, 1);
        assertEq(uint256(r2.state), uint256(RoundLib.RoundState.Open), "Content 2 should still be open");

        // Settle content 2
        vm.roll(105 + 51);
        votingEngine.trySettle(contentId2);
        r2 = votingEngine.getRound(contentId2, 1);
        assertEq(uint256(r2.state), uint256(RoundLib.RoundState.Tied), "Content 2 should be tied");
    }

    // =========================================================================
    // 4. SAME VOTER VOTES ON MULTIPLE CONTENT ITEMS
    // =========================================================================

    function test_SameVoterVotesOnMultipleContent() public {
        uint256 contentId1 = _submitContentN(1);
        uint256 contentId2 = _submitContentN(2);

        // voter1 votes UP on content 1 and DOWN on content 2
        _vote(voter1, contentId1, true, STAKE);
        _vote(voter2, contentId1, false, STAKE);

        _vote(voter1, contentId2, false, STAKE);
        _vote(voter3, contentId2, true, STAKE);

        // Verify votes are correctly recorded
        assertTrue(votingEngine.hasVoted(contentId1, 1, voter1), "Voter1 should have voted on content 1");
        assertTrue(votingEngine.hasVoted(contentId2, 1, voter1), "Voter1 should have voted on content 2");

        RoundLib.Vote memory v1 = votingEngine.getVote(contentId1, 1, voter1);
        assertTrue(v1.isUp, "Voter1 voted UP on content 1");

        RoundLib.Vote memory v2 = votingEngine.getVote(contentId2, 1, voter1);
        assertFalse(v2.isUp, "Voter1 voted DOWN on content 2");

        // Settle both and verify independent outcomes
        _forceSettle(contentId1);
        votingEngine.trySettle(contentId2);

        RoundLib.Round memory r1 = votingEngine.getRound(contentId1, 1);
        RoundLib.Round memory r2 = votingEngine.getRound(contentId2, 1);
        assertEq(uint256(r1.state), uint256(RoundLib.RoundState.Tied), "Content 1 should be tied");
        assertEq(uint256(r2.state), uint256(RoundLib.RoundState.Tied), "Content 2 should be tied");
    }

    // =========================================================================
    // 5. CANCEL EXPIRED ROUND + REFUND CLAIMS
    // =========================================================================

    function test_CancelExpiredRound_Refund() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true, STAKE);
        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Cannot cancel before expiry
        vm.expectRevert(RoundVotingEngine.RoundNotExpired.selector);
        votingEngine.cancelExpiredRound(contentId, roundId);

        // Warp past maxDuration (7 days)
        vm.warp(block.timestamp + 8 days);
        votingEngine.cancelExpiredRound(contentId, roundId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Cancelled), "Round should be cancelled");

        // Voter claims refund
        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crepToken.balanceOf(voter1) - balBefore, STAKE, "Voter should get full refund");
    }

    function test_CancelExpiredRound_MultipleVotersRefund() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true, STAKE);
        _vote(voter2, contentId, false, STAKE);
        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + 8 days);
        votingEngine.cancelExpiredRound(contentId, roundId);

        // Both voters claim refunds
        uint256 bal1Before = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crepToken.balanceOf(voter1) - bal1Before, STAKE, "Voter1 should get full refund");

        uint256 bal2Before = crepToken.balanceOf(voter2);
        vm.prank(voter2);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crepToken.balanceOf(voter2) - bal2Before, STAKE, "Voter2 should get full refund");
    }

    function test_CancelExpiredRound_DoubleRefundReverts() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true, STAKE);
        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + 8 days);
        votingEngine.cancelExpiredRound(contentId, roundId);

        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
    }

    function test_CancelExpiredRound_NewRoundAfterCancellation() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true, STAKE);
        uint256 round1Id = votingEngine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + 8 days);
        votingEngine.cancelExpiredRound(contentId, round1Id);
        assertEq(uint256(votingEngine.getRound(contentId, round1Id).state), uint256(RoundLib.RoundState.Cancelled));

        // New vote creates round 2
        vm.warp(block.timestamp + 25 hours); // past cooldown
        _vote(voter2, contentId, false, STAKE);
        assertEq(votingEngine.getActiveRoundId(contentId), 2, "New round should be created");
    }

    // =========================================================================
    // 6. TIED ROUND (equal UP/DOWN stakes)
    // =========================================================================

    function test_TiedRound_EqualStakes() public {
        uint256 contentId = _submitContent();

        // Equal UP and DOWN stakes
        _vote(voter1, contentId, true, STAKE);
        _vote(voter2, contentId, false, STAKE);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        _forceSettle(contentId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied), "Round should be tied");
    }

    function test_TiedRound_RefundClaims() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true, STAKE);
        _vote(voter2, contentId, false, STAKE);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        _forceSettle(contentId);

        // Both voters can claim refunds from tied round
        uint256 bal1Before = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crepToken.balanceOf(voter1) - bal1Before, STAKE, "Voter1 should get refund from tie");

        uint256 bal2Before = crepToken.balanceOf(voter2);
        vm.prank(voter2);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crepToken.balanceOf(voter2) - bal2Before, STAKE, "Voter2 should get refund from tie");
    }

    function test_TiedRound_NewRoundAfterTie() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true, STAKE);
        _vote(voter2, contentId, false, STAKE);

        _forceSettle(contentId);

        assertEq(votingEngine.getActiveRoundId(contentId), 0, "No active round after tie");

        // New vote creates round 2
        vm.warp(block.timestamp + 25 hours); // past cooldown
        _vote(voter3, contentId, true, STAKE);
        assertEq(votingEngine.getActiveRoundId(contentId), 2, "Round 2 should be created");
    }

    // =========================================================================
    // 7. CONSENSUS SETTLEMENT (one-sided voting past maxEpochBlocks)
    // =========================================================================

    function test_ConsensusSettlement_OnlyUpVoters() public {
        uint256 contentId = _submitContent();

        // Only UP voters, no DOWN
        _vote(voter1, contentId, true, STAKE);
        _vote(voter2, contentId, true, STAKE);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Before maxEpochBlocks — should not settle
        vm.roll(block.number + 20); // only 20 blocks, not past maxEpochBlocks=50
        votingEngine.trySettle(contentId);
        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Open), "Should still be open before maxEpochBlocks");

        // Past maxEpochBlocks — consensus settlement triggers
        vm.roll(block.number + 31); // total: 20+31=51 blocks from start
        uint256 reserveBefore = votingEngine.consensusReserve();
        votingEngine.trySettle(contentId);

        round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled), "Should be settled by consensus");
        assertTrue(round.upWins, "UP should win by consensus");

        // Consensus reserve should have decreased (subsidy paid out)
        assertLt(votingEngine.consensusReserve(), reserveBefore, "Consensus reserve should decrease");

        // Winner can claim consensus subsidy reward
        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        assertGt(crepToken.balanceOf(voter1), balBefore, "Consensus winner should receive subsidy reward");
    }

    function test_ConsensusSettlement_OnlyDownVoters() public {
        uint256 contentId = _submitContent();

        // Only DOWN voters, no UP
        _vote(voter1, contentId, false, STAKE);
        _vote(voter2, contentId, false, STAKE);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Past maxEpochBlocks
        vm.roll(block.number + 51);
        votingEngine.trySettle(contentId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled), "Should be settled by consensus");
        assertFalse(round.upWins, "DOWN should win by consensus");
    }

    // =========================================================================
    // ROUND ADVANCEMENT — new round after settlement
    // =========================================================================

    function test_VoteAfterSettlementCreatesNewRound() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true, STAKE);
        _vote(voter2, contentId, true, STAKE);
        _vote(voter3, contentId, false, STAKE);

        uint256 round1Id = votingEngine.getActiveRoundId(contentId);
        assertEq(round1Id, 1);

        _forceSettle(contentId);
        assertEq(votingEngine.getActiveRoundId(contentId), 0, "No active round after settlement");

        // New vote after cooldown creates round 2
        vm.warp(block.timestamp + 25 hours);
        _vote(voter4, contentId, false, STAKE);
        assertEq(votingEngine.getActiveRoundId(contentId), 2, "Round 2 should be created");
    }

    // =========================================================================
    // DOUBLE VOTE PREVENTION
    // =========================================================================

    function test_CannotDoubleVoteInSameRound() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true, STAKE);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        // Same voter, same round — AlreadyVoted or CooldownActive
        vm.expectRevert();
        votingEngine.vote(contentId, false, STAKE, address(0));
        vm.stopPrank();
    }

    // =========================================================================
    // 24-HOUR COOLDOWN
    // =========================================================================

    function test_CooldownPreventsQuickRevote() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true, STAKE);
        _vote(voter2, contentId, false, STAKE);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        _forceSettle(contentId);

        // Try immediately — cooldown active
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        votingEngine.vote(contentId, true, STAKE, address(0));
        vm.stopPrank();

        // After 25 hours — succeeds
        vm.warp(block.timestamp + 25 hours);
        _vote(voter1, contentId, true, STAKE);
        assertEq(votingEngine.getActiveRoundId(contentId), 2, "New round should be created");
    }

    // =========================================================================
    // CONSENSUS SUBSIDY
    // =========================================================================

    function test_UnanimousRoundPaysConsensusSubsidy() public {
        uint256 contentId = _submitContent();

        // All voters same direction
        _vote(voter1, contentId, true, STAKE);
        _vote(voter2, contentId, true, STAKE);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        uint256 reserveBefore = votingEngine.consensusReserve();

        // Need to go past maxEpochBlocks for one-sided settlement
        vm.roll(block.number + 51);
        votingEngine.trySettle(contentId);

        assertLt(votingEngine.consensusReserve(), reserveBefore, "Reserve should decrease for consensus subsidy");

        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        assertGt(crepToken.balanceOf(voter1), balBefore, "Voter should receive consensus subsidy");
    }

    // =========================================================================
    // CONFIG SNAPSHOT PER-ROUND
    // =========================================================================

    function test_ConfigSnapshotPerRound() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true, STAKE);
        _vote(voter2, contentId, true, STAKE);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Verify snapshot matches config at creation
        RoundLib.RoundConfig memory cfg = votingEngine.getRoundConfig(contentId, roundId);
        assertEq(cfg.minEpochBlocks, 10);
        assertEq(cfg.maxEpochBlocks, 50);
        assertEq(cfg.minVoters, 2);

        // Change config: increase minVoters to 10
        vm.prank(owner);
        votingEngine.setConfig(10, 50, 7 days, 10, 200, 30, 3, 500, 1000e6);

        // Snapshot unchanged
        cfg = votingEngine.getRoundConfig(contentId, roundId);
        assertEq(cfg.minVoters, 2, "Snapshot should still have minVoters=2");

        // Settlement with snapshotted config still works (minVoters=2, we have 2 voters)
        vm.roll(block.number + 51);
        votingEngine.trySettle(contentId);

        assertEq(
            uint256(votingEngine.getRound(contentId, roundId).state),
            uint256(RoundLib.RoundState.Settled),
            "Should settle with snapshotted config"
        );
    }

    // =========================================================================
    // ROUND STATE TRACKING
    // =========================================================================

    function test_HasVotedTracking() public {
        uint256 contentId = _submitContent();

        assertFalse(votingEngine.hasVoted(contentId, 1, voter1), "Should not have voted yet");

        _vote(voter1, contentId, true, STAKE);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        assertTrue(votingEngine.hasVoted(contentId, roundId, voter1), "Should have voted");
        assertFalse(votingEngine.hasVoted(contentId, roundId, voter2), "Voter2 should not have voted");
    }

    function test_VoteCountTracking() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true, STAKE);
        assertEq(votingEngine.getContentVoteCount(contentId), 1, "Content vote count should be 1");

        _vote(voter2, contentId, false, STAKE);
        assertEq(votingEngine.getContentVoteCount(contentId), 2, "Content vote count should be 2");
    }

    function test_RoundVoterCount() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true, STAKE);
        _vote(voter2, contentId, false, STAKE);
        _vote(voter3, contentId, true, STAKE);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        assertEq(votingEngine.getRoundVoterCount(contentId, roundId), 3, "Should have 3 voters");

        // Verify voter addresses
        assertEq(votingEngine.getRoundVoter(contentId, roundId, 0), voter1);
        assertEq(votingEngine.getRoundVoter(contentId, roundId, 1), voter2);
        assertEq(votingEngine.getRoundVoter(contentId, roundId, 2), voter3);
    }

    // =========================================================================
    // STAKE VALIDATION
    // =========================================================================

    function test_InvalidStakeRejected() public {
        uint256 contentId = _submitContent();

        // Below minimum (1 cREP)
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), 0.5e6);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        votingEngine.vote(contentId, true, 0.5e6, address(0));
        vm.stopPrank();

        // Above maximum (100 cREP)
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), 101e6);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        votingEngine.vote(contentId, true, 101e6, address(0));
        vm.stopPrank();
    }

    // =========================================================================
    // BONDING CURVE SHARES
    // =========================================================================

    function test_EarlyVoterGetsMoreShares() public {
        uint256 contentId = _submitContent();

        // First UP voter gets maximum shares (sameDirectionStake = 0)
        _vote(voter1, contentId, true, STAKE);

        RoundLib.Vote memory v1 = votingEngine.getVote(contentId, 1, voter1);

        // Second UP voter gets fewer shares (sameDirectionStake = STAKE already)
        _vote(voter2, contentId, true, STAKE);

        RoundLib.Vote memory v2 = votingEngine.getVote(contentId, 1, voter2);

        assertGt(v1.shares, v2.shares, "First voter should get more shares than second voter");
    }

    function test_ContrarianVoterGetsFullShares() public {
        uint256 contentId = _submitContent();

        // Two UP voters first
        _vote(voter1, contentId, true, STAKE);
        _vote(voter2, contentId, true, STAKE);

        // First DOWN voter gets maximum shares for DOWN direction (sameDirectionStake = 0)
        _vote(voter3, contentId, false, STAKE);

        RoundLib.Vote memory v3 = votingEngine.getVote(contentId, 1, voter3);

        // shares = stake * b / (0 + b) = stake
        assertEq(v3.shares, STAKE, "First contrarian voter should get full shares");
    }

    // =========================================================================
    // SETTLEMENT PROBABILITY
    // =========================================================================

    function test_SettlementProbabilityIncreasesOverTime() public {
        uint256 contentId = _submitContent();

        // Votes placed at block 100 (from setUp). Round startBlock = 100.
        _vote(voter1, contentId, true, STAKE);
        _vote(voter2, contentId, false, STAKE);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Before minEpochBlocks — probability is 0
        uint256 prob0 = votingEngine.getSettlementProbability(contentId, roundId);
        assertEq(prob0, 0, "Probability should be 0 before minEpochBlocks");

        // At minEpochBlocks (block 110) — probability equals baseRateBps
        vm.roll(110);
        uint256 probMin = votingEngine.getSettlementProbability(contentId, roundId);
        assertEq(probMin, 30, "Probability should equal baseRateBps at minEpochBlocks");

        // After minEpochBlocks (block 120) — probability increases
        // elapsed=20, window=10, prob=30+10*3=60
        vm.roll(120);
        uint256 probLater = votingEngine.getSettlementProbability(contentId, roundId);
        assertGt(probLater, probMin, "Probability should increase after minEpochBlocks");

        // At/after maxEpochBlocks (block 150) — probability is 10000 (100%)
        vm.roll(150);
        uint256 probMax = votingEngine.getSettlementProbability(contentId, roundId);
        assertEq(probMax, 10000, "Probability should be 10000 at maxEpochBlocks");
    }

    // =========================================================================
    // SETTLEMENT VIA vote() — auto-settle on subsequent vote
    // =========================================================================

    function test_VoteTriggersPriorSettlement() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true, STAKE);
        _vote(voter2, contentId, false, STAKE);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Roll past maxEpochBlocks so settlement is guaranteed
        vm.roll(block.number + 51);
        vm.warp(block.timestamp + 25 hours); // past cooldown

        // voter3's vote should trigger settlement of the prior round and start a new one
        _vote(voter3, contentId, true, STAKE);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        // The round should have been settled (tied since equal stakes)
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied), "Prior round should be auto-settled");

        // voter3's vote should have created round 2
        uint256 newRoundId = votingEngine.getActiveRoundId(contentId);
        assertEq(newRoundId, 2, "New round should be created");
    }

    // =========================================================================
    // TRY-CATCH SETTLEMENT RESILIENCE
    // =========================================================================

    function test_SettlementSucceedsWithoutParticipationPool() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true, STAKE);
        _vote(voter2, contentId, true, STAKE);
        _vote(voter3, contentId, false, STAKE);

        _forceSettle(contentId);

        uint256 roundId = 1;
        assertEq(
            uint256(votingEngine.getRound(contentId, roundId).state),
            uint256(RoundLib.RoundState.Settled),
            "Settlement should succeed without participation pool"
        );
    }

    // =========================================================================
    // O(1) SETTLEMENT — FRONTEND FEE CLAIMING
    // =========================================================================

    /// @dev Helper to set up a FrontendRegistry wired to the voting engine.
    function _setupFrontendRegistry() internal returns (FrontendRegistry frontendReg, address frontendOp) {
        vm.startPrank(owner);
        FrontendRegistry frontendRegistryImpl = new FrontendRegistry();
        frontendReg = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(frontendRegistryImpl),
                    abi.encodeCall(FrontendRegistry.initialize, (owner, owner, address(crepToken)))
                )
            )
        );
        votingEngine.setFrontendRegistry(address(frontendReg));
        frontendReg.addFeeCreditor(address(votingEngine));

        frontendOp = address(200);
        crepToken.mint(frontendOp, 2000e6);
        vm.stopPrank();

        vm.startPrank(frontendOp);
        crepToken.approve(address(frontendReg), 1000e6);
        frontendReg.register();
        vm.stopPrank();

        vm.prank(owner);
        frontendReg.approveFrontend(frontendOp);
    }

    /// @dev Helper: vote 3 voters (2 up, 1 down) with a specific frontend and settle.
    function _settleRoundWithFrontend(address frontend) internal returns (uint256 contentId, uint256 roundId) {
        contentId = _submitContent();

        // 2 votes up (via frontend), 1 vote down -> upPool > downPool, no tie
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.vote(contentId, true, STAKE, frontend);
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.vote(contentId, true, STAKE, frontend);
        vm.stopPrank();

        vm.startPrank(voter3);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.vote(contentId, false, STAKE, frontend);
        vm.stopPrank();

        roundId = 1;
        _forceSettle(contentId);
    }

    function test_ClaimFrontendFee_HappyPath() public {
        (, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        // Frontend pool should be set
        uint256 frontendPool = votingEngine.getRoundFrontendPool(contentId, roundId);
        assertGt(frontendPool, 0, "Frontend pool should be > 0");

        // Claim frontend fee
        votingEngine.claimFrontendFee(contentId, roundId, frontendOp);

        // Verify fee was credited
        assertTrue(votingEngine.isFrontendFeeClaimed(contentId, roundId, frontendOp));
    }

    function test_ClaimFrontendFee_DoubleClaimReverts() public {
        (, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        // First claim succeeds
        votingEngine.claimFrontendFee(contentId, roundId, frontendOp);

        // Second claim reverts
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        votingEngine.claimFrontendFee(contentId, roundId, frontendOp);
    }

    function test_ClaimFrontendFee_NoApprovedFrontendRedirectsToVoterPool() public {
        // No frontend registry set — 3 voters (2 up, 1 down) to avoid tie
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true, STAKE);
        _vote(voter2, contentId, true, STAKE);
        _vote(voter3, contentId, false, STAKE);

        uint256 roundId = 1;
        _forceSettle(contentId);

        // No frontend pool — redirected to voter pool
        assertEq(votingEngine.getRoundFrontendPool(contentId, roundId), 0);

        // Voter pool should include the frontend share
        uint256 voterPool = votingEngine.roundVoterPool(contentId, roundId);
        assertGt(voterPool, 0);
    }

    // =========================================================================
    // O(1) SETTLEMENT — PARTICIPATION REWARD CLAIMING
    // =========================================================================

    /// @dev Helper: set up ParticipationPool and settle a round (3 voters: 2 up, 1 down)
    function _settleRoundWithParticipation() internal returns (uint256 contentId, uint256 roundId) {
        vm.startPrank(owner);
        ParticipationPool pool = new ParticipationPool(address(crepToken), owner);
        pool.setAuthorizedCaller(address(votingEngine), true);
        crepToken.mint(owner, 1_000_000e6);
        crepToken.approve(address(pool), 1_000_000e6);
        pool.depositPool(1_000_000e6);
        votingEngine.setParticipationPool(address(pool));
        vm.stopPrank();

        contentId = _submitContent();

        _vote(voter1, contentId, true, STAKE);
        _vote(voter2, contentId, true, STAKE);
        _vote(voter3, contentId, false, STAKE);

        roundId = 1;
        _forceSettle(contentId);
    }

    function test_ClaimParticipationReward_HappyPath() public {
        (uint256 contentId, uint256 roundId) = _settleRoundWithParticipation();

        // Rate should be snapshotted
        uint256 rate = votingEngine.getRoundParticipationRateBps(contentId, roundId);
        assertEq(rate, 9000, "Rate should be 90% (tier 0)");

        // Claim participation reward
        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        votingEngine.claimParticipationReward(contentId, roundId);
        uint256 balAfter = crepToken.balanceOf(voter1);

        uint256 expectedReward = STAKE * 9000 / 10000;
        assertEq(balAfter - balBefore, expectedReward, "Should receive 90% of stake as participation reward");
        assertTrue(votingEngine.isParticipationRewardClaimed(contentId, roundId, voter1));
    }

    function test_ClaimParticipationReward_DoubleClaimReverts() public {
        (uint256 contentId, uint256 roundId) = _settleRoundWithParticipation();

        vm.prank(voter1);
        votingEngine.claimParticipationReward(contentId, roundId);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        votingEngine.claimParticipationReward(contentId, roundId);
    }

    function test_ClaimParticipationReward_OnlySettledRounds() public {
        vm.startPrank(owner);
        ParticipationPool pool = new ParticipationPool(address(crepToken), owner);
        pool.setAuthorizedCaller(address(votingEngine), true);
        crepToken.mint(owner, 1_000_000e6);
        crepToken.approve(address(pool), 1_000_000e6);
        pool.depositPool(1_000_000e6);
        votingEngine.setParticipationPool(address(pool));
        vm.stopPrank();

        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true, STAKE);

        // Round is Open, not Settled
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.RoundNotSettled.selector);
        votingEngine.claimParticipationReward(contentId, 1);
    }

    // =========================================================================
    // SET PARTICIPATION POOL UPDATABILITY
    // =========================================================================

    function test_SetParticipationPoolCanBeUpdated() public {
        address pool1 = address(0xAA);
        address pool2 = address(0xBB);

        vm.startPrank(owner);
        votingEngine.setParticipationPool(pool1);
        // Should NOT revert on second call
        votingEngine.setParticipationPool(pool2);
        vm.stopPrank();
    }

    function test_SetParticipationPoolContentRegistryCanBeUpdated() public {
        address pool1 = address(0xAA);
        address pool2 = address(0xBB);

        vm.startPrank(owner);
        registry.setParticipationPool(pool1);
        // Should NOT revert on second call
        registry.setParticipationPool(pool2);
        vm.stopPrank();
    }
}
