// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { FollowRegistry } from "../contracts/FollowRegistry.sol";
import { IFollowRegistry } from "../contracts/interfaces/IFollowRegistry.sol";

contract FollowRegistryTest is Test {
    FollowRegistry public registry;

    address public admin = address(1);
    address public governance = address(2);
    address public alice = address(3);
    address public bob = address(4);
    address public carol = address(5);

    function setUp() public {
        vm.startPrank(admin);
        FollowRegistry impl = new FollowRegistry();
        registry = FollowRegistry(
            address(new ERC1967Proxy(address(impl), abi.encodeCall(FollowRegistry.initialize, (admin, governance))))
        );
        vm.stopPrank();
    }

    function test_Follow() public {
        vm.prank(alice);
        vm.expectEmit(true, true, false, true);
        emit IFollowRegistry.ProfileFollowed(alice, bob);
        registry.follow(bob);

        assertTrue(registry.isFollowing(alice, bob));
    }

    function test_RevertFollowZeroAddress() public {
        vm.prank(alice);
        vm.expectRevert(IFollowRegistry.InvalidAddress.selector);
        registry.follow(address(0));
    }

    function test_RevertSelfFollow() public {
        vm.prank(alice);
        vm.expectRevert(IFollowRegistry.SelfFollow.selector);
        registry.follow(alice);
    }

    function test_RevertDuplicateFollow() public {
        vm.startPrank(alice);
        registry.follow(bob);

        vm.expectRevert(IFollowRegistry.AlreadyFollowing.selector);
        registry.follow(bob);
        vm.stopPrank();
    }

    function test_Unfollow() public {
        vm.startPrank(alice);
        registry.follow(bob);

        vm.expectEmit(true, true, false, true);
        emit IFollowRegistry.ProfileUnfollowed(alice, bob);
        registry.unfollow(bob);
        vm.stopPrank();

        assertFalse(registry.isFollowing(alice, bob));
    }

    function test_RevertUnfollowMissingEdge() public {
        vm.prank(alice);
        vm.expectRevert(IFollowRegistry.NotFollowing.selector);
        registry.unfollow(bob);
    }

    function test_FollowEdgesAreIndependent() public {
        vm.startPrank(alice);
        registry.follow(bob);
        registry.follow(carol);
        vm.stopPrank();

        vm.prank(bob);
        registry.follow(carol);

        assertTrue(registry.isFollowing(alice, bob));
        assertTrue(registry.isFollowing(alice, carol));
        assertTrue(registry.isFollowing(bob, carol));
        assertFalse(registry.isFollowing(bob, alice));
    }
}
