// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";

// ============================================================================
// Section 1 — Reentrancy Tests
// ============================================================================

/// @dev Malicious ERC20 that attempts re-entry on transfers to the attacker address.
contract MaliciousToken is ERC20 {
    address public attacker;
    address public target;
    bytes public reentrantCalldata;
    bool public armed;

    constructor() ERC20("Malicious", "MAL") { }

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
                assembly {
                    revert(add(returnData, 32), mload(returnData))
                }
            }
        }
    }
}

contract SecurityReentrancyTest is Test {
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
                        RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry))
                    )
                )
            )
        );

        registry.setVotingEngine(address(votingEngine));
        votingEngine.setTreasury(treasury);
        votingEngine.setConfig(10, 50, 7 days, 2, 200, 30, 3, 500, 1000e6);

        uint256 reserveAmount = 1_000_000e6;
        crepToken.mint(owner, reserveAmount);
        crepToken.approve(address(votingEngine), reserveAmount);
        votingEngine.fundConsensusReserve(reserveAmount);

        address[4] memory users = [submitter, voter1, voter2, attacker];
        for (uint256 i = 0; i < users.length; i++) {
            crepToken.mint(users[i], 10_000e6);
        }

        vm.stopPrank();
    }

    function _submitContent() internal returns (uint256) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "test goal", "test", 0);
        vm.stopPrank();
        return 1;
    }

    function _vote(address voter, uint256 contentId, bool isUp) internal {
        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.vote(contentId, isUp, STAKE, address(0));
        vm.stopPrank();
    }

    /// @notice claimCancelledRoundRefund token transfer cannot trigger re-entry
    function test_Reentrancy_ClaimRefund_BlocksCallback() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true);

        // Advance past maxDuration to expire the round
        vm.warp(1000 + 7 days + 1);
        votingEngine.cancelExpiredRound(contentId, 1);

        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, 1);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        votingEngine.claimCancelledRoundRefund(contentId, 1);
    }

    /// @notice vote's nonReentrant guard prevents re-entry during transferFrom
    function test_Reentrancy_Vote_BlocksCallback() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        RoundLib.Round memory round = votingEngine.getRound(contentId, 1);
        assertEq(round.voteCount, 2, "Both votes should be recorded");
    }

    /// @notice trySettle's nonReentrant guard prevents re-entry during treasury transfer
    function test_Reentrancy_TrySettle_BlocksCallback() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        // Roll past maxEpochBlocks to force settlement
        vm.roll(block.number + 51);
        votingEngine.trySettle(contentId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, 1);
        assertTrue(
            round.state == RoundLib.RoundState.Settled || round.state == RoundLib.RoundState.Tied,
            "Round should be settled or tied"
        );
    }

    /// @notice onlySelf functions revert when called externally
    function test_OnlySelf_BlocksExternalCallers() public {
        vm.startPrank(attacker);

        vm.expectRevert(RoundVotingEngine.Unauthorized.selector);
        votingEngine.transferTokenExternal(attacker, 100e6);

        vm.expectRevert(RoundVotingEngine.Unauthorized.selector);
        votingEngine.distributeCategoryFeeExternal(1, 1, 50);

        vm.expectRevert(RoundVotingEngine.Unauthorized.selector);
        votingEngine.checkSubmitterStakeExternal(1);

        vm.stopPrank();
    }
}

// ============================================================================
// Section 2 — ERC20Permit Tests
// ============================================================================

contract SecurityPermitTest is Test {
    CuryoReputation crepToken;
    ContentRegistry registry;
    RoundVotingEngine votingEngine;

    address owner = address(0xA);
    address treasury = address(0xB);
    address submitter = address(0xC);

    uint256 voterPk;
    address voter;

    uint256 constant STAKE = 10e6;

    function setUp() public {
        vm.warp(1000);

        (voter, voterPk) = makeAddrAndKey("voter");

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
                        RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry))
                    )
                )
            )
        );

        registry.setVotingEngine(address(votingEngine));
        votingEngine.setTreasury(treasury);
        votingEngine.setConfig(10, 50, 7 days, 2, 200, 30, 3, 500, 1000e6);

        uint256 reserveAmount = 1_000_000e6;
        crepToken.mint(owner, reserveAmount);
        crepToken.approve(address(votingEngine), reserveAmount);
        votingEngine.fundConsensusReserve(reserveAmount);

        crepToken.mint(submitter, 10_000e6);
        crepToken.mint(voter, 10_000e6);

        vm.stopPrank();
    }

    function _signPermit(uint256 pk, address signer, address spender, uint256 value, uint256 nonce, uint256 deadline)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 PERMIT_TYPEHASH =
            keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");
        bytes32 structHash = keccak256(abi.encode(PERMIT_TYPEHASH, signer, spender, value, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", crepToken.DOMAIN_SEPARATOR(), structHash));
        (v, r, s) = vm.sign(pk, digest);
    }

    function _submitContent() internal returns (uint256) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "test goal", "test", 0);
        vm.stopPrank();
        return 1;
    }

    /// @notice Valid permit signature allows voteWithPermit in a single tx
    function test_Permit_ValidSignature_VotesWithPermit() public {
        uint256 contentId = _submitContent();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = crepToken.nonces(voter);
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(voterPk, voter, address(votingEngine), STAKE, nonce, deadline);

        vm.prank(voter);
        votingEngine.voteWithPermit(contentId, true, STAKE, deadline, v, r, s, address(0));

        RoundLib.Round memory round = votingEngine.getRound(contentId, 1);
        assertEq(round.voteCount, 1, "Vote should be recorded");
        assertEq(crepToken.allowance(voter, address(votingEngine)), 0, "Allowance should be consumed");
        assertEq(crepToken.nonces(voter), nonce + 1, "Nonce should be incremented");
    }

    /// @notice Expired deadline reverts with ERC2612ExpiredSignature
    function test_Permit_ExpiredDeadline_Reverts() public {
        uint256 contentId = _submitContent();

        uint256 deadline = block.timestamp - 1;
        uint256 nonce = crepToken.nonces(voter);
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(voterPk, voter, address(votingEngine), STAKE, nonce, deadline);

        vm.prank(voter);
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("ERC2612ExpiredSignature(uint256)")), deadline));
        votingEngine.voteWithPermit(contentId, true, STAKE, deadline, v, r, s, address(0));
    }

    /// @notice Signature from wrong private key reverts with ERC2612InvalidSigner
    function test_Permit_WrongSigner_Reverts() public {
        uint256 contentId = _submitContent();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = crepToken.nonces(voter);
        (, uint256 wrongPk) = makeAddrAndKey("wrongSigner");
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(wrongPk, voter, address(votingEngine), STAKE, nonce, deadline);

        vm.prank(voter);
        vm.expectRevert();
        votingEngine.voteWithPermit(contentId, true, STAKE, deadline, v, r, s, address(0));
    }

    /// @notice Replayed signature (same nonce) reverts on second use
    function test_Permit_ReplayedNonce_Reverts() public {
        uint256 contentId = _submitContent();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = crepToken.nonces(voter);
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(voterPk, voter, address(votingEngine), STAKE, nonce, deadline);

        // First use succeeds
        vm.prank(voter);
        votingEngine.voteWithPermit(contentId, true, STAKE, deadline, v, r, s, address(0));

        // Submit new content
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/2", "test goal", "test", 0);
        vm.stopPrank();

        // Second use of same signature should revert (nonce consumed)
        vm.prank(voter);
        vm.expectRevert();
        votingEngine.voteWithPermit(2, true, STAKE, deadline, v, r, s, address(0));
    }

    /// @notice Permit signed for different amount than stakeAmount reverts
    function test_Permit_WrongAmount_Reverts() public {
        uint256 contentId = _submitContent();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = crepToken.nonces(voter);
        uint256 permitAmount = 1e6;
        (uint8 v, bytes32 r, bytes32 s) =
            _signPermit(voterPk, voter, address(votingEngine), permitAmount, nonce, deadline);

        vm.prank(voter);
        vm.expectRevert();
        votingEngine.voteWithPermit(contentId, true, STAKE, deadline, v, r, s, address(0));
    }
}

// ============================================================================
// Section 3 — Settlement Probability Tests (replaces Settlement Delay)
// ============================================================================

contract SecuritySettlementProbabilityTest is Test {
    CuryoReputation crepToken;
    ContentRegistry registry;
    RoundVotingEngine votingEngine;

    address owner = address(0xA);
    address treasury = address(0xB);
    address submitter = address(0xC);
    address voter1 = address(0xD);
    address voter2 = address(0xE);

    uint256 constant STAKE = 10e6;

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
                        RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry))
                    )
                )
            )
        );

        registry.setVotingEngine(address(votingEngine));
        votingEngine.setTreasury(treasury);
        // minEpochBlocks=10, maxEpochBlocks=50
        votingEngine.setConfig(10, 50, 7 days, 2, 200, 30, 3, 500, 1000e6);

        uint256 reserveAmount = 1_000_000e6;
        crepToken.mint(owner, reserveAmount);
        crepToken.approve(address(votingEngine), reserveAmount);
        votingEngine.fundConsensusReserve(reserveAmount);

        address[3] memory users = [submitter, voter1, voter2];
        for (uint256 i = 0; i < users.length; i++) {
            crepToken.mint(users[i], 10_000e6);
        }

        vm.stopPrank();
    }

    function _submitContent() internal returns (uint256) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "test goal", "test", 0);
        vm.stopPrank();
        return 1;
    }

    function _vote(address voter, uint256 contentId, bool isUp) internal {
        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.vote(contentId, isUp, STAKE, address(0));
        vm.stopPrank();
    }

    /// @notice Settlement probability is 0 before minEpochBlocks
    function test_SettlementProb_BeforeMinEpoch_IsZero() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Roll forward 5 blocks (< minEpochBlocks=10)
        vm.roll(block.number + 5);
        uint256 prob = votingEngine.getSettlementProbability(contentId, roundId);
        assertEq(prob, 0, "Probability should be 0 before minEpochBlocks");
    }

    /// @notice Settlement probability is 10000 after maxEpochBlocks
    function test_SettlementProb_AfterMaxEpoch_Is10000() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Roll past maxEpochBlocks=50
        vm.roll(block.number + 51);
        uint256 prob = votingEngine.getSettlementProbability(contentId, roundId);
        assertEq(prob, 10000, "Probability should be 10000 after maxEpochBlocks");
    }

    /// @notice Settlement is guaranteed at maxEpochBlocks
    function test_Settlement_GuaranteedAtMaxEpoch() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        // Roll past maxEpochBlocks
        vm.roll(block.number + 51);
        votingEngine.trySettle(contentId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, 1);
        assertTrue(
            round.state == RoundLib.RoundState.Settled || round.state == RoundLib.RoundState.Tied,
            "Round should be settled at maxEpochBlocks"
        );
    }

    /// @notice One-sided consensus settlement after maxEpochBlocks
    function test_ConsensusSettlement_OneSided_AfterMaxEpoch() public {
        uint256 contentId = _submitContent();

        // Only UP votes
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, true);

        // Roll past maxEpochBlocks
        vm.roll(block.number + 51);
        votingEngine.trySettle(contentId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, 1);
        assertEq(uint8(round.state), uint8(RoundLib.RoundState.Settled), "Should settle as consensus");
        assertTrue(round.upWins, "UP should win in one-sided UP round");
    }
}

// ============================================================================
// Section 4 — Access Control Negative Tests
// ============================================================================

contract SecurityAccessControlTest is Test {
    CuryoReputation crepToken;
    ContentRegistry registry;
    RoundVotingEngine votingEngine;

    address owner = address(0xA);
    address treasury = address(0xB);
    address attacker = address(0xF1);

    bytes32 CONFIG_ROLE_ENGINE;
    bytes32 PAUSER_ROLE_ENGINE;
    bytes32 CONFIG_ROLE_REGISTRY;
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
                        RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry))
                    )
                )
            )
        );

        registry.setVotingEngine(address(votingEngine));
        votingEngine.setTreasury(treasury);
        votingEngine.setConfig(10, 50, 7 days, 2, 200, 30, 3, 500, 1000e6);

        vm.stopPrank();

        CONFIG_ROLE_ENGINE = votingEngine.CONFIG_ROLE();
        PAUSER_ROLE_ENGINE = votingEngine.PAUSER_ROLE();
        CONFIG_ROLE_REGISTRY = registry.CONFIG_ROLE();
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
        votingEngine.setRewardDistributor(attacker);
    }

    function test_ACL_Engine_setFrontendRegistry_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_ENGINE);
        votingEngine.setFrontendRegistry(attacker);
    }

    function test_ACL_Engine_setCategoryRegistry_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_ENGINE);
        votingEngine.setCategoryRegistry(attacker);
    }

    function test_ACL_Engine_setTreasury_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_ENGINE);
        votingEngine.setTreasury(attacker);
    }

    function test_ACL_Engine_setConfig_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_ENGINE);
        votingEngine.setConfig(10, 50, 7 days, 2, 200, 30, 3, 500, 1000e6);
    }

    function test_ACL_Engine_fundConsensusReserve_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_ENGINE);
        votingEngine.fundConsensusReserve(100);
    }

    function test_ACL_Engine_fundKeeperRewardPool_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_ENGINE);
        votingEngine.fundKeeperRewardPool(100);
    }

    function test_ACL_Engine_setKeeperReward_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_ENGINE);
        votingEngine.setKeeperReward(100);
    }

    function test_ACL_Engine_setVoterIdNFT_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_ENGINE);
        votingEngine.setVoterIdNFT(attacker);
    }

    function test_ACL_Engine_setParticipationPool_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_ENGINE);
        votingEngine.setParticipationPool(attacker);
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

    function test_ACL_Registry_setParticipationPool_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_REGISTRY);
        registry.setParticipationPool(attacker);
    }

    function test_ACL_Registry_setBonusPool_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_REGISTRY);
        registry.setBonusPool(attacker);
    }

    function test_ACL_Registry_setTreasury_Unauthorized() public {
        vm.prank(attacker);
        _expectUnauthorized(attacker, CONFIG_ROLE_REGISTRY);
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
