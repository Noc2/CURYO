// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { HumanReputation } from "../contracts/HumanReputation.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { RewardMath } from "../contracts/libraries/RewardMath.sol";
import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";

/// @title Formal Verification: Parimutuel Game Theory (Public Vote + Random Settlement)
/// @notice 14 scenarios verifying honest voting profitability, collusion resistance,
///         consensus subsidy mechanics, settlement timing, and tied rounds.
contract FormalVerification_GameTheoryTest is VotingTestBase {
    HumanReputation hrepToken;
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

        hrepToken = new HumanReputation(owner, owner);
        hrepToken.grantRole(hrepToken.MINTER_ROLE(), owner);

        ContentRegistry regImpl = new ContentRegistry();
        RoundVotingEngine engImpl = new RoundVotingEngine();
        RoundRewardDistributor distImpl = new RoundRewardDistributor();

        registry = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(regImpl),
                    abi.encodeCall(ContentRegistry.initializeWithTreasury, (owner, owner, owner, address(hrepToken)))
                )
            )
        );
        engine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engImpl),
                    abi.encodeCall(
                        RoundVotingEngine.initialize,
                        (owner, address(hrepToken), address(registry), address(_deployProtocolConfig(owner)))
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
                        (owner, address(hrepToken), address(engine), address(registry))
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

        // Config: epochDuration=1h, maxDuration=7d, minVoters=2, maxVoters=200
        _setTlockRoundConfig(ProtocolConfig(address(engine.protocolConfig())), 1 hours, MAX_DURATION, MIN_VOTERS, 200);

        // Fund consensus reserve: 100K HREP
        hrepToken.mint(owner, 100_000e6);
        hrepToken.approve(address(engine), 100_000e6);
        engine.addToConsensusReserve(100_000e6);

        // Fund submitter and voters
        hrepToken.mint(submitter, 100_000e6);
        for (uint256 i = 0; i < 10; i++) {
            hrepToken.mint(v[i], 100_000e6);
        }

        vm.stopPrank();

        vm.warp(1000); // Predictable start time
    }

    // ==================== Helpers ====================

    function _submit() internal returns (uint256) {
        contentNonce++;
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        uint256 id = _submitContentWithReservation(
            registry, string(abi.encodePacked("https://t.co/gt", vm.toString(contentNonce))), "Goal", "Goal", "tag", 0
        );
        vm.stopPrank();
        return id;
    }

    function _vote(address voter, uint256 cid, bool up, uint256 stake)
        internal
        returns (bytes32 commitKey, bytes32 salt)
    {
        salt = keccak256(abi.encodePacked(voter, block.timestamp, cid));
        bytes memory ciphertext = _testCiphertext(up, salt, cid);
        bytes32 commitHash = _commitHash(up, salt, voter, cid, ciphertext);
        vm.prank(voter);
        hrepToken.approve(address(engine), stake);
        vm.prank(voter);
        engine.commitVote(
            cid,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            commitHash,
            ciphertext,
            stake,
            address(0)
        );
        commitKey = keccak256(abi.encodePacked(voter, commitHash));
    }

    function _forceSettle(uint256 cid) internal {
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, cid);
        if (roundId == 0) return;
        RoundLib.Round memory r = RoundEngineReadHelpers.round(engine, cid, roundId);
        _warpPastTlockRevealTime(uint256(r.startTime) + 1 hours);
        bytes32[] memory keys = RoundEngineReadHelpers.commitKeys(engine, cid, roundId);
        for (uint256 i = 0; i < keys.length; i++) {
            RoundLib.Commit memory c = RoundEngineReadHelpers.commit(engine, cid, roundId, keys[i]);
            if (!c.revealed && c.stakeAmount > 0) {
                (bool up, bytes32 s) = _decodeTestCiphertext(c.ciphertext);
                try engine.revealVoteByCommitKey(cid, roundId, keys[i], up, s) { } catch { }
            }
        }
        RoundLib.Round memory r2 = RoundEngineReadHelpers.round(engine, cid, roundId);
        if (r2.thresholdReachedAt > 0) {
            try engine.settleRound(cid, roundId) { } catch { }
        }
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

        uint256 rid = RoundEngineReadHelpers.activeRoundId(engine, cid);

        // Force settle past maxEpochBlocks
        _forceSettle(cid);

        // Winner claims: stake + share-proportional reward
        uint256 bal0 = hrepToken.balanceOf(v[0]);
        vm.prank(v[0]);
        distributor.claimReward(cid, rid);
        uint256 winnerPayout = hrepToken.balanceOf(v[0]) - bal0;

        // Directional check: honest winner profits
        assertGt(winnerPayout, 50e6, "Honest voting is profitable (payout > stake)");

        // Loser gets the fixed 5% rebate
        uint256 bal3 = hrepToken.balanceOf(v[3]);
        vm.prank(v[3]);
        distributor.claimReward(cid, rid);
        assertEq(hrepToken.balanceOf(v[3]) - bal3, 2_500_000, "Loser gets 5% rebate");
    }

    // ==================== Test 2: Proportional Rewards ====================

    /// @notice 7 UP (varying stakes) vs 3 DOWN. Higher stake -> higher absolute reward.
    /// @dev With bonding curve shares, early voters get more shares per HREP. Within the same
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

        uint256 rid = RoundEngineReadHelpers.activeRoundId(engine, cid);

        _forceSettle(cid);

        // Verify all UP winners get payouts and each successive payout is larger
        uint256 prevPayout = 0;
        for (uint256 i = 0; i < 7; i++) {
            uint256 bal = hrepToken.balanceOf(v[i]);
            vm.prank(v[i]);
            distributor.claimReward(cid, rid);
            uint256 payout = hrepToken.balanceOf(v[i]) - bal;
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

        uint256 rid = RoundEngineReadHelpers.activeRoundId(engine, cid);

        _forceSettle(cid);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, cid, rid);
        assertFalse(round.upWins, "DOWN wins - stake weight, not voter count, decides outcome");

        // Whale gets stake + reward from 40e6 losing pool
        uint256 bal = hrepToken.balanceOf(v[4]);
        vm.prank(v[4]);
        distributor.claimReward(cid, rid);
        assertGt(hrepToken.balanceOf(v[4]) - bal, 100e6, "Whale wins back stake + reward");
    }

    // ==================== Test 4: Collusion at Threshold - Negligible Profit ====================

    /// @notice 4 colluders UP (100 each) + 1 innocent DOWN (1). Profit < 1 HREP.
    function test_Threshold_CollusionNegligibleProfit() public {
        uint256 cid = _submit();

        _vote(v[0], cid, true, 100e6);
        _vote(v[1], cid, true, 100e6);
        _vote(v[2], cid, true, 100e6);
        _vote(v[3], cid, true, 100e6);
        _vote(v[4], cid, false, 1e6); // innocent victim

        uint256 rid = RoundEngineReadHelpers.activeRoundId(engine, cid);

        _forceSettle(cid);

        // losingPool = 1e6 -> voterPool ~0.8 HREP -> split among 4 colluders proportional to shares
        uint256 totalProfit = 0;
        for (uint256 i = 0; i < 4; i++) {
            uint256 bal = hrepToken.balanceOf(v[i]);
            vm.prank(v[i]);
            distributor.claimReward(cid, rid);
            uint256 payout = hrepToken.balanceOf(v[i]) - bal;
            totalProfit += payout - 100e6; // profit = payout - original stake
        }

        assertLt(totalProfit, 1e6, "Total colluder profit < 1 HREP - negligible");
    }

    // ==================== Test 5: Unanimous Round - Consensus Subsidy ====================

    /// @notice 5 UP (50 each). No losers -> consensus subsidy from reserve.
    function test_UnanimousRound_ConsensusSubsidy() public {
        uint256 cid = _submit();
        uint256 reserveBefore = engine.consensusReserve();
        uint256 submitterBefore = hrepToken.balanceOf(submitter);

        _vote(v[0], cid, true, 50e6);
        _vote(v[1], cid, true, 50e6);
        _vote(v[2], cid, true, 50e6);
        _vote(v[3], cid, true, 50e6);
        _vote(v[4], cid, true, 50e6);

        uint256 rid = RoundEngineReadHelpers.activeRoundId(engine, cid);

        // Consensus settlement after maxEpochBlocks
        _forceSettle(cid);

        // totalStake=250e6, subsidy = 250e6 * 5% = 12_500_000
        uint256 expectedSubsidy = 12_500_000;
        assertEq(engine.consensusReserve(), reserveBefore - expectedSubsidy, "Reserve decremented by subsidy");

        // Voter gets stake + proportional subsidy reward
        uint256 bal = hrepToken.balanceOf(v[0]);
        vm.prank(v[0]);
        distributor.claimReward(cid, rid);
        uint256 payout = hrepToken.balanceOf(v[0]) - bal;
        assertGt(payout, 50e6, "Voter gets stake + subsidy reward");

        assertEq(hrepToken.balanceOf(submitter), submitterBefore, "Submitter receives no consensus subsidy");
    }

    // ==================== Test 6: Share-Proportional ROI (Early Voter Advantage) ====================

    /// @notice 1 whale UP (100) + 4 minnows UP (1 each) vs 5 DOWN (10 each).
    /// @dev In tlock epoch-weighted proportional rewards, all epoch-1 voters receive rewards
    ///      proportional to their weighted stake. Whale's absolute reward is 100x minnow's
    ///      because stake is 100x. ROI% is equal (same epoch weight, proportional distribution).
    function test_StakeAsymmetry_ShareProportionalROI() public {
        uint256 cid = _submit();

        // UP side: whale first, then minnows (all in epoch-1)
        _vote(v[0], cid, true, 100e6); // whale
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

        uint256 rid = RoundEngineReadHelpers.activeRoundId(engine, cid);

        _forceSettle(cid);

        // Whale claim
        uint256 wBal = hrepToken.balanceOf(v[0]);
        vm.prank(v[0]);
        distributor.claimReward(cid, rid);
        uint256 whalePayout = hrepToken.balanceOf(v[0]) - wBal;
        uint256 whaleReward = whalePayout - 100e6; // reward only (excl. stake return)

        // Minnow claim
        uint256 mBal = hrepToken.balanceOf(v[4]);
        vm.prank(v[4]);
        distributor.claimReward(cid, rid);
        uint256 minnowPayout = hrepToken.balanceOf(v[4]) - mBal;
        uint256 minnowReward = minnowPayout - 1e6; // reward only

        // Both winners profit
        assertGt(whaleReward, 0, "Whale profits");
        assertGt(minnowReward, 0, "Minnow profits");

        // Whale absolute reward is proportional to stake (100x minnow's stake -> 100x absolute reward)
        // Proportional: whaleReward / 100e6 == minnowReward / 1e6 (within rounding)
        // We verify whale's absolute reward > minnow's absolute reward
        assertGt(whaleReward, minnowReward, "Whale has higher absolute reward than minnow (100x stake)");

        // Both get same ROI% (proportional system: reward/stake is constant within epoch)
        uint256 whaleROIPct = (whaleReward * 10000) / 100e6; // basis points
        uint256 minnowROIPct = (minnowReward * 10000) / 1e6; // basis points
        // In proportional reward system, ROI% is equal (within 1 bps rounding)
        assertApproxEqAbs(whaleROIPct, minnowROIPct, 1, "Proportional reward: whale and minnow get same ROI%");
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

        uint256 rid = RoundEngineReadHelpers.activeRoundId(engine, cid);

        _forceSettle(cid);

        // losingPool = 4e6, voterPool ~3.2e6 (80% with redirects)
        // Whale ROI = ~3.2 / 100 ~= 3.2%
        uint256 bal = hrepToken.balanceOf(v[0]);
        vm.prank(v[0]);
        distributor.claimReward(cid, rid);
        uint256 payout = hrepToken.balanceOf(v[0]) - bal;
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

        uint256 rid = RoundEngineReadHelpers.activeRoundId(engine, cid);

        _forceSettle(cid);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, cid, rid);
        assertTrue(round.upWins, "Minnows outweigh whale (450 > 100)");

        // Whale gets only the fixed 5% revealed-loser rebate
        uint256 bal = hrepToken.balanceOf(v[0]);
        vm.prank(v[0]);
        distributor.claimReward(cid, rid);
        assertEq(hrepToken.balanceOf(v[0]) - bal, 5e6, "Whale gets only the 5% loser rebate");
    }

    // ==================== Test 9: Manufactured Dissent Unprofitable ====================

    /// @notice Attacker: UP (100) + DOWN (50) via 2 wallets. 3 honest UP (50 each).
    function test_ManufacturedDissent_Unprofitable() public {
        uint256 cid = _submit();

        // Record starting balances (attacker uses v[0] and v[1])
        uint256 attackerStartA = hrepToken.balanceOf(v[0]);
        uint256 attackerStartB = hrepToken.balanceOf(v[1]);

        _vote(v[0], cid, true, 100e6); // attacker UP
        _vote(v[1], cid, false, 50e6); // attacker DOWN (manufactured dissent)
        _vote(v[2], cid, true, 50e6); // honest
        _vote(v[3], cid, true, 50e6); // honest
        _vote(v[4], cid, true, 50e6); // honest

        uint256 rid = RoundEngineReadHelpers.activeRoundId(engine, cid);

        _forceSettle(cid);

        // Attacker wallet A (UP winner) claims
        vm.prank(v[0]);
        distributor.claimReward(cid, rid);
        // Attacker wallet B (DOWN loser) gets the fixed rebate
        vm.prank(v[1]);
        distributor.claimReward(cid, rid);

        uint256 attackerEndA = hrepToken.balanceOf(v[0]);
        uint256 attackerEndB = hrepToken.balanceOf(v[1]);
        uint256 totalStart = attackerStartA + attackerStartB;
        uint256 totalEnd = attackerEndA + attackerEndB;

        assertLt(totalEnd, totalStart, "Manufactured dissent is a net loss for the attacker");
        // Attacker staked 150e6, the DOWN side (50e6) is the losing pool which funds rewards.
        // Attacker's wallet B loses 50e6 entirely. Wallet A gets stake + share of voterPool.
        // The attacker only captures a fraction of the lost 50e6, so the strategy remains materially lossy.
        uint256 loss = totalStart - totalEnd;
        assertGt(loss, 29e6, "Attacker loses > 29 HREP");
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

            // Capture round ID before settlement (getActiveRoundId returns 0 after settling)
            uint256 rid = RoundEngineReadHelpers.activeRoundId(engine, cid);

            // Consensus settlement: wait for epoch end, reveal all, settle
            _forceSettle(cid);

            RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, cid, rid);
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
        assertEq(engine.consensusReserve(), reserveBefore - 250e6, "Reserve drained by 250 HREP");
    }

    // ==================== Test 11: Consensus Reserve Replenishment ====================

    /// @notice Contested rounds replenish reserve (5% of losing pool), unanimous rounds drain it.
    function test_ConsensusSubsidyReplenishment() public {
        uint256 reserve = engine.consensusReserve(); // 100_000e6

        // Round 1: contested (3 UP vs 2 DOWN, 50e6 each) -> +4.75e6 to reserve
        {
            uint256 cid = _submit();
            _vote(v[0], cid, true, 50e6);
            _vote(v[1], cid, true, 50e6);
            _vote(v[2], cid, true, 50e6);
            _vote(v[3], cid, false, 50e6);
            _vote(v[4], cid, false, 50e6);
            _forceSettle(cid);
        }
        reserve += 4_750_000; // 5% of the 95e6 net losing pool after loser rebates
        assertEq(engine.consensusReserve(), reserve, "Reserve +4.75 HREP after contested round");

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
        assertEq(engine.consensusReserve(), reserve, "Reserve -25 HREP after unanimous round");

        // Net after 1 contested + 1 unanimous = -20.25 HREP
        assertEq(reserve, 100_000e6 - 20_250_000, "Net drain = 20.25 HREP");
    }

    // ==================== Test 12: Settlement After Reveals ====================

    /// @notice After epoch ends and all votes are revealed, settlement succeeds immediately.
    function test_Settlement_SucceedsAfterReveals() public {
        uint256 cid = _submit();

        _vote(v[0], cid, true, 50e6);
        _vote(v[1], cid, true, 50e6);
        _vote(v[2], cid, true, 50e6);
        _vote(v[3], cid, false, 50e6);
        _vote(v[4], cid, false, 50e6);

        uint256 rid = RoundEngineReadHelpers.activeRoundId(engine, cid);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, cid, rid);

        // Reveal all after epoch ends
        _warpPastTlockRevealTime(uint256(round.startTime) + 1 hours);
        bytes32[] memory keys = RoundEngineReadHelpers.commitKeys(engine, cid, rid);
        for (uint256 i = 0; i < keys.length; i++) {
            RoundLib.Commit memory c = RoundEngineReadHelpers.commit(engine, cid, rid, keys[i]);
            (bool up, bytes32 s) = _decodeTestCiphertext(c.ciphertext);
            engine.revealVoteByCommitKey(cid, rid, keys[i], up, s);
        }

        // Settlement succeeds immediately after minVoters revealed
        engine.settleRound(cid, rid);

        RoundLib.Round memory afterForce = RoundEngineReadHelpers.round(engine, cid, rid);
        assertEq(uint256(afterForce.state), uint256(RoundLib.RoundState.Settled), "Round settled after reveals");
    }

    // ==================== Test 13: Settlement Only Possible After Enough Reveals ====================

    /// @notice settleRound reverts with NotEnoughVotes if fewer than minVoters revealed.
    function test_SettlementRequiresMinVoterReveals() public {
        uint256 cid = _submit();

        (bytes32 ck1, bytes32 s1) = _vote(v[0], cid, true, 50e6);
        // Only 1 voter — minVoters=2 not reached

        uint256 rid = RoundEngineReadHelpers.activeRoundId(engine, cid);
        RoundLib.Round memory r = RoundEngineReadHelpers.round(engine, cid, rid);

        _warpPastTlockRevealTime(uint256(r.startTime) + 1 hours);
        engine.revealVoteByCommitKey(cid, rid, ck1, true, s1);

        vm.warp(block.timestamp + 1 hours + 1);

        vm.expectRevert(RoundVotingEngine.NotEnoughVotes.selector);
        engine.settleRound(cid, rid);
    }

    // ==================== Test 14: Tied Round - Full Refund ====================

    /// @notice 5 UP (50 each) vs 5 DOWN (50 each). Equal pools -> Tied -> full refund.
    function test_TiedRound_FullRefund() public {
        uint256 cid = _submit();

        // Record starting balances
        uint256[10] memory startBals;
        for (uint256 i = 0; i < 10; i++) {
            startBals[i] = hrepToken.balanceOf(v[i]);
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

        uint256 rid = RoundEngineReadHelpers.activeRoundId(engine, cid);

        // Force settle past maxEpochBlocks
        _forceSettle(cid);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, cid, rid);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied), "Equal pools -> Tied");

        // All voters claim refund
        for (uint256 i = 0; i < 10; i++) {
            vm.prank(v[i]);
            engine.claimCancelledRoundRefund(cid, rid);
            assertEq(hrepToken.balanceOf(v[i]), startBals[i], "Full refund on tied round");
        }
    }
}
