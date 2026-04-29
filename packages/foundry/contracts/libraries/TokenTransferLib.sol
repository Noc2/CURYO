// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @title TokenTransferLib
/// @notice Isolates HREP transfer side effects so RoundVotingEngine can try/catch them without
///         keeping dedicated external wrappers.
library TokenTransferLib {
    using SafeERC20 for IERC20;

    function safeTransfer(IERC20 token, address recipient, uint256 amount) external {
        token.safeTransfer(recipient, amount);
    }

    function tryTransfer(IERC20 token, address recipient, uint256 amount) external returns (bool) {
        (bool success, bytes memory data) = address(token).call(abi.encodeCall(IERC20.transfer, (recipient, amount)));
        return success && (data.length == 0 || (data.length == 32 && abi.decode(data, (bool))));
    }
}
