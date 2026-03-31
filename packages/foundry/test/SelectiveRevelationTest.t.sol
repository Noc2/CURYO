// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";

/// @title SelectiveRevelationTest
/// @notice Tests for the selective vote revelation (front-running keeper) fix.
///         Validates that the epochUnrevealedCount counter + revealGracePeriod
///         prevents attackers from selectively revealing votes and settling.
contract SelectiveRevelationTest is VotingTestBase {
    CuryoReputation public crepToken;
    ContentRegistry public registry;
    RoundVotingEngine public engine;
    RoundRewardDistributor public rewardDistributor;

    address public owner = address(1);
    address public submitter = address(2);
    // 10 voters for the attack scenario
    address[10] public voters;
    address public treasury = address(100);

    uint256 public constant STAKE = 5e6; // 5 cREP
    uint256 public constant T0 = 1_000_000;
    uint256 public constant EPOCH = 1 hours;
    uint256 public constant GRACE_PERIOD = 60 minutes;

    function setUp() public {
        vm.warp(T0);
        vm.startPrank(owner);

        crepToken = new CuryoReputation(owner, owner);
        crepToken.grantRole(crepToken.MINTER_ROLE(), owner);

        ContentRegistry registryImpl = new ContentRegistry();
        RoundVotingEngine engineImpl = new RoundVotingEngine();
        RoundRewardDistributor distImpl = new RoundRewardDistributor();

        registry = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImpl),
                    abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(crepToken)))
                )
            )
        );

        engine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engineImpl),
                    abi.encodeCall(
                        RoundVotingEngine.initialize,
                        (owner, address(crepToken), address(registry), address(_deployProtocolConfig(owner)))
                    )
                )
            )
        );

        rewardDistributor = RoundRewardDistributor(
            address(
                new ERC1967Proxy(
                    address(distImpl),
                    abi.encodeCall(
                        RoundRewardDistributor.initialize,
                        (owner, address(crepToken), address(engine), address(registry))
                    )
                )
            )
        );

        registry.setVotingEngine(address(engine));
        MockCategoryRegistry mockCategoryRegistry = new MockCategoryRegistry();
        mockCategoryRegistry.seedDefaultTestCategories();
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(engine.protocolConfig())).setRewardDistributor(address(rewardDistributor));
        ProtocolConfig(address(engine.protocolConfig())).setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(engine.protocolConfig())).setTreasury(treasury);
        ProtocolConfig(address(engine.protocolConfig())).setConfig(EPOCH, 7 days, 3, 1000);
        ProtocolConfig(address(engine.protocolConfig())).setRevealGracePeriod(GRACE_PERIOD);

        crepToken.mint(owner, 2_000_000e6);
        crepToken.approve(address(engine), 500_000e6);
        engine.addToConsensusReserve(500_000e6);

        // Set up 10 voters
        for (uint256 i = 0; i < 10; i++) {
            voters[i] = address(uint160(10 + i));
            crepToken.mint(voters[i], 10_000e6);
        }

        crepToken.mint(submitter, 10_000e6);

        vm.stopPrank();
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _commit(address voter, uint256 contentId, bool isUp, uint256 stake)
        internal
        returns (bytes32 commitKey, bytes32 salt)
    {
        salt = keccak256(abi.encodePacked(voter, block.timestamp));
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);
        bytes32 commitHash = _commitHash(isUp, salt, contentId, ciphertext);
        vm.prank(voter);
        crepToken.approve(address(engine), stake);
        vm.prank(voter);
        engine.commitVote(contentId, _tlockCommitTargetRound(), _tlockDrandChainHash(), commitHash, ciphertext, stake, address(0));
        commitKey = keccak256(abi.encodePacked(voter, commitHash));
    }

    function _reveal(uint256 contentId, uint256 roundId, bytes32 commitKey, bool isUp, bytes32 salt) internal {
        engine.revealVoteByCommitKey(contentId, roundId, commitKey, isUp, salt);
    }

    function _submitContent() internal returns (uint256 contentId) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/selective", "test", "test", "test", 0);
        vm.stopPrank();
        contentId = 1;
    }

    // =========================================================================
    // CORE ATTACK SCENARIO
    // =========================================================================

    /// @notice Reproduces the selective revelation attack: 10 epoch-1 voters (6 UP, 4 DOWN),
    ///         attacker reveals only 3 (2 UP + 1 DOWN) and tries to settle. Must revert.
    function test_SelectiveReveal_BlocksSettlement() public {
        uint256 contentId = _submitContent();

        // 6 UP voters, 4 DOWN voters — all in epoch 1
        bytes32[10] memory commitKeys;
        bytes32[10] memory salts;
        bool[10] memory directions = [true, true, true, true, true, true, false, false, false, false];

        for (uint256 i = 0; i < 10; i++) {
            (commitKeys[i], salts[i]) = _commit(voters[i], contentId, directions[i], STAKE);
        }

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r = RoundEngineReadHelpers.round(engine, contentId, roundId);

        // Warp past epoch end
        vm.warp(r.startTime + EPOCH + 1);

        // Attacker selectively reveals only 3 votes: 2 UP + 1 DOWN
        _reveal(contentId, roundId, commitKeys[0], true, salts[0]);
        _reveal(contentId, roundId, commitKeys[1], true, salts[1]);
        _reveal(contentId, roundId, commitKeys[6], false, salts[6]);

        // Settlement should revert — 7 unrevealed past-epoch votes remain within grace period
        vm.expectRevert(RoundVotingEngine.UnrevealedPastEpochVotes.selector);
        engine.settleRound(contentId, roundId);
    }

    /// @notice Same scenario but all 10 votes are revealed — settlement succeeds.
    function test_AllPastEpochRevealed_SettlementSucceeds() public {
        uint256 contentId = _submitContent();

        bytes32[10] memory commitKeys;
        bytes32[10] memory salts;
        bool[10] memory directions = [true, true, true, true, true, true, false, false, false, false];

        for (uint256 i = 0; i < 10; i++) {
            (commitKeys[i], salts[i]) = _commit(voters[i], contentId, directions[i], STAKE);
        }

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r = RoundEngineReadHelpers.round(engine, contentId, roundId);

        vm.warp(r.startTime + EPOCH + 1);

        // Reveal ALL 10 votes
        for (uint256 i = 0; i < 10; i++) {
            _reveal(contentId, roundId, commitKeys[i], directions[i], salts[i]);
        }

        // Settlement succeeds
        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
        assertTrue(round.upWins); // 6 UP vs 4 DOWN
    }

    // =========================================================================
    // MULTI-EPOCH: CURRENT EPOCH DOESN'T BLOCK
    // =========================================================================

    /// @notice Epoch-1 votes all revealed. Epoch-2 votes still in current epoch (unrevealed).
    ///         Settlement should succeed because current-epoch votes don't block.
    function test_MultiEpoch_CurrentEpochDoesNotBlock() public {
        uint256 contentId = _submitContent();

        // 3 voters in epoch 1
        (bytes32 ck1, bytes32 s1) = _commit(voters[0], contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voters[1], contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voters[2], contentId, false, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r = RoundEngineReadHelpers.round(engine, contentId, roundId);

        // Warp to epoch 2 (past epoch-1 end, within epoch-2)
        vm.warp(r.startTime + EPOCH + 1);

        // 2 more voters in epoch 2 (current epoch — not yet revealable)
        _commit(voters[3], contentId, false, STAKE);
        _commit(voters[4], contentId, false, STAKE);

        // Reveal all 3 epoch-1 votes
        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, true, s2);
        _reveal(contentId, roundId, ck3, false, s3);

        // Settlement succeeds — epoch-2 votes are in current epoch, don't block
        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
    }

    // =========================================================================
    // GRACE PERIOD EXPIRY
    // =========================================================================

    /// @notice Unrevealed past-epoch votes exist but grace period has expired.
    ///         Settlement should succeed (unrevealed votes handled post-settlement).
    function test_GracePeriodExpiry_SettlementSucceeds() public {
        uint256 contentId = _submitContent();

        bytes32[4] memory commitKeys;
        bytes32[4] memory salts;
        bool[4] memory directions = [true, true, false, false];

        for (uint256 i = 0; i < 4; i++) {
            (commitKeys[i], salts[i]) = _commit(voters[i], contentId, directions[i], STAKE);
        }

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r = RoundEngineReadHelpers.round(engine, contentId, roundId);

        // Warp past epoch end + full grace period
        vm.warp(r.startTime + EPOCH + GRACE_PERIOD + 1);

        // Only reveal 3 of 4 votes (enough for minVoters)
        _reveal(contentId, roundId, commitKeys[0], true, salts[0]);
        _reveal(contentId, roundId, commitKeys[1], true, salts[1]);
        _reveal(contentId, roundId, commitKeys[2], false, salts[2]);

        // Settlement succeeds — grace period expired, unrevealed vote doesn't block
        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
    }

    /// @notice Within grace period, unrevealed votes still block settlement.
    function test_WithinGracePeriod_SettlementBlocked() public {
        uint256 contentId = _submitContent();

        bytes32[4] memory commitKeys;
        bytes32[4] memory salts;
        bool[4] memory directions = [true, true, false, false];

        for (uint256 i = 0; i < 4; i++) {
            (commitKeys[i], salts[i]) = _commit(voters[i], contentId, directions[i], STAKE);
        }

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r = RoundEngineReadHelpers.round(engine, contentId, roundId);

        // Warp past epoch end but WITHIN grace period (30 min into 60 min grace)
        vm.warp(r.startTime + EPOCH + 30 minutes);

        // Reveal 3 of 4 votes
        _reveal(contentId, roundId, commitKeys[0], true, salts[0]);
        _reveal(contentId, roundId, commitKeys[1], true, salts[1]);
        _reveal(contentId, roundId, commitKeys[2], false, salts[2]);

        // Settlement blocked — 1 unrevealed vote within grace period
        vm.expectRevert(RoundVotingEngine.UnrevealedPastEpochVotes.selector);
        engine.settleRound(contentId, roundId);
    }

    // =========================================================================
    // COUNTER ACCURACY
    // =========================================================================

    /// @notice Verify epochUnrevealedCount decrements correctly as votes are revealed.
    function test_CounterAccuracy_DecrementOnReveal() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voters[0], contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voters[1], contentId, false, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voters[2], contentId, true, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r = RoundEngineReadHelpers.round(engine, contentId, roundId);
        uint256 epochEnd = r.startTime + EPOCH;

        assertEq(r.voteCount, 3);
        assertEq(r.revealedCount, 0);

        vm.warp(epochEnd + 1);

        _reveal(contentId, roundId, ck1, true, s1);
        assertEq(RoundEngineReadHelpers.round(engine, contentId, roundId).revealedCount, 1);

        _reveal(contentId, roundId, ck2, false, s2);
        assertEq(RoundEngineReadHelpers.round(engine, contentId, roundId).revealedCount, 2);

        _reveal(contentId, roundId, ck3, true, s3);
        assertEq(RoundEngineReadHelpers.round(engine, contentId, roundId).revealedCount, 3);

        // Settlement succeeds
        engine.settleRound(contentId, roundId);
    }

    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    /// @notice CONFIG_ROLE can update revealGracePeriod.
    function test_SetRevealGracePeriod_ConfigRole() public {
        ProtocolConfig cfg = ProtocolConfig(address(engine.protocolConfig()));
        vm.prank(owner);
        cfg.setRevealGracePeriod(2 hours);
        assertEq(cfg.revealGracePeriod(), 2 hours);
    }

    /// @notice revealGracePeriod must be >= epochDuration.
    function test_SetRevealGracePeriod_BelowEpochDuration_Reverts() public {
        // epochDuration is 1 hour; 30 min < 1 hour → revert
        ProtocolConfig cfg = ProtocolConfig(address(engine.protocolConfig()));
        vm.prank(owner);
        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        cfg.setRevealGracePeriod(30 minutes);
    }

    /// @notice Non-CONFIG_ROLE cannot set revealGracePeriod.
    function test_SetRevealGracePeriod_Unauthorized_Reverts() public {
        ProtocolConfig cfg = ProtocolConfig(address(engine.protocolConfig()));
        vm.prank(voters[0]);
        vm.expectRevert();
        cfg.setRevealGracePeriod(2 hours);
    }

    function test_RevealGracePeriodSnapshot_OldRoundKeepsOriginalValue() public {
        uint256 contentId = _submitContent();

        bytes32[4] memory commitKeys;
        bytes32[4] memory salts;
        bool[4] memory directions = [true, true, false, false];

        for (uint256 i = 0; i < 4; i++) {
            (commitKeys[i], salts[i]) = _commit(voters[i], contentId, directions[i], STAKE);
        }

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(engine.roundRevealGracePeriodSnapshot(contentId, roundId), GRACE_PERIOD);

        ProtocolConfig cfg = ProtocolConfig(address(engine.protocolConfig()));
        vm.prank(owner);
        cfg.setRevealGracePeriod(2 hours);

        vm.warp(r.startTime + EPOCH + GRACE_PERIOD + 1);

        _reveal(contentId, roundId, commitKeys[0], true, salts[0]);
        _reveal(contentId, roundId, commitKeys[1], true, salts[1]);
        _reveal(contentId, roundId, commitKeys[2], false, salts[2]);

        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
    }

    function test_RevealGracePeriodSnapshot_NewRoundUsesUpdatedValue() public {
        ProtocolConfig cfg = ProtocolConfig(address(engine.protocolConfig()));
        vm.prank(owner);
        cfg.setRevealGracePeriod(2 hours);

        uint256 contentId = _submitContent();

        bytes32[4] memory commitKeys;
        bytes32[4] memory salts;
        bool[4] memory directions = [true, true, false, false];

        for (uint256 i = 0; i < 4; i++) {
            (commitKeys[i], salts[i]) = _commit(voters[i], contentId, directions[i], STAKE);
        }

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(engine.roundRevealGracePeriodSnapshot(contentId, roundId), 2 hours);

        vm.warp(r.startTime + EPOCH + GRACE_PERIOD + 1);

        _reveal(contentId, roundId, commitKeys[0], true, salts[0]);
        _reveal(contentId, roundId, commitKeys[1], true, salts[1]);
        _reveal(contentId, roundId, commitKeys[2], false, salts[2]);

        vm.expectRevert(RoundVotingEngine.UnrevealedPastEpochVotes.selector);
        engine.settleRound(contentId, roundId);

        vm.warp(r.startTime + EPOCH + 2 hours + 1);
        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
    }

    // =========================================================================
    // MULTI-EPOCH SETTLEMENT: BOTH EPOCHS PAST
    // =========================================================================

    /// @notice Two epochs past: epoch-1 fully revealed, epoch-2 has unrevealed within grace.
    ///         Settlement blocked by epoch-2 unrevealed votes.
    function test_MultiEpoch_Epoch2UnrevealedBlocks() public {
        uint256 contentId = _submitContent();

        // 3 voters in epoch 1
        (bytes32 ck1, bytes32 s1) = _commit(voters[0], contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voters[1], contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voters[2], contentId, false, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r = RoundEngineReadHelpers.round(engine, contentId, roundId);

        // Warp to epoch 2
        vm.warp(r.startTime + EPOCH + 1);

        // 1 voter in epoch 2
        _commit(voters[3], contentId, false, STAKE);

        // Reveal all epoch-1 votes
        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, true, s2);
        _reveal(contentId, roundId, ck3, false, s3);

        // Warp past epoch-2 end but within epoch-2 grace period
        vm.warp(r.startTime + 2 * EPOCH + 1);

        // Settlement blocked — epoch-2 has unrevealed vote within grace period
        vm.expectRevert(RoundVotingEngine.UnrevealedPastEpochVotes.selector);
        engine.settleRound(contentId, roundId);
    }
}
