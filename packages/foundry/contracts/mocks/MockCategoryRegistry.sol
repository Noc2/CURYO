// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ICategoryRegistry } from "../interfaces/ICategoryRegistry.sol";

contract MockCategoryRegistry is ICategoryRegistry {
    mapping(uint256 => bool) public categoryExists;
    mapping(uint256 => string) public slugs;
    mapping(bytes32 => uint256) public slugToId;

    function seedCategory(uint256 id, string memory slug) external {
        setSlug(id, slug);
        setCategoryExists(id, true);
    }

    function seedDefaultTestCategories() external {
        string[24] memory defaultSlugs = [
            "example.com",
            "batch-test-1.com",
            "batch-test-2.com",
            "batch-test-3.com",
            "batch-test-4.com",
            "consensus-test.com",
            "cooldown-test-1.com",
            "cooldown-test-2.com",
            "full-claim-test.com",
            "pause-test-1.com",
            "pause-test-2.com",
            "pause-test-3.com",
            "pause-test-4.com",
            "pause-test-5.com",
            "pause-test-6.com",
            "solvency-test.com",
            "unpause-test.com",
            "youtube.com",
            "x.com",
            "github.com",
            "themoviedb.org",
            "en.wikipedia.org",
            "rawg.io",
            "openlibrary.org"
        ];

        for (uint256 i = 0; i < defaultSlugs.length; i++) {
            uint256 categoryId = i + 1;
            setSlug(categoryId, defaultSlugs[i]);
            setCategoryExists(categoryId, true);
        }

        setSlug(25, "huggingface.co");
        setCategoryExists(25, true);
        setSlug(26, "coingecko.com");
        setCategoryExists(26, true);
        setSlug(27, "open.spotify.com");
        setCategoryExists(27, true);
        setSlug(28, "scryfall.com");
        setCategoryExists(28, true);
        setSlug(29, "t.co");
        setCategoryExists(29, true);
        setSlug(30, "twitter.com");
        setCategoryExists(30, true);
        setSlug(31, "youtu.be");
        setCategoryExists(31, true);
    }

    function setCategoryExists(uint256 id, bool val) public {
        categoryExists[id] = val;
    }

    function setSlug(uint256 id, string memory slug) public {
        string memory existing = slugs[id];
        if (bytes(existing).length != 0) {
            delete slugToId[keccak256(bytes(existing))];
        }

        string memory normalized = _normalizeSlug(slug);
        slugs[id] = normalized;
        slugToId[keccak256(bytes(normalized))] = id;
    }

    function isCategory(uint256 categoryId) external view override returns (bool) {
        return categoryExists[categoryId];
    }

    function getCategory(uint256 categoryId) external view override returns (Category memory) {
        require(bytes(slugs[categoryId]).length != 0, "Category does not exist");
        return _category(categoryId);
    }

    function getCategoryBySlug(string calldata slug) external view override returns (Category memory) {
        uint256 categoryId = slugToId[keccak256(bytes(_normalizeSlug(slug)))];
        require(categoryId != 0, "Slug not registered");
        return _category(categoryId);
    }

    function getCategoryIdsPaginated(uint256, uint256) external pure override returns (uint256[] memory, uint256) {
        return (new uint256[](0), 0);
    }

    function _category(uint256 categoryId) internal view returns (Category memory) {
        string[] memory subcategories = new string[](0);
        return
            Category({ id: categoryId, name: "", slug: slugs[categoryId], subcategories: subcategories, createdAt: 0 });
    }

    function _normalizeSlug(string memory slug) internal pure returns (string memory) {
        bytes memory b = bytes(slug);
        uint256 startIndex = 0;

        if (b.length >= 8 && b[0] == "h" && b[1] == "t" && b[2] == "t" && b[3] == "p") {
            if (b[4] == "s" && b[5] == ":" && b[6] == "/" && b[7] == "/") {
                startIndex = 8;
            } else if (b[4] == ":" && b[5] == "/" && b[6] == "/") {
                startIndex = 7;
            }
        }

        if (
            b.length >= startIndex + 4 && (b[startIndex] == "w" || b[startIndex] == "W")
                && (b[startIndex + 1] == "w" || b[startIndex + 1] == "W")
                && (b[startIndex + 2] == "w" || b[startIndex + 2] == "W") && b[startIndex + 3] == "."
        ) {
            startIndex += 4;
        }

        if (
            b.length >= startIndex + 2 && b[startIndex + 1] == "."
                && ((b[startIndex] >= 0x61 && b[startIndex] <= 0x7A)
                    || (b[startIndex] >= 0x41 && b[startIndex] <= 0x5A))
        ) {
            bool hasMoreDots = false;
            for (uint256 j = startIndex + 2; j < b.length; j++) {
                if (b[j] == "/" || b[j] == ":" || b[j] == "?" || b[j] == "#") break;
                if (b[j] == ".") {
                    hasMoreDots = true;
                    break;
                }
            }
            if (hasMoreDots) {
                startIndex += 2;
            }
        }

        bytes memory result = new bytes(b.length - startIndex);
        uint256 resultIndex = 0;
        for (uint256 i = startIndex; i < b.length; i++) {
            bytes1 char = b[i];
            if (char == "/" || char == ":" || char == "?" || char == "#") break;
            if (char >= 0x41 && char <= 0x5A) {
                result[resultIndex] = bytes1(uint8(char) + 32);
            } else {
                result[resultIndex] = char;
            }
            resultIndex++;
        }

        if (resultIndex > 0 && result[resultIndex - 1] == ".") {
            resultIndex--;
        }

        bytes memory trimmed = new bytes(resultIndex);
        for (uint256 i = 0; i < resultIndex; i++) {
            trimmed[i] = result[i];
        }
        return _canonicalizeSlugAlias(string(trimmed));
    }

    function _canonicalizeSlugAlias(string memory slug) internal pure returns (string memory) {
        if (_equals(slug, "youtu.be") || _equals(slug, "m.youtube.com")) return "youtube.com";
        if (_equals(slug, "clips.twitch.tv") || _equals(slug, "m.twitch.tv")) return "twitch.tv";
        if (_equals(slug, "twitter.com") || _equals(slug, "mobile.twitter.com")) return "x.com";
        return slug;
    }

    function _equals(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
