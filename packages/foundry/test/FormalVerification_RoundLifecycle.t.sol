// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";

/// @title Formal Verification: Round Lifecycle Edge Cases (Public Vote + Random Settlement)
/// @notice 12 scenarios verifying block-based epoch boundaries, expiry, concurrent rounds,
///         settlement probability, consensus timeout, round transitions, and refund flows.
contract FormalVerification_RoundLifecycleTest is Test {
    CuryoReputation crepToken;
    ContentRegistry registry;
    RoundVotingEngine engine;
    RoundRewardDistributor distributor;

    address owner = address(1);
    address submitter = address(2);
    address treasuryAddr = address(3);
    address[10] v; // voter addresses

    // Config values matching setConfig(10, 50, 7 days, 2, 200, 30, 3, 500, 1000e6)
    uint64 constant MIN_EPOCH_BLOCKS = 10;
    uint64 constant MAX_EPOCH_BLOCKS = 50;
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

        // Test config: minEpochBlocks=10, maxEpochBlocks=50, maxDuration=7d,
        // minVoters=2, maxVoters=200, baseRate=30bps, growth=3bps, maxProb=500bps, liquidity=1000e6
        engine.setConfig(MIN_EPOCH_BLOCKS, MAX_EPOCH_BLOCKS, MAX_DURATION, MIN_VOTERS, 200, 30, 3, 500, 1000e6);

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

    function _vote(address voter, uint256 cid, bool up, uint256 stake) internal {
        vm.startPrank(voter);
        crepToken.approve(address(engine), stake);
        engine.vote(cid, up, stake, address(0));
        vm.stopPrank();
    }

    function _forceSettle(uint256 cid) internal {
        vm.roll(block.number + MAX_EPOCH_BLOCKS + 1);
        engine.trySettle(cid);
    }

    // ==================== Test 1: Vote at Exact minEpochBlocks Boundary ====================

    /// @notice A vote placed exactly at startBlock + minEpochBlocks should be accepted.
    ///         The epoch is eligible for settlement starting at this block.
    function test_EpochBoundary_VoteAtExactMinEpoch() public {
        uint256 cid = _submit();

        // First vote starts the round at current block
        _vote(v[0], cid, true, 10e6);

        uint256 rid = engine.currentRoundId(cid);
        RoundLib.Round memory round = engine.getRound(cid, rid);
        uint64 startBlock = round.startBlock;

        // Roll to exactly minEpochBlocks after start
        vm.roll(startBlock + MIN_EPOCH_BLOCKS);

        // Vote should still be accepted (round still Open)
        _vote(v[1], cid, false, 10e6);

        assertTrue(engine.hasVoted(cid, rid, v[1]), "Vote accepted at minEpochBlocks boundary");
    }

    // ==================== Test 2: Vote One Block Before minEpochBlocks ====================

    /// @notice A vote placed one block before minEpochBlocks should be accepted.
    ///         Settlement should not yet be possible.
    function test_EpochBoundary_VoteOneBlockBeforeMinEpoch() public {
        uint256 cid = _submit();

        _vote(v[0], cid, true, 10e6);

        uint256 rid = engine.currentRoundId(cid);
        RoundLib.Round memory round = engine.getRound(cid, rid);
        uint64 startBlock = round.startBlock;

        // Roll to one block before minEpochBlocks
        vm.roll(startBlock + MIN_EPOCH_BLOCKS - 1);

        // Vote should be accepted
        _vote(v[1], cid, false, 10e6);
        assertTrue(engine.hasVoted(cid, rid, v[1]), "Vote accepted before minEpochBlocks");

        // trySettle should not settle (before min epoch)
        engine.trySettle(cid);
        RoundLib.Round memory afterSettle = engine.getRound(cid, rid);
        assertEq(uint256(afterSettle.state), uint256(RoundLib.RoundState.Open), "Round still Open before minEpoch");
    }

    // ==================== Test 3: Round Expiry at Exact maxDuration Boundary ====================

    /// @notice Round can be cancelled at exactly startTime + maxDuration.
    function test_Expiry_AtExactMaxDuration() public {
        uint256 cid = _submit();

        // 2 votes (enough to meet minVoters but we expire instead of settling)
        _vote(v[0], cid, true, 10e6);
        _vote(v[1], cid, true, 10e6);

        uint256 rid = engine.currentRoundId(cid);
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
        uint256 rid = engine.currentRoundId(cid);
        RoundLib.Round memory round = engine.getRound(cid, rid);

        // One second before expiry: round still accepts votes
        vm.warp(round.startTime + MAX_DURATION - 1);
        _vote(v[1], cid, true, 10e6);

        assertTrue(engine.hasVoted(cid, rid, v[1]), "Vote accepted 1s before expiry");

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

        uint256 rid1 = engine.currentRoundId(cid1);
        uint256 rid2 = engine.currentRoundId(cid2);
        uint256 rid3 = engine.currentRoundId(cid3);

        // Force settle only cid3 (roll past maxEpochBlocks)
        vm.roll(block.number + MAX_EPOCH_BLOCKS + 1);
        engine.trySettle(cid3);

        // cid3 settled, cid1 and cid2 still open
        RoundLib.Round memory r1 = engine.getRound(cid1, rid1);
        RoundLib.Round memory r2 = engine.getRound(cid2, rid2);
        RoundLib.Round memory r3 = engine.getRound(cid3, rid3);

        assertEq(uint256(r1.state), uint256(RoundLib.RoundState.Open), "cid1 still Open");
        assertEq(uint256(r2.state), uint256(RoundLib.RoundState.Open), "cid2 still Open");
        // cid3 should be Settled (UP wins 2 vs 1 by stake: 20e6 up vs 10e6 down)
        assertEq(uint256(r3.state), uint256(RoundLib.RoundState.Settled), "cid3 Settled");
    }

    // ==================== Test 6: Same Voter Votes on Multiple Content ====================

    /// @notice One voter votes on 3 different content items in the same block.
    function test_ConcurrentRounds_SameVoterDifferentContent() public {
        uint256 cid1 = _submit();
        uint256 cid2 = _submit();
        uint256 cid3 = _submit();

        // Same voter votes on all 3 content items
        _vote(v[0], cid1, true, 10e6);
        _vote(v[0], cid2, false, 20e6);
        _vote(v[0], cid3, true, 30e6);

        uint256 rid1 = engine.currentRoundId(cid1);
        uint256 rid2 = engine.currentRoundId(cid2);
        uint256 rid3 = engine.currentRoundId(cid3);

        // All votes accepted
        assertTrue(engine.hasVoted(cid1, rid1, v[0]), "v[0] voted on cid1");
        assertTrue(engine.hasVoted(cid2, rid2, v[0]), "v[0] voted on cid2");
        assertTrue(engine.hasVoted(cid3, rid3, v[0]), "v[0] voted on cid3");
    }

    // ==================== Test 7: Settlement Probability Increases With Blocks ====================

    /// @notice Before minEpochBlocks, settlement never triggers. After maxEpochBlocks, it always settles.
    ///         We verify the deterministic boundaries.
    function test_SettlementProbability_BlockBoundaries() public {
        uint256 cid = _submit();

        // Two-sided votes to make settlement possible
        _vote(v[0], cid, true, 50e6);
        _vote(v[1], cid, false, 10e6);

        uint256 rid = engine.currentRoundId(cid);
        RoundLib.Round memory round = engine.getRound(cid, rid);
        uint64 startBlock = round.startBlock;

        // Before minEpochBlocks: trySettle should not settle
        vm.roll(startBlock + MIN_EPOCH_BLOCKS - 1);
        engine.trySettle(cid);
        RoundLib.Round memory beforeMin = engine.getRound(cid, rid);
        assertEq(uint256(beforeMin.state), uint256(RoundLib.RoundState.Open), "Not settled before minEpochBlocks");

        // After maxEpochBlocks: trySettle must settle (deterministic)
        vm.roll(startBlock + MAX_EPOCH_BLOCKS);
        engine.trySettle(cid);
        RoundLib.Round memory afterMax = engine.getRound(cid, rid);
        assertEq(uint256(afterMax.state), uint256(RoundLib.RoundState.Settled), "Settled at maxEpochBlocks");
    }

    // ==================== Test 8: Consensus Settlement After maxEpochBlocks (One-Sided) ====================

    /// @notice When only UP votes exist, consensus settlement triggers after maxEpochBlocks.
    function test_ConsensusSettlement_OneSidedAfterMaxEpoch() public {
        uint256 cid = _submit();

        // Only UP votes (one-sided)
        _vote(v[0], cid, true, 10e6);
        _vote(v[1], cid, true, 20e6);
        _vote(v[2], cid, true, 30e6);

        uint256 rid = engine.currentRoundId(cid);
        RoundLib.Round memory round = engine.getRound(cid, rid);
        uint64 startBlock = round.startBlock;

        // Before maxEpochBlocks: consensus settlement should not trigger
        vm.roll(startBlock + MAX_EPOCH_BLOCKS - 1);
        engine.trySettle(cid);
        RoundLib.Round memory beforeMax = engine.getRound(cid, rid);
        assertEq(uint256(beforeMax.state), uint256(RoundLib.RoundState.Open), "Not settled before maxEpochBlocks");

        // At maxEpochBlocks: consensus settlement triggers
        vm.roll(startBlock + MAX_EPOCH_BLOCKS);
        engine.trySettle(cid);
        RoundLib.Round memory afterMax = engine.getRound(cid, rid);
        assertEq(uint256(afterMax.state), uint256(RoundLib.RoundState.Settled), "Consensus settled at maxEpochBlocks");
        assertTrue(afterMax.upWins, "UP wins in one-sided consensus");
    }

    // ==================== Test 9: Round Transitions - Open to Tied ====================

    /// @notice When UP and DOWN stakes are exactly equal, settlement produces a Tied round.
    function test_RoundTransition_OpenToTied() public {
        uint256 cid = _submit();

        // Equal stakes on both sides
        _vote(v[0], cid, true, 50e6);
        _vote(v[1], cid, false, 50e6);

        uint256 rid = engine.currentRoundId(cid);

        // Force settle past maxEpochBlocks
        RoundLib.Round memory round = engine.getRound(cid, rid);
        vm.roll(round.startBlock + MAX_EPOCH_BLOCKS);
        engine.trySettle(cid);

        RoundLib.Round memory tied = engine.getRound(cid, rid);
        assertEq(uint256(tied.state), uint256(RoundLib.RoundState.Tied), "Equal stakes produce Tied state");
    }

    // ==================== Test 10: Late Vote Placement and Round Expiry ====================

    /// @notice Vote placed near expiry is included in the round; after expiry the round can be cancelled.
    function test_LateVotePlacement_AndExpiry() public {
        uint256 cid = _submit();

        _vote(v[0], cid, true, 50e6);
        _vote(v[1], cid, false, 50e6);

        uint256 rid = engine.currentRoundId(cid);
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

        uint256 rid1 = engine.currentRoundId(cid);
        assertEq(rid1, 1, "First round has ID 1");

        // Force settle
        _forceSettle(cid);
        RoundLib.Round memory settled = engine.getRound(cid, rid1);
        assertEq(uint256(settled.state), uint256(RoundLib.RoundState.Settled), "Round 1 settled");

        // Wait for cooldown (24 hours) so same voters can vote again
        vm.warp(block.timestamp + 24 hours);

        // New vote on same content creates round 2
        _vote(v[2], cid, true, 10e6);
        uint256 rid2 = engine.currentRoundId(cid);
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

        uint256 rid = engine.currentRoundId(cid);
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
