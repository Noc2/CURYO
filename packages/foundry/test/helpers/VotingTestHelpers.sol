// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { Vm, VmSafe } from "forge-std/Vm.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../../contracts/ContentRegistry.sol";
import { ProtocolConfig } from "../../contracts/ProtocolConfig.sol";

function deployInitializedProtocolConfig(address admin) returns (ProtocolConfig protocolConfig) {
    return deployInitializedProtocolConfig(admin, admin);
}

function deployInitializedProtocolConfig(address admin, address governance) returns (ProtocolConfig protocolConfig) {
    ProtocolConfig implementation = new ProtocolConfig();
    protocolConfig = ProtocolConfig(
        address(new ERC1967Proxy(address(implementation), abi.encodeCall(ProtocolConfig.initialize, (admin, governance))))
    );
}

abstract contract ContentSubmissionTestBase {
    Vm internal constant HEVM = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    function _submitContentWithReservation(
        ContentRegistry registry,
        string memory url,
        string memory title,
        string memory description,
        string memory tags,
        uint256 categoryId
    ) internal returns (uint256 contentId) {
        (VmSafe.CallerMode mode, address msgSender, address txOrigin) = HEVM.readCallers();
        bool normalizedPrank = false;
        if (mode == VmSafe.CallerMode.Prank) {
            HEVM.startPrank(msgSender, txOrigin);
            normalizedPrank = true;
        }

        (, bytes32 submissionKey) = registry.previewSubmissionKey(url, categoryId);

        address submitter =
            mode == VmSafe.CallerMode.None ? address(this) : (msgSender != address(0) ? msgSender : address(this));
        bytes32 salt = keccak256(
            abi.encode(url, title, description, tags, categoryId, submitter, block.timestamp, block.number, gasleft())
        );
        bytes32 revealCommitment =
            keccak256(abi.encode(submissionKey, title, description, tags, categoryId, salt, submitter));

        registry.reserveSubmission(revealCommitment);
        HEVM.warp(block.timestamp + 1);
        contentId = registry.submitContent(url, title, description, tags, categoryId, salt);

        if (normalizedPrank) {
            HEVM.stopPrank();
        }
    }
}

/// @dev Base contract with shared helpers for tlock commit-reveal test patterns.
///      Inherit from this instead of `Test` to get `_testCiphertext`, `_commitHash`, `_commitKey`.
abstract contract VotingTestBase is Test, ContentSubmissionTestBase {
    function _deployProtocolConfig(address admin) internal returns (ProtocolConfig protocolConfig) {
        return deployInitializedProtocolConfig(admin, admin);
    }

    function _deployProtocolConfig(address admin, address governance) internal returns (ProtocolConfig protocolConfig) {
        return deployInitializedProtocolConfig(admin, governance);
    }

    /// @dev Build a test ciphertext (65-byte plaintext accepted by contract validation).
    function _testCiphertext(bool isUp, bytes32 salt, uint256 contentId) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(isUp ? 1 : 0), salt, contentId);
    }

    /// @dev Build commit hash bound to the exact ciphertext bytes used at commit time.
    function _commitHash(bool isUp, bytes32 salt, uint256 contentId) internal pure returns (bytes32) {
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);
        return _commitHash(isUp, salt, contentId, ciphertext);
    }

    /// @dev Build commit hash for a caller-supplied ciphertext.
    function _commitHash(bool isUp, bytes32 salt, uint256 contentId, bytes memory ciphertext)
        internal
        pure
        returns (bytes32)
    {
        return keccak256(abi.encodePacked(isUp, salt, contentId, keccak256(ciphertext)));
    }

    /// @dev Build commit key: keccak256(abi.encodePacked(voter, commitHash)).
    function _commitKey(address voter, bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(voter, hash));
    }
}
