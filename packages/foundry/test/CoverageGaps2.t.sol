// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { HumanFaucet } from "../contracts/HumanFaucet.sol";
import { MockIdentityVerificationHub } from "../contracts/mocks/MockIdentityVerificationHub.sol";
import { ISelfVerificationRoot } from "@selfxyz/contracts/contracts/interfaces/ISelfVerificationRoot.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";
import { IRoundVotingEngine } from "../contracts/interfaces/IRoundVotingEngine.sol";
import { IParticipationPool } from "../contracts/interfaces/IParticipationPool.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";

// =========================================================================
// SHARED MOCKS
// =========================================================================

contract MockVotingEngineForFR2 is IRoundVotingEngine {
    uint256 public totalAdded;

    function addToConsensusReserve(uint256 amount) external override {
        totalAdded += amount;
    }

    function contentCommitCount(uint256) external pure override returns (uint256) {
        return 0;
    }

    function currentRoundId(uint256) external pure override returns (uint256) {
        return 0;
    }

    function rounds(uint256, uint256)
        external
        pure
        override
        returns (
            uint256,
            RoundLib.RoundState,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            uint256,
            bool,
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (0, RoundLib.RoundState.Open, 0, 0, 0, 0, 0, 0, 0, false, 0, 0, 0, 0);
    }

    function transferReward(address, uint256) external override { }
}

// =========================================================================
// FrontendRegistry Branch Coverage Tests
// =========================================================================

contract FrontendRegistryBranchTest is Test {
    FrontendRegistry public reg;
    CuryoReputation public crep;
    MockVotingEngineForFR2 public engine;
    MockVoterIdNFT public voterNFT;

    address public admin = address(0xA);
    address public frontend1 = address(0xF1);
    address public frontend2 = address(0xF2);
    address public creditor = address(0xC);

    uint256 constant STAKE = 1000e6;

    function setUp() public {
        vm.startPrank(admin);
        crep = new CuryoReputation(admin, admin);
        crep.grantRole(crep.MINTER_ROLE(), admin);
        engine = new MockVotingEngineForFR2();
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

        crep.mint(frontend1, 200_000e6);
        crep.mint(frontend2, 200_000e6);
        crep.mint(address(reg), 1_000_000e6);
        vm.stopPrank();
    }

    // --- Slash → Unslash → Re-approve workflow ---

    function test_SlashUnslashReapproveWorkflow() public {
        _registerFrontend(frontend1);
        vm.prank(admin);
        reg.approveFrontend(frontend1);
        assertTrue(reg.isApproved(frontend1));

        // Slash
        vm.prank(admin);
        reg.slashFrontend(frontend1, 500e6, "Misbehavior");
        assertFalse(reg.isApproved(frontend1));
        (, uint256 staked,, bool slashed) = reg.getFrontendInfo(frontend1);
        assertEq(staked, 500e6);
        assertTrue(slashed);

        // Approve slashed should revert
        vm.prank(admin);
        vm.expectRevert("Frontend is slashed");
        reg.approveFrontend(frontend1);

        // Unslash
        vm.prank(admin);
        reg.unslashFrontend(frontend1);
        (,,, slashed) = reg.getFrontendInfo(frontend1);
        assertFalse(slashed);
        // Still not approved until explicitly re-approved
        assertFalse(reg.isApproved(frontend1));

        // Re-approve
        vm.prank(admin);
        reg.approveFrontend(frontend1);
        assertTrue(reg.isApproved(frontend1));
    }

    // --- Revoke already unapproved (idempotent) ---

    function test_RevokeUnapprovedFrontend() public {
        _registerFrontend(frontend1);
        // Frontend starts unapproved
        assertFalse(reg.isApproved(frontend1));
        // Revoke should succeed even if already unapproved
        vm.prank(admin);
        reg.revokeFrontend(frontend1);
        assertFalse(reg.isApproved(frontend1));
    }

    // --- Approve already approved (idempotent) ---

    function test_ApproveAlreadyApproved() public {
        _registerFrontend(frontend1);
        vm.prank(admin);
        reg.approveFrontend(frontend1);
        assertTrue(reg.isApproved(frontend1));
        // Approve again should not revert
        vm.prank(admin);
        reg.approveFrontend(frontend1);
        assertTrue(reg.isApproved(frontend1));
    }

    // --- Re-register after deregister ---

    function test_ReRegisterAfterDeregister() public {
        _registerFrontend(frontend1);
        vm.prank(frontend1);
        reg.deregister();

        _completeDeregister(frontend1);

        (address op,,,) = reg.getFrontendInfo(frontend1);
        assertEq(op, address(0));

        // Re-register should succeed
        vm.startPrank(frontend1);
        crep.approve(address(reg), STAKE);
        reg.register();
        vm.stopPrank();

        (op,,,) = reg.getFrontendInfo(frontend1);
        assertEq(op, frontend1);
    }

    // --- Deregister with pending fees + stake ---

    function test_DeregisterReturnsBothStakeAndFees() public {
        _registerFrontend(frontend1);
        vm.prank(creditor);
        reg.creditFees(frontend1, 500e6);

        vm.prank(frontend1);
        reg.deregister();
        uint256 balBefore = crep.balanceOf(frontend1);
        _completeDeregister(frontend1);
        uint256 balAfter = crep.balanceOf(frontend1);

        // Should get stake + fees
        assertEq(balAfter - balBefore, STAKE + 500e6);
    }

    // --- Fee accumulation across multiple credits ---

    function test_FeeAccumulation() public {
        _registerFrontend(frontend1);
        vm.startPrank(creditor);
        reg.creditFees(frontend1, 100e6);
        reg.creditFees(frontend1, 200e6);
        reg.creditFees(frontend1, 300e6);
        vm.stopPrank();
        assertEq(reg.getAccumulatedFees(frontend1), 600e6);
    }

    // --- claimFees when not registered ---

    function test_ClaimFeesNotRegisteredReverts() public {
        vm.prank(frontend1);
        vm.expectRevert("Not registered");
        reg.claimFees();
    }

    // --- claimFees when no fees ---

    function test_ClaimFeesNoFeesReverts() public {
        _registerFrontend(frontend1);
        vm.prank(frontend1);
        vm.expectRevert("No fees to claim");
        reg.claimFees();
    }

    // --- claimFees success ---

    function test_ClaimFeesSuccess() public {
        _registerFrontend(frontend1);
        vm.prank(creditor);
        reg.creditFees(frontend1, 500e6);

        uint256 balBefore = crep.balanceOf(frontend1);
        vm.prank(frontend1);
        reg.claimFees();
        assertEq(crep.balanceOf(frontend1) - balBefore, 500e6);
        assertEq(reg.getAccumulatedFees(frontend1), 0);
    }

    // --- Unslash non-slashed frontend ---

    function test_UnslashNonSlashedReverts() public {
        _registerFrontend(frontend1);
        vm.prank(admin);
        vm.expectRevert("Frontend not slashed");
        reg.unslashFrontend(frontend1);
    }

    // --- Deregister slashed frontend reverts ---

    function test_DeregisterSlashedReverts() public {
        _registerFrontend(frontend1);
        vm.prank(admin);
        reg.slashFrontend(frontend1, 100e6, "Misbehavior");

        vm.prank(frontend1);
        vm.expectRevert("Frontend is slashed");
        reg.deregister();
    }

    // --- Slash redirects to consensus reserve ---

    function test_SlashAddsToConsensusReserve() public {
        _registerFrontend(frontend1);
        uint256 slashAmount = 500e6;
        vm.prank(admin);
        reg.slashFrontend(frontend1, slashAmount, "Bad frontend");
        assertEq(engine.totalAdded(), slashAmount);
    }

    // --- creditFees to unregistered frontend ---

    function test_CreditFeesToUnregisteredReverts() public {
        vm.prank(creditor);
        vm.expectRevert("Frontend not registered");
        reg.creditFees(frontend1, 100e6);
    }

    // --- View functions ---

    function test_GetRegisteredFrontends() public {
        _registerFrontend(frontend1);
        _registerFrontend(frontend2);
        address[] memory frontends = reg.getRegisteredFrontends();
        assertEq(frontends.length, 2);
        assertEq(frontends[0], frontend1);
        assertEq(frontends[1], frontend2);
    }

    function test_GetFrontendCount() public {
        assertEq(reg.getFrontendCount(), 0);
        _registerFrontend(frontend1);
        assertEq(reg.getFrontendCount(), 1);
    }

    // --- isApproved: approved && slashed returns false ---

    function test_IsApprovedSlashedReturnsFalse() public {
        _registerFrontend(frontend1);
        vm.prank(admin);
        reg.approveFrontend(frontend1);
        assertTrue(reg.isApproved(frontend1));

        vm.prank(admin);
        reg.slashFrontend(frontend1, 100e6, "Bad");
        // approved=true but slashed=true → isApproved() returns false
        assertFalse(reg.isApproved(frontend1));
    }

    // --- Initialize validation ---

    function test_InitializeZeroAdminReverts() public {
        FrontendRegistry impl = new FrontendRegistry();
        vm.expectRevert("Invalid admin");
        new ERC1967Proxy(address(impl), abi.encodeCall(FrontendRegistry.initialize, (address(0), admin, address(crep))));
    }

    function test_InitializeZeroGovernanceReverts() public {
        FrontendRegistry impl = new FrontendRegistry();
        vm.expectRevert("Invalid governance");
        new ERC1967Proxy(address(impl), abi.encodeCall(FrontendRegistry.initialize, (admin, address(0), address(crep))));
    }

    function test_InitializeZeroTokenReverts() public {
        FrontendRegistry impl = new FrontendRegistry();
        vm.expectRevert("Invalid token");
        new ERC1967Proxy(address(impl), abi.encodeCall(FrontendRegistry.initialize, (admin, admin, address(0))));
    }

    // --- setVotingEngine zero address ---

    function test_SetVotingEngineZeroReverts() public {
        vm.prank(admin);
        vm.expectRevert("Invalid voting engine");
        reg.setVotingEngine(address(0));
    }

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
}

// =========================================================================
// HumanFaucet Tier & Branch Coverage Tests
// =========================================================================

contract HumanFaucetBranchTest is Test {
    HumanFaucet public faucet;
    MockIdentityVerificationHub public mockHub;
    CuryoReputation public crep;
    MockVoterIdNFT public voterNFT;

    address public admin = address(0xA);
    address public governance = address(0xB);
    address public user1 = address(0x10);
    address public user2 = address(0x20);
    address public user3 = address(0x30);

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

    // --- Self-referral attempt (referrer == user) ---

    function test_SelfReferralIgnored() public {
        // user1 claims first
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        // user2 tries to self-refer
        mockHub.setVerified(user2);
        bytes memory userData = abi.encodePacked(user2); // self-refer
        mockHub.simulateVerificationWithUserData(address(faucet), user2, userData);

        // user2 should get base amount (no referral bonus)
        assertEq(crep.balanceOf(user2), 10_000e6);
    }

    // --- Referrer has not yet claimed ---

    function test_ReferrerNotClaimedIgnored() public {
        // user2 refers to user1 who has NOT claimed
        mockHub.setVerified(user2);
        bytes memory userData = abi.encodePacked(user1); // user1 hasn't claimed
        mockHub.simulateVerificationWithUserData(address(faucet), user2, userData);

        // Should get base amount only
        assertEq(crep.balanceOf(user2), 10_000e6);
    }

    // --- Tier 0 boundary (exact 10th claim triggers tier change) ---

    function test_TierChangedEventAtTier0Boundary() public {
        // Make 9 claims (tier 0)
        for (uint256 i = 0; i < 9; i++) {
            address u = address(uint160(50000 + i));
            mockHub.setVerified(u);
            mockHub.simulateVerification(address(faucet), u);
        }
        assertEq(faucet.getCurrentTier(), 0);
        assertEq(faucet.totalClaimants(), 9);

        // 10th claim should trigger TierChanged event
        address u10 = address(uint160(60000));
        mockHub.setVerified(u10);
        vm.expectEmit(false, false, false, true);
        emit HumanFaucet.TierChanged(1, 1_000e6, 10);
        mockHub.simulateVerification(address(faucet), u10);

        assertEq(faucet.getCurrentTier(), 1);
        assertEq(faucet.totalClaimants(), 10);
    }

    // --- Tier amounts at all tiers ---

    function test_ClaimAmountAtTier0() public view {
        assertEq(faucet.getCurrentClaimAmount(), 10_000e6);
    }

    function test_ClaimAmountAtTier1() public {
        _setTotalClaimants(10);
        assertEq(faucet.getCurrentClaimAmount(), 1_000e6);
    }

    function test_ClaimAmountAtTier2() public {
        _setTotalClaimants(1_000);
        assertEq(faucet.getCurrentClaimAmount(), 100e6);
    }

    function test_ClaimAmountAtTier3() public {
        _setTotalClaimants(10_000);
        assertEq(faucet.getCurrentClaimAmount(), 10e6);
    }

    function test_ClaimAmountAtTier4() public {
        _setTotalClaimants(1_000_000);
        assertEq(faucet.getCurrentClaimAmount(), 1e6);
    }

    // --- Tier boundary exact values ---

    function test_TierBoundaryExact9() public {
        _setTotalClaimants(9);
        assertEq(faucet.getCurrentTier(), 0);
    }

    function test_TierBoundaryExact10() public {
        _setTotalClaimants(10);
        assertEq(faucet.getCurrentTier(), 1);
    }

    function test_TierBoundaryExact999() public {
        _setTotalClaimants(999);
        assertEq(faucet.getCurrentTier(), 1);
    }

    function test_TierBoundaryExact1000() public {
        _setTotalClaimants(1_000);
        assertEq(faucet.getCurrentTier(), 2);
    }

    function test_TierBoundaryExact9999() public {
        _setTotalClaimants(9_999);
        assertEq(faucet.getCurrentTier(), 2);
    }

    function test_TierBoundaryExact10000() public {
        _setTotalClaimants(10_000);
        assertEq(faucet.getCurrentTier(), 3);
    }

    function test_TierBoundaryExact999999() public {
        _setTotalClaimants(999_999);
        assertEq(faucet.getCurrentTier(), 3);
    }

    function test_TierBoundaryExact1000000() public {
        _setTotalClaimants(1_000_000);
        assertEq(faucet.getCurrentTier(), 4);
    }

    // --- Referral amounts (50% split) ---

    function test_ReferralAmountsAtTier0() public view {
        (uint256 bonus, uint256 reward) = faucet.getCurrentReferralAmounts();
        assertEq(bonus, 5_000e6); // 50% of 10,000
        assertEq(reward, 5_000e6);
    }

    function test_ReferralAmountsAtTier2() public {
        _setTotalClaimants(1_000);
        (uint256 bonus, uint256 reward) = faucet.getCurrentReferralAmounts();
        assertEq(bonus, 50e6); // 50% of 100
        assertEq(reward, 50e6);
    }

    // --- getTierInfo: tier 0 at start ---

    function test_GetTierInfoTier0() public view {
        (uint256 tier, uint256 claimAmount,,, uint256 inTier, uint256 untilNext) = faucet.getTierInfo();
        assertEq(tier, 0);
        assertEq(claimAmount, 10_000e6);
        assertEq(inTier, 0);
        assertEq(untilNext, 10);
    }

    // --- getTierInfo: tier 0 mid-tier ---

    function test_GetTierInfoTier0MidTier() public {
        _setTotalClaimants(5);
        (uint256 tier,,,, uint256 inTier, uint256 untilNext) = faucet.getTierInfo();
        assertEq(tier, 0);
        assertEq(inTier, 5);
        assertEq(untilNext, 5);
    }

    // --- Pause blocks claims ---

    function test_PauseBlocksClaim() public {
        vm.prank(admin);
        faucet.pause();

        mockHub.setVerified(user1);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        mockHub.simulateVerification(address(faucet), user1);
    }

    // --- getRemainingClaims when zero ---

    function test_GetRemainingClaimsWhenEmpty() public {
        vm.prank(admin);
        faucet.withdrawRemaining(admin, type(uint256).max);
        assertEq(faucet.getRemainingClaims(), 0);
    }

    // --- withdrawRemaining to zero address ---

    function test_WithdrawRemainingToZeroAddressReverts() public {
        vm.prank(admin);
        vm.expectRevert("Invalid address");
        faucet.withdrawRemaining(address(0), 100);
    }

    // --- Double claim with same nullifier ---

    function test_DoubleClaimSameNullifierReverts() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        // Try claiming again (same nullifier, different address)
        mockHub.setVerified(user2);
        // Re-use the same user for simplicity (already claimed)
        vm.expectRevert(HumanFaucet.NullifierAlreadyUsed.selector);
        mockHub.simulateVerification(address(faucet), user1);
    }

    // --- getScope returns a value ---

    function test_GetScopeReturnsValue() public view {
        // Scope is derived from contract name hash; just call for coverage
        faucet.getScope();
    }

    // --- getReferralStats for user with no referrals ---

    function test_GetReferralStatsEmpty() public view {
        (uint256 count, uint256 earned) = faucet.getReferralStats(user1);
        assertEq(count, 0);
        assertEq(earned, 0);
    }

    // --- Valid referral flow with stats ---

    function test_ReferralFlowWithStats() public {
        // user1 claims
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        // user2 refers user1
        mockHub.setVerified(user2);
        bytes memory userData = abi.encodePacked(user1);
        mockHub.simulateVerificationWithUserData(address(faucet), user2, userData);

        (uint256 count, uint256 earned) = faucet.getReferralStats(user1);
        assertEq(count, 1);
        assertEq(earned, 5_000e6);
        assertEq(faucet.referredBy(user2), user1);
    }

    function _setTotalClaimants(uint256 value) internal {
        vm.store(address(faucet), bytes32(uint256(6)), bytes32(value));
    }
}

// =========================================================================
// ContentRegistry Coverage Tests (47% → target 80%+)
// =========================================================================

contract ContentRegistryCoverageTest is Test {
    ContentRegistry public registry;
    CuryoReputation public crep;
    MockVoterIdNFT public voterNFT;

    address public admin = address(0xA);
    address public submitter = address(0xB);
    address public other = address(0xC);
    address public treasury = address(0xD);
    address public bonusPool = address(0xE);

    function setUp() public {
        vm.startPrank(admin);
        crep = new CuryoReputation(admin, admin);
        crep.grantRole(crep.MINTER_ROLE(), admin);
        voterNFT = new MockVoterIdNFT();

        ContentRegistry impl = new ContentRegistry();
        registry = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(ContentRegistry.initialize, (admin, admin, address(crep)))
                )
            )
        );

        registry.setTreasury(treasury);
        registry.setBonusPool(bonusPool);

        crep.mint(submitter, 100_000e6);
        crep.mint(other, 100_000e6);
        vm.stopPrank();
    }

    // --- submitContent: basic success ---

    function test_SubmitContentSuccess() public {
        vm.startPrank(submitter);
        crep.approve(address(registry), 10e6);
        uint256 id = registry.submitContent("https://example.com/test", "goal", "tag1", 0);
        vm.stopPrank();

        assertEq(id, 1);
        ContentRegistry.Content memory c = registry.getContent(1);
        assertEq(c.submitter, submitter);
        assertEq(uint256(c.status), uint256(ContentRegistry.ContentStatus.Active));
        assertEq(c.rating, 50);
        assertEq(c.submitterStake, 10e6);
    }

    // --- submitContent: empty URL ---

    function test_SubmitContentEmptyURLReverts() public {
        vm.startPrank(submitter);
        crep.approve(address(registry), 10e6);
        vm.expectRevert("URL required");
        registry.submitContent("", "goal", "tag1", 0);
        vm.stopPrank();
    }

    // --- submitContent: URL too long ---

    function test_SubmitContentURLTooLongReverts() public {
        bytes memory longUrl = new bytes(2049);
        for (uint256 i = 0; i < 2049; i++) {
            longUrl[i] = "a";
        }
        vm.startPrank(submitter);
        crep.approve(address(registry), 10e6);
        vm.expectRevert("URL too long");
        registry.submitContent(string(longUrl), "goal", "tag1", 0);
        vm.stopPrank();
    }

    // --- submitContent: empty goal ---

    function test_SubmitContentEmptyGoalReverts() public {
        vm.startPrank(submitter);
        crep.approve(address(registry), 10e6);
        vm.expectRevert("Goal required");
        registry.submitContent("https://example.com/test", "", "tag1", 0);
        vm.stopPrank();
    }

    // --- submitContent: goal too long ---

    function test_SubmitContentGoalTooLongReverts() public {
        bytes memory longGoal = new bytes(501);
        for (uint256 i = 0; i < 501; i++) {
            longGoal[i] = "b";
        }
        vm.startPrank(submitter);
        crep.approve(address(registry), 10e6);
        vm.expectRevert("Goal too long");
        registry.submitContent("https://example.com/test", string(longGoal), "tag1", 0);
        vm.stopPrank();
    }

    // --- submitContent: empty tags ---

    function test_SubmitContentEmptyTagsReverts() public {
        vm.startPrank(submitter);
        crep.approve(address(registry), 10e6);
        vm.expectRevert("Tags required");
        registry.submitContent("https://example.com/test", "goal", "", 0);
        vm.stopPrank();
    }

    // --- submitContent: tags too long ---

    function test_SubmitContentTagsTooLongReverts() public {
        bytes memory longTags = new bytes(257);
        for (uint256 i = 0; i < 257; i++) {
            longTags[i] = "c";
        }
        vm.startPrank(submitter);
        crep.approve(address(registry), 10e6);
        vm.expectRevert("Tags too long");
        registry.submitContent("https://example.com/test", "goal", string(longTags), 0);
        vm.stopPrank();
    }

    // --- submitContent: duplicate URL ---

    function test_SubmitContentDuplicateURLReverts() public {
        vm.startPrank(submitter);
        crep.approve(address(registry), 20e6);
        registry.submitContent("https://example.com/dup", "goal", "tag1", 0);
        vm.expectRevert("URL already submitted");
        registry.submitContent("https://example.com/dup", "goal2", "tag2", 0);
        vm.stopPrank();
    }

    // --- submitContent: with VoterIdNFT required ---

    function test_SubmitContentRequiresVoterIdWhenSet() public {
        vm.prank(admin);
        registry.setVoterIdNFT(address(voterNFT));

        vm.startPrank(submitter);
        crep.approve(address(registry), 10e6);
        vm.expectRevert("Voter ID required");
        registry.submitContent("https://example.com/nft", "goal", "tag1", 0);
        vm.stopPrank();
    }

    function test_SubmitContentSucceedsWithVoterId() public {
        vm.prank(admin);
        registry.setVoterIdNFT(address(voterNFT));
        voterNFT.setHolder(submitter);

        vm.startPrank(submitter);
        crep.approve(address(registry), 10e6);
        uint256 id = registry.submitContent("https://example.com/nft2", "goal", "tag1", 0);
        vm.stopPrank();
        assertEq(id, 1);
    }

    // --- submitContent: non-zero categoryId without registry ---

    function test_SubmitContentCategoryNoRegistryReverts() public {
        vm.startPrank(submitter);
        crep.approve(address(registry), 10e6);
        vm.expectRevert("CategoryRegistry not set");
        registry.submitContent("https://example.com/cat", "goal", "tag1", 1);
        vm.stopPrank();
    }

    // --- cancelContent: basic success ---

    function test_CancelContentSuccess() public {
        uint256 id = _submitContent(submitter, "https://example.com/cancel");
        uint256 balBefore = crep.balanceOf(submitter);

        vm.prank(submitter);
        registry.cancelContent(id);

        ContentRegistry.Content memory c = registry.getContent(id);
        assertEq(uint256(c.status), uint256(ContentRegistry.ContentStatus.Cancelled));

        // Gets refund minus 1 cREP cancellation fee
        uint256 balAfter = crep.balanceOf(submitter);
        assertEq(balAfter - balBefore, 9e6); // 10 - 1 = 9
    }

    // --- cancelContent: not submitter ---

    function test_CancelContentNotSubmitterReverts() public {
        uint256 id = _submitContent(submitter, "https://example.com/nocancel");
        vm.prank(other);
        vm.expectRevert("Not submitter");
        registry.cancelContent(id);
    }

    // --- cancelContent: not active ---

    function test_CancelContentNotActiveReverts() public {
        uint256 id = _submitContent(submitter, "https://example.com/dormant");
        // Mark dormant
        vm.warp(block.timestamp + 31 days);
        registry.markDormant(id);

        vm.prank(submitter);
        vm.expectRevert("Not active");
        registry.cancelContent(id);
    }

    // --- cancelContent: URL released for resubmission ---

    function test_CancelContentReleasesURL() public {
        uint256 id = _submitContent(submitter, "https://example.com/reuse");
        vm.prank(submitter);
        registry.cancelContent(id);

        // URL should be reusable
        vm.startPrank(submitter);
        crep.approve(address(registry), 10e6);
        uint256 id2 = registry.submitContent("https://example.com/reuse", "new goal", "tag", 0);
        vm.stopPrank();
        assertEq(id2, 2);
    }

    // --- cancelContent without bonus pool ---

    function test_CancelContentNoBonusPoolReverts() public {
        // Deploy fresh registry without bonusPool set
        vm.startPrank(admin);
        ContentRegistry impl = new ContentRegistry();
        ContentRegistry reg2 = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(ContentRegistry.initialize, (admin, admin, address(crep)))
                )
            )
        );
        crep.mint(submitter, 100_000e6);
        vm.stopPrank();

        vm.startPrank(submitter);
        crep.approve(address(reg2), 10e6);
        uint256 id = reg2.submitContent("https://example.com/nobonus", "goal", "tag1", 0);
        vm.expectRevert("Bonus pool not set");
        reg2.cancelContent(id);
        vm.stopPrank();
    }

    // --- markDormant: success ---

    function test_MarkDormantSuccess() public {
        uint256 id = _submitContent(submitter, "https://example.com/dormant2");
        vm.warp(block.timestamp + 31 days);

        uint256 balBefore = crep.balanceOf(submitter);
        registry.markDormant(id);
        uint256 balAfter = crep.balanceOf(submitter);

        ContentRegistry.Content memory c = registry.getContent(id);
        assertEq(uint256(c.status), uint256(ContentRegistry.ContentStatus.Dormant));
        assertEq(balAfter - balBefore, 10e6); // Full stake return
    }

    // --- markDormant: too early ---

    function test_MarkDormantTooEarlyReverts() public {
        uint256 id = _submitContent(submitter, "https://example.com/early");
        vm.warp(block.timestamp + 29 days);

        vm.expectRevert("Dormancy period not elapsed");
        registry.markDormant(id);
    }

    // --- reviveContent: success ---

    function test_ReviveContentSuccess() public {
        uint256 id = _submitContent(submitter, "https://example.com/revive");
        vm.warp(block.timestamp + 31 days);
        registry.markDormant(id);

        vm.startPrank(other);
        crep.approve(address(registry), 5e6);
        registry.reviveContent(id);
        vm.stopPrank();

        ContentRegistry.Content memory c = registry.getContent(id);
        assertEq(uint256(c.status), uint256(ContentRegistry.ContentStatus.Active));
        assertEq(c.dormantCount, 1);
        assertEq(c.reviver, other);
    }

    // --- reviveContent: not dormant ---

    function test_ReviveContentNotDormantReverts() public {
        uint256 id = _submitContent(submitter, "https://example.com/revive2");
        vm.startPrank(other);
        crep.approve(address(registry), 5e6);
        vm.expectRevert("Not dormant");
        registry.reviveContent(id);
        vm.stopPrank();
    }

    // --- reviveContent: max revivals ---

    function test_ReviveContentMaxRevivalsReverts() public {
        uint256 id = _submitContent(submitter, "https://example.com/maxrev");
        uint256 t = block.timestamp;

        for (uint256 i = 0; i < 2; i++) {
            t += 31 days;
            vm.warp(t);
            registry.markDormant(id);
            vm.startPrank(other);
            crep.approve(address(registry), 5e6);
            registry.reviveContent(id);
            vm.stopPrank();
            // reviveContent resets both lastActivityAt and the dormancy anchor, so next dormancy starts from t
        }

        // Third revival should fail (dormantCount == MAX_REVIVALS == 2)
        t += 31 days;
        vm.warp(t);
        registry.markDormant(id);
        vm.startPrank(other);
        crep.approve(address(registry), 5e6);
        vm.expectRevert("Max revivals reached");
        registry.reviveContent(id);
        vm.stopPrank();
    }

    // --- updateRatingDirect: capped at 100 ---

    function test_UpdateRatingDirectCappedAt100() public {
        uint256 id = _submitContent(submitter, "https://example.com/rating");

        // Set up voting engine to call updateRatingDirect
        vm.prank(admin);
        registry.setVotingEngine(address(this));

        // Content starts at rating 50. Set to 150 (should cap at 100)
        registry.updateRatingDirect(id, 150);
        assertEq(registry.getRating(id), 100);
    }

    // --- updateRatingDirect: set to 0 ---

    function test_UpdateRatingDirectSetToZero() public {
        uint256 id = _submitContent(submitter, "https://example.com/rating0");

        vm.prank(admin);
        registry.setVotingEngine(address(this));

        // Content starts at rating 50. Set directly to 0
        registry.updateRatingDirect(id, 0);
        assertEq(registry.getRating(id), 0);
    }

    // --- updateRatingDirect: same rating is no-op ---

    function test_UpdateRatingDirectSameRating() public {
        uint256 id = _submitContent(submitter, "https://example.com/noop");

        vm.prank(admin);
        registry.setVotingEngine(address(this));

        // Set to same rating (50) — should be a no-op
        registry.updateRatingDirect(id, 50);
        assertEq(registry.getRating(id), 50);
    }

    // --- updateRatingDirect: set higher ---

    function test_UpdateRatingDirectSetHigher() public {
        uint256 id = _submitContent(submitter, "https://example.com/up");
        vm.prank(admin);
        registry.setVotingEngine(address(this));
        registry.updateRatingDirect(id, 55);
        assertEq(registry.getRating(id), 55);
    }

    // --- updateRatingDirect: set lower ---

    function test_UpdateRatingDirectSetLower() public {
        uint256 id = _submitContent(submitter, "https://example.com/down");
        vm.prank(admin);
        registry.setVotingEngine(address(this));
        registry.updateRatingDirect(id, 45);
        assertEq(registry.getRating(id), 45);
    }

    // --- updateActivity: only voting engine ---

    function test_UpdateActivityOnlyVotingEngine() public {
        uint256 id = _submitContent(submitter, "https://example.com/activity");
        vm.prank(other);
        vm.expectRevert("Only VotingEngine");
        registry.updateActivity(id);
    }

    // --- returnSubmitterStake: only voting engine ---

    function test_ReturnSubmitterStakeOnlyVotingEngine() public {
        uint256 id = _submitContent(submitter, "https://example.com/return");
        vm.prank(other);
        vm.expectRevert("Only VotingEngine");
        registry.returnSubmitterStake(id);
    }

    // --- returnSubmitterStake: already returned ---

    function test_ReturnSubmitterStakeAlreadyReturnedReverts() public {
        uint256 id = _submitContent(submitter, "https://example.com/double");
        vm.prank(admin);
        registry.setVotingEngine(address(this));

        registry.returnSubmitterStake(id);
        vm.expectRevert("Already returned");
        registry.returnSubmitterStake(id);
    }

    // --- slashSubmitterStake: success ---

    function test_SlashSubmitterStakeSuccess() public {
        uint256 id = _submitContent(submitter, "https://example.com/slash");
        vm.prank(admin);
        registry.setVotingEngine(address(this));

        uint256 treasuryBefore = crep.balanceOf(treasury);
        uint256 slashed = registry.slashSubmitterStake(id);

        assertEq(slashed, 10e6);
        assertEq(crep.balanceOf(treasury) - treasuryBefore, 10e6);
    }

    // --- slashSubmitterStake: already returned ---

    function test_SlashSubmitterStakeAlreadyReturnedReverts() public {
        uint256 id = _submitContent(submitter, "https://example.com/slashret");
        vm.prank(admin);
        registry.setVotingEngine(address(this));

        registry.returnSubmitterStake(id);
        vm.expectRevert("Already returned");
        registry.slashSubmitterStake(id);
    }

    // --- slashSubmitterStake: treasury not set ---

    function test_SlashSubmitterStakeNoTreasuryReverts() public {
        // Deploy fresh registry without treasury
        vm.startPrank(admin);
        ContentRegistry impl = new ContentRegistry();
        ContentRegistry reg2 = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(ContentRegistry.initialize, (admin, admin, address(crep)))
                )
            )
        );
        reg2.setBonusPool(bonusPool);
        reg2.setVotingEngine(address(this));
        crep.mint(submitter, 100_000e6);
        vm.stopPrank();

        vm.startPrank(submitter);
        crep.approve(address(reg2), 10e6);
        uint256 id = reg2.submitContent("https://example.com/notreasury", "goal", "tag1", 0);
        vm.stopPrank();

        vm.expectRevert("Treasury not set");
        reg2.slashSubmitterStake(id);
    }

    // --- View functions ---

    function test_IsActive() public {
        uint256 id = _submitContent(submitter, "https://example.com/active");
        assertTrue(registry.isActive(id));
        assertFalse(registry.isActive(999)); // Non-existent
    }

    function test_GetSubmitter() public {
        uint256 id = _submitContent(submitter, "https://example.com/getsub");
        assertEq(registry.getSubmitter(id), submitter);
    }

    function test_IsUrlSubmitted() public {
        _submitContent(submitter, "https://example.com/urlcheck");
        assertTrue(registry.isUrlSubmitted("https://example.com/urlcheck"));
        assertFalse(registry.isUrlSubmitted("https://example.com/notsubmitted"));
    }

    function test_GetCreatedAt() public {
        vm.warp(1000);
        uint256 id = _submitContent(submitter, "https://example.com/created");
        assertEq(registry.getCreatedAt(id), 1000);
    }

    function test_GetCategoryId() public {
        uint256 id = _submitContent(submitter, "https://example.com/catid");
        assertEq(registry.getCategoryId(id), 0);
    }

    // --- Pause/Unpause ---

    function test_PauseBlocksSubmit() public {
        vm.prank(admin);
        registry.pause();

        vm.startPrank(submitter);
        crep.approve(address(registry), 10e6);
        vm.expectRevert();
        registry.submitContent("https://example.com/paused", "goal", "tag1", 0);
        vm.stopPrank();
    }

    // --- Config setters ---

    function test_SetVotingEngineZeroReverts() public {
        vm.prank(admin);
        vm.expectRevert("Invalid address");
        registry.setVotingEngine(address(0));
    }

    function test_SetCategoryRegistryZeroReverts() public {
        vm.prank(admin);
        vm.expectRevert("Invalid address");
        registry.setCategoryRegistry(address(0));
    }

    function test_SetVoterIdNFTZeroReverts() public {
        vm.prank(admin);
        vm.expectRevert("Invalid address");
        registry.setVoterIdNFT(address(0));
    }

    function test_SetParticipationPoolZeroReverts() public {
        vm.prank(admin);
        vm.expectRevert("Invalid address");
        registry.setParticipationPool(address(0));
    }

    function test_SetBonusPoolZeroReverts() public {
        vm.prank(admin);
        vm.expectRevert("Invalid address");
        registry.setBonusPool(address(0));
    }

    function test_SetTreasuryZeroReverts() public {
        vm.prank(admin);
        vm.expectRevert("Invalid address");
        registry.setTreasury(address(0));
    }

    // --- Initialize validation ---

    function test_InitializeZeroAdminReverts() public {
        ContentRegistry impl = new ContentRegistry();
        vm.expectRevert("Invalid admin");
        new ERC1967Proxy(address(impl), abi.encodeCall(ContentRegistry.initialize, (address(0), admin, address(crep))));
    }

    function test_InitializeZeroGovernanceReverts() public {
        ContentRegistry impl = new ContentRegistry();
        vm.expectRevert("Invalid governance");
        new ERC1967Proxy(address(impl), abi.encodeCall(ContentRegistry.initialize, (admin, address(0), address(crep))));
    }

    function test_InitializeZeroTokenReverts() public {
        ContentRegistry impl = new ContentRegistry();
        vm.expectRevert("Invalid cREP token");
        new ERC1967Proxy(address(impl), abi.encodeCall(ContentRegistry.initialize, (admin, admin, address(0))));
    }

    function _submitContent(address who, string memory url) internal returns (uint256) {
        vm.startPrank(who);
        crep.approve(address(registry), 10e6);
        uint256 id = registry.submitContent(url, "goal", "tag1", 0);
        vm.stopPrank();
        return id;
    }
}

// =========================================================================
// CuryoReputation Coverage Tests (77% → target 90%+)
// =========================================================================

contract CuryoReputationCoverageTest is Test {
    CuryoReputation public crep;

    address public admin = address(0xA);
    address public governance = address(0xB);
    address public governor = address(0xC);
    address public votingEngine = address(0xD);
    address public contentRegistry = address(0xE);
    address public user1 = address(0x10);
    address public user2 = address(0x20);

    function setUp() public {
        vm.startPrank(admin);
        crep = new CuryoReputation(admin, governance);
        crep.grantRole(crep.MINTER_ROLE(), admin);
        crep.setGovernor(governor);
        crep.setContentVotingContracts(votingEngine, contentRegistry);
        crep.mint(user1, 10_000e6);
        crep.mint(user2, 10_000e6);
        vm.stopPrank();
    }

    // --- Governance lock: fresh lock ---

    function test_GovernanceLockFresh() public {
        vm.prank(governor);
        crep.lockForGovernance(user1, 1_000e6);

        assertEq(crep.getLockedBalance(user1), 1_000e6);
        assertTrue(crep.isLocked(user1));
        assertEq(crep.getTransferableBalance(user1), 9_000e6);
    }

    // --- Governance lock: accumulation when active ---

    function test_GovernanceLockAccumulation() public {
        vm.prank(governor);
        crep.lockForGovernance(user1, 1_000e6);

        vm.prank(governor);
        crep.lockForGovernance(user1, 500e6);

        assertEq(crep.getLockedBalance(user1), 1_500e6);
    }

    // --- Governance lock: fresh lock after expiry ---

    function test_GovernanceLockFreshAfterExpiry() public {
        vm.prank(governor);
        crep.lockForGovernance(user1, 1_000e6);

        // Wait for lock to expire
        vm.warp(block.timestamp + 7 days + 1);
        assertEq(crep.getLockedBalance(user1), 0);
        assertFalse(crep.isLocked(user1));

        // New lock should be fresh (not accumulate)
        vm.prank(governor);
        crep.lockForGovernance(user1, 500e6);

        assertEq(crep.getLockedBalance(user1), 500e6);
    }

    // --- Transfer blocked when governance locked ---

    function test_TransferBlockedWhenLocked() public {
        vm.prank(governor);
        crep.lockForGovernance(user1, 10_000e6);

        vm.prank(user1);
        vm.expectRevert("Exceeds transferable balance (governance locked)");
        crep.transfer(user2, 1);
    }

    // --- Partial transfer: only transferable amount ---

    function test_PartialTransferWhenLocked() public {
        vm.prank(governor);
        crep.lockForGovernance(user1, 5_000e6);

        // Can transfer up to 5,000 (10,000 - 5,000)
        vm.prank(user1);
        crep.transfer(user2, 5_000e6);
        assertEq(crep.balanceOf(user1), 5_000e6);
    }

    // --- Transfer to votingEngine allowed while locked ---

    function test_TransferToVotingEngineWhileLocked() public {
        vm.prank(governor);
        crep.lockForGovernance(user1, 10_000e6);

        // Transfer to voting engine should be allowed despite full lock
        vm.prank(user1);
        crep.transfer(votingEngine, 5_000e6);
        assertEq(crep.balanceOf(votingEngine), 5_000e6);
    }

    // --- Transfer to contentRegistry allowed while locked ---

    function test_TransferToContentRegistryWhileLocked() public {
        vm.prank(governor);
        crep.lockForGovernance(user1, 10_000e6);

        vm.prank(user1);
        crep.transfer(contentRegistry, 5_000e6);
        assertEq(crep.balanceOf(contentRegistry), 5_000e6);
    }

    // --- Self-delegation enforcement ---

    function test_DelegateToOtherReverts() public {
        vm.prank(user1);
        vm.expectRevert("Only self-delegation allowed");
        crep.delegate(user2);
    }

    // --- Auto-delegation on first receipt ---

    function test_AutoDelegationOnReceipt() public {
        address newUser = address(0x99);
        vm.prank(admin);
        crep.mint(newUser, 1_000e6);

        // After minting, user should be self-delegated
        assertEq(crep.delegates(newUser), newUser);
    }

    // --- MAX_SUPPLY enforcement ---

    function test_MintExceedsMaxSupplyReverts() public {
        uint256 remaining = crep.MAX_SUPPLY() - crep.totalSupply();
        vm.prank(admin);
        vm.expectRevert("Exceeds max supply");
        crep.mint(user1, remaining + 1);
    }

    // --- Mint up to MAX_SUPPLY ---

    function test_MintUpToMaxSupply() public {
        uint256 remaining = crep.MAX_SUPPLY() - crep.totalSupply();
        vm.prank(admin);
        crep.mint(user1, remaining);
        assertEq(crep.totalSupply(), crep.MAX_SUPPLY());
    }

    // --- lockForGovernance: only governor ---

    function test_LockForGovernanceOnlyGovernor() public {
        vm.prank(user1);
        vm.expectRevert("Only governor");
        crep.lockForGovernance(user1, 1_000e6);
    }

    // --- lockForGovernance: zero amount ---

    function test_LockForGovernanceZeroAmountReverts() public {
        vm.prank(governor);
        vm.expectRevert("Amount must be > 0");
        crep.lockForGovernance(user1, 0);
    }

    // --- getGovernanceLock: expired ---

    function test_GetGovernanceLockExpired() public {
        vm.prank(governor);
        crep.lockForGovernance(user1, 1_000e6);

        vm.warp(block.timestamp + 7 days + 1);
        (uint256 amount, uint256 unlockTime) = crep.getGovernanceLock(user1);
        assertEq(amount, 0);
        assertGt(unlockTime, 0); // unlockTime is still stored
    }

    // --- getGovernanceLock: active ---

    function test_GetGovernanceLockActive() public {
        vm.prank(governor);
        crep.lockForGovernance(user1, 1_000e6);

        (uint256 amount, uint256 unlockTime) = crep.getGovernanceLock(user1);
        assertEq(amount, 1_000e6);
        assertEq(unlockTime, block.timestamp + 7 days);
    }

    // --- getTransferableBalance: no lock ---

    function test_GetTransferableBalanceNoLock() public view {
        assertEq(crep.getTransferableBalance(user1), 10_000e6);
    }

    // --- getTransferableBalance: locked more than balance ---

    function test_GetTransferableBalanceLockedMoreThanBalance() public {
        // Lock 10,000, transfer some away, locked > balance
        vm.prank(governor);
        crep.lockForGovernance(user1, 10_000e6);

        // Transfer to voting engine (allowed)
        vm.prank(user1);
        crep.transfer(votingEngine, 5_000e6);

        // Now balance is 5,000 but locked is 10,000 → transferable = 0
        assertEq(crep.getTransferableBalance(user1), 0);
    }

    // --- decimals ---

    function test_Decimals() public view {
        assertEq(crep.decimals(), 6);
    }

    // --- setGovernor zero address ---

    function test_SetGovernorZeroReverts() public {
        vm.prank(admin);
        vm.expectRevert("Invalid address");
        crep.setGovernor(address(0));
    }

    // --- setContentVotingContracts zero addresses ---

    function test_SetContentVotingContractsZeroEngine() public {
        vm.prank(admin);
        vm.expectRevert("Invalid address");
        crep.setContentVotingContracts(address(0), contentRegistry);
    }

    function test_SetContentVotingContractsZeroRegistry() public {
        vm.prank(admin);
        vm.expectRevert("Invalid address");
        crep.setContentVotingContracts(votingEngine, address(0));
    }

    // --- constructor zero governance ---

    function test_ConstructorZeroGovernanceReverts() public {
        vm.expectRevert("Invalid governance");
        new CuryoReputation(admin, address(0));
    }
}

// =========================================================================
// RoundVotingEngine Settlement Branch Tests (62.5% → target 80%+)
// =========================================================================

contract RoundSettlementBranchTest is VotingTestBase {
    CuryoReputation public crep;
    ContentRegistry public registry;
    RoundVotingEngine public engine;
    RoundRewardDistributor public distributor;
    ParticipationPool public pool;
    FrontendRegistry public frontendReg;

    address public owner = address(0xA);
    address public submitter = address(0xB);
    address public voter1 = address(0x10);
    address public voter2 = address(0x20);
    address public voter3 = address(0x30);
    address public keeper = address(0x60);
    address public treasury = address(0x70);

    uint256 constant STAKE = 5e6;

    function setUp() public {
        vm.warp(1000);
        vm.startPrank(owner);

        crep = new CuryoReputation(owner, owner);
        crep.grantRole(crep.MINTER_ROLE(), owner);

        ContentRegistry regImpl = new ContentRegistry();
        registry = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(regImpl), abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(crep)))
                )
            )
        );

        RoundVotingEngine engImpl = new RoundVotingEngine();
        engine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engImpl),
                    abi.encodeCall(RoundVotingEngine.initialize, (owner, owner, address(crep), address(registry)))
                )
            )
        );

        RoundRewardDistributor distImpl = new RoundRewardDistributor();
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
        registry.setBonusPool(owner);
        registry.setTreasury(treasury);
        engine.setRewardDistributor(address(distributor));
        engine.setTreasury(treasury);
        engine.setConfig(5 minutes, 7 days, 2, 200);

        crep.mint(owner, 2_000_000e6);
        crep.approve(address(engine), 2_000_000e6);
        engine.addToConsensusReserve(1_000_000e6);

        // Fund keeper rewards
        engine.setKeeperReward(1e6);
        engine.fundKeeperRewardPool(100_000e6);

        address[3] memory voters = [voter1, voter2, voter3];
        for (uint256 i = 0; i < voters.length; i++) {
            crep.mint(voters[i], 100_000e6);
        }
        crep.mint(submitter, 100_000e6);

        vm.stopPrank();
    }

    // --- Tied round (equal weighted pools) ---

    function test_TiedRound() public {
        uint256 contentId = _submitContent();
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        _revealAndSettle(contentId, roundId, ck1, true, s1, ck2, false, s2);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied));
    }

    // --- Tied round: claim refund ---

    function test_TiedRoundClaimRefund() public {
        uint256 contentId = _submitContent();
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        _revealAndSettle(contentId, roundId, ck1, true, s1, ck2, false, s2);

        // Claim refund
        uint256 balBefore = crep.balanceOf(voter1);
        vm.prank(voter1);
        engine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crep.balanceOf(voter1) - balBefore, STAKE);
    }

    // --- Settlement with min stake boundary (1 cREP) ---

    function test_SettlementMinStake() public {
        uint256 contentId = _submitContent();
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, 1e6);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, 1e6);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        _revealAndSettle(contentId, roundId, ck1, true, s1, ck2, false, s2);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied)); // Equal stakes -> tie
    }

    // --- Settlement with max stake (100 cREP) ---

    function test_SettlementMaxStake() public {
        uint256 contentId = _submitContent();
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, 100e6);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, 50e6);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        _revealAndSettle(contentId, roundId, ck1, true, s1, ck2, false, s2);
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
        assertTrue(round.upWins);
    }

    // --- Tied round: both voters can claim refund ---

    function test_TiedRoundAllVotersCanClaimRefund() public {
        uint256 contentId = _submitContent();
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        _revealAndSettle(contentId, roundId, ck1, true, s1, ck2, false, s2);

        // Both voters get refund on tied round
        uint256 bal1Before = crep.balanceOf(voter1);
        vm.prank(voter1);
        engine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crep.balanceOf(voter1) - bal1Before, STAKE);

        uint256 bal2Before = crep.balanceOf(voter2);
        vm.prank(voter2);
        engine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crep.balanceOf(voter2) - bal2Before, STAKE);
    }

    // --- Settlement not possible before epoch ends ---

    function test_SettlementNotPossibleBeforeEpochEnd() public {
        uint256 contentId = _submitContent();
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, 10e6);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, 5e6);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);

        // Cannot reveal before epoch end
        vm.expectRevert(RoundVotingEngine.EpochNotEnded.selector);
        engine.revealVoteByCommitKey(contentId, roundId, ck1, true, s1);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Open));
        // Avoid unused var warning
        (ck2, s2) = (ck2, s2);
    }

    // --- Commit with zero stake reverts ---

    function test_CommitWithZeroStakeReverts() public {
        uint256 contentId = _submitContent();
        bytes32 salt = keccak256("salt1");
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = abi.encodePacked(uint8(1), salt, contentId);
        vm.startPrank(voter1);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        engine.commitVote(contentId, commitHash, ciphertext, 0, address(0));
        vm.stopPrank();
    }

    // --- Loser claiming reward from distributor ---

    function test_LoserClaimFromDistributor() public {
        (uint256 contentId, uint256 roundId) = _createAndSettleAsymmetricRound();

        // voter2 was on the losing side (down)
        vm.prank(voter2);
        distributor.claimReward(contentId, roundId);

        // Loser gets the fixed rebate and still marks the round claimed
        assertTrue(distributor.rewardClaimed(contentId, roundId, voter2));
    }

    // --- Winner claiming reward from distributor ---

    function test_WinnerClaimFromDistributor() public {
        (uint256 contentId, uint256 roundId) = _createAndSettleAsymmetricRound();

        uint256 balBefore = crep.balanceOf(voter1);
        vm.prank(voter1);
        distributor.claimReward(contentId, roundId);

        // Winner gets stake + reward
        uint256 balAfter = crep.balanceOf(voter1);
        assertGt(balAfter, balBefore);
    }

    // --- Double claim from distributor ---

    function test_DoubleClaimFromDistributorReverts() public {
        (uint256 contentId, uint256 roundId) = _createAndSettleAsymmetricRound();

        vm.prank(voter1);
        distributor.claimReward(contentId, roundId);

        vm.prank(voter1);
        vm.expectRevert("Already claimed");
        distributor.claimReward(contentId, roundId);
    }

    // --- Submitter claim from distributor ---

    function test_SubmitterClaimFromDistributor() public {
        (uint256 contentId, uint256 roundId) = _createAndSettleAsymmetricRound();

        uint256 balBefore = crep.balanceOf(submitter);
        vm.prank(submitter);
        distributor.claimSubmitterReward(contentId, roundId);
        uint256 balAfter = crep.balanceOf(submitter);

        assertGt(balAfter, balBefore);
    }

    // --- Non-submitter claiming submitter reward ---

    function test_NonSubmitterClaimReverts() public {
        (uint256 contentId, uint256 roundId) = _createAndSettleAsymmetricRound();

        vm.prank(voter1);
        vm.expectRevert("Not submitter");
        distributor.claimSubmitterReward(contentId, roundId);
    }

    // --- Cooldown passes after 24 hours ---

    function test_CooldownPassesAfter24Hours() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        _revealAndSettle(contentId, roundId, ck1, true, s1, ck2, false, s2);

        // Wait 24 hours + 1 for cooldown to expire
        vm.warp(block.timestamp + 24 hours + 1);

        _commit(voter1, contentId, true, STAKE);

        assertGt(RoundEngineReadHelpers.activeRoundId(engine, contentId), 0);
    }

    // --- New round after settlement ---

    function test_NewRoundAfterSettlement() public {
        (uint256 contentId, uint256 roundId1) = _createAndSettleAsymmetricRound();

        // Wait for cooldown
        vm.warp(block.timestamp + 24 hours + 1);

        // New commit should create a new round
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId2 = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        assertGt(roundId2, roundId1);
    }

    // --- Distributor initialize zero address checks ---

    function test_DistributorInitializeZeroGovernance() public {
        RoundRewardDistributor impl = new RoundRewardDistributor();
        vm.expectRevert("Invalid governance");
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(
                RoundRewardDistributor.initialize, (address(0), address(crep), address(engine), address(registry))
            )
        );
    }

    function test_DistributorInitializeZeroToken() public {
        RoundRewardDistributor impl = new RoundRewardDistributor();
        vm.expectRevert("Invalid cREP token");
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(RoundRewardDistributor.initialize, (owner, address(0), address(engine), address(registry)))
        );
    }

    function test_DistributorInitializeZeroEngine() public {
        RoundRewardDistributor impl = new RoundRewardDistributor();
        vm.expectRevert("Invalid voting engine");
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(RoundRewardDistributor.initialize, (owner, address(crep), address(0), address(registry)))
        );
    }

    function test_DistributorInitializeZeroRegistry() public {
        RoundRewardDistributor impl = new RoundRewardDistributor();
        vm.expectRevert("Invalid registry");
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(RoundRewardDistributor.initialize, (owner, address(crep), address(engine), address(0)))
        );
    }

    // --- Claim on unsettled round ---

    function test_ClaimOnUnsettledRoundReverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);

        vm.prank(voter1);
        vm.expectRevert("Round not settled");
        distributor.claimReward(contentId, roundId);
    }

    // --- No vote found in distributor ---

    function test_NoVoteFoundInDistributorReverts() public {
        (uint256 contentId, uint256 roundId) = _createAndSettleAsymmetricRound();

        vm.prank(voter3); // voter3 didn't vote
        vm.expectRevert("No vote found");
        distributor.claimReward(contentId, roundId);
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _submitContent() internal returns (uint256 contentId) {
        contentId = registry.nextContentId();
        vm.startPrank(submitter);
        crep.approve(address(registry), 10e6);
        registry.submitContent(
            string(abi.encodePacked("https://example.com/test-", vm.toString(contentId))), "goal", "test", 0
        );
        vm.stopPrank();
    }

    function _commit(address voter, uint256 contentId, bool isUp, uint256 amount)
        internal
        returns (bytes32 commitKey, bytes32 salt)
    {
        salt = keccak256(abi.encodePacked(voter, block.timestamp, contentId));
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);
        bytes32 commitHash = _commitHash(isUp, salt, contentId, ciphertext);
        vm.prank(voter);
        crep.approve(address(engine), amount);
        vm.prank(voter);
        engine.commitVote(contentId, commitHash, ciphertext, amount, address(0));
        commitKey = keccak256(abi.encodePacked(voter, commitHash));
    }

    /// @dev Reveal two votes and settle the round.
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
        vm.warp(r.startTime + 5 minutes + 1);
        engine.revealVoteByCommitKey(contentId, roundId, ck1, isUp1, s1);
        engine.revealVoteByCommitKey(contentId, roundId, ck2, isUp2, s2);
        RoundLib.Round memory r2 = RoundEngineReadHelpers.round(engine, contentId, roundId);
        vm.warp(r2.thresholdReachedAt + 5 minutes + 1);
        engine.settleRound(contentId, roundId);
    }

    function _createAndSettleAsymmetricRound() internal returns (uint256 contentId, uint256 roundId) {
        contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, 10e6);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, 5e6);

        roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        _revealAndSettle(contentId, roundId, ck1, true, s1, ck2, false, s2);
    }
}
