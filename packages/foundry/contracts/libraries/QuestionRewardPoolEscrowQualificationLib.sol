// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IVoterIdNFT } from "../interfaces/IVoterIdNFT.sol";
import { RoundVotingEngine } from "../RoundVotingEngine.sol";
import { RoundLib } from "./RoundLib.sol";

library QuestionRewardPoolEscrowQualificationLib {
    struct QualificationContext {
        RoundVotingEngine votingEngine;
        IVoterIdNFT voterIdNft;
        uint256 contentId;
        uint256 roundId;
        uint64 bountyClosesAt;
        uint32 requiredVoters;
        address funder;
        address funderIdentity;
        uint256 funderNullifier;
        address submitterIdentity;
        uint256 submitterVoterId;
        address submitterVoterIdNFT;
        uint256 submitterNullifier;
    }

    function previewRoundQualification(QualificationContext memory ctx)
        external
        view
        returns (bool roundSettled, bool canQualify, uint256 eligibleVoters, uint48 settledAt)
    {
        (, RoundLib.RoundState state,,,,,,,,, uint48 roundSettledAt,,,) =
            ctx.votingEngine.rounds(ctx.contentId, ctx.roundId);
        if (state != RoundLib.RoundState.Settled) return (false, false, 0, 0);
        settledAt = roundSettledAt;
        if (settledAt == 0 || (ctx.bountyClosesAt != 0 && settledAt > ctx.bountyClosesAt)) {
            return (true, false, 0, settledAt);
        }

        roundSettled = true;
        eligibleVoters = _countEligibleRevealedVoters(ctx);
        canQualify = eligibleVoters >= ctx.requiredVoters;
    }

    function isExcludedVoter(
        IVoterIdNFT voterIdNft,
        uint256 voterId,
        address funder,
        address funderIdentity,
        uint256 funderNullifier,
        address submitterIdentity,
        uint256 submitterVoterId,
        address submitterVoterIdNFT,
        uint256 submitterNullifier
    ) external view returns (bool) {
        return _isExcludedVoter(
            voterIdNft,
            voterId,
            funder,
            funderIdentity,
            funderNullifier,
            submitterIdentity,
            submitterVoterId,
            submitterVoterIdNFT,
            submitterNullifier
        );
    }

    function _countEligibleRevealedVoters(QualificationContext memory ctx)
        private
        view
        returns (uint256 eligibleVoters)
    {
        uint256 commitCount = ctx.votingEngine.getRoundCommitCount(ctx.contentId, ctx.roundId);
        for (uint256 i = 0; i < commitCount;) {
            bytes32 commitKey = ctx.votingEngine.getRoundCommitKey(ctx.contentId, ctx.roundId, i);
            (address voter,,,, bool revealed,,) = ctx.votingEngine.commitCore(ctx.contentId, ctx.roundId, commitKey);
            if (voter != address(0) && revealed) {
                uint256 voterId = ctx.votingEngine.commitVoterId(ctx.contentId, ctx.roundId, commitKey);
                if (!_isExcludedVoter(
                        ctx.voterIdNft,
                        voterId,
                        ctx.funder,
                        ctx.funderIdentity,
                        ctx.funderNullifier,
                        ctx.submitterIdentity,
                        ctx.submitterVoterId,
                        ctx.submitterVoterIdNFT,
                        ctx.submitterNullifier
                    )) {
                    unchecked {
                        ++eligibleVoters;
                    }
                }
            }
            unchecked {
                ++i;
            }
        }
    }

    function _isExcludedVoter(
        IVoterIdNFT voterIdNft,
        uint256 voterId,
        address funder,
        address funderIdentity,
        uint256 funderNullifier,
        address submitterIdentity,
        uint256 submitterVoterId,
        address submitterVoterIdNFT,
        uint256 submitterNullifier
    ) private view returns (bool) {
        if (voterId == 0) return false;

        uint256 voterNullifier = voterIdNft.getNullifier(voterId);
        if (voterNullifier != 0 && (voterNullifier == funderNullifier || voterNullifier == submitterNullifier)) {
            return true;
        }

        if (
            voterId == _resolveFunderVoterId(voterIdNft, funder, funderIdentity)
                || voterId == voterIdNft.getTokenId(funder)
        ) {
            return true;
        }

        if (submitterIdentity != address(0) && voterId == voterIdNft.getTokenId(submitterIdentity)) {
            return true;
        }

        return submitterVoterIdNFT == address(voterIdNft) && voterId == submitterVoterId;
    }

    function _resolveFunderVoterId(IVoterIdNFT voterIdNft, address funder, address funderIdentity)
        private
        view
        returns (uint256)
    {
        if (funderIdentity != address(0)) {
            uint256 identityVoterId = voterIdNft.getTokenId(funderIdentity);
            if (identityVoterId != 0) return identityVoterId;
        }
        return voterIdNft.getTokenId(funder);
    }
}
