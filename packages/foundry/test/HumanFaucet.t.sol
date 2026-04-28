// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test, console } from "forge-std/Test.sol";
import { HumanFaucet } from "../contracts/HumanFaucet.sol";
import { MockIdentityVerificationHub } from "../contracts/mocks/MockIdentityVerificationHub.sol";
import { HumanReputation } from "../contracts/HumanReputation.sol";
import { ECDSA } from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import { IERC1271 } from "@openzeppelin/contracts/interfaces/IERC1271.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { SelfVerificationRoot } from "@selfxyz/contracts/contracts/abstract/SelfVerificationRoot.sol";
import { ISelfVerificationRoot } from "@selfxyz/contracts/contracts/interfaces/ISelfVerificationRoot.sol";

contract MockClaimWallet is IERC1271 {
    using ECDSA for bytes32;

    address public immutable owner;

    constructor(address owner_) {
        owner = owner_;
    }

    function isValidSignature(bytes32 hash, bytes calldata signature) external view returns (bytes4) {
        return hash.recover(signature) == owner ? IERC1271.isValidSignature.selector : bytes4(0xffffffff);
    }
}

/// @title HumanFaucet Test Suite
contract HumanFaucetTest is Test {
    bytes32 internal constant PASSPORT_ATTESTATION_ID = bytes32(uint256(1));
    bytes32 internal constant BIOMETRIC_ID_CARD_ATTESTATION_ID = bytes32(uint256(2));
    bytes32 internal constant KYC_ATTESTATION_ID = bytes32(uint256(4));
    bytes32 internal constant UNSUPPORTED_ATTESTATION_ID = bytes32(uint256(99));
    uint256 internal constant MINIMUM_FAUCET_AGE = 18;
    bytes32 internal constant EIP712_DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 internal constant FAUCET_CLAIM_AUTHORIZATION_TYPEHASH =
        keccak256("FaucetClaimAuthorization(address recipient,address referrer,uint256 nonce,uint256 deadline)");

    HumanFaucet public faucet;
    MockIdentityVerificationHub public mockHub;
    HumanReputation public hrepToken;

    address public admin = address(1);
    address public user1 = address(2);
    address public user2 = address(3);

    // Tier amounts
    uint256 public constant TIER_0_AMOUNT = 10_000e6; // 10,000 HREP (Genesis)
    uint256 public constant TIER_1_AMOUNT = 1_000e6; // 1,000 HREP (Early Adopter)
    uint256 public constant TIER_2_AMOUNT = 100e6; // 100 HREP (Pioneer)
    uint256 public constant TIER_3_AMOUNT = 10e6; // 10 HREP (Explorer)
    uint256 public constant TIER_4_AMOUNT = 1e6; // 1 HREP (Settler)

    // Tier thresholds
    uint256 public constant TIER_0_THRESHOLD = 10;
    uint256 public constant TIER_1_THRESHOLD = 1_000;
    uint256 public constant TIER_2_THRESHOLD = 10_000;
    uint256 public constant TIER_3_THRESHOLD = 1_000_000;

    // Tier 0 referral amounts (50% of 10,000 HREP)
    uint256 public constant TIER_0_REFERRAL_BONUS = 5_000e6;
    uint256 public constant TIER_0_REFERRER_REWARD = 5_000e6;

    function setUp() public {
        vm.startPrank(admin);

        // Deploy HREP token
        hrepToken = new HumanReputation(admin, admin);

        // Deploy mock identity verification hub
        mockHub = new MockIdentityVerificationHub();

        // Deploy HumanFaucet
        faucet = new HumanFaucet(address(hrepToken), address(mockHub), admin);

        // Pre-mint tokens to faucet (52M for production, using same for tests)
        uint256 faucetBalance = 52_000_000 * 1e6; // 52M HREP
        hrepToken.grantRole(hrepToken.MINTER_ROLE(), admin);
        hrepToken.mint(address(faucet), faucetBalance);
        hrepToken.revokeRole(hrepToken.MINTER_ROLE(), admin);

        // Set the mock config ID
        bytes32 mockConfigId = mockHub.MOCK_CONFIG_ID();
        faucet.setConfigId(mockConfigId);

        vm.stopPrank();
    }

    // --- Initialization Tests ---

    function test_Initialization() public view {
        assertEq(address(faucet.hrepToken()), address(hrepToken));
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

        assertEq(hrepToken.balanceOf(user1), 0);
        assertFalse(faucet.hasClaimed(user1));
        assertEq(faucet.totalClaimants(), 0);

        mockHub.simulateVerification(address(faucet), user1);

        // Tier 0 (Genesis): 10,000 HREP
        assertEq(hrepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertTrue(faucet.hasClaimed(user1));
        assertEq(faucet.totalClaimants(), 1);
        assertEq(faucet.totalClaimed(), TIER_0_AMOUNT);
    }

    function test_VerifySelfProof_Success() public {
        mockHub.setVerified(user1);
        bytes memory userContextData = _buildUserContextData(user1, "");

        vm.prank(user1);
        faucet.verifySelfProof(_buildProofPayload(PASSPORT_ATTESTATION_ID, userContextData), userContextData);

        assertEq(hrepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertTrue(faucet.hasClaimed(user1));
    }

    function test_VerifySelfProof_WithReferralUserData() public {
        mockHub.setVerified(user1);
        bytes memory firstUserContextData = _buildUserContextData(user1, "");
        vm.prank(user1);
        faucet.verifySelfProof(_buildProofPayload(PASSPORT_ATTESTATION_ID, firstUserContextData), firstUserContextData);

        mockHub.setVerified(user2);
        bytes memory userData = abi.encodePacked(user1);
        bytes memory userContextData = _buildUserContextData(user2, userData);

        vm.prank(user2);
        faucet.verifySelfProof(_buildProofPayload(PASSPORT_ATTESTATION_ID, userContextData), userContextData);

        assertEq(faucet.referredBy(user2), user1);
        assertEq(hrepToken.balanceOf(user2), TIER_0_AMOUNT + TIER_0_REFERRAL_BONUS);
        assertEq(faucet.referralEarnings(user1), TIER_0_REFERRER_REWARD);
    }

    function test_RecipientAuthorizationRequiredRejectsLegacyUserData() public {
        mockHub.setVerified(user1);
        vm.prank(admin);
        faucet.setRecipientAuthorizationRequired(true);

        vm.expectRevert(HumanFaucet.MissingClaimAuthorization.selector);
        mockHub.simulateVerification(address(faucet), user1);
    }

    function test_RecipientAuthorizationRequiredAcceptsEoaSignature() public {
        uint256 privateKey = 0xA11CE;
        address user = vm.addr(privateKey);
        uint256 deadline = block.timestamp + 1 hours;
        mockHub.setVerified(user);
        vm.prank(admin);
        faucet.setRecipientAuthorizationRequired(true);

        bytes memory userData = _buildClaimAuthorizationUserData(user, address(0), deadline, privateKey);
        mockHub.simulateVerificationWithUserData(address(faucet), user, userData);

        assertTrue(faucet.hasClaimed(user));
        assertEq(faucet.recipientAuthorizationNonces(user), 1);
        assertEq(hrepToken.balanceOf(user), TIER_0_AMOUNT);
    }

    function test_RecipientAuthorizationRejectsDifferentRecipientSignature() public {
        uint256 privateKey = 0xA11CE;
        address user = vm.addr(privateKey);
        uint256 deadline = block.timestamp + 1 hours;
        mockHub.setVerified(user);
        vm.prank(admin);
        faucet.setRecipientAuthorizationRequired(true);

        bytes memory signature = _signClaimAuthorization(privateKey, user2, address(0), 0, deadline);
        bytes memory userData = abi.encode(bytes4("HFCA"), address(0), deadline, signature);

        vm.expectRevert(HumanFaucet.InvalidClaimAuthorization.selector);
        mockHub.simulateVerificationWithUserData(address(faucet), user, userData);
    }

    function test_RecipientAuthorizationRejectsExpiredSignature() public {
        uint256 privateKey = 0xA11CE;
        address user = vm.addr(privateKey);
        uint256 deadline = block.timestamp - 1;
        mockHub.setVerified(user);
        vm.prank(admin);
        faucet.setRecipientAuthorizationRequired(true);

        bytes memory userData = _buildClaimAuthorizationUserData(user, address(0), deadline, privateKey);

        vm.expectRevert(HumanFaucet.ClaimAuthorizationExpired.selector);
        mockHub.simulateVerificationWithUserData(address(faucet), user, userData);
    }

    function test_RecipientAuthorizationAcceptsEip1271WalletSignature() public {
        uint256 ownerKey = 0xB0B;
        MockClaimWallet wallet = new MockClaimWallet(vm.addr(ownerKey));
        address user = address(wallet);
        uint256 deadline = block.timestamp + 1 hours;
        mockHub.setVerified(user);
        vm.prank(admin);
        faucet.setRecipientAuthorizationRequired(true);

        bytes memory userData = _buildClaimAuthorizationUserData(user, address(0), deadline, ownerKey);
        mockHub.simulateVerificationWithUserData(address(faucet), user, userData);

        assertTrue(faucet.hasClaimed(user));
        assertEq(faucet.recipientAuthorizationNonces(user), 1);
        assertEq(hrepToken.balanceOf(user), TIER_0_AMOUNT);
    }

    function test_BootstrapMigratedClaims_RejectsOversizedBatch() public {
        uint256 length = 101;
        address[] memory users = new address[](length);
        uint256[] memory nullifiers = new uint256[](length);
        uint256[] memory amounts = new uint256[](length);
        address[] memory referrers = new address[](length);
        uint256[] memory claimantBonuses = new uint256[](length);
        uint256[] memory referrerRewards = new uint256[](length);

        vm.prank(admin);
        vm.expectRevert(HumanFaucet.MigrationBootstrapBatchTooLarge.selector);
        faucet.bootstrapMigratedClaims(users, nullifiers, amounts, referrers, claimantBonuses, referrerRewards);
    }

    function test_VerifySelfProof_RevertShortProofPayload() public {
        mockHub.setVerified(user1);
        bytes memory userContextData = _buildUserContextData(user1, "");

        vm.startPrank(user1);
        vm.expectRevert(SelfVerificationRoot.InvalidDataFormat.selector);
        faucet.verifySelfProof(hex"1234", userContextData);
        vm.stopPrank();
    }

    function test_VerifySelfProof_RevertShortUserContextData() public {
        mockHub.setVerified(user1);
        bytes memory userContextData = abi.encodePacked(bytes32(uint256(block.chainid)));

        vm.prank(user1);
        (bool success, bytes memory revertData) = address(faucet)
            .call(
                abi.encodeWithSelector(
                    SelfVerificationRoot.verifySelfProof.selector,
                    _buildProofPayload(PASSPORT_ATTESTATION_ID, _buildUserContextData(user1, "")),
                    userContextData
                )
            );

        assertFalse(success);
        _assertRevertSelector(revertData, SelfVerificationRoot.InvalidDataFormat.selector);
    }

    function test_VerifySelfProof_RevertMismatchedBoundContext() public {
        mockHub.setVerified(user1);
        bytes memory proofContextData = _buildUserContextData(user1, "");
        bytes memory mismatchedUserContextData = _buildUserContextData(user2, "");

        vm.prank(user1);
        (bool success, bytes memory revertData) = address(faucet)
            .call(
                abi.encodeWithSelector(
                    SelfVerificationRoot.verifySelfProof.selector,
                    _buildProofPayload(PASSPORT_ATTESTATION_ID, proofContextData),
                    mismatchedUserContextData
                )
            );

        assertFalse(success);
        _assertRevertReason(revertData, "Invalid user identifier");
    }

    function test_Claim_MultipleUsers() public {
        mockHub.setVerified(user1);
        mockHub.setVerified(user2);

        mockHub.simulateVerification(address(faucet), user1);
        assertEq(hrepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertEq(faucet.totalClaimants(), 1);

        mockHub.simulateVerification(address(faucet), user2);
        assertEq(hrepToken.balanceOf(user2), TIER_0_AMOUNT);
        assertEq(faucet.totalClaimants(), 2);
        assertEq(faucet.totalClaimed(), TIER_0_AMOUNT * 2);
    }

    // --- Tier Tests ---

    function test_TierTransitions() public {
        // Tier 0 (Genesis): first 10 claims at 10,000 HREP
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
        assertEq(hrepToken.balanceOf(boundaryUser), TIER_0_AMOUNT);

        // Now totalClaimants == 10, tier transitions to 1
        assertEq(faucet.getCurrentTier(), 1);

        // Next claimant gets tier 1 rate
        address nextUser = address(uint160(50001));
        mockHub.setVerified(nextUser);
        mockHub.simulateVerification(address(faucet), nextUser);
        assertEq(hrepToken.balanceOf(nextUser), TIER_1_AMOUNT);
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
        assertEq(bonus4, 500000); // 50% of 1 = 0.5 HREP = 500000
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
        assertEq(hrepToken.balanceOf(user1), TIER_0_AMOUNT);

        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output;
        output.attestationId = PASSPORT_ATTESTATION_ID;
        output.userIdentifier = uint256(uint160(user2));
        output.nullifier = nullifier;
        output.olderThan = 18;
        output.ofac = [true, true, true];

        vm.expectRevert(HumanFaucet.NullifierAlreadyUsed.selector);
        mockHub.simulateVerificationWithOutput(address(faucet), output);
    }

    function test_Claim_RevertInvalidUserIdentifier() public {
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output;
        output.attestationId = PASSPORT_ATTESTATION_ID;
        output.userIdentifier = 0;
        output.nullifier = 99999;
        output.ofac = [true, true, true];

        vm.expectRevert(HumanFaucet.InvalidUserIdentifier.selector);
        mockHub.simulateVerificationWithOutput(address(faucet), output);
    }

    function test_Claim_RevertUnauthorizedCaller() public {
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output;
        output.attestationId = PASSPORT_ATTESTATION_ID;
        output.userIdentifier = uint256(uint160(user1));
        output.nullifier = 12345;
        output.ofac = [true, true, true];

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
        bytes32 newConfigId = mockHub.MOCK_CONFIG_ID();

        vm.prank(admin);
        faucet.setConfigId(newConfigId);

        assertEq(faucet.verificationConfigId(), newConfigId);
    }

    function test_SetConfigId_RevertNotOwner() public {
        bytes32 newConfigId = mockHub.MOCK_CONFIG_ID();

        vm.prank(user1);
        vm.expectRevert();
        faucet.setConfigId(newConfigId);
    }

    function test_SetConfigId_RevertZeroConfig() public {
        vm.prank(admin);
        vm.expectRevert("Invalid config");
        faucet.setConfigId(bytes32(0));
    }

    function test_SetConfigId_RevertUnknownConfig() public {
        bytes32 newConfigId = keccak256("unknown-config");

        vm.prank(admin);
        vm.expectRevert("Unknown config");
        faucet.setConfigId(newConfigId);
    }

    function test_AttestationPolicies_Defaults() public view {
        (bool passportEnabled, bool[3] memory passportOfac) = faucet.getAttestationPolicy(PASSPORT_ATTESTATION_ID);
        assertTrue(passportEnabled);
        assertTrue(passportOfac[0]);
        assertTrue(passportOfac[1]);
        assertTrue(passportOfac[2]);

        (bool biometricEnabled, bool[3] memory biometricOfac) =
            faucet.getAttestationPolicy(BIOMETRIC_ID_CARD_ATTESTATION_ID);
        assertTrue(biometricEnabled);
        assertFalse(biometricOfac[0]);
        assertTrue(biometricOfac[1]);
        assertTrue(biometricOfac[2]);

        (bool kycEnabled, bool[3] memory kycOfac) = faucet.getAttestationPolicy(KYC_ATTESTATION_ID);
        assertTrue(kycEnabled);
        assertFalse(kycOfac[0]);
        assertTrue(kycOfac[1]);
        assertTrue(kycOfac[2]);
    }

    function test_SetAttestationPolicy_AllowsOwnerToDisableKyc() public {
        vm.prank(admin);
        vm.expectEmit(true, false, false, true);
        emit HumanFaucet.AttestationPolicyUpdated(KYC_ATTESTATION_ID, false, [false, false, false]);
        faucet.setAttestationPolicy(KYC_ATTESTATION_ID, false, [false, false, false]);

        (bool enabled, bool[3] memory requiredOfac) = faucet.getAttestationPolicy(KYC_ATTESTATION_ID);
        assertFalse(enabled);
        assertFalse(requiredOfac[0]);
        assertFalse(requiredOfac[1]);
        assertFalse(requiredOfac[2]);

        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output;
        output.attestationId = KYC_ATTESTATION_ID;
        output.userIdentifier = uint256(uint160(user1));
        output.nullifier = 999780;
        output.olderThan = 18;
        output.ofac = [false, true, true];

        vm.expectRevert(HumanFaucet.UnsupportedDocumentType.selector);
        mockHub.simulateVerificationWithOutput(address(faucet), output);
    }

    function test_SetAttestationPolicy_AllowsOwnerToEnableNewCredentialKind() public {
        vm.prank(admin);
        faucet.setAttestationPolicy(UNSUPPORTED_ATTESTATION_ID, true, [false, true, false]);

        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output;
        output.attestationId = UNSUPPORTED_ATTESTATION_ID;
        output.userIdentifier = uint256(uint160(user1));
        output.nullifier = 999781;
        output.olderThan = 18;
        output.ofac = [false, true, false];

        mockHub.simulateVerificationWithOutput(address(faucet), output);

        assertEq(hrepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertTrue(faucet.hasClaimed(user1));
    }

    function test_SetAttestationPolicy_RevertNotOwner() public {
        vm.prank(user1);
        vm.expectRevert();
        faucet.setAttestationPolicy(KYC_ATTESTATION_ID, false, [false, false, false]);
    }

    function test_SetAttestationPolicy_RevertZeroAttestationId() public {
        vm.prank(admin);
        vm.expectRevert(HumanFaucet.InvalidAttestationPolicy.selector);
        faucet.setAttestationPolicy(bytes32(0), true, [true, false, false]);
    }

    function test_SetAttestationPolicy_RevertEnabledWithoutSanctionsRequirement() public {
        vm.prank(admin);
        vm.expectRevert(HumanFaucet.InvalidAttestationPolicy.selector);
        faucet.setAttestationPolicy(KYC_ATTESTATION_ID, true, [false, false, false]);
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

        assertEq(hrepToken.balanceOf(user1), 0);
        assertFalse(faucet.hasClaimed(user1));

        mockHub.simulateVerification(address(faucet), user1);

        assertEq(hrepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertTrue(faucet.hasClaimed(user1));
        assertEq(faucet.totalClaimants(), 1);
        assertEq(faucet.totalClaimed(), TIER_0_AMOUNT);

        vm.expectRevert(HumanFaucet.NullifierAlreadyUsed.selector);
        mockHub.simulateVerification(address(faucet), user1);

        assertEq(hrepToken.balanceOf(user1), TIER_0_AMOUNT);
    }

    // --- Age Disclosure Handling Tests ---

    function test_Claim_RevertMinimumAgeNotMet_Zero() public {
        mockHub.setVerified(user1);

        vm.expectRevert(HumanFaucet.MinimumAgeNotMet.selector);
        mockHub.simulateVerificationWithAge(address(faucet), user1, 0);

        assertEq(hrepToken.balanceOf(user1), 0);
        assertFalse(faucet.hasClaimed(user1));
    }

    function test_Claim_RevertMinimumAgeNotMet_Seventeen() public {
        mockHub.setVerified(user1);

        vm.expectRevert(HumanFaucet.MinimumAgeNotMet.selector);
        mockHub.simulateVerificationWithAge(address(faucet), user1, 17);

        assertEq(hrepToken.balanceOf(user1), 0);
        assertFalse(faucet.hasClaimed(user1));
    }

    function test_Claim_RevertMinimumAgeNotMet_ViaCustomOutput() public {
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output;
        output.attestationId = PASSPORT_ATTESTATION_ID;
        output.userIdentifier = uint256(uint160(user1));
        output.nullifier = 99999;
        output.olderThan = 15;
        output.ofac = [true, true, true];

        vm.expectRevert(HumanFaucet.MinimumAgeNotMet.selector);
        mockHub.simulateVerificationWithOutput(address(faucet), output);

        assertEq(hrepToken.balanceOf(user1), 0);
        assertFalse(faucet.hasClaimed(user1));
    }

    function test_Claim_SuccessWithMinimumAge() public {
        mockHub.setVerified(user1);

        mockHub.simulateVerificationWithAge(address(faucet), user1, MINIMUM_FAUCET_AGE);

        assertEq(hrepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertTrue(faucet.hasClaimed(user1));
    }

    function test_Claim_SuccessAboveMinimumAge() public {
        mockHub.setVerified(user1);

        mockHub.simulateVerificationWithAge(address(faucet), user1, 21);

        assertEq(hrepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertTrue(faucet.hasClaimed(user1));
    }

    function test_Claim_SuccessWithBiometricIdCard() public {
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output;
        output.attestationId = BIOMETRIC_ID_CARD_ATTESTATION_ID;
        output.userIdentifier = uint256(uint160(user1));
        output.nullifier = 77777;
        output.olderThan = 18;
        output.ofac = [false, true, true];

        mockHub.simulateVerificationWithOutput(address(faucet), output);

        assertEq(hrepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertTrue(faucet.hasClaimed(user1));
    }

    function test_Claim_SuccessWithKyc() public {
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output;
        output.attestationId = KYC_ATTESTATION_ID;
        output.userIdentifier = uint256(uint160(user1));
        output.nullifier = 999777;
        output.olderThan = 18;
        output.ofac = [false, true, true];

        mockHub.simulateVerificationWithOutput(address(faucet), output);

        assertEq(hrepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertTrue(faucet.hasClaimed(user1));
    }

    function test_Claim_RevertSanctionsCheckFailed_Passport() public {
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output;
        output.attestationId = PASSPORT_ATTESTATION_ID;
        output.userIdentifier = uint256(uint160(user1));
        output.nullifier = 999778;
        output.olderThan = 18;
        output.ofac = [true, false, true];

        vm.expectRevert(HumanFaucet.SanctionsCheckFailed.selector);
        mockHub.simulateVerificationWithOutput(address(faucet), output);
    }

    function test_Claim_RevertSanctionsCheckFailed_Kyc() public {
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output;
        output.attestationId = KYC_ATTESTATION_ID;
        output.userIdentifier = uint256(uint160(user1));
        output.nullifier = 999779;
        output.olderThan = 18;
        output.ofac = [false, true, false];

        vm.expectRevert(HumanFaucet.SanctionsCheckFailed.selector);
        mockHub.simulateVerificationWithOutput(address(faucet), output);
    }

    function test_Claim_RevertUnsupportedDocumentType() public {
        ISelfVerificationRoot.GenericDiscloseOutputV2 memory output;
        output.attestationId = UNSUPPORTED_ATTESTATION_ID;
        output.userIdentifier = uint256(uint160(user1));
        output.nullifier = 88888;
        output.olderThan = 18;

        vm.expectRevert(HumanFaucet.UnsupportedDocumentType.selector);
        mockHub.simulateVerificationWithOutput(address(faucet), output);
    }

    // --- Referral Tests ---

    function test_Claim_WithValidReferral() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        assertTrue(faucet.isValidReferrer(user1));
        assertEq(hrepToken.balanceOf(user1), TIER_0_AMOUNT);

        mockHub.setVerified(user2);
        bytes memory userData = abi.encodePacked(user1);
        mockHub.simulateVerificationWithUserData(address(faucet), user2, userData);

        // User2 gets 10,000 + 5,000 = 15,000 HREP
        assertEq(hrepToken.balanceOf(user2), TIER_0_AMOUNT + TIER_0_REFERRAL_BONUS);

        // User1 gets 10,000 + 5,000 = 15,000 HREP
        assertEq(hrepToken.balanceOf(user1), TIER_0_AMOUNT + TIER_0_REFERRER_REWARD);

        assertEq(faucet.referralCount(user1), 1);
        assertEq(faucet.referredBy(user2), user1);
    }

    function test_Claim_InvalidReferrer_NoBonus() public {
        mockHub.setVerified(user1);
        bytes memory userData = abi.encodePacked(user2); // user2 hasn't claimed

        mockHub.simulateVerificationWithUserData(address(faucet), user1, userData);

        assertEq(hrepToken.balanceOf(user1), TIER_0_AMOUNT);
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
        assertEq(hrepToken.balanceOf(user3), TIER_0_AMOUNT);
        assertEq(faucet.referredBy(user3), address(0));
    }

    function test_Claim_EmptyUserData_NoBonus() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerificationWithUserData(address(faucet), user1, "");

        assertEq(hrepToken.balanceOf(user1), TIER_0_AMOUNT);
        assertEq(faucet.referredBy(user1), address(0));
    }

    function test_Claim_ShortUserData_NoBonus() public {
        mockHub.setVerified(user1);
        bytes memory shortData = hex"1234567890";
        mockHub.simulateVerificationWithUserData(address(faucet), user1, shortData);

        assertEq(hrepToken.balanceOf(user1), TIER_0_AMOUNT);
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
        // 5 referrals × 5,000 HREP each = 25,000 HREP
        assertEq(totalEarned, TIER_0_REFERRER_REWARD * 5);

        // User1 balance: 10,000 (claim) + 25,000 (referral rewards) = 35,000 HREP
        assertEq(hrepToken.balanceOf(user1), TIER_0_AMOUNT + TIER_0_REFERRER_REWARD * 5);
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

        // Total referral rewards = bonus (5,000) + reward (5,000) = 10,000 HREP
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
        vm.prank(admin);
        faucet.pause();

        vm.prank(admin);
        faucet.withdrawRemaining(admin, 1_000_000e6);

        assertEq(hrepToken.balanceOf(admin), 1_000_000e6);
        assertEq(hrepToken.balanceOf(address(faucet)), 51_000_000e6);
    }

    function test_WithdrawRemainingFullBalance() public {
        uint256 faucetBalance = hrepToken.balanceOf(address(faucet));

        vm.prank(admin);
        faucet.pause();

        vm.prank(admin);
        faucet.withdrawRemaining(admin, type(uint256).max);

        assertEq(hrepToken.balanceOf(admin), faucetBalance);
        assertEq(hrepToken.balanceOf(address(faucet)), 0);
    }

    function test_WithdrawRemainingRequiresPause() public {
        vm.prank(admin);
        vm.expectRevert("Pause required");
        faucet.withdrawRemaining(admin, 1_000_000e6);
    }

    function test_WithdrawRemainingOnlyOwner() public {
        vm.prank(admin);
        faucet.pause();

        vm.prank(user1);
        vm.expectRevert();
        faucet.withdrawRemaining(user1, 1_000e6);
    }

    function test_WithdrawRemainingRevertsZeroAddress() public {
        vm.prank(admin);
        faucet.pause();

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

        assertEq(hrepToken.balanceOf(user1), 0);
    }

    function test_Unpause_AllowsClaims() public {
        vm.startPrank(admin);
        faucet.pause();
        faucet.unpause();
        vm.stopPrank();
        assertFalse(faucet.paused());

        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);
        assertEq(hrepToken.balanceOf(user1), TIER_0_AMOUNT);
    }

    function test_Pause_AllowsWithdrawRemaining() public {
        vm.prank(admin);
        faucet.pause();

        uint256 faucetBalance = hrepToken.balanceOf(address(faucet));
        vm.prank(admin);
        faucet.withdrawRemaining(admin, faucetBalance);
        assertEq(hrepToken.balanceOf(address(faucet)), 0);
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
    ///      Storage slot 8 determined via `forge inspect HumanFaucet storage`.
    function _setTotalClaimants(uint256 value) internal {
        vm.store(address(faucet), bytes32(uint256(8)), bytes32(value));
    }

    function _buildProofPayload(bytes32 attestationId, bytes memory userContextData)
        internal
        pure
        returns (bytes memory)
    {
        return abi.encodePacked(attestationId, bytes32(_calculateBoundUserIdentifier(userContextData)));
    }

    function _buildUserContextData(address user, bytes memory userData) internal view returns (bytes memory) {
        return abi.encodePacked(bytes32(uint256(block.chainid)), bytes32(uint256(uint160(user))), userData);
    }

    function _buildClaimAuthorizationUserData(address user, address referrer, uint256 deadline, uint256 privateKey)
        internal
        view
        returns (bytes memory)
    {
        bytes memory signature =
            _signClaimAuthorization(privateKey, user, referrer, faucet.recipientAuthorizationNonces(user), deadline);
        return abi.encode(bytes4("HFCA"), referrer, deadline, signature);
    }

    function _signClaimAuthorization(
        uint256 privateKey,
        address user,
        address referrer,
        uint256 nonce,
        uint256 deadline
    ) internal view returns (bytes memory) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                EIP712_DOMAIN_TYPEHASH, keccak256("Curyo Human Faucet"), keccak256("1"), block.chainid, address(faucet)
            )
        );
        bytes32 structHash = keccak256(abi.encode(FAUCET_CLAIM_AUTHORIZATION_TYPEHASH, user, referrer, nonce, deadline));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(privateKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _calculateBoundUserIdentifier(bytes memory userContextData) internal pure returns (uint256) {
        bytes32 sha256Hash = sha256(userContextData);
        bytes20 ripemdHash = ripemd160(abi.encodePacked(sha256Hash));
        return uint256(uint160(ripemdHash));
    }

    function _assertRevertSelector(bytes memory revertData, bytes4 expectedSelector) internal pure {
        require(revertData.length >= 4, "Missing revert data");
        bytes4 actualSelector;
        assembly {
            actualSelector := mload(add(revertData, 32))
        }
        assertEq(actualSelector, expectedSelector);
    }

    function _assertRevertReason(bytes memory revertData, string memory expectedReason) internal pure {
        _assertRevertSelector(revertData, bytes4(keccak256("Error(string)")));
        bytes memory revertReasonData = new bytes(revertData.length - 4);
        for (uint256 i = 4; i < revertData.length; i++) {
            revertReasonData[i - 4] = revertData[i];
        }
        string memory actualReason = abi.decode(revertReasonData, (string));
        assertEq(actualReason, expectedReason);
    }
}
