// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { Vm } from "forge-std/Test.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { IFrontendRegistry } from "../contracts/interfaces/IFrontendRegistry.sol";

contract RevertingParticipationPool {
    function getCurrentRateBps() external pure returns (uint256) {
        revert("rate unavailable");
    }
}

/// @title Round-based integration tests for tlock commit-reveal flow with epoch-weighted rewards.
/// @dev Covers: full lifecycle, multi-voter, concurrent rounds, tied rounds,
///      cancelled/expired rounds, consensus settlement, config snapshots.
///      Uses test ciphertext (chainid 31337): ciphertext = abi.encodePacked(uint8(isUp?1:0), salt, contentId).
contract RoundIntegrationTest is VotingTestBase {
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
    address public treasury = address(100);

    uint256 public constant STAKE = 5e6; // 5 cREP

    // Short epoch duration for tests (10 minutes — above the 5-minute minimum)
    uint256 public constant EPOCH_DURATION = 10 minutes;

    function setUp() public {
        // Set a predictable start time
        vm.warp(1000);
        vm.roll(100);

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

        // ciphertext validation is relaxed on chainid 31337 (test chains)
        votingEngine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engineImpl),
                    abi.encodeCall(RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry)))
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

        // setConfig(epochDuration, maxDuration, minVoters, maxVoters)
        // Use short 10-minute epochs for tests, minVoters=2 to keep tests lean
        votingEngine.setConfig(EPOCH_DURATION, 7 days, 2, 200);

        // Fund consensus reserve
        uint256 reserveAmount = 1_000_000e6;
        crepToken.mint(owner, reserveAmount);
        crepToken.approve(address(votingEngine), reserveAmount);
        votingEngine.fundConsensusReserve(reserveAmount);

        // Mint cREP to all test users
        address[7] memory users = [submitter, voter1, voter2, voter3, voter4, voter5, voter6];
        for (uint256 i = 0; i < users.length; i++) {
            crepToken.mint(users[i], 10_000e6);
        }

        vm.stopPrank();
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _submitContent() internal returns (uint256 contentId) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "test goal", "test", 0);
        vm.stopPrank();
        contentId = 1;
    }

    /// @dev Submit content with a unique URL suffix to avoid duplicate-URL conflicts.
    function _submitContentN(uint256 n) internal returns (uint256 contentId) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        string memory url = string(abi.encodePacked("https://example.com/", vm.toString(n)));
        registry.submitContent(url, "test goal", "test", 0);
        vm.stopPrank();
        contentId = n;
    }

    /// @dev Commit + reveal a vote for a voter in a single epoch boundary.
    ///      The commit is recorded, then time advances past EPOCH_DURATION, then the vote is revealed.
    function _commitAndReveal(address voter, uint256 contentId, bool isUp, uint256 stakeAmount) internal {
        bytes32 salt = keccak256(abi.encodePacked(voter, contentId, isUp));
        bytes32 ch = _commitHash(isUp, salt, contentId);
        bytes memory ct = _testCiphertext(isUp, salt, contentId);

        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), stakeAmount);
        votingEngine.commitVote(contentId, ch, ct, stakeAmount, address(0));
        vm.stopPrank();

        // Advance time past epoch boundary so vote becomes revealable
        vm.warp(block.timestamp + EPOCH_DURATION + 1);

        bytes32 ck = _commitKey(voter, ch);
        uint256 roundId = _getActiveOrLatestRoundId(contentId);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck, isUp, salt);
    }

    /// @dev Commit a vote (no reveal). Returns (commitHash, commitKey).
    function _commit(address voter, uint256 contentId, bool isUp, uint256 stakeAmount)
        internal
        returns (bytes32 ch, bytes32 ck)
    {
        bytes32 salt = keccak256(abi.encodePacked(voter, contentId, isUp, block.timestamp));
        ch = _commitHash(isUp, salt, contentId);
        bytes memory ct = _testCiphertext(isUp, salt, contentId);

        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), stakeAmount);
        votingEngine.commitVote(contentId, ch, ct, stakeAmount, address(0));
        vm.stopPrank();

        ck = _commitKey(voter, ch);
    }

    /// @dev Commit all votes in an epoch (no inter-commit time advance), then reveal all after epoch boundary.
    ///      Voters must all be in the same epoch — caller should not advance time between commits.
    function _commitAllThenReveal(
        address[] memory voters,
        uint256 contentId,
        bool[] memory directions,
        uint256 stakeAmount
    ) internal {
        bytes32[] memory salts = new bytes32[](voters.length);
        bytes32[] memory commitHashes = new bytes32[](voters.length);
        bytes32[] memory commitKeys = new bytes32[](voters.length);

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        // If no active round yet, it will be created on first commit
        bool roundCreated = roundId > 0;

        for (uint256 i = 0; i < voters.length; i++) {
            salts[i] = keccak256(abi.encodePacked(voters[i], contentId, directions[i], i));
            commitHashes[i] = _commitHash(directions[i], salts[i], contentId);
            bytes memory ct = _testCiphertext(directions[i], salts[i], contentId);

            vm.startPrank(voters[i]);
            crepToken.approve(address(votingEngine), stakeAmount);
            votingEngine.commitVote(contentId, commitHashes[i], ct, stakeAmount, address(0));
            vm.stopPrank();

            commitKeys[i] = _commitKey(voters[i], commitHashes[i]);
            if (!roundCreated) {
                roundId = votingEngine.getActiveRoundId(contentId);
                roundCreated = true;
            }
        }

        // Advance past epoch boundary so all commits are revealable
        vm.warp(block.timestamp + EPOCH_DURATION + 1);

        for (uint256 i = 0; i < voters.length; i++) {
            votingEngine.revealVoteByCommitKey(contentId, roundId, commitKeys[i], directions[i], salts[i]);
        }
    }

    /// @dev Returns the active round ID; if 0 (terminal), falls back to the last created round.
    function _getActiveOrLatestRoundId(uint256 contentId) internal view returns (uint256) {
        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        if (roundId == 0) {
            // Round closed between commit and reveal — use last created round
            roundId = votingEngine.nextRoundId(contentId);
        }
        return roundId;
    }

    /// @dev Settle a round that has met minVoters.
    function _settle(uint256 contentId, uint256 roundId) internal {
        votingEngine.settleRound(contentId, roundId);
    }

    /// @dev Fully settle a round: commit votes, reveal them, settle.
    ///      All voters commit in epoch-1 (blind, 100% weight) so no herding disadvantage.
    function _settleRoundWith(address[] memory voters, uint256 contentId, bool[] memory directions, uint256 stakeAmount)
        internal
        returns (uint256 roundId)
    {
        _commitAllThenReveal(voters, contentId, directions, stakeAmount);
        roundId = _getActiveOrLatestRoundId(contentId);
        _settle(contentId, roundId);
    }

    // =========================================================================
    // 1. FULL ROUND LIFECYCLE — commit → reveal → settleRound → claim reward
    // =========================================================================

    function test_FullRoundLifecycle_UpWins() public {
        uint256 contentId = _submitContent();

        address[] memory voters = new address[](3);
        voters[0] = voter1;
        voters[1] = voter2;
        voters[2] = voter3;
        bool[] memory dirs = new bool[](3);
        dirs[0] = true;
        dirs[1] = true;
        dirs[2] = false;

        // Commit all in epoch-1 (same epoch), reveal after epoch boundary
        bytes32[] memory salts = new bytes32[](3);
        bytes32[] memory commitHashes = new bytes32[](3);
        bytes32[] memory commitKeys = new bytes32[](3);

        for (uint256 i = 0; i < 3; i++) {
            salts[i] = keccak256(abi.encodePacked(voters[i], contentId, dirs[i], i));
            commitHashes[i] = _commitHash(dirs[i], salts[i], contentId);
            bytes memory ct = _testCiphertext(dirs[i], salts[i], contentId);

            vm.startPrank(voters[i]);
            crepToken.approve(address(votingEngine), STAKE);
            votingEngine.commitVote(contentId, commitHashes[i], ct, STAKE, address(0));
            vm.stopPrank();

            commitKeys[i] = _commitKey(voters[i], commitHashes[i]);
        }

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        assertEq(roundId, 1, "Round 1 should be active after commits");

        // Verify round state after commits
        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(round.voteCount, 3, "Should have 3 committed votes");

        // Advance past epoch boundary and reveal all
        vm.warp(block.timestamp + EPOCH_DURATION + 1);
        for (uint256 i = 0; i < 3; i++) {
            votingEngine.revealVoteByCommitKey(contentId, roundId, commitKeys[i], dirs[i], salts[i]);
        }

        // Check round after reveals
        round = votingEngine.getRound(contentId, roundId);
        assertEq(round.revealedCount, 3, "Should have 3 revealed votes");
        assertEq(round.upPool, 2 * STAKE, "UP raw pool should be 2x");
        assertEq(round.downPool, STAKE, "DOWN raw pool should be 1x");
        assertEq(round.upCount, 2, "UP count should be 2");
        assertEq(round.downCount, 1, "DOWN count should be 1");
        assertGt(round.thresholdReachedAt, 0, "Threshold should have been reached");

        votingEngine.settleRound(contentId, roundId);

        round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled), "Round should be settled");
        assertTrue(round.upWins, "UP should win");

        // Winner claims reward
        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        assertGt(crepToken.balanceOf(voter1), balBefore, "Winner should receive reward");

        // Loser claims nothing
        uint256 loserBal = crepToken.balanceOf(voter3);
        vm.prank(voter3);
        rewardDistributor.claimReward(contentId, roundId);
        assertEq(crepToken.balanceOf(voter3), loserBal, "Loser should receive nothing");
    }

    // =========================================================================
    // 2. MULTIPLE VOTERS — UP wins and DOWN wins
    // =========================================================================

    function test_MultipleVoters_DownWins() public {
        uint256 contentId = _submitContent();

        address[] memory voters = new address[](3);
        voters[0] = voter1;
        voters[1] = voter2;
        voters[2] = voter3;
        bool[] memory dirs = new bool[](3);
        dirs[0] = true;
        dirs[1] = false;
        dirs[2] = false;

        uint256 roundId = _settleRoundWith(voters, contentId, dirs, STAKE);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled), "Round should be settled");
        assertFalse(round.upWins, "DOWN should win");

        // DOWN voter (winner) claims reward
        uint256 balBefore = crepToken.balanceOf(voter2);
        vm.prank(voter2);
        rewardDistributor.claimReward(contentId, roundId);
        assertGt(crepToken.balanceOf(voter2), balBefore, "DOWN winner should receive reward");

        // UP voter (loser) gets nothing
        uint256 upBal = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        assertEq(crepToken.balanceOf(voter1), upBal, "UP loser should receive nothing");
    }

    function test_MultipleVoters_BothWinnersClaimProportionally() public {
        uint256 contentId = _submitContent();

        // voter1: 10 cREP UP, voter2: 5 cREP UP, voter3: 5 cREP DOWN
        // All vote in epoch-1 (blind) → effectiveStake = stakeAmount * 10000 / 10000 = stakeAmount
        // voter1 effective = 10e6, voter2 effective = 5e6; voter1 gets more reward
        bytes32 salt1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 salt2 = keccak256(abi.encodePacked(voter2, contentId, true, uint256(1)));
        bytes32 salt3 = keccak256(abi.encodePacked(voter3, contentId, false, uint256(2)));

        bytes32 ch1 = _commitHash(true, salt1, contentId);
        bytes32 ch2 = _commitHash(true, salt2, contentId);
        bytes32 ch3 = _commitHash(false, salt3, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), 10e6);
        votingEngine.commitVote(contentId, ch1, _testCiphertext(true, salt1, contentId), 10e6, address(0));
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), 5e6);
        votingEngine.commitVote(contentId, ch2, _testCiphertext(true, salt2, contentId), 5e6, address(0));
        vm.stopPrank();

        vm.startPrank(voter3);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch3, _testCiphertext(false, salt3, contentId), STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        RoundLib.Round memory rMV0 = votingEngine.getRound(contentId, roundId);
        vm.warp(rMV0.startTime + EPOCH_DURATION + 1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, salt1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), true, salt2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter3, ch3), false, salt3);

        votingEngine.settleRound(contentId, roundId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertTrue(round.upWins, "UP should win");

        // Both winners claim
        uint256 bal1Before = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        uint256 reward1 = crepToken.balanceOf(voter1) - bal1Before;

        uint256 bal2Before = crepToken.balanceOf(voter2);
        vm.prank(voter2);
        rewardDistributor.claimReward(contentId, roundId);
        uint256 reward2 = crepToken.balanceOf(voter2) - bal2Before;

        // Both should get rewards; voter1 staked more (higher effective stake) → more reward
        assertGt(reward1, 0, "Voter1 should receive reward");
        assertGt(reward2, 0, "Voter2 should receive reward");
        assertGt(reward1, reward2, "Voter1 (larger stake) should receive more");
    }

    // =========================================================================
    // 3. CONCURRENT ROUNDS ON DIFFERENT CONTENT
    // =========================================================================

    function test_ConcurrentRoundsOnDifferentContent() public {
        uint256 contentId1 = _submitContentN(1);
        uint256 contentId2 = _submitContentN(2);

        // Commit on content 1
        bytes32 s1a = keccak256(abi.encodePacked(voter1, contentId1, true, uint256(0)));
        bytes32 s1b = keccak256(abi.encodePacked(voter2, contentId1, false, uint256(1)));
        bytes32 ch1a = _commitHash(true, s1a, contentId1);
        bytes32 ch1b = _commitHash(false, s1b, contentId1);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId1, ch1a, _testCiphertext(true, s1a, contentId1), STAKE, address(0));
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId1, ch1b, _testCiphertext(false, s1b, contentId1), STAKE, address(0));
        vm.stopPrank();

        // Commit on content 2
        bytes32 s2a = keccak256(abi.encodePacked(voter3, contentId2, true, uint256(2)));
        bytes32 s2b = keccak256(abi.encodePacked(voter4, contentId2, false, uint256(3)));
        bytes32 ch2a = _commitHash(true, s2a, contentId2);
        bytes32 ch2b = _commitHash(false, s2b, contentId2);

        vm.startPrank(voter3);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId2, ch2a, _testCiphertext(true, s2a, contentId2), STAKE, address(0));
        vm.stopPrank();

        vm.startPrank(voter4);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId2, ch2b, _testCiphertext(false, s2b, contentId2), STAKE, address(0));
        vm.stopPrank();

        uint256 round1 = votingEngine.getActiveRoundId(contentId1);
        uint256 round2 = votingEngine.getActiveRoundId(contentId2);
        assertEq(round1, 1, "Content 1 should have round 1");
        assertEq(round2, 1, "Content 2 should have round 1");

        // Reveal and settle both rounds together
        RoundLib.Round memory rCC0 = votingEngine.getRound(contentId1, round1);
        vm.warp(rCC0.startTime + EPOCH_DURATION + 1);
        votingEngine.revealVoteByCommitKey(contentId1, round1, _commitKey(voter1, ch1a), true, s1a);
        votingEngine.revealVoteByCommitKey(contentId1, round1, _commitKey(voter2, ch1b), false, s1b);
        votingEngine.revealVoteByCommitKey(contentId2, round2, _commitKey(voter3, ch2a), true, s2a);
        votingEngine.revealVoteByCommitKey(contentId2, round2, _commitKey(voter4, ch2b), false, s2b);

        // Settle content 1
        votingEngine.settleRound(contentId1, round1);
        RoundLib.Round memory r1 = votingEngine.getRound(contentId1, round1);
        assertEq(uint256(r1.state), uint256(RoundLib.RoundState.Tied), "Content 1 round should be tied (equal stakes)");

        // Settle content 2 independently
        votingEngine.settleRound(contentId2, round2);
        RoundLib.Round memory r2 = votingEngine.getRound(contentId2, round2);
        assertEq(uint256(r2.state), uint256(RoundLib.RoundState.Tied), "Content 2 round should be tied");
    }

    function test_ConcurrentRoundsSettleIndependently() public {
        uint256 contentId1 = _submitContentN(1);

        // Commit on content 1: 2 UP, 1 DOWN → UP wins
        bytes32 s1a = keccak256(abi.encodePacked(voter1, contentId1, true, uint256(0)));
        bytes32 s1b = keccak256(abi.encodePacked(voter2, contentId1, false, uint256(1)));
        bytes32 s1c = keccak256(abi.encodePacked(voter3, contentId1, true, uint256(2)));
        bytes32 ch1a = _commitHash(true, s1a, contentId1);
        bytes32 ch1b = _commitHash(false, s1b, contentId1);
        bytes32 ch1c = _commitHash(true, s1c, contentId1);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId1, ch1a, _testCiphertext(true, s1a, contentId1), STAKE, address(0));
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId1, ch1b, _testCiphertext(false, s1b, contentId1), STAKE, address(0));
        vm.stopPrank();

        vm.startPrank(voter3);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId1, ch1c, _testCiphertext(true, s1c, contentId1), STAKE, address(0));
        vm.stopPrank();

        // Submit content 2 a bit later
        vm.warp(block.timestamp + 5 minutes);
        uint256 contentId2 = _submitContentN(2);

        bytes32 s2a = keccak256(abi.encodePacked(voter4, contentId2, true, uint256(3)));
        bytes32 s2b = keccak256(abi.encodePacked(voter5, contentId2, false, uint256(4)));
        bytes32 ch2a = _commitHash(true, s2a, contentId2);
        bytes32 ch2b = _commitHash(false, s2b, contentId2);

        vm.startPrank(voter4);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId2, ch2a, _testCiphertext(true, s2a, contentId2), STAKE, address(0));
        vm.stopPrank();

        vm.startPrank(voter5);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId2, ch2b, _testCiphertext(false, s2b, contentId2), STAKE, address(0));
        vm.stopPrank();

        // Reveal both contents after their epochs end.
        // content1 started at T0=1000, content2 started 5 minutes later at ~1300.
        // To reveal both, warp to the LATER epoch end (content2's epoch end).
        RoundLib.Round memory rCS0_2 = votingEngine.getRound(contentId2, 1);
        vm.warp(rCS0_2.startTime + EPOCH_DURATION + 1);
        votingEngine.revealVoteByCommitKey(contentId1, 1, _commitKey(voter1, ch1a), true, s1a);
        votingEngine.revealVoteByCommitKey(contentId1, 1, _commitKey(voter2, ch1b), false, s1b);
        votingEngine.revealVoteByCommitKey(contentId1, 1, _commitKey(voter3, ch1c), true, s1c);
        // content2's epoch has also ended by now
        votingEngine.revealVoteByCommitKey(contentId2, 1, _commitKey(voter4, ch2a), true, s2a);
        votingEngine.revealVoteByCommitKey(contentId2, 1, _commitKey(voter5, ch2b), false, s2b);

        // Settle content 1
        votingEngine.settleRound(contentId1, 1);

        RoundLib.Round memory r1 = votingEngine.getRound(contentId1, 1);
        assertEq(uint256(r1.state), uint256(RoundLib.RoundState.Settled), "Content 1 should be settled");
        assertTrue(r1.upWins, "UP should win content 1");

        // Settle content 2
        votingEngine.settleRound(contentId2, 1);
        RoundLib.Round memory r2 = votingEngine.getRound(contentId2, 1);
        assertEq(uint256(r2.state), uint256(RoundLib.RoundState.Tied), "Content 2 should be tied");
    }

    // =========================================================================
    // 4. SAME VOTER COMMITS ON MULTIPLE CONTENT ITEMS
    // =========================================================================

    function test_SameVoterVotesOnMultipleContent() public {
        uint256 contentId1 = _submitContentN(1);
        uint256 contentId2 = _submitContentN(2);

        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId1, true, uint256(0)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId1, false, uint256(1)));
        bytes32 s3 = keccak256(abi.encodePacked(voter1, contentId2, false, uint256(2)));
        bytes32 s4 = keccak256(abi.encodePacked(voter3, contentId2, true, uint256(3)));

        bytes32 ch1 = _commitHash(true, s1, contentId1);
        bytes32 ch2 = _commitHash(false, s2, contentId1);
        bytes32 ch3 = _commitHash(false, s3, contentId2);
        bytes32 ch4 = _commitHash(true, s4, contentId2);

        // voter1 votes UP on content 1
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId1, ch1, _testCiphertext(true, s1, contentId1), STAKE, address(0));
        vm.stopPrank();

        // voter2 votes DOWN on content 1
        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId1, ch2, _testCiphertext(false, s2, contentId1), STAKE, address(0));
        vm.stopPrank();

        // voter1 votes DOWN on content 2
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId2, ch3, _testCiphertext(false, s3, contentId2), STAKE, address(0));
        vm.stopPrank();

        // voter3 votes UP on content 2
        vm.startPrank(voter3);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId2, ch4, _testCiphertext(true, s4, contentId2), STAKE, address(0));
        vm.stopPrank();

        // Verify commits are recorded
        assertTrue(votingEngine.hasCommitted(contentId1, 1, voter1), "Voter1 should have committed on content 1");
        assertTrue(votingEngine.hasCommitted(contentId2, 1, voter1), "Voter1 should have committed on content 2");
        assertFalse(votingEngine.hasCommitted(contentId1, 1, voter3), "Voter3 should not have committed on content 1");

        // Reveal all after epoch boundary (absolute)
        RoundLib.Round memory rSV0 = votingEngine.getRound(contentId1, 1);
        vm.warp(rSV0.startTime + EPOCH_DURATION + 1);
        votingEngine.revealVoteByCommitKey(contentId1, 1, _commitKey(voter1, ch1), true, s1);
        votingEngine.revealVoteByCommitKey(contentId1, 1, _commitKey(voter2, ch2), false, s2);
        votingEngine.revealVoteByCommitKey(contentId2, 1, _commitKey(voter1, ch3), false, s3);
        votingEngine.revealVoteByCommitKey(contentId2, 1, _commitKey(voter3, ch4), true, s4);

        // Settle both
        votingEngine.settleRound(contentId1, 1);
        votingEngine.settleRound(contentId2, 1);

        RoundLib.Round memory r1 = votingEngine.getRound(contentId1, 1);
        RoundLib.Round memory r2 = votingEngine.getRound(contentId2, 1);
        assertEq(uint256(r1.state), uint256(RoundLib.RoundState.Tied), "Content 1 should be tied");
        assertEq(uint256(r2.state), uint256(RoundLib.RoundState.Tied), "Content 2 should be tied");
    }

    // =========================================================================
    // 5. CANCEL EXPIRED ROUND + REFUND CLAIMS
    // =========================================================================

    function test_CancelExpiredRound_Refund() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch = _commitHash(true, salt, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch, _testCiphertext(true, salt, contentId), STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Cannot cancel before expiry
        vm.expectRevert(RoundVotingEngine.RoundNotExpired.selector);
        votingEngine.cancelExpiredRound(contentId, roundId);

        // Warp past maxDuration (7 days)
        vm.warp(block.timestamp + 8 days);
        votingEngine.cancelExpiredRound(contentId, roundId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Cancelled), "Round should be cancelled");

        // Voter claims refund
        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crepToken.balanceOf(voter1) - balBefore, STAKE, "Voter should get full refund");
    }

    function test_CancelExpiredRound_MultipleVotersRefund() public {
        uint256 contentId = _submitContent();

        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, false, uint256(1)));
        bytes32 ch1 = _commitHash(true, s1, contentId);
        bytes32 ch2 = _commitHash(false, s2, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch1, _testCiphertext(true, s1, contentId), STAKE, address(0));
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch2, _testCiphertext(false, s2, contentId), STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + 8 days);
        votingEngine.cancelExpiredRound(contentId, roundId);

        // Both voters claim refunds
        uint256 bal1Before = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crepToken.balanceOf(voter1) - bal1Before, STAKE, "Voter1 should get full refund");

        uint256 bal2Before = crepToken.balanceOf(voter2);
        vm.prank(voter2);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crepToken.balanceOf(voter2) - bal2Before, STAKE, "Voter2 should get full refund");
    }

    function test_CancelExpiredRound_DoubleRefundReverts() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch = _commitHash(true, salt, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch, _testCiphertext(true, salt, contentId), STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + 8 days);
        votingEngine.cancelExpiredRound(contentId, roundId);

        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
    }

    function test_CancelExpiredRound_NewRoundAfterCancellation() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch = _commitHash(true, salt, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch, _testCiphertext(true, salt, contentId), STAKE, address(0));
        vm.stopPrank();

        uint256 round1Id = votingEngine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + 8 days);
        votingEngine.cancelExpiredRound(contentId, round1Id);
        assertEq(uint256(votingEngine.getRound(contentId, round1Id).state), uint256(RoundLib.RoundState.Cancelled));

        // New commit after cooldown creates round 2
        vm.warp(block.timestamp + 25 hours);
        bytes32 salt2 = keccak256(abi.encodePacked(voter2, contentId, false, uint256(1)));
        bytes32 ch2 = _commitHash(false, salt2, contentId);

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch2, _testCiphertext(false, salt2, contentId), STAKE, address(0));
        vm.stopPrank();

        assertEq(votingEngine.getActiveRoundId(contentId), 2, "New round should be created");
    }

    // =========================================================================
    // 6. TIED ROUND (equal weighted UP/DOWN pools)
    // =========================================================================

    function test_TiedRound_EqualStakes() public {
        uint256 contentId = _submitContent();

        address[] memory voters = new address[](2);
        voters[0] = voter1;
        voters[1] = voter2;
        bool[] memory dirs = new bool[](2);
        dirs[0] = true;
        dirs[1] = false;

        uint256 roundId = _settleRoundWith(voters, contentId, dirs, STAKE);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied), "Round should be tied");
    }

    function test_TiedRound_RefundClaims() public {
        uint256 contentId = _submitContent();

        address[] memory voters = new address[](2);
        voters[0] = voter1;
        voters[1] = voter2;
        bool[] memory dirs = new bool[](2);
        dirs[0] = true;
        dirs[1] = false;

        uint256 roundId = _settleRoundWith(voters, contentId, dirs, STAKE);

        // Both voters can claim refunds from tied round
        uint256 bal1Before = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crepToken.balanceOf(voter1) - bal1Before, STAKE, "Voter1 should get refund from tie");

        uint256 bal2Before = crepToken.balanceOf(voter2);
        vm.prank(voter2);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crepToken.balanceOf(voter2) - bal2Before, STAKE, "Voter2 should get refund from tie");
    }

    function test_TiedRound_NewRoundAfterTie() public {
        uint256 contentId = _submitContent();

        address[] memory voters = new address[](2);
        voters[0] = voter1;
        voters[1] = voter2;
        bool[] memory dirs = new bool[](2);
        dirs[0] = true;
        dirs[1] = false;

        uint256 roundId = _settleRoundWith(voters, contentId, dirs, STAKE);

        assertEq(roundId, 1, "Round 1 should have been used");
        assertEq(votingEngine.getActiveRoundId(contentId), 0, "No active round after tie");

        // New commit after cooldown creates round 2
        vm.warp(block.timestamp + 25 hours);
        bytes32 salt = keccak256(abi.encodePacked(voter3, contentId, true, uint256(99)));
        bytes32 ch = _commitHash(true, salt, contentId);

        vm.startPrank(voter3);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch, _testCiphertext(true, salt, contentId), STAKE, address(0));
        vm.stopPrank();

        assertEq(votingEngine.getActiveRoundId(contentId), 2, "Round 2 should be created");
    }

    // =========================================================================
    // 7. CONSENSUS SETTLEMENT (unanimous voting — no opposing side)
    // =========================================================================

    function test_ConsensusSettlement_OnlyUpVoters() public {
        uint256 contentId = _submitContent();

        // Only UP voters, no DOWN — still need ≥minVoters revealed
        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, true, uint256(1)));
        bytes32 ch1 = _commitHash(true, s1, contentId);
        bytes32 ch2 = _commitHash(true, s2, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch1, _testCiphertext(true, s1, contentId), STAKE, address(0));
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch2, _testCiphertext(true, s2, contentId), STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Advance past epoch boundary and reveal (absolute)
        RoundLib.Round memory rCU0 = votingEngine.getRound(contentId, roundId);
        vm.warp(rCU0.startTime + EPOCH_DURATION + 1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), true, s2);

        uint256 reserveBefore = votingEngine.consensusReserve();
        votingEngine.settleRound(contentId, roundId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled), "Should be settled by consensus");
        assertTrue(round.upWins, "UP should win by consensus");

        // Consensus reserve should have decreased (subsidy paid out)
        assertLt(votingEngine.consensusReserve(), reserveBefore, "Consensus reserve should decrease");

        // Winner can claim consensus subsidy reward
        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        assertGt(crepToken.balanceOf(voter1), balBefore, "Consensus winner should receive subsidy reward");
    }

    function test_ConsensusSettlement_OnlyDownVoters() public {
        uint256 contentId = _submitContent();

        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, false, uint256(0)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, false, uint256(1)));
        bytes32 ch1 = _commitHash(false, s1, contentId);
        bytes32 ch2 = _commitHash(false, s2, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch1, _testCiphertext(false, s1, contentId), STAKE, address(0));
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch2, _testCiphertext(false, s2, contentId), STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        RoundLib.Round memory rCD0 = votingEngine.getRound(contentId, roundId);
        vm.warp(rCD0.startTime + EPOCH_DURATION + 1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), false, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), false, s2);

        votingEngine.settleRound(contentId, roundId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled), "Should be settled by consensus");
        assertFalse(round.upWins, "DOWN should win by consensus");
    }

    // =========================================================================
    // ROUND ADVANCEMENT — new round after settlement
    // =========================================================================

    function test_CommitAfterSettlementCreatesNewRound() public {
        uint256 contentId = _submitContent();

        address[] memory voters = new address[](3);
        voters[0] = voter1;
        voters[1] = voter2;
        voters[2] = voter3;
        bool[] memory dirs = new bool[](3);
        dirs[0] = true;
        dirs[1] = true;
        dirs[2] = false;

        uint256 round1Id = _settleRoundWith(voters, contentId, dirs, STAKE);
        assertEq(round1Id, 1, "Round 1 should have been settled");
        assertEq(votingEngine.getActiveRoundId(contentId), 0, "No active round after settlement");

        // New commit after cooldown creates round 2
        vm.warp(block.timestamp + 25 hours);
        bytes32 salt = keccak256(abi.encodePacked(voter4, contentId, false, uint256(99)));
        bytes32 ch = _commitHash(false, salt, contentId);

        vm.startPrank(voter4);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch, _testCiphertext(false, salt, contentId), STAKE, address(0));
        vm.stopPrank();

        assertEq(votingEngine.getActiveRoundId(contentId), 2, "Round 2 should be created");
    }

    // =========================================================================
    // DOUBLE COMMIT PREVENTION
    // =========================================================================

    function test_CannotDoubleCommitInSameRound() public {
        uint256 contentId = _submitContent();

        bytes32 salt1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch1 = _commitHash(true, salt1, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch1, _testCiphertext(true, salt1, contentId), STAKE, address(0));
        vm.stopPrank();

        // Warp past 24h cooldown so CooldownActive doesn't fire first
        vm.warp(block.timestamp + 25 hours);

        // Same voter, same round — second commit reverts with AlreadyCommitted (cooldown cleared)
        bytes32 salt2 = keccak256(abi.encodePacked(voter1, contentId, false, uint256(1)));
        bytes32 ch2 = _commitHash(false, salt2, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(RoundVotingEngine.AlreadyCommitted.selector);
        votingEngine.commitVote(contentId, ch2, _testCiphertext(false, salt2, contentId), STAKE, address(0));
        vm.stopPrank();
    }

    // =========================================================================
    // 24-HOUR COOLDOWN
    // =========================================================================

    function test_CooldownPreventsQuickRecommit() public {
        uint256 contentId = _submitContent();

        address[] memory voters = new address[](2);
        voters[0] = voter1;
        voters[1] = voter2;
        bool[] memory dirs = new bool[](2);
        dirs[0] = true;
        dirs[1] = false;

        _settleRoundWith(voters, contentId, dirs, STAKE);

        // Try immediately — cooldown active (voter1 last voted < 24h ago)
        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(99)));
        bytes32 ch = _commitHash(true, salt, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        votingEngine.commitVote(contentId, ch, _testCiphertext(true, salt, contentId), STAKE, address(0));
        vm.stopPrank();

        // After 25 hours — succeeds
        vm.warp(block.timestamp + 25 hours);
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch, _testCiphertext(true, salt, contentId), STAKE, address(0));
        vm.stopPrank();

        assertEq(votingEngine.getActiveRoundId(contentId), 2, "New round should be created");
    }

    // =========================================================================
    // CONSENSUS SUBSIDY
    // =========================================================================

    function test_UnanimousRoundPaysConsensusSubsidy() public {
        uint256 contentId = _submitContent();

        // All voters same direction — unanimous UP
        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, true, uint256(1)));
        bytes32 ch1 = _commitHash(true, s1, contentId);
        bytes32 ch2 = _commitHash(true, s2, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch1, _testCiphertext(true, s1, contentId), STAKE, address(0));
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch2, _testCiphertext(true, s2, contentId), STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        uint256 reserveBefore = votingEngine.consensusReserve();

        RoundLib.Round memory rUR0 = votingEngine.getRound(contentId, roundId);
        vm.warp(rUR0.startTime + EPOCH_DURATION + 1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), true, s2);

        votingEngine.settleRound(contentId, roundId);

        assertLt(votingEngine.consensusReserve(), reserveBefore, "Reserve should decrease for consensus subsidy");

        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        assertGt(crepToken.balanceOf(voter1), balBefore, "Voter should receive consensus subsidy");
    }

    // =========================================================================
    // CONFIG SNAPSHOT PER-ROUND
    // =========================================================================

    function test_ConfigSnapshotPerRound() public {
        uint256 contentId = _submitContent();

        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, true, uint256(1)));
        bytes32 ch1 = _commitHash(true, s1, contentId);
        bytes32 ch2 = _commitHash(true, s2, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch1, _testCiphertext(true, s1, contentId), STAKE, address(0));
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch2, _testCiphertext(true, s2, contentId), STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Verify snapshot matches config at creation
        RoundLib.RoundConfig memory cfg = votingEngine.getRoundConfig(contentId, roundId);
        assertEq(cfg.epochDuration, EPOCH_DURATION);
        assertEq(cfg.maxDuration, 7 days);
        assertEq(cfg.minVoters, 2);

        // Change config: increase minVoters to 10
        vm.prank(owner);
        votingEngine.setConfig(EPOCH_DURATION, 7 days, 10, 200);

        // Snapshot unchanged
        cfg = votingEngine.getRoundConfig(contentId, roundId);
        assertEq(cfg.minVoters, 2, "Snapshot should still have minVoters=2");

        // Reveal and settle using snapshotted config (minVoters=2, we have 2 revealed votes)
        RoundLib.Round memory rCSN0 = votingEngine.getRound(contentId, roundId);
        vm.warp(rCSN0.startTime + EPOCH_DURATION + 1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), true, s2);

        votingEngine.settleRound(contentId, roundId);

        assertEq(
            uint256(votingEngine.getRound(contentId, roundId).state),
            uint256(RoundLib.RoundState.Settled),
            "Should settle with snapshotted config"
        );
    }

    // =========================================================================
    // ROUND STATE TRACKING
    // =========================================================================

    function test_HasCommittedTracking() public {
        uint256 contentId = _submitContent();

        assertFalse(votingEngine.hasCommitted(contentId, 1, voter1), "Should not have committed yet");

        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch = _commitHash(true, salt, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch, _testCiphertext(true, salt, contentId), STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        assertTrue(votingEngine.hasCommitted(contentId, roundId, voter1), "Should have committed");
        assertFalse(votingEngine.hasCommitted(contentId, roundId, voter2), "Voter2 should not have committed");
    }

    function test_CommitCountTracking() public {
        uint256 contentId = _submitContent();

        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch1 = _commitHash(true, s1, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch1, _testCiphertext(true, s1, contentId), STAKE, address(0));
        vm.stopPrank();

        assertEq(votingEngine.getContentCommitCount(contentId), 1, "Content commit count should be 1");

        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, false, uint256(1)));
        bytes32 ch2 = _commitHash(false, s2, contentId);

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch2, _testCiphertext(false, s2, contentId), STAKE, address(0));
        vm.stopPrank();

        assertEq(votingEngine.getContentCommitCount(contentId), 2, "Content commit count should be 2");
    }

    function test_RoundVoterCountAfterReveal() public {
        uint256 contentId = _submitContent();

        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, false, uint256(1)));
        bytes32 s3 = keccak256(abi.encodePacked(voter3, contentId, true, uint256(2)));
        bytes32 ch1 = _commitHash(true, s1, contentId);
        bytes32 ch2 = _commitHash(false, s2, contentId);
        bytes32 ch3 = _commitHash(true, s3, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch1, _testCiphertext(true, s1, contentId), STAKE, address(0));
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch2, _testCiphertext(false, s2, contentId), STAKE, address(0));
        vm.stopPrank();

        vm.startPrank(voter3);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch3, _testCiphertext(true, s3, contentId), STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Voter list is populated during reveal, not commit
        assertEq(votingEngine.getRoundVoterCount(contentId, roundId), 0, "No voters revealed yet");

        vm.warp(block.timestamp + EPOCH_DURATION + 1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), false, s2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter3, ch3), true, s3);

        assertEq(votingEngine.getRoundVoterCount(contentId, roundId), 3, "Should have 3 revealed voters");

        // Verify voter addresses
        assertEq(votingEngine.getRoundVoter(contentId, roundId, 0), voter1);
        assertEq(votingEngine.getRoundVoter(contentId, roundId, 1), voter2);
        assertEq(votingEngine.getRoundVoter(contentId, roundId, 2), voter3);
    }

    // =========================================================================
    // STAKE VALIDATION
    // =========================================================================

    function test_InvalidStakeRejected() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch = _commitHash(true, salt, contentId);

        // Below minimum (1 cREP)
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), 0.5e6);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        votingEngine.commitVote(contentId, ch, _testCiphertext(true, salt, contentId), 0.5e6, address(0));
        vm.stopPrank();

        // Above maximum (100 cREP)
        bytes32 salt2 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(1)));
        bytes32 ch2 = _commitHash(true, salt2, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), 101e6);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        votingEngine.commitVote(contentId, ch2, _testCiphertext(true, salt2, contentId), 101e6, address(0));
        vm.stopPrank();
    }

    // =========================================================================
    // EPOCH-WEIGHTED REWARDS — early blind voters get 4x weight vs informed
    // =========================================================================

    function test_EpochWeighting_Epoch1VoterGetsFullWeight() public {
        uint256 contentId = _submitContent();

        // voter1 commits in epoch-1 (epochIndex=0 → 100% weight)
        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch1 = _commitHash(true, s1, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch1, _testCiphertext(true, s1, contentId), STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        bytes32 ck1 = _commitKey(voter1, ch1);

        // Verify epochIndex = 0 (epoch-1, blind)
        RoundLib.Commit memory commit = votingEngine.getCommit(contentId, roundId, ck1);
        assertEq(commit.epochIndex, 0, "First voter should be in epoch-1 (epochIndex=0)");
        assertEq(commit.stakeAmount, STAKE, "Stake should be recorded correctly");

        // Advance past epoch boundary and reveal
        vm.warp(block.timestamp + EPOCH_DURATION + 1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck1, true, s1);

        // After reveal, effective weighted pool should reflect 100% weight
        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(round.weightedUpPool, STAKE, "Epoch-1 vote should have 100% weight (effectiveStake = stake)");
    }

    function test_EpochWeighting_Epoch2VoterGetsReducedWeight() public {
        uint256 contentId = _submitContent();

        // voter1 commits in epoch-1 (blind)
        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch1 = _commitHash(true, s1, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch1, _testCiphertext(true, s1, contentId), STAKE, address(0));
        vm.stopPrank();

        // Advance into epoch-2 — use absolute time from round.startTime
        // voter2 commits after epoch-1 ends (epoch-2, epochIndex=1 → 25% weight)
        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        RoundLib.Round memory rEW0 = votingEngine.getRound(contentId, roundId);
        vm.warp(rEW0.startTime + EPOCH_DURATION + 1);

        // Reveal voter1's vote to make results visible
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, s1);

        // voter2 commits in epoch-2 (informed, epochIndex=1 → 25% weight)
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, false, uint256(1)));
        bytes32 ch2 = _commitHash(false, s2, contentId);

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch2, _testCiphertext(false, s2, contentId), STAKE, address(0));
        vm.stopPrank();

        bytes32 ck2 = _commitKey(voter2, ch2);
        RoundLib.Commit memory commit2 = votingEngine.getCommit(contentId, roundId, ck2);
        assertEq(commit2.epochIndex, 1, "Second-epoch voter should have epochIndex=1");

        // Reveal voter2's vote after another epoch boundary (absolute: startTime + 2 * EPOCH_DURATION + 2)
        // voter2 committed at startTime+EPOCH_DURATION+1, so revealableAfter = startTime+2*EPOCH_DURATION+1
        vm.warp(rEW0.startTime + 2 * EPOCH_DURATION + 2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck2, false, s2);

        // Verify weighted pools: UP = STAKE (100%), DOWN = STAKE * 2500 / 10000 = STAKE/4
        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(round.weightedUpPool, STAKE, "Epoch-1 UP vote should have 100% weight");
        assertEq(round.weightedDownPool, STAKE * 2500 / 10000, "Epoch-2 DOWN vote should have 25% weight");

        // UP wins despite equal raw stakes (epoch-weighting penalises late voter)
        votingEngine.settleRound(contentId, roundId);

        RoundLib.Round memory settled = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(settled.state), uint256(RoundLib.RoundState.Settled), "Should be settled");
        assertTrue(settled.upWins, "UP should win due to epoch-1 weight advantage");
    }

    // =========================================================================
    // SETTLEMENT VIA settleRound — can settle immediately after minVoters revealed
    // =========================================================================

    function test_SettleRound_ImmediatelyAfterReveals() public {
        uint256 contentId = _submitContent();

        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, false, uint256(1)));
        bytes32 ch1 = _commitHash(true, s1, contentId);
        bytes32 ch2 = _commitHash(false, s2, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch1, _testCiphertext(true, s1, contentId), STAKE, address(0));
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch2, _testCiphertext(false, s2, contentId), STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = votingEngine.getActiveRoundId(contentId);

        // Reveal after epoch boundary (absolute)
        RoundLib.Round memory rSR0 = votingEngine.getRound(contentId, roundId);
        vm.warp(rSR0.startTime + EPOCH_DURATION + 1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), false, s2);

        // Settlement can happen immediately after threshold reached
        votingEngine.settleRound(contentId, roundId);

        assertEq(
            uint256(votingEngine.getRound(contentId, roundId).state),
            uint256(RoundLib.RoundState.Tied),
            "Should be tied"
        );
    }

    // =========================================================================
    // TRY-CATCH SETTLEMENT RESILIENCE
    // =========================================================================

    function test_SettlementSucceedsWithoutParticipationPool() public {
        uint256 contentId = _submitContent();

        address[] memory voters = new address[](3);
        voters[0] = voter1;
        voters[1] = voter2;
        voters[2] = voter3;
        bool[] memory dirs = new bool[](3);
        dirs[0] = true;
        dirs[1] = true;
        dirs[2] = false;

        uint256 roundId = _settleRoundWith(voters, contentId, dirs, STAKE);

        assertEq(
            uint256(votingEngine.getRound(contentId, roundId).state),
            uint256(RoundLib.RoundState.Settled),
            "Settlement should succeed without participation pool"
        );
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
        frontendReg.setVotingEngine(address(votingEngine));
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
    function _settleRoundWithFrontend(address frontend) internal returns (uint256 contentId, uint256 roundId) {
        contentId = _submitContent();

        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, true, uint256(1)));
        bytes32 s3 = keccak256(abi.encodePacked(voter3, contentId, false, uint256(2)));
        bytes32 ch1 = _commitHash(true, s1, contentId);
        bytes32 ch2 = _commitHash(true, s2, contentId);
        bytes32 ch3 = _commitHash(false, s3, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch1, _testCiphertext(true, s1, contentId), STAKE, frontend);
        vm.stopPrank();

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch2, _testCiphertext(true, s2, contentId), STAKE, frontend);
        vm.stopPrank();

        vm.startPrank(voter3);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch3, _testCiphertext(false, s3, contentId), STAKE, frontend);
        vm.stopPrank();

        roundId = votingEngine.getActiveRoundId(contentId);

        RoundLib.Round memory rFW0 = votingEngine.getRound(contentId, roundId);
        vm.warp(rFW0.startTime + EPOCH_DURATION + 1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), true, s2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter3, ch3), false, s3);

        votingEngine.settleRound(contentId, roundId);
    }

    function test_ClaimFrontendFee_HappyPath() public {
        (, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        // Frontend pool should be set
        uint256 frontendPool = votingEngine.roundFrontendPool(contentId, roundId);
        assertGt(frontendPool, 0, "Frontend pool should be > 0");

        // Claim frontend fee
        votingEngine.claimFrontendFee(contentId, roundId, frontendOp);

        // Verify fee was credited
        assertTrue(votingEngine.frontendFeeClaimed(contentId, roundId, frontendOp));
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

    function test_ClaimFrontendFee_RevertsWhileFrontendIsDeregistered() public {
        (FrontendRegistry frontendReg, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        vm.prank(frontendOp);
        frontendReg.deregister();

        vm.expectRevert("Frontend not registered");
        votingEngine.claimFrontendFee(contentId, roundId, frontendOp);
    }

    function test_ClaimFrontendFee_RevertsWhileFrontendIsSlashed() public {
        (FrontendRegistry frontendReg, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        vm.prank(owner);
        frontendReg.slashFrontend(frontendOp, 100e6, "test");

        vm.expectRevert(FrontendRegistry.FrontendIsSlashed.selector);
        votingEngine.claimFrontendFee(contentId, roundId, frontendOp);
    }

    function test_ClaimFrontendFee_SucceedsAfterFrontendReregistersWithoutReapproval() public {
        (FrontendRegistry frontendReg, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        vm.startPrank(frontendOp);
        frontendReg.deregister();
        crepToken.approve(address(frontendReg), 1000e6);
        frontendReg.register();
        vm.stopPrank();

        votingEngine.claimFrontendFee(contentId, roundId, frontendOp);

        assertTrue(votingEngine.frontendFeeClaimed(contentId, roundId, frontendOp));
        assertGt(frontendReg.getAccumulatedFees(frontendOp), 0, "Re-registered frontend should still receive fees");
        assertFalse(frontendReg.isApproved(frontendOp), "Re-registration should not silently restore approval");
    }

    function test_ClaimFrontendFee_SucceedsAfterFrontendIsUnslashed() public {
        (FrontendRegistry frontendReg, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        vm.startPrank(owner);
        frontendReg.slashFrontend(frontendOp, 100e6, "test");
        frontendReg.unslashFrontend(frontendOp);
        vm.stopPrank();

        votingEngine.claimFrontendFee(contentId, roundId, frontendOp);

        assertTrue(votingEngine.frontendFeeClaimed(contentId, roundId, frontendOp));
        assertGt(frontendReg.getAccumulatedFees(frontendOp), 0, "Unslashed frontend should receive preserved fees");
        assertFalse(frontendReg.isApproved(frontendOp), "Unslashing should not silently restore approval");
    }

    function test_FrontendTrackingGetters_ReturnCommittedStakeAndKeys() public {
        (, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        bytes32[] memory commitKeys = votingEngine.getRoundCommitHashes(contentId, roundId);

        assertEq(commitKeys.length, 3);
        assertEq(votingEngine.roundPerFrontendStake(contentId, roundId, frontendOp), STAKE * 3);
        assertEq(votingEngine.roundStakeWithApprovedFrontend(contentId, roundId), STAKE * 3);
    }

    function test_ClaimFrontendFee_NoApprovedFrontendRedirectsToVoterPool() public {
        // No frontend registry set — 3 voters (2 up, 1 down) to avoid tie
        uint256 contentId = _submitContent();

        address[] memory voters = new address[](3);
        voters[0] = voter1;
        voters[1] = voter2;
        voters[2] = voter3;
        bool[] memory dirs = new bool[](3);
        dirs[0] = true;
        dirs[1] = true;
        dirs[2] = false;

        uint256 roundId = _settleRoundWith(voters, contentId, dirs, STAKE);

        // No frontend pool — redirected to voter pool
        assertEq(votingEngine.roundFrontendPool(contentId, roundId), 0);

        // Voter pool should include the frontend share
        uint256 voterPool = votingEngine.roundVoterPool(contentId, roundId);
        assertGt(voterPool, 0);
    }

    // =========================================================================
    // O(1) SETTLEMENT — PARTICIPATION REWARD CLAIMING
    // =========================================================================

    /// @dev Helper: set up ParticipationPool and settle a round (3 voters: 2 up, 1 down).
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

        address[] memory voters = new address[](3);
        voters[0] = voter1;
        voters[1] = voter2;
        voters[2] = voter3;
        bool[] memory dirs = new bool[](3);
        dirs[0] = true;
        dirs[1] = true;
        dirs[2] = false;

        roundId = _settleRoundWith(voters, contentId, dirs, STAKE);
    }

    function test_ClaimParticipationReward_HappyPath() public {
        (uint256 contentId, uint256 roundId) = _settleRoundWithParticipation();

        // Rate should be snapshotted
        uint256 rate = votingEngine.roundParticipationRateBps(contentId, roundId);
        assertEq(rate, 9000, "Rate should be 90% (tier 0)");

        // Claim participation reward
        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        votingEngine.claimParticipationReward(contentId, roundId);
        uint256 balAfter = crepToken.balanceOf(voter1);

        uint256 expectedReward = STAKE * 9000 / 10000;
        assertEq(balAfter - balBefore, expectedReward, "Should receive 90% of stake as participation reward");
        assertTrue(votingEngine.participationRewardClaimed(contentId, roundId, voter1));
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

        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch = _commitHash(true, salt, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, ch, _testCiphertext(true, salt, contentId), STAKE, address(0));
        vm.stopPrank();

        // Round is Open, not Settled
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.RoundNotSettled.selector);
        votingEngine.claimParticipationReward(contentId, 1);
    }

    function test_SettlementSideEffectFailure_ParticipationRateSnapshotLeavesRewardsUnclaimable() public {
        RevertingParticipationPool badPool = new RevertingParticipationPool();
        vm.prank(owner);
        votingEngine.setParticipationPool(address(badPool));

        uint256 contentId = _submitContent();
        address[] memory voters = new address[](3);
        voters[0] = voter1;
        voters[1] = voter2;
        voters[2] = voter3;
        bool[] memory dirs = new bool[](3);
        dirs[0] = true;
        dirs[1] = true;
        dirs[2] = false;

        _commitAllThenReveal(voters, contentId, dirs, STAKE);
        uint256 roundId = _getActiveOrLatestRoundId(contentId);

        vm.recordLogs();
        votingEngine.settleRound(contentId, roundId);

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 expectedSig = keccak256("SettlementSideEffectFailed(uint256,uint256,uint8)");
        bool foundFailureEvent = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (
                logs[i].topics.length == 3 && logs[i].topics[0] == expectedSig
                    && logs[i].topics[1] == bytes32(contentId) && logs[i].topics[2] == bytes32(roundId)
                    && abi.decode(logs[i].data, (uint8)) == 5
            ) {
                foundFailureEvent = true;
                break;
            }
        }

        assertTrue(foundFailureEvent, "participation rate failure should be logged");
        assertEq(votingEngine.roundParticipationRateBps(contentId, roundId), 0);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.NoParticipationRate.selector);
        votingEngine.claimParticipationReward(contentId, roundId);
    }

    // =========================================================================
    // SET PARTICIPATION POOL UPDATABILITY
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
}
