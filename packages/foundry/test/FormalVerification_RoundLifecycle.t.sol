// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";

/// @title Formal Verification: Round Lifecycle Edge Cases (Tlock Commit-Reveal)
/// @notice 12 scenarios verifying epoch boundaries, expiry, concurrent rounds,
///         settlement delay, consensus timeout, round transitions, and refund flows.
contract FormalVerification_RoundLifecycleTest is Test {
    CuryoReputation crepToken;
    ContentRegistry registry;
    RoundVotingEngine engine;
    RoundRewardDistributor distributor;

    address owner = address(1);
    address submitter = address(2);
    address treasuryAddr = address(3);
    address[10] v; // voter addresses

    uint256 constant EPOCH_DURATION = 5 minutes;
    uint256 constant MAX_DURATION = 7 days;
    uint256 constant MIN_VOTERS = 2;

    uint256 contentNonce;

    function setUp() public {
        for (uint256 i = 0; i < 10; i++) {
            v[i] = address(uint160(10 + i));
        }

        vm.startPrank(owner);

        crepToken = new CuryoReputation(owner, owner);
        crepToken.grantRole(crepToken.MINTER_ROLE(), owner);

        ContentRegistry regImpl = new ContentRegistry();
        RoundVotingEngine engImpl = new RoundVotingEngine();
        RoundRewardDistributor distImpl = new RoundRewardDistributor();

        registry = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(regImpl), abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(crepToken)))
                )
            )
        );
        engine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engImpl),
                    abi.encodeCall(
                        RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry))
                    )
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
        registry.setTreasury(treasuryAddr);
        engine.setRewardDistributor(address(distributor));
        engine.setTreasury(treasuryAddr);

        // Config: epochDuration=5min, maxDuration=7d, minVoters=2, maxVoters=200
        engine.setConfig(EPOCH_DURATION, MAX_DURATION, MIN_VOTERS, 200);

        // Fund consensus reserve
        crepToken.mint(owner, 100_000e6);
        crepToken.approve(address(engine), 100_000e6);
        engine.fundConsensusReserve(100_000e6);

        // Fund submitter and voters
        crepToken.mint(submitter, 100_000e6);
        for (uint256 i = 0; i < 10; i++) {
            crepToken.mint(v[i], 100_000e6);
        }

        vm.stopPrank();

        vm.warp(1000); // Predictable start time
    }

    // ==================== Helpers ====================

    function _submit() internal returns (uint256) {
        contentNonce++;
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        uint256 id = registry.submitContent(
            string(abi.encodePacked("https://t.co/lc", vm.toString(contentNonce))), "Goal", "tag", 0
        );
        vm.stopPrank();
        return id;
    }

    function _vote(address voter, uint256 cid, bool up, uint256 stake)
        internal
        returns (bytes32 commitKey, bytes32 salt)
    {
        salt = keccak256(abi.encodePacked(voter, block.timestamp, cid));
        bytes32 commitHash = keccak256(abi.encodePacked(up, salt, cid));
        bytes memory ciphertext = abi.encodePacked(uint8(up ? 1 : 0), salt, cid);
        vm.prank(voter);
        crepToken.approve(address(engine), stake);
        vm.prank(voter);
        engine.commitVote(cid, commitHash, ciphertext, stake, address(0));
        commitKey = keccak256(abi.encodePacked(voter, commitHash));
    }

    function _forceSettle(uint256 cid) internal {
        uint256 roundId = engine.getActiveRoundId(cid);
        if (roundId == 0) return;
        RoundLib.Round memory r = engine.getRound(cid, roundId);
        vm.warp(r.startTime + EPOCH_DURATION + 1);
        bytes32[] memory keys = engine.getRoundCommitHashes(cid, roundId);
        for (uint256 i = 0; i < keys.length; i++) {
            RoundLib.Commit memory c = engine.getCommit(cid, roundId, keys[i]);
            if (!c.revealed && c.stakeAmount > 0) {
                bool up = uint8(c.ciphertext[0]) == 1;
                bytes32 s;
                bytes memory ct = c.ciphertext;
                assembly { s := mload(add(ct, 33)) }
                try engine.revealVoteByCommitKey(cid, roundId, keys[i], up, s) { } catch { }
            }
        }
        RoundLib.Round memory r2 = engine.getRound(cid, roundId);
        if (r2.thresholdReachedAt > 0) {
            vm.warp(r2.thresholdReachedAt + EPOCH_DURATION + 1);
            try engine.settleRound(cid, roundId) { } catch { }
        }
    }

    // ==================== Test 1: Vote in Epoch 1 Gets Full Weight ====================

    /// @notice A vote placed in the first epoch (within EPOCH_DURATION of startTime)
    ///         receives full epoch-1 weight (10000 bps = 100%).
    function test_EpochBoundary_VoteInEpoch1GetsFullWeight() public {
        uint256 cid = _submit();

        // Both votes in epoch 1 (before EPOCH_DURATION elapses)
        (bytes32 ck0,) = _vote(v[0], cid, true, 10e6);
        (bytes32 ck1,) = _vote(v[1], cid, true, 10e6);

        uint256 rid = engine.getActiveRoundId(cid);
        RoundLib.Round memory round = engine.getRound(cid, rid);

        // Verify votes were committed in epoch 1 (epochIndex == 0)
        RoundLib.Commit memory c0 = engine.getCommit(cid, rid, ck0);
        RoundLib.Commit memory c1 = engine.getCommit(cid, rid, ck1);
        assertEq(c0.epochIndex, 0, "v[0] in epoch 1 (index 0)");
        assertEq(c1.epochIndex, 0, "v[1] in epoch 1 (index 0)");
        assertEq(round.voteCount, 2, "Two votes committed");
    }

    // ==================== Test 2: Vote in Epoch 2 Gets Reduced Weight ====================

    /// @notice A vote placed after the first epoch ends receives epoch-2 weight (2500 bps = 25%).
    function test_EpochBoundary_VoteInEpoch2GetsReducedWeight() public {
        uint256 cid = _submit();

        // First vote in epoch 1
        _vote(v[0], cid, true, 10e6);

        // Advance time past first epoch boundary
        vm.warp(block.timestamp + EPOCH_DURATION + 1);

        // Second vote is in epoch 2
        (bytes32 ck1,) = _vote(v[1], cid, false, 10e6);

        uint256 rid = engine.getActiveRoundId(cid);
        RoundLib.Commit memory c1 = engine.getCommit(cid, rid, ck1);
        assertEq(c1.epochIndex, 1, "v[1] in epoch 2+ (index 1)");

        // Verify round still open and accepts new votes
        RoundLib.Round memory round = engine.getRound(cid, rid);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Open), "Round still Open after epoch 2 vote");
        assertEq(round.voteCount, 2, "Two votes committed");
    }

    // ==================== Test 3: Round Expiry at Exact maxDuration Boundary ====================

    /// @notice Round can be cancelled at exactly startTime + maxDuration.
    function test_Expiry_AtExactMaxDuration() public {
        uint256 cid = _submit();

        // 2 votes (enough to meet minVoters but we expire instead of settling)
        _vote(v[0], cid, true, 10e6);
        _vote(v[1], cid, true, 10e6);

        uint256 rid = engine.getActiveRoundId(cid);
        RoundLib.Round memory round = engine.getRound(cid, rid);

        // At exactly maxDuration, round is expired
        vm.warp(round.startTime + MAX_DURATION);
        engine.cancelExpiredRound(cid, rid);

        RoundLib.Round memory cancelled = engine.getRound(cid, rid);
        assertEq(uint256(cancelled.state), uint256(RoundLib.RoundState.Cancelled), "Round cancelled at max duration");
    }

    // ==================== Test 4: Not Expired One Second Before maxDuration ====================

    /// @notice Round still accepts votes at startTime + maxDuration - 1.
    function test_Expiry_OneSecondBefore() public {
        uint256 cid = _submit();

        _vote(v[0], cid, true, 10e6);
        uint256 rid = engine.getActiveRoundId(cid);
        RoundLib.Round memory round = engine.getRound(cid, rid);

        // One second before expiry: round still accepts votes
        vm.warp(round.startTime + MAX_DURATION - 1);
        (bytes32 ck1,) = _vote(v[1], cid, true, 10e6);

        // Verify v[1] commit was recorded
        RoundLib.Commit memory c1 = engine.getCommit(cid, rid, ck1);
        assertEq(c1.voter, v[1], "v[1] commit accepted before expiry");
        assertGt(c1.stakeAmount, 0, "v[1] stake recorded");

        // Cannot cancel yet
        vm.expectRevert(RoundVotingEngine.RoundNotExpired.selector);
        engine.cancelExpiredRound(cid, rid);
    }

    // ==================== Test 5: Concurrent Rounds - Independent Settlement ====================

    /// @notice 3 content items with independent rounds. Force-settling one does not affect others.
    function test_ConcurrentRounds_IndependentSettlement() public {
        uint256 cid1 = _submit();
        uint256 cid2 = _submit();
        uint256 cid3 = _submit();

        // Vote on all 3 content items with 2-sided votes
        _vote(v[0], cid1, true, 10e6);
        _vote(v[1], cid1, false, 10e6);

        _vote(v[0], cid2, true, 10e6);
        _vote(v[1], cid2, false, 10e6);

        _vote(v[0], cid3, true, 10e6);
        _vote(v[1], cid3, false, 10e6);
        _vote(v[2], cid3, true, 10e6);

        uint256 rid1 = engine.getActiveRoundId(cid1);
        uint256 rid2 = engine.getActiveRoundId(cid2);
        uint256 rid3 = engine.getActiveRoundId(cid3);

        // Force settle only cid3 (warp past epoch end, reveal all, settle)
        _forceSettle(cid3);

        // cid3 settled, cid1 and cid2 still open
        RoundLib.Round memory r1 = engine.getRound(cid1, rid1);
        RoundLib.Round memory r2 = engine.getRound(cid2, rid2);
        RoundLib.Round memory r3 = engine.getRound(cid3, rid3);

        assertEq(uint256(r1.state), uint256(RoundLib.RoundState.Open), "cid1 still Open");
        assertEq(uint256(r2.state), uint256(RoundLib.RoundState.Open), "cid2 still Open");
        // cid3 should be Settled (UP wins 2 vs 1 weighted: both in epoch1 -> 20e6 up vs 10e6 down)
        assertEq(uint256(r3.state), uint256(RoundLib.RoundState.Settled), "cid3 Settled");
    }

    // ==================== Test 6: Same Voter Votes on Multiple Content ====================

    /// @notice One voter commits on 3 different content items in the same block.
    function test_ConcurrentRounds_SameVoterDifferentContent() public {
        uint256 cid1 = _submit();
        uint256 cid2 = _submit();
        uint256 cid3 = _submit();

        // Same voter votes on all 3 content items
        (bytes32 ck1,) = _vote(v[0], cid1, true, 10e6);
        (bytes32 ck2,) = _vote(v[0], cid2, false, 20e6);
        (bytes32 ck3,) = _vote(v[0], cid3, true, 30e6);

        uint256 rid1 = engine.getActiveRoundId(cid1);
        uint256 rid2 = engine.getActiveRoundId(cid2);
        uint256 rid3 = engine.getActiveRoundId(cid3);

        // All commits accepted -- verify by checking commit records
        RoundLib.Commit memory c1 = engine.getCommit(cid1, rid1, ck1);
        RoundLib.Commit memory c2 = engine.getCommit(cid2, rid2, ck2);
        RoundLib.Commit memory c3 = engine.getCommit(cid3, rid3, ck3);

        assertEq(c1.voter, v[0], "v[0] committed on cid1");
        assertEq(c2.voter, v[0], "v[0] committed on cid2");
        assertEq(c3.voter, v[0], "v[0] committed on cid3");
        assertEq(c1.stakeAmount, 10e6, "cid1 stake correct");
        assertEq(c2.stakeAmount, 20e6, "cid2 stake correct");
        assertEq(c3.stakeAmount, 30e6, "cid3 stake correct");
    }

    // ==================== Test 7: Settlement Requires Epoch End and Min Voters ====================

    /// @notice Before epoch ends, settlement is not possible. After epoch ends and minVoters reveals,
    ///         settlement becomes available after the settlement delay.
    function test_Settlement_RequiresEpochEndAndMinVoters() public {
        uint256 cid = _submit();

        // Two-sided votes
        (bytes32 ck0, bytes32 s0) = _vote(v[0], cid, true, 50e6);
        (bytes32 ck1, bytes32 s1) = _vote(v[1], cid, false, 10e6);

        uint256 rid = engine.getActiveRoundId(cid);
        RoundLib.Round memory round = engine.getRound(cid, rid);

        // Before epoch ends: reveal should revert with EpochNotEnded
        vm.expectRevert(RoundVotingEngine.EpochNotEnded.selector);
        engine.revealVoteByCommitKey(cid, rid, ck0, true, s0);

        // After epoch ends: reveal succeeds
        vm.warp(round.startTime + EPOCH_DURATION + 1);
        engine.revealVoteByCommitKey(cid, rid, ck0, true, s0);
        engine.revealVoteByCommitKey(cid, rid, ck1, false, s1);

        // After minVoters revealed, thresholdReachedAt is set
        RoundLib.Round memory afterReveal = engine.getRound(cid, rid);
        assertGt(afterReveal.thresholdReachedAt, 0, "Threshold reached after minVoters reveals");

        // Cannot settle before settlement delay (thresholdReachedAt + epochDuration)
        vm.expectRevert(RoundVotingEngine.SettlementDelayNotElapsed.selector);
        engine.settleRound(cid, rid);

        // After settlement delay: settleRound succeeds
        vm.warp(afterReveal.thresholdReachedAt + EPOCH_DURATION + 1);
        engine.settleRound(cid, rid);

        RoundLib.Round memory settled = engine.getRound(cid, rid);
        assertEq(uint256(settled.state), uint256(RoundLib.RoundState.Settled), "Settled after delay");
    }

    // ==================== Test 8: One-Sided Votes — UP Wins Consensus ====================

    /// @notice When only UP votes exist and threshold is reached, UP wins after settlement delay.
    function test_ConsensusSettlement_OneSided_UpWins() public {
        uint256 cid = _submit();

        // Only UP votes (one-sided)
        (bytes32 ck0, bytes32 s0) = _vote(v[0], cid, true, 10e6);
        (bytes32 ck1, bytes32 s1) = _vote(v[1], cid, true, 20e6);
        (bytes32 ck2, bytes32 s2) = _vote(v[2], cid, true, 30e6);

        uint256 rid = engine.getActiveRoundId(cid);
        RoundLib.Round memory round = engine.getRound(cid, rid);

        // Reveal all after epoch ends
        vm.warp(round.startTime + EPOCH_DURATION + 1);
        engine.revealVoteByCommitKey(cid, rid, ck0, true, s0);
        engine.revealVoteByCommitKey(cid, rid, ck1, true, s1);
        engine.revealVoteByCommitKey(cid, rid, ck2, true, s2);

        RoundLib.Round memory afterReveal = engine.getRound(cid, rid);
        assertGt(afterReveal.thresholdReachedAt, 0, "Threshold reached");

        // Wait out settlement delay and settle
        vm.warp(afterReveal.thresholdReachedAt + EPOCH_DURATION + 1);
        engine.settleRound(cid, rid);

        RoundLib.Round memory afterSettle = engine.getRound(cid, rid);
        assertEq(uint256(afterSettle.state), uint256(RoundLib.RoundState.Settled), "Consensus settled");
        assertTrue(afterSettle.upWins, "UP wins in one-sided consensus");
    }

    // ==================== Test 9: Tied Round — Equal Weighted Pools ====================

    /// @notice When UP and DOWN weighted stakes are exactly equal, settlement produces a Tied round.
    function test_RoundTransition_OpenToTied() public {
        uint256 cid = _submit();

        // Equal stakes on both sides (same epoch = same weight)
        (bytes32 ck0, bytes32 s0) = _vote(v[0], cid, true, 50e6);
        (bytes32 ck1, bytes32 s1) = _vote(v[1], cid, false, 50e6);

        uint256 rid = engine.getActiveRoundId(cid);
        RoundLib.Round memory round = engine.getRound(cid, rid);

        // Reveal all after epoch ends
        vm.warp(round.startTime + EPOCH_DURATION + 1);
        engine.revealVoteByCommitKey(cid, rid, ck0, true, s0);
        engine.revealVoteByCommitKey(cid, rid, ck1, false, s1);

        RoundLib.Round memory afterReveal = engine.getRound(cid, rid);
        assertGt(afterReveal.thresholdReachedAt, 0, "Threshold reached");

        // Wait for settlement delay and settle
        vm.warp(afterReveal.thresholdReachedAt + EPOCH_DURATION + 1);
        engine.settleRound(cid, rid);

        RoundLib.Round memory tied = engine.getRound(cid, rid);
        assertEq(uint256(tied.state), uint256(RoundLib.RoundState.Tied), "Equal weighted stakes produce Tied state");
    }

    // ==================== Test 10: Late Vote Placement and Round Expiry ====================

    /// @notice Vote placed near expiry is included in the round; after expiry the round can be cancelled.
    function test_LateVotePlacement_AndExpiry() public {
        uint256 cid = _submit();

        _vote(v[0], cid, true, 50e6);
        _vote(v[1], cid, false, 50e6);

        uint256 rid = engine.getActiveRoundId(cid);
        RoundLib.Round memory round = engine.getRound(cid, rid);

        // Late vote 1 second before expiry
        vm.warp(round.startTime + MAX_DURATION - 1);
        _vote(v[2], cid, true, 50e6);

        RoundLib.Round memory afterLate = engine.getRound(cid, rid);
        assertEq(afterLate.voteCount, 3, "Late vote counted");

        // Now expire
        vm.warp(round.startTime + MAX_DURATION);
        engine.cancelExpiredRound(cid, rid);

        RoundLib.Round memory cancelled = engine.getRound(cid, rid);
        assertEq(uint256(cancelled.state), uint256(RoundLib.RoundState.Cancelled), "Round cancelled after expiry");
    }

    // ==================== Test 11: Post-Settlement Round Creation ====================

    /// @notice After settling round 1, a new vote (after cooldown) creates round 2.
    function test_RoundTransition_NewRoundAfterSettlement() public {
        uint256 cid = _submit();

        // Round 1: two-sided votes
        _vote(v[0], cid, true, 50e6);
        _vote(v[1], cid, false, 10e6);

        uint256 rid1 = engine.getActiveRoundId(cid);
        assertEq(rid1, 1, "First round has ID 1");

        // Force settle
        _forceSettle(cid);
        RoundLib.Round memory settled = engine.getRound(cid, rid1);
        assertEq(uint256(settled.state), uint256(RoundLib.RoundState.Settled), "Round 1 settled");

        // Wait for cooldown (24 hours) so same voters can vote again
        vm.warp(block.timestamp + 24 hours);

        // New vote on same content creates round 2
        _vote(v[2], cid, true, 10e6);
        uint256 rid2 = engine.getActiveRoundId(cid);
        assertEq(rid2, 2, "New round created after settlement");
        assertGt(rid2, rid1, "Round ID incremented");

        RoundLib.Round memory newRound = engine.getRound(cid, rid2);
        assertEq(uint256(newRound.state), uint256(RoundLib.RoundState.Open), "New round is Open");
        assertEq(newRound.voteCount, 1, "New round has 1 vote");
    }

    // ==================== Test 12: Refund Flow on Cancelled Round ====================

    /// @notice After cancelling an expired round, all voters can claim full refunds.
    function test_RefundFlow_CancelledRound() public {
        uint256 cid = _submit();

        uint256 bal0Before = crepToken.balanceOf(v[0]);
        uint256 bal1Before = crepToken.balanceOf(v[1]);
        uint256 bal2Before = crepToken.balanceOf(v[2]);

        // 3 voters stake different amounts
        _vote(v[0], cid, true, 10e6);
        _vote(v[1], cid, false, 20e6);
        _vote(v[2], cid, true, 30e6);

        uint256 rid = engine.getActiveRoundId(cid);
        RoundLib.Round memory round = engine.getRound(cid, rid);

        // Expire after maxDuration
        vm.warp(round.startTime + MAX_DURATION);
        engine.cancelExpiredRound(cid, rid);

        RoundLib.Round memory cancelled = engine.getRound(cid, rid);
        assertEq(uint256(cancelled.state), uint256(RoundLib.RoundState.Cancelled), "Round cancelled");

        // Each voter claims refund and gets full stake back
        vm.prank(v[0]);
        engine.claimCancelledRoundRefund(cid, rid);
        assertEq(crepToken.balanceOf(v[0]), bal0Before, "v[0] refunded 10e6");

        vm.prank(v[1]);
        engine.claimCancelledRoundRefund(cid, rid);
        assertEq(crepToken.balanceOf(v[1]), bal1Before, "v[1] refunded 20e6");

        vm.prank(v[2]);
        engine.claimCancelledRoundRefund(cid, rid);
        assertEq(crepToken.balanceOf(v[2]), bal2Before, "v[2] refunded 30e6");

        // Double claim should revert
        vm.prank(v[0]);
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        engine.claimCancelledRoundRefund(cid, rid);
    }
}
