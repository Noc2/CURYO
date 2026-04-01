// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { DeployCuryo } from "../script/DeployCuryo.s.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { HumanFaucet } from "../contracts/HumanFaucet.sol";
import { MockIdentityVerificationHub } from "../contracts/mocks/MockIdentityVerificationHub.sol";

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
}
