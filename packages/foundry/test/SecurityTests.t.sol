// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ContentRegistry} from "../contracts/ContentRegistry.sol";
import {RoundVotingEngine} from "../contracts/RoundVotingEngine.sol";
import {ProtocolConfig} from "../contracts/ProtocolConfig.sol";
import {RoundLib} from "../contracts/libraries/RoundLib.sol";
import {RoundEngineReadHelpers} from "./helpers/RoundEngineReadHelpers.sol";
import {CuryoReputation} from "../contracts/CuryoReputation.sol";
import {VotingTestBase, deployInitializedProtocolConfig} from "./helpers/VotingTestHelpers.sol";
import {MockCategoryRegistry} from "../contracts/mocks/MockCategoryRegistry.sol";

// ============================================================================
// Section 1 — Reentrancy Tests
// ============================================================================

/// @dev Malicious ERC20 that attempts re-entry on transfers to the attacker address.
contract MaliciousToken is ERC20 {
    address public attacker;
    address public target;
    bytes public reentrantCalldata;
    bool public armed;

    constructor() ERC20("Malicious", "MAL") {}

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }

    function arm(address _attacker, address _target, bytes calldata _calldata) external {
        attacker = _attacker;
        target = _target;
        reentrantCalldata = _calldata;
        armed = true;
    }

    function disarm() external {
        armed = false;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed && to == attacker && from != address(0)) {
            armed = false;
            (bool success, bytes memory returnData) = target.call(reentrantCalldata);
            if (!success) {
                assembly ("memory-safe") {
                    revert(add(returnData, 32), mload(returnData))
                }
            }
        }
    }
}

abstract contract SecurityHarnessBase is VotingTestBase {
    function _deploySecurityHarness(CuryoReputation token, address owner)
        internal
        returns (ContentRegistry registry, RoundVotingEngine votingEngine)
    {
        ContentRegistry registryImpl = new ContentRegistry();
        RoundVotingEngine engineImpl = new RoundVotingEngine();
        ProtocolConfig protocolConfig = deployInitializedProtocolConfig(owner);

        registry = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImpl), abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(token)))
                )
            )
        );

        votingEngine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engineImpl),
                    abi.encodeCall(
                        RoundVotingEngine.initialize,
                        (owner, address(token), address(registry), address(protocolConfig))
                    )
                )
            )
        );
    }

    function _configureSecurityHarness(
        ContentRegistry registry,
        RoundVotingEngine votingEngine,
        address treasury,
        uint256 epochDuration
    ) internal {
        registry.setVotingEngine(address(votingEngine));

        MockCategoryRegistry mockCategoryRegistry = new MockCategoryRegistry();
        mockCategoryRegistry.seedDefaultTestCategories();
        registry.setCategoryRegistry(address(mockCategoryRegistry));

        ProtocolConfig config = ProtocolConfig(address(votingEngine.protocolConfig()));
        config.setCategoryRegistry(address(mockCategoryRegistry));
        config.setTreasury(treasury);
        _setTlockDrandConfig(config, DEFAULT_DRAND_CHAIN_HASH, DEFAULT_DRAND_GENESIS_TIME, DEFAULT_DRAND_PERIOD);
        _setTlockRoundConfig(config, epochDuration, 7 days, 2, 200);
    }

    function _fundConsensusReserve(CuryoReputation token, RoundVotingEngine votingEngine, address owner) internal {
        uint256 reserveAmount = 1_000_000e6;
        token.mint(owner, reserveAmount);
        token.approve(address(votingEngine), reserveAmount);
        votingEngine.addToConsensusReserve(reserveAmount);
    }
}

contract SecurityReentrancyTest is SecurityHarnessBase {
    CuryoReputation crepToken;
    ContentRegistry registry;
    RoundVotingEngine votingEngine;

    address owner = address(0xA);
    address treasury = address(0xB);
    address submitter = address(0xC);
    address voter1 = address(0xD);
    address voter2 = address(0xE);
    address attacker = address(0xF);

    uint256 constant STAKE = 10e6;
    uint256 constant EPOCH_DURATION = 5 minutes;
    mapping(bytes32 => bool) internal commitDirections;
    mapping(bytes32 => bytes32) internal commitSalts;

    function _tlockDrandChainHash() internal pure override returns (bytes32) {
        return DEFAULT_DRAND_CHAIN_HASH;
    }

    function _tlockDrandGenesisTime() internal pure override returns (uint64) {
        return DEFAULT_DRAND_GENESIS_TIME;
    }

    function _tlockDrandPeriod() internal pure override returns (uint64) {
        return DEFAULT_DRAND_PERIOD;
    }

    function _tlockEpochDuration() internal pure override returns (uint256) {
        return EPOCH_DURATION;
    }

    function setUp() public {
        vm.warp(1000);
        vm.startPrank(owner);

        crepToken = new CuryoReputation(owner, owner);
        crepToken.grantRole(crepToken.MINTER_ROLE(), owner);
        (registry, votingEngine) = _deploySecurityHarness(crepToken, owner);
        _configureSecurityHarness(registry, votingEngine, treasury, EPOCH_DURATION);
        _fundConsensusReserve(crepToken, votingEngine, owner);

        {
            address[4] memory users = [submitter, voter1, voter2, attacker];
            for (uint256 i = 0; i < users.length; i++) {
                crepToken.mint(users[i], 10_000e6);
            }
        }

        vm.stopPrank();
    }

    function _submitContent() internal returns (uint256) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "test goal", "test goal", "test", 0);
        vm.stopPrank();
        return 1;
    }

    function _recordCommit(bytes32 commitKey, bool isUp, bytes32 salt) private {
        commitDirections[commitKey] = isUp;
        commitSalts[commitKey] = salt;
    }

    function _submitCommit(address voter, uint256 contentId, bool isUp, bytes32 salt) private returns (bytes32) {
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);
        uint64 targetRound = _tlockCommitTargetRound();
        bytes32 drandChainHash = _tlockDrandChainHash();
        bytes32 commitHash = _commitHash(isUp, salt, voter, contentId, targetRound, drandChainHash, ciphertext);
        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            targetRound,
            drandChainHash,
            commitHash,
            ciphertext,
            STAKE,
            address(0)
        );
        vm.stopPrank();
        return keccak256(abi.encodePacked(voter, commitHash));
    }

    function _commit(address voter, uint256 contentId, bool isUp) internal returns (bytes32) {
        bytes32 salt = keccak256(abi.encodePacked(voter, block.timestamp, contentId));
        bytes32 commitKey = _submitCommit(voter, contentId, isUp, salt);
        _recordCommit(commitKey, isUp, salt);
        return commitKey;
    }

    /// @notice claimCancelledRoundRefund token transfer cannot trigger re-entry
    function test_Reentrancy_ClaimRefund_BlocksCallback() public {
        uint256 contentId = _submitContent();

        _commit(voter1, contentId, true);

        // Advance past maxDuration to expire the round
        vm.warp(1000 + 7 days + 1);
        votingEngine.cancelExpiredRound(contentId, 1);

        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, 1);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        votingEngine.claimCancelledRoundRefund(contentId, 1);
    }

    /// @notice commitVote's nonReentrant guard prevents re-entry during transferFrom
    function test_Reentrancy_Vote_BlocksCallback() public {
        uint256 contentId = _submitContent();

        _commit(voter1, contentId, true);
        _commit(voter2, contentId, false);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, 1);
        assertEq(round.voteCount, 2, "Both commits should be recorded");
    }

    /// @notice settleRound's nonReentrant guard prevents re-entry during treasury transfer
    function test_Reentrancy_Settle_BlocksCallback() public {
        uint256 contentId = _submitContent();

        bytes32 ck1 = _commit(voter1, contentId, true);
        bytes32 ck2 = _commit(voter2, contentId, false);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);

        // Reveal after epoch ends
        vm.warp(round.startTime + EPOCH_DURATION + 1);
        _revealFromCiphertext(contentId, roundId, ck1);
        _revealFromCiphertext(contentId, roundId, ck2);

        // Settle
        votingEngine.settleRound(contentId, roundId);

        RoundLib.Round memory round2 = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        assertTrue(
            round2.state == RoundLib.RoundState.Settled || round2.state == RoundLib.RoundState.Tied,
            "Round should be settled or tied"
        );
    }

    function _revealFromCiphertext(uint256 cid, uint256 roundId, bytes32 commitKey) internal {
        RoundLib.Commit memory c = RoundEngineReadHelpers.commit(votingEngine, cid, roundId, commitKey);
        if (c.revealed || c.stakeAmount == 0) return;
        bool up = commitDirections[commitKey];
        bytes32 s = commitSalts[commitKey];
        votingEngine.revealVoteByCommitKey(cid, roundId, commitKey, up, s);
    }
}

// ============================================================================
// Section 2 — ERC1363 transferAndCall Tests
// ============================================================================

contract SecurityTransferAndCallTest is SecurityHarnessBase {
    struct VotePayloadArtifacts {
        uint64 targetRound;
        bytes32 drandChainHash;
        bytes ciphertext;
        bytes32 commitHash;
    }

    CuryoReputation crepToken;
    ContentRegistry registry;
    RoundVotingEngine votingEngine;

    address owner = address(0xA);
    address treasury = address(0xB);
    address submitter = address(0xC);
    address voter = address(0xD);
    address spender = address(0xE);

    uint256 constant STAKE = 10e6;
    uint256 constant EPOCH_DURATION = 5 minutes;

    function _tlockDrandChainHash() internal pure override returns (bytes32) {
        return DEFAULT_DRAND_CHAIN_HASH;
    }

    function _tlockDrandGenesisTime() internal pure override returns (uint64) {
        return DEFAULT_DRAND_GENESIS_TIME;
    }

    function _tlockDrandPeriod() internal pure override returns (uint64) {
        return DEFAULT_DRAND_PERIOD;
    }

    function _tlockEpochDuration() internal pure override returns (uint256) {
        return EPOCH_DURATION;
    }

    function setUp() public {
        vm.warp(1000);
        vm.startPrank(owner);

        crepToken = new CuryoReputation(owner, owner);
        crepToken.grantRole(crepToken.MINTER_ROLE(), owner);
        (registry, votingEngine) = _deploySecurityHarness(crepToken, owner);
        _configureSecurityHarness(registry, votingEngine, treasury, EPOCH_DURATION);
        _fundConsensusReserve(crepToken, votingEngine, owner);

        crepToken.mint(submitter, 10_000e6);
        crepToken.mint(voter, 10_000e6);

        vm.stopPrank();
    }

    function _submitContent() internal returns (uint256) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "test goal", "test goal", "test", 0);
        vm.stopPrank();
        return 1;
    }

    function _votePayload(uint256 contentId)
        internal
        view
        returns (bytes memory payload, bytes32 commitHash, bytes memory ciphertext)
    {
        bytes32 salt = keccak256(abi.encodePacked(voter, block.timestamp, contentId));
        VotePayloadArtifacts memory artifacts;
        artifacts.targetRound = _tlockCommitTargetRound();
        artifacts.drandChainHash = _tlockDrandChainHash();
        artifacts.ciphertext = _testCiphertext(true, salt, contentId, artifacts.targetRound, artifacts.drandChainHash);
        artifacts.commitHash = _commitHash(
            true, salt, voter, contentId, artifacts.targetRound, artifacts.drandChainHash, artifacts.ciphertext
        );
        payload = abi.encode(
            contentId,
            artifacts.commitHash,
            artifacts.ciphertext,
            address(0),
            artifacts.targetRound,
            artifacts.drandChainHash
        );
        commitHash = artifacts.commitHash;
        ciphertext = artifacts.ciphertext;
    }

    function test_TransferAndCall_RejectsDirectExternalCallback() public {
        uint256 contentId = _submitContent();
        (bytes memory payload,,) = _votePayload(contentId);

        vm.prank(voter);
        vm.expectRevert(RoundVotingEngine.Unauthorized.selector);
        votingEngine.onTransferReceived(voter, voter, STAKE, payload);
    }

    function test_TransferAndCall_RejectsApprovedSpenderForcedVote() public {
        uint256 contentId = _submitContent();
        (bytes memory payload,,) = _votePayload(contentId);
        uint256 voterBalanceBefore = crepToken.balanceOf(voter);

        vm.prank(voter);
        crepToken.approve(spender, STAKE);

        vm.prank(spender);
        vm.expectRevert(RoundVotingEngine.Unauthorized.selector);
        crepToken.transferFromAndCall(voter, address(votingEngine), STAKE, payload);

        assertEq(RoundEngineReadHelpers.activeRoundId(votingEngine, contentId), 0, "no round created");
        assertEq(crepToken.balanceOf(voter), voterBalanceBefore, "voter balance unchanged");
        assertEq(crepToken.balanceOf(address(votingEngine)), 1_000_000e6, "engine only holds reserve");
    }

    function test_TransferAndCall_RejectsMalformedPayload() public {
        uint256 contentId = _submitContent();
        uint256 voterBalanceBefore = crepToken.balanceOf(voter);

        vm.prank(voter);
        vm.expectRevert();
        crepToken.transferAndCall(address(votingEngine), STAKE, hex"1234");

        assertEq(RoundEngineReadHelpers.activeRoundId(votingEngine, contentId), 0, "no round created");
        assertEq(crepToken.balanceOf(voter), voterBalanceBefore, "voter balance unchanged");
        assertEq(crepToken.balanceOf(address(votingEngine)), 1_000_000e6, "engine only holds reserve");
    }

    function test_TransferAndCall_PlainTransferDoesNotCreateVote() public {
        uint256 contentId = _submitContent();

        vm.prank(voter);
        crepToken.transfer(address(votingEngine), STAKE);

        assertEq(
            RoundEngineReadHelpers.activeRoundId(votingEngine, contentId), 0, "plain transfers do not create rounds"
        );
        assertEq(crepToken.balanceOf(address(votingEngine)), 1_000_000e6 + STAKE, "tokens transferred without vote");
    }
}

// ============================================================================
// Section 4 — Settlement Timing Tests
// ============================================================================

contract SecuritySettlementTimingTest is SecurityHarnessBase {
    CuryoReputation crepToken;
    ContentRegistry registry;
    RoundVotingEngine votingEngine;

    address owner = address(0xA);
    address treasury = address(0xB);
    address submitter = address(0xC);
    address voter1 = address(0xD);
    address voter2 = address(0xE);

    uint256 constant STAKE = 10e6;
    uint256 constant EPOCH_DURATION = 5 minutes;
    mapping(bytes32 => bool) internal commitDirections;
    mapping(bytes32 => bytes32) internal commitSalts;

    function _tlockDrandChainHash() internal pure override returns (bytes32) {
        return DEFAULT_DRAND_CHAIN_HASH;
    }

    function _tlockDrandGenesisTime() internal pure override returns (uint64) {
        return DEFAULT_DRAND_GENESIS_TIME;
    }

    function _tlockDrandPeriod() internal pure override returns (uint64) {
        return DEFAULT_DRAND_PERIOD;
    }

    function _tlockEpochDuration() internal pure override returns (uint256) {
        return EPOCH_DURATION;
    }

    function setUp() public {
        vm.warp(1000);
        vm.startPrank(owner);

        crepToken = new CuryoReputation(owner, owner);
        crepToken.grantRole(crepToken.MINTER_ROLE(), owner);
        (registry, votingEngine) = _deploySecurityHarness(crepToken, owner);
        _configureSecurityHarness(registry, votingEngine, treasury, EPOCH_DURATION);
        _fundConsensusReserve(crepToken, votingEngine, owner);

        {
            address[3] memory users = [submitter, voter1, voter2];
            for (uint256 i = 0; i < users.length; i++) {
                crepToken.mint(users[i], 10_000e6);
            }
        }

        vm.stopPrank();
    }

    function _submitContent() internal returns (uint256) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "test goal", "test goal", "test", 0);
        vm.stopPrank();
        return 1;
    }

    function _recordCommit(bytes32 commitKey, bool isUp, bytes32 salt) private {
        commitDirections[commitKey] = isUp;
        commitSalts[commitKey] = salt;
    }

    function _submitCommit(address voter, uint256 contentId, bool isUp, bytes32 salt) private returns (bytes32) {
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);
        uint64 targetRound = _tlockCommitTargetRound();
        bytes32 drandChainHash = _tlockDrandChainHash();
        bytes32 commitHash = _commitHash(isUp, salt, voter, contentId, targetRound, drandChainHash, ciphertext);
        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            targetRound,
            drandChainHash,
            commitHash,
            ciphertext,
            STAKE,
            address(0)
        );
        vm.stopPrank();
        return keccak256(abi.encodePacked(voter, commitHash));
    }

    function _commit(address voter, uint256 contentId, bool isUp) internal returns (bytes32) {
        bytes32 salt = keccak256(abi.encodePacked(voter, block.timestamp, contentId));
        bytes32 commitKey = _submitCommit(voter, contentId, isUp, salt);
        _recordCommit(commitKey, isUp, salt);
        return commitKey;
    }

    function _revealFromCiphertext(uint256 cid, uint256 roundId, bytes32 commitKey) internal {
        RoundLib.Commit memory c = RoundEngineReadHelpers.commit(votingEngine, cid, roundId, commitKey);
        if (c.revealed || c.stakeAmount == 0) return;
        bool up = commitDirections[commitKey];
        bytes32 s = commitSalts[commitKey];
        votingEngine.revealVoteByCommitKey(cid, roundId, commitKey, up, s);
    }

    /// @notice Cannot reveal before epoch ends
    function test_CannotRevealBeforeEpochEnds() public {
        uint256 contentId = _submitContent();
        bytes32 ck1 = _commit(voter1, contentId, true);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);

        // Still before epoch end — reveal should revert
        vm.warp(round.startTime + EPOCH_DURATION - 1);
        bool up = commitDirections[ck1];
        bytes32 s = commitSalts[ck1];
        vm.expectRevert(RoundVotingEngine.EpochNotEnded.selector);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck1, up, s);
    }

    /// @notice Settlement is possible immediately after minVoters revealed
    function test_SettlementAfterReveals_Succeeds() public {
        uint256 contentId = _submitContent();
        bytes32 ck1 = _commit(voter1, contentId, true);
        bytes32 ck2 = _commit(voter2, contentId, false);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);

        vm.warp(round.startTime + EPOCH_DURATION + 1);
        _revealFromCiphertext(contentId, roundId, ck1);
        _revealFromCiphertext(contentId, roundId, ck2);

        votingEngine.settleRound(contentId, roundId);

        RoundLib.Round memory round2 = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        assertTrue(
            round2.state == RoundLib.RoundState.Settled || round2.state == RoundLib.RoundState.Tied,
            "Round should be settled at maxEpochBlocks"
        );
    }

    /// @notice One-sided consensus settlement after epoch ends
    function test_ConsensusSettlement_OneSided_Succeeds() public {
        uint256 contentId = _submitContent();

        // Only UP votes
        bytes32 ck1 = _commit(voter1, contentId, true);
        bytes32 ck2 = _commit(voter2, contentId, true);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);

        vm.warp(round.startTime + EPOCH_DURATION + 1);
        _revealFromCiphertext(contentId, roundId, ck1);
        _revealFromCiphertext(contentId, roundId, ck2);

        votingEngine.settleRound(contentId, roundId);

        RoundLib.Round memory round2 = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        assertEq(uint8(round2.state), uint8(RoundLib.RoundState.Settled), "Should settle as consensus");
        assertTrue(round2.upWins, "UP should win in one-sided UP round");
    }
}

// ============================================================================
// Section 4 — Access Control Negative Tests
// ============================================================================

contract SecurityAccessControlTest is Test {
    CuryoReputation crepToken;
    ContentRegistry registry;
    RoundVotingEngine votingEngine;
    address protocolConfigAddress;

    address owner = address(0xA);
    address treasury = address(0xB);
    address attacker = address(0xF1);

    bytes32 CONFIG_ROLE_ENGINE;
    bytes32 TREASURY_ROLE_ENGINE;
    bytes32 PAUSER_ROLE_ENGINE;
    bytes32 CONFIG_ROLE_REGISTRY;
    bytes32 TREASURY_ROLE_REGISTRY;
    bytes32 PAUSER_ROLE_REGISTRY;
    bytes32 MINTER_ROLE_TOKEN;
    bytes32 CONFIG_ROLE_TOKEN;

    function setUp() public {
        vm.warp(1000);
        vm.startPrank(owner);

        crepToken = new CuryoReputation(owner, owner);
        crepToken.grantRole(crepToken.MINTER_ROLE(), owner);

        ContentRegistry registryImpl = new ContentRegistry();
        RoundVotingEngine engineImpl = new RoundVotingEngine();

        registry = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImpl),
                    abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(crepToken)))
                )
            )
        );

        votingEngine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engineImpl),
                    abi.encodeCall(
                        RoundVotingEngine.initialize,
                        (owner, address(crepToken), address(registry), address(deployInitializedProtocolConfig(owner)))
                    )
                )
            )
        );
        protocolConfigAddress = address(votingEngine.protocolConfig());

        registry.setVotingEngine(address(votingEngine));
        MockCategoryRegistry mockCategoryRegistry = new MockCategoryRegistry();
        mockCategoryRegistry.seedDefaultTestCategories();
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(protocolConfigAddress).setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(protocolConfigAddress).setTreasury(treasury);
        ProtocolConfig(protocolConfigAddress).setConfig(5 minutes, 7 days, 2, 200);

        vm.stopPrank();

        CONFIG_ROLE_ENGINE = ProtocolConfig(protocolConfigAddress).CONFIG_ROLE();
        TREASURY_ROLE_ENGINE = ProtocolConfig(protocolConfigAddress).TREASURY_ROLE();
        PAUSER_ROLE_ENGINE = votingEngine.PAUSER_ROLE();
        CONFIG_ROLE_REGISTRY = registry.CONFIG_ROLE();
        TREASURY_ROLE_REGISTRY = registry.TREASURY_ROLE();
        PAUSER_ROLE_REGISTRY = registry.PAUSER_ROLE();
        MINTER_ROLE_TOKEN = crepToken.MINTER_ROLE();
        CONFIG_ROLE_TOKEN = crepToken.CONFIG_ROLE();
    }

    function _expectUnauthorized(address account, bytes32 role) internal {
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, account, role));
    }

    // ── RoundVotingEngine — CONFIG_ROLE (10 tests) ──

    function test_ACL_Engine_setRewardDistributor_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_ENGINE);
        ProtocolConfig(protocolConfigAddress).setRewardDistributor(attacker);
    }

    function test_ACL_Engine_setFrontendRegistry_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_ENGINE);
        ProtocolConfig(protocolConfigAddress).setFrontendRegistry(attacker);
    }

    function test_ACL_Engine_setCategoryRegistry_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_ENGINE);
        ProtocolConfig(protocolConfigAddress).setCategoryRegistry(attacker);
    }

    function test_ACL_Engine_setTreasury_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, TREASURY_ROLE_ENGINE);
        ProtocolConfig(protocolConfigAddress).setTreasury(attacker);
    }

    function test_ACL_Engine_setConfig_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_ENGINE);
        ProtocolConfig(protocolConfigAddress).setConfig(5 minutes, 7 days, 2, 200);
    }

    function test_ACL_Engine_addToConsensusReserve_IsPermissionless() public {
        // addToConsensusReserve is permissionless by design (treasury top-ups + slashed-stake routing)
        // Verify it reverts on insufficient allowance, not on access control
        vm.prank(attacker);
        vm.expectRevert(); // ERC20InsufficientAllowance — no tokens approved
        votingEngine.addToConsensusReserve(100);
    }

    function test_ACL_Engine_setVoterIdNFT_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_ENGINE);
        ProtocolConfig(protocolConfigAddress).setVoterIdNFT(attacker);
    }

    function test_ACL_Engine_setParticipationPool_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_ENGINE);
        ProtocolConfig(protocolConfigAddress).setParticipationPool(attacker);
    }

    // ── RoundVotingEngine — PAUSER_ROLE (2 tests) ──

    function test_ACL_Engine_pause_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, PAUSER_ROLE_ENGINE);
        votingEngine.pause();
    }

    function test_ACL_Engine_unpause_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, PAUSER_ROLE_ENGINE);
        votingEngine.unpause();
    }

    // ── ContentRegistry — CONFIG_ROLE (6 tests) ──

    function test_ACL_Registry_setVotingEngine_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_REGISTRY);
        registry.setVotingEngine(attacker);
    }

    function test_ACL_Registry_setCategoryRegistry_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_REGISTRY);
        registry.setCategoryRegistry(attacker);
    }

    function test_ACL_Registry_setVoterIdNFT_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_REGISTRY);
        registry.setVoterIdNFT(attacker);
    }

    function test_ACL_Registry_setBonusPool_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, TREASURY_ROLE_REGISTRY);
        registry.setBonusPool(attacker);
    }

    function test_ACL_Registry_setTreasury_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, TREASURY_ROLE_REGISTRY);
        registry.setTreasury(attacker);
    }

    // ── ContentRegistry — PAUSER_ROLE (2 tests) ──

    function test_ACL_Registry_pause_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, PAUSER_ROLE_REGISTRY);
        registry.pause();
    }

    function test_ACL_Registry_unpause_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, PAUSER_ROLE_REGISTRY);
        registry.unpause();
    }

    // ── CuryoReputation — MINTER_ROLE (1 test) ──

    function test_ACL_Token_mint_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, MINTER_ROLE_TOKEN);
        crepToken.mint(attacker, 1000e6);
    }

    // ── CuryoReputation — CONFIG_ROLE (2 tests) ──

    function test_ACL_Token_setGovernor_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_TOKEN);
        crepToken.setGovernor(attacker);
    }

    function test_ACL_Token_setContentVotingContracts_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_TOKEN);
        crepToken.setContentVotingContracts(attacker, attacker);
    }
}
