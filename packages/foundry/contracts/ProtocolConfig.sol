// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { RoundLib } from "./libraries/RoundLib.sol";
import { RatingLib } from "./libraries/RatingLib.sol";

/// @title ProtocolConfig
/// @notice Governance-controlled configuration and address book for RoundVotingEngine.
/// @dev Keeps the legacy AccessControl storage layout so existing proxies can be upgraded safely in place.
contract ProtocolConfig is Initializable, AccessControl {
    bytes32 public constant CONFIG_ROLE = keccak256("CONFIG_ROLE");
    bytes32 public constant TREASURY_ROLE = keccak256("TREASURY_ROLE");
    bytes32 public constant TREASURY_ADMIN_ROLE = keccak256("TREASURY_ADMIN_ROLE");

    error InvalidAddress();
    error InvalidConfig();

    address public rewardDistributor;
    address public categoryRegistry;
    address public frontendRegistry;
    address public treasury;
    RoundLib.RoundConfig public config;
    address public voterIdNFT;
    address public participationPool;
    uint256 public revealGracePeriod;
    bytes32 public drandChainHash;
    uint64 public drandGenesisTime;
    uint64 public drandPeriod;
    RatingLib.RatingConfig public ratingConfig;
    RatingLib.SlashConfig public slashConfig;

    /// @dev Reserved storage gap for future proxy-safe upgrades.
    uint256[35] private __gap;

    event RewardDistributorUpdated(address rewardDistributor);
    event FrontendRegistryUpdated(address frontendRegistry);
    event CategoryRegistryUpdated(address categoryRegistry);
    event TreasuryUpdated(address treasury);
    event RevealGracePeriodUpdated(uint256 revealGracePeriod);
    event VoterIdNFTUpdated(address voterIdNFT);
    event ParticipationPoolUpdated(address participationPool);
    event ConfigUpdated(uint256 epochDuration, uint256 maxDuration, uint256 minVoters, uint256 maxVoters);
    event DrandConfigUpdated(bytes32 drandChainHash, uint64 genesisTime, uint64 period);
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

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address admin, address governance) external initializer {
        _initialize(admin, governance, governance);
    }

    function initializeWithTreasury(address admin, address governance, address treasuryAuthority) external initializer {
        _initialize(admin, governance, treasuryAuthority);
    }

    function _initialize(address admin, address governance, address treasuryAuthority) internal {
        if (admin == address(0)) revert InvalidAddress();
        if (governance == address(0)) revert InvalidAddress();
        if (treasuryAuthority == address(0)) revert InvalidAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, governance);
        _grantRole(CONFIG_ROLE, governance);
        _setRoleAdmin(TREASURY_ROLE, TREASURY_ADMIN_ROLE);
        _setRoleAdmin(TREASURY_ADMIN_ROLE, TREASURY_ADMIN_ROLE);
        _grantRole(TREASURY_ADMIN_ROLE, treasuryAuthority);
        _grantRole(TREASURY_ROLE, treasuryAuthority);
        if (admin != governance) {
            _grantRole(CONFIG_ROLE, admin);
            if (admin != treasuryAuthority) {
                _grantRole(TREASURY_ROLE, admin);
            }
        }

        config = RoundLib.RoundConfig({
            epochDuration: uint32(20 minutes),
            maxDuration: uint32(7 days),
            minVoters: uint16(3),
            maxVoters: uint16(1000)
        });
        revealGracePeriod = 60 minutes;
        drandChainHash = 0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971;
        drandGenesisTime = 1_692_803_367;
        drandPeriod = 3;
        ratingConfig = RatingLib.RatingConfig({
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
        slashConfig = RatingLib.SlashConfig({
            slashThresholdBps: 2_500,
            minSlashSettledRounds: 2,
            minSlashLowDuration: uint48(7 days),
            minSlashEvidence: 200e6
        });
    }

    function setRewardDistributor(address value) external onlyRole(CONFIG_ROLE) {
        _setRewardDistributor(value);
    }

    function setFrontendRegistry(address value) external onlyRole(CONFIG_ROLE) {
        _setFrontendRegistry(value);
    }

    function setCategoryRegistry(address value) external onlyRole(CONFIG_ROLE) {
        _setCategoryRegistry(value);
    }

    function setTreasury(address value) external onlyRole(TREASURY_ROLE) {
        _setTreasury(value);
    }

    function setRevealGracePeriod(uint256 value) external onlyRole(CONFIG_ROLE) {
        _setRevealGracePeriod(value);
    }

    function setVoterIdNFT(address value) external onlyRole(CONFIG_ROLE) {
        _setVoterIdNFT(value);
    }

    function setParticipationPool(address value) external onlyRole(CONFIG_ROLE) {
        _setParticipationPool(value);
    }

    function setConfig(uint256 epochDuration, uint256 maxDuration, uint256 minVoters, uint256 maxVoters)
        external
        onlyRole(CONFIG_ROLE)
    {
        _setConfig(epochDuration, maxDuration, minVoters, maxVoters);
    }

    function setDrandConfig(bytes32 chainHash, uint64 genesisTime, uint64 period) external onlyRole(CONFIG_ROLE) {
        _setDrandConfig(chainHash, genesisTime, period);
    }

    function setRatingConfig(
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
    ) external onlyRole(CONFIG_ROLE) {
        _setRatingConfig(
            smoothingAlpha,
            smoothingBeta,
            observationBetaX18,
            confidenceMassInitial,
            confidenceMassMin,
            confidenceMassMax,
            confidenceGainBps,
            confidenceReopenBps,
            surpriseReferenceX18,
            maxDeltaLogitX18,
            maxAbsLogitX18,
            conservativePenaltyMaxBps,
            conservativePenaltyMinBps
        );
    }

    function setSlashConfig(
        uint16 slashThresholdBps,
        uint16 minSlashSettledRounds,
        uint48 minSlashLowDuration,
        uint256 minSlashEvidence
    ) external onlyRole(CONFIG_ROLE) {
        _setSlashConfig(slashThresholdBps, minSlashSettledRounds, minSlashLowDuration, minSlashEvidence);
    }

    function getRatingConfig() external view returns (RatingLib.RatingConfig memory cfg) {
        cfg = ratingConfig;
    }

    function getSlashConfig() external view returns (RatingLib.SlashConfig memory cfg) {
        cfg = slashConfig;
    }

    function _setRewardDistributor(address value) internal {
        if (value == address(0)) revert InvalidAddress();
        if (rewardDistributor != address(0)) revert InvalidConfig();
        rewardDistributor = value;
        emit RewardDistributorUpdated(value);
    }

    function _setFrontendRegistry(address value) internal {
        if (value == address(0)) revert InvalidAddress();
        frontendRegistry = value;
        emit FrontendRegistryUpdated(value);
    }

    function _setCategoryRegistry(address value) internal {
        if (value == address(0)) revert InvalidAddress();
        categoryRegistry = value;
        emit CategoryRegistryUpdated(value);
    }

    function _setTreasury(address value) internal {
        if (value == address(0)) revert InvalidAddress();
        treasury = value;
        emit TreasuryUpdated(value);
    }

    function _setRevealGracePeriod(uint256 value) internal {
        if (value < config.epochDuration) revert InvalidConfig();
        revealGracePeriod = value;
        emit RevealGracePeriodUpdated(value);
    }

    function _setVoterIdNFT(address value) internal {
        if (value == address(0)) revert InvalidAddress();
        voterIdNFT = value;
        emit VoterIdNFTUpdated(value);
    }

    function _setParticipationPool(address value) internal {
        if (value == address(0)) revert InvalidAddress();
        participationPool = value;
        emit ParticipationPoolUpdated(value);
    }

    function _setConfig(uint256 epochDuration, uint256 maxDuration, uint256 minVoters, uint256 maxVoters) internal {
        if (epochDuration < 5 minutes) revert InvalidConfig();
        if (maxDuration < 1 days || maxDuration > 30 days) revert InvalidConfig();
        if (epochDuration > type(uint32).max) revert InvalidConfig();
        if (maxDuration / epochDuration > 2016) revert InvalidConfig();
        if (minVoters < 2) revert InvalidConfig();
        if (maxVoters < minVoters || maxVoters > 10000) revert InvalidConfig();

        if (revealGracePeriod > 0 && revealGracePeriod < epochDuration) {
            revealGracePeriod = epochDuration;
            emit RevealGracePeriodUpdated(epochDuration);
        }

        config = RoundLib.RoundConfig({
            epochDuration: uint32(epochDuration),
            maxDuration: uint32(maxDuration),
            minVoters: uint16(minVoters),
            maxVoters: uint16(maxVoters)
        });

        emit ConfigUpdated(epochDuration, maxDuration, minVoters, maxVoters);
    }

    function _setDrandConfig(bytes32 chainHash, uint64 genesisTime, uint64 period) internal {
        if (chainHash == bytes32(0)) revert InvalidConfig();
        if (genesisTime == 0) revert InvalidConfig();
        if (period == 0) revert InvalidConfig();

        drandChainHash = chainHash;
        drandGenesisTime = genesisTime;
        drandPeriod = period;

        emit DrandConfigUpdated(chainHash, genesisTime, period);
    }

    function _setRatingConfig(
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
    ) internal {
        if (smoothingAlpha > type(uint128).max || smoothingBeta > type(uint128).max) revert InvalidConfig();
        if (confidenceMassMin == 0 || confidenceMassInitial < confidenceMassMin || confidenceMassMax < confidenceMassInitial)
        {
            revert InvalidConfig();
        }
        if (
            confidenceMassInitial > type(uint128).max || confidenceMassMin > type(uint128).max
                || confidenceMassMax > type(uint128).max
        ) {
            revert InvalidConfig();
        }
        if (observationBetaX18 == 0) revert InvalidConfig();
        if (observationBetaX18 > uint256(type(int256).max)) revert InvalidConfig();
        if (confidenceGainBps > 10_000 || confidenceReopenBps > 10_000) revert InvalidConfig();
        if (surpriseReferenceX18 == 0) revert InvalidConfig();
        if (maxAbsLogitX18 > uint256(uint128(type(int128).max))) revert InvalidConfig();
        if (maxDeltaLogitX18 == 0 || maxAbsLogitX18 == 0 || maxDeltaLogitX18 > maxAbsLogitX18) revert InvalidConfig();
        if (conservativePenaltyMaxBps > RatingLib.BPS_SCALE || conservativePenaltyMinBps > conservativePenaltyMaxBps)
        {
            revert InvalidConfig();
        }

        ratingConfig = RatingLib.RatingConfig({
            smoothingAlpha: smoothingAlpha,
            smoothingBeta: smoothingBeta,
            observationBetaX18: observationBetaX18,
            confidenceMassInitial: confidenceMassInitial,
            confidenceMassMin: confidenceMassMin,
            confidenceMassMax: confidenceMassMax,
            confidenceGainBps: confidenceGainBps,
            confidenceReopenBps: confidenceReopenBps,
            surpriseReferenceX18: surpriseReferenceX18,
            maxDeltaLogitX18: maxDeltaLogitX18,
            maxAbsLogitX18: maxAbsLogitX18,
            conservativePenaltyMaxBps: conservativePenaltyMaxBps,
            conservativePenaltyMinBps: conservativePenaltyMinBps
        });

        emit RatingConfigUpdated(
            smoothingAlpha,
            smoothingBeta,
            observationBetaX18,
            confidenceMassInitial,
            confidenceMassMin,
            confidenceMassMax,
            confidenceGainBps,
            confidenceReopenBps,
            surpriseReferenceX18,
            maxDeltaLogitX18,
            maxAbsLogitX18,
            conservativePenaltyMaxBps,
            conservativePenaltyMinBps
        );
    }

    function _setSlashConfig(
        uint16 slashThresholdBps,
        uint16 minSlashSettledRounds,
        uint48 minSlashLowDuration,
        uint256 minSlashEvidence
    ) internal {
        if (slashThresholdBps == 0 || slashThresholdBps >= RatingLib.BPS_SCALE) revert InvalidConfig();
        if (minSlashSettledRounds == 0) revert InvalidConfig();
        if (minSlashLowDuration == 0) revert InvalidConfig();

        slashConfig = RatingLib.SlashConfig({
            slashThresholdBps: slashThresholdBps,
            minSlashSettledRounds: minSlashSettledRounds,
            minSlashLowDuration: minSlashLowDuration,
            minSlashEvidence: minSlashEvidence
        });

        emit SlashConfigUpdated(slashThresholdBps, minSlashSettledRounds, minSlashLowDuration, minSlashEvidence);
    }
}
