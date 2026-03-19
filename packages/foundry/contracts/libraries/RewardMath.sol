// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RewardMath
/// @notice Pure functions for parimutuel reward calculations with epoch-weighted stake.
/// @dev Pool split: 80% voters, 10% submitter, 4% platform (3% frontend, 1% category), 1% treasury, 5% consensus subsidy.
///      Voter rewards are distributed proportional to epoch-weighted effective stake.
///      Epoch 1 (blind) = 100% weight; Epoch 2+ (saw results) = 25% weight.
///      This creates a 4:1 reward ratio for early blind voters vs late informed voters.
library RewardMath {
    uint256 internal constant PRECISION = 1e18;

    // Pool split percentages
    uint256 internal constant VOTER_BPS = 8000; // 80%
    uint256 internal constant SUBMITTER_BPS = 1000; // 10%
    uint256 internal constant PLATFORM_BPS = 400; // 4% (split 75/25: 3% frontend, 1% category)
    uint256 internal constant TREASURY_BPS = 100; // 1% treasury
    uint256 internal constant CONSENSUS_BPS = 500; // 5% consensus subsidy reserve
    uint256 internal constant REVEALED_LOSER_REFUND_BPS = 500; // 5% rebate for revealed losing votes
    uint256 internal constant BPS_TOTAL = 10000;

    // Consensus subsidy: payout rate when losingPool == 0 (5% of total round stake)
    uint256 internal constant CONSENSUS_SUBSIDY_RATE = 500; // 5% of totalStake
    uint256 internal constant MAX_CONSENSUS_SUBSIDY = 50e6; // 50 cREP cap per round (6 decimals)

    // Rating calculation parameter (fixed, not configurable)
    uint256 internal constant RATING_B = 50e6; // Smoothing parameter for rating formula (50 cREP in 6 decimals)

    /// @notice Calculate live content rating based on revealed stake pools.
    /// @dev rating = 50 + 50 * (qUp - qDown) / (qUp + qDown + b)
    ///      Clamped to [0, 100]. Uses fixed b=50 cREP for smoothing.
    ///      Called at settlement with final revealed raw pools.
    ///      AUDIT NOTE (I-2): Integer granularity [0-100] is intentional. The RATING_B smoothing
    ///      parameter (50 cREP) ensures small-stake rounds stay near 50, preventing manipulation.
    ///      Higher precision (e.g. 1e18) would add gas cost with no UX benefit since ratings
    ///      are displayed as whole numbers in the frontend.
    /// @param totalUpStake Total revealed UP stake in the current round.
    /// @param totalDownStake Total revealed DOWN stake in the current round.
    /// @return rating New content rating [0, 100].
    function calculateRating(uint256 totalUpStake, uint256 totalDownStake) internal pure returns (uint16) {
        if (totalUpStake == 0 && totalDownStake == 0) return 50;

        // rating = 50 + 50 * (qUp - qDown) / (qUp + qDown + b)
        uint256 sum = totalUpStake + totalDownStake + RATING_B;

        if (totalUpStake >= totalDownStake) {
            uint256 diff = totalUpStake - totalDownStake;
            uint256 delta = (50 * diff) / sum;
            uint256 r = 50 + delta;
            return r > 100 ? uint16(100) : uint16(r);
        } else {
            uint256 diff = totalDownStake - totalUpStake;
            uint256 delta = (50 * diff) / sum;
            return delta >= 50 ? uint16(0) : uint16(50 - delta);
        }
    }

    /// @notice Calculate a voter's reward from the voter pool (epoch-weighted-stake-proportional).
    /// @param effectiveStake The voter's epoch-weighted effective stake (stake × epochWeightBps / 10000).
    /// @param totalWeightedWinningStake Sum of all winning voters' effective stakes.
    /// @param voterPool The portion of losing stakes allocated to voters (80%).
    /// @return reward Amount of tokens the voter earns (excludes original stake return).
    function calculateVoterReward(uint256 effectiveStake, uint256 totalWeightedWinningStake, uint256 voterPool)
        internal
        pure
        returns (uint256)
    {
        if (totalWeightedWinningStake == 0) return 0;
        return (voterPool * effectiveStake) / totalWeightedWinningStake;
    }

    /// @notice Calculate the fixed rebate paid to a revealed losing vote.
    /// @param losingStake The original stake of the revealed losing vote.
    /// @return refund Amount of tokens the losing voter can reclaim.
    function calculateRevealedLoserRefund(uint256 losingStake) internal pure returns (uint256 refund) {
        refund = (losingStake * REVEALED_LOSER_REFUND_BPS) / BPS_TOTAL;
    }

    /// @notice Reserve loser rebates first, then split the remaining losing pool into protocol buckets.
    /// @param losingPool Total tokens from the revealed losing side.
    /// @return loserRefundShare 5% reserved for revealed losing voters.
    /// @return voterShare 80% of the net losing pool for winning voters.
    /// @return submitterShare 10% of the net losing pool for the content submitter.
    /// @return platformShare 4% of the net losing pool for platform fees.
    /// @return treasuryShare 1% of the net losing pool for the treasury.
    /// @return consensusShare 5% of the net losing pool for the consensus reserve.
    function splitPoolAfterLoserRefund(uint256 losingPool)
        internal
        pure
        returns (
            uint256 loserRefundShare,
            uint256 voterShare,
            uint256 submitterShare,
            uint256 platformShare,
            uint256 treasuryShare,
            uint256 consensusShare
        )
    {
        loserRefundShare = calculateRevealedLoserRefund(losingPool);
        (voterShare, submitterShare, platformShare, treasuryShare, consensusShare) =
            splitPool(losingPool - loserRefundShare);
    }

    /// @notice Split the losing pool into the 5 reward buckets.
    /// @param losingPool Total tokens from losing side.
    /// @return voterShare 80% for winning voters (100% content-specific).
    /// @return submitterShare 10% for content submitter.
    /// @return platformShare 4% for platform (3% frontend, 1% category submitter).
    /// @return treasuryShare 1% for governance treasury.
    /// @return consensusShare 5% for consensus subsidy reserve.
    function splitPool(uint256 losingPool)
        internal
        pure
        returns (
            uint256 voterShare,
            uint256 submitterShare,
            uint256 platformShare,
            uint256 treasuryShare,
            uint256 consensusShare
        )
    {
        submitterShare = (losingPool * SUBMITTER_BPS) / BPS_TOTAL;
        platformShare = (losingPool * PLATFORM_BPS) / BPS_TOTAL;
        treasuryShare = (losingPool * TREASURY_BPS) / BPS_TOTAL;
        consensusShare = (losingPool * CONSENSUS_BPS) / BPS_TOTAL;
        voterShare = losingPool - submitterShare - platformShare - treasuryShare - consensusShare; // remainder = 80%
    }

    /// @notice Calculate the consensus subsidy for a unanimous round.
    /// @param totalStake Total stake from all voters in the round.
    /// @param reserveBalance Current balance of the consensus subsidy reserve.
    /// @return subsidy Amount to distribute from the reserve (capped by balance).
    function calculateConsensusSubsidy(uint256 totalStake, uint256 reserveBalance) internal pure returns (uint256) {
        uint256 desired = (totalStake * CONSENSUS_SUBSIDY_RATE) / BPS_TOTAL;
        if (desired > MAX_CONSENSUS_SUBSIDY) desired = MAX_CONSENSUS_SUBSIDY;
        return desired > reserveBalance ? reserveBalance : desired;
    }

    /// @notice Split a consensus subsidy between voter and submitter shares.
    /// @dev Uses the same voter:submitter ratio as the normal fee split (80:10).
    /// @param subsidy Total consensus subsidy amount.
    /// @return voterShare Amount for winning voters (~88.9%).
    /// @return submitterShare Amount for content submitter (~11.1%).
    function splitConsensusSubsidy(uint256 subsidy) internal pure returns (uint256 voterShare, uint256 submitterShare) {
        submitterShare = (subsidy * SUBMITTER_BPS) / (VOTER_BPS + SUBMITTER_BPS);
        voterShare = subsidy - submitterShare;
    }
}
