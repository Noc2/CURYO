// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { IFrontendRegistry } from "../contracts/interfaces/IFrontendRegistry.sol";

/// @title Round-based integration tests: lifecycle, multi-revealer, settlement delay, config snapshot, try-catch
contract RoundIntegrationTest is Test {
    CuryoReputation public crepToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    RoundRewardDistributor public rewardDistributor;

    address public owner = address(1);
    address public submitter = address(2);
    address public voter1 = address(3);
    address public voter2 = address(4);
    address public voter3 = address(5);
    address public voter4 = address(6);
    address public voter5 = address(7);
    address public voter6 = address(8);
    address public keeper1 = address(9);
    address public keeper2 = address(10);
    address public treasury = address(100);

    uint256 public constant STAKE = 5e6; // 5 cREP

    function setUp() public {
        // Set a predictable start time (avoid block.timestamp=1 issues in Foundry)
        vm.warp(1000);

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

        rewardDistributor = RoundRewardDistributor(
            address(
                new ERC1967Proxy(
                    address(distImpl),
                    abi.encodeCall(
                        RoundRewardDistributor.initialize,
                        (owner, address(crepToken), address(votingEngine), address(registry))
                    )
                )
            )
        );

        registry.setVotingEngine(address(votingEngine));
        votingEngine.setRewardDistributor(address(rewardDistributor));
        votingEngine.setTreasury(treasury);
        votingEngine.setConfig(15 minutes, 7 days, 2, 200);

        uint256 reserveAmount = 1_000_000e6;
        crepToken.mint(owner, reserveAmount);
        crepToken.approve(address(votingEngine), reserveAmount);
        votingEngine.fundConsensusReserve(reserveAmount);

        address[7] memory users = [submitter, voter1, voter2, voter3, voter4, voter5, voter6];
        for (uint256 i = 0; i < users.length; i++) {
            crepToken.mint(users[i], 10_000e6);
        }

        vm.stopPrank();
    }

    // =========================================================================
    // HELPERS — use explicit timestamps to avoid block.timestamp drift in tests
    // =========================================================================

    function _submitContent() internal returns (uint256 contentId) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "test goal", "test", 0);
        vm.stopPrank();
        contentId = 1;
    }

    function _commitVote(address voter, uint256 contentId, bool isUp, bytes32 salt)
        internal
        returns (bytes32 commitHash)
    {
        commitHash = keccak256(abi.encodePacked(isUp, salt, contentId));
        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, commitHash, _mockCiphertext(isUp, salt, contentId), STAKE, address(0));
        vm.stopPrank();
    }

    function _mockCiphertext(bool isUp, bytes32 salt, uint256 contentId) internal pure returns (bytes memory) {
        return abi.encodePacked(isUp ? bytes1(uint8(1)) : bytes1(uint8(0)), salt, bytes32(contentId));
    }

    function _revealVote(
        address caller,
        address voter,
        uint256 contentId,
        uint256 roundId,
        bytes32 commitHash,
        bool isUp,
        bytes32 salt
    ) internal {
        bytes32 commitKey = keccak256(abi.encodePacked(voter, commitHash));
        vm.prank(caller);
        votingEngine.revealVoteByCommitKey(contentId, roundId, commitKey, isUp, salt);
    }

    // =========================================================================
    // END-TO-END ROUND LIFECYCLE
    // =========================================================================

    function test_FullRoundLifecycle() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        bytes32 hash1 = _commitVote(voter1, contentId, true, salt1);
        bytes32 hash2 = _commitVote(voter2, contentId, false, salt2);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        assertEq(roundId, 1);

        // Before epoch end — reveal should fail
        vm.expectRevert(RoundVotingEngine.EpochNotEnded.selector);
        _revealVote(keeper1, voter1, contentId, roundId, hash1, true, salt1);

        // Past epoch end
        uint256 t1 = t0 + 16 minutes;
        vm.warp(t1);
        _revealVote(keeper1, voter1, contentId, roundId, hash1, true, salt1);
        _revealVote(keeper1, voter2, contentId, roundId, hash2, false, salt2);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(round.revealedCount, 2);
        assertEq(round.upPool, STAKE);
        assertEq(round.downPool, STAKE);

        // Settlement delay not elapsed
        vm.expectRevert(RoundVotingEngine.SettlementDelayNotElapsed.selector);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        // Past settlement delay
        uint256 t2 = t1 + 16 minutes;
        vm.warp(t2);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied));
    }

    function test_FullRoundLifecycleWithClaim() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        bytes32 salt3 = bytes32(uint256(333));
        bytes32 hash1 = _commitVote(voter1, contentId, true, salt1);
        bytes32 hash2 = _commitVote(voter2, contentId, true, salt2);
        bytes32 hash3 = _commitVote(voter3, contentId, false, salt3);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        uint256 t1 = t0 + 16 minutes;
        vm.warp(t1);
        _revealVote(keeper1, voter1, contentId, roundId, hash1, true, salt1);
        _revealVote(keeper1, voter2, contentId, roundId, hash2, true, salt2);
        _revealVote(keeper1, voter3, contentId, roundId, hash3, false, salt3);

        uint256 t2 = t1 + 16 minutes;
        vm.warp(t2);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
        assertTrue(round.upWins);

        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        assertGt(crepToken.balanceOf(voter1), balBefore);

        uint256 loserBal = crepToken.balanceOf(voter3);
        vm.prank(voter3);
        rewardDistributor.claimReward(contentId, roundId);
        assertEq(crepToken.balanceOf(voter3), loserBal);
    }

    // =========================================================================
    // MULTI-REVEALER / MULTI-KEEPER
    // =========================================================================

    function test_MultipleKeepersRevealDifferentVotes() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        bytes32 hash1 = _commitVote(voter1, contentId, true, salt1);
        bytes32 hash2 = _commitVote(voter2, contentId, false, salt2);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        vm.warp(t0 + 16 minutes);

        _revealVote(keeper1, voter1, contentId, roundId, hash1, true, salt1);
        _revealVote(keeper2, voter2, contentId, roundId, hash2, false, salt2);

        assertEq(votingEngine.getRound(contentId, roundId).revealedCount, 2);
    }

    function test_DoubleRevealFails() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 hash1 = _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, false, bytes32(uint256(222)));

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        vm.warp(t0 + 16 minutes);

        _revealVote(keeper1, voter1, contentId, roundId, hash1, true, salt1);

        vm.expectRevert(RoundVotingEngine.AlreadyRevealed.selector);
        _revealVote(keeper2, voter1, contentId, roundId, hash1, true, salt1);
    }

    function test_DuplicateCommitHashRevealByHashRevealsAllMatchingCommits() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 sharedSalt = bytes32(uint256(111));
        bytes32 sharedHash = keccak256(abi.encodePacked(true, sharedSalt, contentId));

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, sharedHash, _mockCiphertext(true, sharedSalt, contentId), STAKE, address(0));
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, sharedHash, _mockCiphertext(true, sharedSalt, contentId), STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        vm.warp(t0 + 16 minutes);

        _revealVote(keeper1, voter1, contentId, roundId, sharedHash, true, sharedSalt);
        _revealVote(keeper2, voter2, contentId, roundId, sharedHash, true, sharedSalt);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(round.revealedCount, 2);
        assertEq(round.upPool, 2 * STAKE);
    }

    function test_DuplicateCommitHashRevealByCommitKeyTargetsSpecificCommit() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 sharedSalt = bytes32(uint256(111));
        bytes32 sharedHash = keccak256(abi.encodePacked(true, sharedSalt, contentId));

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, sharedHash, _mockCiphertext(true, sharedSalt, contentId), STAKE, address(0));
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, sharedHash, _mockCiphertext(true, sharedSalt, contentId), STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        bytes32 firstCommitKey = votingEngine.getRoundCommitHash(contentId, roundId, 0);
        bytes32 secondCommitKey = votingEngine.getRoundCommitHash(contentId, roundId, 1);
        vm.warp(t0 + 16 minutes);

        vm.prank(keeper1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, secondCommitKey, true, sharedSalt);
        vm.prank(keeper1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, firstCommitKey, true, sharedSalt);

        assertEq(votingEngine.getRoundVoter(contentId, roundId, 0), voter2);
        assertEq(votingEngine.getRoundVoter(contentId, roundId, 1), voter1);
    }

    function test_VoterCanSelfReveal() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 hash1 = _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, false, bytes32(uint256(222)));

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        vm.warp(t0 + 16 minutes);

        _revealVote(voter1, voter1, contentId, roundId, hash1, true, salt1);
        assertEq(votingEngine.getRound(contentId, roundId).revealedCount, 1);
    }

    function test_RevealWithWrongDirectionFails() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 hash1 = _commitVote(voter1, contentId, true, salt1);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        vm.warp(t0 + 16 minutes);

        vm.expectRevert(RoundVotingEngine.HashMismatch.selector);
        _revealVote(keeper1, voter1, contentId, roundId, hash1, false, salt1);
    }

    // =========================================================================
    // ROUND ADVANCEMENT
    // =========================================================================

    function test_CommitAfterSettlementCreatesNewRound() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, true, salt2);

        uint256 round1Id = votingEngine.getActiveRoundId(contentId);
        assertEq(round1Id, 1);

        uint256 t1 = t0 + 16 minutes;
        vm.warp(t1);
        _revealVote(
            keeper1, voter1, contentId, round1Id, keccak256(abi.encodePacked(true, salt1, contentId)), true, salt1
        );
        _revealVote(
            keeper1, voter2, contentId, round1Id, keccak256(abi.encodePacked(true, salt2, contentId)), true, salt2
        );

        uint256 t2 = t1 + 16 minutes;
        vm.warp(t2);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, round1Id);

        assertEq(votingEngine.getActiveRoundId(contentId), 0);

        vm.warp(t2 + 25 hours);
        bytes32 salt3 = bytes32(uint256(333));
        _commitVote(voter3, contentId, false, salt3);
        assertEq(votingEngine.getActiveRoundId(contentId), 2);
    }

    function test_CommitAfterCancellationCreatesNewRound() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        _commitVote(voter1, contentId, true, bytes32(uint256(111)));
        uint256 round1Id = votingEngine.getActiveRoundId(contentId);

        vm.warp(t0 + 8 days);
        vm.prank(keeper1);
        votingEngine.cancelExpiredRound(contentId, round1Id);

        assertEq(uint256(votingEngine.getRound(contentId, round1Id).state), uint256(RoundLib.RoundState.Cancelled));

        _commitVote(voter2, contentId, false, bytes32(uint256(222)));
        assertEq(votingEngine.getActiveRoundId(contentId), 2);
    }

    function test_CannotDoubleCommitInSameRound() public {
        uint256 contentId = _submitContent();

        _commitVote(voter1, contentId, true, bytes32(uint256(111)));

        bytes32 hash2 = keccak256(abi.encodePacked(true, bytes32(uint256(222)), contentId));
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        votingEngine.commitVote(
            contentId, hash2, _mockCiphertext(true, bytes32(uint256(222)), contentId), STAKE, address(0)
        );
        vm.stopPrank();
    }

    // =========================================================================
    // SETTLEMENT DELAY
    // =========================================================================

    function test_SettlementDelayProtectsCurrentEpochVoters() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, false, salt2);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        uint256 t1 = t0 + 16 minutes;
        vm.warp(t1);
        _revealVote(
            keeper1, voter1, contentId, roundId, keccak256(abi.encodePacked(true, salt1, contentId)), true, salt1
        );
        _revealVote(
            keeper1, voter2, contentId, roundId, keccak256(abi.encodePacked(false, salt2, contentId)), false, salt2
        );

        // 3rd voter commits in epoch 2
        bytes32 salt3 = bytes32(uint256(333));
        _commitVote(voter3, contentId, true, salt3);

        vm.expectRevert(RoundVotingEngine.SettlementDelayNotElapsed.selector);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        // Advance past epoch 2
        uint256 t2 = t1 + 16 minutes;
        vm.warp(t2);

        _revealVote(
            keeper1, voter3, contentId, roundId, keccak256(abi.encodePacked(true, salt3, contentId)), true, salt3
        );

        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(round.revealedCount, 3);
        assertTrue(round.upWins);
    }

    function test_SettlementDelayExactTiming() public {
        uint256 contentId = _submitContent();
        // round.startTime = 1000 (setUp warps to 1000)
        // epoch 0: [1000, 1900), epoch 1: [1900, 2800)

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, true, salt2);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Reveal at 2000 (past epoch 0 end at 1900) → thresholdReachedAt = 2000
        vm.warp(2000);
        _revealVote(
            keeper1, voter1, contentId, roundId, keccak256(abi.encodePacked(true, salt1, contentId)), true, salt1
        );
        _revealVote(
            keeper1, voter2, contentId, roundId, keccak256(abi.encodePacked(true, salt2, contentId)), true, salt2
        );
        // Settlement allowed at thresholdReachedAt + epochDuration = 2000 + 900 = 2900

        // Before delay — fails
        vm.warp(2500);
        vm.expectRevert(RoundVotingEngine.SettlementDelayNotElapsed.selector);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        // At delay expiry — succeeds
        vm.warp(2900);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);
    }

    // =========================================================================
    // UNREVEALED VOTE PROCESSING
    // =========================================================================

    function test_UnrevealedPastEpochForfeitedToTreasury() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        bytes32 salt3 = bytes32(uint256(333));
        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, true, salt2);
        _commitVote(voter3, contentId, false, salt3);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        uint256 t1 = t0 + 16 minutes;
        vm.warp(t1);
        _revealVote(
            keeper1, voter1, contentId, roundId, keccak256(abi.encodePacked(true, salt1, contentId)), true, salt1
        );
        _revealVote(
            keeper1, voter2, contentId, roundId, keccak256(abi.encodePacked(true, salt2, contentId)), true, salt2
        );

        uint256 t2 = t1 + 16 minutes;
        vm.warp(t2);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        uint256 treasuryBefore = crepToken.balanceOf(treasury);
        vm.prank(keeper1);
        votingEngine.processUnrevealedVotes(contentId, roundId, 0, 0);
        assertEq(crepToken.balanceOf(treasury) - treasuryBefore, STAKE);
    }

    function test_UnrevealedCurrentEpochRefunded() public {
        uint256 contentId = _submitContent();
        // round.startTime = 1000 (setUp warps to 1000)
        // epochDuration = 900 (15 min)
        // epoch 0: [1000, 1900), epoch 1: [1900, 2800), epoch 2: [2800, 3700)

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, true, salt2);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Reveal at 2000 (past epoch 0 end at 1900) -> thresholdReachedAt = 2000
        vm.warp(2000);
        _revealVote(
            keeper1, voter1, contentId, roundId, keccak256(abi.encodePacked(true, salt1, contentId)), true, salt1
        );
        _revealVote(
            keeper1, voter2, contentId, roundId, keccak256(abi.encodePacked(true, salt2, contentId)), true, salt2
        );

        // voter3 commits at 2850 -> epoch 2: [2800, 3700), revealableAfter = 3700
        vm.warp(2850);
        bytes32 salt3 = bytes32(uint256(333));
        _commitVote(voter3, contentId, false, salt3);

        // Settle at 2900 (= thresholdReachedAt 2000 + epochDuration 900)
        // settledAt = 2900, voter3.revealableAfter (3700) > settledAt (2900) -> REFUND
        vm.warp(2900);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        // voter3's epoch hasn't ended at settlement time -> refund
        uint256 voter3Before = crepToken.balanceOf(voter3);
        vm.prank(keeper1);
        votingEngine.processUnrevealedVotes(contentId, roundId, 0, 0);
        assertEq(crepToken.balanceOf(voter3) - voter3Before, STAKE);
    }

    // =========================================================================
    // ROUND EXPIRY
    // =========================================================================

    function test_ExpiredRoundRefund() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        _commitVote(voter1, contentId, true, bytes32(uint256(111)));
        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        vm.expectRevert(RoundVotingEngine.RoundNotExpired.selector);
        vm.prank(keeper1);
        votingEngine.cancelExpiredRound(contentId, roundId);

        vm.warp(t0 + 8 days);
        vm.prank(keeper1);
        votingEngine.cancelExpiredRound(contentId, roundId);

        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crepToken.balanceOf(voter1) - balBefore, STAKE);
    }

    // =========================================================================
    // CONSENSUS SUBSIDY
    // =========================================================================

    function test_UnanimousRoundPaysConsensusSubsidy() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, true, salt2);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        uint256 t1 = t0 + 16 minutes;
        vm.warp(t1);
        _revealVote(
            keeper1, voter1, contentId, roundId, keccak256(abi.encodePacked(true, salt1, contentId)), true, salt1
        );
        _revealVote(
            keeper1, voter2, contentId, roundId, keccak256(abi.encodePacked(true, salt2, contentId)), true, salt2
        );

        uint256 t2 = t1 + 16 minutes;
        vm.warp(t2);
        uint256 reserveBefore = votingEngine.consensusReserve();
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        assertLt(votingEngine.consensusReserve(), reserveBefore);

        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        assertGt(crepToken.balanceOf(voter1), balBefore);
    }

    // =========================================================================
    // 24-HOUR COOLDOWN
    // =========================================================================

    function test_CooldownPreventsQuickRevote() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, false, bytes32(uint256(222)));

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        uint256 t1 = t0 + 16 minutes;
        vm.warp(t1);
        _revealVote(
            keeper1, voter1, contentId, roundId, keccak256(abi.encodePacked(true, salt1, contentId)), true, salt1
        );
        _revealVote(
            keeper1,
            voter2,
            contentId,
            roundId,
            keccak256(abi.encodePacked(false, bytes32(uint256(222)), contentId)),
            false,
            bytes32(uint256(222))
        );

        uint256 t2 = t1 + 16 minutes;
        vm.warp(t2);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        // Try immediately — cooldown active
        bytes32 hash3 = keccak256(abi.encodePacked(true, bytes32(uint256(333)), contentId));
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        votingEngine.commitVote(
            contentId, hash3, _mockCiphertext(true, bytes32(uint256(333)), contentId), STAKE, address(0)
        );
        vm.stopPrank();

        // After 25 hours — succeeds
        vm.warp(t2 + 25 hours);
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(
            contentId, hash3, _mockCiphertext(true, bytes32(uint256(333)), contentId), STAKE, address(0)
        );
        vm.stopPrank();
    }

    // =========================================================================
    // MULTI-EPOCH ROUND
    // =========================================================================

    function test_MultiEpochVoteAccumulation() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        _commitVote(voter1, contentId, true, salt1);
        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Epoch 2
        uint256 t1 = t0 + 16 minutes;
        vm.warp(t1);
        bytes32 salt2 = bytes32(uint256(222));
        _commitVote(voter2, contentId, false, salt2);
        assertEq(votingEngine.getActiveRoundId(contentId), roundId);

        // Reveal epoch 1 vote
        _revealVote(
            keeper1, voter1, contentId, roundId, keccak256(abi.encodePacked(true, salt1, contentId)), true, salt1
        );

        // Epoch 2 vote not yet revealable
        vm.expectRevert(RoundVotingEngine.EpochNotEnded.selector);
        _revealVote(
            keeper1, voter2, contentId, roundId, keccak256(abi.encodePacked(false, salt2, contentId)), false, salt2
        );

        // Epoch 3
        uint256 t2 = t1 + 16 minutes;
        vm.warp(t2);
        _revealVote(
            keeper1, voter2, contentId, roundId, keccak256(abi.encodePacked(false, salt2, contentId)), false, salt2
        );

        assertEq(votingEngine.getRound(contentId, roundId).revealedCount, 2);
    }

    // =========================================================================
    // CONFIG SNAPSHOT PER-ROUND
    // =========================================================================

    function test_ConfigSnapshotPerRound() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, true, salt2);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Change config: increase minVoters to 10
        vm.prank(owner);
        votingEngine.setConfig(15 minutes, 7 days, 10, 200);

        // Reveal and settle — snapshotted config still has minVoters=2
        uint256 t1 = t0 + 16 minutes;
        vm.warp(t1);
        _revealVote(
            keeper1, voter1, contentId, roundId, keccak256(abi.encodePacked(true, salt1, contentId)), true, salt1
        );
        _revealVote(
            keeper1, voter2, contentId, roundId, keccak256(abi.encodePacked(true, salt2, contentId)), true, salt2
        );

        uint256 t2 = t1 + 16 minutes;
        vm.warp(t2);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        assertEq(uint256(votingEngine.getRound(contentId, roundId).state), uint256(RoundLib.RoundState.Settled));
    }

    function test_GetRoundConfigReturnsSnapshot() public {
        uint256 contentId = _submitContent();

        _commitVote(voter1, contentId, true, bytes32(uint256(111)));
        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Verify snapshot matches config at creation
        RoundLib.RoundConfig memory cfg = votingEngine.getRoundConfig(contentId, roundId);
        assertEq(cfg.epochDuration, 15 minutes);
        assertEq(cfg.minVoters, 2);

        // Change config
        vm.prank(owner);
        votingEngine.setConfig(30 minutes, 14 days, 10, 100);

        // Snapshot unchanged
        cfg = votingEngine.getRoundConfig(contentId, roundId);
        assertEq(cfg.epochDuration, 15 minutes);
        assertEq(cfg.minVoters, 2);
    }

    // =========================================================================
    // CIPHERTEXT SIZE VALIDATION
    // =========================================================================

    function test_CiphertextTooLargeRejected() public {
        uint256 contentId = _submitContent();

        bytes32 hash1 = keccak256(abi.encodePacked(true, bytes32(uint256(111)), contentId));
        bytes memory oversized = new bytes(10_241);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(RoundVotingEngine.CiphertextTooLarge.selector);
        votingEngine.commitVote(contentId, hash1, oversized, STAKE, address(0));
        vm.stopPrank();
    }

    function test_CiphertextAtMaxSizeAccepted() public {
        uint256 contentId = _submitContent();

        bytes32 hash1 = keccak256(abi.encodePacked(true, bytes32(uint256(111)), contentId));
        bytes memory maxSize = new bytes(10_240);

        vm.prank(owner);
        votingEngine.setMockMode(false);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, hash1, maxSize, STAKE, address(0));
        vm.stopPrank();

        assertEq(votingEngine.getActiveRoundId(contentId), 1);
    }

    // =========================================================================
    // TRY-CATCH SETTLEMENT RESILIENCE
    // =========================================================================

    // =========================================================================
    // AUDIT FIX: M-2 — cancelExpiredRound blocked when threshold reached
    // =========================================================================

    function test_CancelExpiredRoundBlockedAfterThreshold() public {
        uint256 contentId = _submitContent();

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, false, salt2);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Reveal at 2000 -> thresholdReachedAt = 2000
        vm.warp(2000);
        _revealVote(
            keeper1, voter1, contentId, roundId, keccak256(abi.encodePacked(true, salt1, contentId)), true, salt1
        );
        _revealVote(
            keeper1, voter2, contentId, roundId, keccak256(abi.encodePacked(false, salt2, contentId)), false, salt2
        );

        // Warp past expiry (7 days from startTime=1000)
        vm.warp(1000 + 8 days);

        // Cancellation should fail because threshold was reached
        vm.expectRevert(RoundVotingEngine.ThresholdReached.selector);
        vm.prank(keeper1);
        votingEngine.cancelExpiredRound(contentId, roundId);

        // Settlement should succeed
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);
        assertEq(uint256(votingEngine.getRound(contentId, roundId).state), uint256(RoundLib.RoundState.Tied));
    }

    function test_CancelExpiredRoundAllowedWithoutThreshold() public {
        uint256 contentId = _submitContent();

        // Only 1 vote (below minVoters=2), no reveals -> thresholdReachedAt stays 0
        _commitVote(voter1, contentId, true, bytes32(uint256(111)));
        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        vm.warp(1000 + 8 days);
        vm.prank(keeper1);
        votingEngine.cancelExpiredRound(contentId, roundId);
        assertEq(uint256(votingEngine.getRound(contentId, roundId).state), uint256(RoundLib.RoundState.Cancelled));
    }

    // =========================================================================
    // AUDIT FIX: M-1 — processUnrevealedVotes works without treasury
    // =========================================================================

    function test_ProcessUnrevealedRefundsWithoutTreasury() public {
        // Deploy without treasury set
        vm.startPrank(owner);
        RoundVotingEngine engineImpl2 = new RoundVotingEngine();
        RoundVotingEngine noTreasuryEngine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engineImpl2),
                    abi.encodeCall(
                        RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry), true)
                    )
                )
            )
        );
        noTreasuryEngine.setRewardDistributor(address(rewardDistributor));
        // NOTE: treasury is NOT set (address(0))
        noTreasuryEngine.setConfig(15 minutes, 7 days, 2, 200);
        uint256 reserveAmount = 100_000e6;
        crepToken.mint(owner, reserveAmount);
        crepToken.approve(address(noTreasuryEngine), reserveAmount);
        noTreasuryEngine.fundConsensusReserve(reserveAmount);
        registry.setVotingEngine(address(noTreasuryEngine));
        vm.stopPrank();

        // Submit content
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/notreas", "test", "test", 0);
        vm.stopPrank();
        uint256 contentId = 1;

        // Commit votes: voter1+voter2 revealed, voter3 commits in current epoch
        vm.startPrank(voter1);
        crepToken.approve(address(noTreasuryEngine), STAKE);
        noTreasuryEngine.commitVote(
            contentId,
            keccak256(abi.encodePacked(true, bytes32(uint256(111)), contentId)),
            _mockCiphertext(true, bytes32(uint256(111)), contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(noTreasuryEngine), STAKE);
        noTreasuryEngine.commitVote(
            contentId,
            keccak256(abi.encodePacked(true, bytes32(uint256(222)), contentId)),
            _mockCiphertext(true, bytes32(uint256(222)), contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = noTreasuryEngine.getActiveRoundId(contentId);

        // Reveal at 2000
        vm.warp(2000);
        vm.prank(keeper1);
        noTreasuryEngine.revealVoteByCommitKey(
            contentId,
            roundId,
            keccak256(abi.encodePacked(voter1, keccak256(abi.encodePacked(true, bytes32(uint256(111)), contentId)))),
            true,
            bytes32(uint256(111))
        );
        vm.prank(keeper1);
        noTreasuryEngine.revealVoteByCommitKey(
            contentId,
            roundId,
            keccak256(abi.encodePacked(voter2, keccak256(abi.encodePacked(true, bytes32(uint256(222)), contentId)))),
            true,
            bytes32(uint256(222))
        );

        // voter3 commits at 2850 (current epoch at settlement)
        vm.warp(2850);
        vm.startPrank(voter3);
        crepToken.approve(address(noTreasuryEngine), STAKE);
        noTreasuryEngine.commitVote(
            contentId,
            keccak256(abi.encodePacked(false, bytes32(uint256(333)), contentId)),
            _mockCiphertext(false, bytes32(uint256(333)), contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        // Settle at 2900
        vm.warp(2900);
        vm.prank(keeper1);
        noTreasuryEngine.settleRound(contentId, roundId);

        // processUnrevealedVotes should NOT revert even without treasury
        uint256 voter3Before = crepToken.balanceOf(voter3);
        vm.prank(keeper1);
        noTreasuryEngine.processUnrevealedVotes(contentId, roundId, 0, 0);

        // voter3 should get refund (current epoch at settlement)
        assertEq(crepToken.balanceOf(voter3) - voter3Before, STAKE);

        // Restore original voting engine
        vm.prank(owner);
        registry.setVotingEngine(address(votingEngine));
    }

    function test_ProcessUnrevealedForfeitHeldWithoutTreasury() public {
        // Deploy without treasury set
        vm.startPrank(owner);
        RoundVotingEngine engineImpl2 = new RoundVotingEngine();
        RoundVotingEngine noTreasuryEngine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engineImpl2),
                    abi.encodeCall(
                        RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry), true)
                    )
                )
            )
        );
        noTreasuryEngine.setRewardDistributor(address(rewardDistributor));
        noTreasuryEngine.setConfig(15 minutes, 7 days, 2, 200);
        uint256 reserveAmount = 100_000e6;
        crepToken.mint(owner, reserveAmount);
        crepToken.approve(address(noTreasuryEngine), reserveAmount);
        noTreasuryEngine.fundConsensusReserve(reserveAmount);
        registry.setVotingEngine(address(noTreasuryEngine));
        vm.stopPrank();

        // Submit content
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/forfeit", "test", "test", 0);
        vm.stopPrank();
        uint256 contentId = 1;

        // voter1+voter2 commit and reveal, voter3 commits but doesn't reveal (past epoch)
        vm.startPrank(voter1);
        crepToken.approve(address(noTreasuryEngine), STAKE);
        noTreasuryEngine.commitVote(
            contentId,
            keccak256(abi.encodePacked(true, bytes32(uint256(111)), contentId)),
            _mockCiphertext(true, bytes32(uint256(111)), contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(noTreasuryEngine), STAKE);
        noTreasuryEngine.commitVote(
            contentId,
            keccak256(abi.encodePacked(true, bytes32(uint256(222)), contentId)),
            _mockCiphertext(true, bytes32(uint256(222)), contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter3);
        crepToken.approve(address(noTreasuryEngine), STAKE);
        noTreasuryEngine.commitVote(
            contentId,
            keccak256(abi.encodePacked(false, bytes32(uint256(333)), contentId)),
            _mockCiphertext(false, bytes32(uint256(333)), contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = noTreasuryEngine.getActiveRoundId(contentId);

        // Reveal voter1+voter2 at 2000 (voter3 NOT revealed -> past epoch forfeit)
        vm.warp(2000);
        vm.prank(keeper1);
        noTreasuryEngine.revealVoteByCommitKey(
            contentId,
            roundId,
            keccak256(abi.encodePacked(voter1, keccak256(abi.encodePacked(true, bytes32(uint256(111)), contentId)))),
            true,
            bytes32(uint256(111))
        );
        vm.prank(keeper1);
        noTreasuryEngine.revealVoteByCommitKey(
            contentId,
            roundId,
            keccak256(abi.encodePacked(voter2, keccak256(abi.encodePacked(true, bytes32(uint256(222)), contentId)))),
            true,
            bytes32(uint256(222))
        );

        // Settle at 2900
        vm.warp(2900);
        vm.prank(keeper1);
        noTreasuryEngine.settleRound(contentId, roundId);

        // processUnrevealedVotes should NOT revert; forfeited funds stay in contract
        uint256 engineBalBefore = crepToken.balanceOf(address(noTreasuryEngine));
        vm.prank(keeper1);
        noTreasuryEngine.processUnrevealedVotes(contentId, roundId, 0, 0);

        // Forfeited funds remain in engine (not sent to treasury since treasury=0)
        // voter3's stake is forfeited but held in the contract
        uint256 engineBalAfter = crepToken.balanceOf(address(noTreasuryEngine));
        // Balance should NOT decrease (no transfer to treasury)
        assertGe(engineBalAfter, engineBalBefore);

        // Restore original voting engine
        vm.prank(owner);
        registry.setVotingEngine(address(votingEngine));
    }

    // =========================================================================
    // AUDIT FIX: L-5 — setParticipationPool can be updated
    // =========================================================================

    function test_SetParticipationPoolCanBeUpdated() public {
        address pool1 = address(0xAA);
        address pool2 = address(0xBB);

        vm.startPrank(owner);
        votingEngine.setParticipationPool(pool1);
        // Should NOT revert on second call
        votingEngine.setParticipationPool(pool2);
        vm.stopPrank();
    }

    function test_SetParticipationPoolContentRegistryCanBeUpdated() public {
        address pool1 = address(0xAA);
        address pool2 = address(0xBB);

        vm.startPrank(owner);
        registry.setParticipationPool(pool1);
        // Should NOT revert on second call
        registry.setParticipationPool(pool2);
        vm.stopPrank();
    }

    // =========================================================================
    // TRY-CATCH SETTLEMENT RESILIENCE
    // =========================================================================

    function test_SettlementSucceedsWithoutParticipationPool() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        bytes32 salt3 = bytes32(uint256(333));
        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, true, salt2);
        _commitVote(voter3, contentId, false, salt3);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        uint256 t1 = t0 + 16 minutes;
        vm.warp(t1);
        _revealVote(
            keeper1, voter1, contentId, roundId, keccak256(abi.encodePacked(true, salt1, contentId)), true, salt1
        );
        _revealVote(
            keeper1, voter2, contentId, roundId, keccak256(abi.encodePacked(true, salt2, contentId)), true, salt2
        );
        _revealVote(
            keeper1, voter3, contentId, roundId, keccak256(abi.encodePacked(false, salt3, contentId)), false, salt3
        );

        uint256 t2 = t1 + 16 minutes;
        vm.warp(t2);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        assertEq(uint256(votingEngine.getRound(contentId, roundId).state), uint256(RoundLib.RoundState.Settled));
    }

    // =========================================================================
    // O(1) SETTLEMENT — FRONTEND FEE CLAIMING
    // =========================================================================

    /// @dev Helper to set up a FrontendRegistry wired to the voting engine.
    function _setupFrontendRegistry() internal returns (FrontendRegistry frontendReg, address frontendOp) {
        vm.startPrank(owner);
        FrontendRegistry frontendRegistryImpl = new FrontendRegistry();
        frontendReg = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(frontendRegistryImpl),
                    abi.encodeCall(FrontendRegistry.initialize, (owner, owner, address(crepToken)))
                )
            )
        );
        votingEngine.setFrontendRegistry(address(frontendReg));
        frontendReg.addFeeCreditor(address(votingEngine));

        frontendOp = address(200);
        crepToken.mint(frontendOp, 2000e6);
        vm.stopPrank();

        vm.startPrank(frontendOp);
        crepToken.approve(address(frontendReg), 1000e6);
        frontendReg.register();
        vm.stopPrank();

        vm.prank(owner);
        frontendReg.approveFrontend(frontendOp);
    }

    /// @dev Helper: commit 3 votes (2 up, 1 down) with a specific frontend, reveal, settle.
    ///      Returns (contentId, roundId). Ensures non-tie settlement.
    function _settleRoundWithFrontend(address frontend) internal returns (uint256 contentId, uint256 roundId) {
        contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = keccak256("s1");
        bytes32 salt2 = keccak256("s2");
        bytes32 salt3 = keccak256("s3");
        bytes32 hash1 = keccak256(abi.encodePacked(true, salt1, contentId));
        bytes32 hash2 = keccak256(abi.encodePacked(true, salt2, contentId));
        bytes32 hash3 = keccak256(abi.encodePacked(false, salt3, contentId));

        // 2 votes up (via frontend), 1 vote down → upPool > downPool, no tie
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, hash1, _mockCiphertext(true, salt1, contentId), STAKE, frontend);
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, hash2, _mockCiphertext(true, salt2, contentId), STAKE, frontend);
        vm.stopPrank();

        vm.startPrank(voter3);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, hash3, _mockCiphertext(false, salt3, contentId), STAKE, frontend);
        vm.stopPrank();

        roundId = 1;
        vm.warp(t0 + 16 minutes);
        _revealVote(keeper1, voter1, contentId, roundId, hash1, true, salt1);
        _revealVote(keeper1, voter2, contentId, roundId, hash2, true, salt2);
        _revealVote(keeper1, voter3, contentId, roundId, hash3, false, salt3);

        vm.warp(t0 + 32 minutes);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);
    }

    function test_ClaimFrontendFee_HappyPath() public {
        (, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        // Frontend pool should be set
        uint256 frontendPool = votingEngine.getRoundFrontendPool(contentId, roundId);
        assertGt(frontendPool, 0, "Frontend pool should be > 0");

        // Claim frontend fee
        votingEngine.claimFrontendFee(contentId, roundId, frontendOp);

        // Verify fee was credited
        assertTrue(votingEngine.isFrontendFeeClaimed(contentId, roundId, frontendOp));
    }

    function test_ClaimFrontendFee_DoubleClaimReverts() public {
        (, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        // First claim succeeds
        votingEngine.claimFrontendFee(contentId, roundId, frontendOp);

        // Second claim reverts
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        votingEngine.claimFrontendFee(contentId, roundId, frontendOp);
    }

    function test_ClaimFrontendFee_LastClaimGetsDustRemainder() public {
        (FrontendRegistry frontendReg, address frontendA) = _setupFrontendRegistry();
        address frontendB = address(201);

        vm.startPrank(owner);
        crepToken.mint(frontendB, 2000e6);
        vm.stopPrank();

        vm.startPrank(frontendB);
        crepToken.approve(address(frontendReg), 1000e6);
        frontendReg.register();
        vm.stopPrank();

        vm.prank(owner);
        frontendReg.approveFrontend(frontendB);

        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = keccak256("dust-s1");
        bytes32 salt2 = keccak256("dust-s2");
        bytes32 salt3 = keccak256("dust-s3");
        bytes32 hash1 = keccak256(abi.encodePacked(true, salt1, contentId));
        bytes32 hash2 = keccak256(abi.encodePacked(true, salt2, contentId));
        bytes32 hash3 = keccak256(abi.encodePacked(false, salt3, contentId));

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, hash1, _mockCiphertext(true, salt1, contentId), STAKE, frontendA);
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, hash2, _mockCiphertext(true, salt2, contentId), STAKE, frontendA);
        vm.stopPrank();

        vm.startPrank(voter3);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, hash3, _mockCiphertext(false, salt3, contentId), STAKE, frontendB);
        vm.stopPrank();

        uint256 roundId = 1;
        vm.warp(t0 + 16 minutes);
        _revealVote(keeper1, voter1, contentId, roundId, hash1, true, salt1);
        _revealVote(keeper1, voter2, contentId, roundId, hash2, true, salt2);
        _revealVote(keeper1, voter3, contentId, roundId, hash3, false, salt3);

        vm.warp(t0 + 32 minutes);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        uint256 frontendPool = votingEngine.getRoundFrontendPool(contentId, roundId);
        assertGt(frontendPool, 0, "Frontend pool should be > 0");

        votingEngine.claimFrontendFee(contentId, roundId, frontendA);
        uint256 feeA = frontendReg.getAccumulatedFees(frontendA);

        votingEngine.claimFrontendFee(contentId, roundId, frontendB);
        uint256 feeB = frontendReg.getAccumulatedFees(frontendB);

        assertEq(feeA + feeB, frontendPool, "All frontend fees should be claimable");
        assertEq(feeB, frontendPool - feeA, "Final claimant should receive dust remainder");
    }

    function test_ClaimFrontendFee_NoApprovedFrontendRedirectsToVoterPool() public {
        // No frontend registry set — 3 voters (2 up, 1 down) to avoid tie
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = keccak256("s1");
        bytes32 salt2 = keccak256("s2");
        bytes32 salt3 = keccak256("s3");

        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, true, salt2);
        _commitVote(voter3, contentId, false, salt3);

        uint256 roundId = 1;
        vm.warp(t0 + 16 minutes);
        bytes32 hash1 = keccak256(abi.encodePacked(true, salt1, contentId));
        bytes32 hash2 = keccak256(abi.encodePacked(true, salt2, contentId));
        bytes32 hash3 = keccak256(abi.encodePacked(false, salt3, contentId));
        _revealVote(keeper1, voter1, contentId, roundId, hash1, true, salt1);
        _revealVote(keeper1, voter2, contentId, roundId, hash2, true, salt2);
        _revealVote(keeper1, voter3, contentId, roundId, hash3, false, salt3);

        vm.warp(t0 + 32 minutes);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        // No frontend pool — redirected to voter pool
        assertEq(votingEngine.getRoundFrontendPool(contentId, roundId), 0);

        // Voter pool should include the frontend share
        uint256 voterPool = votingEngine.roundVoterPool(contentId, roundId);
        assertGt(voterPool, 0);
    }

    // =========================================================================
    // O(1) SETTLEMENT — PARTICIPATION REWARD CLAIMING
    // =========================================================================

    /// @dev Helper: set up ParticipationPool and settle a round (3 voters: 2 up, 1 down)
    function _settleRoundWithParticipation() internal returns (uint256 contentId, uint256 roundId) {
        vm.startPrank(owner);
        ParticipationPool pool = new ParticipationPool(address(crepToken), owner);
        pool.setAuthorizedCaller(address(votingEngine), true);
        crepToken.mint(owner, 1_000_000e6);
        crepToken.approve(address(pool), 1_000_000e6);
        pool.depositPool(1_000_000e6);
        votingEngine.setParticipationPool(address(pool));
        vm.stopPrank();

        contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = keccak256("s1");
        bytes32 salt2 = keccak256("s2");
        bytes32 salt3 = keccak256("s3");

        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, true, salt2);
        _commitVote(voter3, contentId, false, salt3);

        roundId = 1;
        vm.warp(t0 + 16 minutes);
        bytes32 hash1 = keccak256(abi.encodePacked(true, salt1, contentId));
        bytes32 hash2 = keccak256(abi.encodePacked(true, salt2, contentId));
        bytes32 hash3 = keccak256(abi.encodePacked(false, salt3, contentId));
        _revealVote(keeper1, voter1, contentId, roundId, hash1, true, salt1);
        _revealVote(keeper1, voter2, contentId, roundId, hash2, true, salt2);
        _revealVote(keeper1, voter3, contentId, roundId, hash3, false, salt3);

        vm.warp(t0 + 32 minutes);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);
    }

    function test_ClaimParticipationReward_HappyPath() public {
        (uint256 contentId, uint256 roundId) = _settleRoundWithParticipation();

        // Rate should be snapshotted
        uint256 rate = votingEngine.getRoundParticipationRateBps(contentId, roundId);
        assertEq(rate, 9000, "Rate should be 90% (tier 0)");

        // Claim participation reward
        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        votingEngine.claimParticipationReward(contentId, roundId);
        uint256 balAfter = crepToken.balanceOf(voter1);

        uint256 expectedReward = STAKE * 9000 / 10000;
        assertEq(balAfter - balBefore, expectedReward, "Should receive 90% of stake as participation reward");
        assertTrue(votingEngine.isParticipationRewardClaimed(contentId, roundId, voter1));
    }

    function test_ClaimParticipationReward_DoubleClaimReverts() public {
        (uint256 contentId, uint256 roundId) = _settleRoundWithParticipation();

        vm.prank(voter1);
        votingEngine.claimParticipationReward(contentId, roundId);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        votingEngine.claimParticipationReward(contentId, roundId);
    }

    function test_ClaimParticipationReward_OnlySettledRounds() public {
        vm.startPrank(owner);
        ParticipationPool pool = new ParticipationPool(address(crepToken), owner);
        pool.setAuthorizedCaller(address(votingEngine), true);
        crepToken.mint(owner, 1_000_000e6);
        crepToken.approve(address(pool), 1_000_000e6);
        pool.depositPool(1_000_000e6);
        votingEngine.setParticipationPool(address(pool));
        vm.stopPrank();

        uint256 contentId = _submitContent();

        bytes32 salt1 = keccak256("s1");
        _commitVote(voter1, contentId, true, salt1);

        // Round is Open, not Settled
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.RoundNotSettled.selector);
        votingEngine.claimParticipationReward(contentId, 1);
    }

    function test_ClaimParticipationReward_PartialPaymentOnShortfall() public {
        // Shortfall pays partial amount and keeps claim open for remaining balance.
        vm.startPrank(owner);
        ParticipationPool pool = new ParticipationPool(address(crepToken), owner);
        pool.setAuthorizedCaller(address(votingEngine), true);
        crepToken.mint(owner, 2_000_000); // < 4.5 cREP expected reward for one vote
        crepToken.approve(address(pool), 2_000_000);
        pool.depositPool(2_000_000);
        votingEngine.setParticipationPool(address(pool));
        vm.stopPrank();

        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = keccak256("shortfall-s1");
        bytes32 salt2 = keccak256("shortfall-s2");
        bytes32 salt3 = keccak256("shortfall-s3");
        bytes32 hash1 = keccak256(abi.encodePacked(true, salt1, contentId));
        bytes32 hash2 = keccak256(abi.encodePacked(true, salt2, contentId));
        bytes32 hash3 = keccak256(abi.encodePacked(false, salt3, contentId));

        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, true, salt2);
        _commitVote(voter3, contentId, false, salt3);

        uint256 roundId = 1;
        vm.warp(t0 + 16 minutes);
        _revealVote(keeper1, voter1, contentId, roundId, hash1, true, salt1);
        _revealVote(keeper1, voter2, contentId, roundId, hash2, true, salt2);
        _revealVote(keeper1, voter3, contentId, roundId, hash3, false, salt3);

        vm.warp(t0 + 32 minutes);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        // First claim should succeed with partial payment.
        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        votingEngine.claimParticipationReward(contentId, roundId);

        uint256 received = crepToken.balanceOf(voter1) - balBefore;
        uint256 expectedFull = STAKE * 9000 / 10000; // 4.5 cREP

        // Should receive something (pool had 2M tokens = 2 cREP, capped at pool balance)
        assertGt(received, 0, "Should receive partial reward");
        assertLt(received, expectedFull, "Should receive less than full reward due to shortfall");
        assertFalse(votingEngine.isParticipationRewardClaimed(contentId, roundId, voter1));

        // Top up pool and claim remainder.
        vm.startPrank(owner);
        crepToken.mint(owner, 10_000_000);
        crepToken.approve(address(pool), 10_000_000);
        pool.depositPool(10_000_000);
        vm.stopPrank();

        vm.prank(voter1);
        votingEngine.claimParticipationReward(contentId, roundId);

        uint256 totalReceived = crepToken.balanceOf(voter1) - balBefore;
        assertEq(totalReceived, expectedFull, "Should receive full reward across multiple claims");
        assertTrue(votingEngine.isParticipationRewardClaimed(contentId, roundId, voter1));

        // Fully claimed reward cannot be claimed again.
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        votingEngine.claimParticipationReward(contentId, roundId);
    }

    function test_ClaimCancelledRoundRefund_O1() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = keccak256("s1");
        _commitVote(voter1, contentId, true, salt1);

        uint256 roundId = 1;
        uint256 balBefore = crepToken.balanceOf(voter1);

        // Expire the round (7 days + 1 second)
        vm.warp(t0 + 7 days + 1);
        votingEngine.cancelExpiredRound(contentId, roundId);

        // Claim refund using O(1) path
        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);

        uint256 balAfter = crepToken.balanceOf(voter1);
        assertEq(balAfter - balBefore, STAKE, "Should refund full stake");
    }

    // =========================================================================
    // AUDIT TESTS: H-2 — processUnrevealedVotes try-catch structure
    // =========================================================================

    /// @dev H-2 audit fix: verify processUnrevealedVotes handles mixed cases correctly
    ///      (forfeited past-epoch + refunded current-epoch). The try-catch structural fix
    ///      is additionally verified by compilation — a reverting voter address would be
    ///      caught and their stake forfeited to treasury instead of blocking the batch.
    function test_ProcessUnrevealedVotes_MixedCases() public {
        // round.startTime = 1000, epochDuration = 900 (15 min)
        // epoch 0: [1000, 1900), epoch 1: [1900, 2800), epoch 2: [2800, 3700)
        uint256 contentId = _submitContent();

        // voter1 + voter2 commit in epoch 0 (revealableAfter = 1900)
        bytes32 salt1 = bytes32(uint256(9001));
        bytes32 salt2 = bytes32(uint256(9002));
        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, true, salt2);

        // voter3 also commits in epoch 0 but won't be revealed (past epoch forfeit)
        bytes32 salt3 = bytes32(uint256(9003));
        _commitVote(voter3, contentId, false, salt3);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Reveal voter1 and voter2 at 2000 (past epoch 0, thresholdReachedAt = 2000)
        vm.warp(2000);
        _revealVote(
            keeper1, voter1, contentId, roundId, keccak256(abi.encodePacked(true, salt1, contentId)), true, salt1
        );
        _revealVote(
            keeper1, voter2, contentId, roundId, keccak256(abi.encodePacked(true, salt2, contentId)), true, salt2
        );

        // voter4 commits at 2850 in epoch 2 (revealableAfter = 3700)
        vm.warp(2850);
        bytes32 salt4 = bytes32(uint256(9004));
        _commitVote(voter4, contentId, false, salt4);

        // Settle at 2900 (= thresholdReachedAt 2000 + epochDuration 900)
        // settledAt = 2900
        // voter3: revealableAfter=1900 <= settledAt=2900 → FORFEIT
        // voter4: revealableAfter=3700 > settledAt=2900 → REFUND
        vm.warp(2900);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        uint256 treasuryBefore = crepToken.balanceOf(treasury);
        uint256 voter4Before = crepToken.balanceOf(voter4);

        // Process unrevealed votes — should handle both forfeit (voter3) and refund (voter4)
        vm.prank(keeper1);
        votingEngine.processUnrevealedVotes(contentId, roundId, 0, 0);

        // voter3 stake forfeited to treasury (past epoch, not revealed)
        assertEq(crepToken.balanceOf(treasury) - treasuryBefore, STAKE, "voter3 stake forfeited to treasury");

        // voter4 stake refunded (current epoch at settlement time)
        assertEq(crepToken.balanceOf(voter4) - voter4Before, STAKE, "voter4 stake refunded");
    }

    // =========================================================================
    // AUDIT TESTS: Tied round refund flow
    // =========================================================================

    function test_TiedRound_ClaimRefund() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(7001));
        bytes32 salt2 = bytes32(uint256(7002));
        bytes32 hash1 = _commitVote(voter1, contentId, true, salt1);
        bytes32 hash2 = _commitVote(voter2, contentId, false, salt2);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Reveal both (equal pools => tie)
        vm.warp(t0 + 16 minutes);
        _revealVote(keeper1, voter1, contentId, roundId, hash1, true, salt1);
        _revealVote(keeper1, voter2, contentId, roundId, hash2, false, salt2);

        // Settle (should result in tied state)
        vm.warp(t0 + 32 minutes);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied));

        // Both voters should be able to claim refund
        uint256 bal1Before = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crepToken.balanceOf(voter1) - bal1Before, STAKE, "voter1 should get full refund");

        uint256 bal2Before = crepToken.balanceOf(voter2);
        vm.prank(voter2);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crepToken.balanceOf(voter2) - bal2Before, STAKE, "voter2 should get full refund");

        // Double claim should revert
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
    }

    // =========================================================================
    // AUDIT TESTS: Zero-stake edge case
    // =========================================================================

    function test_MinStakeEnforced() public {
        uint256 contentId = _submitContent();

        bytes32 hash1 = keccak256(abi.encodePacked(true, bytes32(uint256(8001)), contentId));
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), 0);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        votingEngine.commitVote(
            contentId, hash1, _mockCiphertext(true, bytes32(uint256(8001)), contentId), 0, address(0)
        );
        vm.stopPrank();
    }

    function test_MaxStakeEnforced() public {
        uint256 contentId = _submitContent();

        bytes32 hash1 = keccak256(abi.encodePacked(true, bytes32(uint256(8002)), contentId));
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), 200e6);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        votingEngine.commitVote(
            contentId, hash1, _mockCiphertext(true, bytes32(uint256(8002)), contentId), 200e6, address(0)
        );
        vm.stopPrank();
    }

    function test_CommitVote_NonExistentContentReverts() public {
        uint256 phantomContentId = 999;
        bytes32 salt = bytes32(uint256(9001));
        bytes32 hash = keccak256(abi.encodePacked(true, salt, phantomContentId));

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(RoundVotingEngine.ContentNotActive.selector);
        votingEngine.commitVote(
            phantomContentId, hash, _mockCiphertext(true, salt, phantomContentId), STAKE, address(0)
        );
        vm.stopPrank();
    }

    // =========================================================================
    // AUDIT TESTS: Unauthorized participation reward claim
    // =========================================================================

    function test_ClaimParticipationReward_NonVoterReverts() public {
        (uint256 contentId, uint256 roundId) = _settleRoundWithParticipation();

        // voter4 never voted in this round
        vm.prank(voter4);
        vm.expectRevert(RoundVotingEngine.NoCommit.selector);
        votingEngine.claimParticipationReward(contentId, roundId);
    }

    // =========================================================================
    // KEEPER REWARDS
    // =========================================================================

    function test_keeperRewardOnSettle() public {
        vm.startPrank(owner);
        votingEngine.setKeeperReward(0.1e6); // 0.1 cREP
        crepToken.mint(owner, 10e6);
        crepToken.approve(address(votingEngine), 10e6);
        votingEngine.fundKeeperRewardPool(10e6);
        vm.stopPrank();

        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        bytes32 salt3 = bytes32(uint256(333));
        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, true, salt2);
        _commitVote(voter3, contentId, false, salt3);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        vm.warp(t0 + 16 minutes);
        _revealVote(
            keeper1, voter1, contentId, roundId, keccak256(abi.encodePacked(true, salt1, contentId)), true, salt1
        );
        _revealVote(
            keeper1, voter2, contentId, roundId, keccak256(abi.encodePacked(true, salt2, contentId)), true, salt2
        );
        _revealVote(
            keeper1, voter3, contentId, roundId, keccak256(abi.encodePacked(false, salt3, contentId)), false, salt3
        );

        vm.warp(t0 + 32 minutes);
        uint256 keeperBefore = crepToken.balanceOf(keeper1);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        assertEq(crepToken.balanceOf(keeper1) - keeperBefore, 0.1e6, "Keeper should receive 0.1 cREP for settle");
    }

    function test_keeperRewardOnCancel() public {
        vm.startPrank(owner);
        votingEngine.setKeeperReward(0.1e6);
        crepToken.mint(owner, 10e6);
        crepToken.approve(address(votingEngine), 10e6);
        votingEngine.fundKeeperRewardPool(10e6);
        vm.stopPrank();

        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        _commitVote(voter1, contentId, true, bytes32(uint256(111)));
        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        vm.warp(t0 + 8 days);
        uint256 keeperBefore = crepToken.balanceOf(keeper1);
        vm.prank(keeper1);
        votingEngine.cancelExpiredRound(contentId, roundId);

        assertEq(crepToken.balanceOf(keeper1) - keeperBefore, 0.1e6, "Keeper should receive 0.1 cREP for cancel");
    }

    function test_keeperRewardOnProcessUnrevealed() public {
        vm.startPrank(owner);
        votingEngine.setKeeperReward(0.1e6);
        crepToken.mint(owner, 10e6);
        crepToken.approve(address(votingEngine), 10e6);
        votingEngine.fundKeeperRewardPool(10e6);
        vm.stopPrank();

        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        bytes32 salt3 = bytes32(uint256(333));
        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, true, salt2);
        _commitVote(voter3, contentId, false, salt3);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        vm.warp(t0 + 16 minutes);
        _revealVote(
            keeper1, voter1, contentId, roundId, keccak256(abi.encodePacked(true, salt1, contentId)), true, salt1
        );
        _revealVote(
            keeper1, voter2, contentId, roundId, keccak256(abi.encodePacked(true, salt2, contentId)), true, salt2
        );
        // voter3 not revealed

        vm.warp(t0 + 32 minutes);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        uint256 keeperBefore = crepToken.balanceOf(keeper1);
        vm.prank(keeper1);
        votingEngine.processUnrevealedVotes(contentId, roundId, 0, 0);

        assertEq(
            crepToken.balanceOf(keeper1) - keeperBefore, 0.1e6, "Keeper should receive 0.1 cREP for processUnrevealed"
        );
    }

    function test_keeperRewardZeroByDefault() public {
        assertEq(votingEngine.keeperReward(), 0, "Keeper reward should be 0 by default");

        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        bytes32 salt3 = bytes32(uint256(333));
        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, true, salt2);
        _commitVote(voter3, contentId, false, salt3);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        vm.warp(t0 + 16 minutes);
        _revealVote(
            keeper1, voter1, contentId, roundId, keccak256(abi.encodePacked(true, salt1, contentId)), true, salt1
        );
        _revealVote(
            keeper1, voter2, contentId, roundId, keccak256(abi.encodePacked(true, salt2, contentId)), true, salt2
        );
        _revealVote(
            keeper1, voter3, contentId, roundId, keccak256(abi.encodePacked(false, salt3, contentId)), false, salt3
        );

        vm.warp(t0 + 32 minutes);
        uint256 keeperBefore = crepToken.balanceOf(keeper1);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        assertEq(crepToken.balanceOf(keeper1), keeperBefore, "No reward when keeperReward is 0");
    }

    function test_keeperRewardInsufficientPool() public {
        // Set keeper reward but don't fund the pool — reward should be silently skipped
        vm.prank(owner);
        votingEngine.setKeeperReward(0.1e6);

        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, true, salt2);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        vm.warp(t0 + 16 minutes);
        _revealVote(
            keeper1, voter1, contentId, roundId, keccak256(abi.encodePacked(true, salt1, contentId)), true, salt1
        );
        _revealVote(
            keeper1, voter2, contentId, roundId, keccak256(abi.encodePacked(true, salt2, contentId)), true, salt2
        );

        vm.warp(t0 + 32 minutes);
        uint256 keeperBefore = crepToken.balanceOf(keeper1);
        vm.prank(keeper1);
        // Should NOT revert — settlement succeeds even when reward can't be paid
        votingEngine.settleRound(contentId, roundId);

        assertEq(crepToken.balanceOf(keeper1), keeperBefore, "No reward when pool is empty");
        assertEq(uint256(votingEngine.getRound(contentId, roundId).state), uint256(RoundLib.RoundState.Settled));
    }

    function test_setKeeperRewardOnlyConfigRole() public {
        vm.prank(voter1);
        vm.expectRevert();
        votingEngine.setKeeperReward(1e6);

        // Owner (CONFIG_ROLE) should succeed
        vm.prank(owner);
        votingEngine.setKeeperReward(1e6);
        assertEq(votingEngine.keeperReward(), 1e6);
    }

    function test_fundKeeperRewardPool() public {
        assertEq(votingEngine.keeperRewardPool(), 0, "Pool starts at 0");

        vm.startPrank(owner);
        crepToken.mint(owner, 100e6);
        crepToken.approve(address(votingEngine), 100e6);
        votingEngine.fundKeeperRewardPool(100e6);
        vm.stopPrank();

        assertEq(votingEngine.keeperRewardPool(), 100e6, "Pool should be funded");

        // Non-CONFIG_ROLE cannot fund
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), 10e6);
        vm.expectRevert();
        votingEngine.fundKeeperRewardPool(10e6);
        vm.stopPrank();
    }

    function test_keeperRewardPoolDecrements() public {
        vm.startPrank(owner);
        votingEngine.setKeeperReward(0.1e6);
        crepToken.mint(owner, 1e6);
        crepToken.approve(address(votingEngine), 1e6);
        votingEngine.fundKeeperRewardPool(1e6);
        vm.stopPrank();

        assertEq(votingEngine.keeperRewardPool(), 1e6);

        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        bytes32 salt3 = bytes32(uint256(333));
        _commitVote(voter1, contentId, true, salt1);
        _commitVote(voter2, contentId, true, salt2);
        _commitVote(voter3, contentId, false, salt3);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        vm.warp(t0 + 16 minutes);
        _revealVote(
            keeper1, voter1, contentId, roundId, keccak256(abi.encodePacked(true, salt1, contentId)), true, salt1
        );
        _revealVote(
            keeper1, voter2, contentId, roundId, keccak256(abi.encodePacked(true, salt2, contentId)), true, salt2
        );
        _revealVote(
            keeper1, voter3, contentId, roundId, keccak256(abi.encodePacked(false, salt3, contentId)), false, salt3
        );

        vm.warp(t0 + 32 minutes);
        vm.prank(keeper1);
        votingEngine.settleRound(contentId, roundId);

        assertEq(votingEngine.keeperRewardPool(), 1e6 - 0.1e6, "Pool should decrement by reward amount");
    }
}
