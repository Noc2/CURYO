// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ICategoryRegistry Interface
/// @notice Interface for seed-only discovery category metadata.
interface ICategoryRegistry {
    struct Category {
        uint256 id;
        string name;
        string slug;
        string[] subcategories;
        uint256 createdAt;
    }

    event CategoryAdded(uint256 indexed categoryId, string name, string slug);

    /// @notice Check if a seeded category exists.
    function isCategory(uint256 categoryId) external view returns (bool);

    /// @notice Get category details by ID
    function getCategory(uint256 categoryId) external view returns (Category memory);

    /// @notice Get category by slug.
    function getCategoryBySlug(string calldata slug) external view returns (Category memory);

    /// @notice Get seeded category IDs with pagination.
    function getCategoryIdsPaginated(uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory categoryIds, uint256 total);
}
