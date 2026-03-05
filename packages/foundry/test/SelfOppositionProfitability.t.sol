// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test, console2 } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { RewardMath } from "../contracts/libraries/RewardMath.sol";

/// @title Self-Opposition Profitability Analysis
/// @notice Proves whether an attacker voting both UP and DOWN via two wallets is profitable
///         when combined with participation pool rewards across different halving tiers.
/// @dev Attack vector: Attacker controls walletA (votes UP) and walletB (votes DOWN).
///      After settlement, one side wins (stake returned + share of 82% of losing pool)
///      and one side loses (stake forfeited). BOTH wallets claim participation rewards.
///      Question: Do participation rewards offset the guaranteed loss on one side?
///
///      Pool split: 82% voters, 10% submitter, 2% platform, 1% treasury, 5% consensus reserve.
///      Participation reward = stake * rateBps / 10000 (per voter, from ParticipationPool).
///      Tier 0 = 9000 bps (90%), Tier 1 = 4500 bps (45%), Tier 2 = 2250 bps (22.5%).
contract SelfOppositionProfitabilityTest is Test {
    CuryoReputation crepToken;
    ContentRegistry registry;
    RoundVotingEngine engine;
    RoundRewardDistributor distributor;
    ParticipationPool pool;

    address owner = address(1);
    address submitter = address(2);
    address treasuryAddr = address(3);

    // Attacker wallets
    address attackerA = address(10);
    address attackerB = address(11);
    // Honest voter (breaks tie, ensures one attacker side wins)
    address honest = address(12);

    uint256 contentNonce;

    function setUp() public {
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

        // Config: epochDuration=1h, maxDuration=7d, minVoters=3, maxVoters=200
        // minVoters=3: 2 attacker wallets + 1 honest voter
        engine.setConfig(1 hours, 7 days, 3, 200);

        // Fund consensus reserve
        crepToken.mint(owner, 100_000e6);
        crepToken.approve(address(engine), 100_000e6);
        engine.fundConsensusReserve(100_000e6);

        // Set up ParticipationPool
        pool = new ParticipationPool(address(crepToken), owner);
        pool.setAuthorizedCaller(address(engine), true);

        // Fund participation pool with 34M cREP
        crepToken.mint(owner, 34_000_000e6);
        crepToken.approve(address(pool), 34_000_000e6);
        pool.depositPool(34_000_000e6);

        // Connect pool to engine
        engine.setParticipationPool(address(pool));

        // Fund participants
        crepToken.mint(submitter, 100_000e6);
        crepToken.mint(attackerA, 100_000e6);
        crepToken.mint(attackerB, 100_000e6);
        crepToken.mint(honest, 100_000e6);

        vm.stopPrank();

        vm.warp(1000); // Predictable start time
    }

    // ==================== Helpers ====================

    function _submit() internal returns (uint256) {
        contentNonce++;
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        uint256 id = registry.submitContent(
            string(abi.encodePacked("https://example.com/", vm.toString(contentNonce))), "Goal", "tag", 0
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
        vm.warp(r.startTime + 1 hours + 1);
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
            try engine.settleRound(cid, roundId) { } catch { }
        }
    }

    /// @dev Set totalDistributed on ParticipationPool via vm.store (slot 1) to simulate tier transitions.
    function _setPoolTotalDistributed(uint256 n) internal {
        vm.store(address(pool), bytes32(uint256(1)), bytes32(n));
    }

    /// @dev Run self-opposition attack and return net profit/loss for the attacker.
    ///      Attacker votes UP with walletA (stakeA) and DOWN with walletB (stakeB).
    ///      Honest voter votes UP (stakeHonest) to break the tie (UP wins).
    ///      Returns: positive = profit, negative = loss (as int256).
    function _runSelfOppositionAttack(
        uint256 stakeA,
        uint256 stakeB,
        uint256 stakeHonest
    )
        internal
        returns (
            int256 netProfitLoss,
            uint256 participationA,
            uint256 participationB,
            uint256 voterRewardA,
            uint256 lostStakeB
        )
    {
        uint256 cid = _submit();

        // Record starting balances
        uint256 startA = crepToken.balanceOf(attackerA);
        uint256 startB = crepToken.balanceOf(attackerB);

        // Attacker: walletA votes UP, walletB votes DOWN
        _vote(attackerA, cid, true, stakeA);
        _vote(attackerB, cid, false, stakeB);
        // Honest voter votes UP to ensure UP wins
        _vote(honest, cid, true, stakeHonest);

        uint256 rid = engine.getActiveRoundId(cid);

        // Force settle
        _forceSettle(cid);

        // Verify round settled and UP won
        RoundLib.Round memory round = engine.getRound(cid, rid);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled), "Round must be settled");
        assertTrue(round.upWins, "UP side must win (attacker A + honest > attacker B)");

        // Claim voter rewards (winner gets stake + reward, loser gets nothing)
        uint256 balA_before = crepToken.balanceOf(attackerA);
        vm.prank(attackerA);
        distributor.claimReward(cid, rid);
        voterRewardA = crepToken.balanceOf(attackerA) - balA_before;

        // Loser claims (gets nothing)
        uint256 balB_before = crepToken.balanceOf(attackerB);
        vm.prank(attackerB);
        distributor.claimReward(cid, rid);
        uint256 loserPayout = crepToken.balanceOf(attackerB) - balB_before;
        assertEq(loserPayout, 0, "Losing side gets zero from voter reward claim");

        // Claim participation rewards for BOTH attacker wallets
        uint256 balA_beforeParticipation = crepToken.balanceOf(attackerA);
        vm.prank(attackerA);
        engine.claimParticipationReward(cid, rid);
        participationA = crepToken.balanceOf(attackerA) - balA_beforeParticipation;

        uint256 balB_beforeParticipation = crepToken.balanceOf(attackerB);
        vm.prank(attackerB);
        engine.claimParticipationReward(cid, rid);
        participationB = crepToken.balanceOf(attackerB) - balB_beforeParticipation;

        // Calculate net profit/loss
        uint256 endA = crepToken.balanceOf(attackerA);
        uint256 endB = crepToken.balanceOf(attackerB);
        uint256 totalStart = startA + startB;
        uint256 totalEnd = endA + endB;

        lostStakeB = stakeB; // Entire losing stake is forfeited

        if (totalEnd >= totalStart) {
            netProfitLoss = int256(totalEnd - totalStart);
        } else {
            netProfitLoss = -int256(totalStart - totalEnd);
        }
    }

    // ==================== Test 1: Tier 0 (90%) — Asymmetric Stakes ====================

    /// @notice Attacker votes min stake (1 cREP) DOWN, max stake (100 cREP) UP.
    ///         Honest voter votes 50 cREP UP. UP wins.
    ///         Participation reward at 90%: walletA gets 90 cREP, walletB gets 0.9 cREP.
    ///         WalletB loses 1 cREP stake. Attacker keeps most of the losing pool via walletA.
    ///         At tier 0, the attack may be marginally profitable due to 90% participation rewards.
    function test_Tier0_AsymmetricStakes_MinDown_MaxUp() public {
        uint256 stakeA = 100e6; // UP — max stake (will win)
        uint256 stakeB = 1e6;   // DOWN — min stake (will lose)
        uint256 stakeHonest = 50e6; // UP (honest, breaks tie)

        (
            int256 netProfitLoss,
            uint256 participationA,
            uint256 participationB,
            uint256 voterRewardA,
            uint256 lostStakeB
        ) = _runSelfOppositionAttack(stakeA, stakeB, stakeHonest);

        // Log detailed breakdown for analysis
        console2.log("=== Tier 0: Asymmetric (100 UP / 1 DOWN) ===");
        console2.log("Attacker staked total:", stakeA + stakeB);
        console2.log("Voter reward (walletA, includes stake return):", voterRewardA);
        console2.log("Participation reward walletA:", participationA);
        console2.log("Participation reward walletB:", participationB);
        console2.log("Lost stake (walletB):", lostStakeB);

        if (netProfitLoss >= 0) {
            console2.log("NET PROFIT:", uint256(netProfitLoss));
        } else {
            console2.log("NET LOSS:", uint256(-netProfitLoss));
        }

        // At tier 0 (90%):
        // - Participation rewards: 100 * 0.9 + 1 * 0.9 = 90.9 cREP
        // - Lost stake: 1 cREP
        // - The attacker also gets back their 100 cREP stake + share of voter pool
        // - The voter pool = 82% of 1 cREP losing pool = 0.82 cREP
        // - Attacker's share of voter pool = (100 * 10000 / 10000) / (100 * 10000/10000 + 50 * 10000/10000) * 0.82
        //   = 100/150 * 0.82 = 0.5467 cREP
        // - Net from voting game: 0.5467 - 1 = -0.4533 cREP (loss from manufactured dissent)
        // - Net from participation: +90.9 cREP
        // - Total net: ~+90.45 cREP (PROFITABLE at tier 0!)

        // Verify participation rewards are paid at 90% rate
        assertEq(participationA, stakeA * 9000 / 10000, "WalletA participation = 90% of 100 cREP = 90 cREP");
        assertEq(participationB, stakeB * 9000 / 10000, "WalletB participation = 90% of 1 cREP = 0.9 cREP");

        // At tier 0, participation rewards (90.9 cREP) far exceed the loss from self-opposition (~0.45 cREP)
        // The attack IS profitable at tier 0
        assertGt(netProfitLoss, 0, "CRITICAL: Self-opposition IS profitable at tier 0 (90% participation rate)");
    }

    // ==================== Test 2: Tier 0 — Reverse Asymmetric ====================

    /// @notice Attacker votes max stake (100 cREP) DOWN, min stake (1 cREP) UP.
    ///         Honest voter votes 50 cREP UP. UP wins. Attacker loses 100 cREP.
    ///         This is the WORST case for the attacker — large stake on losing side.
    function test_Tier0_AsymmetricStakes_MaxDown_MinUp() public {
        uint256 stakeA = 1e6;    // UP — min stake (will win)
        uint256 stakeB = 100e6;  // DOWN — max stake (will lose)
        uint256 stakeHonest = 50e6; // UP (honest, breaks tie — UP pool > DOWN pool)

        (
            int256 netProfitLoss,
            uint256 participationA,
            uint256 participationB,
            uint256 voterRewardA,
            uint256 lostStakeB
        ) = _runSelfOppositionAttack(stakeA, stakeB, stakeHonest);

        console2.log("=== Tier 0: Reverse Asymmetric (1 UP / 100 DOWN) ===");
        console2.log("Voter reward (walletA, includes stake return):", voterRewardA);
        console2.log("Participation reward walletA:", participationA);
        console2.log("Participation reward walletB:", participationB);
        console2.log("Lost stake (walletB):", lostStakeB);

        if (netProfitLoss >= 0) {
            console2.log("NET PROFIT:", uint256(netProfitLoss));
        } else {
            console2.log("NET LOSS:", uint256(-netProfitLoss));
        }

        // Lost stake = 100 cREP. Participation = 0.9 + 90 = 90.9 cREP.
        // Voter pool from 100 cREP losing pool = 82 cREP.
        // WalletA gets: 1/51 * 82 = ~1.608 cREP reward, + 1 cREP stake return.
        // Net voting game: 1.608 - 100 = -98.39 cREP.
        // Net with participation: -98.39 + 90.9 = -7.49 cREP (LOSS).
        // Even at tier 0, losing a large stake overwhelms participation rewards.
        assertLt(netProfitLoss, 0, "Large losing stake makes self-opposition unprofitable even at tier 0");
    }

    // ==================== Test 3: Tier 1 (45%) — Asymmetric Stakes ====================

    /// @notice Same optimal setup as Test 1 but at tier 1 (45% participation rate).
    ///         Participation rewards are halved, making the attack less profitable.
    function test_Tier1_AsymmetricStakes_MinDown_MaxUp() public {
        // Move to tier 1: totalDistributed = 2M (crossing the 2M boundary)
        _setPoolTotalDistributed(2_000_000e6);
        assertEq(pool.getCurrentRateBps(), 4500, "Tier 1: 45% rate");

        uint256 stakeA = 100e6;
        uint256 stakeB = 1e6;
        uint256 stakeHonest = 50e6;

        (
            int256 netProfitLoss,
            uint256 participationA,
            uint256 participationB,
            uint256 voterRewardA,
        ) = _runSelfOppositionAttack(stakeA, stakeB, stakeHonest);

        console2.log("=== Tier 1: Asymmetric (100 UP / 1 DOWN) ===");
        console2.log("Voter reward (walletA, includes stake return):", voterRewardA);
        console2.log("Participation reward walletA:", participationA);
        console2.log("Participation reward walletB:", participationB);

        if (netProfitLoss >= 0) {
            console2.log("NET PROFIT:", uint256(netProfitLoss));
        } else {
            console2.log("NET LOSS:", uint256(-netProfitLoss));
        }

        // At tier 1 (45%):
        // - Participation: 100 * 0.45 + 1 * 0.45 = 45.45 cREP
        // - Lost stake: 1 cREP
        // - Voter pool share: ~0.547 cREP
        // - Net: ~45.0 cREP (still profitable, but less than tier 0)
        assertEq(participationA, stakeA * 4500 / 10000, "WalletA participation = 45% of 100 cREP = 45 cREP");
        assertEq(participationB, stakeB * 4500 / 10000, "WalletB participation = 45% of 1 cREP = 0.45 cREP");

        // Tier 1 is still profitable because participation rewards (45.45) >> loss (~0.45)
        assertGt(netProfitLoss, 0, "Self-opposition still profitable at tier 1 (45% rate)");
    }

    // ==================== Test 4: Tier 2 (22.5%) — Asymmetric Stakes ====================

    /// @notice At tier 2 (22.5%), participation rewards are still significant relative to min-stake loss.
    function test_Tier2_AsymmetricStakes_MinDown_MaxUp() public {
        // Move to tier 2: totalDistributed = 6M
        _setPoolTotalDistributed(6_000_000e6);
        assertEq(pool.getCurrentRateBps(), 2250, "Tier 2: 22.5% rate");

        uint256 stakeA = 100e6;
        uint256 stakeB = 1e6;
        uint256 stakeHonest = 50e6;

        (
            int256 netProfitLoss,
            uint256 participationA,
            uint256 participationB,
            uint256 voterRewardA,
        ) = _runSelfOppositionAttack(stakeA, stakeB, stakeHonest);

        console2.log("=== Tier 2: Asymmetric (100 UP / 1 DOWN) ===");
        console2.log("Voter reward (walletA, includes stake return):", voterRewardA);
        console2.log("Participation reward walletA:", participationA);
        console2.log("Participation reward walletB:", participationB);

        if (netProfitLoss >= 0) {
            console2.log("NET PROFIT:", uint256(netProfitLoss));
        } else {
            console2.log("NET LOSS:", uint256(-netProfitLoss));
        }

        // At tier 2 (22.5%):
        // - Participation: 100 * 0.225 + 1 * 0.225 = 22.725 cREP
        // - Lost stake: 1 cREP, net voter reward share ~0.547 cREP
        // - Still profitable because participation (22.725) >> self-opposition loss (~0.453)
        assertEq(participationA, stakeA * 2250 / 10000, "WalletA participation = 22.5% of 100 cREP = 22.5 cREP");

        // Even at tier 2, the optimal attack (min losing stake) is profitable
        assertGt(netProfitLoss, 0, "Self-opposition still profitable at tier 2 (22.5% rate)");
    }

    // ==================== Test 5: Tier 3 (11.25%) — Asymmetric Stakes ====================

    /// @notice At tier 3 (11.25%), the attack becomes less efficient but min-losing-stake
    ///         strategy still extracts more from participation pool than it loses.
    function test_Tier3_AsymmetricStakes_MinDown_MaxUp() public {
        // Move to tier 3: totalDistributed = 14M
        _setPoolTotalDistributed(14_000_000e6);
        assertEq(pool.getCurrentRateBps(), 1125, "Tier 3: 11.25% rate");

        uint256 stakeA = 100e6;
        uint256 stakeB = 1e6;
        uint256 stakeHonest = 50e6;

        (
            int256 netProfitLoss,
            uint256 participationA,
            uint256 participationB,
            uint256 voterRewardA,
        ) = _runSelfOppositionAttack(stakeA, stakeB, stakeHonest);

        console2.log("=== Tier 3: Asymmetric (100 UP / 1 DOWN) ===");
        console2.log("Voter reward (walletA, includes stake return):", voterRewardA);
        console2.log("Participation reward walletA:", participationA);
        console2.log("Participation reward walletB:", participationB);

        if (netProfitLoss >= 0) {
            console2.log("NET PROFIT:", uint256(netProfitLoss));
        } else {
            console2.log("NET LOSS:", uint256(-netProfitLoss));
        }

        // At tier 3 (11.25%):
        // - Participation: 100 * 0.1125 + 1 * 0.1125 = 11.36 cREP
        // - Lost stake: 1 cREP, net voter reward share ~0.547 cREP
        // - Still profitable: 11.36 - 0.453 = 10.91 cREP profit
        assertEq(participationA, stakeA * 1125 / 10000, "WalletA participation = 11.25% of 100 cREP");

        // The real question: Is the attack still profitable purely from participation?
        // Yes, because participation on walletA alone (11.25 cREP) >> self-opposition loss (~0.45 cREP)
        assertGt(netProfitLoss, 0, "Self-opposition profitable even at tier 3 with optimal stake ratio");
    }

    // ==================== Test 6: Equal Stakes ====================

    /// @notice Attacker votes 50 cREP UP and 50 cREP DOWN. Equal stakes.
    ///         UP wins because honest voter also votes UP.
    ///         This is a suboptimal strategy — attacker loses a large stake on the losing side.
    function test_Tier0_EqualStakes() public {
        uint256 stakeA = 50e6;
        uint256 stakeB = 50e6;
        uint256 stakeHonest = 50e6;

        (
            int256 netProfitLoss,
            uint256 participationA,
            uint256 participationB,
            uint256 voterRewardA,
            uint256 lostStakeB
        ) = _runSelfOppositionAttack(stakeA, stakeB, stakeHonest);

        console2.log("=== Tier 0: Equal Stakes (50 UP / 50 DOWN) ===");
        console2.log("Voter reward (walletA, includes stake return):", voterRewardA);
        console2.log("Participation reward walletA:", participationA);
        console2.log("Participation reward walletB:", participationB);
        console2.log("Lost stake (walletB):", lostStakeB);

        if (netProfitLoss >= 0) {
            console2.log("NET PROFIT:", uint256(netProfitLoss));
        } else {
            console2.log("NET LOSS:", uint256(-netProfitLoss));
        }

        // At tier 0 (90%), equal stakes:
        // - Participation: 50 * 0.9 + 50 * 0.9 = 90 cREP
        // - Losing pool = 50 cREP. Voter pool = 82% * 50 = 41 cREP.
        // - WalletA share: 50/100 * 41 = 20.5 cREP.
        // - Net voting game: +20.5 - 50 = -29.5 cREP.
        // - Net with participation: -29.5 + 90 = +60.5 cREP (PROFITABLE at tier 0).
        //
        // Even with equal stakes, tier 0 participation (90%) compensates.
        assertGt(netProfitLoss, 0, "Equal stakes: profitable at tier 0 due to 90% participation");
    }

    // ==================== Test 7: Equal Stakes at Tier 2 ====================

    /// @notice Equal stakes at tier 2 (22.5%) — larger loss relative to participation rewards.
    function test_Tier2_EqualStakes() public {
        _setPoolTotalDistributed(6_000_000e6);
        assertEq(pool.getCurrentRateBps(), 2250, "Tier 2: 22.5% rate");

        uint256 stakeA = 50e6;
        uint256 stakeB = 50e6;
        uint256 stakeHonest = 50e6;

        (
            int256 netProfitLoss,
            uint256 participationA,
            uint256 participationB,
            uint256 voterRewardA,
        ) = _runSelfOppositionAttack(stakeA, stakeB, stakeHonest);

        console2.log("=== Tier 2: Equal Stakes (50 UP / 50 DOWN) ===");
        console2.log("Voter reward (walletA, includes stake return):", voterRewardA);
        console2.log("Participation reward walletA:", participationA);
        console2.log("Participation reward walletB:", participationB);

        if (netProfitLoss >= 0) {
            console2.log("NET PROFIT:", uint256(netProfitLoss));
        } else {
            console2.log("NET LOSS:", uint256(-netProfitLoss));
        }

        // At tier 2 (22.5%), equal stakes:
        // - Participation: 50 * 0.225 + 50 * 0.225 = 22.5 cREP
        // - Voting game loss: ~29.5 cREP
        // - Net: 22.5 - 29.5 = -7 cREP (UNPROFITABLE)
        assertLt(netProfitLoss, 0, "Equal stakes: unprofitable at tier 2 (22.5% participation)");
    }

    // ==================== Test 8: Key Insight — Attack Profitability Depends on Stake Ratio ====================

    /// @notice Demonstrates that the OPTIMAL attack minimizes stake on the losing side.
    ///         Compare min-stake-losing (1 DOWN) vs equal-stake (50 DOWN) at tier 2.
    ///         Min-stake-losing is always more profitable because participation on the
    ///         winning side dominates, and the loss is minimized.
    function test_Tier2_OptimalVsSuboptimal_StakeRatio() public {
        _setPoolTotalDistributed(6_000_000e6);

        // Scenario A: Optimal — min losing stake
        uint256 cidA = _submit();
        uint256 startA_total = crepToken.balanceOf(attackerA) + crepToken.balanceOf(attackerB);

        _vote(attackerA, cidA, true, 100e6);
        _vote(attackerB, cidA, false, 1e6);
        _vote(honest, cidA, true, 50e6);

        uint256 ridA = engine.getActiveRoundId(cidA);
        _forceSettle(cidA);

        vm.prank(attackerA);
        distributor.claimReward(cidA, ridA);
        vm.prank(attackerB);
        distributor.claimReward(cidA, ridA);
        vm.prank(attackerA);
        engine.claimParticipationReward(cidA, ridA);
        vm.prank(attackerB);
        engine.claimParticipationReward(cidA, ridA);

        uint256 endA_total = crepToken.balanceOf(attackerA) + crepToken.balanceOf(attackerB);
        int256 profitOptimal;
        if (endA_total >= startA_total) {
            profitOptimal = int256(endA_total - startA_total);
        } else {
            profitOptimal = -int256(startA_total - endA_total);
        }

        // Wait for cooldown before next round
        vm.warp(block.timestamp + 24 hours + 1);

        // Scenario B: Suboptimal — equal stakes
        uint256 cidB = _submit();
        uint256 startB_total = crepToken.balanceOf(attackerA) + crepToken.balanceOf(attackerB);

        _vote(attackerA, cidB, true, 50e6);
        _vote(attackerB, cidB, false, 50e6);
        _vote(honest, cidB, true, 50e6);

        uint256 ridB = engine.getActiveRoundId(cidB);
        _forceSettle(cidB);

        vm.prank(attackerA);
        distributor.claimReward(cidB, ridB);
        vm.prank(attackerB);
        distributor.claimReward(cidB, ridB);
        vm.prank(attackerA);
        engine.claimParticipationReward(cidB, ridB);
        vm.prank(attackerB);
        engine.claimParticipationReward(cidB, ridB);

        uint256 endB_total = crepToken.balanceOf(attackerA) + crepToken.balanceOf(attackerB);
        int256 profitSuboptimal;
        if (endB_total >= startB_total) {
            profitSuboptimal = int256(endB_total - startB_total);
        } else {
            profitSuboptimal = -int256(startB_total - endB_total);
        }

        console2.log("=== Tier 2: Optimal vs Suboptimal Stake Ratio ===");
        if (profitOptimal >= 0) {
            console2.log("Optimal (100/1) profit:", uint256(profitOptimal));
        } else {
            console2.log("Optimal (100/1) loss:", uint256(-profitOptimal));
        }
        if (profitSuboptimal >= 0) {
            console2.log("Suboptimal (50/50) profit:", uint256(profitSuboptimal));
        } else {
            console2.log("Suboptimal (50/50) loss:", uint256(-profitSuboptimal));
        }

        // The optimal strategy (min losing stake) always produces better results
        assertGt(profitOptimal, profitSuboptimal, "Min-losing-stake strategy is strictly better");
    }

    // ==================== Test 9: Profitability is Independent of Honest Voter Stake ====================

    /// @notice Shows that the attacker's profitability mainly comes from participation rewards,
    ///         which are independent of the honest voter's stake amount.
    ///         The honest voter's stake only affects the attacker's share of the voter pool.
    function test_Tier0_ProfitabilityVsHonestStake() public {
        // Small honest stake
        uint256 cidA = _submit();
        uint256 startA = crepToken.balanceOf(attackerA) + crepToken.balanceOf(attackerB);

        _vote(attackerA, cidA, true, 100e6);
        _vote(attackerB, cidA, false, 1e6);
        _vote(honest, cidA, true, 1e6); // Tiny honest stake

        uint256 ridA = engine.getActiveRoundId(cidA);
        _forceSettle(cidA);

        vm.prank(attackerA);
        distributor.claimReward(cidA, ridA);
        vm.prank(attackerB);
        distributor.claimReward(cidA, ridA);
        vm.prank(attackerA);
        engine.claimParticipationReward(cidA, ridA);
        vm.prank(attackerB);
        engine.claimParticipationReward(cidA, ridA);

        uint256 endA = crepToken.balanceOf(attackerA) + crepToken.balanceOf(attackerB);
        int256 profitSmallHonest = int256(endA) - int256(startA);

        vm.warp(block.timestamp + 24 hours + 1);

        // Large honest stake
        uint256 cidB = _submit();
        uint256 startB = crepToken.balanceOf(attackerA) + crepToken.balanceOf(attackerB);

        _vote(attackerA, cidB, true, 100e6);
        _vote(attackerB, cidB, false, 1e6);
        _vote(honest, cidB, true, 100e6); // Large honest stake

        uint256 ridB = engine.getActiveRoundId(cidB);
        _forceSettle(cidB);

        vm.prank(attackerA);
        distributor.claimReward(cidB, ridB);
        vm.prank(attackerB);
        distributor.claimReward(cidB, ridB);
        vm.prank(attackerA);
        engine.claimParticipationReward(cidB, ridB);
        vm.prank(attackerB);
        engine.claimParticipationReward(cidB, ridB);

        uint256 endB = crepToken.balanceOf(attackerA) + crepToken.balanceOf(attackerB);
        int256 profitLargeHonest = int256(endB) - int256(startB);

        console2.log("=== Tier 0: Profit vs Honest Voter Stake ===");
        console2.log("Profit with small honest stake (1 cREP):");
        if (profitSmallHonest >= 0) console2.log("  +", uint256(profitSmallHonest));
        else console2.log("  -", uint256(-profitSmallHonest));
        console2.log("Profit with large honest stake (100 cREP):");
        if (profitLargeHonest >= 0) console2.log("  +", uint256(profitLargeHonest));
        else console2.log("  -", uint256(-profitLargeHonest));

        // Both scenarios are profitable at tier 0
        assertGt(profitSmallHonest, 0, "Profitable with small honest stake");
        assertGt(profitLargeHonest, 0, "Profitable with large honest stake");

        // Participation rewards are the dominant factor (same in both cases)
        // The voter pool share difference is small compared to 90.9 cREP participation
        uint256 profitDiff;
        if (profitSmallHonest > profitLargeHonest) {
            profitDiff = uint256(profitSmallHonest - profitLargeHonest);
        } else {
            profitDiff = uint256(profitLargeHonest - profitSmallHonest);
        }
        // The difference in profit should be small relative to the participation reward
        assertLt(profitDiff, 1e6, "Profit difference is < 1 cREP regardless of honest stake size");
    }

    // ==================== Test 10: Summary — Break-Even Tier Analysis ====================

    /// @notice Demonstrates that with the optimal attack strategy (max UP / min DOWN),
    ///         self-opposition is profitable at ALL participation tiers because:
    ///         - The losing stake is always just 1 cREP (minimum)
    ///         - The participation reward on the winning side alone (stake * rate%) >> 1 cREP
    ///         - Even at the floor rate (1% = 100 bps), reward = 100 * 0.01 = 1 cREP
    ///
    ///         The attack becomes unprofitable only when the participation rate is so low
    ///         that the reward on the winning side cannot cover the minimum lost stake.
    ///         Break-even: stakeA * rateBps / 10000 + stakeB * rateBps / 10000 + voterPoolShare >= stakeB
    ///         Simplified: rateBps >= 10000 * stakeB / (stakeA + stakeB + voterPoolShareEquiv)
    ///         With max/min stakes (100/1): nearly always profitable until rate < ~1%.
    function test_Summary_BreakEvenAnalysis() public pure {
        // Mathematical analysis (no contract interaction needed)
        uint256 stakeWin = 100e6;  // Winning side stake
        uint256 stakeLose = 1e6;   // Losing side stake (minimum)

        // At each tier, calculate net from participation alone (ignoring voter pool share)
        // Participation net = (stakeWin + stakeLose) * rateBps / 10000 - stakeLose
        // This is a lower bound (actual profit is higher due to voter pool share)

        uint256[5] memory rates = [uint256(9000), uint256(4500), uint256(2250), uint256(1125), uint256(562)];
        string[5] memory tierNames = [
            string("Tier 0 (90.0%)"),
            "Tier 1 (45.0%)",
            "Tier 2 (22.5%)",
            "Tier 3 (11.25%)",
            "Tier 4 (5.62%)"
        ];

        for (uint256 i = 0; i < 5; i++) {
            uint256 totalParticipation = (stakeWin + stakeLose) * rates[i] / 10000;
            // Voter pool share from losing pool: ~82% of 1 cREP * (100/150) = ~0.547 cREP
            // This is an approximation assuming honest voter stakes 50 cREP
            uint256 approxVoterPoolShare = (stakeLose * 8200 / 10000) * stakeWin / (stakeWin + 50e6);
            uint256 totalGain = totalParticipation + approxVoterPoolShare;
            bool profitable = totalGain > stakeLose;

            // Log analysis — all tiers should be profitable with optimal stake ratio
            if (profitable) {
                uint256 netProfit = totalGain - stakeLose;
                // Ensure our analysis matches: profitable at all standard tiers
                assert(netProfit > 0);
            }

            // Verify: the break-even rate where participation alone covers the loss
            // participationNet >= 0 when: (stakeWin + stakeLose) * rateBps / 10000 >= stakeLose
            // rateBps >= 10000 * stakeLose / (stakeWin + stakeLose) = 10000 * 1 / 101 = 99 bps (~1%)
            // All standard tiers (down to 562 bps = 5.62%) are well above this threshold
            uint256 breakEvenRate = 10000 * stakeLose / (stakeWin + stakeLose);
            assert(rates[i] > breakEvenRate); // All tiers above break-even
        }

        // The floor rate is 100 bps (1%), and break-even is ~99 bps
        // This means the attack is profitable at EVERY tier, including the floor
        uint256 floorRate = 100; // MIN_RATE_BPS from ParticipationPool
        uint256 breakEven = 10000 * stakeLose / (stakeWin + stakeLose); // ~99
        assert(floorRate > breakEven); // Floor rate (100) > break-even (99)
    }
}
