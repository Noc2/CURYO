// SPDX-License-Identifier: MIT
/// @dev FOR TESTING ONLY — DO NOT DEPLOY TO PRODUCTION
pragma solidity ^0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20
/// @notice Mock ERC20 token for testing (simulates USDC/USDT with 6 decimals)
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;
    uint256 public constant FAUCET_AMOUNT = 1000; // 1000 tokens (before decimals)

    constructor(string memory name, string memory symbol, uint8 decimals_) ERC20(name, symbol) {
        _decimals = decimals_;
    }

    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }

    /// @notice Mint tokens to any address (for testing)
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    /// @notice Burn tokens from any address (for testing)
    function burn(address from, uint256 amount) external {
        _burn(from, amount);
    }

    /// @notice Claim tokens from faucet (for testing)
    function claimFaucet() external {
        _mint(msg.sender, FAUCET_AMOUNT * (10 ** _decimals));
    }
}
