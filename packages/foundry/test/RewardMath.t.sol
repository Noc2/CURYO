// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { RewardMath } from "../contracts/libraries/RewardMath.sol";

/// @title Harness to expose RewardMath internal functions for testing
contract RewardMathHarness {
    function splitPool(uint256 losingPool) external pure returns (uint256, uint256, uint256, uint256, uint256) {
        return RewardMath.splitPool(losingPool);
    }

    function calculateConsensusSubsidy(uint256 totalStake, uint256 reserveBalance) external pure returns (uint256) {
        return RewardMath.calculateConsensusSubsidy(totalStake, reserveBalance);
    }

    function splitVoterPool(uint256 voterShare, uint256 globalBps) external pure returns (uint256, uint256) {
        return RewardMath.splitVoterPool(voterShare, globalBps);
    }

    function calculateVoterReward(uint256 voterStake, uint256 totalWinningStake, uint256 voterPool)
        external
        pure
        returns (uint256)
    {
        return RewardMath.calculateVoterReward(voterStake, totalWinningStake, voterPool);
    }

    function calculateRatingDelta(uint256 winningStake, uint256 winningVoterCount) external pure returns (uint8) {
        return RewardMath.calculateRatingDelta(winningStake, winningVoterCount);
    }

    function splitConsensusSubsidy(uint256 subsidy) external pure returns (uint256, uint256) {
        return RewardMath.splitConsensusSubsidy(subsidy);
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
    // splitVoterPool — Fuzz Tests
    // ====================================================

    function testFuzz_SplitVoterPool_Conservation(uint256 voterShare, uint256 globalBps) public view {
        voterShare = bound(voterShare, 0, type(uint128).max);
        globalBps = bound(globalBps, 0, 10000);

        (uint256 globalShare, uint256 contentShare) = harness.splitVoterPool(voterShare, globalBps);

        assertEq(globalShare + contentShare, voterShare, "Voter pool split must conserve total");
    }

    // ====================================================
    // calculateVoterReward — Fuzz Tests
    // ====================================================

    function testFuzz_CalculateVoterReward_NeverExceedsPool(
        uint256 voterStake,
        uint256 totalWinningStake,
        uint256 voterPool
    ) public view {
        voterStake = bound(voterStake, 1, type(uint128).max);
        totalWinningStake = bound(totalWinningStake, voterStake, type(uint128).max);
        voterPool = bound(voterPool, 0, type(uint128).max);

        uint256 reward = harness.calculateVoterReward(voterStake, totalWinningStake, voterPool);

        assertLe(reward, voterPool, "Individual reward must never exceed pool");
    }

    function testFuzz_CalculateVoterReward_Proportional(
        uint256 stake1,
        uint256 stake2,
        uint256 totalWinningStake,
        uint256 voterPool
    ) public view {
        stake1 = bound(stake1, 1, type(uint64).max);
        stake2 = bound(stake2, stake1, type(uint64).max);
        totalWinningStake = bound(totalWinningStake, stake2, type(uint128).max);
        voterPool = bound(voterPool, 1, type(uint128).max);

        uint256 reward1 = harness.calculateVoterReward(stake1, totalWinningStake, voterPool);
        uint256 reward2 = harness.calculateVoterReward(stake2, totalWinningStake, voterPool);

        assertLe(reward1, reward2, "Higher stake must get >= reward");
    }

    function testFuzz_CalculateVoterReward_ZeroTotal(uint256 voterStake, uint256 voterPool) public view {
        voterStake = bound(voterStake, 0, type(uint128).max);
        voterPool = bound(voterPool, 0, type(uint128).max);

        uint256 reward = harness.calculateVoterReward(voterStake, 0, voterPool);

        assertEq(reward, 0, "Zero total winning stake must return zero reward");
    }

    // ====================================================
    // calculateRatingDelta — Fuzz Tests
    // ====================================================

    function testFuzz_CalculateRatingDelta_Bounded(uint256 winningStake, uint256 winningVoterCount) public view {
        winningStake = bound(winningStake, 0, type(uint128).max);
        winningVoterCount = bound(winningVoterCount, 0, 1000);

        uint8 delta = harness.calculateRatingDelta(winningStake, winningVoterCount);

        assertLe(delta, 5, "Rating delta must be <= 5");
    }

    function testFuzz_CalculateRatingDelta_ZeroBelowMinStake(uint256 winningStake, uint256 winningVoterCount)
        public
        view
    {
        winningStake = bound(winningStake, 0, 10e6 - 1);
        winningVoterCount = bound(winningVoterCount, 1, 100);

        uint8 delta = harness.calculateRatingDelta(winningStake, winningVoterCount);

        assertEq(delta, 0, "Below min stake must return 0");
    }

    function testFuzz_CalculateRatingDelta_CappedByVoterCount(uint256 winningStake, uint256 winningVoterCount)
        public
        view
    {
        winningStake = bound(winningStake, 10e6, type(uint128).max);
        winningVoterCount = bound(winningVoterCount, 1, 5);

        uint8 delta = harness.calculateRatingDelta(winningStake, winningVoterCount);

        assertLe(uint256(delta), winningVoterCount, "Delta must be capped by voter count");
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

    // ====================================================
    // calculateRatingDelta — Edge Case Unit Tests
    // ====================================================

    function test_CalculateRatingDelta_ZeroVoters() public view {
        uint8 delta = harness.calculateRatingDelta(100e6, 0);
        assertEq(delta, 0, "Zero voters must return 0");
    }

    function test_CalculateRatingDelta_ExactMinStake() public view {
        uint8 delta = harness.calculateRatingDelta(10e6, 5);
        assertEq(delta, 1, "Exact min stake should give delta of 1");
    }

    function test_CalculateRatingDelta_ExactMaxStake() public view {
        uint8 delta = harness.calculateRatingDelta(100e6, 10);
        assertEq(delta, 5, "Exact max stake with enough voters should give max delta");
    }

    function test_CalculateRatingDelta_MaxStakeSingleVoter() public view {
        uint8 delta = harness.calculateRatingDelta(100e6, 1);
        assertEq(delta, 1, "Single voter should cap delta at 1");
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
}
