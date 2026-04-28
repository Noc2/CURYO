// SPDX-License-Identifier: MIT
/// @dev FOR TESTING ONLY — DO NOT DEPLOY TO PRODUCTION
pragma solidity ^0.8.20;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title MockERC20
/// @notice Mock ERC20 token for testing (simulates USDC/USDT with 6 decimals)
contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;
    mapping(address => mapping(bytes32 => bool)) public authorizationState;
    mapping(address => bool) public blockedRecipients;

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

    function setBlockedRecipient(address recipient, bool blocked) external {
        blockedRecipients[recipient] = blocked;
    }

    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata
    ) external {
        require(to == msg.sender, "MockERC20: caller must be payee");
        require(block.timestamp > validAfter, "MockERC20: authorization not yet valid");
        require(block.timestamp < validBefore, "MockERC20: authorization expired");
        require(!authorizationState[from][nonce], "MockERC20: authorization used");
        authorizationState[from][nonce] = true;
        _transfer(from, to, value);
    }

    function _update(address from, address to, uint256 value) internal override {
        require(!blockedRecipients[to], "MockERC20: recipient blocked");
        super._update(from, to, value);
    }
}
