// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { DeployCuryo } from "../script/DeployCuryo.s.sol";
import { HumanReputation } from "../contracts/HumanReputation.sol";

contract DeployCuryoAllocationsTest is Test {
    function test_LaunchAllocations_MintFullSupplyAtLaunch() public {
        DeployCuryo deployScript = new DeployCuryo();
        HumanReputation hrepToken = new HumanReputation(address(this), address(this));

        uint256 totalLaunchAllocation = deployScript.CONSENSUS_POOL_AMOUNT() + deployScript.TREASURY_AMOUNT()
            + deployScript.PARTICIPATION_POOL_AMOUNT() + deployScript.FAUCET_POOL_AMOUNT();

        assertEq(deployScript.TOTAL_SUPPLY_CAP(), hrepToken.MAX_SUPPLY(), "script cap should match token MAX_SUPPLY");
        assertEq(totalLaunchAllocation, deployScript.TOTAL_SUPPLY_CAP(), "launch allocations should sum to full cap");
        assertEq(deployScript.FAUCET_POOL_AMOUNT(), 52_000_000 * 1e6, "faucet should receive full 52M allocation");
        assertEq(deployScript.PARTICIPATION_POOL_AMOUNT(), 12_000_000 * 1e6, "bootstrap pool should receive 12M");
        assertEq(deployScript.TREASURY_AMOUNT(), 32_000_000 * 1e6, "treasury should receive 32M");
    }
}
