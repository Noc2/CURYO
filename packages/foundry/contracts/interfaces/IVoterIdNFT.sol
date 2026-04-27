// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title IVoterIdNFT
/// @notice Interface for the Voter ID NFT contract - a soulbound token for verified humans
interface IVoterIdNFT {
    /// @notice Mint a new Voter ID NFT
    /// @param to The address to mint to
    /// @param nullifier The passport nullifier from Self.xyz
    /// @return tokenId The minted token ID
    function mint(address to, uint256 nullifier) external returns (uint256 tokenId);

    /// @notice Check if an address has a Voter ID
    /// @param holder The address to check
    /// @return True if the address owns a Voter ID
    function hasVoterId(address holder) external view returns (bool);

    /// @notice Get the token ID for an address
    /// @param holder The address to query
    /// @return The token ID (0 if no Voter ID)
    function getTokenId(address holder) external view returns (uint256);

    /// @notice Get the address holding a token ID
    /// @param tokenId The token ID to query
    /// @return The holder address
    function getHolder(uint256 tokenId) external view returns (address);

    /// @notice Record stake for a Voter ID on specific content in an epoch
    /// @param contentId The content being voted on
    /// @param epochId The epoch ID
    /// @param tokenId The Voter ID token
    /// @param amount The stake amount to add
    function recordStake(uint256 contentId, uint256 epochId, uint256 tokenId, uint256 amount) external;

    /// @notice Get the total staked amount for a Voter ID on specific content in an epoch
    /// @param contentId The content ID
    /// @param epochId The epoch ID
    /// @param tokenId The Voter ID token
    /// @return The total staked amount
    function getEpochContentStake(uint256 contentId, uint256 epochId, uint256 tokenId) external view returns (uint256);

    /// @notice Check if a nullifier has already been used
    /// @param nullifier The nullifier to check
    /// @return True if the nullifier has been used
    function isNullifierUsed(uint256 nullifier) external view returns (bool);

    /// @notice Return the Self.xyz nullifier that minted a Voter ID token
    /// @param tokenId The Voter ID token
    /// @return The nullifier, or 0 when the token has no nullifier snapshot
    function getNullifier(uint256 tokenId) external view returns (uint256);

    /// @notice Revoke a Voter ID (governance action for collusion enforcement)
    /// @param holder The address whose Voter ID should be revoked
    function revokeVoterId(address holder) external;

    /// @notice Request a delegate address to act on behalf of the caller's Voter ID
    /// @param delegate The address to request
    function setDelegate(address delegate) external;

    /// @notice Accept a pending delegate request
    function acceptDelegate() external;

    /// @notice Remove the current delegate authorization
    function removeDelegate() external;

    /// @notice Resolve an address to the effective SBT holder
    /// @param addr The address to resolve
    /// @return The effective holder address (address(0) if neither holder nor delegate)
    function resolveHolder(address addr) external view returns (address);

    /// @notice Get the delegate for a holder
    /// @param holder The holder address
    /// @return The delegate address (address(0) if none)
    function delegateTo(address holder) external view returns (address);

    /// @notice Get the holder that a delegate represents
    /// @param delegate The delegate address
    /// @return The holder address (address(0) if not a delegate)
    function delegateOf(address delegate) external view returns (address);

    /// @notice Get the pending delegate requested by a holder
    /// @param holder The holder address
    /// @return The pending delegate address (address(0) if none)
    function pendingDelegateTo(address holder) external view returns (address);

    /// @notice Get the pending holder request for a delegate candidate
    /// @param delegate The delegate candidate address
    /// @return The pending holder address (address(0) if none)
    function pendingDelegateOf(address delegate) external view returns (address);

    /// @notice Reset a nullifier to allow re-verification after revocation
    /// @param nullifier The nullifier to reset
    function resetNullifier(uint256 nullifier) external;
}
