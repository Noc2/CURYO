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
    uint256 internal constant AGE_LINE_CHUNK_SIZE = 64;
    uint256 internal constant AGE_MAC_DECODED_LENGTH = 32;
    uint256 internal constant MIN_TLOCK_STANZA_BODY_LENGTH = 80;
    uint256 internal constant MIN_ENCRYPTED_BODY_LENGTH = 65;
    bytes internal constant AGE_HEADER = "-----BEGIN AGE ENCRYPTED FILE-----";
    bytes internal constant AGE_FOOTER = "-----END AGE ENCRYPTED FILE-----";
    bytes internal constant AGE_VERSION_LINE = "age-encryption.org/v1";
    bytes internal constant AGE_RECIPIENT_PREFIX = "-> ";
    bytes internal constant AGE_RECIPIENT_LINE_PREFIX = "-> tlock ";
    bytes internal constant AGE_MAC_PREFIX = "--- ";

    function decodeCommitPayload(bytes calldata data)
        external
        pure
        returns (
            uint256 contentId,
            uint16 roundReferenceRatingBps,
            bytes32 commitHash,
            bytes memory ciphertext,
            uint64 targetRound,
            bytes32 drandChainHash,
            address frontend
        )
    {
        if (data.length < 224) revert InvalidCiphertext();
        (contentId, roundReferenceRatingBps, commitHash, ciphertext, frontend, targetRound, drandChainHash) =
            abi.decode(data, (uint256, uint16, bytes32, bytes, address, uint64, bytes32));
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
        (uint64 embeddedTargetRound, bytes32 embeddedDrandChainHash) = _extractTlockMetadata(ciphertext);
        if (embeddedTargetRound != targetRound || embeddedDrandChainHash != drandChainHash) revert InvalidCiphertext();
    }

    function targetRoundTimestamp(uint64 targetRound, uint64 genesisTime, uint64 period) external pure returns (uint256) {
        if (targetRound == 0 || genesisTime == 0 || period == 0) revert TargetRoundOutOfWindow();
        return uint256(genesisTime) + (uint256(targetRound) - 1) * uint256(period);
    }

    function buildExpectedCommitHash(
        bool isUp,
        bytes32 salt,
        address voter,
        uint256 contentId,
        uint256 roundId,
        uint16 roundReferenceRatingBps,
        uint64 targetRound,
        bytes32 drandChainHash,
        bytes memory ciphertext
    ) external pure returns (bytes32) {
        bytes32 ciphertextHash = keccak256(ciphertext);
        return keccak256(
            abi.encodePacked(
                isUp,
                salt,
                voter,
                contentId,
                roundId,
                roundReferenceRatingBps,
                targetRound,
                drandChainHash,
                ciphertextHash
            )
        );
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
        _validateArmoredPayloadLines(ciphertext, AGE_HEADER.length, trimmedLength - AGE_FOOTER.length);
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

    function _extractTlockMetadata(bytes memory ciphertext) private pure returns (uint64 targetRound, bytes32 drandChainHash) {
        uint256 trimmedLength = _trimTrailingNewlines(ciphertext);
        bytes memory decoded =
            _decodeBase64Payload(ciphertext, AGE_HEADER.length, trimmedLength - AGE_FOOTER.length);

        uint256 cursor = 0;
        (uint256 lineStart, uint256 lineEnd, uint256 nextCursor) = _readLineBounds(decoded, cursor);
        if (!_lineEquals(decoded, lineStart, lineEnd, AGE_VERSION_LINE)) revert InvalidCiphertext();

        cursor = nextCursor;
        (lineStart, lineEnd, nextCursor) = _readLineBounds(decoded, cursor);
        if (!_lineStartsWith(decoded, lineStart, lineEnd, AGE_RECIPIENT_LINE_PREFIX)) revert InvalidCiphertext();

        cursor = lineStart + AGE_RECIPIENT_LINE_PREFIX.length;
        (targetRound, cursor) = _readUint64(decoded, cursor);
        if (cursor >= lineEnd || decoded[cursor] != 0x20) revert InvalidCiphertext();
        cursor++;

        (drandChainHash, cursor) = _readBytes32Hex(decoded, cursor);
        if (cursor != lineEnd) revert InvalidCiphertext();

        cursor = nextCursor;
        (uint256 stanzaBodyCharLength, uint256 macCursor) = _consumeStanzaBody(decoded, cursor);
        uint256 decodedStanzaBodyLength = _unpaddedBase64DecodedLength(stanzaBodyCharLength);
        if (decodedStanzaBodyLength < MIN_TLOCK_STANZA_BODY_LENGTH) revert InvalidCiphertext();

        (lineStart, lineEnd, nextCursor) = _readLineBounds(decoded, macCursor);
        if (!_lineStartsWith(decoded, lineStart, lineEnd, AGE_MAC_PREFIX)) revert InvalidCiphertext();

        uint256 macStart = lineStart + AGE_MAC_PREFIX.length;
        if (!_isValidUnpaddedBase64Slice(decoded, macStart, lineEnd)) revert InvalidCiphertext();
        if (_unpaddedBase64DecodedLength(lineEnd - macStart) != AGE_MAC_DECODED_LENGTH) revert InvalidCiphertext();
        if (decoded.length - nextCursor < MIN_ENCRYPTED_BODY_LENGTH) revert InvalidCiphertext();
    }

    function _roundAt(uint256 timestamp, uint64 genesisTime, uint64 period) private pure returns (uint64) {
        if (period == 0 || timestamp < genesisTime) return 0;
        return uint64(((timestamp - genesisTime) / period) + 1);
    }

    function _decodeBase64Payload(bytes memory data, uint256 start, uint256 end) private pure returns (bytes memory out) {
        bytes memory clean = _stripBase64Whitespace(data, start, end);
        if (clean.length == 0 || clean.length % 4 != 0) revert InvalidCiphertext();

        uint256 padding = 0;
        if (clean[clean.length - 1] == "=") padding++;
        if (clean.length > 1 && clean[clean.length - 2] == "=") padding++;

        out = new bytes((clean.length / 4) * 3 - padding);
        uint256 outIndex = 0;

        for (uint256 i = 0; i < clean.length; i += 4) {
            bytes1 third = clean[i + 2];
            bytes1 fourth = clean[i + 3];
            if (third == "=" && fourth != "=") revert InvalidCiphertext();

            uint24 chunk = (uint24(_base64Value(clean[i])) << 18) | (uint24(_base64Value(clean[i + 1])) << 12);
            if (third != "=") {
                chunk |= uint24(_base64Value(third)) << 6;
            }
            if (fourth != "=") {
                chunk |= uint24(_base64Value(fourth));
            }

            out[outIndex++] = bytes1(uint8(chunk >> 16));
            if (third != "=") {
                out[outIndex++] = bytes1(uint8(chunk >> 8));
            }
            if (fourth != "=") {
                out[outIndex++] = bytes1(uint8(chunk));
            }
        }
    }

    function _stripBase64Whitespace(bytes memory data, uint256 start, uint256 end) private pure returns (bytes memory clean) {
        uint256 cleanLength = 0;
        for (uint256 i = start; i < end; i++) {
            bytes1 ch = data[i];
            if (ch == 0x0a || ch == 0x0d) continue;
            if (!_isBase64Char(ch) && ch != "=") revert InvalidCiphertext();
            cleanLength++;
        }

        clean = new bytes(cleanLength);
        uint256 outIndex = 0;
        for (uint256 i = start; i < end; i++) {
            bytes1 ch = data[i];
            if (ch == 0x0a || ch == 0x0d) continue;
            clean[outIndex++] = ch;
        }
    }

    function _validateArmoredPayloadLines(bytes memory data, uint256 start, uint256 end) private pure {
        uint256 cursor = start;
        uint256 lastLineLength = 0;

        while (cursor < end) {
            uint256 lineEnd = cursor;
            while (lineEnd < end && data[lineEnd] != 0x0a && data[lineEnd] != 0x0d) {
                bytes1 ch = data[lineEnd];
                if (!_isBase64Char(ch) && ch != "=") revert InvalidCiphertext();
                lineEnd++;
            }

            lastLineLength = lineEnd - cursor;
            if (lastLineLength > AGE_LINE_CHUNK_SIZE) revert InvalidCiphertext();
            if (lineEnd == end) break;

            cursor = lineEnd + 1;
            if (data[lineEnd] == 0x0d && cursor < end && data[cursor] == 0x0a) {
                cursor++;
            }
        }

        if (lastLineLength > AGE_LINE_CHUNK_SIZE) revert InvalidCiphertext();
    }

    function _base64Value(bytes1 ch) private pure returns (uint8) {
        uint8 code = uint8(ch);
        if (code >= 65 && code <= 90) return code - 65;
        if (code >= 97 && code <= 122) return 26 + code - 97;
        if (code >= 48 && code <= 57) return 52 + code - 48;
        if (code == 43) return 62;
        if (code == 47) return 63;
        revert InvalidCiphertext();
    }

    function _isBase64Char(bytes1 ch) private pure returns (bool) {
        uint8 code = uint8(ch);
        return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code == 43
            || code == 47;
    }

    function _readUint64(bytes memory data, uint256 start) private pure returns (uint64 value, uint256 cursor) {
        cursor = start;
        if (cursor >= data.length || !_isDigit(data[cursor])) revert InvalidCiphertext();

        uint256 parsed = 0;
        while (cursor < data.length && _isDigit(data[cursor])) {
            parsed = parsed * 10 + (uint8(data[cursor]) - uint8(bytes1("0")));
            if (parsed > type(uint64).max) revert InvalidCiphertext();
            cursor++;
        }

        value = uint64(parsed);
    }

    function _readBytes32Hex(bytes memory data, uint256 start) private pure returns (bytes32 value, uint256 cursor) {
        if (start + 64 > data.length) revert InvalidCiphertext();

        uint256 parsed = 0;
        for (uint256 i = 0; i < 64; i++) {
            parsed = (parsed << 4) | _hexNibble(data[start + i]);
        }

        return (bytes32(parsed), start + 64);
    }

    function _hexNibble(bytes1 ch) private pure returns (uint256) {
        uint8 code = uint8(ch);
        if (code >= uint8(bytes1("0")) && code <= uint8(bytes1("9"))) return code - uint8(bytes1("0"));
        if (code >= uint8(bytes1("a")) && code <= uint8(bytes1("f"))) return 10 + code - uint8(bytes1("a"));
        if (code >= uint8(bytes1("A")) && code <= uint8(bytes1("F"))) return 10 + code - uint8(bytes1("A"));
        revert InvalidCiphertext();
    }

    function _trimTrailingNewlines(bytes memory data) private pure returns (uint256 trimmedLength) {
        trimmedLength = data.length;
        while (trimmedLength > 0) {
            bytes1 tail = data[trimmedLength - 1];
            if (tail != 0x0a && tail != 0x0d) break;
            trimmedLength--;
        }
    }

    function _isDigit(bytes1 ch) private pure returns (bool) {
        uint8 code = uint8(ch);
        return code >= uint8(bytes1("0")) && code <= uint8(bytes1("9"));
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

    function _readLineBounds(bytes memory data, uint256 cursor)
        private
        pure
        returns (uint256 lineStart, uint256 lineEnd, uint256 nextCursor)
    {
        if (cursor >= data.length) revert InvalidCiphertext();

        lineStart = cursor;
        lineEnd = cursor;
        while (lineEnd < data.length && data[lineEnd] != 0x0a && data[lineEnd] != 0x0d) {
            lineEnd++;
        }
        if (lineEnd >= data.length) revert InvalidCiphertext();

        nextCursor = lineEnd + 1;
        if (data[lineEnd] == 0x0d && nextCursor < data.length && data[nextCursor] == 0x0a) {
            nextCursor++;
        }
    }

    function _lineEquals(bytes memory data, uint256 start, uint256 end, bytes memory expected) private pure returns (bool) {
        if (end - start != expected.length) return false;
        for (uint256 i = 0; i < expected.length; i++) {
            if (data[start + i] != expected[i]) return false;
        }
        return true;
    }

    function _lineStartsWith(bytes memory data, uint256 start, uint256 end, bytes memory prefix)
        private
        pure
        returns (bool)
    {
        if (end - start < prefix.length) return false;
        for (uint256 i = 0; i < prefix.length; i++) {
            if (data[start + i] != prefix[i]) return false;
        }
        return true;
    }

    function _consumeStanzaBody(bytes memory data, uint256 cursor)
        private
        pure
        returns (uint256 stanzaBodyCharLength, uint256 macCursor)
    {
        while (cursor < data.length) {
            (uint256 lineStart, uint256 lineEnd, uint256 nextCursor) = _readLineBounds(data, cursor);
            if (_lineStartsWith(data, lineStart, lineEnd, AGE_MAC_PREFIX)) {
                return (stanzaBodyCharLength, cursor);
            }
            if (_lineStartsWith(data, lineStart, lineEnd, AGE_RECIPIENT_PREFIX)) revert InvalidCiphertext();
            if (!_isValidUnpaddedBase64Slice(data, lineStart, lineEnd)) revert InvalidCiphertext();

            stanzaBodyCharLength += lineEnd - lineStart;
            cursor = nextCursor;
        }

        revert InvalidCiphertext();
    }

    function _isValidUnpaddedBase64Slice(bytes memory data, uint256 start, uint256 end) private pure returns (bool) {
        uint256 length = end - start;
        if (length == 0 || length > AGE_LINE_CHUNK_SIZE) return false;

        for (uint256 i = start; i < end; i++) {
            if (!_isBase64Char(data[i])) return false;
        }

        return true;
    }

    function _unpaddedBase64DecodedLength(uint256 charLength) private pure returns (uint256) {
        uint256 remainder = charLength % 4;
        if (remainder == 1) revert InvalidCiphertext();
        return (charLength / 4) * 3 + (remainder == 0 ? 0 : remainder - 1);
    }
}
