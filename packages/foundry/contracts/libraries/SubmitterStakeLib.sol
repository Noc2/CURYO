// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ContentRegistry } from "../ContentRegistry.sol";

/// @title SubmitterStakeLib
/// @notice Shared policy for resolving submitter stakes after settlement or dormancy windows elapse.
/// @dev Linked externally to keep RoundVotingEngine below the EIP-170 runtime limit while preserving
///      the existing auth model: library code executes in the engine context, so ContentRegistry still
///      sees RoundVotingEngine as the caller.
library SubmitterStakeLib {
    error ContentNotFound();

    function resolve(ContentRegistry registry, bool hasSettledRound, uint256 contentId) external {
        (uint256 existingContentId,,,, uint256 contentCreatedAt,,,,, bool submitterStakeReturned,,) =
            registry.contents(contentId);
        if (submitterStakeReturned) return;
        if (existingContentId == 0) revert ContentNotFound();

        uint256 elapsed = block.timestamp - contentCreatedAt;

        if (!hasSettledRound) {
            if (elapsed >= registry.DORMANCY_PERIOD()) {
                registry.resolvePendingSubmitterStake(contentId);
            }
            return;
        }

        if (elapsed >= 24 hours && registry.isSubmitterStakeSlashable(contentId)) {
            registry.slashSubmitterStake(contentId);
            return;
        }

        if (elapsed >= 4 days) {
            registry.resolvePendingSubmitterStake(contentId);
        }
    }
}
