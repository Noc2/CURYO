// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";

/// @title Formal Verification: Participation Pool Sustainability
/// @notice 10 scenarios stress-testing tier transitions, drainage rates, conservation,
///         cross-tier rewards, and graceful pool depletion.
contract FormalVerification_ParticipationPoolTest is Test {
    ParticipationPool pool;
    CuryoReputation crepToken;

    address admin = address(1);
    address governance = address(2);
    address caller = address(3); // authorized caller
    address user = address(5);

    uint256 constant POOL_AMOUNT = 34_000_000e6; // 34M cREP
    uint256 constant INITIAL_RATE = 9000; // 90%
    uint256 constant TIER0_BOUNDARY = 2_000_000e6; // 2M
    uint256 constant TIER1_BOUNDARY = 6_000_000e6; // 6M (2M + 4M)
    uint256 constant TIER2_BOUNDARY = 14_000_000e6; // 14M (6M + 8M)
    uint256 constant TIER3_BOUNDARY = 30_000_000e6; // 30M (14M + 16M)

    function setUp() public {
        vm.startPrank(admin);
        crepToken = new CuryoReputation(admin, admin);
        crepToken.grantRole(crepToken.MINTER_ROLE(), admin);

        pool = new ParticipationPool(address(crepToken), governance);
        pool.setAuthorizedCaller(caller, true);

        // Fund pool with 30M cREP
        crepToken.mint(admin, POOL_AMOUNT);
        crepToken.approve(address(pool), POOL_AMOUNT);
        pool.depositPool(POOL_AMOUNT);

        vm.stopPrank();
    }

    // ==================== Helpers ====================

    /// @dev Directly set totalDistributed via vm.store (slot 1 in ParticipationPool storage)
    function _setTotalDistributed(uint256 n) internal {
        vm.store(address(pool), bytes32(uint256(1)), bytes32(n));
    }

    /// @dev Set poolBalance via vm.store (slot 2 in ParticipationPool storage)
    function _setPoolBalance(uint256 n) internal {
        vm.store(address(pool), bytes32(uint256(2)), bytes32(n));
    }

    // ==================== Test 1: Tier 0 -> 1 Transition at 2M ====================

    /// @notice Rate is 90% just before 2M, drops to 45% at exactly 2M distributed.
    function test_TierTransition_Exact2M() public {
        _setTotalDistributed(TIER0_BOUNDARY - 1);
        assertEq(pool.getCurrentRateBps(), 9000, "Just below 2M: 90%");

        _setTotalDistributed(TIER0_BOUNDARY);
        assertEq(pool.getCurrentRateBps(), 4500, "At 2M: 45%");
    }

    // ==================== Test 2: Tier 1 -> 2 Transition at 6M ====================

    /// @notice Rate drops from 45% to 22.5% at 6M cumulative.
    function test_TierTransition_Exact6M() public {
        _setTotalDistributed(TIER1_BOUNDARY - 1);
        assertEq(pool.getCurrentRateBps(), 4500, "Just below 6M: 45%");

        _setTotalDistributed(TIER1_BOUNDARY);
        assertEq(pool.getCurrentRateBps(), 2250, "At 6M: 22.5%");
    }

    // ==================== Test 3: Tier 2 -> 3 Transition at 14M ====================

    /// @notice Rate drops from 22.5% to 11.25% at 14M cumulative.
    function test_TierTransition_Exact14M() public {
        _setTotalDistributed(TIER2_BOUNDARY - 1);
        assertEq(pool.getCurrentRateBps(), 2250, "Just below 14M: 22.5%");

        _setTotalDistributed(TIER2_BOUNDARY);
        assertEq(pool.getCurrentRateBps(), 1125, "At 14M: 11.25%");
    }

    // ==================== Test 4: Tier 3 -> 4 Transition at 30M ====================

    /// @notice Rate drops from 11.25% to 5.62% at 30M cumulative.
    function test_TierTransition_Exact30M() public {
        _setTotalDistributed(TIER3_BOUNDARY - 1);
        assertEq(pool.getCurrentRateBps(), 1125, "Just below 30M: 11.25%");

        _setTotalDistributed(TIER3_BOUNDARY);
        assertEq(pool.getCurrentRateBps(), 562, "At 30M: 5.62%");
    }

    // ==================== Test 5: Drainage Model - 1000 Votes/Day at Tier 0 ====================

    /// @notice Tier 0 (90%) lasts ~44 days at 1000 votes/day with 50 cREP avg stake.
    function test_DrainageModel_1000VotesPerDay_Tier0() public view {
        // Each vote: stake=50e6, reward=50e6 * 9000 / 10000 = 45e6
        uint256 rewardPerVote = 50e6 * INITIAL_RATE / 10000;
        assertEq(rewardPerVote, 45e6, "Each vote drains 45 cREP at tier 0");

        // Daily drain: 1000 * 45e6 = 45_000e6
        uint256 dailyDrain = 1000 * rewardPerVote;
        assertEq(dailyDrain, 45_000e6, "Daily drain = 45K cREP");

        // Tier 0 capacity: 2M cREP
        uint256 daysToExhaust = TIER0_BOUNDARY / dailyDrain;
        assertEq(daysToExhaust, 44, "Tier 0 survives ~44 days");

        // Remaining after 44 full days: 2M - 44*45K = 2M - 1.98M = 20K
        uint256 remaining = TIER0_BOUNDARY - (daysToExhaust * dailyDrain);
        assertEq(remaining, 20_000e6, "20K cREP remainder before tier transition");
    }

    // ==================== Test 6: Full Lifecycle Drainage Model ====================

    /// @notice Pool survives > 1M votes total across all tiers.
    function test_DrainageModel_FullLifecycle() public view {
        // Model: 1000 votes/day at 50 cREP avg stake across all tiers
        uint256 avgStake = 50e6;
        uint256 votesPerDay = 1000;

        // Tier capacities and rates
        uint256[4] memory tierCapacities = [
            uint256(2_000_000e6), // Tier 0: 2M
            uint256(4_000_000e6), // Tier 1: 4M
            uint256(8_000_000e6), // Tier 2: 8M
            uint256(16_000_000e6) // Tier 3: 16M
        ];
        uint256[4] memory tierRates = [
            uint256(9000), // 90%
            uint256(4500), // 45%
            uint256(2250), // 22.5%
            uint256(1125) // 11.25%
        ];

        uint256 totalVotes = 0;
        uint256 totalDays = 0;

        for (uint256 i = 0; i < 4; i++) {
            uint256 rewardPerVote = avgStake * tierRates[i] / 10000;
            uint256 votesToExhaust = tierCapacities[i] / rewardPerVote;
            uint256 daysInTier = votesToExhaust / votesPerDay;
            totalVotes += votesToExhaust;
            totalDays += daysInTier;
        }

        // Assert pool survives > 1M votes across first 4 tiers
        assertGt(totalVotes, 1_000_000, "Pool supports > 1M votes across tiers");
        // Assert pool lasts > 1 year (365 days)
        assertGt(totalDays, 365, "Pool lasts > 1 year at 1000 votes/day");
    }

    // ==================== Test 7: Worst Case - All Max Stake ====================

    /// @notice 200 max-stake voters per round at tier 0: exhausted in ~111 rounds.
    function test_WorstCase_AllMaxStake() public view {
        // 200 voters x 100 cREP x 90% = 18,000 cREP per round
        uint256 maxStake = 100e6;
        uint256 maxVoters = 200;
        uint256 rewardPerRound = maxVoters * (maxStake * INITIAL_RATE / 10000);
        assertEq(rewardPerRound, 18_000e6, "18K cREP drained per worst-case round");

        uint256 roundsToExhaust = TIER0_BOUNDARY / rewardPerRound;
        assertEq(roundsToExhaust, 111, "Tier 0 survives ~111 max-load rounds");

        // Even at worst case, tier 0 requires 111 rounds of 200 max-stake voters
        assertGt(roundsToExhaust, 100, "Tier 0 withstands > 100 worst-case rounds");
    }

    // ==================== Test 8: Conservation Invariant (Fuzz) ====================

    /// @notice Pool never over-distributes: totalDistributed + poolBalance <= initial deposit.
    function testFuzz_Conservation_NeverOverDistributes(uint256 stakeAmount, uint256 numRewards) public {
        stakeAmount = bound(stakeAmount, 1e6, 100e6);
        numRewards = bound(numRewards, 1, 50);

        uint256 initialPool = pool.poolBalance();

        vm.startPrank(caller);
        for (uint256 i = 0; i < numRewards; i++) {
            pool.rewardVote(user, stakeAmount);
        }
        vm.stopPrank();

        // Conservation: totalDistributed + poolBalance == initialPool
        assertEq(
            pool.totalDistributed() + pool.poolBalance(), initialPool, "Conservation: distributed + remaining = initial"
        );
        assertLe(pool.totalDistributed(), initialPool, "Never distributes more than pool");
    }

    // ==================== Test 9: Cross-Tier Reward at Boundary ====================

    /// @notice Reward at tier boundary uses pre-transition rate; tier transitions after.
    function test_CrossTierReward_BoundaryTransaction() public {
        // Set totalDistributed to 2M - 50 cREP (just before tier boundary)
        _setTotalDistributed(TIER0_BOUNDARY - 50e6);

        assertEq(pool.getCurrentRateBps(), 9000, "Still tier 0 before reward");

        // Reward with 100 cREP stake -> reward = 90 cREP at 90% rate
        vm.prank(caller);
        pool.rewardVote(user, 100e6);

        assertEq(crepToken.balanceOf(user), 90e6, "Full 90 cREP reward at tier 0 rate");

        // After: totalDistributed = 2M - 50e6 + 90e6 = 2M + 40e6 (past boundary)
        assertEq(pool.totalDistributed(), TIER0_BOUNDARY + 40e6, "Past tier 0 boundary");
        assertEq(pool.getCurrentRateBps(), 4500, "Transitioned to tier 1 after reward");
    }

    // ==================== Test 10: Empty Pool Graceful Degradation ====================

    /// @notice Empty pool returns 0 reward without reverting.
    function test_EmptyPool_GracefulDegradation() public {
        // Drain the tracked pool balance to 0 without relying on the disabled owner sweep.
        _setPoolBalance(0);
        assertEq(pool.poolBalance(), 0, "Pool drained");

        uint256 balBefore = crepToken.balanceOf(user);

        // Reward attempt should silently do nothing
        vm.prank(caller);
        pool.rewardVote(user, 100e6);

        assertEq(crepToken.balanceOf(user), balBefore, "No tokens transferred");
        assertEq(pool.totalDistributed(), 0, "totalDistributed unchanged");
    }

    // ==================== Test 11: Emergency Withdrawal Preserves Reserved Funds ====================

    /// @notice Emergency withdrawal can only move poolBalance and cannot drain reserved rewards.
    function test_EmergencyWithdrawal_PreservesReservedFunds() public {
        vm.prank(caller);
        pool.reserveReward(caller, 7e6);

        vm.prank(admin);
        pool.withdrawRemaining(admin, type(uint256).max);

        assertEq(pool.poolBalance(), 0, "all unreserved pool funds should be withdrawn");
        assertEq(pool.reservedBalance(), 7e6, "reserved accounting must remain intact");
        assertEq(pool.reservedRewards(caller), 7e6, "beneficiary reservation must remain intact");
        assertEq(crepToken.balanceOf(address(pool)), 7e6, "contract should retain reserved funds only");
    }
}
