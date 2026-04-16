// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ContentRegistry} from "../contracts/ContentRegistry.sol";
import {RoundVotingEngine} from "../contracts/RoundVotingEngine.sol";
import {ProtocolConfig} from "../contracts/ProtocolConfig.sol";
import {RoundRewardDistributor} from "../contracts/RoundRewardDistributor.sol";
import {CuryoReputation} from "../contracts/CuryoReputation.sol";
import {RatingLib} from "../contracts/libraries/RatingLib.sol";
import {RoundEngineReadHelpers} from "./helpers/RoundEngineReadHelpers.sol";
import {VotingTestBase} from "./helpers/VotingTestHelpers.sol";
import {MockCategoryRegistry} from "../contracts/mocks/MockCategoryRegistry.sol";

contract SubmitterStakeResolutionTest is VotingTestBase {
    CuryoReputation internal crepToken;
    ContentRegistry internal registry;
    RoundVotingEngine internal votingEngine;
    RoundRewardDistributor internal rewardDistributor;

    address internal owner = address(1);
    address internal submitter = address(2);
    address internal voter1 = address(3);
    address internal voter2 = address(4);
    address internal voter3 = address(5);
    address internal voter4 = address(6);
    address internal voter5 = address(7);
    address internal voter6 = address(8);

    uint256 internal constant STAKE = 5e6;
    uint256 internal constant T0 = 1_000;

    function setUp() public {
        vm.warp(T0);
        vm.roll(100);

        vm.startPrank(owner);

        crepToken = new CuryoReputation(owner, owner);
        crepToken.grantRole(crepToken.MINTER_ROLE(), owner);

        ContentRegistry registryImpl = new ContentRegistry();
        RoundVotingEngine engineImpl = new RoundVotingEngine();
        RoundRewardDistributor distributorImpl = new RoundRewardDistributor();

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
                        (owner, address(crepToken), address(registry), address(_deployProtocolConfig(owner)))
                    )
                )
            )
        );

        rewardDistributor = RoundRewardDistributor(
            address(
                new ERC1967Proxy(
                    address(distributorImpl),
                    abi.encodeCall(
                        RoundRewardDistributor.initialize,
                        (owner, address(crepToken), address(votingEngine), address(registry))
                    )
                )
            )
        );

        registry.setVotingEngine(address(votingEngine));
        registry.setTreasury(owner);
        registry.setProtocolConfig(address(votingEngine.protocolConfig()));
        MockCategoryRegistry mockCategoryRegistry = new MockCategoryRegistry();
        mockCategoryRegistry.seedDefaultTestCategories();
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(votingEngine.protocolConfig())).setRewardDistributor(address(rewardDistributor));
        ProtocolConfig(address(votingEngine.protocolConfig())).setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(votingEngine.protocolConfig())).setTreasury(owner);
        _setTlockRoundConfig(ProtocolConfig(address(votingEngine.protocolConfig())), 1 hours, 7 days, 3, 1000);

        crepToken.mint(owner, 500_000e6);
        crepToken.approve(address(votingEngine), 500_000e6);
        votingEngine.addToConsensusReserve(500_000e6);

        address[7] memory users = [submitter, voter1, voter2, voter3, voter4, voter5, voter6];
        for (uint256 i = 0; i < users.length; i++) {
            crepToken.mint(users[i], 10_000e6);
        }

        vm.stopPrank();
    }

    function test_ResolveSubmitterStake_AllowsResolutionWhileLaterRoundIsOpenAfterSettlement() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();
        uint256 submitterBalanceAfterSubmit = crepToken.balanceOf(submitter);

        (bytes32 commitKey1, bytes32 salt1) = _commit(voter1, 1, true);
        (bytes32 commitKey2, bytes32 salt2) = _commit(voter2, 1, true);
        (bytes32 commitKey3, bytes32 salt3) = _commit(voter3, 1, false);
        uint256 firstRoundId = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);

        vm.warp(T0 + 1 hours + 1);
        votingEngine.revealVoteByCommitKey(1, firstRoundId, commitKey1, true, salt1);
        votingEngine.revealVoteByCommitKey(1, firstRoundId, commitKey2, true, salt2);
        votingEngine.revealVoteByCommitKey(1, firstRoundId, commitKey3, false, salt3);
        votingEngine.settleRound(1, firstRoundId);

        _commit(voter4, 1, true);
        uint256 activeRoundId = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);
        assertTrue(activeRoundId != 0 && activeRoundId != firstRoundId, "later round should remain open");

        vm.warp(T0 + 4 days + 1);
        votingEngine.resolveSubmitterStake(1);

        (,,,,,,,,, bool submitterStakeReturned,,) = registry.contents(1);
        assertTrue(submitterStakeReturned, "milestone-0 resolution should ignore later open rounds");
        assertEq(
            crepToken.balanceOf(submitter) - submitterBalanceAfterSubmit,
            10e6,
            "healthy resolution should release the locked submitter stake"
        );
    }

    function test_ResolveSubmitterStake_AllowsResolutionAfterLaterRoundCancels() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();
        uint256 submitterBalanceAfterSubmit = crepToken.balanceOf(submitter);

        (bytes32 commitKey1, bytes32 salt1) = _commit(voter1, 1, true);
        (bytes32 commitKey2, bytes32 salt2) = _commit(voter2, 1, true);
        (bytes32 commitKey3, bytes32 salt3) = _commit(voter3, 1, false);
        uint256 firstRoundId = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);

        vm.warp(T0 + 1 hours + 1);
        votingEngine.revealVoteByCommitKey(1, firstRoundId, commitKey1, true, salt1);
        votingEngine.revealVoteByCommitKey(1, firstRoundId, commitKey2, true, salt2);
        votingEngine.revealVoteByCommitKey(1, firstRoundId, commitKey3, false, salt3);
        votingEngine.settleRound(1, firstRoundId);

        _commit(voter4, 1, true);
        uint256 laterRoundId = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);
        assertTrue(laterRoundId != 0 && laterRoundId != firstRoundId, "later round should exist");

        vm.warp(T0 + 7 days + 1 hours + 2);
        votingEngine.cancelExpiredRound(1, laterRoundId);

        votingEngine.resolveSubmitterStake(1);

        (,,,,,,,,, bool submitterStakeReturned,,) = registry.contents(1);
        assertTrue(submitterStakeReturned, "submitter stake should resolve even if a later round is open");
        assertEq(
            crepToken.balanceOf(submitter) - submitterBalanceAfterSubmit,
            10e6,
            "healthy resolution should only release the locked submitter stake"
        );
    }

    function test_ResolveSubmitterStake_DormancyFallbackRevertsWhileLaterRoundIsOpenWithoutSettlement() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/no-settlement", "goal", "goal", "tags", 0);
        vm.stopPrank();
        uint256 submitterBalanceAfterSubmit = crepToken.balanceOf(submitter);

        _commit(voter1, 1, true);
        uint256 activeRoundId = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);
        assertTrue(activeRoundId != 0, "later round should remain open");

        vm.warp(T0 + 31 days);
        vm.expectRevert(RoundVotingEngine.ActiveRoundStillOpen.selector);
        votingEngine.resolveSubmitterStake(1);

        (,,,,,,,,, bool submitterStakeReturned,,) = registry.contents(1);
        assertFalse(submitterStakeReturned, "dormancy fallback must keep stake locked while the round is open");
        assertEq(
            crepToken.balanceOf(submitter), submitterBalanceAfterSubmit, "submitter balance should remain unchanged"
        );
    }

    function test_ResolveSubmitterStake_DormancyFallbackWorksAfterOpenRoundCancels() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/dormancy-ready", "goal", "goal", "tags", 0);
        vm.stopPrank();

        _commit(voter1, 1, true);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);

        vm.warp(T0 + 31 days);
        vm.expectRevert(RoundVotingEngine.ActiveRoundStillOpen.selector);
        votingEngine.resolveSubmitterStake(1);
        votingEngine.cancelExpiredRound(1, roundId);

        votingEngine.resolveSubmitterStake(1);

        (,,,,,,,,, bool submitterStakeReturned,,) = registry.contents(1);
        assertTrue(submitterStakeReturned, "closed rounds should allow dormancy fallback to resolve");
    }

    function test_ResolveSubmitterStake_KeepsStakePendingUntilLowDwellCompletes() public {
        _setAggressiveSlashConfig();

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/low-pending", "goal", "goal", "tags", 0);
        vm.stopPrank();
        uint256 submitterBalanceAfterSubmit = crepToken.balanceOf(submitter);

        _settleRoundWithThreeVoters(1, false, 20e6);

        vm.warp(T0 + 1 days + 1);
        votingEngine.resolveSubmitterStake(1);

        (,,,,,,,,, bool submitterStakeReturned,,) = registry.contents(1);
        assertFalse(submitterStakeReturned, "stake should stay pending while low-rating dwell is still running");
        assertEq(
            crepToken.balanceOf(submitter), submitterBalanceAfterSubmit, "submitter balance should stay locked"
        );
    }

    function test_ResolveSubmitterStake_SlashesAfterLowDwellAndEvidence() public {
        _setAggressiveSlashConfig();

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/slash-path", "goal", "goal", "tags", 0);
        vm.stopPrank();
        uint256 submitterBalanceAfterSubmit = crepToken.balanceOf(submitter);
        uint256 treasuryBalanceBefore = crepToken.balanceOf(owner);

        _settleRoundWithThreeVoters(1, false, 20e6);
        _warpPastSlashability(1);
        votingEngine.resolveSubmitterStake(1);

        (,,,,,,,,, bool submitterStakeReturned,,) = registry.contents(1);
        assertTrue(submitterStakeReturned, "low ratings should slash once evidence and dwell both clear");
        assertEq(crepToken.balanceOf(submitter), submitterBalanceAfterSubmit, "submitter should remain slashed");
        assertGe(
            crepToken.balanceOf(owner) - treasuryBalanceBefore,
            10e6,
            "treasury should receive at least the locked submitter stake"
        );
    }

    function test_ResolveSubmitterStake_LaterHealthyRoundCanRecoverSlashability() public {
        _setAggressiveSlashConfig();

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/recover", "goal", "goal", "tags", 0);
        vm.stopPrank();
        uint256 submitterBalanceAfterSubmit = crepToken.balanceOf(submitter);

        _settleRoundWithVoters(1, false, 20e6, voter1, voter2, voter3);
        _settleRoundWithVoters(1, true, 20e6, voter4, voter5, voter6);

        assertFalse(registry.isSubmitterStakeSlashable(1), "later healthy evidence should clear slashability");
        assertGt(registry.getConservativeRating(1), 3_000, "conservative score should recover above the slash threshold");

        vm.warp(T0 + 4 days + 1);
        votingEngine.resolveSubmitterStake(1);

        (,,,,,,,,, bool submitterStakeReturned, uint256 rating,) = registry.contents(1);
        assertTrue(submitterStakeReturned, "healthy recovery should release the locked stake");
        assertEq(
            crepToken.balanceOf(submitter) - submitterBalanceAfterSubmit,
            10e6,
            "submitter should receive the locked stake once the score recovers"
        );
        assertGe(rating, 50, "display rating should recover after the healthy follow-up round");
    }

    function test_ResolveSubmitterStake_LaterLowRoundCanBecomeSlashable() public {
        _setAggressiveSlashConfig();

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/later-low", "goal", "goal", "tags", 0);
        vm.stopPrank();
        uint256 submitterBalanceAfterSubmit = crepToken.balanceOf(submitter);
        uint256 treasuryBalanceBefore = crepToken.balanceOf(owner);

        _settleMixedRoundWithVoters(1, 20e6, voter1, voter2, voter3);
        assertFalse(registry.isSubmitterStakeSlashable(1), "first settled round should still be healthy");

        _settleRoundWithVoters(1, false, 20e6, voter4, voter5, voter6);
        _warpPastSlashability(1);
        assertTrue(registry.isSubmitterStakeSlashable(1), "later low evidence should eventually make content slashable");
        votingEngine.resolveSubmitterStake(1);

        (,,,,,,,,, bool submitterStakeReturned, uint256 rating,) = registry.contents(1);
        assertTrue(submitterStakeReturned, "later low round should control the eventual resolution");
        assertLt(rating, 50, "display rating should reflect the later low round");
        assertEq(crepToken.balanceOf(submitter), submitterBalanceAfterSubmit, "submitter should remain slashed");
        assertGe(
            crepToken.balanceOf(owner) - treasuryBalanceBefore,
            10e6,
            "treasury should receive at least the locked submitter stake once slashable"
        );
    }

    function test_MarkDormant_UsesCurrentSlashabilityAfterRecovery() public {
        _setAggressiveSlashConfig();

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/dormant-recover", "goal", "goal", "tags", 0);
        vm.stopPrank();
        uint256 submitterBalanceAfterSubmit = crepToken.balanceOf(submitter);

        _settleRoundWithVoters(1, false, 20e6, voter1, voter2, voter3);
        _settleRoundWithVoters(1, true, 20e6, voter4, voter5, voter6);

        vm.warp(T0 + 31 days + 1);
        registry.markDormant(1);

        (,,,,,, ContentRegistry.ContentStatus status,,, bool submitterStakeReturned, uint256 rating,) = registry.contents(1);
        assertEq(uint256(status), uint256(ContentRegistry.ContentStatus.Dormant), "content should transition to dormant");
        assertTrue(submitterStakeReturned, "dormancy should resolve the recovered submitter stake");
        assertGe(rating, 50, "display rating should reflect the later healthy round");
        assertEq(
            crepToken.balanceOf(submitter) - submitterBalanceAfterSubmit,
            10e6,
            "dormancy should return the locked stake after recovery"
        );
    }

    function test_MarkDormant_UsesCurrentSlashabilityAfterLaterLowRound() public {
        _setAggressiveSlashConfig();

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/dormant-low", "goal", "goal", "tags", 0);
        vm.stopPrank();
        uint256 submitterBalanceAfterSubmit = crepToken.balanceOf(submitter);
        uint256 treasuryBalanceBefore = crepToken.balanceOf(owner);

        _settleMixedRoundWithVoters(1, 20e6, voter1, voter2, voter3);
        _settleRoundWithVoters(1, false, 20e6, voter4, voter5, voter6);

        vm.warp(T0 + 31 days + 1);
        registry.markDormant(1);

        (,,,,,, ContentRegistry.ContentStatus status,,, bool submitterStakeReturned, uint256 rating,) = registry.contents(1);
        assertEq(uint256(status), uint256(ContentRegistry.ContentStatus.Dormant), "content should transition to dormant");
        assertTrue(submitterStakeReturned, "dormancy should resolve the later slashable outcome");
        assertLt(rating, 50, "display rating should reflect the later low round");
        assertEq(crepToken.balanceOf(submitter), submitterBalanceAfterSubmit, "submitter should remain slashed");
        assertGe(
            crepToken.balanceOf(owner) - treasuryBalanceBefore,
            10e6,
            "treasury should receive at least the locked stake on dormancy slash"
        );
    }

    function _commit(address voter, uint256 contentId, bool isUp) internal returns (bytes32 commitKey, bytes32 salt) {
        return _commitWithStake(voter, contentId, isUp, STAKE);
    }

    function _commitWithStake(address voter, uint256 contentId, bool isUp, uint256 stake)
        internal
        returns (bytes32 commitKey, bytes32 salt)
    {
        salt = keccak256(abi.encodePacked(voter, block.timestamp, contentId, isUp));
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);
        uint16 referenceRatingBps = _currentRatingReferenceBps(contentId);
        bytes32 commitHash = _commitHash(
            isUp,
            salt,
            contentId,
            referenceRatingBps,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ciphertext
        );

        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), stake);
        votingEngine.commitVote(
            contentId, referenceRatingBps, _tlockCommitTargetRound(), _tlockDrandChainHash(), commitHash, ciphertext, stake, address(0)
        );
        vm.stopPrank();

        commitKey = keccak256(abi.encodePacked(voter, commitHash));
    }

    function _settleRoundWithThreeVoters(uint256 contentId, bool isUp, uint256 stakePerVoter) internal {
        _settleRoundWithVoters(contentId, isUp, stakePerVoter, voter1, voter2, voter3);
    }

    function _settleRoundWithVoters(
        uint256 contentId,
        bool isUp,
        uint256 stakePerVoter,
        address voterA,
        address voterB,
        address voterC
    ) internal {
        (bytes32 ck1, bytes32 s1) = _commitWithStake(voterA, contentId, isUp, stakePerVoter);
        (bytes32 ck2, bytes32 s2) = _commitWithStake(voterB, contentId, isUp, stakePerVoter);
        (bytes32 ck3, bytes32 s3) = _commitWithStake(voterC, contentId, isUp, stakePerVoter);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);

        vm.warp(block.timestamp + 1 hours + 1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck1, isUp, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck2, isUp, s2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck3, isUp, s3);
        votingEngine.settleRound(contentId, roundId);
    }

    function _settleMixedRound(uint256 contentId, uint256 stakePerVoter) internal {
        _settleMixedRoundWithVoters(contentId, stakePerVoter, voter1, voter2, voter3);
    }

    function _settleMixedRoundWithVoters(
        uint256 contentId,
        uint256 stakePerVoter,
        address voterA,
        address voterB,
        address voterC
    ) internal {
        (bytes32 ck1, bytes32 s1) = _commitWithStake(voterA, contentId, true, stakePerVoter);
        (bytes32 ck2, bytes32 s2) = _commitWithStake(voterB, contentId, true, stakePerVoter);
        (bytes32 ck3, bytes32 s3) = _commitWithStake(voterC, contentId, false, stakePerVoter);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);

        vm.warp(block.timestamp + 1 hours + 1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck1, true, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck2, true, s2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck3, false, s3);
        votingEngine.settleRound(contentId, roundId);
    }

    function _warpPastSlashability(uint256 contentId) internal {
        RatingLib.RatingState memory state = registry.getRatingState(contentId);
        RatingLib.SlashConfig memory slashConfig = registry.getSlashConfigForContent(contentId);
        (,,,, uint48 createdAt,,,,,,,) = registry.contents(contentId);

        uint256 earliestSlashAt = uint256(state.lowSince) + slashConfig.minSlashLowDuration + 1;
        uint256 submitterGraceEndsAt = uint256(createdAt) + 24 hours + 1;
        uint256 nextTimestamp = earliestSlashAt > submitterGraceEndsAt ? earliestSlashAt : submitterGraceEndsAt;
        vm.warp(nextTimestamp);
    }

    function _setAggressiveSlashConfig() internal {
        ProtocolConfig protocolConfig = ProtocolConfig(address(votingEngine.protocolConfig()));
        vm.startPrank(owner);
        protocolConfig.setSlashConfig(3_000, 1, 2 days, 50e6);
        vm.stopPrank();
    }
}
