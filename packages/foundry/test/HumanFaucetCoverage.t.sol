// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test } from "forge-std/Test.sol";
import { HumanFaucet } from "../contracts/HumanFaucet.sol";
import { MockIdentityVerificationHub } from "../contracts/mocks/MockIdentityVerificationHub.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { VoterIdNFT } from "../contracts/VoterIdNFT.sol";
import { ISelfVerificationRoot } from "@selfxyz/contracts/contracts/interfaces/ISelfVerificationRoot.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";

// =========================================================================
// TEST CONTRACT: HumanFaucet Coverage Gaps
// =========================================================================

/// @title HumanFaucetCoverageTest
/// @notice Tests for coverage gaps in HumanFaucet: setVoterIdNFT, transferOwnership, tier boundary
///         edge cases, getRemainingBalance/Claims, getScope, InsufficientFaucetBalance, VoterIdMinted event.
contract HumanFaucetCoverageTest is Test {
    HumanFaucet public faucet;
    MockIdentityVerificationHub public mockHub;
    CuryoReputation public crepToken;
    MockVoterIdNFT public mockVoterIdNFT;

    address public admin = address(1);
    address public user1 = address(2);
    address public user2 = address(3);
    address public nonOwner = address(99);

    uint256 public constant TIER_0_AMOUNT = 10_000e6;
    uint256 public constant TIER_1_AMOUNT = 1_000e6;
    uint256 public constant TIER_2_AMOUNT = 100e6;
    uint256 public constant TIER_3_AMOUNT = 10e6;
    uint256 public constant TIER_4_AMOUNT = 1e6;

    function setUp() public {
        vm.startPrank(admin);

        crepToken = new CuryoReputation(admin, admin);
        mockHub = new MockIdentityVerificationHub();
        mockVoterIdNFT = new MockVoterIdNFT();

        faucet = new HumanFaucet(address(crepToken), address(mockHub), admin);

        uint256 faucetBalance = 52_000_000 * 1e6;
        crepToken.grantRole(crepToken.MINTER_ROLE(), admin);
        crepToken.mint(address(faucet), faucetBalance);
        crepToken.revokeRole(crepToken.MINTER_ROLE(), admin);

        bytes32 mockConfigId = mockHub.MOCK_CONFIG_ID();
        faucet.setConfigId(mockConfigId);

        vm.stopPrank();
    }

    // =========================================================================
    // 1. setVoterIdNFT
    // =========================================================================

    function test_SetVoterIdNFT_Success() public {
        vm.prank(admin);
        vm.expectEmit(true, false, false, false);
        emit HumanFaucet.VoterIdNFTSet(address(mockVoterIdNFT));
        faucet.setVoterIdNFT(address(mockVoterIdNFT));

        assertEq(address(faucet.voterIdNFT()), address(mockVoterIdNFT));
    }

    function test_SetVoterIdNFT_ZeroAddress_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("Invalid address");
        faucet.setVoterIdNFT(address(0));
    }

    function test_SetVoterIdNFT_NonOwner_Reverts() public {
        vm.prank(nonOwner);
        vm.expectRevert();
        faucet.setVoterIdNFT(address(mockVoterIdNFT));
    }

    // =========================================================================
    // 2. VoterIdNFT MINTING ON CLAIM
    // =========================================================================

    function test_Claim_MintsVoterIdNFT_WhenSet() public {
        vm.prank(admin);
        faucet.setVoterIdNFT(address(mockVoterIdNFT));

        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        // VoterIdNFT should have been minted
        assertTrue(mockVoterIdNFT.hasVoterId(user1));
        assertEq(crepToken.balanceOf(user1), TIER_0_AMOUNT);
    }

    function test_Claim_DoesNotMintVoterIdNFT_WhenNotSet() public {
        // voterIdNFT is address(0) — no minting should happen
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        assertEq(crepToken.balanceOf(user1), TIER_0_AMOUNT);
        // No revert, no minting
    }

    function test_Claim_ClearsInboundDelegation_WhenUsingRealVoterIdNFT() public {
        VoterIdNFT realVoterIdNFT = _deployRealVoterIdNFT();

        vm.prank(admin);
        realVoterIdNFT.mint(user1, 111111);

        vm.prank(user1);
        realVoterIdNFT.setDelegate(user2);

        assertEq(realVoterIdNFT.resolveHolder(user2), user1);

        vm.prank(admin);
        faucet.setVoterIdNFT(address(realVoterIdNFT));

        mockHub.setVerified(user2);
        mockHub.simulateVerification(address(faucet), user2);

        assertEq(realVoterIdNFT.resolveHolder(user2), user2);
        assertEq(realVoterIdNFT.delegateOf(user2), address(0));
        assertEq(realVoterIdNFT.delegateTo(user1), address(0));
    }

    function test_RetryVoterIdMint_AllowsDelegatedClaimerWithoutDirectId() public {
        mockHub.setVerified(user2);
        mockHub.simulateVerification(address(faucet), user2);
        assertTrue(faucet.hasClaimed(user2));

        VoterIdNFT realVoterIdNFT = _deployRealVoterIdNFT();

        vm.prank(admin);
        realVoterIdNFT.mint(user1, 222222);

        vm.prank(user1);
        realVoterIdNFT.setDelegate(user2);

        assertEq(realVoterIdNFT.resolveHolder(user2), user1);

        vm.prank(admin);
        faucet.setVoterIdNFT(address(realVoterIdNFT));

        vm.prank(admin);
        faucet.retryVoterIdMint(user2);

        assertEq(realVoterIdNFT.resolveHolder(user2), user2);
        assertEq(realVoterIdNFT.delegateOf(user2), address(0));
        assertEq(realVoterIdNFT.delegateTo(user1), address(0));
    }

    function test_Claim_RevertsWhenAddressAlreadyClaimedEvenWithFreshNullifier() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        mockHub.setVerified(user1);
        vm.expectRevert(HumanFaucet.AddressAlreadyClaimed.selector);
        mockHub.simulateVerification(address(faucet), user1);
    }

    // =========================================================================
    // 3. transferOwnership — governance restriction
    // =========================================================================

    function test_TransferOwnership_ToGovernance_Succeeds() public {
        // governance == admin in our setUp
        vm.prank(admin);
        faucet.transferOwnership(admin);

        assertEq(faucet.owner(), admin);
    }

    function test_TransferOwnership_ToNonGovernance_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("Can only transfer to governance");
        faucet.transferOwnership(nonOwner);
    }

    function test_TransferOwnership_NonOwner_Reverts() public {
        vm.prank(nonOwner);
        vm.expectRevert();
        faucet.transferOwnership(admin);
    }

    // =========================================================================
    // 4. getScope
    // =========================================================================

    function test_GetScope_ReturnsValue() public view {
        // Scope is derived from SelfVerificationRoot constructor — just verify it's callable
        faucet.getScope();
    }

    // =========================================================================
    // 5. getRemainingBalance & getRemainingClaims
    // =========================================================================

    function test_GetRemainingBalance_ReturnsCorrectBalance() public view {
        uint256 expected = 52_000_000e6;
        assertEq(faucet.getRemainingBalance(), expected);
    }

    function test_GetRemainingBalance_DecreasesAfterClaim() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        assertEq(faucet.getRemainingBalance(), 52_000_000e6 - TIER_0_AMOUNT);
    }

    function test_GetRemainingClaims_Tier0() public view {
        // 52M / 10,000 = 5,200 claims at tier 0
        assertEq(faucet.getRemainingClaims(), 52_000_000e6 / TIER_0_AMOUNT);
    }

    function test_GetRemainingClaims_DecreasesAfterClaim() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        uint256 remaining = faucet.getRemainingClaims();
        assertEq(remaining, (52_000_000e6 - TIER_0_AMOUNT) / TIER_0_AMOUNT);
    }

    function test_GetRemainingClaims_ZeroBalance_ReturnsZero() public {
        _drainFaucet(crepToken.balanceOf(address(faucet)));

        assertEq(faucet.getRemainingClaims(), 0);
    }

    // =========================================================================
    // 6. InsufficientFaucetBalance
    // =========================================================================

    function test_Claim_InsufficientBalance_Reverts() public {
        _drainFaucet(52_000_000e6 - 1e6);

        mockHub.setVerified(user1);
        vm.expectRevert(HumanFaucet.InsufficientFaucetBalance.selector);
        mockHub.simulateVerification(address(faucet), user1);
    }

    function test_Claim_InsufficientBalance_WithReferral_Reverts() public {
        // First claim to create a valid referrer
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        // Withdraw most tokens — leave enough for base claim but not base+referral
        uint256 balance = crepToken.balanceOf(address(faucet));
        // Leave TIER_0_AMOUNT (10,000) which is less than needed with referral (10,000+5,000+5,000=20,000)
        _drainFaucet(balance - TIER_0_AMOUNT);

        // Claim with referral should fail — needs 15,000 for claimant + 5,000 for referrer
        mockHub.setVerified(user2);
        bytes memory userData = abi.encodePacked(user1);
        vm.expectRevert(HumanFaucet.InsufficientFaucetBalance.selector);
        mockHub.simulateVerificationWithUserData(address(faucet), user2, userData);
    }

    // =========================================================================
    // 7. TIER BOUNDARY EDGE CASES (precise boundaries)
    // =========================================================================

    function test_TierInfo_Tier1_Boundary() public {
        _setTotalClaimants(10);

        (uint256 tier,,,, uint256 inTier, uint256 untilNext) = faucet.getTierInfo();
        assertEq(tier, 1);
        assertEq(inTier, 0); // 10 - 10 = 0
        assertEq(untilNext, 990); // 1000 - 10
    }

    function test_TierInfo_Tier2_Boundary() public {
        _setTotalClaimants(1000);

        (uint256 tier,,,, uint256 inTier, uint256 untilNext) = faucet.getTierInfo();
        assertEq(tier, 2);
        assertEq(inTier, 0); // 1000 - 1000 = 0
        assertEq(untilNext, 9000); // 10000 - 1000
    }

    function test_TierInfo_Tier3_Boundary() public {
        _setTotalClaimants(10000);

        (uint256 tier,,,, uint256 inTier, uint256 untilNext) = faucet.getTierInfo();
        assertEq(tier, 3);
        assertEq(inTier, 0); // 10000 - 10000 = 0
        assertEq(untilNext, 990000); // 1000000 - 10000
    }

    function test_TierInfo_Tier4() public {
        _setTotalClaimants(1_000_000);

        (uint256 tier,,,, uint256 inTier, uint256 untilNext) = faucet.getTierInfo();
        assertEq(tier, 4);
        assertEq(inTier, 0); // 1000000 - 1000000 = 0
        assertEq(untilNext, 0); // Final tier
    }

    function test_TierInfo_Tier4_WithClaimants() public {
        _setTotalClaimants(2_000_000);

        (uint256 tier,,,, uint256 inTier, uint256 untilNext) = faucet.getTierInfo();
        assertEq(tier, 4);
        assertEq(inTier, 1_000_000); // 2M - 1M = 1M
        assertEq(untilNext, 0); // Final tier, no next
    }

    // =========================================================================
    // 8. REFERRAL WITH VOTER ID NFT CHECK
    // =========================================================================

    function test_IsValidReferrer_RequiresVoterIdWhenSet() public {
        // Claim without VoterIdNFT set
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);
        assertTrue(faucet.isValidReferrer(user1));

        // Now set VoterIdNFT — user1 doesn't have one
        vm.prank(admin);
        faucet.setVoterIdNFT(address(mockVoterIdNFT));

        assertFalse(faucet.isValidReferrer(user1));

        // Give user1 a VoterId
        mockVoterIdNFT.setHolder(user1);
        assertTrue(faucet.isValidReferrer(user1));
    }

    function test_IsValidReferrer_NotClaimed_ReturnsFalse() public view {
        assertFalse(faucet.isValidReferrer(user1));
    }

    // =========================================================================
    // 9. WITHDRAW EDGE CASES
    // =========================================================================

    function test_WithdrawRemaining_AmountExceedsBalance_CapsToBalance() public {
        uint256 amount = crepToken.balanceOf(address(faucet)) + 1_000_000e6;
        vm.prank(admin);
        vm.expectRevert("Withdraw disabled");
        faucet.withdrawRemaining(admin, amount);
    }

    function test_WithdrawRemaining_ZeroBalance_Reverts() public {
        _drainFaucet(crepToken.balanceOf(address(faucet)));
        vm.prank(admin);
        vm.expectRevert("Withdraw disabled");
        faucet.withdrawRemaining(admin, 1e6);
    }

    // =========================================================================
    // 10. getConfigId
    // =========================================================================

    function test_GetConfigId_ReturnsSetValue() public view {
        bytes32 configId = faucet.getConfigId(bytes32(0), bytes32(0), "");
        assertEq(configId, mockHub.MOCK_CONFIG_ID());
    }

    // =========================================================================
    // 11. REFERRAL ACROSS TIER BOUNDARY
    // =========================================================================

    function test_ReferralAcrossTier0To1Boundary() public {
        // Fill tier 0 to 9 claimants
        _claimForNUsers(9);
        assertEq(faucet.getCurrentTier(), 0);

        // Claimant #10 claims at tier 0 WITH referral
        address referrer = address(uint160(10000)); // One of the first 9 claimants
        assertTrue(faucet.hasClaimed(referrer));

        address boundaryUser = address(uint160(90000));
        mockHub.setVerified(boundaryUser);
        bytes memory userData = abi.encodePacked(referrer);
        mockHub.simulateVerificationWithUserData(address(faucet), boundaryUser, userData);

        // Claimant gets tier 0 rate + referral bonus
        assertEq(crepToken.balanceOf(boundaryUser), TIER_0_AMOUNT + 5_000e6);

        // Tier should now be 1
        assertEq(faucet.getCurrentTier(), 1);
    }

    function test_ReferralAcrossTier1To2Boundary_UsesTier1AmountsAndEmitsTier2() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        _setTotalClaimants(999);

        address boundaryUser = address(uint160(90001));
        mockHub.setVerified(boundaryUser);
        bytes memory userData = abi.encodePacked(user1);

        vm.expectEmit(false, false, false, true);
        emit HumanFaucet.TierChanged(2, TIER_2_AMOUNT, 1000);

        mockHub.simulateVerificationWithUserData(address(faucet), boundaryUser, userData);

        assertEq(crepToken.balanceOf(boundaryUser), TIER_1_AMOUNT + 500e6);
        assertEq(faucet.referralEarnings(user1), 500e6);
        assertEq(faucet.getCurrentTier(), 2);
    }

    function test_ReferralAcrossTier2To3Boundary_UsesTier2AmountsAndEmitsTier3() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        _setTotalClaimants(9_999);

        address boundaryUser = address(uint160(90002));
        mockHub.setVerified(boundaryUser);
        bytes memory userData = abi.encodePacked(user1);

        vm.expectEmit(false, false, false, true);
        emit HumanFaucet.TierChanged(3, TIER_3_AMOUNT, 10_000);

        mockHub.simulateVerificationWithUserData(address(faucet), boundaryUser, userData);

        assertEq(crepToken.balanceOf(boundaryUser), TIER_2_AMOUNT + 50e6);
        assertEq(faucet.referralEarnings(user1), 50e6);
        assertEq(faucet.getCurrentTier(), 3);
    }

    function test_ClaimAcrossTier3To4Boundary_UsesTier3RateAndEmitsTier4() public {
        _setTotalClaimants(999_999);

        address boundaryUser = address(uint160(90003));
        mockHub.setVerified(boundaryUser);

        vm.expectEmit(false, false, false, true);
        emit HumanFaucet.TierChanged(4, TIER_4_AMOUNT, 1_000_000);

        mockHub.simulateVerification(address(faucet), boundaryUser);

        assertEq(crepToken.balanceOf(boundaryUser), TIER_3_AMOUNT);
        assertEq(faucet.getCurrentTier(), 4);
    }

    // =========================================================================
    // 12. CONSTRUCTOR VALIDATION
    // =========================================================================

    function test_Constructor_ZeroGovernance_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("Invalid governance");
        new HumanFaucet(address(crepToken), address(mockHub), address(0));
    }

    // =========================================================================
    // 13. CLAIM AMOUNT AT EACH TIER (with actual claims via storage manipulation)
    // =========================================================================

    function test_ClaimAmount_AtTier1() public {
        _setTotalClaimants(10);
        assertEq(faucet.getCurrentClaimAmount(), TIER_1_AMOUNT);
    }

    function test_ClaimAmount_AtTier2() public {
        _setTotalClaimants(1000);
        assertEq(faucet.getCurrentClaimAmount(), TIER_2_AMOUNT);
    }

    function test_ClaimAmount_AtTier3() public {
        _setTotalClaimants(10000);
        assertEq(faucet.getCurrentClaimAmount(), TIER_3_AMOUNT);
    }

    function test_ClaimAmount_AtTier4() public {
        _setTotalClaimants(1_000_000);
        assertEq(faucet.getCurrentClaimAmount(), TIER_4_AMOUNT);
    }

    function test_ClaimAmount_AtTier4_VeryLargeClaimants() public {
        _setTotalClaimants(100_000_000);
        assertEq(faucet.getCurrentClaimAmount(), TIER_4_AMOUNT);
    }

    // =========================================================================
    // 14. REFERRAL DATA DECODE — 32-byte format
    // =========================================================================

    function test_Referral_32ByteUserData() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        mockHub.setVerified(user2);
        // 32-byte encoded address
        bytes memory userData = abi.encode(user1);
        assertEq(userData.length, 32);

        mockHub.simulateVerificationWithUserData(address(faucet), user2, userData);

        // Referral should work with 32-byte format
        assertEq(faucet.referredBy(user2), user1);
    }

    // =========================================================================
    // 15. REFERRAL WITH ZERO-ADDRESS REFERRER (20 bytes of zeros)
    // =========================================================================

    function test_Referral_ZeroAddressReferrer_NoBonus() public {
        mockHub.setVerified(user1);
        bytes memory userData = abi.encodePacked(address(0));
        mockHub.simulateVerificationWithUserData(address(faucet), user1, userData);

        assertEq(crepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertEq(faucet.referredBy(user1), address(0));
    }

    // =========================================================================
    // 16. M-11: REFERRER WITH REVOKED VOTER ID GETS NO BONUS
    // =========================================================================

    function test_Referral_RevokedVoterIdReferrer_NoBonus() public {
        // Set VoterID NFT on faucet
        vm.prank(admin);
        faucet.setVoterIdNFT(address(mockVoterIdNFT));

        // user1 claims (gets VoterID minted via mock)
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);
        assertTrue(faucet.hasClaimed(user1));
        assertTrue(mockVoterIdNFT.hasVoterId(user1));

        // Revoke user1's VoterID
        mockVoterIdNFT.removeHolder(user1);
        assertFalse(mockVoterIdNFT.hasVoterId(user1));

        // user2 claims with user1 as referrer — should get NO referral bonus
        mockHub.setVerified(user2);
        bytes memory userData = abi.encodePacked(user1);
        mockHub.simulateVerificationWithUserData(address(faucet), user2, userData);

        // user2 should get base tier amount only (no referral bonus)
        assertEq(crepToken.balanceOf(user2), TIER_0_AMOUNT);
        // user1 should NOT get referrer reward
        assertEq(faucet.referralCount(user1), 0);
        // referredBy should not be set
        assertEq(faucet.referredBy(user2), address(0));
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _claimForNUsers(uint256 n) internal {
        uint256 startId = faucet.totalClaimants();
        for (uint256 i = 0; i < n; i++) {
            address newUser = address(uint160(10000 + startId + i));
            mockHub.setVerified(newUser);
            mockHub.simulateVerification(address(faucet), newUser);
        }
    }

    /// @dev Storage slot 6 for totalClaimants (from `forge inspect HumanFaucet storage`)
    function _setTotalClaimants(uint256 value) internal {
        vm.store(address(faucet), bytes32(uint256(6)), bytes32(value));
    }

    function _drainFaucet(uint256 amount) internal {
        vm.prank(address(faucet));
        crepToken.transfer(admin, amount);
    }

    function _deployRealVoterIdNFT() internal returns (VoterIdNFT realVoterIdNFT) {
        vm.startPrank(admin);
        realVoterIdNFT = new VoterIdNFT(admin, admin);
        realVoterIdNFT.addMinter(admin);
        realVoterIdNFT.addMinter(address(faucet));
        vm.stopPrank();
    }
}
