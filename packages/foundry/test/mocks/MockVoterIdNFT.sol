// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IVoterIdNFT } from "../../contracts/interfaces/IVoterIdNFT.sol";

/// @dev Shared mock VoterIdNFT for use across all test files.
contract MockVoterIdNFT is IVoterIdNFT {
    mapping(address => bool) public holders;
    mapping(address => uint256) public tokenIds;
    mapping(uint256 => address) public tokenHolders;
    mapping(uint256 => bool) public usedNullifiers;
    uint256 private nextTokenId = 1;
    mapping(bytes32 => uint256) public stakes;
    mapping(address => address) public holderToDelegate;
    mapping(address => address) public delegateToHolder;

    function setHolder(address holder) external {
        holders[holder] = true;
        if (tokenIds[holder] == 0) {
            tokenIds[holder] = nextTokenId;
            tokenHolders[nextTokenId] = holder;
            nextTokenId++;
        }
    }

    function removeHolder(address holder) external {
        holders[holder] = false;
    }

    function mint(address to, uint256 nullifier) external returns (uint256) {
        usedNullifiers[nullifier] = true;
        holders[to] = true;
        uint256 id = nextTokenId++;
        tokenIds[to] = id;
        tokenHolders[id] = to;
        return id;
    }

    function hasVoterId(address holder) external view returns (bool) {
        if (holders[holder]) return true;
        address delegator = delegateToHolder[holder];
        return delegator != address(0) && holders[delegator];
    }

    function getTokenId(address holder) external view returns (uint256) {
        uint256 tokenId = tokenIds[holder];
        if (tokenId != 0) return tokenId;
        address delegator = delegateToHolder[holder];
        if (delegator != address(0)) return tokenIds[delegator];
        return 0;
    }

    function getHolder(uint256 tokenId) external view returns (address) {
        return tokenHolders[tokenId];
    }

    function recordStake(uint256 contentId, uint256 epochId, uint256 tokenId, uint256 amount) external {
        bytes32 key = keccak256(abi.encodePacked(contentId, epochId, tokenId));
        stakes[key] += amount;
    }

    function getEpochContentStake(uint256 contentId, uint256 epochId, uint256 tokenId) external view returns (uint256) {
        bytes32 key = keccak256(abi.encodePacked(contentId, epochId, tokenId));
        return stakes[key];
    }

    function isNullifierUsed(uint256 nullifier) external view returns (bool) {
        return usedNullifiers[nullifier];
    }

    function revokeVoterId(address holder) external {
        holders[holder] = false;
    }

    function setDelegate(address delegate) external {
        holderToDelegate[msg.sender] = delegate;
        delegateToHolder[delegate] = msg.sender;
    }

    function removeDelegate() external {
        address delegate = holderToDelegate[msg.sender];
        delete delegateToHolder[delegate];
        delete holderToDelegate[msg.sender];
    }

    function resolveHolder(address addr) external view returns (address) {
        if (holders[addr]) return addr;
        address h = delegateToHolder[addr];
        if (holders[h]) return h;
        return address(0);
    }

    function delegateTo(address holder) external view returns (address) {
        return holderToDelegate[holder];
    }

    function delegateOf(address delegate) external view returns (address) {
        return delegateToHolder[delegate];
    }
}
