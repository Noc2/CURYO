// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ContentRegistry } from "../ContentRegistry.sol";
import { IParticipationPool } from "../interfaces/IParticipationPool.sol";

/// @title SubmitterStakeLib
/// @notice Shared policy for resolving submitter stakes after settlement or dormancy windows elapse.
/// @dev Linked externally to keep RoundVotingEngine below the EIP-170 runtime limit while preserving
///      the existing auth model: library code executes in the engine context, so ContentRegistry still
///      sees RoundVotingEngine as the caller.
library SubmitterStakeLib {
    error ContentNotFound();

    function resolve(
        ContentRegistry registry,
        IParticipationPool participationPool,
        bool hasSettledRound,
        uint256 contentId
    ) external {
        if (registry.isSubmitterStakeReturned(contentId)) return;

        uint256 contentCreatedAt = registry.getCreatedAt(contentId);
        if (contentCreatedAt == 0) revert ContentNotFound();

        uint256 elapsed = block.timestamp - contentCreatedAt;

        if (!hasSettledRound) {
            if (elapsed >= registry.DORMANCY_PERIOD()) {
                registry.resolvePendingSubmitterStake(contentId);
            }
            return;
        }

        uint256 rating = registry.getRating(contentId);

        if (elapsed >= 24 hours && rating < registry.SLASH_RATING_THRESHOLD()) {
            registry.slashSubmitterStake(contentId);
            return;
        }

        if (elapsed >= 4 days) {
            uint256 rewardRateBps;
            if (address(participationPool) != address(0)) {
                try participationPool.getCurrentRateBps() returns (uint256 rateBps) {
                    rewardRateBps = rateBps;
                } catch { }
            }

            registry.returnSubmitterStakeWithRewardRate(contentId, rewardRateBps);
        }
    }
}
