// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IFrontendRegistry } from "../interfaces/IFrontendRegistry.sol";
import { RoundVotingEngine } from "../RoundVotingEngine.sol";

library QuestionRewardPoolEscrowClaimLib {
    function nextEqualShare(uint256 totalAmount, uint256 eligibleVoters, uint256 claimedCount)
        external
        pure
        returns (uint256)
    {
        if (totalAmount == 0 || eligibleVoters == 0 || claimedCount >= eligibleVoters) return 0;
        uint256 baseShare = totalAmount / eligibleVoters;
        if (claimedCount + 1 == eligibleVoters) {
            return totalAmount - (baseShare * claimedCount);
        }
        return baseShare;
    }

    function computeClaimSplit(
        RoundVotingEngine votingEngine,
        uint256 contentId,
        uint256 roundId,
        bytes32 commitKey,
        address frontend,
        uint256 grossAmount,
        uint256 reservedFrontendFee
    ) external view returns (uint256 voterReward, uint256 frontendFee, address frontendRecipient) {
        if (
            reservedFrontendFee == 0 || frontend == address(0)
                || !votingEngine.frontendEligibleAtCommit(contentId, roundId, commitKey)
        ) {
            return (grossAmount, 0, address(0));
        }

        if (reservedFrontendFee > grossAmount) {
            reservedFrontendFee = grossAmount;
        }

        frontendRecipient = _resolveFrontendRewardRecipient(votingEngine, contentId, roundId, frontend);
        if (frontendRecipient == address(0)) {
            return (grossAmount, 0, address(0));
        }

        frontendFee = reservedFrontendFee;
        voterReward = grossAmount - frontendFee;
    }

    function _resolveFrontendRewardRecipient(
        RoundVotingEngine votingEngine,
        uint256 contentId,
        uint256 roundId,
        address frontend
    ) private view returns (address) {
        address frontendRegistry = votingEngine.roundFrontendRegistrySnapshot(contentId, roundId);
        if (frontendRegistry == address(0)) {
            return frontend;
        }

        try IFrontendRegistry(frontendRegistry).getFrontendInfo(frontend) returns (
            address operator, uint256 stakedAmount, bool eligible, bool slashed
        ) {
            stakedAmount;
            if (operator != address(0) && eligible && !slashed) {
                return operator;
            }
        } catch {
            return address(0);
        }

        return address(0);
    }
}
