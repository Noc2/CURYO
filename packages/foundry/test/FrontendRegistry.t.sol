// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test, console } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { IFrontendRegistry } from "../contracts/interfaces/IFrontendRegistry.sol";
import { IRoundVotingEngine } from "../contracts/interfaces/IRoundVotingEngine.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";

/// @title Mock RoundVotingEngine for testing FrontendRegistry
contract MockVotingEngine is IRoundVotingEngine {
    uint256 public totalAddedToReserve;

    function addToConsensusReserve(uint256 amount) external override {
        totalAddedToReserve += amount;
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

/// @title FrontendRegistry Test Suite
contract FrontendRegistryTest is Test {
    FrontendRegistry public registry;
    CuryoReputation public crepToken;
    MockVotingEngine public votingEngine;

    address public admin = address(1);
    address public frontend1 = address(3);
    address public frontend2 = address(4);
    address public frontend3 = address(6);
    address public feeCreditor = address(5);

    uint256 public constant STAKE = 1000e6; // Fixed 1,000 cREP

    function setUp() public {
        vm.startPrank(admin);

        // Deploy cREP token
        crepToken = new CuryoReputation(admin, admin);

        // Grant minter role to admin
        crepToken.grantRole(crepToken.MINTER_ROLE(), admin);

        // Deploy mock voting engine
        votingEngine = new MockVotingEngine();

        // Deploy registry behind an ERC1967 proxy for upgradeable storage behavior
        FrontendRegistry impl = new FrontendRegistry();
        registry = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(impl), abi.encodeCall(FrontendRegistry.initialize, (admin, admin, address(crepToken)))
                )
            )
        );

        // Set voting engine for slashing
        registry.setVotingEngine(address(votingEngine));

        // Grant fee creditor role
        registry.addFeeCreditor(feeCreditor);

        // Mint cREP tokens for frontends (not transfer, to avoid governance lock checks)
        crepToken.mint(frontend1, 10_000e6);
        crepToken.mint(frontend2, 10_000e6);
        crepToken.mint(frontend3, 10_000e6);

        // Mint cREP for fee crediting (to registry)
        crepToken.mint(address(registry), 1_000_000e6);

        vm.stopPrank();

        // Advance blocks to activate voting power
        vm.roll(block.number + 5);
    }

    // --- Initialization Tests ---

    function test_Initialization() public view {
        assertEq(address(registry.crepToken()), address(crepToken));
        assertEq(registry.STAKE_AMOUNT(), 1000e6);
    }

    // --- Registration Tests ---

    function test_Register() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        (address operator, uint256 stakedAmount, bool eligible, bool slashed) = registry.getFrontendInfo(frontend1);
        assertEq(operator, frontend1);
        assertEq(stakedAmount, STAKE);
        assertTrue(eligible);
        assertFalse(slashed);

        (address[] memory frontends, uint256 total) = registry.getRegisteredFrontendsPaginated(0, 10);
        assertEq(total, 1);
        assertEq(frontends.length, 1);
        assertEq(frontends[0], frontend1);
    }

    function test_RevertRegisterAlreadyRegistered() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE * 2);
        registry.register();

        vm.expectRevert("Already registered");
        registry.register();
        vm.stopPrank();
    }

    // --- Deregister Tests ---

    function test_Deregister() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.prank(frontend1);
        registry.requestDeregister();

        uint256 availableAt = registry.frontendExitAvailableAt(frontend1);
        assertEq(availableAt, block.timestamp + registry.UNBONDING_PERIOD());

        uint256 balanceBefore = crepToken.balanceOf(frontend1);
        _completeDeregister(frontend1);

        uint256 balanceAfter = crepToken.balanceOf(frontend1);
        assertEq(balanceAfter - balanceBefore, STAKE);

        (address operator, uint256 stakedAmount, bool eligible,) = registry.getFrontendInfo(frontend1);
        assertEq(operator, address(0));
        assertEq(stakedAmount, 0);
        assertFalse(eligible);
    }

    function test_RevertDeregisterNotRegistered() public {
        vm.prank(frontend1);
        vm.expectRevert("Not registered");
        registry.requestDeregister();
    }

    function test_RevertDeregisterSlashed() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.prank(admin);
        registry.slashFrontend(frontend1, 500e6, "Test slash");

        vm.prank(frontend1);
        vm.expectRevert("Frontend is slashed");
        registry.requestDeregister();
    }

    function test_DeregisterWithPendingFees() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        // Credit some fees
        vm.prank(feeCreditor);
        registry.creditFees(frontend1, 200e6);

        vm.prank(frontend1);
        registry.requestDeregister();

        uint256 balanceBefore = crepToken.balanceOf(frontend1);
        _completeDeregister(frontend1);

        // Should receive stake + pending fees
        uint256 balanceAfter = crepToken.balanceOf(frontend1);
        assertEq(balanceAfter - balanceBefore, STAKE + 200e6);

        // Fees should be zeroed
        assertEq(registry.getAccumulatedFees(frontend1), 0);
    }

    function test_RevertClaimFeesWhileExitPending() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.prank(feeCreditor);
        registry.creditFees(frontend1, 100e6);

        vm.prank(frontend1);
        registry.requestDeregister();

        vm.prank(frontend1);
        vm.expectRevert(IFrontendRegistry.FrontendExitPending.selector);
        registry.claimFees();

        assertEq(registry.getAccumulatedFees(frontend1), 100e6);
    }

    function test_ReregisterAfterDeregister() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        registry.requestDeregister();
        vm.stopPrank();

        _completeDeregister(frontend1);

        // Should be able to register again
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        (address operator, uint256 stakedAmount,,) = registry.getFrontendInfo(frontend1);
        assertEq(operator, frontend1);
        assertEq(stakedAmount, STAKE);
    }

    function test_RegisteredFrontendsPagination_RemovesExitedEntriesAndAvoidsDuplicates() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.startPrank(frontend2);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.startPrank(frontend3);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.prank(frontend1);
        registry.requestDeregister();
        _completeDeregister(frontend1);

        (address[] memory frontendsAfterFirstExit, uint256 totalAfterFirstExit) =
            registry.getRegisteredFrontendsPaginated(0, 10);
        assertEq(totalAfterFirstExit, 2);
        assertEq(frontendsAfterFirstExit.length, 2);
        assertFalse(_contains(frontendsAfterFirstExit, frontend1));
        assertTrue(_contains(frontendsAfterFirstExit, frontend2));
        assertTrue(_contains(frontendsAfterFirstExit, frontend3));

        vm.prank(frontend3);
        registry.requestDeregister();
        _completeDeregister(frontend3);

        (address[] memory frontendsAfterSecondExit, uint256 totalAfterSecondExit) =
            registry.getRegisteredFrontendsPaginated(0, 10);
        assertEq(totalAfterSecondExit, 1);
        assertEq(frontendsAfterSecondExit.length, 1);
        assertEq(frontendsAfterSecondExit[0], frontend2);

        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        (address[] memory frontendsAfterReregister, uint256 totalAfterReregister) =
            registry.getRegisteredFrontendsPaginated(0, 10);
        assertEq(totalAfterReregister, 2);
        assertEq(frontendsAfterReregister.length, 2);
        assertEq(_count(frontendsAfterReregister, frontend1), 1);
        assertEq(_count(frontendsAfterReregister, frontend2), 1);
        assertFalse(_contains(frontendsAfterReregister, frontend3));
    }

    function test_DeregisterAfterUnslash() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.startPrank(admin);
        registry.slashFrontend(frontend1, 500e6, "Test");
        registry.unslashFrontend(frontend1);
        vm.stopPrank();

        vm.prank(frontend1);
        registry.requestDeregister();

        uint256 balanceBefore = crepToken.balanceOf(frontend1);
        _completeDeregister(frontend1);

        // Should return remaining 500e6 (half was slashed)
        uint256 balanceAfter = crepToken.balanceOf(frontend1);
        assertEq(balanceAfter - balanceBefore, 500e6);
    }

    // --- Eligibility Tests ---

    function test_RegisterFrontendBecomesEligible() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        assertTrue(registry.isEligible(frontend1));

        (,, bool eligible,) = registry.getFrontendInfo(frontend1);
        assertTrue(eligible);
    }

    function test_UnregisteredFrontendIsNotEligible() public view {
        assertFalse(registry.isEligible(frontend1));
    }

    function test_SlashedFrontendIsNotEligible() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.prank(admin);
        registry.slashFrontend(frontend1, STAKE / 2, "Test");

        assertFalse(registry.isEligible(frontend1));
    }

    function test_ExitPendingFrontendIsNotEligible() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        registry.requestDeregister();
        vm.stopPrank();

        assertFalse(registry.isEligible(frontend1));
    }

    function test_UnderbondedFrontendIsNotEligibleAfterUnslash() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.startPrank(admin);
        registry.slashFrontend(frontend1, STAKE / 2, "Test");
        registry.unslashFrontend(frontend1);
        vm.stopPrank();

        assertFalse(registry.isEligible(frontend1));
    }

    // --- Slash Tests ---

    function test_SlashFrontend() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        uint256 slashAmount = STAKE / 2;
        uint256 voterPoolBefore = votingEngine.totalAddedToReserve();

        vm.prank(admin);
        registry.slashFrontend(frontend1, slashAmount, "Malicious behavior");

        (, uint256 stakedAmount, bool eligible, bool slashed) = registry.getFrontendInfo(frontend1);
        assertEq(stakedAmount, STAKE - slashAmount);
        assertFalse(eligible);
        assertTrue(slashed);

        // Slashed amount goes to voter pool
        assertEq(votingEngine.totalAddedToReserve(), voterPoolBefore + slashAmount);
    }

    function test_UnslashFrontend() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.startPrank(admin);
        registry.slashFrontend(frontend1, STAKE / 2, "Test");

        (,,, bool slashed) = registry.getFrontendInfo(frontend1);
        assertTrue(slashed);

        registry.unslashFrontend(frontend1);

        (,,, slashed) = registry.getFrontendInfo(frontend1);
        assertFalse(slashed);
        assertFalse(registry.isEligible(frontend1));
        vm.stopPrank();
    }

    function test_RevertUnslashFrontendNotSlashed() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.prank(admin);
        vm.expectRevert("Frontend not slashed");
        registry.unslashFrontend(frontend1);
    }

    // --- Fee Crediting Tests ---

    function test_CreditFees() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.prank(feeCreditor);
        registry.creditFees(frontend1, 100e6);

        uint256 crepFees = registry.getAccumulatedFees(frontend1);
        assertEq(crepFees, 100e6);
    }

    function test_CreditFeesAccumulates() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.startPrank(feeCreditor);
        registry.creditFees(frontend1, 100e6);
        registry.creditFees(frontend1, 100e6);
        vm.stopPrank();

        uint256 crepFees = registry.getAccumulatedFees(frontend1);
        assertEq(crepFees, 200e6);
    }

    function test_CreditFeesRevertsForUnregisteredFrontend() public {
        // L-02: Should revert for unregistered frontend to prevent silent token loss
        vm.prank(feeCreditor);
        vm.expectRevert("Frontend not registered");
        registry.creditFees(frontend1, 100e6);
    }

    function test_RevertCreditFeesNonCreditor() public {
        vm.prank(frontend1);
        vm.expectRevert();
        registry.creditFees(frontend1, 100e6);
    }

    // --- Claim Fees Tests ---

    function test_ClaimFees() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.prank(feeCreditor);
        registry.creditFees(frontend1, 100e6);

        uint256 curyoBefore = crepToken.balanceOf(frontend1);

        vm.prank(frontend1);
        registry.claimFees();

        assertEq(crepToken.balanceOf(frontend1) - curyoBefore, 100e6);

        // Fees should be reset
        uint256 crepFees = registry.getAccumulatedFees(frontend1);
        assertEq(crepFees, 0);
    }

    function test_RevertClaimFeesWhileSlashed() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.prank(feeCreditor);
        registry.creditFees(frontend1, 100e6);

        vm.prank(admin);
        registry.slashFrontend(frontend1, STAKE / 2, "Test");

        vm.prank(frontend1);
        vm.expectRevert("Frontend is slashed");
        registry.claimFees();
    }

    function test_RevertClaimFeesWhileUnderbonded() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.prank(feeCreditor);
        registry.creditFees(frontend1, 100e6);

        vm.startPrank(admin);
        registry.slashFrontend(frontend1, STAKE / 2, "Test");
        registry.unslashFrontend(frontend1);
        vm.stopPrank();

        vm.prank(frontend1);
        vm.expectRevert("Frontend is underbonded");
        registry.claimFees();
    }

    function test_RevertClaimFeesNotRegistered() public {
        vm.prank(frontend1);
        vm.expectRevert("Not registered");
        registry.claimFees();
    }

    function test_RevertClaimFeesNoFees() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();

        vm.expectRevert("No fees to claim");
        registry.claimFees();
        vm.stopPrank();
    }

    // --- Eligibility Tests ---

    function test_TopUpStakeRestoresFullBond() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE + 500e6);
        registry.register();
        vm.stopPrank();

        vm.startPrank(admin);
        registry.slashFrontend(frontend1, 500e6, "Test");
        registry.unslashFrontend(frontend1);
        vm.stopPrank();

        vm.startPrank(frontend1);
        registry.topUpStake(500e6);
        vm.stopPrank();

        (, uint256 stakedAmount,, bool slashed) = registry.getFrontendInfo(frontend1);
        assertEq(stakedAmount, STAKE);
        assertFalse(slashed);
        assertTrue(registry.isEligible(frontend1));
    }

    function test_SlashFrontendConfiscatesAccruedFees() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.prank(feeCreditor);
        registry.creditFees(frontend1, 200e6);

        uint256 reserveBefore = votingEngine.totalAddedToReserve();

        vm.prank(admin);
        registry.slashFrontend(frontend1, 100e6, "Malicious behavior");

        assertEq(registry.getAccumulatedFees(frontend1), 0);
        assertEq(votingEngine.totalAddedToReserve(), reserveBefore + 300e6);
    }

    function test_SlashFrontendConfiscatesAccruedFeesWhileExitPending() public {
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        registry.requestDeregister();
        vm.stopPrank();

        vm.prank(feeCreditor);
        registry.creditFees(frontend1, 200e6);

        uint256 reserveBefore = votingEngine.totalAddedToReserve();

        vm.prank(admin);
        registry.slashFrontend(frontend1, 100e6, "Malicious behavior");

        assertEq(registry.getAccumulatedFees(frontend1), 0);
        assertEq(votingEngine.totalAddedToReserve(), reserveBefore + 300e6);
    }

    // --- Admin Functions Tests ---

    function test_SetVotingEngine() public {
        address newVotingEngine = address(100);

        vm.prank(admin);
        vm.expectEmit(true, true, true, true);
        emit FrontendRegistry.VotingEngineUpdated(newVotingEngine);
        registry.setVotingEngine(newVotingEngine);

        assertEq(address(registry.votingEngine()), newVotingEngine);
    }

    function test_RevertSetVotingEngineZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert("Invalid voting engine");
        registry.setVotingEngine(address(0));
    }

    function test_SlashFrontendRequiresVotingEngine() public {
        // L-05: slashFrontend should revert if votingEngine is not set
        // Deploy a fresh registry without setting voting engine
        vm.startPrank(admin);
        FrontendRegistry impl2 = new FrontendRegistry();
        FrontendRegistry noEngineRegistry = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(impl2), abi.encodeCall(FrontendRegistry.initialize, (admin, admin, address(crepToken)))
                )
            )
        );
        // Do NOT call setVotingEngine

        // Mint and register a frontend
        crepToken.mint(frontend1, 10_000e6);
        vm.stopPrank();

        vm.startPrank(frontend1);
        crepToken.approve(address(noEngineRegistry), STAKE);
        noEngineRegistry.register();
        vm.stopPrank();

        // Try to slash — should revert
        vm.prank(admin);
        vm.expectRevert("VotingEngine not set");
        noEngineRegistry.slashFrontend(frontend1, STAKE / 2, "Test");
    }

    function test_AddAndRemoveFeeCreditor() public {
        address newCreditor = address(100);

        vm.startPrank(admin);
        registry.addFeeCreditor(newCreditor);
        vm.stopPrank();

        // New creditor can credit fees
        vm.startPrank(frontend1);
        crepToken.approve(address(registry), STAKE);
        registry.register();
        vm.stopPrank();

        vm.prank(newCreditor);
        registry.creditFees(frontend1, 100e6);

        uint256 crepFees = registry.getAccumulatedFees(frontend1);
        assertEq(crepFees, 100e6);

        // Remove creditor
        vm.prank(admin);
        registry.removeFeeCreditor(newCreditor);

        // Should now revert
        vm.prank(newCreditor);
        vm.expectRevert();
        registry.creditFees(frontend1, 100e6);
    }

    function _completeDeregister(address frontend) internal {
        vm.warp(block.timestamp + registry.UNBONDING_PERIOD() + 1);
        vm.prank(frontend);
        registry.completeDeregister();
    }

    function _contains(address[] memory frontends, address frontend) internal pure returns (bool) {
        return _count(frontends, frontend) > 0;
    }

    function _count(address[] memory frontends, address frontend) internal pure returns (uint256 matches) {
        for (uint256 i = 0; i < frontends.length; i++) {
            if (frontends[i] == frontend) {
                matches++;
            }
        }
    }
}
