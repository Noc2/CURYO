// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title TlockVoteLib
/// @notice Shared helpers for vote payload decoding, tlock metadata validation, and commit hash reconstruction.
library TlockVoteLib {
    error CiphertextTooLarge();
    error InvalidCiphertext();
    error DrandChainHashMismatch();
    error TargetRoundOutOfWindow();

    uint256 internal constant MAX_CIPHERTEXT_SIZE = 2_048;
    bytes internal constant AGE_HEADER = "-----BEGIN AGE ENCRYPTED FILE-----";
    bytes internal constant AGE_FOOTER = "-----END AGE ENCRYPTED FILE-----";

    function decodeCommitPayload(bytes calldata data)
        external
        pure
        returns (
            uint256 contentId,
            bytes32 commitHash,
            bytes memory ciphertext,
            uint64 targetRound,
            bytes32 drandChainHash,
            address frontend
        )
    {
        if (data.length < 192) revert InvalidCiphertext();
        (contentId, commitHash, ciphertext, frontend, targetRound, drandChainHash) =
            abi.decode(data, (uint256, bytes32, bytes, address, uint64, bytes32));
    }

    function validateCommitData(
        bytes memory ciphertext,
        uint64 targetRound,
        bytes32 drandChainHash,
        bytes32 expectedDrandChainHash,
        uint256 revealableAfter,
        uint256 epochDuration,
        uint64 genesisTime,
        uint64 period
    ) external pure {
        _validateCiphertext(ciphertext);
        if (drandChainHash != expectedDrandChainHash) revert DrandChainHashMismatch();
        _validateTargetRound(targetRound, revealableAfter, epochDuration, genesisTime, period);
    }

    function buildExpectedCommitHash(
        bool isUp,
        bytes32 salt,
        uint256 contentId,
        uint64 targetRound,
        bytes32 drandChainHash,
        bytes memory ciphertext
    ) external pure returns (bytes32) {
        bytes32 ciphertextHash = keccak256(ciphertext);
        return keccak256(abi.encodePacked(isUp, salt, contentId, targetRound, drandChainHash, ciphertextHash));
    }

    function _validateCiphertext(bytes memory ciphertext) private pure {
        if (ciphertext.length == 0) revert InvalidCiphertext();
        if (ciphertext.length > MAX_CIPHERTEXT_SIZE) revert CiphertextTooLarge();
        if (ciphertext.length < AGE_HEADER.length + AGE_FOOTER.length + 2) revert InvalidCiphertext();

        for (uint256 i = 0; i < ciphertext.length; i++) {
            bytes1 ch = ciphertext[i];
            if (!(ch == 0x0a || ch == 0x0d || (ch >= 0x20 && ch <= 0x7e))) revert InvalidCiphertext();
        }

        if (!_hasPrefix(ciphertext, AGE_HEADER)) revert InvalidCiphertext();

        uint256 trimmedLength = ciphertext.length;
        while (trimmedLength > 0) {
            bytes1 tail = ciphertext[trimmedLength - 1];
            if (tail != 0x0a && tail != 0x0d) break;
            trimmedLength--;
        }

        if (trimmedLength < AGE_FOOTER.length) revert InvalidCiphertext();
        if (!_hasSuffix(ciphertext, trimmedLength, AGE_FOOTER)) revert InvalidCiphertext();
    }

    function _validateTargetRound(
        uint64 targetRound,
        uint256 revealableAfter,
        uint256 epochDuration,
        uint64 genesisTime,
        uint64 period
    ) private pure {
        if (period == 0 || targetRound == 0) revert TargetRoundOutOfWindow();
        if (revealableAfter < genesisTime) revert TargetRoundOutOfWindow();

        uint64 minTargetRound = _roundAt(revealableAfter, genesisTime, period);
        uint64 maxTargetRound = _roundAt(revealableAfter + epochDuration, genesisTime, period);
        if (targetRound < minTargetRound || targetRound > maxTargetRound) revert TargetRoundOutOfWindow();
    }

    function _roundAt(uint256 timestamp, uint64 genesisTime, uint64 period) private pure returns (uint64) {
        if (period == 0 || timestamp < genesisTime) return 0;
        return uint64(((timestamp - genesisTime) / period) + 1);
    }

    function _hasPrefix(bytes memory data, bytes memory prefix) private pure returns (bool) {
        if (data.length < prefix.length) return false;
        for (uint256 i = 0; i < prefix.length; i++) {
            if (data[i] != prefix[i]) return false;
        }
        return true;
    }

    function _hasSuffix(bytes memory data, uint256 trimmedLength, bytes memory suffix) private pure returns (bool) {
        if (trimmedLength < suffix.length) return false;
        uint256 start = trimmedLength - suffix.length;
        for (uint256 i = 0; i < suffix.length; i++) {
            if (data[start + i] != suffix[i]) return false;
        }
        return true;
    }
}
