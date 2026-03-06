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

        uint256 reserveAmount = 1_000_000e6;
        crepToken.mint(owner, reserveAmount);
        crepToken.approve(address(votingEngine), reserveAmount);
        votingEngine.fundConsensusReserve(reserveAmount);

        pool = new ParticipationPool(address(crepToken), owner);
        uint256 poolFund = 34_000_000e6;
        crepToken.mint(owner, poolFund);
        crepToken.approve(address(pool), poolFund);
        pool.depositPool(poolFund);
        pool.setAuthorizedCaller(address(votingEngine), true);
        votingEngine.setParticipationPool(address(pool));

        crepToken.mint(submitter, 100_000e6);
        crepToken.mint(voter1, 100_000e6);

        vm.stopPrank();
    }

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

    function _voteOnDay(address voter, uint256 dayIndex) internal {
        uint256 contentId = _submitContentN(dayIndex);
        _commitVote(voter, contentId, true, STAKE);
    }

    function test_streakIncrementsOnConsecutiveDays() public {
        uint256 t0 = 100_000;
        vm.warp(t0);

        _voteOnDay(voter1, 1);
        assertEq(votingEngine.voterCurrentStreak(voter1), 1);

        vm.warp(t0 + 1 days);
        _voteOnDay(voter1, 2);
        assertEq(votingEngine.voterCurrentStreak(voter1), 2);

        vm.warp(t0 + 2 days);
        _voteOnDay(voter1, 3);
        assertEq(votingEngine.voterCurrentStreak(voter1), 3);
    }

    function test_streakResetsOnGap() public {
        _voteOnDay(voter1, 1);
        assertEq(votingEngine.voterCurrentStreak(voter1), 1);

        vm.warp(block.timestamp + 2 days);
        _voteOnDay(voter1, 2);
        assertEq(votingEngine.voterCurrentStreak(voter1), 1);
        assertEq(votingEngine.voterLastMilestoneDay(voter1), 0);
    }

    function test_streakNoDuplicateSameDay() public {
        _submitContentN(1);
        _submitContentN(2);

        _commitVote(voter1, 1, true, STAKE);
        assertEq(votingEngine.voterCurrentStreak(voter1), 1);

        _commitVote(voter1, 2, true, STAKE);
        assertEq(votingEngine.voterCurrentStreak(voter1), 1);
    }

    function test_claimStreakBonusDisabledBeforeMilestone() public {
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.StreakBonusDisabled.selector);
        votingEngine.claimStreakBonus(0);
    }

    function test_claimStreakBonusDisabledAfterSevenDayCommitStreak() public {
        for (uint256 i = 1; i <= 7; i++) {
            if (i > 1) vm.warp(block.timestamp + 1 days);
            _voteOnDay(voter1, i);
        }

        assertEq(votingEngine.voterCurrentStreak(voter1), 7);
        uint256 balBefore = crepToken.balanceOf(voter1);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.StreakBonusDisabled.selector);
        votingEngine.claimStreakBonus(0);

        assertEq(crepToken.balanceOf(voter1), balBefore);
        assertEq(votingEngine.voterLastMilestoneDay(voter1), 0);
    }

    function test_storageLayoutPreserved() public {
        _voteOnDay(voter1, 1);
        assertEq(votingEngine.voterCurrentStreak(voter1), 1);

        vm.startPrank(owner);
        RoundVotingEngine newImpl = new RoundVotingEngine();
        votingEngine.upgradeToAndCall(address(newImpl), "");
        vm.stopPrank();

        assertEq(votingEngine.voterCurrentStreak(voter1), 1);
        assertEq(votingEngine.voterLastMilestoneDay(voter1), 0);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.StreakBonusDisabled.selector);
        votingEngine.claimStreakBonus(0);

        vm.warp(block.timestamp + 1 days);
        _voteOnDay(voter1, 2);
        assertEq(votingEngine.voterCurrentStreak(voter1), 2);
    }

    function test_voterStreakStateVariables() public {
        _voteOnDay(voter1, 1);

        assertEq(votingEngine.voterCurrentStreak(voter1), 1);
        assertEq(votingEngine.voterLastActiveDay(voter1), block.timestamp / 86400);
        assertEq(votingEngine.voterLastMilestoneDay(voter1), 0);
    }
}
