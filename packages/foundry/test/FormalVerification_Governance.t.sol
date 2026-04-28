// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IVotes } from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import { IGovernor } from "@openzeppelin/contracts/governance/IGovernor.sol";
import { HumanReputation } from "../contracts/HumanReputation.sol";
import { CuryoGovernor } from "../contracts/governance/CuryoGovernor.sol";

/// @title Formal Verification: Governance Parameter Audit
/// @notice 10 scenarios verifying early capture resistance, quorum scaling,
///         whale governance, timelock enforcement, and governance lock behavior.
contract FormalVerification_GovernanceTest is Test {
    HumanReputation token;
    TimelockController timelock;
    CuryoGovernor governor;

    address deployer = address(1);

    // Mock pool addresses
    address mockFaucet = address(10);
    address mockBootstrapPool = address(11);
    address mockConsensusReserve = address(12);
    address mockTreasury = address(13);

    // Realistic launch balances excluded from dynamic quorum.
    uint256 constant FAUCET_BAL = 52_000_000e6;
    uint256 constant BOOTSTRAP_POOL_BAL = 12_000_000e6;
    uint256 constant CONSENSUS_RESERVE_BAL = 4_000_000e6;
    uint256 constant TREASURY_BAL = 32_000_000e6;
    // Total excluded at launch = 100M

    function setUp() public {
        vm.startPrank(deployer);

        token = new HumanReputation(deployer, deployer);
        token.grantRole(token.MINTER_ROLE(), deployer);

        address[] memory empty = new address[](0);
        timelock = new TimelockController(2 days, empty, empty, deployer);

        governor = new CuryoGovernor(IVotes(address(token)), timelock);
        address[] memory holders = new address[](4);
        holders[0] = mockFaucet;
        holders[1] = mockBootstrapPool;
        holders[2] = mockConsensusReserve;
        holders[3] = mockTreasury;
        governor.initializePools(holders);

        token.setGovernor(address(governor));
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.EXECUTOR_ROLE(), address(0)); // anyone can execute

        // Fund excluded launch holders with realistic balances.
        token.mint(mockFaucet, FAUCET_BAL);
        token.mint(mockBootstrapPool, BOOTSTRAP_POOL_BAL);
        token.mint(mockConsensusReserve, CONSENSUS_RESERVE_BAL);
        token.mint(mockTreasury, TREASURY_BAL);

        vm.stopPrank();
    }

    // ==================== Helpers ====================

    function _mintCirculating(address to, uint256 amount) internal {
        vm.prank(mockFaucet);
        token.transfer(to, amount);
    }

    function _propose(address proposer, string memory desc) internal returns (uint256) {
        address[] memory targets = new address[](1);
        targets[0] = address(timelock);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        vm.prank(proposer);
        return governor.propose(targets, values, calldatas, desc);
    }

    // ==================== Test 1: Bootstrap Quorum Floor Dominates Early ====================

    /// @notice 1000 users x 1000 HREP = 1M circulating. Dynamic quorum is 40K, but the 1M floor dominates.
    function test_EarlyCapture_First1000Claimants() public {
        // Simulate 1M circulating (1000 users x 1000 HREP) via single address
        _mintCirculating(address(100), 1_000_000e6);

        vm.roll(block.number + 1);

        uint256 q = governor.quorum(block.number - 1);
        // circulating = 1M, dynamic quorum = 40K, bootstrap floor = 1M
        assertEq(q, 1_000_000e6, "Bootstrap floor holds quorum at 1M HREP with 1M circulating");

        // 1000 users x 1000 HREP = 1M = quorum
        uint256 usersForQuorum = q / 1000e6;
        assertEq(usersForQuorum, 1000, "A 1M bootstrap quorum needs broad early participation");
    }

    // ==================== Test 2: Minimum Floor Prevents Tiny Capture ====================

    /// @notice 10 users x 1000 HREP = 10K circulating. Dynamic quorum = 400, but floor = 1M.
    function test_EarlyCapture_MinFloor_TinyCirculating() public {
        // Only 10K circulating
        _mintCirculating(address(100), 10_000e6);

        vm.roll(block.number + 1);

        uint256 q = governor.quorum(block.number - 1);
        // circulating = 10K, dynamic = 4% of 10K = 400, floor = 1M
        assertEq(q, 1_000_000e6, "Floor of 1M HREP enforced");

        // Quorum intentionally exceeds live circulation during bootstrap.
        assertGt(q, 10_000e6, "Bootstrap quorum intentionally exceeds tiny circulating supply");
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

        // Faucet transfers 25M to users (simulating claims) so dynamic quorum exceeds the bootstrap floor.
        vm.prank(mockFaucet);
        token.transfer(address(101), 25_000_000e6);

        vm.roll(transferBlock + 1);
        uint256 qAfter = governor.quorum(transferBlock);

        // Circulating went from 1M to 26M, quorum moves above the 1M floor to 1.04M.
        assertGt(qAfter, qBefore, "Quorum increases as faucet drains");
        assertEq(qAfter, 1_040_000e6, "4% of 26M = 1.04M");
    }

    // ==================== Test 4: Mature Protocol Quorum ====================

    /// @notice At maturity: faucet drained 30M, bootstrap pool drained 12M.
    ///         Circulating = total - remaining_pools. Quorum scales with circulating.
    function test_QuorumGrows_MatureProtocol() public {
        // Simulate faucet draining 30M to users (faucet had 52M, now has 22M)
        vm.prank(mockFaucet);
        token.transfer(address(100), 30_000_000e6);

        // Simulate bootstrap pool draining 12M (pool had 12M, now has 0)
        vm.prank(mockBootstrapPool);
        token.transfer(address(101), 12_000_000e6);

        vm.roll(block.number + 1);

        // Excluded holders now hold: faucet=22M, bootstrap=0, consensus=4M, treasury=32M = 58M locked
        // Total supply = 100M
        // Circulating = 100M - 58M = 42M
        // Quorum = 4% of 42M = 1.68M
        uint256 q = governor.quorum(block.number - 1);
        assertEq(q, 1_680_000e6, "Mature quorum = 1.68M HREP");
    }

    // ==================== Test 5: Distributed Proposal Creation at 1K HREP Threshold ====================

    /// @notice Distinct voters with 1K HREP can still create proposals; each proposer is rate-limited.
    function test_ProposalSpam_1KHREPThreshold() public {
        // Create 5 different proposers each with exactly 1K HREP (threshold)
        address[5] memory proposers;
        for (uint256 i = 0; i < 5; i++) {
            proposers[i] = address(uint160(200 + i));
            _mintCirculating(proposers[i], 1_000e6);
        }

        vm.roll(block.number + 1);

        // Each can create a proposal
        for (uint256 i = 0; i < 5; i++) {
            uint256 pid = _propose(proposers[i], string(abi.encodePacked("Spam ", vm.toString(i))));
            assertTrue(pid != 0, "Proposal created successfully");
            assertEq(uint256(governor.state(pid)), uint256(IGovernor.ProposalState.Pending), "Proposal is Pending");
        }

        assertEq(governor.proposalThreshold(), 1_000e6, "1K HREP proposal threshold");
        assertEq(governor.PROPOSAL_COOLDOWN_BLOCKS(), 86_400, "per-proposer cooldown active");
    }

    // ==================== Test 6: Whale Unilateral Pass ====================

    /// @notice A whale can still pass alone once circulation is large enough that 4% exceeds the bootstrap floor.
    function test_WhaleGovernance_UnilateralPass() public {
        // Drain 30M from the excluded faucet balance into circulation. Quorum becomes 1.2M.
        address whale = address(200);
        vm.startPrank(mockFaucet);
        token.transfer(whale, 1_300_000e6);
        token.transfer(address(201), 28_700_000e6);
        vm.stopPrank();

        vm.roll(block.number + 1);

        uint256 q = governor.quorum(block.number - 1);
        assertEq(q, 1_200_000e6, "Quorum = 1.2M with 30M circulating");

        // Whale creates and votes on proposal
        uint256 pid = _propose(whale, "Whale proposal");
        vm.roll(block.number + governor.votingDelay() + 1);

        vm.prank(whale);
        governor.castVote(pid, 1); // FOR

        // Advance past voting period
        vm.roll(block.number + governor.votingPeriod() + 1);

        // Proposal should succeed: 1.3M > 1.2M quorum, 100% of votes FOR
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
        // Total circulating = 500K, so the 1M bootstrap floor still applies.

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

        // Vote locks the voter's current balance, capping repeated locks at transferable stake.
        vm.prank(voter);
        governor.castVote(pid, 1);

        uint256 locked = token.getLockedBalance(voter);
        assertEq(locked, 1_000_000e6, "Current balance locked without over-locking");

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

    // ==================== Test 10: Governance Lock Blocks Content Voting ====================

    /// @notice Governance-locked tokens cannot be staked into content voting.
    function test_GovernanceLock_BlocksContentVoting() public {
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

        // Transfer to voting engine (content voting) is blocked while locked.
        vm.prank(voter);
        token.approve(mockVotingEngine, 100e6);

        vm.prank(mockVotingEngine);
        vm.expectRevert("Exceeds transferable balance (governance locked)");
        token.transferFrom(voter, mockVotingEngine, 100e6);

        assertEq(token.balanceOf(mockVotingEngine), 0, "Content voting stake blocked during governance lock");
    }

    /// @notice Arbitrary approved spenders cannot bypass governance locks by pushing into content-voting contracts.
    function test_GovernanceLock_BlocksThirdPartySpenderToContentVotingContracts() public {
        address mockVotingEngine = address(500);
        address mockContentRegistry = address(501);
        address arbitrarySpender = address(777);

        vm.prank(deployer);
        token.setContentVotingContracts(mockVotingEngine, mockContentRegistry);

        address voter = address(200);
        _mintCirculating(voter, 1_000_000e6);

        vm.roll(block.number + 1);
        uint256 pid = _propose(voter, "Third-party lock bypass test");
        vm.roll(block.number + governor.votingDelay() + 1);

        vm.prank(voter);
        governor.castVote(pid, 1);
        assertGt(token.getLockedBalance(voter), 0, "Tokens should be locked");

        vm.prank(voter);
        token.approve(arbitrarySpender, 200e6);

        vm.prank(arbitrarySpender);
        vm.expectRevert("Exceeds transferable balance (governance locked)");
        token.transferFrom(voter, mockVotingEngine, 100e6);

        vm.prank(arbitrarySpender);
        vm.expectRevert("Exceeds transferable balance (governance locked)");
        token.transferFrom(voter, mockContentRegistry, 100e6);
    }
}
