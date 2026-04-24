// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { ProtocolConfig } from "../ProtocolConfig.sol";
import { RoundLib } from "./RoundLib.sol";
import { TokenTransferLib } from "./TokenTransferLib.sol";

/// @title RoundCleanupLib
/// @notice Shared refund and cleanup paths extracted from RoundVotingEngine to reduce runtime size.
library RoundCleanupLib {
    using SafeERC20 for IERC20;

    error RoundNotCancelledOrTied();
    error AlreadyClaimed();
    error NoCommit();
    error NoStake();
    error VoteNotRevealed();
    error NothingProcessed();

    function claimCancelledRoundRefund(
        RoundLib.Round storage round,
        mapping(address => bool) storage refundClaims,
        mapping(address => bytes32) storage roundVoterCommitHash,
        mapping(bytes32 => RoundLib.Commit) storage roundCommits,
        IERC20 hrepToken,
        address claimer
    ) external returns (uint256 refundAmount) {
        if (
            round.state != RoundLib.RoundState.Cancelled && round.state != RoundLib.RoundState.Tied
                && round.state != RoundLib.RoundState.RevealFailed
        ) {
            revert RoundNotCancelledOrTied();
        }
        if (refundClaims[claimer]) revert AlreadyClaimed();

        bytes32 commitHash = roundVoterCommitHash[claimer];
        if (commitHash == bytes32(0)) revert NoCommit();
        bytes32 commitKey = keccak256(abi.encodePacked(claimer, commitHash));

        RoundLib.Commit storage commit = roundCommits[commitKey];
        refundAmount = commit.stakeAmount;
        if (refundAmount == 0) revert NoStake();
        if (round.state != RoundLib.RoundState.Cancelled && !commit.revealed) revert VoteNotRevealed();

        commit.stakeAmount = 0;
        refundClaims[claimer] = true;

        hrepToken.safeTransfer(claimer, refundAmount);
    }

    function processUnrevealedVotes(
        RoundLib.Round storage round,
        bytes32[] storage commitKeys,
        mapping(bytes32 => RoundLib.Commit) storage roundCommits,
        IERC20 hrepToken,
        ProtocolConfig protocolConfig,
        uint256 consensusReserve,
        uint256 startIndex,
        uint256 count
    )
        external
        returns (
            uint256 forfeitedToTreasury,
            uint256 addedToConsensusReserve,
            uint256 refundedHrep,
            uint256 processedPastEpochCount,
            uint256 updatedConsensusReserve
        )
    {
        uint256 len = commitKeys.length;
        uint256 endIndex = (count == 0 || startIndex + count > len) ? len : startIndex + count;
        updatedConsensusReserve = consensusReserve;

        for (uint256 i = startIndex; i < endIndex; i++) {
            RoundLib.Commit storage commit = roundCommits[commitKeys[i]];
            if (!commit.revealed && commit.stakeAmount > 0) {
                uint256 amount = commit.stakeAmount;
                commit.stakeAmount = 0;

                if (round.state == RoundLib.RoundState.RevealFailed || commit.revealableAfter <= round.settledAt) {
                    processedPastEpochCount++;
                    if (round.state == RoundLib.RoundState.Settled) {
                        addedToConsensusReserve += amount;
                        updatedConsensusReserve += amount;
                    } else {
                        forfeitedToTreasury += amount;
                    }
                } else {
                    try TokenTransferLib.safeTransfer(hrepToken, commit.voter, amount) {
                        refundedHrep += amount;
                    } catch {
                        forfeitedToTreasury += amount;
                    }
                }
            }
        }

        if (forfeitedToTreasury > 0) {
            address currentTreasury = protocolConfig.treasury();
            if (currentTreasury != address(0)) {
                try TokenTransferLib.safeTransfer(hrepToken, currentTreasury, forfeitedToTreasury) { }
                catch {
                    updatedConsensusReserve += forfeitedToTreasury;
                }
            } else {
                updatedConsensusReserve += forfeitedToTreasury;
            }
        }

        if (forfeitedToTreasury == 0 && addedToConsensusReserve == 0 && refundedHrep == 0) {
            revert NothingProcessed();
        }
    }
}
