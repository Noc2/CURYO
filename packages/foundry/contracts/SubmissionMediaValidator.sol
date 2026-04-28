// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SubmissionMediaValidator
/// @notice Stateless helper for Curyo question media validation.
/// @dev Kept outside ContentRegistry to avoid bloating the upgradeable registry runtime.
contract SubmissionMediaValidator {
    uint256 public constant MAX_IMAGE_URLS = 4;
    uint256 public constant MAX_URL_LENGTH = 2048;

    function validateSingleMediaUrl(string calldata url) external pure {
        require(_isValidSubmissionUrl(url), "Invalid URL");
        require(_isSupportedMediaUrl(url), "Invalid media URL");
    }

    function validateContextUrl(string calldata url) external pure {
        require(_isValidSubmissionUrl(url), "Invalid URL");
    }

    function validateMediaSet(string[] calldata imageUrls, string calldata videoUrl) external pure {
        _validateMediaSet(imageUrls, videoUrl, true);
    }

    function validateOptionalMediaSet(string[] calldata imageUrls, string calldata videoUrl) external pure {
        _validateMediaSet(imageUrls, videoUrl, false);
    }

    function isSupportedVideoUrl(string calldata url) external pure returns (bool) {
        return _isSupportedVideoUrl(url);
    }

    function _validateMediaSet(string[] calldata imageUrls, string calldata videoUrl, bool requireMedia) internal pure {
        bool hasVideo = bytes(videoUrl).length != 0;

        if (hasVideo) {
            require(imageUrls.length == 0, "Choose images or video");
            require(_isValidSubmissionUrl(videoUrl), "Invalid URL");
            require(_isSupportedVideoUrl(videoUrl), "Invalid media URL");
            return;
        }

        if (requireMedia) {
            require(imageUrls.length > 0, "Media required");
        }
        require(imageUrls.length <= MAX_IMAGE_URLS, "Too many images");

        for (uint256 i = 0; i < imageUrls.length; i++) {
            require(_isValidSubmissionUrl(imageUrls[i]), "Invalid URL");
            require(_isSupportedImageUrl(imageUrls[i]), "Invalid media URL");
        }
    }

    function _isSupportedMediaUrl(string memory url) internal pure returns (bool) {
        return _isSupportedImageUrl(url) || _isSupportedVideoUrl(url);
    }

    function _isSupportedImageUrl(string memory url) internal pure returns (bool) {
        return _endsWithBeforeQuery(url, ".avif") || _endsWithBeforeQuery(url, ".gif")
            || _endsWithBeforeQuery(url, ".jpg") || _endsWithBeforeQuery(url, ".jpeg")
            || _endsWithBeforeQuery(url, ".png") || _endsWithBeforeQuery(url, ".webp");
    }

    function _isSupportedVideoUrl(string memory url) internal pure returns (bool) {
        if (_hasValidYoutubePathId(url, "https://youtu.be/")) return true;
        if (_hasValidYoutubePathId(url, "https://www.youtube.com/embed/")) return true;
        if (_hasValidYoutubeWatchId(url, "https://youtube.com/watch?")) return true;
        if (_hasValidYoutubeWatchId(url, "https://www.youtube.com/watch?")) return true;
        if (_hasValidYoutubeWatchId(url, "https://m.youtube.com/watch?")) return true;
        return false;
    }

    function _isValidSubmissionUrl(string memory url) internal pure returns (bool) {
        bytes memory urlBytes = bytes(url);
        bytes memory prefix = bytes("https://");
        if (urlBytes.length < prefix.length || urlBytes.length > MAX_URL_LENGTH) {
            return false;
        }

        for (uint256 i = 0; i < prefix.length; i++) {
            if (urlBytes[i] != prefix[i]) {
                return false;
            }
        }

        for (uint256 i = 0; i < urlBytes.length; i++) {
            bytes1 char = urlBytes[i];
            if (char <= 0x20 || char == 0x7F) {
                return false;
            }
        }

        return true;
    }

    function _endsWithBeforeQuery(string memory value, string memory suffix) internal pure returns (bool) {
        bytes memory valueBytes = bytes(value);
        bytes memory suffixBytes = bytes(suffix);
        uint256 end = valueBytes.length;

        for (uint256 i = 0; i < valueBytes.length; i++) {
            if (valueBytes[i] == "?" || valueBytes[i] == "#") {
                end = i;
                break;
            }
        }

        if (end < suffixBytes.length) return false;
        uint256 offset = end - suffixBytes.length;
        for (uint256 i = 0; i < suffixBytes.length; i++) {
            if (_toLowerByte(valueBytes[offset + i]) != suffixBytes[i]) {
                return false;
            }
        }
        return true;
    }

    function _hasPrefix(string memory value, string memory prefix) internal pure returns (bool) {
        bytes memory valueBytes = bytes(value);
        bytes memory prefixBytes = bytes(prefix);
        if (valueBytes.length < prefixBytes.length) return false;

        for (uint256 i = 0; i < prefixBytes.length; i++) {
            if (valueBytes[i] != prefixBytes[i]) return false;
        }
        return true;
    }

    function _hasValidYoutubePathId(string memory value, string memory prefix) internal pure returns (bool) {
        bytes memory valueBytes = bytes(value);
        bytes memory prefixBytes = bytes(prefix);
        if (!_hasPrefix(value, prefix)) return false;

        bool hasId = false;
        for (uint256 i = prefixBytes.length; i < valueBytes.length; i++) {
            bytes1 char = valueBytes[i];
            if (char == "?" || char == "#") break;
            if (char == "/" || !_isYoutubeIdByte(char)) return false;
            hasId = true;
        }
        return hasId;
    }

    function _hasValidYoutubeWatchId(string memory value, string memory prefix) internal pure returns (bool) {
        bytes memory valueBytes = bytes(value);
        bytes memory prefixBytes = bytes(prefix);
        if (!_hasPrefix(value, prefix)) return false;

        uint256 i = prefixBytes.length;
        while (i < valueBytes.length) {
            if (valueBytes[i] == "#") return false;
            if (
                (i == prefixBytes.length || valueBytes[i - 1] == "&") && i + 1 < valueBytes.length
                    && valueBytes[i] == "v" && valueBytes[i + 1] == "="
            ) {
                return _hasValidYoutubeQueryValue(valueBytes, i + 2);
            }
            while (i < valueBytes.length && valueBytes[i] != "&" && valueBytes[i] != "#") {
                unchecked {
                    ++i;
                }
            }
            if (i < valueBytes.length && valueBytes[i] == "&") {
                unchecked {
                    ++i;
                }
            }
        }
        return false;
    }

    function _hasValidYoutubeQueryValue(bytes memory valueBytes, uint256 start) internal pure returns (bool) {
        bool hasId = false;
        for (uint256 i = start; i < valueBytes.length; i++) {
            bytes1 char = valueBytes[i];
            if (char == "&" || char == "#") break;
            if (!_isYoutubeIdByte(char)) return false;
            hasId = true;
        }
        return hasId;
    }

    function _isYoutubeIdByte(bytes1 char) internal pure returns (bool) {
        return (char >= 0x30 && char <= 0x39) || (char >= 0x41 && char <= 0x5A) || (char >= 0x61 && char <= 0x7A)
            || char == "_" || char == "-";
    }

    function _toLowerByte(bytes1 char) internal pure returns (bytes1) {
        if (char >= 0x41 && char <= 0x5A) {
            return bytes1(uint8(char) + 32);
        }
        return char;
    }
}
