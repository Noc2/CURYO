// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {Vm, VmSafe} from "forge-std/Vm.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {CuryoReputation} from "../../contracts/CuryoReputation.sol";
import {ContentRegistry} from "../../contracts/ContentRegistry.sol";
import {ProtocolConfig} from "../../contracts/ProtocolConfig.sol";
import {RoundVotingEngine} from "../../contracts/RoundVotingEngine.sol";
import {RatingLib} from "../../contracts/libraries/RatingLib.sol";
import {MockQuestionRewardPoolEscrow} from "../mocks/MockQuestionRewardPoolEscrow.sol";

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
    ContentRegistry internal activeTlockContentRegistry;
    uint8 internal constant DEFAULT_SUBMISSION_REWARD_ASSET_CREP = 0;
    uint256 internal constant DEFAULT_SUBMISSION_REWARD_POOL = 1e6;
    uint256 internal constant DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS = 3;
    uint256 internal constant DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS = 1;
    uint256 internal constant DEFAULT_SUBMISSION_REWARD_EXPIRES_AT = 0;

    function _submitContentWithReservation(
        ContentRegistry registry,
        string memory url,
        string memory title,
        string memory description,
        string memory tags,
        uint256 categoryId
    ) internal returns (uint256 contentId) {
        activeTlockContentRegistry = registry;
        (VmSafe.CallerMode mode, address msgSender, address txOrigin) = HEVM.readCallers();
        bool hasActivePrank = mode == VmSafe.CallerMode.Prank || mode == VmSafe.CallerMode.RecurrentPrank;
        if (hasActivePrank) {
            HEVM.stopPrank();
        }
        _ensureActiveProtocolConfig(registry);
        address rewardEscrow = _ensureDefaultQuestionRewardPoolEscrow(registry);
        bool stopNormalizedPrank = false;
        if (hasActivePrank) {
            HEVM.startPrank(msgSender, txOrigin);
            stopNormalizedPrank = mode == VmSafe.CallerMode.Prank;
        }

        address submitter =
            mode == VmSafe.CallerMode.None ? address(this) : (msgSender != address(0) ? msgSender : address(this));
        uint256 submissionCategoryId = categoryId == 0 ? 1 : categoryId;
        string[] memory imageUrls = new string[](0);
        bytes32 salt = keccak256(
            abi.encode(
                url, title, description, tags, submissionCategoryId, submitter, block.timestamp, block.number, gasleft()
            )
        );
        (, bytes32 submissionKey) =
            registry.previewQuestionSubmissionKey(url, imageUrls, "", title, description, tags, submissionCategoryId);
        uint256 rewardAmount = _defaultSubmissionRewardAmount(registry);
        bytes32 revealCommitment = keccak256(
            abi.encode(
                submissionKey,
                _submissionMediaHash(imageUrls, ""),
                title,
                description,
                tags,
                submissionCategoryId,
                salt,
                submitter,
                DEFAULT_SUBMISSION_REWARD_ASSET_CREP,
                rewardAmount,
                DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS,
                DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS,
                DEFAULT_SUBMISSION_REWARD_EXPIRES_AT
            )
        );

        IERC20(registry.crepToken()).approve(rewardEscrow, rewardAmount);
        registry.reserveSubmission(revealCommitment);
        HEVM.warp(block.timestamp + 1);
        contentId = registry.submitQuestion(url, imageUrls, "", title, description, tags, submissionCategoryId, salt);

        if (stopNormalizedPrank) {
            HEVM.stopPrank();
        }
    }

    function _reserveQuestionMediaSubmission(
        ContentRegistry registry,
        string[] memory imageUrls,
        string memory videoUrl,
        string memory title,
        string memory description,
        string memory tags,
        uint256 categoryId,
        bytes32 salt,
        address submitter
    ) internal returns (bytes32 submissionKey) {
        string memory contextUrl = bytes(videoUrl).length != 0 ? videoUrl : imageUrls[0];
        (, submissionKey) = registry.previewQuestionSubmissionKey(
            contextUrl, imageUrls, videoUrl, title, description, tags, categoryId
        );
        uint256 rewardAmount = _defaultSubmissionRewardAmount(registry);
        bytes32 revealCommitment = keccak256(
            abi.encode(
                submissionKey,
                _submissionMediaHash(imageUrls, videoUrl),
                title,
                description,
                tags,
                categoryId,
                salt,
                submitter,
                DEFAULT_SUBMISSION_REWARD_ASSET_CREP,
                rewardAmount,
                DEFAULT_SUBMISSION_REWARD_REQUIRED_VOTERS,
                DEFAULT_SUBMISSION_REWARD_SETTLED_ROUNDS,
                DEFAULT_SUBMISSION_REWARD_EXPIRES_AT
            )
        );
        (VmSafe.CallerMode mode, address msgSender, address txOrigin) = HEVM.readCallers();
        bool hasActivePrank = mode == VmSafe.CallerMode.Prank || mode == VmSafe.CallerMode.RecurrentPrank;
        if (hasActivePrank) {
            HEVM.stopPrank();
        }
        _ensureActiveProtocolConfig(registry);
        address rewardEscrow = _ensureDefaultQuestionRewardPoolEscrow(registry);
        if (hasActivePrank) {
            HEVM.startPrank(msgSender, txOrigin);
        }
        IERC20(registry.crepToken()).approve(rewardEscrow, rewardAmount);
        registry.reserveSubmission(revealCommitment);
    }

    function _submissionMediaHash(string[] memory imageUrls, string memory videoUrl) internal pure returns (bytes32) {
        return keccak256(abi.encode(imageUrls, videoUrl));
    }

    function _submitQuestionImageWithReservation(
        ContentRegistry registry,
        string memory imageUrl,
        string memory title,
        string memory description,
        string memory tags,
        uint256 categoryId,
        bytes32 salt,
        address submitter
    ) internal returns (uint256 contentId, bytes32 submissionKey) {
        string[] memory imageUrls = _singleImageUrls(imageUrl);
        submissionKey = _reserveQuestionMediaSubmission(
            registry, imageUrls, "", title, description, tags, categoryId, salt, submitter
        );
        HEVM.warp(block.timestamp + 1);
        contentId = registry.submitQuestion(imageUrl, imageUrls, "", title, description, tags, categoryId, salt);
    }

    function _defaultSubmissionRewardAmount(ContentRegistry registry) internal view returns (uint256) {
        ProtocolConfig config = registry.protocolConfig();
        if (address(config) != address(0)) {
            uint256 configuredMinimum = config.minSubmissionCrepPool();
            if (configuredMinimum != 0) return configuredMinimum;
        }
        return DEFAULT_SUBMISSION_REWARD_POOL;
    }

    function _activeSubmissionProtocolConfig() internal view virtual returns (ProtocolConfig) {
        return ProtocolConfig(address(0));
    }

    function _ensureActiveProtocolConfig(ContentRegistry registry) internal {
        ProtocolConfig desiredConfig = _activeSubmissionProtocolConfig();
        if (address(desiredConfig) == address(0) || address(registry.protocolConfig()) == address(desiredConfig)) {
            return;
        }

        bytes32 configRole = registry.CONFIG_ROLE();
        address[8] memory candidates = [
            address(this), address(1), address(2), address(0xA), address(0xB), address(0xAA), address(0xBB), address(10)
        ];
        for (uint256 i = 0; i < candidates.length; i++) {
            if (registry.hasRole(configRole, candidates[i])) {
                HEVM.prank(candidates[i]);
                registry.setProtocolConfig(address(desiredConfig));
                return;
            }
        }
    }

    function _ensureDefaultQuestionRewardPoolEscrow(ContentRegistry registry) internal returns (address rewardEscrow) {
        rewardEscrow = registry.questionRewardPoolEscrow();
        if (rewardEscrow != address(0)) return rewardEscrow;

        MockQuestionRewardPoolEscrow mockRewardPoolEscrow = new MockQuestionRewardPoolEscrow();
        bytes32 configRole = registry.CONFIG_ROLE();
        address[8] memory candidates = [
            address(this), address(1), address(2), address(0xA), address(0xB), address(0xAA), address(0xBB), address(10)
        ];
        for (uint256 i = 0; i < candidates.length; i++) {
            if (registry.hasRole(configRole, candidates[i])) {
                HEVM.prank(candidates[i]);
                registry.setQuestionRewardPoolEscrow(address(mockRewardPoolEscrow));
                return address(mockRewardPoolEscrow);
            }
        }
        revert("Bounty escrow not set");
    }

    function _singleImageUrls(string memory imageUrl) internal pure returns (string[] memory imageUrls) {
        imageUrls = new string[](1);
        imageUrls[0] = imageUrl;
    }

    function _emptyImageUrls() internal pure returns (string[] memory imageUrls) {
        imageUrls = new string[](0);
    }

    function _submissionImageUrl(string memory url) internal pure returns (string memory) {
        bytes memory urlBytes = bytes(url);
        if (urlBytes.length == 0) return "https://example.com/test.jpg";

        uint256 suffixOffset = urlBytes.length;
        for (uint256 i = 0; i < urlBytes.length; i++) {
            if (urlBytes[i] == "?" || urlBytes[i] == "#") {
                suffixOffset = i;
                break;
            }
        }
        if (suffixOffset == urlBytes.length) return string.concat(url, ".jpg");

        bytes memory suffix = ".jpg";
        bytes memory out = new bytes(urlBytes.length + suffix.length);
        for (uint256 i = 0; i < suffixOffset; i++) {
            out[i] = urlBytes[i];
        }
        for (uint256 i = 0; i < suffix.length; i++) {
            out[suffixOffset + i] = suffix[i];
        }
        for (uint256 i = suffixOffset; i < urlBytes.length; i++) {
            out[i + suffix.length] = urlBytes[i];
        }
        return string(out);
    }
}

/// @dev Base contract with shared helpers for commit-reveal tests.
///      Inherit from this instead of `Test` to get `_testCiphertext`, `_commitHash`, `_commitKey`.
abstract contract VotingTestBase is Test, ContentSubmissionTestBase {
    struct TestCommitArtifacts {
        bytes ciphertext;
        uint16 roundReferenceRatingBps;
        uint64 targetRound;
        bytes32 drandChainHash;
        bytes32 commitHash;
        bytes32 commitKey;
    }

    struct DirectTestCommitRequest {
        RoundVotingEngine engine;
        CuryoReputation crepToken;
        address voter;
        uint256 contentId;
        bool isUp;
        uint256 stake;
        address frontend;
        bytes32 salt;
    }

    struct TransferAndCallTestCommitRequest {
        RoundVotingEngine engine;
        CuryoReputation crepToken;
        address voter;
        uint256 contentId;
        bool isUp;
        uint256 stake;
        address frontend;
        bytes32 salt;
    }

    bytes32 internal constant DEFAULT_DRAND_CHAIN_HASH =
        0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971;
    uint64 internal constant DEFAULT_DRAND_GENESIS_TIME = 1;
    uint64 internal constant DEFAULT_DRAND_PERIOD = 3;
    uint256 internal constant DEFAULT_TLOCK_EPOCH_DURATION = 20 minutes;
    bytes internal constant TEST_AGE_HEADER_RAW = "-----BEGIN AGE ENCRYPTED FILE-----";
    bytes internal constant TEST_AGE_HEADER = "-----BEGIN AGE ENCRYPTED FILE-----\n";
    bytes internal constant TEST_AGE_FOOTER = "-----END AGE ENCRYPTED FILE-----\n";
    bytes internal constant TEST_AGE_VERSION = "age-encryption.org/v1\n";
    bytes internal constant TEST_TLOCK_LINE_PREFIX = "-> tlock ";
    bytes internal constant TEST_MAC_LINE_PREFIX = "--- ";
    bytes internal constant TEST_PAYLOAD_LINE_PREFIX = "payload ";
    uint256 internal constant TEST_AGE_LINE_CHUNK_SIZE = 64;
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

    /// @dev Build a structurally valid AGE/tlock envelope for tests. It is not a real decryptable tlock ciphertext.
    function _testCiphertext(bool isUp, bytes32 salt, uint256 contentId) internal view returns (bytes memory) {
        return _testCiphertext(isUp, salt, contentId, _tlockCommitTargetRound(), _tlockDrandChainHash());
    }

    /// @dev Build a structurally valid test ciphertext that embeds caller-supplied tlock metadata for branch tests.
    function _testCiphertext(bool isUp, bytes32 salt, uint256 contentId, uint64 targetRound, bytes32 drandChainHash)
        internal
        pure
        returns (bytes memory)
    {
        return _testCiphertextWithFiller(isUp, salt, contentId, targetRound, drandChainHash, 0);
    }

    function _testCiphertextWithFiller(
        bool isUp,
        bytes32 salt,
        uint256 contentId,
        uint64 targetRound,
        bytes32 drandChainHash,
        uint256 fillerLength
    ) internal pure returns (bytes memory ciphertext) {
        return _armoredTestCiphertext(
            _testCiphertextPayload(isUp, salt, contentId, targetRound, drandChainHash, fillerLength), true
        );
    }

    function _testCiphertextPayload(
        bool isUp,
        bytes32 salt,
        uint256 contentId,
        uint64 targetRound,
        bytes32 drandChainHash,
        uint256 fillerLength
    ) internal pure returns (bytes memory decodedPayload) {
        contentId; // Content binding lives in the commit hash, so the test payload only needs direction + salt.

        bytes memory targetRoundBytes = bytes(Strings.toString(targetRound));
        bytes memory chainHashHex = _bytes32Hex(drandChainHash);
        bytes memory saltHex = _bytes32Hex(salt);
        bytes memory filler = _filledBytes(fillerLength, bytes1("A"));
        bytes memory recipientBody = abi.encodePacked(
            bytes32(uint256(targetRound)),
            drandChainHash,
            bytes16(keccak256(abi.encodePacked(salt, fillerLength, isUp ? bytes1("u") : bytes1("d"))))
        );
        bytes memory encodedRecipientBody = _chunkedUnpaddedBase64(recipientBody);
        bytes memory encodedMac =
            _unpaddedBase64(abi.encodePacked(keccak256(abi.encodePacked(targetRound, drandChainHash, salt))));

        return abi.encodePacked(
            TEST_AGE_VERSION,
            TEST_TLOCK_LINE_PREFIX,
            targetRoundBytes,
            " ",
            chainHashHex,
            "\n",
            encodedRecipientBody,
            TEST_MAC_LINE_PREFIX,
            encodedMac,
            "\n",
            TEST_PAYLOAD_LINE_PREFIX,
            isUp ? bytes1("u") : bytes1("d"),
            ":",
            saltHex,
            "\n",
            filler
        );
    }

    /// @dev Build commit hash bound to the exact ciphertext bytes used at commit time.
    function _commitHash(bool isUp, bytes32 salt, uint256 contentId) internal view returns (bytes32) {
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);
        return _commitHash(
            isUp,
            salt,
            contentId,
            _currentRatingReferenceBps(contentId),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ciphertext
        );
    }

    /// @dev Build commit hash for a caller-supplied ciphertext.
    function _commitHash(bool isUp, bytes32 salt, uint256 contentId, bytes memory ciphertext)
        internal
        view
        returns (bytes32)
    {
        return _commitHash(
            isUp,
            salt,
            contentId,
            _currentRatingReferenceBps(contentId),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ciphertext
        );
    }

    function _buildTestCommitArtifacts(address voter, bool isUp, bytes32 salt, uint256 contentId)
        internal
        view
        returns (TestCommitArtifacts memory artifacts)
    {
        artifacts.ciphertext = _testCiphertext(isUp, salt, contentId);
        artifacts.roundReferenceRatingBps = _currentRatingReferenceBps(contentId);
        artifacts.targetRound = _tlockCommitTargetRound();
        artifacts.drandChainHash = _tlockDrandChainHash();
        artifacts.commitHash = _commitHash(
            isUp,
            salt,
            contentId,
            artifacts.roundReferenceRatingBps,
            artifacts.targetRound,
            artifacts.drandChainHash,
            artifacts.ciphertext
        );
        artifacts.commitKey = _commitKey(voter, artifacts.commitHash);
    }

    function _commitTestVote(DirectTestCommitRequest memory request) internal returns (bytes32 commitKey) {
        TestCommitArtifacts memory artifacts =
            _buildTestCommitArtifacts(request.voter, request.isUp, request.salt, request.contentId);

        vm.startPrank(request.voter);
        request.crepToken.approve(address(request.engine), request.stake);
        request.engine
            .commitVote(
                request.contentId,
                artifacts.roundReferenceRatingBps,
                artifacts.targetRound,
                artifacts.drandChainHash,
                artifacts.commitHash,
                artifacts.ciphertext,
                request.stake,
                request.frontend
            );
        vm.stopPrank();

        return artifacts.commitKey;
    }

    function _transferAndCallTestVote(TransferAndCallTestCommitRequest memory request)
        internal
        returns (bytes32 commitKey)
    {
        TestCommitArtifacts memory artifacts =
            _buildTestCommitArtifacts(request.voter, request.isUp, request.salt, request.contentId);
        bytes memory payload = abi.encode(
            request.contentId,
            artifacts.roundReferenceRatingBps,
            artifacts.commitHash,
            artifacts.ciphertext,
            request.frontend,
            artifacts.targetRound,
            artifacts.drandChainHash
        );

        vm.prank(request.voter);
        request.crepToken.transferAndCall(address(request.engine), request.stake, payload);

        return artifacts.commitKey;
    }

    function _tlockCommitTargetRound() internal view returns (uint64) {
        return _roundAt(block.timestamp + _tlockEpochDuration(), _tlockDrandGenesisTime(), _tlockDrandPeriod());
    }

    function _tlockTargetRoundAt(uint256 revealableAfter) internal view returns (uint64) {
        return _roundAt(revealableAfter, _tlockDrandGenesisTime(), _tlockDrandPeriod());
    }

    function _tlockRoundTimestamp(uint64 targetRound) internal view returns (uint256) {
        if (targetRound == 0) return 0;
        return uint256(_tlockDrandGenesisTime()) + (uint256(targetRound) - 1) * uint256(_tlockDrandPeriod());
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

    function _activeSubmissionProtocolConfig() internal view override returns (ProtocolConfig) {
        return activeTlockProtocolConfig;
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
    ) internal view returns (bytes32) {
        return _commitHash(
            isUp, salt, contentId, _currentRatingReferenceBps(contentId), targetRound, drandChainHash, ciphertext
        );
    }

    function _commitHash(
        bool isUp,
        bytes32 salt,
        uint256 contentId,
        uint16 roundReferenceRatingBps,
        uint64 targetRound,
        bytes32 drandChainHash,
        bytes memory ciphertext
    ) internal pure returns (bytes32) {
        return keccak256(
            abi.encodePacked(
                isUp, salt, contentId, roundReferenceRatingBps, targetRound, drandChainHash, keccak256(ciphertext)
            )
        );
    }

    function _currentRatingReferenceBps(uint256 contentId) internal view returns (uint16) {
        if (address(activeTlockContentRegistry) == address(0)) {
            return RatingLib.DEFAULT_RATING_BPS;
        }

        return activeTlockContentRegistry.getRating(contentId);
    }

    function _defaultRatingReferenceBps() internal pure returns (uint16) {
        return RatingLib.DEFAULT_RATING_BPS;
    }

    function _decodeTestCiphertext(bytes memory ciphertext) internal pure returns (bool isUp, bytes32 salt) {
        bytes memory decodedPayload = _decodeTestAgePayload(ciphertext);
        uint256 lineStart = _findMarker(decodedPayload, TEST_PAYLOAD_LINE_PREFIX);
        if (lineStart == type(uint256).max) revert("Missing test-payload");

        uint256 offset = lineStart + TEST_PAYLOAD_LINE_PREFIX.length;
        bytes1 direction = decodedPayload[offset];
        if (direction == bytes1("u")) {
            isUp = true;
        } else if (direction == bytes1("d")) {
            isUp = false;
        } else {
            revert("Invalid test-direction");
        }

        if (offset + 66 >= decodedPayload.length || decodedPayload[offset + 1] != bytes1(":")) {
            revert("Invalid test-direction");
        }
        salt = _readHexBytes32(decodedPayload, offset + 2);
    }

    function _decodeTestAgePayload(bytes memory ciphertext) private pure returns (bytes memory) {
        if (!_hasPrefix(ciphertext, TEST_AGE_HEADER) || !_hasSuffix(ciphertext, TEST_AGE_FOOTER)) {
            revert("Invalid test ciphertext");
        }

        uint256 payloadStart = TEST_AGE_HEADER.length;
        uint256 payloadEnd = ciphertext.length - TEST_AGE_FOOTER.length;
        return _decodeBase64(ciphertext, payloadStart, payloadEnd);
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

    function _copyBytes(bytes memory target, uint256 offset, bytes memory source) private pure returns (uint256) {
        for (uint256 i = 0; i < source.length; i++) {
            target[offset + i] = source[i];
        }
        return offset + source.length;
    }

    function _writeHexBytes32(bytes memory target, uint256 offset, bytes32 value) private pure {
        for (uint256 i = 0; i < 32; i++) {
            uint8 byteValue = uint8(value[i]);
            target[offset + (i * 2)] = _hexChar(byteValue >> 4);
            target[offset + (i * 2) + 1] = _hexChar(byteValue & 0x0f);
        }
    }

    function _hexChar(uint8 nibble) private pure returns (bytes1) {
        return nibble < 10 ? bytes1(nibble + uint8(bytes1("0"))) : bytes1(nibble + 87);
    }

    function _bytes32Hex(bytes32 value) internal pure returns (bytes memory encoded) {
        encoded = new bytes(64);
        _writeHexBytes32(encoded, 0, value);
    }

    function _filledBytes(uint256 length, bytes1 fill) private pure returns (bytes memory buffer) {
        buffer = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            buffer[i] = fill;
        }
    }

    function _armoredTestCiphertext(bytes memory decodedPayload, bool newlineAfterHeader)
        internal
        pure
        returns (bytes memory)
    {
        bytes memory encodedPayload = _chunkBase64(bytes(Base64.encode(decodedPayload)));
        if (newlineAfterHeader) {
            return abi.encodePacked(TEST_AGE_HEADER, encodedPayload, "\n", TEST_AGE_FOOTER);
        }
        return abi.encodePacked(TEST_AGE_HEADER_RAW, encodedPayload, "\n", TEST_AGE_FOOTER);
    }

    function _chunkedUnpaddedBase64(bytes memory raw) private pure returns (bytes memory) {
        return abi.encodePacked(_chunkBase64(_unpaddedBase64(raw)), "\n");
    }

    function _unpaddedBase64(bytes memory raw) private pure returns (bytes memory encoded) {
        encoded = bytes(Base64.encode(raw));
        uint256 trimmedLength = encoded.length;
        while (trimmedLength > 0 && encoded[trimmedLength - 1] == bytes1("=")) {
            trimmedLength--;
        }

        bytes memory trimmed = new bytes(trimmedLength);
        for (uint256 i = 0; i < trimmedLength; i++) {
            trimmed[i] = encoded[i];
        }
        return trimmed;
    }

    function _chunkBase64(bytes memory encoded) private pure returns (bytes memory chunked) {
        if (encoded.length == 0) return bytes("");

        uint256 lineCount = (encoded.length + TEST_AGE_LINE_CHUNK_SIZE - 1) / TEST_AGE_LINE_CHUNK_SIZE;
        chunked = new bytes(encoded.length + (lineCount - 1));

        uint256 src = 0;
        uint256 dst = 0;
        while (src < encoded.length) {
            uint256 lineLength = encoded.length - src;
            if (lineLength > TEST_AGE_LINE_CHUNK_SIZE) {
                lineLength = TEST_AGE_LINE_CHUNK_SIZE;
            }

            for (uint256 i = 0; i < lineLength; i++) {
                chunked[dst++] = encoded[src++];
            }

            if (src < encoded.length) {
                chunked[dst++] = bytes1("\n");
            }
        }
    }

    function _hasPrefix(bytes memory data, bytes memory prefix) private pure returns (bool) {
        if (data.length < prefix.length) return false;
        for (uint256 i = 0; i < prefix.length; i++) {
            if (data[i] != prefix[i]) return false;
        }
        return true;
    }

    function _hasSuffix(bytes memory data, bytes memory suffix) private pure returns (bool) {
        if (data.length < suffix.length) return false;
        uint256 start = data.length - suffix.length;
        for (uint256 i = 0; i < suffix.length; i++) {
            if (data[start + i] != suffix[i]) return false;
        }
        return true;
    }

    function _decodeBase64(bytes memory data, uint256 start, uint256 end) private pure returns (bytes memory out) {
        bytes memory clean = _stripBase64Whitespace(data, start, end);
        if (clean.length == 0 || clean.length % 4 != 0) revert("Invalid test ciphertext");

        uint256 padding = 0;
        if (clean[clean.length - 1] == "=") padding++;
        if (clean.length > 1 && clean[clean.length - 2] == "=") padding++;

        out = new bytes((clean.length / 4) * 3 - padding);
        uint256 outIndex = 0;

        for (uint256 i = 0; i < clean.length; i += 4) {
            bytes1 third = clean[i + 2];
            bytes1 fourth = clean[i + 3];
            if (third == "=" && fourth != "=") revert("Invalid test ciphertext");

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

    function _stripBase64Whitespace(bytes memory data, uint256 start, uint256 end)
        private
        pure
        returns (bytes memory clean)
    {
        uint256 cleanLength = 0;
        for (uint256 i = start; i < end; i++) {
            bytes1 ch = data[i];
            if (ch == 0x0a || ch == 0x0d) continue;
            if (!_isBase64Char(ch) && ch != "=") revert("Invalid test ciphertext");
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

    function _base64Value(bytes1 ch) private pure returns (uint8) {
        uint8 code = uint8(ch);
        if (code >= 65 && code <= 90) return code - 65;
        if (code >= 97 && code <= 122) return 26 + code - 97;
        if (code >= 48 && code <= 57) return 52 + code - 48;
        if (code == 43) return 62;
        if (code == 47) return 63;
        revert("Invalid test ciphertext");
    }

    function _isBase64Char(bytes1 ch) private pure returns (bool) {
        uint8 code = uint8(ch);
        return (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || (code >= 48 && code <= 57) || code == 43
            || code == 47;
    }

    /// @dev Build commit key: keccak256(abi.encodePacked(voter, commitHash)).
    function _commitKey(address voter, bytes32 hash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(voter, hash));
    }
}
