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
import { QuestionRewardPoolEscrow } from "../contracts/QuestionRewardPoolEscrow.sol";
import { VoterIdNFT } from "../contracts/VoterIdNFT.sol";
import { CuryoGovernor } from "../contracts/governance/CuryoGovernor.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";
import { HumanFaucet } from "../contracts/HumanFaucet.sol";
import { MockERC20 } from "../contracts/mocks/MockERC20.sol";
import { MockIdentityVerificationHub } from "../contracts/mocks/MockIdentityVerificationHub.sol";
import { IIdentityVerificationHubV2 } from "@selfxyz/contracts/contracts/interfaces/IIdentityVerificationHubV2.sol";
import { SelfStructs } from "@selfxyz/contracts/contracts/libraries/SelfStructs.sol";
import { SelfUtils } from "@selfxyz/contracts/contracts/libraries/SelfUtils.sol";

/// @notice Deploy script for all Curyo contracts with transparent proxies.
/// @dev Core protocol voting uses cREP; bounty escrow deployments also wire USDC test collateral.
///      Local dev: deployer is governance (all roles go to deployer).
///      Production: TimelockController + CuryoGovernor are deployed, timelock gets all permanent roles including treasury routing.
contract DeployCuryo is ScaffoldETHDeploy {
    error DeploymentRoleVerificationFailed(string check);
    error UnsupportedHumanFaucetChain(uint256 chainId);

    bytes32 internal constant ERC1967_ADMIN_SLOT = bytes32(uint256(keccak256("eip1967.proxy.admin")) - 1);

    // Timelock delay: 2 days for standard operations
    uint256 public constant TIMELOCK_MIN_DELAY = 2 days;

    // Launch token allocations (6 decimals)
    uint256 public constant TOTAL_SUPPLY_CAP = 100_000_000 * 1e6;
    uint256 public constant CONSENSUS_POOL_AMOUNT = 4_000_000 * 1e6;
    uint256 public constant TREASURY_AMOUNT = 20_000_000 * 1e6;
    uint256 public constant PARTICIPATION_POOL_AMOUNT = 24_000_000 * 1e6;
    uint256 public constant FAUCET_POOL_AMOUNT =
        TOTAL_SUPPLY_CAP - CONSENSUS_POOL_AMOUNT - TREASURY_AMOUNT - PARTICIPATION_POOL_AMOUNT;

    // Self.xyz IdentityVerificationHub addresses
    address constant CELO_MAINNET_HUB = 0xe57F4773bd9c9d8b6Cd70431117d353298B9f5BF;
    address constant CELO_SEPOLIA_HUB = 0x16ECBA51e18a4a7e61fdC417f0d47AFEeDfbed74;

    // Native Circle USDC on Celo. Testnet address follows Circle's published testnet contract list.
    address constant CELO_MAINNET_USDC = 0xcebA9300f2b948710d2653dD7B07f33A8B32118C;
    address constant CELO_SEPOLIA_USDC = 0x01C5C0122039549AD1493B8220cABEdD739BC44E;

    uint256 public constant FAUCET_MINIMUM_AGE = 18;

    struct MigrationBootstrapConfig {
        address[] users;
        uint256[] nullifiers;
        uint256[] amounts;
        address[] referrers;
        uint256[] claimantBonuses;
        uint256[] referrerRewards;
    }

    function _preBroadcastChecks() internal view override {
        _resolveHumanFaucetConfig(block.chainid == 31337);
        MigrationBootstrapConfig memory migrationConfig = _loadMigrationBootstrapConfig();
        _validateMigrationBootstrapConfig(migrationConfig);
    }

    function run() external ScaffoldEthDeployerRunner {
        // Detect local dev: anvil/hardhat chain IDs
        bool isLocalDev = block.chainid == 31337;

        // --- Determine governance authority ---
        // Local dev: deployer serves as governance and treasury
        // Production: timelock governs upgrades, config, and treasury from launch
        address governance;
        address governorAddr;
        TimelockController timelock;
        CuryoGovernor governor;

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

            timelock = new TimelockController(
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
            governor = new CuryoGovernor(IVotes(address(crepToken)), TimelockController(payable(governance)));
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
        QuestionRewardPoolEscrow questionRewardPoolEscrowImpl = new QuestionRewardPoolEscrow();

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
            address(protocolConfigImpl), governance, abi.encodeCall(ProtocolConfig.initialize, (deployer, governance))
        );
        ProtocolConfig protocolConfig = ProtocolConfig(address(protocolConfigProxy));

        // RoundVotingEngine has had storage-breaking voting-system rewrites in this repo's history.
        // Migrate those versions via fresh proxy deployment, not in-place proxy upgrade.
        TransparentUpgradeableProxy votingEngineProxy = new TransparentUpgradeableProxy(
            address(votingEngineImpl),
            governance,
            abi.encodeCall(
                RoundVotingEngine.initialize,
                (governance, address(crepToken), address(registry), address(protocolConfig))
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
        CategoryRegistry categoryRegistry = new CategoryRegistry(deployer, governance);

        // 7. Deploy VoterIdNFT (soulbound identity for verified humans)
        VoterIdNFT voterIdNFT = new VoterIdNFT(deployer, governance);
        voterIdNFT.setStakeRecorder(address(votingEngine));

        // 7a. Deploy Curyo 2 USDC bounty escrow.
        address usdcTokenAddress;
        MockERC20 localUsdcToken;
        if (isLocalDev) {
            localUsdcToken = new MockERC20("USD Coin", "USDC", 6);
            usdcTokenAddress = address(localUsdcToken);
            console.log("Mock USDC deployed at:", usdcTokenAddress);
        } else {
            usdcTokenAddress = _resolveCeloUsdcAddress();
            console.log("Circle USDC resolved at:", usdcTokenAddress);
        }

        TransparentUpgradeableProxy questionRewardPoolEscrowProxy = new TransparentUpgradeableProxy(
            address(questionRewardPoolEscrowImpl),
            governance,
            abi.encodeCall(
                QuestionRewardPoolEscrow.initialize,
                (
                    governance,
                    address(crepToken),
                    usdcTokenAddress,
                    address(registry),
                    address(votingEngine),
                    address(voterIdNFT)
                )
            )
        );
        QuestionRewardPoolEscrow questionRewardPoolEscrow =
            QuestionRewardPoolEscrow(address(questionRewardPoolEscrowProxy));

        // 8. Wire contracts together (deployer uses temporary config/admin roles where needed)
        registry.setVotingEngine(address(votingEngine));
        registry.setProtocolConfig(address(votingEngine.protocolConfig()));
        registry.setCategoryRegistry(address(categoryRegistry));
        registry.setQuestionRewardPoolEscrow(address(questionRewardPoolEscrow));
        ProtocolConfig(address(votingEngine.protocolConfig())).setRewardDistributor(address(rewardDistributor));
        ProtocolConfig(address(votingEngine.protocolConfig())).setFrontendRegistry(address(frontendRegistry));
        ProtocolConfig(address(votingEngine.protocolConfig())).setCategoryRegistry(address(categoryRegistry));

        // Wire VoterIdNFT to all contracts
        ProtocolConfig(address(votingEngine.protocolConfig())).setVoterIdNFT(address(voterIdNFT));
        registry.setVoterIdNFT(address(voterIdNFT));
        frontendRegistry.setVoterIdNFT(address(voterIdNFT));
        profileRegistry.setVoterIdNFT(address(voterIdNFT));

        // Wire FrontendRegistry to VotingEngine for slashing
        frontendRegistry.setVotingEngine(address(votingEngine));
        frontendRegistry.addFeeCreditor(address(rewardDistributor));

        // 9. Seed initial categories
        _seedCategories(categoryRegistry);

        // 10. Set content voting contracts on token (for governance lock bypass)
        crepToken.setContentVotingContracts(address(votingEngine), address(registry));

        // 11. Configure round parameters
        ProtocolConfig(address(votingEngine.protocolConfig())).setConfig(20 minutes, 7 days, 3, 1000); // epochDuration, maxDuration, minVoters, maxVoters

        // 12. Fund consensus reserve (pre-funded reserve for unanimous round rewards)
        // Local dev: deployer has DEFAULT_ADMIN_ROLE and needs to grant MINTER_ROLE
        // Production: deployer gets only MINTER_ROLE + CONFIG_ROLE from constructor
        if (isLocalDev) {
            crepToken.grantRole(crepToken.MINTER_ROLE(), deployer);
        }
        crepToken.mint(deployer, CONSENSUS_POOL_AMOUNT);
        crepToken.approve(address(votingEngine), CONSENSUS_POOL_AMOUNT);
        votingEngine.addToConsensusReserve(CONSENSUS_POOL_AMOUNT);
        console.log("Funded 4M cREP to consensus reserve");

        // 12a. Fund treasury (20M cREP to governance treasury)
        crepToken.mint(governance, TREASURY_AMOUNT);
        console.log("Minted 20M cREP to governance treasury");

        // 12b. Deploy and fund ParticipationPool (24M cREP, user-facing Bootstrap Pool)
        ParticipationPool participationPool = new ParticipationPool(address(crepToken), governance);
        participationPool.setAuthorizedCaller(address(rewardDistributor), true);
        crepToken.mint(deployer, PARTICIPATION_POOL_AMOUNT);
        crepToken.approve(address(participationPool), PARTICIPATION_POOL_AMOUNT);
        participationPool.depositPool(PARTICIPATION_POOL_AMOUNT);
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(participationPool));
        if (!isLocalDev) {
            participationPool.transferOwnership(governance);
        }
        console.log("ParticipationPool deployed and funded with 24M cREP");

        // 12c. Deploy and fund HumanFaucet (52,000,000 cREP, Self.xyz identity verification)
        HumanFaucet humanFaucet;
        {
            (address hubAddress, bool isFaucetMock) = _resolveHumanFaucetConfig(isLocalDev);

            if (isFaucetMock) {
                MockIdentityVerificationHub mockHub = new MockIdentityVerificationHub();
                hubAddress = address(mockHub);
                console.log("MockIdentityVerificationHub deployed at:", hubAddress);
            }

            humanFaucet = new HumanFaucet(address(crepToken), hubAddress, governance);
            console.log("HumanFaucet deployed at:", address(humanFaucet));

            // Wire VoterIdNFT
            voterIdNFT.addMinter(address(humanFaucet));
            humanFaucet.setVoterIdNFT(address(voterIdNFT));

            // Fund the faucet with the full remaining launch allocation so launch minting reaches MAX_SUPPLY.
            crepToken.mint(address(humanFaucet), FAUCET_POOL_AMOUNT);
            console.log("Minted 52,000,000 cREP to HumanFaucet");

            // Set verification config
            if (!isFaucetMock) {
                SelfStructs.VerificationConfigV2 memory config = _buildFaucetVerificationConfig();
                bytes32 configId = IIdentityVerificationHubV2(hubAddress).setVerificationConfigV2(config);
                humanFaucet.setConfigId(configId);
                _assertFaucetVerificationConfig(humanFaucet, hubAddress, configId);
                console.log("Set verification config on HumanFaucet");
            } else {
                bytes32 mockConfigId = MockIdentityVerificationHub(hubAddress).MOCK_CONFIG_ID();
                humanFaucet.setConfigId(mockConfigId);
                _assertFaucetVerificationConfig(humanFaucet, hubAddress, mockConfigId);
                console.log("Set mock configId on HumanFaucet");
            }

            MigrationBootstrapConfig memory migrationConfig = _loadMigrationBootstrapConfig();
            if (migrationConfig.users.length > 0) {
                humanFaucet.bootstrapMigratedClaims(
                    migrationConfig.users,
                    migrationConfig.nullifiers,
                    migrationConfig.amounts,
                    migrationConfig.referrers,
                    migrationConfig.claimantBonuses,
                    migrationConfig.referrerRewards
                );
                console.log("Bootstrapped migrated HumanFaucet claims:", migrationConfig.users.length);
            }
            humanFaucet.closeMigrationBootstrap();
            console.log("Closed HumanFaucet migration bootstrap");

            // Transfer ownership to governance (production only)
            if (!isLocalDev) {
                humanFaucet.transferOwnership(governance);
                console.log("HumanFaucet ownership transferred to governance");
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
                address(questionRewardPoolEscrow),
                address(frontendRegistry)
            );
            CuryoGovernor(payable(governorAddr)).initializePools(excludedHolders);
            console.log("Governor excluded holders initialized for dynamic quorum");
        }

        _verifyLaunchMintAllocation(crepToken, governance, votingEngine, participationPool, humanFaucet);

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
                localUsdcToken.mint(testAccounts[i], 10_000 * 1e6);
            }
            console.log("Transferred 1000 cREP and minted 10000 mock USDC to 9 test accounts");

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
            // Production/testnet dev faucet grants now require governance after deployment.
            address devFaucet = vm.envOr("DEV_FAUCET_ADDRESS", address(0));
            bool isTestnet = (block.chainid == 44787 || block.chainid == 11142220);
            if (devFaucet != address(0) && isTestnet) {
                console.log(
                    "DEV_FAUCET_ADDRESS configured; grant MINTER_ROLE/VoterId minter via governance post-deploy:"
                );
                console.logAddress(devFaucet);
            }

            // Renounce all deployer roles on CuryoReputation
            // DEFAULT_ADMIN_ROLE last (it controls the other roles)
            crepToken.renounceRole(crepToken.MINTER_ROLE(), deployer);
            crepToken.renounceRole(crepToken.CONFIG_ROLE(), deployer);
            crepToken.renounceRole(crepToken.DEFAULT_ADMIN_ROLE(), deployer);

            // Renounce deployer config/admin roles on protocol contracts
            registry.renounceRole(registry.CONFIG_ROLE(), deployer);
            protocolConfig.renounceRole(protocolConfig.CONFIG_ROLE(), deployer);

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
                questionRewardPoolEscrow: questionRewardPoolEscrow,
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
        if (address(timelock) != address(0)) {
            deployments.push(Deployment("TimelockController", address(timelock)));
        }
        if (address(governor) != address(0)) {
            deployments.push(Deployment("CuryoGovernor", address(governor)));
        }
        deployments.push(Deployment("CuryoReputation", address(crepToken)));
        deployments.push(Deployment("FrontendRegistry", address(frontendRegistryProxy)));
        deployments.push(Deployment("ProfileRegistry", address(profileRegistryProxy)));
        deployments.push(Deployment("ContentRegistry", address(registryProxy)));
        deployments.push(Deployment("RoundVotingEngine", address(votingEngineProxy)));
        deployments.push(Deployment("ProtocolConfig", address(protocolConfigProxy)));
        deployments.push(Deployment("RoundRewardDistributor", address(rewardDistributorProxy)));
        deployments.push(Deployment("QuestionRewardPoolEscrow", address(questionRewardPoolEscrowProxy)));
        if (isLocalDev && usdcTokenAddress != address(0)) {
            deployments.push(Deployment("MockERC20", usdcTokenAddress));
        }
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
        console.log("QuestionRewardPoolEscrow:", address(questionRewardPoolEscrow));
        console.log("USDC token:", usdcTokenAddress);
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

    function _resolveHumanFaucetConfig(bool isLocalDev) internal view returns (address hubAddress, bool isFaucetMock) {
        if (isLocalDev) {
            return (address(0), true);
        }
        if (block.chainid == 42220) {
            return (CELO_MAINNET_HUB, false);
        }
        if (block.chainid == 11142220) {
            return (CELO_SEPOLIA_HUB, false);
        }
        revert UnsupportedHumanFaucetChain(block.chainid);
    }

    function _resolveCeloUsdcAddress() internal view returns (address) {
        if (block.chainid == 42220) {
            return CELO_MAINNET_USDC;
        }
        if (block.chainid == 11142220) {
            return CELO_SEPOLIA_USDC;
        }
        revert UnsupportedHumanFaucetChain(block.chainid);
    }

    function _buildFaucetVerificationConfig() internal pure returns (SelfStructs.VerificationConfigV2 memory) {
        return SelfUtils.formatVerificationConfigV2(
            SelfUtils.UnformattedVerificationConfigV2({
                olderThan: FAUCET_MINIMUM_AGE, forbiddenCountries: _buildFaucetForbiddenCountries(), ofacEnabled: true
            })
        );
    }

    function _buildFaucetForbiddenCountries() internal pure returns (string[] memory forbiddenCountries) {
        forbiddenCountries = new string[](4);
        forbiddenCountries[0] = "CUB";
        forbiddenCountries[1] = "IRN";
        forbiddenCountries[2] = "PRK";
        forbiddenCountries[3] = "SYR";
    }

    function _loadMigrationBootstrapConfig() internal view returns (MigrationBootstrapConfig memory migrationConfig) {
        string memory filePath = vm.envOr("MIGRATION_BOOTSTRAP_FILE", string(""));
        if (bytes(filePath).length == 0) {
            return migrationConfig;
        }

        string memory json = vm.readFile(filePath);
        migrationConfig.users = vm.parseJsonAddressArray(json, ".users");
        migrationConfig.nullifiers = _parseJsonUintStringArray(json, ".nullifiers");
        migrationConfig.amounts = _parseJsonUintStringArray(json, ".amounts");
        migrationConfig.referrers = vm.parseJsonAddressArray(json, ".referrers");
        migrationConfig.claimantBonuses = _parseJsonUintStringArray(json, ".claimantBonuses");
        migrationConfig.referrerRewards = _parseJsonUintStringArray(json, ".referrerRewards");
    }

    function _parseJsonUintStringArray(string memory json, string memory key)
        internal
        view
        returns (uint256[] memory values)
    {
        string[] memory rawValues = vm.parseJsonStringArray(json, key);
        values = new uint256[](rawValues.length);
        for (uint256 i = 0; i < rawValues.length; ++i) {
            values[i] = _parseUintString(rawValues[i]);
        }
    }

    function _parseUintString(string memory value) internal pure returns (uint256 parsed) {
        bytes memory raw = bytes(value);
        _require(raw.length > 0, "Migration uint empty");

        if (raw.length > 2 && raw[0] == bytes1("0") && (raw[1] == bytes1("x") || raw[1] == bytes1("X"))) {
            _require(raw.length <= 66, "Migration uint invalid hex length");
            for (uint256 i = 2; i < raw.length; ++i) {
                uint8 nibble = _hexNibble(uint8(raw[i]));
                _require(nibble != type(uint8).max, "Migration uint invalid hex");
                parsed = (parsed << 4) | uint256(nibble);
            }
            return parsed;
        }

        for (uint256 i = 0; i < raw.length; ++i) {
            uint8 charCode = uint8(raw[i]);
            _require(charCode >= 48 && charCode <= 57, "Migration uint invalid decimal");
            parsed = parsed * 10 + uint256(charCode - 48);
        }
    }

    function _hexNibble(uint8 charCode) internal pure returns (uint8) {
        if (charCode >= 48 && charCode <= 57) return charCode - 48;
        if (charCode >= 65 && charCode <= 70) return charCode - 55;
        if (charCode >= 97 && charCode <= 102) return charCode - 87;
        return type(uint8).max;
    }

    function _validateMigrationBootstrapConfig(MigrationBootstrapConfig memory migrationConfig) internal pure {
        uint256 claimCount = migrationConfig.users.length;
        _require(migrationConfig.nullifiers.length == claimCount, "Migration nullifiers length");
        _require(migrationConfig.amounts.length == claimCount, "Migration amounts length");
        _require(migrationConfig.referrers.length == claimCount, "Migration referrers length");
        _require(migrationConfig.claimantBonuses.length == claimCount, "Migration claimant bonuses length");
        _require(migrationConfig.referrerRewards.length == claimCount, "Migration referrer rewards length");

        for (uint256 i = 0; i < claimCount; ++i) {
            _require(migrationConfig.users[i] != address(0), "Migration user zero");
            _require(migrationConfig.nullifiers[i] != 0, "Migration nullifier zero");
            _require(migrationConfig.amounts[i] > 0, "Migration amount zero");
            _require(
                migrationConfig.claimantBonuses[i] <= migrationConfig.amounts[i],
                "Migration claimant bonus exceeds amount"
            );

            if (migrationConfig.referrers[i] == address(0)) {
                _require(migrationConfig.claimantBonuses[i] == 0, "Migration bonus without referrer");
                _require(migrationConfig.referrerRewards[i] == 0, "Migration reward without referrer");
            } else {
                _require(migrationConfig.referrers[i] != migrationConfig.users[i], "Migration self referral");
                bool referrerSeen;
                for (uint256 j = 0; j < i; ++j) {
                    if (migrationConfig.users[j] == migrationConfig.referrers[i]) {
                        referrerSeen = true;
                        break;
                    }
                }
                _require(referrerSeen, "Migration referrer order");
                _require(migrationConfig.claimantBonuses[i] > 0, "Migration referral bonus zero");
                _require(migrationConfig.referrerRewards[i] > 0, "Migration referral reward zero");
            }
        }
    }

    function _verifyLaunchMintAllocation(
        CuryoReputation crepToken,
        address governance,
        RoundVotingEngine votingEngine,
        ParticipationPool participationPool,
        HumanFaucet humanFaucet
    ) internal view {
        _require(address(humanFaucet) != address(0), "HumanFaucet deployed");
        _require(crepToken.MAX_SUPPLY() == TOTAL_SUPPLY_CAP, "cREP max supply constant");
        _require(crepToken.totalSupply() == TOTAL_SUPPLY_CAP, "cREP full launch mint");
        _require(votingEngine.consensusReserve() == CONSENSUS_POOL_AMOUNT, "Consensus reserve launch allocation");
        _require(
            crepToken.balanceOf(address(votingEngine)) == CONSENSUS_POOL_AMOUNT, "RoundVotingEngine launch balance"
        );
        _require(crepToken.balanceOf(governance) == TREASURY_AMOUNT, "Treasury launch allocation");
        _require(
            crepToken.balanceOf(address(participationPool)) == PARTICIPATION_POOL_AMOUNT,
            "ParticipationPool launch allocation"
        );
        _require(crepToken.balanceOf(address(humanFaucet)) == FAUCET_POOL_AMOUNT, "HumanFaucet launch allocation");
    }

    function _assertFaucetVerificationConfig(HumanFaucet humanFaucet, address hubAddress, bytes32 expectedConfigId)
        internal
        view
    {
        _require(expectedConfigId != bytes32(0), "HumanFaucet config created");
        _require(humanFaucet.verificationConfigId() == expectedConfigId, "HumanFaucet config stored");
        _require(
            IIdentityVerificationHubV2(hubAddress).verificationConfigV2Exists(expectedConfigId),
            "HumanFaucet config exists on hub"
        );
    }

    function _assertExactExcludedHolders(CuryoGovernor governor, address[] memory expectedExcludedHolders)
        internal
        view
    {
        address[] memory actualExcludedHolders = governor.getExcludedHolders();
        _require(actualExcludedHolders.length == expectedExcludedHolders.length, "Governor excluded holders length");
        for (uint256 i = 0; i < expectedExcludedHolders.length; i++) {
            _require(actualExcludedHolders[i] == expectedExcludedHolders[i], "Governor excluded holder mismatch");
        }
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
        QuestionRewardPoolEscrow questionRewardPoolEscrow,
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
        _requireLacksRole(
            address(registry), registry.TREASURY_ROLE(), deployerAddress, "ContentRegistry deployer treasury"
        );
        _requireProxyAdminOwner(address(registry), governance, "ContentRegistry proxy admin owner");

        _requireHasRole(
            address(votingEngine),
            votingEngine.DEFAULT_ADMIN_ROLE(),
            governance,
            "RoundVotingEngine governance default admin"
        );
        _requireHasRole(
            address(votingEngine), votingEngine.PAUSER_ROLE(), governance, "RoundVotingEngine governance pauser"
        );
        _requireProxyAdminOwner(address(votingEngine), governance, "RoundVotingEngine proxy admin owner");

        _requireHasRole(
            address(protocolConfig),
            protocolConfig.DEFAULT_ADMIN_ROLE(),
            governance,
            "ProtocolConfig governance default admin"
        );
        _requireHasRole(
            address(protocolConfig), protocolConfig.CONFIG_ROLE(), governance, "ProtocolConfig governance config"
        );
        _requireHasRole(
            address(protocolConfig), protocolConfig.TREASURY_ROLE(), governance, "ProtocolConfig governance treasury"
        );
        _requireHasRole(
            address(protocolConfig),
            protocolConfig.TREASURY_ADMIN_ROLE(),
            governance,
            "ProtocolConfig governance treasury admin"
        );
        _requireLacksRole(
            address(protocolConfig), protocolConfig.CONFIG_ROLE(), deployerAddress, "ProtocolConfig deployer config"
        );
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
            address(questionRewardPoolEscrow),
            questionRewardPoolEscrow.DEFAULT_ADMIN_ROLE(),
            governance,
            "QuestionRewardPoolEscrow governance default admin"
        );
        _requireHasRole(
            address(questionRewardPoolEscrow),
            questionRewardPoolEscrow.CONFIG_ROLE(),
            governance,
            "QuestionRewardPoolEscrow governance config"
        );
        _requireHasRole(
            address(questionRewardPoolEscrow),
            questionRewardPoolEscrow.PAUSER_ROLE(),
            governance,
            "QuestionRewardPoolEscrow governance pauser"
        );
        _requireProxyAdminOwner(
            address(questionRewardPoolEscrow), governance, "QuestionRewardPoolEscrow proxy admin owner"
        );

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
        _require(address(frontendRegistry.voterIdNFT()) == address(voterIdNFT), "FrontendRegistry voterIdNFT");
        _require(address(profileRegistry.voterIdNFT()) == address(voterIdNFT), "ProfileRegistry voterIdNFT");
        _require(
            address(questionRewardPoolEscrow.voterIdNFT()) == address(voterIdNFT), "QuestionRewardPoolEscrow voterIdNFT"
        );
        _require(address(questionRewardPoolEscrow.registry()) == address(registry), "QuestionRewardPoolEscrow registry");
        _require(
            address(questionRewardPoolEscrow.votingEngine()) == address(votingEngine),
            "QuestionRewardPoolEscrow voting engine"
        );
        _require(
            address(questionRewardPoolEscrow.usdcToken()) == _resolveCeloUsdcAddress(), "QuestionRewardPoolEscrow USDC"
        );
        _require(voterIdNFT.owner() == governance, "VoterIdNFT governance owner");
        _require(participationPool.owner() == governance, "ParticipationPool governance owner");
        if (address(humanFaucet) != address(0)) {
            _require(address(humanFaucet.voterIdNFT()) == address(voterIdNFT), "HumanFaucet voterIdNFT");
            _require(humanFaucet.owner() == governance, "HumanFaucet governance owner");
            _require(humanFaucet.migrationBootstrapClosed(), "HumanFaucet migration bootstrap closed");
        }

        _require(governorAddr != address(0), "Governor deployed");
        CuryoGovernor governor = CuryoGovernor(payable(governorAddr));
        _require(governor.poolsInitialized(), "Governor pools initialized");
        _assertExactExcludedHolders(
            governor,
            _buildQuorumExcludedHolders(
                address(humanFaucet),
                address(participationPool),
                address(rewardDistributor),
                address(votingEngine),
                governance,
                address(registry),
                address(questionRewardPoolEscrow),
                address(frontendRegistry)
            )
        );
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
        address questionRewardPoolEscrow,
        address frontendRegistry
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
        temp[count++] = questionRewardPoolEscrow;
        temp[count++] = frontendRegistry;

        holders = new address[](count);
        for (uint256 i = 0; i < count; i++) {
            holders[i] = temp[i];
        }
    }

    function _seedCategories(CategoryRegistry registry) internal {
        string[] memory productSubcats = new string[](8);
        productSubcats[0] = "Value";
        productSubcats[1] = "Quality";
        productSubcats[2] = "Usability";
        productSubcats[3] = "Durability";
        productSubcats[4] = "Design";
        productSubcats[5] = "Support";
        productSubcats[6] = "Safety";
        productSubcats[7] = "Sustainability";
        registry.addApprovedCategory("Products", "products", productSubcats);

        string[] memory localSubcats = new string[](8);
        localSubcats[0] = "Restaurants";
        localSubcats[1] = "Cafes";
        localSubcats[2] = "Nightlife";
        localSubcats[3] = "Service";
        localSubcats[4] = "Atmosphere";
        localSubcats[5] = "Accessibility";
        localSubcats[6] = "Value";
        localSubcats[7] = "Local Tips";
        registry.addApprovedCategory("Local Places", "local-places", localSubcats);

        string[] memory travelSubcats = new string[](8);
        travelSubcats[0] = "Hotels";
        travelSubcats[1] = "Location";
        travelSubcats[2] = "Cleanliness";
        travelSubcats[3] = "Service";
        travelSubcats[4] = "Comfort";
        travelSubcats[5] = "Value";
        travelSubcats[6] = "Family";
        travelSubcats[7] = "Solo Travel";
        registry.addApprovedCategory("Travel", "travel", travelSubcats);

        string[] memory appsSubcats = new string[](8);
        appsSubcats[0] = "Web Apps";
        appsSubcats[1] = "Mobile Apps";
        appsSubcats[2] = "Developer Tools";
        appsSubcats[3] = "Productivity";
        appsSubcats[4] = "Onboarding";
        appsSubcats[5] = "Performance";
        appsSubcats[6] = "Trust";
        appsSubcats[7] = "Pricing";
        registry.addApprovedCategory("Apps", "apps", appsSubcats);

        string[] memory mediaSubcats = new string[](8);
        mediaSubcats[0] = "Images";
        mediaSubcats[1] = "YouTube";
        mediaSubcats[2] = "Education";
        mediaSubcats[3] = "Entertainment";
        mediaSubcats[4] = "Art";
        mediaSubcats[5] = "Photography";
        mediaSubcats[6] = "Audio";
        mediaSubcats[7] = "Culture";
        registry.addApprovedCategory("Media", "media", mediaSubcats);

        string[] memory designSubcats = new string[](8);
        designSubcats[0] = "Visual Design";
        designSubcats[1] = "Brand";
        designSubcats[2] = "Typography";
        designSubcats[3] = "Layout";
        designSubcats[4] = "Accessibility";
        designSubcats[5] = "Photography";
        designSubcats[6] = "Fashion";
        designSubcats[7] = "Architecture";
        registry.addApprovedCategory("Design", "design", designSubcats);

        string[] memory aiAnswerSubcats = new string[](8);
        aiAnswerSubcats[0] = "Helpfulness";
        aiAnswerSubcats[1] = "Clarity";
        aiAnswerSubcats[2] = "Safety";
        aiAnswerSubcats[3] = "Creativity";
        aiAnswerSubcats[4] = "Reasoning";
        aiAnswerSubcats[5] = "Code";
        aiAnswerSubcats[6] = "Images";
        aiAnswerSubcats[7] = "Research";
        registry.addApprovedCategory("AI Answers", "ai-answers", aiAnswerSubcats);

        string[] memory docsSubcats = new string[](8);
        docsSubcats[0] = "Getting Started";
        docsSubcats[1] = "API Reference";
        docsSubcats[2] = "Tutorials";
        docsSubcats[3] = "Examples";
        docsSubcats[4] = "Accuracy";
        docsSubcats[5] = "Completeness";
        docsSubcats[6] = "Readability";
        docsSubcats[7] = "Troubleshooting";
        registry.addApprovedCategory("Developer Docs", "developer-docs", docsSubcats);

        string[] memory safetySubcats = new string[](8);
        safetySubcats[0] = "Trust";
        safetySubcats[1] = "Spam";
        safetySubcats[2] = "Harassment";
        safetySubcats[3] = "Moderation";
        safetySubcats[4] = "Privacy";
        safetySubcats[5] = "Disclosure";
        safetySubcats[6] = "Risk";
        safetySubcats[7] = "Policy";
        registry.addApprovedCategory("Trust", "trust", safetySubcats);

        string[] memory opinionSubcats = new string[](8);
        opinionSubcats[0] = "Taste";
        opinionSubcats[1] = "Usefulness";
        opinionSubcats[2] = "Interesting";
        opinionSubcats[3] = "Clear";
        opinionSubcats[4] = "Fun";
        opinionSubcats[5] = "Convincing";
        opinionSubcats[6] = "Worthwhile";
        opinionSubcats[7] = "Other";
        registry.addApprovedCategory("General", "general", opinionSubcats);
    }
}
