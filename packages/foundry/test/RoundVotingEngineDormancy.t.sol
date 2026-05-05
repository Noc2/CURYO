// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { HumanReputation } from "../contracts/HumanReputation.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";

contract RoundVotingEngineDormancyTest is VotingTestBase {
    HumanReputation public hrepToken;
    ContentRegistry public registry;
    RoundVotingEngine public engine;

    address public owner = address(1);
    address public submitter = address(2);
    address public voter1 = address(3);
    address public voter2 = address(4);
    address public voter3 = address(5);
    address public voter4 = address(6);

    uint256 public constant STAKE = 5e6;
    uint256 public constant T0 = 1_000_000;

    function setUp() public {
        vm.warp(T0);
        vm.startPrank(owner);

        hrepToken = new HumanReputation(owner, owner);
        hrepToken.grantRole(hrepToken.MINTER_ROLE(), owner);

        ContentRegistry registryImpl = new ContentRegistry();
        RoundVotingEngine engineImpl = new RoundVotingEngine();

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

        registry.setVotingEngine(address(engine));

        MockCategoryRegistry mockCategoryRegistry = new MockCategoryRegistry();
        mockCategoryRegistry.seedDefaultTestCategories();
        registry.setCategoryRegistry(address(mockCategoryRegistry));

        _setTlockRoundConfig(ProtocolConfig(address(engine.protocolConfig())), 1 hours, 7 days, 3, 1000);

        address[5] memory users = [submitter, voter1, voter2, voter3, voter4];
        for (uint256 i = 0; i < users.length; i++) {
            hrepToken.mint(users[i], 10_000e6);
        }

        vm.stopPrank();
    }

    function test_CommitAfterRevealFailedGrace_StartsNewRoundBeforeDormancyWindowElapses() public {
        uint256 contentId = _submitContent();

        _commit(voter1, contentId, true);
        _commit(voter2, contentId, false);
        _commit(voter3, contentId, true);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        vm.warp(round.startTime + 7 days + ProtocolConfig(address(engine.protocolConfig())).revealGracePeriod() + 1);

        _commit(voter4, contentId, true);

        RoundLib.Round memory failedRound = RoundEngineReadHelpers.round(engine, contentId, roundId);
        uint256 newRoundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        assertEq(uint256(failedRound.state), uint256(RoundLib.RoundState.RevealFailed));
        assertEq(newRoundId, roundId + 1, "new commits should still roll into a fresh round before dormancy");
    }

    function test_CommitAfterRevealFailedGrace_RevertsOnceDormancyElapsed() public {
        uint256 contentId = _submitContent();

        _commit(voter1, contentId, true);
        _commit(voter2, contentId, false);
        _commit(voter3, contentId, true);

        bytes32 salt = keccak256(abi.encodePacked(voter4, block.timestamp, contentId));
        bytes memory ciphertext = _testCiphertext(true, salt, contentId);
        bytes32 commitHash = _commitHash(true, salt, contentId, ciphertext);

        vm.warp(T0 + 31 days);
        vm.startPrank(voter4);
        hrepToken.approve(address(engine), STAKE);
        uint256 cachedRoundContext1 =
            _roundContext(engine.previewCommitRoundId(contentId), _defaultRatingReferenceBps());
        vm.expectRevert(RoundVotingEngine.DormancyWindowElapsed.selector);
        engine.commitVote(
            contentId,
            cachedRoundContext1,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            commitHash,
            ciphertext,
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        assertEq(roundId, 1, "dormancy should block opening a fresh round");
        RoundLib.Round memory openRound = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(openRound.state), uint256(RoundLib.RoundState.Open));
    }

    function _submitContent() internal returns (uint256 contentId) {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/dormancy", "test goal", "test goal", "test", 0);
        vm.stopPrank();
        return 1;
    }

    function _commit(address voter, uint256 contentId, bool isUp) internal {
        bytes32 salt = keccak256(abi.encodePacked(voter, block.timestamp));
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);
        bytes32 commitHash = _commitHash(isUp, salt, contentId, ciphertext);
        vm.startPrank(voter);
        hrepToken.approve(address(engine), STAKE);
        uint256 cachedRoundContext2 =
            _roundContext(engine.previewCommitRoundId(contentId), _defaultRatingReferenceBps());
        engine.commitVote(
            contentId,
            cachedRoundContext2,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            commitHash,
            ciphertext,
            STAKE,
            address(0)
        );
        vm.stopPrank();
    }
}
