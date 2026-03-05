// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RewardMath
/// @notice Pure functions for parimutuel reward calculations with epoch-weighted stake.
/// @dev Pool split: 82% voters, 10% submitter, 2% platform (1% frontend, 1% category), 1% treasury, 5% consensus subsidy.
///      Voter rewards are distributed proportional to epoch-weighted effective stake.
///      Epoch 1 (blind) = 100% weight; Epoch 2+ (saw results) = 25% weight.
///      This creates a 4:1 reward ratio for early blind voters vs late informed voters.
library RewardMath {
    uint256 internal constant PRECISION = 1e18;

    // Pool split percentages
    uint256 internal constant VOTER_BPS = 8200; // 82%
    uint256 internal constant SUBMITTER_BPS = 1000; // 10%
    uint256 internal constant PLATFORM_BPS = 200; // 2% (split 50/50: 1% frontend, 1% category)
    uint256 internal constant TREASURY_BPS = 100; // 1% treasury
    uint256 internal constant CONSENSUS_BPS = 500; // 5% consensus subsidy reserve
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
    /// @param voterPool The portion of losing stakes allocated to voters (82%).
    /// @return reward Amount of tokens the voter earns (excludes original stake return).
    function calculateVoterReward(uint256 effectiveStake, uint256 totalWeightedWinningStake, uint256 voterPool)
        internal
        pure
        returns (uint256)
    {
        if (totalWeightedWinningStake == 0) return 0;
        return (voterPool * effectiveStake) / totalWeightedWinningStake;
    }

    /// @notice Split the losing pool into the 5 reward buckets.
    /// @param losingPool Total tokens from losing side.
    /// @return voterShare 82% for winning voters (100% content-specific).
    /// @return submitterShare 10% for content submitter.
    /// @return platformShare 2% for platform (50% frontend, 50% category submitter).
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
        voterShare = losingPool - submitterShare - platformShare - treasuryShare - consensusShare; // remainder = 82%
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
    /// @dev Uses the same voter:submitter ratio as the normal fee split (82:10).
    /// @param subsidy Total consensus subsidy amount.
    /// @return voterShare Amount for winning voters (~89.1%).
    /// @return submitterShare Amount for content submitter (~10.9%).
    function splitConsensusSubsidy(uint256 subsidy) internal pure returns (uint256 voterShare, uint256 submitterShare) {
        submitterShare = (subsidy * SUBMITTER_BPS) / (VOTER_BPS + SUBMITTER_BPS);
        voterShare = subsidy - submitterShare;
    }
}
