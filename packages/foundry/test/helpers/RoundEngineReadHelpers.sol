// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { RoundVotingEngine } from "../../contracts/RoundVotingEngine.sol";
import { ProtocolConfig } from "../../contracts/ProtocolConfig.sol";
import { RoundLib } from "../../contracts/libraries/RoundLib.sol";

library RoundEngineReadHelpers {
    function activeRoundId(RoundVotingEngine engine, uint256 contentId) internal view returns (uint256 roundId) {
        roundId = engine.currentRoundId(contentId);
        if (roundId == 0) return 0;

        RoundLib.Round memory r = round(engine, contentId, roundId);
        if (r.state != RoundLib.RoundState.Open) {
            return 0;
        }
    }

    function latestRoundId(RoundVotingEngine engine, uint256 contentId) internal view returns (uint256 roundId) {
        uint256 activeId = activeRoundId(engine, contentId);
        if (activeId != 0) {
            return activeId;
        }

        uint256 probe = 1;
        while (true) {
            RoundLib.Round memory r = round(engine, contentId, probe);
            if (r.startTime == 0) {
                return probe - 1;
            }
            probe++;
        }
    }

    function round(RoundVotingEngine engine, uint256 contentId, uint256 roundId)
        internal
        view
        returns (RoundLib.Round memory r)
    {
        (
            r.startTime,
            r.state,
            r.voteCount,
            r.revealedCount,
            r.totalStake,
            r.upPool,
            r.downPool,
            r.upCount,
            r.downCount,
            r.upWins,
            r.settledAt,
            r.thresholdReachedAt,
            r.weightedUpPool,
            r.weightedDownPool
        ) = engine.rounds(contentId, roundId);
    }

    function commit(RoundVotingEngine engine, uint256 contentId, uint256 roundId, bytes32 commitKey)
        internal
        view
        returns (RoundLib.Commit memory c)
    {
        (
            c.voter,
            c.stakeAmount,
            c.ciphertext,
            c.targetRound,
            c.drandChainHash,
            c.frontend,
            c.revealableAfter,
            c.revealed,
            c.isUp,
            c.epochIndex
        ) = engine.commits(contentId, roundId, commitKey);
    }

    function roundConfig(RoundVotingEngine engine, uint256 contentId, uint256 roundId)
        internal
        view
        returns (RoundLib.RoundConfig memory cfg)
    {
        (cfg.epochDuration, cfg.maxDuration, cfg.minVoters, cfg.maxVoters) =
            engine.roundConfigSnapshot(contentId, roundId);
        if (cfg.epochDuration == 0) {
            (cfg.epochDuration, cfg.maxDuration, cfg.minVoters, cfg.maxVoters) =
                ProtocolConfig(address(engine.protocolConfig())).config();
        }
    }

    function commitKeys(RoundVotingEngine engine, uint256 contentId, uint256 roundId)
        internal
        view
        returns (bytes32[] memory keys)
    {
        RoundLib.Round memory r = round(engine, contentId, roundId);
        uint256 count = r.voteCount;
        keys = new bytes32[](count);
        for (uint256 i = 0; i < count; i++) {
            keys[i] = engine.getRoundCommitKey(contentId, roundId, i);
        }
    }
}
