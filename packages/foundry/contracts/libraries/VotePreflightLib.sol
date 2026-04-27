// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ContentRegistry } from "../ContentRegistry.sol";
import { IFrontendRegistry } from "../interfaces/IFrontendRegistry.sol";
import { IVoterIdNFT } from "../interfaces/IVoterIdNFT.sol";

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

    struct CommitPreflightParams {
        address voter;
        uint256 contentId;
        uint256 roundId;
        uint256 voterId;
        bool useTokenIdentity;
        uint256 cooldownWindow;
        uint256 maxStake;
        uint256 stakeAmount;
        bytes32 commitHash;
        uint256 roundVoteCount;
        uint256 maxVoters;
    }

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

    function isFrontendEligible(IFrontendRegistry frontendRegistry, address frontend) external view returns (bool eligible) {
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
        mapping(uint256 => mapping(uint256 => mapping(uint256 => bytes32))) storage voterNullifierCommitKey,
        mapping(uint256 => mapping(address => uint256)) storage lastVoteTimestamp,
        mapping(uint256 => mapping(uint256 => uint256)) storage lastVoteTimestampByToken,
        IVoterIdNFT voterIdNft,
        CommitPreflightParams memory params
    ) external view returns (bytes32 commitKey) {
        _validateCooldown(
            lastVoteTimestamp,
            lastVoteTimestampByToken,
            params.voter,
            params.contentId,
            params.voterId,
            params.useTokenIdentity,
            params.cooldownWindow,
            block.timestamp
        );
        commitKey = _validateCommitCapacityAndKey(
            voterCommitHash,
            hasTokenIdCommitted,
            params.voter,
            params.contentId,
            params.roundId,
            params.voterId,
            params.useTokenIdentity,
            params.commitHash,
            voterNullifierCommitKey,
            voterIdNft,
            params.roundVoteCount,
            params.maxVoters
        );
        _validateStakeLimit(
            voterIdNft,
            params.contentId,
            params.roundId,
            params.voterId,
            params.useTokenIdentity,
            params.stakeAmount,
            params.maxStake
        );
    }

    function _validateCooldown(
        mapping(uint256 => mapping(address => uint256)) storage lastVoteTimestamp,
        mapping(uint256 => mapping(uint256 => uint256)) storage lastVoteTimestampByToken,
        address voter,
        uint256 contentId,
        uint256 voterId,
        bool useTokenIdentity,
        uint256 cooldownWindow,
        uint256 timestamp
    ) private view {
        if (useTokenIdentity) {
            uint256 lastVoteByToken = lastVoteTimestampByToken[contentId][voterId];
            if (lastVoteByToken > 0 && timestamp < lastVoteByToken + cooldownWindow) revert CooldownActive();
            return;
        }

        uint256 lastVote = lastVoteTimestamp[contentId][voter];
        if (lastVote > 0 && timestamp < lastVote + cooldownWindow) revert CooldownActive();
    }

    function _validateCommitCapacityAndKey(
        mapping(uint256 => mapping(uint256 => mapping(address => bytes32))) storage voterCommitHash,
        mapping(uint256 => mapping(uint256 => mapping(uint256 => bool))) storage hasTokenIdCommitted,
        address voter,
        uint256 contentId,
        uint256 roundId,
        uint256 voterId,
        bool useTokenIdentity,
        bytes32 commitHash,
        mapping(uint256 => mapping(uint256 => mapping(uint256 => bytes32))) storage voterNullifierCommitKey,
        IVoterIdNFT voterIdNft,
        uint256 roundVoteCount,
        uint256 maxVoters
    ) private view returns (bytes32 commitKey) {
        if (voterCommitHash[contentId][roundId][voter] != bytes32(0)) revert AlreadyCommitted();
        if (useTokenIdentity && hasTokenIdCommitted[contentId][roundId][voterId]) revert AlreadyCommitted();
        if (useTokenIdentity) {
            uint256 nullifier = voterIdNft.getNullifier(voterId);
            if (nullifier != 0 && voterNullifierCommitKey[contentId][roundId][nullifier] != bytes32(0)) {
                revert AlreadyCommitted();
            }
        }
        if (roundVoteCount >= maxVoters) revert MaxVotersReached();

        commitKey = keccak256(abi.encodePacked(voter, commitHash));
    }

    function _validateStakeLimit(
        IVoterIdNFT voterIdNft,
        uint256 contentId,
        uint256 roundId,
        uint256 voterId,
        bool useTokenIdentity,
        uint256 stakeAmount,
        uint256 maxStake
    ) private view {
        if (!useTokenIdentity) return;

        uint256 currentStake = voterIdNft.getEpochContentStake(contentId, roundId, voterId);
        if (currentStake + stakeAmount > maxStake) revert InvalidStake();
    }
}
