// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ScaffoldETHDeploy } from "./DeployHelpers.s.sol";
import { console } from "forge-std/console.sol";
import { TransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import { ProxyAdmin } from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IVotes } from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { CategoryRegistry } from "../contracts/CategoryRegistry.sol";
import { ProfileRegistry } from "../contracts/ProfileRegistry.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { VoterIdNFT } from "../contracts/VoterIdNFT.sol";
import { CuryoGovernor } from "../contracts/governance/CuryoGovernor.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";
import { HumanFaucet } from "../contracts/HumanFaucet.sol";
import { MockIdentityVerificationHub } from "../contracts/mocks/MockIdentityVerificationHub.sol";
import { IIdentityVerificationHubV2 } from "@selfxyz/contracts/contracts/interfaces/IIdentityVerificationHubV2.sol";
import { SelfStructs } from "@selfxyz/contracts/contracts/libraries/SelfStructs.sol";

/// @notice Deploy script for all Curyo contracts with transparent proxies.
/// @dev All protocol operations use cREP token only (no stablecoins).
///      Local dev: deployer is governance (all roles go to deployer).
///      Production: TimelockController + CuryoGovernor are deployed, timelock gets all permanent roles including treasury routing.
contract DeployCuryo is ScaffoldETHDeploy {
    error DeploymentRoleVerificationFailed(string check);

    bytes32 internal constant ERC1967_ADMIN_SLOT =
        bytes32(uint256(keccak256("eip1967.proxy.admin")) - 1);

    // Timelock delay: 2 days for standard operations
    uint256 public constant TIMELOCK_MIN_DELAY = 2 days;

    // Self.xyz IdentityVerificationHub addresses
    address constant CELO_MAINNET_HUB = 0xe57F4773bd9c9d8b6Cd70431117d353298B9f5BF;
    address constant CELO_SEPOLIA_HUB = 0x16ECBA51e18a4a7e61fdC417f0d47AFEeDfbed74;
    uint256 constant SELF_FACET_MINIMUM_AGE = 18;

    function run() external ScaffoldEthDeployerRunner {
        // Detect local dev: anvil/hardhat chain IDs
        bool isLocalDev = block.chainid == 31337;

        // --- Determine governance authority ---
        // Local dev: deployer serves as governance and treasury
        // Production: timelock governs upgrades, config, and treasury from launch
        address governance;
        address governorAddr;

        if (isLocalDev) {
            governance = deployer;
            governorAddr = deployer;
            console.log("Local dev: deployer is governance + treasury");
        } else {
            // 1. Deploy TimelockController
            address[] memory proposers = new address[](1);
            proposers[0] = deployer; // Deployer is initial proposer, governor added later
            address[] memory executors = new address[](1);
            executors[0] = address(0); // Anyone can execute after delay

            TimelockController timelock = new TimelockController(
                TIMELOCK_MIN_DELAY,
                proposers,
                executors,
                deployer // Initial admin (for setup, can be renounced later)
            );
            governance = address(timelock);
            console.log("TimelockController deployed at:", governance);
            console.log("Treasury routed to governance:", governance);
        }

        // 2. Deploy CuryoReputation (non-upgradeable governance token)
        CuryoReputation crepToken = new CuryoReputation(deployer, governance);
        console.log("CuryoReputation deployed at:", address(crepToken));

        // 3. Deploy CuryoGovernor (production only)
        //    Excluded holders are set later via initializePools() after protocol contracts are deployed.
        if (!isLocalDev) {
            CuryoGovernor governor =
                new CuryoGovernor(IVotes(address(crepToken)), TimelockController(payable(governance)));
            governorAddr = address(governor);
            console.log("CuryoGovernor deployed at:", governorAddr);

            TimelockController tc = TimelockController(payable(governance));
            // Governor must keep proposer+canceller authority after deployer renounces setup roles.
            tc.grantRole(tc.PROPOSER_ROLE(), governorAddr);
            tc.grantRole(tc.CANCELLER_ROLE(), governorAddr);
            // Keep deployer as temporary canceller during setup; revoked at end of script.
            tc.grantRole(tc.CANCELLER_ROLE(), deployer);
            console.log("Granted PROPOSER_ROLE + CANCELLER_ROLE to Governor, CANCELLER_ROLE to deployer");

            // Set governor on token (deployer has CONFIG_ROLE)
            crepToken.setGovernor(governorAddr);
        }

        // 4. Deploy implementations
        ContentRegistry registryImpl = new ContentRegistry();
        RoundVotingEngine votingEngineImpl = new RoundVotingEngine();
        RoundRewardDistributor rewardDistributorImpl = new RoundRewardDistributor();
        FrontendRegistry frontendRegistryImpl = new FrontendRegistry();
        ProfileRegistry profileRegistryImpl = new ProfileRegistry();
        ProtocolConfig protocolConfigImpl = new ProtocolConfig();

        // 5. Deploy transparent proxies with initialization (governance owns each ProxyAdmin)
        TransparentUpgradeableProxy frontendRegistryProxy = new TransparentUpgradeableProxy(
            address(frontendRegistryImpl),
            governance,
            abi.encodeCall(FrontendRegistry.initialize, (deployer, governance, address(crepToken)))
        );
        FrontendRegistry frontendRegistry = FrontendRegistry(address(frontendRegistryProxy));

        TransparentUpgradeableProxy profileRegistryProxy = new TransparentUpgradeableProxy(
            address(profileRegistryImpl), governance, abi.encodeCall(ProfileRegistry.initialize, (deployer, governance))
        );
        ProfileRegistry profileRegistry = ProfileRegistry(address(profileRegistryProxy));

        TransparentUpgradeableProxy registryProxy = new TransparentUpgradeableProxy(
            address(registryImpl),
            governance,
            abi.encodeCall(ContentRegistry.initialize, (deployer, governance, address(crepToken)))
        );
        ContentRegistry registry = ContentRegistry(address(registryProxy));

        TransparentUpgradeableProxy protocolConfigProxy = new TransparentUpgradeableProxy(
            address(protocolConfigImpl),
            governance,
            abi.encodeCall(ProtocolConfig.initialize, (deployer, governance))
        );
        ProtocolConfig protocolConfig = ProtocolConfig(address(protocolConfigProxy));

        TransparentUpgradeableProxy votingEngineProxy = new TransparentUpgradeableProxy(
            address(votingEngineImpl),
            governance,
            abi.encodeCall(
                RoundVotingEngine.initialize, (governance, address(crepToken), address(registry), address(protocolConfig))
            )
        );
        RoundVotingEngine votingEngine = RoundVotingEngine(address(votingEngineProxy));

        TransparentUpgradeableProxy rewardDistributorProxy = new TransparentUpgradeableProxy(
            address(rewardDistributorImpl),
            governance,
            abi.encodeCall(
                RoundRewardDistributor.initialize,
                (governance, address(crepToken), address(votingEngine), address(registry))
            )
        );
        RoundRewardDistributor rewardDistributor = RoundRewardDistributor(address(rewardDistributorProxy));

        // 6. Deploy CategoryRegistry (non-upgradeable)
        CategoryRegistry categoryRegistry = new CategoryRegistry(
            deployer,
            address(crepToken),
            governorAddr,
            governance, // timelock as governance
            address(votingEngine)
        );
        CuryoGovernor(payable(governorAddr)).setCategoryRegistry(address(categoryRegistry));

        // 7. Deploy VoterIdNFT (soulbound identity for verified humans)
        VoterIdNFT voterIdNFT = new VoterIdNFT(deployer, governance);
        voterIdNFT.setStakeRecorder(address(votingEngine));

        // 8. Wire contracts together (deployer uses temporary config/admin roles where needed)
        registry.setVotingEngine(address(votingEngine));
        registry.setCategoryRegistry(address(categoryRegistry));
        ProtocolConfig(address(votingEngine.protocolConfig())).setRewardDistributor(address(rewardDistributor));
        ProtocolConfig(address(votingEngine.protocolConfig())).setFrontendRegistry(address(frontendRegistry));
        ProtocolConfig(address(votingEngine.protocolConfig())).setCategoryRegistry(address(categoryRegistry));

        // Wire VoterIdNFT to all contracts
        ProtocolConfig(address(votingEngine.protocolConfig())).setVoterIdNFT(address(voterIdNFT));
        registry.setVoterIdNFT(address(voterIdNFT));
        categoryRegistry.setVoterIdNFT(address(voterIdNFT));
        frontendRegistry.setVoterIdNFT(address(voterIdNFT));
        profileRegistry.setVoterIdNFT(address(voterIdNFT));

        // Wire FrontendRegistry to VotingEngine for slashing
        frontendRegistry.setVotingEngine(address(votingEngine));
        frontendRegistry.addFeeCreditor(address(rewardDistributor));

        // 9. Seed initial categories
        _seedCategories(categoryRegistry);

        // 10. Set content voting contracts on token (for governance lock bypass)
        crepToken.setContentVotingContracts(address(votingEngine), address(registry));

        // 11. Set treasury, cancellation fee sink, and configure round parameters
        registry.setBonusPool(governance);
        registry.setTreasury(governance);
        ProtocolConfig(address(votingEngine.protocolConfig())).setTreasury(governance);
        ProtocolConfig(address(votingEngine.protocolConfig())).setConfig(20 minutes, 7 days, 3, 1000); // epochDuration, maxDuration, minVoters, maxVoters

        // 12. Fund consensus reserve (pre-funded reserve for unanimous round rewards)
        uint256 consensusPoolAmount = 4_000_000 * 1e6; // 4M cREP
        // Local dev: deployer has DEFAULT_ADMIN_ROLE and needs to grant MINTER_ROLE
        // Production: deployer already has MINTER_ROLE from constructor
        if (isLocalDev) {
            crepToken.grantRole(crepToken.MINTER_ROLE(), deployer);
        }
        crepToken.mint(deployer, consensusPoolAmount);
        crepToken.approve(address(votingEngine), consensusPoolAmount);
        votingEngine.addToConsensusReserve(consensusPoolAmount);
        console.log("Funded 4M cREP to consensus reserve");

        // 12a. Fund treasury (10M cREP to governance treasury)
        uint256 treasuryAmount = 10_000_000 * 1e6; // 10M cREP
        crepToken.mint(governance, treasuryAmount);
        console.log("Minted 10M cREP to governance treasury");

        // 12b. Deploy and fund ParticipationPool (34M cREP)
        ParticipationPool participationPool = new ParticipationPool(address(crepToken), governance);
        participationPool.setAuthorizedCaller(address(rewardDistributor), true);
        participationPool.setAuthorizedCaller(address(registry), true);
        uint256 participationAmount = 34_000_000 * 1e6; // 34M cREP
        crepToken.mint(deployer, participationAmount);
        crepToken.approve(address(participationPool), participationAmount);
        participationPool.depositPool(participationAmount);
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(participationPool));
        registry.setParticipationPool(address(participationPool));
        if (!isLocalDev) {
            participationPool.transferOwnership(governance);
        }
        console.log("ParticipationPool deployed and funded with 34M cREP");

        // 12c. Deploy and fund HumanFaucet (51,899,900 cREP, Self.xyz identity verification)
        HumanFaucet humanFaucet;
        {
            address hubAddress;
            bool isFaucetMock = false;

            if (isLocalDev) {
                MockIdentityVerificationHub mockHub = new MockIdentityVerificationHub();
                hubAddress = address(mockHub);
                isFaucetMock = true;
                console.log("MockIdentityVerificationHub deployed at:", hubAddress);
            } else if (block.chainid == 42220) {
                hubAddress = CELO_MAINNET_HUB;
            } else if (block.chainid == 11142220) {
                hubAddress = CELO_SEPOLIA_HUB;
            }

            if (hubAddress != address(0)) {
                humanFaucet = new HumanFaucet(address(crepToken), hubAddress, governance);
                console.log("HumanFaucet deployed at:", address(humanFaucet));

                // Wire VoterIdNFT
                voterIdNFT.addMinter(address(humanFaucet));
                humanFaucet.setVoterIdNFT(address(voterIdNFT));

                // Fund with remaining supply:
                // 52M baseline faucet allocation minus 100k keeper pool and minus the 100 cREP rounding remainder.
                uint256 faucetAmount = 51_899_900 * 1e6;
                crepToken.mint(address(humanFaucet), faucetAmount);
                console.log("Minted 51,899,900 cREP to HumanFaucet");

                // Set verification config
                if (!isFaucetMock) {
                    SelfStructs.VerificationConfigV2 memory config = SelfStructs.VerificationConfigV2({
                        olderThanEnabled: true,
                        olderThan: SELF_FACET_MINIMUM_AGE,
                        forbiddenCountriesEnabled: false,
                        forbiddenCountriesListPacked: [uint256(0), uint256(0), uint256(0), uint256(0)],
                        ofacEnabled: [true, true, true]
                    });
                    bytes32 configId = IIdentityVerificationHubV2(hubAddress).setVerificationConfigV2(config);
                    humanFaucet.setConfigId(configId);
                    console.log("Set verification config on HumanFaucet");
                } else {
                    bytes32 mockConfigId = MockIdentityVerificationHub(hubAddress).MOCK_CONFIG_ID();
                    humanFaucet.setConfigId(mockConfigId);
                    console.log("Set mock configId on HumanFaucet");
                }

                // Transfer ownership to governance (production only)
                if (!isLocalDev) {
                    humanFaucet.transferOwnership(governance);
                    console.log("HumanFaucet ownership transferred to governance");
                }
            } else {
                console.log("HumanFaucet skipped: unsupported chain for Self.xyz");
            }
        }

        // 12d. Initialize Governor excluded holders for dynamic quorum (production only)
        if (!isLocalDev) {
            address[] memory excludedHolders = _buildQuorumExcludedHolders(
                address(humanFaucet),
                address(participationPool),
                address(rewardDistributor),
                address(votingEngine),
                governance,
                address(registry),
                address(frontendRegistry),
                address(categoryRegistry)
            );
            CuryoGovernor(payable(governorAddr)).initializePools(excludedHolders);
            console.log("Governor excluded holders initialized for dynamic quorum");
        }

        // 12e. Mint test tokens and Voter IDs for localhost development
        if (isLocalDev) {
            uint256 testAmount = 1000 * 1e6;
            address[9] memory testAccounts = [
                0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC,
                0x90F79bf6EB2c4f870365E785982E1f101E93b906,
                0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65,
                0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc,
                0x976EA74026E726554dB657fA54763abd0C3a0aa9,
                0x14dC79964da2C08b23698B3D3cc7Ca32193d9955,
                0x23618e81E3f5cdF7f54C3d65f7FBc0aBf5B21E8f,
                0xa0Ee7A142d267C1f36714E4a8F75612F20a79720,
                0xBcd4042DE499D14e55001CcbB24a551F3b954096
            ];
            for (uint256 i = 0; i < testAccounts.length; i++) {
                crepToken.transfer(testAccounts[i], testAmount);
            }
            console.log("Transferred 1000 cREP to 9 test accounts from treasury");

            voterIdNFT.addMinter(deployer);
            for (uint256 i = 0; i < testAccounts.length; i++) {
                voterIdNFT.mint(testAccounts[i], i + 100);
            }
            console.log("Minted Voter IDs to 9 test accounts");

            address anvilAccount0 = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
            crepToken.grantRole(crepToken.MINTER_ROLE(), anvilAccount0);
            voterIdNFT.addMinter(anvilAccount0);
        }

        // 13. Renounce deployer's temporary roles
        // Local dev: deployer IS governance, so don't renounce (need roles for dev)
        if (!isLocalDev) {
            // Grant MINTER_ROLE to dev faucet account (whitelisted testnets only)
            address devFaucet = vm.envOr("DEV_FAUCET_ADDRESS", address(0));
            bool isTestnet = (block.chainid == 44787 || block.chainid == 11142220);
            if (devFaucet != address(0) && isTestnet) {
                crepToken.grantRole(crepToken.MINTER_ROLE(), devFaucet);
                voterIdNFT.addMinter(devFaucet);
                console.log("Granted MINTER_ROLE to dev faucet:", devFaucet);
            }

            // Renounce all deployer roles on CuryoReputation
            // DEFAULT_ADMIN_ROLE last (it controls the other roles)
            crepToken.renounceRole(crepToken.MINTER_ROLE(), deployer);
            crepToken.renounceRole(crepToken.CONFIG_ROLE(), deployer);
            crepToken.renounceRole(crepToken.DEFAULT_ADMIN_ROLE(), deployer);

            // Renounce deployer config/admin roles on protocol contracts
            registry.renounceRole(registry.CONFIG_ROLE(), deployer);
            registry.renounceRole(registry.TREASURY_ROLE(), deployer);
            protocolConfig.renounceRole(protocolConfig.CONFIG_ROLE(), deployer);
            protocolConfig.renounceRole(protocolConfig.TREASURY_ROLE(), deployer);

            // Renounce ADMIN_ROLE on registries
            frontendRegistry.renounceRole(frontendRegistry.ADMIN_ROLE(), deployer);
            profileRegistry.renounceRole(profileRegistry.ADMIN_ROLE(), deployer);
            categoryRegistry.renounceRole(categoryRegistry.ADMIN_ROLE(), deployer);

            // Transfer VoterIdNFT ownership to governance
            voterIdNFT.transferOwnership(governance);

            // Renounce deployer's Timelock roles (H-3 audit fix)
            // Order matters: DEFAULT_ADMIN_ROLE must be last (it controls other roles)
            TimelockController tc = TimelockController(payable(governance));
            tc.revokeRole(tc.PROPOSER_ROLE(), deployer);
            tc.revokeRole(tc.CANCELLER_ROLE(), deployer);
            tc.renounceRole(tc.DEFAULT_ADMIN_ROLE(), deployer);

            console.log("Renounced all deployer temporary roles (including Timelock)");
            console.log("VoterIdNFT ownership transferred to governance");

            _verifyProductionDeploymentRoles({
                deployerAddress: deployer,
                governance: governance,
                governorAddr: governorAddr,
                crepToken: crepToken,
                registry: registry,
                votingEngine: votingEngine,
                protocolConfig: protocolConfig,
                rewardDistributor: rewardDistributor,
                frontendRegistry: frontendRegistry,
                profileRegistry: profileRegistry,
                categoryRegistry: categoryRegistry,
                voterIdNFT: voterIdNFT,
                participationPool: participationPool,
                humanFaucet: humanFaucet
            });
            console.log("Verified governance ownership and deployer role renunciation");
        } else {
            // Local dev: just revoke MINTER_ROLE as before
            crepToken.revokeRole(crepToken.MINTER_ROLE(), deployer);
        }

        // 14. Register addresses for scaffold-eth ABI generation
        deployments.push(Deployment("CuryoReputation", address(crepToken)));
        deployments.push(Deployment("FrontendRegistry", address(frontendRegistryProxy)));
        deployments.push(Deployment("ProfileRegistry", address(profileRegistryProxy)));
        deployments.push(Deployment("ContentRegistry", address(registryProxy)));
        deployments.push(Deployment("RoundVotingEngine", address(votingEngineProxy)));
        deployments.push(Deployment("ProtocolConfig", address(protocolConfigProxy)));
        deployments.push(Deployment("RoundRewardDistributor", address(rewardDistributorProxy)));
        deployments.push(Deployment("CategoryRegistry", address(categoryRegistry)));
        deployments.push(Deployment("VoterIdNFT", address(voterIdNFT)));
        deployments.push(Deployment("ParticipationPool", address(participationPool)));
        if (address(humanFaucet) != address(0)) {
            deployments.push(Deployment("HumanFaucet", address(humanFaucet)));
        }

        // Log deployed addresses
        console.log("=== Curyo Protocol Deployed ===");
        console.log("CuryoReputation:", address(crepToken));
        console.log("FrontendRegistry:", address(frontendRegistry));
        console.log("ProfileRegistry:", address(profileRegistry));
        console.log("ContentRegistry:", address(registry));
        console.log("RoundVotingEngine:", address(votingEngine));
        console.log("ProtocolConfig:", address(protocolConfig));
        console.log("RoundRewardDistributor:", address(rewardDistributor));
        console.log("CategoryRegistry:", address(categoryRegistry));
        console.log("VoterIdNFT:", address(voterIdNFT));
        console.log("ParticipationPool:", address(participationPool));
        if (address(humanFaucet) != address(0)) {
            console.log("HumanFaucet:", address(humanFaucet));
        }
        console.log("Governance:", governance);
        console.log("Treasury:", governance);
        if (!isLocalDev) {
            console.log("CuryoGovernor:", governorAddr);
        }
        (, uint256 seededCategoryCount) = categoryRegistry.getApprovedCategoryIdsPaginated(0, 0);
        console.log("Seeded categories:", seededCategoryCount);
        console.log("Local dev:", isLocalDev);
    }

    function _verifyProductionDeploymentRoles(
        address deployerAddress,
        address governance,
        address governorAddr,
        CuryoReputation crepToken,
        ContentRegistry registry,
        RoundVotingEngine votingEngine,
        ProtocolConfig protocolConfig,
        RoundRewardDistributor rewardDistributor,
        FrontendRegistry frontendRegistry,
        ProfileRegistry profileRegistry,
        CategoryRegistry categoryRegistry,
        VoterIdNFT voterIdNFT,
        ParticipationPool participationPool,
        HumanFaucet humanFaucet
    ) internal view {
        _requireHasRole(address(crepToken), crepToken.DEFAULT_ADMIN_ROLE(), governance, "cREP governance default admin");
        _requireHasRole(address(crepToken), crepToken.CONFIG_ROLE(), governance, "cREP governance config");
        _requireLacksRole(
            address(crepToken), crepToken.DEFAULT_ADMIN_ROLE(), deployerAddress, "cREP deployer default admin"
        );
        _requireLacksRole(address(crepToken), crepToken.CONFIG_ROLE(), deployerAddress, "cREP deployer config");
        _requireLacksRole(address(crepToken), crepToken.MINTER_ROLE(), deployerAddress, "cREP deployer minter");

        _requireHasRole(
            address(registry), registry.DEFAULT_ADMIN_ROLE(), governance, "ContentRegistry governance default admin"
        );
        _requireHasRole(address(registry), registry.ADMIN_ROLE(), governance, "ContentRegistry governance admin");
        _requireHasRole(address(registry), registry.CONFIG_ROLE(), governance, "ContentRegistry governance config");
        _requireHasRole(address(registry), registry.PAUSER_ROLE(), governance, "ContentRegistry governance pauser");
        _requireHasRole(address(registry), registry.TREASURY_ROLE(), governance, "ContentRegistry governance treasury");
        _requireHasRole(
            address(registry), registry.TREASURY_ADMIN_ROLE(), governance, "ContentRegistry governance treasury admin"
        );
        _requireLacksRole(address(registry), registry.CONFIG_ROLE(), deployerAddress, "ContentRegistry deployer config");
        _requireLacksRole(address(registry), registry.TREASURY_ROLE(), deployerAddress, "ContentRegistry deployer treasury");
        _requireProxyAdminOwner(address(registry), governance, "ContentRegistry proxy admin owner");

        _requireHasRole(
            address(votingEngine),
            votingEngine.DEFAULT_ADMIN_ROLE(),
            governance,
            "RoundVotingEngine governance default admin"
        );
        _requireHasRole(address(votingEngine), votingEngine.PAUSER_ROLE(), governance, "RoundVotingEngine governance pauser");
        _requireProxyAdminOwner(address(votingEngine), governance, "RoundVotingEngine proxy admin owner");

        _requireHasRole(
            address(protocolConfig),
            protocolConfig.DEFAULT_ADMIN_ROLE(),
            governance,
            "ProtocolConfig governance default admin"
        );
        _requireHasRole(address(protocolConfig), protocolConfig.CONFIG_ROLE(), governance, "ProtocolConfig governance config");
        _requireHasRole(
            address(protocolConfig), protocolConfig.TREASURY_ROLE(), governance, "ProtocolConfig governance treasury"
        );
        _requireHasRole(
            address(protocolConfig),
            protocolConfig.TREASURY_ADMIN_ROLE(),
            governance,
            "ProtocolConfig governance treasury admin"
        );
        _requireLacksRole(address(protocolConfig), protocolConfig.CONFIG_ROLE(), deployerAddress, "ProtocolConfig deployer config");
        _requireLacksRole(
            address(protocolConfig), protocolConfig.TREASURY_ROLE(), deployerAddress, "ProtocolConfig deployer treasury"
        );
        _requireProxyAdminOwner(address(protocolConfig), governance, "ProtocolConfig proxy admin owner");

        _requireHasRole(
            address(rewardDistributor),
            rewardDistributor.DEFAULT_ADMIN_ROLE(),
            governance,
            "RoundRewardDistributor governance default admin"
        );
        _requireProxyAdminOwner(address(rewardDistributor), governance, "RoundRewardDistributor proxy admin owner");

        _requireHasRole(
            address(frontendRegistry),
            frontendRegistry.DEFAULT_ADMIN_ROLE(),
            governance,
            "FrontendRegistry governance default admin"
        );
        _requireHasRole(
            address(frontendRegistry), frontendRegistry.ADMIN_ROLE(), governance, "FrontendRegistry governance admin"
        );
        _requireHasRole(
            address(frontendRegistry),
            frontendRegistry.GOVERNANCE_ROLE(),
            governance,
            "FrontendRegistry governance governance-role"
        );
        _requireLacksRole(
            address(frontendRegistry), frontendRegistry.ADMIN_ROLE(), deployerAddress, "FrontendRegistry deployer admin"
        );
        _requireProxyAdminOwner(address(frontendRegistry), governance, "FrontendRegistry proxy admin owner");

        _requireHasRole(
            address(profileRegistry),
            profileRegistry.DEFAULT_ADMIN_ROLE(),
            governance,
            "ProfileRegistry governance default admin"
        );
        _requireHasRole(
            address(profileRegistry), profileRegistry.ADMIN_ROLE(), governance, "ProfileRegistry governance admin"
        );
        _requireLacksRole(
            address(profileRegistry), profileRegistry.ADMIN_ROLE(), deployerAddress, "ProfileRegistry deployer admin"
        );
        _requireProxyAdminOwner(address(profileRegistry), governance, "ProfileRegistry proxy admin owner");

        _requireHasRole(
            address(categoryRegistry),
            categoryRegistry.DEFAULT_ADMIN_ROLE(),
            governance,
            "CategoryRegistry governance default admin"
        );
        _requireHasRole(
            address(categoryRegistry), categoryRegistry.ADMIN_ROLE(), governance, "CategoryRegistry governance admin"
        );
        _requireLacksRole(
            address(categoryRegistry), categoryRegistry.ADMIN_ROLE(), deployerAddress, "CategoryRegistry deployer admin"
        );

        _require(protocolConfig.voterIdNFT() == address(voterIdNFT), "ProtocolConfig voterIdNFT");
        _require(protocolConfig.treasury() == governance, "ProtocolConfig treasury");
        _require(address(registry.voterIdNFT()) == address(voterIdNFT), "ContentRegistry voterIdNFT");
        _require(registry.treasury() == governance, "ContentRegistry treasury");
        _require(registry.bonusPool() == governance, "ContentRegistry bonus pool");
        _require(address(categoryRegistry.voterIdNFT()) == address(voterIdNFT), "CategoryRegistry voterIdNFT");
        _require(address(frontendRegistry.voterIdNFT()) == address(voterIdNFT), "FrontendRegistry voterIdNFT");
        _require(address(profileRegistry.voterIdNFT()) == address(voterIdNFT), "ProfileRegistry voterIdNFT");
        _require(voterIdNFT.owner() == governance, "VoterIdNFT governance owner");
        _require(participationPool.owner() == governance, "ParticipationPool governance owner");
        if (address(humanFaucet) != address(0)) {
            _require(address(humanFaucet.voterIdNFT()) == address(voterIdNFT), "HumanFaucet voterIdNFT");
            _require(humanFaucet.owner() == governance, "HumanFaucet governance owner");
        }

        _require(governorAddr != address(0), "Governor deployed");
        CuryoGovernor governor = CuryoGovernor(payable(governorAddr));
        _require(governor.categoryRegistry() == address(categoryRegistry), "Governor category registry");
        _require(governor.poolsInitialized(), "Governor pools initialized");
        _require(governor.getExcludedHolders().length > 0, "Governor excluded holders");
        TimelockController timelock = TimelockController(payable(governance));
        _requireHasRole(address(timelock), timelock.PROPOSER_ROLE(), governorAddr, "Timelock governor proposer");
        _requireHasRole(address(timelock), timelock.CANCELLER_ROLE(), governorAddr, "Timelock governor canceller");
        _requireLacksRole(address(timelock), timelock.PROPOSER_ROLE(), deployerAddress, "Timelock deployer proposer");
        _requireLacksRole(address(timelock), timelock.CANCELLER_ROLE(), deployerAddress, "Timelock deployer canceller");
        _requireLacksRole(
            address(timelock), timelock.DEFAULT_ADMIN_ROLE(), deployerAddress, "Timelock deployer default admin"
        );
    }

    function _requireHasRole(address target, bytes32 role, address account, string memory check) internal view {
        if (!IAccessControl(target).hasRole(role, account)) {
            revert DeploymentRoleVerificationFailed(check);
        }
    }

    function _requireLacksRole(address target, bytes32 role, address account, string memory check) internal view {
        if (IAccessControl(target).hasRole(role, account)) {
            revert DeploymentRoleVerificationFailed(check);
        }
    }

    function _requireProxyAdminOwner(address proxy, address expectedOwner, string memory check) internal view {
        address proxyAdmin = _proxyAdminAddress(proxy);
        if (ProxyAdmin(proxyAdmin).owner() != expectedOwner) {
            revert DeploymentRoleVerificationFailed(check);
        }
    }

    function _proxyAdminAddress(address proxy) internal view returns (address) {
        return address(uint160(uint256(vm.load(proxy, ERC1967_ADMIN_SLOT))));
    }

    function _require(bool condition, string memory check) internal pure {
        if (!condition) revert DeploymentRoleVerificationFailed(check);
    }

    function _buildQuorumExcludedHolders(
        address humanFaucet,
        address participationPool,
        address rewardDistributor,
        address votingEngine,
        address treasury,
        address contentRegistry,
        address frontendRegistry,
        address categoryRegistry
    ) internal pure returns (address[] memory holders) {
        address[] memory temp = new address[](8);
        uint256 count;

        if (humanFaucet != address(0)) {
            temp[count++] = humanFaucet;
        }
        temp[count++] = participationPool;
        temp[count++] = rewardDistributor;
        temp[count++] = votingEngine;
        temp[count++] = treasury;
        temp[count++] = contentRegistry;
        temp[count++] = frontendRegistry;
        temp[count++] = categoryRegistry;

        holders = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            holders[i] = temp[i];
        }
    }

    function _seedCategories(CategoryRegistry registry) internal {
        // YouTube (categoryId: 1)
        string[] memory youtubeSubcats = new string[](12);
        youtubeSubcats[0] = "Education";
        youtubeSubcats[1] = "Entertainment";
        youtubeSubcats[2] = "Technology";
        youtubeSubcats[3] = "Science";
        youtubeSubcats[4] = "Music";
        youtubeSubcats[5] = "Art";
        youtubeSubcats[6] = "Gaming";
        youtubeSubcats[7] = "News";
        youtubeSubcats[8] = "Sports";
        youtubeSubcats[9] = "Lifestyle";
        youtubeSubcats[10] = "Finance";
        youtubeSubcats[11] = "Health";
        registry.addApprovedCategory("YouTube", "youtube.com", youtubeSubcats);

        // Twitch (categoryId: 2)
        string[] memory twitchSubcats = new string[](5);
        twitchSubcats[0] = "Gaming";
        twitchSubcats[1] = "Music";
        twitchSubcats[2] = "Talk Shows";
        twitchSubcats[3] = "Sports";
        twitchSubcats[4] = "Creative";
        registry.addApprovedCategory("Twitch", "twitch.tv", twitchSubcats);

        // Magic: The Gathering - Scryfall (categoryId: 3)
        string[] memory mtgSubcats = new string[](8);
        mtgSubcats[0] = "Creatures";
        mtgSubcats[1] = "Instants";
        mtgSubcats[2] = "Sorceries";
        mtgSubcats[3] = "Enchantments";
        mtgSubcats[4] = "Artifacts";
        mtgSubcats[5] = "Lands";
        mtgSubcats[6] = "Planeswalkers";
        mtgSubcats[7] = "Commanders";
        registry.addApprovedCategory("Magic: The Gathering", "scryfall.com", mtgSubcats);

        // Movies - TMDB (categoryId: 4)
        string[] memory movieSubcats = new string[](10);
        movieSubcats[0] = "Action";
        movieSubcats[1] = "Comedy";
        movieSubcats[2] = "Drama";
        movieSubcats[3] = "Horror";
        movieSubcats[4] = "Sci-Fi";
        movieSubcats[5] = "Documentary";
        movieSubcats[6] = "Animation";
        movieSubcats[7] = "Thriller";
        movieSubcats[8] = "Romance";
        movieSubcats[9] = "Fantasy";
        registry.addApprovedCategory("Movies", "themoviedb.org", movieSubcats);

        // People - Wikipedia (categoryId: 5)
        string[] memory peopleSubcats = new string[](8);
        peopleSubcats[0] = "Athletes";
        peopleSubcats[1] = "Musicians";
        peopleSubcats[2] = "Politicians";
        peopleSubcats[3] = "Scientists";
        peopleSubcats[4] = "Actors";
        peopleSubcats[5] = "Business";
        peopleSubcats[6] = "Artists";
        peopleSubcats[7] = "Authors";
        registry.addApprovedCategory("People", "en.wikipedia.org", peopleSubcats);

        // Games - RAWG (categoryId: 6)
        string[] memory gameSubcats = new string[](8);
        gameSubcats[0] = "Action";
        gameSubcats[1] = "RPG";
        gameSubcats[2] = "Strategy";
        gameSubcats[3] = "Simulation";
        gameSubcats[4] = "Adventure";
        gameSubcats[5] = "Indie";
        gameSubcats[6] = "Sports";
        gameSubcats[7] = "Puzzle";
        registry.addApprovedCategory("Games", "rawg.io", gameSubcats);

        // Books - Open Library (categoryId: 7)
        string[] memory bookSubcats = new string[](8);
        bookSubcats[0] = "Fiction";
        bookSubcats[1] = "Non-Fiction";
        bookSubcats[2] = "Science Fiction";
        bookSubcats[3] = "Fantasy";
        bookSubcats[4] = "Biography";
        bookSubcats[5] = "History";
        bookSubcats[6] = "Science";
        bookSubcats[7] = "Philosophy";
        registry.addApprovedCategory("Books", "openlibrary.org", bookSubcats);

        // AI - Hugging Face (categoryId: 8)
        string[] memory aiSubcats = new string[](9);
        aiSubcats[0] = "Chatbots";
        aiSubcats[1] = "Image Generation";
        aiSubcats[2] = "Coding";
        aiSubcats[3] = "Writing";
        aiSubcats[4] = "Research";
        aiSubcats[5] = "Music";
        aiSubcats[6] = "Video";
        aiSubcats[7] = "Productivity";
        aiSubcats[8] = "Agents";
        registry.addApprovedCategory("AI", "huggingface.co", aiSubcats);

        // Crypto Tokens - CoinGecko (categoryId: 9)
        string[] memory cryptoSubcats = new string[](8);
        cryptoSubcats[0] = "Layer 1";
        cryptoSubcats[1] = "Layer 2";
        cryptoSubcats[2] = "DeFi";
        cryptoSubcats[3] = "Memecoins";
        cryptoSubcats[4] = "Stablecoins";
        cryptoSubcats[5] = "Gaming/NFT";
        cryptoSubcats[6] = "Infrastructure";
        cryptoSubcats[7] = "Privacy";
        registry.addApprovedCategory("Crypto Tokens", "coingecko.com", cryptoSubcats);

        // Tweets - X/Twitter (categoryId: 10)
        string[] memory tweetSubcats = new string[](10);
        tweetSubcats[0] = "News";
        tweetSubcats[1] = "Commentary";
        tweetSubcats[2] = "Tech";
        tweetSubcats[3] = "Science";
        tweetSubcats[4] = "Politics";
        tweetSubcats[5] = "Sports";
        tweetSubcats[6] = "Humor";
        tweetSubcats[7] = "Culture";
        tweetSubcats[8] = "Threads";
        tweetSubcats[9] = "Announcements";
        registry.addApprovedCategory("Tweets", "x.com", tweetSubcats);

        // GitHub Repos (categoryId: 11)
        string[] memory githubSubcats = new string[](8);
        githubSubcats[0] = "Libraries";
        githubSubcats[1] = "Developer Tools";
        githubSubcats[2] = "Frameworks";
        githubSubcats[3] = "DeFi/Web3";
        githubSubcats[4] = "AI/ML";
        githubSubcats[5] = "Infrastructure";
        githubSubcats[6] = "Security";
        githubSubcats[7] = "Education";
        registry.addApprovedCategory("GitHub Repos", "github.com", githubSubcats);

        // Spotify Podcasts (categoryId: 12)
        string[] memory spotifySubcats = new string[](8);
        spotifySubcats[0] = "Technology";
        spotifySubcats[1] = "Business";
        spotifySubcats[2] = "Comedy";
        spotifySubcats[3] = "News";
        spotifySubcats[4] = "Science";
        spotifySubcats[5] = "Health";
        spotifySubcats[6] = "Sports";
        spotifySubcats[7] = "Culture";
        registry.addApprovedCategory("Spotify Podcasts", "open.spotify.com", spotifySubcats);
    }
}
