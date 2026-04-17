// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ContentRegistry } from "../ContentRegistry.sol";

/// @title SubmitterStakeLib
/// @notice Deprecated compatibility shim for the removed submitter-stake policy.
library SubmitterStakeLib {
    function resolve(ContentRegistry registry, bool hasSettledRound, uint256 contentId) external {
        registry;
        hasSettledRound;
        contentId;
    }
}
