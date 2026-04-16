// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { DeployCuryo } from "../script/DeployCuryo.s.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { HumanFaucet } from "../contracts/HumanFaucet.sol";
import { MockIdentityVerificationHub } from "../contracts/mocks/MockIdentityVerificationHub.sol";
import { CuryoGovernor } from "../contracts/governance/CuryoGovernor.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IVotes } from "@openzeppelin/contracts/governance/utils/IVotes.sol";

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

    function exposedAssertExactExcludedHolders(CuryoGovernor governor, address[] memory expectedExcludedHolders)
        external
        view
    {
        _assertExactExcludedHolders(governor, expectedExcludedHolders);
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
}

contract DeployCuryoCompilationTest is Test {
    function test_DeployScript_Compiles() public pure {
        assertGt(type(DeployCuryo).creationCode.length, 0);
    }

    function test_PreBroadcastChecks_AllowLocalChain() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();

        vm.chainId(31337);
        deployScript.exposedPreBroadcastChecks();
    }

    function test_PreBroadcastChecks_AllowSupportedCeloChains() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();

        vm.chainId(42220);
        deployScript.exposedPreBroadcastChecks();

        vm.chainId(11142220);
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
        CuryoReputation crepToken = new CuryoReputation(address(this), address(this));
        HumanFaucet faucet = new HumanFaucet(address(crepToken), address(mockHub), address(this));
        bytes32 configId = mockHub.MOCK_CONFIG_ID();

        faucet.setConfigId(configId);

        deployScript.exposedAssertFaucetVerificationConfig(faucet, address(mockHub), configId);
    }

    function test_AssertFaucetVerificationConfig_RevertsWhenFaucetDidNotStoreExpectedConfig() public {
        DeployCuryoHarness deployScript = new DeployCuryoHarness();
        MockIdentityVerificationHub mockHub = new MockIdentityVerificationHub();
        CuryoReputation crepToken = new CuryoReputation(address(this), address(this));
        HumanFaucet faucet = new HumanFaucet(address(crepToken), address(mockHub), address(this));
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
        CuryoReputation crepToken = new CuryoReputation(address(this), address(this));
        HumanFaucet faucet = new HumanFaucet(address(crepToken), address(mockHub), address(this));
        bytes32 configId = mockHub.MOCK_CONFIG_ID();

        faucet.setConfigId(configId);

        vm.expectRevert(
            abi.encodeWithSelector(
                DeployCuryo.DeploymentRoleVerificationFailed.selector, "HumanFaucet config exists on hub"
            )
        );
        deployScript.exposedAssertFaucetVerificationConfig(faucet, address(missingConfigHub), configId);
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

    function _deployGovernorHarness() internal returns (CuryoGovernor governor) {
        CuryoReputation crepToken = new CuryoReputation(address(this), address(this));
        address[] memory proposers = new address[](1);
        proposers[0] = address(this);
        address[] memory executors = new address[](1);
        executors[0] = address(0);
        TimelockController timelock = new TimelockController(2 days, proposers, executors, address(this));
        governor = new CuryoGovernor(IVotes(address(crepToken)), timelock);
    }
}
