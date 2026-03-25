// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IVotes } from "@openzeppelin/contracts/governance/utils/IVotes.sol";

import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { CuryoGovernor } from "../contracts/governance/CuryoGovernor.sol";

contract GovernanceGasBudgetTest is Test {
    uint256 internal constant MAX_QUORUM_MAX_EXCLUDED_HOLDERS_GAS = 150_000;

    address internal constant DEPLOYER = address(1);

    function _measureCall(address target, bytes memory callData) internal returns (uint256 gasUsed) {
        vm.resumeGasMetering();
        uint256 gasBefore = gasleft();
        (bool success,) = target.call(callData);
        gasUsed = gasBefore - gasleft();
        vm.pauseGasMetering();
        assertTrue(success, "measured call reverted");
    }

    function testGas_quorum_maxExcludedHolders_underBudget() public {
        vm.pauseGasMetering();
        vm.startPrank(DEPLOYER);

        CuryoReputation token = new CuryoReputation(DEPLOYER, DEPLOYER);
        token.grantRole(token.MINTER_ROLE(), DEPLOYER);

        TimelockController timelock = new TimelockController(2 days, new address[](0), new address[](0), DEPLOYER);
        CuryoGovernor governor = new CuryoGovernor(IVotes(address(token)), timelock);

        uint256 holderCount = governor.MAX_EXCLUDED_HOLDERS();
        address[] memory holders = new address[](holderCount);
        for (uint256 i = 0; i < holderCount; i++) {
            holders[i] = address(uint160(100 + i));
        }
        governor.initializePools(holders);

        for (uint256 i = 0; i < holderCount; i++) {
            token.mint(holders[i], 1_000_000e6);
        }
        token.mint(address(500), 1_000_000e6);

        vm.stopPrank();
        vm.roll(block.number + 1);

        uint256 gasUsed = _measureCall(address(governor), abi.encodeCall(CuryoGovernor.quorum, (block.number - 1)));

        assertLe(
            gasUsed, MAX_QUORUM_MAX_EXCLUDED_HOLDERS_GAS, "quorum worst-case excluded-holder scan gas budget exceeded"
        );
    }
}
