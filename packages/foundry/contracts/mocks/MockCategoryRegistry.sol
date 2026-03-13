// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ICategoryRegistry } from "../interfaces/ICategoryRegistry.sol";

contract MockCategoryRegistry is ICategoryRegistry {
    mapping(uint256 => bool) public approved;
    mapping(uint256 => address) public submitters;
    mapping(uint256 => string) public domains;
    mapping(bytes32 => uint256) public domainToId;

    function seedApprovedCategory(uint256 id, string memory domain, address submitter) external {
        setDomain(id, domain);
        setSubmitter(id, submitter);
        setApproved(id, true);
    }

    function seedDefaultTestCategories() external {
        string[24] memory defaultDomains = [
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

        for (uint256 i = 0; i < defaultDomains.length; i++) {
            uint256 categoryId = i + 1;
            setDomain(categoryId, defaultDomains[i]);
            setApproved(categoryId, true);
        }

        setDomain(25, "huggingface.co");
        setApproved(25, true);
        setDomain(26, "coingecko.com");
        setApproved(26, true);
        setDomain(27, "open.spotify.com");
        setApproved(27, true);
        setDomain(28, "scryfall.com");
        setApproved(28, true);
        setDomain(29, "t.co");
        setApproved(29, true);
        setDomain(30, "twitter.com");
        setApproved(30, true);
        setDomain(31, "youtu.be");
        setApproved(31, true);
    }

    function setApproved(uint256 id, bool val) public {
        approved[id] = val;
    }

    function setDomain(uint256 id, string memory domain) public {
        string memory existing = domains[id];
        if (bytes(existing).length != 0) {
            delete domainToId[keccak256(bytes(existing))];
        }

        string memory normalized = _normalizeDomain(domain);
        domains[id] = normalized;
        domainToId[keccak256(bytes(normalized))] = id;
    }

    function setSubmitter(uint256 id, address s) public {
        submitters[id] = s;
    }

    function isApprovedCategory(uint256 categoryId) external view override returns (bool) {
        return approved[categoryId];
    }

    function getCategory(uint256 categoryId) external view override returns (Category memory) {
        require(bytes(domains[categoryId]).length != 0, "Category does not exist");
        return _category(categoryId);
    }

    function getCategoryByDomain(string calldata domain) external view override returns (Category memory) {
        uint256 categoryId = domainToId[keccak256(bytes(_normalizeDomain(domain)))];
        require(categoryId != 0, "Domain not registered");
        return _category(categoryId);
    }

    function getApprovedCategoryIdsPaginated(uint256, uint256) external pure override returns (uint256[] memory, uint256) {
        return (new uint256[](0), 0);
    }

    function isDomainRegistered(string calldata domain) external view override returns (bool) {
        return domainToId[keccak256(bytes(_normalizeDomain(domain)))] != 0;
    }

    function getSubmitter(uint256 categoryId) external view override returns (address) {
        return submitters[categoryId];
    }

    function _category(uint256 categoryId) internal view returns (Category memory) {
        string[] memory subcategories = new string[](0);
        return Category({
            id: categoryId,
            name: "",
            domain: domains[categoryId],
            subcategories: subcategories,
            rankingQuestion: "",
            submitter: submitters[categoryId],
            stakeAmount: 0,
            status: approved[categoryId] ? CategoryStatus.Approved : CategoryStatus.Pending,
            proposalId: 0,
            createdAt: 0
        });
    }

    function _normalizeDomain(string memory domain) internal pure returns (string memory) {
        bytes memory b = bytes(domain);
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
        return _canonicalizeDomainAlias(string(trimmed));
    }

    function _canonicalizeDomainAlias(string memory domain) internal pure returns (string memory) {
        if (_equals(domain, "youtu.be") || _equals(domain, "m.youtube.com")) return "youtube.com";
        if (_equals(domain, "clips.twitch.tv") || _equals(domain, "m.twitch.tv")) return "twitch.tv";
        if (_equals(domain, "twitter.com") || _equals(domain, "mobile.twitter.com")) return "x.com";
        return domain;
    }

    function _equals(string memory a, string memory b) internal pure returns (bool) {
        return keccak256(bytes(a)) == keccak256(bytes(b));
    }
}
