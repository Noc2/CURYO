// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test, console2 } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { RoundIntegrationTest } from "./RoundIntegration.t.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { VoterIdNFT } from "../contracts/VoterIdNFT.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockVotingEngineForFrontendGas {
    uint256 public totalAddedToReserve;

    function addToConsensusReserve(uint256 amount) external {
        totalAddedToReserve += amount;
    }

    function transferReward(address, uint256) external { }
}

contract UserTransactionGasEstimatesTest is RoundIntegrationTest {
    function _voteTransferPayload(
        uint256 contentId,
        bytes32 commitHash,
        bytes memory ciphertext,
        address frontend
    ) internal view returns (bytes memory) {
        return abi.encode(
            contentId,
            votingEngine.previewCommitReferenceRatingBps(contentId),
            commitHash,
            ciphertext,
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            frontend
        );
    }

    function _measureCall(address target, bytes memory callData) internal returns (uint256 gasUsed) {
        vm.resumeGasMetering();
        uint256 gasBefore = gasleft();
        (bool success,) = target.call(callData);
        gasUsed = gasBefore - gasleft();
        vm.pauseGasMetering();
        assertTrue(success, "measured call reverted");
    }

    function _measureCallAs(address caller, address target, bytes memory callData) internal returns (uint256 gasUsed) {
        vm.pauseGasMetering();
        vm.startPrank(caller);
        vm.resumeGasMetering();
        uint256 gasBefore = gasleft();
        (bool success,) = target.call(callData);
        gasUsed = gasBefore - gasleft();
        vm.pauseGasMetering();
        vm.stopPrank();
        assertTrue(success, "measured pranked call reverted");
    }

    function testGasEstimate_approveForSubmit_logs() public {
        vm.pauseGasMetering();
        uint256 gasUsed =
            _measureCallAs(submitter, address(crepToken), abi.encodeCall(IERC20.approve, (address(registry), 10e6)));
        console2.log("approve_for_submit_gas", gasUsed);
    }

    function testGasEstimate_submitContent_logs() public {
        vm.pauseGasMetering();
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        vm.stopPrank();

        (, bytes32 submissionKey) = registry.previewSubmissionKey("https://example.com/gas-report", 0);
        bytes32 salt = keccak256(
            abi.encode(
                "https://example.com/gas-report",
                "test goal",
                "test goal",
                "test",
                uint256(0),
                submitter,
                block.timestamp,
                block.number
            )
        );
        bytes32 revealCommitment =
            keccak256(abi.encode(submissionKey, "test goal", "test goal", "test", uint256(0), salt, submitter));

        uint256 reserveGasUsed = _measureCallAs(
            submitter, address(registry), abi.encodeCall(ContentRegistry.reserveSubmission, (revealCommitment))
        );
        vm.warp(block.timestamp + 1);
        uint256 revealGasUsed = _measureCallAs(
            submitter,
            address(registry),
            abi.encodeCall(
                ContentRegistry.submitContent,
                ("https://example.com/gas-report", "test goal", "test goal", "test", 0, salt)
            )
        );
        console2.log("reserve_submission_gas", reserveGasUsed);
        console2.log("submit_content_reveal_gas", revealGasUsed);
        console2.log("submit_content_total_gas", reserveGasUsed + revealGasUsed);
    }

    function testGasEstimate_voteTransferAndCall_logs() public {
        vm.pauseGasMetering();
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(999)));
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = _testCiphertext(true, salt, contentId);
        bytes memory payload = _voteTransferPayload(contentId, commitHash, ciphertext, address(0));

        uint256 gasUsed = _measureCallAs(
            voter1,
            address(crepToken),
            abi.encodeWithSignature("transferAndCall(address,uint256,bytes)", address(votingEngine), STAKE, payload)
        );
        console2.log("vote_transferAndCall_gas", gasUsed);
    }

    function testGasEstimate_voteTransferAndCallWithEligibleFrontend_logs() public {
        vm.pauseGasMetering();
        (, address frontendOp) = _setupFrontendRegistry();
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(1002)));
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = _testCiphertext(true, salt, contentId);
        bytes memory payload = _voteTransferPayload(contentId, commitHash, ciphertext, frontendOp);

        uint256 gasUsed = _measureCallAs(
            voter1,
            address(crepToken),
            abi.encodeWithSignature("transferAndCall(address,uint256,bytes)", address(votingEngine), STAKE, payload)
        );
        console2.log("vote_transferAndCall_with_eligible_frontend_gas", gasUsed);
    }

    function testGasEstimate_voteApprovePlusCommit_logs() public {
        vm.pauseGasMetering();
        uint256 contentId = _submitContent();
        uint16 roundReferenceRatingBps = votingEngine.previewCommitReferenceRatingBps(contentId);
        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(1000)));
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = _testCiphertext(true, salt, contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        vm.stopPrank();

        uint256 gasUsed = _measureCallAs(
            voter1,
            address(votingEngine),
            abi.encodeWithSelector(
                bytes4(keccak256("commitVote(uint256,uint16,uint64,bytes32,bytes32,bytes,uint256,address)")),
                contentId,
                roundReferenceRatingBps,
                _tlockCommitTargetRound(),
                _tlockDrandChainHash(),
                commitHash,
                ciphertext,
                STAKE,
                address(0)
            )
        );
        console2.log("vote_approve_plus_commit_gas", gasUsed);
    }

    function testGasEstimate_revealVote_logs() public {
        vm.pauseGasMetering();
        uint256 contentId = _submitContent();
        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(1001)));
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = _testCiphertext(true, salt, contentId);
        bytes memory payload = _voteTransferPayload(contentId, commitHash, ciphertext, address(0));

        vm.startPrank(voter1);
        crepToken.transferAndCall(address(votingEngine), STAKE, payload);
        vm.stopPrank();

        uint256 roundId = votingEngine.currentRoundId(contentId);
        vm.warp(block.timestamp + EPOCH_DURATION + 1);

        uint256 gasUsed = _measureCall(
            address(votingEngine),
            abi.encodeCall(
                RoundVotingEngine.revealVoteByCommitKey,
                (contentId, roundId, _commitKey(voter1, commitHash), true, salt)
            )
        );
        console2.log("reveal_vote_gas", gasUsed);
    }

    function testGasEstimate_settleRound_logs() public {
        vm.pauseGasMetering();
        uint256 contentId = _submitContent();

        address[] memory voters = new address[](3);
        voters[0] = voter1;
        voters[1] = voter2;
        voters[2] = voter3;
        bool[] memory directions = new bool[](3);
        directions[0] = true;
        directions[1] = true;
        directions[2] = false;

        _commitAllThenReveal(voters, contentId, directions, STAKE);
        uint256 roundId = votingEngine.currentRoundId(contentId);

        uint256 gasUsed =
            _measureCall(address(votingEngine), abi.encodeCall(RoundVotingEngine.settleRound, (contentId, roundId)));
        console2.log("settle_round_gas", gasUsed);
    }

    function testGasEstimate_claimReward_logs() public {
        vm.pauseGasMetering();
        uint256 contentId = _submitContent();

        address[] memory voters = new address[](3);
        voters[0] = voter1;
        voters[1] = voter2;
        voters[2] = voter3;
        bool[] memory directions = new bool[](3);
        directions[0] = true;
        directions[1] = true;
        directions[2] = false;

        uint256 roundId = _settleRoundWith(voters, contentId, directions, STAKE);

        uint256 gasUsed = _measureCallAs(
            voter1, address(rewardDistributor), abi.encodeCall(RoundRewardDistributor.claimReward, (contentId, roundId))
        );
        console2.log("claim_reward_gas", gasUsed);
    }

    function testGasEstimate_claimSubmitterReward_logs() public {
        vm.pauseGasMetering();
        uint256 contentId = _submitContent();

        address[] memory voters = new address[](3);
        voters[0] = voter1;
        voters[1] = voter2;
        voters[2] = voter3;
        bool[] memory directions = new bool[](3);
        directions[0] = true;
        directions[1] = true;
        directions[2] = false;

        uint256 roundId = _settleRoundWith(voters, contentId, directions, STAKE);

        uint256 gasUsed = _measureCallAs(
            submitter,
            address(rewardDistributor),
            abi.encodeCall(RoundRewardDistributor.claimSubmitterReward, (contentId, roundId))
        );
        console2.log("claim_submitter_reward_gas", gasUsed);
    }
}

contract FrontendTransactionGasEstimatesTest is Test {
    FrontendRegistry public registry;
    CuryoReputation public crepToken;
    MockVotingEngineForFrontendGas public votingEngine;

    address public admin = address(1);
    address public frontend = address(3);
    address public feeCreditor = address(5);

    uint256 public constant STAKE = 1000e6;

    function setUp() public {
        vm.startPrank(admin);
        crepToken = new CuryoReputation(admin, admin);
        crepToken.grantRole(crepToken.MINTER_ROLE(), admin);

        votingEngine = new MockVotingEngineForFrontendGas();

        FrontendRegistry impl = new FrontendRegistry();
        registry = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(FrontendRegistry.initialize, (admin, admin, address(crepToken)))
                )
            )
        );

        registry.setVotingEngine(address(votingEngine));
        registry.addFeeCreditor(feeCreditor);

        crepToken.mint(frontend, 10_000e6);
        crepToken.mint(address(registry), 1_000_000e6);
        vm.stopPrank();
    }

    function _measureCallAs(address caller, address target, bytes memory callData) internal returns (uint256 gasUsed) {
        vm.pauseGasMetering();
        vm.startPrank(caller);
        vm.resumeGasMetering();
        uint256 gasBefore = gasleft();
        (bool success,) = target.call(callData);
        gasUsed = gasBefore - gasleft();
        vm.pauseGasMetering();
        vm.stopPrank();
        assertTrue(success, "measured pranked call reverted");
    }

    function testGasEstimate_frontendApproveStakeAllowance_logs() public {
        vm.pauseGasMetering();
        uint256 gasUsed =
            _measureCallAs(frontend, address(crepToken), abi.encodeCall(IERC20.approve, (address(registry), STAKE)));
        console2.log("frontend_approve_stake_allowance_gas", gasUsed);
    }

    function testGasEstimate_frontendRegister_logs() public {
        vm.pauseGasMetering();
        vm.startPrank(frontend);
        crepToken.approve(address(registry), STAKE);
        vm.stopPrank();

        uint256 gasUsed = _measureCallAs(frontend, address(registry), abi.encodeCall(FrontendRegistry.register, ()));
        console2.log("frontend_register_gas", gasUsed);
    }

    function testGasEstimate_frontendClaimFees_logs() public {
        vm.pauseGasMetering();
        vm.startPrank(frontend);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.prank(feeCreditor);
        registry.creditFees(frontend, 200e6);

        uint256 gasUsed = _measureCallAs(frontend, address(registry), abi.encodeCall(FrontendRegistry.claimFees, ()));
        console2.log("frontend_claim_fees_gas", gasUsed);
    }
}

contract IdentityTransactionGasEstimatesTest is Test {
    VoterIdNFT public voterIdNFT;

    address public admin = address(1);
    address public minterAddr = address(2);
    address public recorderAddr = address(3);
    address public user1 = address(4);
    address public delegate = address(5);

    uint256 public constant NULLIFIER_1 = 111111;

    function setUp() public {
        vm.startPrank(admin);
        voterIdNFT = new VoterIdNFT(admin, admin);
        voterIdNFT.addMinter(minterAddr);
        voterIdNFT.setStakeRecorder(recorderAddr);
        vm.stopPrank();
    }

    function _measureCallAs(address caller, address target, bytes memory callData) internal returns (uint256 gasUsed) {
        vm.pauseGasMetering();
        vm.startPrank(caller);
        vm.resumeGasMetering();
        uint256 gasBefore = gasleft();
        (bool success,) = target.call(callData);
        gasUsed = gasBefore - gasleft();
        vm.pauseGasMetering();
        vm.stopPrank();
        assertTrue(success, "measured pranked call reverted");
    }

    function testGasEstimate_voterIdMint_logs() public {
        vm.pauseGasMetering();
        uint256 gasUsed =
            _measureCallAs(minterAddr, address(voterIdNFT), abi.encodeCall(VoterIdNFT.mint, (user1, NULLIFIER_1)));
        console2.log("voter_id_mint_gas", gasUsed);
    }

    function testGasEstimate_setDelegate_logs() public {
        vm.pauseGasMetering();
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        uint256 gasUsed = _measureCallAs(user1, address(voterIdNFT), abi.encodeCall(VoterIdNFT.setDelegate, (delegate)));
        console2.log("voter_id_set_delegate_gas", gasUsed);
    }
}
