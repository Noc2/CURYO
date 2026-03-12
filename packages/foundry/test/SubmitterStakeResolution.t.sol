// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";

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
                    abi.encodeCall(RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry)))
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
        votingEngine.setRewardDistributor(address(rewardDistributor));
        votingEngine.setTreasury(owner);
        votingEngine.setConfig(1 hours, 7 days, 3, 1000);

        crepToken.mint(owner, 500_000e6);
        crepToken.approve(address(votingEngine), 500_000e6);
        votingEngine.addToConsensusReserve(500_000e6);

        address[5] memory users = [submitter, voter1, voter2, voter3, voter4];
        for (uint256 i = 0; i < users.length; i++) {
            crepToken.mint(users[i], 10_000e6);
        }

        vm.stopPrank();
    }

    function test_ResolveSubmitterStake_AllowsResolutionWhileLaterRoundIsOpen() public {
        uint256 submitterBalanceBefore = crepToken.balanceOf(submitter);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "goal", "goal", "tags", 0);
        vm.stopPrank();

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

        assertTrue(registry.isSubmitterStakeReturned(1), "submitter stake should resolve even if a later round is open");
        assertEq(
            crepToken.balanceOf(submitter) - submitterBalanceBefore,
            0,
            "healthy resolution should only release the locked submitter stake"
        );
    }

    function test_ResolveSubmitterStake_AllowsDormancyFallbackWhileLaterRoundIsOpenWithoutSettlement() public {
        uint256 submitterBalanceBefore = crepToken.balanceOf(submitter);

        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/no-settlement", "goal", "goal", "tags", 0);
        vm.stopPrank();

        _commit(voter1, 1, true);
        uint256 activeRoundId = RoundEngineReadHelpers.activeRoundId(votingEngine, 1);
        assertTrue(activeRoundId != 0, "later round should remain open");

        vm.warp(T0 + 31 days);
        votingEngine.resolveSubmitterStake(1);

        assertTrue(registry.isSubmitterStakeReturned(1), "dormancy fallback should resolve even with an open round");
        assertEq(
            crepToken.balanceOf(submitter) - submitterBalanceBefore,
            0,
            "dormancy fallback should only release the locked stake"
        );
    }

    function _commit(address voter, uint256 contentId, bool isUp) internal returns (bytes32 commitKey, bytes32 salt) {
        salt = keccak256(abi.encodePacked(voter, block.timestamp, contentId, isUp));
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);
        bytes32 commitHash = _commitHash(isUp, salt, contentId, ciphertext);

        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(contentId, commitHash, ciphertext, STAKE, address(0));
        vm.stopPrank();

        commitKey = keccak256(abi.encodePacked(voter, commitHash));
    }
}
