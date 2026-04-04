// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {
    SD59x18,
    abs,
    convert,
    div,
    exp,
    ln,
    mul,
    sd,
    unwrap
} from "../../lib/prb-math/src/SD59x18.sol";
import { RatingLib } from "./RatingLib.sol";

/// @title RatingMath
/// @notice Pure helpers for the score-relative rating system.
library RatingMath {
    error RatingMathOverflow();

    uint256 internal constant MIN_PROBABILITY_X18 = 1e12;
    uint256 internal constant MAX_PROBABILITY_X18 = RatingLib.WAD - MIN_PROBABILITY_X18;

    function clampRatingBps(uint256 ratingBps) internal pure returns (uint16) {
        if (ratingBps < RatingLib.MIN_RATING_BPS) return RatingLib.MIN_RATING_BPS;
        if (ratingBps > RatingLib.MAX_RATING_BPS) return RatingLib.MAX_RATING_BPS;
        return uint16(ratingBps);
    }

    function displayRatingFromBps(uint16 ratingBps) internal pure returns (uint8) {
        uint256 displayRating = (uint256(ratingBps) + 50) / 100;
        if (displayRating > 100) return 100;
        return uint8(displayRating);
    }

    function probabilityX18FromBps(uint16 ratingBps) internal pure returns (SD59x18) {
        uint16 clampedRating = clampRatingBps(ratingBps);
        return div(convert(int256(uint256(clampedRating))), convert(int256(uint256(RatingLib.BPS_SCALE))));
    }

    function ratingBpsToLogitX18(uint16 ratingBps) internal pure returns (int256) {
        return unwrap(_logit(probabilityX18FromBps(ratingBps)));
    }

    function logitX18ToRatingBps(int256 ratingLogitX18) internal pure returns (uint16) {
        SD59x18 probability = _sigmoid(sd(ratingLogitX18));
        uint256 probabilityX18 = uint256(unwrap(probability));
        uint256 ratingBps = (probabilityX18 * RatingLib.BPS_SCALE) / RatingLib.WAD;
        return clampRatingBps(ratingBps);
    }

    function applySettlement(
        uint16 referenceRatingBps,
        uint256 weightedUp,
        uint256 weightedDown,
        RatingLib.RatingState memory previousState,
        RatingLib.RatingConfig memory ratingConfig,
        RatingLib.SlashConfig memory slashConfig,
        uint48 settledAt
    ) internal pure returns (RatingLib.RatingState memory nextState, int256 observedGapX18, int256 ratingDeltaBps) {
        uint256 roundEvidence = weightedUp + weightedDown;
        uint256 confidenceMass = previousState.confidenceMass == 0 ? ratingConfig.confidenceMassInitial : previousState.confidenceMass;
        confidenceMass = _clampConfidenceMass(confidenceMass, ratingConfig);

        int256 anchorLogitX18 = ratingBpsToLogitX18(referenceRatingBps);
        observedGapX18 = computeObservedGapX18(weightedUp, weightedDown, ratingConfig);
        int256 deltaLogitX18 = computeDeltaLogitX18(observedGapX18, roundEvidence, confidenceMass, ratingConfig);
        int256 nextLogitX18 = _clampSigned(anchorLogitX18 + deltaLogitX18, ratingConfig.maxAbsLogitX18);
        uint16 nextRatingBps = logitX18ToRatingBps(nextLogitX18);

        nextState.ratingLogitX18 = _toInt128(nextLogitX18);
        nextState.confidenceMass =
            _toUint128(computeNextConfidenceMass(confidenceMass, roundEvidence, observedGapX18, ratingConfig));
        nextState.effectiveEvidence = _toUint128(uint256(previousState.effectiveEvidence) + roundEvidence);
        nextState.settledRounds = previousState.settledRounds + 1;
        nextState.ratingBps = nextRatingBps;
        nextState.conservativeRatingBps = computeConservativeRatingBps(nextRatingBps, uint256(nextState.confidenceMass), ratingConfig);
        nextState.lastUpdatedAt = settledAt;

        bool canTrackLowRating = uint256(nextState.effectiveEvidence) >= slashConfig.minSlashEvidence
            && nextState.settledRounds >= slashConfig.minSlashSettledRounds;
        if (canTrackLowRating && nextState.conservativeRatingBps < slashConfig.slashThresholdBps) {
            nextState.lowSince = previousState.lowSince == 0 ? settledAt : previousState.lowSince;
        } else {
            nextState.lowSince = 0;
        }

        ratingDeltaBps = int256(uint256(nextState.ratingBps)) - int256(uint256(referenceRatingBps));
    }

    function computeObservedGapX18(uint256 weightedUp, uint256 weightedDown, RatingLib.RatingConfig memory ratingConfig)
        internal
        pure
        returns (int256)
    {
        uint256 numerator = weightedUp + ratingConfig.smoothingAlpha;
        uint256 denominator = weightedUp + weightedDown + ratingConfig.smoothingAlpha + ratingConfig.smoothingBeta;

        if (denominator == 0) {
            return 0;
        }

        SD59x18 observedProbability = div(convert(int256(numerator)), convert(int256(denominator)));
        SD59x18 observedLogit = _logit(observedProbability);
        SD59x18 observedGap = div(observedLogit, sd(int256(ratingConfig.observationBetaX18)));
        return unwrap(observedGap);
    }

    function computeDeltaLogitX18(
        int256 observedGapX18,
        uint256 roundEvidence,
        uint256 confidenceMass,
        RatingLib.RatingConfig memory ratingConfig
    ) internal pure returns (int256) {
        if (roundEvidence == 0) {
            return 0;
        }

        SD59x18 step = computeStepX18(roundEvidence, confidenceMass);
        SD59x18 deltaLogit = mul(step, sd(observedGapX18));
        return _clampSigned(unwrap(deltaLogit), ratingConfig.maxDeltaLogitX18);
    }

    function computeStepX18(uint256 roundEvidence, uint256 confidenceMass) internal pure returns (SD59x18) {
        if (roundEvidence == 0) {
            return sd(0);
        }
        return div(convert(int256(roundEvidence)), convert(int256(roundEvidence + confidenceMass)));
    }

    function computeNextConfidenceMass(
        uint256 previousConfidenceMass,
        uint256 roundEvidence,
        int256 observedGapX18,
        RatingLib.RatingConfig memory ratingConfig
    ) internal pure returns (uint256) {
        if (roundEvidence == 0) {
            return _clampConfidenceMass(previousConfidenceMass, ratingConfig);
        }

        uint256 surpriseX18 = computeSurpriseX18(observedGapX18, ratingConfig.surpriseReferenceX18);
        uint256 confidenceGain = (roundEvidence * ratingConfig.confidenceGainBps) / RatingLib.BPS_SCALE;
        uint256 confidenceReopen =
            (roundEvidence * ratingConfig.confidenceReopenBps * surpriseX18) / (RatingLib.BPS_SCALE * RatingLib.WAD);

        uint256 nextConfidenceMass;
        if (confidenceGain >= confidenceReopen) {
            nextConfidenceMass = previousConfidenceMass + (confidenceGain - confidenceReopen);
        } else {
            uint256 decrease = confidenceReopen - confidenceGain;
            nextConfidenceMass = decrease >= previousConfidenceMass ? 0 : previousConfidenceMass - decrease;
        }

        return _clampConfidenceMass(nextConfidenceMass, ratingConfig);
    }

    function computeConservativeRatingBps(
        uint16 ratingBps,
        uint256 confidenceMass,
        RatingLib.RatingConfig memory ratingConfig
    ) internal pure returns (uint16) {
        uint256 maxPenaltyBps = ratingConfig.conservativePenaltyMaxBps;
        if (maxPenaltyBps == 0) {
            return ratingBps;
        }

        uint256 penaltyBps;
        if (confidenceMass == 0 || confidenceMass <= ratingConfig.confidenceMassInitial) {
            penaltyBps = maxPenaltyBps;
        } else {
            penaltyBps = (maxPenaltyBps * ratingConfig.confidenceMassInitial) / confidenceMass;
            if (penaltyBps < ratingConfig.conservativePenaltyMinBps) {
                penaltyBps = ratingConfig.conservativePenaltyMinBps;
            }
            if (penaltyBps > maxPenaltyBps) {
                penaltyBps = maxPenaltyBps;
            }
        }

        if (ratingBps <= penaltyBps) {
            return 0;
        }
        return uint16(uint256(ratingBps) - penaltyBps);
    }

    function computeSurpriseX18(int256 observedGapX18, uint256 surpriseReferenceX18) internal pure returns (uint256) {
        if (surpriseReferenceX18 == 0) {
            return RatingLib.WAD;
        }

        uint256 gapMagnitudeX18 = uint256(unwrap(abs(sd(observedGapX18))));
        uint256 surpriseX18 = (gapMagnitudeX18 * RatingLib.WAD) / surpriseReferenceX18;
        if (surpriseX18 > RatingLib.WAD) {
            return RatingLib.WAD;
        }
        return surpriseX18;
    }

    function _logit(SD59x18 probability) private pure returns (SD59x18) {
        SD59x18 clampedProbability = _clampProbability(probability);
        int256 oneMinusProbabilityX18 = int256(RatingLib.WAD) - unwrap(clampedProbability);
        SD59x18 odds = div(clampedProbability, sd(oneMinusProbabilityX18));
        return ln(odds);
    }

    function _sigmoid(SD59x18 x) private pure returns (SD59x18) {
        if (unwrap(x) >= 0) {
            SD59x18 denominator = sd(int256(RatingLib.WAD) + unwrap(exp(-x)));
            return div(sd(int256(RatingLib.WAD)), denominator);
        }

        SD59x18 expX = exp(x);
        return div(expX, sd(int256(RatingLib.WAD) + unwrap(expX)));
    }

    function _clampProbability(SD59x18 probability) private pure returns (SD59x18) {
        int256 probabilityX18 = unwrap(probability);
        if (probabilityX18 < int256(MIN_PROBABILITY_X18)) {
            return sd(int256(MIN_PROBABILITY_X18));
        }
        if (probabilityX18 > int256(MAX_PROBABILITY_X18)) {
            return sd(int256(MAX_PROBABILITY_X18));
        }
        return probability;
    }

    function _clampConfidenceMass(uint256 confidenceMass, RatingLib.RatingConfig memory ratingConfig)
        private
        pure
        returns (uint256)
    {
        if (confidenceMass < ratingConfig.confidenceMassMin) {
            return ratingConfig.confidenceMassMin;
        }
        if (confidenceMass > ratingConfig.confidenceMassMax) {
            return ratingConfig.confidenceMassMax;
        }
        return confidenceMass;
    }

    function _clampSigned(int256 value, uint256 maxAbsValue) private pure returns (int256) {
        int256 maxAbsValueSigned = int256(maxAbsValue);
        if (value > maxAbsValueSigned) {
            return maxAbsValueSigned;
        }
        if (value < -maxAbsValueSigned) {
            return -maxAbsValueSigned;
        }
        return value;
    }

    function _toUint128(uint256 value) private pure returns (uint128) {
        if (value > type(uint128).max) revert RatingMathOverflow();
        return uint128(value);
    }

    function _toInt128(int256 value) private pure returns (int128) {
        if (value > type(int128).max || value < type(int128).min) revert RatingMathOverflow();
        return int128(value);
    }
}
