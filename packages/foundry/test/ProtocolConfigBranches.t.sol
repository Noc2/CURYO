// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { RatingLib } from "../contracts/libraries/RatingLib.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { deployInitializedProtocolConfig } from "./helpers/VotingTestHelpers.sol";

contract MockRewardDistributorForConfig {
    address public votingEngine;

    constructor(address votingEngine_) {
        votingEngine = votingEngine_;
    }
}

contract ProtocolConfigBranchesTest is Test {
    bytes32 internal constant QUICKNET_CHAIN_HASH = 0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971;

    event DrandConfigUpdated(bytes32 drandChainHash, uint64 genesisTime, uint64 period);
    event RewardDistributorUpdated(address rewardDistributor);
    event RewardDistributorAuthorizationUpdated(address rewardDistributor, bool authorized);
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
    event RoundConfigBoundsUpdated(
        uint256 minEpochDuration,
        uint256 maxEpochDuration,
        uint256 minRoundDuration,
        uint256 maxRoundDuration,
        uint256 minSettlementVoters,
        uint256 maxSettlementVoters,
        uint256 minVoterCap,
        uint256 maxVoterCap
    );

    function test_DefaultDrandConfig_UsesQuicknetValues() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        assertEq(config.drandChainHash(), QUICKNET_CHAIN_HASH);
        assertEq(config.drandGenesisTime(), 1_692_803_367);
        assertEq(config.drandPeriod(), 3);
    }

    function test_InitializeWithTreasury_GovernanceCanRecoverTreasuryRoles() public {
        address admin = address(0xA11CE);
        address governance = address(0xB0B);
        address treasuryAuthority = address(0xCAFE);
        address newTreasuryOperator = address(0xDAD);

        ProtocolConfig configImpl = new ProtocolConfig();
        ProtocolConfig config = ProtocolConfig(
            address(
                new ERC1967Proxy(
                    address(configImpl),
                    abi.encodeCall(ProtocolConfig.initializeWithTreasury, (admin, governance, treasuryAuthority))
                )
            )
        );

        assertTrue(config.hasRole(config.DEFAULT_ADMIN_ROLE(), governance));
        assertTrue(config.hasRole(config.TREASURY_ADMIN_ROLE(), governance));
        assertTrue(config.hasRole(config.TREASURY_ADMIN_ROLE(), treasuryAuthority));
        assertTrue(config.hasRole(config.TREASURY_ROLE(), treasuryAuthority));
        assertFalse(config.hasRole(config.TREASURY_ROLE(), governance));

        bytes32 treasuryRole = config.TREASURY_ROLE();
        vm.prank(governance);
        config.grantRole(treasuryRole, newTreasuryOperator);

        assertTrue(config.hasRole(treasuryRole, newTreasuryOperator));
    }

    function test_SetDrandConfig_UpdatesStateAndEmits() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        bytes32 nextHash = bytes32(uint256(1234));
        uint64 nextGenesis = 42;
        uint64 nextPeriod = 9;
        vm.warp(100);

        vm.expectEmit(true, true, true, true);
        emit DrandConfigUpdated(nextHash, nextGenesis, nextPeriod);

        config.setDrandConfig(nextHash, nextGenesis, nextPeriod);

        assertEq(config.drandChainHash(), nextHash);
        assertEq(config.drandGenesisTime(), nextGenesis);
        assertEq(config.drandPeriod(), nextPeriod);
    }

    function test_SetRewardDistributor_RejectsReplacementForSameEngine() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        address engine = address(0xE641);
        address firstDistributor = address(new MockRewardDistributorForConfig(engine));
        address replacementDistributor = address(new MockRewardDistributorForConfig(engine));

        vm.expectEmit(false, false, false, true);
        emit RewardDistributorAuthorizationUpdated(firstDistributor, true);
        vm.expectEmit(false, false, false, true);
        emit RewardDistributorUpdated(firstDistributor);
        config.setRewardDistributor(firstDistributor);
        assertEq(config.rewardDistributor(), firstDistributor);
        assertTrue(config.isRewardDistributor(firstDistributor));
        assertTrue(config.isRewardDistributorForEngine(firstDistributor, engine));

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setRewardDistributor(replacementDistributor);
        assertEq(config.rewardDistributor(), firstDistributor);
        assertTrue(config.isRewardDistributor(firstDistributor));
        assertFalse(config.isRewardDistributor(replacementDistributor));
        assertTrue(config.isRewardDistributorForEngine(firstDistributor, engine));
        assertFalse(config.isRewardDistributorForEngine(replacementDistributor, engine));
    }

    function test_SetRewardDistributor_KeepsPreviousEngineAuthorized() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        address firstEngine = address(0xE641);
        address replacementEngine = address(0xE642);
        address firstDistributor = address(new MockRewardDistributorForConfig(firstEngine));
        address replacementDistributor = address(new MockRewardDistributorForConfig(replacementEngine));

        config.setRewardDistributor(firstDistributor);
        config.setRewardDistributor(replacementDistributor);

        assertEq(config.rewardDistributor(), replacementDistributor);
        assertTrue(config.isRewardDistributor(firstDistributor));
        assertTrue(config.isRewardDistributor(replacementDistributor));
        assertTrue(config.isRewardDistributorForEngine(firstDistributor, firstEngine));
        assertTrue(config.isRewardDistributorForEngine(replacementDistributor, replacementEngine));
    }

    function test_RevokeRewardDistributor_RemovesAuthorization() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));
        address distributor = address(0xBEEF);
        config.setRewardDistributor(distributor);

        vm.expectEmit(false, false, false, true);
        emit RewardDistributorAuthorizationUpdated(distributor, false);
        config.revokeRewardDistributor(distributor);
        assertFalse(config.isRewardDistributor(distributor));
    }

    function test_SetDrandConfig_RejectsZeroHashOrPeriod() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setDrandConfig(bytes32(0), 1, 3);

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setDrandConfig(QUICKNET_CHAIN_HASH, 1, 0);
    }

    function test_SetDrandConfig_RejectsFutureGenesisOrPeriodLongerThanMinEpoch() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));
        vm.warp(100);

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setDrandConfig(QUICKNET_CHAIN_HASH, 101, 3);

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setDrandConfig(QUICKNET_CHAIN_HASH, 1, 5 minutes + 1);
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
            10e6, 10e6, uint256(type(int256).max) + 1, 80e6, 50e6, 500e6, 1_500, 2_000, 8e17, 6e17, 4e18, 1_500, 250
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

    function test_DefaultRoundConfigBounds_ExposeCreatorAllowedRange() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        ProtocolConfig.RoundConfigBounds memory bounds = config.getRoundConfigBounds();
        assertEq(bounds.minEpochDuration, 5 minutes);
        assertEq(bounds.maxEpochDuration, 60 minutes);
        assertEq(bounds.minRoundDuration, 1 hours);
        assertEq(bounds.maxRoundDuration, 30 days);
        assertEq(config.ABSOLUTE_MAX_ROUND_DURATION(), 30 days);
        assertEq(bounds.minSettlementVoters, 2);
        assertEq(bounds.maxSettlementVoters, 100);
        assertEq(bounds.minVoterCap, 2);
        assertEq(bounds.maxVoterCap, 10_000);
    }

    function test_ValidateRoundConfig_AcceptsGovernedCreatorChoice() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        RoundLib.RoundConfig memory roundCfg = config.validateRoundConfig(10 minutes, 2 hours, 4, 25);

        assertEq(roundCfg.epochDuration, 10 minutes);
        assertEq(roundCfg.maxDuration, 2 hours);
        assertEq(roundCfg.minVoters, 4);
        assertEq(roundCfg.maxVoters, 25);
    }

    function test_ValidateRoundConfig_RejectsOutsideGovernanceBounds() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.validateRoundConfig(4 minutes, 2 hours, 4, 25);

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.validateRoundConfig(10 minutes, 30 minutes, 4, 25);

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.validateRoundConfig(10 minutes, 2 hours, 1, 25);

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.validateRoundConfig(10 minutes, 2 hours, 4, 3);
    }

    function test_SetRoundConfigBounds_UpdatesRangeAndRevealGraceFloor() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        vm.expectEmit(true, true, true, true);
        emit RoundConfigBoundsUpdated(10 minutes, 2 hours, 2 hours, 14 days, 3, 50, 3, 2_000);

        config.setRoundConfigBounds(10 minutes, 2 hours, 2 hours, 14 days, 3, 50, 3, 2_000);

        ProtocolConfig.RoundConfigBounds memory bounds = config.getRoundConfigBounds();
        assertEq(bounds.minEpochDuration, 10 minutes);
        assertEq(bounds.maxEpochDuration, 2 hours);
        assertEq(bounds.maxRoundDuration, 14 days);
        assertEq(config.revealGracePeriod(), 2 hours);
    }

    function test_SetRoundConfigBounds_RevalidatesStoredDrandPeriod() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));
        vm.warp(100);

        config.setRoundConfigBounds(10 minutes, 60 minutes, 1 hours, 30 days, 2, 100, 2, 10_000);
        config.setDrandConfig(QUICKNET_CHAIN_HASH, 1, uint64(10 minutes));

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setRoundConfigBounds(5 minutes, 60 minutes, 1 hours, 30 days, 2, 100, 2, 10_000);
    }

    function test_SetRoundConfigBounds_RejectsBoundsThatExcludeCurrentDefault() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setRoundConfigBounds(5 minutes, 60 minutes, 1 hours, 1 days, 2, 100, 2, 10_000);
    }

    function test_SetRoundConfigBounds_RejectsAbsoluteMaxRoundDuration() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setRoundConfigBounds(5 minutes, 60 minutes, 1 hours, 30 days + 1, 2, 100, 2, 10_000);
    }
}
