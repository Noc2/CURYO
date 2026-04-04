// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { RatingLib } from "../contracts/libraries/RatingLib.sol";
import { RatingMath } from "../contracts/libraries/RatingMath.sol";

contract RatingMathFuzzTest is Test {
    function _ratingConfig() internal pure returns (RatingLib.RatingConfig memory cfg) {
        cfg = RatingLib.RatingConfig({
            smoothingAlpha: 10e6,
            smoothingBeta: 10e6,
            observationBetaX18: 2e18,
            confidenceMassInitial: 80e6,
            confidenceMassMin: 50e6,
            confidenceMassMax: 500e6,
            confidenceGainBps: 1_500,
            confidenceReopenBps: 2_000,
            surpriseReferenceX18: 8e17,
            maxDeltaLogitX18: 6e17,
            maxAbsLogitX18: 4_595_119_850_134_590_000,
            conservativePenaltyMaxBps: 1_500,
            conservativePenaltyMinBps: 250
        });
    }

    function _slashConfig() internal pure returns (RatingLib.SlashConfig memory cfg) {
        cfg = RatingLib.SlashConfig({
            slashThresholdBps: 2_500,
            minSlashSettledRounds: 2,
            minSlashLowDuration: 7 days,
            minSlashEvidence: 200e6
        });
    }

    function _state(
        int128 ratingLogitX18,
        uint128 confidenceMass,
        uint128 effectiveEvidence,
        uint32 settledRounds,
        uint16 ratingBps,
        uint16 conservativeRatingBps,
        uint48 lastUpdatedAt,
        uint48 lowSince
    ) internal pure returns (RatingLib.RatingState memory state) {
        state = RatingLib.RatingState({
            ratingLogitX18: ratingLogitX18,
            confidenceMass: confidenceMass,
            effectiveEvidence: effectiveEvidence,
            settledRounds: settledRounds,
            ratingBps: ratingBps,
            conservativeRatingBps: conservativeRatingBps,
            lastUpdatedAt: lastUpdatedAt,
            lowSince: lowSince
        });
    }

    function testFuzz_LogitRoundTrip_Stable(uint16 ratingBps) public view {
        ratingBps = RatingMath.clampRatingBps(ratingBps);
        uint16 roundTrip = RatingMath.logitX18ToRatingBps(RatingMath.ratingBpsToLogitX18(ratingBps));
        assertApproxEqAbs(roundTrip, ratingBps, 1, "round-trip drift too large");
    }

    function testFuzz_AnchorRelativeMovement_PreservesOrdering(
        uint16 referenceA,
        uint16 referenceB,
        uint256 upStake,
        uint256 downStake
    ) public view {
        referenceA = RatingMath.clampRatingBps(referenceA);
        referenceB = RatingMath.clampRatingBps(referenceB);
        upStake = bound(upStake, 1, 500e6);
        downStake = bound(downStake, 0, 500e6);

        if (referenceA > referenceB) {
            uint16 tmp = referenceA;
            referenceA = referenceB;
            referenceB = tmp;
        }

        RatingLib.RatingConfig memory cfg = _ratingConfig();
        RatingLib.SlashConfig memory slashCfg = _slashConfig();
        RatingLib.RatingState memory prev = _state(0, 80e6, 0, 0, 5_000, 5_000, 0, 0);

        (RatingLib.RatingState memory nextA,,) =
            RatingMath.applySettlement(referenceA, upStake, downStake, prev, cfg, slashCfg, 1);
        (RatingLib.RatingState memory nextB,,) =
            RatingMath.applySettlement(referenceB, upStake, downStake, prev, cfg, slashCfg, 1);

        assertLe(nextA.ratingBps, nextB.ratingBps, "higher anchor should not settle lower for same vote mix");
    }

    function testFuzz_ConservativePenalty_WeakensWithConfidence(uint16 ratingBps, uint256 confidenceMass)
        public
        view
    {
        ratingBps = RatingMath.clampRatingBps(ratingBps);
        confidenceMass = bound(confidenceMass, 1, 1_000e6);
        RatingLib.RatingConfig memory cfg = _ratingConfig();

        uint16 lowerConfidence = RatingMath.computeConservativeRatingBps(ratingBps, 80e6, cfg);
        uint16 higherConfidence = RatingMath.computeConservativeRatingBps(ratingBps, confidenceMass + 80e6, cfg);

        assertGe(higherConfidence, lowerConfidence, "confidence should not increase the conservative penalty");
    }

    function testFuzz_ConfidenceReopening_LowerMassForSurprisingRound(
        uint256 previousConfidenceMass,
        uint256 roundEvidence,
        uint256 lessSurprisingUp
    ) public view {
        previousConfidenceMass = bound(previousConfidenceMass, 1, 500e6);
        roundEvidence = bound(roundEvidence, 1, 500e6);
        lessSurprisingUp = bound(lessSurprisingUp, 45e6, 55e6);

        RatingLib.RatingConfig memory cfg = _ratingConfig();
        uint256 lessSurprisingDown = 100e6 - lessSurprisingUp;
        int256 lessSurprisingGap = RatingMath.computeObservedGapX18(lessSurprisingUp, lessSurprisingDown, cfg);
        int256 surprisingGap = RatingMath.computeObservedGapX18(0, 100e6, cfg);

        uint256 lessSurprisingMass =
            RatingMath.computeNextConfidenceMass(previousConfidenceMass, roundEvidence, lessSurprisingGap, cfg);
        uint256 surprisingMass = RatingMath.computeNextConfidenceMass(previousConfidenceMass, roundEvidence, surprisingGap, cfg);

        assertGe(lessSurprisingMass, surprisingMass, "more surprising round should reopen confidence more");
    }
}
