// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ContentRegistry } from "../ContentRegistry.sol";
import { RatingLib } from "./RatingLib.sol";
import { RatingMath } from "./RatingMath.sol";
import { IParticipationPool } from "../interfaces/IParticipationPool.sol";
import { IRoundRewardDistributor } from "../interfaces/IRoundRewardDistributor.sol";

/// @title RoundSettlementSideEffectsLib
/// @notice Moves best-effort post-settlement external calls out of RoundVotingEngine runtime bytecode.
library RoundSettlementSideEffectsLib {
    enum SideEffectFailureStage {
        ParticipationRateQuery,
        VoterParticipationRewardsSnapshot,
        RatingStateUpdate,
        MeaningfulActivityRecord
    }

    event SettlementSideEffectFailed(
        uint256 indexed contentId, uint256 indexed roundId, address indexed target, SideEffectFailureStage stage
    );

    function recordSettlement(
        ContentRegistry registry,
        RatingLib.RatingConfig memory ratingConfig,
        IParticipationPool participationPool,
        address rewardDistributor,
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
        address participationPoolAddress = address(participationPool);
        uint256 participationRateBps = 0;
        bool hasParticipationRate = false;

        if (participationPoolAddress != address(0)) {
            try participationPool.getCurrentRateBps() returns (uint256 rate) {
                participationRateBps = rate;
                hasParticipationRate = true;
            } catch {
                emit SettlementSideEffectFailed(
                    contentId, roundId, participationPoolAddress, SideEffectFailureStage.ParticipationRateQuery
                );
            }
        }

        try registry.updateRatingState(contentId, roundId, referenceRatingBps, nextState) { }
        catch {
            emit SettlementSideEffectFailed(
                contentId, roundId, address(registry), SideEffectFailureStage.RatingStateUpdate
            );
        }
        try registry.recordMeaningfulActivity(contentId) { }
        catch {
            emit SettlementSideEffectFailed(
                contentId, roundId, address(registry), SideEffectFailureStage.MeaningfulActivityRecord
            );
        }

        if (participationPoolAddress != address(0) && hasParticipationRate) {
            if (rewardDistributor != address(0)) {
                uint256 winningStake = upWins ? upPool : downPool;
                try IRoundRewardDistributor(rewardDistributor)
                    .snapshotParticipationRewards(
                        contentId, roundId, participationPoolAddress, participationRateBps, winningStake
                    ) { }
                catch {
                    emit SettlementSideEffectFailed(
                        contentId, roundId, rewardDistributor, SideEffectFailureStage.VoterParticipationRewardsSnapshot
                    );
                }
            }
        }
    }
}
