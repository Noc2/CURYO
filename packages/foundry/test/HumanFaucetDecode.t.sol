// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";

/// @title DecodeReferrerHarness
/// @notice Exposes HumanFaucet._decodeReferrer() logic for isolated testing.
/// @dev Mirrors the exact implementation from HumanFaucet.sol.
contract DecodeReferrerHarness {
    function decodeReferrer(bytes memory userData) external pure returns (address) {
        if (userData.length == 0) return address(0);
        if (userData.length == 42 && userData[0] == bytes1("0") && (userData[1] == bytes1("x") || userData[1] == bytes1("X"))) {
            return _decodeHexStringAddress(userData, 2);
        }
        if (userData.length == 40) {
            return _decodeHexStringAddress(userData, 0);
        }
        if (userData.length == 32) return abi.decode(userData, (address));
        if (userData.length < 20) return address(0);

        bytes memory padded = new bytes(32);
        for (uint256 i = 0; i < 20; ++i) {
            padded[12 + i] = userData[i];
        }
        return abi.decode(padded, (address));
    }

    function _decodeHexStringAddress(bytes memory userData, uint256 start) internal pure returns (address) {
        uint160 parsed = 0;
        for (uint256 i = start; i < userData.length; ++i) {
            uint8 nibble = _fromHexChar(uint8(userData[i]));
            if (nibble == type(uint8).max) {
                return address(0);
            }
            parsed = (parsed << 4) | uint160(nibble);
        }
        return address(parsed);
    }

    function _fromHexChar(uint8 charCode) internal pure returns (uint8) {
        if (charCode >= 48 && charCode <= 57) return charCode - 48;
        if (charCode >= 65 && charCode <= 70) return charCode - 55;
        if (charCode >= 97 && charCode <= 102) return charCode - 87;
        return type(uint8).max;
    }
}

/// @title HumanFaucetDecodeTest
/// @notice Unit + fuzz tests for the _decodeReferrer hardening (H-14).
contract HumanFaucetDecodeTest is Test {
    DecodeReferrerHarness public harness;

    function setUp() public {
        harness = new DecodeReferrerHarness();
    }

    // --- Unit tests ---

    function test_EmptyBytes_ReturnsZero() public view {
        assertEq(harness.decodeReferrer(""), address(0));
    }

    function test_AbiEncoded32Bytes_DecodesCorrectly() public view {
        address expected = address(0xdead);
        bytes memory data = abi.encode(expected);
        assertEq(data.length, 32);
        assertEq(harness.decodeReferrer(data), expected);
    }

    function test_Packed20Bytes_DecodesCorrectly() public view {
        address expected = address(0xBEeFbeefbEefbeEFbeEfbEEfBEeFbeEfBeEfBeef);
        bytes memory data = abi.encodePacked(expected);
        assertEq(data.length, 20);
        assertEq(harness.decodeReferrer(data), expected);
    }

    function test_HexStringWithPrefix_DecodesCorrectly() public view {
        address expected = address(0x63cada40E8AcF7A1d47229af5Be35b78b16035fa);
        bytes memory data = bytes("0x63cada40e8acf7a1d47229af5be35b78b16035fa");
        assertEq(data.length, 42);
        assertEq(harness.decodeReferrer(data), expected);
    }

    function test_HexStringWithoutPrefix_DecodesCorrectly() public view {
        address expected = address(0x63cada40E8AcF7A1d47229af5Be35b78b16035fa);
        bytes memory data = bytes("63cada40e8acf7a1d47229af5be35b78b16035fa");
        assertEq(data.length, 40);
        assertEq(harness.decodeReferrer(data), expected);
    }

    function test_InvalidHexStringWithPrefix_ReturnsZero() public view {
        bytes memory data = bytes("0x63cada40e8acf7a1d47229af5be35b78b16035fg");
        assertEq(harness.decodeReferrer(data), address(0));
    }

    function test_LessThan20Bytes_ReturnsZero() public view {
        bytes memory data = hex"deadbeef";
        assertEq(data.length, 4);
        assertEq(harness.decodeReferrer(data), address(0));
    }

    function test_19Bytes_ReturnsZero() public view {
        bytes memory data = new bytes(19);
        data[0] = 0xff;
        assertEq(harness.decodeReferrer(data), address(0));
    }

    function test_1Byte_ReturnsZero() public view {
        bytes memory data = hex"ff";
        assertEq(harness.decodeReferrer(data), address(0));
    }

    function test_21Bytes_ExtractsFirst20() public view {
        // 20 bytes of address + 1 trailing byte
        address expected = address(0x1234567890AbcdEF1234567890aBcdef12345678);
        bytes memory data = abi.encodePacked(expected, uint8(0xff));
        assertEq(data.length, 21);
        assertEq(harness.decodeReferrer(data), expected);
    }

    // --- Fuzz tests ---

    function testFuzz_Packed20Bytes_RoundTrip(address addr) public view {
        bytes memory data = abi.encodePacked(addr);
        assertEq(harness.decodeReferrer(data), addr);
    }

    function testFuzz_AbiEncoded32Bytes_RoundTrip(address addr) public view {
        bytes memory data = abi.encode(addr);
        assertEq(harness.decodeReferrer(data), addr);
    }

    function testFuzz_ArbitraryBytes_20OrMore_ExtractsFirst20(uint8 extraLen, address addr) public view {
        // Build 20-byte packed address + random trailing bytes
        uint256 extra = bound(extraLen, 0, 31);
        // Skip lengths with dedicated decode branches.
        if (20 + extra == 32 || 20 + extra == 40 || 20 + extra == 42) extra++;
        bytes memory data = new bytes(20 + extra);
        bytes20 packed = bytes20(addr);
        for (uint256 i = 0; i < 20; i++) {
            data[i] = packed[i];
        }
        assertEq(harness.decodeReferrer(data), addr);
    }
}
