// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";

/// @title Game-Theory Improvement Tests (tlock commit-reveal, epoch-weighted rewards)
/// @notice Integration tests verifying the tlock commit-reveal flow with epoch weighting:
///         1. Epoch-1 (blind) = 100% weight (10000 BPS), epoch-2+ (informed) = 25% weight (2500 BPS)
///         2. minVoters = 3 required for settlement
///         3. Expired rounds cancelled after maxDuration without enough voters
///         4. Consensus subsidy paid from reserve when all voters unanimous
contract GameTheoryImprovementsTest is VotingTestBase {
    CuryoReputation crepToken;
    ContentRegistry registry;
    RoundVotingEngine engine;
    RoundRewardDistributor distributor;

    address owner = address(1);
    address submitter = address(2);
    address treasuryAddr = address(3);
    address alice = address(10);
    address bob = address(11);
    address carol = address(12);
    address dave = address(13);

    // epochDuration = 1 hour (default, matching contract default)
    uint256 constant EPOCH_DURATION = 1 hours;
    // maxDuration = 7 days (default)
    uint256 constant MAX_DURATION = 7 days;
    // minVoters = 3 (new default after tlock redesign)
    uint256 constant MIN_VOTERS = 3;

    uint256 contentNonce;

    function setUp() public {
        vm.warp(10_000); // predictable start time
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

        // Initialize engine (ciphertext validation is relaxed on chainid 31337)
        engine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engImpl),
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
        registry.setTreasury(treasuryAddr);
        ProtocolConfig(address(engine.protocolConfig())).setRewardDistributor(address(distributor));
        ProtocolConfig(address(engine.protocolConfig())).setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(engine.protocolConfig())).setTreasury(treasuryAddr);

        // Override config: 1-hour epochs, 7-day max, minVoters=3, maxVoters=1000
        ProtocolConfig(address(engine.protocolConfig())).setConfig(EPOCH_DURATION, MAX_DURATION, MIN_VOTERS, 1000);

        // Fund consensus reserve
        crepToken.mint(owner, 200_000e6);
        crepToken.approve(address(engine), 200_000e6);
        engine.addToConsensusReserve(200_000e6);

        // Fund submitter and voters
        crepToken.mint(submitter, 100_000e6);
        crepToken.mint(alice, 100_000e6);
        crepToken.mint(bob, 100_000e6);
        crepToken.mint(carol, 100_000e6);
        crepToken.mint(dave, 100_000e6);

        vm.stopPrank();
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    /// @dev Submit a new content item with a unique URL to avoid duplicate-URL conflicts.
    function _submit() internal returns (uint256) {
        contentNonce++;
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        uint256 id = _submitContentWithReservation(registry, string(abi.encodePacked("https://t.co/gt", vm.toString(contentNonce))), "Goal", "Goal", "tag", 0);
        vm.stopPrank();
        return id;
    }

    /// @dev Commit a vote for a voter in the current round. Approves and calls commitVote.
    function _commit(address voter, uint256 contentId, bool isUp, uint256 stake) internal {
        bytes32 salt = bytes32(uint256(uint160(voter)) ^ uint256(contentId));
        bytes32 ch = _commitHash(isUp, salt, contentId);
        bytes memory ct = _testCiphertext(isUp, salt, contentId);

        vm.startPrank(voter);
        crepToken.approve(address(engine), stake);
        engine.commitVote(contentId, ch, ct, stake, address(0));
        vm.stopPrank();
    }

    /// @dev Reveal a previously committed vote. Caller must warp past revealableAfter first.
    function _reveal(address voter, uint256 contentId, uint256 roundId, bool isUp) internal {
        bytes32 salt = bytes32(uint256(uint160(voter)) ^ uint256(contentId));
        bytes32 ch = _commitHash(isUp, salt, contentId);
        bytes32 ck = _commitKey(voter, ch);

        vm.prank(voter);
        engine.revealVoteByCommitKey(contentId, roundId, ck, isUp, salt);
    }

    /// @dev Settle the round. Caller must ensure minVoters have been revealed.
    function _settle(uint256 contentId, uint256 roundId) internal {
        engine.settleRound(contentId, roundId);
    }

    // =========================================================================
    // TEST 1: EpochWeightWinCondition
    // =========================================================================

    /// @notice DOWN wins despite raw UP majority (300 vs 100) because epoch weighting
    ///         gives epoch-1 votes 100% weight and epoch-2+ votes only 25% weight.
    ///
    ///   Alice: DOWN, 100 cREP, epoch-1 → effectiveStake = 100 cREP (weight = 10000 BPS)
    ///   Bob, Carol, Dave: UP, 100 cREP each, epoch-2 → effectiveStake = 25 cREP each
    ///
    ///   weightedDownPool = 100, weightedUpPool = 75 → DOWN wins.
    function test_EpochWeightWinCondition() public {
        uint256 cid = _submit();
        uint256 roundStart = block.timestamp;

        // --- Epoch-1 commits (blind, at round start) ---
        _commit(alice, cid, false, 100e6); // DOWN, epoch-1

        // --- Epoch-2 commits (informed, after epoch-1 ends) ---
        vm.warp(roundStart + EPOCH_DURATION + 1);
        _commit(bob, cid, true, 100e6); // UP, epoch-2
        _commit(carol, cid, true, 100e6); // UP, epoch-2
        _commit(dave, cid, true, 100e6); // UP, epoch-2

        uint256 roundId = engine.currentRoundId(cid);

        // Reveal all votes. Epoch-1 commits are revealable after roundStart + EPOCH_DURATION.
        // Epoch-2 commits are revealable after roundStart + 2 * EPOCH_DURATION.
        // Warp past epoch-2 end so all can be revealed.
        vm.warp(roundStart + 2 * EPOCH_DURATION + 1);

        _reveal(alice, cid, roundId, false);
        _reveal(bob, cid, roundId, true);
        _reveal(carol, cid, roundId, true);
        _reveal(dave, cid, roundId, true);

        // Verify pools before settlement
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, cid, roundId);
        assertEq(round.revealedCount, 4, "All 4 votes revealed");

        // weightedDownPool = 100e6 * 10000 / 10000 = 100e6
        // weightedUpPool = 3 * (100e6 * 2500 / 10000) = 3 * 25e6 = 75e6
        assertEq(round.weightedDownPool, 100e6, "weighted DOWN pool = 100 cREP (epoch-1 full weight)");
        assertEq(round.weightedUpPool, 75e6, "weighted UP pool = 75 cREP (3x epoch-2 at 25% each)");

        // thresholdReachedAt was set when 3rd vote was revealed (minVoters = 3)
        assertGt(round.thresholdReachedAt, 0, "threshold reached");

        _settle(cid, roundId);

        RoundLib.Round memory settled = RoundEngineReadHelpers.round(engine, cid, roundId);
        assertEq(uint256(settled.state), uint256(RoundLib.RoundState.Settled), "Round settled");
        assertFalse(settled.upWins, "DOWN wins despite raw UP majority - epoch weighting prevails");
    }

    // =========================================================================
    // TEST 2: EpochWeightRewards (4:1 ratio)
    // =========================================================================

    /// @notice Epoch-1 voters earn 4x rewards per cREP vs epoch-2 voters.
    ///
    ///   Alice: UP, 100 cREP, epoch-1 → effectiveStake = 100 cREP
    ///   Bob:   DOWN, 100 cREP, epoch-1 → effectiveStake = 100 cREP
    ///   Carol: UP, 100 cREP, epoch-2 → effectiveStake = 25 cREP
    ///
    ///   UP wins. weightedUpPool = 100 + 25 = 125 cREP.
    ///   Alice share = 100/125 of voterPool, Carol share = 25/125 of voterPool.
    ///   So Alice earns 4x the reward Carol earns (per cREP staked).
    function test_EpochWeightRewards() public {
        uint256 cid = _submit();
        uint256 roundStart = block.timestamp;

        // --- Epoch-1 commits ---
        _commit(alice, cid, true, 100e6); // UP, epoch-1
        _commit(bob, cid, false, 100e6); // DOWN, epoch-1

        // --- Epoch-2 commit ---
        vm.warp(roundStart + EPOCH_DURATION + 1);
        _commit(carol, cid, true, 100e6); // UP, epoch-2

        uint256 roundId = engine.currentRoundId(cid);

        // Warp past epoch-2 end to allow all reveals
        vm.warp(roundStart + 2 * EPOCH_DURATION + 1);

        _reveal(alice, cid, roundId, true);
        _reveal(bob, cid, roundId, false);
        _reveal(carol, cid, roundId, true);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, cid, roundId);
        assertGt(round.thresholdReachedAt, 0, "threshold reached after 3 reveals");

        // weightedUpPool = 100e6 + 25e6 = 125e6
        // weightedDownPool = 100e6
        assertEq(round.weightedUpPool, 125e6, "weighted UP pool = 125 cREP");
        assertEq(round.weightedDownPool, 100e6, "weighted DOWN pool = 100 cREP");

        // Record balances before settlement + claims
        uint256 aliceBefore = crepToken.balanceOf(alice);
        uint256 carolBefore = crepToken.balanceOf(carol);

        _settle(cid, roundId);

        RoundLib.Round memory settled = RoundEngineReadHelpers.round(engine, cid, roundId);
        assertEq(uint256(settled.state), uint256(RoundLib.RoundState.Settled), "Round settled");
        assertTrue(settled.upWins, "UP wins (weighted UP pool 125 > DOWN pool 100)");

        // Retrieve voter pool (distribution of losing side minus fees)
        uint256 voterPool = engine.roundVoterPool(cid, roundId);
        uint256 weightedWinningStake = engine.roundWinningStake(cid, roundId);

        // Claim rewards
        vm.prank(alice);
        distributor.claimReward(cid, roundId);
        vm.prank(carol);
        distributor.claimReward(cid, roundId);

        uint256 aliceGain = crepToken.balanceOf(alice) - aliceBefore;
        uint256 carolGain = crepToken.balanceOf(carol) - carolBefore;

        // Alice received her stake back (100e6) + her share of voterPool
        // Carol received her stake back (100e6) + her share of voterPool
        // Net reward over returned stake:
        //   Alice reward = (100e6 / weightedWinningStake) * voterPool
        //   Carol reward = (25e6 / weightedWinningStake) * voterPool
        // ratio = 4:1
        assertGt(aliceGain, carolGain, "Alice earns more than Carol");

        // Verify the 4:1 ratio by computing rewards excluding the returned stake
        uint256 aliceReward = aliceGain - 100e6; // strip stake return
        uint256 carolReward = carolGain - 100e6; // strip stake return

        // Allow ±1 token rounding. Use voterPool and weightedWinningStake for exact check.
        uint256 aliceExpected = (100e6 * voterPool) / weightedWinningStake;
        uint256 carolExpected = (25e6 * voterPool) / weightedWinningStake;

        assertApproxEqAbs(aliceReward, aliceExpected, 1, "Alice reward proportional to effective stake 100");
        assertApproxEqAbs(carolReward, carolExpected, 1, "Carol reward proportional to effective stake 25");

        // The 4:1 ratio check (within 1 token)
        assertApproxEqAbs(aliceReward, 4 * carolReward, 4, "Alice reward ~4x Carol reward");
    }

    // =========================================================================
    // TEST 3: MinVotersSettlement (exactly 3 voters in epoch-1, settles)
    // =========================================================================

    /// @notice Exactly minVoters=3 all commit and reveal in epoch-1. Settlement succeeds
    ///         immediately after all votes are revealed.
    function test_MinVotersSettlement() public {
        uint256 cid = _submit();
        uint256 roundStart = block.timestamp;

        // 3 voters commit in epoch-1: 2 UP, 1 DOWN
        _commit(alice, cid, true, 50e6);
        _commit(bob, cid, true, 50e6);
        _commit(carol, cid, false, 50e6);

        uint256 roundId = engine.currentRoundId(cid);

        // Warp past epoch-1 end to make commits revealable
        vm.warp(roundStart + EPOCH_DURATION + 1);

        _reveal(alice, cid, roundId, true);
        _reveal(bob, cid, roundId, true);
        _reveal(carol, cid, roundId, false);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, cid, roundId);
        assertEq(round.revealedCount, 3, "3 votes revealed");
        assertGt(round.thresholdReachedAt, 0, "threshold reached at 3rd reveal");

        _settle(cid, roundId);

        RoundLib.Round memory settled = RoundEngineReadHelpers.round(engine, cid, roundId);
        assertEq(uint256(settled.state), uint256(RoundLib.RoundState.Settled), "Round settled with exactly 3 voters");
        assertTrue(settled.upWins, "UP wins (100 weighted vs 50 weighted, all epoch-1)");
    }

    // =========================================================================
    // TEST 4: ExpiredRoundCancellation (only 2 voters over 7 days)
    // =========================================================================

    /// @notice Only 2 voters commit over the full maxDuration window. Round cannot
    ///         settle (minVoters=3) and is eligible for cancelExpiredRound.
    function test_ExpiredRoundCancellation() public {
        uint256 cid = _submit();
        uint256 roundStart = block.timestamp;

        // Only alice and bob commit - not enough to reach minVoters=3
        _commit(alice, cid, true, 50e6);
        _commit(bob, cid, false, 50e6);

        uint256 roundId = engine.currentRoundId(cid);

        // Warp past maxDuration (7 days) without any more commits
        vm.warp(roundStart + MAX_DURATION + 1);

        // cancelExpiredRound should succeed
        engine.cancelExpiredRound(cid, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, cid, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Cancelled), "Round cancelled after expiry");

        // Voters should be able to claim refunds
        uint256 aliceBefore = crepToken.balanceOf(alice);
        uint256 bobBefore = crepToken.balanceOf(bob);

        // claimCancelledRoundRefund looks up the voter's commit from internal mapping
        vm.prank(alice);
        engine.claimCancelledRoundRefund(cid, roundId);

        vm.prank(bob);
        engine.claimCancelledRoundRefund(cid, roundId);

        assertEq(crepToken.balanceOf(alice) - aliceBefore, 50e6, "Alice refunded full stake");
        assertEq(crepToken.balanceOf(bob) - bobBefore, 50e6, "Bob refunded full stake");
    }

    // =========================================================================
    // TEST 5: ConsensusSubsidy (all voters unanimous UP, losingPool = 0)
    // =========================================================================

    /// @notice All 3 voters vote UP (unanimous). losingPool = 0, so subsidy is paid
    ///         from the consensus reserve instead of from losers' stakes.
    ///         The reserve decreases by the subsidy amount, and winners receive stake + subsidy share.
    function test_ConsensusSubsidy() public {
        uint256 cid = _submit();
        uint256 roundStart = block.timestamp;

        uint256 reserveBefore = engine.consensusReserve();

        // 3 unanimous UP voters (epoch-1)
        _commit(alice, cid, true, 100e6);
        _commit(bob, cid, true, 100e6);
        _commit(carol, cid, true, 100e6);

        uint256 roundId = engine.currentRoundId(cid);

        // Warp past epoch-1 end
        vm.warp(roundStart + EPOCH_DURATION + 1);

        _reveal(alice, cid, roundId, true);
        _reveal(bob, cid, roundId, true);
        _reveal(carol, cid, roundId, true);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, cid, roundId);
        assertEq(round.revealedCount, 3, "3 votes revealed");
        assertEq(round.downPool, 0, "No DOWN votes - unanimous");
        assertGt(round.thresholdReachedAt, 0, "threshold reached");

        _settle(cid, roundId);

        RoundLib.Round memory settled = RoundEngineReadHelpers.round(engine, cid, roundId);
        assertEq(uint256(settled.state), uint256(RoundLib.RoundState.Settled), "Round settled");
        assertTrue(settled.upWins, "UP wins (unanimous)");

        // Consensus reserve should have decreased (subsidy paid out)
        uint256 reserveAfter = engine.consensusReserve();
        assertLt(reserveAfter, reserveBefore, "Consensus reserve decreased - subsidy paid");

        uint256 subsidyPaid = reserveBefore - reserveAfter;
        assertGt(subsidyPaid, 0, "Non-zero subsidy distributed to winners");

        // Voter pool should be non-zero (funded by consensus subsidy)
        uint256 voterPool = engine.roundVoterPool(cid, roundId);
        assertGt(voterPool, 0, "Voter pool non-zero - subsidy distributed");

        // Alice can claim her stake + subsidy share
        uint256 aliceBefore = crepToken.balanceOf(alice);
        vm.prank(alice);
        distributor.claimReward(cid, roundId);
        uint256 aliceAfter = crepToken.balanceOf(alice);
        assertGt(aliceAfter, aliceBefore, "Alice received tokens back");
        // Alice gets her 100 cREP stake returned at minimum
        assertGe(aliceAfter - aliceBefore, 100e6, "Alice gets at least her full stake back");
    }
}
