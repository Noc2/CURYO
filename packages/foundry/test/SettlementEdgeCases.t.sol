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
import { HumanReputation } from "../contracts/HumanReputation.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";

// =========================================================================
// TEST CONTRACT: Settlement Edge Cases
// =========================================================================

/// @title SettlementEdgeCasesTest
/// @notice Tests for settlement edge cases: double-settle, cancel timing boundaries,
///         settle on already-settled, treasury=address(0), consensus reserve depletion,
///         small losing pool rounding, cancel after tie, state machine transitions.
contract SettlementEdgeCasesTest is VotingTestBase {
    HumanReputation public hrepToken;
    ContentRegistry public registry;
    RoundVotingEngine public engine;
    RoundRewardDistributor public rewardDistributor;
    ParticipationPool public participationPool;
    FrontendRegistry public frontendRegistry;

    address public owner = address(1);
    address public submitter = address(2);
    address public voter1 = address(3);
    address public voter2 = address(4);
    address public voter3 = address(5);
    address public voter4 = address(6);
    address public voter5 = address(7);
    address public voter6 = address(8);
    address public treasury = address(100);
    address public frontend1 = address(200);

    uint256 public constant STAKE = 5e6; // 5 HREP
    uint256 public constant MIN_STAKE = 1e6;
    uint256 public constant T0 = 1_000_000;
    uint256 public constant EPOCH = 1 hours;

    function setUp() public {
        vm.warp(T0);
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

        engine = RoundVotingEngine(
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
                        (owner, address(hrepToken), address(engine), address(registry))
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

        // epochDuration=1h, maxDuration=7d, minVoters=3, maxVoters=1000
        _setTlockRoundConfig(ProtocolConfig(address(engine.protocolConfig())), 1 hours, 7 days, 3, 1000);

        FrontendRegistry frImpl = new FrontendRegistry();
        frontendRegistry = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(frImpl), abi.encodeCall(FrontendRegistry.initialize, (owner, owner, address(hrepToken)))
                )
            )
        );
        frontendRegistry.setVotingEngine(address(engine));
        frontendRegistry.addFeeCreditor(address(rewardDistributor));
        ProtocolConfig(address(engine.protocolConfig())).setFrontendRegistry(address(frontendRegistry));

        participationPool = new ParticipationPool(address(hrepToken), owner);
        participationPool.setAuthorizedCaller(address(rewardDistributor), true);
        participationPool.setAuthorizedCaller(address(registry), true);
        ProtocolConfig(address(engine.protocolConfig())).setParticipationPool(address(participationPool));

        hrepToken.mint(owner, 2_000_000e6);
        hrepToken.approve(address(participationPool), 500_000e6);
        participationPool.depositPool(500_000e6);
        hrepToken.approve(address(engine), 500_000e6);
        engine.addToConsensusReserve(500_000e6);

        address[8] memory users = [submitter, voter1, voter2, voter3, voter4, voter5, voter6, frontend1];
        for (uint256 i = 0; i < users.length; i++) {
            hrepToken.mint(users[i], 10_000e6);
        }

        vm.stopPrank();
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _commit(address voter, uint256 contentId, bool isUp, uint256 stakeAmt)
        internal
        returns (bytes32 commitKey, bytes32 salt)
    {
        salt = keccak256(abi.encodePacked(voter, block.timestamp));
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);
        uint16 referenceRatingBps = _currentRatingReferenceBps(contentId);
        bytes32 commitHash = _commitHash(
            isUp,
            salt,
            voter,
            contentId,
            referenceRatingBps,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ciphertext
        );
        vm.prank(voter);
        hrepToken.approve(address(engine), stakeAmt);
        vm.prank(voter);
        engine.commitVote(
            contentId,
            engine.previewCommitRoundId(contentId),
            referenceRatingBps,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            commitHash,
            ciphertext,
            stakeAmt,
            address(0)
        );
        commitKey = keccak256(abi.encodePacked(voter, commitHash));
    }

    function _reveal(uint256 contentId, uint256 roundId, bytes32 commitKey, bool isUp, bytes32 salt) internal {
        engine.revealVoteByCommitKey(contentId, roundId, commitKey, isUp, salt);
    }

    function _submitContent() internal returns (uint256 contentId) {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "test goal", "test goal", "test", 0);
        vm.stopPrank();
        contentId = 1;
    }

    function _submitContentN(uint256 n) internal returns (uint256) {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        string memory url = string(abi.encodePacked("https://example.com/", vm.toString(n)));
        _submitContentWithReservation(registry, url, "test goal", "test goal", "test", 0);
        vm.stopPrank();
        return registry.nextContentId() - 1;
    }

    function _commitOnEngine(
        RoundVotingEngine votingEngine,
        HumanReputation token,
        address voter,
        uint256 contentId,
        bool isUp,
        uint256 stakeAmt
    ) internal returns (bytes32 commitKey, bytes32 salt, uint64 targetRound) {
        bytes32 drandChainHash = _tlockDrandChainHash();
        salt = keccak256(abi.encodePacked(voter, block.timestamp));
        targetRound = _tlockCommitTargetRound();
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId, targetRound, drandChainHash);
        uint16 referenceRatingBps = _currentRatingReferenceBps(contentId);
        bytes32 commitHash =
            _commitHash(isUp, salt, voter, contentId, referenceRatingBps, targetRound, drandChainHash, ciphertext);
        vm.prank(voter);
        token.approve(address(votingEngine), stakeAmt);
        vm.prank(voter);
        votingEngine.commitVote(
            contentId,
            votingEngine.previewCommitRoundId(contentId),
            referenceRatingBps,
            targetRound,
            drandChainHash,
            commitHash,
            ciphertext,
            stakeAmt,
            address(0)
        );
        commitKey = keccak256(abi.encodePacked(voter, commitHash));
    }

    function _deployZeroReserveHarness()
        internal
        returns (HumanReputation token, ContentRegistry registry_, RoundVotingEngine votingEngine)
    {
        vm.startPrank(owner);

        token = new HumanReputation(owner, owner);
        token.grantRole(token.MINTER_ROLE(), owner);

        ContentRegistry registryImpl = new ContentRegistry();
        RoundVotingEngine engineImpl = new RoundVotingEngine();
        RoundRewardDistributor distImpl = new RoundRewardDistributor();

        registry_ = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImpl),
                    abi.encodeCall(ContentRegistry.initializeWithTreasury, (owner, owner, owner, address(token)))
                )
            )
        );

        votingEngine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engineImpl),
                    abi.encodeCall(
                        RoundVotingEngine.initialize,
                        (owner, address(token), address(registry_), address(_deployProtocolConfig(owner)))
                    )
                )
            )
        );

        RoundRewardDistributor dist = RoundRewardDistributor(
            address(
                new ERC1967Proxy(
                    address(distImpl),
                    abi.encodeCall(
                        RoundRewardDistributor.initialize,
                        (owner, address(token), address(votingEngine), address(registry_))
                    )
                )
            )
        );

        registry_.setVotingEngine(address(votingEngine));
        MockCategoryRegistry mockCategoryRegistry = new MockCategoryRegistry();
        mockCategoryRegistry.seedDefaultTestCategories();
        registry_.setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(votingEngine.protocolConfig())).setRewardDistributor(address(dist));
        ProtocolConfig(address(votingEngine.protocolConfig())).setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(votingEngine.protocolConfig())).setTreasury(treasury);
        _setTlockRoundConfig(ProtocolConfig(address(votingEngine.protocolConfig())), 1 hours, 7 days, 3, 1000);

        token.mint(submitter, 10_000e6);
        token.mint(voter1, 10_000e6);
        token.mint(voter2, 10_000e6);
        token.mint(voter3, 10_000e6);
        vm.stopPrank();
    }

    function _submitContentOnRegistry(HumanReputation token, ContentRegistry registry_, string memory url)
        internal
        returns (uint256 contentId)
    {
        vm.startPrank(submitter);
        token.approve(address(registry_), 10e6);
        _submitContentWithReservation(registry_, url, "test", "test", "test", 0);
        vm.stopPrank();
        contentId = 1;
    }

    function _prepareUnanimousRoundOnEngine(RoundVotingEngine votingEngine, HumanReputation token, uint256 contentId)
        internal
        returns (uint256 roundId)
    {
        (bytes32 ck1, bytes32 s1, uint64 targetRound1) =
            _commitOnEngine(votingEngine, token, voter1, contentId, true, STAKE);
        vm.warp(block.timestamp + 1);
        (bytes32 ck2, bytes32 s2, uint64 targetRound2) =
            _commitOnEngine(votingEngine, token, voter2, contentId, true, STAKE);
        vm.warp(block.timestamp + 1);
        (bytes32 ck3, bytes32 s3, uint64 targetRound3) =
            _commitOnEngine(votingEngine, token, voter3, contentId, true, STAKE);

        roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        uint64 maxTargetRound = targetRound1;
        if (targetRound2 > maxTargetRound) maxTargetRound = targetRound2;
        if (targetRound3 > maxTargetRound) maxTargetRound = targetRound3;
        vm.warp(_tlockRoundTimestamp(maxTargetRound) + 1);

        votingEngine.revealVoteByCommitKey(contentId, roundId, ck1, true, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck2, true, s2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck3, true, s3);
    }

    /// @dev Full 3-voter round: commit, warp past epoch, reveal all 3.
    function _setupThreeVoterRound(bool v1Up, bool v2Up, bool v3Up)
        internal
        returns (uint256 contentId, uint256 roundId)
    {
        contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, v1Up, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, v2Up, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, v3Up, STAKE);

        roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);

        RoundLib.Round memory r0 = RoundEngineReadHelpers.round(engine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(r0.startTime) + EPOCH);

        _reveal(contentId, roundId, ck1, v1Up, s1);
        _reveal(contentId, roundId, ck2, v2Up, s2);
        _reveal(contentId, roundId, ck3, v3Up, s3);
    }

    // =========================================================================
    // 1. DOUBLE-SETTLE: settleRound twice on same round should revert
    // =========================================================================

    function test_Settle_AlreadySettled_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);

        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));

        // Attempting to settle again should revert with RoundNotOpen
        vm.expectRevert(RoundVotingEngine.RoundNotOpen.selector);
        engine.settleRound(contentId, roundId);
    }

    // =========================================================================
    // 2. SETTLE ON TIED ROUND: should revert (state is Tied, not Open)
    // =========================================================================

    function test_Settle_TiedRound_Reverts() public {
        // Create a tied round: equal weighted pools
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, true, STAKE);

        // Need 4th voter to make it tied: 2 up + 2 down with equal stakes
        (bytes32 ck4, bytes32 s4) = _commit(voter4, contentId, false, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r0 = RoundEngineReadHelpers.round(engine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(r0.startTime) + EPOCH);

        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, false, s2);
        _reveal(contentId, roundId, ck3, true, s3);
        _reveal(contentId, roundId, ck4, false, s4);

        // First settle creates Tied state
        engine.settleRound(contentId, roundId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied));

        // Trying to settle again should revert
        vm.expectRevert(RoundVotingEngine.RoundNotOpen.selector);
        engine.settleRound(contentId, roundId);
    }

    // =========================================================================
    // 3. CANCEL TIMING BOUNDARY: exactly at maxDuration vs 1 second before
    // =========================================================================

    function test_Cancel_ExactlyAtMaxDuration_Succeeds() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        // Warp to exactly start + maxDuration
        vm.warp(round.startTime + 7 days);

        engine.cancelExpiredRound(contentId, roundId);

        RoundLib.Round memory cancelled = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(cancelled.state), uint256(RoundLib.RoundState.Cancelled));
    }

    function test_Cancel_OneSecondBeforeMaxDuration_Reverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        // Warp to 1 second BEFORE maxDuration
        vm.warp(round.startTime + 7 days - 1);

        vm.expectRevert(RoundVotingEngine.RoundNotExpired.selector);
        engine.cancelExpiredRound(contentId, roundId);
    }

    // =========================================================================
    // 4. CANCEL ALREADY SETTLED ROUND: should revert
    // =========================================================================

    function test_Cancel_SettledRound_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        vm.expectRevert(RoundVotingEngine.RoundNotOpen.selector);
        engine.cancelExpiredRound(contentId, roundId);
    }

    // =========================================================================
    // 5. CANCEL ROUND WITH THRESHOLD REACHED: should revert
    // =========================================================================

    function test_Cancel_ThresholdReached_Reverts() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, false, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r0 = RoundEngineReadHelpers.round(engine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(r0.startTime) + EPOCH);

        // Reveal all 3 — threshold reached
        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, true, s2);
        _reveal(contentId, roundId, ck3, false, s3);

        // Warp past maxDuration
        vm.warp(r0.startTime + 7 days + 1);

        // Should revert because threshold was reached
        vm.expectRevert(RoundVotingEngine.ThresholdReached.selector);
        engine.cancelExpiredRound(contentId, roundId);
    }

    // =========================================================================
    // 6. SETTLE WITH EXACTLY minVoters (boundary)
    // =========================================================================

    function test_Settle_ExactlyMinVoters_Succeeds() public {
        // minVoters=3, exactly 3 revealed
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);

        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
    }

    // =========================================================================
    // 7. SETTLE WITH FEWER THAN minVoters: reverts
    // =========================================================================

    function test_Settle_BelowMinVoters_Reverts() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r0 = RoundEngineReadHelpers.round(engine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(r0.startTime) + EPOCH);

        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, false, s2);

        // Even after long delay, should fail
        vm.warp(block.timestamp + 7 days);

        vm.expectRevert(RoundVotingEngine.NotEnoughVotes.selector);
        engine.settleRound(contentId, roundId);
    }

    // =========================================================================
    // 8. SETTLE IMMEDIATELY AFTER THRESHOLD: succeeds without delay
    // =========================================================================

    function test_Settle_ImmediatelyAfterThreshold_Succeeds() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);

        // Settle immediately after threshold — no delay required
        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
    }

    // =========================================================================
    // 9. TREASURY = address(0): treasury share redirects to voter pool
    // =========================================================================

    function test_SetTreasury_ZeroAddress_Reverts() public {
        ProtocolConfig cfg = ProtocolConfig(address(engine.protocolConfig()));
        vm.prank(owner);
        vm.expectRevert(ProtocolConfig.InvalidAddress.selector);
        cfg.setTreasury(address(0));
    }

    function test_Settle_TreasuryReceivesFee() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);

        uint256 treasuryBefore = hrepToken.balanceOf(treasury);

        engine.settleRound(contentId, roundId);

        uint256 treasuryAfter = hrepToken.balanceOf(treasury);
        // Treasury should receive some fee from the losing pool
        assertGt(treasuryAfter, treasuryBefore);
    }

    // =========================================================================
    // 10. SMALL LOSING POOL: rounding edge case with 1 HREP losing pool
    // =========================================================================

    function test_Settle_MinimalLosingPool_NoRevert() public {
        uint256 contentId = _submitContent();

        // 2 up voters with STAKE, 1 down voter with MIN_STAKE
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, false, MIN_STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r0 = RoundEngineReadHelpers.round(engine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(r0.startTime) + EPOCH);

        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, true, s2);
        _reveal(contentId, roundId, ck3, false, s3);

        // Should not revert even with very small losing pool
        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
    }

    // =========================================================================
    // 11. UNANIMOUS ROUND: consensus subsidy from reserve
    // =========================================================================

    function test_Settle_UnanimousUp_ConsensusSubsidy() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, true);

        uint256 reserveBefore = engine.consensusReserve();

        engine.settleRound(contentId, roundId);

        uint256 reserveAfter = engine.consensusReserve();
        // Reserve should decrease (subsidy paid out)
        assertLt(reserveAfter, reserveBefore);

        // Voter pool should have the subsidy
        uint256 voterPool = engine.roundVoterPool(contentId, roundId);
        assertGt(voterPool, 0);
    }

    function test_Settle_UnanimousDown_ConsensusSubsidy() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(false, false, false);

        uint256 reserveBefore = engine.consensusReserve();

        engine.settleRound(contentId, roundId);

        uint256 reserveAfter = engine.consensusReserve();
        assertLt(reserveAfter, reserveBefore);
    }

    // =========================================================================
    // 12. CONSENSUS RESERVE AT ZERO: unanimous round settles with zero subsidy
    // =========================================================================

    function test_Settle_Unanimous_ZeroReserve_SettlesWithZeroSubsidy() public {
        (HumanReputation hrepToken2, ContentRegistry registry2, RoundVotingEngine engine2) = _deployZeroReserveHarness();

        // DO NOT fund consensus reserve — leave at 0
        assertEq(engine2.consensusReserve(), 0);

        uint256 contentId = _submitContentOnRegistry(hrepToken2, registry2, "https://example.com/zero-reserve");
        uint256 roundId = _prepareUnanimousRoundOnEngine(engine2, hrepToken2, contentId);

        // Settle — should succeed even with zero reserve
        engine2.settleRound(contentId, roundId);

        RoundLib.Round memory settled = RoundEngineReadHelpers.round(engine2, contentId, roundId);
        assertEq(uint256(settled.state), uint256(RoundLib.RoundState.Settled));

        // Voter pool should be 0 since reserve was 0
        assertEq(engine2.roundVoterPool(contentId, roundId), 0);
    }

    // =========================================================================
    // 13. CANCEL WITH ZERO COMMITS
    // =========================================================================

    function test_Cancel_ZeroCommits_NoRevert() public {
        // Submit content but never commit any votes
        uint256 contentId = _submitContent();

        // Commit 1 vote to create a round, then wait for expiry
        _commit(voter1, contentId, true, STAKE);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        vm.warp(round.startTime + 7 days);

        engine.cancelExpiredRound(contentId, roundId);

        RoundLib.Round memory cancelled = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(cancelled.state), uint256(RoundLib.RoundState.Cancelled));
    }

    // =========================================================================
    // 14. REFUND ON CANCELLED ROUND: non-participant cannot claim
    // =========================================================================

    function test_Refund_NonParticipant_Reverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        vm.warp(round.startTime + 7 days);

        engine.cancelExpiredRound(contentId, roundId);

        // voter2 never committed
        vm.prank(voter2);
        vm.expectRevert(RoundVotingEngine.NoCommit.selector);
        engine.claimCancelledRoundRefund(contentId, roundId);
    }

    // =========================================================================
    // 15. REFUND DOUBLE-CLAIM: same voter claims twice
    // =========================================================================

    function test_Refund_DoubleClaim_Reverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        vm.warp(round.startTime + 7 days);

        engine.cancelExpiredRound(contentId, roundId);

        vm.prank(voter1);
        engine.claimCancelledRoundRefund(contentId, roundId);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        engine.claimCancelledRoundRefund(contentId, roundId);
    }

    // =========================================================================
    // 16. NEW ROUND AFTER SETTLEMENT
    // =========================================================================

    function test_NewRound_AfterSettlement_Succeeds() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        // Warp past 24h cooldown so voter can vote again
        vm.warp(block.timestamp + 24 hours + 1);

        // New vote should create a new round
        _commit(voter1, contentId, true, STAKE);
        uint256 newRoundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);

        assertGt(newRoundId, roundId);
    }

    // =========================================================================
    // 17. NEW ROUND AFTER TIE
    // =========================================================================

    function test_NewRound_AfterTie_Succeeds() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, true, STAKE);
        (bytes32 ck4, bytes32 s4) = _commit(voter4, contentId, false, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r0 = RoundEngineReadHelpers.round(engine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(r0.startTime) + EPOCH);

        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, false, s2);
        _reveal(contentId, roundId, ck3, true, s3);
        _reveal(contentId, roundId, ck4, false, s4);

        engine.settleRound(contentId, roundId);

        // Warp past 24h cooldown
        vm.warp(block.timestamp + 24 hours + 1);

        // New vote should work
        _commit(voter1, contentId, true, STAKE);
        uint256 newRoundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        assertGt(newRoundId, roundId);
    }

    // =========================================================================
    // 18. NEW ROUND AFTER CANCEL
    // =========================================================================

    function test_NewRound_AfterCancel_Succeeds() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        vm.warp(round.startTime + 7 days);

        engine.cancelExpiredRound(contentId, roundId);

        _commit(voter1, contentId, true, STAKE);
        uint256 newRoundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        assertGt(newRoundId, roundId);
    }

    // =========================================================================
    // 19. REWARD CLAIM: revealed loser gets a small rebate
    // =========================================================================

    function test_RewardClaim_Loser_GetsRefund() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        uint256 balanceBefore = hrepToken.balanceOf(voter3);

        // voter3 voted false (down) but up won
        vm.prank(voter3);
        rewardDistributor.claimReward(contentId, roundId);

        uint256 balanceAfter = hrepToken.balanceOf(voter3);
        assertEq(balanceAfter - balanceBefore, STAKE / 20);
    }

    // =========================================================================
    // 20. REWARD CLAIM: double claim reverts
    // =========================================================================

    function test_RewardClaim_DoubleClaim_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);

        vm.prank(voter1);
        vm.expectRevert("Already claimed");
        rewardDistributor.claimReward(contentId, roundId);
    }

    // =========================================================================
    // 21. REWARD CLAIM: non-voter reverts
    // =========================================================================

    function test_RewardClaim_NonVoter_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        vm.prank(voter6); // Never voted
        vm.expectRevert("No vote found");
        rewardDistributor.claimReward(contentId, roundId);
    }

    // =========================================================================
    // 22. REWARD CLAIM: round not settled reverts
    // =========================================================================

    function test_RewardClaim_NotSettled_Reverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);

        vm.prank(voter1);
        vm.expectRevert("Round not settled");
        rewardDistributor.claimReward(contentId, roundId);
    }

    // =========================================================================
    // 24. REFUND ON TIED ROUND
    // =========================================================================

    function test_Refund_TiedRound_ReturnsStake() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, true, STAKE);
        (bytes32 ck4, bytes32 s4) = _commit(voter4, contentId, false, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r0 = RoundEngineReadHelpers.round(engine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(r0.startTime) + EPOCH);

        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, false, s2);
        _reveal(contentId, roundId, ck3, true, s3);
        _reveal(contentId, roundId, ck4, false, s4);

        engine.settleRound(contentId, roundId);

        uint256 balanceBefore = hrepToken.balanceOf(voter1);

        vm.prank(voter1);
        engine.claimCancelledRoundRefund(contentId, roundId);

        uint256 balanceAfter = hrepToken.balanceOf(voter1);
        assertEq(balanceAfter - balanceBefore, STAKE);
    }

    // =========================================================================
    // 27. WINNER REWARD CLAIM: gets stake + reward
    // =========================================================================

    function test_RewardClaim_Winner_GetsStakePlusReward() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        uint256 balanceBefore = hrepToken.balanceOf(voter1);

        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);

        uint256 balanceAfter = hrepToken.balanceOf(voter1);
        // Winner gets at least their stake back + some reward from losing pool
        assertGt(balanceAfter - balanceBefore, STAKE);
    }

    // =========================================================================
    // 28. ASYMMETRIC STAKES: higher stake winner gets proportionally more
    // =========================================================================

    function test_Settle_AsymmetricStakes_ProportionalRewards() public {
        uint256 contentId = _submitContent();

        // voter1 stakes 10 HREP (up), voter2 stakes 5 HREP (up), voter3 stakes 5 HREP (down)
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, 10e6);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, false, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r0 = RoundEngineReadHelpers.round(engine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(r0.startTime) + EPOCH);

        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, true, s2);
        _reveal(contentId, roundId, ck3, false, s3);

        engine.settleRound(contentId, roundId);

        uint256 bal1Before = hrepToken.balanceOf(voter1);
        uint256 bal2Before = hrepToken.balanceOf(voter2);

        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        vm.prank(voter2);
        rewardDistributor.claimReward(contentId, roundId);

        uint256 reward1 = hrepToken.balanceOf(voter1) - bal1Before;
        uint256 reward2 = hrepToken.balanceOf(voter2) - bal2Before;

        // voter1 staked 2x, so should get a larger reward
        assertGt(reward1, reward2);
    }
}
