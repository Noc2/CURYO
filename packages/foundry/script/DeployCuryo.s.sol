// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ScaffoldETHDeploy } from "./DeployHelpers.s.sol";
import { console } from "forge-std/console.sol";
import { TransparentUpgradeableProxy } from "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol";
import { ProxyAdmin } from "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol";
import { IAccessControl } from "@openzeppelin/contracts/access/IAccessControl.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IVotes } from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import { HumanReputation } from "../contracts/HumanReputation.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { CategoryRegistry } from "../contracts/CategoryRegistry.sol";
import { FeedbackBonusEscrow } from "../contracts/FeedbackBonusEscrow.sol";
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
/// @dev Core protocol voting uses HREP; bounty escrow deployments also wire USDC test collateral.
///      Local dev: deployer is governance (all roles go to deployer).
///      Production: TimelockController + CuryoGovernor are deployed, timelock gets all permanent roles including treasury routing.
contract DeployCuryo is ScaffoldETHDeploy {
    error DeploymentRoleVerificationFailed(string check);
    error UnsupportedHumanFaucetChain(uint256 chainId);

    bytes32 internal constant ERC1967_ADMIN_SLOT = bytes32(uint256(keccak256("eip1967.proxy.admin")) - 1);
    bytes32 internal constant QUESTION_ESCROW_CONFIG_ROLE = keccak256("CONFIG_ROLE");
    bytes32 internal constant QUESTION_ESCROW_PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // Timelock delay: 2 days for standard operations
    uint256 public constant TIMELOCK_MIN_DELAY = 2 days;

    // Launch token allocations (6 decimals)
    uint256 public constant TOTAL_SUPPLY_CAP = 100_000_000 * 1e6;
    uint256 public constant CONSENSUS_POOL_AMOUNT = 4_000_000 * 1e6;
    uint256 public constant TREASURY_AMOUNT = 32_000_000 * 1e6;
    uint256 public constant PARTICIPATION_POOL_AMOUNT = 12_000_000 * 1e6;
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

    struct ProductionDeploymentRoleVerification {
        address deployerAddress;
        address governance;
        address governorAddr;
        HumanReputation hrepToken;
        ContentRegistry registry;
        RoundVotingEngine votingEngine;
        ProtocolConfig protocolConfig;
        RoundRewardDistributor rewardDistributor;
        QuestionRewardPoolEscrow questionRewardPoolEscrow;
        FeedbackBonusEscrow feedbackBonusEscrow;
        FrontendRegistry frontendRegistry;
        ProfileRegistry profileRegistry;
        CategoryRegistry categoryRegistry;
        VoterIdNFT voterIdNFT;
        ParticipationPool participationPool;
        HumanFaucet humanFaucet;
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

        // 2. Deploy HumanReputation (non-upgradeable governance token)
        HumanReputation hrepToken = new HumanReputation(deployer, governance);
        console.log("HumanReputation deployed at:", address(hrepToken));

        // 3. Deploy CuryoGovernor (production only)
        //    Excluded holders are set later via initializePools() after protocol contracts are deployed.
        if (!isLocalDev) {
            governor = new CuryoGovernor(IVotes(address(hrepToken)), TimelockController(payable(governance)));
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
            hrepToken.setGovernor(governorAddr);
        }

        // 4. Deploy implementations
        ContentRegistry registryImpl = new ContentRegistry();
        RoundVotingEngine votingEngineImpl = new RoundVotingEngine();
        RoundRewardDistributor rewardDistributorImpl = new RoundRewardDistributor();
        FrontendRegistry frontendRegistryImpl = new FrontendRegistry();
        ProfileRegistry profileRegistryImpl = new ProfileRegistry();
        ProtocolConfig protocolConfigImpl = new ProtocolConfig();
        QuestionRewardPoolEscrow questionRewardPoolEscrowImpl = new QuestionRewardPoolEscrow();
        FeedbackBonusEscrow feedbackBonusEscrowImpl = new FeedbackBonusEscrow();

        // 5. Deploy transparent proxies with initialization (governance owns each ProxyAdmin)
        TransparentUpgradeableProxy frontendRegistryProxy = new TransparentUpgradeableProxy(
            address(frontendRegistryImpl),
            governance,
            abi.encodeCall(FrontendRegistry.initialize, (deployer, governance, address(hrepToken)))
        );
        FrontendRegistry frontendRegistry = FrontendRegistry(address(frontendRegistryProxy));

        TransparentUpgradeableProxy profileRegistryProxy = new TransparentUpgradeableProxy(
            address(profileRegistryImpl), governance, abi.encodeCall(ProfileRegistry.initialize, (deployer, governance))
        );
        ProfileRegistry profileRegistry = ProfileRegistry(address(profileRegistryProxy));

        TransparentUpgradeableProxy registryProxy = new TransparentUpgradeableProxy(
            address(registryImpl),
            governance,
            abi.encodeCall(ContentRegistry.initialize, (deployer, governance, address(hrepToken)))
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
                (governance, address(hrepToken), address(registry), address(protocolConfig))
            )
        );
        RoundVotingEngine votingEngine = RoundVotingEngine(address(votingEngineProxy));

        TransparentUpgradeableProxy rewardDistributorProxy = new TransparentUpgradeableProxy(
            address(rewardDistributorImpl),
            governance,
            abi.encodeCall(
                RoundRewardDistributor.initialize,
                (governance, address(hrepToken), address(votingEngine), address(registry))
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
                    address(hrepToken),
                    usdcTokenAddress,
                    address(registry),
                    address(votingEngine),
                    address(voterIdNFT)
                )
            )
        );
        QuestionRewardPoolEscrow questionRewardPoolEscrow =
            QuestionRewardPoolEscrow(address(questionRewardPoolEscrowProxy));
        TransparentUpgradeableProxy feedbackBonusEscrowProxy = new TransparentUpgradeableProxy(
            address(feedbackBonusEscrowImpl),
            governance,
            abi.encodeCall(
                FeedbackBonusEscrow.initialize,
                (governance, usdcTokenAddress, address(registry), address(votingEngine), address(voterIdNFT))
            )
        );
        FeedbackBonusEscrow feedbackBonusEscrow = FeedbackBonusEscrow(address(feedbackBonusEscrowProxy));

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
        frontendRegistry.initializeFeeCreditor(address(rewardDistributor));
        frontendRegistry.setVotingEngine(address(votingEngine));

        // 9. Seed initial categories
        _seedCategories(categoryRegistry);

        // 10. Set content voting contracts on token (for governance lock bypass)
        hrepToken.setContentVotingContracts(address(votingEngine), address(registry));

        // 11. Configure round parameters
        ProtocolConfig(address(votingEngine.protocolConfig())).setConfig(20 minutes, 7 days, 3, 1000); // epochDuration, maxDuration, minVoters, maxVoters

        // 12. Fund consensus reserve (pre-funded reserve for unanimous round rewards)
        // Local dev: deployer has DEFAULT_ADMIN_ROLE and needs to grant MINTER_ROLE
        // Production: deployer gets only MINTER_ROLE + CONFIG_ROLE from constructor
        if (isLocalDev) {
            hrepToken.grantRole(hrepToken.MINTER_ROLE(), deployer);
        }
        hrepToken.mint(deployer, CONSENSUS_POOL_AMOUNT);
        hrepToken.approve(address(votingEngine), CONSENSUS_POOL_AMOUNT);
        votingEngine.addToConsensusReserve(CONSENSUS_POOL_AMOUNT);
        console.log("Funded 4M HREP to consensus reserve");

        // 12a. Fund treasury (32M HREP to governance treasury)
        hrepToken.mint(governance, TREASURY_AMOUNT);
        console.log("Minted 32M HREP to governance treasury");

        // 12b. Deploy and fund ParticipationPool (12M HREP, user-facing Bootstrap Pool)
        ParticipationPool participationPool = new ParticipationPool(address(hrepToken), governance);
        participationPool.setAuthorizedCaller(address(rewardDistributor), true);
        hrepToken.mint(deployer, PARTICIPATION_POOL_AMOUNT);
        hrepToken.approve(address(participationPool), PARTICIPATION_POOL_AMOUNT);
        participationPool.depositPool(PARTICIPATION_POOL_AMOUNT);
        ProtocolConfig(address(votingEngine.protocolConfig())).setParticipationPool(address(participationPool));
        if (!isLocalDev) {
            participationPool.transferOwnership(governance);
        }
        console.log("ParticipationPool deployed and funded with 12M HREP");

        // 12c. Deploy and fund HumanFaucet (52,000,000 HREP, Self.xyz identity verification)
        HumanFaucet humanFaucet;
        address humanFaucetHubAddress;
        bool isFaucetMock;
        {
            (humanFaucetHubAddress, isFaucetMock) = _resolveHumanFaucetConfig(isLocalDev);

            if (isFaucetMock) {
                MockIdentityVerificationHub mockHub = new MockIdentityVerificationHub();
                humanFaucetHubAddress = address(mockHub);
                console.log("MockIdentityVerificationHub deployed at:", humanFaucetHubAddress);
            }

            humanFaucet = new HumanFaucet(address(hrepToken), humanFaucetHubAddress, governance);
            console.log("HumanFaucet deployed at:", address(humanFaucet));
            if (!isLocalDev) {
                humanFaucet.pause();
                console.log("Paused HumanFaucet until governance opens public claims");
            }

            // Wire VoterIdNFT
            voterIdNFT.addMinter(address(humanFaucet));
            humanFaucet.setVoterIdNFT(address(voterIdNFT));

            // Fund the faucet with the full remaining launch allocation so launch minting reaches MAX_SUPPLY.
            hrepToken.mint(address(humanFaucet), FAUCET_POOL_AMOUNT);
            console.log("Minted 52,000,000 HREP to HumanFaucet");

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
                address(frontendRegistry)
            );
            CuryoGovernor(payable(governorAddr)).initializePools(excludedHolders);
            console.log("Governor excluded holders initialized for dynamic quorum");
        }

        _verifyLaunchMintAllocation(hrepToken, governance, votingEngine, participationPool, humanFaucet);

        // Set verification config only after launch allocation and migration bootstrap checks pass.
        if (!isFaucetMock) {
            SelfStructs.VerificationConfigV2 memory config = _buildFaucetVerificationConfig();
            bytes32 configId = IIdentityVerificationHubV2(humanFaucetHubAddress).setVerificationConfigV2(config);
            humanFaucet.setConfigId(configId);
            _assertFaucetVerificationConfig(humanFaucet, humanFaucetHubAddress, configId);
            console.log("Set verification config on HumanFaucet");
        } else {
            bytes32 mockConfigId = MockIdentityVerificationHub(humanFaucetHubAddress).MOCK_CONFIG_ID();
            humanFaucet.setConfigId(mockConfigId);
            _assertFaucetVerificationConfig(humanFaucet, humanFaucetHubAddress, mockConfigId);
            console.log("Set mock configId on HumanFaucet");
        }

        // Transfer ownership to governance while production public claims remain paused.
        if (!isLocalDev) {
            humanFaucet.transferOwnership(governance);
            console.log("HumanFaucet ownership transferred to governance");
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
                hrepToken.transfer(testAccounts[i], testAmount);
                localUsdcToken.mint(testAccounts[i], 10_000 * 1e6);
            }
            console.log("Transferred 1000 HREP and minted 10000 mock USDC to 9 test accounts");

            voterIdNFT.addMinter(deployer);
            for (uint256 i = 0; i < testAccounts.length; i++) {
                voterIdNFT.mint(testAccounts[i], i + 100);
            }
            console.log("Minted Voter IDs to 9 test accounts");

            address anvilAccount0 = 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266;
            hrepToken.grantRole(hrepToken.MINTER_ROLE(), anvilAccount0);
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

            // Renounce all deployer roles on HumanReputation
            // DEFAULT_ADMIN_ROLE last (it controls the other roles)
            hrepToken.renounceRole(hrepToken.MINTER_ROLE(), deployer);
            hrepToken.renounceRole(hrepToken.CONFIG_ROLE(), deployer);
            hrepToken.renounceRole(hrepToken.DEFAULT_ADMIN_ROLE(), deployer);

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

            _verifyProductionDeploymentRoles(
                ProductionDeploymentRoleVerification({
                    deployerAddress: deployer,
                    governance: governance,
                    governorAddr: governorAddr,
                    hrepToken: hrepToken,
                    registry: registry,
                    votingEngine: votingEngine,
                    protocolConfig: protocolConfig,
                    rewardDistributor: rewardDistributor,
                    questionRewardPoolEscrow: questionRewardPoolEscrow,
                    feedbackBonusEscrow: feedbackBonusEscrow,
                    frontendRegistry: frontendRegistry,
                    profileRegistry: profileRegistry,
                    categoryRegistry: categoryRegistry,
                    voterIdNFT: voterIdNFT,
                    participationPool: participationPool,
                    humanFaucet: humanFaucet
                })
            );
            console.log("Verified governance ownership and deployer role renunciation");
        } else {
            // Local dev: just revoke MINTER_ROLE as before
            hrepToken.revokeRole(hrepToken.MINTER_ROLE(), deployer);
        }

        // 14. Register addresses for scaffold-eth ABI generation
        if (address(timelock) != address(0)) {
            deployments.push(Deployment("TimelockController", address(timelock)));
        }
        if (address(governor) != address(0)) {
            deployments.push(Deployment("CuryoGovernor", address(governor)));
        }
        deployments.push(Deployment("HumanReputation", address(hrepToken)));
        deployments.push(Deployment("FrontendRegistry", address(frontendRegistryProxy)));
        deployments.push(Deployment("ProfileRegistry", address(profileRegistryProxy)));
        deployments.push(Deployment("ContentRegistry", address(registryProxy)));
        deployments.push(Deployment("RoundVotingEngine", address(votingEngineProxy)));
        deployments.push(Deployment("ProtocolConfig", address(protocolConfigProxy)));
        deployments.push(Deployment("RoundRewardDistributor", address(rewardDistributorProxy)));
        deployments.push(Deployment("QuestionRewardPoolEscrow", address(questionRewardPoolEscrowProxy)));
        deployments.push(Deployment("FeedbackBonusEscrow", address(feedbackBonusEscrowProxy)));
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
        console.log("HumanReputation:", address(hrepToken));
        console.log("FrontendRegistry:", address(frontendRegistry));
        console.log("ProfileRegistry:", address(profileRegistry));
        console.log("ContentRegistry:", address(registry));
        console.log("RoundVotingEngine:", address(votingEngine));
        console.log("ProtocolConfig:", address(protocolConfig));
        console.log("RoundRewardDistributor:", address(rewardDistributor));
        console.log("QuestionRewardPoolEscrow:", address(questionRewardPoolEscrow));
        console.log("FeedbackBonusEscrow:", address(feedbackBonusEscrow));
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
        (, uint256 seededCategoryCount) = categoryRegistry.getCategoryIdsPaginated(0, 0);
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
        pure
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
        HumanReputation hrepToken,
        address governance,
        RoundVotingEngine votingEngine,
        ParticipationPool participationPool,
        HumanFaucet humanFaucet
    ) internal view {
        _require(address(humanFaucet) != address(0), "HumanFaucet deployed");
        _require(hrepToken.MAX_SUPPLY() == TOTAL_SUPPLY_CAP, "HREP max supply constant");
        _require(hrepToken.totalSupply() == TOTAL_SUPPLY_CAP, "HREP full launch mint");
        _require(votingEngine.consensusReserve() == CONSENSUS_POOL_AMOUNT, "Consensus reserve launch allocation");
        _require(
            hrepToken.balanceOf(address(votingEngine)) == CONSENSUS_POOL_AMOUNT, "RoundVotingEngine launch balance"
        );
        _require(hrepToken.balanceOf(governance) == TREASURY_AMOUNT, "Treasury launch allocation");
        _require(
            hrepToken.balanceOf(address(participationPool)) == PARTICIPATION_POOL_AMOUNT,
            "ParticipationPool launch allocation"
        );
        _require(hrepToken.balanceOf(address(humanFaucet)) == FAUCET_POOL_AMOUNT, "HumanFaucet launch allocation");
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

    function _verifyProductionDeploymentRoles(ProductionDeploymentRoleVerification memory targets) internal view {
        _verifyProductionTokenRoles(targets);
        _verifyProductionRegistryRoles(targets);
        _verifyProductionVotingEngineRoles(targets);
        _verifyProductionProtocolConfigRoles(targets);
        _verifyProductionRewardDistributorRoles(targets);
        _verifyProductionQuestionEscrowRoles(targets);
        _verifyProductionFeedbackEscrowRoles(targets);
        _verifyProductionUserRegistryRoles(targets);
        _verifyProductionCoreWiring(targets);
        _verifyProductionEscrowWiring(targets);
        _verifyProductionParticipationAndFaucetWiring(targets);
        _verifyProductionGovernorAndTimelock(targets);
    }

    function _verifyProductionTokenRoles(ProductionDeploymentRoleVerification memory targets) internal view {
        HumanReputation hrepToken = targets.hrepToken;
        _requireHasRole(
            address(hrepToken), hrepToken.DEFAULT_ADMIN_ROLE(), targets.governance, "HREP governance default admin"
        );
        _requireHasRole(address(hrepToken), hrepToken.CONFIG_ROLE(), targets.governance, "HREP governance config");
        _requireLacksRole(
            address(hrepToken), hrepToken.DEFAULT_ADMIN_ROLE(), targets.deployerAddress, "HREP deployer default admin"
        );
        _requireLacksRole(address(hrepToken), hrepToken.CONFIG_ROLE(), targets.deployerAddress, "HREP deployer config");
        _requireLacksRole(address(hrepToken), hrepToken.MINTER_ROLE(), targets.deployerAddress, "HREP deployer minter");
    }

    function _verifyProductionRegistryRoles(ProductionDeploymentRoleVerification memory targets) internal view {
        ContentRegistry registry = targets.registry;
        _requireHasRole(
            address(registry),
            registry.DEFAULT_ADMIN_ROLE(),
            targets.governance,
            "ContentRegistry governance default admin"
        );
        _requireHasRole(
            address(registry), registry.CONFIG_ROLE(), targets.governance, "ContentRegistry governance config"
        );
        _requireHasRole(
            address(registry), registry.PAUSER_ROLE(), targets.governance, "ContentRegistry governance pauser"
        );
        _requireHasRole(
            address(registry), registry.TREASURY_ROLE(), targets.governance, "ContentRegistry governance treasury"
        );
        _requireHasRole(
            address(registry),
            registry.TREASURY_ADMIN_ROLE(),
            targets.governance,
            "ContentRegistry governance treasury admin"
        );
        _requireLacksRole(
            address(registry), registry.CONFIG_ROLE(), targets.deployerAddress, "ContentRegistry deployer config"
        );
        _requireLacksRole(
            address(registry), registry.TREASURY_ROLE(), targets.deployerAddress, "ContentRegistry deployer treasury"
        );
        _requireProxyAdminOwner(address(registry), targets.governance, "ContentRegistry proxy admin owner");
    }

    function _verifyProductionVotingEngineRoles(ProductionDeploymentRoleVerification memory targets) internal view {
        RoundVotingEngine votingEngine = targets.votingEngine;
        _requireHasRole(
            address(votingEngine),
            votingEngine.DEFAULT_ADMIN_ROLE(),
            targets.governance,
            "RoundVotingEngine governance default admin"
        );
        _requireHasRole(
            address(votingEngine), votingEngine.PAUSER_ROLE(), targets.governance, "RoundVotingEngine governance pauser"
        );
        _requireProxyAdminOwner(address(votingEngine), targets.governance, "RoundVotingEngine proxy admin owner");
    }

    function _verifyProductionProtocolConfigRoles(ProductionDeploymentRoleVerification memory targets) internal view {
        ProtocolConfig protocolConfig = targets.protocolConfig;
        _requireHasRole(
            address(protocolConfig),
            protocolConfig.DEFAULT_ADMIN_ROLE(),
            targets.governance,
            "ProtocolConfig governance default admin"
        );
        _requireHasRole(
            address(protocolConfig),
            protocolConfig.CONFIG_ROLE(),
            targets.governance,
            "ProtocolConfig governance config"
        );
        _requireHasRole(
            address(protocolConfig),
            protocolConfig.TREASURY_ROLE(),
            targets.governance,
            "ProtocolConfig governance treasury"
        );
        _requireHasRole(
            address(protocolConfig),
            protocolConfig.TREASURY_ADMIN_ROLE(),
            targets.governance,
            "ProtocolConfig governance treasury admin"
        );
        _requireLacksRole(
            address(protocolConfig),
            protocolConfig.CONFIG_ROLE(),
            targets.deployerAddress,
            "ProtocolConfig deployer config"
        );
        _requireLacksRole(
            address(protocolConfig),
            protocolConfig.TREASURY_ROLE(),
            targets.deployerAddress,
            "ProtocolConfig deployer treasury"
        );
        _requireProxyAdminOwner(address(protocolConfig), targets.governance, "ProtocolConfig proxy admin owner");
    }

    function _verifyProductionRewardDistributorRoles(ProductionDeploymentRoleVerification memory targets)
        internal
        view
    {
        RoundRewardDistributor rewardDistributor = targets.rewardDistributor;
        _requireHasRole(
            address(rewardDistributor),
            rewardDistributor.DEFAULT_ADMIN_ROLE(),
            targets.governance,
            "RoundRewardDistributor governance default admin"
        );
        _requireProxyAdminOwner(
            address(rewardDistributor), targets.governance, "RoundRewardDistributor proxy admin owner"
        );
    }

    function _verifyProductionQuestionEscrowRoles(ProductionDeploymentRoleVerification memory targets) internal view {
        QuestionRewardPoolEscrow questionRewardPoolEscrow = targets.questionRewardPoolEscrow;
        _requireHasRole(
            address(questionRewardPoolEscrow),
            questionRewardPoolEscrow.DEFAULT_ADMIN_ROLE(),
            targets.governance,
            "QuestionRewardPoolEscrow governance default admin"
        );
        _requireHasRole(
            address(questionRewardPoolEscrow),
            QUESTION_ESCROW_CONFIG_ROLE,
            targets.governance,
            "QuestionRewardPoolEscrow governance config"
        );
        _requireHasRole(
            address(questionRewardPoolEscrow),
            QUESTION_ESCROW_PAUSER_ROLE,
            targets.governance,
            "QuestionRewardPoolEscrow governance pauser"
        );
        _requireProxyAdminOwner(
            address(questionRewardPoolEscrow), targets.governance, "QuestionRewardPoolEscrow proxy admin owner"
        );
    }

    function _verifyProductionFeedbackEscrowRoles(ProductionDeploymentRoleVerification memory targets) internal view {
        FeedbackBonusEscrow feedbackBonusEscrow = targets.feedbackBonusEscrow;
        _requireHasRole(
            address(feedbackBonusEscrow),
            feedbackBonusEscrow.DEFAULT_ADMIN_ROLE(),
            targets.governance,
            "FeedbackBonusEscrow governance default admin"
        );
        _requireHasRole(
            address(feedbackBonusEscrow),
            feedbackBonusEscrow.CONFIG_ROLE(),
            targets.governance,
            "FeedbackBonusEscrow governance config"
        );
        _requireHasRole(
            address(feedbackBonusEscrow),
            feedbackBonusEscrow.PAUSER_ROLE(),
            targets.governance,
            "FeedbackBonusEscrow governance pauser"
        );
        _requireProxyAdminOwner(
            address(feedbackBonusEscrow), targets.governance, "FeedbackBonusEscrow proxy admin owner"
        );
    }

    function _verifyProductionUserRegistryRoles(ProductionDeploymentRoleVerification memory targets) internal view {
        FrontendRegistry frontendRegistry = targets.frontendRegistry;
        _requireHasRole(
            address(frontendRegistry),
            frontendRegistry.DEFAULT_ADMIN_ROLE(),
            targets.governance,
            "FrontendRegistry governance default admin"
        );
        _requireHasRole(
            address(frontendRegistry),
            frontendRegistry.ADMIN_ROLE(),
            targets.governance,
            "FrontendRegistry governance admin"
        );
        _requireHasRole(
            address(frontendRegistry),
            frontendRegistry.GOVERNANCE_ROLE(),
            targets.governance,
            "FrontendRegistry governance governance-role"
        );
        _requireHasRole(
            address(frontendRegistry),
            frontendRegistry.FEE_CREDITOR_ROLE(),
            address(targets.rewardDistributor),
            "FrontendRegistry reward distributor fee creditor"
        );
        _requireLacksRole(
            address(frontendRegistry),
            frontendRegistry.ADMIN_ROLE(),
            targets.deployerAddress,
            "FrontendRegistry deployer admin"
        );
        _requireProxyAdminOwner(address(frontendRegistry), targets.governance, "FrontendRegistry proxy admin owner");

        ProfileRegistry profileRegistry = targets.profileRegistry;
        _requireHasRole(
            address(profileRegistry),
            profileRegistry.DEFAULT_ADMIN_ROLE(),
            targets.governance,
            "ProfileRegistry governance default admin"
        );
        _requireHasRole(
            address(profileRegistry),
            profileRegistry.ADMIN_ROLE(),
            targets.governance,
            "ProfileRegistry governance admin"
        );
        _requireLacksRole(
            address(profileRegistry),
            profileRegistry.ADMIN_ROLE(),
            targets.deployerAddress,
            "ProfileRegistry deployer admin"
        );
        _requireProxyAdminOwner(address(profileRegistry), targets.governance, "ProfileRegistry proxy admin owner");

        CategoryRegistry categoryRegistry = targets.categoryRegistry;
        _requireHasRole(
            address(categoryRegistry),
            categoryRegistry.DEFAULT_ADMIN_ROLE(),
            targets.governance,
            "CategoryRegistry governance default admin"
        );
        _requireHasRole(
            address(categoryRegistry),
            categoryRegistry.ADMIN_ROLE(),
            targets.governance,
            "CategoryRegistry governance admin"
        );
        _requireLacksRole(
            address(categoryRegistry),
            categoryRegistry.ADMIN_ROLE(),
            targets.deployerAddress,
            "CategoryRegistry deployer admin"
        );
    }

    function _verifyProductionCoreWiring(ProductionDeploymentRoleVerification memory targets) internal view {
        _require(targets.hrepToken.governor() == targets.governorAddr, "HREP governor");
        _require(targets.hrepToken.votingEngine() == address(targets.votingEngine), "HREP voting engine");
        _require(targets.hrepToken.contentRegistry() == address(targets.registry), "HREP content registry");
        _require(
            address(targets.rewardDistributor.hrepToken()) == address(targets.hrepToken),
            "RoundRewardDistributor HREP token"
        );
        _require(
            address(targets.rewardDistributor.votingEngine()) == address(targets.votingEngine),
            "RoundRewardDistributor voting engine"
        );
        _require(
            address(targets.rewardDistributor.registry()) == address(targets.registry),
            "RoundRewardDistributor registry"
        );
        _require(
            address(targets.votingEngine.protocolConfig()) == address(targets.protocolConfig),
            "RoundVotingEngine protocol config"
        );
        _require(
            targets.protocolConfig.rewardDistributor() == address(targets.rewardDistributor),
            "ProtocolConfig reward distributor"
        );
        _require(
            targets.protocolConfig.frontendRegistry() == address(targets.frontendRegistry),
            "ProtocolConfig frontend registry"
        );
        _require(
            targets.protocolConfig.categoryRegistry() == address(targets.categoryRegistry),
            "ProtocolConfig category registry"
        );
        _require(
            targets.protocolConfig.participationPool() == address(targets.participationPool),
            "ProtocolConfig participation pool"
        );
        _require(targets.protocolConfig.voterIdNFT() == address(targets.voterIdNFT), "ProtocolConfig voterIdNFT");
        _require(targets.protocolConfig.treasury() == targets.governance, "ProtocolConfig treasury");
        _require(address(targets.registry.hrepToken()) == address(targets.hrepToken), "ContentRegistry HREP token");
        _require(targets.registry.votingEngine() == address(targets.votingEngine), "ContentRegistry voting engine");
        _require(
            address(targets.registry.categoryRegistry()) == address(targets.categoryRegistry),
            "ContentRegistry category registry"
        );
        _require(
            address(targets.registry.protocolConfig()) == address(targets.protocolConfig),
            "ContentRegistry protocol config"
        );
        _require(
            targets.registry.questionRewardPoolEscrow() == address(targets.questionRewardPoolEscrow),
            "ContentRegistry question reward pool escrow"
        );
        _require(address(targets.registry.voterIdNFT()) == address(targets.voterIdNFT), "ContentRegistry voterIdNFT");
        _require(targets.registry.treasury() == targets.governance, "ContentRegistry treasury");
        _require(targets.registry.bonusPool() == targets.governance, "ContentRegistry bonus pool");
        _require(
            address(targets.frontendRegistry.hrepToken()) == address(targets.hrepToken), "FrontendRegistry HREP token"
        );
        _require(
            address(targets.frontendRegistry.votingEngine()) == address(targets.votingEngine),
            "FrontendRegistry voting engine"
        );
        _require(
            address(targets.frontendRegistry.voterIdNFT()) == address(targets.voterIdNFT), "FrontendRegistry voterIdNFT"
        );
        _require(
            address(targets.profileRegistry.voterIdNFT()) == address(targets.voterIdNFT), "ProfileRegistry voterIdNFT"
        );
    }

    function _verifyProductionEscrowWiring(ProductionDeploymentRoleVerification memory targets) internal view {
        _require(
            address(targets.questionRewardPoolEscrow.hrepToken()) == address(targets.hrepToken),
            "QuestionRewardPoolEscrow HREP"
        );
        _require(
            address(targets.questionRewardPoolEscrow.voterIdNFT()) == address(targets.voterIdNFT),
            "QuestionRewardPoolEscrow voterIdNFT"
        );
        _require(
            address(targets.questionRewardPoolEscrow.registry()) == address(targets.registry),
            "QuestionRewardPoolEscrow registry"
        );
        _require(
            address(targets.questionRewardPoolEscrow.votingEngine()) == address(targets.votingEngine),
            "QuestionRewardPoolEscrow voting engine"
        );
        _require(
            address(targets.questionRewardPoolEscrow.usdcToken()) == _resolveCeloUsdcAddress(),
            "QuestionRewardPoolEscrow USDC"
        );
        _require(
            address(targets.feedbackBonusEscrow.voterIdNFT()) == address(targets.voterIdNFT),
            "FeedbackBonusEscrow voterIdNFT"
        );
        _require(
            address(targets.feedbackBonusEscrow.registry()) == address(targets.registry), "FeedbackBonusEscrow registry"
        );
        _require(
            address(targets.feedbackBonusEscrow.votingEngine()) == address(targets.votingEngine),
            "FeedbackBonusEscrow voting engine"
        );
        _require(
            address(targets.feedbackBonusEscrow.usdcToken()) == _resolveCeloUsdcAddress(), "FeedbackBonusEscrow USDC"
        );
    }

    function _verifyProductionParticipationAndFaucetWiring(ProductionDeploymentRoleVerification memory targets)
        internal
        view
    {
        _require(targets.voterIdNFT.owner() == targets.governance, "VoterIdNFT governance owner");
        _require(targets.voterIdNFT.governance() == targets.governance, "VoterIdNFT governance");
        _require(targets.voterIdNFT.stakeRecorder() == address(targets.votingEngine), "VoterIdNFT stake recorder");
        _require(targets.participationPool.owner() == targets.governance, "ParticipationPool governance owner");
        _require(
            address(targets.participationPool.hrepToken()) == address(targets.hrepToken), "ParticipationPool HREP token"
        );
        _require(targets.participationPool.governance() == targets.governance, "ParticipationPool governance");
        _require(
            targets.participationPool.authorizedCallers(address(targets.rewardDistributor)),
            "ParticipationPool reward distributor authorized"
        );
        if (address(targets.humanFaucet) != address(0)) {
            _require(
                targets.voterIdNFT.authorizedMinters(address(targets.humanFaucet)), "VoterIdNFT HumanFaucet minter"
            );
            _require(address(targets.humanFaucet.hrepToken()) == address(targets.hrepToken), "HumanFaucet HREP token");
            _require(address(targets.humanFaucet.voterIdNFT()) == address(targets.voterIdNFT), "HumanFaucet voterIdNFT");
            _require(targets.humanFaucet.governance() == targets.governance, "HumanFaucet governance");
            _require(targets.humanFaucet.owner() == targets.governance, "HumanFaucet governance owner");
            _require(targets.humanFaucet.migrationBootstrapClosed(), "HumanFaucet migration bootstrap closed");
            _require(targets.humanFaucet.paused(), "HumanFaucet production claim pause");
        }
    }

    function _verifyProductionGovernorAndTimelock(ProductionDeploymentRoleVerification memory targets) internal view {
        _require(targets.governorAddr != address(0), "Governor deployed");
        CuryoGovernor governor = CuryoGovernor(payable(targets.governorAddr));
        _require(address(governor.hrepToken()) == address(targets.hrepToken), "Governor HREP token");
        _require(governor.timelock() == targets.governance, "Governor timelock");
        _require(governor.poolsInitialized(), "Governor pools initialized");
        _assertExactExcludedHolders(governor, _buildProductionQuorumExcludedHolders(targets));

        TimelockController timelock = TimelockController(payable(targets.governance));
        _requireHasRole(address(timelock), timelock.DEFAULT_ADMIN_ROLE(), address(timelock), "Timelock self admin");
        _requireHasRole(address(timelock), timelock.PROPOSER_ROLE(), targets.governorAddr, "Timelock governor proposer");
        _requireHasRole(
            address(timelock), timelock.CANCELLER_ROLE(), targets.governorAddr, "Timelock governor canceller"
        );
        _requireHasRole(address(timelock), timelock.EXECUTOR_ROLE(), address(0), "Timelock open executor");
        _requireLacksRole(
            address(timelock), timelock.PROPOSER_ROLE(), targets.deployerAddress, "Timelock deployer proposer"
        );
        _requireLacksRole(
            address(timelock), timelock.CANCELLER_ROLE(), targets.deployerAddress, "Timelock deployer canceller"
        );
        _requireLacksRole(
            address(timelock), timelock.DEFAULT_ADMIN_ROLE(), targets.deployerAddress, "Timelock deployer default admin"
        );
    }

    function _buildProductionQuorumExcludedHolders(ProductionDeploymentRoleVerification memory targets)
        internal
        pure
        returns (address[] memory)
    {
        return _buildQuorumExcludedHolders(
            address(targets.humanFaucet),
            address(targets.participationPool),
            address(targets.rewardDistributor),
            address(targets.votingEngine),
            targets.governance,
            address(targets.registry),
            address(targets.frontendRegistry)
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
        address frontendRegistry
    ) internal pure returns (address[] memory holders) {
        address[] memory temp = new address[](7);
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
        registry.addCategory("Products", "products", productSubcats);

        string[] memory placesTravelSubcats = new string[](13);
        placesTravelSubcats[0] = "Restaurants";
        placesTravelSubcats[1] = "Cafes";
        placesTravelSubcats[2] = "Nightlife";
        placesTravelSubcats[3] = "Hotels";
        placesTravelSubcats[4] = "Attractions";
        placesTravelSubcats[5] = "Itineraries";
        placesTravelSubcats[6] = "Service";
        placesTravelSubcats[7] = "Atmosphere";
        placesTravelSubcats[8] = "Accessibility";
        placesTravelSubcats[9] = "Value";
        placesTravelSubcats[10] = "Local Tips";
        placesTravelSubcats[11] = "Family";
        placesTravelSubcats[12] = "Solo Travel";
        registry.addCategory("Places & Travel", "places-travel", placesTravelSubcats);

        string[] memory softwareSubcats = new string[](12);
        softwareSubcats[0] = "Web Apps";
        softwareSubcats[1] = "Mobile Apps";
        softwareSubcats[2] = "Developer Tools";
        softwareSubcats[3] = "Repos";
        softwareSubcats[4] = "Libraries";
        softwareSubcats[5] = "APIs";
        softwareSubcats[6] = "Smart Contracts";
        softwareSubcats[7] = "Productivity";
        softwareSubcats[8] = "Onboarding";
        softwareSubcats[9] = "Performance";
        softwareSubcats[10] = "Trust";
        softwareSubcats[11] = "Pricing";
        registry.addCategory("Software", "software", softwareSubcats);

        string[] memory mediaSubcats = new string[](8);
        mediaSubcats[0] = "Images";
        mediaSubcats[1] = "YouTube";
        mediaSubcats[2] = "Education";
        mediaSubcats[3] = "Entertainment";
        mediaSubcats[4] = "Art";
        mediaSubcats[5] = "Photography";
        mediaSubcats[6] = "Audio";
        mediaSubcats[7] = "Culture";
        registry.addCategory("Media", "media", mediaSubcats);

        string[] memory designSubcats = new string[](8);
        designSubcats[0] = "Visual Design";
        designSubcats[1] = "Brand";
        designSubcats[2] = "Typography";
        designSubcats[3] = "Layout";
        designSubcats[4] = "Accessibility";
        designSubcats[5] = "Photography";
        designSubcats[6] = "Fashion";
        designSubcats[7] = "Architecture";
        registry.addCategory("Design", "design", designSubcats);

        string[] memory aiAnswerSubcats = new string[](8);
        aiAnswerSubcats[0] = "Helpfulness";
        aiAnswerSubcats[1] = "Clarity";
        aiAnswerSubcats[2] = "Safety";
        aiAnswerSubcats[3] = "Creativity";
        aiAnswerSubcats[4] = "Reasoning";
        aiAnswerSubcats[5] = "Code";
        aiAnswerSubcats[6] = "Images";
        aiAnswerSubcats[7] = "Research";
        registry.addCategory("AI Answers", "ai-answers", aiAnswerSubcats);

        string[] memory textSubcats = new string[](13);
        textSubcats[0] = "Developer Docs";
        textSubcats[1] = "Getting Started";
        textSubcats[2] = "API Reference";
        textSubcats[3] = "Tutorials";
        textSubcats[4] = "Articles";
        textSubcats[5] = "Research";
        textSubcats[6] = "Policy";
        textSubcats[7] = "Copywriting";
        textSubcats[8] = "Accuracy";
        textSubcats[9] = "Completeness";
        textSubcats[10] = "Readability";
        textSubcats[11] = "Troubleshooting";
        textSubcats[12] = "Examples";
        registry.addCategory("Text", "text", textSubcats);

        string[] memory safetySubcats = new string[](8);
        safetySubcats[0] = "Trust";
        safetySubcats[1] = "Spam";
        safetySubcats[2] = "Harassment";
        safetySubcats[3] = "Moderation";
        safetySubcats[4] = "Privacy";
        safetySubcats[5] = "Disclosure";
        safetySubcats[6] = "Risk";
        safetySubcats[7] = "Policy";
        registry.addCategory("Trust", "trust", safetySubcats);

        string[] memory opinionSubcats = new string[](8);
        opinionSubcats[0] = "Taste";
        opinionSubcats[1] = "Usefulness";
        opinionSubcats[2] = "Interesting";
        opinionSubcats[3] = "Clear";
        opinionSubcats[4] = "Fun";
        opinionSubcats[5] = "Convincing";
        opinionSubcats[6] = "Worthwhile";
        opinionSubcats[7] = "Other";
        registry.addCategory("General", "general", opinionSubcats);
    }
}
