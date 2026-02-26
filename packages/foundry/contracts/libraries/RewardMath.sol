// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title RewardMath
/// @notice Pure functions for parimutuel reward calculations.
/// @dev Pool split: 82% voters, 10% submitter, 2% platform (1% frontend, 1% category), 1% treasury, 5% consensus subsidy.
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

    // Stake thresholds for rating impact (6 decimals)
    uint256 internal constant MIN_STAKE_FOR_RATING = 10e6; // $10
    uint256 internal constant MAX_STAKE_FOR_RATING = 100e6; // $100
    uint256 internal constant MIN_RATING_DELTA = 1;
    uint256 internal constant MAX_RATING_DELTA = 5;

    /// @notice Calculate rating delta based on per-content winning stake, capped by voter count.
    /// @dev The voter count cap is intentional sybil resistance: a single voter staking 100 cREP
    ///      produces delta=1, while 5 voters staking 20 cREP each produce delta=5. This makes
    ///      unique voter participation more impactful than raw stake for rating changes.
    /// @param winningStake Total stake from the winning side for this content.
    /// @param winningVoterCount Number of unique voters on the winning side.
    /// @return delta Rating change (0-5). Capped at winningVoterCount to prevent single-voter manipulation.
    function calculateRatingDelta(uint256 winningStake, uint256 winningVoterCount) internal pure returns (uint8) {
        if (winningStake < MIN_STAKE_FOR_RATING) return 0;
        if (winningVoterCount == 0) return 0;

        uint8 stakeDelta;
        if (winningStake >= MAX_STAKE_FOR_RATING) {
            stakeDelta = uint8(MAX_RATING_DELTA);
        } else {
            // Linear interpolation: 1 + (stake - 10) * 4 / 90
            uint256 range = MAX_STAKE_FOR_RATING - MIN_STAKE_FOR_RATING;
            uint256 excess = winningStake - MIN_STAKE_FOR_RATING;
            stakeDelta = uint8(MIN_RATING_DELTA + (excess * (MAX_RATING_DELTA - MIN_RATING_DELTA)) / range);
        }

        // Cap by voter count: 1 voter → max delta 1, 2 voters → max delta 2, etc.
        uint256 voterCap = winningVoterCount > MAX_RATING_DELTA ? MAX_RATING_DELTA : winningVoterCount;
        return stakeDelta > uint8(voterCap) ? uint8(voterCap) : stakeDelta;
    }

    /// @notice Calculate a voter's reward from the losing pool (parimutuel).
    /// @param voterStake The voter's individual stake.
    /// @param totalWinningStake Sum of all winning voters' stakes.
    /// @param voterPool The portion of losing stakes allocated to voters (82%).
    /// @return reward Amount of tokens the voter earns (excludes original stake return).
    function calculateVoterReward(uint256 voterStake, uint256 totalWinningStake, uint256 voterPool)
        internal
        pure
        returns (uint256)
    {
        if (totalWinningStake == 0) return 0;
        return (voterPool * voterStake) / totalWinningStake;
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

    /// @notice Split the voter share into global and content-specific pools.
    /// @dev Legacy function, not used by RoundVotingEngine which sends 100% to content-specific pool.
    ///      Note: integer division truncation means globalShare may receive slightly less than
    ///      its intended BPS allocation over many rounds (dust stays in contentShare).
    /// @param voterShare Total voter share (82% of losing pool).
    /// @param globalBps Basis points of voter share going to global pool (e.g., 2500 = 25%).
    /// @return globalShare Amount for global shared pool (all winning voters).
    /// @return contentShare Amount for content-specific winning voters.
    function splitVoterPool(uint256 voterShare, uint256 globalBps)
        internal
        pure
        returns (uint256 globalShare, uint256 contentShare)
    {
        globalShare = (voterShare * globalBps) / BPS_TOTAL;
        contentShare = voterShare - globalShare;
    }
}
