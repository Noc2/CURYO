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
import { IVoterIdNFT } from "../contracts/interfaces/IVoterIdNFT.sol";
import { IRoundVotingEngine } from "../contracts/interfaces/IRoundVotingEngine.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

// =========================================================================
// MOCKS
// =========================================================================

/// @title Mock VoterIdNFT for testing sybil-resistance branches
contract MockVoterIdNFT is IVoterIdNFT {
    mapping(address => bool) public holders;
    mapping(address => uint256) public tokenIds;
    mapping(uint256 => address) public tokenHolders;
    mapping(uint256 => bool) public usedNullifiers;
    uint256 private nextTokenId = 1;

    mapping(bytes32 => uint256) public stakes;

    mapping(address => address) public holderToDelegate;
    mapping(address => address) public delegateToHolder;

    function setHolder(address holder) external {
        holders[holder] = true;
        if (tokenIds[holder] == 0) {
            tokenIds[holder] = nextTokenId;
            tokenHolders[nextTokenId] = holder;
            nextTokenId++;
        }
    }

    function removeHolder(address holder) external {
        holders[holder] = false;
    }

    function mint(address to, uint256 nullifier) external returns (uint256) {
        usedNullifiers[nullifier] = true;
        holders[to] = true;
        uint256 id = nextTokenId++;
        tokenIds[to] = id;
        tokenHolders[id] = to;
        return id;
    }

    function hasVoterId(address holder) external view returns (bool) {
        return holders[holder];
    }

    function getTokenId(address holder) external view returns (uint256) {
        return tokenIds[holder];
    }

    function getHolder(uint256 tokenId) external view returns (address) {
        return tokenHolders[tokenId];
    }

    function recordStake(uint256 contentId, uint256 epochId, uint256 tokenId, uint256 amount) external {
        bytes32 key = keccak256(abi.encodePacked(contentId, epochId, tokenId));
        stakes[key] += amount;
    }

    function getEpochContentStake(uint256 contentId, uint256 epochId, uint256 tokenId) external view returns (uint256) {
        bytes32 key = keccak256(abi.encodePacked(contentId, epochId, tokenId));
        return stakes[key];
    }

    function isNullifierUsed(uint256 nullifier) external view returns (bool) {
        return usedNullifiers[nullifier];
    }

    function revokeVoterId(address holder) external {
        holders[holder] = false;
    }

    function setDelegate(address delegate) external {
        holderToDelegate[msg.sender] = delegate;
        delegateToHolder[delegate] = msg.sender;
    }

    function removeDelegate() external {
        address delegate = holderToDelegate[msg.sender];
        delete delegateToHolder[delegate];
        delete holderToDelegate[msg.sender];
    }

    function resolveHolder(address addr) external view returns (address) {
        if (holders[addr]) return addr;
        address h = delegateToHolder[addr];
        if (holders[h]) return h;
        return address(0);
    }

    function delegateTo(address holder) external view returns (address) {
        return holderToDelegate[holder];
    }

    function delegateOf(address delegate) external view returns (address) {
        return delegateToHolder[delegate];
    }
}

/// @title Mock VotingEngine for FrontendRegistry slash tests
contract MockVotingEngineForFR is IRoundVotingEngine {
    uint256 public totalAdded;

    function addToConsensusReserve(uint256 amount) external override {
        totalAdded += amount;
    }

    function getContentCommitCount(uint256) external pure override returns (uint256) {
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

contract RoundSettlementEdgeCaseTest is Test {
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
                    abi.encodeCall(RoundVotingEngine.initialize, (owner, owner, address(crep), address(registry), true))
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
        engine.setConfig(15 minutes, 7 days, 2, 200);

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
        engine.setConfig(15 minutes, 23 hours, 2, 200);
    }

    function test_SetConfigMinVotersTooLow() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidConfig.selector);
        engine.setConfig(15 minutes, 7 days, 1, 200);
    }

    function test_SetConfigMaxVotersLessThanMin() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidConfig.selector);
        engine.setConfig(15 minutes, 7 days, 5, 4);
    }

    function test_SetConfigMaxVotersExceedsLimit() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidConfig.selector);
        engine.setConfig(15 minutes, 7 days, 2, 10001);
    }

    function test_SetConfigValidBoundary() public {
        vm.prank(owner);
        engine.setConfig(5 minutes, 1 days, 2, 10000);
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
            abi.encodeCall(RoundVotingEngine.initialize, (address(0), owner, address(crep), address(registry), true))
        );
    }

    function test_InitializeZeroGovernanceReverts() public {
        RoundVotingEngine impl = new RoundVotingEngine();
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(RoundVotingEngine.initialize, (owner, address(0), address(crep), address(registry), true))
        );
    }

    function test_InitializeZeroTokenReverts() public {
        RoundVotingEngine impl = new RoundVotingEngine();
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        new ERC1967Proxy(
            address(impl),
            abi.encodeCall(RoundVotingEngine.initialize, (owner, owner, address(0), address(registry), true))
        );
    }

    function test_InitializeZeroRegistryReverts() public {
        RoundVotingEngine impl = new RoundVotingEngine();
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        new ERC1967Proxy(
            address(impl), abi.encodeCall(RoundVotingEngine.initialize, (owner, owner, address(crep), address(0), true))
        );
    }

    // --- Commit edge cases ---

    function test_CommitEmptyCiphertextReverts() public {
        uint256 contentId = _submitContent();

        vm.startPrank(voter1);
        crep.approve(address(engine), STAKE);
        bytes32 commitHash = keccak256(abi.encodePacked(true, bytes32(uint256(1)), contentId));
        vm.expectRevert(RoundVotingEngine.InvalidCiphertext.selector);
        engine.commitVote(contentId, commitHash, "", STAKE, address(0));
        vm.stopPrank();
    }

    function test_CommitSelfVoteReverts() public {
        uint256 contentId = _submitContent();

        vm.startPrank(submitter);
        crep.approve(address(engine), STAKE);
        bytes32 salt = bytes32(uint256(1));
        bytes32 commitHash = keccak256(abi.encodePacked(true, salt, contentId));
        vm.expectRevert(RoundVotingEngine.SelfVote.selector);
        engine.commitVote(contentId, commitHash, _mockCiphertext(true, salt, contentId), STAKE, address(0));
        vm.stopPrank();
    }

    function test_CommitBelowMinStakeReverts() public {
        uint256 contentId = _submitContent();

        vm.startPrank(voter1);
        crep.approve(address(engine), 1);
        bytes32 salt = bytes32(uint256(1));
        bytes32 commitHash = keccak256(abi.encodePacked(true, salt, contentId));
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        engine.commitVote(contentId, commitHash, _mockCiphertext(true, salt, contentId), 1, address(0));
        vm.stopPrank();
    }

    function test_CommitAboveMaxStakeReverts() public {
        uint256 contentId = _submitContent();

        vm.startPrank(voter1);
        crep.approve(address(engine), 101e6);
        bytes32 salt = bytes32(uint256(1));
        bytes32 commitHash = keccak256(abi.encodePacked(true, salt, contentId));
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        engine.commitVote(contentId, commitHash, _mockCiphertext(true, salt, contentId), 101e6, address(0));
        vm.stopPrank();
    }

    function test_CommitMaxStakeSucceeds() public {
        uint256 contentId = _submitContent();

        vm.startPrank(voter1);
        crep.approve(address(engine), 100e6);
        bytes32 salt = bytes32(uint256(1));
        bytes32 commitHash = keccak256(abi.encodePacked(true, salt, contentId));
        engine.commitVote(contentId, commitHash, _mockCiphertext(true, salt, contentId), 100e6, address(0));
        vm.stopPrank();

        assertGt(engine.getActiveRoundId(contentId), 0);
    }

    // --- Cancel expired round ---

    function test_CancelExpiredRound() public {
        uint256 contentId = _submitContent();
        _commitVote(voter1, contentId, true, bytes32(uint256(111)));

        uint256 roundId = engine.getActiveRoundId(contentId);
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(keeper);
        engine.cancelExpiredRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Cancelled));
    }

    function test_CancelNonExpiredReverts() public {
        uint256 contentId = _submitContent();
        _commitVote(voter1, contentId, true, bytes32(uint256(111)));

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.prank(keeper);
        vm.expectRevert(RoundVotingEngine.RoundNotExpired.selector);
        engine.cancelExpiredRound(contentId, roundId);
    }

    // --- Settle on terminal rounds ---

    function test_SettleOnAlreadySettledReverts() public {
        (uint256 contentId, uint256 roundId) = _createAndSettleRound();

        vm.prank(keeper);
        vm.expectRevert(RoundVotingEngine.RoundNotOpen.selector);
        engine.settleRound(contentId, roundId);
    }

    // --- Reveal on terminal round ---

    function test_RevealOnSettledRoundReverts() public {
        (uint256 contentId, uint256 roundId) = _createAndSettleRound();

        // Use an existing voter's commit to test reveal on settled round
        // voter1 already committed and was revealed during settlement, so try re-revealing
        bytes32 commitHash = engine.getVoterCommitHash(contentId, roundId, voter1);
        bytes32 commitKey = keccak256(abi.encodePacked(voter1, commitHash));

        vm.prank(keeper);
        vm.expectRevert(RoundVotingEngine.RoundNotOpen.selector);
        engine.revealVoteByCommitKey(contentId, roundId, commitKey, true, bytes32(uint256(111)));
    }

    // --- Unanimous settlement with zero reserve ---

    function test_UnanimousSettlementWithZeroReserve() public {
        vm.startPrank(owner);

        RoundVotingEngine engImpl2 = new RoundVotingEngine();
        RoundVotingEngine engine2 = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engImpl2),
                    abi.encodeCall(RoundVotingEngine.initialize, (owner, owner, address(crep), address(registry), true))
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
        engine2.setConfig(15 minutes, 7 days, 2, 200);

        vm.stopPrank();

        assertEq(engine2.consensusReserve(), 0);

        vm.startPrank(submitter);
        crep.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/zero-reserve", "goal", "test", 0);
        vm.stopPrank();
        uint256 contentId = 1;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));

        vm.startPrank(voter1);
        crep.approve(address(engine2), STAKE);
        bytes32 hash1 = keccak256(abi.encodePacked(true, salt1, contentId));
        engine2.commitVote(contentId, hash1, _mockCiphertext(true, salt1, contentId), STAKE, address(0));
        vm.stopPrank();

        vm.startPrank(voter2);
        crep.approve(address(engine2), STAKE);
        bytes32 hash2 = keccak256(abi.encodePacked(true, salt2, contentId));
        engine2.commitVote(contentId, hash2, _mockCiphertext(true, salt2, contentId), STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = engine2.getActiveRoundId(contentId);

        vm.warp(block.timestamp + 16 minutes);
        bytes32 ck1 = keccak256(abi.encodePacked(voter1, hash1));
        bytes32 ck2 = keccak256(abi.encodePacked(voter2, hash2));
        vm.prank(keeper);
        engine2.revealVoteByCommitKey(contentId, roundId, ck1, true, salt1);
        vm.prank(keeper);
        engine2.revealVoteByCommitKey(contentId, roundId, ck2, true, salt2);

        vm.warp(block.timestamp + 1 hours);
        vm.prank(keeper);
        engine2.settleRound(contentId, roundId);

        RoundLib.Round memory round = engine2.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
        assertEq(engine2.roundVoterPool(contentId, roundId), 0);
    }

    // --- processUnrevealed edge cases ---

    function test_ProcessUnrevealedOnCancelledReverts() public {
        uint256 contentId = _submitContent();
        _commitVote(voter1, contentId, true, bytes32(uint256(111)));

        uint256 roundId = engine.getActiveRoundId(contentId);
        vm.warp(block.timestamp + 7 days + 1);

        vm.prank(keeper);
        engine.cancelExpiredRound(contentId, roundId);

        vm.prank(keeper);
        vm.expectRevert(RoundVotingEngine.RoundNotSettledOrTied.selector);
        engine.processUnrevealedVotes(contentId, roundId, 0, 0);
    }

    function test_ProcessUnrevealedOutOfBounds() public {
        (uint256 contentId, uint256 roundId) = _createAndSettleRound();

        vm.prank(keeper);
        vm.expectRevert(RoundVotingEngine.IndexOutOfBounds.selector);
        engine.processUnrevealedVotes(contentId, roundId, 9999, 0);
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

    function test_PauseBlocksCommit() public {
        uint256 contentId = _submitContent();

        vm.prank(owner);
        engine.pause();

        vm.startPrank(voter1);
        crep.approve(address(engine), STAKE);
        bytes32 salt = bytes32(uint256(1));
        bytes32 commitHash = keccak256(abi.encodePacked(true, salt, contentId));
        vm.expectRevert(Pausable.EnforcedPause.selector);
        engine.commitVote(contentId, commitHash, _mockCiphertext(true, salt, contentId), STAKE, address(0));
        vm.stopPrank();
    }

    function test_UnpauseAllowsCommit() public {
        uint256 contentId = _submitContent();

        vm.prank(owner);
        engine.pause();
        vm.prank(owner);
        engine.unpause();

        vm.startPrank(voter1);
        crep.approve(address(engine), STAKE);
        bytes32 salt = bytes32(uint256(1));
        bytes32 commitHash = keccak256(abi.encodePacked(true, salt, contentId));
        engine.commitVote(contentId, commitHash, _mockCiphertext(true, salt, contentId), STAKE, address(0));
        vm.stopPrank();
    }

    // --- Asymmetric stakes settlement ---

    function test_AsymmetricStakesSettlement() public {
        uint256 contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));

        bytes32 hash1 = keccak256(abi.encodePacked(true, salt1, contentId));
        vm.startPrank(voter1);
        crep.approve(address(engine), 100e6);
        engine.commitVote(contentId, hash1, _mockCiphertext(true, salt1, contentId), 100e6, address(0));
        vm.stopPrank();

        bytes32 hash2 = keccak256(abi.encodePacked(false, salt2, contentId));
        vm.startPrank(voter2);
        crep.approve(address(engine), 1e6);
        engine.commitVote(contentId, hash2, _mockCiphertext(false, salt2, contentId), 1e6, address(0));
        vm.stopPrank();

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(t0 + 16 minutes);
        _revealVote(keeper, voter1, contentId, roundId, hash1, true, salt1);
        _revealVote(keeper, voter2, contentId, roundId, hash2, false, salt2);

        vm.warp(block.timestamp + 1 hours);
        vm.prank(keeper);
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
        _commitVote(voter1, contentId, true, bytes32(uint256(111)));

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
        _commitVote(voter1, contentId, true, bytes32(uint256(111)));

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
        _commitVote(voter1, contentId, true, bytes32(uint256(111)));

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.RoundNotCancelledOrTied.selector);
        engine.claimCancelledRoundRefund(contentId, roundId);
    }

    // --- NotEnoughVotes ---

    function test_SettleNotEnoughVotesReverts() public {
        uint256 contentId = _submitContent();
        bytes32 salt1 = bytes32(uint256(111));
        bytes32 hash1 = _commitVote(voter1, contentId, true, salt1);

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + 16 minutes);
        _revealVote(keeper, voter1, contentId, roundId, hash1, true, salt1);

        vm.warp(block.timestamp + 16 minutes);
        vm.prank(keeper);
        vm.expectRevert(RoundVotingEngine.NotEnoughVotes.selector);
        engine.settleRound(contentId, roundId);
    }

    // --- Reveal edge cases ---

    function test_RevealWithWrongHashReverts() public {
        uint256 contentId = _submitContent();
        bytes32 salt = bytes32(uint256(111));
        bytes32 commitHash = _commitVote(voter1, contentId, true, salt);

        uint256 roundId = engine.getActiveRoundId(contentId);
        vm.warp(block.timestamp + 16 minutes);

        bytes32 commitKey = keccak256(abi.encodePacked(voter1, commitHash));
        vm.prank(keeper);
        vm.expectRevert(RoundVotingEngine.HashMismatch.selector);
        engine.revealVoteByCommitKey(contentId, roundId, commitKey, false, salt);
    }

    function test_DoubleRevealReverts() public {
        uint256 contentId = _submitContent();
        bytes32 salt = bytes32(uint256(111));
        bytes32 commitHash = _commitVote(voter1, contentId, true, salt);

        uint256 roundId = engine.getActiveRoundId(contentId);
        vm.warp(block.timestamp + 16 minutes);

        _revealVote(keeper, voter1, contentId, roundId, commitHash, true, salt);

        bytes32 commitKey = keccak256(abi.encodePacked(voter1, commitHash));
        vm.prank(keeper);
        vm.expectRevert(RoundVotingEngine.AlreadyRevealed.selector);
        engine.revealVoteByCommitKey(contentId, roundId, commitKey, true, salt);
    }

    function test_RevealBeforeEpochEndReverts() public {
        uint256 contentId = _submitContent();
        bytes32 salt = bytes32(uint256(111));
        bytes32 commitHash = _commitVote(voter1, contentId, true, salt);

        uint256 roundId = engine.getActiveRoundId(contentId);

        bytes32 commitKey = keccak256(abi.encodePacked(voter1, commitHash));
        vm.prank(keeper);
        vm.expectRevert(RoundVotingEngine.EpochNotEnded.selector);
        engine.revealVoteByCommitKey(contentId, roundId, commitKey, true, salt);
    }

    // --- Cooldown ---

    function test_CooldownBlocksSecondCommit() public {
        uint256 contentId = _submitContent();
        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        bytes32 hash1 = _commitVote(voter1, contentId, true, salt1);
        bytes32 hash2 = _commitVote(voter2, contentId, false, salt2);

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + 16 minutes);
        _revealVote(keeper, voter1, contentId, roundId, hash1, true, salt1);
        _revealVote(keeper, voter2, contentId, roundId, hash2, false, salt2);

        vm.warp(block.timestamp + 1 hours);
        vm.prank(keeper);
        engine.settleRound(contentId, roundId);

        bytes32 salt3 = bytes32(uint256(333));
        vm.startPrank(voter1);
        crep.approve(address(engine), STAKE);
        bytes32 commitHash = keccak256(abi.encodePacked(true, salt3, contentId));
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        engine.commitVote(contentId, commitHash, _mockCiphertext(true, salt3, contentId), STAKE, address(0));
        vm.stopPrank();
    }

    // --- View functions ---

    function test_GetActiveRoundIdReturnsZeroForNoRound() public view {
        assertEq(engine.getActiveRoundId(999), 0);
    }

    function test_HasUnrevealedVotes() public {
        uint256 contentId = _submitContent();
        assertFalse(engine.hasUnrevealedVotes(contentId));

        _commitVote(voter1, contentId, true, bytes32(uint256(111)));
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

    function _commitVote(address voter, uint256 contentId, bool isUp, bytes32 salt)
        internal
        returns (bytes32 commitHash)
    {
        commitHash = keccak256(abi.encodePacked(isUp, salt, contentId));
        vm.startPrank(voter);
        crep.approve(address(engine), STAKE);
        engine.commitVote(contentId, commitHash, _mockCiphertext(isUp, salt, contentId), STAKE, address(0));
        vm.stopPrank();
    }

    function _mockCiphertext(bool isUp, bytes32 salt, uint256 contentId) internal pure returns (bytes memory) {
        return abi.encodePacked(isUp ? bytes1(uint8(1)) : bytes1(uint8(0)), salt, bytes32(contentId));
    }

    function _revealVote(
        address caller,
        address voter,
        uint256 contentId,
        uint256 roundId,
        bytes32 commitHash,
        bool isUp,
        bytes32 salt
    ) internal {
        bytes32 commitKey = keccak256(abi.encodePacked(voter, commitHash));
        vm.prank(caller);
        engine.revealVoteByCommitKey(contentId, roundId, commitKey, isUp, salt);
    }

    function _createAndSettleRound() internal returns (uint256 contentId, uint256 roundId) {
        contentId = _submitContent();
        uint256 t0 = block.timestamp;

        bytes32 salt1 = bytes32(uint256(111));
        bytes32 salt2 = bytes32(uint256(222));
        bytes32 hash1 = _commitVote(voter1, contentId, true, salt1);
        bytes32 hash2 = _commitVote(voter2, contentId, false, salt2);

        roundId = engine.getActiveRoundId(contentId);

        // Advance past epoch end to allow reveals
        vm.warp(t0 + 16 minutes);
        _revealVote(keeper, voter1, contentId, roundId, hash1, true, salt1);
        _revealVote(keeper, voter2, contentId, roundId, hash2, false, salt2);

        // Advance well past settlement delay (epochDuration after thresholdReachedAt)
        vm.warp(block.timestamp + 1 hours);
        vm.prank(keeper);
        engine.settleRound(contentId, roundId);
    }
}
