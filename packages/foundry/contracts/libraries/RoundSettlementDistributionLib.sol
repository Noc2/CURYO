// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ContentRegistry } from "../ContentRegistry.sol";
import { ProtocolConfig } from "../ProtocolConfig.sol";
import { ICategoryRegistry } from "../interfaces/ICategoryRegistry.sol";
import { IFrontendRegistry } from "../interfaces/IFrontendRegistry.sol";
import { RoundLib } from "./RoundLib.sol";
import { RewardMath } from "./RewardMath.sol";
import { CategoryFeeLib } from "./CategoryFeeLib.sol";
import { TokenTransferLib } from "./TokenTransferLib.sol";

/// @title RoundSettlementDistributionLib
/// @notice Extracts reward-pool accounting from RoundVotingEngine to keep runtime bytecode below EIP-170.
library RoundSettlementDistributionLib {
    event TreasuryFeeDistributed(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    event CategorySubmitterRewarded(
        uint256 indexed contentId, uint256 indexed categoryId, address indexed submitter, uint256 amount
    );
    event ConsensusReserveFunded(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    event ConsensusSubsidyDistributed(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);

    function distribute(
        IERC20 crepToken,
        ContentRegistry registry,
        ProtocolConfig protocolConfig,
        RoundLib.Round storage round,
        mapping(uint256 => mapping(uint256 => uint256)) storage roundVoterPool,
        mapping(uint256 => mapping(uint256 => uint256)) storage roundWinningStake,
        mapping(uint256 => mapping(uint256 => uint256)) storage pendingSubmitterReward,
        mapping(uint256 => mapping(uint256 => uint256)) storage roundStakeWithEligibleFrontend,
        mapping(uint256 => mapping(uint256 => uint256)) storage roundFrontendPool,
        mapping(uint256 => mapping(uint256 => address)) storage roundFrontendRegistrySnapshot,
        uint256 consensusReserve,
        uint256 contentId,
        uint256 roundId,
        uint256 weightedWinningStake,
        uint256 losingPool
    ) external returns (uint256 updatedConsensusReserve) {
        updatedConsensusReserve = consensusReserve;

        if (losingPool > 0) {
            uint256 loserRefundShare = RewardMath.calculateRevealedLoserRefund(losingPool);
            (
                uint256 voterShare,
                uint256 submitterShare,
                uint256 platformShare,
                uint256 treasuryShare,
                uint256 consensusShare
            ) = RewardMath.splitPool(losingPool - loserRefundShare);

            roundVoterPool[contentId][roundId] = voterShare;
            roundWinningStake[contentId][roundId] = weightedWinningStake;
            pendingSubmitterReward[contentId][roundId] = submitterShare;

            if (consensusShare > 0) {
                updatedConsensusReserve += consensusShare;
                emit ConsensusReserveFunded(contentId, roundId, consensusShare);
            }

            if (platformShare > 0) {
                _distributePlatformFees(
                    crepToken,
                    registry,
                    protocolConfig,
                    roundVoterPool,
                    roundStakeWithEligibleFrontend,
                    roundFrontendPool,
                    roundFrontendRegistrySnapshot,
                    contentId,
                    roundId,
                    platformShare
                );
            }

            if (treasuryShare > 0) {
                _transferTreasuryFee(crepToken, protocolConfig, roundVoterPool, contentId, roundId, treasuryShare);
            }

            return updatedConsensusReserve;
        }

        uint256 totalStake = round.upPool + round.downPool;
        uint256 subsidy = RewardMath.calculateConsensusSubsidy(totalStake, consensusReserve);
        if (subsidy > 0) {
            updatedConsensusReserve -= subsidy;
            (uint256 voterSubsidy, uint256 submitterSubsidy) = RewardMath.splitConsensusSubsidy(subsidy);
            roundVoterPool[contentId][roundId] = voterSubsidy;
            pendingSubmitterReward[contentId][roundId] = submitterSubsidy;
            emit ConsensusSubsidyDistributed(contentId, roundId, subsidy);
        }

        roundWinningStake[contentId][roundId] = weightedWinningStake;
    }

    function _distributePlatformFees(
        IERC20 crepToken,
        ContentRegistry registry,
        ProtocolConfig protocolConfig,
        mapping(uint256 => mapping(uint256 => uint256)) storage roundVoterPool,
        mapping(uint256 => mapping(uint256 => uint256)) storage roundStakeWithEligibleFrontend,
        mapping(uint256 => mapping(uint256 => uint256)) storage roundFrontendPool,
        mapping(uint256 => mapping(uint256 => address)) storage roundFrontendRegistrySnapshot,
        uint256 contentId,
        uint256 roundId,
        uint256 platformShare
    ) private {
        ICategoryRegistry currentCategoryRegistry = ICategoryRegistry(protocolConfig.categoryRegistry());
        IFrontendRegistry currentFrontendRegistry = IFrontendRegistry(protocolConfig.frontendRegistry());
        uint256 categorySubmitterShare = platformShare / 4;
        uint256 frontendShare = platformShare - categorySubmitterShare;

        if (frontendShare > 0) {
            if (roundStakeWithEligibleFrontend[contentId][roundId] > 0) {
                roundFrontendPool[contentId][roundId] = frontendShare;
                roundFrontendRegistrySnapshot[contentId][roundId] = address(currentFrontendRegistry);
            } else {
                roundVoterPool[contentId][roundId] += frontendShare;
            }
        }

        if (categorySubmitterShare == 0) {
            return;
        }

        try CategoryFeeLib.distribute(crepToken, registry, currentCategoryRegistry, contentId, categorySubmitterShare)
        returns (
            bool paid, uint256 categoryId, address categorySubmitter
        ) {
            if (paid) {
                emit CategorySubmitterRewarded(contentId, categoryId, categorySubmitter, categorySubmitterShare);
            } else {
                roundVoterPool[contentId][roundId] += categorySubmitterShare;
            }
        } catch {
            roundVoterPool[contentId][roundId] += categorySubmitterShare;
        }
    }

    function _transferTreasuryFee(
        IERC20 crepToken,
        ProtocolConfig protocolConfig,
        mapping(uint256 => mapping(uint256 => uint256)) storage roundVoterPool,
        uint256 contentId,
        uint256 roundId,
        uint256 treasuryShare
    ) private {
        address currentTreasury = protocolConfig.treasury();
        if (currentTreasury != address(0)) {
            try TokenTransferLib.transfer(crepToken, currentTreasury, treasuryShare) {
                emit TreasuryFeeDistributed(contentId, roundId, treasuryShare);
            } catch {
                roundVoterPool[contentId][roundId] += treasuryShare;
            }
        } else {
            roundVoterPool[contentId][roundId] += treasuryShare;
        }
    }
}
