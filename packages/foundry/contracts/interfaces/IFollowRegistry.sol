// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IFollowRegistry
/// @notice Interface for the on-chain follow graph used across Curyo frontends
interface IFollowRegistry {
    error InvalidAddress();
    error SelfFollow();
    error AlreadyFollowing();
    error NotFollowing();

    event ProfileFollowed(address indexed follower, address indexed followed);
    event ProfileUnfollowed(address indexed follower, address indexed followed);

    /// @notice Follow a target address.
    /// @param target The address to follow.
    function follow(address target) external;

    /// @notice Unfollow a previously followed target address.
    /// @param target The address to unfollow.
    function unfollow(address target) external;

    /// @notice Check whether a follower currently follows a target.
    /// @param follower The address performing the follow.
    /// @param target The followed address.
    /// @return True if follower currently follows target.
    function isFollowing(address follower, address target) external view returns (bool);
}
