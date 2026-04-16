// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CuryoReputation} from "../contracts/CuryoReputation.sol";
import {ParticipationPool} from "../contracts/ParticipationPool.sol";

/// @title ParticipationPool branch coverage tests
contract ParticipationPoolBranchesTest is Test {
    CuryoReputation public crepToken;
    ParticipationPool public pool;

    address public admin = address(1);
    address public governance = address(2);
    address public authorizedCaller = address(3);
    address public user1 = address(4);

    uint256 public constant T0 = 1000;
    uint256 public constant POOL_AMOUNT = 24_000_000e6;

    function setUp() public {
        vm.warp(T0);
        vm.startPrank(admin);

        crepToken = new CuryoReputation(admin, governance);
        crepToken.mint(admin, 50_000_000e6);

        pool = new ParticipationPool(address(crepToken), governance);
        pool.setAuthorizedCaller(authorizedCaller, true);

        crepToken.approve(address(pool), POOL_AMOUNT);
        pool.depositPool(POOL_AMOUNT);

        vm.stopPrank();
    }

    // =========================================================================
    // Tier boundary transitions
    // =========================================================================

    function test_GetCurrentRateBps_InitialRate() public view {
        // totalDistributed = 0 → rate = 9000 (90%)
        assertEq(pool.getCurrentRateBps(), 9000);
    }

    function test_GetCurrentRateBps_ExactBoundary_1_5M() public {
        // Set totalDistributed to 1.5M (first tier boundary)
        _setTotalDistributed(1_500_000e6);
        // After 1.5M distributed, rate halves to 4500
        assertEq(pool.getCurrentRateBps(), 4500);
    }

    function test_GetCurrentRateBps_ExactBoundary_4_5M() public {
        // 1.5M + 3M = 4.5M → second halving
        _setTotalDistributed(4_500_000e6);
        assertEq(pool.getCurrentRateBps(), 2250);
    }

    function test_GetCurrentRateBps_ExactBoundary_10_5M() public {
        // 1.5M + 3M + 6M = 10.5M → third halving
        _setTotalDistributed(10_500_000e6);
        assertEq(pool.getCurrentRateBps(), 1125);
    }

    function test_GetCurrentRateBps_ExactBoundary_22_5M() public {
        // 1.5M + 3M + 6M + 12M = 22.5M → fourth halving
        _setTotalDistributed(22_500_000e6);
        assertEq(pool.getCurrentRateBps(), 562);
    }

    function test_GetCurrentRateBps_MinFloor() public {
        // Set totalDistributed high enough to halve rate below MIN_RATE_BPS (100)
        // Tiers: 1.5M→4500, 4.5M→2250, 10.5M→1125, 22.5M→562, 46.5M→281, 94.5M→140, 190.5M→70 → clamped to 100
        _setTotalDistributed(190_500_000e6);
        uint256 rate = pool.getCurrentRateBps();
        assertEq(rate, 100); // MIN_RATE_BPS
    }

    // =========================================================================
    // Pool depletion / capping
    // =========================================================================

    function test_RewardVote_PoolDepleted_CapsAtBalance() public {
        // Set pool balance very low
        _setPoolBalance(1e6); // only 1 cREP left

        uint256 balBefore = crepToken.balanceOf(user1);
        vm.prank(authorizedCaller);
        pool.rewardVote(user1, 10e6); // would reward 9 cREP at 90%, but pool only has 1

        uint256 balAfter = crepToken.balanceOf(user1);
        assertEq(balAfter - balBefore, 1e6); // capped at pool balance
    }

    function test_RewardVote_PoolEmpty_ReturnsZero() public {
        _setPoolBalance(0);

        uint256 balBefore = crepToken.balanceOf(user1);
        vm.prank(authorizedCaller);
        pool.rewardVote(user1, 10e6);
        assertEq(crepToken.balanceOf(user1), balBefore); // no reward
    }

    function test_RewardSubmission_PoolDepleted_CapsAtBalance() public {
        _setPoolBalance(2e6);

        uint256 balBefore = crepToken.balanceOf(user1);
        vm.prank(authorizedCaller);
        pool.rewardSubmission(user1, 100e6);

        uint256 balAfter = crepToken.balanceOf(user1);
        assertEq(balAfter - balBefore, 2e6); // capped
    }

    function test_DistributeReward_PartialPayout() public {
        _setPoolBalance(3e6);

        vm.prank(authorizedCaller);
        uint256 paid = pool.distributeReward(user1, 10e6);
        assertEq(paid, 3e6);
    }

    function test_DistributeReward_ZeroAmount() public {
        vm.prank(authorizedCaller);
        uint256 paid = pool.distributeReward(user1, 0);
        assertEq(paid, 0);
    }

    function test_DistributeReward_FullPayout() public {
        vm.prank(authorizedCaller);
        uint256 paid = pool.distributeReward(user1, 5e6);
        assertEq(paid, 5e6);
    }

    function test_ReserveReward_TracksReservedBalance() public {
        vm.prank(authorizedCaller);
        uint256 reserved = pool.reserveReward(authorizedCaller, 5e6);

        assertEq(reserved, 5e6);
        assertEq(pool.reservedRewards(authorizedCaller), 5e6);
        assertEq(pool.reservedBalance(), 5e6);
        assertEq(pool.poolBalance(), POOL_AMOUNT - 5e6);
    }

    function test_WithdrawReservedReward_PaysBeneficiaryBalance() public {
        vm.prank(authorizedCaller);
        pool.reserveReward(authorizedCaller, 5e6);

        uint256 balanceBefore = crepToken.balanceOf(user1);
        vm.prank(authorizedCaller);
        uint256 paid = pool.withdrawReservedReward(user1, 3e6);

        assertEq(paid, 3e6);
        assertEq(crepToken.balanceOf(user1) - balanceBefore, 3e6);
        assertEq(pool.reservedRewards(authorizedCaller), 2e6);
        assertEq(pool.reservedBalance(), 2e6);
    }

    function test_ReleaseReservedReward_RestoresPoolAccounting() public {
        vm.prank(authorizedCaller);
        pool.reserveReward(authorizedCaller, 5e6);

        uint256 poolBalanceBeforeRelease = pool.poolBalance();
        uint256 totalDistributedBeforeRelease = pool.totalDistributed();

        vm.prank(authorizedCaller);
        uint256 released = pool.releaseReservedReward(2e6);

        assertEq(released, 2e6);
        assertEq(pool.reservedRewards(authorizedCaller), 3e6);
        assertEq(pool.reservedBalance(), 3e6);
        assertEq(pool.poolBalance(), poolBalanceBeforeRelease + 2e6);
        assertEq(pool.totalDistributed(), totalDistributedBeforeRelease - 2e6);
    }

    // =========================================================================
    // Authorization / ownership
    // =========================================================================

    function test_TransferOwnership_ToNonGovernance_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("Can only transfer to governance");
        pool.transferOwnership(user1);
    }

    function test_TransferOwnership_ToGovernance_Succeeds() public {
        vm.prank(admin);
        pool.transferOwnership(governance);
        assertEq(pool.owner(), governance);
    }

    function test_TransferOwnership_ByNonOwner_Reverts() public {
        vm.prank(user1);
        vm.expectRevert();
        pool.transferOwnership(governance);
    }

    function test_SetAuthorizedCaller_ZeroAddress_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("Invalid address");
        pool.setAuthorizedCaller(address(0), true);
    }

    function test_SetAuthorizedCaller_Success() public {
        vm.prank(admin);
        pool.setAuthorizedCaller(user1, true);
        assertTrue(pool.authorizedCallers(user1));
    }

    function test_DepositPool_ZeroAmount_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("Zero amount");
        pool.depositPool(0);
    }

    function test_WithdrawRemaining_ZeroAddress_Reverts() public {
        vm.prank(admin);
        vm.expectRevert("Invalid address");
        pool.withdrawRemaining(address(0), 1e6);
    }

    function test_WithdrawRemaining_ExceedsBalance_CapsAtBalance() public {
        uint256 amount = pool.poolBalance() + 1_000e6;
        uint256 expected = pool.poolBalance();

        vm.prank(admin);
        pool.withdrawRemaining(user1, amount);

        assertEq(pool.poolBalance(), 0);
        assertEq(crepToken.balanceOf(user1), expected);
    }

    function test_WithdrawRemaining_NothingToWithdraw_Reverts() public {
        _setPoolBalance(0);

        vm.prank(admin);
        vm.expectRevert("Nothing to withdraw");
        pool.withdrawRemaining(user1, 1e6);
    }

    function test_WithdrawRemaining_DoesNotTouchReservedFunds() public {
        vm.prank(authorizedCaller);
        pool.reserveReward(authorizedCaller, 5e6);

        vm.prank(admin);
        pool.withdrawRemaining(user1, type(uint256).max);

        assertEq(pool.poolBalance(), 0);
        assertEq(pool.reservedBalance(), 5e6);
        assertEq(pool.reservedRewards(authorizedCaller), 5e6);
        assertEq(crepToken.balanceOf(address(pool)), 5e6);
    }

    function test_RecoverSurplus_DirectTransferOnlyRecoversExtraBalance() public {
        vm.prank(admin);
        crepToken.mint(user1, 5e6);

        vm.startPrank(user1);
        crepToken.transfer(address(pool), 5e6);
        vm.stopPrank();

        uint256 trackedBalanceBefore = pool.poolBalance();
        uint256 actualBalanceBefore = crepToken.balanceOf(address(pool));
        uint256 userBalanceBefore = crepToken.balanceOf(user1);

        vm.prank(admin);
        uint256 recovered = pool.recoverSurplus(user1, type(uint256).max);

        assertEq(recovered, 5e6, "only the accidental surplus should be recoverable");
        assertEq(pool.poolBalance(), trackedBalanceBefore, "tracked pool balance must remain untouched");
        assertEq(
            crepToken.balanceOf(address(pool)),
            actualBalanceBefore - 5e6,
            "contract balance should decrease only by the recovered surplus"
        );
        assertEq(crepToken.balanceOf(user1) - userBalanceBefore, 5e6, "surplus should be returned to the recipient");
    }

    function test_RecoverSurplus_NoSurplusReverts() public {
        vm.prank(admin);
        vm.expectRevert("Nothing to recover");
        pool.recoverSurplus(user1, type(uint256).max);
    }

    function test_RecoverSurplus_DoesNotTouchReservedRewards() public {
        vm.prank(authorizedCaller);
        pool.reserveReward(authorizedCaller, 5e6);

        vm.prank(admin);
        vm.expectRevert("Nothing to recover");
        pool.recoverSurplus(user1, type(uint256).max);
    }

    function test_RewardVote_NotAuthorized_Reverts() public {
        vm.prank(user1);
        vm.expectRevert("Not authorized");
        pool.rewardVote(user1, 10e6);
    }

    // =========================================================================
    // Helpers
    // =========================================================================

    /// @dev Use vm.store to set totalDistributed (slot 2 after immutables)
    function _setTotalDistributed(uint256 value) internal {
        // ParticipationPool storage: crepToken (immutable), governance (immutable), totalDistributed, poolBalance, authorizedCallers
        // For non-upgradeable Ownable: slot 0 = _owner, slot 1 = totalDistributed, slot 2 = poolBalance
        // Actually Ownable stores owner at a specific slot. Let's find the right slot.
        // OZ5 Ownable: slot 0 = _owner (address)
        // ParticipationPool: immutables don't use storage. So:
        // slot 0 = Ownable._owner
        // slot 1 = totalDistributed
        // slot 2 = poolBalance
        // slot 3+ = authorizedCallers mapping
        vm.store(address(pool), bytes32(uint256(1)), bytes32(value));
        assertEq(pool.totalDistributed(), value);
    }

    /// @dev Set pool balance via vm.store
    function _setPoolBalance(uint256 value) internal {
        vm.store(address(pool), bytes32(uint256(2)), bytes32(value));
        assertEq(pool.poolBalance(), value);
    }
}
