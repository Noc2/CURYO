// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ProtocolConfig} from "../ProtocolConfig.sol";
import {IVoterIdNFT} from "../interfaces/IVoterIdNFT.sol";
import {RoundLib} from "./RoundLib.sol";
import {TlockVoteLib} from "./TlockVoteLib.sol";
import {TokenTransferLib} from "./TokenTransferLib.sol";

/// @title RoundCleanupLib
/// @notice Shared refund and cleanup paths extracted from RoundVotingEngine to reduce runtime size.
library RoundCleanupLib {
    using SafeERC20 for IERC20;

    uint256 internal constant CLEANUP_INCENTIVE_BPS = 100; // 1%
    uint256 internal constant CLEANUP_INCENTIVE_MAX = 5e6; // 5 HREP

    error RoundNotCancelledOrTied();
    error AlreadyClaimed();
    error NoCommit();
    error NoStake();
    error VoteNotRevealed();
    error NothingProcessed();

    struct CommitIndexParams {
        uint256 contentId;
        uint256 roundId;
        bytes32 commitKey;
        uint256 epochEnd;
        uint256 effectiveRevealableAfter;
        address voter;
        bytes32 commitHash;
        uint256 voterId;
        IVoterIdNFT voterIdNft;
        bool useTokenIdentity;
    }

    function targetRoundRevealableAt(
        mapping(uint256 => bytes32) storage roundDrandChainHashSnapshot,
        mapping(uint256 => uint64) storage roundDrandGenesisTimeSnapshot,
        mapping(uint256 => uint64) storage roundDrandPeriodSnapshot,
        ProtocolConfig protocolConfig,
        uint256 roundId,
        uint64 targetRound
    ) external view returns (uint256) {
        uint64 genesisTime = roundDrandGenesisTimeSnapshot[roundId];
        uint64 period = roundDrandPeriodSnapshot[roundId];
        if (roundDrandChainHashSnapshot[roundId] == bytes32(0) || genesisTime == 0 || period == 0) {
            genesisTime = protocolConfig.drandGenesisTime();
            period = protocolConfig.drandPeriod();
        }
        if (targetRound == 0 || genesisTime == 0 || period == 0) revert TlockVoteLib.TargetRoundOutOfWindow();
        return uint256(genesisTime) + (uint256(targetRound) - 1) * uint256(period);
    }

    function validateCommitTlockData(
        mapping(uint256 => bytes32) storage roundDrandChainHashSnapshot,
        mapping(uint256 => uint64) storage roundDrandGenesisTimeSnapshot,
        mapping(uint256 => uint64) storage roundDrandPeriodSnapshot,
        ProtocolConfig protocolConfig,
        uint256 roundId,
        bytes memory ciphertext,
        uint64 targetRound,
        bytes32 drandChainHash,
        uint256 epochEnd,
        uint256 epochDuration
    ) external view {
        bytes32 chainHash = roundDrandChainHashSnapshot[roundId];
        uint64 genesisTime = roundDrandGenesisTimeSnapshot[roundId];
        uint64 period = roundDrandPeriodSnapshot[roundId];

        if (chainHash == bytes32(0) || genesisTime == 0 || period == 0) {
            chainHash = protocolConfig.drandChainHash();
            genesisTime = protocolConfig.drandGenesisTime();
            period = protocolConfig.drandPeriod();
        }

        TlockVoteLib.validateCommitData(
            ciphertext, targetRound, drandChainHash, chainHash, epochEnd, epochDuration, genesisTime, period
        );
    }

    function resolveClaimCommit(
        mapping(address => bytes32) storage roundVoterCommitHash,
        mapping(uint256 => bytes32) storage roundVoterIdCommitKey,
        mapping(uint256 => bytes32) storage roundVoterNullifierCommitKey,
        mapping(bytes32 => uint256) storage roundCommitVoterId,
        address voterIdNftAddress,
        address account
    ) external view returns (bytes32 commitKey, address rewardRecipient) {
        if (voterIdNftAddress != address(0)) {
            IVoterIdNFT voterIdNft = IVoterIdNFT(voterIdNftAddress);
            uint256 voterId = voterIdNft.getTokenId(account);
            if (voterId != 0) {
                commitKey = roundVoterIdCommitKey[voterId];
                if (commitKey == bytes32(0)) {
                    uint256 nullifier = voterIdNft.getNullifier(voterId);
                    if (nullifier != 0) {
                        commitKey = roundVoterNullifierCommitKey[nullifier];
                    }
                }

                rewardRecipient = voterIdNft.getHolder(voterId);
                if (rewardRecipient == address(0)) rewardRecipient = account;
                return (commitKey, rewardRecipient);
            }
        }

        bytes32 directCommitHash = roundVoterCommitHash[account];
        if (directCommitHash != bytes32(0)) {
            commitKey = keccak256(abi.encodePacked(account, directCommitHash));
            if (roundCommitVoterId[commitKey] == 0) {
                return (commitKey, account);
            }
        }

        return (bytes32(0), account);
    }

    function recordCommitIndexes(
        bytes32[] storage roundCommitHashes,
        mapping(uint256 => uint256) storage epochUnrevealedCount,
        mapping(uint256 => uint256) storage lastCommitRevealableAfter,
        mapping(address => bytes32) storage roundVoterCommitHash,
        mapping(uint256 => bool) storage contentHasCommits,
        mapping(uint256 => bool) storage roundHasTokenIdCommitted,
        mapping(uint256 => bytes32) storage roundVoterIdCommitKey,
        mapping(bytes32 => uint256) storage roundCommitVoterId,
        mapping(uint256 => bytes32) storage roundVoterNullifierCommitKey,
        CommitIndexParams memory params
    ) external {
        roundCommitHashes.push(params.commitKey);
        epochUnrevealedCount[params.epochEnd]++;
        if (params.effectiveRevealableAfter > lastCommitRevealableAfter[params.roundId]) {
            lastCommitRevealableAfter[params.roundId] = params.effectiveRevealableAfter;
        }

        roundVoterCommitHash[params.voter] = params.commitHash;
        if (!contentHasCommits[params.contentId]) {
            contentHasCommits[params.contentId] = true;
        }
        if (params.useTokenIdentity) {
            roundHasTokenIdCommitted[params.voterId] = true;
            roundVoterIdCommitKey[params.voterId] = params.commitKey;
            roundCommitVoterId[params.commitKey] = params.voterId;
            uint256 voterNullifier = params.voterIdNft.getNullifier(params.voterId);
            if (voterNullifier != 0) {
                if (roundVoterNullifierCommitKey[voterNullifier] == bytes32(0)) {
                    roundVoterNullifierCommitKey[voterNullifier] = params.commitKey;
                }
            }
        }
    }

    function claimCancelledRoundRefund(
        RoundLib.Round storage round,
        mapping(address => bool) storage refundClaims,
        mapping(bytes32 => bool) storage refundCommitClaims,
        mapping(bytes32 => RoundLib.Commit) storage roundCommits,
        IERC20 hrepToken,
        bytes32 commitKey
    ) external returns (uint256 refundAmount, address commitVoter) {
        if (
            round.state != RoundLib.RoundState.Cancelled && round.state != RoundLib.RoundState.Tied
                && round.state != RoundLib.RoundState.RevealFailed
        ) {
            revert RoundNotCancelledOrTied();
        }
        if (refundCommitClaims[commitKey]) revert AlreadyClaimed();

        RoundLib.Commit storage commit = roundCommits[commitKey];
        commitVoter = commit.voter;
        if (refundClaims[commitVoter]) revert AlreadyClaimed();
        refundAmount = commit.stakeAmount;
        if (refundAmount == 0) revert NoStake();
        if (round.state != RoundLib.RoundState.Cancelled && !commit.revealed) revert VoteNotRevealed();

        commit.stakeAmount = 0;
        refundCommitClaims[commitKey] = true;
        refundClaims[commitVoter] = true;

        hrepToken.safeTransfer(commitVoter, refundAmount);
    }

    function processUnrevealedVotes(
        RoundLib.Round storage round,
        bytes32[] storage commitKeys,
        mapping(bytes32 => RoundLib.Commit) storage roundCommits,
        IERC20 hrepToken,
        ProtocolConfig protocolConfig,
        uint256 consensusReserve,
        address cleanupCaller,
        uint256 startIndex,
        uint256 count
    )
        external
        returns (
            uint256 forfeitedToTreasury,
            uint256 addedToConsensusReserve,
            uint256 refundedHrep,
            uint256 processedPastEpochCount,
            uint256 cleanupIncentive,
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

        cleanupIncentive = _cleanupIncentive(forfeitedToTreasury + addedToConsensusReserve);
        if (cleanupIncentive > 0) {
            uint256 fromReserve = addedToConsensusReserve < cleanupIncentive ? addedToConsensusReserve : cleanupIncentive;
            if (fromReserve > 0) {
                addedToConsensusReserve -= fromReserve;
                updatedConsensusReserve -= fromReserve;
            }
            uint256 fromTreasuryForfeiture = cleanupIncentive - fromReserve;
            if (fromTreasuryForfeiture > 0) {
                forfeitedToTreasury -= fromTreasuryForfeiture;
            }
            hrepToken.safeTransfer(cleanupCaller, cleanupIncentive);
        }

        if (forfeitedToTreasury > 0) {
            address currentTreasury = protocolConfig.treasury();
            if (currentTreasury != address(0)) {
                try TokenTransferLib.safeTransfer(hrepToken, currentTreasury, forfeitedToTreasury) {}
                catch {
                    updatedConsensusReserve += forfeitedToTreasury;
                }
            } else {
                updatedConsensusReserve += forfeitedToTreasury;
            }
        }

        if (forfeitedToTreasury == 0 && addedToConsensusReserve == 0 && refundedHrep == 0 && cleanupIncentive == 0) {
            revert NothingProcessed();
        }
    }

    function _cleanupIncentive(uint256 forfeitedAmount) private pure returns (uint256 incentive) {
        incentive = forfeitedAmount * CLEANUP_INCENTIVE_BPS / 10_000;
        if (incentive > CLEANUP_INCENTIVE_MAX) incentive = CLEANUP_INCENTIVE_MAX;
    }
}
