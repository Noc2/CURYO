// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title ICategoryRegistry Interface
/// @notice Interface for the CategoryRegistry contract that manages content categories/platforms
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
        string domain;
        string[] subcategories;
        string rankingQuestion; // Template with {title} and {rating} placeholders.
        address submitter;
        uint256 stakeAmount;
        CategoryStatus status;
        uint256 proposalId;
        uint256 createdAt;
    }

    // Events
    event CategorySubmitted(
        uint256 indexed categoryId, address indexed submitter, string name, string domain, uint256 proposalId
    );
    event CategoryProposalLinked(uint256 indexed categoryId, uint256 indexed proposalId, bytes32 descriptionHash);
    event CategoryApproved(uint256 indexed categoryId);
    event CategoryRejected(uint256 indexed categoryId);
    event CategoryCanceled(uint256 indexed categoryId);
    event CategoryAdded(uint256 indexed categoryId, string name, string domain);

    /// @notice Check if a category is approved and active
    function isApprovedCategory(uint256 categoryId) external view returns (bool);

    /// @notice Get category details by ID
    function getCategory(uint256 categoryId) external view returns (Category memory);

    /// @notice Get category by domain
    function getCategoryByDomain(string calldata domain) external view returns (Category memory);

    /// @notice Get all approved category IDs
    function getApprovedCategoryIds() external view returns (uint256[] memory);

    /// @notice Check if a domain is already registered
    function isDomainRegistered(string calldata domain) external view returns (bool);

    /// @notice Get the submitter address for a category
    function getSubmitter(uint256 categoryId) external view returns (address);
}
