// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import { Test, console } from "forge-std/Test.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

/// @title ParticipationPool Test Suite — Distribution-Based Halving
contract ParticipationPoolTest is Test {
    ParticipationPool public pool;
    CuryoReputation public crepToken;

    address public admin = address(1);
    address public governance = address(2);
    address public votingEngine = address(3);
    address public contentRegistry = address(4);
    address public user1 = address(5);
    address public user2 = address(6);
    address public unauthorized = address(7);

    uint256 public constant POOL_AMOUNT = 24_000_000 * 1e6; // 24M cREP
    uint256 public constant INITIAL_RATE_BPS = 9000; // 90%
    uint256 public constant MIN_RATE_BPS = 100; // 1%
    uint256 public constant INITIAL_TIER_AMOUNT = 1_500_000e6; // 1.5M cREP

    function setUp() public {
        vm.startPrank(admin);

        // Deploy cREP token
        crepToken = new CuryoReputation(admin, admin);
        crepToken.grantRole(crepToken.MINTER_ROLE(), admin);

        // Deploy ParticipationPool
        pool = new ParticipationPool(address(crepToken), governance);

        // Authorize callers
        pool.setAuthorizedCaller(votingEngine, true);
        pool.setAuthorizedCaller(contentRegistry, true);

        // Fund the pool
        crepToken.mint(admin, POOL_AMOUNT);
        crepToken.approve(address(pool), POOL_AMOUNT);
        pool.depositPool(POOL_AMOUNT);

        vm.stopPrank();
    }

    // --- Initialization Tests ---

    function test_Initialization() public view {
        assertEq(address(pool.crepToken()), address(crepToken));
        assertEq(pool.governance(), governance);
        assertEq(pool.totalDistributed(), 0);
        assertEq(pool.poolBalance(), POOL_AMOUNT);
        assertEq(pool.owner(), admin);
    }

    function test_AuthorizedCallers() public view {
        assertTrue(pool.authorizedCallers(votingEngine));
        assertTrue(pool.authorizedCallers(contentRegistry));
        assertFalse(pool.authorizedCallers(unauthorized));
    }

    function test_RevertInvalidConstructorArgs() public {
        vm.expectRevert("Invalid token");
        new ParticipationPool(address(0), governance);

        vm.expectRevert("Invalid governance");
        new ParticipationPool(address(crepToken), address(0));
    }

    // --- Rate Halving Schedule Tests (distribution-based) ---

    function test_InitialRate() public view {
        assertEq(pool.getCurrentRateBps(), INITIAL_RATE_BPS); // 9000 = 90%
    }

    function test_HalvingAtTier0Boundary() public {
        // After 1.5M cREP distributed: rate halves to 4500 (45%)
        _setTotalDistributed(1_500_000e6);
        assertEq(pool.getCurrentRateBps(), 4500);
    }

    function test_HalvingAtTier1Boundary() public {
        // Tier 0: 1.5M, tier 1: 3M more = 4.5M cumulative
        _setTotalDistributed(4_500_000e6);
        assertEq(pool.getCurrentRateBps(), 2250); // 22.5%
    }

    function test_HalvingAtTier2Boundary() public {
        // Tier 0: 1.5M, tier 1: 3M, tier 2: 6M = 10.5M cumulative
        _setTotalDistributed(10_500_000e6);
        assertEq(pool.getCurrentRateBps(), 1125); // 11.25%
    }

    function test_HalvingAtTier3Boundary() public {
        // 1.5M + 3M + 6M + 12M = 22.5M cumulative
        _setTotalDistributed(22_500_000e6);
        assertEq(pool.getCurrentRateBps(), 562); // 5.62%
    }

    function test_MinRateFloor() public {
        // 9000 / 2^7 = 70 < 100 → floor
        // Tier boundaries: 1.5M + 3M + 6M + 12M + 24M + 48M + 96M = 190.5M
        _setTotalDistributed(190_500_000e6);
        assertEq(pool.getCurrentRateBps(), MIN_RATE_BPS); // 100 = 1%
    }

    function test_RateStaysAtFloor() public {
        _setTotalDistributed(500_000_000e6); // Well past all tiers
        assertEq(pool.getCurrentRateBps(), MIN_RATE_BPS);
    }

    function test_RateBeforeFirstHalving() public {
        // Just under 1.5M — still tier 0
        _setTotalDistributed(1_499_999e6);
        assertEq(pool.getCurrentRateBps(), INITIAL_RATE_BPS);
    }

    function test_HalvingJustBeforeBoundary() public {
        // 1 token before tier 0 boundary — still full rate
        _setTotalDistributed(INITIAL_TIER_AMOUNT - 1);
        assertEq(pool.getCurrentRateBps(), INITIAL_RATE_BPS);

        // At boundary — halved
        _setTotalDistributed(INITIAL_TIER_AMOUNT);
        assertEq(pool.getCurrentRateBps(), 4500);
    }

    // --- Vote Reward Tests (proportional to stake) ---

    function test_RewardVote_Tier0_Stake100() public {
        uint256 stakeAmount = 100e6; // 100 cREP
        uint256 expectedReward = stakeAmount * INITIAL_RATE_BPS / 10000; // 90 cREP
        assertEq(expectedReward, 90e6);

        uint256 balanceBefore = crepToken.balanceOf(user1);

        _distributeStakeReward(votingEngine, user1, stakeAmount);

        assertEq(crepToken.balanceOf(user1), balanceBefore + expectedReward);
        assertEq(pool.totalDistributed(), expectedReward);
        assertEq(pool.poolBalance(), POOL_AMOUNT - expectedReward);
    }

    function test_RewardVote_Tier0_Stake1() public {
        uint256 stakeAmount = 1e6; // 1 cREP (min stake)
        uint256 expectedReward = stakeAmount * INITIAL_RATE_BPS / 10000; // 0.9 cREP = 900000
        assertEq(expectedReward, 900_000);

        _distributeStakeReward(votingEngine, user1, stakeAmount);

        assertEq(crepToken.balanceOf(user1), expectedReward);
        assertEq(pool.totalDistributed(), expectedReward);
    }

    function test_RewardVote_Tier0_Stake50() public {
        uint256 stakeAmount = 50e6;
        uint256 expectedReward = stakeAmount * INITIAL_RATE_BPS / 10000; // 45 cREP

        _distributeStakeReward(votingEngine, user1, stakeAmount);

        assertEq(crepToken.balanceOf(user1), expectedReward);
    }

    function test_RewardVote_Tier1_Stake100() public {
        _setTotalDistributed(INITIAL_TIER_AMOUNT); // Enter tier 1 (rate = 4500)

        uint256 stakeAmount = 100e6;
        uint256 expectedReward = stakeAmount * 4500 / 10000; // 45 cREP

        _distributeStakeReward(votingEngine, user1, stakeAmount);

        assertEq(crepToken.balanceOf(user1), expectedReward);
    }

    function test_RewardVote_AtFloor_Stake100() public {
        _setTotalDistributed(190_500_000e6); // At floor rate (100 BPS = 1%)

        uint256 stakeAmount = 100e6;
        uint256 expectedReward = stakeAmount * MIN_RATE_BPS / 10000; // 1 cREP

        _distributeStakeReward(votingEngine, user1, stakeAmount);

        assertEq(crepToken.balanceOf(user1), expectedReward);
        assertEq(expectedReward, 1e6);
    }

    function test_RewardVote_EmitsEvent() public {
        uint256 stakeAmount = 100e6;
        uint256 expectedReward = 90e6;

        vm.expectEmit(true, false, false, true);
        emit ParticipationPool.ParticipationReward(user1, expectedReward, expectedReward);

        _distributeStakeReward(votingEngine, user1, stakeAmount);
    }

    function test_RewardVote_OnlyAuthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert("Not authorized");
        pool.distributeReward(user1, 90e6);
    }

    // --- Authorized ContentRegistry reward tests ---

    function test_RewardSubmission_Tier0_Stake10() public {
        uint256 stakeAmount = 10e6; // MIN_SUBMITTER_STAKE = 10 cREP
        uint256 expectedReward = stakeAmount * INITIAL_RATE_BPS / 10000; // 9 cREP

        uint256 balanceBefore = crepToken.balanceOf(user1);

        _distributeStakeReward(contentRegistry, user1, stakeAmount);

        assertEq(crepToken.balanceOf(user1), balanceBefore + expectedReward);
        assertEq(expectedReward, 9e6);
        assertEq(pool.totalDistributed(), expectedReward);
        assertEq(pool.poolBalance(), POOL_AMOUNT - expectedReward);
    }

    function test_RewardSubmission_EmitsEvent() public {
        uint256 stakeAmount = 10e6;
        uint256 expectedReward = 9e6;

        vm.expectEmit(true, false, false, true);
        emit ParticipationPool.ParticipationReward(user1, expectedReward, expectedReward);

        _distributeStakeReward(contentRegistry, user1, stakeAmount);
    }

    function test_RewardSubmission_OnlyAuthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert("Not authorized");
        pool.distributeReward(user1, 9e6);
    }

    function test_RewardSubmission_AtFloor() public {
        _setTotalDistributed(190_500_000e6); // Floor rate

        uint256 stakeAmount = 10e6;
        uint256 expectedReward = stakeAmount * MIN_RATE_BPS / 10000; // 0.1 cREP = 100_000

        _distributeStakeReward(contentRegistry, user1, stakeAmount);

        assertEq(crepToken.balanceOf(user1), expectedReward);
        assertEq(expectedReward, 100_000);
    }

    // --- Pool Depletion Tests ---

    function test_PoolDepletion_CapsAtRemaining() public {
        // Set the tracked pool balance low without relying on a privileged sweep path.
        _setPoolBalance(50e6);
        assertEq(pool.poolBalance(), 50e6);

        // Stake 100, reward would be 90 cREP but only 50 left — cap at 50
        _distributeStakeReward(votingEngine, user1, 100e6);

        assertEq(crepToken.balanceOf(user1), 50e6);
        assertEq(pool.poolBalance(), 0);
        assertEq(pool.totalDistributed(), 50e6);
    }

    function test_PoolDepletion_ZeroRewardWhenEmpty() public {
        // Simulate an exhausted pool without relying on owner withdrawals.
        _setPoolBalance(0);
        assertEq(pool.poolBalance(), 0);

        uint256 balanceBefore = crepToken.balanceOf(user1);

        // Should silently do nothing
        _distributeStakeReward(votingEngine, user1, 100e6);

        assertEq(crepToken.balanceOf(user1), balanceBefore);
        // totalDistributed should NOT change when reward is 0
        assertEq(pool.totalDistributed(), 0);
    }

    function test_PoolDepletion_SubmitCapsAtRemaining() public {
        // Leave only 5 cREP tracked in the pool - submit reward (9 cREP) gets capped.
        _setPoolBalance(5e6);

        _distributeStakeReward(contentRegistry, user1, 10e6);

        assertEq(crepToken.balanceOf(user1), 5e6);
        assertEq(pool.poolBalance(), 0);
    }

    // --- Reward Always Below Stake ---

    function test_RewardAlwaysBelowStake() public pure {
        uint256 stakeAmount = 100e6;
        uint256 reward = stakeAmount * INITIAL_RATE_BPS / 10000;
        assertTrue(reward < stakeAmount, "Reward must be less than stake");
    }

    function test_RewardAlwaysBelowStake_AllTiers() public {
        // Tier boundaries in cREP distributed
        uint256[] memory tiers = new uint256[](5);
        tiers[0] = 0;
        tiers[1] = 1_500_000e6; // 1.5M
        tiers[2] = 4_500_000e6; // 4.5M
        tiers[3] = 10_500_000e6; // 10.5M
        tiers[4] = 22_500_000e6; // 22.5M

        uint256 stakeAmount = 100e6;

        for (uint256 i = 0; i < tiers.length; i++) {
            _setTotalDistributed(tiers[i]);
            uint256 rate = pool.getCurrentRateBps();
            uint256 reward = stakeAmount * rate / 10000;
            assertTrue(reward < stakeAmount, "Reward must be less than stake at every tier");
        }
    }

    // --- Distribution Accumulation ---

    function test_TotalDistributedAccumulatesRewardAmounts() public {
        // Two votes with stake 100 → each distributes 90 cREP
        _distributeStakeReward(votingEngine, user1, 100e6);
        _distributeStakeReward(votingEngine, user2, 100e6);

        assertEq(pool.totalDistributed(), 180e6); // 90 + 90 = 180 cREP
    }

    function test_TotalDistributedAccumulatesDifferentStakes() public {
        // Vote with stake 1 → distributes 0.9, vote with stake 100 → distributes 90
        _distributeStakeReward(votingEngine, user1, 1e6);
        _distributeStakeReward(votingEngine, user2, 100e6);

        assertEq(pool.totalDistributed(), 900_000 + 90e6);
    }

    // --- Zero Stake Edge Case ---

    function test_RewardVote_ZeroStake_NoReward() public {
        uint256 balBefore = crepToken.balanceOf(user1);

        _distributeStakeReward(votingEngine, user1, 0);

        assertEq(crepToken.balanceOf(user1), balBefore);
        assertEq(pool.totalDistributed(), 0);
    }

    // --- Admin Functions ---

    function test_SetAuthorizedCaller() public {
        address newCaller = address(10);
        assertFalse(pool.authorizedCallers(newCaller));

        vm.prank(admin);
        pool.setAuthorizedCaller(newCaller, true);
        assertTrue(pool.authorizedCallers(newCaller));

        vm.prank(admin);
        pool.setAuthorizedCaller(newCaller, false);
        assertFalse(pool.authorizedCallers(newCaller));
    }

    function test_SetAuthorizedCaller_OnlyOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, unauthorized));
        pool.setAuthorizedCaller(address(10), true);
    }

    function test_SetAuthorizedCaller_RevertZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert("Invalid address");
        pool.setAuthorizedCaller(address(0), true);
    }

    function test_SetAuthorizedCaller_EmitsEvent() public {
        vm.expectEmit(true, false, false, true);
        emit ParticipationPool.AuthorizedCallerUpdated(address(10), true);

        vm.prank(admin);
        pool.setAuthorizedCaller(address(10), true);
    }

    // --- Deposit Tests ---

    function test_DepositPool() public {
        uint256 depositAmount = 1_000_000e6;
        vm.startPrank(admin);
        crepToken.mint(admin, depositAmount);
        crepToken.approve(address(pool), depositAmount);

        uint256 poolBefore = pool.poolBalance();
        pool.depositPool(depositAmount);

        assertEq(pool.poolBalance(), poolBefore + depositAmount);
        vm.stopPrank();
    }

    function test_DepositPool_EmitsEvent() public {
        uint256 depositAmount = 500_000e6;
        vm.startPrank(admin);
        crepToken.mint(admin, depositAmount);
        crepToken.approve(address(pool), depositAmount);

        vm.expectEmit(false, false, false, true);
        emit ParticipationPool.PoolDeposit(depositAmount);

        pool.depositPool(depositAmount);
        vm.stopPrank();
    }

    function test_DepositPool_RevertZeroAmount() public {
        vm.expectRevert("Zero amount");
        pool.depositPool(0);
    }

    // --- Withdraw Tests ---

    function test_WithdrawRemaining() public {
        uint256 amount = 1_000_000e6;
        uint256 poolBefore = pool.poolBalance();
        uint256 recipientBefore = crepToken.balanceOf(admin);

        vm.expectEmit(true, false, false, true);
        emit ParticipationPool.PoolWithdrawal(admin, amount);

        vm.prank(admin);
        pool.withdrawRemaining(admin, amount);

        assertEq(pool.poolBalance(), poolBefore - amount);
        assertEq(crepToken.balanceOf(admin), recipientBefore + amount);
    }

    function test_WithdrawRemaining_FullBalance() public {
        uint256 fullBalance = pool.poolBalance();

        vm.prank(admin);
        pool.withdrawRemaining(admin, type(uint256).max);

        assertEq(pool.poolBalance(), 0);
        assertEq(crepToken.balanceOf(admin), fullBalance);
    }

    function test_WithdrawRemaining_OnlyOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, unauthorized));
        pool.withdrawRemaining(unauthorized, 1_000e6);
    }

    function test_WithdrawRemaining_RevertZeroAddress() public {
        vm.prank(admin);
        vm.expectRevert("Invalid address");
        pool.withdrawRemaining(address(0), 1_000e6);
    }

    function test_WithdrawRemaining_RevertNothingToWithdraw() public {
        _setPoolBalance(0);
        vm.prank(admin);
        vm.expectRevert("Nothing to withdraw");
        pool.withdrawRemaining(admin, 1e6);
    }

    function test_WithdrawRemaining_DoesNotTouchReservedBalance() public {
        vm.prank(votingEngine);
        pool.reserveReward(votingEngine, 5e6);

        uint256 contractBalanceBefore = crepToken.balanceOf(address(pool));
        uint256 reservedBefore = pool.reservedBalance();

        vm.prank(admin);
        pool.withdrawRemaining(admin, type(uint256).max);

        assertEq(pool.poolBalance(), 0, "pool balance should be fully withdrawn");
        assertEq(pool.reservedBalance(), reservedBefore, "reserved accounting must be unchanged");
        assertEq(pool.reservedRewards(votingEngine), 5e6, "beneficiary reservation must remain");
        assertEq(
            crepToken.balanceOf(address(pool)),
            contractBalanceBefore - (POOL_AMOUNT - 5e6),
            "contract should retain only reserved funds"
        );
    }

    // --- Ownership Tests ---

    function test_TransferOwnership_ToGovernance() public {
        vm.prank(admin);
        pool.transferOwnership(governance);
        assertEq(pool.owner(), governance);
    }

    function test_TransferOwnership_RevertNotGovernance() public {
        vm.prank(admin);
        vm.expectRevert("Can only transfer to governance");
        pool.transferOwnership(address(99));
    }

    function test_TransferOwnership_OnlyOwner() public {
        vm.prank(unauthorized);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, unauthorized));
        pool.transferOwnership(governance);
    }

    // --- Mixed Actions Test ---

    function test_MixedVotesAndSubmissions() public {
        // 3 votes (stake 100 each) + 2 submissions (stake 10 each)
        _distributeStakeReward(votingEngine, user1, 100e6);
        _distributeStakeReward(votingEngine, user1, 100e6);
        _distributeStakeReward(votingEngine, user2, 100e6);
        _distributeStakeReward(contentRegistry, user1, 10e6);
        _distributeStakeReward(contentRegistry, user2, 10e6);

        uint256 voteReward = 100e6 * INITIAL_RATE_BPS / 10000; // 90 cREP
        uint256 submitReward = 10e6 * INITIAL_RATE_BPS / 10000; // 9 cREP

        // user1: 2 votes (90 each) + 1 submission (9) = 189 cREP
        assertEq(crepToken.balanceOf(user1), voteReward * 2 + submitReward);
        // user2: 1 vote (90) + 1 submission (9) = 99 cREP
        assertEq(crepToken.balanceOf(user2), voteReward + submitReward);

        uint256 totalDistributed = voteReward * 3 + submitReward * 2;
        assertEq(pool.totalDistributed(), totalDistributed);
        assertEq(pool.poolBalance(), POOL_AMOUNT - totalDistributed);
    }

    // --- DistributeReward Tests ---

    function test_DistributeReward_TransfersPreComputedAmount() public {
        uint256 amount = 50e6;
        uint256 balBefore = crepToken.balanceOf(user1);

        vm.prank(votingEngine);
        uint256 paid = pool.distributeReward(user1, amount);

        assertEq(paid, amount);
        assertEq(crepToken.balanceOf(user1), balBefore + amount);
        assertEq(pool.totalDistributed(), amount);
    }

    function test_DistributeReward_CapsAtPoolBalance() public {
        _setPoolBalance(10e6);

        vm.prank(votingEngine);
        uint256 paid = pool.distributeReward(user1, 50e6);

        assertEq(paid, 10e6);
        assertEq(pool.poolBalance(), 0);
    }

    function test_DistributeReward_OnlyAuthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert("Not authorized");
        pool.distributeReward(user1, 100e6);
    }

    // --- Reentrancy Guard Tests (L-2) ---

    function test_RewardVote_FunctionalWithNonReentrant() public {
        _distributeStakeReward(votingEngine, user1, 100e6);
        assertEq(crepToken.balanceOf(user1), 90e6);
    }

    function test_RewardSubmission_FunctionalWithNonReentrant() public {
        _distributeStakeReward(contentRegistry, user1, 10e6);
        assertEq(crepToken.balanceOf(user1), 9e6);
    }

    function test_DistributeReward_FunctionalWithNonReentrant() public {
        vm.prank(votingEngine);
        uint256 paid = pool.distributeReward(user1, 25e6);
        assertEq(paid, 25e6);
    }

    function test_WithdrawRemaining_FunctionalWithNonReentrant() public {
        uint256 amount = 1_000e6;

        vm.prank(admin);
        pool.withdrawRemaining(admin, amount);
        assertEq(pool.poolBalance(), POOL_AMOUNT - amount);
    }

    // --- Helpers ---

    function _distributeStakeReward(address caller, address recipient, uint256 stakeAmount)
        internal
        returns (uint256 paidAmount)
    {
        uint256 reward = stakeAmount * pool.getCurrentRateBps() / 10000;
        vm.prank(caller);
        return pool.distributeReward(recipient, reward);
    }

    /// @dev Directly set totalDistributed for gas-efficient tier testing
    function _setTotalDistributed(uint256 n) internal {
        // Storage layout: Ownable._owner = slot 0, totalDistributed = slot 1, poolBalance = slot 2, reservedBalance = slot 3
        vm.store(address(pool), bytes32(uint256(1)), bytes32(n));
        assertEq(pool.totalDistributed(), n);
    }

    function _setPoolBalance(uint256 n) internal {
        vm.store(address(pool), bytes32(uint256(2)), bytes32(n));
        assertEq(pool.poolBalance(), n);
    }
}
