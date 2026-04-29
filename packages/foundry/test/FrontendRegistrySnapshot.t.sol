// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { HumanReputation } from "../contracts/HumanReputation.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";

/// @title FrontendRegistrySnapshotTest
/// @notice Guards the settlement-time snapshot preservation for frontend registry rotations.
contract FrontendRegistrySnapshotTest is VotingTestBase {
    HumanReputation public hrepToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    RoundRewardDistributor public rewardDistributor;
    ProtocolConfig public protocolConfig;
    MockCategoryRegistry public categoryRegistry;

    address public owner = address(1);
    address public submitter = address(2);
    address public voter1 = address(3);
    address public voter2 = address(4);
    address public voter3 = address(5);
    address public frontendOp = address(200);
    address public replacementOnlyFrontend = address(201);

    uint256 public constant STAKE = 5e6;

    function _tlockDrandChainHash() internal pure override returns (bytes32) {
        return DEFAULT_DRAND_CHAIN_HASH;
    }

    function _tlockDrandGenesisTime() internal pure override returns (uint64) {
        return DEFAULT_DRAND_GENESIS_TIME;
    }

    function _tlockDrandPeriod() internal pure override returns (uint64) {
        return DEFAULT_DRAND_PERIOD;
    }

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

        protocolConfig = _deployProtocolConfig(owner);

        votingEngine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engineImpl),
                    abi.encodeCall(
                        RoundVotingEngine.initialize,
                        (owner, address(hrepToken), address(registry), address(protocolConfig))
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

        categoryRegistry = new MockCategoryRegistry();
        categoryRegistry.seedCategory(1, "example.com");

        registry.setVotingEngine(address(votingEngine));
        registry.setCategoryRegistry(address(categoryRegistry));
        ProtocolConfig(address(protocolConfig)).setRewardDistributor(address(rewardDistributor));
        ProtocolConfig(address(protocolConfig)).setCategoryRegistry(address(categoryRegistry));

        FrontendRegistry originalFrontendRegistry = _deployFrontendRegistry();
        originalFrontendRegistry.setVotingEngine(address(votingEngine));
        originalFrontendRegistry.addFeeCreditor(address(rewardDistributor));
        MockVoterIdNFT originalVoterIdNFT = new MockVoterIdNFT();
        originalFrontendRegistry.setVoterIdNFT(address(originalVoterIdNFT));
        ProtocolConfig(address(protocolConfig)).setFrontendRegistry(address(originalFrontendRegistry));

        hrepToken.mint(owner, 100_000e6);
        hrepToken.mint(submitter, 10_000e6);
        hrepToken.mint(voter1, 10_000e6);
        hrepToken.mint(voter2, 10_000e6);
        hrepToken.mint(voter3, 10_000e6);
        hrepToken.mint(frontendOp, 5_000e6);
        hrepToken.mint(replacementOnlyFrontend, 5_000e6);
        originalVoterIdNFT.setHolder(frontendOp);

        vm.stopPrank();

        vm.startPrank(frontendOp);
        hrepToken.approve(address(originalFrontendRegistry), 1000e6);
        originalFrontendRegistry.register();
        vm.stopPrank();
    }

    function test_SettlementPreservesCommitTimeFrontendRegistrySnapshotAfterRotation() public {
        FrontendRegistry originalRegistry = FrontendRegistry(ProtocolConfig(address(protocolConfig)).frontendRegistry());
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 salt1) = _commit(voter1, contentId, true);
        (bytes32 ck2, bytes32 salt2) = _commit(voter2, contentId, true);
        (bytes32 ck3, bytes32 salt3) = _commit(voter3, contentId, false);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        assertEq(votingEngine.roundFrontendRegistrySnapshot(contentId, roundId), address(originalRegistry));

        FrontendRegistry replacementRegistry = _deployFrontendRegistry();
        vm.startPrank(owner);
        replacementRegistry.setVotingEngine(address(votingEngine));
        replacementRegistry.addFeeCreditor(address(rewardDistributor));
        MockVoterIdNFT replacementVoterIdNFT = new MockVoterIdNFT();
        replacementRegistry.setVoterIdNFT(address(replacementVoterIdNFT));
        replacementVoterIdNFT.setHolder(frontendOp);
        ProtocolConfig(address(protocolConfig)).setFrontendRegistry(address(replacementRegistry));
        vm.stopPrank();

        vm.startPrank(frontendOp);
        hrepToken.approve(address(replacementRegistry), 1000e6);
        replacementRegistry.register();
        vm.stopPrank();

        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        _warpPastTlockRevealTime(uint256(round.startTime) + DEFAULT_TLOCK_EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck1, true, salt1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck2, true, salt2);
        votingEngine.revealVoteByCommitKey(contentId, roundId, ck3, false, salt3);

        votingEngine.settleRound(contentId, roundId);

        assertEq(votingEngine.roundFrontendRegistrySnapshot(contentId, roundId), address(originalRegistry));

        uint256 originalFeesBefore = originalRegistry.getAccumulatedFees(frontendOp);
        uint256 replacementFeesBefore = replacementRegistry.getAccumulatedFees(frontendOp);

        vm.prank(frontendOp);
        rewardDistributor.claimFrontendFee(contentId, roundId, frontendOp);

        assertGt(originalRegistry.getAccumulatedFees(frontendOp), originalFeesBefore);
        assertEq(replacementRegistry.getAccumulatedFees(frontendOp), replacementFeesBefore);
    }

    function test_MidRoundFrontendRegistryRotation_KeepsEligibilityOnRoundSnapshot() public {
        FrontendRegistry originalRegistry = FrontendRegistry(ProtocolConfig(address(protocolConfig)).frontendRegistry());
        uint256 contentId = _submitContent();

        _commit(voter1, contentId, true);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        assertEq(votingEngine.roundFrontendRegistrySnapshot(contentId, roundId), address(originalRegistry));

        FrontendRegistry replacementRegistry = _deployFrontendRegistry();
        vm.startPrank(owner);
        replacementRegistry.setVotingEngine(address(votingEngine));
        replacementRegistry.addFeeCreditor(address(rewardDistributor));
        MockVoterIdNFT replacementVoterIdNFT = new MockVoterIdNFT();
        replacementRegistry.setVoterIdNFT(address(replacementVoterIdNFT));
        replacementVoterIdNFT.setHolder(replacementOnlyFrontend);
        ProtocolConfig(address(protocolConfig)).setFrontendRegistry(address(replacementRegistry));
        vm.stopPrank();

        vm.startPrank(replacementOnlyFrontend);
        hrepToken.approve(address(replacementRegistry), 1000e6);
        replacementRegistry.register();
        vm.stopPrank();

        (bytes32 replacementCommitKey,) = _commitWithFrontend(voter2, contentId, true, replacementOnlyFrontend);

        assertEq(votingEngine.roundFrontendRegistrySnapshot(contentId, roundId), address(originalRegistry));
        assertFalse(votingEngine.frontendEligibleAtCommit(contentId, roundId, replacementCommitKey));
    }

    function _commit(address voter, uint256 contentId, bool isUp) internal returns (bytes32 commitKey, bytes32 salt) {
        return _commitWithFrontend(voter, contentId, isUp, frontendOp);
    }

    function _commitWithFrontend(address voter, uint256 contentId, bool isUp, address frontend)
        internal
        returns (bytes32 commitKey, bytes32 salt)
    {
        salt = keccak256(abi.encodePacked(voter, contentId, isUp, block.timestamp));
        bytes32 commitHash = _commitHash(isUp, salt, voter, contentId);
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);

        vm.startPrank(voter);
        hrepToken.approve(address(votingEngine), STAKE);
        uint256 cachedRoundContext1 =
            _roundContext(votingEngine.previewCommitRoundId(contentId), _defaultRatingReferenceBps());
        votingEngine.commitVote(
            contentId,
            cachedRoundContext1,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            commitHash,
            ciphertext,
            STAKE,
            frontend
        );
        vm.stopPrank();

        commitKey = _commitKey(voter, commitHash);
    }

    function _submitContent() internal returns (uint256 contentId) {
        vm.startPrank(submitter);
        hrepToken.approve(address(registry), 10e6);
        _submitContentWithReservation(
            registry, "https://example.com/frontend-snapshot", "test goal", "test goal", "test", 1
        );
        vm.stopPrank();
        return registry.nextContentId() - 1;
    }

    function _deployFrontendRegistry() internal returns (FrontendRegistry frontendRegistry) {
        FrontendRegistry impl = new FrontendRegistry();
        frontendRegistry = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(FrontendRegistry.initialize, (owner, owner, address(hrepToken)))
                )
            )
        );
    }
}
