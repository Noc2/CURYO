// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { ProtocolConfig } from "../ProtocolConfig.sol";
import { IFrontendRegistry } from "../interfaces/IFrontendRegistry.sol";
import { RoundLib } from "./RoundLib.sol";
import { RewardMath } from "./RewardMath.sol";
import { TokenTransferLib } from "./TokenTransferLib.sol";

/// @title RoundSettlementDistributionLib
/// @notice Extracts bounty accounting from RoundVotingEngine to keep runtime bytecode below EIP-170.
library RoundSettlementDistributionLib {
    event TreasuryFeeDistributed(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    event ConsensusReserveFunded(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    event ConsensusSubsidyDistributed(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    /// @notice Emitted when the 1% treasury fee could not be delivered (treasury unset or
    ///         transfer reverted) and the amount was rerouted into the voter pool instead.
    ///         Lets indexers reconcile voter-reward accounting with expected fee splits.
    event TreasuryFeeFallbackToVoterPool(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);

    function distribute(
        IERC20 hrepToken,
        ProtocolConfig protocolConfig,
        RoundLib.Round storage round,
        mapping(uint256 => mapping(uint256 => uint256)) storage roundVoterPool,
        mapping(uint256 => mapping(uint256 => uint256)) storage roundWinningStake,
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
            (uint256 voterShare, uint256 platformShare, uint256 treasuryShare, uint256 consensusShare) =
                RewardMath.splitPool(losingPool - loserRefundShare);

            roundVoterPool[contentId][roundId] = voterShare;
            roundWinningStake[contentId][roundId] = weightedWinningStake;

            if (consensusShare > 0) {
                updatedConsensusReserve += consensusShare;
                emit ConsensusReserveFunded(contentId, roundId, consensusShare);
            }

            if (platformShare > 0) {
                _distributePlatformFees(
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
                _transferTreasuryFee(hrepToken, protocolConfig, roundVoterPool, contentId, roundId, treasuryShare);
            }

            return updatedConsensusReserve;
        }

        uint256 totalStake = round.upPool + round.downPool;
        uint256 subsidy = RewardMath.calculateConsensusSubsidy(totalStake, consensusReserve);
        if (subsidy > 0) {
            updatedConsensusReserve -= subsidy;
            roundVoterPool[contentId][roundId] = subsidy;
            emit ConsensusSubsidyDistributed(contentId, roundId, subsidy);
        }

        roundWinningStake[contentId][roundId] = weightedWinningStake;
    }

    function _distributePlatformFees(
        ProtocolConfig protocolConfig,
        mapping(uint256 => mapping(uint256 => uint256)) storage roundVoterPool,
        mapping(uint256 => mapping(uint256 => uint256)) storage roundStakeWithEligibleFrontend,
        mapping(uint256 => mapping(uint256 => uint256)) storage roundFrontendPool,
        mapping(uint256 => mapping(uint256 => address)) storage roundFrontendRegistrySnapshot,
        uint256 contentId,
        uint256 roundId,
        uint256 platformShare
    ) private {
        IFrontendRegistry currentFrontendRegistry = IFrontendRegistry(protocolConfig.frontendRegistry());
        uint256 frontendShare = platformShare;

        if (frontendShare > 0) {
            if (roundStakeWithEligibleFrontend[contentId][roundId] > 0) {
                roundFrontendPool[contentId][roundId] = frontendShare;
                if (roundFrontendRegistrySnapshot[contentId][roundId] == address(0)) {
                    roundFrontendRegistrySnapshot[contentId][roundId] = address(currentFrontendRegistry);
                }
            } else {
                roundVoterPool[contentId][roundId] += frontendShare;
            }
        }
    }

    function _transferTreasuryFee(
        IERC20 hrepToken,
        ProtocolConfig protocolConfig,
        mapping(uint256 => mapping(uint256 => uint256)) storage roundVoterPool,
        uint256 contentId,
        uint256 roundId,
        uint256 treasuryShare
    ) private {
        address currentTreasury = protocolConfig.treasury();
        if (currentTreasury != address(0)) {
            try TokenTransferLib.safeTransfer(hrepToken, currentTreasury, treasuryShare) {
                emit TreasuryFeeDistributed(contentId, roundId, treasuryShare);
            } catch {
                roundVoterPool[contentId][roundId] += treasuryShare;
                emit TreasuryFeeFallbackToVoterPool(contentId, roundId, treasuryShare);
            }
        } else {
            roundVoterPool[contentId][roundId] += treasuryShare;
            emit TreasuryFeeFallbackToVoterPool(contentId, roundId, treasuryShare);
        }
    }
}
