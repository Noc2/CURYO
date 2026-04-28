// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { DeployCuryo } from "../script/DeployCuryo.s.sol";
import { HumanReputation } from "../contracts/HumanReputation.sol";
import { HumanFaucet } from "../contracts/HumanFaucet.sol";
import { VoterIdNFT } from "../contracts/VoterIdNFT.sol";
import { MockIdentityVerificationHub } from "../contracts/mocks/MockIdentityVerificationHub.sol";
import { CuryoGovernor } from "../contracts/governance/CuryoGovernor.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IVotes } from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import { SelfStructs } from "@selfxyz/contracts/contracts/libraries/SelfStructs.sol";
import { SelfUtils } from "@selfxyz/contracts/contracts/libraries/SelfUtils.sol";

contract MissingConfigHub {
    function verificationConfigV2Exists(bytes32) external pure returns (bool) {
        return false;
    }
}

contract DeployCuryoHarness is DeployCuryo {
    function exposedPreBroadcastChecks() external view {
        _preBroadcastChecks();
    }

    function exposedAssertFaucetVerificationConfig(
        HumanFaucet humanFaucet,
        address hubAddress,
        bytes32 expectedConfigId
    ) external view {
        _assertFaucetVerificationConfig(humanFaucet, hubAddress, expectedConfigId);
    }

    function exposedAssertHumanFaucetLaunchAllocation(HumanReputation hrepToken, HumanFaucet humanFaucet)
        external
        view
    {
        _assertHumanFaucetLaunchAllocation(hrepToken, humanFaucet);
    }

    function exposedAssertExactExcludedHolders(CuryoGovernor governor, address[] memory expectedExcludedHolders)
        external
        view
    {
        _assertExactExcludedHolders(governor, expectedExcludedHolders);
    }

    function exposedBuildQuorumExcludedHolders(
        address humanFaucet,
        address participationPool,
        address rewardDistributor,
        address votingEngine,
        address treasury,
        address contentRegistry,
        address frontendRegistry
    ) external pure returns (address[] memory) {
        return _buildQuorumExcludedHolders(
            humanFaucet, participationPool, rewardDistributor, votingEngine, treasury, contentRegistry, frontendRegistry
        );
    }

    function exposedBuildFaucetVerificationConfig() external pure returns (SelfStructs.VerificationConfigV2 memory) {
        return _buildFaucetVerificationConfig();
    }

    function exposedMigrationBootstrapUserCount() external view returns (uint256) {
        MigrationBootstrapConfig memory migrationConfig = _loadMigrationBootstrapConfig();
        return migrationConfig.users.length;
    }

    function exposedParseUintString(string memory value) external pure returns (uint256) {
        return _parseUintString(value);
    }

    function exposedValidateMigrationBootstrapConfig(
        address[] memory users,
        uint256[] memory nullifiers,
        uint256[] memory amounts,
        address[] memory referrers,
        uint256[] memory claimantBonuses,
        uint256[] memory referrerRewards
    ) external pure {
        MigrationBootstrapConfig memory migrationConfig = MigrationBootstrapConfig({
            users: users,
            nullifiers: nullifiers,
            amounts: amounts,
            referrers: referrers,
            claimantBonuses: claimantBonuses,
            referrerRewards: referrerRewards
        });
        _validateMigrationBootstrapConfig(migrationConfig);
    }

    function exposedBootstrapMigratedClaimsInBatchesAndClose(
        HumanFaucet humanFaucet,
        address[] memory users,
        uint256[] memory nullifiers,
        uint256[] memory amounts,
        address[] memory referrers,
        uint256[] memory claimantBonuses,
        uint256[] memory referrerRewards,
        uint256 batchSize
    ) external returns (uint256 batchCount) {
        MigrationBootstrapConfig memory migrationConfig = MigrationBootstrapConfig({
            users: users,
            nullifiers: nullifiers,
            amounts: amounts,
            referrers: referrers,
            claimantBonuses: claimantBonuses,
            referrerRewards: referrerRewards
        });
        batchCount = _bootstrapMigratedClaimsInBatches(humanFaucet, migrationConfig, batchSize);
        humanFaucet.closeMigrationBootstrap();
    }
}

contract DeployCuryoCompilationTest is Test {
    function test_DeployScript_Compiles() public pure {
        assertGt(type(DeployCuryo).creationCode.length, 0);
    }

    function test_FaucetVerificationConfig_RequiresAgeSanctionsAndRestrictedCountries() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();
        SelfStructs.VerificationConfigV2 memory config = deployScript.exposedBuildFaucetVerificationConfig();
        uint256[4] memory expectedForbiddenCountries =
            SelfUtils.packForbiddenCountriesList(_expectedFaucetForbiddenCountries());

        assertTrue(config.olderThanEnabled);
        assertEq(config.olderThan, deployScript.FAUCET_MINIMUM_AGE());
        assertTrue(config.forbiddenCountriesEnabled);
        assertTrue(config.ofacEnabled[0]);
        assertTrue(config.ofacEnabled[1]);
        assertTrue(config.ofacEnabled[2]);
        for (uint256 i = 0; i < 4; ++i) {
            assertEq(config.forbiddenCountriesListPacked[i], expectedForbiddenCountries[i]);
        }
    }

    function test_PreBroadcastChecks_AllowLocalChain() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();

        vm.chainId(31337);
        deployScript.exposedPreBroadcastChecks();
    }

    function test_PreBroadcastChecks_AllowSupportedCeloChains() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();
        vm.setEnv("MIGRATION_BOOTSTRAP_SKIP", "true");

        vm.chainId(42220);
        deployScript.exposedPreBroadcastChecks();

        vm.chainId(11142220);
        deployScript.exposedPreBroadcastChecks();

        vm.setEnv("MIGRATION_BOOTSTRAP_SKIP", "false");
    }

    function test_PreBroadcastChecks_RequireMigrationManifestOrExplicitSkipOnSupportedChains() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();

        vm.chainId(42220);
        vm.setEnv("MIGRATION_BOOTSTRAP_FILE", "");
        vm.setEnv("MIGRATION_BOOTSTRAP_SKIP", "false");
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployCuryo.DeploymentRoleVerificationFailed.selector, "Migration bootstrap file or skip required"
            )
        );
        deployScript.exposedPreBroadcastChecks();
    }

    function test_PreBroadcastChecks_RevertOnUnsupportedChain() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();

        vm.chainId(1);
        vm.expectRevert(abi.encodeWithSelector(DeployCuryo.UnsupportedHumanFaucetChain.selector, 1));
        deployScript.exposedPreBroadcastChecks();
    }

    function test_PreBroadcastChecks_AcceptsMigrationBootstrapManifest() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();
        string memory path = "./out/curyo-migration-bootstrap-valid.json";
        vm.writeFile(
            path,
            string.concat(
                '{"users":["0x0000000000000000000000000000000000000001"],',
                '"nullifiers":["123456"],',
                '"amounts":["10000000000"],',
                '"referrers":["0x0000000000000000000000000000000000000000"],',
                '"claimantBonuses":["0"],',
                '"referrerRewards":["0"]}'
            )
        );
        vm.setEnv("MIGRATION_BOOTSTRAP_FILE", path);

        vm.chainId(31337);
        assertEq(deployScript.exposedMigrationBootstrapUserCount(), 1);
        deployScript.exposedPreBroadcastChecks();

        vm.setEnv("MIGRATION_BOOTSTRAP_FILE", "");
        vm.removeFile(path);
    }

    function test_MigrationBootstrapValidation_RejectsLengthMismatch() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();
        address[] memory users = new address[](1);
        users[0] = address(1);
        uint256[] memory nullifiers = new uint256[](1);
        nullifiers[0] = 123456;
        uint256[] memory amounts = new uint256[](0);
        address[] memory referrers = new address[](1);
        referrers[0] = address(0);
        uint256[] memory claimantBonuses = new uint256[](1);
        claimantBonuses[0] = 0;
        uint256[] memory referrerRewards = new uint256[](1);
        referrerRewards[0] = 0;

        vm.expectRevert(
            abi.encodeWithSelector(DeployCuryo.DeploymentRoleVerificationFailed.selector, "Migration amounts length")
        );
        deployScript.exposedValidateMigrationBootstrapConfig(
            users, nullifiers, amounts, referrers, claimantBonuses, referrerRewards
        );
    }

    function test_MigrationBootstrapValidation_RejectsDuplicateUsersAndNullifiers() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();
        address[] memory users = new address[](2);
        users[0] = address(1);
        users[1] = address(1);
        uint256[] memory nullifiers = new uint256[](2);
        nullifiers[0] = 123456;
        nullifiers[1] = 789012;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 10_000e6;
        amounts[1] = 10_000e6;
        address[] memory referrers = new address[](2);
        uint256[] memory claimantBonuses = new uint256[](2);
        uint256[] memory referrerRewards = new uint256[](2);

        vm.expectRevert(
            abi.encodeWithSelector(DeployCuryo.DeploymentRoleVerificationFailed.selector, "Migration duplicate user")
        );
        deployScript.exposedValidateMigrationBootstrapConfig(
            users, nullifiers, amounts, referrers, claimantBonuses, referrerRewards
        );

        users[1] = address(2);
        nullifiers[1] = nullifiers[0];
        vm.expectRevert(
            abi.encodeWithSelector(
                DeployCuryo.DeploymentRoleVerificationFailed.selector, "Migration duplicate nullifier"
            )
        );
        deployScript.exposedValidateMigrationBootstrapConfig(
            users, nullifiers, amounts, referrers, claimantBonuses, referrerRewards
        );
    }

    function test_MigrationBootstrapValidation_RejectsForwardReferrerReference() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();
        address[] memory users = new address[](2);
        users[0] = address(0x1111);
        users[1] = address(0x2222);
        uint256[] memory nullifiers = new uint256[](2);
        nullifiers[0] = 123456;
        nullifiers[1] = 789012;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 100;
        amounts[1] = 200;
        address[] memory referrers = new address[](2);
        referrers[0] = address(0x2222);
        referrers[1] = address(0);
        uint256[] memory claimantBonuses = new uint256[](2);
        claimantBonuses[0] = 10;
        claimantBonuses[1] = 0;
        uint256[] memory referrerRewards = new uint256[](2);
        referrerRewards[0] = 5;
        referrerRewards[1] = 0;

        vm.expectRevert(
            abi.encodeWithSelector(DeployCuryo.DeploymentRoleVerificationFailed.selector, "Migration referrer order")
        );
        deployScript.exposedValidateMigrationBootstrapConfig(
            users, nullifiers, amounts, referrers, claimantBonuses, referrerRewards
        );
    }

    function test_MigrationBootstrapValidation_AcceptsLargeManifest() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();
        uint256 claimCount = 512;
        address[] memory users = new address[](claimCount);
        uint256[] memory nullifiers = new uint256[](claimCount);
        uint256[] memory amounts = new uint256[](claimCount);
        address[] memory referrers = new address[](claimCount);
        uint256[] memory claimantBonuses = new uint256[](claimCount);
        uint256[] memory referrerRewards = new uint256[](claimCount);

        for (uint256 i = 0; i < claimCount; ++i) {
            users[i] = address(uint160(0x100000 + i));
            nullifiers[i] = 10_000_000 + i;
            uint256 baseAmount = i < 10 ? 10_000e6 : 1_000e6;
            amounts[i] = baseAmount;
            if (i > 0 && i % 5 == 0) {
                referrers[i] = users[i - 1];
                claimantBonuses[i] = baseAmount / 2;
                referrerRewards[i] = baseAmount / 2;
                amounts[i] += claimantBonuses[i];
            }
        }

        deployScript.exposedValidateMigrationBootstrapConfig(
            users, nullifiers, amounts, referrers, claimantBonuses, referrerRewards
        );
    }

    function test_MigrationBootstrapValidation_AcceptsScheduledReferralAmounts() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();
        address[] memory users = new address[](2);
        users[0] = address(0x1111);
        users[1] = address(0x2222);
        uint256[] memory nullifiers = new uint256[](2);
        nullifiers[0] = 123456;
        nullifiers[1] = 789012;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 10_000e6;
        amounts[1] = 15_000e6;
        address[] memory referrers = new address[](2);
        referrers[0] = address(0);
        referrers[1] = users[0];
        uint256[] memory claimantBonuses = new uint256[](2);
        claimantBonuses[0] = 0;
        claimantBonuses[1] = 5_000e6;
        uint256[] memory referrerRewards = new uint256[](2);
        referrerRewards[0] = 0;
        referrerRewards[1] = 5_000e6;

        deployScript.exposedValidateMigrationBootstrapConfig(
            users, nullifiers, amounts, referrers, claimantBonuses, referrerRewards
        );
    }

    function test_MigrationBootstrapValidation_RejectsWrongScheduledAmount() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();
        address[] memory users = new address[](1);
        users[0] = address(0x1111);
        uint256[] memory nullifiers = new uint256[](1);
        nullifiers[0] = 123456;
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 10_001e6;
        address[] memory referrers = new address[](1);
        referrers[0] = address(0);
        uint256[] memory claimantBonuses = new uint256[](1);
        uint256[] memory referrerRewards = new uint256[](1);

        vm.expectRevert(
            abi.encodeWithSelector(DeployCuryo.DeploymentRoleVerificationFailed.selector, "Migration amount mismatch")
        );
        deployScript.exposedValidateMigrationBootstrapConfig(
            users, nullifiers, amounts, referrers, claimantBonuses, referrerRewards
        );
    }

    function test_MigrationBootstrapValidation_RejectsWrongReferralBonus() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();
        address[] memory users = new address[](2);
        users[0] = address(0x1111);
        users[1] = address(0x2222);
        uint256[] memory nullifiers = new uint256[](2);
        nullifiers[0] = 123456;
        nullifiers[1] = 789012;
        uint256[] memory amounts = new uint256[](2);
        amounts[0] = 10_000e6;
        amounts[1] = 15_000e6;
        address[] memory referrers = new address[](2);
        referrers[0] = address(0);
        referrers[1] = users[0];
        uint256[] memory claimantBonuses = new uint256[](2);
        claimantBonuses[1] = 4_999e6;
        uint256[] memory referrerRewards = new uint256[](2);
        referrerRewards[1] = 5_000e6;

        vm.expectRevert(
            abi.encodeWithSelector(
                DeployCuryo.DeploymentRoleVerificationFailed.selector, "Migration claimant bonus mismatch"
            )
        );
        deployScript.exposedValidateMigrationBootstrapConfig(
            users, nullifiers, amounts, referrers, claimantBonuses, referrerRewards
        );
    }

    function test_MigrationBootstrapParser_RejectsOversizedHexUint() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();

        vm.expectRevert(
            abi.encodeWithSelector(
                DeployCuryo.DeploymentRoleVerificationFailed.selector, "Migration uint invalid hex length"
            )
        );
        deployScript.exposedParseUintString("0x10000000000000000000000000000000000000000000000000000000000000000");
    }

    function test_AssertFaucetVerificationConfig_PassesForStoredHubConfig() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();
        MockIdentityVerificationHub mockHub = new MockIdentityVerificationHub();
        HumanReputation hrepToken = new HumanReputation(address(this), address(this));
        HumanFaucet faucet = new HumanFaucet(address(hrepToken), address(mockHub), address(this));
        bytes32 configId = mockHub.MOCK_CONFIG_ID();

        faucet.setConfigId(configId);

        deployScript.exposedAssertFaucetVerificationConfig(faucet, address(mockHub), configId);
    }

    function test_AssertFaucetVerificationConfig_RevertsWhenFaucetDidNotStoreExpectedConfig() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();
        MockIdentityVerificationHub mockHub = new MockIdentityVerificationHub();
        HumanReputation hrepToken = new HumanReputation(address(this), address(this));
        HumanFaucet faucet = new HumanFaucet(address(hrepToken), address(mockHub), address(this));
        bytes32 configId = mockHub.MOCK_CONFIG_ID();

        vm.expectRevert(
            abi.encodeWithSelector(DeployCuryo.DeploymentRoleVerificationFailed.selector, "HumanFaucet config stored")
        );
        deployScript.exposedAssertFaucetVerificationConfig(faucet, address(mockHub), configId);
    }

    function test_AssertFaucetVerificationConfig_RevertsWhenExpectedConfigDoesNotExistOnHub() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();
        MockIdentityVerificationHub mockHub = new MockIdentityVerificationHub();
        MissingConfigHub missingConfigHub = new MissingConfigHub();
        HumanReputation hrepToken = new HumanReputation(address(this), address(this));
        HumanFaucet faucet = new HumanFaucet(address(hrepToken), address(mockHub), address(this));
        bytes32 configId = mockHub.MOCK_CONFIG_ID();

        faucet.setConfigId(configId);

        vm.expectRevert(
            abi.encodeWithSelector(
                DeployCuryo.DeploymentRoleVerificationFailed.selector, "HumanFaucet config exists on hub"
            )
        );
        deployScript.exposedAssertFaucetVerificationConfig(faucet, address(missingConfigHub), configId);
    }

    function test_HumanFaucetLaunchAllocation_AllowsMigratedClaims() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();
        HumanReputation hrepToken = new HumanReputation(address(this), address(0xBEEF));
        VoterIdNFT voterIdNFT = new VoterIdNFT(address(this), address(this));
        MockIdentityVerificationHub mockHub = new MockIdentityVerificationHub();
        HumanFaucet faucet = new HumanFaucet(address(hrepToken), address(mockHub), address(this));
        voterIdNFT.addMinter(address(faucet));
        faucet.setVoterIdNFT(address(voterIdNFT));
        hrepToken.mint(address(faucet), deployScript.FAUCET_POOL_AMOUNT());

        address[] memory users = new address[](1);
        uint256[] memory nullifiers = new uint256[](1);
        uint256[] memory amounts = new uint256[](1);
        address[] memory referrers = new address[](1);
        uint256[] memory claimantBonuses = new uint256[](1);
        uint256[] memory referrerRewards = new uint256[](1);
        users[0] = address(0xA11CE);
        nullifiers[0] = 123;
        amounts[0] = 1_000e6;

        faucet.bootstrapMigratedClaims(users, nullifiers, amounts, referrers, claimantBonuses, referrerRewards);

        assertEq(hrepToken.balanceOf(address(faucet)), deployScript.FAUCET_POOL_AMOUNT() - amounts[0]);
        assertEq(faucet.totalClaimed(), amounts[0]);
        deployScript.exposedAssertHumanFaucetLaunchAllocation(hrepToken, faucet);
    }

    function test_MigrationBootstrap_BatchesClaimsAndCloses() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();
        HumanReputation hrepToken = new HumanReputation(address(this), address(0xBEEF));
        VoterIdNFT voterIdNFT = new VoterIdNFT(address(this), address(this));
        MockIdentityVerificationHub mockHub = new MockIdentityVerificationHub();
        HumanFaucet faucet = new HumanFaucet(address(hrepToken), address(mockHub), address(deployScript));
        voterIdNFT.addMinter(address(faucet));
        faucet.setVoterIdNFT(address(voterIdNFT));
        hrepToken.mint(address(faucet), deployScript.FAUCET_POOL_AMOUNT());

        address[] memory users = new address[](3);
        uint256[] memory nullifiers = new uint256[](3);
        uint256[] memory amounts = new uint256[](3);
        address[] memory referrers = new address[](3);
        uint256[] memory claimantBonuses = new uint256[](3);
        uint256[] memory referrerRewards = new uint256[](3);
        users[0] = address(0xA11CE);
        users[1] = address(0xB0B);
        users[2] = address(0xCAFE);
        nullifiers[0] = 123;
        nullifiers[1] = 456;
        nullifiers[2] = 789;
        amounts[0] = 10_000e6;
        amounts[1] = 10_000e6;
        amounts[2] = 15_000e6;
        referrers[2] = users[0];
        claimantBonuses[2] = 5_000e6;
        referrerRewards[2] = 5_000e6;

        faucet.transferOwnership(address(deployScript));
        uint256 batchCount = deployScript.exposedBootstrapMigratedClaimsInBatchesAndClose(
            faucet, users, nullifiers, amounts, referrers, claimantBonuses, referrerRewards, 2
        );

        assertEq(batchCount, 2);
        assertTrue(faucet.migrationBootstrapClosed());
        assertEq(faucet.totalClaimants(), 3);
        assertEq(faucet.totalClaimed(), 40_000e6);
        assertEq(hrepToken.balanceOf(users[0]), 15_000e6);
        assertEq(hrepToken.balanceOf(users[1]), 10_000e6);
        assertEq(hrepToken.balanceOf(users[2]), 15_000e6);
        assertTrue(faucet.hasClaimed(users[0]));
        assertTrue(faucet.hasClaimed(users[1]));
        assertTrue(faucet.hasClaimed(users[2]));
        assertTrue(faucet.isNullifierUsed(nullifiers[0]));
        assertTrue(faucet.isNullifierUsed(nullifiers[1]));
        assertTrue(faucet.isNullifierUsed(nullifiers[2]));
        assertTrue(voterIdNFT.hasVoterId(users[0]));
        assertTrue(voterIdNFT.hasVoterId(users[1]));
        assertTrue(voterIdNFT.hasVoterId(users[2]));
    }

    function test_MigrationBootstrap_BatchSizeCannotBeZero() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();

        vm.expectRevert(
            abi.encodeWithSelector(DeployCuryo.DeploymentRoleVerificationFailed.selector, "Migration batch size zero")
        );
        deployScript.exposedBootstrapMigratedClaimsInBatchesAndClose(
            HumanFaucet(payable(address(0))),
            new address[](0),
            new uint256[](0),
            new uint256[](0),
            new address[](0),
            new uint256[](0),
            new uint256[](0),
            0
        );
    }

    function test_AssertExactExcludedHolders_PassesForExactOrder() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();
        CuryoGovernor governor = _deployGovernorHarness();
        address[] memory expectedExcludedHolders = new address[](3);
        expectedExcludedHolders[0] = address(0x100);
        expectedExcludedHolders[1] = address(0x200);
        expectedExcludedHolders[2] = address(0x300);

        governor.initializePools(expectedExcludedHolders);

        deployScript.exposedAssertExactExcludedHolders(governor, expectedExcludedHolders);
    }

    function test_AssertExactExcludedHolders_RevertsOnOrderingMismatch() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();
        CuryoGovernor governor = _deployGovernorHarness();
        address[] memory initializedExcludedHolders = new address[](3);
        initializedExcludedHolders[0] = address(0x100);
        initializedExcludedHolders[1] = address(0x200);
        initializedExcludedHolders[2] = address(0x300);
        address[] memory expectedExcludedHolders = new address[](3);
        expectedExcludedHolders[0] = address(0x100);
        expectedExcludedHolders[1] = address(0x300);
        expectedExcludedHolders[2] = address(0x200);

        governor.initializePools(initializedExcludedHolders);

        vm.expectRevert(
            abi.encodeWithSelector(
                DeployCuryo.DeploymentRoleVerificationFailed.selector, "Governor excluded holder mismatch"
            )
        );
        deployScript.exposedAssertExactExcludedHolders(governor, expectedExcludedHolders);
    }

    function test_BuildQuorumExcludedHolders_KeepsQuestionRewardPoolEscrowCirculating() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();

        address[] memory holders = deployScript.exposedBuildQuorumExcludedHolders(
            address(0x100),
            address(0x200),
            address(0x300),
            address(0x400),
            address(0x500),
            address(0x600),
            address(0x800)
        );

        assertEq(holders.length, 7);
        for (uint256 i = 0; i < holders.length; ++i) {
            assertNotEq(holders[i], address(0x700));
        }
    }

    function _deployGovernorHarness() internal returns (CuryoGovernor governor) {
        HumanReputation hrepToken = new HumanReputation(address(this), address(this));
        address[] memory proposers = new address[](1);
        proposers[0] = address(this);
        address[] memory executors = new address[](1);
        executors[0] = address(0);
        TimelockController timelock = new TimelockController(2 days, proposers, executors, address(this));
        governor = new CuryoGovernor(IVotes(address(hrepToken)), timelock);
    }

    function _expectedFaucetForbiddenCountries() internal pure returns (string[] memory forbiddenCountries) {
        forbiddenCountries = new string[](4);
        forbiddenCountries[0] = "CUB";
        forbiddenCountries[1] = "IRN";
        forbiddenCountries[2] = "PRK";
        forbiddenCountries[3] = "SYR";
    }
}
