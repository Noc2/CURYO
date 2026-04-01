// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ContentRegistry} from "../contracts/ContentRegistry.sol";
import {RoundVotingEngine} from "../contracts/RoundVotingEngine.sol";
import {ProtocolConfig} from "../contracts/ProtocolConfig.sol";
import {RoundRewardDistributor} from "../contracts/RoundRewardDistributor.sol";
import {CuryoReputation} from "../contracts/CuryoReputation.sol";
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

    function test_ResolveSubmitterStake_SlashPathWorksAfterGrace() public {
        uint256 slashStake = 20e6;

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/slash-path", "goal", "goal", "tags", 0);
        vm.stopPrank();

        (bytes32 commitKey1, bytes32 salt1) = _commitWithStake(voter1, 1, false, slashStake);
        (bytes32 commitKey2, bytes32 salt2) = _commitWithStake(voter2, 1, false, slashStake);
        (bytes32 commitKey3, bytes32 salt3) = _commitWithStake(voter3, 1, false, slashStake);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);

        vm.warp(T0 + 1 hours + 1);
        votingEngine.revealVoteByCommitKey(1, roundId, commitKey1, false, salt1);
        votingEngine.revealVoteByCommitKey(1, roundId, commitKey2, false, salt2);
        votingEngine.revealVoteByCommitKey(1, roundId, commitKey3, false, salt3);
        votingEngine.settleRound(1, roundId);

        vm.warp(T0 + 24 hours + 1);
        votingEngine.resolveSubmitterStake(1);

        (,,,,,,,,, bool submitterStakeReturned,,) = registry.contents(1);
        assertTrue(submitterStakeReturned, "low ratings should become slash-resolvable after grace");
    }

    function test_ResolveSubmitterStake_UsesFirstSettledRoundWhenLaterRoundTurnsHealthy() public {
        uint256 slashStake = 20e6;

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/freeze-slash", "goal", "goal", "tags", 0);
        vm.stopPrank();
        uint256 submitterBalanceAfterSubmit = crepToken.balanceOf(submitter);
        uint256 treasuryBalanceBefore = crepToken.balanceOf(owner);

        (bytes32 ck1, bytes32 s1) = _commitWithStake(voter1, 1, false, slashStake);
        (bytes32 ck2, bytes32 s2) = _commitWithStake(voter2, 1, false, slashStake);
        (bytes32 ck3, bytes32 s3) = _commitWithStake(voter3, 1, false, slashStake);
        uint256 round1Id = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);

        vm.warp(T0 + 1 hours + 1);
        votingEngine.revealVoteByCommitKey(1, round1Id, ck1, false, s1);
        votingEngine.revealVoteByCommitKey(1, round1Id, ck2, false, s2);
        votingEngine.revealVoteByCommitKey(1, round1Id, ck3, false, s3);
        votingEngine.settleRound(1, round1Id);

        (bytes32 ck4, bytes32 s4) = _commitWithStake(voter4, 1, true, slashStake);
        (bytes32 ck5, bytes32 s5) = _commitWithStake(voter5, 1, true, slashStake);
        (bytes32 ck6, bytes32 s6) = _commitWithStake(voter6, 1, true, slashStake);
        uint256 round2Id = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);

        vm.warp(T0 + 2 hours + 2);
        votingEngine.revealVoteByCommitKey(1, round2Id, ck4, true, s4);
        votingEngine.revealVoteByCommitKey(1, round2Id, ck5, true, s5);
        votingEngine.revealVoteByCommitKey(1, round2Id, ck6, true, s6);
        votingEngine.settleRound(1, round2Id);

        vm.warp(T0 + 24 hours + 1);
        votingEngine.resolveSubmitterStake(1);

        (,,,,,,,,, bool submitterStakeReturned, uint256 rating,) = registry.contents(1);
        assertTrue(submitterStakeReturned, "submitter stake should resolve from the frozen first-settlement outcome");
        assertGt(rating, registry.SLASH_RATING_THRESHOLD(), "live rating should reflect the later healthy round");
        assertEq(
            crepToken.balanceOf(submitter),
            submitterBalanceAfterSubmit,
            "submitter should remain slashed even after a later healthy round"
        );
        assertEq(
            crepToken.balanceOf(owner) - treasuryBalanceBefore,
            10e6,
            "treasury should receive the locked submitter stake from the first-settlement slash path"
        );
    }

    function test_ResolveSubmitterStake_UsesFirstSettledRoundWhenLaterRoundTurnsSlashable() public {
        uint256 rewriteStake = 20e6;

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/freeze-healthy", "goal", "goal", "tags", 0);
        vm.stopPrank();
        uint256 submitterBalanceAfterSubmit = crepToken.balanceOf(submitter);

        (bytes32 ck1, bytes32 s1) = _commitWithStake(voter1, 1, true, rewriteStake);
        (bytes32 ck2, bytes32 s2) = _commitWithStake(voter2, 1, true, rewriteStake);
        (bytes32 ck3, bytes32 s3) = _commitWithStake(voter3, 1, false, rewriteStake);
        uint256 round1Id = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);

        vm.warp(T0 + 1 hours + 1);
        votingEngine.revealVoteByCommitKey(1, round1Id, ck1, true, s1);
        votingEngine.revealVoteByCommitKey(1, round1Id, ck2, true, s2);
        votingEngine.revealVoteByCommitKey(1, round1Id, ck3, false, s3);
        votingEngine.settleRound(1, round1Id);

        (bytes32 ck4, bytes32 s4) = _commitWithStake(voter4, 1, false, rewriteStake);
        (bytes32 ck5, bytes32 s5) = _commitWithStake(voter5, 1, false, rewriteStake);
        (bytes32 ck6, bytes32 s6) = _commitWithStake(voter6, 1, false, rewriteStake);
        uint256 round2Id = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);

        vm.warp(T0 + 2 hours + 2);
        votingEngine.revealVoteByCommitKey(1, round2Id, ck4, false, s4);
        votingEngine.revealVoteByCommitKey(1, round2Id, ck5, false, s5);
        votingEngine.revealVoteByCommitKey(1, round2Id, ck6, false, s6);
        votingEngine.settleRound(1, round2Id);

        vm.warp(T0 + 4 days + 1);
        votingEngine.resolveSubmitterStake(1);

        (,,,,,,,,, bool submitterStakeReturned, uint256 rating,) = registry.contents(1);
        assertTrue(submitterStakeReturned, "submitter stake should still resolve from the first healthy settlement");
        assertLt(rating, registry.SLASH_RATING_THRESHOLD(), "live rating should reflect the later slashable round");
        assertEq(
            crepToken.balanceOf(submitter) - submitterBalanceAfterSubmit,
            10e6,
            "submitter should still receive the locked stake from the first healthy settlement"
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
        bytes32 commitHash = _commitHash(isUp, salt, contentId, ciphertext);

        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), stake);
        votingEngine.commitVote(
            contentId, _tlockCommitTargetRound(), _tlockDrandChainHash(), commitHash, ciphertext, stake, address(0)
        );
        vm.stopPrank();

        commitKey = keccak256(abi.encodePacked(voter, commitHash));
    }
}
