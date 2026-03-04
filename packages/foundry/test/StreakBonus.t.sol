// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";

contract StreakBonusTest is Test {
    CuryoReputation public crepToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    RoundRewardDistributor public rewardDistributor;
    ParticipationPool public pool;

    address public owner = address(1);
    address public submitter = address(2);
    address public voter1 = address(3);
    address public treasury = address(100);

    uint256 public constant STAKE = 5e6;
    uint256 public constant EPOCH_DURATION = 10 minutes;

    function setUp() public {
        vm.warp(1000);
        vm.roll(100);

        vm.startPrank(owner);

        crepToken = new CuryoReputation(owner, owner);
        crepToken.grantRole(crepToken.MINTER_ROLE(), owner);

        ContentRegistry registryImpl = new ContentRegistry();
        RoundVotingEngine engineImpl = new RoundVotingEngine();
        RoundRewardDistributor distImpl = new RoundRewardDistributor();

        registry = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImpl),
                    abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(crepToken)))
                )
            )
        );

        votingEngine = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engineImpl),
                    abi.encodeCall(RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry)))
                )
            )
        );

        rewardDistributor = RoundRewardDistributor(
            address(
                new ERC1967Proxy(
                    address(distImpl),
                    abi.encodeCall(
                        RoundRewardDistributor.initialize,
                        (owner, address(crepToken), address(votingEngine), address(registry))
                    )
                )
            )
        );

        registry.setVotingEngine(address(votingEngine));
        votingEngine.setRewardDistributor(address(rewardDistributor));
        votingEngine.setTreasury(treasury);
        votingEngine.setConfig(EPOCH_DURATION, 7 days, 2, 200);

        // Fund consensus reserve
        uint256 reserveAmount = 1_000_000e6;
        crepToken.mint(owner, reserveAmount);
        crepToken.approve(address(votingEngine), reserveAmount);
        votingEngine.fundConsensusReserve(reserveAmount);

        // Deploy and wire participation pool
        pool = new ParticipationPool(address(crepToken), owner);
        uint256 poolFund = 34_000_000e6;
        crepToken.mint(owner, poolFund);
        crepToken.approve(address(pool), poolFund);
        pool.depositPool(poolFund);
        pool.setAuthorizedCaller(address(votingEngine), true);
        votingEngine.setParticipationPool(address(pool));

        // Mint cREP to test users
        crepToken.mint(submitter, 100_000e6);
        crepToken.mint(voter1, 100_000e6);

        vm.stopPrank();
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _submitContentN(uint256 n) internal returns (uint256) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        string memory url = string(abi.encodePacked("https://example.com/", vm.toString(n)));
        registry.submitContent(url, "test goal", "test", 0);
        vm.stopPrank();
        return n;
    }

    function _commitVote(address voter, uint256 contentId, bool isUp, uint256 stakeAmount) internal {
        bytes32 salt = keccak256(abi.encodePacked(voter, contentId, isUp, block.timestamp));
        bytes32 ch = keccak256(abi.encodePacked(isUp, salt, contentId));
        bytes memory ct = abi.encodePacked(uint8(isUp ? 1 : 0), salt, contentId);

        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), stakeAmount);
        votingEngine.commitVote(contentId, ch, ct, stakeAmount, address(0));
        vm.stopPrank();
    }

    /// @dev Vote on a unique content each day to avoid 24h cooldown per content
    function _voteOnDay(address voter, uint256 dayIndex) internal {
        uint256 contentId = _submitContentN(dayIndex);
        _commitVote(voter, contentId, true, STAKE);
    }

    // =========================================================================
    // TESTS
    // =========================================================================

    function test_streakIncrementsOnConsecutiveDays() public {
        uint256 t0 = 100_000; // Start at a clean timestamp (day 1)
        vm.warp(t0);

        // Day 1
        _voteOnDay(voter1, 1);
        assertEq(votingEngine.voterCurrentStreak(voter1), 1);

        // Day 2
        vm.warp(t0 + 1 days);
        _voteOnDay(voter1, 2);
        assertEq(votingEngine.voterCurrentStreak(voter1), 2);

        // Day 3
        vm.warp(t0 + 2 days);
        _voteOnDay(voter1, 3);
        assertEq(votingEngine.voterCurrentStreak(voter1), 3);
    }

    function test_streakResetsOnGap() public {
        // Day 1
        _voteOnDay(voter1, 1);
        assertEq(votingEngine.voterCurrentStreak(voter1), 1);

        // Skip a day (2 days later)
        vm.warp(block.timestamp + 2 days);
        _voteOnDay(voter1, 2);
        assertEq(votingEngine.voterCurrentStreak(voter1), 1);
    }

    function test_streakNoDuplicateSameDay() public {
        // Two votes same day on different content
        _submitContentN(1);
        _submitContentN(2);

        _commitVote(voter1, 1, true, STAKE);
        assertEq(votingEngine.voterCurrentStreak(voter1), 1);

        _commitVote(voter1, 2, true, STAKE);
        assertEq(votingEngine.voterCurrentStreak(voter1), 1);
    }

    function test_claimStreakBonus7Day() public {
        // Build 7-day streak
        for (uint256 i = 1; i <= 7; i++) {
            if (i > 1) vm.warp(block.timestamp + 1 days);
            _voteOnDay(voter1, i);
        }
        assertEq(votingEngine.voterCurrentStreak(voter1), 7);

        uint256 balBefore = crepToken.balanceOf(voter1);

        vm.prank(voter1);
        votingEngine.claimStreakBonus(0); // milestone index 0 = 7-day

        uint256 balAfter = crepToken.balanceOf(voter1);
        // Base 10 cREP * 9000/9000 = 10 cREP at tier 0
        assertEq(balAfter - balBefore, 10e6);
    }

    function test_claimStreakBonusAppliesHalving() public {
        // Drain enough from pool to reach tier 1 (after 2M distributed, rate = 4500 BPS)
        vm.startPrank(owner);
        // Distribute 2M to push to tier 1
        pool.setAuthorizedCaller(owner, true);
        pool.distributeReward(owner, 2_000_000e6);
        vm.stopPrank();

        // Build 7-day streak
        for (uint256 i = 1; i <= 7; i++) {
            if (i > 1) vm.warp(block.timestamp + 1 days);
            _voteOnDay(voter1, i);
        }

        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        votingEngine.claimStreakBonus(0);
        uint256 balAfter = crepToken.balanceOf(voter1);

        // Base 10 cREP * 4500/9000 = 5 cREP
        assertEq(balAfter - balBefore, 5e6);
    }

    function test_cannotDoubleClaimMilestone() public {
        // Build 7-day streak
        for (uint256 i = 1; i <= 7; i++) {
            if (i > 1) vm.warp(block.timestamp + 1 days);
            _voteOnDay(voter1, i);
        }

        vm.prank(voter1);
        votingEngine.claimStreakBonus(0);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.MilestoneAlreadyClaimed.selector);
        votingEngine.claimStreakBonus(0);
    }

    function test_milestoneResetsOnStreakBreak() public {
        // Build 7-day streak and claim
        for (uint256 i = 1; i <= 7; i++) {
            if (i > 1) vm.warp(block.timestamp + 1 days);
            _voteOnDay(voter1, i);
        }
        vm.prank(voter1);
        votingEngine.claimStreakBonus(0);

        // Break streak (skip 2 days)
        vm.warp(block.timestamp + 2 days);
        uint256 nextContent = 8;

        // Rebuild 7-day streak
        for (uint256 i = 0; i < 7; i++) {
            if (i > 0) vm.warp(block.timestamp + 1 days);
            _voteOnDay(voter1, nextContent + i);
        }
        assertEq(votingEngine.voterCurrentStreak(voter1), 7);

        // Should be able to claim again since milestone was reset
        vm.prank(voter1);
        votingEngine.claimStreakBonus(0);

        (,, uint256 lastMilestoneDay) = votingEngine.getVoterStreakInfo(voter1);
        assertEq(lastMilestoneDay, 7);
    }

    function test_cannotClaimWithShortStreak() public {
        // Build 5-day streak
        for (uint256 i = 1; i <= 5; i++) {
            if (i > 1) vm.warp(block.timestamp + 1 days);
            _voteOnDay(voter1, i);
        }
        assertEq(votingEngine.voterCurrentStreak(voter1), 5);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.StreakTooShort.selector);
        votingEngine.claimStreakBonus(0); // 7-day milestone
    }

    function test_claimMultipleMilestones() public {
        // Build 30-day streak
        for (uint256 i = 1; i <= 30; i++) {
            if (i > 1) vm.warp(block.timestamp + 1 days);
            _voteOnDay(voter1, i);
        }
        assertEq(votingEngine.voterCurrentStreak(voter1), 30);

        uint256 balBefore = crepToken.balanceOf(voter1);

        // Claim 7-day milestone
        vm.prank(voter1);
        votingEngine.claimStreakBonus(0);

        // Claim 30-day milestone
        vm.prank(voter1);
        votingEngine.claimStreakBonus(1);

        uint256 balAfter = crepToken.balanceOf(voter1);
        // 10 + 50 = 60 cREP at full rate
        assertEq(balAfter - balBefore, 60e6);
    }

    function test_storageLayoutPreserved() public {
        // Vote to create some state
        _voteOnDay(voter1, 1);
        assertEq(votingEngine.voterCurrentStreak(voter1), 1);

        // Upgrade to a new implementation
        vm.startPrank(owner);
        RoundVotingEngine newImpl = new RoundVotingEngine();
        votingEngine.upgradeToAndCall(address(newImpl), "");
        vm.stopPrank();

        // Verify state survived the upgrade
        assertEq(votingEngine.voterCurrentStreak(voter1), 1);

        // Verify existing functionality still works
        vm.warp(block.timestamp + 1 days);
        _voteOnDay(voter1, 2);
        assertEq(votingEngine.voterCurrentStreak(voter1), 2);
    }

    function test_getVoterStreakInfo() public {
        _voteOnDay(voter1, 1);

        (uint256 currentStreak, uint256 lastActiveDay, uint256 lastMilestoneDay) =
            votingEngine.getVoterStreakInfo(voter1);
        assertEq(currentStreak, 1);
        assertEq(lastActiveDay, block.timestamp / 86400);
        assertEq(lastMilestoneDay, 0);
    }

    function test_getStreakMilestone() public view {
        (uint256 days_, uint256 baseBonus) = votingEngine.getStreakMilestone(0);
        assertEq(days_, 7);
        assertEq(baseBonus, 10e6);

        (days_, baseBonus) = votingEngine.getStreakMilestone(1);
        assertEq(days_, 30);
        assertEq(baseBonus, 50e6);

        (days_, baseBonus) = votingEngine.getStreakMilestone(2);
        assertEq(days_, 90);
        assertEq(baseBonus, 200e6);
    }

    function test_getStreakMilestoneCount() public view {
        assertEq(votingEngine.getStreakMilestoneCount(), 3);
    }

    function test_invalidMilestoneIndexReverts() public {
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.InvalidMilestoneIndex.selector);
        votingEngine.claimStreakBonus(3);
    }
}
