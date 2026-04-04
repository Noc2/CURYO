// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ContentRegistry } from "../ContentRegistry.sol";
import { RatingLib } from "./RatingLib.sol";
import { RatingMath } from "./RatingMath.sol";
import { SubmitterStakeLib } from "./SubmitterStakeLib.sol";
import { IParticipationPool } from "../interfaces/IParticipationPool.sol";
import { IRoundRewardDistributor } from "../interfaces/IRoundRewardDistributor.sol";

/// @title RoundSettlementSideEffectsLib
/// @notice Moves best-effort post-settlement external calls out of RoundVotingEngine runtime bytecode.
library RoundSettlementSideEffectsLib {
    function recordSettlement(
        ContentRegistry registry,
        RatingLib.RatingConfig memory ratingConfig,
        IParticipationPool participationPool,
        address rewardDistributor,
        bool isFirstSettledRound,
        uint256 contentId,
        uint256 roundId,
        uint16 referenceRatingBps,
        uint64 weightedUpPool,
        uint64 weightedDownPool,
        bool upWins,
        uint64 upPool,
        uint64 downPool
    ) external {
        RatingLib.RatingState memory previousState = registry.getRatingState(contentId);
        RatingLib.SlashConfig memory slashConfig = registry.getSlashConfigForContent(contentId);
        (RatingLib.RatingState memory nextState,,) = RatingMath.applySettlement(
            referenceRatingBps,
            weightedUpPool,
            weightedDownPool,
            previousState,
            ratingConfig,
            slashConfig,
            uint48(block.timestamp)
        );
        uint8 newDisplayRating = RatingMath.displayRatingFromBps(nextState.ratingBps);
        address participationPoolAddress = address(participationPool);
        uint256 participationRateBps = 0;
        bool hasParticipationRate = false;

        if (participationPoolAddress != address(0)) {
            try participationPool.getCurrentRateBps() returns (uint256 rate) {
                participationRateBps = rate;
                hasParticipationRate = true;
            } catch { }
        }

        if (isFirstSettledRound) {
            registry.snapshotMilestoneZeroSubmitterTerms(
                contentId, newDisplayRating, participationPoolAddress, hasParticipationRate ? participationRateBps : 0
            );
        }

        try registry.updateRatingState(contentId, roundId, referenceRatingBps, nextState) { } catch { }
        try registry.recordMeaningfulActivity(contentId) { } catch { }

        if (participationPoolAddress != address(0) && hasParticipationRate) {
            try registry.snapshotSubmitterParticipationTerms(
                contentId, participationPoolAddress, participationRateBps
            ) { }
                catch { }
            if (rewardDistributor != address(0)) {
                uint256 winningStake = upWins ? upPool : downPool;
                try IRoundRewardDistributor(rewardDistributor)
                    .snapshotParticipationRewards(
                        contentId, roundId, participationPoolAddress, participationRateBps, winningStake
                    ) { }
                    catch { }
            }
        }

        try SubmitterStakeLib.resolve(registry, true, contentId) { } catch { }
    }
}
