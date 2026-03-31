// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { DeployCuryo } from "../script/DeployCuryo.s.sol";

contract DeployCuryoHarness is DeployCuryo {
    function exposedPreBroadcastChecks() external view {
        _preBroadcastChecks();
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
}
