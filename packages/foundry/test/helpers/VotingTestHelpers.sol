// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { Vm, VmSafe } from "forge-std/Vm.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { Strings } from "@openzeppelin/contracts/utils/Strings.sol";
import { ContentRegistry } from "../../contracts/ContentRegistry.sol";
import { ProtocolConfig } from "../../contracts/ProtocolConfig.sol";

function deployInitializedProtocolConfig(address admin) returns (ProtocolConfig protocolConfig) {
    return deployInitializedProtocolConfig(admin, admin);
}

function deployInitializedProtocolConfig(address admin, address governance) returns (ProtocolConfig protocolConfig) {
    ProtocolConfig implementation = new ProtocolConfig();
    protocolConfig = ProtocolConfig(
        address(
            new ERC1967Proxy(address(implementation), abi.encodeCall(ProtocolConfig.initialize, (admin, governance)))
        )
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

/// @dev Base contract with shared helpers for commit-reveal tests.
///      Inherit from this instead of `Test` to get `_testCiphertext`, `_commitHash`, `_commitKey`.
abstract contract VotingTestBase is Test, ContentSubmissionTestBase {
    bytes32 internal constant DEFAULT_DRAND_CHAIN_HASH =
        0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971;
    uint64 internal constant DEFAULT_DRAND_GENESIS_TIME = 1;
    uint64 internal constant DEFAULT_DRAND_PERIOD = 3;
    uint256 internal constant DEFAULT_TLOCK_EPOCH_DURATION = 20 minutes;
    bytes internal constant TEST_DIRECTION_PREFIX = "test-direction=";
    bytes internal constant TEST_SALT_PREFIX = "test-salt=0x";
    ProtocolConfig internal activeTlockProtocolConfig;
    bytes32 internal activeTlockDrandChainHash = DEFAULT_DRAND_CHAIN_HASH;
    uint64 internal activeTlockDrandGenesisTime = DEFAULT_DRAND_GENESIS_TIME;
    uint64 internal activeTlockDrandPeriod = DEFAULT_DRAND_PERIOD;
    uint256 internal activeTlockEpochDuration = DEFAULT_TLOCK_EPOCH_DURATION;

    function _deployProtocolConfig(address admin) internal returns (ProtocolConfig protocolConfig) {
        return _deployProtocolConfig(admin, admin);
    }

    function _deployProtocolConfig(address admin, address governance) internal returns (ProtocolConfig protocolConfig) {
        protocolConfig = deployInitializedProtocolConfig(admin, governance);
        activeTlockProtocolConfig = protocolConfig;
        activeTlockEpochDuration = DEFAULT_TLOCK_EPOCH_DURATION;
        (VmSafe.CallerMode mode, address msgSender,) = HEVM.readCallers();
        if (mode == VmSafe.CallerMode.None && msgSender != governance) {
            vm.prank(governance);
        }
        _setTlockDrandConfig(protocolConfig, DEFAULT_DRAND_CHAIN_HASH, DEFAULT_DRAND_GENESIS_TIME, DEFAULT_DRAND_PERIOD);
    }

    function _setTlockRoundConfig(
        ProtocolConfig protocolConfig,
        uint256 epochDuration,
        uint256 maxDuration,
        uint256 minVoters,
        uint256 maxVoters
    ) internal {
        protocolConfig.setConfig(epochDuration, maxDuration, minVoters, maxVoters);
        activeTlockProtocolConfig = protocolConfig;
        activeTlockEpochDuration = epochDuration;
    }

    function _setTlockDrandConfig(ProtocolConfig protocolConfig, bytes32 chainHash, uint64 genesisTime, uint64 period)
        internal
    {
        protocolConfig.setDrandConfig(chainHash, genesisTime, period);
        activeTlockProtocolConfig = protocolConfig;
        activeTlockDrandChainHash = chainHash;
        activeTlockDrandGenesisTime = genesisTime;
        activeTlockDrandPeriod = period;
    }

    /// @dev Build a test-only payload accepted by the contract; it is fake AGE armor, not real tlock ciphertext.
    function _testCiphertext(bool isUp, bytes32 salt, uint256 contentId) internal pure returns (bytes memory) {
        return abi.encodePacked(
            "-----BEGIN AGE ENCRYPTED FILE-----\n",
            "test-direction=",
            isUp ? "up" : "down",
            "\n",
            "test-salt=",
            Strings.toHexString(uint256(salt), 32),
            "\n",
            "test-content-id=",
            Strings.toString(contentId),
            "\n",
            "-----END AGE ENCRYPTED FILE-----\n"
        );
    }

    /// @dev Build commit hash bound to the exact ciphertext bytes used at commit time.
    function _commitHash(bool isUp, bytes32 salt, uint256 contentId) internal view returns (bytes32) {
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);
        return _commitHash(isUp, salt, contentId, _tlockCommitTargetRound(), _tlockDrandChainHash(), ciphertext);
    }

    /// @dev Build commit hash for a caller-supplied ciphertext.
    function _commitHash(bool isUp, bytes32 salt, uint256 contentId, bytes memory ciphertext)
        internal
        view
        returns (bytes32)
    {
        return _commitHash(isUp, salt, contentId, _tlockCommitTargetRound(), _tlockDrandChainHash(), ciphertext);
    }

    function _tlockCommitTargetRound() internal view returns (uint64) {
        return _roundAt(block.timestamp + _tlockEpochDuration(), _tlockDrandGenesisTime(), _tlockDrandPeriod());
    }

    function _tlockTargetRoundAt(uint256 revealableAfter) internal view returns (uint64) {
        return _roundAt(revealableAfter, _tlockDrandGenesisTime(), _tlockDrandPeriod());
    }

    function _tlockDrandChainHash() internal view virtual returns (bytes32) {
        return activeTlockDrandChainHash;
    }

    function _tlockDrandGenesisTime() internal view virtual returns (uint64) {
        return activeTlockDrandGenesisTime;
    }

    function _tlockDrandPeriod() internal view virtual returns (uint64) {
        return activeTlockDrandPeriod;
    }

    function _tlockEpochDuration() internal view virtual returns (uint256) {
        return activeTlockEpochDuration;
    }

    function _roundAt(uint256 timestamp, uint64 genesisTime, uint64 period) internal pure returns (uint64) {
        if (period == 0 || timestamp < genesisTime) return 0;
        return uint64(((timestamp - genesisTime) / period) + 1);
    }

    function _commitHash(
        bool isUp,
        bytes32 salt,
        uint256 contentId,
        uint64 targetRound,
        bytes32 drandChainHash,
        bytes memory ciphertext
    )
        internal
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encodePacked(isUp, salt, contentId, targetRound, drandChainHash, keccak256(ciphertext))
        );
    }

    function _decodeTestCiphertext(bytes memory ciphertext) internal pure returns (bool isUp, bytes32 salt) {
        isUp = _parseTestDirection(ciphertext);
        salt = _parseTestSalt(ciphertext);
    }

    function _parseTestDirection(bytes memory ciphertext) private pure returns (bool) {
        uint256 directionStart = _findMarker(ciphertext, TEST_DIRECTION_PREFIX);
        if (directionStart == type(uint256).max) revert("Missing test-direction");

        uint256 valueStart = directionStart + TEST_DIRECTION_PREFIX.length;
        if (valueStart + 1 < ciphertext.length && ciphertext[valueStart] == "u" && ciphertext[valueStart + 1] == "p") {
            return true;
        }
        if (
            valueStart + 3 < ciphertext.length && ciphertext[valueStart] == "d" && ciphertext[valueStart + 1] == "o"
                && ciphertext[valueStart + 2] == "w" && ciphertext[valueStart + 3] == "n"
        ) {
            return false;
        }

        revert("Invalid test-direction");
    }

    function _parseTestSalt(bytes memory ciphertext) private pure returns (bytes32) {
        uint256 saltStart = _findMarker(ciphertext, TEST_SALT_PREFIX);
        if (saltStart == type(uint256).max) revert("Missing test-salt");
        return _readHexBytes32(ciphertext, saltStart + TEST_SALT_PREFIX.length);
    }

    function _findMarker(bytes memory haystack, bytes memory needle) private pure returns (uint256) {
        if (needle.length == 0 || haystack.length < needle.length) return type(uint256).max;

        for (uint256 i = 0; i <= haystack.length - needle.length; i++) {
            bool matches = true;
            for (uint256 j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) {
                    matches = false;
                    break;
                }
            }
            if (matches) return i;
        }

        return type(uint256).max;
    }

    function _readHexBytes32(bytes memory data, uint256 start) private pure returns (bytes32) {
        if (start + 64 > data.length) revert("Invalid test-salt length");

        uint256 value = 0;
        for (uint256 i = 0; i < 64; i++) {
            value = (value << 4) | _hexNibble(data[start + i]);
        }

        return bytes32(value);
    }

    function _hexNibble(bytes1 ch) private pure returns (uint256) {
        uint8 code = uint8(ch);
        if (code >= uint8(bytes1("0")) && code <= uint8(bytes1("9"))) return code - uint8(bytes1("0"));
        if (code >= uint8(bytes1("a")) && code <= uint8(bytes1("f"))) return 10 + code - uint8(bytes1("a"));
        if (code >= uint8(bytes1("A")) && code <= uint8(bytes1("F"))) return 10 + code - uint8(bytes1("A"));
        revert("Invalid hex nibble");
    }

    /// @dev Build commit key: keccak256(abi.encodePacked(voter, commitHash)).
    function _commitKey(address voter, bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(voter, hash));
    }
}
