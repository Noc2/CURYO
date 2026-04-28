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
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";

/// @title RoundRewardDistributor branch coverage tests (tlock commit-reveal)
contract RoundRewardDistributorBranchesTest is VotingTestBase {
    HumanReputation public hrepToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    RoundRewardDistributor public rewardDistributor;

    address public owner = address(1);
    address public submitter = address(2);
    address public voter1 = address(3);
    address public voter2 = address(4);
    address public voter3 = address(5);
    address public keeper = address(9);
    address public treasury = address(100);

    uint256 public constant T0 = 1000;
    uint256 public constant STAKE = 5e6;
    uint256 public constant EPOCH_DURATION = 5 minutes;

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
        MockCategoryRegistry mockCategoryRegistry = new MockCategoryRegistry();
        mockCategoryRegistry.seedDefaultTestCategories();
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(votingEngine.protocolConfig())).setRewardDistributor(address(rewardDistributor));
        ProtocolConfig(address(votingEngine.protocolConfig())).setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(votingEngine.protocolConfig())).setTreasury(treasury);
        // 4 params: epochDuration, maxDuration, minVoters, maxVoters
        _setTlockRoundConfig(ProtocolConfig(address(votingEngine.protocolConfig())), EPOCH_DURATION, 7 days, 2, 200);

        hrepToken.mint(owner, 1_000_000e6);
        hrepToken.approve(address(votingEngine), 500_000e6);
        votingEngine.addToConsensusReserve(500_000e6);

        address[5] memory users = [submitter, voter1, voter2, voter3, keeper];
        for (uint256 i = 0; i < users.length; i++) {
            hrepToken.mint(users[i], 10_000e6);
        }

        vm.stopPrank();
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _commit(address voter, uint256 contentId, bool isUp, uint256 stake)
        internal
        returns (bytes32 ck, bytes32 salt)
    {
        salt = keccak256(abi.encodePacked(voter, contentId));
        bytes32 ch = _commitHash(isUp, salt, voter, contentId);
        bytes memory ct = _testCiphertext(isUp, salt, contentId);
        vm.prank(voter);
        hrepToken.approve(address(votingEngine), stake);
        vm.prank(voter);
        votingEngine.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch,
            ct,
            stake,
            address(0)
        );
        ck = _commitKey(voter, ch);
    }

    function _vote(address voter, uint256 contentId, bool isUp) internal {
        _commit(voter, contentId, isUp, STAKE);
    }

    function _revealAll(uint256 contentId, uint256 roundId) internal {
        bytes32[] memory keys = RoundEngineReadHelpers.commitKeys(votingEngine, contentId, roundId);
        for (uint256 i = 0; i < keys.length; i++) {
            RoundLib.Commit memory c = RoundEngineReadHelpers.commit(votingEngine, contentId, roundId, keys[i]);
            if (!c.revealed && c.stakeAmount > 0) {
                (bool isUp, bytes32 salt) = _decodeTestCiphertext(c.ciphertext);
                try votingEngine.revealVoteByCommitKey(contentId, roundId, keys[i], isUp, salt) { } catch { }
            }
        }
    }

    function _forceSettle(uint256 contentId) internal {
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        if (roundId == 0) return;

        RoundLib.Round memory r = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(r.startTime) + EPOCH_DURATION);
        _revealAll(contentId, roundId);

        RoundLib.Round memory r2 = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        if (r2.thresholdReachedAt > 0) {
            try votingEngine.settleRound(contentId, roundId) { } catch { }
        }
    }

    function _setupSettledRound() internal returns (uint256 contentId, uint256 roundId) {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();
        contentId = 1;

        _vote(voter1, contentId, true);
        _vote(voter2, contentId, true);
        _vote(voter3, contentId, false);

        roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        _forceSettle(contentId);
    }

    // =========================================================================
    // claimReward BRANCHES
    // =========================================================================

    function test_ClaimReward_AlreadyClaimed_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupSettledRound();

        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);

        vm.prank(voter1);
        vm.expectRevert("Already claimed");
        rewardDistributor.claimReward(contentId, roundId);
    }

    function test_ClaimReward_RoundNotSettled_Reverts() public {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

        _vote(voter1, 1, true);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);

        vm.prank(voter1);
        vm.expectRevert("Round not settled");
        rewardDistributor.claimReward(1, roundId);
    }

    function test_ClaimReward_NoVoteFound_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupSettledRound();

        // keeper never committed
        vm.prank(keeper);
        vm.expectRevert("No vote found");
        rewardDistributor.claimReward(contentId, roundId);
    }

    function test_ClaimReward_LoserGetsFivePercentRefund() public {
        (uint256 contentId, uint256 roundId) = _setupSettledRound();

        uint256 balBefore = hrepToken.balanceOf(voter3);
        vm.prank(voter3);
        rewardDistributor.claimReward(contentId, roundId);
        uint256 balAfter = hrepToken.balanceOf(voter3);

        assertEq(balAfter - balBefore, STAKE / 20); // loser gets 5%
    }

    function test_ClaimReward_WinnerGetsReward() public {
        (uint256 contentId, uint256 roundId) = _setupSettledRound();

        uint256 balBefore = hrepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        uint256 balAfter = hrepToken.balanceOf(voter1);

        assertGt(balAfter, balBefore); // winner gets stake + reward
    }

    // =========================================================================
    // initialize BRANCHES
    // =========================================================================

    function test_Initialize_ZeroGovernance_Reverts() public {
        RoundRewardDistributor impl = new RoundRewardDistributor();
        vm.expectRevert("Invalid governance");
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(
                RoundRewardDistributor.initialize,
                (address(0), address(hrepToken), address(votingEngine), address(registry))
            )
        );
    }

    function test_Initialize_ZeroHrepToken_Reverts() public {
        RoundRewardDistributor impl = new RoundRewardDistributor();
        vm.expectRevert("Invalid HREP token");
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(
                RoundRewardDistributor.initialize, (owner, address(0), address(votingEngine), address(registry))
            )
        );
    }

    function test_Initialize_ZeroVotingEngine_Reverts() public {
        RoundRewardDistributor impl = new RoundRewardDistributor();
        vm.expectRevert("Invalid voting engine");
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(
                RoundRewardDistributor.initialize, (owner, address(hrepToken), address(0), address(registry))
            )
        );
    }

    function test_Initialize_ZeroRegistry_Reverts() public {
        RoundRewardDistributor impl = new RoundRewardDistributor();
        vm.expectRevert("Invalid registry");
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(
                RoundRewardDistributor.initialize, (owner, address(hrepToken), address(votingEngine), address(0))
            )
        );
    }

    function test_SetVotingEngine_RevertsForReplacement() public {
        address newEngine = address(0xBEEF);

        vm.prank(owner);
        vm.expectRevert("Voting engine immutable");
        rewardDistributor.setVotingEngine(newEngine);
    }

    function test_SetVotingEngine_RevertsForReplacementAfterDrainAndDust() public {
        RoundVotingEngine engineImpl = new RoundVotingEngine();
        RoundVotingEngine emptyOldEngine = RoundVotingEngine(
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
        address newEngine = address(0xBEEF);
        RoundRewardDistributor impl = new RoundRewardDistributor();
        RoundRewardDistributor freshDistributor = RoundRewardDistributor(
            address(
                new ERC1967Proxy(
                    address(impl),
                    abi.encodeCall(
                        RoundRewardDistributor.initialize,
                        (owner, address(hrepToken), address(emptyOldEngine), address(registry))
                    )
                )
            )
        );
        vm.prank(owner);
        hrepToken.transfer(address(emptyOldEngine), 1);
        assertEq(emptyOldEngine.accountedHrepBalance(), 0);

        vm.prank(owner);
        vm.expectRevert("Voting engine immutable");
        freshDistributor.setVotingEngine(newEngine);

        assertEq(address(freshDistributor.votingEngine()), address(emptyOldEngine));
    }

    function test_SetVotingEngine_AllowsCurrentEngineNoop() public {
        vm.prank(owner);
        rewardDistributor.setVotingEngine(address(votingEngine));

        assertEq(address(rewardDistributor.votingEngine()), address(votingEngine));
    }

    function test_SetVotingEngine_ZeroAddressReverts() public {
        vm.prank(owner);
        vm.expectRevert("Invalid voting engine");
        rewardDistributor.setVotingEngine(address(0));
    }

    function test_SetVotingEngine_OnlyAdmin() public {
        vm.prank(voter1);
        vm.expectRevert();
        rewardDistributor.setVotingEngine(address(0xBEEF));
    }

    // =========================================================================
    // stranded HREP recovery
    // =========================================================================

    function test_SweepStrandedHrepToTreasury_TransfersFullBalance() public {
        ProtocolConfig protocolConfig = ProtocolConfig(address(votingEngine.protocolConfig()));
        address updatedTreasury = address(101);
        vm.prank(owner);
        protocolConfig.setTreasury(updatedTreasury);

        vm.prank(owner);
        hrepToken.mint(address(rewardDistributor), 7e6);

        uint256 treasuryBefore = hrepToken.balanceOf(updatedTreasury);

        vm.prank(owner);
        uint256 swept = rewardDistributor.sweepStrandedHrepToTreasury();

        assertEq(swept, 7e6);
        assertEq(hrepToken.balanceOf(address(rewardDistributor)), 0);
        assertEq(hrepToken.balanceOf(updatedTreasury), treasuryBefore + 7e6);
    }

    function test_SweepStrandedHrepToTreasury_UsesInitializedProtocolTreasury() public view {
        assertEq(ProtocolConfig(address(votingEngine.protocolConfig())).treasury(), treasury);
    }

    function test_SweepStrandedHrepToTreasury_NoBalance_Reverts() public {
        vm.expectRevert(RoundRewardDistributor.NoStrandedHrep.selector);
        vm.prank(owner);
        rewardDistributor.sweepStrandedHrepToTreasury();
    }

    function test_SweepStrandedHrepToTreasury_NonAdmin_Reverts() public {
        vm.prank(owner);
        hrepToken.mint(address(rewardDistributor), 1e6);

        vm.expectRevert();
        vm.prank(voter1);
        rewardDistributor.sweepStrandedHrepToTreasury();
    }

    function test_SweepStrandedHrepToTreasury_UsesProtocolTreasuryWhenRegistryDiffers() public {
        address registryTreasury = address(0xCAFE);
        vm.startPrank(owner);
        registry.setTreasury(registryTreasury);
        ProtocolConfig(address(votingEngine.protocolConfig())).setTreasury(treasury);
        vm.stopPrank();

        vm.prank(owner);
        hrepToken.mint(address(rewardDistributor), 2e6);

        uint256 protocolTreasuryBefore = hrepToken.balanceOf(treasury);
        uint256 registryTreasuryBefore = hrepToken.balanceOf(registryTreasury);

        vm.prank(owner);
        rewardDistributor.sweepStrandedHrepToTreasury();

        assertEq(hrepToken.balanceOf(treasury), protocolTreasuryBefore + 2e6);
        assertEq(hrepToken.balanceOf(registryTreasury), registryTreasuryBefore);
    }
}
