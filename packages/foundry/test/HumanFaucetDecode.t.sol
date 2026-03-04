// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";

/// @title DecodeReferrerHarness
/// @notice Exposes HumanFaucet._decodeReferrer() logic for isolated testing.
/// @dev Mirrors the exact implementation from HumanFaucet.sol.
contract DecodeReferrerHarness {
    function decodeReferrer(bytes memory userData) external pure returns (address) {
        if (userData.length == 0) return address(0);
        if (userData.length == 32) return abi.decode(userData, (address));
        if (userData.length < 20) return address(0);

        address referrer;
        assembly {
            referrer := shr(96, mload(add(userData, 32)))
        }
        return referrer;
    }
}

/// @title HumanFaucetDecodeTest
/// @notice Unit + fuzz tests for the _decodeReferrer assembly fix (H-14).
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
        // Skip length 32 (ABI-decode path has stricter validation)
        if (20 + extra == 32) extra++;
        bytes memory data = new bytes(20 + extra);
        bytes20 packed = bytes20(addr);
        for (uint256 i = 0; i < 20; i++) {
            data[i] = packed[i];
        }
        assertEq(harness.decodeReferrer(data), addr);
    }
}
