// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ScaffoldETHDeploy } from "./DeployHelpers.s.sol";
import { console } from "forge-std/console.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IVotes } from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { CategoryRegistry } from "../contracts/CategoryRegistry.sol";
import { ProfileRegistry } from "../contracts/ProfileRegistry.sol";
import { VoterIdNFT } from "../contracts/VoterIdNFT.sol";
import { CuryoGovernor } from "../contracts/governance/CuryoGovernor.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";
import { HumanFaucet } from "../contracts/HumanFaucet.sol";
import { MockIdentityVerificationHub } from "../contracts/mocks/MockIdentityVerificationHub.sol";
import { IIdentityVerificationHubV2 } from "@selfxyz/contracts/contracts/interfaces/IIdentityVerificationHubV2.sol";
import { SelfStructs } from "@selfxyz/contracts/contracts/libraries/SelfStructs.sol";

/// @notice Deploy script for all Curyo contracts with UUPS proxies.
/// @dev All protocol operations use cREP token only (no stablecoins).
///      Local dev: deployer is governance (all roles go to deployer).
///      Production: TimelockController + CuryoGovernor are deployed, timelock gets all permanent roles.
contract DeployCuryo is ScaffoldETHDeploy {
    // Timelock delay: 2 days for standard operations
    uint256 public constant TIMELOCK_MIN_DELAY = 2 days;

    // Self.xyz IdentityVerificationHub addresses
    address constant CELO_MAINNET_HUB = 0xe57F4773bd9c9d8b6Cd70431117d353298B9f5BF;
    address constant CELO_SEPOLIA_HUB = 0x16ECBA51e18a4a7e61fdC417f0d47AFEeDfbed74;

    function run() external ScaffoldEthDeployerRunner {
        // Detect local dev: anvil/hardhat chain IDs
        bool isLocalDev = block.chainid == 31337;

        // --- Determine governance address ---
        // Local dev: deployer serves as governance
        // Production: deploy TimelockController + CuryoGovernor
        address governance;
        address governorAddr;

        if (isLocalDev) {
            governance = deployer;
            governorAddr = deployer;
            console.log("Local dev: deployer is governance");
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
        }

        // 2. Deploy CuryoReputation (non-upgradeable governance token)
        CuryoReputation crepToken = new CuryoReputation(deployer, governance);
        console.log("CuryoReputation deployed at:", address(crepToken));

        // 3. Deploy CuryoGovernor (production only)
        //    Pool addresses are set later via initializePools() after pools are deployed.
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

        // 5. Deploy proxies with initialization (governance gets all permanent roles)

        // FrontendRegistry proxy
        ERC1967Proxy frontendRegistryProxy = new ERC1967Proxy(
            address(frontendRegistryImpl),
            abi.encodeCall(FrontendRegistry.initialize, (deployer, governance, address(crepToken)))
        );
        FrontendRegistry frontendRegistry = FrontendRegistry(address(frontendRegistryProxy));

        // ProfileRegistry proxy
        ERC1967Proxy profileRegistryProxy = new ERC1967Proxy(
            address(profileRegistryImpl), abi.encodeCall(ProfileRegistry.initialize, (deployer, governance))
        );
        ProfileRegistry profileRegistry = ProfileRegistry(address(profileRegistryProxy));

        // ContentRegistry proxy
        ERC1967Proxy registryProxy = new ERC1967Proxy(
            address(registryImpl),
            abi.encodeCall(ContentRegistry.initialize, (deployer, governance, address(crepToken)))
        );
        ContentRegistry registry = ContentRegistry(address(registryProxy));

        // RoundVotingEngine proxy
        ERC1967Proxy votingEngineProxy = new ERC1967Proxy(
            address(votingEngineImpl),
            abi.encodeCall(RoundVotingEngine.initialize, (deployer, governance, address(crepToken), address(registry)))
        );
        RoundVotingEngine votingEngine = RoundVotingEngine(address(votingEngineProxy));

        // RoundRewardDistributor proxy (no admin needed — all deps at init)
        ERC1967Proxy rewardDistributorProxy = new ERC1967Proxy(
            address(rewardDistributorImpl),
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

        // 7. Deploy VoterIdNFT (soulbound identity for verified humans)
        VoterIdNFT voterIdNFT = new VoterIdNFT(deployer, governance);
        voterIdNFT.setStakeRecorder(address(votingEngine));

        // 8. Wire contracts together (deployer uses temporary CONFIG_ROLE/ADMIN_ROLE)
        registry.setVotingEngine(address(votingEngine));
        registry.setCategoryRegistry(address(categoryRegistry));
        votingEngine.setRewardDistributor(address(rewardDistributor));
        votingEngine.setFrontendRegistry(address(frontendRegistry));
        votingEngine.setCategoryRegistry(address(categoryRegistry));

        // Wire VoterIdNFT to all contracts
        votingEngine.setVoterIdNFT(address(voterIdNFT));
        registry.setVoterIdNFT(address(voterIdNFT));
        categoryRegistry.setVoterIdNFT(address(voterIdNFT));
        frontendRegistry.setVoterIdNFT(address(voterIdNFT));
        profileRegistry.setVoterIdNFT(address(voterIdNFT));

        // Wire FrontendRegistry to VotingEngine for slashing
        frontendRegistry.setVotingEngine(address(votingEngine));
        frontendRegistry.addFeeCreditor(address(votingEngine));

        // 9. Seed initial categories
        _seedCategories(categoryRegistry);

        // 10. Set content voting contracts on token (for governance lock bypass)
        crepToken.setContentVotingContracts(address(votingEngine), address(registry));

        // 11. Set treasury, bonus pool, and configure round parameters
        registry.setBonusPool(address(rewardDistributor));
        registry.setTreasury(governance);
        votingEngine.setTreasury(governance);
        votingEngine.setConfig(20 minutes, 7 days, 3, 1000); // epochDuration, maxDuration, minVoters, maxVoters
        votingEngine.setKeeperReward(0.1e6); // 0.1 cREP per keeper operation

        // 12. Fund consensus reserve (pre-funded reserve for unanimous round rewards)
        uint256 consensusPoolAmount = 4_000_000 * 1e6; // 4M cREP
        // Local dev: deployer has DEFAULT_ADMIN_ROLE and needs to grant MINTER_ROLE
        // Production: deployer already has MINTER_ROLE from constructor
        if (isLocalDev) {
            crepToken.grantRole(crepToken.MINTER_ROLE(), deployer);
        }
        crepToken.mint(deployer, consensusPoolAmount);
        crepToken.approve(address(votingEngine), consensusPoolAmount);
        votingEngine.fundConsensusReserve(consensusPoolAmount);
        console.log("Funded 4M cREP to consensus reserve");

        // 12a. Fund keeper reward pool (dedicated pool so keeper rewards don't drain user stakes)
        uint256 keeperPoolAmount = 100_000 * 1e6; // 100K cREP
        crepToken.mint(deployer, keeperPoolAmount);
        crepToken.approve(address(votingEngine), keeperPoolAmount);
        votingEngine.fundKeeperRewardPool(keeperPoolAmount);
        console.log("Funded 100K cREP to keeper reward pool");

        // Fund CategoryRegistry so it meets the governor's proposal threshold (100 cREP).
        // The contract self-delegates in its constructor, so minting cREP gives it voting power.
        // Governor checks votes at clock()-1, so this must happen before any submitCategory call.
        uint256 proposalThreshold = 100 * 1e6;
        crepToken.mint(address(categoryRegistry), proposalThreshold);
        console.log("Funded 100 cREP to CategoryRegistry for governance proposals");

        // 12a. Fund treasury (10M cREP to governance timelock)
        uint256 treasuryAmount = 10_000_000 * 1e6; // 10M cREP
        crepToken.mint(governance, treasuryAmount);
        console.log("Minted 10M cREP to treasury (governance)");

        // 12b. Deploy and fund ParticipationPool (34M cREP)
        ParticipationPool participationPool = new ParticipationPool(address(crepToken), governance);
        participationPool.setAuthorizedCaller(address(votingEngine), true);
        participationPool.setAuthorizedCaller(address(registry), true);
        uint256 participationAmount = 34_000_000 * 1e6; // 34M cREP
        crepToken.mint(deployer, participationAmount);
        crepToken.approve(address(participationPool), participationAmount);
        participationPool.depositPool(participationAmount);
        votingEngine.setParticipationPool(address(participationPool));
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
                // 52M baseline faucet allocation minus 100k keeper pool and minus 100 cREP CategoryRegistry reserve.
                uint256 faucetAmount = 51_899_900 * 1e6;
                crepToken.mint(address(humanFaucet), faucetAmount);
                console.log("Minted 51,899,900 cREP to HumanFaucet");

                // Set verification config
                if (!isFaucetMock) {
                    SelfStructs.VerificationConfigV2 memory config = SelfStructs.VerificationConfigV2({
                        olderThanEnabled: false,
                        olderThan: 0,
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

        // 12d. Initialize Governor pool addresses for dynamic quorum (production only)
        if (!isLocalDev) {
            CuryoGovernor(payable(governorAddr))
                .initializePools(address(humanFaucet), address(participationPool), address(rewardDistributor));
            console.log("Governor pool addresses initialized for dynamic quorum");
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

            // Renounce CONFIG_ROLE on protocol contracts
            registry.renounceRole(registry.CONFIG_ROLE(), deployer);
            votingEngine.renounceRole(votingEngine.CONFIG_ROLE(), deployer);

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
        console.log("RoundRewardDistributor:", address(rewardDistributor));
        console.log("CategoryRegistry:", address(categoryRegistry));
        console.log("VoterIdNFT:", address(voterIdNFT));
        console.log("ParticipationPool:", address(participationPool));
        if (address(humanFaucet) != address(0)) {
            console.log("HumanFaucet:", address(humanFaucet));
        }
        console.log("Governance:", governance);
        if (!isLocalDev) {
            console.log("CuryoGovernor:", governorAddr);
        }
        console.log("Seeded categories:", categoryRegistry.approvedCategoryCount());
        console.log("Local dev:", isLocalDev);
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
        registry.addApprovedCategory(
            "YouTube",
            "youtube.com",
            youtubeSubcats,
            "Is this video entertaining or informative enough to score above {rating} out of 100?"
        );

        // Twitch (categoryId: 2)
        string[] memory twitchSubcats = new string[](5);
        twitchSubcats[0] = "Gaming";
        twitchSubcats[1] = "Music";
        twitchSubcats[2] = "Talk Shows";
        twitchSubcats[3] = "Sports";
        twitchSubcats[4] = "Creative";
        registry.addApprovedCategory(
            "Twitch", "twitch.tv", twitchSubcats, "Is this stream engaging enough to score above {rating} out of 100?"
        );

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
        registry.addApprovedCategory(
            "Magic: The Gathering",
            "scryfall.com",
            mtgSubcats,
            "Is this card powerful or iconic enough to score above {rating} out of 100?"
        );

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
        registry.addApprovedCategory(
            "Movies", "themoviedb.org", movieSubcats, "Is this movie good enough to score above {rating} out of 100?"
        );

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
        registry.addApprovedCategory(
            "People",
            "en.wikipedia.org",
            peopleSubcats,
            "Is this person's influence and impact above {rating} out of 100?"
        );

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
        registry.addApprovedCategory(
            "Games", "rawg.io", gameSubcats, "Is this game fun and polished enough to score above {rating} out of 100?"
        );

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
        registry.addApprovedCategory(
            "Books",
            "openlibrary.org",
            bookSubcats,
            "Is this book worth reading enough to score above {rating} out of 100?"
        );

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
        registry.addApprovedCategory(
            "AI",
            "huggingface.co",
            aiSubcats,
            "Is this AI model useful and capable enough to score above {rating} out of 100?"
        );

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
        registry.addApprovedCategory(
            "Crypto Tokens",
            "coingecko.com",
            cryptoSubcats,
            "Are this token's fundamentals strong enough to score above {rating} out of 100?"
        );

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
        registry.addApprovedCategory(
            "Tweets",
            "x.com",
            tweetSubcats,
            "Is this tweet insightful or impactful enough to score above {rating} out of 100?"
        );

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
        registry.addApprovedCategory(
            "GitHub Repos",
            "github.com",
            githubSubcats,
            "Is this repository worth adopting or recommending enough to score above {rating} out of 100?"
        );
    }
}
