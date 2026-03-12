// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { RoundVotingEngine } from "../../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../../contracts/RoundRewardDistributor.sol";
import { ContentRegistry } from "../../contracts/ContentRegistry.sol";
import { RoundLib } from "../../contracts/libraries/RoundLib.sol";
import { RoundEngineReadHelpers } from "../helpers/RoundEngineReadHelpers.sol";
import { VotingTestBase } from "../helpers/VotingTestHelpers.sol";

/// @title VotingHandler
/// @notice Invariant-test handler wrapping all user-facing voting actions into bounded, state-valid operations.
/// @dev Ghost variables track all token flows for solvency assertions.
contract VotingHandler is VotingTestBase {
    // --- External contracts ---
    RoundVotingEngine public engine;
    RoundRewardDistributor public distributor;
    ContentRegistry public registry;
    IERC20 public crepToken;

    // --- Actors ---
    address[] public voters;
    uint256[] public contentIds;

    // --- Constants ---
    uint256 public constant MIN_STAKE = 1e6;
    uint256 public constant MAX_STAKE = 100e6;
    uint256 public constant EPOCH_DURATION = 10 minutes;

    // --- Ghost variables (token flow accounting) ---
    uint256 public ghost_totalStaked;
    uint256 public ghost_totalClaimed; // voter rewards (stake return + pool share)
    uint256 public ghost_totalSubmitterClaimed;
    uint256 public ghost_totalRefunded;
    uint256 public ghost_totalConsensusSubsidy;

    // --- Per-round tracking ---
    struct RoundRecord {
        uint256 contentId;
        uint256 roundId;
        uint256 totalStaked;
        uint256 totalClaimed;
        uint256 submitterClaimed;
        uint256 totalRefunded;
        bool settled;
        bool cancelled;
        bool tied;
        bool revealFailed;
    }

    RoundRecord[] public roundRecords;
    mapping(uint256 => mapping(uint256 => uint256)) public roundRecordIndex; // contentId => roundId => index+1

    // --- Vote tracking ---
    struct VoteRecord {
        bool committed;
        bool revealed;
        bool claimed;
        bool isUp;
        bytes32 salt;
        bytes32 commitHash;
        bytes32 commitKey;
        uint256 stakeAmount;
        uint256 roundId;
    }

    // voter => contentId => VoteRecord
    mapping(address => mapping(uint256 => VoteRecord)) public voteRecords;

    // --- Action counters (for debugging) ---
    uint256 public commitCount;
    uint256 public revealCount;
    uint256 public settleCount;
    uint256 public cancelCount;
    uint256 public revealFailedCount;
    uint256 public processCount;
    uint256 public cleanupRewardCount;
    uint256 public claimCount;
    uint256 public submitterClaimCount;
    uint256 public refundCount;
    uint256 public timeAdvanceCount;

    constructor(
        address _engine,
        address _distributor,
        address _registry,
        address _crepToken,
        address[] memory _voters,
        uint256[] memory _contentIds
    ) {
        engine = RoundVotingEngine(_engine);
        distributor = RoundRewardDistributor(_distributor);
        registry = ContentRegistry(_registry);
        crepToken = IERC20(_crepToken);
        voters = _voters;
        contentIds = _contentIds;
    }

    // =========================================================================
    // ACTION 1: commitVote
    // =========================================================================

    function commitVote(uint256 voterSeed, uint256 contentSeed, bool isUp, uint256 stakeSeed) external {
        address voter = voters[voterSeed % voters.length];
        uint256 contentId = contentIds[contentSeed % contentIds.length];
        uint256 stakeAmount = bound(stakeSeed, MIN_STAKE, MAX_STAKE);

        // Skip if voter already has an active commit for this content
        if (voteRecords[voter][contentId].committed && !voteRecords[voter][contentId].claimed) return;

        // Skip if content not active
        if (!registry.isActive(contentId)) return;

        // Skip if voter doesn't have enough balance
        if (crepToken.balanceOf(voter) < stakeAmount) return;

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);

        bytes32 salt = keccak256(abi.encodePacked(voter, contentId, isUp, block.timestamp, commitCount));
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);
        bytes32 commitHash = _commitHash(isUp, salt, contentId, ciphertext);

        vm.startPrank(voter);
        crepToken.approve(address(engine), stakeAmount);
        try engine.commitVote(contentId, commitHash, ciphertext, stakeAmount, address(0)) {
            vm.stopPrank();

            // Get the round ID that was used/created
            roundId = RoundEngineReadHelpers.latestRoundId(engine, contentId);

            bytes32 commitKey = keccak256(abi.encodePacked(voter, commitHash));

            voteRecords[voter][contentId] = VoteRecord({
                committed: true,
                revealed: false,
                claimed: false,
                isUp: isUp,
                salt: salt,
                commitHash: commitHash,
                commitKey: commitKey,
                stakeAmount: stakeAmount,
                roundId: roundId
            });

            ghost_totalStaked += stakeAmount;
            commitCount++;

            // Track round
            _ensureRoundRecord(contentId, roundId);
            uint256 idx = roundRecordIndex[contentId][roundId] - 1;
            roundRecords[idx].totalStaked += stakeAmount;
        } catch {
            vm.stopPrank();
        }
    }

    // =========================================================================
    // ACTION 2: revealVote
    // =========================================================================

    function revealVote(uint256 contentSeed, uint256 voterSeed) external {
        address voter = voters[voterSeed % voters.length];
        uint256 contentId = contentIds[contentSeed % contentIds.length];

        VoteRecord storage record = voteRecords[voter][contentId];
        if (!record.committed || record.revealed) return;

        uint256 roundId = record.roundId;
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);

        // Round must still be open
        if (round.state != RoundLib.RoundState.Open) return;

        // Get the commit to check epoch end
        RoundLib.Commit memory commit = RoundEngineReadHelpers.commit(engine, contentId, roundId, record.commitKey);
        if (commit.voter == address(0)) return;

        // Warp past epoch end if needed
        if (block.timestamp < commit.revealableAfter) {
            vm.warp(commit.revealableAfter + 1);
        }

        try engine.revealVoteByCommitKey(contentId, roundId, record.commitKey, record.isUp, record.salt) {
            record.revealed = true;
            revealCount++;
        } catch {
            // Reveal failed — leave state as-is
        }
    }

    // =========================================================================
    // ACTION 3: settleRound
    // =========================================================================

    function settleRound(uint256 contentSeed) external {
        uint256 contentId = contentIds[contentSeed % contentIds.length];
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        if (roundId == 0) {
            roundId = RoundEngineReadHelpers.latestRoundId(engine, contentId);
            if (roundId == 0) return;
        }

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        if (round.state != RoundLib.RoundState.Open) return;

        RoundLib.RoundConfig memory cfg = RoundEngineReadHelpers.roundConfig(engine, contentId, roundId);
        if (round.revealedCount < cfg.minVoters) return;

        uint256 reserveBefore = engine.consensusReserve();
        try engine.settleRound(contentId, roundId) {
            uint256 reserveAfter = engine.consensusReserve();
            if (reserveBefore > reserveAfter) {
                ghost_totalConsensusSubsidy += reserveBefore - reserveAfter;
            }

            settleCount++;
            _ensureRoundRecord(contentId, roundId);
            uint256 idx = roundRecordIndex[contentId][roundId] - 1;

            RoundLib.Round memory settled = RoundEngineReadHelpers.round(engine, contentId, roundId);
            if (settled.state == RoundLib.RoundState.Settled) {
                roundRecords[idx].settled = true;
            } else if (settled.state == RoundLib.RoundState.Tied) {
                roundRecords[idx].tied = true;
            }
        } catch {
            // Settlement failed
        }
    }

    // =========================================================================
    // ACTION 4: claimReward
    // =========================================================================

    function claimReward(uint256 contentSeed, uint256 voterSeed) external {
        address voter = voters[voterSeed % voters.length];
        uint256 contentId = contentIds[contentSeed % contentIds.length];

        VoteRecord storage record = voteRecords[voter][contentId];
        if (!record.revealed || record.claimed) return;

        uint256 roundId = record.roundId;
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        if (round.state != RoundLib.RoundState.Settled) return;

        // Check if already claimed on-chain
        if (distributor.rewardClaimed(contentId, roundId, voter)) return;

        uint256 balBefore = crepToken.balanceOf(voter);

        vm.prank(voter);
        try distributor.claimReward(contentId, roundId) {
            uint256 balAfter = crepToken.balanceOf(voter);
            uint256 payout = balAfter - balBefore;

            record.claimed = true;
            ghost_totalClaimed += payout;
            claimCount++;

            _ensureRoundRecord(contentId, roundId);
            uint256 idx = roundRecordIndex[contentId][roundId] - 1;
            roundRecords[idx].totalClaimed += payout;
        } catch {
            // Claim failed (loser, or already claimed)
        }
    }

    // =========================================================================
    // ACTION 5: claimSubmitterReward
    // =========================================================================

    function claimSubmitterReward(uint256 contentSeed) external {
        uint256 contentId = contentIds[contentSeed % contentIds.length];

        // Find a settled round for this content
        uint256 recordCount = roundRecords.length;
        if (recordCount == 0) return;

        for (uint256 i = 0; i < recordCount; i++) {
            RoundRecord memory rec = roundRecords[i];
            if (rec.contentId != contentId) continue;

            uint256 roundId = rec.roundId;
            RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
            if (round.state != RoundLib.RoundState.Settled) continue;
            if (distributor.submitterRewardClaimed(contentId, roundId)) continue;

            address submitter = registry.getSubmitter(contentId);
            uint256 balBefore = crepToken.balanceOf(submitter);

            vm.prank(submitter);
            try distributor.claimSubmitterReward(contentId, roundId) {
                uint256 balAfter = crepToken.balanceOf(submitter);
                uint256 payout = balAfter - balBefore;

                ghost_totalSubmitterClaimed += payout;
                submitterClaimCount++;

                _ensureRoundRecord(contentId, roundId);
                uint256 idx = roundRecordIndex[contentId][roundId] - 1;
                roundRecords[idx].submitterClaimed += payout;
            } catch {
                // Failed
            }
            break; // Only try one round per call
        }
    }

    // =========================================================================
    // ACTION 6: claimRefund
    // =========================================================================

    function claimRefund(uint256 contentSeed, uint256 voterSeed) external {
        address voter = voters[voterSeed % voters.length];
        uint256 contentId = contentIds[contentSeed % contentIds.length];

        VoteRecord storage record = voteRecords[voter][contentId];
        if (!record.committed || record.claimed) return;

        uint256 roundId = record.roundId;
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        if (round.state == RoundLib.RoundState.Cancelled) {
            // Full refunds are allowed for all committed votes.
        } else if (round.state == RoundLib.RoundState.Tied || round.state == RoundLib.RoundState.RevealFailed) {
            // Only revealed votes can claim through the cancelled/tied refund path here.
            if (!record.revealed) return;
        } else {
            return;
        }

        // Check if already refunded on-chain
        if (engine.cancelledRoundRefundClaimed(contentId, roundId, voter)) return;

        uint256 balBefore = crepToken.balanceOf(voter);

        vm.prank(voter);
        try engine.claimCancelledRoundRefund(contentId, roundId) {
            uint256 balAfter = crepToken.balanceOf(voter);
            uint256 payout = balAfter - balBefore;

            record.claimed = true;
            ghost_totalRefunded += payout;
            refundCount++;

            _ensureRoundRecord(contentId, roundId);
            uint256 idx = roundRecordIndex[contentId][roundId] - 1;
            roundRecords[idx].totalRefunded += payout;
        } catch {
            // Failed
        }
    }

    // =========================================================================
    // ACTION 7: advanceTime
    // =========================================================================

    function advanceTime(uint256 timeSeed) external {
        uint256 delta = bound(timeSeed, 1 minutes, 2 hours);
        vm.warp(block.timestamp + delta);
        timeAdvanceCount++;
    }

    // =========================================================================
    // ACTION 8: cancelExpiredRound
    // =========================================================================

    function cancelExpiredRound(uint256 contentSeed) external {
        uint256 contentId = contentIds[contentSeed % contentIds.length];
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        if (roundId == 0) return;

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        if (round.state != RoundLib.RoundState.Open) return;

        try engine.cancelExpiredRound(contentId, roundId) {
            cancelCount++;
            _ensureRoundRecord(contentId, roundId);
            uint256 idx = roundRecordIndex[contentId][roundId] - 1;
            roundRecords[idx].cancelled = true;
        } catch {
            // Expiry path not available
        }
    }

    // =========================================================================
    // ACTION 9: finalizeRevealFailedRound
    // =========================================================================

    function finalizeRevealFailedRound(uint256 contentSeed) external {
        uint256 contentId = contentIds[contentSeed % contentIds.length];
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        if (roundId == 0) return;

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        if (round.state != RoundLib.RoundState.Open) return;

        try engine.finalizeRevealFailedRound(contentId, roundId) {
            revealFailedCount++;
            _ensureRoundRecord(contentId, roundId);
            uint256 idx = roundRecordIndex[contentId][roundId] - 1;
            roundRecords[idx].revealFailed = true;
        } catch {
            // Reveal-failed path not available
        }
    }

    // =========================================================================
    // ACTION 10: processUnrevealedVotes
    // =========================================================================

    function processUnrevealedVotes(uint256 roundSeed, uint256 startSeed, uint256 countSeed) external {
        uint256 recordCount = roundRecords.length;
        if (recordCount == 0) return;

        RoundRecord memory rec = roundRecords[roundSeed % recordCount];
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, rec.contentId, rec.roundId);
        if (
            round.state != RoundLib.RoundState.Settled && round.state != RoundLib.RoundState.Tied
                && round.state != RoundLib.RoundState.RevealFailed
        ) {
            return;
        }

        bytes32[] memory commitKeys = RoundEngineReadHelpers.commitKeys(engine, rec.contentId, rec.roundId);
        uint256 len = commitKeys.length;
        if (len == 0) return;

        uint256 startIndex = bound(startSeed, 0, len - 1);
        uint256 maxCount = len - startIndex;
        uint256 count = bound(countSeed, 0, maxCount);

        uint256 voterBalancesBefore = _sumTrackedVoterBalances();
        uint256 handlerBalanceBefore = crepToken.balanceOf(address(this));

        try engine.processUnrevealedVotes(rec.contentId, rec.roundId, startIndex, count) {
            uint256 voterBalancesAfter = _sumTrackedVoterBalances();
            uint256 handlerBalanceAfter = crepToken.balanceOf(address(this));
            uint256 idx = roundRecordIndex[rec.contentId][rec.roundId] - 1;

            if (voterBalancesAfter > voterBalancesBefore) {
                uint256 refundDelta = voterBalancesAfter - voterBalancesBefore;
                ghost_totalRefunded += refundDelta;
                roundRecords[idx].totalRefunded += refundDelta;
            }

            if (handlerBalanceAfter > handlerBalanceBefore) {
                cleanupRewardCount++;
            }

            processCount++;

            _markProcessedVotes(rec.contentId, rec.roundId, commitKeys, startIndex, count);
        } catch {
            // Cleanup not available for this range/state
        }
    }

    // =========================================================================
    // GETTERS (for invariant assertions)
    // =========================================================================

    function getRoundRecordCount() external view returns (uint256) {
        return roundRecords.length;
    }

    function getRoundRecord(uint256 index) external view returns (RoundRecord memory) {
        return roundRecords[index];
    }

    function getVoterCount() external view returns (uint256) {
        return voters.length;
    }

    function getContentCount() external view returns (uint256) {
        return contentIds.length;
    }

    // =========================================================================
    // INTERNAL
    // =========================================================================

    function _ensureRoundRecord(uint256 contentId, uint256 roundId) internal {
        if (roundRecordIndex[contentId][roundId] == 0) {
            roundRecords.push(
                RoundRecord({
                    contentId: contentId,
                    roundId: roundId,
                    totalStaked: 0,
                    totalClaimed: 0,
                    submitterClaimed: 0,
                    totalRefunded: 0,
                    settled: false,
                    cancelled: false,
                    tied: false,
                    revealFailed: false
                })
            );
            roundRecordIndex[contentId][roundId] = roundRecords.length; // 1-indexed
        }
    }

    function _sumTrackedVoterBalances() internal view returns (uint256 total) {
        for (uint256 i = 0; i < voters.length; i++) {
            total += crepToken.balanceOf(voters[i]);
        }
    }

    function _markProcessedVotes(
        uint256 contentId,
        uint256 roundId,
        bytes32[] memory commitKeys,
        uint256 startIndex,
        uint256 count
    ) internal {
        uint256 endIndex = (count == 0 || startIndex + count > commitKeys.length)
            ? commitKeys.length
            : startIndex + count;
        for (uint256 i = startIndex; i < endIndex; i++) {
            RoundLib.Commit memory commit = RoundEngineReadHelpers.commit(engine, contentId, roundId, commitKeys[i]);
            if (commit.voter == address(0) || commit.stakeAmount != 0) continue;

            VoteRecord storage record = voteRecords[commit.voter][contentId];
            if (record.roundId == roundId) {
                record.claimed = true;
            }
        }
    }
}
