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

/// @title Formal Verification: Parimutuel Game Theory
/// @notice 14 scenarios verifying honest voting profitability, collusion resistance,
///         consensus subsidy mechanics, settlement delay, and tied rounds.
contract FormalVerification_GameTheoryTest is Test {
    CuryoReputation crepToken;
    ContentRegistry registry;
    RoundVotingEngine engine;
    RoundRewardDistributor distributor;

    address owner = address(1);
    address submitter = address(2);
    address treasuryAddr = address(3);
    address[10] v; // voter addresses

    uint256 constant EPOCH = 15 minutes;
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
            string(abi.encodePacked("https://t.co/", vm.toString(contentNonce))), "Goal", "tag", 0
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

    /// @dev Commit votes, warp, reveal, warp, settle. Returns roundId.
    /// @param ts Current tracked timestamp — updated and returned for chaining.
    function _commitRevealSettle(
        uint256 cid,
        address[] memory voters_,
        bool[] memory ups,
        bytes32[] memory salts,
        uint256[] memory stakes,
        uint256 ts
    ) internal returns (uint256 rid, uint256 newTs) {
        for (uint256 i = 0; i < voters_.length; i++) {
            _commit(voters_[i], cid, ups[i], salts[i], stakes[i]);
        }
        ts += EPOCH + 1;
        vm.warp(ts);
        rid = engine.currentRoundId(cid);
        for (uint256 i = 0; i < voters_.length; i++) {
            _reveal(voters_[i], cid, rid, ups[i], salts[i]);
        }
        ts += EPOCH + 1;
        vm.warp(ts);
        engine.settleRound(cid, rid);
        newTs = ts;
    }

    // ==================== Test 1: Honest Voting Profitability ====================

    /// @notice 3 UP (50 each) vs 2 DOWN (50 each). Winners profit, losers forfeit.
    function test_HonestVoting_3Up2Down_WinnersProfit() public {
        uint256 cid = _submit();
        uint256 ts = 1000;

        _commit(v[0], cid, true, "a", 50e6);
        _commit(v[1], cid, true, "b", 50e6);
        _commit(v[2], cid, true, "c", 50e6);
        _commit(v[3], cid, false, "d", 50e6);
        _commit(v[4], cid, false, "e", 50e6);

        ts += EPOCH + 1;
        vm.warp(ts);
        uint256 rid = engine.currentRoundId(cid);
        _reveal(v[0], cid, rid, true, "a");
        _reveal(v[1], cid, rid, true, "b");
        _reveal(v[2], cid, rid, true, "c");
        _reveal(v[3], cid, rid, false, "d");
        _reveal(v[4], cid, rid, false, "e");

        ts += EPOCH + 1;
        vm.warp(ts);
        engine.settleRound(cid, rid);

        // losingPool=100e6. voterPool=82e6 + 2e6 platform redirect = 84e6
        // Each winner reward = 84e6 * 50e6 / 150e6 = 28e6
        // Total per winner = 50e6 + 28e6 = 78e6
        uint256 bal0 = crepToken.balanceOf(v[0]);
        vm.prank(v[0]);
        distributor.claimReward(cid, rid);
        uint256 winnerPayout = crepToken.balanceOf(v[0]) - bal0;
        assertEq(winnerPayout, 78e6, "Winner gets stake + 28 cREP reward");
        assertGt(winnerPayout, 50e6, "Honest voting is profitable");

        // Loser gets nothing
        uint256 bal3 = crepToken.balanceOf(v[3]);
        vm.prank(v[3]);
        distributor.claimReward(cid, rid);
        assertEq(crepToken.balanceOf(v[3]), bal3, "Loser gets nothing");
    }

    // ==================== Test 2: Proportional Rewards ====================

    /// @notice 7 UP (varying stakes) vs 3 DOWN. Higher stake → higher absolute reward.
    function test_HonestVoting_LargePool_7Up3Down() public {
        uint256 cid = _submit();
        uint256 ts = 1000;

        _commit(v[0], cid, true, "a", 10e6);
        _commit(v[1], cid, true, "b", 20e6);
        _commit(v[2], cid, true, "c", 30e6);
        _commit(v[3], cid, true, "d", 40e6);
        _commit(v[4], cid, true, "e", 50e6);
        _commit(v[5], cid, true, "f", 60e6);
        _commit(v[6], cid, true, "g", 70e6);
        _commit(v[7], cid, false, "h", 80e6);
        _commit(v[8], cid, false, "i", 90e6);
        _commit(v[9], cid, false, "j", 100e6);

        ts += EPOCH + 1;
        vm.warp(ts);
        uint256 rid = engine.currentRoundId(cid);
        _reveal(v[0], cid, rid, true, "a");
        _reveal(v[1], cid, rid, true, "b");
        _reveal(v[2], cid, rid, true, "c");
        _reveal(v[3], cid, rid, true, "d");
        _reveal(v[4], cid, rid, true, "e");
        _reveal(v[5], cid, rid, true, "f");
        _reveal(v[6], cid, rid, true, "g");
        _reveal(v[7], cid, rid, false, "h");
        _reveal(v[8], cid, rid, false, "i");
        _reveal(v[9], cid, rid, false, "j");

        ts += EPOCH + 1;
        vm.warp(ts);
        engine.settleRound(cid, rid);

        // Verify monotonically increasing rewards
        uint256 prevReward = 0;
        for (uint256 i = 0; i < 7; i++) {
            uint256 bal = crepToken.balanceOf(v[i]);
            vm.prank(v[i]);
            distributor.claimReward(cid, rid);
            uint256 reward = crepToken.balanceOf(v[i]) - bal;
            assertGt(reward, prevReward, "Higher stake must yield higher reward");
            prevReward = reward;
        }
    }

    // ==================== Test 3: Stake-Weight Determines Outcome ====================

    /// @notice 4 UP (10 each = 40 total) vs 1 DOWN (100). DOWN wins because stake > voter count.
    function test_StakeWeight_DeterminesOutcome() public {
        uint256 cid = _submit();
        uint256 ts = 1000;

        _commit(v[0], cid, true, "a", 10e6);
        _commit(v[1], cid, true, "b", 10e6);
        _commit(v[2], cid, true, "c", 10e6);
        _commit(v[3], cid, true, "d", 10e6);
        _commit(v[4], cid, false, "e", 100e6);

        ts += EPOCH + 1;
        vm.warp(ts);
        uint256 rid = engine.currentRoundId(cid);
        _reveal(v[0], cid, rid, true, "a");
        _reveal(v[1], cid, rid, true, "b");
        _reveal(v[2], cid, rid, true, "c");
        _reveal(v[3], cid, rid, true, "d");
        _reveal(v[4], cid, rid, false, "e");

        ts += EPOCH + 1;
        vm.warp(ts);
        engine.settleRound(cid, rid);

        RoundLib.Round memory round = engine.getRound(cid, rid);
        assertFalse(round.upWins, "DOWN wins - stake weight, not voter count, decides outcome");

        // Whale gets stake + reward from 40e6 losing pool
        uint256 bal = crepToken.balanceOf(v[4]);
        vm.prank(v[4]);
        distributor.claimReward(cid, rid);
        assertGt(crepToken.balanceOf(v[4]) - bal, 100e6, "Whale wins back stake + reward");
    }

    // ==================== Test 4: Collusion at 5-Voter Threshold ====================

    /// @notice 4 colluders UP (100 each) + 1 innocent DOWN (1). Profit < 1 cREP.
    function test_Threshold_CollusionNegligibleProfit() public {
        uint256 cid = _submit();
        uint256 ts = 1000;

        _commit(v[0], cid, true, "a", 100e6);
        _commit(v[1], cid, true, "b", 100e6);
        _commit(v[2], cid, true, "c", 100e6);
        _commit(v[3], cid, true, "d", 100e6);
        _commit(v[4], cid, false, "e", 1e6); // innocent victim

        ts += EPOCH + 1;
        vm.warp(ts);
        uint256 rid = engine.currentRoundId(cid);
        _reveal(v[0], cid, rid, true, "a");
        _reveal(v[1], cid, rid, true, "b");
        _reveal(v[2], cid, rid, true, "c");
        _reveal(v[3], cid, rid, true, "d");
        _reveal(v[4], cid, rid, false, "e");

        ts += EPOCH + 1;
        vm.warp(ts);
        engine.settleRound(cid, rid);

        // losingPool = 1e6 → voterPool ≈ 0.84 cREP → each colluder gets ≈ 0.21 cREP profit
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

    /// @notice 5 UP (50 each). No losers → consensus subsidy from reserve.
    function test_UnanimousRound_ConsensusSubsidy() public {
        uint256 cid = _submit();
        uint256 reserveBefore = engine.consensusReserve();
        uint256 ts = 1000;

        _commit(v[0], cid, true, "a", 50e6);
        _commit(v[1], cid, true, "b", 50e6);
        _commit(v[2], cid, true, "c", 50e6);
        _commit(v[3], cid, true, "d", 50e6);
        _commit(v[4], cid, true, "e", 50e6);

        ts += EPOCH + 1;
        vm.warp(ts);
        uint256 rid = engine.currentRoundId(cid);
        _reveal(v[0], cid, rid, true, "a");
        _reveal(v[1], cid, rid, true, "b");
        _reveal(v[2], cid, rid, true, "c");
        _reveal(v[3], cid, rid, true, "d");
        _reveal(v[4], cid, rid, true, "e");

        ts += EPOCH + 1;
        vm.warp(ts);
        engine.settleRound(cid, rid);

        // totalStake=250e6, subsidy = 250e6 * 5% = 12_500_000
        uint256 expectedSubsidy = 12_500_000;
        assertEq(engine.consensusReserve(), reserveBefore - expectedSubsidy, "Reserve decremented by subsidy");

        // Voter gets stake + proportional subsidy
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
        // submitterShare = 12_500_000 * 1000 / 9200 = 1_358_695
        assertEq(submitterReward, 1_358_695, "Submitter gets ~10.9% of subsidy");
    }

    // ==================== Test 6: Equal ROI% Regardless of Stake Size ====================

    /// @notice 1 whale UP (100) + 4 minnows UP (1 each) vs 5 DOWN (10 each).
    function test_StakeAsymmetry_EqualROI() public {
        uint256 cid = _submit();
        uint256 ts = 1000;

        // UP side: whale + 4 minnows
        _commit(v[0], cid, true, "a", 100e6); // whale
        _commit(v[1], cid, true, "b", 1e6);
        _commit(v[2], cid, true, "c", 1e6);
        _commit(v[3], cid, true, "d", 1e6);
        _commit(v[4], cid, true, "e", 1e6);
        // DOWN side
        _commit(v[5], cid, false, "f", 10e6);
        _commit(v[6], cid, false, "g", 10e6);
        _commit(v[7], cid, false, "h", 10e6);
        _commit(v[8], cid, false, "i", 10e6);
        _commit(v[9], cid, false, "j", 10e6);

        ts += EPOCH + 1;
        vm.warp(ts);
        uint256 rid = engine.currentRoundId(cid);
        _reveal(v[0], cid, rid, true, "a");
        _reveal(v[1], cid, rid, true, "b");
        _reveal(v[2], cid, rid, true, "c");
        _reveal(v[3], cid, rid, true, "d");
        _reveal(v[4], cid, rid, true, "e");
        _reveal(v[5], cid, rid, false, "f");
        _reveal(v[6], cid, rid, false, "g");
        _reveal(v[7], cid, rid, false, "h");
        _reveal(v[8], cid, rid, false, "i");
        _reveal(v[9], cid, rid, false, "j");

        ts += EPOCH + 1;
        vm.warp(ts);
        engine.settleRound(cid, rid);

        // Whale claim
        uint256 wBal = crepToken.balanceOf(v[0]);
        vm.prank(v[0]);
        distributor.claimReward(cid, rid);
        uint256 whaleReward = crepToken.balanceOf(v[0]) - wBal - 100e6; // reward only

        // Minnow claim
        uint256 mBal = crepToken.balanceOf(v[1]);
        vm.prank(v[1]);
        distributor.claimReward(cid, rid);
        uint256 minnowReward = crepToken.balanceOf(v[1]) - mBal - 1e6; // reward only

        // Proportional: whaleReward / 100 ≈ minnowReward / 1
        // whaleReward should be ~100x minnowReward (within rounding)
        assertApproxEqAbs(whaleReward, minnowReward * 100, 100, "ROI% identical for all winners");
    }

    // ==================== Test 7: Whale in Thin Market ====================

    /// @notice 1 whale UP (100) vs 4 minnows DOWN (1 each). Whale wins but low ROI.
    function test_StakeAsymmetry_WhaleThinMarket() public {
        uint256 cid = _submit();
        uint256 ts = 1000;

        _commit(v[0], cid, true, "a", 100e6); // whale
        _commit(v[1], cid, false, "b", 1e6);
        _commit(v[2], cid, false, "c", 1e6);
        _commit(v[3], cid, false, "d", 1e6);
        _commit(v[4], cid, false, "e", 1e6);

        ts += EPOCH + 1;
        vm.warp(ts);
        uint256 rid = engine.currentRoundId(cid);
        _reveal(v[0], cid, rid, true, "a");
        _reveal(v[1], cid, rid, false, "b");
        _reveal(v[2], cid, rid, false, "c");
        _reveal(v[3], cid, rid, false, "d");
        _reveal(v[4], cid, rid, false, "e");

        ts += EPOCH + 1;
        vm.warp(ts);
        engine.settleRound(cid, rid);

        // losingPool = 4e6, voterPool ≈ 3.36e6 (with platform redirect)
        // Whale ROI = 3.36 / 100 ≈ 3.36%
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
        uint256 ts = 1000;

        _commit(v[0], cid, false, "a", 100e6); // whale DOWN
        _commit(v[1], cid, true, "b", 50e6);
        _commit(v[2], cid, true, "c", 50e6);
        _commit(v[3], cid, true, "d", 50e6);
        _commit(v[4], cid, true, "e", 50e6);
        _commit(v[5], cid, true, "f", 50e6);
        _commit(v[6], cid, true, "g", 50e6);
        _commit(v[7], cid, true, "h", 50e6);
        _commit(v[8], cid, true, "i", 50e6);
        _commit(v[9], cid, true, "j", 50e6);

        ts += EPOCH + 1;
        vm.warp(ts);
        uint256 rid = engine.currentRoundId(cid);
        _reveal(v[0], cid, rid, false, "a");
        _reveal(v[1], cid, rid, true, "b");
        _reveal(v[2], cid, rid, true, "c");
        _reveal(v[3], cid, rid, true, "d");
        _reveal(v[4], cid, rid, true, "e");
        _reveal(v[5], cid, rid, true, "f");
        _reveal(v[6], cid, rid, true, "g");
        _reveal(v[7], cid, rid, true, "h");
        _reveal(v[8], cid, rid, true, "i");
        _reveal(v[9], cid, rid, true, "j");

        ts += EPOCH + 1;
        vm.warp(ts);
        engine.settleRound(cid, rid);

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
        uint256 ts = 1000;

        // Record starting balances (attacker uses v[0] and v[1])
        uint256 attackerStartA = crepToken.balanceOf(v[0]);
        uint256 attackerStartB = crepToken.balanceOf(v[1]);

        _commit(v[0], cid, true, "a", 100e6); // attacker UP
        _commit(v[1], cid, false, "b", 50e6); // attacker DOWN (manufactured dissent)
        _commit(v[2], cid, true, "c", 50e6); // honest
        _commit(v[3], cid, true, "d", 50e6); // honest
        _commit(v[4], cid, true, "e", 50e6); // honest

        ts += EPOCH + 1;
        vm.warp(ts);
        uint256 rid = engine.currentRoundId(cid);
        _reveal(v[0], cid, rid, true, "a");
        _reveal(v[1], cid, rid, false, "b");
        _reveal(v[2], cid, rid, true, "c");
        _reveal(v[3], cid, rid, true, "d");
        _reveal(v[4], cid, rid, true, "e");

        ts += EPOCH + 1;
        vm.warp(ts);
        engine.settleRound(cid, rid);

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
        // Specifically: attacker spent 150e6, got back ~116.8e6 → lost ~33.2 cREP
        uint256 loss = totalStart - totalEnd;
        assertGt(loss, 30e6, "Attacker loses > 30 cREP");
    }

    // ==================== Test 10: Consensus Reserve Drain - 10 Rounds ====================

    /// @notice 10 unanimous rounds drain reserve predictably.
    function test_ConsensusSubsidyDrain_10Rounds() public {
        uint256 reserveBefore = engine.consensusReserve();
        uint256 ts = 1000;

        for (uint256 r = 0; r < 10; r++) {
            uint256 cid = _submit();
            for (uint256 i = 0; i < 5; i++) {
                _commit(v[i], cid, true, bytes32(r * 10 + i), 100e6);
            }
            ts += EPOCH + 1;
            vm.warp(ts);
            uint256 rid = engine.currentRoundId(cid);
            for (uint256 i = 0; i < 5; i++) {
                _reveal(v[i], cid, rid, true, bytes32(r * 10 + i));
            }
            ts += EPOCH + 1;
            vm.warp(ts);
            engine.settleRound(cid, rid);
        }

        // Each round: totalStake=500e6, subsidy=25e6. 10 rounds → 250e6 drained.
        assertEq(engine.consensusReserve(), reserveBefore - 250e6, "Reserve drained by 250 cREP");
    }

    // ==================== Test 11: Consensus Reserve Replenishment ====================

    /// @notice Contested rounds replenish reserve (5% of losing pool), unanimous rounds drain it.
    function test_ConsensusSubsidyReplenishment() public {
        uint256 reserve = engine.consensusReserve(); // 100_000e6
        uint256 ts = 1000;

        // Round 1: contested (3 UP vs 2 DOWN, 50e6 each) -> +5e6 to reserve
        {
            uint256 cid = _submit();
            _commit(v[0], cid, true, "a", 50e6);
            _commit(v[1], cid, true, "b", 50e6);
            _commit(v[2], cid, true, "c", 50e6);
            _commit(v[3], cid, false, "d", 50e6);
            _commit(v[4], cid, false, "e", 50e6);
            ts += EPOCH + 1;
            vm.warp(ts);
            uint256 rid = engine.currentRoundId(cid);
            _reveal(v[0], cid, rid, true, "a");
            _reveal(v[1], cid, rid, true, "b");
            _reveal(v[2], cid, rid, true, "c");
            _reveal(v[3], cid, rid, false, "d");
            _reveal(v[4], cid, rid, false, "e");
            ts += EPOCH + 1;
            vm.warp(ts);
            engine.settleRound(cid, rid);
        }
        reserve += 5_000_000; // 5% of 100e6 losing pool
        assertEq(engine.consensusReserve(), reserve, "Reserve +5 cREP after contested round");

        // Round 2: unanimous (5 UP, 100e6 each) -> -25e6 from reserve
        {
            uint256 cid = _submit();
            for (uint256 i = 0; i < 5; i++) {
                _commit(v[i], cid, true, bytes32(uint256(100 + i)), 100e6);
            }
            ts += EPOCH + 1;
            vm.warp(ts);
            uint256 rid = engine.currentRoundId(cid);
            for (uint256 i = 0; i < 5; i++) {
                _reveal(v[i], cid, rid, true, bytes32(uint256(100 + i)));
            }
            ts += EPOCH + 1;
            vm.warp(ts);
            engine.settleRound(cid, rid);
        }
        reserve -= 25_000_000; // 5% of 500e6 total stake
        assertEq(engine.consensusReserve(), reserve, "Reserve -25 cREP after unanimous round");

        // Net after 1 contested + 1 unanimous = -20 cREP
        assertEq(reserve, 100_000e6 - 20_000_000, "Net drain = 20 cREP");
    }

    // ==================== Test 12: Settlement Delay - Cannot Settle Immediately ====================

    /// @notice settleRound reverts if called before settlement delay.
    function test_SettlementDelay_CannotSettleImmediately() public {
        uint256 cid = _submit();
        uint256 ts = 1000;

        _commit(v[0], cid, true, "a", 50e6);
        _commit(v[1], cid, true, "b", 50e6);
        _commit(v[2], cid, true, "c", 50e6);
        _commit(v[3], cid, false, "d", 50e6);
        _commit(v[4], cid, false, "e", 50e6);

        ts += EPOCH + 1;
        vm.warp(ts);
        uint256 rid = engine.currentRoundId(cid);
        _reveal(v[0], cid, rid, true, "a");
        _reveal(v[1], cid, rid, true, "b");
        _reveal(v[2], cid, rid, true, "c");
        _reveal(v[3], cid, rid, false, "d");
        _reveal(v[4], cid, rid, false, "e");

        // Try to settle immediately after reveals - should revert
        vm.expectRevert(RoundVotingEngine.SettlementDelayNotElapsed.selector);
        engine.settleRound(cid, rid);
    }

    // ==================== Test 13: Settlement Delay Protects Current-Epoch Voters ====================

    /// @notice Epoch 0 votes reach threshold, epoch 1 votes still included after delay.
    function test_SettlementDelay_ProtectsCurrentEpochVoters() public {
        uint256 cid = _submit();
        uint256 startTime = block.timestamp;

        // Epoch 0: 5 commits
        _commit(v[0], cid, true, "a", 50e6);
        _commit(v[1], cid, true, "b", 50e6);
        _commit(v[2], cid, true, "c", 50e6);
        _commit(v[3], cid, false, "d", 50e6);
        _commit(v[4], cid, false, "e", 50e6);

        // Epoch 1: 2 more commits (warp into epoch 1)
        vm.warp(startTime + EPOCH);
        _commit(v[5], cid, true, "f", 50e6);
        _commit(v[6], cid, true, "g", 50e6);

        // Warp past epoch 0 end, reveal epoch 0 votes (threshold reached at 5)
        vm.warp(startTime + EPOCH + 1);
        uint256 rid = engine.currentRoundId(cid);
        _reveal(v[0], cid, rid, true, "a");
        _reveal(v[1], cid, rid, true, "b");
        _reveal(v[2], cid, rid, true, "c");
        _reveal(v[3], cid, rid, false, "d");
        _reveal(v[4], cid, rid, false, "e");
        // thresholdReachedAt = now

        // Warp past epoch 1 end, reveal epoch 1 votes
        vm.warp(startTime + 2 * EPOCH + 1);
        _reveal(v[5], cid, rid, true, "f");
        _reveal(v[6], cid, rid, true, "g");

        // Now settle (delay satisfied: now >= thresholdReachedAt + EPOCH)
        engine.settleRound(cid, rid);

        RoundLib.Round memory round = engine.getRound(cid, rid);
        assertEq(round.revealedCount, 7, "All 7 votes included in settlement");
        assertTrue(round.upWins, "UP wins (250 vs 100)");
    }

    // ==================== Test 14: Tied Round - Full Refund ====================

    /// @notice 5 UP (50 each) vs 5 DOWN (50 each). Equal pools → Tied → full refund.
    function test_TiedRound_FullRefund() public {
        uint256 cid = _submit();
        uint256 ts = 1000;

        // Record starting balances
        uint256[10] memory startBals;
        for (uint256 i = 0; i < 10; i++) {
            startBals[i] = crepToken.balanceOf(v[i]);
        }

        _commit(v[0], cid, true, "a", 50e6);
        _commit(v[1], cid, true, "b", 50e6);
        _commit(v[2], cid, true, "c", 50e6);
        _commit(v[3], cid, true, "d", 50e6);
        _commit(v[4], cid, true, "e", 50e6);
        _commit(v[5], cid, false, "f", 50e6);
        _commit(v[6], cid, false, "g", 50e6);
        _commit(v[7], cid, false, "h", 50e6);
        _commit(v[8], cid, false, "i", 50e6);
        _commit(v[9], cid, false, "j", 50e6);

        ts += EPOCH + 1;
        vm.warp(ts);
        uint256 rid = engine.currentRoundId(cid);
        _reveal(v[0], cid, rid, true, "a");
        _reveal(v[1], cid, rid, true, "b");
        _reveal(v[2], cid, rid, true, "c");
        _reveal(v[3], cid, rid, true, "d");
        _reveal(v[4], cid, rid, true, "e");
        _reveal(v[5], cid, rid, false, "f");
        _reveal(v[6], cid, rid, false, "g");
        _reveal(v[7], cid, rid, false, "h");
        _reveal(v[8], cid, rid, false, "i");
        _reveal(v[9], cid, rid, false, "j");

        ts += EPOCH + 1;
        vm.warp(ts);
        engine.settleRound(cid, rid);

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
