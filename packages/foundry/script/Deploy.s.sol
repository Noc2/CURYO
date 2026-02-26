//SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import { DeployCuryo } from "./DeployCuryo.s.sol";

/**
 * @notice Main deployment script for all contracts
 * @dev Run this when you want to deploy multiple contracts at once
 *
 * Example: yarn deploy # runs this script (without `--file` flag)
 *
 * Inherits DeployCuryo so that its run() function (with ScaffoldEthDeployerRunner
 * modifier) executes directly in the script broadcast context.
 */
contract DeployScript is DeployCuryo { }
