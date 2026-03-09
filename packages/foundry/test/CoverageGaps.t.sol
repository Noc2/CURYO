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
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { IRoundVotingEngine } from "../contracts/interfaces/IRoundVotingEngine.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";

// =========================================================================
// MOCKS
// =========================================================================

/// @title Mock VotingEngine for FrontendRegistry slash tests
contract MockVotingEngineForFR is IRoundVotingEngine {
    uint256 public totalAdded;

    function addToConsensusReserve(uint256 amount) external override {
        totalAdded += amount;
    }

    function getContentCommitCount(uint256) external pure override returns (uint256) {
        return 0;
    }

    function getActiveRoundId(uint256) external pure override returns (uint256) {
        return 0;
    }

    function hasUnrevealedVotes(uint256) external pure override returns (bool) {
        return false;
    }
    function transferReward(address, uint256) external override { }
    function claimFrontendFee(uint256, uint256, address) external override { }
    function claimParticipationReward(uint256, uint256) external override { }
}

// =========================================================================
// FrontendRegistry Coverage Gap Tests
// =========================================================================

contract FrontendRegistryCoverageTest is Test {
    FrontendRegistry public reg;
    CuryoReputation public crep;
    MockVotingEngineForFR public engine;
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

        engine = new MockVotingEngineForFR();
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

    // --- VoterID branch in register() ---

    function test_RegisterRequiresVoterIdWhenSet() public {
        vm.prank(admin);
        reg.setVoterIdNFT(address(voterNFT));

        vm.startPrank(frontend1);
        crep.approve(address(reg), STAKE);
        vm.expectRevert("Voter ID required");
        reg.register();
        vm.stopPrank();
    }

    function test_RegisterSucceedsWithVoterId() public {
        vm.prank(admin);
        reg.setVoterIdNFT(address(voterNFT));
        voterNFT.setHolder(frontend1);

        vm.startPrank(frontend1);
        crep.approve(address(reg), STAKE);
        reg.register();
        vm.stopPrank();

        (address op,,,) = reg.getFrontendInfo(frontend1);
        assertEq(op, frontend1);
    }

    function test_RegisterWithoutVoterIdNFTConfigured() public {
        vm.startPrank(frontend1);
        crep.approve(address(reg), STAKE);
        reg.register();
        vm.stopPrank();

        (address op,,,) = reg.getFrontendInfo(frontend1);
        assertEq(op, frontend1);
    }

    // --- MAX_FEE_CREDIT boundary ---

    function test_CreditFeesAtMaxBoundary() public {
        _registerFrontend(frontend1);

        uint256 maxCredit = reg.MAX_FEE_CREDIT();
        vm.prank(creditor);
        reg.creditFees(frontend1, maxCredit);

        assertEq(reg.getAccumulatedFees(frontend1), maxCredit);
    }

    function test_CreditFeesExceedingMaxReverts() public {
        _registerFrontend(frontend1);

        uint256 maxCredit = reg.MAX_FEE_CREDIT();
        vm.prank(creditor);
        vm.expectRevert("Fee credit too large");
        reg.creditFees(frontend1, maxCredit + 1);
    }

    // --- Slash edge cases ---

    function test_SlashFullStake() public {
        _registerFrontend(frontend1);

        vm.prank(admin);
        reg.slashFrontend(frontend1, STAKE, "Full slash");

        (, uint256 staked,, bool slashed) = reg.getFrontendInfo(frontend1);
        assertEq(staked, 0);
        assertTrue(slashed);
    }

    function test_SlashExceedsStakeReverts() public {
        _registerFrontend(frontend1);

        vm.prank(admin);
        vm.expectRevert("Slash exceeds stake");
        reg.slashFrontend(frontend1, STAKE + 1, "Too much");
    }

    function test_SlashZeroAmount() public {
        _registerFrontend(frontend1);

        vm.prank(admin);
        reg.slashFrontend(frontend1, 0, "Zero slash");

        (, uint256 staked,, bool slashed) = reg.getFrontendInfo(frontend1);
        assertEq(staked, STAKE);
        assertTrue(slashed);
    }

    // --- Revoke/unslash on unregistered ---

    function test_RevokeUnregisteredReverts() public {
        vm.prank(admin);
        vm.expectRevert("Frontend not registered");
        reg.revokeFrontend(frontend1);
    }

    function test_UnslashUnregisteredReverts() public {
        vm.prank(admin);
        vm.expectRevert("Frontend not registered");
        reg.unslashFrontend(frontend1);
    }

    function test_SlashUnregisteredReverts() public {
        vm.prank(admin);
        vm.expectRevert("Frontend not registered");
        reg.slashFrontend(frontend1, 100e6, "Not registered");
    }

    // --- Deregister clears approval ---

    function test_DeregisterClearsApproval() public {
        _registerFrontend(frontend1);

        vm.prank(admin);
        reg.approveFrontend(frontend1);
        assertTrue(reg.isApproved(frontend1));

        vm.prank(frontend1);
        reg.deregister();

        assertFalse(reg.isApproved(frontend1));
    }

    // --- Access control ---

    function test_OnlyGovernanceCanApprove() public {
        _registerFrontend(frontend1);

        vm.prank(frontend1);
        vm.expectRevert();
        reg.approveFrontend(frontend1);
    }

    function test_OnlyGovernanceCanSlash() public {
        _registerFrontend(frontend1);

        vm.prank(frontend1);
        vm.expectRevert();
        reg.slashFrontend(frontend1, 100e6, "Unauthorized");
    }

    function test_OnlyAdminCanSetVoterIdNFT() public {
        vm.prank(frontend1);
        vm.expectRevert();
        reg.setVoterIdNFT(address(voterNFT));
    }

    function test_SetVoterIdNFTZeroAddressReverts() public {
        vm.prank(admin);
        vm.expectRevert("Invalid address");
        reg.setVoterIdNFT(address(0));
    }

    function _registerFrontend(address fe) internal {
        vm.startPrank(fe);
        crep.approve(address(reg), STAKE);
        reg.register();
        vm.stopPrank();
    }
}

// =========================================================================
// HumanFaucet Coverage Gap Tests
// =========================================================================

contract HumanFaucetCoverageTest is Test {
    HumanFaucet public faucet;
    MockIdentityVerificationHub public mockHub;
    CuryoReputation public crep;
    MockVoterIdNFT public voterNFT;

    address public admin = address(0xA);
    address public governance = address(0xB);
    address public user1 = address(0x10);
    address public user2 = address(0x20);

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

    // --- transferOwnership restricted to governance ---

    function test_TransferOwnershipToGovernanceSucceeds() public {
        vm.prank(admin);
        faucet.transferOwnership(governance);
        assertEq(faucet.owner(), governance);
    }

    function test_TransferOwnershipToNonGovernanceReverts() public {
        vm.prank(admin);
        vm.expectRevert("Can only transfer to governance");
        faucet.transferOwnership(user1);
    }

    function test_TransferOwnershipByNonOwnerReverts() public {
        vm.prank(user1);
        vm.expectRevert();
        faucet.transferOwnership(governance);
    }

    // --- InsufficientFaucetBalance ---

    function test_ClaimRevertsWhenFaucetEmpty() public {
        vm.prank(admin);
        faucet.withdrawRemaining(admin, type(uint256).max);

        mockHub.setVerified(user1);
        vm.expectRevert(HumanFaucet.InsufficientFaucetBalance.selector);
        mockHub.simulateVerification(address(faucet), user1);
    }

    function test_ClaimWithReferralRevertsWhenInsufficientBalance() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        uint256 balance = crep.balanceOf(address(faucet));
        uint256 currentAmount = faucet.getCurrentClaimAmount();
        uint256 toWithdraw = balance - (currentAmount - 1);
        vm.prank(admin);
        faucet.withdrawRemaining(admin, toWithdraw);

        mockHub.setVerified(user2);
        bytes memory userData = abi.encodePacked(user1);
        vm.expectRevert(HumanFaucet.InsufficientFaucetBalance.selector);
        mockHub.simulateVerificationWithUserData(address(faucet), user2, userData);
    }

    // --- getRemainingClaims / getRemainingBalance ---

    function test_GetRemainingBalance() public view {
        assertEq(faucet.getRemainingBalance(), 52_000_000e6);
    }

    function test_GetRemainingClaims() public view {
        assertEq(faucet.getRemainingClaims(), 5_200);
    }

    function test_GetRemainingClaimsAfterClaims() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);
        assertEq(faucet.getRemainingClaims(), 5_199);
    }

    // --- getTierInfo for all tiers ---

    function test_GetTierInfoTier1() public {
        _setTotalClaimants(10);
        (uint256 tier, uint256 claimAmount,,, uint256 inTier, uint256 untilNext) = faucet.getTierInfo();
        assertEq(tier, 1);
        assertEq(claimAmount, 1_000e6);
        assertEq(inTier, 0);
        assertEq(untilNext, 990);
    }

    function test_GetTierInfoTier2() public {
        _setTotalClaimants(1_000);
        (uint256 tier, uint256 claimAmount,,, uint256 inTier, uint256 untilNext) = faucet.getTierInfo();
        assertEq(tier, 2);
        assertEq(claimAmount, 100e6);
        assertEq(inTier, 0);
        assertEq(untilNext, 9_000);
    }

    function test_GetTierInfoTier3() public {
        _setTotalClaimants(10_000);
        (uint256 tier, uint256 claimAmount,,, uint256 inTier, uint256 untilNext) = faucet.getTierInfo();
        assertEq(tier, 3);
        assertEq(claimAmount, 10e6);
        assertEq(inTier, 0);
        assertEq(untilNext, 990_000);
    }

    function test_GetTierInfoTier4() public {
        _setTotalClaimants(1_000_000);
        (uint256 tier, uint256 claimAmount,,, uint256 inTier, uint256 untilNext) = faucet.getTierInfo();
        assertEq(tier, 4);
        assertEq(claimAmount, 1e6);
        assertEq(inTier, 0);
        assertEq(untilNext, 0);
    }

    function test_GetTierInfoMidTier() public {
        _setTotalClaimants(500);
        (uint256 tier,,,, uint256 inTier, uint256 untilNext) = faucet.getTierInfo();
        assertEq(tier, 1);
        assertEq(inTier, 490);
        assertEq(untilNext, 500);
    }

    // --- Claim at tier 1 rate ---

    function test_ClaimAtTier1Rate() public {
        _setTotalClaimants(10);
        assertEq(faucet.getCurrentTier(), 1);

        address claimer = address(uint160(80000));
        mockHub.setVerified(claimer);
        mockHub.simulateVerification(address(faucet), claimer);
        assertEq(crep.balanceOf(claimer), 1_000e6);
    }

    // --- Referral across tier boundary ---

    function test_ReferralAcrossTierBoundary() public {
        for (uint256 i = 0; i < 8; i++) {
            address u = address(uint160(70000 + i));
            mockHub.setVerified(u);
            mockHub.simulateVerification(address(faucet), u);
        }

        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);
        assertEq(faucet.getCurrentTier(), 0);

        address boundaryUser = address(uint160(90000));
        mockHub.setVerified(boundaryUser);
        bytes memory userData = abi.encodePacked(user1);
        mockHub.simulateVerificationWithUserData(address(faucet), boundaryUser, userData);

        assertEq(crep.balanceOf(boundaryUser), 15_000e6);
        assertEq(crep.balanceOf(user1), 10_000e6 + 5_000e6);
        assertEq(faucet.getCurrentTier(), 1);
    }

    // --- isValidReferrer with VoterIdNFT configured ---

    function test_IsValidReferrerWithVoterIdNFT() public {
        // Claim first WITHOUT voterIdNFT set, so no VoterID is minted
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        // Now set voterIdNFT — user1 has claimed but has no VoterID
        vm.prank(admin);
        faucet.setVoterIdNFT(address(voterNFT));

        assertFalse(faucet.isValidReferrer(user1));

        // Grant VoterID — now valid
        voterNFT.setHolder(user1);
        assertTrue(faucet.isValidReferrer(user1));
    }

    function test_IsValidReferrerWithoutVoterIdNFT() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);
        assertTrue(faucet.isValidReferrer(user1));
    }

    // --- setVoterIdNFT ---

    function test_SetVoterIdNFTZeroAddressReverts() public {
        vm.prank(admin);
        vm.expectRevert("Invalid address");
        faucet.setVoterIdNFT(address(0));
    }

    function test_SetVoterIdNFTSuccess() public {
        vm.prank(admin);
        faucet.setVoterIdNFT(address(voterNFT));
        assertEq(address(faucet.voterIdNFT()), address(voterNFT));
    }

    // --- withdrawRemaining edge cases ---

    function test_WithdrawRemainingNothingToWithdraw() public {
        vm.prank(admin);
        faucet.withdrawRemaining(admin, type(uint256).max);

        vm.prank(admin);
        vm.expectRevert("Nothing to withdraw");
        faucet.withdrawRemaining(admin, 100);
    }

    // --- VoterID minting on claim ---

    function test_VoterIdMintedOnClaim() public {
        vm.prank(admin);
        faucet.setVoterIdNFT(address(voterNFT));

        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);
        assertTrue(voterNFT.hasVoterId(user1));
    }

    function _setTotalClaimants(uint256 value) internal {
        vm.store(address(faucet), bytes32(uint256(6)), bytes32(value));
    }
}

// =========================================================================
// RoundVotingEngine Settlement Edge Case Tests
// =========================================================================

contract RoundSettlementEdgeCaseTest is VotingTestBase {
    CuryoReputation public crep;
    ContentRegistry public registry;
    RoundVotingEngine public engine;
    RoundRewardDistributor public distributor;

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
                    abi.encodeCall(RoundVotingEngine.initialize, (owner, owner, address(crep), address(registry)))
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
        engine.setRewardDistributor(address(distributor));
        engine.setTreasury(treasury);
        engine.setConfig(5 minutes, 7 days, 2, 200);

        crep.mint(owner, 1_000_000e6);
        crep.approve(address(engine), 1_000_000e6);
        engine.fundConsensusReserve(1_000_000e6);

        address[3] memory voters = [voter1, voter2, voter3];
        for (uint256 i = 0; i < voters.length; i++) {
            crep.mint(voters[i], 10_000e6);
        }
        crep.mint(submitter, 10_000e6);

        vm.stopPrank();
    }

    // --- Config validation ---

    function test_SetConfigEpochDurationTooShort() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidConfig.selector);
        engine.setConfig(4 minutes, 7 days, 2, 200);
    }

    function test_SetConfigMaxDurationTooShort() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidConfig.selector);
        engine.setConfig(5 minutes, 23 hours, 2, 200);
    }

    function test_SetConfigMinVotersTooLow() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidConfig.selector);
        engine.setConfig(5 minutes, 7 days, 1, 200);
    }

    function test_SetConfigMaxVotersLessThanMin() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidConfig.selector);
        engine.setConfig(5 minutes, 7 days, 5, 4);
    }

    function test_SetConfigMaxVotersExceedsLimit() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidConfig.selector);
        engine.setConfig(5 minutes, 7 days, 2, 10001);
    }

    function test_SetConfigValidBoundary() public {
        vm.prank(owner);
        engine.setConfig(1 hours, 14 days, 3, 500);
    }

    // --- Zero amount reverts ---

    function test_FundConsensusReserveZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.ZeroAmount.selector);
        engine.fundConsensusReserve(0);
    }

    function test_AddToConsensusReserveZeroReverts() public {
        vm.expectRevert(RoundVotingEngine.ZeroAmount.selector);
        engine.addToConsensusReserve(0);
    }

    function test_FundKeeperRewardPoolZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.ZeroAmount.selector);
        engine.fundKeeperRewardPool(0);
    }

    // --- Initialize validation ---

    function test_InitializeZeroAdminReverts() public {
        RoundVotingEngine impl = new RoundVotingEngine();
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(RoundVotingEngine.initialize, (address(0), owner, address(crep), address(registry)))
        );
    }

    function test_InitializeZeroGovernanceReverts() public {
        RoundVotingEngine impl = new RoundVotingEngine();
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(RoundVotingEngine.initialize, (owner, address(0), address(crep), address(registry)))
        );
    }

    function test_InitializeZeroTokenReverts() public {
        RoundVotingEngine impl = new RoundVotingEngine();
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        new ERC1967Proxy(
            address(impl), abi.encodeCall(RoundVotingEngine.initialize, (owner, owner, address(0), address(registry)))
        );
    }

    function test_InitializeZeroRegistryReverts() public {
        RoundVotingEngine impl = new RoundVotingEngine();
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        new ERC1967Proxy(
            address(impl), abi.encodeCall(RoundVotingEngine.initialize, (owner, owner, address(crep), address(0)))
        );
    }

    // --- Vote edge cases ---

    function test_VoteSelfVoteReverts() public {
        uint256 contentId = _submitContent();

        bytes32 commitHash = _commitHash(true, bytes32(0), contentId);
        bytes memory ciphertext = abi.encodePacked(uint8(1), bytes32(0), contentId);
        vm.startPrank(submitter);
        crep.approve(address(engine), STAKE);
        vm.expectRevert(RoundVotingEngine.SelfVote.selector);
        engine.commitVote(contentId, commitHash, ciphertext, STAKE, address(0));
        vm.stopPrank();
    }

    function test_VoteBelowMinStakeReverts() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256("salt1");
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = abi.encodePacked(uint8(1), salt, contentId);
        vm.startPrank(voter1);
        crep.approve(address(engine), 1);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        engine.commitVote(contentId, commitHash, ciphertext, 1, address(0));
        vm.stopPrank();
    }

    function test_VoteAboveMaxStakeReverts() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256("salt1");
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = abi.encodePacked(uint8(1), salt, contentId);
        vm.startPrank(voter1);
        crep.approve(address(engine), 101e6);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        engine.commitVote(contentId, commitHash, ciphertext, 101e6, address(0));
        vm.stopPrank();
    }

    function test_VoteMaxStakeSucceeds() public {
        uint256 contentId = _submitContent();

        _commit(voter1, contentId, true, 100e6);

        assertGt(engine.getActiveRoundId(contentId), 0);
    }

    // --- Cancel expired round ---

    function test_CancelExpiredRound() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(keeper);
        engine.cancelExpiredRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Cancelled));
    }

    function test_CancelNonExpiredReverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.prank(keeper);
        vm.expectRevert(RoundVotingEngine.RoundNotExpired.selector);
        engine.cancelExpiredRound(contentId, roundId);
    }

    // --- Settle on terminal rounds ---

    function test_SettleOnAlreadySettledReverts() public {
        (uint256 contentId, uint256 roundId) = _createAndSettleRound();

        // Round is already settled, settleRound should revert with RoundNotOpen
        vm.expectRevert(RoundVotingEngine.RoundNotOpen.selector);
        engine.settleRound(contentId, roundId);
    }

    // --- One-sided consensus settlement with zero reserve ---

    function test_OneSidedConsensusWithZeroReserve() public {
        vm.startPrank(owner);

        RoundVotingEngine engImpl2 = new RoundVotingEngine();
        RoundVotingEngine engine2 = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engImpl2),
                    abi.encodeCall(RoundVotingEngine.initialize, (owner, owner, address(crep), address(registry)))
                )
            )
        );

        RoundRewardDistributor distImpl2 = new RoundRewardDistributor();
        RoundRewardDistributor dist2 = RoundRewardDistributor(
            address(
                new ERC1967Proxy(
                    address(distImpl2),
                    abi.encodeCall(
                        RoundRewardDistributor.initialize, (owner, address(crep), address(engine2), address(registry))
                    )
                )
            )
        );

        registry.setVotingEngine(address(engine2));
        engine2.setRewardDistributor(address(dist2));
        engine2.setTreasury(treasury);
        engine2.setConfig(5 minutes, 7 days, 2, 200);

        vm.stopPrank();

        assertEq(engine2.consensusReserve(), 0);

        vm.startPrank(submitter);
        crep.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/zero-reserve", "goal", "test", 0);
        vm.stopPrank();
        uint256 contentId = 1;

        // Both voters commit UP (one-sided consensus)
        bytes32 salt1 = keccak256(abi.encodePacked(voter1, block.timestamp, contentId));
        bytes32 commitHash1 = _commitHash(true, salt1, contentId);
        bytes memory ciphertext1 = abi.encodePacked(uint8(1), salt1, contentId);
        vm.startPrank(voter1);
        crep.approve(address(engine2), STAKE);
        engine2.commitVote(contentId, commitHash1, ciphertext1, STAKE, address(0));
        vm.stopPrank();

        bytes32 salt2 = keccak256(abi.encodePacked(voter2, block.timestamp + 1, contentId));
        bytes32 commitHash2 = _commitHash(true, salt2, contentId);
        bytes memory ciphertext2 = abi.encodePacked(uint8(1), salt2, contentId);
        vm.startPrank(voter2);
        crep.approve(address(engine2), STAKE);
        engine2.commitVote(contentId, commitHash2, ciphertext2, STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = 1;
        RoundLib.Round memory roundBefore = engine2.getRound(contentId, roundId);

        // Warp past epochDuration to reveal
        vm.warp(roundBefore.startTime + 5 minutes + 1);

        bytes32 commitKey1 = keccak256(abi.encodePacked(voter1, commitHash1));
        bytes32 commitKey2 = keccak256(abi.encodePacked(voter2, commitHash2));
        engine2.revealVoteByCommitKey(contentId, roundId, commitKey1, true, salt1);
        engine2.revealVoteByCommitKey(contentId, roundId, commitKey2, true, salt2);

        engine2.settleRound(contentId, roundId);

        RoundLib.Round memory round = engine2.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
    }

    // --- onlySelf wrapper authorization ---

    function test_TransferTokenExternalNotSelfReverts() public {
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.Unauthorized.selector);
        engine.transferTokenExternal(voter1, 100);
    }

    function test_DistributeCategoryFeeExternalNotSelfReverts() public {
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.Unauthorized.selector);
        engine.distributeCategoryFeeExternal(1, 1, 100);
    }

    function test_CheckSubmitterStakeExternalNotSelfReverts() public {
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.Unauthorized.selector);
        engine.checkSubmitterStakeExternal(1);
    }

    // --- Setter zero address checks ---

    function test_SetRewardDistributorZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        engine.setRewardDistributor(address(0));
    }

    function test_SetRewardDistributorSecondCallReverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.RewardDistributorLocked.selector);
        engine.setRewardDistributor(address(0xBEEF));
    }

    function test_SetFrontendRegistryZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        engine.setFrontendRegistry(address(0));
    }

    function test_SetCategoryRegistryZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        engine.setCategoryRegistry(address(0));
    }

    function test_SetTreasuryZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        engine.setTreasury(address(0));
    }

    function test_SetVoterIdNFTZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        engine.setVoterIdNFT(address(0));
    }

    function test_SetParticipationPoolZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        engine.setParticipationPool(address(0));
    }

    // --- TransferReward authorization ---

    function test_TransferRewardUnauthorizedReverts() public {
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.Unauthorized.selector);
        engine.transferReward(voter1, 100);
    }

    // --- Pause/unpause ---

    function test_PauseBlocksVote() public {
        uint256 contentId = _submitContent();

        vm.prank(owner);
        engine.pause();

        bytes32 salt = keccak256("salt1");
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = abi.encodePacked(uint8(1), salt, contentId);
        vm.startPrank(voter1);
        crep.approve(address(engine), STAKE);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        engine.commitVote(contentId, commitHash, ciphertext, STAKE, address(0));
        vm.stopPrank();
    }

    function test_UnpauseAllowsVote() public {
        uint256 contentId = _submitContent();

        vm.prank(owner);
        engine.pause();
        vm.prank(owner);
        engine.unpause();

        _commit(voter1, contentId, true, STAKE);
        assertGt(engine.getActiveRoundId(contentId), 0);
    }

    // --- Asymmetric stakes settlement ---

    function test_AsymmetricStakesSettlement() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 salt1) = _commit(voter1, contentId, true, 100e6);
        (bytes32 ck2, bytes32 salt2) = _commit(voter2, contentId, false, 1e6);

        uint256 roundId = engine.getActiveRoundId(contentId);
        RoundLib.Round memory r0 = engine.getRound(contentId, roundId);

        // Reveal after epochDuration
        vm.warp(r0.startTime + 5 minutes + 1);
        engine.revealVoteByCommitKey(contentId, roundId, ck1, true, salt1);
        engine.revealVoteByCommitKey(contentId, roundId, ck2, false, salt2);

        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
        assertTrue(round.upWins);
        assertEq(round.upPool, 100e6);
        assertEq(round.downPool, 1e6);
    }

    // --- Cancelled round refund ---

    function test_ClaimCancelledRoundRefund() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(keeper);
        engine.cancelExpiredRound(contentId, roundId);

        uint256 balBefore = crep.balanceOf(voter1);
        vm.prank(voter1);
        engine.claimCancelledRoundRefund(contentId, roundId);

        assertEq(crep.balanceOf(voter1) - balBefore, STAKE);
    }

    function test_ClaimCancelledRoundRefundDoubleClaimReverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(keeper);
        engine.cancelExpiredRound(contentId, roundId);

        vm.prank(voter1);
        engine.claimCancelledRoundRefund(contentId, roundId);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        engine.claimCancelledRoundRefund(contentId, roundId);
    }

    function test_ClaimRefundOnOpenRoundReverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.RoundNotCancelledOrTied.selector);
        engine.claimCancelledRoundRefund(contentId, roundId);
    }

    // --- Single-voter settlement behavior ---

    function test_SingleVoterDoesNotSettleBeforeEpochEnd() public {
        uint256 contentId = _submitContent();
        // Only one voter commits
        (bytes32 ck1, bytes32 salt1) = _commit(voter1, contentId, true, STAKE);
        uint256 roundId = engine.getActiveRoundId(contentId);

        RoundLib.Round memory r0 = engine.getRound(contentId, roundId);
        // Reveal the vote (need epoch to end first)
        vm.warp(r0.startTime + 5 minutes + 1);
        engine.revealVoteByCommitKey(contentId, roundId, ck1, true, salt1);

        // Not enough votes to settle (only 1 revealed, minVoters=2)
        vm.expectRevert(RoundVotingEngine.NotEnoughVotes.selector);
        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Open), "Still open with < minVoters revealed");
    }

    // --- Double commit reverts ---

    function test_DoubleCommitReverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);
        assertGt(roundId, 0);

        bytes32 salt2 = keccak256("salt2");
        bytes32 commitHash2 = _commitHash(true, salt2, contentId);
        bytes memory ciphertext2 = abi.encodePacked(uint8(1), salt2, contentId);
        vm.startPrank(voter1);
        crep.approve(address(engine), STAKE);
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        engine.commitVote(contentId, commitHash2, ciphertext2, STAKE, address(0));
        vm.stopPrank();
    }

    // --- Commit on settled round starts new round ---

    function test_CommitOnSettledRoundStartsNewRound() public {
        (uint256 contentId,) = _createAndSettleRound();

        vm.warp(block.timestamp + 24 hours); // cooldown
        _commit(voter1, contentId, true, STAKE);

        uint256 newRid = engine.getActiveRoundId(contentId);
        assertEq(newRid, 2, "New round created after settlement");
    }

    // --- Cooldown ---

    function test_CooldownBlocksSecondCommit() public {
        uint256 contentId = _submitContent();
        // voter1 commits — now voter1 has a cooldown
        _commit(voter1, contentId, true, STAKE);

        // Immediately try to commit again (cooldown still active)
        bytes32 salt2 = keccak256("salt-v1-2");
        bytes32 commitHash2 = _commitHash(true, salt2, contentId);
        bytes memory ciphertext2 = abi.encodePacked(uint8(1), salt2, contentId);
        vm.startPrank(voter1);
        crep.approve(address(engine), STAKE);
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        engine.commitVote(contentId, commitHash2, ciphertext2, STAKE, address(0));
        vm.stopPrank();
    }

    // --- View functions ---

    function test_GetActiveRoundIdReturnsZeroForNoRound() public view {
        assertEq(engine.getActiveRoundId(999), 0);
    }

    function test_HasActiveVotes() public {
        uint256 contentId = _submitContent();
        assertFalse(engine.hasUnrevealedVotes(contentId));

        _commit(voter1, contentId, true, STAKE);
        assertTrue(engine.hasUnrevealedVotes(contentId));
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _submitContent() internal returns (uint256 contentId) {
        vm.startPrank(submitter);
        crep.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/coverage", "goal", "test", 0);
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

    // Not used directly; rounds are settled via _createAndSettleRound or inline reveal+settle.

    function _createAndSettleRound() internal returns (uint256 contentId, uint256 roundId) {
        contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);

        roundId = engine.getActiveRoundId(contentId);
        RoundLib.Round memory r = engine.getRound(contentId, roundId);

        // Warp past epochDuration to reveal
        vm.warp(r.startTime + 5 minutes + 1);
        engine.revealVoteByCommitKey(contentId, roundId, ck1, true, s1);
        engine.revealVoteByCommitKey(contentId, roundId, ck2, false, s2);

        engine.settleRound(contentId, roundId);
    }
}
