// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { RewardMath } from "../contracts/libraries/RewardMath.sol";

/// @title Game-Theory Improvement Tests
/// @notice Integration tests verifying the four game-theory mitigations:
///         1. baseRateBps 1→3 (higher random settlement rate)
///         2. SLASH_RATING_THRESHOLD 10→25 (reachable slash)
///         3. minVoters 3→5 (harder to seed)
///         4. Consensus subsidy cap at 50 cREP
contract GameTheoryImprovementsTest is Test {
    CuryoReputation crepToken;
    ContentRegistry registry;
    RoundVotingEngine engine;
    RoundRewardDistributor distributor;

    address owner = address(1);
    address submitter = address(2);
    address treasuryAddr = address(3);
    address[20] v; // voter addresses

    uint256 contentNonce;

    function setUp() public {
        for (uint256 i = 0; i < 20; i++) {
            v[i] = address(uint160(100 + i));
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
                    abi.encodeCall(RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry)))
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

        // Use default config (minVoters=5, baseRateBps=3 after contract changes)
        // Override only minEpochBlocks and maxEpochBlocks for test speed
        engine.setConfig(
            10, // minEpochBlocks
            50, // maxEpochBlocks
            7 days, // maxDuration
            5, // minVoters (new default)
            1000, // maxVoters
            3, // baseRateBps (new default: 0.03%)
            0, // growthRateBps
            10, // maxProbBps
            1000e6 // liquidityParam
        );

        // Fund consensus reserve
        crepToken.mint(owner, 200_000e6);
        crepToken.approve(address(engine), 200_000e6);
        engine.fundConsensusReserve(200_000e6);

        // Fund submitter and voters
        crepToken.mint(submitter, 100_000e6);
        for (uint256 i = 0; i < 20; i++) {
            crepToken.mint(v[i], 100_000e6);
        }

        vm.stopPrank();

        vm.warp(1000);
    }

    // ==================== Helpers ====================

    function _submit() internal returns (uint256) {
        contentNonce++;
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        uint256 id = registry.submitContent(
            string(abi.encodePacked("https://t.co/gt", vm.toString(contentNonce))), "Goal", "tag", 0
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
        vm.roll(block.number + 51);
        engine.trySettle(cid);
    }

    // ==================== Test 1: Settlement Probability Higher with baseRateBps=3 ====================

    /// @notice With baseRateBps=3, settlement triggers ~3x more often than baseRateBps=1
    ///         over the same block window. We verify by running many rounds with baseRateBps=3
    ///         vs baseRateBps=1 and comparing settlement counts before maxEpochBlocks.
    function test_SettlementProbability_HigherWithBaseRate3() public {
        // Count settlements in a window of blocks for baseRateBps=3
        uint256 settledRate3 = _runSettlementTrials(3);

        // Now test with baseRateBps=1
        vm.prank(owner);
        engine.setConfig(10, 50, 7 days, 5, 1000, 1, 0, 10, 1000e6);

        uint256 settledRate1 = _runSettlementTrials(1);

        // baseRateBps=3 should settle more often before maxEpochBlocks than baseRateBps=1
        assertGt(settledRate3, settledRate1, "baseRateBps=3 settles more rounds randomly than baseRateBps=1");
    }

    function _runSettlementTrials(uint16 /* baseRate */) internal returns (uint256 settledCount) {
        uint256 trials = 50;

        for (uint256 t = 0; t < trials; t++) {
            uint256 cid = _submit();
            _vote(v[0], cid, true, 10e6);
            _vote(v[1], cid, true, 10e6);
            _vote(v[2], cid, true, 10e6);
            _vote(v[3], cid, false, 10e6);
            _vote(v[4], cid, false, 10e6);

            uint256 rid = engine.currentRoundId(cid);
            RoundLib.Round memory round = engine.getRound(cid, rid);

            // Try settling at each block in the eligible window (before maxEpochBlocks)
            bool settled = false;
            for (uint256 b = round.startBlock + 10; b < round.startBlock + 50; b++) {
                vm.roll(b);
                engine.trySettle(cid);
                RoundLib.Round memory r = engine.getRound(cid, rid);
                if (r.state != RoundLib.RoundState.Open) {
                    settled = true;
                    break;
                }
            }
            if (settled) settledCount++;

            // Force-settle if still open, then claim to free tokens for next iteration
            RoundLib.Round memory current = engine.getRound(cid, rid);
            if (current.state == RoundLib.RoundState.Open) {
                vm.roll(block.number + 51);
                engine.trySettle(cid);
            }
            RoundLib.Round memory finalRound = engine.getRound(cid, rid);
            if (finalRound.state == RoundLib.RoundState.Settled) {
                for (uint256 i = 0; i < 5; i++) {
                    vm.prank(v[i]);
                    distributor.claimReward(cid, rid);
                }
            } else if (
                finalRound.state == RoundLib.RoundState.Tied
                    || finalRound.state == RoundLib.RoundState.Cancelled
            ) {
                for (uint256 i = 0; i < 5; i++) {
                    vm.prank(v[i]);
                    engine.claimCancelledRoundRefund(cid, rid);
                }
            }
            vm.warp(block.timestamp + 24 hours + 1);
        }
    }

    // ==================== Test 2: Slash Threshold Triggers at Rating 20 ====================

    /// @notice Rating driven to ~20 (above old threshold 10, below new 25) → slash triggers.
    function test_SlashThreshold_TriggersAt20() public {
        uint256 cid = _submit();

        // Drive rating down with heavy DOWN voting
        // Need 5 voters minimum, mostly DOWN to push rating low
        _vote(v[0], cid, true, 1e6); // tiny UP to avoid unanimous
        _vote(v[1], cid, false, 50e6);
        _vote(v[2], cid, false, 50e6);
        _vote(v[3], cid, false, 50e6);
        _vote(v[4], cid, false, 50e6);

        // Check rating is below 25
        uint256 rating = registry.getRating(cid);
        assertLt(rating, 25, "Rating below new threshold of 25");
        assertGt(rating, 0, "Rating above 0");

        // Record treasury balance before settlement
        uint256 treasuryBefore = crepToken.balanceOf(treasuryAddr);

        // Advance past grace period (24 hours) and settle
        vm.warp(block.timestamp + 24 hours + 1);
        _forceSettle(cid);

        // The submitter's stake should be slashed (sent to treasury)
        assertTrue(registry.isSubmitterStakeReturned(cid), "Submitter stake processed");
        uint256 treasuryAfter = crepToken.balanceOf(treasuryAddr);
        assertGt(treasuryAfter, treasuryBefore, "Treasury received slashed stake (rating < 25)");
    }

    // ==================== Test 3: No Slash at Rating 30 ====================

    /// @notice Rating above 25 (above new threshold) → no slash.
    function test_SlashThreshold_NoSlashAt30() public {
        uint256 cid = _submit();

        // Push rating down moderately — mix of UP and DOWN to land around 35-40
        // rating = 50 + 50 * (qUp - qDown) / (qUp + qDown + b)
        // With UP=30e6, DOWN=60e6, b=50e6: 50 + 50 * (-30) / 140 = 50 - 10.7 = 39
        _vote(v[0], cid, true, 20e6);
        _vote(v[1], cid, true, 10e6);
        _vote(v[2], cid, false, 30e6);
        _vote(v[3], cid, false, 20e6);
        _vote(v[4], cid, false, 10e6);

        uint256 rating = registry.getRating(cid);
        assertGe(rating, 25, "Rating at or above new threshold of 25");

        // Record treasury balance before settlement
        uint256 treasuryBefore = crepToken.balanceOf(treasuryAddr);

        // Advance past grace period and settle
        vm.warp(block.timestamp + 24 hours + 1);
        _forceSettle(cid);

        // Submitter stake should NOT be slashed — check treasury didn't receive slash funds
        // (treasury may receive the 1% treasury fee from settlement, but NOT the 10 cREP submitter stake)
        uint256 treasuryIncrease = crepToken.balanceOf(treasuryAddr) - treasuryBefore;
        assertLt(treasuryIncrease, 10e6, "Treasury did not receive submitter stake (no slash at rating >= 25)");
    }

    // ==================== Test 4: minVoters=5, Four Voters Cancelled ====================

    /// @notice 4 voters (2-vs-2) cannot settle because minVoters=5. Round expires and gets cancelled.
    function test_MinVoters5_FourVotersCancelled() public {
        uint256 cid = _submit();

        _vote(v[0], cid, true, 50e6);
        _vote(v[1], cid, true, 50e6);
        _vote(v[2], cid, false, 50e6);
        _vote(v[3], cid, false, 50e6);

        uint256 rid = engine.currentRoundId(cid);

        // Try to settle at maxEpochBlocks — should NOT settle (only 4 voters, need 5)
        vm.roll(block.number + 51);
        engine.trySettle(cid);

        RoundLib.Round memory round = engine.getRound(cid, rid);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Open), "Round still open with only 4 voters");

        // Advance past maxDuration to cancel
        vm.warp(block.timestamp + 7 days + 1);
        engine.cancelExpiredRound(cid, rid);

        RoundLib.Round memory cancelled = engine.getRound(cid, rid);
        assertEq(uint256(cancelled.state), uint256(RoundLib.RoundState.Cancelled), "Round cancelled with < minVoters");
    }

    // ==================== Test 5: minVoters=5, Five Voters Settles ====================

    /// @notice 5 voters (3-vs-2) settles normally.
    function test_MinVoters5_FiveVotersSettles() public {
        uint256 cid = _submit();

        _vote(v[0], cid, true, 50e6);
        _vote(v[1], cid, true, 50e6);
        _vote(v[2], cid, true, 50e6);
        _vote(v[3], cid, false, 50e6);
        _vote(v[4], cid, false, 50e6);

        uint256 rid = engine.currentRoundId(cid);

        // Force settle at maxEpochBlocks — should succeed with 5 voters
        _forceSettle(cid);

        RoundLib.Round memory round = engine.getRound(cid, rid);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled), "Round settled with 5 voters");
        assertTrue(round.upWins, "UP side wins (150 vs 100)");
    }

    // ==================== Test 6: Consensus Subsidy Capped at 50 cREP ====================

    /// @notice 20 voters × 100 cREP unanimous → subsidy = 50 cREP (not 100 cREP).
    function test_ConsensusSubsidy_CappedAt50cREP() public {
        uint256 cid = _submit();
        uint256 reserveBefore = engine.consensusReserve();

        // 20 voters × 100 cREP = 2000 cREP total stake
        // 5% of 2000 = 100 cREP desired, but MAX_CONSENSUS_SUBSIDY = 50 cREP
        for (uint256 i = 0; i < 20; i++) {
            _vote(v[i], cid, true, 100e6);
        }

        // Consensus settlement (unanimous round, only UP voters)
        _forceSettle(cid);

        uint256 reserveAfter = engine.consensusReserve();
        uint256 subsidyPaid = reserveBefore - reserveAfter;

        assertEq(subsidyPaid, 50e6, "Consensus subsidy capped at 50 cREP, not 100 cREP");
    }
}
