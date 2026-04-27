// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { HumanReputation } from "../contracts/HumanReputation.sol";
import { HumanFaucet } from "../contracts/HumanFaucet.sol";
import { MockIdentityVerificationHub } from "../contracts/mocks/MockIdentityVerificationHub.sol";
import { ISelfVerificationRoot } from "@selfxyz/contracts/contracts/interfaces/ISelfVerificationRoot.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { ProtocolConfig } from "../contracts/ProtocolConfig.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { RoundEngineReadHelpers } from "./helpers/RoundEngineReadHelpers.sol";
import { IRoundVotingEngine } from "../contracts/interfaces/IRoundVotingEngine.sol";
import { MockVoterIdNFT } from "./mocks/MockVoterIdNFT.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { VotingTestBase } from "./helpers/VotingTestHelpers.sol";
import { MockCategoryRegistry } from "../contracts/mocks/MockCategoryRegistry.sol";

// =========================================================================
// MOCKS
// =========================================================================

/// @title Mock VotingEngine for FrontendRegistry slash tests
contract MockVotingEngineForFR is IRoundVotingEngine {
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
// FrontendRegistry Coverage Gap Tests
// =========================================================================

contract FrontendRegistryCoverageTest is Test {
    FrontendRegistry public reg;
    HumanReputation public hrep;
    MockVotingEngineForFR public engine;
    MockVoterIdNFT public voterNFT;

    address public admin = address(0xA);
    address public frontend1 = address(0xF1);
    address public frontend2 = address(0xF2);
    address public creditor = address(0xC);

    uint256 constant STAKE = 1000e6;

    function setUp() public {
        vm.startPrank(admin);

        hrep = new HumanReputation(admin, admin);
        hrep.grantRole(hrep.MINTER_ROLE(), admin);

        engine = new MockVotingEngineForFR();
        voterNFT = new MockVoterIdNFT();

        FrontendRegistry impl = new FrontendRegistry();
        reg = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(FrontendRegistry.initialize, (admin, admin, address(hrep)))
                )
            )
        );

        reg.setVotingEngine(address(engine));
        reg.addFeeCreditor(creditor);
        reg.setVoterIdNFT(address(voterNFT));

        hrep.mint(frontend1, 100_000e6);
        hrep.mint(frontend2, 100_000e6);
        hrep.mint(address(reg), 1_000_000e6);
        voterNFT.setHolder(frontend1);

        vm.stopPrank();
    }

    // --- VoterID branch in register() ---

    function test_RegisterRequiresVoterIdWhenSet() public {
        voterNFT.removeHolder(frontend1);

        vm.startPrank(frontend1);
        hrep.approve(address(reg), STAKE);
        vm.expectRevert("Voter ID required");
        reg.register();
        vm.stopPrank();
    }

    function test_RegisterSucceedsWithVoterId() public {
        vm.startPrank(frontend1);
        hrep.approve(address(reg), STAKE);
        reg.register();
        vm.stopPrank();

        (address op,,,) = reg.getFrontendInfo(frontend1);
        assertEq(op, frontend1);
    }

    function test_RegisterWithoutVoterIdNFTConfiguredReverts() public {
        vm.startPrank(admin);
        FrontendRegistry impl = new FrontendRegistry();
        FrontendRegistry unsetReg = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(FrontendRegistry.initialize, (admin, admin, address(hrep)))
                )
            )
        );
        vm.stopPrank();

        vm.startPrank(frontend1);
        hrep.approve(address(unsetReg), STAKE);
        vm.expectRevert("VoterIdNFT not set");
        unsetReg.register();
        vm.stopPrank();
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

    // --- Eligibility/unslash on unregistered ---

    function test_IsEligibleUnregisteredReturnsFalse() public view {
        assertFalse(reg.isEligible(frontend1));
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

    // --- Deregister clears eligibility ---

    function test_DeregisterClearsEligibility() public {
        _registerFrontend(frontend1);
        assertTrue(reg.isEligible(frontend1));

        vm.prank(frontend1);
        reg.requestDeregister();

        assertFalse(reg.isEligible(frontend1));
    }

    // --- Access control ---

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
        voterNFT.setHolder(fe);
        vm.startPrank(fe);
        hrep.approve(address(reg), STAKE);
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
    HumanReputation public hrep;
    MockVoterIdNFT public voterNFT;

    address public admin = address(0xA);
    address public governance = address(0xB);
    address public user1 = address(0x10);
    address public user2 = address(0x20);

    function setUp() public {
        vm.startPrank(admin);

        hrep = new HumanReputation(admin, admin);
        hrep.grantRole(hrep.MINTER_ROLE(), admin);

        mockHub = new MockIdentityVerificationHub();
        voterNFT = new MockVoterIdNFT();

        faucet = new HumanFaucet(address(hrep), address(mockHub), governance);

        hrep.mint(address(faucet), 52_000_000e6);
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
        _drainFaucet(hrep.balanceOf(address(faucet)));

        mockHub.setVerified(user1);
        vm.expectRevert(HumanFaucet.InsufficientFaucetBalance.selector);
        mockHub.simulateVerification(address(faucet), user1);
    }

    function test_ClaimWithReferralRevertsWhenInsufficientBalance() public {
        mockHub.setVerified(user1);
        mockHub.simulateVerification(address(faucet), user1);

        uint256 balance = hrep.balanceOf(address(faucet));
        uint256 currentAmount = faucet.getCurrentClaimAmount();
        uint256 toWithdraw = balance - (currentAmount - 1);
        _drainFaucet(toWithdraw);

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
        assertEq(hrep.balanceOf(claimer), 1_000e6);
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

        assertEq(hrep.balanceOf(boundaryUser), 15_000e6);
        assertEq(hrep.balanceOf(user1), 10_000e6 + 5_000e6);
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
        _drainFaucet(hrep.balanceOf(address(faucet)));

        vm.prank(admin);
        faucet.transferOwnership(governance);

        vm.prank(governance);
        faucet.pause();

        vm.prank(governance);
        vm.expectRevert("Nothing to withdraw");
        faucet.withdrawRemaining(governance, 100);
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

    function _drainFaucet(uint256 amount) internal {
        vm.prank(address(faucet));
        hrep.transfer(admin, amount);
    }
}

// =========================================================================
// RoundVotingEngine Settlement Edge Case Tests
// =========================================================================

contract RoundSettlementEdgeCaseTest is VotingTestBase {
    HumanReputation public hrep;
    ContentRegistry public registry;
    RoundVotingEngine public engine;
    RoundRewardDistributor public distributor;
    address internal protocolConfigAddress;

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

        hrep = new HumanReputation(owner, owner);
        hrep.grantRole(hrep.MINTER_ROLE(), owner);

        ContentRegistry regImpl = new ContentRegistry();
        RoundVotingEngine engImpl = new RoundVotingEngine();
        RoundRewardDistributor distImpl = new RoundRewardDistributor();

        registry = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(regImpl), abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(hrep)))
                )
            )
        );

        engine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engImpl),
                    abi.encodeCall(
                        RoundVotingEngine.initialize,
                        (owner, address(hrep), address(registry), address(_deployProtocolConfig(owner)))
                    )
                )
            )
        );
        protocolConfigAddress = address(engine.protocolConfig());

        distributor = RoundRewardDistributor(
            address(
                new ERC1967Proxy(
                    address(distImpl),
                    abi.encodeCall(
                        RoundRewardDistributor.initialize, (owner, address(hrep), address(engine), address(registry))
                    )
                )
            )
        );

        registry.setVotingEngine(address(engine));
        MockCategoryRegistry mockCategoryRegistry = new MockCategoryRegistry();
        mockCategoryRegistry.seedDefaultTestCategories();
        registry.setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(protocolConfigAddress).setRewardDistributor(address(distributor));
        ProtocolConfig(protocolConfigAddress).setCategoryRegistry(address(mockCategoryRegistry));
        ProtocolConfig(protocolConfigAddress).setTreasury(treasury);
        _setTlockRoundConfig(ProtocolConfig(protocolConfigAddress), 5 minutes, 7 days, 2, 200);

        hrep.mint(owner, 1_000_000e6);
        hrep.approve(address(engine), 1_000_000e6);
        engine.addToConsensusReserve(1_000_000e6);

        address[3] memory voters = [voter1, voter2, voter3];
        for (uint256 i = 0; i < voters.length; i++) {
            hrep.mint(voters[i], 10_000e6);
        }
        hrep.mint(submitter, 10_000e6);

        vm.stopPrank();
    }

    // --- Config validation ---

    function test_SetConfigEpochDurationTooShort() public {
        vm.prank(owner);
        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        _setTlockRoundConfig(ProtocolConfig(protocolConfigAddress), 4 minutes, 7 days, 2, 200);
    }

    function test_SetConfigMaxDurationTooShort() public {
        vm.prank(owner);
        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        _setTlockRoundConfig(ProtocolConfig(protocolConfigAddress), 5 minutes, 59 minutes, 2, 200);
    }

    function test_SetConfigMinVotersTooLow() public {
        vm.prank(owner);
        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        _setTlockRoundConfig(ProtocolConfig(protocolConfigAddress), 5 minutes, 7 days, 1, 200);
    }

    function test_SetConfigMaxVotersLessThanMin() public {
        vm.prank(owner);
        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        _setTlockRoundConfig(ProtocolConfig(protocolConfigAddress), 5 minutes, 7 days, 5, 4);
    }

    function test_SetConfigMaxVotersExceedsLimit() public {
        vm.prank(owner);
        vm.expectRevert(ProtocolConfig.InvalidConfig.selector);
        _setTlockRoundConfig(ProtocolConfig(protocolConfigAddress), 5 minutes, 7 days, 2, 10001);
    }

    function test_SetConfigValidBoundary() public {
        vm.prank(owner);
        _setTlockRoundConfig(ProtocolConfig(protocolConfigAddress), 1 hours, 14 days, 3, 500);
    }

    // --- Zero amount reverts ---

    function test_FundConsensusReserveZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.ZeroAmount.selector);
        engine.addToConsensusReserve(0);
    }

    function test_AddToConsensusReserveZeroReverts() public {
        vm.expectRevert(RoundVotingEngine.ZeroAmount.selector);
        engine.addToConsensusReserve(0);
    }

    // --- Initialize validation ---

    function test_InitializeZeroGovernanceReverts() public {
        RoundVotingEngine impl = new RoundVotingEngine();
        address newProtocolConfig = address(_deployProtocolConfig(owner));
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(
                RoundVotingEngine.initialize, (address(0), address(hrep), address(registry), newProtocolConfig)
            )
        );
    }

    function test_InitializeZeroTokenReverts() public {
        RoundVotingEngine impl = new RoundVotingEngine();
        address newProtocolConfig = address(_deployProtocolConfig(owner));
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(RoundVotingEngine.initialize, (owner, address(0), address(registry), newProtocolConfig))
        );
    }

    function test_InitializeZeroRegistryReverts() public {
        RoundVotingEngine impl = new RoundVotingEngine();
        address newProtocolConfig = address(_deployProtocolConfig(owner));
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(RoundVotingEngine.initialize, (owner, address(hrep), address(0), newProtocolConfig))
        );
    }

    function test_InitializeZeroProtocolConfigReverts() public {
        RoundVotingEngine impl = new RoundVotingEngine();
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(RoundVotingEngine.initialize, (owner, address(hrep), address(registry), address(0)))
        );
    }

    // --- Vote edge cases ---

    function test_VoteSelfVoteReverts() public {
        uint256 contentId = _submitContent();

        bytes32 commitHash = _commitHash(true, bytes32(0), contentId);
        bytes memory ciphertext = abi.encodePacked(uint8(1), bytes32(0), contentId);
        vm.startPrank(submitter);
        hrep.approve(address(engine), STAKE);
        vm.expectRevert(RoundVotingEngine.SelfVote.selector);
        engine.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            commitHash,
            ciphertext,
            STAKE,
            address(0)
        );
        vm.stopPrank();
    }

    function test_VoteBelowMinStakeReverts() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256("salt1");
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = abi.encodePacked(uint8(1), salt, contentId);
        vm.startPrank(voter1);
        hrep.approve(address(engine), 1);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        engine.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            commitHash,
            ciphertext,
            1,
            address(0)
        );
        vm.stopPrank();
    }

    function test_VoteAboveMaxStakeReverts() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256("salt1");
        bytes32 commitHash = _commitHash(true, salt, contentId);
        bytes memory ciphertext = abi.encodePacked(uint8(1), salt, contentId);
        vm.startPrank(voter1);
        hrep.approve(address(engine), 101e6);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        engine.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            commitHash,
            ciphertext,
            101e6,
            address(0)
        );
        vm.stopPrank();
    }

    function test_VoteMaxStakeSucceeds() public {
        uint256 contentId = _submitContent();

        _commit(voter1, contentId, true, 100e6);

        assertGt(RoundEngineReadHelpers.activeRoundId(engine, contentId), 0);
    }

    // --- Cancel expired round ---

    function test_CancelExpiredRound() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(keeper);
        engine.cancelExpiredRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Cancelled));
    }

    function test_CancelNonExpiredReverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);

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

        ContentRegistry regImpl2 = new ContentRegistry();
        ContentRegistry registry2 = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(regImpl2), abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(hrep)))
                )
            )
        );
        RoundVotingEngine engImpl2 = new RoundVotingEngine();
        RoundVotingEngine engine2 = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engImpl2),
                    abi.encodeCall(
                        RoundVotingEngine.initialize,
                        (owner, address(hrep), address(registry2), address(_deployProtocolConfig(owner)))
                    )
                )
            )
        );

        RoundRewardDistributor distImpl2 = new RoundRewardDistributor();
        RoundRewardDistributor dist2 = RoundRewardDistributor(
            address(
                new ERC1967Proxy(
                    address(distImpl2),
                    abi.encodeCall(
                        RoundRewardDistributor.initialize, (owner, address(hrep), address(engine2), address(registry2))
                    )
                )
            )
        );

        registry2.setVotingEngine(address(engine2));
        MockCategoryRegistry mockCategoryRegistry2 = new MockCategoryRegistry();
        mockCategoryRegistry2.seedDefaultTestCategories();
        registry2.setCategoryRegistry(address(mockCategoryRegistry2));
        registry2.setProtocolConfig(address(engine2.protocolConfig()));
        ProtocolConfig(address(engine2.protocolConfig())).setCategoryRegistry(address(mockCategoryRegistry2));
        ProtocolConfig(address(engine2.protocolConfig())).setRewardDistributor(address(dist2));
        ProtocolConfig(address(engine2.protocolConfig())).setTreasury(treasury);
        _setTlockRoundConfig(ProtocolConfig(address(engine2.protocolConfig())), 5 minutes, 7 days, 2, 200);

        vm.stopPrank();

        assertEq(engine2.consensusReserve(), 0);

        vm.startPrank(submitter);
        hrep.approve(address(registry2), 10e6);
        _submitContentWithReservation(registry2, "https://example.com/zero-reserve", "goal", "goal", "test", 0);
        vm.stopPrank();
        uint256 contentId = 1;

        // Both voters commit UP (one-sided consensus)
        bytes32 salt1 = keccak256(abi.encodePacked(voter1, block.timestamp, contentId));
        bytes32 commitHash1 = _commitHash(true, salt1, voter1, contentId);
        bytes memory ciphertext1 = _testCiphertext(true, salt1, contentId);
        vm.startPrank(voter1);
        hrep.approve(address(engine2), STAKE);
        engine2.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            commitHash1,
            ciphertext1,
            STAKE,
            address(0)
        );
        vm.stopPrank();

        bytes32 salt2 = keccak256(abi.encodePacked(voter2, block.timestamp + 1, contentId));
        bytes32 commitHash2 = _commitHash(true, salt2, voter2, contentId);
        bytes memory ciphertext2 = _testCiphertext(true, salt2, contentId);
        vm.startPrank(voter2);
        hrep.approve(address(engine2), STAKE);
        engine2.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            commitHash2,
            ciphertext2,
            STAKE,
            address(0)
        );
        vm.stopPrank();

        uint256 roundId = 1;
        RoundLib.Round memory roundBefore = RoundEngineReadHelpers.round(engine2, contentId, roundId);

        // Warp past epochDuration to reveal
        _warpPastTlockRevealTime(uint256(roundBefore.startTime) + 5 minutes);

        bytes32 commitKey1 = keccak256(abi.encodePacked(voter1, commitHash1));
        bytes32 commitKey2 = keccak256(abi.encodePacked(voter2, commitHash2));
        engine2.revealVoteByCommitKey(contentId, roundId, commitKey1, true, salt1);
        engine2.revealVoteByCommitKey(contentId, roundId, commitKey2, true, salt2);

        engine2.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine2, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
    }

    // --- Setter zero address checks ---

    function test_SetRewardDistributorZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        ProtocolConfig(protocolConfigAddress).setRewardDistributor(address(0));
    }

    function test_SetRewardDistributorSecondCallReverts() public {
        address originalDistributor = ProtocolConfig(protocolConfigAddress).rewardDistributor();

        vm.prank(owner);
        vm.expectRevert(ProtocolConfig.RewardDistributorAlreadySet.selector);
        ProtocolConfig(protocolConfigAddress).setRewardDistributor(address(0xBEEF));
        assertEq(ProtocolConfig(protocolConfigAddress).rewardDistributor(), originalDistributor);
    }

    function test_SetFrontendRegistryZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        ProtocolConfig(protocolConfigAddress).setFrontendRegistry(address(0));
    }

    function test_SetCategoryRegistryZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        ProtocolConfig(protocolConfigAddress).setCategoryRegistry(address(0));
    }

    function test_SetTreasuryZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        ProtocolConfig(protocolConfigAddress).setTreasury(address(0));
    }

    function test_SetVoterIdNFTZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        ProtocolConfig(protocolConfigAddress).setVoterIdNFT(address(0));
    }

    function test_SetParticipationPoolZeroReverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        ProtocolConfig(protocolConfigAddress).setParticipationPool(address(0));
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
        hrep.approve(address(engine), STAKE);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        engine.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            commitHash,
            ciphertext,
            STAKE,
            address(0)
        );
        vm.stopPrank();
    }

    function test_UnpauseAllowsVote() public {
        uint256 contentId = _submitContent();

        vm.prank(owner);
        engine.pause();
        vm.prank(owner);
        engine.unpause();

        _commit(voter1, contentId, true, STAKE);
        assertGt(RoundEngineReadHelpers.activeRoundId(engine, contentId), 0);
    }

    // --- Asymmetric stakes settlement ---

    function test_AsymmetricStakesSettlement() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 salt1) = _commit(voter1, contentId, true, 100e6);
        (bytes32 ck2, bytes32 salt2) = _commit(voter2, contentId, false, 1e6);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r0 = RoundEngineReadHelpers.round(engine, contentId, roundId);

        // Reveal after epochDuration
        _warpPastTlockRevealTime(uint256(r0.startTime) + 5 minutes);
        engine.revealVoteByCommitKey(contentId, roundId, ck1, true, salt1);
        engine.revealVoteByCommitKey(contentId, roundId, ck2, false, salt2);

        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
        assertTrue(round.upWins);
        assertEq(round.upPool, 100e6);
        assertEq(round.downPool, 1e6);
    }

    // --- Cancelled round refund ---

    function test_ClaimCancelledRoundRefund() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(keeper);
        engine.cancelExpiredRound(contentId, roundId);

        uint256 balBefore = hrep.balanceOf(voter1);
        vm.prank(voter1);
        engine.claimCancelledRoundRefund(contentId, roundId);

        assertEq(hrep.balanceOf(voter1) - balBefore, STAKE);
    }

    function test_ClaimCancelledRoundRefundDoubleClaimReverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
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

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.RoundNotCancelledOrTied.selector);
        engine.claimCancelledRoundRefund(contentId, roundId);
    }

    // --- Single-voter settlement behavior ---

    function test_SingleVoterDoesNotSettleBeforeEpochEnd() public {
        uint256 contentId = _submitContent();
        // Only one voter commits
        (bytes32 ck1, bytes32 salt1) = _commit(voter1, contentId, true, STAKE);
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);

        RoundLib.Round memory r0 = RoundEngineReadHelpers.round(engine, contentId, roundId);
        // Reveal the vote (need epoch to end first)
        _warpPastTlockRevealTime(uint256(r0.startTime) + 5 minutes);
        engine.revealVoteByCommitKey(contentId, roundId, ck1, true, salt1);

        // Not enough votes to settle (only 1 revealed, minVoters=2)
        vm.expectRevert(RoundVotingEngine.NotEnoughVotes.selector);
        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Open), "Still open with < minVoters revealed");
    }

    // --- Double commit reverts ---

    function test_DoubleCommitReverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        assertGt(roundId, 0);

        bytes32 salt2 = keccak256("salt2");
        bytes32 commitHash2 = _commitHash(true, salt2, contentId);
        bytes memory ciphertext2 = abi.encodePacked(uint8(1), salt2, contentId);
        vm.startPrank(voter1);
        hrep.approve(address(engine), STAKE);
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        engine.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            commitHash2,
            ciphertext2,
            STAKE,
            address(0)
        );
        vm.stopPrank();
    }

    // --- Commit on settled round starts new round ---

    function test_CommitOnSettledRoundStartsNewRound() public {
        (uint256 contentId,) = _createAndSettleRound();

        vm.warp(block.timestamp + 24 hours); // cooldown
        _commit(voter1, contentId, true, STAKE);

        uint256 newRid = RoundEngineReadHelpers.activeRoundId(engine, contentId);
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
        hrep.approve(address(engine), STAKE);
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        engine.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            commitHash2,
            ciphertext2,
            STAKE,
            address(0)
        );
        vm.stopPrank();
    }

    // --- View functions ---

    function test_GetActiveRoundIdReturnsZeroForNoRound() public view {
        assertEq(RoundEngineReadHelpers.activeRoundId(engine, 999), 0);
    }

    function test_HasActiveVotes() public {
        uint256 contentId = _submitContent();
        assertFalse(_hasUnrevealedVotes(contentId));

        _commit(voter1, contentId, true, STAKE);
        assertTrue(_hasUnrevealedVotes(contentId));
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _submitContent() internal returns (uint256 contentId) {
        vm.startPrank(submitter);
        hrep.approve(address(registry), 10e6);
        _submitContentWithReservation(registry, "https://example.com/coverage", "goal", "goal", "test", 0);
        vm.stopPrank();
        contentId = 1;
    }

    function _commit(address voter, uint256 contentId, bool isUp, uint256 stake)
        internal
        returns (bytes32 commitKey, bytes32 salt)
    {
        salt = keccak256(abi.encodePacked(voter, block.timestamp, contentId));
        bytes memory ciphertext = _testCiphertext(isUp, salt, contentId);
        bytes32 commitHash = _commitHash(isUp, salt, voter, contentId, ciphertext);
        vm.prank(voter);
        hrep.approve(address(engine), stake);
        vm.prank(voter);
        engine.commitVote(
            contentId,
            _defaultRatingReferenceBps(),
            _tlockCommitTargetRound(),
            _tlockDrandChainHash(),
            commitHash,
            ciphertext,
            stake,
            address(0)
        );
        commitKey = keccak256(abi.encodePacked(voter, commitHash));
    }

    function _hasUnrevealedVotes(uint256 contentId) internal view returns (bool) {
        uint256 roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        if (roundId == 0) return false;
        RoundLib.Round memory round = RoundEngineReadHelpers.round(engine, contentId, roundId);
        return round.voteCount > round.revealedCount;
    }

    // Not used directly; rounds are settled via _createAndSettleRound or inline reveal+settle.

    function _createAndSettleRound() internal returns (uint256 contentId, uint256 roundId) {
        contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);

        roundId = RoundEngineReadHelpers.activeRoundId(engine, contentId);
        RoundLib.Round memory r = RoundEngineReadHelpers.round(engine, contentId, roundId);

        // Warp past epochDuration to reveal
        _warpPastTlockRevealTime(uint256(r.startTime) + 5 minutes);
        engine.revealVoteByCommitKey(contentId, roundId, ck1, true, s1);
        engine.revealVoteByCommitKey(contentId, roundId, ck2, false, s2);

        engine.settleRound(contentId, roundId);
    }
}
