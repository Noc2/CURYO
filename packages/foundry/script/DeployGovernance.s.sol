// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Script, console } from "forge-std/Script.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { CuryoGovernor } from "../contracts/governance/CuryoGovernor.sol";
import { IVotes } from "@openzeppelin/contracts/governance/utils/IVotes.sol";

/// @title DeployGovernance
/// @notice Deploys the governance infrastructure: Timelock and Governor
/// @dev Run after the main protocol contracts are deployed. cREP token has native ERC20Votes.
contract DeployGovernance is Script {
    // Timelock delay: 2 days for standard operations
    uint256 public constant TIMELOCK_MIN_DELAY = 2 days;

    function run() external {
        // Get deployment parameters from environment
        address crepToken = vm.envAddress("CREP_TOKEN");
        address multisig = vm.envAddress("MULTISIG_ADDRESS");
        address _humanFaucet = vm.envAddress("HUMAN_FAUCET");
        address _participationPool = vm.envAddress("PARTICIPATION_POOL");
        address _rewardDistributor = vm.envAddress("REWARD_DISTRIBUTOR");

        require(crepToken != address(0), "CREP_TOKEN not set");
        require(multisig != address(0), "MULTISIG_ADDRESS not set");

        vm.startBroadcast();

        // 1. Deploy TimelockController
        // - Proposers: multisig initially (Governor added later)
        // - Executors: anyone can execute after delay (address(0))
        // - Admin: multisig initially (will renounce after setup)
        address[] memory proposers = new address[](1);
        proposers[0] = multisig;

        address[] memory executors = new address[](1);
        executors[0] = address(0); // Anyone can execute

        TimelockController timelock = new TimelockController(
            TIMELOCK_MIN_DELAY,
            proposers,
            executors,
            multisig // Initial admin
        );
        console.log("TimelockController deployed at:", address(timelock));

        // 2. Deploy CuryoGovernor with cREP token directly (has native ERC20Votes)
        CuryoGovernor governor = new CuryoGovernor(IVotes(crepToken), timelock);
        console.log("CuryoGovernor deployed at:", address(governor));

        // 3. Configure Timelock roles
        // Grant PROPOSER_ROLE to Governor
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        console.log("Granted PROPOSER_ROLE to Governor");

        // Grant CANCELLER_ROLE to multisig (for emergency cancellation)
        timelock.grantRole(timelock.CANCELLER_ROLE(), multisig);
        console.log("Granted CANCELLER_ROLE to multisig");

        // 4. Initialize pool addresses for dynamic quorum calculation
        if (_humanFaucet != address(0) && _participationPool != address(0) && _rewardDistributor != address(0)) {
            governor.initializePools(_humanFaucet, _participationPool, _rewardDistributor);
            console.log("Governor pool addresses initialized for dynamic quorum");
        } else {
            console.log("Pool addresses not provided - call initializePools() manually from the deployer/initializer");
        }

        // Note: Do NOT renounce admin yet - that should be done after:
        // 1. Protocol contracts have their roles transferred to Timelock
        // 2. Everything is tested and verified
        console.log("Admin role retained by multisig for further setup");

        vm.stopBroadcast();

        // Output deployment summary
        console.log("\n=== Governance Deployment Summary ===");
        console.log("cREP Token (IVotes):", crepToken);
        console.log("TimelockController:", address(timelock));
        console.log("CuryoGovernor:", address(governor));
        console.log("Timelock Delay:", TIMELOCK_MIN_DELAY / 1 days, "days");
        console.log("\nNext steps:");
        console.log("1. Grant CONFIG_ROLE and UPGRADER_ROLE to Timelock on protocol contracts");
        console.log("2. Test governance flow with a proposal");
        console.log("3. Renounce admin role on Timelock");
    }
}
