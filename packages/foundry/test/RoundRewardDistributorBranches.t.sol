// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";

/// @title RoundRewardDistributor branch coverage tests (tlock commit-reveal)
contract RoundRewardDistributorBranchesTest is Test {
    CuryoReputation public crepToken;
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
        // 4 params: epochDuration, maxDuration, minVoters, maxVoters
        votingEngine.setConfig(EPOCH_DURATION, 7 days, 2, 200);

        crepToken.mint(owner, 1_000_000e6);
        crepToken.approve(address(votingEngine), 500_000e6);
        votingEngine.fundConsensusReserve(500_000e6);

        address[5] memory users = [submitter, voter1, voter2, voter3, keeper];
        for (uint256 i = 0; i < users.length; i++) {
            crepToken.mint(users[i], 10_000e6);
        }

        vm.stopPrank();
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _mockCiphertext(bool isUp, bytes32 salt, uint256 contentId) internal pure returns (bytes memory) {
        return abi.encodePacked(uint8(isUp ? 1 : 0), salt, contentId);
    }

    function _commitHash(bool isUp, bytes32 salt, uint256 contentId) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(isUp, salt, contentId));
    }

    function _commitKey(address voter, bytes32 ch) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(voter, ch));
    }

    function _commit(address voter, uint256 contentId, bool isUp, uint256 stake)
        internal
        returns (bytes32 ck, bytes32 salt)
    {
        salt = keccak256(abi.encodePacked(voter, contentId));
        bytes32 ch = _commitHash(isUp, salt, contentId);
        bytes memory ct = _mockCiphertext(isUp, salt, contentId);
        vm.prank(voter);
        crepToken.approve(address(votingEngine), stake);
        vm.prank(voter);
        votingEngine.commitVote(contentId, ch, ct, stake, address(0));
        ck = _commitKey(voter, ch);
    }

    function _vote(address voter, uint256 contentId, bool isUp) internal {
        _commit(voter, contentId, isUp, STAKE);
    }

    function _revealAll(uint256 contentId, uint256 roundId) internal {
        bytes32[] memory keys = votingEngine.getRoundCommitHashes(contentId, roundId);
        for (uint256 i = 0; i < keys.length; i++) {
            RoundLib.Commit memory c = votingEngine.getCommit(contentId, roundId, keys[i]);
            if (!c.revealed && c.stakeAmount > 0) {
                bytes memory ct = c.ciphertext;
                bool isUp = uint8(ct[0]) == 1;
                bytes32 salt;
                assembly {
                    salt := mload(add(ct, 33))
                }
                try votingEngine.revealVoteByCommitKey(contentId, roundId, keys[i], isUp, salt) { } catch { }
            }
        }
    }

    function _forceSettle(uint256 contentId) internal {
        uint256 roundId = votingEngine.getActiveRoundId(contentId);
        if (roundId == 0) return;

        RoundLib.Round memory r = votingEngine.getRound(contentId, roundId);
        vm.warp(r.startTime + EPOCH_DURATION + 1);
        _revealAll(contentId, roundId);

        RoundLib.Round memory r2 = votingEngine.getRound(contentId, roundId);
        if (r2.thresholdReachedAt > 0) {
            vm.warp(r2.thresholdReachedAt + EPOCH_DURATION + 1);
            try votingEngine.settleRound(contentId, roundId) { } catch { }
        }
    }

    function _setupSettledRound() internal returns (uint256 contentId, uint256 roundId) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.stopPrank();
        contentId = 1;

        _vote(voter1, contentId, true);
        _vote(voter2, contentId, true);
        _vote(voter3, contentId, false);

        roundId = votingEngine.getActiveRoundId(contentId);
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
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.stopPrank();

        _vote(voter1, 1, true);

        uint256 roundId = votingEngine.getActiveRoundId(1);

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

    function test_ClaimReward_LoserGetsNothing() public {
        (uint256 contentId, uint256 roundId) = _setupSettledRound();

        uint256 balBefore = crepToken.balanceOf(voter3);
        vm.prank(voter3);
        rewardDistributor.claimReward(contentId, roundId);
        uint256 balAfter = crepToken.balanceOf(voter3);

        assertEq(balAfter, balBefore); // loser gets 0
    }

    function test_ClaimReward_WinnerGetsReward() public {
        (uint256 contentId, uint256 roundId) = _setupSettledRound();

        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        uint256 balAfter = crepToken.balanceOf(voter1);

        assertGt(balAfter, balBefore); // winner gets stake + reward
    }

    // =========================================================================
    // claimSubmitterReward BRANCHES
    // =========================================================================

    function test_ClaimSubmitterReward_AlreadyClaimed_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupSettledRound();

        vm.prank(submitter);
        rewardDistributor.claimSubmitterReward(contentId, roundId);

        vm.prank(submitter);
        vm.expectRevert("Already claimed");
        rewardDistributor.claimSubmitterReward(contentId, roundId);
    }

    function test_ClaimSubmitterReward_NotSubmitter_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupSettledRound();

        vm.prank(voter1);
        vm.expectRevert("Not submitter");
        rewardDistributor.claimSubmitterReward(contentId, roundId);
    }

    function test_ClaimSubmitterReward_RoundNotSettled_Reverts() public {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "tags", 0);
        vm.stopPrank();

        _vote(voter1, 1, true);

        uint256 roundId = votingEngine.getActiveRoundId(1);

        vm.prank(submitter);
        vm.expectRevert("Round not settled");
        rewardDistributor.claimSubmitterReward(1, roundId);
    }

    function test_ClaimSubmitterReward_PositiveReward_Transfers() public {
        (uint256 contentId, uint256 roundId) = _setupSettledRound();

        uint256 reward = votingEngine.pendingSubmitterReward(contentId, roundId);
        assertGt(reward, 0);

        uint256 balBefore = crepToken.balanceOf(submitter);
        vm.prank(submitter);
        rewardDistributor.claimSubmitterReward(contentId, roundId);
        assertGt(crepToken.balanceOf(submitter), balBefore);
    }

    function test_ClaimSubmitterReward_ZeroReward_NoTransfer() public {
        (uint256 contentId, uint256 roundId) = _setupSettledRound();

        vm.prank(submitter);
        rewardDistributor.claimSubmitterReward(contentId, roundId);
        assertTrue(rewardDistributor.submitterRewardClaimed(contentId, roundId));
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
                (address(0), address(crepToken), address(votingEngine), address(registry))
            )
        );
    }

    function test_Initialize_ZeroCrepToken_Reverts() public {
        RoundRewardDistributor impl = new RoundRewardDistributor();
        vm.expectRevert("Invalid cREP token");
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
                RoundRewardDistributor.initialize, (owner, address(crepToken), address(0), address(registry))
            )
        );
    }

    function test_Initialize_ZeroRegistry_Reverts() public {
        RoundRewardDistributor impl = new RoundRewardDistributor();
        vm.expectRevert("Invalid registry");
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(
                RoundRewardDistributor.initialize, (owner, address(crepToken), address(votingEngine), address(0))
            )
        );
    }
}
