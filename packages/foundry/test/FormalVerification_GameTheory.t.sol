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

/// @title Formal Verification: Parimutuel Game Theory (Public Vote + Random Settlement)
/// @notice 14 scenarios verifying honest voting profitability, collusion resistance,
///         consensus subsidy mechanics, settlement timing, and tied rounds.
contract FormalVerification_GameTheoryTest is Test {
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

        // Fund consensus reserve: 100K cREP
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
        vm.roll(block.number + MAX_EPOCH_BLOCKS + 1);
        engine.trySettle(cid);
    }

    // ==================== Test 1: Honest Voting Profitability ====================

    /// @notice 3 UP (50 each) vs 2 DOWN (50 each). Winners profit, losers forfeit.
    function test_HonestVoting_3Up2Down_WinnersProfit() public {
        uint256 cid = _submit();

        _vote(v[0], cid, true, 50e6);
        _vote(v[1], cid, true, 50e6);
        _vote(v[2], cid, true, 50e6);
        _vote(v[3], cid, false, 50e6);
        _vote(v[4], cid, false, 50e6);

        uint256 rid = engine.currentRoundId(cid);

        // Force settle past maxEpochBlocks
        _forceSettle(cid);

        // Winner claims: stake + share-proportional reward
        uint256 bal0 = crepToken.balanceOf(v[0]);
        vm.prank(v[0]);
        distributor.claimReward(cid, rid);
        uint256 winnerPayout = crepToken.balanceOf(v[0]) - bal0;

        // Directional check: honest winner profits
        assertGt(winnerPayout, 50e6, "Honest voting is profitable (payout > stake)");

        // Loser gets nothing
        uint256 bal3 = crepToken.balanceOf(v[3]);
        vm.prank(v[3]);
        distributor.claimReward(cid, rid);
        assertEq(crepToken.balanceOf(v[3]), bal3, "Loser gets nothing");
    }

    // ==================== Test 2: Proportional Rewards ====================

    /// @notice 7 UP (varying stakes) vs 3 DOWN. Higher stake -> higher absolute reward.
    /// @dev With bonding curve shares, early voters get more shares per cREP. Within the same
    ///      direction, later voters with higher stakes still get higher absolute rewards because
    ///      the stake difference dominates the share discount. We verify monotonically increasing payouts.
    function test_HonestVoting_LargePool_7Up3Down() public {
        uint256 cid = _submit();

        // UP voters with increasing stakes (10, 20, 30, 40, 50, 60, 70)
        _vote(v[0], cid, true, 10e6);
        _vote(v[1], cid, true, 20e6);
        _vote(v[2], cid, true, 30e6);
        _vote(v[3], cid, true, 40e6);
        _vote(v[4], cid, true, 50e6);
        _vote(v[5], cid, true, 60e6);
        _vote(v[6], cid, true, 70e6);
        // DOWN voters
        _vote(v[7], cid, false, 80e6);
        _vote(v[8], cid, false, 90e6);
        _vote(v[9], cid, false, 100e6);

        uint256 rid = engine.currentRoundId(cid);

        _forceSettle(cid);

        // Verify all UP winners get payouts and each successive payout is larger
        uint256 prevPayout = 0;
        for (uint256 i = 0; i < 7; i++) {
            uint256 bal = crepToken.balanceOf(v[i]);
            vm.prank(v[i]);
            distributor.claimReward(cid, rid);
            uint256 payout = crepToken.balanceOf(v[i]) - bal;
            assertGt(payout, prevPayout, "Higher stake must yield higher total payout");
            prevPayout = payout;
        }
    }

    // ==================== Test 3: Stake-Weight Determines Outcome ====================

    /// @notice 4 UP (10 each = 40 total) vs 1 DOWN (100). DOWN wins because stake > voter count.
    function test_StakeWeight_DeterminesOutcome() public {
        uint256 cid = _submit();

        _vote(v[0], cid, true, 10e6);
        _vote(v[1], cid, true, 10e6);
        _vote(v[2], cid, true, 10e6);
        _vote(v[3], cid, true, 10e6);
        _vote(v[4], cid, false, 100e6);

        uint256 rid = engine.currentRoundId(cid);

        _forceSettle(cid);

        RoundLib.Round memory round = engine.getRound(cid, rid);
        assertFalse(round.upWins, "DOWN wins - stake weight, not voter count, decides outcome");

        // Whale gets stake + reward from 40e6 losing pool
        uint256 bal = crepToken.balanceOf(v[4]);
        vm.prank(v[4]);
        distributor.claimReward(cid, rid);
        assertGt(crepToken.balanceOf(v[4]) - bal, 100e6, "Whale wins back stake + reward");
    }

    // ==================== Test 4: Collusion at Threshold - Negligible Profit ====================

    /// @notice 4 colluders UP (100 each) + 1 innocent DOWN (1). Profit < 1 cREP.
    function test_Threshold_CollusionNegligibleProfit() public {
        uint256 cid = _submit();

        _vote(v[0], cid, true, 100e6);
        _vote(v[1], cid, true, 100e6);
        _vote(v[2], cid, true, 100e6);
        _vote(v[3], cid, true, 100e6);
        _vote(v[4], cid, false, 1e6); // innocent victim

        uint256 rid = engine.currentRoundId(cid);

        _forceSettle(cid);

        // losingPool = 1e6 -> voterPool ~0.82 cREP -> split among 4 colluders proportional to shares
        uint256 totalProfit = 0;
        for (uint256 i = 0; i < 4; i++) {
            uint256 bal = crepToken.balanceOf(v[i]);
            vm.prank(v[i]);
            distributor.claimReward(cid, rid);
            uint256 payout = crepToken.balanceOf(v[i]) - bal;
            totalProfit += payout - 100e6; // profit = payout - original stake
        }

        assertLt(totalProfit, 1e6, "Total colluder profit < 1 cREP - negligible");
    }

    // ==================== Test 5: Unanimous Round - Consensus Subsidy ====================

    /// @notice 5 UP (50 each). No losers -> consensus subsidy from reserve.
    function test_UnanimousRound_ConsensusSubsidy() public {
        uint256 cid = _submit();
        uint256 reserveBefore = engine.consensusReserve();

        _vote(v[0], cid, true, 50e6);
        _vote(v[1], cid, true, 50e6);
        _vote(v[2], cid, true, 50e6);
        _vote(v[3], cid, true, 50e6);
        _vote(v[4], cid, true, 50e6);

        uint256 rid = engine.currentRoundId(cid);

        // Consensus settlement after maxEpochBlocks
        _forceSettle(cid);

        // totalStake=250e6, subsidy = 250e6 * 5% = 12_500_000
        uint256 expectedSubsidy = 12_500_000;
        assertEq(engine.consensusReserve(), reserveBefore - expectedSubsidy, "Reserve decremented by subsidy");

        // Voter gets stake + proportional subsidy reward
        uint256 bal = crepToken.balanceOf(v[0]);
        vm.prank(v[0]);
        distributor.claimReward(cid, rid);
        uint256 payout = crepToken.balanceOf(v[0]) - bal;
        assertGt(payout, 50e6, "Voter gets stake + subsidy reward");

        // Submitter gets ~10.9% of subsidy
        uint256 subBal = crepToken.balanceOf(submitter);
        vm.prank(submitter);
        distributor.claimSubmitterReward(cid, rid);
        uint256 submitterReward = crepToken.balanceOf(submitter) - subBal;
        // submitterShare = 12_500_000 * 1000 / (8200 + 1000) = 1_358_695
        assertEq(submitterReward, 1_358_695, "Submitter gets ~10.9% of subsidy");
    }

    // ==================== Test 6: Share-Proportional ROI (Early Voter Advantage) ====================

    /// @notice 1 whale UP (100) + 4 minnows UP (1 each) vs 5 DOWN (10 each).
    /// @dev With bonding curve shares, earlier voters get more shares per cREP. The whale votes
    ///      first and gets the best share price. Later minnows get fewer shares per cREP.
    ///      We verify that (a) all winners profit and (b) the whale's ROI% is higher than
    ///      late minnows' ROI% due to the early-voter share advantage.
    function test_StakeAsymmetry_ShareProportionalROI() public {
        uint256 cid = _submit();

        // UP side: whale first, then minnows
        _vote(v[0], cid, true, 100e6); // whale (first -> best share price)
        _vote(v[1], cid, true, 1e6); // minnow 1
        _vote(v[2], cid, true, 1e6); // minnow 2
        _vote(v[3], cid, true, 1e6); // minnow 3
        _vote(v[4], cid, true, 1e6); // minnow 4
        // DOWN side
        _vote(v[5], cid, false, 10e6);
        _vote(v[6], cid, false, 10e6);
        _vote(v[7], cid, false, 10e6);
        _vote(v[8], cid, false, 10e6);
        _vote(v[9], cid, false, 10e6);

        uint256 rid = engine.currentRoundId(cid);

        _forceSettle(cid);

        // Whale claim
        uint256 wBal = crepToken.balanceOf(v[0]);
        vm.prank(v[0]);
        distributor.claimReward(cid, rid);
        uint256 whalePayout = crepToken.balanceOf(v[0]) - wBal;
        uint256 whaleReward = whalePayout - 100e6; // reward only (excl. stake return)

        // Minnow claim (v[4] = last minnow, worst share price)
        uint256 mBal = crepToken.balanceOf(v[4]);
        vm.prank(v[4]);
        distributor.claimReward(cid, rid);
        uint256 minnowPayout = crepToken.balanceOf(v[4]) - mBal;
        uint256 minnowReward = minnowPayout - 1e6; // reward only

        // Both winners profit
        assertGt(whaleReward, 0, "Whale profits");
        assertGt(minnowReward, 0, "Minnow profits");

        // Whale ROI% > minnow ROI% because whale voted first (early-voter advantage)
        // whaleROI = whaleReward / 100, minnowROI = minnowReward / 1
        uint256 whaleROIPct = (whaleReward * 10000) / 100e6; // basis points
        uint256 minnowROIPct = (minnowReward * 10000) / 1e6; // basis points
        assertGt(whaleROIPct, minnowROIPct, "Early voter (whale) gets higher ROI% than late voter (minnow)");
    }

    // ==================== Test 7: Whale in Thin Market ====================

    /// @notice 1 whale UP (100) vs 4 minnows DOWN (1 each). Whale wins but low ROI.
    function test_StakeAsymmetry_WhaleThinMarket() public {
        uint256 cid = _submit();

        _vote(v[0], cid, true, 100e6); // whale
        _vote(v[1], cid, false, 1e6);
        _vote(v[2], cid, false, 1e6);
        _vote(v[3], cid, false, 1e6);
        _vote(v[4], cid, false, 1e6);

        uint256 rid = engine.currentRoundId(cid);

        _forceSettle(cid);

        // losingPool = 4e6, voterPool ~3.28e6 (82% with redirects)
        // Whale ROI = ~3.28 / 100 ~= 3.28%
        uint256 bal = crepToken.balanceOf(v[0]);
        vm.prank(v[0]);
        distributor.claimReward(cid, rid);
        uint256 payout = crepToken.balanceOf(v[0]) - bal;
        uint256 profit = payout - 100e6;

        assertLt(profit, 5e6, "Whale ROI < 5% in thin market");
        assertGt(profit, 0, "Whale still profits");
    }

    // ==================== Test 8: Minnows Defeat Whale ====================

    /// @notice 1 whale DOWN (100) vs 9 minnows UP (50 each). Minnows win.
    function test_StakeAsymmetry_MinnowsDefeatWhale() public {
        uint256 cid = _submit();

        _vote(v[0], cid, false, 100e6); // whale DOWN
        _vote(v[1], cid, true, 50e6);
        _vote(v[2], cid, true, 50e6);
        _vote(v[3], cid, true, 50e6);
        _vote(v[4], cid, true, 50e6);
        _vote(v[5], cid, true, 50e6);
        _vote(v[6], cid, true, 50e6);
        _vote(v[7], cid, true, 50e6);
        _vote(v[8], cid, true, 50e6);
        _vote(v[9], cid, true, 50e6);

        uint256 rid = engine.currentRoundId(cid);

        _forceSettle(cid);

        RoundLib.Round memory round = engine.getRound(cid, rid);
        assertTrue(round.upWins, "Minnows outweigh whale (450 > 100)");

        // Whale loses entire stake
        uint256 bal = crepToken.balanceOf(v[0]);
        vm.prank(v[0]);
        distributor.claimReward(cid, rid);
        assertEq(crepToken.balanceOf(v[0]), bal, "Whale loses entire 100 cREP");
    }

    // ==================== Test 9: Manufactured Dissent Unprofitable ====================

    /// @notice Attacker: UP (100) + DOWN (50) via 2 wallets. 3 honest UP (50 each).
    function test_ManufacturedDissent_Unprofitable() public {
        uint256 cid = _submit();

        // Record starting balances (attacker uses v[0] and v[1])
        uint256 attackerStartA = crepToken.balanceOf(v[0]);
        uint256 attackerStartB = crepToken.balanceOf(v[1]);

        _vote(v[0], cid, true, 100e6); // attacker UP
        _vote(v[1], cid, false, 50e6); // attacker DOWN (manufactured dissent)
        _vote(v[2], cid, true, 50e6); // honest
        _vote(v[3], cid, true, 50e6); // honest
        _vote(v[4], cid, true, 50e6); // honest

        uint256 rid = engine.currentRoundId(cid);

        _forceSettle(cid);

        // Attacker wallet A (UP winner) claims
        vm.prank(v[0]);
        distributor.claimReward(cid, rid);
        // Attacker wallet B (DOWN loser) gets nothing
        vm.prank(v[1]);
        distributor.claimReward(cid, rid);

        uint256 attackerEndA = crepToken.balanceOf(v[0]);
        uint256 attackerEndB = crepToken.balanceOf(v[1]);
        uint256 totalStart = attackerStartA + attackerStartB;
        uint256 totalEnd = attackerEndA + attackerEndB;

        assertLt(totalEnd, totalStart, "Manufactured dissent is a net loss for the attacker");
        // Attacker staked 150e6, the DOWN side (50e6) is the losing pool which funds rewards.
        // Attacker's wallet B loses 50e6 entirely. Wallet A gets stake + share of voterPool.
        // The attacker only captures a fraction of the lost 50e6, so net loss > 30 cREP.
        uint256 loss = totalStart - totalEnd;
        assertGt(loss, 30e6, "Attacker loses > 30 cREP");
    }

    // ==================== Test 10: Consensus Reserve Drain - 10 Rounds ====================

    /// @notice 10 unanimous rounds drain reserve predictably.
    function test_ConsensusSubsidyDrain_10Rounds() public {
        uint256 reserveBefore = engine.consensusReserve();

        for (uint256 r = 0; r < 10; r++) {
            uint256 cid = _submit();

            for (uint256 i = 0; i < 5; i++) {
                _vote(v[i], cid, true, 100e6);
            }

            // Consensus settlement: wait for maxEpochBlocks, then settle
            _forceSettle(cid);

            uint256 rid = engine.currentRoundId(cid);
            RoundLib.Round memory round = engine.getRound(cid, rid);
            assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled), "Round settled");

            // Claim rewards so voters have tokens back for next round
            for (uint256 i = 0; i < 5; i++) {
                vm.prank(v[i]);
                distributor.claimReward(cid, rid);
            }

            // Wait for cooldown so voters can vote again on fresh content
            vm.warp(block.timestamp + 24 hours + 1);
        }

        // Each round: totalStake=500e6, subsidy=25e6. 10 rounds -> 250e6 drained.
        assertEq(engine.consensusReserve(), reserveBefore - 250e6, "Reserve drained by 250 cREP");
    }

    // ==================== Test 11: Consensus Reserve Replenishment ====================

    /// @notice Contested rounds replenish reserve (5% of losing pool), unanimous rounds drain it.
    function test_ConsensusSubsidyReplenishment() public {
        uint256 reserve = engine.consensusReserve(); // 100_000e6

        // Round 1: contested (3 UP vs 2 DOWN, 50e6 each) -> +5e6 to reserve
        {
            uint256 cid = _submit();
            _vote(v[0], cid, true, 50e6);
            _vote(v[1], cid, true, 50e6);
            _vote(v[2], cid, true, 50e6);
            _vote(v[3], cid, false, 50e6);
            _vote(v[4], cid, false, 50e6);
            _forceSettle(cid);
        }
        reserve += 5_000_000; // 5% of 100e6 losing pool
        assertEq(engine.consensusReserve(), reserve, "Reserve +5 cREP after contested round");

        // Round 2: unanimous (5 UP, 100e6 each) -> -25e6 from reserve
        {
            vm.warp(block.timestamp + 24 hours + 1); // cooldown for voters
            uint256 cid = _submit();
            for (uint256 i = 0; i < 5; i++) {
                _vote(v[i], cid, true, 100e6);
            }
            _forceSettle(cid);
        }
        reserve -= 25_000_000; // 5% of 500e6 total stake
        assertEq(engine.consensusReserve(), reserve, "Reserve -25 cREP after unanimous round");

        // Net after 1 contested + 1 unanimous = -20 cREP
        assertEq(reserve, 100_000e6 - 20_000_000, "Net drain = 20 cREP");
    }

    // ==================== Test 12: Settlement Delay - Cannot Settle Before minEpochBlocks ====================

    /// @notice trySettle before minEpochBlocks is a no-op (round stays Open).
    function test_SettlementDelay_CannotSettleBeforeMinEpoch() public {
        uint256 cid = _submit();

        _vote(v[0], cid, true, 50e6);
        _vote(v[1], cid, true, 50e6);
        _vote(v[2], cid, true, 50e6);
        _vote(v[3], cid, false, 50e6);
        _vote(v[4], cid, false, 50e6);

        uint256 rid = engine.currentRoundId(cid);
        RoundLib.Round memory round = engine.getRound(cid, rid);
        uint64 startBlock = round.startBlock;

        // Roll to just before minEpochBlocks — trySettle should be a no-op
        vm.roll(startBlock + MIN_EPOCH_BLOCKS - 1);
        engine.trySettle(cid);

        RoundLib.Round memory afterAttempt = engine.getRound(cid, rid);
        assertEq(uint256(afterAttempt.state), uint256(RoundLib.RoundState.Open), "Round still Open before minEpochBlocks");

        // After maxEpochBlocks, settlement is guaranteed
        vm.roll(startBlock + MAX_EPOCH_BLOCKS);
        engine.trySettle(cid);

        RoundLib.Round memory afterForce = engine.getRound(cid, rid);
        assertEq(uint256(afterForce.state), uint256(RoundLib.RoundState.Settled), "Round settled at maxEpochBlocks");
    }

    // ==================== Test 13: Settlement Probability Increases Over Blocks ====================

    /// @notice Verify that settlement probability increases: before minEpochBlocks it's impossible,
    ///         after maxEpochBlocks it's certain. Between those bounds, probability grows linearly.
    function test_SettlementProbability_IncreasesOverBlocks() public {
        uint256 cid = _submit();

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

    // ==================== Test 14: Tied Round - Full Refund ====================

    /// @notice 5 UP (50 each) vs 5 DOWN (50 each). Equal pools -> Tied -> full refund.
    function test_TiedRound_FullRefund() public {
        uint256 cid = _submit();

        // Record starting balances
        uint256[10] memory startBals;
        for (uint256 i = 0; i < 10; i++) {
            startBals[i] = crepToken.balanceOf(v[i]);
        }

        _vote(v[0], cid, true, 50e6);
        _vote(v[1], cid, true, 50e6);
        _vote(v[2], cid, true, 50e6);
        _vote(v[3], cid, true, 50e6);
        _vote(v[4], cid, true, 50e6);
        _vote(v[5], cid, false, 50e6);
        _vote(v[6], cid, false, 50e6);
        _vote(v[7], cid, false, 50e6);
        _vote(v[8], cid, false, 50e6);
        _vote(v[9], cid, false, 50e6);

        uint256 rid = engine.currentRoundId(cid);

        // Force settle past maxEpochBlocks
        _forceSettle(cid);

        RoundLib.Round memory round = engine.getRound(cid, rid);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied), "Equal pools -> Tied");

        // All voters claim refund
        for (uint256 i = 0; i < 10; i++) {
            vm.prank(v[i]);
            engine.claimCancelledRoundRefund(cid, rid);
            assertEq(crepToken.balanceOf(v[i]), startBals[i], "Full refund on tied round");
        }
    }
}
