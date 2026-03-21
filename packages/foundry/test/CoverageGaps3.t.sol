// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test, Vm } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { HumanFaucet } from "../contracts/HumanFaucet.sol";
import { MockIdentityVerificationHub } from "../contracts/mocks/MockIdentityVerificationHub.sol";
import { ISelfVerificationRoot } from "@selfxyz/contracts/contracts/interfaces/ISelfVerificationRoot.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { RewardMath } from "../contracts/libraries/RewardMath.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";
import { IRoundVotingEngine } from "../contracts/interfaces/IRoundVotingEngine.sol";
import { IFrontendRegistry } from "../contracts/interfaces/IFrontendRegistry.sol";
import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";

// =========================================================================
// MOCKS
// =========================================================================

contract MockVotingEngine3 is IRoundVotingEngine {
    uint256 public totalAdded;

    function addToConsensusReserve(uint256 amount) external override {
        totalAdded += amount;
    }

    function hasCommits(uint256) external pure override returns (bool) {
        return false;
    }

    function currentRoundId(uint256) external pure override returns (uint256) {
        return 0;
    }

    function rounds(uint256, uint256)
        external
        pure
        override
        returns (
            uint48,
            RoundLib.RoundState,
            uint16,
            uint16,
            uint64,
            uint64,
            uint64,
            uint16,
            uint16,
            bool,
            uint48,
            uint48,
            uint64,
            uint64
        )
    {
        return (0, RoundLib.RoundState.Open, 0, 0, 0, 0, 0, 0, 0, false, 0, 0, 0, 0);
    }

    function transferReward(address, uint256) external override { }
}

// =========================================================================
// 1. FRONTEND REGISTRY — register() / requestDeregister() EDGE CASES
// =========================================================================

contract FrontendRegistryEdgeCaseTest is Test {
    FrontendRegistry public reg;
    CuryoReputation public crep;
    MockVotingEngine3 public engine;
    MockVoterIdNFT public voterNFT;

    address public admin = address(0xAA);
    address public governance = address(0xBB);
    address public frontend1 = address(0xF1);
    address public frontend2 = address(0xF2);
    address public creditor = address(0xCC);

    uint256 constant STAKE = 1000e6;

    function setUp() public {
        vm.startPrank(admin);

        crep = new CuryoReputation(admin, admin);
        crep.grantRole(crep.MINTER_ROLE(), admin);

        engine = new MockVotingEngine3();
        voterNFT = new MockVoterIdNFT();

        FrontendRegistry impl = new FrontendRegistry();
        reg = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(FrontendRegistry.initialize, (admin, admin, address(crep)))
                )
            )
        );

        reg.setVotingEngine(address(engine));
        reg.addFeeCreditor(creditor);

        crep.mint(frontend1, 100_000e6);
        crep.mint(frontend2, 100_000e6);
        crep.mint(address(reg), 1_000_000e6);

        vm.stopPrank();
    }

    // --- initialize() validation ---

    function test_InitializeZeroAdmin_Reverts() public {
        FrontendRegistry impl = new FrontendRegistry();
        vm.expectRevert("Invalid admin");
        new ERC1967Proxy(address(impl), abi.encodeCall(FrontendRegistry.initialize, (address(0), admin, address(crep))));
    }

    function test_InitializeZeroGovernance_Reverts() public {
        FrontendRegistry impl = new FrontendRegistry();
        vm.expectRevert("Invalid governance");
        new ERC1967Proxy(address(impl), abi.encodeCall(FrontendRegistry.initialize, (admin, address(0), address(crep))));
    }

    function test_InitializeZeroToken_Reverts() public {
        FrontendRegistry impl = new FrontendRegistry();
        vm.expectRevert("Invalid token");
        new ERC1967Proxy(address(impl), abi.encodeCall(FrontendRegistry.initialize, (admin, admin, address(0))));
    }

    function test_InitializeAdminEqualsGovernance_NoDoubleGrant() public {
        FrontendRegistry impl = new FrontendRegistry();
        FrontendRegistry r = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(FrontendRegistry.initialize, (admin, admin, address(crep)))
                )
            )
        );
        assertTrue(r.hasRole(r.ADMIN_ROLE(), admin));
        assertTrue(r.hasRole(r.GOVERNANCE_ROLE(), admin));
    }

    function test_InitializeSeparateAdminAndGovernance() public {
        FrontendRegistry impl = new FrontendRegistry();
        FrontendRegistry r = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(FrontendRegistry.initialize, (admin, governance, address(crep)))
                )
            )
        );
        assertTrue(r.hasRole(r.ADMIN_ROLE(), admin));
        assertTrue(r.hasRole(r.ADMIN_ROLE(), governance));
        assertTrue(r.hasRole(r.GOVERNANCE_ROLE(), governance));
    }

    // --- register() with insufficient approval ---

    function test_RegisterInsufficientAllowance_Reverts() public {
        vm.startPrank(frontend1);
        crep.approve(address(reg), STAKE - 1);
        vm.expectRevert();
        reg.register();
        vm.stopPrank();
    }

    // --- register() with zero balance ---

    function test_RegisterInsufficientBalance_Reverts() public {
        address poorFrontend = address(0xF3);
        vm.prank(poorFrontend);
        crep.approve(address(reg), STAKE);
        vm.expectRevert();
        vm.prank(poorFrontend);
        reg.register();
    }

    // --- register() emits correct event ---

    function test_RegisterEmitsFrontendRegisteredEvent() public {
        vm.startPrank(frontend1);
        crep.approve(address(reg), STAKE);

        vm.expectEmit(true, true, false, true);
        emit FrontendRegistry.FrontendRegistered(frontend1, frontend1, STAKE);

        reg.register();
        vm.stopPrank();
    }

    // --- register() records registeredAt timestamp ---

    function test_RegisterSetsRegisteredAt() public {
        vm.warp(12345);
        vm.startPrank(frontend1);
        crep.approve(address(reg), STAKE);
        reg.register();
        vm.stopPrank();

        (,,,, uint256 registeredAt) = _getFrontendFull(frontend1);
        assertEq(registeredAt, 12345);
    }

    // --- requestDeregister() with zero pending fees (refund == stake only) ---

    function test_DeregisterZeroFees_RefundsStakeOnly() public {
        _registerFrontend(frontend1);

        vm.prank(frontend1);
        reg.requestDeregister();
        uint256 balBefore = crep.balanceOf(frontend1);
        _completeDeregister(frontend1);
        assertEq(crep.balanceOf(frontend1) - balBefore, STAKE);
    }

    // --- requestDeregister() emits FeesClaimed only when fees > 0 ---

    function test_DeregisterWithFees_EmitsFeesClaimedEvent() public {
        _registerFrontend(frontend1);

        vm.prank(creditor);
        reg.creditFees(frontend1, 500e6);

        vm.prank(frontend1);
        reg.requestDeregister();

        vm.expectEmit(true, false, false, true);
        emit FrontendRegistry.FeesClaimed(frontend1, 500e6);

        _completeDeregister(frontend1);
    }

    function test_DeregisterWithoutFees_NoFeesClaimedEvent() public {
        _registerFrontend(frontend1);

        vm.recordLogs();
        vm.prank(frontend1);
        reg.requestDeregister();
        _completeDeregister(frontend1);

        // Check that FeesClaimed was NOT emitted
        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 feesClaimedSig = keccak256("FeesClaimed(address,uint256)");
        for (uint256 i = 0; i < logs.length; i++) {
            assertNotEq(logs[i].topics[0], feesClaimedSig, "FeesClaimed should not be emitted");
        }
    }

    // --- requestDeregister() allows re-registration with fresh state ---

    function test_DeregisterThenReregister_FreshState() public {
        _registerFrontend(frontend1);

        vm.prank(creditor);
        reg.creditFees(frontend1, 200e6);

        vm.prank(frontend1);
        reg.requestDeregister();
        _completeDeregister(frontend1);

        // Re-register
        vm.startPrank(frontend1);
        crep.approve(address(reg), STAKE);
        reg.register();
        vm.stopPrank();

        // State should be fresh: no fees, eligible again
        assertEq(reg.getAccumulatedFees(frontend1), 0);
        assertTrue(reg.isEligible(frontend1));
    }

    // --- Multiple frontends registration ---

    function test_MultipleFrontendsRegistered() public {
        _registerFrontend(frontend1);
        _registerFrontend(frontend2);

        (address[] memory list, uint256 total) = reg.getRegisteredFrontendsPaginated(0, 10);
        assertEq(total, 2);
        assertEq(list[0], frontend1);
        assertEq(list[1], frontend2);
    }

    // --- claimFees after deregister reverts ---

    function test_ClaimFeesAfterDeregister_Reverts() public {
        _registerFrontend(frontend1);

        vm.prank(creditor);
        reg.creditFees(frontend1, 100e6);

        vm.prank(frontend1);
        reg.requestDeregister();
        _completeDeregister(frontend1);

        vm.prank(frontend1);
        vm.expectRevert("Not registered");
        reg.claimFees();
    }

    // --- creditFees zero amount succeeds (accumulates nothing) ---

    function test_CreditFeesZeroAmount() public {
        _registerFrontend(frontend1);

        vm.prank(creditor);
        reg.creditFees(frontend1, 0);

        assertEq(reg.getAccumulatedFees(frontend1), 0);
    }

    // --- isEligible returns false for unregistered address ---

    function test_IsEligible_UnregisteredReturnsFalse() public view {
        assertFalse(reg.isEligible(address(0xDEAD)));
    }

    // --- getAccumulatedFees for unregistered returns 0 ---

    function test_GetAccumulatedFees_UnregisteredReturnsZero() public view {
        assertEq(reg.getAccumulatedFees(address(0xDEAD)), 0);
    }

    // --- getFrontendInfo for unregistered returns zeros ---

    function test_GetFrontendInfo_UnregisteredReturnsDefaults() public view {
        (address op, uint256 staked, bool eligible, bool slashed) = reg.getFrontendInfo(address(0xDEAD));
        assertEq(op, address(0));
        assertEq(staked, 0);
        assertFalse(eligible);
        assertFalse(slashed);
    }

    // --- Helpers ---

    function _registerFrontend(address fe) internal {
        vm.startPrank(fe);
        crep.approve(address(reg), STAKE);
        reg.register();
        vm.stopPrank();
    }

    function _completeDeregister(address fe) internal {
        vm.warp(block.timestamp + reg.UNBONDING_PERIOD() + 1);
        vm.prank(fe);
        reg.completeDeregister();
    }

    function _getFrontendFull(address fe) internal view returns (address, uint256, bool, bool, uint256) {
        (address op, uint256 staked, bool eligible, bool slashed) = reg.getFrontendInfo(fe);
        // Access registeredAt via direct mapping read
        (,,,, uint256 registeredAt) = reg.frontends(fe);
        return (op, staked, eligible, slashed, registeredAt);
    }
}

// =========================================================================
// 2. HUMAN FAUCET — CLAIM TIER EDGE CASES
// =========================================================================

contract HumanFaucetTierEdgeCaseTest is Test {
    HumanFaucet public faucet;
    MockIdentityVerificationHub public mockHub;
    CuryoReputation public crep;
    MockVoterIdNFT public voterNFT;

    address public admin = address(0xAA);
    address public governance = address(0xBB);

    function setUp() public {
        vm.startPrank(admin);

        crep = new CuryoReputation(admin, admin);
        crep.grantRole(crep.MINTER_ROLE(), admin);

        mockHub = new MockIdentityVerificationHub();
        voterNFT = new MockVoterIdNFT();

        faucet = new HumanFaucet(address(crep), address(mockHub), governance);

        crep.mint(address(faucet), 52_000_000e6);
        faucet.setConfigId(mockHub.MOCK_CONFIG_ID());

        vm.stopPrank();
    }

    // --- Constructor validation ---

    function test_ConstructorZeroGovernance_Reverts() public {
        vm.expectRevert("Invalid governance");
        new HumanFaucet(address(crep), address(mockHub), address(0));
    }

    // --- Tier boundary: exact threshold values ---

    function test_TierBoundary_Tier0ToTier1_ExactAt9() public {
        _setTotalClaimants(9);
        assertEq(faucet.getCurrentTier(), 0);
        assertEq(faucet.getCurrentClaimAmount(), 10_000e6);
    }

    function test_TierBoundary_Tier0ToTier1_ExactAt10() public {
        _setTotalClaimants(10);
        assertEq(faucet.getCurrentTier(), 1);
        assertEq(faucet.getCurrentClaimAmount(), 1_000e6);
    }

    function test_TierBoundary_Tier1ToTier2_ExactAt999() public {
        _setTotalClaimants(999);
        assertEq(faucet.getCurrentTier(), 1);
    }

    function test_TierBoundary_Tier1ToTier2_ExactAt1000() public {
        _setTotalClaimants(1_000);
        assertEq(faucet.getCurrentTier(), 2);
        assertEq(faucet.getCurrentClaimAmount(), 100e6);
    }

    function test_TierBoundary_Tier2ToTier3_ExactAt9999() public {
        _setTotalClaimants(9_999);
        assertEq(faucet.getCurrentTier(), 2);
    }

    function test_TierBoundary_Tier2ToTier3_ExactAt10000() public {
        _setTotalClaimants(10_000);
        assertEq(faucet.getCurrentTier(), 3);
        assertEq(faucet.getCurrentClaimAmount(), 10e6);
    }

    function test_TierBoundary_Tier3ToTier4_ExactAt999999() public {
        _setTotalClaimants(999_999);
        assertEq(faucet.getCurrentTier(), 3);
    }

    function test_TierBoundary_Tier3ToTier4_ExactAt1000000() public {
        _setTotalClaimants(1_000_000);
        assertEq(faucet.getCurrentTier(), 4);
        assertEq(faucet.getCurrentClaimAmount(), 1e6);
    }

    // --- Tier 4 stays at tier 4 even with huge values ---

    function test_Tier4_MaxUint128_StaysTier4() public {
        _setTotalClaimants(type(uint128).max);
        assertEq(faucet.getCurrentTier(), 4);
        assertEq(faucet.getCurrentClaimAmount(), 1e6);
    }

    // --- getTierInfo for each tier with mid-tier values ---

    function test_GetTierInfo_Tier0_MidTier() public {
        _setTotalClaimants(5);
        (uint256 tier,,,, uint256 inTier, uint256 untilNext) = faucet.getTierInfo();
        assertEq(tier, 0);
        assertEq(inTier, 5);
        assertEq(untilNext, 5);
    }

    function test_GetTierInfo_Tier1_MidTier() public {
        _setTotalClaimants(500);
        (uint256 tier,,,, uint256 inTier, uint256 untilNext) = faucet.getTierInfo();
        assertEq(tier, 1);
        assertEq(inTier, 490);
        assertEq(untilNext, 500);
    }

    function test_GetTierInfo_Tier2_MidTier() public {
        _setTotalClaimants(5_000);
        (uint256 tier,,,, uint256 inTier, uint256 untilNext) = faucet.getTierInfo();
        assertEq(tier, 2);
        assertEq(inTier, 4_000);
        assertEq(untilNext, 5_000);
    }

    function test_GetTierInfo_Tier3_MidTier() public {
        _setTotalClaimants(500_000);
        (uint256 tier,,,, uint256 inTier, uint256 untilNext) = faucet.getTierInfo();
        assertEq(tier, 3);
        assertEq(inTier, 490_000);
        assertEq(untilNext, 500_000);
    }

    function test_GetTierInfo_Tier4_UntilNextAlwaysZero() public {
        _setTotalClaimants(2_000_000);
        (uint256 tier,,,, uint256 inTier, uint256 untilNext) = faucet.getTierInfo();
        assertEq(tier, 4);
        assertEq(inTier, 1_000_000);
        assertEq(untilNext, 0);
    }

    // --- _decodeReferrer edge cases (tested via claim flow) ---

    function test_Claim_UserData32Bytes_DecodesReferrer() public {
        address referrer = address(0x10);
        mockHub.setVerified(referrer);
        mockHub.simulateVerification(address(faucet), referrer);

        address claimer = address(0x20);
        mockHub.setVerified(claimer);

        // 32-byte encoded address (abi.encode pads to 32 bytes)
        bytes memory userData = abi.encode(referrer);
        assertEq(userData.length, 32);

        mockHub.simulateVerificationWithUserData(address(faucet), claimer, userData);

        // Should have referral bonus
        assertGt(crep.balanceOf(claimer), 10_000e6);
        assertEq(faucet.referredBy(claimer), referrer);
    }

    function test_Claim_UserData20Bytes_DecodesReferrer() public {
        address referrer = address(0x10);
        mockHub.setVerified(referrer);
        mockHub.simulateVerification(address(faucet), referrer);

        address claimer = address(0x20);
        mockHub.setVerified(claimer);

        // Exactly 20-byte packed address
        bytes memory userData = abi.encodePacked(referrer);
        assertEq(userData.length, 20);

        mockHub.simulateVerificationWithUserData(address(faucet), claimer, userData);

        assertGt(crep.balanceOf(claimer), 10_000e6);
    }

    function test_Claim_UserDataLessThan20Bytes_NoReferral() public {
        address claimer = address(0x20);
        mockHub.setVerified(claimer);

        bytes memory shortData = hex"010203"; // 3 bytes
        mockHub.simulateVerificationWithUserData(address(faucet), claimer, shortData);

        assertEq(crep.balanceOf(claimer), 10_000e6); // base only
    }

    // --- Referral where referrer == claimer (self-referral blocked) ---

    function test_Claim_ZeroAddressReferrer_NoBonus() public {
        address claimer = address(0x20);
        mockHub.setVerified(claimer);

        // Encode zero address as referrer
        bytes memory userData = abi.encode(address(0));
        mockHub.simulateVerificationWithUserData(address(faucet), claimer, userData);

        assertEq(crep.balanceOf(claimer), 10_000e6);
    }

    // --- Claim at tier 2 rate actually transfers correct amount ---

    function test_ClaimAtTier2Rate() public {
        _setTotalClaimants(1_000);
        assertEq(faucet.getCurrentTier(), 2);

        address claimer = address(uint160(80000));
        mockHub.setVerified(claimer);
        mockHub.simulateVerification(address(faucet), claimer);
        assertEq(crep.balanceOf(claimer), 100e6);
    }

    function test_ClaimAtTier3Rate() public {
        _setTotalClaimants(10_000);
        assertEq(faucet.getCurrentTier(), 3);

        address claimer = address(uint160(80001));
        mockHub.setVerified(claimer);
        mockHub.simulateVerification(address(faucet), claimer);
        assertEq(crep.balanceOf(claimer), 10e6);
    }

    function test_ClaimAtTier4Rate() public {
        _setTotalClaimants(1_000_000);
        assertEq(faucet.getCurrentTier(), 4);

        address claimer = address(uint160(80002));
        mockHub.setVerified(claimer);
        mockHub.simulateVerification(address(faucet), claimer);
        assertEq(crep.balanceOf(claimer), 1e6);
    }

    // --- TierChanged event at each boundary ---

    function test_TierChangedEvent_AtTier1Boundary() public {
        _claimForNUsers(9);

        address boundaryUser = address(uint160(60000));
        mockHub.setVerified(boundaryUser);

        vm.expectEmit(false, false, false, true);
        emit HumanFaucet.TierChanged(1, 1_000e6, 10);

        mockHub.simulateVerification(address(faucet), boundaryUser);
    }

    // --- getRemainingClaims at zero balance ---

    function test_GetRemainingClaims_ZeroBalance() public {
        vm.prank(admin);
        faucet.withdrawRemaining(admin, type(uint256).max);
        assertEq(faucet.getRemainingClaims(), 0);
    }

    // --- getScope is callable ---

    function test_GetScope_IsCallable() public view {
        // Scope may be 0 in test env (no real SelfVerificationRoot wiring), but should not revert
        faucet.getScope();
    }

    // --- Referral with VoterIdNFT configured ---

    function test_ClaimMintsVoterIdAndEnablesReferral() public {
        vm.prank(admin);
        faucet.setVoterIdNFT(address(voterNFT));

        address referrer = address(0x10);
        mockHub.setVerified(referrer);
        mockHub.simulateVerification(address(faucet), referrer);

        assertTrue(voterNFT.hasVoterId(referrer));
        assertTrue(faucet.isValidReferrer(referrer));

        address claimer = address(0x20);
        mockHub.setVerified(claimer);
        bytes memory userData = abi.encodePacked(referrer);
        mockHub.simulateVerificationWithUserData(address(faucet), claimer, userData);

        assertGt(crep.balanceOf(claimer), 10_000e6);
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

    function _setTotalClaimants(uint256 value) internal {
        vm.store(address(faucet), bytes32(uint256(6)), bytes32(value));
    }
}

// =========================================================================
// 3. ROUND SETTLEMENT — EDGE CASES
// =========================================================================

contract RoundSettlementEdgeCase3Test is VotingTestBase {
    CuryoReputation public crep;
    ContentRegistry public registry;
    RoundVotingEngine public engine;
    RoundRewardDistributor public distributor;
    FrontendRegistry public frontendReg;
    MockVoterIdNFT public voterNFT;

    address public owner = address(0xAA);
    address public submitter = address(0xBB);
    address public voter1 = address(0x10);
    address public voter2 = address(0x20);
    address public voter3 = address(0x30);
    address public voter4 = address(0x40);
    address public keeper = address(0x60);
    address public treasury = address(0x70);

    uint256 constant STAKE = 5e6;

    function setUp() public {
        vm.warp(1000);
        vm.startPrank(owner);

        crep = new CuryoReputation(owner, owner);
        crep.grantRole(crep.MINTER_ROLE(), owner);

        ContentRegistry regImpl = new ContentRegistry();
        RoundVotingEngine engImpl = new RoundVotingEngine();
        RoundRewardDistributor distImpl = new RoundRewardDistributor();

        registry = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(regImpl), abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(crep)))
                )
            )
        );

        engine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engImpl),
                    abi.encodeCall(RoundVotingEngine.initialize, (owner, address(crep), address(registry), address(new ProtocolConfig(owner))))
                )
            )
        );

        distributor = RoundRewardDistributor(
            address(
                new ERC1967Proxy(
                    address(distImpl),
                    abi.encodeCall(
                        RoundRewardDistributor.initialize, (owner, address(crep), address(engine), address(registry))
                    )
                )
            )
        );

        registry.setVotingEngine(address(engine));
        MockCategoryRegistry mockCategoryRegistry = new MockCategoryRegistry();
        mockCategoryRegistry.seedDefaultTestCategories();
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(engine.protocolConfig())).setRewardDistributor(address(distributor));
        ProtocolConfig(address(engine.protocolConfig())).setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(address(engine.protocolConfig())).setTreasury(treasury);
        ProtocolConfig(address(engine.protocolConfig())).setConfig(5 minutes, 7 days, 2, 200);

        crep.mint(owner, 2_000_000e6);
        crep.approve(address(engine), 1_000_000e6);
        engine.addToConsensusReserve(1_000_000e6);

        address[5] memory users = [submitter, voter1, voter2, voter3, voter4];
        for (uint256 i = 0; i < users.length; i++) {
            crep.mint(users[i], 50_000e6);
        }

        vm.stopPrank();
    }

    // --- Tied round (equal stakes on both sides) ---

    function test_TiedRound_RefundsAllVoters() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        _revealAndSettle(contentId, roundId, ck1, true, s1, ck2, false, s2);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied));

        // Both voters should be able to claim refund
        uint256 bal1Before = crep.balanceOf(voter1);
        vm.prank(voter1);
        engine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crep.balanceOf(voter1) - bal1Before, STAKE);

        uint256 bal2Before = crep.balanceOf(voter2);
        vm.prank(voter2);
        engine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crep.balanceOf(voter2) - bal2Before, STAKE);
    }

    // --- Tied round: double claim reverts ---

    function test_TiedRound_DoubleClaimReverts() public {
        uint256 contentId = _submitContent();
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        _revealAndSettle(contentId, roundId, ck1, true, s1, ck2, false, s2);

        vm.prank(voter1);
        engine.claimCancelledRoundRefund(contentId, roundId);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        engine.claimCancelledRoundRefund(contentId, roundId);
    }

    // --- Tied round: non-voter cannot claim ---

    function test_TiedRound_NonVoterCannotClaim() public {
        uint256 contentId = _submitContent();
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        _revealAndSettle(contentId, roundId, ck1, true, s1, ck2, false, s2);

        vm.prank(voter3);
        vm.expectRevert(RoundVotingEngine.NoCommit.selector);
        engine.claimCancelledRoundRefund(contentId, roundId);
    }

    // --- One-sided consensus with multiple voters ---

    function test_OneSidedConsensus_MultipleVoters() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, true, STAKE);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r = RoundEngineReadHelpers.round(engine, contentId, roundId);
        vm.warp(r.startTime + 5 minutes + 1);
        engine.revealVoteByCommitKey(contentId, roundId, ck1, true, s1);
        engine.revealVoteByCommitKey(contentId, roundId, ck2, true, s2);
        engine.revealVoteByCommitKey(contentId, roundId, ck3, true, s3);
        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
        assertTrue(round.upWins);
        assertEq(round.downPool, 0);
    }

    // --- One-sided consensus DOWN ---

    function test_OneSidedConsensus_DownWins() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, false, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r = RoundEngineReadHelpers.round(engine, contentId, roundId);
        vm.warp(r.startTime + 5 minutes + 1);
        engine.revealVoteByCommitKey(contentId, roundId, ck1, false, s1);
        engine.revealVoteByCommitKey(contentId, roundId, ck2, false, s2);
        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
        assertFalse(round.upWins);
    }

    // --- Settlement reward distribution: winner gets stake + reward ---

    function test_SettledRound_WinnerGetsStakePlusReward() public {
        uint256 contentId = _submitContent();

        // Use asymmetric stakes to avoid a tie: UP=10e6, DOWN=5e6 => UP wins
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, 10e6);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        _revealAndSettle(contentId, roundId, ck1, true, s1, ck2, false, s2);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
        assertTrue(round.upWins);

        uint256 winnerBefore = crep.balanceOf(voter1);
        vm.prank(voter1);
        distributor.claimReward(contentId, roundId);
        uint256 winnerReward = crep.balanceOf(voter1) - winnerBefore;

        // Winner gets at least their stake back
        assertGe(winnerReward, 10e6);

        // Loser gets the fixed 5% rebate
        uint256 loserBefore = crep.balanceOf(voter2);
        vm.prank(voter2);
        distributor.claimReward(contentId, roundId);
        assertEq(crep.balanceOf(voter2) - loserBefore, STAKE / 20);
    }

    // --- Submitter reward from two-sided round ---

    function test_SettledRound_SubmitterGetsReward() public {
        uint256 contentId = _submitContent();

        // Use larger stakes so submitter reward is meaningful
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, 100e6);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, 50e6);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        _revealAndSettle(contentId, roundId, ck1, true, s1, ck2, false, s2);

        uint256 pendingReward = engine.pendingSubmitterReward(contentId, roundId);
        assertGt(pendingReward, 0);

        uint256 balBefore = crep.balanceOf(submitter);
        vm.prank(submitter);
        distributor.claimSubmitterReward(contentId, roundId);
        assertEq(crep.balanceOf(submitter) - balBefore, pendingReward);
    }

    // --- Consensus subsidy pays from reserve ---

    function test_ConsensusSettlement_PaysFromReserve() public {
        uint256 reserveBefore = engine.consensusReserve();

        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r = RoundEngineReadHelpers.round(engine, contentId, roundId);
        vm.warp(r.startTime + 5 minutes + 1);
        engine.revealVoteByCommitKey(contentId, roundId, ck1, true, s1);
        engine.revealVoteByCommitKey(contentId, roundId, ck2, true, s2);
        engine.settleRound(contentId, roundId);

        uint256 reserveAfter = engine.consensusReserve();
        assertLt(reserveAfter, reserveBefore, "Reserve should decrease after consensus subsidy");
    }

    // --- MIN_STAKE and MAX_STAKE boundary votes ---

    function test_CommitMinStake_Succeeds() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, 1e6);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, 1);
        assertEq(round.voteCount, 1);
    }

    function test_CommitMaxStake_Succeeds() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, 100e6);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, 1);
        assertEq(round.voteCount, 1);
    }

    function test_CommitZeroStake_Reverts() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, block.timestamp));
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = abi.encodePacked(uint8(1), salt, contentId);
        vm.startPrank(voter1);
        crep.approve(address(engine), 100e6);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        engine.commitVote(contentId, commitHash, ciphertext, 0, address(0));
        vm.stopPrank();
    }

    // --- Commit on inactive content reverts ---

    function test_CommitOnInactiveContent_Reverts() public {
        bytes32 salt = keccak256(abi.encodePacked(voter1, block.timestamp, uint256(999)));
        bytes32 commitHash = _commitHash(true, salt, uint256(999));
        bytes memory ciphertext = abi.encodePacked(uint8(1), salt, uint256(999));
        vm.startPrank(voter1);
        crep.approve(address(engine), STAKE);
        vm.expectRevert(RoundVotingEngine.ContentNotActive.selector);
        engine.commitVote(999, commitHash, ciphertext, STAKE, address(0));
        vm.stopPrank();
    }

    // --- Cooldown: commit after cooldown succeeds on new round ---

    function test_CommitAfterCooldown_NewRoundSucceeds() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        _revealAndSettle(contentId, roundId, ck1, true, s1, ck2, false, s2);

        // Wait for cooldown
        vm.warp(block.timestamp + 24 hours + 1);

        // voter1 can commit again on the new round
        _commit(voter1, contentId, true, STAKE);

        uint256 newRoundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        assertEq(newRoundId, 2);
    }

    // --- settleRound with no revealed votes reverts with NotEnoughVotes ---

    function test_SettleRound_NoRound_Reverts() public {
        // Non-existent round has state=Open (default), so it passes the RoundNotOpen check
        // but fails at NotEnoughVotes since revealedCount=0
        vm.expectRevert(RoundVotingEngine.NotEnoughVotes.selector);
        engine.settleRound(999, 1);
    }

    // --- cancelExpiredRound restores epoch-start rating ---

    function test_CancelExpiredRound_RestoresRating() public {
        uint256 contentId = _submitContent();

        // Get initial rating
        (,,,,,,,,,, uint256 ratingBefore,) = registry.contents(contentId);

        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(keeper);
        engine.cancelExpiredRound(contentId, roundId);

        // Rating should be restored to epoch-start
        (,,,,,,,,,, uint256 ratingAfterCancel,) = registry.contents(contentId);
        assertEq(ratingAfterCancel, ratingBefore);
    }

    // --- Multiple rounds on same content ---

    function test_MultipleRoundsSequential() public {
        uint256 contentId = _submitContent();

        // Round 1 — asymmetric stakes to avoid tie: UP=10e6, DOWN=5e6
        (bytes32 ck1r1, bytes32 s1r1) = _commit(voter1, contentId, true, 10e6);
        (bytes32 ck2r1, bytes32 s2r1) = _commit(voter2, contentId, false, STAKE);
        uint256 rid1 = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        _revealAndSettle(contentId, rid1, ck1r1, true, s1r1, ck2r1, false, s2r1);

        assertEq(
            uint256(RoundEngineReadHelpers.round(engine, contentId, rid1).state), uint256(RoundLib.RoundState.Settled)
        );

        // Wait cooldown
        vm.warp(block.timestamp + 24 hours + 1);

        // Round 2 — asymmetric stakes, DOWN=10e6, UP=5e6
        (bytes32 ck2r2, bytes32 s2r2) = _commit(voter2, contentId, true, 10e6);
        (bytes32 ck1r2, bytes32 s1r2) = _commit(voter1, contentId, false, STAKE);
        uint256 rid2 = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        _revealAndSettle(contentId, rid2, ck2r2, true, s2r2, ck1r2, false, s1r2);

        assertEq(
            uint256(RoundEngineReadHelpers.round(engine, contentId, rid2).state), uint256(RoundLib.RoundState.Settled)
        );
    }

    // --- Asymmetric stakes: winner determined by total stake ---

    function test_AsymmetricStakes_LargerStakeWins() public {
        uint256 contentId = _submitContent();

        // voter1 stakes 100 cREP UP, voter2 stakes 1 cREP DOWN
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, 100e6);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, 1e6);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        _revealAndSettle(contentId, roundId, ck1, true, s1, ck2, false, s2);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
        assertTrue(round.upWins);
    }

    // --- Three voters: 2 up, 1 down ---

    function test_MajorityWins_TwoUpOneDown() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, false, STAKE);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r = RoundEngineReadHelpers.round(engine, contentId, roundId);
        vm.warp(r.startTime + 5 minutes + 1);
        engine.revealVoteByCommitKey(contentId, roundId, ck1, true, s1);
        engine.revealVoteByCommitKey(contentId, roundId, ck2, true, s2);
        engine.revealVoteByCommitKey(contentId, roundId, ck3, false, s3);
        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertTrue(round.upWins);
        assertEq(round.upPool, STAKE * 2);
        assertEq(round.downPool, STAKE);
    }

    // --- setConfig boundary validations ---

    function test_SetConfig_EpochTooShort_Reverts() public {
        ProtocolConfig cfg = ProtocolConfig(address(engine.protocolConfig()));
        vm.prank(owner);
        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        cfg.setConfig(4 minutes, 7 days, 3, 1000); // epochDuration < 5 minutes
    }

    function test_SetConfig_MaxDurationTooShort_Reverts() public {
        ProtocolConfig cfg = ProtocolConfig(address(engine.protocolConfig()));
        vm.prank(owner);
        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        cfg.setConfig(5 minutes, 12 hours, 3, 1000); // maxDuration < 1 day
    }

    function test_SetConfig_MinVotersTooLow_Reverts() public {
        ProtocolConfig cfg = ProtocolConfig(address(engine.protocolConfig()));
        vm.prank(owner);
        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        cfg.setConfig(5 minutes, 7 days, 1, 1000); // minVoters < 2
    }

    function test_SetConfig_MaxVotersLessThanMin_Reverts() public {
        ProtocolConfig cfg = ProtocolConfig(address(engine.protocolConfig()));
        vm.prank(owner);
        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        cfg.setConfig(5 minutes, 7 days, 5, 3); // maxVoters < minVoters
    }

    // --- VoterIdNFT integration ---

    function test_CommitWithVoterIdNFT() public {
        voterNFT = new MockVoterIdNFT();
        ProtocolConfig cfg = ProtocolConfig(address(engine.protocolConfig()));
        vm.prank(owner);
        cfg.setVoterIdNFT(address(voterNFT));

        voterNFT.setHolder(voter1);
        voterNFT.setHolder(voter2);

        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);
        _commit(voter2, contentId, false, STAKE);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, 1);
        assertEq(round.voteCount, 2);
    }

    function test_CommitWithoutVoterId_WhenRequired_Reverts() public {
        voterNFT = new MockVoterIdNFT();
        ProtocolConfig cfg2 = ProtocolConfig(address(engine.protocolConfig()));
        vm.prank(owner);
        cfg2.setVoterIdNFT(address(voterNFT));

        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, block.timestamp, contentId));
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = abi.encodePacked(uint8(1), salt, contentId);
        vm.startPrank(voter1);
        crep.approve(address(engine), STAKE);
        vm.expectRevert(RoundVotingEngine.VoterIdRequired.selector);
        engine.commitVote(contentId, commitHash, ciphertext, STAKE, address(0));
        vm.stopPrank();
    }

    // --- View functions ---

    function test_HasCommitsReflectsVotingHistory() public {
        uint256 contentId = _submitContent();
        assertFalse(engine.hasCommits(contentId));

        _commit(voter1, contentId, true, STAKE);
        assertTrue(engine.hasCommits(contentId));

        _commit(voter2, contentId, false, STAKE);
        assertTrue(engine.hasCommits(contentId));
    }

    function test_GetRound_ReturnsCorrectData() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, 1);
        assertEq(round.voteCount, 1);
        assertEq(round.totalStake, STAKE);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Open));
    }

    function test_GetCommit_ReturnsCorrectData() public {
        uint256 contentId = _submitContent();
        (bytes32 commitKey,) = _commit(voter1, contentId, true, STAKE);

        RoundLib.Commit memory c = RoundEngineReadHelpers.commit(engine, contentId, 1, commitKey);
        assertEq(c.voter, voter1);
        assertEq(c.stakeAmount, STAKE);
        assertFalse(c.revealed);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _submitContent() internal returns (uint256 contentId) {
        vm.startPrank(submitter);
        crep.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/gap3", "goal", "goal", "test", 0);
        vm.stopPrank();
        contentId = 1;
    }

    function _commit(address voter, uint256 contentId, bool isUp, uint256 stake)
        internal
        returns (bytes32 commitKey, bytes32 salt)
    {
        salt = keccak256(abi.encodePacked(voter, block.timestamp, contentId));
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);
        bytes32 commitHash = _commitHash(isUp, salt, contentId, ciphertext);
        vm.prank(voter);
        crep.approve(address(engine), stake);
        vm.prank(voter);
        engine.commitVote(contentId, commitHash, ciphertext, stake, address(0));
        commitKey = keccak256(abi.encodePacked(voter, commitHash));
    }

    /// @dev Commit and immediately return commitKey+salt (helper for simple 1-voter commit).
    function _vote(address voter, uint256 contentId, bool isUp) internal {
        _commit(voter, contentId, isUp, STAKE);
    }

    /// @dev Warp past all pending epochs and settle all revealed votes for contentId.
    ///      Reveals all unrevealed commits in the active round, then settles.
    function _forceSettle(uint256 contentId) internal {
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        if (roundId == 0) return;

        RoundLib.Round memory r = RoundEngineReadHelpers.round(engine, contentId, roundId);
        // Warp well past epoch so all commits are revealable
        vm.warp(r.startTime + 5 minutes + 1);

        // Reveal all commits
        bytes32[] memory keys = RoundEngineReadHelpers.commitKeys(engine, contentId, roundId);
        for (uint256 i = 0; i < keys.length; i++) {
            RoundLib.Commit memory c = RoundEngineReadHelpers.commit(engine, contentId, roundId, keys[i]);
            if (!c.revealed && c.stakeAmount > 0) {
                // Reconstruct reveal params from ciphertext (test mode: 65-byte plaintext)
                bytes memory ct = c.ciphertext;
                bool isUp = uint8(ct[0]) == 1;
                bytes32 salt;
                assembly {
                    salt := mload(add(ct, 33))
                }
                try engine.revealVoteByCommitKey(contentId, roundId, keys[i], isUp, salt) { } catch { }
            }
        }

        RoundLib.Round memory r2 = RoundEngineReadHelpers.round(engine, contentId, roundId);
        if (r2.thresholdReachedAt > 0) {
            try engine.settleRound(contentId, roundId) { } catch { }
        }
    }

    /// @dev Reveal two votes and settle. Requires minVoters=2 config.
    function _revealAndSettle(
        uint256 contentId,
        uint256 roundId,
        bytes32 ck1,
        bool isUp1,
        bytes32 s1,
        bytes32 ck2,
        bool isUp2,
        bytes32 s2
    ) internal {
        RoundLib.Round memory r = RoundEngineReadHelpers.round(engine, contentId, roundId);
        // Warp past epoch end so votes are revealable
        vm.warp(r.startTime + 5 minutes + 1);
        engine.revealVoteByCommitKey(contentId, roundId, ck1, isUp1, s1);
        engine.revealVoteByCommitKey(contentId, roundId, ck2, isUp2, s2);
        engine.settleRound(contentId, roundId);
    }
}
