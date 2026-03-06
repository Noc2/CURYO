// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";

/// @title RoundLibHarness
/// @notice Exposes RoundLib internal storage functions for fuzz testing.
contract RoundLibHarness {
    using RoundLib for RoundLib.Commit;
    using RoundLib for RoundLib.Round;

    RoundLib.Commit public commit;
    RoundLib.Round public round;

    function setCommit(uint256 stakeAmount, uint32 epochIndex) external {
        commit.stakeAmount = stakeAmount;
        commit.epochIndex = epochIndex;
    }

    function getEffectiveStake() external view returns (uint256) {
        return commit.effectiveStake();
    }

    function setRound(uint256 startTime) external {
        round.startTime = startTime;
        round.state = RoundLib.RoundState.Open;
    }

    function getComputeEpochIndex(uint256 epochDuration, uint256 commitTimestamp) external view returns (uint32) {
        return round.computeEpochIndex(epochDuration, commitTimestamp);
    }
}

/// @title RoundLibFuzz
/// @notice Fuzz tests for RoundLib epoch weight and effective stake logic.
contract RoundLibFuzz is Test {
    RoundLibHarness public harness;

    function setUp() public {
        harness = new RoundLibHarness();
    }

    // =========================================================================
    // epochWeightBps
    // =========================================================================

    function testFuzz_epochWeightBps_Bounded(uint32 epochIndex) public pure {
        uint256 weight = RoundLib.epochWeightBps(epochIndex);
        // Epoch 0 = 10000 (100%), all others = 2500 (25%)
        assertTrue(weight == 10000 || weight == 2500, "unexpected weight value");
    }

    // =========================================================================
    // effectiveStake
    // =========================================================================

    function testFuzz_effectiveStake_Epoch0FullStake(uint256 stakeAmount) public {
        stakeAmount = bound(stakeAmount, 0, type(uint128).max);

        harness.setCommit(stakeAmount, 0);
        uint256 effective = harness.getEffectiveStake();
        assertEq(effective, stakeAmount, "epoch 0 should return full stake");
    }

    function testFuzz_effectiveStake_Epoch1Quarter(uint256 stakeAmount) public {
        stakeAmount = bound(stakeAmount, 0, type(uint128).max);

        harness.setCommit(stakeAmount, 1);
        uint256 effective = harness.getEffectiveStake();
        assertEq(effective, (stakeAmount * 2500) / 10000, "epoch 1+ should return 25%");
    }

    // =========================================================================
    // computeEpochIndex monotonicity
    // =========================================================================

    function testFuzz_computeEpochIndex_Monotonic(
        uint256 startTime,
        uint256 epochDuration,
        uint256 offset1,
        uint256 offset2
    ) public {
        startTime = bound(startTime, 1, type(uint64).max / 2);
        epochDuration = bound(epochDuration, 60, 7 days); // reasonable range
        offset1 = bound(offset1, 0, 30 days);
        offset2 = bound(offset2, offset1, 30 days);

        harness.setRound(startTime);

        uint256 t1 = startTime + offset1;
        uint256 t2 = startTime + offset2;

        uint32 idx1 = harness.getComputeEpochIndex(epochDuration, t1);
        uint32 idx2 = harness.getComputeEpochIndex(epochDuration, t2);

        // Later timestamp should have epoch index >= earlier
        assertGe(idx2, idx1, "epoch index should be monotonically non-decreasing");
    }
}
