// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IProfileRegistry
/// @notice Interface for the ProfileRegistry contract that manages on-chain user profiles
interface IProfileRegistry {
    /// @notice Profile data structure
    struct Profile {
        string name;
        string strategy;
        uint256 createdAt;
        uint256 updatedAt;
    }

    /// @notice Set or update a user's profile
    /// @param name The unique profile name (3-20 alphanumeric + underscore)
    /// @param strategy Short public note describing how the user rates on Curyo
    function setProfile(string calldata name, string calldata strategy) external;

    /// @notice Set or update the user's generated avatar accent color
    /// @param rgb The RGB accent value encoded as 0xRRGGBB
    function setAvatarAccent(uint24 rgb) external;

    /// @notice Clear the user's generated avatar accent override
    function clearAvatarAccent() external;

    /// @notice Get a user's profile
    /// @param user The address to query
    /// @return The profile data
    function getProfile(address user) external view returns (Profile memory);

    /// @notice Get a user's generated avatar accent override
    /// @param user The address to query
    /// @return enabled True when the user has set an explicit accent override
    /// @return rgb The RGB accent value encoded as 0xRRGGBB
    function getAvatarAccent(address user) external view returns (bool enabled, uint24 rgb);

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
