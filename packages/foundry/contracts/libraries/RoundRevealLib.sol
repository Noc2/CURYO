// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import { RoundLib } from "./RoundLib.sol";
import { TlockVoteLib } from "./TlockVoteLib.sol";

/// @title RoundRevealLib
/// @notice Shared reveal accounting extracted from RoundVotingEngine to reduce runtime size.
library RoundRevealLib {
    using SafeCast for uint256;

    error RoundNotOpen();
    error NoCommit();
    error AlreadyRevealed();
    error EpochNotEnded();
    error HashMismatch();

    function revealVote(
        RoundLib.Round storage round,
        RoundLib.Commit storage commit,
        mapping(uint256 => uint256) storage unrevealedCountByEpoch,
        mapping(bytes32 => bool) storage frontendEligibleAtCommit,
        mapping(address => uint256) storage perFrontendStake,
        uint256 currentEligibleFrontendStake,
        uint256 currentEligibleFrontendCount,
        uint256 contentId,
        uint256 roundId,
        bytes32 commitKey,
        bool isUp,
        bytes32 salt,
        uint16 roundReferenceRatingBps,
        uint16 minVoters,
        uint256 targetRoundRevealableAt
    )
        external
        returns (uint256 nextEligibleFrontendStake, uint256 nextEligibleFrontendCount, address voter)
    {
        if (round.state != RoundLib.RoundState.Open) revert RoundNotOpen();
        if (commit.voter == address(0)) revert NoCommit();
        if (commit.revealed) revert AlreadyRevealed();

        uint256 revealNotBefore = commit.revealableAfter;
        if (targetRoundRevealableAt > revealNotBefore) {
            revealNotBefore = targetRoundRevealableAt;
        }
        if (block.timestamp < revealNotBefore) revert EpochNotEnded();

        bytes32 expectedHash = TlockVoteLib.buildExpectedCommitHash(
            isUp,
            salt,
            commit.voter,
            contentId,
            roundId,
            roundReferenceRatingBps,
            commit.targetRound,
            commit.drandChainHash,
            commit.ciphertext
        );
        if (commitKey != keccak256(abi.encodePacked(commit.voter, expectedHash))) revert HashMismatch();

        commit.revealed = true;
        commit.isUp = isUp;

        unrevealedCountByEpoch[commit.revealableAfter]--;
        round.revealedCount++;

        if (isUp) {
            round.upPool += commit.stakeAmount;
            round.upCount++;
        } else {
            round.downPool += commit.stakeAmount;
            round.downCount++;
        }

        uint256 epochWeightBps = RoundLib.epochWeightBps(commit.epochIndex);
        uint64 effectiveStake = ((uint256(commit.stakeAmount) * epochWeightBps) / 10_000).toUint64();
        if (isUp) {
            round.weightedUpPool += effectiveStake;
        } else {
            round.weightedDownPool += effectiveStake;
        }

        if (round.revealedCount >= minVoters && round.thresholdReachedAt == 0) {
            round.thresholdReachedAt = block.timestamp.toUint48();
        }

        nextEligibleFrontendStake = currentEligibleFrontendStake;
        nextEligibleFrontendCount = currentEligibleFrontendCount;
        if (commit.frontend != address(0) && frontendEligibleAtCommit[commitKey]) {
            nextEligibleFrontendStake += commit.stakeAmount;
            if (perFrontendStake[commit.frontend] == 0) {
                nextEligibleFrontendCount++;
            }
            perFrontendStake[commit.frontend] += commit.stakeAmount;
        }

        voter = commit.voter;
    }
}
