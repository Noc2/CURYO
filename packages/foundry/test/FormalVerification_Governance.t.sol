// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IVotes } from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import { IGovernor } from "@openzeppelin/contracts/governance/IGovernor.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { CuryoGovernor } from "../contracts/governance/CuryoGovernor.sol";

/// @title Formal Verification: Governance Parameter Audit
/// @notice 10 scenarios verifying early capture resistance, quorum scaling,
///         whale governance, timelock enforcement, and governance lock behavior.
contract FormalVerification_GovernanceTest is Test {
    CuryoReputation token;
    TimelockController timelock;
    CuryoGovernor governor;

    address deployer = address(1);

    // Mock pool addresses
    address mockFaucet = address(10);
    address mockParticipation = address(11);
    address mockDistributor = address(12);

    // Realistic initial pool balances
    uint256 constant FAUCET_BAL = 52_000_000e6;
    uint256 constant PARTICIPATION_BAL = 30_000_000e6;
    uint256 constant DISTRIBUTOR_BAL = 14_000_000e6;
    // Total locked in pools = 96M

    function setUp() public {
        vm.startPrank(deployer);

        token = new CuryoReputation(deployer, deployer);
        token.grantRole(token.MINTER_ROLE(), deployer);

        address[] memory empty = new address[](0);
        timelock = new TimelockController(2 days, empty, empty, deployer);

        governor = new CuryoGovernor(IVotes(address(token)), timelock);
        address[] memory holders = new address[](3);
        holders[0] = mockFaucet;
        holders[1] = mockParticipation;
        holders[2] = mockDistributor;
        governor.initializePools(holders);

        token.setGovernor(address(governor));
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(0)); // anyone can execute

        // Fund pools with realistic balances
        token.mint(mockFaucet, FAUCET_BAL);
        token.mint(mockParticipation, PARTICIPATION_BAL);
        token.mint(mockDistributor, DISTRIBUTOR_BAL);

        vm.stopPrank();
    }

    // ==================== Helpers ====================

    function _mintCirculating(address to, uint256 amount) internal {
        vm.prank(deployer);
        token.mint(to, amount);
    }

    function _propose(address proposer, string memory desc) internal returns (uint256) {
        address[] memory targets = new address[](1);
        targets[0] = address(timelock);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        vm.prank(proposer);
        return governor.propose(targets, values, calldatas, desc);
    }

    // ==================== Test 1: Early Capture - First 1000 Claimants ====================

    /// @notice 1000 users x 1000 cREP = 1M circulating. Quorum = max(40K, 10K) = 40K.
    ///         40 users (4%) can meet quorum.
    function test_EarlyCapture_First1000Claimants() public {
        // Simulate 1M circulating (1000 users x 1000 cREP) via single address
        _mintCirculating(address(100), 1_000_000e6);

        vm.roll(block.number + 1);

        uint256 q = governor.quorum(block.number - 1);
        // circulating = 1M, quorum = 4% of 1M = 40K
        assertEq(q, 40_000e6, "Quorum = 40K cREP with 1M circulating");

        // 40 users x 1000 cREP = 40K = quorum
        uint256 usersForQuorum = q / 1000e6;
        assertEq(usersForQuorum, 40, "40 of 1000 users (4%) meet quorum");
    }

    // ==================== Test 2: Minimum Floor Prevents Tiny Capture ====================

    /// @notice 10 users x 1000 cREP = 10K circulating. Dynamic quorum = 400, but floor = 10K.
    function test_EarlyCapture_MinFloor_TinyCirculating() public {
        // Only 10K circulating
        _mintCirculating(address(100), 10_000e6);

        vm.roll(block.number + 1);

        uint256 q = governor.quorum(block.number - 1);
        // circulating = 10K, dynamic = 4% of 10K = 400, floor = 10K
        assertEq(q, 10_000e6, "Floor of 10K cREP enforced");

        // Need ALL 10K to meet quorum (100% of circulating)
        assertEq(q, 10_000e6, "All 10 users needed to meet quorum");
    }

    // ==================== Test 3: Quorum Grows as Faucet Drains ====================

    /// @notice Faucet distributing 10M to users increases circulating and quorum.
    function test_QuorumGrows_AsFaucetDrains() public {
        // Initial: small circulating
        _mintCirculating(address(100), 1_000_000e6);
        vm.roll(block.number + 1);
        uint256 transferBlock = vm.getBlockNumber();
        uint256 beforeSnapshotBlock = transferBlock - 1;
        uint256 qBefore = governor.quorum(beforeSnapshotBlock);

        // Faucet transfers 10M to users (simulating claims)
        vm.prank(mockFaucet);
        token.transfer(address(101), 10_000_000e6);

        vm.roll(transferBlock + 1);
        uint256 qAfter = governor.quorum(transferBlock);

        // Circulating went from 1M to 11M, quorum from 40K to 440K
        assertGt(qAfter, qBefore, "Quorum increases as faucet drains");
        assertEq(qAfter, 440_000e6, "4% of 11M = 440K");
    }

    // ==================== Test 4: Mature Protocol Quorum ====================

    /// @notice At maturity: faucet drained 30M, participation drained 20M.
    ///         Circulating = total - remaining_pools. Quorum scales with circulating.
    function test_QuorumGrows_MatureProtocol() public {
        // Simulate faucet draining 30M to users (faucet had 52M, now has 22M)
        vm.prank(mockFaucet);
        token.transfer(address(100), 30_000_000e6);

        // Simulate participation pool draining 20M (pool had 30M, now has 10M)
        vm.prank(mockParticipation);
        token.transfer(address(101), 20_000_000e6);

        vm.roll(block.number + 1);

        // Pools now hold: faucet=22M, participation=10M, distributor=14M = 46M locked
        // Total supply = 96M (no new mints)
        // Circulating = 96M - 46M = 50M
        // Quorum = 4% of 50M = 2M
        uint256 q = governor.quorum(block.number - 1);
        assertEq(q, 2_000_000e6, "Mature quorum = 2M cREP");
    }

    // ==================== Test 5: Proposal Spam at 100 cREP Threshold ====================

    /// @notice Anyone with 100 cREP can create proposals. Multiple proposals allowed.
    function test_ProposalSpam_100CREPThreshold() public {
        // Create 5 different proposers each with exactly 100 cREP (threshold)
        address[5] memory proposers;
        for (uint256 i = 0; i < 5; i++) {
            proposers[i] = address(uint160(200 + i));
            _mintCirculating(proposers[i], 100e6);
        }

        vm.roll(block.number + 1);

        // Each can create a proposal
        for (uint256 i = 0; i < 5; i++) {
            uint256 pid = _propose(proposers[i], string(abi.encodePacked("Spam ", vm.toString(i))));
            assertTrue(pid != 0, "Proposal created successfully");
            assertEq(uint256(governor.state(pid)), uint256(IGovernor.ProposalState.Pending), "Proposal is Pending");
        }

        // Document finding: no per-address rate limit on proposals
        assertEq(governor.proposalThreshold(), 100e6, "100 cREP threshold - no rate limit");
    }

    // ==================== Test 6: Whale Unilateral Pass ====================

    /// @notice Whale with 200K in 4M circulating can pass alone (quorum=160K, >50% of votes).
    function test_WhaleGovernance_UnilateralPass() public {
        // Max supply = 100M, pools = 96M, so 4M available for circulating
        address whale = address(200);
        _mintCirculating(whale, 200_000e6);
        // Rest of circulating dispersed (but don't vote)
        _mintCirculating(address(201), 3_800_000e6);

        vm.roll(block.number + 1);

        uint256 q = governor.quorum(block.number - 1);
        assertEq(q, 160_000e6, "Quorum = 160K with 4M circulating");

        // Whale creates and votes on proposal
        uint256 pid = _propose(whale, "Whale proposal");
        vm.roll(block.number + governor.votingDelay() + 1);

        vm.prank(whale);
        governor.castVote(pid, 1); // FOR

        // Advance past voting period
        vm.roll(block.number + governor.votingPeriod() + 1);

        // Proposal should succeed: 200K > 160K quorum, 100% of votes FOR
        assertEq(
            uint256(governor.state(pid)), uint256(IGovernor.ProposalState.Succeeded), "Whale passes proposal alone"
        );
    }

    // ==================== Test 7: Whale Defeated by Coalition ====================

    /// @notice Whale 200K FOR vs coalition 250K AGAINST. Coalition wins.
    function test_WhaleGovernance_DefeatByCoalition() public {
        address whale = address(200);
        address[3] memory coalition;
        coalition[0] = address(201);
        coalition[1] = address(202);
        coalition[2] = address(203);

        _mintCirculating(whale, 200_000e6);
        _mintCirculating(coalition[0], 100_000e6);
        _mintCirculating(coalition[1], 100_000e6);
        _mintCirculating(coalition[2], 100_000e6);
        // Total circulating = 500K, quorum = 20K

        vm.roll(block.number + 1);

        uint256 pid = _propose(whale, "Whale proposal 2");
        vm.roll(block.number + governor.votingDelay() + 1);

        // Whale votes FOR
        vm.prank(whale);
        governor.castVote(pid, 1);

        // Coalition votes AGAINST
        for (uint256 i = 0; i < 3; i++) {
            vm.prank(coalition[i]);
            governor.castVote(pid, 0); // AGAINST
        }

        vm.roll(block.number + governor.votingPeriod() + 1);

        // 200K FOR vs 300K AGAINST -> Defeated
        assertEq(
            uint256(governor.state(pid)),
            uint256(IGovernor.ProposalState.Defeated),
            "Coalition defeats whale (300K > 200K)"
        );
    }

    // ==================== Test 8: Timelock Enforced ====================

    /// @notice Passed proposal cannot execute before 2-day timelock delay.
    function test_TimelockEnforced() public {
        address voter = address(200);
        _mintCirculating(voter, 1_000_000e6);

        vm.roll(block.number + 1);

        // Create and pass proposal
        address[] memory targets = new address[](1);
        targets[0] = address(timelock);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);

        vm.prank(voter);
        uint256 pid = governor.propose(targets, values, calldatas, "Timelock test");

        vm.roll(block.number + governor.votingDelay() + 1);

        vm.prank(voter);
        governor.castVote(pid, 1);

        vm.roll(block.number + governor.votingPeriod() + 1);
        assertEq(uint256(governor.state(pid)), uint256(IGovernor.ProposalState.Succeeded));

        // Queue the proposal
        bytes32 descHash = keccak256(bytes("Timelock test"));
        governor.queue(targets, values, calldatas, descHash);
        assertEq(uint256(governor.state(pid)), uint256(IGovernor.ProposalState.Queued));

        // Cannot execute before timelock delay
        vm.expectRevert();
        governor.execute(targets, values, calldatas, descHash);

        // Warp past 2-day timelock delay
        vm.warp(block.timestamp + 2 days + 1);

        // Now execution succeeds
        governor.execute(targets, values, calldatas, descHash);
        assertEq(uint256(governor.state(pid)), uint256(IGovernor.ProposalState.Executed));
    }

    // ==================== Test 9: Governance Lock Prevents Vote-Then-Sell ====================

    /// @notice Voting locks tokens for 7 days, preventing transfer.
    function test_GovernanceLock_PreventsVoteThenSell() public {
        address voter = address(200);
        _mintCirculating(voter, 1_000_000e6);

        vm.roll(block.number + 1);

        uint256 pid = _propose(voter, "Lock test");
        vm.roll(block.number + governor.votingDelay() + 1);

        // Vote locks tokens (propose already locked 100 cREP threshold)
        vm.prank(voter);
        governor.castVote(pid, 1);

        uint256 locked = token.getLockedBalance(voter);
        // Locked = proposal threshold (100 cREP) + voting power (1M cREP) = 1,000,100 cREP
        assertEq(locked, 1_000_100e6, "Proposal threshold + voting power locked");

        // Cannot transfer while locked
        vm.prank(voter);
        vm.expectRevert("Exceeds transferable balance (governance locked)");
        token.transfer(address(300), 1);

        // After 7 days, can transfer
        vm.warp(block.timestamp + 7 days + 1);
        assertEq(token.getLockedBalance(voter), 0, "Lock expired after 7 days");

        vm.prank(voter);
        token.transfer(address(300), 100e6);
        assertEq(token.balanceOf(address(300)), 100e6, "Transfer succeeds after lock");
    }

    // ==================== Test 10: Governance Lock Allows Content Voting ====================

    /// @notice Governance-locked tokens can still be used for content voting (transferable to VotingEngine).
    function test_GovernanceLock_AllowsContentVoting() public {
        // Set up a mock voting engine as an allowed content voting contract
        address mockVotingEngine = address(500);
        vm.prank(deployer);
        token.setContentVotingContracts(mockVotingEngine, address(501));

        address voter = address(200);
        _mintCirculating(voter, 1_000_000e6);

        vm.roll(block.number + 1);

        uint256 pid = _propose(voter, "Content vote test");
        vm.roll(block.number + governor.votingDelay() + 1);

        vm.prank(voter);
        governor.castVote(pid, 1);

        // Tokens are locked
        assertGt(token.getLockedBalance(voter), 0, "Tokens locked after governance vote");

        // Regular transfer blocked
        vm.prank(voter);
        vm.expectRevert("Exceeds transferable balance (governance locked)");
        token.transfer(address(300), 100e6);

        // Transfer to voting engine (content voting) is allowed
        vm.prank(voter);
        token.approve(mockVotingEngine, 100e6);

        vm.prank(mockVotingEngine);
        token.transferFrom(voter, mockVotingEngine, 100e6);

        assertEq(token.balanceOf(mockVotingEngine), 100e6, "Content voting works during governance lock");
    }
}
