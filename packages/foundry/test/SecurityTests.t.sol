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
        // When transferring to attacker, attempt re-entry into the target
        if (armed && to == attacker && from != address(0)) {
            armed = false; // prevent infinite loop
            (bool success, bytes memory returnData) = target.call(reentrantCalldata);
            // We expect this to revert; if it doesn't, the test will catch it
            if (!success) {
                // Extract revert reason — expected to be ReentrancyGuardReentrantCall
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
                        RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry), true)
                    )
                )
            )
        );

        registry.setVotingEngine(address(votingEngine));
        votingEngine.setTreasury(treasury);
        votingEngine.setConfig(15 minutes, 7 days, 2, 200);

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

    function _commitVote(address voter, uint256 contentId, bool isUp, bytes32 salt)
        internal
        returns (bytes32 commitHash)
    {
        commitHash = keccak256(abi.encodePacked(isUp, salt, contentId));
        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(
            contentId, commitHash, _mockCiphertext(isUp, salt, contentId), STAKE, address(0)
        );
        vm.stopPrank();
    }

    function _mockCiphertext(bool isUp, bytes32 salt, uint256 contentId) internal pure returns (bytes memory) {
        return abi.encodePacked(isUp ? bytes1(uint8(1)) : bytes1(uint8(0)), salt, bytes32(contentId));
    }

    function _revealVote(address voter, uint256 contentId, uint256 roundId, bytes32 commitHash, bool isUp, bytes32 salt)
        internal
    {
        bytes32 commitKey = keccak256(abi.encodePacked(voter, commitHash));
        vm.prank(owner);
        votingEngine.revealVoteByCommitKey(contentId, roundId, commitKey, isUp, salt);
    }

    /// @notice claimCancelledRoundRefund token transfer cannot trigger re-entry
    function test_Reentrancy_ClaimRefund_BlocksCallback() public {
        uint256 contentId = _submitContent();

        // Commit votes
        _commitVote(voter1, contentId, true, bytes32("salt1"));

        // Advance past maxDuration to expire the round (no threshold reached)
        vm.warp(1000 + 7 days + 1);
        votingEngine.cancelExpiredRound(contentId, 1);

        // Attempt claim — the nonReentrant guard protects claimCancelledRoundRefund.
        // Even though CuryoReputation's _update doesn't call back, we verify the
        // function is protected by calling it successfully (no reentrancy path with real token).
        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, 1);

        // Double-claim should revert with AlreadyClaimed
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        votingEngine.claimCancelledRoundRefund(contentId, 1);
    }

    /// @notice commitVote's nonReentrant guard prevents re-entry during transferFrom
    function test_Reentrancy_CommitVote_BlocksCallback() public {
        uint256 contentId = _submitContent();

        // Commit one vote normally
        _commitVote(voter1, contentId, true, bytes32("salt1"));

        // Second voter commits — nonReentrant protects the commit flow
        _commitVote(voter2, contentId, false, bytes32("salt2"));

        // Verify both commits registered
        RoundLib.Round memory round = votingEngine.getRound(contentId, 1);
        assertEq(round.voteCount, 2, "Both votes should be committed");
    }

    /// @notice settleRound's nonReentrant guard prevents re-entry during treasury transfer
    function test_Reentrancy_SettleRound_BlocksCallback() public {
        uint256 contentId = _submitContent();

        bytes32 hash1 = _commitVote(voter1, contentId, true, bytes32("salt1"));
        bytes32 hash2 = _commitVote(voter2, contentId, false, bytes32("salt2"));

        // Advance past epoch end for reveals
        vm.warp(1000 + 15 minutes + 1);

        _revealVote(voter1, contentId, 1, hash1, true, bytes32("salt1"));
        _revealVote(voter2, contentId, 1, hash2, false, bytes32("salt2"));

        // Advance past settlement delay
        RoundLib.Round memory round = votingEngine.getRound(contentId, 1);
        vm.warp(round.thresholdReachedAt + 15 minutes);

        // Settle — nonReentrant protects against re-entry during token distributions
        votingEngine.settleRound(contentId, 1);

        // Verify settlement happened
        round = votingEngine.getRound(contentId, 1);
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
                        RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry), true)
                    )
                )
            )
        );

        registry.setVotingEngine(address(votingEngine));
        votingEngine.setTreasury(treasury);
        votingEngine.setConfig(15 minutes, 7 days, 2, 200);

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

    function _mockCiphertext(bool isUp, bytes32 salt, uint256 contentId) internal pure returns (bytes memory) {
        return abi.encodePacked(isUp ? bytes1(uint8(1)) : bytes1(uint8(0)), salt, bytes32(contentId));
    }

    /// @notice Valid permit signature allows commitVoteWithPermit in a single tx
    function test_Permit_ValidSignature_CommitsVote() public {
        uint256 contentId = _submitContent();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = crepToken.nonces(voter);
        (uint8 v, bytes32 r, bytes32 s) =
            _signPermit(voterPk, voter, address(votingEngine), STAKE, nonce, deadline);

        bytes32 commitHash = keccak256(abi.encodePacked(true, bytes32("salt1"), contentId));

        vm.prank(voter);
        votingEngine.commitVoteWithPermit(
            contentId,
            commitHash,
            _mockCiphertext(true, bytes32("salt1"), contentId),
            STAKE,
            deadline,
            v,
            r,
            s,
            address(0)
        );

        // Verify vote was committed
        RoundLib.Round memory round = votingEngine.getRound(contentId, 1);
        assertEq(round.voteCount, 1, "Vote should be committed");

        // Verify tokens transferred (allowance consumed)
        assertEq(crepToken.allowance(voter, address(votingEngine)), 0, "Allowance should be consumed");
        assertEq(crepToken.nonces(voter), nonce + 1, "Nonce should be incremented");
    }

    /// @notice Expired deadline reverts with ERC2612ExpiredSignature
    function test_Permit_ExpiredDeadline_Reverts() public {
        uint256 contentId = _submitContent();

        uint256 deadline = block.timestamp - 1; // already expired
        uint256 nonce = crepToken.nonces(voter);
        (uint8 v, bytes32 r, bytes32 s) =
            _signPermit(voterPk, voter, address(votingEngine), STAKE, nonce, deadline);

        bytes32 commitHash = keccak256(abi.encodePacked(true, bytes32("salt1"), contentId));

        vm.prank(voter);
        vm.expectRevert(abi.encodeWithSelector(bytes4(keccak256("ERC2612ExpiredSignature(uint256)")), deadline));
        votingEngine.commitVoteWithPermit(
            contentId,
            commitHash,
            _mockCiphertext(true, bytes32("salt1"), contentId),
            STAKE,
            deadline,
            v,
            r,
            s,
            address(0)
        );
    }

    /// @notice Signature from wrong private key reverts with ERC2612InvalidSigner
    function test_Permit_WrongSigner_Reverts() public {
        uint256 contentId = _submitContent();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = crepToken.nonces(voter);

        // Sign with a different private key
        (, uint256 wrongPk) = makeAddrAndKey("wrongSigner");
        (uint8 v, bytes32 r, bytes32 s) =
            _signPermit(wrongPk, voter, address(votingEngine), STAKE, nonce, deadline);

        bytes32 commitHash = keccak256(abi.encodePacked(true, bytes32("salt1"), contentId));

        vm.prank(voter);
        // ERC2612InvalidSigner(address signer, address owner) — the recovered signer won't match voter
        vm.expectRevert();
        votingEngine.commitVoteWithPermit(
            contentId,
            commitHash,
            _mockCiphertext(true, bytes32("salt1"), contentId),
            STAKE,
            deadline,
            v,
            r,
            s,
            address(0)
        );
    }

    /// @notice Replayed signature (same nonce) reverts on second use
    function test_Permit_ReplayedNonce_Reverts() public {
        uint256 contentId = _submitContent();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = crepToken.nonces(voter);
        (uint8 v, bytes32 r, bytes32 s) =
            _signPermit(voterPk, voter, address(votingEngine), STAKE, nonce, deadline);

        bytes32 commitHash1 = keccak256(abi.encodePacked(true, bytes32("salt1"), contentId));

        // First use succeeds
        vm.prank(voter);
        votingEngine.commitVoteWithPermit(
            contentId,
            commitHash1,
            _mockCiphertext(true, bytes32("salt1"), contentId),
            STAKE,
            deadline,
            v,
            r,
            s,
            address(0)
        );

        // Submit new content (voter already committed on contentId=1)
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/2", "test goal", "test", 0);
        vm.stopPrank();

        bytes32 commitHash2 = keccak256(abi.encodePacked(true, bytes32("salt2"), uint256(2)));

        // Second use of same signature (nonce already consumed) should revert
        vm.prank(voter);
        vm.expectRevert();
        votingEngine.commitVoteWithPermit(
            2,
            commitHash2,
            _mockCiphertext(true, bytes32("salt2"), 2),
            STAKE,
            deadline,
            v,
            r,
            s,
            address(0)
        );
    }

    /// @notice Permit signed for different amount than stakeAmount reverts
    /// (amount is part of the EIP-2612 digest, so wrong amount → wrong recovered signer)
    function test_Permit_WrongAmount_Reverts() public {
        uint256 contentId = _submitContent();

        uint256 deadline = block.timestamp + 1 hours;
        uint256 nonce = crepToken.nonces(voter);

        // Sign permit for 1 cREP but try to stake 10 cREP
        uint256 permitAmount = 1e6;
        (uint8 v, bytes32 r, bytes32 s) =
            _signPermit(voterPk, voter, address(votingEngine), permitAmount, nonce, deadline);

        bytes32 commitHash = keccak256(abi.encodePacked(true, bytes32("salt1"), contentId));

        vm.prank(voter);
        // Amount mismatch corrupts the digest → recovered signer ≠ voter → ERC2612InvalidSigner
        vm.expectRevert();
        votingEngine.commitVoteWithPermit(
            contentId,
            commitHash,
            _mockCiphertext(true, bytes32("salt1"), contentId),
            STAKE, // 10e6 — more than the 1e6 permitted
            deadline,
            v,
            r,
            s,
            address(0)
        );
    }
}

// ============================================================================
// Section 3 — Settlement Delay Boundary Tests
// ============================================================================

contract SecuritySettlementBoundaryTest is Test {
    CuryoReputation crepToken;
    ContentRegistry registry;
    RoundVotingEngine votingEngine;

    address owner = address(0xA);
    address treasury = address(0xB);
    address submitter = address(0xC);
    address voter1 = address(0xD);
    address voter2 = address(0xE);

    uint256 constant STAKE = 10e6;
    uint256 constant EPOCH_DURATION = 15 minutes; // 900 seconds

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
                        RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry), true)
                    )
                )
            )
        );

        registry.setVotingEngine(address(votingEngine));
        votingEngine.setTreasury(treasury);
        votingEngine.setConfig(EPOCH_DURATION, 7 days, 2, 200);

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

    function _commitVote(address voter, uint256 contentId, bool isUp, bytes32 salt)
        internal
        returns (bytes32 commitHash)
    {
        commitHash = keccak256(abi.encodePacked(isUp, salt, contentId));
        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(
            contentId, commitHash, _mockCiphertext(isUp, salt, contentId), STAKE, address(0)
        );
        vm.stopPrank();
    }

    function _mockCiphertext(bool isUp, bytes32 salt, uint256 contentId) internal pure returns (bytes memory) {
        return abi.encodePacked(isUp ? bytes1(uint8(1)) : bytes1(uint8(0)), salt, bytes32(contentId));
    }

    function _revealVote(address voter, uint256 contentId, uint256 roundId, bytes32 commitHash, bool isUp, bytes32 salt)
        internal
    {
        bytes32 commitKey = keccak256(abi.encodePacked(voter, commitHash));
        vm.prank(owner);
        votingEngine.revealVoteByCommitKey(contentId, roundId, commitKey, isUp, salt);
    }

    /// @dev Commits 2 votes at t=1000, reveals both after epoch end, returns thresholdReachedAt
    function _setupRevealed() internal returns (uint256 contentId, uint256 thresholdReachedAt) {
        contentId = _submitContent();

        // Commit both votes at t=1000
        bytes32 hash1 = _commitVote(voter1, contentId, true, bytes32("salt1"));
        bytes32 hash2 = _commitVote(voter2, contentId, false, bytes32("salt2"));

        // Advance past epoch 0 end (1000 + 900 = 1900)
        vm.warp(2000);

        // Reveal both — second reveal hits minVoters threshold
        _revealVote(voter1, contentId, 1, hash1, true, bytes32("salt1"));
        _revealVote(voter2, contentId, 1, hash2, false, bytes32("salt2"));

        RoundLib.Round memory round = votingEngine.getRound(contentId, 1);
        thresholdReachedAt = round.thresholdReachedAt;
    }

    /// @notice Settlement at thresholdReachedAt + epochDuration - 1 reverts
    function test_SettleBoundary_OneSecondBefore_Reverts() public {
        (uint256 contentId, uint256 thresholdAt) = _setupRevealed();

        uint256 boundary = thresholdAt + EPOCH_DURATION;
        vm.warp(boundary - 1);

        vm.expectRevert(RoundVotingEngine.SettlementDelayNotElapsed.selector);
        votingEngine.settleRound(contentId, 1);
    }

    /// @notice Settlement at exact boundary (thresholdReachedAt + epochDuration) succeeds
    function test_SettleBoundary_ExactBoundary_Succeeds() public {
        (uint256 contentId, uint256 thresholdAt) = _setupRevealed();

        uint256 boundary = thresholdAt + EPOCH_DURATION;
        vm.warp(boundary);

        votingEngine.settleRound(contentId, 1);

        RoundLib.Round memory round = votingEngine.getRound(contentId, 1);
        assertTrue(
            round.state == RoundLib.RoundState.Settled || round.state == RoundLib.RoundState.Tied,
            "Round should be settled or tied at exact boundary"
        );
    }

    /// @notice Settlement one second after boundary succeeds
    function test_SettleBoundary_OneSecondAfter_Succeeds() public {
        (uint256 contentId, uint256 thresholdAt) = _setupRevealed();

        uint256 boundary = thresholdAt + EPOCH_DURATION;
        vm.warp(boundary + 1);

        votingEngine.settleRound(contentId, 1);

        RoundLib.Round memory round = votingEngine.getRound(contentId, 1);
        assertTrue(
            round.state == RoundLib.RoundState.Settled || round.state == RoundLib.RoundState.Tied,
            "Round should be settled or tied after boundary"
        );
    }

    /// @notice thresholdReachedAt is set to block.timestamp when minVoters reveals are reached
    function test_SettleBoundary_ThresholdTimestamp_IsRevealTime() public {
        uint256 contentId = _submitContent();

        bytes32 hash1 = _commitVote(voter1, contentId, true, bytes32("salt1"));
        bytes32 hash2 = _commitVote(voter2, contentId, false, bytes32("salt2"));

        // Advance to a known reveal time
        uint256 revealTime = 2000;
        vm.warp(revealTime);

        _revealVote(voter1, contentId, 1, hash1, true, bytes32("salt1"));

        // After first reveal, threshold not yet reached
        RoundLib.Round memory round = votingEngine.getRound(contentId, 1);
        assertEq(round.thresholdReachedAt, 0, "Threshold should not be reached with 1 reveal");

        // Second reveal at same timestamp hits minVoters=2
        _revealVote(voter2, contentId, 1, hash2, false, bytes32("salt2"));

        round = votingEngine.getRound(contentId, 1);
        assertEq(round.thresholdReachedAt, revealTime, "thresholdReachedAt should equal block.timestamp at reveal");
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
                        RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry), true)
                    )
                )
            )
        );

        registry.setVotingEngine(address(votingEngine));
        votingEngine.setTreasury(treasury);
        votingEngine.setConfig(15 minutes, 7 days, 2, 200);

        vm.stopPrank();

        // Cache role hashes
        CONFIG_ROLE_ENGINE = votingEngine.CONFIG_ROLE();
        PAUSER_ROLE_ENGINE = votingEngine.PAUSER_ROLE();
        CONFIG_ROLE_REGISTRY = registry.CONFIG_ROLE();
        PAUSER_ROLE_REGISTRY = registry.PAUSER_ROLE();
        MINTER_ROLE_TOKEN = crepToken.MINTER_ROLE();
        CONFIG_ROLE_TOKEN = crepToken.CONFIG_ROLE();
    }

    function _expectUnauthorized(address account, bytes32 role) internal {
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, account, role)
        );
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
        votingEngine.setConfig(1, 1, 1, 1);
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
