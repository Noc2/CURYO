// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { RewardMath } from "../contracts/libraries/RewardMath.sol";

/// @title RewardMathFuzz
/// @notice Fuzz tests for all 5 pure functions in RewardMath.sol.
contract RewardMathFuzz is Test {
    using RewardMath for *;

    // =========================================================================
    // calculateRating
    // =========================================================================

    function testFuzz_calculateRating_AlwaysBounded(uint256 upStake, uint256 downStake) public pure {
        // Bound to avoid overflow in (upStake + downStake + RATING_B)
        upStake = bound(upStake, 0, type(uint128).max);
        downStake = bound(downStake, 0, type(uint128).max);

        uint16 rating = RewardMath.calculateRating(upStake, downStake);
        assertLe(rating, 100, "rating > 100");
    }

    function testFuzz_calculateRating_ZeroStakeReturns50(uint256 otherStake) public pure {
        // When both stakes are zero, rating = 50
        uint16 rating = RewardMath.calculateRating(0, 0);
        assertEq(rating, 50, "zero-stake should return 50");
    }

    function testFuzz_calculateRating_UpMajorityGe50(uint256 upStake, uint256 downStake) public pure {
        upStake = bound(upStake, 1, type(uint128).max);
        downStake = bound(downStake, 0, upStake - 1); // upStake > downStake

        uint16 rating = RewardMath.calculateRating(upStake, downStake);
        assertGe(rating, 50, "UP-majority should give rating >= 50");
    }

    // =========================================================================
    // calculateVoterReward
    // =========================================================================

    function testFuzz_calculateVoterReward_NeverExceedsPool(
        uint256 effectiveStake,
        uint256 totalWeightedWinning,
        uint256 voterPool
    ) public pure {
        effectiveStake = bound(effectiveStake, 0, type(uint128).max);
        totalWeightedWinning = bound(totalWeightedWinning, 1, type(uint128).max);
        voterPool = bound(voterPool, 0, type(uint128).max);

        // Single voter's effective stake can't exceed the total
        effectiveStake = bound(effectiveStake, 0, totalWeightedWinning);

        uint256 reward = RewardMath.calculateVoterReward(effectiveStake, totalWeightedWinning, voterPool);
        assertLe(reward, voterPool, "voter reward exceeds pool");
    }

    function testFuzz_calculateVoterReward_ZeroStakeReturnsZero(uint256 totalWeighted, uint256 pool) public pure {
        totalWeighted = bound(totalWeighted, 1, type(uint128).max);
        pool = bound(pool, 0, type(uint128).max);

        uint256 reward = RewardMath.calculateVoterReward(0, totalWeighted, pool);
        assertEq(reward, 0, "zero effective stake should return 0");
    }

    // =========================================================================
    // splitPool
    // =========================================================================

    function testFuzz_splitPool_SharesSumToInput(uint256 losingPool) public pure {
        losingPool = bound(losingPool, 0, type(uint128).max);

        (uint256 voter, uint256 submitter, uint256 platform, uint256 treasury, uint256 consensus) =
            RewardMath.splitPool(losingPool);

        uint256 total = voter + submitter + platform + treasury + consensus;
        assertEq(total, losingPool, "shares do not sum to input");
    }

    function testFuzz_splitPool_VoterGetsRemainder(uint256 losingPool) public pure {
        losingPool = bound(losingPool, 10000, type(uint128).max); // Need enough for meaningful split

        (uint256 voter, uint256 submitter,,,) = RewardMath.splitPool(losingPool);

        // Voter share should be >= 90% because the old submitter share is removed.
        uint256 minVoter = (losingPool * 9000) / 10000;
        assertGe(voter, minVoter, "voter share below 90% floor");
        assertEq(submitter, 0, "submitter share should be removed");
    }

    // =========================================================================
    // calculateRevealedLoserRefund
    // =========================================================================

    function testFuzz_calculateRevealedLoserRefund_FivePercentOfInput(uint256 losingStake) public pure {
        losingStake = bound(losingStake, 0, type(uint128).max);

        uint256 refund = RewardMath.calculateRevealedLoserRefund(losingStake);

        // Refund should be exactly floor(losingStake * 500 / 10000)
        uint256 expected = (losingStake * 500) / 10000;
        assertEq(refund, expected, "refund != 5% of losing stake");
    }

    function testFuzz_calculateRevealedLoserRefund_NeverExceedsStake(uint256 losingStake) public pure {
        losingStake = bound(losingStake, 0, type(uint128).max);

        uint256 refund = RewardMath.calculateRevealedLoserRefund(losingStake);
        assertLe(refund, losingStake, "refund exceeds original stake");
    }

    // =========================================================================
    // splitPoolAfterLoserRefund
    // =========================================================================

    function testFuzz_splitPoolAfterLoserRefund_SharesSumToInput(uint256 losingPool) public pure {
        losingPool = bound(losingPool, 0, type(uint128).max);

        (
            uint256 loserRefundShare,
            uint256 voterShare,
            uint256 submitterShare,
            uint256 platformShare,
            uint256 treasuryShare,
            uint256 consensusShare
        ) = RewardMath.splitPoolAfterLoserRefund(losingPool);

        uint256 total = loserRefundShare + voterShare + submitterShare + platformShare + treasuryShare + consensusShare;
        assertEq(total, losingPool, "shares do not sum to input");
    }

    function testFuzz_splitPoolAfterLoserRefund_LoserRefundIsFivePercent(uint256 losingPool) public pure {
        losingPool = bound(losingPool, 0, type(uint128).max);

        (uint256 loserRefundShare,,,,,) = RewardMath.splitPoolAfterLoserRefund(losingPool);

        uint256 expected = (losingPool * 500) / 10000;
        assertEq(loserRefundShare, expected, "loser refund share != 5% of pool");
    }

    function testFuzz_splitPoolAfterLoserRefund_VoterGetsLargestShare(uint256 losingPool) public pure {
        losingPool = bound(losingPool, 10000, type(uint128).max);

        (
            ,
            uint256 voterShare,
            uint256 submitterShare,
            uint256 platformShare,
            uint256 treasuryShare,
            uint256 consensusShare
        ) = RewardMath.splitPoolAfterLoserRefund(losingPool);

        assertGe(voterShare, submitterShare, "voter share < submitter share");
        assertGe(voterShare, platformShare, "voter share < platform share");
        assertGe(voterShare, treasuryShare, "voter share < treasury share");
        assertGe(voterShare, consensusShare, "voter share < consensus share");
    }

    function testFuzz_splitPoolAfterLoserRefund_MatchesManualNetSplit(uint256 losingPool) public pure {
        losingPool = bound(losingPool, 0, type(uint128).max);

        (
            uint256 loserRefundShare,
            uint256 voterShare,
            uint256 submitterShare,
            uint256 platformShare,
            uint256 treasuryShare,
            uint256 consensusShare
        ) = RewardMath.splitPoolAfterLoserRefund(losingPool);

        uint256 manualLoserRefundShare = RewardMath.calculateRevealedLoserRefund(losingPool);
        (
            uint256 manualVoterShare,
            uint256 manualSubmitterShare,
            uint256 manualPlatformShare,
            uint256 manualTreasuryShare,
            uint256 manualConsensusShare
        ) = RewardMath.splitPool(losingPool - manualLoserRefundShare);

        assertEq(manualLoserRefundShare, loserRefundShare, "manual loser refund != helper");
        assertEq(manualVoterShare, voterShare, "manual voter share != helper");
        assertEq(manualSubmitterShare, submitterShare, "manual submitter share != helper");
        assertEq(manualPlatformShare, platformShare, "manual platform share != helper");
        assertEq(manualTreasuryShare, treasuryShare, "manual treasury share != helper");
        assertEq(manualConsensusShare, consensusShare, "manual consensus share != helper");
    }

    // =========================================================================
    // calculateConsensusSubsidy
    // =========================================================================

    function testFuzz_calculateConsensusSubsidy_CappedByMaxAndReserve(uint256 totalStake, uint256 reserveBalance)
        public
        pure
    {
        totalStake = bound(totalStake, 0, type(uint128).max);
        reserveBalance = bound(reserveBalance, 0, type(uint128).max);

        uint256 subsidy = RewardMath.calculateConsensusSubsidy(totalStake, reserveBalance);

        // Never exceeds MAX_CONSENSUS_SUBSIDY (50e6)
        assertLe(subsidy, 50e6, "subsidy exceeds MAX");
        // Never exceeds reserve
        assertLe(subsidy, reserveBalance, "subsidy exceeds reserve");
    }

    // =========================================================================
    // splitConsensusSubsidy
    // =========================================================================

    function testFuzz_splitConsensusSubsidy_SharesSumToInput(uint256 subsidy) public pure {
        subsidy = bound(subsidy, 0, type(uint128).max);

        (uint256 voterShare, uint256 submitterShare) = RewardMath.splitConsensusSubsidy(subsidy);
        assertEq(voterShare + submitterShare, subsidy, "consensus shares do not sum to input");
    }
}
