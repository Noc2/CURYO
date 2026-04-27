// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { VoterIdNFT } from "../contracts/VoterIdNFT.sol";
import { IERC721Errors } from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract MockERC721Receiver is IERC721Receiver {
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) {
        return IERC721Receiver.onERC721Received.selector;
    }
}

contract NonERC721Receiver { }

/// @title VoterIdNFT Unit Tests
contract VoterIdNFTTest is Test {
    VoterIdNFT public voterIdNFT;

    address public admin = address(1);
    address public minterAddr = address(2);
    address public recorderAddr = address(3);
    address public user1 = address(4);
    address public user2 = address(5);
    address public user3 = address(6);
    MockERC721Receiver public receiverContract;
    NonERC721Receiver public nonReceiverContract;

    uint256 public constant NULLIFIER_1 = 111111;
    uint256 public constant NULLIFIER_2 = 222222;
    uint256 public constant NULLIFIER_3 = 333333;

    function setUp() public {
        vm.startPrank(admin);
        voterIdNFT = new VoterIdNFT(admin, admin);
        voterIdNFT.addMinter(minterAddr);
        voterIdNFT.setStakeRecorder(recorderAddr);
        vm.stopPrank();

        receiverContract = new MockERC721Receiver();
        nonReceiverContract = new NonERC721Receiver();
    }

    function _requestAndAcceptDelegate(address holder, address delegate) internal {
        vm.prank(holder);
        voterIdNFT.setDelegate(delegate);

        vm.prank(delegate);
        voterIdNFT.acceptDelegate();
    }

    // ====================================================
    // Initialization Tests
    // ====================================================

    function test_Initialization() public view {
        assertEq(voterIdNFT.name(), "Curyo Voter ID");
        assertEq(voterIdNFT.symbol(), "CVID");
        assertEq(voterIdNFT.MAX_STAKE_PER_VOTER(), 100e6);
        assertEq(voterIdNFT.owner(), admin);
        assertTrue(voterIdNFT.authorizedMinters(minterAddr));
        assertEq(voterIdNFT.stakeRecorder(), recorderAddr);
    }

    function test_TokenIdZeroReserved() public view {
        // Token ID 0 indicates "no Voter ID"
        assertEq(voterIdNFT.holderToTokenId(user1), 0);
        assertFalse(voterIdNFT.hasVoterId(user1));
    }

    // ====================================================
    // Admin Function Tests
    // ====================================================

    function test_AddMinter() public {
        address newMinter = address(20);
        vm.prank(admin);
        voterIdNFT.addMinter(newMinter);
        assertTrue(voterIdNFT.authorizedMinters(newMinter));
    }

    function test_AddMinter_RevertNotOwner() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user1));
        voterIdNFT.addMinter(address(20));
    }

    function test_AddMinter_RevertZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(VoterIdNFT.InvalidAddress.selector);
        voterIdNFT.addMinter(address(0));
    }

    function test_SetGovernance_AllowsFutureOwnershipMigration() public {
        address newGovernance = address(21);

        vm.prank(admin);
        voterIdNFT.setGovernance(newGovernance);

        assertEq(voterIdNFT.governance(), newGovernance);

        vm.prank(admin);
        voterIdNFT.transferOwnership(newGovernance);

        assertEq(voterIdNFT.owner(), newGovernance);
    }

    function test_RemoveMinter() public {
        assertTrue(voterIdNFT.authorizedMinters(minterAddr));

        vm.prank(admin);
        voterIdNFT.removeMinter(minterAddr);
        assertFalse(voterIdNFT.authorizedMinters(minterAddr));

        // Minting should now fail
        vm.prank(minterAddr);
        vm.expectRevert(VoterIdNFT.OnlyMinter.selector);
        voterIdNFT.mint(user1, NULLIFIER_1);
    }

    function test_RemoveMinter_RevertNotOwner() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user1));
        voterIdNFT.removeMinter(minterAddr);
    }

    function test_RemoveMinter_RevertZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(VoterIdNFT.InvalidAddress.selector);
        voterIdNFT.removeMinter(address(0));
    }

    function test_MultipleMinters() public {
        address secondMinter = address(20);

        vm.prank(admin);
        voterIdNFT.addMinter(secondMinter);

        // Both minters can mint
        vm.prank(minterAddr);
        uint256 id1 = voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(secondMinter);
        uint256 id2 = voterIdNFT.mint(user2, NULLIFIER_2);

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertTrue(voterIdNFT.hasVoterId(user1));
        assertTrue(voterIdNFT.hasVoterId(user2));
    }

    function test_SetStakeRecorder() public {
        address newRecorder = address(30);
        vm.prank(admin);
        voterIdNFT.setStakeRecorder(newRecorder);
        assertEq(voterIdNFT.stakeRecorder(), newRecorder);
    }

    function test_SetStakeRecorder_RevertNotOwner() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user1));
        voterIdNFT.setStakeRecorder(address(30));
    }

    function test_SetStakeRecorder_RevertZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert(VoterIdNFT.InvalidAddress.selector);
        voterIdNFT.setStakeRecorder(address(0));
    }

    // ====================================================
    // Minting Tests
    // ====================================================

    function test_Mint() public {
        vm.prank(minterAddr);
        uint256 tokenId = voterIdNFT.mint(user1, NULLIFIER_1);

        assertEq(tokenId, 1);
        assertEq(voterIdNFT.ownerOf(1), user1);
        assertEq(voterIdNFT.holderToTokenId(user1), 1);
        assertEq(voterIdNFT.tokenIdToHolder(1), user1);
        assertTrue(voterIdNFT.hasVoterId(user1));
        assertTrue(voterIdNFT.nullifierUsed(NULLIFIER_1));
        assertEq(voterIdNFT.getTokenIdForNullifier(NULLIFIER_1), tokenId);
    }

    function test_Mint_SequentialTokenIds() public {
        vm.startPrank(minterAddr);

        uint256 id1 = voterIdNFT.mint(user1, NULLIFIER_1);
        uint256 id2 = voterIdNFT.mint(user2, NULLIFIER_2);
        uint256 id3 = voterIdNFT.mint(user3, NULLIFIER_3);

        vm.stopPrank();

        assertEq(id1, 1);
        assertEq(id2, 2);
        assertEq(id3, 3);
    }

    function test_Mint_RevertNotMinter() public {
        vm.prank(user1);
        vm.expectRevert(VoterIdNFT.OnlyMinter.selector);
        voterIdNFT.mint(user1, NULLIFIER_1);
    }

    function test_Mint_RevertNullifierAlreadyUsed() public {
        vm.startPrank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.expectRevert(VoterIdNFT.NullifierAlreadyUsed.selector);
        voterIdNFT.mint(user2, NULLIFIER_1); // Same nullifier, different user
        vm.stopPrank();
    }

    function test_Mint_RevertAlreadyHasVoterId() public {
        vm.startPrank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.expectRevert(VoterIdNFT.AlreadyHasVoterId.selector);
        voterIdNFT.mint(user1, NULLIFIER_2); // Same user, different nullifier
        vm.stopPrank();
    }

    function test_Mint_EmitsVoterIdMinted() public {
        vm.prank(minterAddr);
        vm.expectEmit(true, true, true, true);
        emit VoterIdNFT.VoterIdMinted(1, user1, NULLIFIER_1);
        voterIdNFT.mint(user1, NULLIFIER_1);
    }

    function test_Mint_SucceedsForERC721ReceiverContract() public {
        vm.prank(minterAddr);
        uint256 tokenId = voterIdNFT.mint(address(receiverContract), NULLIFIER_1);

        assertEq(tokenId, 1);
        assertEq(voterIdNFT.ownerOf(tokenId), address(receiverContract));
        assertEq(voterIdNFT.holderToTokenId(address(receiverContract)), tokenId);
    }

    function test_Mint_RevertForNonERC721ReceiverContract() public {
        vm.prank(minterAddr);
        vm.expectRevert(
            abi.encodeWithSelector(IERC721Errors.ERC721InvalidReceiver.selector, address(nonReceiverContract))
        );
        voterIdNFT.mint(address(nonReceiverContract), NULLIFIER_1);
    }

    // ====================================================
    // Soulbound Enforcement Tests
    // ====================================================

    function test_Transfer_Reverts() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(user1);
        vm.expectRevert(VoterIdNFT.TransferNotAllowed.selector);
        voterIdNFT.transferFrom(user1, user2, 1);
    }

    function test_SafeTransfer_Reverts() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(user1);
        vm.expectRevert(VoterIdNFT.TransferNotAllowed.selector);
        voterIdNFT.safeTransferFrom(user1, user2, 1);
    }

    function test_Approve_Reverts() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(user1);
        vm.expectRevert(VoterIdNFT.ApprovalNotAllowed.selector);
        voterIdNFT.approve(user2, 1);
    }

    function test_SetApprovalForAll_Reverts() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(user1);
        vm.expectRevert(VoterIdNFT.ApprovalNotAllowed.selector);
        voterIdNFT.setApprovalForAll(user2, true);
    }

    // ====================================================
    // Stake Recording Tests
    // ====================================================

    function test_RecordStake() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(recorderAddr);
        voterIdNFT.recordStake(1, 100, 1, 50e6);

        assertEq(voterIdNFT.getEpochContentStake(1, 100, 1), 50e6);
    }

    function test_RecordStake_Cumulative() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.startPrank(recorderAddr);
        voterIdNFT.recordStake(1, 100, 1, 30e6);
        voterIdNFT.recordStake(1, 100, 1, 20e6);
        vm.stopPrank();

        assertEq(voterIdNFT.getEpochContentStake(1, 100, 1), 50e6);
    }

    function test_RecordStake_RevertNotStakeRecorder() public {
        vm.prank(user1);
        vm.expectRevert(VoterIdNFT.OnlyStakeRecorder.selector);
        voterIdNFT.recordStake(1, 100, 1, 50e6);
    }

    function test_RecordStake_EmitsStakeRecorded() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(recorderAddr);
        vm.expectEmit(true, true, true, true);
        emit VoterIdNFT.StakeRecorded(1, 100, 1, 50e6);
        voterIdNFT.recordStake(1, 100, 1, 50e6);
    }

    function test_GetRemainingStakeCapacity() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        // Before any staking, capacity is MAX_STAKE_PER_VOTER
        assertEq(voterIdNFT.getRemainingStakeCapacity(1, 100, 1), 100e6);

        // After staking 60, remaining is 40
        vm.prank(recorderAddr);
        voterIdNFT.recordStake(1, 100, 1, 60e6);
        assertEq(voterIdNFT.getRemainingStakeCapacity(1, 100, 1), 40e6);
    }

    function test_GetRemainingStakeCapacity_AtMax() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(recorderAddr);
        voterIdNFT.recordStake(1, 100, 1, 100e6);

        assertEq(voterIdNFT.getRemainingStakeCapacity(1, 100, 1), 0);
    }

    function test_GetRemainingStakeCapacity_BeyondMax() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        // recordStake now enforces MAX_STAKE_PER_VOTER defense-in-depth; a second call that
        // would push past the cap reverts rather than silently exceeding the tracked value.
        vm.startPrank(recorderAddr);
        voterIdNFT.recordStake(1, 100, 1, 80e6);
        vm.expectRevert(bytes("Stake cap exceeded"));
        voterIdNFT.recordStake(1, 100, 1, 40e6); // Would total 120e6, over MAX_STAKE_PER_VOTER.
        vm.stopPrank();

        assertEq(voterIdNFT.getRemainingStakeCapacity(1, 100, 1), uint256(20e6));
    }

    function test_StakeIndependentPerContentAndEpoch() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.startPrank(recorderAddr);
        voterIdNFT.recordStake(1, 100, 1, 50e6); // content 1, epoch 100
        voterIdNFT.recordStake(2, 100, 1, 70e6); // content 2, epoch 100
        voterIdNFT.recordStake(1, 101, 1, 30e6); // content 1, epoch 101
        vm.stopPrank();

        assertEq(voterIdNFT.getEpochContentStake(1, 100, 1), 50e6);
        assertEq(voterIdNFT.getEpochContentStake(2, 100, 1), 70e6);
        assertEq(voterIdNFT.getEpochContentStake(1, 101, 1), 30e6);
    }

    // ====================================================
    // Query Function Tests
    // ====================================================

    function test_HasVoterId_False() public view {
        assertFalse(voterIdNFT.hasVoterId(user1));
    }

    function test_HasVoterId_True() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);
        assertTrue(voterIdNFT.hasVoterId(user1));
    }

    function test_GetTokenId_Zero() public view {
        assertEq(voterIdNFT.getTokenId(user1), 0);
    }

    function test_GetTokenId_AfterMint() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);
        assertEq(voterIdNFT.getTokenId(user1), 1);
    }

    function test_GetHolder() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);
        assertEq(voterIdNFT.getHolder(1), user1);
    }

    function test_IsNullifierUsed() public {
        assertFalse(voterIdNFT.isNullifierUsed(NULLIFIER_1));

        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        assertTrue(voterIdNFT.isNullifierUsed(NULLIFIER_1));
        assertFalse(voterIdNFT.isNullifierUsed(NULLIFIER_2));
    }

    // ====================================================
    // Metadata Tests
    // ====================================================

    function test_TokenURI() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        string memory uri = voterIdNFT.tokenURI(1);
        // Should start with data:application/json;base64,
        assertTrue(bytes(uri).length > 35, "Token URI should be non-empty");
        // Verify the prefix
        bytes memory prefix = "data:application/json;base64,";
        for (uint256 i = 0; i < prefix.length; i++) {
            assertEq(bytes(uri)[i], prefix[i], "URI must start with data:application/json;base64,");
        }
    }

    function test_TokenURI_RevertNonexistentToken() public {
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 999));
        voterIdNFT.tokenURI(999);
    }

    // ====================================================
    // Revocation Tests (Governance)
    // ====================================================

    function test_RevokeVoterId() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        assertTrue(voterIdNFT.hasVoterId(user1));
        assertEq(voterIdNFT.ownerOf(1), user1);

        vm.prank(admin);
        voterIdNFT.revokeVoterId(user1);

        // NFT burned, mappings cleared
        assertFalse(voterIdNFT.hasVoterId(user1));
        assertEq(voterIdNFT.holderToTokenId(user1), 0);
        assertEq(voterIdNFT.tokenIdToHolder(1), address(0));

        // ownerOf should revert for burned token
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, 1));
        voterIdNFT.ownerOf(1);
    }

    function test_RevokeVoterId_EmitsEvent() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(admin);
        vm.expectEmit(true, true, true, true);
        emit VoterIdNFT.VoterIdRevoked(1, user1);
        voterIdNFT.revokeVoterId(user1);
    }

    function test_RevokeVoterId_RevertNotOwner() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(user2);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user2));
        voterIdNFT.revokeVoterId(user1);
    }

    function test_RevokeVoterId_RevertNoVoterId() public {
        vm.prank(admin);
        vm.expectRevert("No Voter ID");
        voterIdNFT.revokeVoterId(user1);
    }

    function test_RevokeVoterId_NullifierStaysUsed() public {
        // After revocation, the nullifier is still marked as used (prevents re-minting)
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(admin);
        voterIdNFT.revokeVoterId(user1);

        assertTrue(voterIdNFT.nullifierUsed(NULLIFIER_1), "Nullifier should remain used after revocation");

        // Attempting to mint with same nullifier should fail
        vm.prank(minterAddr);
        vm.expectRevert(VoterIdNFT.NullifierAlreadyUsed.selector);
        voterIdNFT.mint(user2, NULLIFIER_1);
    }

    function test_RevokeVoterId_CannotMintAgainToSameAddress() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(admin);
        voterIdNFT.revokeVoterId(user1);

        // holderToTokenId is cleared, but mint checks holderToTokenId != 0
        // After revocation holderToTokenId[user1] == 0, so mint would pass that check
        // But nullifier is still used, so must use a different nullifier
        vm.prank(minterAddr);
        uint256 newTokenId = voterIdNFT.mint(user1, NULLIFIER_2);

        // New token minted
        assertEq(newTokenId, 2);
        assertTrue(voterIdNFT.hasVoterId(user1));
        assertEq(voterIdNFT.getTokenId(user1), 2);
    }

    // ====================================================
    // Delegation Tests
    // ====================================================

    function test_SetDelegate() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(user1);
        voterIdNFT.setDelegate(user2);

        assertEq(voterIdNFT.pendingDelegateTo(user1), user2);
        assertEq(voterIdNFT.pendingDelegateOf(user2), user1);
        assertEq(voterIdNFT.delegateTo(user1), address(0));
        assertEq(voterIdNFT.delegateOf(user2), address(0));
        assertFalse(voterIdNFT.hasVoterId(user2));
        assertEq(voterIdNFT.resolveHolder(user2), address(0));

        vm.prank(user2);
        voterIdNFT.acceptDelegate();

        assertEq(voterIdNFT.delegateTo(user1), user2);
        assertEq(voterIdNFT.delegateOf(user2), user1);
        assertTrue(voterIdNFT.hasVoterId(user2));
        assertEq(voterIdNFT.getTokenId(user2), 1);
        assertEq(voterIdNFT.resolveHolder(user2), user1);
        assertEq(voterIdNFT.pendingDelegateTo(user1), address(0));
        assertEq(voterIdNFT.pendingDelegateOf(user2), address(0));
    }

    function test_SetDelegate_EmitsEvent() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(user1);
        vm.expectEmit(true, true, true, true);
        emit VoterIdNFT.DelegateRequested(user1, user2);
        voterIdNFT.setDelegate(user2);
    }

    function test_AcceptDelegate_EmitsEvent() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(user1);
        voterIdNFT.setDelegate(user2);

        vm.prank(user2);
        vm.expectEmit(true, true, true, true);
        emit VoterIdNFT.DelegateSet(user1, user2);
        voterIdNFT.acceptDelegate();
    }

    function test_SetDelegate_ReplacesExisting() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        _requestAndAcceptDelegate(user1, user2);

        vm.prank(user1);
        voterIdNFT.setDelegate(user3);

        // Existing delegate remains active until the replacement accepts.
        assertEq(voterIdNFT.delegateTo(user1), user2);
        assertEq(voterIdNFT.delegateOf(user2), user1);
        assertTrue(voterIdNFT.hasVoterId(user2));

        vm.prank(user3);
        voterIdNFT.acceptDelegate();

        // Old delegate cleared
        assertEq(voterIdNFT.delegateOf(user2), address(0));
        assertFalse(voterIdNFT.hasVoterId(user2));

        // New delegate set
        assertEq(voterIdNFT.delegateTo(user1), user3);
        assertEq(voterIdNFT.delegateOf(user3), user1);
        assertTrue(voterIdNFT.hasVoterId(user3));
    }

    function test_SetDelegate_ReplacesExisting_EmitsRemoveEvent() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        _requestAndAcceptDelegate(user1, user2);

        // Replacing should emit DelegateRemoved for old, then DelegateSet for new
        vm.prank(user1);
        voterIdNFT.setDelegate(user3);

        vm.prank(user3);
        vm.expectEmit(true, true, true, true);
        emit VoterIdNFT.DelegateRemoved(user1, user2);
        vm.expectEmit(true, true, true, true);
        emit VoterIdNFT.DelegateSet(user1, user3);
        voterIdNFT.acceptDelegate();
    }

    function test_SetDelegate_RevertNonHolder() public {
        // user2 has no SBT
        vm.prank(user2);
        vm.expectRevert(VoterIdNFT.CallerNotHolder.selector);
        voterIdNFT.setDelegate(user3);
    }

    function test_SetDelegate_RevertDelegateIsHolder() public {
        vm.startPrank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);
        voterIdNFT.mint(user2, NULLIFIER_2);
        vm.stopPrank();

        // user1 tries to delegate to user2 who also has an SBT
        vm.prank(user1);
        vm.expectRevert(VoterIdNFT.DelegateIsHolder.selector);
        voterIdNFT.setDelegate(user2);
    }

    function test_SetDelegate_RevertDelegateAlreadyAssigned() public {
        vm.startPrank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);
        voterIdNFT.mint(user3, NULLIFIER_3);
        vm.stopPrank();

        // user1 sets user2 as delegate
        vm.prank(user1);
        voterIdNFT.setDelegate(user2);

        // user3 tries to set user2 as their delegate too
        vm.prank(user3);
        vm.expectRevert(VoterIdNFT.DelegateAlreadyAssigned.selector);
        voterIdNFT.setDelegate(user2);
    }

    function test_SetDelegate_RevertCannotDelegateSelf() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(user1);
        vm.expectRevert(VoterIdNFT.CannotDelegateSelf.selector);
        voterIdNFT.setDelegate(user1);
    }

    function test_SetDelegate_RevertZeroAddress() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(user1);
        vm.expectRevert(VoterIdNFT.InvalidAddress.selector);
        voterIdNFT.setDelegate(address(0));
    }

    function test_RemoveDelegate() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        _requestAndAcceptDelegate(user1, user2);

        vm.startPrank(user1);
        voterIdNFT.removeDelegate();
        vm.stopPrank();

        assertEq(voterIdNFT.delegateTo(user1), address(0));
        assertEq(voterIdNFT.delegateOf(user2), address(0));
        assertFalse(voterIdNFT.hasVoterId(user2));
        assertEq(voterIdNFT.getTokenId(user2), 0);
    }

    function test_RemoveDelegate_EmitsEvent() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        _requestAndAcceptDelegate(user1, user2);

        vm.startPrank(user1);
        vm.expectEmit(true, true, true, true);
        emit VoterIdNFT.DelegateRemoved(user1, user2);
        voterIdNFT.removeDelegate();
        vm.stopPrank();
    }

    function test_RemoveDelegate_CancelsPendingRequest() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(user1);
        voterIdNFT.setDelegate(user2);

        vm.prank(user1);
        voterIdNFT.removeDelegate();

        assertEq(voterIdNFT.pendingDelegateTo(user1), address(0));
        assertEq(voterIdNFT.pendingDelegateOf(user2), address(0));
        assertEq(voterIdNFT.resolveHolder(user2), address(0));
    }

    function test_RemoveDelegate_TargetCanRejectPendingRequest() public {
        vm.startPrank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);
        voterIdNFT.mint(user3, NULLIFIER_3);
        vm.stopPrank();

        vm.prank(user1);
        voterIdNFT.setDelegate(user2);

        vm.prank(user3);
        vm.expectRevert(VoterIdNFT.DelegateAlreadyAssigned.selector);
        voterIdNFT.setDelegate(user2);

        vm.prank(user2);
        voterIdNFT.removeDelegate();

        assertEq(voterIdNFT.pendingDelegateTo(user1), address(0));
        assertEq(voterIdNFT.pendingDelegateOf(user2), address(0));

        vm.prank(user3);
        voterIdNFT.setDelegate(user2);

        vm.prank(user2);
        voterIdNFT.acceptDelegate();

        assertEq(voterIdNFT.delegateTo(user3), user2);
        assertEq(voterIdNFT.delegateOf(user2), user3);
    }

    function test_RemoveDelegate_DelegateCanResignAfterAcceptance() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        _requestAndAcceptDelegate(user1, user2);

        vm.prank(user2);
        vm.expectEmit(true, true, true, true);
        emit VoterIdNFT.DelegateRemoved(user1, user2);
        voterIdNFT.removeDelegate();

        assertEq(voterIdNFT.delegateTo(user1), address(0));
        assertEq(voterIdNFT.delegateOf(user2), address(0));
        assertFalse(voterIdNFT.hasVoterId(user2));
        assertEq(voterIdNFT.resolveHolder(user2), address(0));
    }

    function test_RemoveDelegate_RevertNoDelegateSet() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(user1);
        vm.expectRevert(VoterIdNFT.NoDelegateSet.selector);
        voterIdNFT.removeDelegate();
    }

    function test_RevokeVoterId_ClearsDelegation() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        _requestAndAcceptDelegate(user1, user2);

        // Verify delegate works
        assertTrue(voterIdNFT.hasVoterId(user2));

        // Admin revokes user1's SBT
        vm.prank(admin);
        voterIdNFT.revokeVoterId(user1);

        // Delegation should be cleared
        assertEq(voterIdNFT.delegateTo(user1), address(0));
        assertEq(voterIdNFT.delegateOf(user2), address(0));
        assertFalse(voterIdNFT.hasVoterId(user2));
        assertEq(voterIdNFT.getTokenId(user2), 0);
    }

    function test_GetTokenId_ResolvesDelegation() public {
        vm.prank(minterAddr);
        uint256 tokenId = voterIdNFT.mint(user1, NULLIFIER_1);

        _requestAndAcceptDelegate(user1, user2);

        // Delegate returns the holder's token ID
        assertEq(voterIdNFT.getTokenId(user2), tokenId);
        assertEq(voterIdNFT.getTokenId(user1), tokenId);
    }

    function test_ResolveHolder_DirectHolder() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        assertEq(voterIdNFT.resolveHolder(user1), user1);
    }

    function test_ResolveHolder_Delegate() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        _requestAndAcceptDelegate(user1, user2);

        assertEq(voterIdNFT.resolveHolder(user2), user1);
    }

    function test_ResolveHolder_Neither() public view {
        assertEq(voterIdNFT.resolveHolder(user3), address(0));
    }

    function test_Mint_ClearsInboundDelegation() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        // user2 is now a delegate for user1
        _requestAndAcceptDelegate(user1, user2);

        vm.prank(minterAddr);
        vm.expectEmit(true, true, true, true);
        emit VoterIdNFT.DelegateRemoved(user1, user2);
        uint256 tokenId = voterIdNFT.mint(user2, NULLIFIER_2);

        assertEq(tokenId, 2);
        assertEq(voterIdNFT.ownerOf(tokenId), user2);
        assertEq(voterIdNFT.resolveHolder(user2), user2);
        assertEq(voterIdNFT.delegateOf(user2), address(0));
        assertEq(voterIdNFT.delegateTo(user1), address(0));
    }

    // ====================================================
    // Nullifier Reset Tests
    // ====================================================

    function test_ResetNullifier_AllowsRemint() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(admin);
        voterIdNFT.revokeVoterId(user1);

        // Nullifier still used — cannot mint
        assertTrue(voterIdNFT.nullifierUsed(NULLIFIER_1));
        assertTrue(voterIdNFT.nullifierResettable(NULLIFIER_1));

        // Reset nullifier
        vm.prank(admin);
        voterIdNFT.resetNullifier(NULLIFIER_1);

        assertFalse(voterIdNFT.nullifierUsed(NULLIFIER_1));
        assertFalse(voterIdNFT.nullifierResettable(NULLIFIER_1));

        // Now can mint with same nullifier to new address
        vm.prank(minterAddr);
        uint256 newTokenId = voterIdNFT.mint(user2, NULLIFIER_1);

        assertTrue(voterIdNFT.hasVoterId(user2));
        assertEq(newTokenId, 2);
        assertEq(voterIdNFT.getTokenIdForNullifier(NULLIFIER_1), newTokenId);
        assertFalse(voterIdNFT.nullifierResettable(NULLIFIER_1));
    }

    function test_ResetNullifier_RevertsForActiveNullifier() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(admin);
        vm.expectRevert("Nullifier not revoked");
        voterIdNFT.resetNullifier(NULLIFIER_1);
    }

    function test_ResetNullifier_RevertsForNeverUsedNullifier() public {
        vm.prank(admin);
        vm.expectRevert("Nullifier not used");
        voterIdNFT.resetNullifier(NULLIFIER_1);
    }

    function test_ResetNullifier_RevertsAfterAlreadyReset() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(admin);
        voterIdNFT.revokeVoterId(user1);

        vm.prank(admin);
        voterIdNFT.resetNullifier(NULLIFIER_1);

        vm.prank(admin);
        vm.expectRevert("Nullifier not used");
        voterIdNFT.resetNullifier(NULLIFIER_1);
    }

    function test_ResetNullifier_DoesNotBypassStakeCap() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(recorderAddr);
        voterIdNFT.recordStake(1, 100, 1, 100e6);

        vm.prank(admin);
        voterIdNFT.revokeVoterId(user1);

        vm.prank(admin);
        voterIdNFT.resetNullifier(NULLIFIER_1);

        vm.prank(minterAddr);
        uint256 newTokenId = voterIdNFT.mint(user2, NULLIFIER_1);

        assertEq(newTokenId, 2);
        assertEq(voterIdNFT.getEpochContentStake(1, 100, newTokenId), 100e6);
        assertEq(voterIdNFT.getRemainingStakeCapacity(1, 100, newTokenId), 0);
    }

    function test_RevokeVoterId_KeepsRevokedTokenNullifierSnapshot() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(admin);
        voterIdNFT.revokeVoterId(user1);

        vm.prank(admin);
        voterIdNFT.resetNullifier(NULLIFIER_1);

        vm.prank(minterAddr);
        uint256 newTokenId = voterIdNFT.mint(user2, NULLIFIER_1);

        vm.prank(recorderAddr);
        voterIdNFT.recordStake(1, 100, newTokenId, 50e6);

        assertEq(voterIdNFT.getNullifier(1), NULLIFIER_1);
        assertEq(voterIdNFT.getEpochContentStake(1, 100, 1), 50e6);
        assertEq(voterIdNFT.getEpochContentStake(1, 100, newTokenId), 50e6);
    }

    function test_ResetNullifier_RevertNotOwner() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user1));
        voterIdNFT.resetNullifier(NULLIFIER_1);
    }

    function test_ResetNullifier_EmitsEvent() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        vm.prank(admin);
        voterIdNFT.revokeVoterId(user1);

        vm.prank(admin);
        vm.expectEmit(true, true, true, true);
        emit VoterIdNFT.NullifierReset(NULLIFIER_1);
        voterIdNFT.resetNullifier(NULLIFIER_1);
    }

    function test_Delegation_HolderStillWorks() public {
        vm.prank(minterAddr);
        voterIdNFT.mint(user1, NULLIFIER_1);

        _requestAndAcceptDelegate(user1, user2);

        // Holder still has their Voter ID
        assertTrue(voterIdNFT.hasVoterId(user1));
        assertEq(voterIdNFT.getTokenId(user1), 1);
        assertEq(voterIdNFT.resolveHolder(user1), user1);
    }
}
