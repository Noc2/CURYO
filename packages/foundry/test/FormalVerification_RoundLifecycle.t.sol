// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";

/// @title Formal Verification: Round Lifecycle Edge Cases
/// @notice 12 scenarios verifying epoch boundary timing, expiry, concurrent rounds,
///         threshold timing, and round transitions.
contract FormalVerification_RoundLifecycleTest is Test {
    CuryoReputation crepToken;
    ContentRegistry registry;
    RoundVotingEngine engine;
    RoundRewardDistributor distributor;

    address owner = address(1);
    address submitter = address(2);
    address treasuryAddr = address(3);
    address[10] v; // voter addresses

    uint256 constant EPOCH = 15 minutes;
    uint256 constant MAX_DURATION = 7 days;
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
                        RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry), true)
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

    function _commit(address voter, uint256 cid, bool up, bytes32 salt, uint256 stake) internal {
        vm.startPrank(voter);
        crepToken.approve(address(engine), stake);
        bytes memory ciphertext = abi.encodePacked(up ? bytes1(uint8(1)) : bytes1(uint8(0)), salt, bytes32(cid));
        engine.commitVote(cid, keccak256(abi.encodePacked(up, salt, cid)), ciphertext, stake, address(0));
        vm.stopPrank();
    }

    function _reveal(address voter, uint256 cid, uint256 rid, bool up, bytes32 salt) internal {
        bytes32 commitHash = keccak256(abi.encodePacked(up, salt, cid));
        bytes32 commitKey = keccak256(abi.encodePacked(voter, commitHash));
        engine.revealVoteByCommitKey(cid, rid, commitKey, up, salt);
    }

    // ==================== Test 1: Commit at Exact Epoch End Lands in Next Epoch ====================

    /// @notice Commit at T=epochDuration should land in epoch 1 (revealable after 2*epochDuration).
    function test_EpochBoundary_CommitAtExactEnd_LandsInNextEpoch() public {
        uint256 cid = _submit();

        // First commit starts the round at current block.timestamp
        _commit(v[0], cid, true, "a", 10e6);

        uint256 rid = engine.currentRoundId(cid);
        RoundLib.Round memory round = engine.getRound(cid, rid);
        uint256 rStart = round.startTime;

        // Commit exactly at T = startTime + epochDuration (epoch boundary)
        vm.warp(rStart + EPOCH);
        _commit(v[1], cid, true, "b", 10e6);

        // v[1]'s commit should have revealableAfter = startTime + 2*EPOCH
        bytes32 commitHash = keccak256(abi.encodePacked(true, bytes32("b"), cid));
        bytes32 commitKey = keccak256(abi.encodePacked(v[1], commitHash));
        (,,,, uint256 revealableAfter,,) = engine.commits(cid, rid, commitKey);

        assertEq(revealableAfter, rStart + 2 * EPOCH, "Commit at epoch boundary lands in epoch 1");
    }

    // ==================== Test 2: Commit One Second Before Epoch End ====================

    /// @notice Commit at T=epochDuration-1 stays in epoch 0.
    function test_EpochBoundary_CommitOneSecondBefore() public {
        uint256 cid = _submit();

        _commit(v[0], cid, true, "a", 10e6);

        uint256 rid = engine.currentRoundId(cid);
        RoundLib.Round memory round = engine.getRound(cid, rid);
        uint256 rStart = round.startTime;

        vm.warp(rStart + EPOCH - 1);
        _commit(v[1], cid, true, "b", 10e6);

        bytes32 commitHash = keccak256(abi.encodePacked(true, bytes32("b"), cid));
        bytes32 commitKey = keccak256(abi.encodePacked(v[1], commitHash));
        (,,,, uint256 revealableAfter,,) = engine.commits(cid, rid, commitKey);

        assertEq(revealableAfter, rStart + EPOCH, "Commit 1s before boundary stays in epoch 0");
    }

    // ==================== Test 3: Commit at Round Start ====================

    /// @notice First commit at T=0 has revealableAfter = roundStart + epochDuration.
    function test_EpochBoundary_CommitAtRoundStart() public {
        uint256 cid = _submit();

        _commit(v[0], cid, true, "a", 10e6);

        uint256 rid = engine.currentRoundId(cid);
        RoundLib.Round memory round = engine.getRound(cid, rid);
        bytes32 commitHash = keccak256(abi.encodePacked(true, bytes32("a"), cid));
        bytes32 commitKey = keccak256(abi.encodePacked(v[0], commitHash));
        (,,,, uint256 revealableAfter,,) = engine.commits(cid, rid, commitKey);

        assertEq(revealableAfter, round.startTime + EPOCH, "First commit revealable after first epoch");
    }

    // ==================== Test 4: Expiry at Exact Max Duration ====================

    /// @notice Round can be cancelled at exactly T + maxDuration.
    function test_Expiry_AtExactMaxDuration() public {
        uint256 cid = _submit();
        uint256 ts = 1000;

        // 3 commits (enough to settle at minVoters=3)
        _commit(v[0], cid, true, "a", 10e6);
        _commit(v[1], cid, true, "b", 10e6);
        _commit(v[2], cid, true, "c", 10e6);

        uint256 rid = engine.currentRoundId(cid);

        // At exactly maxDuration, round is expired
        vm.warp(ts + MAX_DURATION);
        engine.cancelExpiredRound(cid, rid);

        RoundLib.Round memory round = engine.getRound(cid, rid);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Cancelled), "Round cancelled at max duration");
    }

    // ==================== Test 5: Not Expired One Second Before ====================

    /// @notice Round still accepts votes at T + maxDuration - 1.
    function test_Expiry_OneSecondBefore() public {
        uint256 cid = _submit();
        uint256 ts = 1000;

        _commit(v[0], cid, true, "a", 10e6);
        uint256 rid = engine.currentRoundId(cid);

        // One second before expiry - round still accepts votes
        vm.warp(ts + MAX_DURATION - 1);
        _commit(v[1], cid, true, "b", 10e6);

        // Cannot cancel - not expired yet
        vm.expectRevert(RoundVotingEngine.RoundNotExpired.selector);
        engine.cancelExpiredRound(cid, rid);
    }

    // ==================== Test 6: Late Vote Refunded on Expiry ====================

    /// @notice Vote placed near expiry is refunded when round cancels.
    function test_Expiry_LateVoteRefunded() public {
        uint256 cid = _submit();
        uint256 ts = 1000;

        _commit(v[0], cid, true, "a", 50e6);
        _commit(v[1], cid, false, "b", 50e6);
        _commit(v[2], cid, true, "c", 50e6);

        // Late vote near expiry
        vm.warp(ts + MAX_DURATION - 1);
        uint256 lateBalBefore = crepToken.balanceOf(v[3]);
        _commit(v[3], cid, true, "d", 50e6);

        uint256 rid = engine.currentRoundId(cid);

        // Expire
        vm.warp(ts + MAX_DURATION);
        engine.cancelExpiredRound(cid, rid);

        // Late voter claims refund
        vm.prank(v[3]);
        engine.claimCancelledRoundRefund(cid, rid);
        assertEq(crepToken.balanceOf(v[3]), lateBalBefore, "Late voter gets full refund");
    }

    // ==================== Test 7: Concurrent Rounds - Independent Settlement ====================

    /// @notice 3 content items with independent rounds. Settling one doesn't affect others.
    function test_ConcurrentRounds_IndependentSettlement() public {
        uint256 cid1 = _submit();
        uint256 cid2 = _submit();
        uint256 cid3 = _submit();
        uint256 ts = 1000;

        // Commit 5 votes on each content
        for (uint256 i = 0; i < 5; i++) {
            _commit(v[i], cid1, true, bytes32(uint256(100 + i)), 50e6);
            _commit(v[i], cid2, true, bytes32(uint256(200 + i)), 50e6);
            _commit(v[i], cid3, i < 3, bytes32(uint256(300 + i)), 50e6); // 3 UP, 2 DOWN
        }

        // Reveal all
        ts += EPOCH + 1;
        vm.warp(ts);
        uint256 rid1 = engine.currentRoundId(cid1);
        uint256 rid2 = engine.currentRoundId(cid2);
        uint256 rid3 = engine.currentRoundId(cid3);

        for (uint256 i = 0; i < 5; i++) {
            _reveal(v[i], cid1, rid1, true, bytes32(uint256(100 + i)));
            _reveal(v[i], cid2, rid2, true, bytes32(uint256(200 + i)));
            _reveal(v[i], cid3, rid3, i < 3, bytes32(uint256(300 + i)));
        }

        // Settle only cid3
        ts += EPOCH + 1;
        vm.warp(ts);
        engine.settleRound(cid3, rid3);

        // cid3 settled, cid1 and cid2 still open
        RoundLib.Round memory r1 = engine.getRound(cid1, rid1);
        RoundLib.Round memory r2 = engine.getRound(cid2, rid2);
        RoundLib.Round memory r3 = engine.getRound(cid3, rid3);

        assertEq(uint256(r1.state), uint256(RoundLib.RoundState.Open), "cid1 still Open");
        assertEq(uint256(r2.state), uint256(RoundLib.RoundState.Open), "cid2 still Open");
        assertEq(uint256(r3.state), uint256(RoundLib.RoundState.Settled), "cid3 Settled");
    }

    // ==================== Test 8: Same Voter Votes on Multiple Content ====================

    /// @notice One voter votes on 3 different content items in the same epoch.
    function test_ConcurrentRounds_SameVoterDifferentContent() public {
        uint256 cid1 = _submit();
        uint256 cid2 = _submit();
        uint256 cid3 = _submit();

        // Same voter votes on all 3 content items
        _commit(v[0], cid1, true, "a1", 10e6);
        _commit(v[0], cid2, false, "a2", 20e6);
        _commit(v[0], cid3, true, "a3", 30e6);

        uint256 rid1 = engine.currentRoundId(cid1);
        uint256 rid2 = engine.currentRoundId(cid2);
        uint256 rid3 = engine.currentRoundId(cid3);

        // All commits accepted
        assertTrue(engine.hasCommitted(cid1, rid1, v[0]), "v[0] committed on cid1");
        assertTrue(engine.hasCommitted(cid2, rid2, v[0]), "v[0] committed on cid2");
        assertTrue(engine.hasCommitted(cid3, rid3, v[0]), "v[0] committed on cid3");
    }

    // ==================== Test 9: Threshold Set at 3rd Reveal ====================

    /// @notice thresholdReachedAt is 0 after 2 reveals, set on the 3rd.
    function test_ThresholdTiming_SetAt5thReveal() public {
        uint256 cid = _submit();
        uint256 ts = 1000;

        for (uint256 i = 0; i < 4; i++) {
            _commit(v[i], cid, true, bytes32(uint256(i)), 10e6);
        }

        ts += EPOCH + 1;
        vm.warp(ts);
        uint256 rid = engine.currentRoundId(cid);

        // Reveal 1-2: threshold not yet reached
        for (uint256 i = 0; i < 2; i++) {
            _reveal(v[i], cid, rid, true, bytes32(uint256(i)));
        }
        RoundLib.Round memory r2 = engine.getRound(cid, rid);
        assertEq(r2.thresholdReachedAt, 0, "2 reveals: threshold not yet reached");

        // Reveal 3: threshold reached
        _reveal(v[2], cid, rid, true, bytes32(uint256(2)));
        RoundLib.Round memory r3 = engine.getRound(cid, rid);
        assertEq(r3.thresholdReachedAt, ts, "3rd reveal sets thresholdReachedAt");
        assertEq(r3.revealedCount, 3, "3 votes revealed");
    }

    // ==================== Test 10: Multi-Epoch Reveals - Threshold in Epoch 0 ====================

    /// @notice 2 reveals in epoch 0, 3 in epoch 1. Threshold reached at 3rd reveal (in epoch 0).
    function test_ThresholdTiming_MultiEpochReveals() public {
        uint256 cid = _submit();
        uint256 ts = 1000; // known start time from setUp

        // Epoch 0: 3 commits
        _commit(v[0], cid, true, "a", 10e6);
        _commit(v[1], cid, true, "b", 10e6);
        _commit(v[2], cid, false, "c", 10e6);

        // Epoch 1: 3 more commits
        vm.warp(ts + EPOCH);
        _commit(v[3], cid, true, "d", 10e6);
        _commit(v[4], cid, true, "e", 10e6);
        _commit(v[5], cid, false, "f", 10e6);

        uint256 rid = engine.currentRoundId(cid);

        // Reveal epoch 0 votes (after epoch 0 ends)
        uint256 epoch0End = ts + EPOCH + 1;
        vm.warp(epoch0End);
        _reveal(v[0], cid, rid, true, "a");
        _reveal(v[1], cid, rid, true, "b");
        _reveal(v[2], cid, rid, false, "c"); // This is the 3rd reveal

        RoundLib.Round memory rAfter3 = engine.getRound(cid, rid);
        assertEq(rAfter3.thresholdReachedAt, epoch0End, "3 reveals: threshold reached in epoch 0");

        // Reveal epoch 1 votes (after epoch 1 ends)
        uint256 epoch1End = ts + 2 * EPOCH + 1;
        vm.warp(epoch1End);
        _reveal(v[3], cid, rid, true, "d");
        _reveal(v[4], cid, rid, true, "e");

        RoundLib.Round memory rAfter5 = engine.getRound(cid, rid);
        assertEq(rAfter5.thresholdReachedAt, epoch0End, "Threshold unchanged (still epoch 0)");

        // Reveal 6th
        _reveal(v[5], cid, rid, false, "f");

        // Settle after delay (thresholdReachedAt + EPOCH)
        vm.warp(epoch0End + EPOCH);
        engine.settleRound(cid, rid);

        RoundLib.Round memory settled = engine.getRound(cid, rid);
        assertEq(settled.revealedCount, 6, "All 6 votes included");
        assertTrue(settled.upWins, "UP wins (4 vs 2 count, 40 vs 20 stake)");
    }

    // ==================== Test 11: New Round After Settlement ====================

    /// @notice After settling round 1, a new vote creates round 2.
    function test_RoundTransition_NewRoundAfterSettlement() public {
        uint256 cid = _submit();
        uint256 ts = 1000;

        // Round 1: 5 votes
        for (uint256 i = 0; i < 5; i++) {
            _commit(v[i], cid, true, bytes32(uint256(i)), 10e6);
        }
        ts += EPOCH + 1;
        vm.warp(ts);
        uint256 rid1 = engine.currentRoundId(cid);
        for (uint256 i = 0; i < 5; i++) {
            _reveal(v[i], cid, rid1, true, bytes32(uint256(i)));
        }
        ts += EPOCH + 1;
        vm.warp(ts);
        engine.settleRound(cid, rid1);
        assertEq(rid1, 1, "First round has ID 1");

        // Wait for cooldown (24 hours)
        ts += 24 hours;
        vm.warp(ts);

        // New vote on same content creates round 2
        _commit(v[0], cid, true, bytes32(uint256(100)), 10e6);
        uint256 rid2 = engine.currentRoundId(cid);
        assertEq(rid2, 2, "New round created after settlement");
        assertGt(rid2, rid1, "Round ID incremented");
    }

    // ==================== Test 12: New Round After Cancellation ====================

    /// @notice After cancelling an expired round, a new vote creates the next round.
    function test_RoundTransition_NewRoundAfterCancellation() public {
        uint256 cid = _submit();
        uint256 ts = 1000;

        // Round 1: only 2 commits (not enough to settle)
        _commit(v[0], cid, true, "a", 10e6);
        _commit(v[1], cid, false, "b", 10e6);
        uint256 rid1 = engine.currentRoundId(cid);

        // Expire after maxDuration
        vm.warp(ts + MAX_DURATION);
        engine.cancelExpiredRound(cid, rid1);

        RoundLib.Round memory cancelled = engine.getRound(cid, rid1);
        assertEq(uint256(cancelled.state), uint256(RoundLib.RoundState.Cancelled), "Round 1 cancelled");

        // Claim refunds
        vm.prank(v[0]);
        engine.claimCancelledRoundRefund(cid, rid1);
        vm.prank(v[1]);
        engine.claimCancelledRoundRefund(cid, rid1);

        // Wait for cooldown
        vm.warp(ts + MAX_DURATION + 24 hours);

        // New vote creates round 2
        _commit(v[0], cid, true, bytes32(uint256(200)), 10e6);
        uint256 rid2 = engine.currentRoundId(cid);
        assertEq(rid2, 2, "New round created after cancellation");

        RoundLib.Round memory newRound = engine.getRound(cid, rid2);
        assertEq(uint256(newRound.state), uint256(RoundLib.RoundState.Open), "New round is Open");
        assertEq(newRound.voteCount, 1, "New round has 1 vote");
    }
}
