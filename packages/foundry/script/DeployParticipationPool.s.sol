// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console } from "forge-std/Script.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";

/// @title DeployParticipationPool
/// @notice Deployment script for the ParticipationPool contract
/// @dev Deploys and funds with 34M cREP, wires to VotingEngine and ContentRegistry
contract DeployParticipationPool is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address crepTokenAddress = vm.envAddress("CREP_TOKEN_ADDRESS");
        address governanceAddress = vm.envAddress("GOVERNANCE_ADDRESS");
        address votingEngineAddress = vm.envAddress("VOTING_ENGINE_ADDRESS");
        address contentRegistryAddress = vm.envAddress("CONTENT_REGISTRY_ADDRESS");

        console.log("Deploying ParticipationPool...");
        console.log("Deployer:", deployer);
        console.log("cREP Token:", crepTokenAddress);
        console.log("Governance:", governanceAddress);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy ParticipationPool
        ParticipationPool pool = new ParticipationPool(crepTokenAddress, governanceAddress);
        console.log("ParticipationPool deployed at:", address(pool));

        // Authorize VotingEngine and ContentRegistry as callers
        pool.setAuthorizedCaller(votingEngineAddress, true);
        pool.setAuthorizedCaller(contentRegistryAddress, true);
        console.log("Authorized VotingEngine and ContentRegistry");

        // Mint 34M cREP and deposit to pool
        CuryoReputation crepToken = CuryoReputation(crepTokenAddress);
        uint256 poolAmount = 34_000_000 * 1e6; // 34M cREP

        // Grant MINTER_ROLE if needed (mock mode)
        if (block.chainid == 31337) {
            crepToken.grantRole(crepToken.MINTER_ROLE(), deployer);
        }
        crepToken.mint(deployer, poolAmount);
        crepToken.approve(address(pool), poolAmount);
        pool.depositPool(poolAmount);
        console.log("Deposited 34M cREP to ParticipationPool");

        // Transfer ownership to governance
        if (block.chainid != 31337) {
            pool.transferOwnership(governanceAddress);
            console.log("ParticipationPool ownership transferred to governance");
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== ParticipationPool Deployment Complete ===");
        console.log("ParticipationPool:", address(pool));
        console.log("Pool Balance:", pool.poolBalance());
        console.log("Governance:", governanceAddress);
    }
}
