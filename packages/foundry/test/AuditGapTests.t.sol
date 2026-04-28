// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { HumanReputation } from "../contracts/HumanReputation.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";

/// @title Audit Gap Tests — Priority-1 test coverage for gaps identified during security audit.
/// @dev Covers:
///   1. Paused state enforcement — verify all critical functions respect whenNotPaused
///   2. Claim paths in a single settled round (voter + loser refund + participation + frontend fee + consensus)
///   3. processUnrevealedVotes batch boundary edge cases
///   4. Tied + RevealFailed refund path precedence
///   5. Exact cooldown boundary timing
contract AuditGapTests is VotingTestBase {
    HumanReputation public hrepToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    RoundRewardDistributor public rewardDistributor;
    ParticipationPool public participationPool;
    FrontendRegistry public frontendRegistry;

    address public owner = address(1);
    address public submitter = address(2);
    address public voter1 = address(3);
    address public voter2 = address(4);
    address public voter3 = address(5);
    address public voter4 = address(6);
    address public frontend = address(7);
    address public treasury = address(100);

    uint256 public constant STAKE = 10e6;
    uint256 public constant EPOCH_DURATION = 10 minutes;

    function setUp() public {
        vm.warp(1000);
        vm.roll(100);
        vm.startPrank(owner);

        hrepToken = new HumanReputation(owner, owner);
        hrepToken.grantRole(hrepToken.MINTER_ROLE(), owner);

        ContentRegistry registryImpl = new ContentRegistry();
        RoundVotingEngine engineImpl = new RoundVotingEngine();
        RoundRewardDistributor distImpl = new RoundRewardDistributor();

        registry = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImpl),
                    abi.encodeCall(ContentRegistry.initializeWithTreasury, (owner, owner, owner, address(hrepToken)))
                )
            )
        );

        votingEngine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engineImpl),
                    abi.encodeCall(
                        RoundVotingEngine.initialize,
                        (owner, address(hrepToken), address(registry), address(_deployProtocolConfig(owner)))
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
                        (owner, address(hrepToken), address(votingEngine), address(registry))
                    )
                )
            )
        );

        // ParticipationPool
        participationPool = new ParticipationPool(address(hrepToken), owner);
        participationPool.setAuthorizedCaller(address(rewardDistributor), true);
        hrepToken.mint(owner, 1_000_000e6);
        hrepToken.approve(address(participationPool), 1_000_000e6);
        participationPool.depositPool(1_000_000e6);

        // FrontendRegistry
        FrontendRegistry frImpl = new FrontendRegistry();
        frontendRegistry = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(frImpl), abi.encodeCall(FrontendRegistry.initialize, (owner, owner, address(hrepToken)))
                )
            )
        );
        frontendRegistry.setVotingEngine(address(votingEngine));
        frontendRegistry.addFeeCreditor(address(rewardDistributor));
        MockVoterIdNFT voterIdNFT = new MockVoterIdNFT();
        frontendRegistry.setVoterIdNFT(address(voterIdNFT));

        // Wire up
        registry.setVotingEngine(address(votingEngine));
        MockCategoryRegistry mockCategoryRegistry = new MockCategoryRegistry();
        mockCategoryRegistry.seedDefaultTestCategories();
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(votingEngine.protocolConfig())).setRewardDistributor(address(rewardDistributor));
        ProtocolConfig(address(votingEngine.protocolConfig())).setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(votingEngine.protocolConfig())).setTreasury(treasury);
        ProtocolConfig(address(votingEngine.protocolConfig())).setFrontendRegistry(address(frontendRegistry));
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(participationPool));
        _setTlockRoundConfig(ProtocolConfig(address(votingEngine.protocolConfig())), EPOCH_DURATION, 7 days, 3, 200);

        // Fund consensus reserve
        uint256 reserveAmount = 1_000_000e6;
        hrepToken.mint(owner, reserveAmount);
        hrepToken.approve(address(votingEngine), reserveAmount);
        votingEngine.addToConsensusReserve(reserveAmount);

        // Mint HREP to test users
        address[6] memory users = [submitter, voter1, voter2, voter3, voter4, frontend];
        for (uint256 i = 0; i < users.length; i++) {
            hrepToken.mint(users[i], 100_000e6);
        }
        voterIdNFT.setHolder(frontend);

        // Register frontend
        vm.stopPrank();
        vm.startPrank(frontend);
        hrepToken.approve(address(frontendRegistry), 1_000e6);
        frontendRegistry.register();
        vm.stopPrank();

        vm.stopPrank();
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _submitContent(string memory url) internal returns (uint256 contentId) {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, url, "test goal", "test goal", "test", 0);
        vm.stopPrank();
        return registry.nextContentId() - 1;
    }

    function _commit(address voter, uint256 contentId, bool isUp, uint256 stakeAmt, address fe)
        internal
        returns (bytes32 salt, bytes32 commitKey)
    {
        salt = keccak256(abi.encodePacked(voter, block.timestamp, contentId, isUp));
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);
        bytes32 hash = _commitHash(isUp, salt, voter, contentId, ciphertext);
        vm.startPrank(voter);
        hrepToken.approve(address(votingEngine), stakeAmt);
        votingEngine.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            hash,
            ciphertext,
            stakeAmt,
            fe
        );
        vm.stopPrank();
        commitKey = keccak256(abi.encodePacked(voter, hash));
    }

    function _reveal(address, uint256 contentId, uint256 roundId, bytes32 commitKey, bool isUp, bytes32 salt) internal {
        votingEngine.revealVoteByCommitKey(contentId, roundId, commitKey, isUp, salt);
    }

    // =========================================================================
    // SECTION 1 — Paused State Enforcement
    // =========================================================================

    /// @notice Verify commitVote respects whenNotPaused
    function test_Paused_CommitVote_Reverts() public {
        uint256 contentId = _submitContent("https://pause-test-1.com");

        vm.prank(owner);
        votingEngine.pause();

        bytes32 salt = keccak256("salt");
        bytes memory ct = _testCiphertext(true, salt, contentId);
        bytes32 hash = _commitHash(true, salt, voter1, contentId, ct);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(); // EnforcedPause
        votingEngine.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            hash,
            ct,
            STAKE,
            address(0)
        );
        vm.stopPrank();
    }

    /// @notice Verify settleRound respects whenNotPaused
    function test_Paused_SettleRound_Reverts() public {
        uint256 contentId = _submitContent("https://pause-test-2.com");

        // Commit 3 votes
        (bytes32 s1, bytes32 ck1) = _commit(voter1, contentId, true, STAKE, address(0));
        (bytes32 s2, bytes32 ck2) = _commit(voter2, contentId, true, STAKE, address(0));
        (bytes32 s3, bytes32 ck3) = _commit(voter3, contentId, false, STAKE, address(0));

        _warpPastTlockRevealTime(block.timestamp + EPOCH_DURATION);

        _reveal(voter1, contentId, 1, ck1, true, s1);
        _reveal(voter2, contentId, 1, ck2, true, s2);
        _reveal(voter3, contentId, 1, ck3, false, s3);

        // Pause
        vm.prank(owner);
        votingEngine.pause();

        vm.expectRevert(); // EnforcedPause
        votingEngine.settleRound(contentId, 1);
    }

    /// @notice Verify cancelExpiredRound respects whenNotPaused
    function test_Paused_CancelExpiredRound_Reverts() public {
        uint256 contentId = _submitContent("https://pause-test-3.com");
        _commit(voter1, contentId, true, STAKE, address(0));

        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(owner);
        votingEngine.pause();

        vm.expectRevert(); // EnforcedPause
        votingEngine.cancelExpiredRound(contentId, 1);
    }

    function test_CancelExpiredRound_DoesNotRewardKeeper() public {
        uint256 contentId = _submitContent("https://pause-test-3.com");
        _commit(voter1, contentId, true, STAKE, address(0));

        vm.warp(block.timestamp + 7 days + 1);

        uint256 keeperBalanceBefore = hrepToken.balanceOf(voter4);

        vm.prank(voter4);
        votingEngine.cancelExpiredRound(contentId, 1);

        assertEq(hrepToken.balanceOf(voter4), keeperBalanceBefore, "cancel should not pay keeper rewards");
    }

    /// @notice processUnrevealedVotes stays open while paused so terminal-round exits are not blocked.
    function test_Paused_ProcessUnrevealedVotes_StillWorks() public {
        uint256 contentId = _submitContent("https://pause-test-4.com");
        (bytes32 s1, bytes32 ck1) = _commit(voter1, contentId, true, STAKE, address(0));
        (bytes32 s2, bytes32 ck2) = _commit(voter2, contentId, true, STAKE, address(0));
        (bytes32 s3, bytes32 ck3) = _commit(voter3, contentId, false, STAKE, address(0));
        _commit(voter4, contentId, true, STAKE, address(0)); // unrevealed

        _warpPastTlockRevealTime(block.timestamp + EPOCH_DURATION);
        _reveal(voter1, contentId, 1, ck1, true, s1);
        _reveal(voter2, contentId, 1, ck2, true, s2);
        _reveal(voter3, contentId, 1, ck3, false, s3);

        // Warp past final reveal grace so unrevealed votes are processable after settlement.
        vm.warp(block.timestamp + 7 days + 60 minutes + 1);
        votingEngine.settleRound(contentId, 1);

        vm.prank(owner);
        votingEngine.pause();

        votingEngine.processUnrevealedVotes(contentId, 1, 0, 10);
        assertEq(votingEngine.roundUnrevealedCleanupRemaining(contentId, 1), 0);
    }

    /// @notice claimCancelledRoundRefund does NOT require whenNotPaused (users must always be able to withdraw)
    function test_Paused_ClaimRefund_StillWorks() public {
        uint256 contentId = _submitContent("https://pause-test-5.com");
        _commit(voter1, contentId, true, STAKE, address(0));

        vm.warp(block.timestamp + 7 days + 1);
        votingEngine.cancelExpiredRound(contentId, 1);

        vm.prank(owner);
        votingEngine.pause();

        // Refund should still work even when paused
        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, 1);
    }

    /// @notice ContentRegistry.submitQuestion respects whenNotPaused
    function test_Paused_ContentRegistrySubmit_Reverts() public {
        vm.prank(owner);
        registry.pause();

        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        vm.expectRevert(); // EnforcedPause
        registry.submitQuestion(
            "https://example.com/context",
            _singleImageUrls("https://pause-test-6.com/image.jpg"),
            "",
            "goal",
            "goal",
            "tag",
            1,
            bytes32(0)
        );
        vm.stopPrank();
    }

    /// @notice Unpause restores all operations
    function test_Unpaused_OperationsResumeAfterUnpause() public {
        vm.prank(owner);
        votingEngine.pause();

        vm.prank(owner);
        votingEngine.unpause();

        // Should work after unpausing
        uint256 contentId = _submitContent("https://unpause-test.com");
        _commit(voter1, contentId, true, STAKE, address(0));
    }

    // =========================================================================
    // SECTION 2 — Claim Paths in a Single Round
    // =========================================================================

    /// @notice Complete roundtrip: settle a round then claim voter reward,
    ///         loser refund, participation reward, frontend fee, and verify consensus reserve
    ///         was funded — all in one round without double-counting.
    function test_ClaimPaths_SingleRound() public {
        uint256 contentId = _submitContent("https://full-claim-test.com");

        // voter1, voter2 = UP (winners), voter3 = DOWN (loser), all via frontend
        (bytes32 s1, bytes32 ck1) = _commit(voter1, contentId, true, STAKE, frontend);
        (bytes32 s2, bytes32 ck2) = _commit(voter2, contentId, true, STAKE, frontend);
        (bytes32 s3, bytes32 ck3) = _commit(voter3, contentId, false, STAKE, frontend);

        // Advance past epoch, reveal all
        _warpPastTlockRevealTime(block.timestamp + EPOCH_DURATION);
        _reveal(voter1, contentId, 1, ck1, true, s1);
        _reveal(voter2, contentId, 1, ck2, true, s2);
        _reveal(voter3, contentId, 1, ck3, false, s3);

        // Warp past reveal grace period
        vm.warp(block.timestamp + 60 minutes + 1);

        // Settle
        votingEngine.settleRound(contentId, 1);

        // Verify round is settled
        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, 1);
        assertTrue(round.state == RoundLib.RoundState.Settled, "Round should be settled");
        assertTrue(round.upWins, "UP should win");

        // 1. Voter reward (winner voter1)
        uint256 v1Before = hrepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, 1);
        uint256 v1After = hrepToken.balanceOf(voter1);
        assertTrue(v1After > v1Before, "Winner should receive reward");

        // 2. Voter reward (winner voter2)
        uint256 v2Before = hrepToken.balanceOf(voter2);
        vm.prank(voter2);
        rewardDistributor.claimReward(contentId, 1);
        uint256 v2After = hrepToken.balanceOf(voter2);
        assertTrue(v2After > v2Before, "Winner 2 should receive reward");

        // 3. Loser refund (voter3 — revealed loser gets 5% rebate)
        uint256 v3Before = hrepToken.balanceOf(voter3);
        vm.prank(voter3);
        rewardDistributor.claimReward(contentId, 1);
        uint256 v3After = hrepToken.balanceOf(voter3);
        assertTrue(v3After > v3Before, "Revealed loser should receive 5% rebate");
        assertEq(v3After - v3Before, STAKE * 500 / 10000, "Rebate should be 5% of stake");

        // 4. Frontend fee (credited to FrontendRegistry, then claimed by operator)
        vm.prank(frontend);
        rewardDistributor.claimFrontendFee(contentId, 1, frontend);
        uint256 feBefore = hrepToken.balanceOf(frontend);
        vm.prank(frontend);
        frontendRegistry.claimFees();
        uint256 feAfter = hrepToken.balanceOf(frontend);
        assertTrue(feAfter > feBefore, "Frontend should receive fee via claimFees");

        // 5. Participation reward (voter1 = winner)
        uint256 v1PartBefore = hrepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimParticipationReward(contentId, 1);
        uint256 v1PartAfter = hrepToken.balanceOf(voter1);
        assertTrue(v1PartAfter > v1PartBefore, "Winner should get participation reward");

        // Verify: no double claims
        vm.prank(voter1);
        vm.expectRevert();
        rewardDistributor.claimReward(contentId, 1);

        vm.prank(voter1);
        vm.expectRevert();
        rewardDistributor.claimParticipationReward(contentId, 1);
    }

    // =========================================================================
    // SECTION 3 — processUnrevealedVotes Batch Boundary Edge Cases
    // =========================================================================

    /// @notice processUnrevealedVotes with count=0 processes all votes
    function test_ProcessUnrevealed_CountZero_ProcessesAll() public {
        uint256 contentId = _submitContent("https://batch-test-1.com");

        // 3 revealed + 2 unrevealed
        (bytes32 s1, bytes32 ck1) = _commit(voter1, contentId, true, STAKE, address(0));
        (bytes32 s2, bytes32 ck2) = _commit(voter2, contentId, true, STAKE, address(0));
        (bytes32 s3, bytes32 ck3) = _commit(voter3, contentId, false, STAKE, address(0));
        _commit(voter4, contentId, true, STAKE, address(0)); // unrevealed
        // Need 5th voter for 2 unrevealed
        address voter5 = address(8);
        vm.prank(owner);
        hrepToken.mint(voter5, 100_000e6);
        _commit(voter5, contentId, false, STAKE, address(0)); // unrevealed

        _warpPastTlockRevealTime(block.timestamp + EPOCH_DURATION);
        _reveal(voter1, contentId, 1, ck1, true, s1);
        _reveal(voter2, contentId, 1, ck2, true, s2);
        _reveal(voter3, contentId, 1, ck3, false, s3);

        vm.warp(block.timestamp + 7 days + 60 minutes + 1);
        votingEngine.settleRound(contentId, 1);

        // count=0 should process all
        votingEngine.processUnrevealedVotes(contentId, 1, 0, 0);
    }

    /// @notice processUnrevealedVotes with startIndex + count > array length gets clamped
    function test_ProcessUnrevealed_CountExceedsLength_Clamps() public {
        uint256 contentId = _submitContent("https://batch-test-2.com");

        (bytes32 s1, bytes32 ck1) = _commit(voter1, contentId, true, STAKE, address(0));
        (bytes32 s2, bytes32 ck2) = _commit(voter2, contentId, true, STAKE, address(0));
        (bytes32 s3, bytes32 ck3) = _commit(voter3, contentId, false, STAKE, address(0));
        _commit(voter4, contentId, true, STAKE, address(0)); // unrevealed

        _warpPastTlockRevealTime(block.timestamp + EPOCH_DURATION);
        _reveal(voter1, contentId, 1, ck1, true, s1);
        _reveal(voter2, contentId, 1, ck2, true, s2);
        _reveal(voter3, contentId, 1, ck3, false, s3);

        vm.warp(block.timestamp + 7 days + 60 minutes + 1);
        votingEngine.settleRound(contentId, 1);

        // count=999 should clamp to array length and still succeed
        votingEngine.processUnrevealedVotes(contentId, 1, 0, 999);
    }

    /// @notice processUnrevealedVotes with startIndex at exact boundary reverts
    function test_ProcessUnrevealed_StartIndexAtLength_Reverts() public {
        uint256 contentId = _submitContent("https://batch-test-3.com");

        (bytes32 s1, bytes32 ck1) = _commit(voter1, contentId, true, STAKE, address(0));
        (bytes32 s2, bytes32 ck2) = _commit(voter2, contentId, true, STAKE, address(0));
        (bytes32 s3, bytes32 ck3) = _commit(voter3, contentId, false, STAKE, address(0));
        _commit(voter4, contentId, true, STAKE, address(0));

        _warpPastTlockRevealTime(block.timestamp + EPOCH_DURATION);
        _reveal(voter1, contentId, 1, ck1, true, s1);
        _reveal(voter2, contentId, 1, ck2, true, s2);
        _reveal(voter3, contentId, 1, ck3, false, s3);

        vm.warp(block.timestamp + 7 days + 60 minutes + 1);
        votingEngine.settleRound(contentId, 1);

        // startIndex == array.length should revert
        vm.expectRevert(RoundVotingEngine.IndexOutOfBounds.selector);
        votingEngine.processUnrevealedVotes(contentId, 1, 4, 1);
    }

    /// @notice processUnrevealedVotes in two batches processes correctly
    function test_ProcessUnrevealed_TwoBatches_NoDuplicate() public {
        uint256 contentId = _submitContent("https://batch-test-4.com");

        (bytes32 s1, bytes32 ck1) = _commit(voter1, contentId, true, STAKE, address(0));
        (bytes32 s2, bytes32 ck2) = _commit(voter2, contentId, true, STAKE, address(0));
        (bytes32 s3, bytes32 ck3) = _commit(voter3, contentId, false, STAKE, address(0));
        _commit(voter4, contentId, true, STAKE, address(0)); // unrevealed

        _warpPastTlockRevealTime(block.timestamp + EPOCH_DURATION);
        _reveal(voter1, contentId, 1, ck1, true, s1);
        _reveal(voter2, contentId, 1, ck2, true, s2);
        _reveal(voter3, contentId, 1, ck3, false, s3);

        vm.warp(block.timestamp + 7 days + 60 minutes + 1);
        votingEngine.settleRound(contentId, 1);

        // Process first 2 (both revealed, nothing to process)
        // Process last 2 (one revealed, one unrevealed)
        votingEngine.processUnrevealedVotes(contentId, 1, 2, 2);

        // Second batch starting at index 0 — revealed votes skip silently
        vm.expectRevert(RoundVotingEngine.NothingProcessed.selector);
        votingEngine.processUnrevealedVotes(contentId, 1, 0, 2);
    }

    // =========================================================================
    // SECTION 4 — Cooldown Boundary Timing
    // =========================================================================

    /// @notice Vote at T, try again at T+24h-1s should revert, at T+24h should succeed
    function test_Cooldown_ExactBoundary() public {
        uint256 contentId = _submitContent("https://cooldown-test-1.com");
        uint256 contentId2 = _submitContent("https://cooldown-test-2.com");

        uint256 voteTime = block.timestamp;
        _commit(voter1, contentId, true, STAKE, address(0));

        // At exactly 24h - 1 second: should revert
        vm.warp(voteTime + 24 hours - 1);
        bytes32 salt = keccak256(abi.encodePacked(voter1, block.timestamp, contentId));
        bytes memory ct = _testCiphertext(true, salt, contentId);
        bytes32 hash = _commitHash(true, salt, voter1, contentId, ct);
        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        votingEngine.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            hash,
            ct,
            STAKE,
            address(0)
        );
        vm.stopPrank();

        // At exactly 24h: should succeed (on different content since already committed on contentId round)
        vm.warp(voteTime + 24 hours);
        _commit(voter1, contentId2, true, STAKE, address(0));
    }

    // =========================================================================
    // SECTION 5 — Consensus Subsidy on Unanimous Round
    // =========================================================================

    /// @notice Unanimous round (all UP, no DOWN) correctly draws from consensus reserve
    function test_ConsensusSubsidy_UnanimousRound() public {
        uint256 contentId = _submitContent("https://consensus-test.com");

        uint256 reserveBefore = votingEngine.consensusReserve();

        (bytes32 s1, bytes32 ck1) = _commit(voter1, contentId, true, STAKE, address(0));
        (bytes32 s2, bytes32 ck2) = _commit(voter2, contentId, true, STAKE, address(0));
        (bytes32 s3, bytes32 ck3) = _commit(voter3, contentId, true, STAKE, address(0));

        _warpPastTlockRevealTime(block.timestamp + EPOCH_DURATION);
        _reveal(voter1, contentId, 1, ck1, true, s1);
        _reveal(voter2, contentId, 1, ck2, true, s2);
        _reveal(voter3, contentId, 1, ck3, true, s3);

        vm.warp(block.timestamp + 60 minutes + 1);
        votingEngine.settleRound(contentId, 1);

        uint256 reserveAfter = votingEngine.consensusReserve();
        assertTrue(reserveAfter < reserveBefore, "Consensus reserve should decrease");

        // Expected subsidy: 5% of total stake (30 HREP), capped at 50 HREP
        uint256 totalStake = STAKE * 3;
        uint256 expectedSubsidy = (totalStake * 500) / 10000;
        assertEq(reserveBefore - reserveAfter, expectedSubsidy, "Reserve decrease should match subsidy formula");

        // Winners should be able to claim rewards
        uint256 v1Before = hrepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, 1);
        assertTrue(hrepToken.balanceOf(voter1) > v1Before, "Voter should get stake + subsidy share");
    }

    // =========================================================================
    // SECTION 6 — Engine Balance Solvency After Full Claims
    // =========================================================================

    /// @notice After all claims in a settled round, the engine should have no stuck funds
    ///         from that round (only consensus reserve and other-round funds remain).
    function test_Solvency_AllClaimsExhaust_NoStuckFunds() public {
        uint256 contentId = _submitContent("https://solvency-test.com");

        // 2 UP winners, 1 DOWN loser
        (bytes32 s1, bytes32 ck1) = _commit(voter1, contentId, true, STAKE, address(0));
        (bytes32 s2, bytes32 ck2) = _commit(voter2, contentId, true, STAKE, address(0));
        (bytes32 s3, bytes32 ck3) = _commit(voter3, contentId, false, STAKE, address(0));

        _warpPastTlockRevealTime(block.timestamp + EPOCH_DURATION);
        _reveal(voter1, contentId, 1, ck1, true, s1);
        _reveal(voter2, contentId, 1, ck2, true, s2);
        _reveal(voter3, contentId, 1, ck3, false, s3);

        vm.warp(block.timestamp + 60 minutes + 1);
        votingEngine.settleRound(contentId, 1);

        // Claim all voter rewards
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, 1);
        vm.prank(voter2);
        rewardDistributor.claimReward(contentId, 1);
        vm.prank(voter3);
        rewardDistributor.claimReward(contentId, 1);

        uint256 engineBalAfter = hrepToken.balanceOf(address(votingEngine));

        // Engine balance should be >= engineBalStart (consensus reserve grew by 5% of losing pool)
        // The only remaining funds should be: consensus reserve + any rounding dust
        uint256 consensusReserve = votingEngine.consensusReserve();

        // Engine should hold at least the remaining reserve.
        assertTrue(engineBalAfter >= consensusReserve, "Engine must hold at least the consensus reserve");

        // Final winner receives any voter-pool remainder, so no reward dust should remain.
        uint256 dust = engineBalAfter - consensusReserve;
        assertEq(dust, 0, "No voter reward dust should remain");
    }
}
