// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test, console } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ProfileRegistry } from "../contracts/ProfileRegistry.sol";
import { IProfileRegistry } from "../contracts/interfaces/IProfileRegistry.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";

/// @title ProfileRegistry Test Suite
contract ProfileRegistryTest is Test {
    ProfileRegistry public registry;
    MockVoterIdNFT public voterIdNFT;

    address public admin = address(1);
    address public user1 = address(2);
    address public user2 = address(3);
    address public delegate = address(4);

    function setUp() public {
        vm.startPrank(admin);

        // Deploy registry (UUPS proxy)
        ProfileRegistry impl = new ProfileRegistry();
        registry = ProfileRegistry(
            address(new ERC1967Proxy(address(impl), abi.encodeCall(ProfileRegistry.initialize, (admin, admin))))
        );
        voterIdNFT = new MockVoterIdNFT();

        vm.stopPrank();
    }

    // --- Initialization Tests ---

    function test_Initialization() public view {
        assertEq(registry.MIN_NAME_LENGTH(), 3);
        assertEq(registry.MAX_NAME_LENGTH(), 20);
        assertEq(registry.MAX_IMAGE_URL_LENGTH(), 512);
        (, uint256 total) = registry.getRegisteredAddressesPaginated(0, 10);
        assertEq(total, 0);
    }

    // --- Set Profile Tests ---

    function test_SetProfileCreate() public {
        vm.prank(user1);
        registry.setProfile("alice", "https://example.com/alice.png");

        IProfileRegistry.Profile memory profile = registry.getProfile(user1);
        assertEq(profile.name, "alice");
        assertEq(profile.imageUrl, "https://example.com/alice.png");
        assertTrue(profile.createdAt > 0);
        assertTrue(profile.updatedAt > 0);

        assertTrue(registry.hasProfile(user1));
        (, uint256 total) = registry.getRegisteredAddressesPaginated(0, 10);
        assertEq(total, 1);
    }

    function test_SetProfileUpdate() public {
        vm.startPrank(user1);
        registry.setProfile("alice", "https://example.com/alice.png");

        vm.warp(block.timestamp + 1 days);

        registry.setProfile("alice", "https://example.com/alice_new.png");
        vm.stopPrank();

        IProfileRegistry.Profile memory profile = registry.getProfile(user1);
        assertEq(profile.imageUrl, "https://example.com/alice_new.png");
        assertTrue(profile.updatedAt > profile.createdAt);
    }

    function test_SetProfileChangeName() public {
        vm.startPrank(user1);
        registry.setProfile("alice", "");

        // Old name should be released when changing
        registry.setProfile("alice2", "");
        vm.stopPrank();

        // Old name should be available
        assertFalse(registry.isNameTaken("alice"));
        assertTrue(registry.isNameTaken("alice2"));
    }

    function test_SetProfileSameNameUpdate() public {
        vm.startPrank(user1);
        registry.setProfile("alice", "");

        // Should not revert when updating with same name
        registry.setProfile("alice", "new_url");
        vm.stopPrank();

        IProfileRegistry.Profile memory profile = registry.getProfile(user1);
        assertEq(profile.name, "alice");
        assertEq(profile.imageUrl, "new_url");
    }

    function test_RevertSetProfileNameTooShort() public {
        vm.prank(user1);
        vm.expectRevert("Name too short");
        registry.setProfile("ab", "");
    }

    function test_RevertSetProfileNameTooLong() public {
        vm.prank(user1);
        vm.expectRevert("Name too long");
        registry.setProfile("abcdefghijklmnopqrstuvwxyz", ""); // 26 chars, max is 20
    }

    function test_RevertSetProfileInvalidName() public {
        vm.startPrank(user1);

        vm.expectRevert("Invalid name format");
        registry.setProfile("alice!", ""); // Contains !

        vm.expectRevert("Invalid name format");
        registry.setProfile("alice bob", ""); // Contains space

        vm.expectRevert("Invalid name format");
        registry.setProfile("alice@bob", ""); // Contains @

        vm.stopPrank();
    }

    function test_SetProfileValidNameCharacters() public {
        vm.startPrank(user1);

        // Alphanumeric and underscore should be valid
        registry.setProfile("alice_123", "");

        IProfileRegistry.Profile memory profile = registry.getProfile(user1);
        assertEq(profile.name, "alice_123");

        vm.stopPrank();
    }

    function test_RevertSetProfileNameTaken() public {
        vm.prank(user1);
        registry.setProfile("alice", "");

        vm.prank(user2);
        vm.expectRevert("Name already taken");
        registry.setProfile("alice", "");
    }

    function test_RevertSetProfileImageUrlTooLong() public {
        // Create a URL that's too long (513 chars)
        bytes memory longUrl = new bytes(513);
        for (uint256 i = 0; i < 513; i++) {
            longUrl[i] = "a";
        }

        vm.prank(user1);
        vm.expectRevert("Image URL too long");
        registry.setProfile("alice", string(longUrl));
    }

    // --- Name Uniqueness Tests (Case Insensitive) ---

    function test_NameTakenCaseInsensitive() public {
        vm.prank(user1);
        registry.setProfile("Alice", "");

        assertTrue(registry.isNameTaken("alice"));
        assertTrue(registry.isNameTaken("ALICE"));
        assertTrue(registry.isNameTaken("AlIcE"));
    }

    function test_RevertSetProfileNameTakenCaseInsensitive() public {
        vm.prank(user1);
        registry.setProfile("Alice", "");

        vm.prank(user2);
        vm.expectRevert("Name already taken");
        registry.setProfile("ALICE", "");
    }

    // --- View Functions Tests ---

    function test_GetProfile() public {
        vm.prank(user1);
        registry.setProfile("alice", "https://example.com/alice.png");

        IProfileRegistry.Profile memory profile = registry.getProfile(user1);
        assertEq(profile.name, "alice");
        assertEq(profile.imageUrl, "https://example.com/alice.png");
    }

    function test_GetProfileNonExistent() public view {
        IProfileRegistry.Profile memory profile = registry.getProfile(user1);
        assertEq(profile.name, "");
        assertEq(profile.createdAt, 0);
    }

    function test_IsNameTaken() public {
        assertFalse(registry.isNameTaken("alice"));

        vm.prank(user1);
        registry.setProfile("alice", "");

        assertTrue(registry.isNameTaken("alice"));
    }

    function test_IsNameTakenTooShort() public view {
        // Names shorter than MIN_NAME_LENGTH return false
        assertFalse(registry.isNameTaken("ab"));
    }

    function test_HasProfile() public {
        assertFalse(registry.hasProfile(user1));

        vm.prank(user1);
        registry.setProfile("alice", "");

        assertTrue(registry.hasProfile(user1));
    }

    function test_SetProfileRequiresHolderWhenVoterIdConfigured() public {
        vm.prank(admin);
        registry.setVoterIdNFT(address(voterIdNFT));

        voterIdNFT.setHolder(user1);
        vm.prank(user1);
        voterIdNFT.setDelegate(delegate);

        vm.prank(delegate);
        vm.expectRevert("Profile owner must hold Voter ID");
        registry.setProfile("alice", "");
    }

    function test_GetAddressByName() public {
        assertEq(registry.getAddressByName("alice"), address(0));

        vm.prank(user1);
        registry.setProfile("alice", "");

        assertEq(registry.getAddressByName("alice"), user1);
        assertEq(registry.getAddressByName("ALICE"), user1); // Case insensitive
    }

    function test_GetRegisteredAddressesPaginatedTotal() public {
        (, uint256 total) = registry.getRegisteredAddressesPaginated(0, 10);
        assertEq(total, 0);

        vm.prank(user1);
        registry.setProfile("alice", "");

        (, total) = registry.getRegisteredAddressesPaginated(0, 10);
        assertEq(total, 1);

        vm.prank(user2);
        registry.setProfile("bob", "");

        (, total) = registry.getRegisteredAddressesPaginated(0, 10);
        assertEq(total, 2);
    }

    function test_GetRegisteredAddressesPaginatedWholeList() public {
        vm.prank(user1);
        registry.setProfile("alice", "");

        vm.prank(user2);
        registry.setProfile("bob", "");

        (address[] memory addresses, uint256 total) = registry.getRegisteredAddressesPaginated(0, 10);
        assertEq(total, 2);
        assertEq(addresses.length, 2);
        assertEq(addresses[0], user1);
        assertEq(addresses[1], user2);
    }

    // --- Fuzz Tests ---

    function testFuzz_SetProfileValidName(string memory name) public {
        // Bound the name to valid length
        vm.assume(bytes(name).length >= 3);
        vm.assume(bytes(name).length <= 20);

        // Check all characters are valid
        bytes memory nameBytes = bytes(name);
        for (uint256 i = 0; i < nameBytes.length; i++) {
            bytes1 char = nameBytes[i];
            bool isLowercase = (char >= 0x61 && char <= 0x7A);
            bool isUppercase = (char >= 0x41 && char <= 0x5A);
            bool isDigit = (char >= 0x30 && char <= 0x39);
            bool isUnderscore = (char == 0x5F);
            vm.assume(isLowercase || isUppercase || isDigit || isUnderscore);
        }

        vm.prank(user1);
        registry.setProfile(name, "");

        assertTrue(registry.hasProfile(user1));
    }

    // --- Multiple Users Tests ---

    function test_MultipleUsersUniqueNames() public {
        vm.prank(user1);
        registry.setProfile("alice", "");

        vm.prank(user2);
        registry.setProfile("bob", "");

        assertEq(registry.getAddressByName("alice"), user1);
        assertEq(registry.getAddressByName("bob"), user2);
        (, uint256 total) = registry.getRegisteredAddressesPaginated(0, 10);
        assertEq(total, 2);
    }

    // --- Pagination Tests ---

    function test_GetRegisteredAddressesPaginated() public {
        // Register 5 users
        address user3 = address(6);
        address user4 = address(7);
        address user5 = address(8);

        vm.prank(user1);
        registry.setProfile("alice", "");
        vm.prank(user2);
        registry.setProfile("bob", "");
        vm.prank(user3);
        registry.setProfile("carol", "");
        vm.prank(user4);
        registry.setProfile("dave", "");
        vm.prank(user5);
        registry.setProfile("eve", "");

        // Page 1: offset=0, limit=2
        (address[] memory page1, uint256 total1) = registry.getRegisteredAddressesPaginated(0, 2);
        assertEq(total1, 5);
        assertEq(page1.length, 2);
        assertEq(page1[0], user1);
        assertEq(page1[1], user2);

        // Page 2: offset=2, limit=2
        (address[] memory page2, uint256 total2) = registry.getRegisteredAddressesPaginated(2, 2);
        assertEq(total2, 5);
        assertEq(page2.length, 2);
        assertEq(page2[0], user3);
        assertEq(page2[1], user4);

        // Page 3: offset=4, limit=10 (exceeds remaining)
        (address[] memory page3, uint256 total3) = registry.getRegisteredAddressesPaginated(4, 10);
        assertEq(total3, 5);
        assertEq(page3.length, 1);
        assertEq(page3[0], user5);
    }

    function test_GetRegisteredAddressesPaginated_OffsetBeyondLength() public {
        vm.prank(user1);
        registry.setProfile("alice", "");

        (address[] memory result, uint256 total) = registry.getRegisteredAddressesPaginated(5, 2);
        assertEq(total, 1);
        assertEq(result.length, 0);
    }

    function test_GetRegisteredAddressesPaginated_ZeroLimit() public {
        vm.prank(user1);
        registry.setProfile("alice", "");

        (address[] memory result, uint256 total) = registry.getRegisteredAddressesPaginated(0, 0);
        assertEq(total, 1);
        assertEq(result.length, 0);
    }

    // --- Name Release on Update Tests ---

    function test_NameReleasedOnChange() public {
        vm.prank(user1);
        registry.setProfile("alice", "");

        assertTrue(registry.isNameTaken("alice"));

        vm.prank(user1);
        registry.setProfile("alice_new", "");

        assertFalse(registry.isNameTaken("alice"));
        assertTrue(registry.isNameTaken("alice_new"));

        // Now user2 can take "alice"
        vm.prank(user2);
        registry.setProfile("alice", "");

        assertEq(registry.getAddressByName("alice"), user2);
    }
}
