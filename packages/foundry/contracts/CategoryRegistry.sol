// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {ICategoryRegistry} from "./interfaces/ICategoryRegistry.sol";

/// @title CategoryRegistry
/// @notice Seed-only discovery category metadata.
/// @dev Categories no longer have user submissions, staking, governance sponsorship, or submitter rewards.
contract CategoryRegistry is ICategoryRegistry, AccessControl {
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint256 public constant MAX_NAME_LENGTH = 64;
    uint256 public constant MAX_SLUG_LENGTH = 64;
    uint256 public constant MAX_SUBCATEGORIES = 20;
    uint256 public constant MAX_SUBCATEGORY_LENGTH = 32;

    uint256 public nextCategoryId;

    mapping(uint256 => Category) private _categories;
    mapping(bytes32 => uint256) private _slugToCategoryId;
    uint256[] private _approvedCategoryIds;

    constructor(address _admin, address _governance) {
        require(_admin != address(0), "Invalid admin");
        require(_governance != address(0), "Invalid governance");

        _grantRole(DEFAULT_ADMIN_ROLE, _governance);
        _grantRole(ADMIN_ROLE, _governance);

        if (_admin != _governance) {
            _grantRole(ADMIN_ROLE, _admin);
        }

        nextCategoryId = 1;
    }

    /// @notice Add seeded discovery category metadata.
    /// @param name Display name, e.g. "Product".
    /// @param slug Stable discovery key, e.g. "product".
    /// @param subcategories Suggested tags shown under this category.
    function addApprovedCategory(string calldata name, string calldata slug, string[] calldata subcategories)
        external
        onlyRole(ADMIN_ROLE)
        returns (uint256 categoryId)
    {
        require(bytes(name).length > 0 && bytes(name).length <= MAX_NAME_LENGTH, "Invalid name length");
        require(bytes(slug).length > 0 && bytes(slug).length <= MAX_SLUG_LENGTH, "Invalid slug length");
        require(subcategories.length > 0 && subcategories.length <= MAX_SUBCATEGORIES, "Invalid subcategories count");

        for (uint256 i = 0; i < subcategories.length; i++) {
            require(
                bytes(subcategories[i]).length > 0 && bytes(subcategories[i]).length <= MAX_SUBCATEGORY_LENGTH,
                "Invalid subcategory length"
            );
        }

        string memory normalizedSlug = _normalizeSlug(slug);
        require(bytes(normalizedSlug).length > 0, "Empty slug after normalization");

        bytes32 slugHash = keccak256(bytes(normalizedSlug));
        require(_slugToCategoryId[slugHash] == 0, "Category already registered");

        categoryId = nextCategoryId++;
        _categories[categoryId] = Category({
            id: categoryId,
            name: name,
            domain: normalizedSlug,
            subcategories: subcategories,
            submitter: address(0),
            stakeAmount: 0,
            status: CategoryStatus.Approved,
            proposalId: 0,
            createdAt: block.timestamp
        });

        _slugToCategoryId[slugHash] = categoryId;
        _approvedCategoryIds.push(categoryId);

        emit CategoryAdded(categoryId, name, normalizedSlug);
    }

    function isApprovedCategory(uint256 categoryId) external view override returns (bool) {
        return _categories[categoryId].status == CategoryStatus.Approved;
    }

    function getCategory(uint256 categoryId) external view override returns (Category memory) {
        require(_categories[categoryId].id != 0, "Category does not exist");
        return _categories[categoryId];
    }

    /// @dev Legacy name retained for callers migrating from domain-based categories. The argument is a slug now.
    function getCategoryByDomain(string calldata slug) external view override returns (Category memory) {
        bytes32 slugHash = keccak256(bytes(_normalizeSlug(slug)));
        uint256 categoryId = _slugToCategoryId[slugHash];
        require(categoryId != 0, "Category not registered");
        return _categories[categoryId];
    }

    function getApprovedCategoryIdsPaginated(uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory categoryIds, uint256 total)
    {
        total = _approvedCategoryIds.length;
        if (offset >= total || limit == 0) {
            return (new uint256[](0), total);
        }

        uint256 end = offset + limit;
        if (end > total) {
            end = total;
        }

        uint256 resultLength = end - offset;
        categoryIds = new uint256[](resultLength);
        for (uint256 i = 0; i < resultLength; i++) {
            categoryIds[i] = _approvedCategoryIds[offset + i];
        }
    }

    /// @dev Legacy name retained for callers migrating from domain-based categories. The argument is a slug now.
    function isDomainRegistered(string calldata slug) external view override returns (bool) {
        return _slugToCategoryId[keccak256(bytes(_normalizeSlug(slug)))] != 0;
    }

    function getCategoryStatus(uint256 categoryId) external view override returns (CategoryStatus) {
        require(_categories[categoryId].id != 0, "Category does not exist");
        return _categories[categoryId].status;
    }

    function getSubcategories(uint256 categoryId) external view returns (string[] memory) {
        require(_categories[categoryId].id != 0, "Category does not exist");
        return _categories[categoryId].subcategories;
    }

    function _normalizeSlug(string memory slug) internal pure returns (string memory) {
        bytes memory input = bytes(slug);
        bytes memory result = new bytes(input.length);
        uint256 resultLength = 0;
        bool previousDash = false;

        for (uint256 i = 0; i < input.length; i++) {
            bytes1 char = input[i];
            bytes1 normalized = char;
            if (char >= 0x41 && char <= 0x5A) {
                normalized = bytes1(uint8(char) + 32);
            }

            bool isAlphaNumeric =
                (normalized >= 0x61 && normalized <= 0x7A) || (normalized >= 0x30 && normalized <= 0x39);
            bool isSeparator = normalized == 0x20 || normalized == 0x2D || normalized == 0x5F;

            if (isAlphaNumeric) {
                result[resultLength++] = normalized;
                previousDash = false;
            } else if (isSeparator && resultLength > 0 && !previousDash) {
                result[resultLength++] = 0x2D;
                previousDash = true;
            }
        }

        if (resultLength > 0 && result[resultLength - 1] == 0x2D) {
            resultLength--;
        }

        bytes memory trimmed = new bytes(resultLength);
        for (uint256 i = 0; i < resultLength; i++) {
            trimmed[i] = result[i];
        }
        return string(trimmed);
    }
}
