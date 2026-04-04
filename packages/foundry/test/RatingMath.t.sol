// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { RatingLib } from "../contracts/libraries/RatingLib.sol";
import { RatingMath } from "../contracts/libraries/RatingMath.sol";

contract RatingMathHarness {
    function clampRatingBps(uint256 ratingBps) external pure returns (uint16) {
        return RatingMath.clampRatingBps(ratingBps);
    }

    function displayRatingFromBps(uint16 ratingBps) external pure returns (uint8) {
        return RatingMath.displayRatingFromBps(ratingBps);
    }

    function ratingBpsToLogitX18(uint16 ratingBps) external pure returns (int256) {
        return RatingMath.ratingBpsToLogitX18(ratingBps);
    }

    function logitX18ToRatingBps(int256 ratingLogitX18) external pure returns (uint16) {
        return RatingMath.logitX18ToRatingBps(ratingLogitX18);
    }

    function computeObservedGapX18(uint256 weightedUp, uint256 weightedDown, RatingLib.RatingConfig calldata cfg)
        external
        pure
        returns (int256)
    {
        return RatingMath.computeObservedGapX18(weightedUp, weightedDown, cfg);
    }

    function computeNextConfidenceMass(
        uint256 previousConfidenceMass,
        uint256 roundEvidence,
        int256 observedGapX18,
        RatingLib.RatingConfig calldata cfg
    ) external pure returns (uint256) {
        return RatingMath.computeNextConfidenceMass(previousConfidenceMass, roundEvidence, observedGapX18, cfg);
    }

    function computeConservativeRatingBps(
        uint16 ratingBps,
        uint256 confidenceMass,
        RatingLib.RatingConfig calldata cfg
    ) external pure returns (uint16) {
        return RatingMath.computeConservativeRatingBps(ratingBps, confidenceMass, cfg);
    }

    function applySettlement(
        uint16 referenceRatingBps,
        uint256 weightedUp,
        uint256 weightedDown,
        RatingLib.RatingState calldata previousState,
        RatingLib.RatingConfig calldata ratingConfig,
        RatingLib.SlashConfig calldata slashConfig,
        uint48 settledAt
    )
        external
        pure
        returns (RatingLib.RatingState memory nextState, int256 observedGapX18, int256 ratingDeltaBps)
    {
        return RatingMath.applySettlement(
            referenceRatingBps, weightedUp, weightedDown, previousState, ratingConfig, slashConfig, settledAt
        );
    }
}

contract RatingMathTest is Test {
    RatingMathHarness internal harness;

    function setUp() public {
        harness = new RatingMathHarness();
    }

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

    function test_ClampRatingBps_ConstrainsExtremes() public view {
        assertEq(harness.clampRatingBps(0), 100);
        assertEq(harness.clampRatingBps(99), 100);
        assertEq(harness.clampRatingBps(5_000), 5_000);
        assertEq(harness.clampRatingBps(10_000), 9_900);
        assertEq(harness.clampRatingBps(12_500), 9_900);
    }

    function test_LogitRoundTrip_StaysCloseForRepresentativeScores() public view {
        uint16[5] memory values = [uint16(100), 1_750, 5_000, 7_250, 9_900];
        for (uint256 i = 0; i < values.length; i++) {
            uint16 ratingBps = values[i];
            uint16 roundTrip = harness.logitX18ToRatingBps(harness.ratingBpsToLogitX18(ratingBps));
            assertApproxEqAbs(roundTrip, ratingBps, 1, "round-trip drift too large");
        }
    }

    function test_AnchorRelativeMovement_PushesFromTheCurrentReference() public view {
        RatingLib.RatingConfig memory cfg = _ratingConfig();
        RatingLib.SlashConfig memory slashCfg = _slashConfig();
        RatingLib.RatingState memory prev = _state(0, 80e6, 0, 0, 5_000, 5_000, 0, 0);

        (RatingLib.RatingState memory nextLow,,) =
            harness.applySettlement(5_000, 60e6, 40e6, prev, cfg, slashCfg, 1);
        (RatingLib.RatingState memory nextHigh,,) =
            harness.applySettlement(6_000, 60e6, 40e6, prev, cfg, slashCfg, 1);

        assertGt(nextLow.ratingBps, 5_000, "positive evidence should move above the anchor");
        assertGt(nextHigh.ratingBps, nextLow.ratingBps, "higher anchor should settle higher under same evidence");
    }

    function test_ConfidenceReopening_ContradictionLowersConfidenceMass() public view {
        RatingLib.RatingConfig memory cfg = _ratingConfig();
        uint256 startingMass = 120e6;
        int256 alignedGap = harness.computeObservedGapX18(55e6, 45e6, cfg);
        int256 contradictoryGap = harness.computeObservedGapX18(0, 100e6, cfg);

        uint256 alignedMass = harness.computeNextConfidenceMass(startingMass, 100e6, alignedGap, cfg);
        uint256 reopenedMass = harness.computeNextConfidenceMass(startingMass, 100e6, contradictoryGap, cfg);

        assertGt(alignedMass, reopenedMass, "more surprising round should reopen confidence");
        assertGe(reopenedMass, cfg.confidenceMassMin, "confidence mass must respect minimum");
    }

    function test_ConservativeRatingPenalty_ClosesUpWithMoreConfidence() public view {
        RatingLib.RatingConfig memory cfg = _ratingConfig();

        uint16 lowConfidenceConservative = harness.computeConservativeRatingBps(6_800, 80e6, cfg);
        uint16 highConfidenceConservative = harness.computeConservativeRatingBps(6_800, 320e6, cfg);

        assertLt(lowConfidenceConservative, highConfidenceConservative, "higher confidence should penalize less");
        assertEq(lowConfidenceConservative, 5_300, "default low-confidence penalty should be 1500 bps");
        assertEq(highConfidenceConservative, 6_425, "higher confidence should shrink the penalty");
    }

    function test_LowSinceGating_RequiresEvidenceRoundsAndPersistence() public view {
        RatingLib.RatingConfig memory cfg = _ratingConfig();
        RatingLib.SlashConfig memory slashCfg = _slashConfig();
        RatingLib.RatingState memory prev = _state(0, 80e6, 0, 0, 5_000, 5_000, 0, 0);

        (RatingLib.RatingState memory notYetSlashable,,) =
            harness.applySettlement(5_000, 0, 300e6, prev, cfg, slashCfg, 1);
        assertEq(notYetSlashable.lowSince, 0, "insufficient settled rounds should not arm lowSince");

        prev = _state(0, 80e6, 100e6, 1, 5_000, 5_000, 1, 0);
        (RatingLib.RatingState memory slashable,,) =
            harness.applySettlement(5_000, 0, 300e6, prev, cfg, slashCfg, 2);
        assertEq(slashable.lowSince, 2, "persistent low rating should arm lowSince once thresholds are met");

        (RatingLib.RatingState memory recovered,,) = harness.applySettlement(5_000, 500e6, 0, slashable, cfg, slashCfg, 3);
        assertEq(recovered.lowSince, 0, "recovery above threshold should clear lowSince");
    }
}
