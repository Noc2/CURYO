// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ContentRegistry } from "../ContentRegistry.sol";
import { RewardMath } from "./RewardMath.sol";
import { SubmitterStakeLib } from "./SubmitterStakeLib.sol";
import { IParticipationPool } from "../interfaces/IParticipationPool.sol";
import { IRoundRewardDistributor } from "../interfaces/IRoundRewardDistributor.sol";

/// @title RoundSettlementSideEffectsLib
/// @notice Moves best-effort post-settlement external calls out of RoundVotingEngine runtime bytecode.
library RoundSettlementSideEffectsLib {
    function recordSettlement(
        ContentRegistry registry,
        IParticipationPool participationPool,
        address rewardDistributor,
        bool isFirstSettledRound,
        uint256 contentId,
        uint256 roundId,
        bool upWins,
        uint64 upPool,
        uint64 downPool
    ) external {
        uint16 newRating = RewardMath.calculateRating(upPool, downPool);
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
                contentId, newRating, participationPoolAddress, hasParticipationRate ? participationRateBps : 0
            );
        }

        try registry.updateRatingDirect(contentId, newRating) { } catch { }
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
