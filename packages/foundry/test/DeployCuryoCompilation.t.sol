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

    function exposedAssertFaucetVerificationConfig(HumanFaucet humanFaucet, address hubAddress, bytes32 expectedConfigId)
        external
        view
    {
        _assertFaucetVerificationConfig(humanFaucet, hubAddress, expectedConfigId);
    }

    function exposedAssertExactExcludedHolders(CuryoGovernor governor, address[] memory expectedExcludedHolders)
        external
        view
    {
        _assertExactExcludedHolders(governor, expectedExcludedHolders);
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

        vm.expectRevert(abi.encodeWithSelector(DeployCuryo.DeploymentRoleVerificationFailed.selector, "HumanFaucet config stored"));
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
            abi.encodeWithSelector(DeployCuryo.DeploymentRoleVerificationFailed.selector, "HumanFaucet config exists on hub")
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
            abi.encodeWithSelector(DeployCuryo.DeploymentRoleVerificationFailed.selector, "Governor excluded holder mismatch")
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
