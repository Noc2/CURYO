// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { TimelockController } from "@openzeppelin/contracts/governance/TimelockController.sol";
import { IVotes } from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import { IGovernor } from "@openzeppelin/contracts/governance/IGovernor.sol";

import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { CuryoGovernor } from "../contracts/governance/CuryoGovernor.sol";
import { VoterIdNFT } from "../contracts/VoterIdNFT.sol";

contract GovernanceTest is Test {
    CuryoReputation public token;
    TimelockController public timelock;
    CuryoGovernor public governor;

    address public deployer = address(1);
    address public voter1 = address(2);
    address public voter2 = address(3);
    address public voter3 = address(4);

    // Mock pool addresses that hold "locked" tokens
    address public mockFaucet = address(10);
    address public mockParticipationPool = address(11);
    address public mockRewardDistributor = address(12);

    // Pool balances (simulating locked tokens — scaled to fit 100M max supply)
    uint256 public constant FAUCET_BALANCE = 30_000_000 * 1e6;
    uint256 public constant PARTICIPATION_BALANCE = 20_000_000 * 1e6;
    uint256 public constant REWARD_BALANCE = 14_000_000 * 1e6;

    // Voter balances — circulating supply is 6M (out of 70M total)
    uint256 public constant VOTER_BALANCE = 2_000_000 * 1e6; // 2M tokens each
    uint256 public constant TOTAL_MINTED = FAUCET_BALANCE + PARTICIPATION_BALANCE + REWARD_BALANCE + 6_000_000 * 1e6;

    function setUp() public {
        vm.startPrank(deployer);

        // Deploy cREP token (now has native ERC20Votes)
        token = new CuryoReputation(deployer, deployer);

        // Grant MINTER_ROLE to deployer for testing
        token.grantRole(token.MINTER_ROLE(), deployer);

        // Deploy Timelock (2 day delay)
        address[] memory proposers = new address[](1);
        proposers[0] = deployer;
        address[] memory executors = new address[](1);
        executors[0] = address(0); // Anyone can execute

        timelock = new TimelockController(2 days, proposers, executors, deployer);

        // Deploy Governor with cREP directly (no wrapper needed)
        governor = new CuryoGovernor(IVotes(address(token)), timelock);

        // Initialize pool addresses for dynamic quorum
        governor.initializePools(mockFaucet, mockParticipationPool, mockRewardDistributor);

        // Set governor on token so it can lock tokens during governance
        token.setGovernor(address(governor));

        // Grant proposer and canceller roles to governor
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));

        // Mint tokens to pool contracts (simulating locked supply)
        token.mint(mockFaucet, FAUCET_BALANCE);
        token.mint(mockParticipationPool, PARTICIPATION_BALANCE);
        token.mint(mockRewardDistributor, REWARD_BALANCE);

        // Mint tokens to voters (circulating supply)
        token.mint(voter1, VOTER_BALANCE);
        token.mint(voter2, VOTER_BALANCE);
        token.mint(voter3, VOTER_BALANCE);

        vm.stopPrank();
        // Auto-delegation happens on mint — no manual delegation needed
    }

    function test_GovernanceLocking_VoteLocks() public {
        // Advance block so voting power is active
        vm.roll(block.number + 1);

        // Create a proposal
        address[] memory targets = new address[](1);
        targets[0] = address(timelock);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);

        vm.prank(voter1);
        uint256 proposalId = governor.propose(targets, values, calldatas, "Test");

        // Move past voting delay
        vm.roll(block.number + governor.votingDelay() + 1);

        // Before voting, no tokens should be locked
        assertEq(token.getLockedBalance(voter2), 0);

        // Vote on the proposal
        vm.prank(voter2);
        governor.castVote(proposalId, 1); // 1 = For

        // After voting, voting power should be locked
        uint256 lockedAmount = token.getLockedBalance(voter2);
        assertGt(lockedAmount, 0);
        assertEq(lockedAmount, VOTER_BALANCE); // All voting power gets locked
    }

    function test_GovernanceLocking_TransferBlocked() public {
        // Advance block so voting power is active
        vm.roll(block.number + 1);

        // Create and vote on a proposal to trigger lock
        address[] memory targets = new address[](1);
        targets[0] = address(timelock);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);

        vm.prank(voter1);
        uint256 proposalId = governor.propose(targets, values, calldatas, "Test");

        vm.roll(block.number + governor.votingDelay() + 1);

        vm.prank(voter2);
        governor.castVote(proposalId, 1);

        // Try to transfer more than unlocked balance - should fail
        vm.prank(voter2);
        vm.expectRevert("Exceeds transferable balance (governance locked)");
        token.transfer(address(0x123), VOTER_BALANCE);
    }

    function test_GovernanceLocking_UnlocksAfter7Days() public {
        // Advance block so voting power is active
        vm.roll(block.number + 1);

        // Create and vote on a proposal
        address[] memory targets = new address[](1);
        targets[0] = address(timelock);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);

        vm.prank(voter1);
        uint256 proposalId = governor.propose(targets, values, calldatas, "Test");

        vm.roll(block.number + governor.votingDelay() + 1);

        vm.prank(voter2);
        governor.castVote(proposalId, 1);

        // Warp 7 days into the future
        vm.warp(block.timestamp + 7 days + 1);

        // Now transfer should work
        uint256 balanceBefore = token.balanceOf(address(0x123));
        vm.prank(voter2);
        token.transfer(address(0x123), 100e6);

        assertEq(token.balanceOf(address(0x123)), balanceBefore + 100e6);
    }

    function test_VotingPower() public {
        // After delegation, voting power should be available
        // Note: Need to advance 1 block for checkpoint to be active
        vm.roll(block.number + 1);

        uint256 votingPower = token.getVotes(voter1);
        assertEq(votingPower, VOTER_BALANCE);
    }

    function test_AutoDelegation() public {
        // Voting power is active immediately after mint (auto-delegated)
        vm.roll(block.number + 1);

        assertEq(token.getVotes(voter1), VOTER_BALANCE);
        assertEq(token.getVotes(voter2), VOTER_BALANCE);
        assertEq(token.getVotes(voter3), VOTER_BALANCE);

        // Each voter is self-delegated
        assertEq(token.delegates(voter1), voter1);
        assertEq(token.delegates(voter2), voter2);
        assertEq(token.delegates(voter3), voter3);
    }

    function test_DelegateToOtherReverts() public {
        // Delegating to another address should revert
        vm.prank(voter1);
        vm.expectRevert("Only self-delegation allowed");
        token.delegate(voter2);
    }

    function test_GovernorProposalThreshold() public view {
        // Proposal threshold should be 100 cREP (100e6)
        assertEq(governor.proposalThreshold(), 100e6);
    }

    function test_GovernorVotingPeriod() public view {
        // Voting period should be ~1 week (50400 blocks)
        assertEq(governor.votingPeriod(), 50400);
    }

    function test_GovernorVotingDelay() public view {
        // Voting delay should be ~1 day (7200 blocks)
        assertEq(governor.votingDelay(), 7200);
    }

    function test_GovernorQuorum() public {
        // Quorum is 4% of CIRCULATING supply (total minus pool balances)
        vm.roll(block.number + 1);

        // Circulating = 6M (3 voters × 2M each), pools hold 96M
        uint256 circulatingSupply = TOTAL_MINTED - FAUCET_BALANCE - PARTICIPATION_BALANCE - REWARD_BALANCE;
        uint256 expectedQuorum = (circulatingSupply * 4) / 100; // 4% of 6M = 240K
        assertEq(governor.quorum(block.number - 1), expectedQuorum);
    }

    function test_GovernorQuorumMinimumFloor() public {
        // When circulating supply is very small, minimum floor applies
        vm.roll(block.number + 1);

        // Deploy a fresh governor with almost all tokens locked
        vm.startPrank(deployer);
        CuryoReputation smallToken = new CuryoReputation(deployer, deployer);
        smallToken.grantRole(smallToken.MINTER_ROLE(), deployer);

        TimelockController smallTimelock = new TimelockController(2 days, new address[](0), new address[](0), deployer);
        CuryoGovernor smallGovernor = new CuryoGovernor(IVotes(address(smallToken)), smallTimelock);

        address pool = address(100);
        smallGovernor.initializePools(pool, address(101), address(102));

        // Mint 1M to pool, 100K to a user → circulating = 100K, 4% = 4K < 10K floor
        smallToken.mint(pool, 1_000_000 * 1e6);
        smallToken.mint(address(200), 100_000 * 1e6);
        vm.stopPrank();

        vm.roll(block.number + 1);
        assertEq(smallGovernor.quorum(block.number - 1), 10_000 * 1e6); // minimum floor
    }

    function test_GovernorQuorumGrowsAsPoolsDrain() public {
        vm.roll(block.number + 1);

        uint256 transferBlock = vm.getBlockNumber();
        uint256 beforeSnapshotBlock = transferBlock - 1;
        uint256 quorumBefore = governor.quorum(beforeSnapshotBlock);

        // Simulate faucet distributing tokens: transfer 1M from faucet to a new user
        vm.prank(mockFaucet);
        token.transfer(address(50), 1_000_000 * 1e6);

        vm.roll(transferBlock + 1);
        uint256 quorumAfter = governor.quorum(transferBlock);

        // Quorum should increase as more tokens circulate
        assertGt(quorumAfter, quorumBefore);
    }

    function test_GovernorQuorumSnapshotIgnoresLaterPoolChanges() public {
        vm.roll(block.number + 1);
        uint256 transferBlock = vm.getBlockNumber();
        uint256 snapshotBlock = transferBlock - 1;
        uint256 snapshotQuorum = governor.quorum(snapshotBlock);

        // Drain pool balance after the snapshot block
        vm.prank(mockFaucet);
        token.transfer(address(50), 1_000_000 * 1e6);

        vm.roll(transferBlock + 1);

        // Quorum at snapshot block must remain stable
        assertEq(governor.quorum(snapshotBlock), snapshotQuorum);
    }

    function test_GovernorPoolsOnlyInitializer() public {
        vm.startPrank(deployer);
        CuryoGovernor freshGovernor = new CuryoGovernor(IVotes(address(token)), timelock);
        vm.stopPrank();

        vm.prank(voter1);
        vm.expectRevert("Only pools initializer");
        freshGovernor.initializePools(address(1), address(2), address(3));

        vm.prank(deployer);
        freshGovernor.initializePools(address(1), address(2), address(3));
        assertTrue(freshGovernor.poolsInitialized());
    }

    function test_GovernorPoolsRejectDuplicateAddresses() public {
        vm.startPrank(deployer);
        CuryoGovernor freshGovernor = new CuryoGovernor(IVotes(address(token)), timelock);
        vm.expectRevert("Duplicate pool");
        freshGovernor.initializePools(address(1), address(1), address(2));
        vm.stopPrank();
    }

    function test_GovernorPoolsInitializedOnce() public {
        // initializePools can only be called once
        vm.prank(deployer);
        vm.expectRevert("Pools already initialized");
        governor.initializePools(address(1), address(2), address(3));
    }

    function test_CreateProposal() public {
        // Advance block so voting power is active
        vm.roll(block.number + 1);

        // Create a simple proposal (empty for testing)
        address[] memory targets = new address[](1);
        targets[0] = address(timelock);

        uint256[] memory values = new uint256[](1);
        values[0] = 0;

        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = ""; // No-op

        string memory description = "Test Proposal #1";

        vm.prank(voter1);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        assertTrue(proposalId != 0);
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Pending));
    }

    function test_VoteOnProposal() public {
        // Advance block so voting power is active
        vm.roll(block.number + 1);

        // Create proposal
        address[] memory targets = new address[](1);
        targets[0] = address(timelock);
        uint256[] memory values = new uint256[](1);
        values[0] = 0;
        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = "";
        string memory description = "Test Proposal #1";

        vm.prank(voter1);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        // Advance past voting delay
        vm.roll(block.number + governor.votingDelay() + 1);

        // Vote
        vm.prank(voter1);
        governor.castVote(proposalId, 1); // Vote FOR

        vm.prank(voter2);
        governor.castVote(proposalId, 1); // Vote FOR

        // Check proposal is now active
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Active));

        // Check votes were recorded
        (uint256 against, uint256 forVotes, uint256 abstain) = governor.proposalVotes(proposalId);
        assertEq(forVotes, VOTER_BALANCE * 2);
        assertEq(against, 0);
        assertEq(abstain, 0);
    }

    // ====================================================
    // Governance-First Access Control Tests
    // ====================================================

    function test_GovernanceHasDefaultAdminRole() public view {
        // In test setup, deployer is both admin and governance
        // So deployer should have DEFAULT_ADMIN_ROLE
        assertTrue(token.hasRole(token.DEFAULT_ADMIN_ROLE(), deployer));
    }

    function test_GovernorHasCancellerRole() public view {
        assertTrue(timelock.hasRole(timelock.CANCELLER_ROLE(), address(governor)));
    }

    function test_AdminHasTemporaryDefaultAdminRole() public {
        // Deploy with separate admin and governance
        address admin = address(0xA);
        address governance = address(0xB);

        vm.prank(admin);
        CuryoReputation separateToken = new CuryoReputation(admin, governance);

        // Cache role hashes to avoid nested external calls consuming vm.prank
        bytes32 defaultAdminRole = separateToken.DEFAULT_ADMIN_ROLE();
        bytes32 configRole = separateToken.CONFIG_ROLE();
        bytes32 minterRole = separateToken.MINTER_ROLE();

        // Admin should have DEFAULT_ADMIN_ROLE, CONFIG_ROLE, and MINTER_ROLE
        assertTrue(separateToken.hasRole(defaultAdminRole, admin));
        assertTrue(separateToken.hasRole(configRole, admin));
        assertTrue(separateToken.hasRole(minterRole, admin));

        // Governance should also have DEFAULT_ADMIN_ROLE
        assertTrue(separateToken.hasRole(defaultAdminRole, governance));

        // Admin can grant roles (needed for dev faucet setup during deploy)
        vm.prank(admin);
        separateToken.grantRole(minterRole, address(0xC));
        assertTrue(separateToken.hasRole(minterRole, address(0xC)));

        // Admin can renounce DEFAULT_ADMIN_ROLE (done at end of deploy)
        vm.prank(admin);
        separateToken.renounceRole(defaultAdminRole, admin);
        assertFalse(separateToken.hasRole(defaultAdminRole, admin));

        // After renouncing, admin can no longer grant roles
        vm.prank(admin);
        vm.expectRevert();
        separateToken.grantRole(minterRole, address(0xD));
    }

    function test_AdminCanRenounceSetupRoles() public {
        // Deploy with separate admin and governance
        address admin = address(0xA);
        address governance = address(0xB);

        vm.prank(admin);
        CuryoReputation separateToken = new CuryoReputation(admin, governance);

        // Admin has DEFAULT_ADMIN_ROLE, CONFIG_ROLE, and MINTER_ROLE
        assertTrue(separateToken.hasRole(separateToken.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(separateToken.hasRole(separateToken.CONFIG_ROLE(), admin));
        assertTrue(separateToken.hasRole(separateToken.MINTER_ROLE(), admin));

        // Admin can renounce their own roles (mirrors deploy script section 13)
        vm.startPrank(admin);
        separateToken.renounceRole(separateToken.MINTER_ROLE(), admin);
        separateToken.renounceRole(separateToken.CONFIG_ROLE(), admin);
        separateToken.renounceRole(separateToken.DEFAULT_ADMIN_ROLE(), admin);
        vm.stopPrank();

        // Admin no longer has any roles
        assertFalse(separateToken.hasRole(separateToken.DEFAULT_ADMIN_ROLE(), admin));
        assertFalse(separateToken.hasRole(separateToken.CONFIG_ROLE(), admin));
        assertFalse(separateToken.hasRole(separateToken.MINTER_ROLE(), admin));

        // Governance still has all roles
        assertTrue(separateToken.hasRole(separateToken.DEFAULT_ADMIN_ROLE(), governance));
        assertTrue(separateToken.hasRole(separateToken.CONFIG_ROLE(), governance));
    }

    function test_FullGovernanceFlow() public {
        // This test demonstrates the full governance flow:
        // 1. Create proposal
        // 2. Vote
        // 3. Queue in timelock
        // 4. Execute after delay

        vm.roll(block.number + 1);

        // Create a proposal to grant a role (example governance action)
        address[] memory targets = new address[](1);
        targets[0] = address(timelock);
        uint256[] memory values = new uint256[](1);
        values[0] = 0;
        bytes[] memory calldatas = new bytes[](1);
        // No-op for this test (in real scenario, would be a protocol config change)
        calldatas[0] = abi.encodeWithSignature("getMinDelay()");
        string memory description = "Governance Test: Read timelock delay";

        // 1. Create proposal
        vm.prank(voter1);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        // 2. Advance to voting period and vote
        vm.roll(block.number + governor.votingDelay() + 1);

        vm.prank(voter1);
        governor.castVote(proposalId, 1); // FOR
        vm.prank(voter2);
        governor.castVote(proposalId, 1); // FOR
        vm.prank(voter3);
        governor.castVote(proposalId, 1); // FOR

        // 3. Advance past voting period
        vm.roll(block.number + governor.votingPeriod() + 1);

        // Check proposal succeeded
        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Succeeded));

        // 4. Queue in timelock
        bytes32 descriptionHash = keccak256(bytes(description));
        governor.queue(targets, values, calldatas, descriptionHash);

        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Queued));

        // 5. Advance past timelock delay
        vm.warp(block.timestamp + 2 days + 1);

        // 6. Execute
        governor.execute(targets, values, calldatas, descriptionHash);

        assertEq(uint256(governor.state(proposalId)), uint256(IGovernor.ProposalState.Executed));
    }
}

/// @title Governance Access Control Tests for Ownable Contracts
contract GovernanceOwnableTest is Test {
    function test_VoterIdNFTTransferOnlyToGovernance() public {
        address admin = address(0xA);
        address governance = address(0xB);

        vm.prank(admin);
        VoterIdNFT nft = new VoterIdNFT(admin, governance);

        assertEq(nft.governance(), governance);
        assertEq(nft.owner(), admin);

        // Transfer to non-governance should revert
        vm.prank(admin);
        vm.expectRevert("Can only transfer to governance");
        nft.transferOwnership(address(0xC));

        // Transfer to governance should succeed
        vm.prank(admin);
        nft.transferOwnership(governance);
        assertEq(nft.owner(), governance);
    }

    function test_VoterIdNFTGovernanceCannotBeZero() public {
        vm.expectRevert(VoterIdNFT.InvalidAddress.selector);
        new VoterIdNFT(address(0xA), address(0));
    }
}
