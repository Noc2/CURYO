// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { deployInitializedProtocolConfig } from "./helpers/VotingTestHelpers.sol";

contract ProtocolConfigBranchesTest is Test {
    bytes32 internal constant QUICKNET_CHAIN_HASH =
        0x52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971;

    event DrandConfigUpdated(bytes32 drandChainHash, uint64 genesisTime, uint64 period);

    function test_DefaultDrandConfig_UsesQuicknetValues() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        assertEq(config.drandChainHash(), QUICKNET_CHAIN_HASH);
        assertEq(config.drandGenesisTime(), 1_692_803_367);
        assertEq(config.drandPeriod(), 3);
    }

    function test_SetDrandConfig_UpdatesStateAndEmits() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        bytes32 nextHash = bytes32(uint256(1234));
        uint64 nextGenesis = 42;
        uint64 nextPeriod = 9;

        vm.expectEmit(true, true, true, true);
        emit DrandConfigUpdated(nextHash, nextGenesis, nextPeriod);

        config.setDrandConfig(nextHash, nextGenesis, nextPeriod);

        assertEq(config.drandChainHash(), nextHash);
        assertEq(config.drandGenesisTime(), nextGenesis);
        assertEq(config.drandPeriod(), nextPeriod);
    }

    function test_SetDrandConfig_RejectsZeroHashOrPeriod() public {
        ProtocolConfig config = deployInitializedProtocolConfig(address(this));

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setDrandConfig(bytes32(0), 1, 3);

        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        config.setDrandConfig(QUICKNET_CHAIN_HASH, 1, 0);
    }
}
