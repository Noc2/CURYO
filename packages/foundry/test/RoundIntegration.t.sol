// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { Vm } from "forge-std/Test.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { RatingLib } from "../contracts/libraries/RatingLib.sol";
import { RoundSettlementSideEffectsLib } from "../contracts/libraries/RoundSettlementSideEffectsLib.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { HumanReputation } from "../contracts/HumanReputation.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { IFrontendRegistry } from "../contracts/interfaces/IFrontendRegistry.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";

contract RevertingParticipationPool {
    IERC20 public immutable token;

    constructor(address _token) {
        token = IERC20(_token);
    }

    function getCurrentRateBps() external pure returns (uint256) {
        revert("rate unavailable");
    }

    function distributeReward(address voter, uint256 amount) public returns (uint256 paidAmount) {
        uint256 balance = token.balanceOf(address(this));
        paidAmount = amount > balance ? balance : amount;
        if (paidAmount > 0) {
            token.transfer(voter, paidAmount);
        }
    }
}

/// @title Round-based integration tests for tlock commit-reveal flow with epoch-weighted rewards.
/// @dev Covers: full lifecycle, multi-voter, concurrent rounds, tied rounds,
///      cancelled/expired rounds, consensus settlement, config snapshots.
///      Uses fake AGE-armored test ciphertexts, not real drand/tlock payloads.
contract RoundIntegrationTest is VotingTestBase {
    HumanReputation public hrepToken;
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

    uint256 public constant STAKE = 5e6; // 5 HREP

    // Short epoch duration for tests (10 minutes — above the 5-minute minimum)
    uint256 public constant EPOCH_DURATION = 10 minutes;

    function _tlockDrandChainHash() internal pure override returns (bytes32) {
        return DEFAULT_DRAND_CHAIN_HASH;
    }

    function _tlockDrandGenesisTime() internal pure override returns (uint64) {
        return DEFAULT_DRAND_GENESIS_TIME;
    }

    function _tlockDrandPeriod() internal pure override returns (uint64) {
        return DEFAULT_DRAND_PERIOD;
    }

    function _tlockEpochDuration() internal view override returns (uint256) {
        return activeTlockEpochDuration;
    }

    function setUp() public {
        // Set a predictable start time
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

        // Foundry tests use fake AGE-armored payloads here rather than real drand/tlock ciphertexts.
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

        registry.setVotingEngine(address(votingEngine));
        registry.setProtocolConfig(address(votingEngine.protocolConfig()));
        MockCategoryRegistry mockCategoryRegistry = new MockCategoryRegistry();
        mockCategoryRegistry.seedDefaultTestCategories();
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(votingEngine.protocolConfig())).setRewardDistributor(address(rewardDistributor));
        ProtocolConfig(address(votingEngine.protocolConfig())).setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(votingEngine.protocolConfig())).setTreasury(treasury);
        _setTlockDrandConfig(
            ProtocolConfig(address(votingEngine.protocolConfig())),
            DEFAULT_DRAND_CHAIN_HASH,
            DEFAULT_DRAND_GENESIS_TIME,
            DEFAULT_DRAND_PERIOD
        );

        // setConfig(epochDuration, maxDuration, minVoters, maxVoters)
        // Use short 10-minute epochs for tests, minVoters=2 to keep tests lean
        _setTlockRoundConfig(ProtocolConfig(address(votingEngine.protocolConfig())), EPOCH_DURATION, 7 days, 2, 200);

        // Fund consensus reserve
        uint256 reserveAmount = 1_000_000e6;
        hrepToken.mint(owner, reserveAmount);
        hrepToken.approve(address(votingEngine), reserveAmount);
        votingEngine.addToConsensusReserve(reserveAmount);

        // Mint HREP to all test users
        address[7] memory users = [submitter, voter1, voter2, voter3, voter4, voter5, voter6];
        for (uint256 i = 0; i < users.length; i++) {
            hrepToken.mint(users[i], 10_000e6);
        }

        vm.stopPrank();
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _submitContent() internal returns (uint256 contentId) {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "test goal", "test goal", "test", 0);
        vm.stopPrank();
        contentId = 1;
    }

    /// @dev Submit content with a unique URL suffix to avoid duplicate-URL conflicts.
    function _submitContentN(uint256 n) internal returns (uint256 contentId) {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        string memory url = string(abi.encodePacked("https://example.com/", vm.toString(n)));
        _submitContentWithReservation(registry, url, "test goal", "test goal", "test", 0);
        vm.stopPrank();
        contentId = n;
    }

    /// @dev Commit + reveal a vote for a voter in a single epoch boundary.
    ///      The commit is recorded, then time advances past EPOCH_DURATION, then the vote is revealed.
    function _commitAndReveal(address voter, uint256 contentId, bool isUp, uint256 stakeAmount) internal {
        bytes32 salt = keccak256(abi.encodePacked(voter, contentId, isUp));
        bytes32 ch = _commitHash(isUp, salt, voter, contentId);
        bytes memory ct = _testCiphertext(isUp, salt, contentId);

        vm.startPrank(voter);
        hrepToken.approve(address(votingEngine), stakeAmount);
        uint256 cachedRoundContext1 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext1,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch,
            ct,
            stakeAmount,
            address(0)
        );
        vm.stopPrank();

        // Advance time past epoch boundary so vote becomes revealable
        _warpPastTlockRevealTime(block.timestamp + EPOCH_DURATION);

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
        return _commitWithSalt(voter, contentId, isUp, stakeAmount, salt);
    }

    function _commitWithSalt(address voter, uint256 contentId, bool isUp, uint256 stakeAmount, bytes32 salt)
        internal
        returns (bytes32 ch, bytes32 ck)
    {
        return _commitWithSaltAndFrontend(voter, contentId, isUp, stakeAmount, salt, address(0));
    }

    function _commitWithSaltAndFrontend(
        address voter,
        uint256 contentId,
        bool isUp,
        uint256 stakeAmount,
        bytes32 salt,
        address frontend
    ) internal returns (bytes32 ch, bytes32 ck) {
        ch = _commitHash(isUp, salt, voter, contentId);
        bytes memory ct = _testCiphertext(isUp, salt, contentId);

        vm.startPrank(voter);
        hrepToken.approve(address(votingEngine), stakeAmount);
        uint256 cachedRoundContext2 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext2,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch,
            ct,
            stakeAmount,
            frontend
        );
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

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        // If no active round yet, it will be created on first commit
        bool roundCreated = roundId > 0;

        for (uint256 i = 0; i < voters.length; i++) {
            salts[i] = keccak256(abi.encodePacked(voters[i], contentId, directions[i], i));
            commitHashes[i] = _commitHash(directions[i], salts[i], voters[i], contentId);
            bytes memory ct = _testCiphertext(directions[i], salts[i], contentId);

            vm.startPrank(voters[i]);
            hrepToken.approve(address(votingEngine), stakeAmount);
            uint256 cachedRoundContext3 =
                _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
            votingEngine.commitVote(
                contentId,
                cachedRoundContext3,
                _tlockCommitTargetRound(),
                _tlockDrandChainHash(),
                commitHashes[i],
                ct,
                stakeAmount,
                address(0)
            );
            vm.stopPrank();

            commitKeys[i] = _commitKey(voters[i], commitHashes[i]);
            if (!roundCreated) {
                roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
                roundCreated = true;
            }
        }

        // Advance past the epoch boundary and the selected drand target round.
        vm.warp(block.timestamp + EPOCH_DURATION + _tlockDrandPeriod() + 1);

        for (uint256 i = 0; i < voters.length; i++) {
            votingEngine.revealVoteByCommitKey(contentId, roundId, commitKeys[i], directions[i], salts[i]);
        }
    }

    /// @dev Returns the active round ID; if 0 (terminal), falls back to the last created round.
    function _getActiveOrLatestRoundId(uint256 contentId) internal view returns (uint256) {
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        if (roundId == 0) {
            // Round closed between commit and reveal — use last created round
            roundId = RoundEngineReadHelpers.latestRoundId(votingEngine, contentId);
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
            commitHashes[i] = _commitHash(dirs[i], salts[i], voters[i], contentId);
            bytes memory ct = _testCiphertext(dirs[i], salts[i], contentId);

            vm.startPrank(voters[i]);
            hrepToken.approve(address(votingEngine), STAKE);
            uint256 cachedRoundContext4 =
                _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
            votingEngine.commitVote(
                contentId,
                cachedRoundContext4,
                _tlockCommitTargetRound(),
                _tlockDrandChainHash(),
                commitHashes[i],
                ct,
                STAKE,
                address(0)
            );
            vm.stopPrank();

            commitKeys[i] = _commitKey(voters[i], commitHashes[i]);
        }

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        assertEq(roundId, 1, "Round 1 should be active after commits");

        // Verify round state after commits
        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        assertEq(round.voteCount, 3, "Should have 3 committed votes");

        // Advance past epoch boundary and reveal all
        _warpPastTlockRevealTime(block.timestamp + EPOCH_DURATION);
        for (uint256 i = 0; i < 3; i++) {
            votingEngine.revealVoteByCommitKey(contentId, roundId, commitKeys[i], dirs[i], salts[i]);
        }

        // Check round after reveals
        round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        assertEq(round.revealedCount, 3, "Should have 3 revealed votes");
        assertEq(round.upPool, 2 * STAKE, "UP raw pool should be 2x");
        assertEq(round.downPool, STAKE, "DOWN raw pool should be 1x");
        assertEq(round.upCount, 2, "UP count should be 2");
        assertEq(round.downCount, 1, "DOWN count should be 1");
        assertGt(round.thresholdReachedAt, 0, "Threshold should have been reached");

        votingEngine.settleRound(contentId, roundId);

        round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled), "Round should be settled");
        assertTrue(round.upWins, "UP should win");

        // Winner claims reward
        uint256 balBefore = hrepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        assertGt(hrepToken.balanceOf(voter1), balBefore, "Winner should receive reward");

        // Loser claims the fixed 5% rebate
        uint256 loserBal = hrepToken.balanceOf(voter3);
        vm.prank(voter3);
        rewardDistributor.claimReward(contentId, roundId);
        assertEq(hrepToken.balanceOf(voter3) - loserBal, STAKE / 20, "Loser should receive 5% rebate");
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

        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled), "Round should be settled");
        assertFalse(round.upWins, "DOWN should win");

        // DOWN voter (winner) claims reward
        uint256 balBefore = hrepToken.balanceOf(voter2);
        vm.prank(voter2);
        rewardDistributor.claimReward(contentId, roundId);
        assertGt(hrepToken.balanceOf(voter2), balBefore, "DOWN winner should receive reward");

        // UP voter (loser) gets the fixed 5% rebate
        uint256 upBal = hrepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        assertEq(hrepToken.balanceOf(voter1) - upBal, STAKE / 20, "UP loser should receive 5% rebate");
    }

    function test_MultipleVoters_BothWinnersClaimProportionally() public {
        uint256 contentId = _submitContent();

        // voter1: 10 HREP UP, voter2: 5 HREP UP, voter3: 5 HREP DOWN
        // All vote in epoch-1 (blind) → effectiveStake = stakeAmount * 10000 / 10000 = stakeAmount
        // voter1 effective = 10e6, voter2 effective = 5e6; voter1 gets more reward
        bytes32 salt1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 salt2 = keccak256(abi.encodePacked(voter2, contentId, true, uint256(1)));
        bytes32 salt3 = keccak256(abi.encodePacked(voter3, contentId, false, uint256(2)));

        bytes32 ch1 = _commitHash(true, salt1, voter1, contentId);
        bytes32 ch2 = _commitHash(true, salt2, voter2, contentId);
        bytes32 ch3 = _commitHash(false, salt3, voter3, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), 10e6);
        uint256 cachedRoundContext5 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext5,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1,
            _testCiphertext(true, salt1, contentId),
            10e6,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter2);
        hrepToken.approve(address(votingEngine), 5e6);
        uint256 cachedRoundContext6 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext6,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2,
            _testCiphertext(true, salt2, contentId),
            5e6,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter3);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext7 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext7,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch3,
            _testCiphertext(false, salt3, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);

        RoundLib.Round memory rMV0 = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(rMV0.startTime) + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, salt1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), true, salt2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter3, ch3), false, salt3);

        votingEngine.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        assertTrue(round.upWins, "UP should win");

        // Both winners claim
        uint256 bal1Before = hrepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        uint256 reward1 = hrepToken.balanceOf(voter1) - bal1Before;

        uint256 bal2Before = hrepToken.balanceOf(voter2);
        vm.prank(voter2);
        rewardDistributor.claimReward(contentId, roundId);
        uint256 reward2 = hrepToken.balanceOf(voter2) - bal2Before;

        // Both should get rewards; voter1 staked more (higher effective stake) → more reward
        assertGt(reward1, 0, "Voter1 should receive reward");
        assertGt(reward2, 0, "Voter2 should receive reward");
        assertGt(reward1, reward2, "Voter1 (larger stake) should receive more");
    }

    function test_MultipleWinners_FinalClaimantReceivesVoterPoolRemainder() public {
        uint256 contentId = _submitContent();
        uint256 stake1 = 1_000_001;
        uint256 stake2 = 1_000_000;
        uint256 stake3 = 1_000_000;

        bytes32 salt1 = keccak256(abi.encodePacked("dust", voter1, contentId));
        bytes32 salt2 = keccak256(abi.encodePacked("dust", voter2, contentId));
        bytes32 salt3 = keccak256(abi.encodePacked("dust", voter3, contentId));

        (, bytes32 ck1) = _commitWithSalt(voter1, contentId, true, stake1, salt1);
        (, bytes32 ck2) = _commitWithSalt(voter2, contentId, true, stake2, salt2);
        (, bytes32 ck3) = _commitWithSalt(voter3, contentId, false, stake3, salt3);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);

        RoundLib.Round memory openRound = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(openRound.startTime) + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck1, true, salt1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck2, true, salt2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck3, false, salt3);

        votingEngine.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        assertTrue(round.upWins, "UP should win");

        uint256 voterPool = votingEngine.roundVoterPool(contentId, roundId);

        uint256 bal1Before = hrepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        uint256 reward1 = hrepToken.balanceOf(voter1) - bal1Before - stake1;

        uint256 bal2Before = hrepToken.balanceOf(voter2);
        vm.prank(voter2);
        rewardDistributor.claimReward(contentId, roundId);
        uint256 reward2 = hrepToken.balanceOf(voter2) - bal2Before - stake2;

        assertEq(reward1 + reward2, voterPool, "winner rewards should exhaust voter pool");
        assertEq(rewardDistributor.roundVoterRewardClaimedCount(contentId, roundId), 2);
        assertEq(rewardDistributor.roundVoterRewardClaimedAmount(contentId, roundId), voterPool);

        uint256 loserBefore = hrepToken.balanceOf(voter3);
        vm.prank(voter3);
        rewardDistributor.claimReward(contentId, roundId);
        assertEq(hrepToken.balanceOf(voter3) - loserBefore, stake3 / 20, "loser should receive fixed rebate");

        assertEq(
            hrepToken.balanceOf(address(votingEngine)),
            votingEngine.consensusReserve(),
            "engine should not retain voter reward dust"
        );
    }

    function test_LoserRebate_LastLoserReceivesRoundingRemainder() public {
        uint256 contentId = _submitContent();
        uint256 winnerStake = 4_000_000;
        uint256 loserStake = 1_000_019;

        bytes32 salt1 = keccak256("winner");
        bytes32 salt2 = keccak256("loser-1");
        bytes32 salt3 = keccak256("loser-2");
        bytes32 salt4 = keccak256("loser-3");

        (, bytes32 ck1) = _commitWithSalt(voter1, contentId, true, winnerStake, salt1);
        (, bytes32 ck2) = _commitWithSalt(voter2, contentId, false, loserStake, salt2);
        (, bytes32 ck3) = _commitWithSalt(voter3, contentId, false, loserStake, salt3);
        (, bytes32 ck4) = _commitWithSalt(voter4, contentId, false, loserStake, salt4);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        RoundLib.Round memory openRound = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(openRound.startTime) + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck1, true, salt1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck2, false, salt2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck3, false, salt3);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck4, false, salt4);

        votingEngine.settleRound(contentId, roundId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        assertTrue(round.upWins, "UP should win");

        uint256 individualRebate = (loserStake * 500) / 10_000;
        uint256 aggregateRebate = ((loserStake * 3) * 500) / 10_000;

        uint256 loser2Before = hrepToken.balanceOf(voter2);
        vm.prank(voter2);
        rewardDistributor.claimReward(contentId, roundId);
        assertEq(hrepToken.balanceOf(voter2) - loser2Before, individualRebate);

        uint256 loser3Before = hrepToken.balanceOf(voter3);
        vm.prank(voter3);
        rewardDistributor.claimReward(contentId, roundId);
        assertEq(hrepToken.balanceOf(voter3) - loser3Before, individualRebate);

        uint256 loser4Before = hrepToken.balanceOf(voter4);
        vm.prank(voter4);
        rewardDistributor.claimReward(contentId, roundId);
        assertEq(hrepToken.balanceOf(voter4) - loser4Before, aggregateRebate - (individualRebate * 2));
        assertEq(rewardDistributor.roundLoserRebateClaimedCount(contentId, roundId), 3);
        assertEq(rewardDistributor.roundLoserRebateClaimedAmount(contentId, roundId), aggregateRebate);
    }

    function test_FinalizeVoterRewardDust_RoutesOnlyRoundingDustAfterDelay() public {
        uint256 contentId = _submitContent();
        uint256 stake1 = 1_000_001;
        uint256 stake2 = 1_000_000;
        uint256 stake3 = 1_000_000;

        bytes32 salt1 = keccak256(abi.encodePacked("stale-dust", voter1, contentId));
        bytes32 salt2 = keccak256(abi.encodePacked("stale-dust", voter2, contentId));
        bytes32 salt3 = keccak256(abi.encodePacked("stale-dust", voter3, contentId));

        (, bytes32 ck1) = _commitWithSalt(voter1, contentId, true, stake1, salt1);
        (, bytes32 ck2) = _commitWithSalt(voter2, contentId, true, stake2, salt2);
        (, bytes32 ck3) = _commitWithSalt(voter3, contentId, false, stake3, salt3);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);

        RoundLib.Round memory openRound = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(openRound.startTime) + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck1, true, salt1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck2, true, salt2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck3, false, salt3);

        votingEngine.settleRound(contentId, roundId);

        address[] memory winners = new address[](2);
        winners[0] = voter1;
        winners[1] = voter2;

        vm.expectRevert(RoundRewardDistributor.RewardFinalizationTooEarly.selector);
        rewardDistributor.finalizeVoterRewardDust(contentId, roundId, winners);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        vm.warp(uint256(round.settledAt) + rewardDistributor.STALE_REWARD_FINALIZATION_DELAY());

        uint256 voterPool = votingEngine.roundVoterPool(contentId, roundId);
        uint256 treasuryBefore = hrepToken.balanceOf(treasury);

        uint256 releasedDust = rewardDistributor.finalizeVoterRewardDust(contentId, roundId, winners);

        assertEq(releasedDust, 1, "only mathematical voter reward dust should be finalized");
        assertEq(hrepToken.balanceOf(treasury), treasuryBefore + releasedDust, "dust should route to protocol");
        assertTrue(rewardDistributor.roundVoterRewardDustFinalized(contentId, roundId));

        uint256 bal1Before = hrepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        uint256 reward1 = hrepToken.balanceOf(voter1) - bal1Before - stake1;

        uint256 bal2Before = hrepToken.balanceOf(voter2);
        vm.prank(voter2);
        rewardDistributor.claimReward(contentId, roundId);
        uint256 reward2 = hrepToken.balanceOf(voter2) - bal2Before - stake2;

        assertEq(reward1 + reward2 + releasedDust, voterPool, "finalized dust should not reduce base shares");
        assertEq(rewardDistributor.roundVoterRewardClaimedAmount(contentId, roundId), voterPool);
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
        bytes32 ch1a = _commitHash(true, s1a, voter1, contentId1);
        bytes32 ch1b = _commitHash(false, s1b, voter2, contentId1);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext8 =
            _roundContext(votingEngine.previewCommitRoundId(contentId1), _currentRatingReferenceBps(contentId1));
        votingEngine.commitVote(
            contentId1,
            cachedRoundContext8,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1a,
            _testCiphertext(true, s1a, contentId1),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter2);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext9 =
            _roundContext(votingEngine.previewCommitRoundId(contentId1), _currentRatingReferenceBps(contentId1));
        votingEngine.commitVote(
            contentId1,
            cachedRoundContext9,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1b,
            _testCiphertext(false, s1b, contentId1),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        // Commit on content 2
        bytes32 s2a = keccak256(abi.encodePacked(voter3, contentId2, true, uint256(2)));
        bytes32 s2b = keccak256(abi.encodePacked(voter4, contentId2, false, uint256(3)));
        bytes32 ch2a = _commitHash(true, s2a, voter3, contentId2);
        bytes32 ch2b = _commitHash(false, s2b, voter4, contentId2);

        vm.startPrank(voter3);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext10 =
            _roundContext(votingEngine.previewCommitRoundId(contentId2), _currentRatingReferenceBps(contentId2));
        votingEngine.commitVote(
            contentId2,
            cachedRoundContext10,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2a,
            _testCiphertext(true, s2a, contentId2),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter4);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext11 =
            _roundContext(votingEngine.previewCommitRoundId(contentId2), _currentRatingReferenceBps(contentId2));
        votingEngine.commitVote(
            contentId2,
            cachedRoundContext11,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2b,
            _testCiphertext(false, s2b, contentId2),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 round1 = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId1);
        uint256 round2 = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId2);
        assertEq(round1, 1, "Content 1 should have round 1");
        assertEq(round2, 1, "Content 2 should have round 1");

        // Reveal and settle both rounds together
        RoundLib.Round memory rCC0 = RoundEngineReadHelpers.round(votingEngine, contentId1, round1);
        _warpPastTlockRevealTime(uint256(rCC0.startTime) + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId1, round1, _commitKey(voter1, ch1a), true, s1a);
        votingEngine.revealVoteByCommitKey(contentId1, round1, _commitKey(voter2, ch1b), false, s1b);
        votingEngine.revealVoteByCommitKey(contentId2, round2, _commitKey(voter3, ch2a), true, s2a);
        votingEngine.revealVoteByCommitKey(contentId2, round2, _commitKey(voter4, ch2b), false, s2b);

        // Settle content 1
        votingEngine.settleRound(contentId1, round1);
        RoundLib.Round memory r1 = RoundEngineReadHelpers.round(votingEngine, contentId1, round1);
        assertEq(uint256(r1.state), uint256(RoundLib.RoundState.Tied), "Content 1 round should be tied (equal stakes)");

        // Settle content 2 independently
        votingEngine.settleRound(contentId2, round2);
        RoundLib.Round memory r2 = RoundEngineReadHelpers.round(votingEngine, contentId2, round2);
        assertEq(uint256(r2.state), uint256(RoundLib.RoundState.Tied), "Content 2 round should be tied");
    }

    function test_ConcurrentRoundsSettleIndependently() public {
        uint256 contentId1 = _submitContentN(1);

        // Commit on content 1: 2 UP, 1 DOWN → UP wins
        bytes32 s1a = keccak256(abi.encodePacked(voter1, contentId1, true, uint256(0)));
        bytes32 s1b = keccak256(abi.encodePacked(voter2, contentId1, false, uint256(1)));
        bytes32 s1c = keccak256(abi.encodePacked(voter3, contentId1, true, uint256(2)));
        bytes32 ch1a = _commitHash(true, s1a, voter1, contentId1);
        bytes32 ch1b = _commitHash(false, s1b, voter2, contentId1);
        bytes32 ch1c = _commitHash(true, s1c, voter3, contentId1);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext12 =
            _roundContext(votingEngine.previewCommitRoundId(contentId1), _currentRatingReferenceBps(contentId1));
        votingEngine.commitVote(
            contentId1,
            cachedRoundContext12,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1a,
            _testCiphertext(true, s1a, contentId1),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter2);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext13 =
            _roundContext(votingEngine.previewCommitRoundId(contentId1), _currentRatingReferenceBps(contentId1));
        votingEngine.commitVote(
            contentId1,
            cachedRoundContext13,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1b,
            _testCiphertext(false, s1b, contentId1),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter3);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext14 =
            _roundContext(votingEngine.previewCommitRoundId(contentId1), _currentRatingReferenceBps(contentId1));
        votingEngine.commitVote(
            contentId1,
            cachedRoundContext14,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1c,
            _testCiphertext(true, s1c, contentId1),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        // Submit content 2 a bit later
        vm.warp(block.timestamp + 5 minutes);
        uint256 contentId2 = _submitContentN(2);

        bytes32 s2a = keccak256(abi.encodePacked(voter4, contentId2, true, uint256(3)));
        bytes32 s2b = keccak256(abi.encodePacked(voter5, contentId2, false, uint256(4)));
        bytes32 ch2a = _commitHash(true, s2a, voter4, contentId2);
        bytes32 ch2b = _commitHash(false, s2b, voter5, contentId2);

        vm.startPrank(voter4);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext15 =
            _roundContext(votingEngine.previewCommitRoundId(contentId2), _currentRatingReferenceBps(contentId2));
        votingEngine.commitVote(
            contentId2,
            cachedRoundContext15,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2a,
            _testCiphertext(true, s2a, contentId2),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter5);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext16 =
            _roundContext(votingEngine.previewCommitRoundId(contentId2), _currentRatingReferenceBps(contentId2));
        votingEngine.commitVote(
            contentId2,
            cachedRoundContext16,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2b,
            _testCiphertext(false, s2b, contentId2),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        // Reveal both contents after their epochs end.
        // content1 started at T0=1000, content2 started 5 minutes later at ~1300.
        // To reveal both, warp to the LATER epoch end (content2's epoch end).
        RoundLib.Round memory rCS0_2 = RoundEngineReadHelpers.round(votingEngine, contentId2, 1);
        _warpPastTlockRevealTime(uint256(rCS0_2.startTime) + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId1, 1, _commitKey(voter1, ch1a), true, s1a);
        votingEngine.revealVoteByCommitKey(contentId1, 1, _commitKey(voter2, ch1b), false, s1b);
        votingEngine.revealVoteByCommitKey(contentId1, 1, _commitKey(voter3, ch1c), true, s1c);
        // content2's epoch has also ended by now
        votingEngine.revealVoteByCommitKey(contentId2, 1, _commitKey(voter4, ch2a), true, s2a);
        votingEngine.revealVoteByCommitKey(contentId2, 1, _commitKey(voter5, ch2b), false, s2b);

        // Settle content 1
        votingEngine.settleRound(contentId1, 1);

        RoundLib.Round memory r1 = RoundEngineReadHelpers.round(votingEngine, contentId1, 1);
        assertEq(uint256(r1.state), uint256(RoundLib.RoundState.Settled), "Content 1 should be settled");
        assertTrue(r1.upWins, "UP should win content 1");

        // Settle content 2
        votingEngine.settleRound(contentId2, 1);
        RoundLib.Round memory r2 = RoundEngineReadHelpers.round(votingEngine, contentId2, 1);
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

        bytes32 ch1 = _commitHash(true, s1, voter1, contentId1);
        bytes32 ch2 = _commitHash(false, s2, voter2, contentId1);
        bytes32 ch3 = _commitHash(false, s3, voter1, contentId2);
        bytes32 ch4 = _commitHash(true, s4, voter3, contentId2);

        // voter1 votes UP on content 1
        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext17 =
            _roundContext(votingEngine.previewCommitRoundId(contentId1), _currentRatingReferenceBps(contentId1));
        votingEngine.commitVote(
            contentId1,
            cachedRoundContext17,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1,
            _testCiphertext(true, s1, contentId1),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        // voter2 votes DOWN on content 1
        vm.startPrank(voter2);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext18 =
            _roundContext(votingEngine.previewCommitRoundId(contentId1), _currentRatingReferenceBps(contentId1));
        votingEngine.commitVote(
            contentId1,
            cachedRoundContext18,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2,
            _testCiphertext(false, s2, contentId1),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        // voter1 votes DOWN on content 2
        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext19 =
            _roundContext(votingEngine.previewCommitRoundId(contentId2), _currentRatingReferenceBps(contentId2));
        votingEngine.commitVote(
            contentId2,
            cachedRoundContext19,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch3,
            _testCiphertext(false, s3, contentId2),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        // voter3 votes UP on content 2
        vm.startPrank(voter3);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext20 =
            _roundContext(votingEngine.previewCommitRoundId(contentId2), _currentRatingReferenceBps(contentId2));
        votingEngine.commitVote(
            contentId2,
            cachedRoundContext20,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch4,
            _testCiphertext(true, s4, contentId2),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        // Verify commits are recorded
        assertTrue(
            votingEngine.voterCommitHash(contentId1, 1, voter1) != bytes32(0),
            "Voter1 should have committed on content 1"
        );
        assertTrue(
            votingEngine.voterCommitHash(contentId2, 1, voter1) != bytes32(0),
            "Voter1 should have committed on content 2"
        );
        assertEq(
            votingEngine.voterCommitHash(contentId1, 1, voter3),
            bytes32(0),
            "Voter3 should not have committed on content 1"
        );

        // Reveal all after epoch boundary (absolute)
        RoundLib.Round memory rSV0 = RoundEngineReadHelpers.round(votingEngine, contentId1, 1);
        _warpPastTlockRevealTime(uint256(rSV0.startTime) + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId1, 1, _commitKey(voter1, ch1), true, s1);
        votingEngine.revealVoteByCommitKey(contentId1, 1, _commitKey(voter2, ch2), false, s2);
        votingEngine.revealVoteByCommitKey(contentId2, 1, _commitKey(voter1, ch3), false, s3);
        votingEngine.revealVoteByCommitKey(contentId2, 1, _commitKey(voter3, ch4), true, s4);

        // Settle both
        votingEngine.settleRound(contentId1, 1);
        votingEngine.settleRound(contentId2, 1);

        RoundLib.Round memory r1 = RoundEngineReadHelpers.round(votingEngine, contentId1, 1);
        RoundLib.Round memory r2 = RoundEngineReadHelpers.round(votingEngine, contentId2, 1);
        assertEq(uint256(r1.state), uint256(RoundLib.RoundState.Tied), "Content 1 should be tied");
        assertEq(uint256(r2.state), uint256(RoundLib.RoundState.Tied), "Content 2 should be tied");
    }

    // =========================================================================
    // 5. CANCEL EXPIRED ROUND + REFUND CLAIMS
    // =========================================================================

    function test_CancelExpiredRound_Refund() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch = _commitHash(true, salt, voter1, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext21 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext21,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch,
            _testCiphertext(true, salt, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);

        // Cannot cancel before expiry
        vm.expectRevert(RoundVotingEngine.RoundNotExpired.selector);
        votingEngine.cancelExpiredRound(contentId, roundId);

        // Warp past maxDuration (7 days)
        vm.warp(block.timestamp + 8 days);
        votingEngine.cancelExpiredRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Cancelled), "Round should be cancelled");

        // Voter claims refund
        uint256 balBefore = hrepToken.balanceOf(voter1);
        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(hrepToken.balanceOf(voter1) - balBefore, STAKE, "Voter should get full refund");
    }

    function test_CancelExpiredRound_MultipleVotersCannotCancelAfterCommitQuorum() public {
        uint256 contentId = _submitContent();

        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, false, uint256(1)));
        bytes32 ch1 = _commitHash(true, s1, voter1, contentId);
        bytes32 ch2 = _commitHash(false, s2, voter2, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext22 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext22,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1,
            _testCiphertext(true, s1, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter2);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext23 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext23,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2,
            _testCiphertext(false, s2, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);

        vm.warp(block.timestamp + 8 days);
        vm.expectRevert(RoundVotingEngine.ThresholdReached.selector);
        votingEngine.cancelExpiredRound(contentId, roundId);
    }

    function test_CancelExpiredRound_DoubleRefundReverts() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch = _commitHash(true, salt, voter1, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext24 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext24,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch,
            _testCiphertext(true, salt, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);

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
        bytes32 ch = _commitHash(true, salt, voter1, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext25 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext25,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch,
            _testCiphertext(true, salt, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 round1Id = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);

        vm.warp(block.timestamp + 8 days);
        votingEngine.cancelExpiredRound(contentId, round1Id);
        assertEq(
            uint256(RoundEngineReadHelpers.round(votingEngine, contentId, round1Id).state),
            uint256(RoundLib.RoundState.Cancelled)
        );

        // New commit after cooldown creates round 2
        vm.warp(block.timestamp + 25 hours);
        bytes32 salt2 = keccak256(abi.encodePacked(voter2, contentId, false, uint256(1)));
        bytes32 ch2 = _commitHash(false, salt2, voter2, contentId);

        vm.startPrank(voter2);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext26 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext26,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2,
            _testCiphertext(false, salt2, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        assertEq(RoundEngineReadHelpers.activeRoundId(votingEngine, contentId), 2, "New round should be created");
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

        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
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
        uint256 bal1Before = hrepToken.balanceOf(voter1);
        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(hrepToken.balanceOf(voter1) - bal1Before, STAKE, "Voter1 should get refund from tie");

        uint256 bal2Before = hrepToken.balanceOf(voter2);
        vm.prank(voter2);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(hrepToken.balanceOf(voter2) - bal2Before, STAKE, "Voter2 should get refund from tie");
    }

    function test_TiedRound_DelegatedLockedStakeRefundsStakePayer() public {
        uint256 contentId = _submitContent();

        MockVoterIdNFT voterIdNFT = new MockVoterIdNFT();
        voterIdNFT.setHolder(voter1);
        voterIdNFT.setHolder(voter2);
        vm.prank(voter1);
        voterIdNFT.setDelegate(voter4);

        ProtocolConfig cfg = ProtocolConfig(address(votingEngine.protocolConfig()));
        vm.prank(owner);
        cfg.setVoterIdNFT(address(voterIdNFT));
        vm.startPrank(owner);
        hrepToken.setGovernor(owner);
        hrepToken.setContentVotingContracts(address(votingEngine), address(registry));
        hrepToken.lockForGovernance(voter4, STAKE);
        vm.stopPrank();

        uint256 holderBalanceBefore = hrepToken.balanceOf(voter1);
        uint256 stakePayerBalanceBefore = hrepToken.balanceOf(voter4);

        address[] memory voters = new address[](2);
        voters[0] = voter4;
        voters[1] = voter2;
        bool[] memory dirs = new bool[](2);
        dirs[0] = true;
        dirs[1] = false;

        uint256 roundId = _settleRoundWith(voters, contentId, dirs, STAKE);
        assertEq(hrepToken.balanceOf(voter4), stakePayerBalanceBefore - STAKE, "stake payer should fund delegated vote");

        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);

        assertEq(hrepToken.balanceOf(voter1), holderBalanceBefore, "Voter ID holder should not receive payer stake");
        assertEq(hrepToken.balanceOf(voter4), stakePayerBalanceBefore, "stake payer should receive HREP refund");
        assertEq(hrepToken.getLockedBalance(voter4), STAKE, "governance lock remains active");
    }

    function test_TiedRound_RemovedDelegateCanClaimOwnStakeRefund() public {
        uint256 contentId = _submitContent();

        MockVoterIdNFT voterIdNFT = new MockVoterIdNFT();
        voterIdNFT.setHolder(voter1);
        voterIdNFT.setHolder(voter2);
        vm.prank(voter1);
        voterIdNFT.setDelegate(voter4);

        ProtocolConfig cfg = ProtocolConfig(address(votingEngine.protocolConfig()));
        vm.prank(owner);
        cfg.setVoterIdNFT(address(voterIdNFT));

        address[] memory voters = new address[](2);
        voters[0] = voter4;
        voters[1] = voter2;
        bool[] memory dirs = new bool[](2);
        dirs[0] = true;
        dirs[1] = false;

        uint256 roundId = _settleRoundWith(voters, contentId, dirs, STAKE);
        vm.prank(voter1);
        voterIdNFT.removeDelegate();

        uint256 stakePayerBalanceBefore = hrepToken.balanceOf(voter4);
        vm.prank(voter4);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(hrepToken.balanceOf(voter4) - stakePayerBalanceBefore, STAKE);
    }

    function test_SettledRound_RemovedDelegateCanClaimOwnReward() public {
        uint256 contentId = _submitContent();

        MockVoterIdNFT voterIdNFT = new MockVoterIdNFT();
        voterIdNFT.setHolder(voter1);
        voterIdNFT.setHolder(voter2);
        voterIdNFT.setHolder(voter3);
        vm.prank(voter1);
        voterIdNFT.setDelegate(voter4);

        ProtocolConfig cfg = ProtocolConfig(address(votingEngine.protocolConfig()));
        vm.prank(owner);
        cfg.setVoterIdNFT(address(voterIdNFT));

        address[] memory voters = new address[](3);
        voters[0] = voter4;
        voters[1] = voter2;
        voters[2] = voter3;
        bool[] memory dirs = new bool[](3);
        dirs[0] = true;
        dirs[1] = true;
        dirs[2] = false;

        uint256 roundId = _settleRoundWith(voters, contentId, dirs, STAKE);
        vm.prank(voter1);
        voterIdNFT.removeDelegate();

        uint256 stakePayerBalanceBefore = hrepToken.balanceOf(voter4);
        vm.prank(voter4);
        rewardDistributor.claimReward(contentId, roundId);
        assertGt(hrepToken.balanceOf(voter4), stakePayerBalanceBefore);
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
        assertEq(RoundEngineReadHelpers.activeRoundId(votingEngine, contentId), 0, "No active round after tie");

        // New commit after cooldown creates round 2
        vm.warp(block.timestamp + 25 hours);
        bytes32 salt = keccak256(abi.encodePacked(voter3, contentId, true, uint256(99)));
        bytes32 ch = _commitHash(true, salt, voter3, contentId);

        vm.startPrank(voter3);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext27 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext27,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch,
            _testCiphertext(true, salt, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        assertEq(RoundEngineReadHelpers.activeRoundId(votingEngine, contentId), 2, "Round 2 should be created");
    }

    // =========================================================================
    // 7. CONSENSUS SETTLEMENT (unanimous voting — no opposing side)
    // =========================================================================

    function test_ConsensusSettlement_OnlyUpVoters() public {
        uint256 contentId = _submitContent();

        // Only UP voters, no DOWN — still need ≥minVoters revealed
        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, true, uint256(1)));
        bytes32 ch1 = _commitHash(true, s1, voter1, contentId);
        bytes32 ch2 = _commitHash(true, s2, voter2, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext28 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext28,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1,
            _testCiphertext(true, s1, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter2);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext29 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext29,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2,
            _testCiphertext(true, s2, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);

        // Advance past epoch boundary and reveal (absolute)
        RoundLib.Round memory rCU0 = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(rCU0.startTime) + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), true, s2);

        uint256 reserveBefore = votingEngine.consensusReserve();
        votingEngine.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled), "Should be settled by consensus");
        assertTrue(round.upWins, "UP should win by consensus");

        // Consensus reserve should have decreased (subsidy paid out)
        assertLt(votingEngine.consensusReserve(), reserveBefore, "Consensus reserve should decrease");

        // Winner can claim consensus subsidy reward
        uint256 balBefore = hrepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        assertGt(hrepToken.balanceOf(voter1), balBefore, "Consensus winner should receive subsidy reward");
    }

    function test_ConsensusSettlement_OnlyDownVoters() public {
        uint256 contentId = _submitContent();

        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, false, uint256(0)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, false, uint256(1)));
        bytes32 ch1 = _commitHash(false, s1, voter1, contentId);
        bytes32 ch2 = _commitHash(false, s2, voter2, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext30 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext30,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1,
            _testCiphertext(false, s1, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter2);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext31 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext31,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2,
            _testCiphertext(false, s2, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);

        RoundLib.Round memory rCD0 = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(rCD0.startTime) + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), false, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), false, s2);

        votingEngine.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
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
        assertEq(RoundEngineReadHelpers.activeRoundId(votingEngine, contentId), 0, "No active round after settlement");

        // New commit after cooldown creates round 2
        vm.warp(block.timestamp + 25 hours);
        bytes32 salt = keccak256(abi.encodePacked(voter4, contentId, false, uint256(99)));
        bytes32 ch = _commitHash(false, salt, voter4, contentId);

        vm.startPrank(voter4);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext32 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext32,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch,
            _testCiphertext(false, salt, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        assertEq(RoundEngineReadHelpers.activeRoundId(votingEngine, contentId), 2, "Round 2 should be created");
    }

    // =========================================================================
    // DOUBLE COMMIT PREVENTION
    // =========================================================================

    function test_CannotDoubleCommitInSameRound() public {
        uint256 contentId = _submitContent();

        bytes32 salt1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch1 = _commitHash(true, salt1, voter1, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext33 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext33,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1,
            _testCiphertext(true, salt1, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        // Warp past 24h cooldown so CooldownActive doesn't fire first
        vm.warp(block.timestamp + 25 hours);

        // Same voter, same round — second commit reverts with AlreadyCommitted (cooldown cleared)
        bytes32 salt2 = keccak256(abi.encodePacked(voter1, contentId, false, uint256(1)));
        bytes32 ch2 = _commitHash(false, salt2, voter2, contentId);
        uint16 referenceRatingBps = _currentRatingReferenceBps(contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext34 = _roundContext(votingEngine.previewCommitRoundId(contentId), referenceRatingBps);
        vm.expectRevert(RoundVotingEngine.AlreadyCommitted.selector);
        votingEngine.commitVote(
            contentId,
            cachedRoundContext34,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2,
            _testCiphertext(false, salt2, contentId),
            STAKE,
            address(0)
        );
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
        bytes32 ch = _commitHash(true, salt, voter1, contentId);
        uint16 referenceRatingBps = _currentRatingReferenceBps(contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext35 = _roundContext(votingEngine.previewCommitRoundId(contentId), referenceRatingBps);
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        votingEngine.commitVote(
            contentId,
            cachedRoundContext35,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch,
            _testCiphertext(true, salt, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        // After 25 hours — succeeds
        vm.warp(block.timestamp + 25 hours);
        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext36 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext36,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch,
            _testCiphertext(true, salt, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        assertEq(RoundEngineReadHelpers.activeRoundId(votingEngine, contentId), 2, "New round should be created");
    }

    // =========================================================================
    // CONSENSUS SUBSIDY
    // =========================================================================

    function test_UnanimousRoundPaysConsensusSubsidy() public {
        uint256 contentId = _submitContent();

        // All voters same direction — unanimous UP
        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, true, uint256(1)));
        bytes32 ch1 = _commitHash(true, s1, voter1, contentId);
        bytes32 ch2 = _commitHash(true, s2, voter2, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext37 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext37,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1,
            _testCiphertext(true, s1, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter2);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext38 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext38,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2,
            _testCiphertext(true, s2, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        uint256 reserveBefore = votingEngine.consensusReserve();

        RoundLib.Round memory rUR0 = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(rUR0.startTime) + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), true, s2);

        votingEngine.settleRound(contentId, roundId);

        assertLt(votingEngine.consensusReserve(), reserveBefore, "Reserve should decrease for consensus subsidy");

        uint256 balBefore = hrepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        assertGt(hrepToken.balanceOf(voter1), balBefore, "Voter should receive consensus subsidy");
    }

    function test_LowRatedFirstSettlementDoesNotPayTreasury() public {
        ProtocolConfig protocolConfig = ProtocolConfig(address(votingEngine.protocolConfig()));
        vm.startPrank(owner);
        registry.setTreasury(treasury);
        protocolConfig.setSlashConfig(4_000, 1, 2 days, 100e6);
        vm.stopPrank();

        uint256 contentId = _submitContent();
        uint256 submitterBalanceBefore = hrepToken.balanceOf(submitter);
        uint256 treasuryBalanceBefore = hrepToken.balanceOf(treasury);
        RatingLib.SlashConfig memory slashConfig = registry.getSlashConfigForContent(contentId);
        assertEq(slashConfig.slashThresholdBps, 4_000, "content should snapshot the tuned slash threshold");
        assertEq(slashConfig.minSlashSettledRounds, 1, "content should snapshot the tuned settled-round requirement");
        assertEq(slashConfig.minSlashLowDuration, 2 days, "content should snapshot the tuned dwell window");
        assertEq(slashConfig.minSlashEvidence, 100e6, "content should snapshot the tuned evidence floor");

        vm.warp(block.timestamp + 1 days + 1);

        address[] memory voters = new address[](2);
        voters[0] = voter1;
        voters[1] = voter2;
        bool[] memory dirs = new bool[](2);
        dirs[0] = false;
        dirs[1] = false;

        _settleRoundWith(voters, contentId, dirs, 100e6);

        (,,,,,,,, uint256 rating,) = registry.contents(contentId);
        RatingLib.RatingState memory ratingState = registry.getRatingState(contentId);
        assertLt(
            registry.getConservativeRating(contentId),
            4_000,
            "conservative rating should fall below the tuned threshold"
        );
        assertGt(uint256(ratingState.lowSince), 0, "first low settlement should start the low-rating dwell timer");
        assertEq(
            hrepToken.balanceOf(treasury), treasuryBalanceBefore, "treasury should not be paid before the dwell window"
        );

        (,,,,,,,, rating,) = registry.contents(contentId);
        assertLt(uint256(rating), 40, "display rating should still reflect a low settlement");
        assertEq(hrepToken.balanceOf(submitter), submitterBalanceBefore, "submitter receives no removed stake payout");
        assertEq(hrepToken.balanceOf(treasury), treasuryBalanceBefore, "treasury should not receive a removed slash");
    }

    function test_HealthyFirstSettlementDoesNotPaySubmitterOrTreasury() public {
        uint256 contentId = _submitContent();
        uint256 submitterBalanceBefore = hrepToken.balanceOf(submitter);
        uint256 treasuryBalanceBefore = hrepToken.balanceOf(treasury);

        vm.warp(block.timestamp + 4 days + 1);

        address[] memory voters = new address[](2);
        voters[0] = voter1;
        voters[1] = voter2;
        bool[] memory dirs = new bool[](2);
        dirs[0] = true;
        dirs[1] = true;

        _settleRoundWith(voters, contentId, dirs, 100e6);

        (,,,,,,,, uint256 rating,) = registry.contents(contentId);
        assertGe(rating, 25, "round should not be slashable");
        assertEq(hrepToken.balanceOf(submitter), submitterBalanceBefore, "submitter receives no removed stake payout");
        assertEq(hrepToken.balanceOf(treasury), treasuryBalanceBefore, "treasury should not receive a slash");
    }

    // =========================================================================
    // CONFIG SNAPSHOT PER-ROUND
    // =========================================================================

    function test_ConfigSnapshotPerRound() public {
        uint256 contentId = _submitContent();

        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, true, uint256(1)));
        bytes32 ch1 = _commitHash(true, s1, voter1, contentId);
        bytes32 ch2 = _commitHash(true, s2, voter2, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext39 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext39,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1,
            _testCiphertext(true, s1, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter2);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext40 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext40,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2,
            _testCiphertext(true, s2, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);

        // Verify snapshot matches config at creation
        RoundLib.RoundConfig memory cfg = RoundEngineReadHelpers.roundConfig(votingEngine, contentId, roundId);
        assertEq(cfg.epochDuration, EPOCH_DURATION);
        assertEq(cfg.maxDuration, 7 days);
        assertEq(cfg.minVoters, 2);

        // Change config: increase minVoters to 10
        ProtocolConfig protoCfg = ProtocolConfig(address(votingEngine.protocolConfig()));
        vm.prank(owner);
        _setTlockRoundConfig(protoCfg, EPOCH_DURATION, 7 days, 10, 200);

        // Snapshot unchanged
        cfg = RoundEngineReadHelpers.roundConfig(votingEngine, contentId, roundId);
        assertEq(cfg.minVoters, 2, "Snapshot should still have minVoters=2");

        // Reveal and settle using snapshotted config (minVoters=2, we have 2 revealed votes)
        RoundLib.Round memory rCSN0 = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(rCSN0.startTime) + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), true, s2);

        votingEngine.settleRound(contentId, roundId);

        assertEq(
            uint256(RoundEngineReadHelpers.round(votingEngine, contentId, roundId).state),
            uint256(RoundLib.RoundState.Settled),
            "Should settle with snapshotted config"
        );
    }

    // =========================================================================
    // ROUND STATE TRACKING
    // =========================================================================

    function test_HasCommittedTracking() public {
        uint256 contentId = _submitContent();

        assertEq(votingEngine.voterCommitHash(contentId, 1, voter1), bytes32(0), "Should not have committed yet");

        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch = _commitHash(true, salt, voter1, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext41 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext41,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch,
            _testCiphertext(true, salt, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        assertTrue(votingEngine.voterCommitHash(contentId, roundId, voter1) != bytes32(0), "Should have committed");
        assertEq(
            votingEngine.voterCommitHash(contentId, roundId, voter2), bytes32(0), "Voter2 should not have committed"
        );
    }

    function test_CommitHistoryTracking() public {
        uint256 contentId = _submitContent();

        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch1 = _commitHash(true, s1, voter1, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext42 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext42,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1,
            _testCiphertext(true, s1, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        assertTrue(votingEngine.hasCommits(contentId), "Content should show commit history after first vote");

        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, false, uint256(1)));
        bytes32 ch2 = _commitHash(false, s2, voter2, contentId);

        vm.startPrank(voter2);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext43 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext43,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2,
            _testCiphertext(false, s2, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        assertTrue(votingEngine.hasCommits(contentId), "Content should keep commit history after more votes");
    }

    function test_RoundVoterCountAfterReveal() public {
        uint256 contentId = _submitContent();

        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, false, uint256(1)));
        bytes32 s3 = keccak256(abi.encodePacked(voter3, contentId, true, uint256(2)));
        bytes32 ch1 = _commitHash(true, s1, voter1, contentId);
        bytes32 ch2 = _commitHash(false, s2, voter2, contentId);
        bytes32 ch3 = _commitHash(true, s3, voter3, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext44 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext44,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1,
            _testCiphertext(true, s1, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter2);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext45 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext45,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2,
            _testCiphertext(false, s2, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter3);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext46 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext46,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch3,
            _testCiphertext(true, s3, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);

        // Revealed count is populated during reveal, not commit
        assertEq(
            RoundEngineReadHelpers.round(votingEngine, contentId, roundId).revealedCount, 0, "No voters revealed yet"
        );

        _warpPastTlockRevealTime(block.timestamp + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), false, s2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter3, ch3), true, s3);

        assertEq(
            RoundEngineReadHelpers.round(votingEngine, contentId, roundId).revealedCount,
            3,
            "Should have 3 revealed voters"
        );
    }

    // =========================================================================
    // STAKE VALIDATION
    // =========================================================================

    function test_InvalidStakeRejected() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch = _commitHash(true, salt, voter1, contentId);
        uint16 referenceRatingBps = _currentRatingReferenceBps(contentId);

        // Below minimum (1 HREP)
        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), 0.5e6);
        uint256 cachedRoundContext47 = _roundContext(votingEngine.previewCommitRoundId(contentId), referenceRatingBps);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        votingEngine.commitVote(
            contentId,
            cachedRoundContext47,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch,
            _testCiphertext(true, salt, contentId),
            0.5e6,
            address(0)
        );
        vm.stopPrank();

        // Above maximum (100 HREP)
        bytes32 salt2 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(1)));
        bytes32 ch2 = _commitHash(true, salt2, voter2, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), 101e6);
        uint256 cachedRoundContext48 = _roundContext(votingEngine.previewCommitRoundId(contentId), referenceRatingBps);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        votingEngine.commitVote(
            contentId,
            cachedRoundContext48,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2,
            _testCiphertext(true, salt2, contentId),
            101e6,
            address(0)
        );
        vm.stopPrank();
    }

    // =========================================================================
    // EPOCH-WEIGHTED REWARDS — early blind voters get 4x weight vs informed
    // =========================================================================

    function test_EpochWeighting_Epoch1VoterGetsFullWeight() public {
        uint256 contentId = _submitContent();

        // voter1 commits in epoch-1 (epochIndex=0 → 100% weight)
        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch1 = _commitHash(true, s1, voter1, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext49 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext49,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1,
            _testCiphertext(true, s1, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        bytes32 ck1 = _commitKey(voter1, ch1);

        // Verify epochIndex = 0 (epoch-1, blind)
        RoundLib.Commit memory commit = RoundEngineReadHelpers.commit(votingEngine, contentId, roundId, ck1);
        assertEq(commit.epochIndex, 0, "First voter should be in epoch-1 (epochIndex=0)");
        assertEq(commit.stakeAmount, STAKE, "Stake should be recorded correctly");

        // Advance past epoch boundary and reveal
        _warpPastTlockRevealTime(block.timestamp + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck1, true, s1);

        // After reveal, effective weighted pool should reflect 100% weight
        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        assertEq(round.weightedUpPool, STAKE, "Epoch-1 vote should have 100% weight (effectiveStake = stake)");
    }

    function test_EpochWeighting_Epoch2VoterGetsReducedWeight() public {
        uint256 contentId = _submitContent();

        // voter1 commits in epoch-1 (blind)
        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch1 = _commitHash(true, s1, voter1, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext50 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext50,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1,
            _testCiphertext(true, s1, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        // Advance into epoch-2 — use absolute time from round.startTime
        // voter2 commits after epoch-1 ends (epoch-2, epochIndex=1 → 25% weight)
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        RoundLib.Round memory rEW0 = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(rEW0.startTime) + EPOCH_DURATION);

        // Reveal voter1's vote to make results visible
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, s1);

        // voter2 commits in epoch-2 (informed, epochIndex=1 → 25% weight)
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, false, uint256(1)));
        bytes32 ch2 = _commitHash(false, s2, voter2, contentId);

        vm.startPrank(voter2);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext51 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext51,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2,
            _testCiphertext(false, s2, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();
        uint256 voter2RevealableAfter = block.timestamp + EPOCH_DURATION;

        bytes32 ck2 = _commitKey(voter2, ch2);
        RoundLib.Commit memory commit2 = RoundEngineReadHelpers.commit(votingEngine, contentId, roundId, ck2);
        assertEq(commit2.epochIndex, 1, "Second-epoch voter should have epochIndex=1");

        // Reveal voter2's vote after another epoch boundary (absolute: startTime + 2 * EPOCH_DURATION + 2)
        // voter2 committed at startTime+EPOCH_DURATION+1, so revealableAfter = startTime+2*EPOCH_DURATION+1
        _warpPastTlockRevealTime(voter2RevealableAfter);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck2, false, s2);

        // Verify weighted pools: UP = STAKE (100%), DOWN = STAKE * 2500 / 10000 = STAKE/4
        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        assertEq(round.weightedUpPool, STAKE, "Epoch-1 UP vote should have 100% weight");
        assertEq(round.weightedDownPool, STAKE * 2500 / 10000, "Epoch-2 DOWN vote should have 25% weight");

        // UP wins despite equal raw stakes (epoch-weighting penalises late voter)
        votingEngine.settleRound(contentId, roundId);

        RoundLib.Round memory settled = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
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
        bytes32 ch1 = _commitHash(true, s1, voter1, contentId);
        bytes32 ch2 = _commitHash(false, s2, voter2, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext52 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext52,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1,
            _testCiphertext(true, s1, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter2);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext53 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext53,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2,
            _testCiphertext(false, s2, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);

        // Reveal after epoch boundary (absolute)
        RoundLib.Round memory rSR0 = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(rSR0.startTime) + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), false, s2);

        // Settlement can happen immediately after threshold reached
        votingEngine.settleRound(contentId, roundId);

        assertEq(
            uint256(RoundEngineReadHelpers.round(votingEngine, contentId, roundId).state),
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
            uint256(RoundEngineReadHelpers.round(votingEngine, contentId, roundId).state),
            uint256(RoundLib.RoundState.Settled),
            "Settlement should succeed without participation pool"
        );
    }

    // =========================================================================
    // O(1) SETTLEMENT — FRONTEND FEE CLAIMING
    // =========================================================================

    /// @dev Helper to set up a FrontendRegistry wired to the voting engine.
    function _setupFrontendRegistry() internal returns (FrontendRegistry frontendReg, address frontendOp) {
        MockVoterIdNFT voterIdNFT;
        (frontendReg, voterIdNFT) = _setupFrontendRegistryWithVoterId();
        frontendOp = address(200);
        _registerFrontend(frontendReg, voterIdNFT, frontendOp);
    }

    function _setupFrontendRegistryWithVoterId()
        internal
        returns (FrontendRegistry frontendReg, MockVoterIdNFT voterIdNFT)
    {
        vm.startPrank(owner);
        FrontendRegistry frontendRegistryImpl = new FrontendRegistry();
        frontendReg = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(frontendRegistryImpl),
                    abi.encodeCall(FrontendRegistry.initialize, (owner, owner, address(hrepToken)))
                )
            )
        );
        ProtocolConfig(address(votingEngine.protocolConfig())).setFrontendRegistry(address(frontendReg));
        frontendReg.setVotingEngine(address(votingEngine));
        frontendReg.addFeeCreditor(address(rewardDistributor));
        voterIdNFT = new MockVoterIdNFT();
        frontendReg.setVoterIdNFT(address(voterIdNFT));
        vm.stopPrank();
    }

    function _registerFrontend(FrontendRegistry frontendReg, MockVoterIdNFT voterIdNFT, address frontendOp) internal {
        vm.startPrank(owner);
        hrepToken.mint(frontendOp, 2000e6);
        voterIdNFT.setHolder(frontendOp);
        vm.stopPrank();

        vm.startPrank(frontendOp);
        hrepToken.approve(address(frontendReg), 1000e6);
        frontendReg.register();
        vm.stopPrank();
    }

    /// @dev Helper: commit 3 votes (2 up, 1 down) with a specific frontend, reveal, settle.
    function _settleRoundWithFrontend(address frontend) internal returns (uint256 contentId, uint256 roundId) {
        contentId = _submitContent();

        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, true, uint256(1)));
        bytes32 s3 = keccak256(abi.encodePacked(voter3, contentId, false, uint256(2)));
        bytes32 ch1 = _commitHash(true, s1, voter1, contentId);
        bytes32 ch2 = _commitHash(true, s2, voter2, contentId);
        bytes32 ch3 = _commitHash(false, s3, voter3, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext54 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext54,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1,
            _testCiphertext(true, s1, contentId),
            STAKE,
            frontend
        );
        vm.stopPrank();

        vm.startPrank(voter2);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext55 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext55,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2,
            _testCiphertext(true, s2, contentId),
            STAKE,
            frontend
        );
        vm.stopPrank();

        vm.startPrank(voter3);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext56 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext56,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch3,
            _testCiphertext(false, s3, contentId),
            STAKE,
            frontend
        );
        vm.stopPrank();

        roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);

        RoundLib.Round memory rFW0 = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(rFW0.startTime) + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), true, s2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter3, ch3), false, s3);

        votingEngine.settleRound(contentId, roundId);
    }

    function test_ClaimFrontendFee_HappyPath() public {
        (FrontendRegistry frontendReg, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        uint256 feesBefore = frontendReg.getAccumulatedFees(frontendOp);

        // Claim frontend fee
        _claimFrontendFeeAsOperator(contentId, roundId, frontendOp);

        assertGt(frontendReg.getAccumulatedFees(frontendOp) - feesBefore, 0, "Frontend fee should be credited");
    }

    function test_FinalizeFrontendFeeDust_RoutesOnlyRoundingDustAfterDelay() public {
        (FrontendRegistry frontendReg, MockVoterIdNFT voterIdNFT) = _setupFrontendRegistryWithVoterId();
        address frontendA = address(200);
        address frontendB = address(201);
        _registerFrontend(frontendReg, voterIdNFT, frontendA);
        _registerFrontend(frontendReg, voterIdNFT, frontendB);

        uint256 contentId = _submitContent();
        uint256 stake1 = 1_000_001;
        uint256 stake2 = 1_000_000;
        uint256 stake3 = 1_000_000;

        bytes32 salt1 = keccak256(abi.encodePacked("frontend-dust", voter1, contentId));
        bytes32 salt2 = keccak256(abi.encodePacked("frontend-dust", voter2, contentId));
        bytes32 salt3 = keccak256(abi.encodePacked("frontend-dust", voter3, contentId));

        (, bytes32 ck1) = _commitWithSaltAndFrontend(voter1, contentId, true, stake1, salt1, frontendA);
        (, bytes32 ck2) = _commitWithSaltAndFrontend(voter2, contentId, true, stake2, salt2, frontendB);
        (, bytes32 ck3) = _commitWithSaltAndFrontend(voter3, contentId, false, stake3, salt3, address(0));

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        RoundLib.Round memory openRound = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        vm.warp(openRound.startTime + EPOCH_DURATION + _tlockDrandPeriod() + 1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck1, true, salt1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck2, true, salt2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck3, false, salt3);
        votingEngine.settleRound(contentId, roundId);

        address[] memory frontends = new address[](2);
        frontends[0] = frontendA;
        frontends[1] = frontendB;

        vm.expectRevert(RoundRewardDistributor.RewardFinalizationTooEarly.selector);
        rewardDistributor.finalizeFrontendFeeDust(contentId, roundId, frontends);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        vm.warp(uint256(round.settledAt) + rewardDistributor.STALE_REWARD_FINALIZATION_DELAY());

        uint256 frontendPool = votingEngine.roundFrontendPool(contentId, roundId);
        uint256 treasuryBefore = hrepToken.balanceOf(treasury);
        uint256 feesABefore = frontendReg.getAccumulatedFees(frontendA);
        uint256 feesBBefore = frontendReg.getAccumulatedFees(frontendB);

        address[] memory firstBatch = new address[](1);
        firstBatch[0] = frontendA;
        address[] memory secondBatch = new address[](1);
        secondBatch[0] = frontendB;

        vm.expectRevert();
        vm.prank(address(0xD00D));
        rewardDistributor.processFrontendFeeDustBatch(contentId, roundId, firstBatch);

        vm.prank(owner);
        (uint256 processedCount,) = rewardDistributor.processFrontendFeeDustBatch(contentId, roundId, secondBatch);
        assertEq(processedCount, 1, "suffix batch should process one frontend");

        vm.expectRevert(RoundRewardDistributor.InvalidFinalizationInput.selector);
        vm.prank(owner);
        rewardDistributor.processFrontendFeeDustBatch(contentId, roundId, firstBatch);

        vm.prank(owner);
        rewardDistributor.resetFrontendFeeDustBatch(contentId, roundId);
        assertEq(rewardDistributor.roundFrontendFeeDustProcessedCount(contentId, roundId), 0);

        vm.prank(owner);
        (processedCount,) = rewardDistributor.processFrontendFeeDustBatch(contentId, roundId, firstBatch);
        assertEq(processedCount, 1, "first batch should process one frontend");

        vm.expectRevert(RoundRewardDistributor.InvalidFinalizationInput.selector);
        vm.prank(owner);
        rewardDistributor.finalizeProcessedFrontendFeeDust(contentId, roundId);

        vm.prank(owner);
        (processedCount,) = rewardDistributor.processFrontendFeeDustBatch(contentId, roundId, secondBatch);
        assertEq(processedCount, 2, "second batch should complete processing");

        vm.prank(owner);
        uint256 releasedDust = rewardDistributor.finalizeProcessedFrontendFeeDust(contentId, roundId);

        assertEq(releasedDust, 1, "only mathematical frontend fee dust should be finalized");
        assertEq(hrepToken.balanceOf(treasury), treasuryBefore + releasedDust, "dust should route to protocol");
        assertTrue(rewardDistributor.roundFrontendFeeDustFinalized(contentId, roundId));

        _claimFrontendFeeAsOperator(contentId, roundId, frontendA);
        _claimFrontendFeeAsOperator(contentId, roundId, frontendB);

        uint256 feeA = frontendReg.getAccumulatedFees(frontendA) - feesABefore;
        uint256 feeB = frontendReg.getAccumulatedFees(frontendB) - feesBBefore;
        assertEq(feeA + feeB + releasedDust, frontendPool, "finalized dust should not reduce base shares");
        assertEq(rewardDistributor.roundFrontendClaimedAmount(contentId, roundId), frontendPool);
    }

    function test_ClaimFrontendFee_CreditFailureEmitsFallbackEvent() public {
        (FrontendRegistry frontendReg, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        vm.prank(owner);
        frontendReg.removeFeeCreditor(address(rewardDistributor));

        (uint256 fee,,,) = rewardDistributor.previewFrontendFee(contentId, roundId, frontendOp);
        uint256 treasuryBalanceBefore = hrepToken.balanceOf(treasury);

        vm.expectEmit(true, true, true, true, address(rewardDistributor));
        emit RoundRewardDistributor.FrontendFeeCreditFailed(contentId, roundId, frontendOp, address(frontendReg), fee);
        _claimFrontendFeeAsOperator(contentId, roundId, frontendOp);

        assertEq(frontendReg.getAccumulatedFees(frontendOp), 0, "failed registry credit should not accrue fees");
        assertEq(hrepToken.balanceOf(treasury), treasuryBalanceBefore + fee, "fee should route to protocol");
    }

    function test_ClaimFrontendFee_RegistryLookupFailureIsConfiscatable() public {
        (FrontendRegistry frontendReg, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        uint256 feesBefore = frontendReg.getAccumulatedFees(frontendOp);
        uint256 frontendBalanceBefore = hrepToken.balanceOf(frontendOp);
        uint256 treasuryBalanceBefore = hrepToken.balanceOf(treasury);
        uint256 reserveBefore = votingEngine.consensusReserve();

        vm.mockCallRevert(
            address(frontendReg),
            abi.encodeWithSelector(IFrontendRegistry.getFrontendInfo.selector, frontendOp),
            abi.encodeWithSignature("Error(string)", "registry unavailable")
        );

        vm.expectRevert(RoundRewardDistributor.FrontendFeeNotClaimable.selector);
        _claimFrontendFeeAsOperator(contentId, roundId, frontendOp);
        _confiscateFrontendFee(contentId, roundId, frontendOp);

        assertEq(hrepToken.balanceOf(frontendOp), frontendBalanceBefore, "lookup failure must not pay frontend");
        assertEq(frontendReg.getAccumulatedFees(frontendOp), feesBefore, "lookup failure must not accrue fees");
        assertTrue(
            hrepToken.balanceOf(treasury) > treasuryBalanceBefore || votingEngine.consensusReserve() > reserveBefore,
            "confiscated fee should reach protocol"
        );
    }

    function test_ClaimFrontendFee_DoubleClaimReverts() public {
        (, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        // First claim succeeds
        _claimFrontendFeeAsOperator(contentId, roundId, frontendOp);

        // Second claim reverts
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        _claimFrontendFeeAsOperator(contentId, roundId, frontendOp);
    }

    function test_ClaimFrontendFee_ReroutesHistoricalShareAfterDeregister() public {
        (FrontendRegistry frontendReg, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        vm.prank(frontendOp);
        frontendReg.requestDeregister();
        _completeFrontendExit(frontendReg, frontendOp);

        uint256 feesBefore = frontendReg.getAccumulatedFees(frontendOp);
        uint256 frontendBalanceBefore = hrepToken.balanceOf(frontendOp);
        uint256 treasuryBalanceBefore = hrepToken.balanceOf(treasury);
        uint256 reserveBefore = votingEngine.consensusReserve();

        vm.expectRevert(RoundRewardDistributor.FrontendFeeNotClaimable.selector);
        _claimFrontendFeeAsOperator(contentId, roundId, frontendOp);
        _confiscateFrontendFee(contentId, roundId, frontendOp);

        assertEq(hrepToken.balanceOf(frontendOp), frontendBalanceBefore, "deregistered frontend must not be paid");
        assertEq(frontendReg.getAccumulatedFees(frontendOp), feesBefore, "deregistered frontend must not accrue fees");
        assertTrue(
            hrepToken.balanceOf(treasury) > treasuryBalanceBefore || votingEngine.consensusReserve() > reserveBefore,
            "redirected fee should reach protocol"
        );
    }

    function test_ClaimFrontendFee_ReroutesHistoricalShareWhileFrontendIsSlashed() public {
        (FrontendRegistry frontendReg, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        vm.prank(owner);
        frontendReg.slashFrontend(frontendOp, 100e6, "test");

        uint256 feesBefore = frontendReg.getAccumulatedFees(frontendOp);
        uint256 frontendBalanceBefore = hrepToken.balanceOf(frontendOp);
        uint256 treasuryBalanceBefore = hrepToken.balanceOf(treasury);
        uint256 reserveBefore = votingEngine.consensusReserve();
        _confiscateFrontendFee(contentId, roundId, frontendOp);

        assertEq(hrepToken.balanceOf(frontendOp), frontendBalanceBefore, "slashed frontend must not be paid directly");
        assertEq(frontendReg.getAccumulatedFees(frontendOp), feesBefore, "slashed frontend must not accrue fees");
        assertTrue(
            hrepToken.balanceOf(treasury) > treasuryBalanceBefore || votingEngine.consensusReserve() > reserveBefore,
            "redirected fee should reach protocol"
        );
    }

    function test_ClaimFrontendFee_ReroutesHistoricalShareAfterVoterIdRevocation() public {
        FrontendRegistry frontendReg;
        MockVoterIdNFT voterIdNFT;
        (frontendReg, voterIdNFT) = _setupFrontendRegistryWithVoterId();
        address frontendOp = address(200);
        _registerFrontend(frontendReg, voterIdNFT, frontendOp);
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        voterIdNFT.removeHolder(frontendOp);

        uint256 feesBefore = frontendReg.getAccumulatedFees(frontendOp);
        uint256 frontendBalanceBefore = hrepToken.balanceOf(frontendOp);
        uint256 treasuryBalanceBefore = hrepToken.balanceOf(treasury);
        uint256 reserveBefore = votingEngine.consensusReserve();

        vm.expectRevert(RoundRewardDistributor.FrontendFeeNotClaimable.selector);
        _claimFrontendFeeAsOperator(contentId, roundId, frontendOp);
        _confiscateFrontendFee(contentId, roundId, frontendOp);

        assertEq(hrepToken.balanceOf(frontendOp), frontendBalanceBefore, "revoked frontend must not be paid directly");
        assertEq(frontendReg.getAccumulatedFees(frontendOp), feesBefore, "revoked frontend must not accrue fees");
        assertTrue(
            hrepToken.balanceOf(treasury) > treasuryBalanceBefore || votingEngine.consensusReserve() > reserveBefore,
            "redirected fee should reach protocol"
        );
    }

    function test_ClaimFrontendFee_SucceedsAfterFrontendReregisters() public {
        (FrontendRegistry frontendReg, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        vm.startPrank(frontendOp);
        frontendReg.requestDeregister();
        vm.stopPrank();

        _completeFrontendExit(frontendReg, frontendOp);

        vm.startPrank(frontendOp);
        hrepToken.approve(address(frontendReg), 1000e6);
        frontendReg.register();
        vm.stopPrank();

        uint256 feesBefore = frontendReg.getAccumulatedFees(frontendOp);
        _claimFrontendFeeAsOperator(contentId, roundId, frontendOp);

        assertGt(
            frontendReg.getAccumulatedFees(frontendOp) - feesBefore,
            0,
            "Re-registered frontend should still receive fees"
        );
        assertTrue(frontendReg.isEligible(frontendOp), "Re-registration should restore eligibility");
    }

    function test_ClaimFrontendFee_SucceedsAfterFrontendIsRebonded() public {
        (FrontendRegistry frontendReg, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        vm.startPrank(owner);
        frontendReg.slashFrontend(frontendOp, 100e6, "test");
        frontendReg.unslashFrontend(frontendOp);
        vm.stopPrank();

        vm.startPrank(frontendOp);
        hrepToken.approve(address(frontendReg), 100e6);
        frontendReg.topUpStake(100e6);
        vm.stopPrank();

        uint256 feesBefore = frontendReg.getAccumulatedFees(frontendOp);
        _claimFrontendFeeAsOperator(contentId, roundId, frontendOp);

        assertGt(
            frontendReg.getAccumulatedFees(frontendOp) - feesBefore,
            0,
            "Rebonded frontend should receive preserved fees"
        );
        assertTrue(frontendReg.isEligible(frontendOp), "Rebonding should restore eligibility");
    }

    function test_ClaimFrontendFee_UsesCommitTimeEligibilitySnapshot() public {
        (FrontendRegistry frontendReg, address frontendOp) = _setupFrontendRegistry();
        uint256 contentId = _submitContent();

        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, true, uint256(1)));
        bytes32 s3 = keccak256(abi.encodePacked(voter3, contentId, false, uint256(2)));
        bytes32 ch1 = _commitHash(true, s1, voter1, contentId);
        bytes32 ch2 = _commitHash(true, s2, voter2, contentId);
        bytes32 ch3 = _commitHash(false, s3, voter3, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext57 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext57,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1,
            _testCiphertext(true, s1, contentId),
            STAKE,
            frontendOp
        );
        vm.stopPrank();

        vm.startPrank(voter2);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext58 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext58,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2,
            _testCiphertext(true, s2, contentId),
            STAKE,
            frontendOp
        );
        vm.stopPrank();

        vm.startPrank(voter3);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext59 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext59,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch3,
            _testCiphertext(false, s3, contentId),
            STAKE,
            frontendOp
        );
        vm.stopPrank();

        vm.prank(frontendOp);
        frontendReg.requestDeregister();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(round.startTime) + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), true, s2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter3, ch3), false, s3);

        votingEngine.settleRound(contentId, roundId);
        _claimFrontendFeeAsOperator(contentId, roundId, frontendOp);

        assertGt(frontendReg.getAccumulatedFees(frontendOp), 0, "commit-time eligibility should remain preserved");
    }

    function test_ClaimFrontendFee_IgnoresFrontendEligibleAfterCommit() public {
        (FrontendRegistry frontendReg, address frontendOp) = _setupFrontendRegistry();
        vm.startPrank(owner);
        frontendReg.slashFrontend(frontendOp, 100e6, "test");
        frontendReg.unslashFrontend(frontendOp);
        vm.stopPrank();

        uint256 contentId = _submitContent();

        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, true, uint256(1)));
        bytes32 s3 = keccak256(abi.encodePacked(voter3, contentId, false, uint256(2)));
        bytes32 ch1 = _commitHash(true, s1, voter1, contentId);
        bytes32 ch2 = _commitHash(true, s2, voter2, contentId);
        bytes32 ch3 = _commitHash(false, s3, voter3, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext60 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext60,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch1,
            _testCiphertext(true, s1, contentId),
            STAKE,
            frontendOp
        );
        vm.stopPrank();

        vm.startPrank(voter2);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext61 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext61,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2,
            _testCiphertext(true, s2, contentId),
            STAKE,
            frontendOp
        );
        vm.stopPrank();

        vm.startPrank(voter3);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext62 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext62,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch3,
            _testCiphertext(false, s3, contentId),
            STAKE,
            frontendOp
        );
        vm.stopPrank();

        vm.startPrank(frontendOp);
        hrepToken.approve(address(frontendReg), 100e6);
        frontendReg.topUpStake(100e6);
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(round.startTime) + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), true, s2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter3, ch3), false, s3);

        votingEngine.settleRound(contentId, roundId);
        vm.expectRevert(RoundRewardDistributor.NoPool.selector);
        _claimFrontendFeeAsOperator(contentId, roundId, frontendOp);
    }

    function test_FrontendTracking_KeepsCommitKeysAccessible() public {
        (FrontendRegistry frontendReg, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        bytes32[] memory commitKeys = RoundEngineReadHelpers.commitKeys(votingEngine, contentId, roundId);

        assertEq(commitKeys.length, 3);

        _claimFrontendFeeAsOperator(contentId, roundId, frontendOp);
        assertGt(frontendReg.getAccumulatedFees(frontendOp), 0, "Frontend fee claim should still succeed");
    }

    function test_ClaimFrontendFee_UsesSnapshotRegistryAfterRegistryReplacement() public {
        (FrontendRegistry originalRegistry, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        vm.startPrank(owner);
        FrontendRegistry replacementImpl = new FrontendRegistry();
        FrontendRegistry replacementRegistry = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(replacementImpl),
                    abi.encodeCall(FrontendRegistry.initialize, (owner, owner, address(hrepToken)))
                )
            )
        );
        ProtocolConfig(address(votingEngine.protocolConfig())).setFrontendRegistry(address(replacementRegistry));
        replacementRegistry.setVotingEngine(address(votingEngine));
        replacementRegistry.addFeeCreditor(address(rewardDistributor));
        vm.stopPrank();

        uint256 originalFeesBefore = originalRegistry.getAccumulatedFees(frontendOp);
        uint256 replacementFeesBefore = replacementRegistry.getAccumulatedFees(frontendOp);

        _claimFrontendFeeAsOperator(contentId, roundId, frontendOp);

        assertGt(
            originalRegistry.getAccumulatedFees(frontendOp) - originalFeesBefore,
            0,
            "historical fees should credit the settlement-time registry"
        );
        assertEq(
            replacementRegistry.getAccumulatedFees(frontendOp),
            replacementFeesBefore,
            "replacement registry should not capture historical fees"
        );
    }

    function test_ClaimFrontendFee_NoEligibleFrontendRedirectsToVoterPool() public {
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

        // Voter pool should include the frontend share
        uint256 voterPool = votingEngine.roundVoterPool(contentId, roundId);
        assertGt(voterPool, 0);

        vm.expectRevert(RoundRewardDistributor.NoPool.selector);
        rewardDistributor.claimFrontendFee(contentId, roundId, address(0xBEEF));
    }

    function _completeFrontendExit(FrontendRegistry frontendReg, address frontendOp) internal {
        vm.warp(block.timestamp + frontendReg.UNBONDING_PERIOD() + 1);
        vm.prank(frontendOp);
        frontendReg.completeDeregister();
    }

    function _claimFrontendFeeAsOperator(uint256 contentId, uint256 roundId, address frontendOp) internal {
        vm.prank(frontendOp);
        rewardDistributor.claimFrontendFee(contentId, roundId, frontendOp);
    }

    function _confiscateFrontendFee(uint256 contentId, uint256 roundId, address frontendOp) internal {
        vm.prank(owner);
        rewardDistributor.confiscateFrontendFee(contentId, roundId, frontendOp);
    }

    // =========================================================================
    // O(1) SETTLEMENT — PARTICIPATION REWARD CLAIMING
    // =========================================================================

    /// @dev Helper: set up ParticipationPool and settle a round (3 voters: 2 up, 1 down).
    function _settleRoundWithParticipation() internal returns (uint256 contentId, uint256 roundId) {
        vm.startPrank(owner);
        ParticipationPool pool = new ParticipationPool(address(hrepToken), owner);
        pool.setAuthorizedCaller(address(rewardDistributor), true);
        hrepToken.mint(owner, 1_000_000e6);
        hrepToken.approve(address(pool), 1_000_000e6);
        pool.depositPool(1_000_000e6);
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(pool));
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

        // Claim participation reward
        uint256 balBefore = hrepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimParticipationReward(contentId, roundId);
        uint256 balAfter = hrepToken.balanceOf(voter1);

        uint256 expectedReward = STAKE * 9000 / 10000;
        assertEq(balAfter - balBefore, expectedReward, "Should receive 90% of stake as participation reward");
    }

    function test_ClaimParticipationReward_UsesSettledRoundPoolAfterRotation() public {
        ParticipationPool pool1 = new ParticipationPool(address(hrepToken), owner);
        ParticipationPool pool2 = new ParticipationPool(address(hrepToken), owner);

        pool1.setAuthorizedCaller(address(rewardDistributor), true);
        pool2.setAuthorizedCaller(address(rewardDistributor), true);
        vm.prank(owner);
        hrepToken.mint(address(this), 2_000_000e6);
        hrepToken.approve(address(pool1), 1_000_000e6);
        pool1.depositPool(1_000_000e6);
        hrepToken.approve(address(pool2), 1_000_000e6);
        pool2.depositPool(1_000_000e6);
        vm.startPrank(owner);
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(pool1));
        vm.stopPrank();

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

        ProtocolConfig cfgRotation = ProtocolConfig(address(votingEngine.protocolConfig()));
        vm.prank(owner);
        cfgRotation.setParticipationPool(address(pool2));

        uint256 expectedReward = STAKE * 9000 / 10000;
        uint256 pool1Before = hrepToken.balanceOf(address(pool1));
        uint256 pool2Before = hrepToken.balanceOf(address(pool2));

        vm.prank(voter1);
        rewardDistributor.claimParticipationReward(contentId, roundId);

        assertEq(hrepToken.balanceOf(address(pool1)), pool1Before - expectedReward);
        assertEq(hrepToken.balanceOf(address(pool2)), pool2Before);
    }

    function test_ClaimParticipationReward_ReservedPortionSurvivesPoolDeauthorization() public {
        ParticipationPool pool = new ParticipationPool(address(hrepToken), owner);
        pool.setAuthorizedCaller(address(rewardDistributor), true);

        vm.startPrank(owner);
        hrepToken.mint(owner, 1_000_000e6);
        hrepToken.approve(address(pool), 1_000_000e6);
        pool.depositPool(1_000_000e6);
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(pool));
        vm.stopPrank();

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
            rewardDistributor.roundParticipationRewardReserved(contentId, roundId),
            9e6,
            "round should reserve the full winner reward"
        );

        pool.setAuthorizedCaller(address(rewardDistributor), false);

        uint256 balBefore = hrepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimParticipationReward(contentId, roundId);
        uint256 balAfter = hrepToken.balanceOf(voter1);

        assertEq(balAfter - balBefore, 4_500_000, "reserved participation rewards should remain claimable");
    }

    function test_ClaimParticipationReward_PartialReservationIsClaimOrderIndependent() public {
        ParticipationPool pool = new ParticipationPool(address(hrepToken), owner);
        pool.setAuthorizedCaller(address(rewardDistributor), true);

        vm.startPrank(owner);
        hrepToken.mint(owner, 4e6);
        hrepToken.approve(address(pool), 4e6);
        pool.depositPool(4e6);
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(pool));
        vm.stopPrank();

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
            rewardDistributor.roundParticipationRewardOwed(contentId, roundId),
            0,
            "underfunded settlement should not snapshot a partially funded obligation"
        );
        assertEq(
            rewardDistributor.roundParticipationRewardReserved(contentId, roundId),
            0,
            "underfunded settlement should not leave a partial reservation behind"
        );

        vm.prank(voter1);
        vm.expectRevert(RoundRewardDistributor.NoPool.selector);
        rewardDistributor.claimParticipationReward(contentId, roundId);

        vm.prank(voter2);
        vm.expectRevert(RoundRewardDistributor.NoPool.selector);
        rewardDistributor.claimParticipationReward(contentId, roundId);

        vm.startPrank(owner);
        hrepToken.mint(owner, 5e6);
        hrepToken.approve(address(pool), 5e6);
        pool.depositPool(5e6);
        rewardDistributor.backfillParticipationRewards(contentId, roundId, address(pool), 9000);
        vm.stopPrank();

        uint256 voter1Before = hrepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimParticipationReward(contentId, roundId);
        uint256 voter1Delta = hrepToken.balanceOf(voter1) - voter1Before;

        uint256 voter2Before = hrepToken.balanceOf(voter2);
        vm.prank(voter2);
        rewardDistributor.claimParticipationReward(contentId, roundId);
        uint256 voter2Delta = hrepToken.balanceOf(voter2) - voter2Before;

        assertEq(voter1Delta, 4_500_000, "backfill should restore the full winner share");
        assertEq(voter2Delta, 4_500_000, "claim order should not matter once the round is backfilled");

        vm.prank(voter1);
        vm.expectRevert(RoundRewardDistributor.AlreadyClaimed.selector);
        rewardDistributor.claimParticipationReward(contentId, roundId);
    }

    function test_FinalizeParticipationRewards_ReleasesRoundingDust() public {
        ParticipationPool pool = new ParticipationPool(address(hrepToken), owner);
        pool.setAuthorizedCaller(address(rewardDistributor), true);

        vm.startPrank(owner);
        hrepToken.mint(owner, 1_000_000e6);
        hrepToken.approve(address(pool), 1_000_000e6);
        pool.depositPool(1_000_000e6);
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(pool));
        vm.stopPrank();

        uint256 contentId = _submitContent();
        bytes32 salt1 = keccak256("dust-voter1");
        bytes32 salt2 = keccak256("dust-voter2");
        bytes32 salt3 = keccak256("dust-voter3");

        (, bytes32 commitKey1) = _commitWithSalt(voter1, contentId, true, 1_000_001, salt1);
        (, bytes32 commitKey2) = _commitWithSalt(voter2, contentId, true, 1_000_001, salt2);
        (, bytes32 commitKey3) = _commitWithSalt(voter3, contentId, false, 1_000_000, salt3);

        uint256 roundId = _getActiveOrLatestRoundId(contentId);

        _warpPastTlockRevealTime(block.timestamp + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId, roundId, commitKey1, true, salt1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, commitKey2, true, salt2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, commitKey3, false, salt3);
        votingEngine.settleRound(contentId, roundId);

        assertEq(
            rewardDistributor.roundParticipationRewardReserved(contentId, roundId),
            1_800_001,
            "round should reserve the floored aggregate reward"
        );

        vm.prank(voter1);
        rewardDistributor.claimParticipationReward(contentId, roundId);
        vm.prank(voter2);
        rewardDistributor.claimParticipationReward(contentId, roundId);

        assertEq(pool.reservedRewards(address(rewardDistributor)), 1, "one dust unit should remain reserved");
        assertEq(
            rewardDistributor.roundParticipationRewardPaidTotal(contentId, roundId),
            1_800_000,
            "paid total should equal the sum of per-voter rewards"
        );

        uint256 poolBalanceBeforeFinalize = pool.poolBalance();
        uint256 totalDistributedBeforeFinalize = pool.totalDistributed();

        uint256 releasedDust = rewardDistributor.finalizeParticipationRewards(contentId, roundId);

        assertEq(releasedDust, 1, "finalization should release the rounding dust");
        assertEq(pool.reservedRewards(address(rewardDistributor)), 0, "released dust should no longer stay reserved");
        assertEq(pool.reservedBalance(), 0, "all reserved rewards should now be withdrawn or released");
        assertEq(pool.poolBalance(), poolBalanceBeforeFinalize + 1, "released dust should return to the pool");
        assertEq(
            pool.totalDistributed(),
            totalDistributedBeforeFinalize - 1,
            "released dust should no longer count as distributed"
        );
        assertEq(
            rewardDistributor.roundParticipationRewardReserved(contentId, roundId),
            1_800_000,
            "round snapshot should drop the released dust"
        );
        assertTrue(
            rewardDistributor.roundParticipationRewardFinalized(contentId, roundId),
            "round should be marked finalized after dust release"
        );
    }

    function test_FinalizeParticipationRewards_RevertsUntilWinnersFullyPaid() public {
        ParticipationPool pool = new ParticipationPool(address(hrepToken), owner);
        pool.setAuthorizedCaller(address(rewardDistributor), true);

        vm.startPrank(owner);
        hrepToken.mint(owner, 4e6);
        hrepToken.approve(address(pool), 4e6);
        pool.depositPool(4e6);
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(pool));
        vm.stopPrank();

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
            rewardDistributor.roundParticipationRewardReserved(contentId, roundId),
            0,
            "underfunded settlement should not leave a partial reservation behind"
        );

        vm.prank(voter1);
        vm.expectRevert(RoundRewardDistributor.NoPool.selector);
        rewardDistributor.claimParticipationReward(contentId, roundId);

        vm.expectRevert(RoundRewardDistributor.ParticipationRewardsOutstanding.selector);
        rewardDistributor.finalizeParticipationRewards(contentId, roundId);

        vm.startPrank(owner);
        hrepToken.mint(owner, 5e6);
        hrepToken.approve(address(pool), 5e6);
        pool.depositPool(5e6);
        rewardDistributor.backfillParticipationRewards(contentId, roundId, address(pool), 9000);
        vm.stopPrank();

        vm.prank(voter1);
        rewardDistributor.claimParticipationReward(contentId, roundId);
        vm.prank(voter2);
        rewardDistributor.claimParticipationReward(contentId, roundId);

        uint256 releasedDust = rewardDistributor.finalizeParticipationRewards(contentId, roundId);

        assertEq(releasedDust, 0, "no dust should be released when reservations equal total claims");
        assertEq(
            rewardDistributor.roundParticipationRewardFullyClaimedCount(contentId, roundId),
            2,
            "finalization should only unlock after both winners are fully paid"
        );
        assertTrue(
            rewardDistributor.roundParticipationRewardFinalized(contentId, roundId),
            "round should still be finalizable when the released dust is zero"
        );
    }

    function test_FinalizeParticipationRewards_ReleasesStaleUnclaimedReservation() public {
        ParticipationPool pool = new ParticipationPool(address(hrepToken), owner);
        pool.setAuthorizedCaller(address(rewardDistributor), true);

        vm.startPrank(owner);
        hrepToken.mint(owner, 1_000_000e6);
        hrepToken.approve(address(pool), 1_000_000e6);
        pool.depositPool(1_000_000e6);
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(pool));
        vm.stopPrank();

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

        vm.prank(voter1);
        rewardDistributor.claimParticipationReward(contentId, roundId);

        vm.expectRevert(RoundRewardDistributor.ParticipationRewardsOutstanding.selector);
        rewardDistributor.finalizeParticipationRewards(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        vm.warp(uint256(round.settledAt) + rewardDistributor.STALE_REWARD_FINALIZATION_DELAY());

        uint256 poolBalanceBeforeFinalize = pool.poolBalance();
        uint256 totalDistributedBeforeFinalize = pool.totalDistributed();

        uint256 releasedReward = rewardDistributor.finalizeParticipationRewards(contentId, roundId);

        assertEq(releasedReward, 4_500_000, "stale unpaid winner reservation should be released");
        assertEq(pool.reservedRewards(address(rewardDistributor)), 0, "no reservation should remain live");
        assertEq(pool.poolBalance(), poolBalanceBeforeFinalize + releasedReward, "released reward returns to pool");
        assertEq(
            pool.totalDistributed(),
            totalDistributedBeforeFinalize - releasedReward,
            "released reward should no longer count as distributed"
        );
        assertEq(
            rewardDistributor.roundParticipationRewardReserved(contentId, roundId),
            4_500_000,
            "round snapshot should retain only the already-paid amount"
        );

        vm.prank(voter2);
        vm.expectRevert(RoundRewardDistributor.ParticipationRewardsAlreadyFinalized.selector);
        rewardDistributor.claimParticipationReward(contentId, roundId);
    }

    function test_SettlementSideEffectFailure_InsufficientParticipationLiquidityCanBeBackfilled() public {
        ParticipationPool tinyPool = new ParticipationPool(address(hrepToken), owner);
        tinyPool.setAuthorizedCaller(address(rewardDistributor), true);

        vm.startPrank(owner);
        hrepToken.mint(owner, 4e6);
        hrepToken.approve(address(tinyPool), 4e6);
        tinyPool.depositPool(4e6);
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(tinyPool));
        vm.stopPrank();

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

        assertEq(tinyPool.reservedRewards(address(rewardDistributor)), 0, "partial reservations should be rolled back");
        vm.prank(voter1);
        vm.expectRevert(RoundRewardDistributor.NoPool.selector);
        rewardDistributor.claimParticipationReward(contentId, roundId);

        vm.startPrank(owner);
        hrepToken.mint(owner, 5e6);
        hrepToken.approve(address(tinyPool), 5e6);
        tinyPool.depositPool(5e6);
        rewardDistributor.backfillParticipationRewards(contentId, roundId, address(tinyPool), 9000);
        vm.stopPrank();

        vm.prank(voter1);
        rewardDistributor.claimParticipationReward(contentId, roundId);
        vm.prank(voter2);
        rewardDistributor.claimParticipationReward(contentId, roundId);

        assertEq(
            rewardDistributor.roundParticipationRewardPaidTotal(contentId, roundId),
            9e6,
            "backfill should restore the full participation entitlement"
        );
    }

    function test_ClaimParticipationReward_LegacyRoundCanBeBackfilled() public {
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

        vm.prank(voter1);
        vm.expectRevert(RoundRewardDistributor.NoPool.selector);
        rewardDistributor.claimParticipationReward(contentId, roundId);

        ParticipationPool pool = new ParticipationPool(address(hrepToken), owner);
        pool.setAuthorizedCaller(address(rewardDistributor), true);

        vm.startPrank(owner);
        hrepToken.mint(owner, 1_000_000e6);
        hrepToken.approve(address(pool), 1_000_000e6);
        pool.depositPool(1_000_000e6);
        rewardDistributor.backfillParticipationRewards(contentId, roundId, address(pool), 9000);
        vm.stopPrank();

        uint256 balBefore = hrepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimParticipationReward(contentId, roundId);
        uint256 balAfter = hrepToken.balanceOf(voter1);

        assertEq(balAfter - balBefore, 4_500_000, "backfill should restore the round's reserved reward");
    }

    function test_ClaimParticipationReward_DoubleClaimReverts() public {
        (uint256 contentId, uint256 roundId) = _settleRoundWithParticipation();

        vm.prank(voter1);
        rewardDistributor.claimParticipationReward(contentId, roundId);

        vm.prank(voter1);
        vm.expectRevert(RoundRewardDistributor.AlreadyClaimed.selector);
        rewardDistributor.claimParticipationReward(contentId, roundId);
    }

    function test_ClaimParticipationReward_OnlySettledRounds() public {
        vm.startPrank(owner);
        ParticipationPool pool = new ParticipationPool(address(hrepToken), owner);
        pool.setAuthorizedCaller(address(rewardDistributor), true);
        hrepToken.mint(owner, 1_000_000e6);
        hrepToken.approve(address(pool), 1_000_000e6);
        pool.depositPool(1_000_000e6);
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(pool));
        vm.stopPrank();

        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(0)));
        bytes32 ch = _commitHash(true, salt, voter1, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext63 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _currentRatingReferenceBps(contentId));
        votingEngine.commitVote(
            contentId,
            cachedRoundContext63,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch,
            _testCiphertext(true, salt, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        // Round is Open, not Settled
        vm.prank(voter1);
        vm.expectRevert(RoundRewardDistributor.RoundNotSettled.selector);
        rewardDistributor.claimParticipationReward(contentId, 1);
    }

    function test_SettlementSideEffectFailure_ParticipationRateSnapshotCanBeBackfilled() public {
        RevertingParticipationPool badPool = new RevertingParticipationPool(address(hrepToken));
        ProtocolConfig cfgBackfill = ProtocolConfig(address(votingEngine.protocolConfig()));
        vm.prank(owner);
        cfgBackfill.setParticipationPool(address(badPool));

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

        vm.expectEmit(true, true, true, true, address(votingEngine));
        emit RoundSettlementSideEffectsLib.SettlementSideEffectFailed(
            contentId,
            roundId,
            address(badPool),
            RoundSettlementSideEffectsLib.SideEffectFailureStage.ParticipationRateQuery
        );
        votingEngine.settleRound(contentId, roundId);
        vm.prank(voter1);
        vm.expectRevert(RoundRewardDistributor.NoPool.selector);
        rewardDistributor.claimParticipationReward(contentId, roundId);

        ParticipationPool repairPool = new ParticipationPool(address(hrepToken), owner);
        repairPool.setAuthorizedCaller(address(rewardDistributor), true);

        vm.startPrank(owner);
        hrepToken.mint(owner, 1_000_000e6);
        hrepToken.approve(address(repairPool), 1_000_000e6);
        repairPool.depositPool(1_000_000e6);
        rewardDistributor.backfillParticipationRewards(contentId, roundId, address(repairPool), 9000);
        vm.stopPrank();

        uint256 balBefore = hrepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimParticipationReward(contentId, roundId);
        uint256 balAfter = hrepToken.balanceOf(voter1);

        assertEq(balAfter - balBefore, 4_500_000, "backfill should repair rate snapshot failures");
    }

    function test_RegistryVotingEngineRotatesOnlyWhilePausedAfterInitialWiring() public {
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
        RoundVotingEngine replacementEngine = _deployReplacementVotingEngine();

        vm.prank(owner);
        vm.expectRevert("Pause required");
        registry.setVotingEngine(address(replacementEngine));

        votingEngine.settleRound(contentId, roundId);
        assertEq(
            uint8(RoundEngineReadHelpers.round(votingEngine, contentId, roundId).state),
            uint8(RoundLib.RoundState.Settled)
        );

        vm.startPrank(owner);
        registry.pause();
        registry.setVotingEngine(address(replacementEngine));
        vm.stopPrank();

        assertEq(registry.votingEngine(), address(replacementEngine));
    }

    function _deployReplacementVotingEngine() internal returns (RoundVotingEngine replacementEngine) {
        vm.startPrank(owner);
        replacementEngine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(new RoundVotingEngine()),
                    abi.encodeCall(
                        RoundVotingEngine.initialize,
                        (owner, address(hrepToken), address(registry), address(_deployProtocolConfig(owner)))
                    )
                )
            )
        );
        vm.stopPrank();
    }

    // =========================================================================
    // SET PARTICIPATION POOL UPDATABILITY
    // =========================================================================

    function test_SetParticipationPoolCanBeUpdated() public {
        address pool1 = address(0xAA);
        address pool2 = address(0xBB);

        vm.startPrank(owner);
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(pool1);
        // Should NOT revert on second call
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(pool2);
        vm.stopPrank();
    }
}
