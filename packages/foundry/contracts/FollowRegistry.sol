// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IFollowRegistry } from "./interfaces/IFollowRegistry.sol";

/// @title FollowRegistry
/// @notice Stores the canonical on-chain follow graph so every frontend can read the same relationships.
/// @dev Keeps only membership state on-chain. Enumeration is reconstructed from events by indexers like Ponder.
contract FollowRegistry is IFollowRegistry, Initializable, AccessControlUpgradeable, UUPSUpgradeable {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    mapping(address => mapping(address => bool)) private _isFollowing;

    /// @dev Reserved storage gap for future upgrades.
    uint256[50] private __gap;

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    /// @notice Initialize the follow registry contract.
    /// @param _admin Address with temporary admin role for initial wiring.
    /// @param _governance Address with permanent governance roles (timelock).
    function initialize(address _admin, address _governance) public initializer {
        __AccessControl_init();

        if (_admin == address(0) || _governance == address(0)) revert InvalidAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, _governance);
        _grantRole(ADMIN_ROLE, _governance);
        _grantRole(UPGRADER_ROLE, _governance);

        if (_admin != _governance) {
            _grantRole(ADMIN_ROLE, _admin);
        }
    }

    /// @inheritdoc IFollowRegistry
    function follow(address target) external override {
        if (target == address(0)) revert InvalidAddress();
        if (msg.sender == target) revert SelfFollow();
        if (_isFollowing[msg.sender][target]) revert AlreadyFollowing();

        _isFollowing[msg.sender][target] = true;
        emit ProfileFollowed(msg.sender, target);
    }

    /// @inheritdoc IFollowRegistry
    function unfollow(address target) external override {
        if (target == address(0)) revert InvalidAddress();
        if (!_isFollowing[msg.sender][target]) revert NotFollowing();

        delete _isFollowing[msg.sender][target];
        emit ProfileUnfollowed(msg.sender, target);
    }

    /// @inheritdoc IFollowRegistry
    function isFollowing(address follower, address target) external view override returns (bool) {
        return _isFollowing[follower][target];
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) { }
}
