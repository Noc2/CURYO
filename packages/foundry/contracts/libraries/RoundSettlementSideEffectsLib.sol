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
        bool hasSettledRound,
        uint256 contentId,
        uint256 roundId,
        bool upWins,
        uint64 upPool,
        uint64 downPool
    ) external {
        uint16 newRating = RewardMath.calculateRating(upPool, downPool);
        try registry.updateRatingDirect(contentId, newRating) { } catch { }
        try registry.recordMeaningfulActivity(contentId) { } catch { }

        if (address(participationPool) != address(0)) {
            try participationPool.getCurrentRateBps() returns (uint256 rate) {
                try registry.snapshotSubmitterParticipationTerms(contentId, address(participationPool), rate) { }
                    catch { }
                if (rewardDistributor != address(0)) {
                    uint256 winningStake = upWins ? upPool : downPool;
                    try IRoundRewardDistributor(rewardDistributor).snapshotParticipationRewards(
                        contentId, roundId, address(participationPool), rate, winningStake
                    ) { } catch { }
                }
            } catch { }
        }

        try SubmitterStakeLib.resolve(registry, hasSettledRound, contentId) { } catch { }
    }
}
