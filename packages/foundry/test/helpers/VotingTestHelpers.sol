// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";

/// @dev Base contract with shared helpers for tlock commit-reveal test patterns.
///      Inherit from this instead of `Test` to get `_testCiphertext`, `_commitHash`, `_commitKey`.
abstract contract VotingTestBase is Test {
    /// @dev Build a test ciphertext (65-byte plaintext accepted by contract validation).
    function _testCiphertext(bool isUp, bytes32 salt, uint256 contentId) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(isUp ? 1 : 0), salt, contentId);
    }

    /// @dev Build commit hash: keccak256(abi.encodePacked(isUp, salt, contentId)).
    function _commitHash(bool isUp, bytes32 salt, uint256 contentId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(isUp, salt, contentId));
    }

    /// @dev Build commit key: keccak256(abi.encodePacked(voter, commitHash)).
    function _commitKey(address voter, bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(voter, hash));
    }
}
