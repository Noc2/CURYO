// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { ICategoryRegistry } from "./interfaces/ICategoryRegistry.sol";

/// @title SubmissionCanonicalizer
/// @notice Resolves approved categories and canonical submission keys for submitted URLs.
/// @dev Stateless helper extracted from ContentRegistry to keep ContentRegistry under EIP-170.
contract SubmissionCanonicalizer {
    function resolveSubmissionKey(ICategoryRegistry categoryRegistry, string calldata url, uint256 categoryIdHint)
        external
        view
        returns (bytes32 submissionKey)
    {
        (, submissionKey) = _resolveCategoryAndSubmissionKey(categoryRegistry, url, categoryIdHint);
    }

    function resolveCategoryAndSubmissionKey(
        ICategoryRegistry categoryRegistry,
        string calldata url,
        uint256 categoryIdHint
    ) external view returns (uint256 resolvedCategoryId, bytes32 submissionKey) {
        return _resolveCategoryAndSubmissionKey(categoryRegistry, url, categoryIdHint);
    }

    function _resolveCategoryAndSubmissionKey(
        ICategoryRegistry categoryRegistry,
        string calldata url,
        uint256 categoryIdHint
    ) internal view returns (uint256 resolvedCategoryId, bytes32 submissionKey) {
        ICategoryRegistry.Category memory category = _resolveApprovedCategory(categoryRegistry, url);
        resolvedCategoryId = category.id;
        require(resolvedCategoryId != 0, "Domain not approved");
        require(categoryRegistry.isApprovedCategory(resolvedCategoryId), "Category not approved");
        if (categoryIdHint != 0) {
            require(categoryIdHint == resolvedCategoryId, "Category mismatch");
        }

        submissionKey = _deriveSubmissionKey(url, category.domain);
    }

    function _resolveApprovedCategory(ICategoryRegistry categoryRegistry, string memory url)
        internal
        view
        returns (ICategoryRegistry.Category memory category)
    {
        string memory normalizedHost = _extractNormalizedHost(url);
        string memory canonicalHost = _canonicalizeHost(normalizedHost);
        if (bytes(canonicalHost).length != 0) {
            try categoryRegistry.getCategoryByDomain(canonicalHost) returns (
                ICategoryRegistry.Category memory canonicalCategory
            ) {
                if (canonicalCategory.id != 0) {
                    return canonicalCategory;
                }
            } catch { }
        }

        revert("Domain not approved");
    }

    function _deriveSubmissionKey(string memory url, string memory resolvedDomain) internal pure returns (bytes32) {
        if (_equals(resolvedDomain, "youtube.com")) {
            string memory videoId = _extractYouTubeId(url);
            if (bytes(videoId).length != 0) {
                return keccak256(abi.encodePacked("youtube:", videoId));
            }
        } else if (_equals(resolvedDomain, "twitch.tv")) {
            (string memory kind, string memory twitchId) = _extractTwitchKey(url);
            if (bytes(twitchId).length != 0) {
                return keccak256(abi.encodePacked("twitch:", kind, ":", twitchId));
            }
        } else if (_equals(resolvedDomain, "x.com")) {
            string memory tweetId = _extractTwitterStatusId(url);
            if (bytes(tweetId).length != 0) {
                return keccak256(abi.encodePacked("x:", tweetId));
            }
        } else if (_equals(resolvedDomain, "github.com")) {
            (string memory owner, string memory repo) = _extractGitHubRepo(url);
            if (bytes(owner).length != 0 && bytes(repo).length != 0) {
                return keccak256(abi.encodePacked("github:", owner, "/", repo));
            }
        } else if (_equals(resolvedDomain, "scryfall.com")) {
            (string memory setCode, string memory collectorNumber) = _extractScryfallCard(url);
            if (bytes(setCode).length != 0 && bytes(collectorNumber).length != 0) {
                return keccak256(abi.encodePacked("scryfall:", setCode, "/", collectorNumber));
            }
        } else if (_equals(resolvedDomain, "themoviedb.org")) {
            string memory movieId = _extractTmdbMovieId(url);
            if (bytes(movieId).length != 0) {
                return keccak256(abi.encodePacked("tmdb:", movieId));
            }
        } else if (_equals(resolvedDomain, "en.wikipedia.org")) {
            string memory articleTitle = _extractWikipediaTitle(url);
            if (bytes(articleTitle).length != 0) {
                return keccak256(abi.encodePacked("wikipedia:", articleTitle));
            }
        } else if (_equals(resolvedDomain, "rawg.io")) {
            string memory gameSlug = _extractRawgSlug(url);
            if (bytes(gameSlug).length != 0) {
                return keccak256(abi.encodePacked("rawg:", gameSlug));
            }
        } else if (_equals(resolvedDomain, "openlibrary.org")) {
            (string memory kind, string memory openLibraryId) = _extractOpenLibraryKey(url);
            if (bytes(kind).length != 0 && bytes(openLibraryId).length != 0) {
                return keccak256(abi.encodePacked("openlibrary:", kind, ":", openLibraryId));
            }
        } else if (_equals(resolvedDomain, "huggingface.co")) {
            string memory modelId = _extractHuggingFaceModelId(url);
            if (bytes(modelId).length != 0) {
                return keccak256(abi.encodePacked("huggingface:", modelId));
            }
        } else if (_equals(resolvedDomain, "coingecko.com")) {
            string memory coinSlug = _extractCoinGeckoSlug(url);
            if (bytes(coinSlug).length != 0) {
                return keccak256(abi.encodePacked("coingecko:", coinSlug));
            }
        } else if (_equals(resolvedDomain, "open.spotify.com")) {
            (string memory kind, string memory spotifyId) = _extractSpotifyKey(url);
            if (bytes(kind).length != 0 && bytes(spotifyId).length != 0) {
                return keccak256(abi.encodePacked("spotify:", kind, ":", spotifyId));
            }
        }

        return keccak256(abi.encodePacked("url:", _normalizeGenericUrl(url, resolvedDomain)));
    }

    function _canonicalizeHost(string memory host) internal pure returns (string memory) {
        if (_equals(host, "youtu.be") || _equals(host, "m.youtube.com")) return "youtube.com";
        if (_equals(host, "clips.twitch.tv") || _equals(host, "m.twitch.tv")) return "twitch.tv";
        if (_equals(host, "twitter.com") || _equals(host, "mobile.twitter.com")) return "x.com";
        return host;
    }

    function _extractYouTubeId(string memory url) internal pure returns (string memory) {
        string memory host = _extractNormalizedHost(url);
        if (_equals(host, "youtu.be")) {
            return _getPathSegment(url, 0);
        }

        if (_equals(host, "youtube.com") || _equals(host, "m.youtube.com")) {
            string memory watchPath = _normalizePath(url);
            if (_equals(watchPath, "/watch")) {
                return _getQueryParam(url, "v");
            }

            if (_startsWithString(watchPath, "/embed/")) {
                return _sliceString(watchPath, 7, bytes(watchPath).length);
            }
        }

        return "";
    }

    function _extractTwitchKey(string memory url) internal pure returns (string memory kind, string memory contentId) {
        string memory host = _extractNormalizedHost(url);
        if (_equals(host, "clips.twitch.tv")) {
            contentId = _getPathSegment(url, 0);
            if (bytes(contentId).length != 0) return ("clip", contentId);
        }

        if (_equals(host, "twitch.tv") || _equals(host, "m.twitch.tv")) {
            string memory first = _getPathSegment(url, 0);
            string memory second = _getPathSegment(url, 1);
            string memory third = _getPathSegment(url, 2);

            if (_equals(first, "videos") && bytes(second).length != 0) {
                return ("video", second);
            }

            if (bytes(first).length != 0 && _equals(second, "clip") && bytes(third).length != 0) {
                return ("clip", third);
            }

            if (bytes(first).length != 0 && bytes(second).length == 0) {
                return ("channel", _toLower(first));
            }
        }

        return ("", "");
    }

    function _extractTwitterStatusId(string memory url) internal pure returns (string memory) {
        string memory host = _extractNormalizedHost(url);
        if (
            !_equals(host, "x.com") && !_equals(host, "twitter.com") && !_equals(host, "mobile.twitter.com")
                && !_equals(host, "www.x.com") && !_equals(host, "www.twitter.com")
        ) {
            return "";
        }

        string memory second = _getPathSegment(url, 1);
        if (!_equals(second, "status")) return "";
        return _getPathSegment(url, 2);
    }

    function _extractGitHubRepo(string memory url) internal pure returns (string memory owner, string memory repo) {
        string memory host = _extractNormalizedHost(url);
        if (!_equals(host, "github.com")) return ("", "");

        owner = _toLower(_getPathSegment(url, 0));
        repo = _toLower(_getPathSegment(url, 1));
        if (bytes(owner).length == 0 || bytes(repo).length == 0) return ("", "");

        if (
            _equals(owner, "settings") || _equals(owner, "explore") || _equals(owner, "topics")
                || _equals(owner, "trending") || _equals(owner, "collections") || _equals(owner, "sponsors")
                || _equals(owner, "issues") || _equals(owner, "pulls") || _equals(owner, "marketplace")
                || _equals(owner, "features") || _equals(owner, "enterprise") || _equals(owner, "pricing")
                || _equals(owner, "login") || _equals(owner, "signup") || _equals(owner, "join")
                || _equals(owner, "organizations") || _equals(owner, "notifications") || _equals(owner, "new")
                || _equals(owner, "about") || _equals(owner, "contact") || _equals(owner, "security")
                || _equals(owner, "customer-stories")
        ) {
            return ("", "");
        }
    }

    function _extractScryfallCard(string memory url)
        internal
        pure
        returns (string memory setCode, string memory collectorNumber)
    {
        string memory host = _extractNormalizedHost(url);
        if (!_equals(host, "scryfall.com")) return ("", "");
        if (!_equals(_getPathSegment(url, 0), "card")) return ("", "");

        setCode = _toLower(_getPathSegment(url, 1));
        collectorNumber = _toLower(_getPathSegment(url, 2));
        if (bytes(setCode).length == 0 || bytes(collectorNumber).length == 0) {
            return ("", "");
        }
    }

    function _extractTmdbMovieId(string memory url) internal pure returns (string memory) {
        string memory host = _extractNormalizedHost(url);
        if (!_equals(host, "themoviedb.org")) return "";
        if (!_equals(_getPathSegment(url, 0), "movie")) return "";

        return _extractLeadingDigits(_getPathSegment(url, 1));
    }

    function _extractWikipediaTitle(string memory url) internal pure returns (string memory) {
        string memory host = _extractNormalizedHost(url);
        if (!_equals(host, "en.wikipedia.org")) return "";

        string memory path = _normalizePath(url);
        if (!_startsWithString(path, "/wiki/")) return "";
        return _sliceString(path, 6, bytes(path).length);
    }

    function _extractRawgSlug(string memory url) internal pure returns (string memory) {
        string memory host = _extractNormalizedHost(url);
        if (!_equals(host, "rawg.io")) return "";
        if (!_equals(_getPathSegment(url, 0), "games")) return "";

        return _toLower(_getPathSegment(url, 1));
    }

    function _extractOpenLibraryKey(string memory url) internal pure returns (string memory kind, string memory id) {
        string memory host = _extractNormalizedHost(url);
        if (!_equals(host, "openlibrary.org")) return ("", "");

        kind = _getPathSegment(url, 0);
        id = _toUpper(_getPathSegment(url, 1));

        if (_equals(kind, "works") && _isOpenLibraryId(id, "W")) return (kind, id);
        if (_equals(kind, "books") && _isOpenLibraryId(id, "M")) return (kind, id);
        return ("", "");
    }

    function _extractHuggingFaceModelId(string memory url) internal pure returns (string memory) {
        string memory host = _extractNormalizedHost(url);
        if (!_equals(host, "huggingface.co")) return "";

        string memory owner = _getPathSegment(url, 0);
        string memory model = _getPathSegment(url, 1);
        if (bytes(owner).length == 0 || bytes(model).length == 0) return "";
        if (_isReservedHuggingFaceNamespace(owner)) return "";

        return string(abi.encodePacked(owner, "/", model));
    }

    function _extractCoinGeckoSlug(string memory url) internal pure returns (string memory) {
        string memory host = _extractNormalizedHost(url);
        if (!_equals(host, "coingecko.com")) return "";

        string memory first = _getPathSegment(url, 0);
        string memory second = _getPathSegment(url, 1);
        string memory third = _getPathSegment(url, 2);

        if (_equals(first, "coins") && bytes(second).length != 0) {
            return _toLower(second);
        }

        if (bytes(first).length == 2 && _equals(second, "coins") && bytes(third).length != 0) {
            return _toLower(third);
        }

        return "";
    }

    function _extractSpotifyKey(string memory url) internal pure returns (string memory kind, string memory id) {
        string memory host = _extractNormalizedHost(url);
        if (!_equals(host, "open.spotify.com")) return ("", "");

        uint256 index = 0;
        string memory first = _getPathSegment(url, index);
        if (_startsWithString(first, "intl-")) {
            index++;
            first = _getPathSegment(url, index);
        }

        if (_equals(first, "embed")) {
            index++;
            first = _getPathSegment(url, index);
        }

        if (!_equals(first, "show") && !_equals(first, "episode")) return ("", "");

        kind = first;
        id = _getPathSegment(url, index + 1);
        if (!_isAlphaNumeric(id)) return ("", "");
        return (kind, id);
    }

    function _normalizeGenericUrl(string memory url, string memory resolvedDomain)
        internal
        pure
        returns (string memory)
    {
        string memory path = _normalizePath(url);
        string memory query = _normalizeGenericQuery(url);
        return string(abi.encodePacked("https://", resolvedDomain, path, query));
    }

    function _normalizeGenericQuery(string memory url) internal pure returns (string memory) {
        string memory query = _normalizeQuery(url);
        bytes memory queryBytes = bytes(query);
        if (queryBytes.length <= 1) return "";

        uint256 pairCount = 1;
        for (uint256 i = 1; i < queryBytes.length; i++) {
            if (queryBytes[i] == "&") {
                pairCount++;
            }
        }
        if (pairCount == 1) return query;

        string[] memory pairs = new string[](pairCount);
        uint256 pairStart = 1;
        uint256 pairIndex = 0;
        for (uint256 i = 1; i <= queryBytes.length; i++) {
            if (i == queryBytes.length || queryBytes[i] == "&") {
                pairs[pairIndex] = _sliceBytesToString(queryBytes, pairStart, i);
                pairIndex++;
                pairStart = i + 1;
            }
        }

        // Generic fallback treats query ordering as non-semantic so equivalent URLs
        // cannot bypass duplicate protection by permuting otherwise identical pairs.
        for (uint256 i = 1; i < pairCount; i++) {
            string memory current = pairs[i];
            uint256 j = i;
            while (j > 0 && _stringLessThan(current, pairs[j - 1])) {
                pairs[j] = pairs[j - 1];
                j--;
            }
            pairs[j] = current;
        }

        bytes memory normalized = new bytes(queryBytes.length);
        normalized[0] = "?";
        uint256 cursor = 1;
        for (uint256 i = 0; i < pairCount; i++) {
            bytes memory pairBytes = bytes(pairs[i]);
            for (uint256 j = 0; j < pairBytes.length; j++) {
                normalized[cursor] = pairBytes[j];
                cursor++;
            }
            if (i + 1 < pairCount) {
                normalized[cursor] = "&";
                cursor++;
            }
        }

        return string(normalized);
    }

    function _extractNormalizedHost(string memory url) internal pure returns (string memory) {
        bytes memory urlBytes = bytes(url);
        uint256 start = 8;
        uint256 end = start;
        while (end < urlBytes.length) {
            bytes1 char = urlBytes[end];
            if (char == "/" || char == ":" || char == "?" || char == "#") break;
            end++;
        }

        if (end <= start) return "";

        bytes memory host = new bytes(end - start);
        for (uint256 i = start; i < end; i++) {
            bytes1 char = urlBytes[i];
            if (char >= 0x41 && char <= 0x5A) {
                host[i - start] = bytes1(uint8(char) + 32);
            } else {
                host[i - start] = char;
            }
        }

        uint256 hostStart = 0;
        if (host.length >= 4 && host[0] == "w" && host[1] == "w" && host[2] == "w" && host[3] == ".") {
            hostStart = 4;
        }

        uint256 hostEnd = host.length;
        if (hostEnd > hostStart && host[hostEnd - 1] == ".") {
            hostEnd--;
        }

        return _sliceBytesToString(host, hostStart, hostEnd);
    }

    function _normalizePath(string memory url) internal pure returns (string memory) {
        bytes memory urlBytes = bytes(url);
        uint256 authorityEnd = 8;
        while (authorityEnd < urlBytes.length) {
            bytes1 char = urlBytes[authorityEnd];
            if (char == "/" || char == "?" || char == "#") break;
            authorityEnd++;
        }

        if (authorityEnd >= urlBytes.length || urlBytes[authorityEnd] != "/") {
            return "/";
        }

        uint256 pathEnd = authorityEnd;
        while (pathEnd < urlBytes.length) {
            bytes1 char = urlBytes[pathEnd];
            if (char == "?" || char == "#") break;
            pathEnd++;
        }

        while (pathEnd > authorityEnd + 1 && urlBytes[pathEnd - 1] == "/") {
            pathEnd--;
        }

        return _sliceBytesToString(urlBytes, authorityEnd, pathEnd);
    }

    function _normalizeQuery(string memory url) internal pure returns (string memory) {
        bytes memory urlBytes = bytes(url);
        uint256 queryStart = 0;
        while (queryStart < urlBytes.length && urlBytes[queryStart] != "?") {
            if (urlBytes[queryStart] == "#") return "";
            queryStart++;
        }
        if (queryStart >= urlBytes.length || urlBytes[queryStart] != "?") return "";

        uint256 queryEnd = queryStart + 1;
        while (queryEnd < urlBytes.length && urlBytes[queryEnd] != "#") {
            queryEnd++;
        }

        if (queryEnd == queryStart + 1) return "";
        return string(abi.encodePacked("?", _sliceBytesToString(urlBytes, queryStart + 1, queryEnd)));
    }

    function _getPathSegment(string memory url, uint256 segmentIndex) internal pure returns (string memory) {
        bytes memory pathBytes = bytes(_normalizePath(url));
        if (pathBytes.length <= 1) return "";

        uint256 currentIndex = 0;
        uint256 segmentStart = 1;
        while (segmentStart < pathBytes.length) {
            uint256 segmentEnd = segmentStart;
            while (segmentEnd < pathBytes.length && pathBytes[segmentEnd] != "/") {
                segmentEnd++;
            }

            if (currentIndex == segmentIndex) {
                return _sliceBytesToString(pathBytes, segmentStart, segmentEnd);
            }

            currentIndex++;
            segmentStart = segmentEnd + 1;
        }

        return "";
    }

    function _getQueryParam(string memory url, string memory key) internal pure returns (string memory) {
        bytes memory queryBytes = bytes(_normalizeQuery(url));
        if (queryBytes.length <= 1) return "";

        bytes memory keyBytes = bytes(key);
        uint256 cursor = 1;
        while (cursor < queryBytes.length) {
            uint256 pairEnd = cursor;
            while (pairEnd < queryBytes.length && queryBytes[pairEnd] != "&") {
                pairEnd++;
            }

            uint256 eqIndex = cursor;
            while (eqIndex < pairEnd && queryBytes[eqIndex] != "=") {
                eqIndex++;
            }

            if (eqIndex > cursor && eqIndex - cursor == keyBytes.length) {
                bool matches = true;
                for (uint256 i = 0; i < keyBytes.length; i++) {
                    if (queryBytes[cursor + i] != keyBytes[i]) {
                        matches = false;
                        break;
                    }
                }

                if (matches && eqIndex < pairEnd) {
                    return _sliceBytesToString(queryBytes, eqIndex + 1, pairEnd);
                }
            }

            cursor = pairEnd + 1;
        }

        return "";
    }

    function _startsWithString(string memory value, string memory prefix) internal pure returns (bool) {
        bytes memory valueBytes = bytes(value);
        bytes memory prefixBytes = bytes(prefix);
        if (valueBytes.length < prefixBytes.length) return false;
        for (uint256 i = 0; i < prefixBytes.length; i++) {
            if (valueBytes[i] != prefixBytes[i]) return false;
        }
        return true;
    }

    function _sliceString(string memory value, uint256 start, uint256 end) internal pure returns (string memory) {
        return _sliceBytesToString(bytes(value), start, end);
    }

    function _sliceBytesToString(bytes memory value, uint256 start, uint256 end) internal pure returns (string memory) {
        if (end <= start) return "";
        bytes memory out = new bytes(end - start);
        for (uint256 i = start; i < end; i++) {
            out[i - start] = value[i];
        }
        return string(out);
    }

    function _toLower(string memory value) internal pure returns (string memory) {
        bytes memory data = bytes(value);
        bytes memory lowered = new bytes(data.length);
        for (uint256 i = 0; i < data.length; i++) {
            bytes1 char = data[i];
            if (char >= 0x41 && char <= 0x5A) {
                lowered[i] = bytes1(uint8(char) + 32);
            } else {
                lowered[i] = char;
            }
        }
        return string(lowered);
    }

    function _toUpper(string memory value) internal pure returns (string memory) {
        bytes memory data = bytes(value);
        bytes memory upper = new bytes(data.length);
        for (uint256 i = 0; i < data.length; i++) {
            bytes1 char = data[i];
            if (char >= 0x61 && char <= 0x7A) {
                upper[i] = bytes1(uint8(char) - 32);
            } else {
                upper[i] = char;
            }
        }
        return string(upper);
    }

    function _extractLeadingDigits(string memory value) internal pure returns (string memory) {
        bytes memory data = bytes(value);
        uint256 end = 0;
        while (end < data.length && data[end] >= 0x30 && data[end] <= 0x39) {
            end++;
        }
        return _sliceBytesToString(data, 0, end);
    }

    function _isOpenLibraryId(string memory value, bytes1 suffix) internal pure returns (bool) {
        bytes memory data = bytes(value);
        if (data.length < 3 || data[0] != "O" || data[1] != "L" || data[data.length - 1] != suffix) return false;
        for (uint256 i = 2; i + 1 < data.length; i++) {
            if (data[i] < 0x30 || data[i] > 0x39) return false;
        }
        return true;
    }

    function _isReservedHuggingFaceNamespace(string memory value) internal pure returns (bool) {
        return _equals(value, "docs") || _equals(value, "spaces") || _equals(value, "datasets")
            || _equals(value, "models") || _equals(value, "tasks") || _equals(value, "blog")
            || _equals(value, "pricing") || _equals(value, "enterprise") || _equals(value, "login")
            || _equals(value, "join") || _equals(value, "settings") || _equals(value, "notifications")
            || _equals(value, "papers");
    }

    function _isAlphaNumeric(string memory value) internal pure returns (bool) {
        bytes memory data = bytes(value);
        if (data.length == 0) return false;
        for (uint256 i = 0; i < data.length; i++) {
            bytes1 char = data[i];
            bool isDigit = char >= 0x30 && char <= 0x39;
            bool isUpper = char >= 0x41 && char <= 0x5A;
            bool isLower = char >= 0x61 && char <= 0x7A;
            if (!isDigit && !isUpper && !isLower) return false;
        }
        return true;
    }

    function _equals(string memory left, string memory right) internal pure returns (bool) {
        return keccak256(bytes(left)) == keccak256(bytes(right));
    }

    function _stringLessThan(string memory left, string memory right) internal pure returns (bool) {
        bytes memory leftBytes = bytes(left);
        bytes memory rightBytes = bytes(right);
        uint256 sharedLength = leftBytes.length < rightBytes.length ? leftBytes.length : rightBytes.length;

        for (uint256 i = 0; i < sharedLength; i++) {
            if (leftBytes[i] == rightBytes[i]) continue;
            return leftBytes[i] < rightBytes[i];
        }

        return leftBytes.length < rightBytes.length;
    }
}
