// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { DeployCuryo } from "../script/DeployCuryo.s.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";

contract DeployCuryoAllocationsTest is Test {
    function test_LaunchAllocations_MintFullSupplyAtLaunch() public {
        DeployCuryo deployScript = new DeployCuryo();
        CuryoReputation crepToken = new CuryoReputation(address(this), address(this));

        uint256 totalLaunchAllocation = deployScript.CONSENSUS_POOL_AMOUNT() + deployScript.TREASURY_AMOUNT()
            + deployScript.PARTICIPATION_POOL_AMOUNT() + deployScript.FAUCET_POOL_AMOUNT();

        assertEq(deployScript.TOTAL_SUPPLY_CAP(), crepToken.MAX_SUPPLY(), "script cap should match token MAX_SUPPLY");
        assertEq(totalLaunchAllocation, deployScript.TOTAL_SUPPLY_CAP(), "launch allocations should sum to full cap");
        assertEq(deployScript.FAUCET_POOL_AMOUNT(), 52_000_000 * 1e6, "faucet should receive full 52M allocation");
    }
}
