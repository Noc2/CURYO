// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IProfileRegistry
/// @notice Interface for the ProfileRegistry contract that manages on-chain user profiles
interface IProfileRegistry {
    /// @notice Profile data structure
    struct Profile {
        string name;
        string imageUrl;
        string strategy;
        uint256 createdAt;
        uint256 updatedAt;
    }

    /// @notice Set or update a user's profile
    /// @param name The unique profile name (3-20 alphanumeric + underscore)
    /// @param imageUrl The profile image URL (optional, can be empty)
    /// @param strategy Short public note describing how the user rates on Curyo
    function setProfile(string calldata name, string calldata imageUrl, string calldata strategy) external;

    /// @notice Get a user's profile
    /// @param user The address to query
    /// @return The profile data
    function getProfile(address user) external view returns (Profile memory);

    /// @notice Check if a profile name is already taken
    /// @param name The name to check
    /// @return True if the name is taken
    function isNameTaken(string calldata name) external view returns (bool);

    /// @notice Check if an address has a profile
    /// @param user The address to check
    /// @return True if the user has a profile
    function hasProfile(address user) external view returns (bool);

    /// @notice Get the address that owns a profile name
    /// @param name The profile name
    /// @return The owner address (zero if not found)
    function getAddressByName(string calldata name) external view returns (address);
}
