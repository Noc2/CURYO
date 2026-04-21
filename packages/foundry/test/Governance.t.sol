// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";
import {IVotes} from "@openzeppelin/contracts/governance/utils/IVotes.sol";
import {IGovernor} from "@openzeppelin/contracts/governance/IGovernor.sol";

import {CuryoReputation} from "../contracts/CuryoReputation.sol";
import {CuryoGovernor} from "../contracts/governance/CuryoGovernor.sol";
import {VoterIdNFT} from "../contracts/VoterIdNFT.sol";

contract GovernanceTest is Test {
    CuryoReputation public token;
    TimelockController public timelock;
    CuryoGovernor public governor;

    address public deployer = address(1);
    address public voter1 = address(2);
    address public voter2 = address(3);
    address public voter3 = address(4);

    // Mock protocol-controlled holders whose balances should not count toward quorum
    address public mockFaucet = address(10);
    address public mockParticipationPool = address(11);
    address public mockRewardDistributor = address(12);
    address public mockVotingEngine = address(13);
    address public mockTreasury = address(14);
    address public mockContentRegistry = address(15);
    address public mockFrontendRegistry = address(16);
    address public mockQuestionRewardEscrow = address(17);

    // Protocol-controlled balances excluded from quorum
    uint256 public constant FAUCET_BALANCE = 30_000_000 * 1e6;
    uint256 public constant PARTICIPATION_BALANCE = 20_000_000 * 1e6;
    uint256 public constant REWARD_BALANCE = 14_000_000 * 1e6;
    uint256 public constant ENGINE_BALANCE = 4_100_000 * 1e6;
    uint256 public constant TREASURY_BALANCE = 10_000_000 * 1e6;
    uint256 public constant CONTENT_REGISTRY_BALANCE = 20_000 * 1e6;
    uint256 public constant FRONTEND_REGISTRY_BALANCE = 10_000 * 1e6;
    uint256 public constant QUESTION_REWARD_ESCROW_BALANCE = 1_000_000 * 1e6;

    // Voter balances — circulating supply is 6M after excluded protocol balances are removed.
    uint256 public constant VOTER_BALANCE = 2_000_000 * 1e6; // 2M tokens each
    uint256 public constant TOTAL_MINTED = FAUCET_BALANCE + PARTICIPATION_BALANCE + REWARD_BALANCE + ENGINE_BALANCE
        + TREASURY_BALANCE + CONTENT_REGISTRY_BALANCE + FRONTEND_REGISTRY_BALANCE + QUESTION_REWARD_ESCROW_BALANCE
        + 6_000_000 * 1e6;

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

        // Initialize protocol-controlled holders excluded from dynamic quorum
        governor.initializePools(_excludedHolders());

        // Set governor on token so it can lock tokens during governance
        token.setGovernor(address(governor));

        // Grant proposer and canceller roles to governor
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(governor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(governor));

        // Mint tokens to pool contracts (simulating locked supply)
        token.mint(mockFaucet, FAUCET_BALANCE);
        token.mint(mockParticipationPool, PARTICIPATION_BALANCE);
        token.mint(mockRewardDistributor, REWARD_BALANCE);
        token.mint(mockVotingEngine, ENGINE_BALANCE);
        token.mint(mockTreasury, TREASURY_BALANCE);
        token.mint(mockContentRegistry, CONTENT_REGISTRY_BALANCE);
        token.mint(mockFrontendRegistry, FRONTEND_REGISTRY_BALANCE);
        token.mint(mockQuestionRewardEscrow, QUESTION_REWARD_ESCROW_BALANCE);

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

    function test_GovernanceLocking_ProposeLocksRemainingBalanceAfterSnapshotTransfer() public {
        vm.roll(block.number + 1);

        vm.prank(voter1);
        token.transfer(address(0x123), VOTER_BALANCE - 1);

        address[] memory targets = new address[](1);
        targets[0] = address(timelock);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);

        vm.prank(voter1);
        governor.propose(targets, values, calldatas, "Transferred away threshold");

        assertEq(token.getLockedBalance(voter1), governor.proposalThreshold(), "proposal threshold should be locked");
    }

    function test_GovernanceLocking_VoteCountsSnapshotAndLocksRemainingBalanceAfterTransfer() public {
        vm.roll(block.number + 1);

        address[] memory targets = new address[](1);
        targets[0] = address(timelock);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);

        vm.prank(voter1);
        uint256 proposalId = governor.propose(targets, values, calldatas, "Test");

        vm.roll(block.number + governor.votingDelay() + 1);

        vm.prank(voter2);
        token.transfer(address(0x123), VOTER_BALANCE - 1);

        vm.prank(voter2);
        governor.castVote(proposalId, 1);

        (, uint256 forVotes,) = governor.proposalVotes(proposalId);
        assertEq(forVotes, VOTER_BALANCE, "snapshot voting power should still count");
        assertEq(token.getLockedBalance(voter2), VOTER_BALANCE, "snapshot voting power should be locked");
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
        // Bootstrap proposal threshold should be 10K cREP
        assertEq(governor.proposalThreshold(), 10_000e6);
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
        // Quorum is 4% of circulating supply after excluding all configured protocol-controlled holders.
        vm.roll(block.number + 1);

        uint256 circulatingSupply = TOTAL_MINTED - FAUCET_BALANCE - PARTICIPATION_BALANCE - REWARD_BALANCE
            - ENGINE_BALANCE - TREASURY_BALANCE - CONTENT_REGISTRY_BALANCE - FRONTEND_REGISTRY_BALANCE
            - QUESTION_REWARD_ESCROW_BALANCE;
        uint256 expectedDynamicQuorum = (circulatingSupply * 4) / 100; // 4% of 6M = 240K
        assertEq(expectedDynamicQuorum, 240_000 * 1e6);
        assertEq(governor.quorum(block.number - 1), expectedDynamicQuorum);
    }

    function test_GovernorQuorum_ExcludesEngineAndTreasuryBalances() public {
        vm.roll(block.number + 1);

        uint256 expectedQuorum = 240_000 * 1e6;
        uint256 brokenQuorum = ((6_000_000 * 1e6 + ENGINE_BALANCE + TREASURY_BALANCE) * 4) / 100;

        assertEq(governor.quorum(block.number - 1), expectedQuorum);
        assertEq(brokenQuorum - expectedQuorum, 564_000 * 1e6);
    }

    function test_GovernorQuorum_ExcludesQuestionRewardEscrowBalance() public {
        vm.roll(block.number + 1);

        uint256 expectedQuorum = 240_000 * 1e6;
        uint256 brokenQuorum = ((6_000_000 * 1e6 + QUESTION_REWARD_ESCROW_BALANCE) * 4) / 100;

        assertEq(governor.quorum(block.number - 1), expectedQuorum);
        assertEq(brokenQuorum - expectedQuorum, 40_000 * 1e6);
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

        address[] memory holders = new address[](3);
        holders[0] = address(100);
        holders[1] = address(101);
        holders[2] = address(102);
        smallGovernor.initializePools(holders);

        // Mint 1M to pool, 100K to a user -> circulating = 100K, 4% = 4K < 100K floor
        smallToken.mint(holders[0], 1_000_000 * 1e6);
        smallToken.mint(address(200), 100_000 * 1e6);
        vm.stopPrank();

        vm.roll(block.number + 1);
        assertEq(smallGovernor.quorum(block.number - 1), 100_000 * 1e6); // bootstrap floor
    }

    function test_GovernorQuorumGrowsAsPoolsDrain() public {
        vm.roll(block.number + 1);

        uint256 transferBlock = vm.getBlockNumber();
        uint256 beforeSnapshotBlock = transferBlock - 1;
        uint256 quorumBefore = governor.quorum(beforeSnapshotBlock);
        assertEq(quorumBefore, 240_000 * 1e6);

        // Simulate faucet distributing enough tokens to move past the bootstrap floor.
        vm.prank(mockFaucet);
        token.transfer(address(50), 10_000_000 * 1e6);

        vm.roll(transferBlock + 1);
        uint256 quorumAfter = governor.quorum(transferBlock);

        // Circulating supply rises from 6M to 16M, so 4% becomes 640K and beats the floor.
        assertEq(quorumAfter, 640_000 * 1e6);
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

        address[] memory holders = new address[](3);
        holders[0] = address(1);
        holders[1] = address(2);
        holders[2] = address(3);

        vm.prank(voter1);
        vm.expectRevert("Only pools initializer");
        freshGovernor.initializePools(holders);

        vm.prank(deployer);
        freshGovernor.initializePools(holders);
        assertTrue(freshGovernor.poolsInitialized());
    }

    function test_GovernorPoolsRejectDuplicateAddresses() public {
        vm.startPrank(deployer);
        CuryoGovernor freshGovernor = new CuryoGovernor(IVotes(address(token)), timelock);
        address[] memory holders = new address[](3);
        holders[0] = address(1);
        holders[1] = address(1);
        holders[2] = address(2);
        vm.expectRevert("Duplicate holder");
        freshGovernor.initializePools(holders);
        vm.stopPrank();
    }

    function test_GovernorPoolsRejectEmptyArray() public {
        vm.startPrank(deployer);
        CuryoGovernor freshGovernor = new CuryoGovernor(IVotes(address(token)), timelock);
        address[] memory holders = new address[](0);
        vm.expectRevert("No excluded holders");
        freshGovernor.initializePools(holders);
        vm.stopPrank();
    }

    function test_GovernorPoolsRejectOversizedArray() public {
        vm.startPrank(deployer);
        CuryoGovernor freshGovernor = new CuryoGovernor(IVotes(address(token)), timelock);
        uint256 holderCount = freshGovernor.MAX_EXCLUDED_HOLDERS() + 1;
        address[] memory holders = new address[](holderCount);
        for (uint256 i = 0; i < holderCount; i++) {
            holders[i] = address(uint160(i + 1));
        }
        vm.expectRevert("Too many excluded holders");
        freshGovernor.initializePools(holders);
        vm.stopPrank();
    }

    function test_GovernorPoolsInitializedOnce() public {
        // initializePools can only be called once
        address[] memory holders = new address[](3);
        holders[0] = address(1);
        holders[1] = address(2);
        holders[2] = address(3);
        vm.prank(deployer);
        vm.expectRevert("Pools already initialized");
        governor.initializePools(holders);
    }

    function test_GovernorBootstrapCanBeRecoveredViaTimelockProposal() public {
        vm.startPrank(deployer);
        CuryoGovernor freshGovernor = new CuryoGovernor(IVotes(address(token)), timelock);
        token.setGovernor(address(freshGovernor));
        timelock.grantRole(timelock.PROPOSER_ROLE(), address(freshGovernor));
        timelock.grantRole(timelock.CANCELLER_ROLE(), address(freshGovernor));
        vm.stopPrank();

        vm.roll(block.number + 1);

        address[] memory holders = new address[](3);
        holders[0] = address(100);
        holders[1] = address(101);
        holders[2] = address(102);

        address[] memory targets = new address[](1);
        targets[0] = address(freshGovernor);

        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = abi.encodeCall(CuryoGovernor.initializePools, (holders));

        string memory description = "Recover bootstrap";
        vm.prank(voter1);
        uint256 proposalId = freshGovernor.propose(targets, values, calldatas, description);

        vm.roll(block.number + freshGovernor.votingDelay() + 1);
        vm.prank(voter1);
        freshGovernor.castVote(proposalId, 1);
        vm.prank(voter2);
        freshGovernor.castVote(proposalId, 1);
        vm.prank(voter3);
        freshGovernor.castVote(proposalId, 1);

        vm.roll(block.number + freshGovernor.votingPeriod() + 1);
        bytes32 descriptionHash = keccak256(bytes(description));
        freshGovernor.queue(targets, values, calldatas, descriptionHash);

        vm.warp(block.timestamp + 2 days + 1);
        freshGovernor.execute(targets, values, calldatas, descriptionHash);

        assertTrue(freshGovernor.poolsInitialized());
        assertTrue(freshGovernor.isExcludedHolder(address(100)));
        assertTrue(freshGovernor.isExcludedHolder(address(101)));
        assertTrue(freshGovernor.isExcludedHolder(address(102)));
    }

    function test_GovernorGetExcludedHolders() public view {
        address[] memory holders = governor.getExcludedHolders();
        assertEq(holders.length, 8);
        assertEq(holders[0], mockFaucet);
        assertEq(holders[1], mockParticipationPool);
        assertEq(holders[2], mockRewardDistributor);
        assertEq(holders[3], mockVotingEngine);
        assertEq(holders[4], mockTreasury);
        assertEq(holders[5], mockContentRegistry);
        assertEq(holders[6], mockQuestionRewardEscrow);
        assertEq(holders[7], mockFrontendRegistry);
    }

    function test_GovernorExcludedHolderCannotPropose() public {
        vm.roll(block.number + 1);

        address[] memory targets = new address[](1);
        targets[0] = address(timelock);

        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);

        vm.prank(mockTreasury);
        vm.expectRevert(abi.encodeWithSelector(CuryoGovernor.ExcludedHolderCannotGovern.selector, mockTreasury));
        governor.propose(targets, values, calldatas, "Excluded treasury proposal");
    }

    function test_GovernorExcludedHolderCannotVote() public {
        vm.roll(block.number + 1);

        address[] memory targets = new address[](1);
        targets[0] = address(timelock);

        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);

        vm.prank(voter1);
        uint256 proposalId = governor.propose(targets, values, calldatas, "User proposal");

        vm.roll(block.number + governor.votingDelay() + 1);

        vm.prank(mockTreasury);
        vm.expectRevert(abi.encodeWithSelector(CuryoGovernor.ExcludedHolderCannotGovern.selector, mockTreasury));
        governor.castVote(proposalId, 1);
    }

    function test_GovernorRejectsLegacyExcludedHolderReplacementSelector() public {
        address replacement = address(99);

        (bool success,) = address(governor)
            .call(abi.encodeWithSignature("replaceExcludedHolder(address,address)", mockFaucet, replacement));

        assertFalse(success);
        assertTrue(governor.isExcludedHolder(mockFaucet));
        assertFalse(governor.isExcludedHolder(replacement));
    }

    function test_GovernorExcludedHoldersRemainFixedAcrossGovernanceActions() public {
        address[] memory beforeHolders = governor.getExcludedHolders();

        _executeSingleCallProposal(
            address(governor),
            abi.encodeWithSignature("setProposalThreshold(uint256)", 10_001e6),
            "Update proposal threshold",
            false
        );

        address[] memory afterHolders = governor.getExcludedHolders();
        assertEq(afterHolders.length, beforeHolders.length);
        for (uint256 i = 0; i < beforeHolders.length; i++) {
            assertEq(afterHolders[i], beforeHolders[i]);
        }
    }

    function test_GovernorAllowsProposalsBeforePoolsInitialization() public {
        vm.startPrank(deployer);
        CuryoGovernor freshGovernor = new CuryoGovernor(IVotes(address(token)), timelock);
        token.setGovernor(address(freshGovernor));
        vm.stopPrank();

        vm.roll(block.number + 1);

        address[] memory targets = new address[](1);
        targets[0] = address(timelock);
        uint256[] memory values = new uint256[](1);
        bytes[] memory calldatas = new bytes[](1);

        vm.prank(voter1);
        uint256 proposalId = freshGovernor.propose(targets, values, calldatas, "Test");
        assertTrue(proposalId != 0);
    }

    function _excludedHolders() internal view returns (address[] memory holders) {
        holders = new address[](8);
        holders[0] = mockFaucet;
        holders[1] = mockParticipationPool;
        holders[2] = mockRewardDistributor;
        holders[3] = mockVotingEngine;
        holders[4] = mockTreasury;
        holders[5] = mockContentRegistry;
        holders[6] = mockQuestionRewardEscrow;
        holders[7] = mockFrontendRegistry;
    }

    function _executeSingleCallProposal(
        address target,
        bytes memory callData,
        string memory description,
        bool expectRevert_
    ) internal {
        vm.roll(block.number + 1);

        address[] memory targets = new address[](1);
        targets[0] = target;

        uint256[] memory values = new uint256[](1);
        values[0] = 0;

        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = callData;

        vm.prank(voter1);
        uint256 proposalId = governor.propose(targets, values, calldatas, description);

        vm.roll(block.number + governor.votingDelay() + 1);
        vm.prank(voter1);
        governor.castVote(proposalId, 1);
        vm.prank(voter2);
        governor.castVote(proposalId, 1);
        vm.prank(voter3);
        governor.castVote(proposalId, 1);

        vm.roll(block.number + governor.votingPeriod() + 1);
        bytes32 descriptionHash = keccak256(bytes(description));
        governor.queue(targets, values, calldatas, descriptionHash);

        vm.warp(block.timestamp + 2 days + 1);
        if (expectRevert_) {
            vm.expectRevert();
            governor.execute(targets, values, calldatas, descriptionHash);
            return;
        }
        governor.execute(targets, values, calldatas, descriptionHash);
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
        assertEq(governor.nextProposalBlock(voter1), block.number + governor.PROPOSAL_COOLDOWN_BLOCKS());
    }

    function test_ProposerCooldownBlocksRapidRepeat() public {
        vm.roll(block.number + 1);

        address[] memory targets = new address[](1);
        targets[0] = address(timelock);

        uint256[] memory values = new uint256[](1);
        values[0] = 0;

        bytes[] memory calldatas = new bytes[](1);
        calldatas[0] = "";

        vm.prank(voter1);
        governor.propose(targets, values, calldatas, "Cooldown proposal #1");

        uint256 nextBlock = governor.nextProposalBlock(voter1);
        vm.prank(voter1);
        vm.expectRevert(abi.encodeWithSelector(CuryoGovernor.ProposalCooldownActive.selector, voter1, nextBlock));
        governor.propose(targets, values, calldatas, "Cooldown proposal #2");

        vm.roll(nextBlock);

        vm.prank(voter1);
        uint256 proposalId = governor.propose(targets, values, calldatas, "Cooldown proposal #2");

        assertTrue(proposalId != 0);
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

    function test_AdminOnlyGetsTemporarySetupRoles() public {
        // Deploy with separate admin and governance
        address admin = address(0xA);
        address governance = address(0xB);

        vm.prank(admin);
        CuryoReputation separateToken = new CuryoReputation(admin, governance);

        // Cache role hashes to avoid nested external calls consuming vm.prank
        bytes32 defaultAdminRole = separateToken.DEFAULT_ADMIN_ROLE();
        bytes32 configRole = separateToken.CONFIG_ROLE();
        bytes32 minterRole = separateToken.MINTER_ROLE();

        // Admin gets only the setup roles needed for deployment wiring and minting.
        assertFalse(separateToken.hasRole(defaultAdminRole, admin));
        assertTrue(separateToken.hasRole(configRole, admin));
        assertTrue(separateToken.hasRole(minterRole, admin));

        // Governance retains permanent admin authority.
        assertTrue(separateToken.hasRole(defaultAdminRole, governance));

        // After renouncing, admin can no longer grant roles
        vm.prank(admin);
        vm.expectRevert();
        separateToken.grantRole(minterRole, address(0xC));
    }

    function test_AdminCanRenounceSetupRoles() public {
        // Deploy with separate admin and governance
        address admin = address(0xA);
        address governance = address(0xB);

        vm.prank(admin);
        CuryoReputation separateToken = new CuryoReputation(admin, governance);

        // Admin has only the temporary setup roles.
        assertFalse(separateToken.hasRole(separateToken.DEFAULT_ADMIN_ROLE(), admin));
        assertTrue(separateToken.hasRole(separateToken.CONFIG_ROLE(), admin));
        assertTrue(separateToken.hasRole(separateToken.MINTER_ROLE(), admin));

        // Admin can renounce their own roles (mirrors deploy script section 13)
        vm.startPrank(admin);
        separateToken.renounceRole(separateToken.MINTER_ROLE(), admin);
        separateToken.renounceRole(separateToken.CONFIG_ROLE(), admin);
        vm.stopPrank();

        // Admin no longer has any roles
        assertFalse(separateToken.hasRole(separateToken.DEFAULT_ADMIN_ROLE(), admin));
        assertFalse(separateToken.hasRole(separateToken.CONFIG_ROLE(), admin));
        assertFalse(separateToken.hasRole(separateToken.MINTER_ROLE(), admin));

        // Governance still has permanent roles
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
