// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title SubmissionMediaValidator
/// @notice Stateless helper for Curyo question media validation.
/// @dev Kept outside ContentRegistry to avoid bloating the upgradeable registry runtime.
contract SubmissionMediaValidator {
    uint256 public constant MAX_IMAGE_URLS = 4;

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
        if (_hasPrefix(url, "https://youtu.be/")) return bytes(url).length > bytes("https://youtu.be/").length;
        if (_hasPrefix(url, "https://www.youtube.com/embed/")) {
            return bytes(url).length > bytes("https://www.youtube.com/embed/").length;
        }
        if (
            _hasPrefix(url, "https://youtube.com/watch?") || _hasPrefix(url, "https://www.youtube.com/watch?")
                || _hasPrefix(url, "https://m.youtube.com/watch?")
        ) {
            return _contains(url, "v=");
        }
        return false;
    }

    function _isValidSubmissionUrl(string memory url) internal pure returns (bool) {
        bytes memory urlBytes = bytes(url);
        bytes memory prefix = bytes("https://");
        if (urlBytes.length < prefix.length) {
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

    function _contains(string memory value, string memory needle) internal pure returns (bool) {
        bytes memory valueBytes = bytes(value);
        bytes memory needleBytes = bytes(needle);
        if (needleBytes.length == 0) return true;
        if (valueBytes.length < needleBytes.length) return false;

        for (uint256 i = 0; i <= valueBytes.length - needleBytes.length; i++) {
            bool matched = true;
            for (uint256 j = 0; j < needleBytes.length; j++) {
                if (valueBytes[i + j] != needleBytes[j]) {
                    matched = false;
                    break;
                }
            }
            if (matched) return true;
        }
        return false;
    }

    function _toLowerByte(bytes1 char) internal pure returns (bytes1) {
        if (char >= 0x41 && char <= 0x5A) {
            return bytes1(uint8(char) + 32);
        }
        return char;
    }
}
