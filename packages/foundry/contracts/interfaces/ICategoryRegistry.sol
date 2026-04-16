// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ICategoryRegistry Interface
/// @notice Interface for seed-only discovery category metadata.
interface ICategoryRegistry {
    enum CategoryStatus {
        Pending,
        Approved,
        Rejected,
        Canceled
    }

    struct Category {
        uint256 id;
        string name;
        string domain; // Legacy field name; now stores the category slug.
        string[] subcategories;
        address submitter; // Always zero for seed-only categories.
        uint256 stakeAmount; // Always zero for seed-only categories.
        CategoryStatus status;
        uint256 proposalId; // Always zero for seed-only categories.
        uint256 createdAt;
    }

    event CategoryAdded(uint256 indexed categoryId, string name, string slug);

    /// @notice Check if a seeded category exists and is active. Legacy approved naming retained for compatibility.
    function isApprovedCategory(uint256 categoryId) external view returns (bool);

    /// @notice Get category details by ID
    function getCategory(uint256 categoryId) external view returns (Category memory);

    /// @notice Get category by slug. Legacy name retained while callers migrate away from domain language.
    function getCategoryByDomain(string calldata slug) external view returns (Category memory);

    /// @notice Get seeded category IDs with pagination. Legacy approved naming retained for compatibility.
    function getApprovedCategoryIdsPaginated(uint256 offset, uint256 limit)
        external
        view
        returns (uint256[] memory categoryIds, uint256 total);

    /// @notice Check if a category slug is already registered. Legacy name retained while callers migrate.
    function isDomainRegistered(string calldata slug) external view returns (bool);

    /// @notice Get the legacy status for a category. Seed-only categories return Approved.
    function getCategoryStatus(uint256 categoryId) external view returns (CategoryStatus);
}
