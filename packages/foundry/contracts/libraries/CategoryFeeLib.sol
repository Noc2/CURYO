// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ContentRegistry } from "../ContentRegistry.sol";
import { ICategoryRegistry } from "../interfaces/ICategoryRegistry.sol";

/// @title CategoryFeeLib
/// @notice Isolates category submitter fee side effects so RoundVotingEngine can try/catch them without
///         carrying self-call wrapper bytecode.
library CategoryFeeLib {
    using SafeERC20 for IERC20;

    function distribute(
        IERC20 crepToken,
        ContentRegistry registry,
        ICategoryRegistry categoryRegistry,
        uint256 contentId,
        uint256 amount
    ) external returns (bool paid, uint256 categoryId, address categorySubmitter) {
        categoryId = registry.getCategoryId(contentId);
        if (categoryId == 0 || address(categoryRegistry) == address(0)) {
            return (false, categoryId, address(0));
        }

        categorySubmitter = categoryRegistry.getSubmitter(categoryId);
        if (categorySubmitter == address(0)) {
            return (false, categoryId, address(0));
        }

        crepToken.safeTransfer(categorySubmitter, amount);
        return (true, categoryId, categorySubmitter);
    }
}
