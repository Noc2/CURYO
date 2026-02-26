// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test, console } from "forge-std/Test.sol";
import { HumanFaucet } from "../contracts/HumanFaucet.sol";
import { MockIdentityVerificationHub } from "../contracts/mocks/MockIdentityVerificationHub.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { ISelfVerificationRoot } from "@selfxyz/contracts/contracts/interfaces/ISelfVerificationRoot.sol";

/// @title HumanFaucet Test Suite
contract HumanFaucetTest is Test {
    HumanFaucet public faucet;
    MockIdentityVerificationHub public mockHub;
    CuryoReputation public crepToken;

    address public admin = address(1);
    address public user1 = address(2);
    address public user2 = address(3);

    // Tier amounts
    uint256 public constant TIER_0_AMOUNT = 10_000e6; // 10,000 cREP (Genesis)
    uint256 public constant TIER_1_AMOUNT = 1_000e6; // 1,000 cREP (Early Adopter)
    uint256 public constant TIER_2_AMOUNT = 100e6; // 100 cREP (Pioneer)
    uint256 public constant TIER_3_AMOUNT = 10e6; // 10 cREP (Explorer)
    uint256 public constant TIER_4_AMOUNT = 1e6; // 1 cREP (Settler)

    // Tier thresholds
    uint256 public constant TIER_0_THRESHOLD = 10;
    uint256 public constant TIER_1_THRESHOLD = 1_000;
    uint256 public constant TIER_2_THRESHOLD = 10_000;
    uint256 public constant TIER_3_THRESHOLD = 1_000_000;

    // Tier 0 referral amounts (50% of 10,000 cREP)
    uint256 public constant TIER_0_REFERRAL_BONUS = 5_000e6;
    uint256 public constant TIER_0_REFERRER_REWARD = 5_000e6;

    function setUp() public {
        vm.startPrank(admin);

        // Deploy cREP token
        crepToken = new CuryoReputation(admin, admin);

        // Deploy mock identity verification hub
        mockHub = new MockIdentityVerificationHub();

        // Deploy HumanFaucet
        faucet = new HumanFaucet(address(crepToken), address(mockHub), admin);

        // Pre-mint tokens to faucet (52M for production, using same for tests)
        uint256 faucetBalance = 52_000_000 * 1e6; // 52M cREP
        crepToken.grantRole(crepToken.MINTER_ROLE(), admin);
        crepToken.mint(address(faucet), faucetBalance);
        crepToken.revokeRole(crepToken.MINTER_ROLE(), admin);

        // Set the mock config ID
        bytes32 mockConfigId = mockHub.MOCK_CONFIG_ID();
        faucet.setConfigId(mockConfigId);

        vm.stopPrank();
    }

    // --- Initialization Tests ---

    function test_Initialization() public view {
        assertEq(address(faucet.crepToken()), address(crepToken));
        assertEq(faucet.TIER_0_AMOUNT(), TIER_0_AMOUNT);
        assertEq(faucet.totalClaimed(), 0);
        assertEq(faucet.totalClaimants(), 0);
        assertEq(faucet.getCurrentClaimAmount(), TIER_0_AMOUNT);
        assertEq(faucet.getCurrentTier(), 0);
    }

    function test_ConfigIdSet() public view {
        bytes32 configId = faucet.verificationConfigId();
        assertEq(configId, mockHub.MOCK_CONFIG_ID());
    }

    // --- Claim Tests ---

    function test_Claim_Success() public {
        mockHub.setVerified(user1);

        assertEq(crepToken.balanceOf(user1), 0);
        assertFalse(faucet.hasClaimed(user1));
        assertEq(faucet.totalClaimants(), 0);

        mockHub.simulateVerification(address(faucet), user1);

        // Tier 0 (Genesis): 10,000 cREP
        assertEq(crepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertTrue(faucet.hasClaimed(user1));
        assertEq(faucet.totalClaimants(), 1);
        assertEq(faucet.totalClaimed(), TIER_0_AMOUNT);
    }

    function test_Claim_MultipleUsers() public {
        mockHub.setVerified(user1);
        mockHub.setVerified(user2);

        mockHub.simulateVerification(address(faucet), user1);
        assertEq(crepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertEq(faucet.totalClaimants(), 1);

        mockHub.simulateVerification(address(faucet), user2);
        assertEq(crepToken.balanceOf(user2), TIER_0_AMOUNT);
        assertEq(faucet.totalClaimants(), 2);
        assertEq(faucet.totalClaimed(), TIER_0_AMOUNT * 2);
    }

    // --- Tier Tests ---

    function test_TierTransitions() public {
        // Tier 0 (Genesis): first 10 claims at 10,000 cREP
        assertEq(faucet.getCurrentTier(), 0);
        assertEq(faucet.getCurrentClaimAmount(), TIER_0_AMOUNT);

        _claimForNUsers(9);
        assertEq(faucet.getCurrentTier(), 0); // Still tier 0

        // 10th claim tips to tier 1
        _claimForNUsers(1);
        assertEq(faucet.totalClaimants(), 10);
        assertEq(faucet.getCurrentTier(), 1);
        assertEq(faucet.getCurrentClaimAmount(), TIER_1_AMOUNT);
    }

    function test_TierBoundary_ClaimantGetsCurrentTierRate() public {
        // Fill up to 9 claimants
        _claimForNUsers(9);
        assertEq(faucet.getCurrentTier(), 0);

        // Claimant #10 claims at tier 0 rate
        address boundaryUser = address(uint160(50000));
        mockHub.setVerified(boundaryUser);
        mockHub.simulateVerification(address(faucet), boundaryUser);
        assertEq(crepToken.balanceOf(boundaryUser), TIER_0_AMOUNT);

        // Now totalClaimants == 10, tier transitions to 1
        assertEq(faucet.getCurrentTier(), 1);

        // Next claimant gets tier 1 rate
        address nextUser = address(uint160(50001));
        mockHub.setVerified(nextUser);
        mockHub.simulateVerification(address(faucet), nextUser);
        assertEq(crepToken.balanceOf(nextUser), TIER_1_AMOUNT);
    }

    function test_GetCurrentTier_AllTiers() public {
        // Use vm.store to set totalClaimants directly for higher tiers
        // First, find the storage slot for totalClaimants by testing tier 0
        assertEq(faucet.getCurrentTier(), 0);

        // Advance to tier 0/1 boundary (Genesis → Early Adopter)
        _setTotalClaimants(9);
        assertEq(faucet.getCurrentTier(), 0);

        _setTotalClaimants(10);
        assertEq(faucet.getCurrentTier(), 1);

        _setTotalClaimants(999);
        assertEq(faucet.getCurrentTier(), 1);

        _setTotalClaimants(1000);
        assertEq(faucet.getCurrentTier(), 2);

        _setTotalClaimants(9999);
        assertEq(faucet.getCurrentTier(), 2);

        _setTotalClaimants(10000);
        assertEq(faucet.getCurrentTier(), 3);

        _setTotalClaimants(999999);
        assertEq(faucet.getCurrentTier(), 3);

        _setTotalClaimants(1000000);
        assertEq(faucet.getCurrentTier(), 4);

        _setTotalClaimants(10000000);
        assertEq(faucet.getCurrentTier(), 4);
    }

    function test_GetCurrentClaimAmount_AllTiers() public {
        _setTotalClaimants(0);
        assertEq(faucet.getCurrentClaimAmount(), TIER_0_AMOUNT);

        _setTotalClaimants(TIER_0_THRESHOLD);
        assertEq(faucet.getCurrentClaimAmount(), TIER_1_AMOUNT);

        _setTotalClaimants(TIER_1_THRESHOLD);
        assertEq(faucet.getCurrentClaimAmount(), TIER_2_AMOUNT);

        _setTotalClaimants(TIER_2_THRESHOLD);
        assertEq(faucet.getCurrentClaimAmount(), TIER_3_AMOUNT);

        _setTotalClaimants(TIER_3_THRESHOLD);
        assertEq(faucet.getCurrentClaimAmount(), TIER_4_AMOUNT);
    }

    function test_ReferralAmountsScaleWithTier() public {
        // Tier 0 (Genesis): 50% of 10,000 = 5,000
        (uint256 bonus0, uint256 reward0) = faucet.getCurrentReferralAmounts();
        assertEq(bonus0, 5_000e6);
        assertEq(reward0, 5_000e6);

        // Advance to tier 1 (Early Adopter)
        _setTotalClaimants(TIER_0_THRESHOLD);
        (uint256 bonus1, uint256 reward1) = faucet.getCurrentReferralAmounts();
        assertEq(bonus1, 500e6); // 50% of 1,000
        assertEq(reward1, 500e6);

        // Advance to tier 2 (Pioneer)
        _setTotalClaimants(TIER_1_THRESHOLD);
        (uint256 bonus2, uint256 reward2) = faucet.getCurrentReferralAmounts();
        assertEq(bonus2, 50e6); // 50% of 100
        assertEq(reward2, 50e6);

        // Advance to tier 3 (Explorer)
        _setTotalClaimants(TIER_2_THRESHOLD);
        (uint256 bonus3, uint256 reward3) = faucet.getCurrentReferralAmounts();
        assertEq(bonus3, 5e6); // 50% of 10
        assertEq(reward3, 5e6);

        // Advance to tier 4 (Settler)
        _setTotalClaimants(TIER_3_THRESHOLD);
        (uint256 bonus4, uint256 reward4) = faucet.getCurrentReferralAmounts();
        assertEq(bonus4, 500000); // 50% of 1 = 0.5 cREP = 500000
        assertEq(reward4, 500000);
    }

    function test_GetTierInfo() public {
        (uint256 tier, uint256 claimAmount, uint256 bonus, uint256 reward, uint256 inTier, uint256 untilNext) =
            faucet.getTierInfo();

        assertEq(tier, 0);
        assertEq(claimAmount, TIER_0_AMOUNT);
        assertEq(bonus, 5_000e6);
        assertEq(reward, 5_000e6);
        assertEq(inTier, 0);
        assertEq(untilNext, 10);

        _claimForNUsers(5);
        (,,,, inTier, untilNext) = faucet.getTierInfo();
        assertEq(inTier, 5);
        assertEq(untilNext, 5);
    }

    function test_TierChanged_EventEmitted() public {
        _claimForNUsers(9);

        // The 10th claim should emit TierChanged
        address boundaryUser = address(uint160(60000));
        mockHub.setVerified(boundaryUser);

        vm.expectEmit(false, false, false, true);
        emit HumanFaucet.TierChanged(1, TIER_1_AMOUNT, 10);

        mockHub.simulateVerification(address(faucet), boundaryUser);
    }

    function test_Claim_RevertNullifierAlreadyUsed() public {
        uint256 nullifier = 12345;
        mockHub.setVerifiedWithNullifier(user1, nullifier);

        mockHub.simulateVerification(address(faucet), user1);
        assertEq(crepToken.balanceOf(user1), TIER_0_AMOUNT);

        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output;
        output.userIdentifier = uint256(uint160(user2));
        output.nullifier = nullifier;
        output.olderThan = 18;

        vm.expectRevert(HumanFaucet.NullifierAlreadyUsed.selector);
        mockHub.simulateVerificationWithOutput(address(faucet), output);
    }

    function test_Claim_RevertInvalidUserIdentifier() public {
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output;
        output.userIdentifier = 0;
        output.nullifier = 99999;

        vm.expectRevert(HumanFaucet.InvalidUserIdentifier.selector);
        mockHub.simulateVerificationWithOutput(address(faucet), output);
    }

    function test_Claim_RevertUnauthorizedCaller() public {
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output;
        output.userIdentifier = uint256(uint160(user1));
        output.nullifier = 12345;

        bytes memory encodedOutput = abi.encode(output);

        vm.prank(user1);
        vm.expectRevert();
        faucet.onVerificationSuccess(encodedOutput, "");
    }

    // --- View Function Tests ---

    function test_HasClaimed_ReturnsFalseBeforeClaim() public view {
        assertFalse(faucet.hasClaimed(user1));
    }

    function test_HasClaimed_ReturnsTrueAfterClaim() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);
        assertTrue(faucet.hasClaimed(user1));
    }

    function test_IsNullifierUsed() public {
        uint256 nullifier = 54321;
        mockHub.setVerifiedWithNullifier(user1, nullifier);

        assertFalse(faucet.isNullifierUsed(nullifier));

        mockHub.simulateVerification(address(faucet), user1);

        assertTrue(faucet.isNullifierUsed(nullifier));
    }

    // --- Admin Function Tests ---

    function test_SetConfigId() public {
        bytes32 newConfigId = keccak256("new-config");

        vm.prank(admin);
        faucet.setConfigId(newConfigId);

        assertEq(faucet.verificationConfigId(), newConfigId);
    }

    function test_SetConfigId_RevertNotOwner() public {
        bytes32 newConfigId = keccak256("new-config");

        vm.prank(user1);
        vm.expectRevert();
        faucet.setConfigId(newConfigId);
    }

    // --- Stats Tests ---

    function test_TotalClaimed_Increments() public {
        mockHub.setVerified(user1);
        mockHub.setVerified(user2);

        assertEq(faucet.totalClaimed(), 0);

        mockHub.simulateVerification(address(faucet), user1);
        assertEq(faucet.totalClaimed(), TIER_0_AMOUNT);

        mockHub.simulateVerification(address(faucet), user2);
        assertEq(faucet.totalClaimed(), TIER_0_AMOUNT * 2);
    }

    function test_TotalClaimants_Increments() public {
        mockHub.setVerified(user1);
        mockHub.setVerified(user2);

        assertEq(faucet.totalClaimants(), 0);

        mockHub.simulateVerification(address(faucet), user1);
        assertEq(faucet.totalClaimants(), 1);

        mockHub.simulateVerification(address(faucet), user2);
        assertEq(faucet.totalClaimants(), 2);
    }

    // --- Integration Test ---

    function test_FullClaimFlow() public {
        mockHub.setVerified(user1);

        assertEq(crepToken.balanceOf(user1), 0);
        assertFalse(faucet.hasClaimed(user1));

        mockHub.simulateVerification(address(faucet), user1);

        assertEq(crepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertTrue(faucet.hasClaimed(user1));
        assertEq(faucet.totalClaimants(), 1);
        assertEq(faucet.totalClaimed(), TIER_0_AMOUNT);

        vm.expectRevert(HumanFaucet.NullifierAlreadyUsed.selector);
        mockHub.simulateVerification(address(faucet), user1);

        assertEq(crepToken.balanceOf(user1), TIER_0_AMOUNT);
    }

    // --- Age Verification Tests ---

    function test_Claim_RevertAgeTooYoung_Zero() public {
        mockHub.setVerified(user1);

        vm.expectRevert(HumanFaucet.AgeTooYoung.selector);
        mockHub.simulateVerificationWithAge(address(faucet), user1, 0);
    }

    function test_Claim_RevertAgeTooYoung_Seventeen() public {
        mockHub.setVerified(user1);

        vm.expectRevert(HumanFaucet.AgeTooYoung.selector);
        mockHub.simulateVerificationWithAge(address(faucet), user1, 17);
    }

    function test_Claim_SuccessExactAge_Eighteen() public {
        mockHub.setVerified(user1);

        mockHub.simulateVerificationWithAge(address(faucet), user1, 18);

        assertEq(crepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertTrue(faucet.hasClaimed(user1));
    }

    function test_Claim_SuccessAboveAge_TwentyOne() public {
        mockHub.setVerified(user1);

        mockHub.simulateVerificationWithAge(address(faucet), user1, 21);

        assertEq(crepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertTrue(faucet.hasClaimed(user1));
    }

    function test_Claim_RevertAgeTooYoung_ViaCustomOutput() public {
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output;
        output.userIdentifier = uint256(uint160(user1));
        output.nullifier = 99999;
        output.olderThan = 15;

        vm.expectRevert(HumanFaucet.AgeTooYoung.selector);
        mockHub.simulateVerificationWithOutput(address(faucet), output);
    }

    // --- Referral Tests ---

    function test_Claim_WithValidReferral() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        assertTrue(faucet.isValidReferrer(user1));
        assertEq(crepToken.balanceOf(user1), TIER_0_AMOUNT);

        mockHub.setVerified(user2);
        bytes memory userData = abi.encodePacked(user1);
        mockHub.simulateVerificationWithUserData(address(faucet), user2, userData);

        // User2 gets 10,000 + 5,000 = 15,000 cREP
        assertEq(crepToken.balanceOf(user2), TIER_0_AMOUNT + TIER_0_REFERRAL_BONUS);

        // User1 gets 10,000 + 5,000 = 15,000 cREP
        assertEq(crepToken.balanceOf(user1), TIER_0_AMOUNT + TIER_0_REFERRER_REWARD);

        assertEq(faucet.referralCount(user1), 1);
        assertEq(faucet.referredBy(user2), user1);
    }

    function test_Claim_InvalidReferrer_NoBonus() public {
        mockHub.setVerified(user1);
        bytes memory userData = abi.encodePacked(user2); // user2 hasn't claimed

        mockHub.simulateVerificationWithUserData(address(faucet), user1, userData);

        assertEq(crepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertEq(faucet.referredBy(user1), address(0));
        assertEq(faucet.referralCount(user2), 0);
    }

    function test_Claim_SelfReferral_NoBonus() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        address user3 = address(4);
        mockHub.setVerified(user3);

        bytes memory userData = abi.encodePacked(user3);
        mockHub.simulateVerificationWithUserData(address(faucet), user3, userData);

        // Self-referral rejected — only base amount
        assertEq(crepToken.balanceOf(user3), TIER_0_AMOUNT);
        assertEq(faucet.referredBy(user3), address(0));
    }

    function test_Claim_EmptyUserData_NoBonus() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerificationWithUserData(address(faucet), user1, "");

        assertEq(crepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertEq(faucet.referredBy(user1), address(0));
    }

    function test_Claim_ShortUserData_NoBonus() public {
        mockHub.setVerified(user1);
        bytes memory shortData = hex"1234567890";
        mockHub.simulateVerificationWithUserData(address(faucet), user1, shortData);

        assertEq(crepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertEq(faucet.referredBy(user1), address(0));
    }

    function test_GetReferralStats() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        (uint256 count, uint256 totalEarned) = faucet.getReferralStats(user1);
        assertEq(count, 0);
        assertEq(totalEarned, 0);

        mockHub.setVerified(user2);
        bytes memory userData = abi.encodePacked(user1);
        mockHub.simulateVerificationWithUserData(address(faucet), user2, userData);

        (count, totalEarned) = faucet.getReferralStats(user1);
        assertEq(count, 1);
        assertEq(totalEarned, TIER_0_REFERRER_REWARD);
    }

    function test_GetReferralStats_MultipleReferrals() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        bytes memory userData = abi.encodePacked(user1);

        // 5 users claim with user1 as referrer
        for (uint256 i = 0; i < 5; i++) {
            address newUser = address(uint160(100 + i));
            mockHub.setVerified(newUser);
            mockHub.simulateVerificationWithUserData(address(faucet), newUser, userData);
        }

        (uint256 count, uint256 totalEarned) = faucet.getReferralStats(user1);
        assertEq(count, 5);
        // 5 referrals × 5,000 cREP each = 25,000 cREP
        assertEq(totalEarned, TIER_0_REFERRER_REWARD * 5);

        // User1 balance: 10,000 (claim) + 25,000 (referral rewards) = 35,000 cREP
        assertEq(crepToken.balanceOf(user1), TIER_0_AMOUNT + TIER_0_REFERRER_REWARD * 5);
    }

    function test_ReferralAmounts_Tier0() public view {
        (uint256 bonus, uint256 reward) = faucet.getCurrentReferralAmounts();
        assertEq(bonus, TIER_0_REFERRAL_BONUS);
        assertEq(reward, TIER_0_REFERRER_REWARD);
    }

    function test_IsValidReferrer() public {
        assertFalse(faucet.isValidReferrer(user1));

        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        assertTrue(faucet.isValidReferrer(user1));
    }

    function test_TotalReferralRewards_Tracking() public {
        assertEq(faucet.totalReferralRewards(), 0);

        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        mockHub.setVerified(user2);
        bytes memory userData = abi.encodePacked(user1);
        mockHub.simulateVerificationWithUserData(address(faucet), user2, userData);

        // Total referral rewards = bonus (5,000) + reward (5,000) = 10,000 cREP
        assertEq(faucet.totalReferralRewards(), TIER_0_REFERRAL_BONUS + TIER_0_REFERRER_REWARD);
    }

    function test_ReferralRewardPaid_EventEmitted() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        mockHub.setVerified(user2);
        bytes memory userData = abi.encodePacked(user1);

        vm.expectEmit(true, true, false, true);
        emit HumanFaucet.ReferralRewardPaid(user1, user2, TIER_0_REFERRER_REWARD, TIER_0_REFERRAL_BONUS);

        mockHub.simulateVerificationWithUserData(address(faucet), user2, userData);
    }

    // --- Withdraw Remaining Tests ---

    function test_WithdrawRemaining() public {
        uint256 faucetBalance = crepToken.balanceOf(address(faucet));
        uint256 withdrawAmount = 1_000_000e6;

        vm.prank(admin);
        faucet.withdrawRemaining(admin, withdrawAmount);

        assertEq(crepToken.balanceOf(admin), withdrawAmount);
        assertEq(crepToken.balanceOf(address(faucet)), faucetBalance - withdrawAmount);
    }

    function test_WithdrawRemainingFullBalance() public {
        uint256 faucetBalance = crepToken.balanceOf(address(faucet));

        vm.prank(admin);
        faucet.withdrawRemaining(admin, type(uint256).max);

        assertEq(crepToken.balanceOf(admin), faucetBalance);
        assertEq(crepToken.balanceOf(address(faucet)), 0);
    }

    function test_WithdrawRemainingOnlyOwner() public {
        vm.prank(user1);
        vm.expectRevert();
        faucet.withdrawRemaining(user1, 1_000e6);
    }

    function test_WithdrawRemainingRevertsZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert("Invalid address");
        faucet.withdrawRemaining(address(0), 1_000e6);
    }

    // --- Pause Tests ---

    function test_Pause_BlocksClaims() public {
        vm.prank(admin);
        faucet.pause();
        assertTrue(faucet.paused());

        mockHub.setVerified(user1);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        mockHub.simulateVerification(address(faucet), user1);

        assertEq(crepToken.balanceOf(user1), 0);
    }

    function test_Unpause_AllowsClaims() public {
        vm.startPrank(admin);
        faucet.pause();
        faucet.unpause();
        vm.stopPrank();
        assertFalse(faucet.paused());

        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);
        assertEq(crepToken.balanceOf(user1), TIER_0_AMOUNT);
    }

    function test_Pause_WithdrawStillWorks() public {
        vm.prank(admin);
        faucet.pause();

        uint256 faucetBalance = crepToken.balanceOf(address(faucet));
        vm.prank(admin);
        faucet.withdrawRemaining(admin, faucetBalance);
        assertEq(crepToken.balanceOf(admin), faucetBalance);
    }

    function test_Pause_OnlyOwner() public {
        vm.prank(user1);
        vm.expectRevert();
        faucet.pause();
    }

    function test_Unpause_OnlyOwner() public {
        vm.prank(admin);
        faucet.pause();

        vm.prank(user1);
        vm.expectRevert();
        faucet.unpause();
    }

    // --- Helpers ---

    function _claimForNUsers(uint256 n) internal {
        uint256 startId = faucet.totalClaimants();
        for (uint256 i = 0; i < n; i++) {
            address newUser = address(uint160(10000 + startId + i));
            mockHub.setVerified(newUser);
            mockHub.simulateVerification(address(faucet), newUser);
        }
    }

    /// @dev Set totalClaimants directly via vm.store to avoid expensive loops for higher tiers.
    ///      Storage slot 6 determined via `forge inspect HumanFaucet storage`.
    function _setTotalClaimants(uint256 value) internal {
        vm.store(address(faucet), bytes32(uint256(6)), bytes32(value));
    }
}
