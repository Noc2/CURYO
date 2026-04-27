// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { RoundIntegrationTest } from "./RoundIntegration.t.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";

contract GasBudgetTest is RoundIntegrationTest {
    // Content submission validates media URLs and uses a live CategoryRegistry lookup,
    // so the baseline is higher than the initial pre-media measurement.
    uint256 internal constant MAX_SUBMIT_CONTENT_GAS = 700_000;
    // commitVote now validates the full armored AGE envelope and persists the ciphertext payload,
    // so the post-tlock baseline is materially higher than the earlier pre-parser threshold.
    uint256 internal constant MAX_COMMIT_VOTE_GAS = 2_700_000;
    uint256 internal constant MAX_REVEAL_VOTE_GAS = 320_000;
    uint256 internal constant MAX_SETTLE_ROUND_GAS = 475_000;
    uint256 internal constant MAX_SETTLE_ROUND_MAX_EPOCH_SCAN_GAS = 5_500_000;
    uint256 internal constant MAX_PROCESS_UNREVEALED_GAS = 250_000;
    uint256 internal constant MAX_CANCEL_EXPIRED_ROUND_GAS = 60_000;
    uint256 internal constant MAX_CLAIM_REWARD_GAS = 190_000;
    uint256 internal constant MAX_CLAIM_PARTICIPATION_REWARD_GAS = 240_000;
    uint256 internal constant MAX_CLAIM_FRONTEND_FEE_GAS = 250_000;

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

    function testGas_submitContent_underBudget() public {
        vm.pauseGasMetering();
        uint256 rewardAmount = _defaultSubmissionRewardAmount(registry);
        _ensureDefaultSubmitterVoterId(registry, submitter);
        address rewardEscrow = _ensureDefaultQuestionRewardPoolEscrow(registry);
        vm.startPrank(submitter);
        hrepToken.approve(rewardEscrow, rewardAmount);
        vm.stopPrank();

        string memory imageUrl = "https://example.com/gas-submit.jpg";
        string[] memory imageUrls = _singleImageUrls(imageUrl);
        (, bytes32 submissionKey) = registry.previewQuestionSubmissionKey(
            "https://example.com/context", imageUrls, "", "test goal", "test goal", "test", 1
        );
        bytes32 salt = keccak256(
            abi.encode(imageUrl, "test goal", "test goal", "test", uint256(1), submitter, block.timestamp, block.number)
        );
        bytes32 revealCommitment = _defaultQuestionRevealCommitment(
            registry, submissionKey, imageUrls, "", "test goal", "test goal", "test", 1, salt, submitter
        );

        uint256 reserveGasUsed = _measureCallAs(
            submitter, address(registry), abi.encodeCall(ContentRegistry.reserveSubmission, (revealCommitment))
        );
        vm.warp(block.timestamp + 1);
        uint256 revealGasUsed = _measureCallAs(
            submitter,
            address(registry),
            abi.encodeWithSignature(
                "submitQuestion(string,string[],string,string,string,string,uint256,bytes32,(bytes32,bytes32))",
                "https://example.com/context",
                imageUrls,
                "",
                "test goal",
                "test goal",
                "test",
                1,
                salt,
                _defaultQuestionSpec()
            )
        );
        uint256 gasUsed = reserveGasUsed + revealGasUsed;

        assertLe(gasUsed, MAX_SUBMIT_CONTENT_GAS, "submitContent gas budget exceeded");
    }

    function testGas_commitVote_underBudget() public {
        vm.pauseGasMetering();
        uint256 contentId = _submitContent();
        uint16 roundReferenceRatingBps = votingEngine.previewCommitReferenceRatingBps(contentId);
        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(1)));
        bytes32 commitHash = _commitHash(true, salt, voter1, contentId);
        bytes memory ciphertext = _testCiphertext(true, salt, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
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

        assertLe(gasUsed, MAX_COMMIT_VOTE_GAS, "commitVote gas budget exceeded");
    }

    function testGas_revealVoteByCommitKey_underBudget() public {
        vm.pauseGasMetering();
        uint256 contentId = _submitContent();
        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(2)));
        bytes32 commitHash = _commitHash(true, salt, voter1, contentId);
        bytes memory ciphertext = _testCiphertext(true, salt, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            commitHash,
            ciphertext,
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        _warpPastTlockRevealTime(block.timestamp + EPOCH_DURATION);

        uint256 gasUsed = _measureCall(
            address(votingEngine),
            abi.encodeCall(
                RoundVotingEngine.revealVoteByCommitKey,
                (contentId, roundId, _commitKey(voter1, commitHash), true, salt)
            )
        );

        assertLe(gasUsed, MAX_REVEAL_VOTE_GAS, "revealVoteByCommitKey gas budget exceeded");
    }

    function testGas_settleRound_underBudget() public {
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
        uint256 roundId = _getActiveOrLatestRoundId(contentId);

        uint256 gasUsed =
            _measureCall(address(votingEngine), abi.encodeCall(RoundVotingEngine.settleRound, (contentId, roundId)));

        assertLe(gasUsed, MAX_SETTLE_ROUND_GAS, "settleRound gas budget exceeded");
    }

    function testGas_settleRound_maxEpochScan_underBudget() public {
        vm.pauseGasMetering();

        ProtocolConfig config = ProtocolConfig(address(votingEngine.protocolConfig()));
        vm.startPrank(owner);
        _setTlockRoundConfig(config, 5 minutes, 7 days, 2, 200);
        vm.stopPrank();

        uint256 contentId = _submitContent();

        address[] memory voters = new address[](2);
        voters[0] = voter1;
        voters[1] = voter2;
        bool[] memory directions = new bool[](2);
        directions[0] = true;
        directions[1] = false;

        _commitAllThenReveal(voters, contentId, directions, STAKE);
        uint256 roundId = _getActiveOrLatestRoundId(contentId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);

        uint256 maxEpochEnd = uint256(round.startTime) + 7 days + 5 minutes;
        vm.warp(maxEpochEnd + config.revealGracePeriod() + 1);

        uint256 gasUsed =
            _measureCall(address(votingEngine), abi.encodeCall(RoundVotingEngine.settleRound, (contentId, roundId)));

        assertLe(gasUsed, MAX_SETTLE_ROUND_MAX_EPOCH_SCAN_GAS, "settleRound worst-case epoch scan gas budget exceeded");
    }

    function testGas_processUnrevealedVotes_underBudget() public {
        vm.pauseGasMetering();
        uint256 contentId = _submitContent();

        bytes32 s1 = keccak256(abi.encodePacked(voter1, contentId, true, uint256(1)));
        bytes32 s2 = keccak256(abi.encodePacked(voter2, contentId, true, uint256(2)));
        bytes32 s3 = keccak256(abi.encodePacked(voter3, contentId, false, uint256(3)));
        bytes32 ch1 = _commitHash(true, s1, voter1, contentId);
        bytes32 ch2 = _commitHash(true, s2, voter2, contentId);
        bytes32 ch3 = _commitHash(false, s3, voter3, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
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
        votingEngine.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch2,
            _testCiphertext(true, s2, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        vm.startPrank(voter3);
        hrepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            ch3,
            _testCiphertext(false, s3, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);

        _warpPastTlockRevealTime(uint256(round.startTime) + EPOCH_DURATION);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter1, ch1), true, s1);
        votingEngine.revealVoteByCommitKey(contentId, roundId, _commitKey(voter2, ch2), true, s2);

        vm.warp(
            round.startTime + 7 days + ProtocolConfig(address(votingEngine.protocolConfig())).revealGracePeriod() + 1
        );
        votingEngine.settleRound(contentId, roundId);

        uint256 gasUsed = _measureCall(
            address(votingEngine), abi.encodeCall(RoundVotingEngine.processUnrevealedVotes, (contentId, roundId, 0, 10))
        );

        assertLe(gasUsed, MAX_PROCESS_UNREVEALED_GAS, "processUnrevealedVotes gas budget exceeded");
    }

    function testGas_cancelExpiredRound_underBudget() public {
        vm.pauseGasMetering();
        uint256 contentId = _submitContent();
        bytes32 salt = keccak256(abi.encodePacked(voter1, contentId, true, uint256(4)));
        bytes32 commitHash = _commitHash(true, salt, voter1, contentId);

        vm.startPrank(voter1);
        hrepToken.approve(address(votingEngine), STAKE);
        votingEngine.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            commitHash,
            _testCiphertext(true, salt, contentId),
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(votingEngine, contentId);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(votingEngine, contentId, roundId);
        vm.warp(round.startTime + 7 days + 1);

        uint256 gasUsed = _measureCall(
            address(votingEngine), abi.encodeCall(RoundVotingEngine.cancelExpiredRound, (contentId, roundId))
        );

        assertLe(gasUsed, MAX_CANCEL_EXPIRED_ROUND_GAS, "cancelExpiredRound gas budget exceeded");
    }

    function testGas_claimReward_underBudget() public {
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

        assertLe(gasUsed, MAX_CLAIM_REWARD_GAS, "claimReward gas budget exceeded");
    }

    function testGas_claimParticipationReward_underBudget() public {
        vm.pauseGasMetering();
        (uint256 contentId, uint256 roundId) = _settleRoundWithParticipation();

        uint256 gasUsed = _measureCallAs(
            voter1,
            address(rewardDistributor),
            abi.encodeCall(RoundRewardDistributor.claimParticipationReward, (contentId, roundId))
        );

        assertLe(gasUsed, MAX_CLAIM_PARTICIPATION_REWARD_GAS, "claimParticipationReward gas budget exceeded");
    }

    function testGas_claimFrontendFee_underBudget() public {
        vm.pauseGasMetering();
        (, address frontendOp) = _setupFrontendRegistry();
        (uint256 contentId, uint256 roundId) = _settleRoundWithFrontend(frontendOp);

        uint256 gasUsed = _measureCallAs(
            frontendOp,
            address(rewardDistributor),
            abi.encodeCall(RoundRewardDistributor.claimFrontendFee, (contentId, roundId, frontendOp))
        );

        assertLe(gasUsed, MAX_CLAIM_FRONTEND_FEE_GAS, "claimFrontendFee gas budget exceeded");
    }
}
