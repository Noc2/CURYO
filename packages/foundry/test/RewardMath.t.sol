// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { RewardMath } from "../contracts/libraries/RewardMath.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";

/// @title Harness to expose RewardMath internal functions for testing
contract RewardMathHarness {
    function splitPool(uint256 losingPool) external pure returns (uint256, uint256, uint256, uint256, uint256) {
        return RewardMath.splitPool(losingPool);
    }

    function calculateRevealedLoserRefund(uint256 losingStake) external pure returns (uint256) {
        return RewardMath.calculateRevealedLoserRefund(losingStake);
    }

    function splitPoolAfterLoserRefund(uint256 losingPool)
        external
        pure
        returns (uint256, uint256, uint256, uint256, uint256, uint256)
    {
        return RewardMath.splitPoolAfterLoserRefund(losingPool);
    }

    function calculateConsensusSubsidy(uint256 totalStake, uint256 reserveBalance) external pure returns (uint256) {
        return RewardMath.calculateConsensusSubsidy(totalStake, reserveBalance);
    }

    function calculateVoterReward(uint256 effectiveStake, uint256 totalWeightedWinningStake, uint256 voterPool)
        external
        pure
        returns (uint256)
    {
        return RewardMath.calculateVoterReward(effectiveStake, totalWeightedWinningStake, voterPool);
    }

    function calculateRating(uint256 totalUpStake, uint256 totalDownStake) external pure returns (uint16) {
        return RewardMath.calculateRating(totalUpStake, totalDownStake);
    }

    function splitConsensusSubsidy(uint256 subsidy) external pure returns (uint256, uint256) {
        return RewardMath.splitConsensusSubsidy(subsidy);
    }

    function epochWeightBps(uint32 epochIndex) external pure returns (uint256) {
        return RoundLib.epochWeightBps(epochIndex);
    }
}

/// @title RewardMath Fuzz & Unit Tests
contract RewardMathTest is Test {
    RewardMathHarness public harness;

    function setUp() public {
        harness = new RewardMathHarness();
    }

    // ====================================================
    // splitPool — Fuzz Tests
    // ====================================================

    function testFuzz_SplitPool_Conservation(uint256 losingPool) public view {
        losingPool = bound(losingPool, 0, type(uint128).max);

        (
            uint256 voterShare,
            uint256 submitterShare,
            uint256 platformShare,
            uint256 treasuryShare,
            uint256 consensusShare
        ) = harness.splitPool(losingPool);

        assertEq(
            voterShare + submitterShare + platformShare + treasuryShare + consensusShare,
            losingPool,
            "Pool split must conserve total"
        );
    }

    function testFuzz_SplitPoolAfterLoserRefund_Conservation(uint256 losingPool) public view {
        losingPool = bound(losingPool, 0, type(uint128).max);

        (
            uint256 loserRefundShare,
            uint256 voterShare,
            uint256 submitterShare,
            uint256 platformShare,
            uint256 treasuryShare,
            uint256 consensusShare
        ) = harness.splitPoolAfterLoserRefund(losingPool);

        assertEq(
            loserRefundShare + voterShare + submitterShare + platformShare + treasuryShare + consensusShare,
            losingPool,
            "Pool split with loser refund must conserve total"
        );
    }

    function test_CalculateRevealedLoserRefund_FivePercent() public view {
        assertEq(harness.calculateRevealedLoserRefund(10e6), 500_000, "Refund should equal 5% of losing stake");
    }

    function testFuzz_SplitPool_VoterShareDominates(uint256 losingPool) public view {
        losingPool = bound(losingPool, 1, type(uint128).max);

        (
            uint256 voterShare,
            uint256 submitterShare,
            uint256 platformShare,
            uint256 treasuryShare,
            uint256 consensusShare
        ) = harness.splitPool(losingPool);

        assertGe(voterShare, submitterShare, "Voter share must be >= submitter share");
        assertGe(voterShare, platformShare, "Voter share must be >= platform share");
        assertGe(voterShare, treasuryShare, "Voter share must be >= treasury share");
        assertGe(voterShare, consensusShare, "Voter share must be >= consensus share");
    }

    function testFuzz_SplitPool_Proportions(uint256 losingPool) public view {
        losingPool = bound(losingPool, 10000, type(uint128).max);

        (
            uint256 voterShare,
            uint256 submitterShare,
            uint256 platformShare,
            uint256 treasuryShare,
            uint256 consensusShare
        ) = harness.splitPool(losingPool);

        assertEq(submitterShare, (losingPool * 1000) / 10000, "Submitter share must be 10%");
        assertEq(platformShare, (losingPool * 200) / 10000, "Platform share must be 2%");
        assertEq(treasuryShare, (losingPool * 100) / 10000, "Treasury share must be 1%");
        assertEq(consensusShare, (losingPool * 500) / 10000, "Consensus share must be 5%");
        assertEq(
            voterShare,
            losingPool - submitterShare - platformShare - treasuryShare - consensusShare,
            "Voter share must be remainder"
        );
    }

    // ====================================================
    // calculateRating — Fuzz Tests
    // ====================================================

    function testFuzz_CalculateRating_Bounded(uint256 upStake, uint256 downStake) public view {
        upStake = bound(upStake, 0, type(uint128).max);
        downStake = bound(downStake, 0, type(uint128).max);

        uint16 rating = harness.calculateRating(upStake, downStake);

        assertLe(rating, 100, "Rating must be <= 100");
    }

    function testFuzz_CalculateRating_UpBias(uint256 upStake, uint256 downStake) public view {
        upStake = bound(upStake, 1, type(uint128).max);
        downStake = bound(downStake, 0, upStake - 1);

        uint16 rating = harness.calculateRating(upStake, downStake);

        assertGe(rating, 50, "More UP stake must produce rating >= 50");
    }

    function testFuzz_CalculateRating_DownBias(uint256 upStake, uint256 downStake) public view {
        downStake = bound(downStake, 1, type(uint128).max);
        upStake = bound(upStake, 0, downStake - 1);

        uint16 rating = harness.calculateRating(upStake, downStake);

        assertLe(rating, 50, "More DOWN stake must produce rating <= 50");
    }

    function test_CalculateRating_ZeroStakes() public view {
        uint16 rating = harness.calculateRating(0, 0);
        assertEq(rating, 50, "Zero stakes must return neutral rating of 50");
    }

    function test_CalculateRating_EqualStakes() public view {
        uint16 rating = harness.calculateRating(100e6, 100e6);
        assertEq(rating, 50, "Equal stakes must return neutral rating of 50");
    }

    function test_CalculateRating_AllUp() public view {
        // rating = 50 + 50 * 1000e6 / (1000e6 + 50e6) ≈ 50 + 47.6 = 97
        uint16 rating = harness.calculateRating(1000e6, 0);
        assertGt(rating, 90, "All-UP heavy stake should produce high rating");
        assertLe(rating, 100, "Rating capped at 100");
    }

    function test_CalculateRating_AllDown() public view {
        uint16 rating = harness.calculateRating(0, 1000e6);
        assertLt(rating, 10, "All-DOWN heavy stake should produce low rating");
    }

    // ====================================================
    // calculateVoterReward — Fuzz Tests
    // ====================================================

    function testFuzz_CalculateVoterReward_NeverExceedsPool(
        uint256 effectiveStake,
        uint256 totalWeightedWinningStake,
        uint256 voterPool
    ) public view {
        effectiveStake = bound(effectiveStake, 1, type(uint128).max);
        totalWeightedWinningStake = bound(totalWeightedWinningStake, effectiveStake, type(uint128).max);
        voterPool = bound(voterPool, 0, type(uint128).max);

        uint256 reward = harness.calculateVoterReward(effectiveStake, totalWeightedWinningStake, voterPool);

        assertLe(reward, voterPool, "Individual reward must never exceed pool");
    }

    function testFuzz_CalculateVoterReward_Proportional(
        uint256 effectiveStake1,
        uint256 effectiveStake2,
        uint256 totalWeightedWinningStake,
        uint256 voterPool
    ) public view {
        effectiveStake1 = bound(effectiveStake1, 1, type(uint64).max);
        effectiveStake2 = bound(effectiveStake2, effectiveStake1, type(uint64).max);
        totalWeightedWinningStake = bound(totalWeightedWinningStake, effectiveStake2, type(uint128).max);
        voterPool = bound(voterPool, 1, type(uint128).max);

        uint256 reward1 = harness.calculateVoterReward(effectiveStake1, totalWeightedWinningStake, voterPool);
        uint256 reward2 = harness.calculateVoterReward(effectiveStake2, totalWeightedWinningStake, voterPool);

        assertLe(reward1, reward2, "Higher effective stake must get >= reward");
    }

    function testFuzz_CalculateVoterReward_ZeroTotal(uint256 effectiveStake, uint256 voterPool) public view {
        effectiveStake = bound(effectiveStake, 0, type(uint128).max);
        voterPool = bound(voterPool, 0, type(uint128).max);

        uint256 reward = harness.calculateVoterReward(effectiveStake, 0, voterPool);

        assertEq(reward, 0, "Zero totalWeightedWinningStake must return zero reward");
    }

    // ====================================================
    // splitPool — Edge Case Unit Tests
    // ====================================================

    function test_SplitPool_Zero() public view {
        (
            uint256 voterShare,
            uint256 submitterShare,
            uint256 platformShare,
            uint256 treasuryShare,
            uint256 consensusShare
        ) = harness.splitPool(0);

        assertEq(voterShare, 0);
        assertEq(submitterShare, 0);
        assertEq(platformShare, 0);
        assertEq(treasuryShare, 0);
        assertEq(consensusShare, 0);
    }

    function test_SplitPool_SmallValues() public view {
        // With 100 tokens: submitter = 10, platform = 2, treasury = 1, consensus = 5, voter = 82
        (
            uint256 voterShare,
            uint256 submitterShare,
            uint256 platformShare,
            uint256 treasuryShare,
            uint256 consensusShare
        ) = harness.splitPool(100);

        assertEq(submitterShare, 10);
        assertEq(platformShare, 2);
        assertEq(treasuryShare, 1);
        assertEq(consensusShare, 5);
        assertEq(voterShare, 82);
    }

    function test_SplitPool_One() public view {
        // With 1 token: rounding means submitter=0, platform=0, treasury=0, consensus=0, voter=1
        (
            uint256 voterShare,
            uint256 submitterShare,
            uint256 platformShare,
            uint256 treasuryShare,
            uint256 consensusShare
        ) = harness.splitPool(1);

        assertEq(submitterShare, 0);
        assertEq(platformShare, 0);
        assertEq(treasuryShare, 0);
        assertEq(consensusShare, 0);
        assertEq(voterShare, 1);
    }

    // ====================================================
    // calculateConsensusSubsidy — Unit Tests
    // ====================================================

    function test_ConsensusSubsidy_Normal() public view {
        // 50 cREP total stake, 1M reserve → subsidy = 50 * 5% = 2.5 cREP
        uint256 subsidy = harness.calculateConsensusSubsidy(50e6, 1_000_000e6);
        assertEq(subsidy, 2_500_000, "5% of 50 cREP = 2.5 cREP");
    }

    function test_ConsensusSubsidy_CappedByReserve() public view {
        // 1000 cREP total stake, 10 cREP reserve → subsidy capped at 10 cREP
        uint256 subsidy = harness.calculateConsensusSubsidy(1000e6, 10e6);
        assertEq(subsidy, 10e6, "Should be capped by reserve balance");
    }

    function test_ConsensusSubsidy_ZeroReserve() public view {
        uint256 subsidy = harness.calculateConsensusSubsidy(50e6, 0);
        assertEq(subsidy, 0, "Zero reserve must return zero");
    }

    function test_ConsensusSubsidy_ZeroStake() public view {
        uint256 subsidy = harness.calculateConsensusSubsidy(0, 1_000_000e6);
        assertEq(subsidy, 0, "Zero stake must return zero");
    }

    function test_ConsensusSubsidy_CappedByMaxSubsidy() public view {
        // 2000 cREP total stake, 5% = 100 cREP desired, but cap is 50 cREP
        uint256 subsidy = harness.calculateConsensusSubsidy(2000e6, 1_000_000e6);
        assertEq(subsidy, 50e6, "Subsidy capped at 50 cREP (MAX_CONSENSUS_SUBSIDY)");
    }

    // ====================================================
    // splitConsensusSubsidy — Unit & Fuzz Tests
    // ====================================================

    function testFuzz_SplitConsensusSubsidy_Conservation(uint256 subsidy) public view {
        subsidy = bound(subsidy, 0, type(uint128).max);

        (uint256 voterShare, uint256 submitterShare) = harness.splitConsensusSubsidy(subsidy);

        assertEq(voterShare + submitterShare, subsidy, "Subsidy split must conserve total");
    }

    function testFuzz_SplitConsensusSubsidy_VoterDominates(uint256 subsidy) public view {
        subsidy = bound(subsidy, 1, type(uint128).max);

        (uint256 voterShare, uint256 submitterShare) = harness.splitConsensusSubsidy(subsidy);

        assertGe(voterShare, submitterShare, "Voter share must be >= submitter share");
    }

    function test_SplitConsensusSubsidy_Zero() public view {
        (uint256 voterShare, uint256 submitterShare) = harness.splitConsensusSubsidy(0);

        assertEq(voterShare, 0);
        assertEq(submitterShare, 0);
    }

    function test_SplitConsensusSubsidy_Ratio() public view {
        // 9200 total (8200 voter + 1000 submitter)
        // subsidy = 9200 → submitter = 9200 * 1000 / 9200 = 1000, voter = 8200
        (uint256 voterShare, uint256 submitterShare) = harness.splitConsensusSubsidy(9200);

        assertEq(submitterShare, 1000, "Submitter should get 1000/9200 of subsidy");
        assertEq(voterShare, 8200, "Voter should get 8200/9200 of subsidy");
    }

    function test_SplitConsensusSubsidy_SmallValue() public view {
        // subsidy = 1 → submitter = 1 * 1000 / 9200 = 0, voter = 1
        (uint256 voterShare, uint256 submitterShare) = harness.splitConsensusSubsidy(1);

        assertEq(submitterShare, 0);
        assertEq(voterShare, 1);
    }

    // ====================================================
    // epochWeightBps — Unit Tests
    // ====================================================

    function test_EpochWeightBps_Epoch0_Returns10000() public view {
        uint256 weight = harness.epochWeightBps(0);
        assertEq(weight, 10000, "Epoch 0 (blind epoch-1) must return 10000 bps (100%)");
    }

    function test_EpochWeightBps_Epoch1_Returns2500() public view {
        uint256 weight = harness.epochWeightBps(1);
        assertEq(weight, 2500, "Epoch 1 (informed epoch-2+) must return 2500 bps (25%)");
    }

    function test_EpochWeightBps_HighEpoch_Returns2500() public view {
        // All epochs >= 1 (informed) return the same 25% weight
        uint256 weight2 = harness.epochWeightBps(2);
        uint256 weight100 = harness.epochWeightBps(100);
        assertEq(weight2, 2500, "Epoch 2 must also return 2500 bps");
        assertEq(weight100, 2500, "Epoch 100 must also return 2500 bps");
    }

    function test_EpochWeightBps_EarlyVoterAdvantage() public view {
        // Epoch-1 voter gets 4x the reward weight of an epoch-2+ voter
        uint256 blindWeight = harness.epochWeightBps(0);
        uint256 informedWeight = harness.epochWeightBps(1);
        assertEq(blindWeight / informedWeight, 4, "Blind voter must have 4x weight vs informed voter");
    }
}
