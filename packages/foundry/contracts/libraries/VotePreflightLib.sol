// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ContentRegistry } from "../ContentRegistry.sol";
import { IFrontendRegistry } from "../interfaces/IFrontendRegistry.sol";
import { IVoterIdNFT } from "../interfaces/IVoterIdNFT.sol";
import { RoundLib } from "./RoundLib.sol";
import { TlockVoteLib } from "./TlockVoteLib.sol";

/// @title VotePreflightLib
/// @notice Extracts external preflight checks for vote commits to reduce RoundVotingEngine runtime size.
library VotePreflightLib {
    error VoterIdRequired();
    error SelfVote();
    error ContentNotActive();
    error CooldownActive();
    error InvalidStake();
    error AlreadyCommitted();
    error MaxVotersReached();

    function validateVoterAndContent(IVoterIdNFT voterIdNft, ContentRegistry registry, address voter, uint256 contentId)
        external
        view
        returns (uint256 voterId, bool useTokenIdentity)
    {
        bool hasVoterIdNft = address(voterIdNft) != address(0);

        if (hasVoterIdNft) {
            if (!voterIdNft.hasVoterId(voter)) revert VoterIdRequired();
            voterId = voterIdNft.getTokenId(voter);
        }

        address effectiveVoter = voter;
        if (hasVoterIdNft) {
            address resolved = voterIdNft.resolveHolder(voter);
            if (resolved != address(0)) effectiveVoter = resolved;
        }

        if (effectiveVoter == registry.getSubmitterIdentity(contentId)) revert SelfVote();
        if (!registry.isContentActive(contentId)) revert ContentNotActive();

        useTokenIdentity = hasVoterIdNft && voterId != 0;
    }

    function isFrontendEligible(IFrontendRegistry frontendRegistry, address frontend) external returns (bool eligible) {
        if (frontend == address(0) || address(frontendRegistry) == address(0)) {
            return false;
        }

        try frontendRegistry.isEligible(frontend) returns (bool isEligible) {
            return isEligible;
        } catch {
            return false;
        }
    }

    function prepareCommit(
        mapping(uint256 => mapping(uint256 => mapping(address => bytes32))) storage voterCommitHash,
        mapping(uint256 => mapping(uint256 => mapping(uint256 => bool))) storage hasTokenIdCommitted,
        mapping(uint256 => mapping(uint256 => mapping(bytes32 => RoundLib.Commit))) storage commits,
        mapping(uint256 => mapping(address => uint256)) storage lastVoteTimestamp,
        mapping(uint256 => mapping(uint256 => uint256)) storage lastVoteTimestampByToken,
        IVoterIdNFT voterIdNft,
        address voter,
        uint256 contentId,
        uint256 roundId,
        uint256 voterId,
        bool useTokenIdentity,
        uint256 cooldownWindow,
        uint256 maxStake,
        uint256 stakeAmount,
        bytes32 commitHash,
        bytes memory ciphertext,
        uint64 targetRound,
        bytes32 drandChainHash,
        bytes32 expectedDrandChainHash,
        uint64 drandGenesisTime,
        uint64 drandPeriod,
        RoundLib.Round storage round,
        RoundLib.RoundConfig memory roundCfg,
        uint256 timestamp
    ) external view returns (bytes32 commitKey, uint256 epochEnd, uint8 epochIdx) {
        if (useTokenIdentity) {
            uint256 lastVote = lastVoteTimestampByToken[contentId][voterId];
            if (lastVote > 0 && timestamp < lastVote + cooldownWindow) revert CooldownActive();
        } else {
            uint256 lastVote = lastVoteTimestamp[contentId][voter];
            if (lastVote > 0 && timestamp < lastVote + cooldownWindow) revert CooldownActive();
        }

        if (voterCommitHash[contentId][roundId][voter] != bytes32(0)) revert AlreadyCommitted();
        if (useTokenIdentity && hasTokenIdCommitted[contentId][roundId][voterId]) revert AlreadyCommitted();
        if (round.voteCount >= roundCfg.maxVoters) revert MaxVotersReached();

        commitKey = keccak256(abi.encodePacked(voter, commitHash));
        if (commits[contentId][roundId][commitKey].voter != address(0)) revert AlreadyCommitted();

        if (useTokenIdentity) {
            uint256 currentStake = voterIdNft.getEpochContentStake(contentId, roundId, voterId);
            if (currentStake + stakeAmount > maxStake) revert InvalidStake();
        }

        epochEnd = RoundLib.computeEpochEnd(round, roundCfg.epochDuration, timestamp);
        epochIdx = RoundLib.computeEpochIndex(round, roundCfg.epochDuration, timestamp);
        TlockVoteLib.validateCommitData(
            ciphertext,
            targetRound,
            drandChainHash,
            expectedDrandChainHash,
            epochEnd,
            roundCfg.epochDuration,
            drandGenesisTime,
            drandPeriod
        );
    }
}
