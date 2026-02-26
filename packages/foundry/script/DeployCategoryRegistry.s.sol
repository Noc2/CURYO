// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Script, console } from "forge-std/Script.sol";
import { CategoryRegistry } from "../contracts/CategoryRegistry.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";

/// @title DeployCategoryRegistry
/// @notice Deploys the CategoryRegistry and seeds initial categories
/// @dev Run after governance is deployed. Requires CREP_TOKEN, GOVERNOR, TIMELOCK, TREASURY, CONTENT_REGISTRY
contract DeployCategoryRegistry is Script {
    function run() external {
        // Get deployment parameters from environment
        address admin = vm.envAddress("ADMIN_ADDRESS");
        address crepToken = vm.envAddress("CREP_TOKEN");
        address governor = vm.envAddress("GOVERNOR_ADDRESS");
        address timelock = vm.envAddress("TIMELOCK_ADDRESS");
        address treasury = vm.envAddress("TREASURY_ADDRESS");
        address contentRegistry = vm.envAddress("CONTENT_REGISTRY");

        require(admin != address(0), "ADMIN_ADDRESS not set");
        require(crepToken != address(0), "CREP_TOKEN not set");
        require(governor != address(0), "GOVERNOR_ADDRESS not set");
        require(timelock != address(0), "TIMELOCK_ADDRESS not set");
        require(treasury != address(0), "TREASURY_ADDRESS not set");
        require(contentRegistry != address(0), "CONTENT_REGISTRY not set");

        vm.startBroadcast();

        // 1. Deploy CategoryRegistry
        CategoryRegistry categoryRegistry = new CategoryRegistry(admin, crepToken, governor, timelock, treasury);
        console.log("CategoryRegistry deployed at:", address(categoryRegistry));

        // 2. Seed initial categories
        _seedCategories(categoryRegistry);

        // 3. Configure ContentRegistry to use CategoryRegistry
        ContentRegistry(contentRegistry).setCategoryRegistry(address(categoryRegistry));
        console.log("ContentRegistry configured with CategoryRegistry");

        vm.stopBroadcast();

        // Output deployment summary
        console.log("\n=== CategoryRegistry Deployment Summary ===");
        console.log("CategoryRegistry:", address(categoryRegistry));
        console.log("Seeded categories:", categoryRegistry.approvedCategoryCount());
        console.log("\nNext steps:");
        console.log("1. Delegate voting power to CategoryRegistry for proposal creation");
        console.log("2. Update frontend to use CategoryRegistry");
    }

    function _seedCategories(CategoryRegistry registry) internal {
        // YouTube
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
        console.log("Seeded YouTube category");

        // Twitch
        string[] memory twitchSubcats = new string[](5);
        twitchSubcats[0] = "Gaming";
        twitchSubcats[1] = "Music";
        twitchSubcats[2] = "Talk Shows";
        twitchSubcats[3] = "Sports";
        twitchSubcats[4] = "Creative";

        registry.addApprovedCategory(
            "Twitch", "twitch.tv", twitchSubcats, "Is this stream engaging enough to score above {rating} out of 100?"
        );
        console.log("Seeded Twitch category");

        // People - Wikipedia
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
        console.log("Seeded People category");

        // Games - RAWG
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
        console.log("Seeded Games category");

        // Books - Open Library
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
        console.log("Seeded Books category");

        // AI - Hugging Face
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
        console.log("Seeded AI category");

        // Movies - TMDB
        string[] memory movieSubcats = new string[](8);
        movieSubcats[0] = "Action";
        movieSubcats[1] = "Comedy";
        movieSubcats[2] = "Drama";
        movieSubcats[3] = "Horror";
        movieSubcats[4] = "Sci-Fi";
        movieSubcats[5] = "Documentary";
        movieSubcats[6] = "Animation";
        movieSubcats[7] = "Thriller";

        registry.addApprovedCategory(
            "Movies", "themoviedb.org", movieSubcats, "Is this movie good enough to score above {rating} out of 100?"
        );
        console.log("Seeded Movies category");

        // MTG Cards - Scryfall
        string[] memory mtgSubcats = new string[](8);
        mtgSubcats[0] = "Commander";
        mtgSubcats[1] = "Standard";
        mtgSubcats[2] = "Modern";
        mtgSubcats[3] = "Pioneer";
        mtgSubcats[4] = "Legacy";
        mtgSubcats[5] = "Vintage";
        mtgSubcats[6] = "Draft";
        mtgSubcats[7] = "Pauper";

        registry.addApprovedCategory(
            "MTG Cards",
            "scryfall.com",
            mtgSubcats,
            "Is this card powerful and playable enough to score above {rating} out of 100?"
        );
        console.log("Seeded MTG Cards category");

        // Crypto - CoinGecko
        string[] memory cryptoSubcats = new string[](8);
        cryptoSubcats[0] = "Layer 1";
        cryptoSubcats[1] = "Layer 2";
        cryptoSubcats[2] = "DeFi";
        cryptoSubcats[3] = "NFT";
        cryptoSubcats[4] = "Gaming";
        cryptoSubcats[5] = "Meme";
        cryptoSubcats[6] = "Privacy";
        cryptoSubcats[7] = "Stablecoin";

        registry.addApprovedCategory(
            "Crypto",
            "coingecko.com",
            cryptoSubcats,
            "Is this project valuable and innovative enough to score above {rating} out of 100?"
        );
        console.log("Seeded Crypto category");
    }
}
