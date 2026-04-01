// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { IERC1363Receiver } from "@openzeppelin/contracts/interfaces/IERC1363Receiver.sol";
import { IERC1363Spender } from "@openzeppelin/contracts/interfaces/IERC1363Spender.sol";

contract ERC1363ReceiverMock is IERC1363Receiver {
    address public lastOperator;
    address public lastFrom;
    uint256 public lastValue;
    bytes public lastData;

    function onTransferReceived(address operator, address from, uint256 value, bytes calldata data)
        external
        returns (bytes4)
    {
        lastOperator = operator;
        lastFrom = from;
        lastValue = value;
        lastData = data;
        return IERC1363Receiver.onTransferReceived.selector;
    }
}

contract ERC1363SpenderMock is IERC1363Spender {
    address public lastOwner;
    uint256 public lastValue;
    bytes public lastData;

    function onApprovalReceived(address owner, uint256 value, bytes calldata data) external returns (bytes4) {
        lastOwner = owner;
        lastValue = value;
        lastData = data;
        return IERC1363Spender.onApprovalReceived.selector;
    }
}

/// @title CuryoReputation branch coverage tests
contract CuryoReputationBranchesTest is Test {
    CuryoReputation public crep;
    ERC1363ReceiverMock public receiver;
    ERC1363SpenderMock public spender;

    address public admin = address(1);
    address public governance = address(2);
    address public mockGovernor = address(3);
    address public mockVotingEngine = address(4);
    address public mockContentRegistry = address(5);
    address public user1 = address(6);
    address public user2 = address(7);

    uint256 public constant T0 = 1000;

    function setUp() public {
        vm.warp(T0);
        vm.startPrank(admin);

        crep = new CuryoReputation(admin, governance);
        receiver = new ERC1363ReceiverMock();
        spender = new ERC1363SpenderMock();

        // Admin has MINTER_ROLE from constructor
        crep.mint(user1, 1_000e6);
        crep.mint(user2, 1_000e6);
        vm.stopPrank();

        // Set governor and voting contracts
        vm.startPrank(governance);
        crep.setGovernor(mockGovernor);
        crep.setContentVotingContracts(mockVotingEngine, mockContentRegistry);
        vm.stopPrank();
    }

    // =========================================================================
    // Transfer lock branches
    // =========================================================================

    function test_Transfer_GovernanceLocked_Reverts() public {
        // Lock user1's tokens via governor
        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 800e6);

        // user1 has 1000e6 total, 800e6 locked, 200e6 transferable
        vm.prank(user1);
        vm.expectRevert("Exceeds transferable balance (governance locked)");
        crep.transfer(user2, 300e6);
    }

    function test_Transfer_GovernanceLocked_ToVotingEngine_Succeeds() public {
        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 800e6);

        // Transfer TO voting engine is allowed even if locked
        vm.prank(user1);
        crep.transfer(mockVotingEngine, 900e6);

        assertEq(crep.balanceOf(mockVotingEngine), 900e6);
    }

    function test_Transfer_GovernanceLocked_ToContentRegistry_Succeeds() public {
        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 800e6);

        // Transfer TO content registry is allowed even if locked
        vm.prank(user1);
        crep.transfer(mockContentRegistry, 900e6);

        assertEq(crep.balanceOf(mockContentRegistry), 900e6);
    }

    function test_TransferFrom_GovernanceLocked_ThirdPartyToVotingEngine_Reverts() public {
        address thirdPartySpender = address(100);

        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 800e6);

        vm.prank(user1);
        crep.approve(thirdPartySpender, 900e6);

        vm.prank(thirdPartySpender);
        vm.expectRevert("Exceeds transferable balance (governance locked)");
        crep.transferFrom(user1, mockVotingEngine, 900e6);
    }

    function test_TransferFrom_GovernanceLocked_VotingEnginePull_Succeeds() public {
        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 800e6);

        vm.prank(user1);
        crep.approve(mockVotingEngine, 900e6);

        vm.prank(mockVotingEngine);
        crep.transferFrom(user1, mockVotingEngine, 900e6);

        assertEq(crep.balanceOf(mockVotingEngine), 900e6);
    }

    function test_TransferFrom_GovernanceLocked_ContentRegistryPull_Succeeds() public {
        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 800e6);

        vm.prank(user1);
        crep.approve(mockContentRegistry, 900e6);

        vm.prank(mockContentRegistry);
        crep.transferFrom(user1, mockContentRegistry, 900e6);

        assertEq(crep.balanceOf(mockContentRegistry), 900e6);
    }

    function test_Transfer_GovernanceLocked_PartialTransfer_Succeeds() public {
        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 800e6);

        // 200e6 is transferable
        vm.prank(user1);
        crep.transfer(user2, 200e6);

        assertEq(crep.balanceOf(user2), 1_200e6);
    }

    function test_Transfer_NoLock_FullTransfer_Succeeds() public {
        vm.prank(user1);
        crep.transfer(user2, 1_000e6);
        assertEq(crep.balanceOf(user1), 0);
        assertEq(crep.balanceOf(user2), 2_000e6);
    }

    function test_Transfer_MintBypasses_LockCheck() public {
        // Lock user1's tokens
        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 800e6);

        // Mint to user1 should still work (from = address(0) bypasses lock check)
        vm.prank(admin);
        crep.mint(user1, 100e6);

        assertEq(crep.balanceOf(user1), 1_100e6);
    }

    function test_Transfer_AutoDelegateOnFirstReceipt() public {
        address newUser = address(10);
        assertEq(crep.delegates(newUser), address(0));

        vm.prank(user1);
        crep.transfer(newUser, 100e6);

        // Auto-delegation to self should have occurred
        assertEq(crep.delegates(newUser), newUser);
    }

    function test_TransferAndCall_Succeeds() public {
        bytes memory data = abi.encodePacked("vote payload");

        vm.prank(user1);
        bool ok = crep.transferAndCall(address(receiver), 125e6, data);

        assertTrue(ok);
        assertEq(crep.balanceOf(address(receiver)), 125e6);
        assertEq(receiver.lastOperator(), user1);
        assertEq(receiver.lastFrom(), user1);
        assertEq(receiver.lastValue(), 125e6);
        assertEq(receiver.lastData(), data);
    }

    function test_ApproveAndCall_Succeeds() public {
        bytes memory data = abi.encodePacked("approval payload");

        vm.prank(user1);
        bool ok = crep.approveAndCall(address(spender), 250e6, data);

        assertTrue(ok);
        assertEq(crep.allowance(user1, address(spender)), 250e6);
        assertEq(spender.lastOwner(), user1);
        assertEq(spender.lastValue(), 250e6);
        assertEq(spender.lastData(), data);
    }

    function test_Transfer_AlreadyDelegated_NoChange() public {
        // user1 is already delegated from setUp (first mint triggered auto-delegate)
        assertEq(crep.delegates(user1), user1);

        // Transfer more tokens — delegation should not change
        vm.prank(user2);
        crep.transfer(user1, 100e6);

        assertEq(crep.delegates(user1), user1);
    }

    // =========================================================================
    // Delegation branches
    // =========================================================================

    function test_Delegate_SelfDelegation_Succeeds() public {
        // Already self-delegated from auto-delegate, but explicit call should work
        vm.prank(user1);
        crep.delegate(user1);
        assertEq(crep.delegates(user1), user1);
    }

    function test_Delegate_ProxyDelegation_Reverts() public {
        vm.prank(user1);
        vm.expectRevert("Only self-delegation allowed");
        crep.delegate(user2);
    }

    // =========================================================================
    // lockForGovernance branches
    // =========================================================================

    function test_LockForGovernance_OnlyGovernor() public {
        vm.prank(user1);
        vm.expectRevert("Only governor");
        crep.lockForGovernance(user1, 100e6);
    }

    function test_LockForGovernance_ZeroAmount_Reverts() public {
        vm.prank(mockGovernor);
        vm.expectRevert("Amount must be > 0");
        crep.lockForGovernance(user1, 0);
    }

    function test_LockForGovernance_FreshLock() public {
        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 500e6);

        (uint256 amount, uint256 unlockTime) = crep.getGovernanceLock(user1);
        assertEq(amount, 500e6);
        assertEq(unlockTime, T0 + 7 days);
    }

    function test_LockForGovernance_AccumulateLock() public {
        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 300e6);

        vm.warp(T0 + 1 days);
        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 200e6);

        (uint256 amount,) = crep.getGovernanceLock(user1);
        assertEq(amount, 500e6); // 300 + 200 accumulated
    }

    function test_LockForGovernance_ExpiredLock_StartsNew() public {
        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 300e6);

        // Warp past lock expiry (7 days)
        vm.warp(T0 + 8 days);

        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 200e6);

        (uint256 amount,) = crep.getGovernanceLock(user1);
        assertEq(amount, 200e6); // fresh lock, not accumulated
    }

    // =========================================================================
    // getTransferableBalance / getGovernanceLock / isLocked branches
    // =========================================================================

    function test_GetTransferableBalance_FullyLocked() public {
        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 1_000e6);

        assertEq(crep.getTransferableBalance(user1), 0);
    }

    function test_GetTransferableBalance_PartiallyLocked() public {
        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 500e6);

        assertEq(crep.getTransferableBalance(user1), 500e6);
    }

    function test_GetTransferableBalance_OverLockedReverts() public {
        vm.prank(mockGovernor);
        vm.expectRevert("Insufficient current balance for governance lock");
        crep.lockForGovernance(user1, 2_000e6);
    }

    function test_GetGovernanceLock_Expired_ReturnsZero() public {
        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 500e6);

        vm.warp(T0 + 8 days);

        (uint256 amount, uint256 unlockTime) = crep.getGovernanceLock(user1);
        assertEq(amount, 0);
        assertGt(unlockTime, 0); // unlockTime is still stored
    }

    function test_GetGovernanceLock_Active_ReturnsAmount() public {
        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 500e6);

        (uint256 amount, uint256 unlockTime) = crep.getGovernanceLock(user1);
        assertEq(amount, 500e6);
        assertEq(unlockTime, T0 + 7 days);
    }

    function test_IsLocked_WithActiveLock() public {
        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 500e6);
        assertTrue(crep.isLocked(user1));
    }

    function test_IsLocked_NoLock() public {
        assertFalse(crep.isLocked(user1));
    }

    function test_IsLocked_ExpiredLock() public {
        vm.prank(mockGovernor);
        crep.lockForGovernance(user1, 500e6);

        vm.warp(T0 + 8 days);
        assertFalse(crep.isLocked(user1));
    }
}
