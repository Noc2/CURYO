// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { RatingLib } from "../contracts/libraries/RatingLib.sol";
import { deployInitializedProtocolConfig } from "./helpers/VotingTestHelpers.sol";

contract ProtocolConfigBranchesTest is Test {
    bytes32 internal constant QUICKNET_CHAIN_HASH =
        0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971;

    event DrandConfigUpdated(bytes32 drandChainHash, uint64 genesisTime, uint64 period);
    event RewardDistributorUpdated(address rewardDistributor);
    event RatingConfigUpdated(
        uint256 smoothingAlpha,
        uint256 smoothingBeta,
        uint256 observationBetaX18,
        uint256 confidenceMassInitial,
        uint256 confidenceMassMin,
        uint256 confidenceMassMax,
        uint16 confidenceGainBps,
        uint16 confidenceReopenBps,
        uint256 surpriseReferenceX18,
        uint256 maxDeltaLogitX18,
        uint256 maxAbsLogitX18,
        uint16 conservativePenaltyMaxBps,
        uint16 conservativePenaltyMinBps
    );
    event SlashConfigUpdated(
        uint16 slashThresholdBps, uint16 minSlashSettledRounds, uint48 minSlashLowDuration, uint256 minSlashEvidence
    );

    function test_DefaultDrandConfig_UsesQuicknetValues() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        assertEq(config.drandChainHash(), QUICKNET_CHAIN_HASH);
        assertEq(config.drandGenesisTime(), 1_692_803_367);
        assertEq(config.drandPeriod(), 3);
    }

    function test_SetDrandConfig_UpdatesStateAndEmits() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        bytes32 nextHash = bytes32(uint256(1234));
        uint64 nextGenesis = 42;
        uint64 nextPeriod = 9;

        vm.expectEmit(true, true, true, true);
        emit DrandConfigUpdated(nextHash, nextGenesis, nextPeriod);

        config.setDrandConfig(nextHash, nextGenesis, nextPeriod);

        assertEq(config.drandChainHash(), nextHash);
        assertEq(config.drandGenesisTime(), nextGenesis);
        assertEq(config.drandPeriod(), nextPeriod);
    }

    function test_SetRewardDistributor_CanReplaceAddress() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        address firstDistributor = address(0xBEEF);
        address replacementDistributor = address(0xCAFE);

        vm.expectEmit(false, false, false, true);
        emit RewardDistributorUpdated(firstDistributor);
        config.setRewardDistributor(firstDistributor);
        assertEq(config.rewardDistributor(), firstDistributor);

        vm.expectEmit(false, false, false, true);
        emit RewardDistributorUpdated(replacementDistributor);
        config.setRewardDistributor(replacementDistributor);
        assertEq(config.rewardDistributor(), replacementDistributor);
    }

    function test_SetDrandConfig_RejectsZeroHashOrPeriod() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setDrandConfig(bytes32(0), 1, 3);

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setDrandConfig(QUICKNET_CHAIN_HASH, 1, 0);
    }

    function test_DefaultRatingAndSlashConfig_UseRedeployDefaults() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        RatingLib.RatingConfig memory ratingCfg = config.getRatingConfig();
        RatingLib.SlashConfig memory slashCfg = config.getSlashConfig();

        assertEq(ratingCfg.smoothingAlpha, 10e6);
        assertEq(ratingCfg.smoothingBeta, 10e6);
        assertEq(ratingCfg.observationBetaX18, 2e18);
        assertEq(ratingCfg.confidenceMassInitial, 80e6);
        assertEq(ratingCfg.confidenceMassMin, 50e6);
        assertEq(ratingCfg.confidenceMassMax, 500e6);
        assertEq(ratingCfg.confidenceGainBps, 1_500);
        assertEq(ratingCfg.confidenceReopenBps, 2_000);
        assertEq(ratingCfg.surpriseReferenceX18, 8e17);
        assertEq(ratingCfg.maxDeltaLogitX18, 6e17);
        assertEq(ratingCfg.maxAbsLogitX18, 4_595_119_850_134_590_000);
        assertEq(ratingCfg.conservativePenaltyMaxBps, 1_500);
        assertEq(ratingCfg.conservativePenaltyMinBps, 250);

        assertEq(slashCfg.slashThresholdBps, 2_500);
        assertEq(slashCfg.minSlashSettledRounds, 2);
        assertEq(slashCfg.minSlashLowDuration, 7 days);
        assertEq(slashCfg.minSlashEvidence, 200e6);
    }

    function test_SetRatingConfig_UpdatesStateAndEmits() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        vm.expectEmit(true, true, true, true);
        emit RatingConfigUpdated(12e6, 8e6, 3e18, 90e6, 60e6, 600e6, 2_000, 1_000, 9e17, 5e17, 4e18, 1_200, 300);

        config.setRatingConfig(12e6, 8e6, 3e18, 90e6, 60e6, 600e6, 2_000, 1_000, 9e17, 5e17, 4e18, 1_200, 300);

        RatingLib.RatingConfig memory ratingCfg = config.getRatingConfig();
        assertEq(ratingCfg.smoothingAlpha, 12e6);
        assertEq(ratingCfg.smoothingBeta, 8e6);
        assertEq(ratingCfg.observationBetaX18, 3e18);
        assertEq(ratingCfg.confidenceMassInitial, 90e6);
        assertEq(ratingCfg.confidenceMassMin, 60e6);
        assertEq(ratingCfg.confidenceMassMax, 600e6);
        assertEq(ratingCfg.confidenceGainBps, 2_000);
        assertEq(ratingCfg.confidenceReopenBps, 1_000);
        assertEq(ratingCfg.surpriseReferenceX18, 9e17);
        assertEq(ratingCfg.maxDeltaLogitX18, 5e17);
        assertEq(ratingCfg.maxAbsLogitX18, 4e18);
        assertEq(ratingCfg.conservativePenaltyMaxBps, 1_200);
        assertEq(ratingCfg.conservativePenaltyMinBps, 300);
    }

    function test_SetRatingConfig_RejectsInvalidBounds() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setRatingConfig(10e6, 10e6, 0, 80e6, 50e6, 500e6, 1_500, 2_000, 8e17, 6e17, 4e18, 1_500, 250);

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setRatingConfig(10e6, 10e6, 2e18, 80e6, 90e6, 500e6, 1_500, 2_000, 8e17, 6e17, 4e18, 1_500, 250);

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setRatingConfig(10e6, 10e6, 2e18, 80e6, 50e6, 500e6, 10_001, 2_000, 8e17, 6e17, 4e18, 1_500, 250);

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setRatingConfig(10e6, 10e6, 2e18, 80e6, 50e6, 500e6, 1_500, 2_000, 0, 6e17, 4e18, 1_500, 250);

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setRatingConfig(10e6, 10e6, 2e18, 80e6, 50e6, 500e6, 1_500, 2_000, 8e17, 5e18, 4e18, 1_500, 250);

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setRatingConfig(10e6, 10e6, 2e18, 80e6, 50e6, 500e6, 1_500, 2_000, 8e17, 6e17, 4e18, 200, 300);
    }

    function test_SetRatingConfig_RejectsOverflowingMathAndStorageInputs() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setRatingConfig(
            uint256(type(uint128).max) + 1, 10e6, 2e18, 80e6, 50e6, 500e6, 1_500, 2_000, 8e17, 6e17, 4e18, 1_500, 250
        );

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setRatingConfig(
            10e6,
            10e6,
            2e18,
            uint256(type(uint128).max) + 1,
            50e6,
            uint256(type(uint128).max) + 1,
            1_500,
            2_000,
            8e17,
            6e17,
            4e18,
            1_500,
            250
        );

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setRatingConfig(
            10e6,
            10e6,
            uint256(type(int256).max) + 1,
            80e6,
            50e6,
            500e6,
            1_500,
            2_000,
            8e17,
            6e17,
            4e18,
            1_500,
            250
        );

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setRatingConfig(
            10e6,
            10e6,
            2e18,
            80e6,
            50e6,
            500e6,
            1_500,
            2_000,
            8e17,
            6e17,
            uint256(uint128(type(int128).max)) + 1,
            1_500,
            250
        );
    }

    function test_SetSlashConfig_UpdatesStateAndEmits() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        vm.expectEmit(true, true, true, true);
        emit SlashConfigUpdated(2_000, 3, 5 days, 300e6);

        config.setSlashConfig(2_000, 3, 5 days, 300e6);

        RatingLib.SlashConfig memory slashCfg = config.getSlashConfig();
        assertEq(slashCfg.slashThresholdBps, 2_000);
        assertEq(slashCfg.minSlashSettledRounds, 3);
        assertEq(slashCfg.minSlashLowDuration, 5 days);
        assertEq(slashCfg.minSlashEvidence, 300e6);
    }

    function test_SetSlashConfig_RejectsInvalidBounds() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setSlashConfig(0, 2, 7 days, 200e6);

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setSlashConfig(10_000, 2, 7 days, 200e6);

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setSlashConfig(2_500, 0, 7 days, 200e6);

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setSlashConfig(2_500, 2, 0, 200e6);
    }

    function test_SetConfig_RejectsEpochDurationAboveUint32Max() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setConfig(uint256(type(uint32).max) + 1, 30 days, 3, 1000);
    }
}
