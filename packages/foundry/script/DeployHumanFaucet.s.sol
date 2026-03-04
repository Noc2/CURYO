// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Script, console } from "forge-std/Script.sol";
import { HumanFaucet } from "../contracts/HumanFaucet.sol";
import { MockIdentityVerificationHub } from "../contracts/mocks/MockIdentityVerificationHub.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { VoterIdNFT } from "../contracts/VoterIdNFT.sol";
import { IIdentityVerificationHubV2 } from "@selfxyz/contracts/contracts/interfaces/IIdentityVerificationHubV2.sol";
import { SelfStructs } from "@selfxyz/contracts/contracts/libraries/SelfStructs.sol";

/// @title DeployHumanFaucet
/// @notice Deployment script for the HumanFaucet contract
/// @dev Deploys mock hub for local testing, uses real Self.xyz hub for Celo networks
contract DeployHumanFaucet is Script {
    // Self.xyz IdentityVerificationHub addresses
    address constant CELO_MAINNET_HUB = 0xe57F4773bd9c9d8b6Cd70431117d353298B9f5BF;
    address constant CELO_SEPOLIA_HUB = 0x16ECBA51e18a4a7e61fdC417f0d47AFEeDfbed74;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        address crepTokenAddress = vm.envAddress("CREP_TOKEN_ADDRESS");
        address voterIdNFTAddress = vm.envAddress("VOTER_ID_NFT_ADDRESS");
        address governanceAddress = vm.envAddress("GOVERNANCE_ADDRESS");

        console.log("Deploying HumanFaucet...");
        console.log("Deployer:", deployer);
        console.log("cREP Token:", crepTokenAddress);
        console.log("VoterIdNFT:", voterIdNFTAddress);
        console.log("Governance:", governanceAddress);
        console.log("Chain ID:", block.chainid);

        vm.startBroadcast(deployerPrivateKey);

        address hubAddress;
        bool isLocalDev = false;

        // Determine which hub to use based on chain
        if (block.chainid == 31337) {
            // Local anvil/hardhat: deploy mock hub
            console.log("Local network detected - deploying MockIdentityVerificationHub");
            MockIdentityVerificationHub mockHub = new MockIdentityVerificationHub();
            hubAddress = address(mockHub);
            isLocalDev = true;
            console.log("MockIdentityVerificationHub deployed at:", hubAddress);
        } else if (block.chainid == 42220) {
            // Celo mainnet
            console.log("Celo Mainnet detected - using Self.xyz hub");
            hubAddress = CELO_MAINNET_HUB;
        } else if (block.chainid == 11142220) {
            // Celo Sepolia testnet
            console.log("Celo Sepolia detected - using Self.xyz hub");
            hubAddress = CELO_SEPOLIA_HUB;
        } else {
            revert("Unsupported chain - HumanFaucet requires Celo, Celo Sepolia, or local network");
        }

        // Deploy HumanFaucet (governance address restricts ownership transfer)
        HumanFaucet faucet = new HumanFaucet(crepTokenAddress, hubAddress, governanceAddress);
        console.log("HumanFaucet deployed at:", address(faucet));

        // Wire up VoterIdNFT
        VoterIdNFT voterIdNFT = VoterIdNFT(voterIdNFTAddress);
        voterIdNFT.addMinter(address(faucet));
        faucet.setVoterIdNFT(voterIdNFTAddress);
        console.log("VoterIdNFT wired to HumanFaucet");

        // Pre-mint 51,999,900 cREP to the faucet (52M minus 100 reserved for CategoryRegistry)
        CuryoReputation crepToken = CuryoReputation(crepTokenAddress);
        uint256 faucetAmount = 51_999_900 * 1e6; // 51,999,900 cREP
        // In local dev, deployer has DEFAULT_ADMIN_ROLE and needs to grant MINTER_ROLE
        // In production, deployer already has MINTER_ROLE from CuryoReputation constructor
        if (isLocalDev) {
            crepToken.grantRole(crepToken.MINTER_ROLE(), deployer);
        }
        crepToken.mint(address(faucet), faucetAmount);
        // Renounce MINTER_ROLE (works regardless of DEFAULT_ADMIN_ROLE)
        crepToken.renounceRole(crepToken.MINTER_ROLE(), deployer);
        console.log("Minted 52M cREP to HumanFaucet");

        // For production networks, create and set the verification config
        if (!isLocalDev) {
            // Create verification config with OFAC checking enabled
            SelfStructs.VerificationConfigV2 memory config = SelfStructs.VerificationConfigV2({
                olderThanEnabled: true,
                olderThan: 18,
                forbiddenCountriesEnabled: false,
                forbiddenCountriesListPacked: [uint256(0), uint256(0), uint256(0), uint256(0)],
                ofacEnabled: [true, true, true] // Enable all OFAC check modes
            });

            // Register config with the hub and get configId
            bytes32 configId = IIdentityVerificationHubV2(hubAddress).setVerificationConfigV2(config);
            console.log("Registered verification config with hub");

            // Set the configId on the faucet
            faucet.setConfigId(configId);
            console.log("Set configId on HumanFaucet");
        } else {
            // For local dev, use the mock config ID
            bytes32 mockConfigId = MockIdentityVerificationHub(hubAddress).MOCK_CONFIG_ID();
            faucet.setConfigId(mockConfigId);
            console.log("Set mock configId on HumanFaucet");
        }

        // Transfer HumanFaucet ownership to governance (production only)
        if (!isLocalDev) {
            faucet.transferOwnership(governanceAddress);
            console.log("HumanFaucet ownership transferred to governance");
        }

        vm.stopBroadcast();

        console.log("");
        console.log("=== HumanFaucet Deployment Complete ===");
        console.log("HumanFaucet:", address(faucet));
        console.log("VoterIdNFT:", voterIdNFTAddress);
        console.log("Governance:", governanceAddress);
        console.log("Identity Hub:", hubAddress);
        console.log("Local dev:", isLocalDev);
        console.log("Scope:", faucet.getScope());
    }
}
