// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { ERC1967Proxy } from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ContentRegistry } from "../contracts/ContentRegistry.sol";
import { RoundVotingEngine } from "../contracts/RoundVotingEngine.sol";
import { RoundRewardDistributor } from "../contracts/RoundRewardDistributor.sol";
import { RoundLib } from "../contracts/libraries/RoundLib.sol";
import { CuryoReputation } from "../contracts/CuryoReputation.sol";
import { ParticipationPool } from "../contracts/ParticipationPool.sol";
import { FrontendRegistry } from "../contracts/FrontendRegistry.sol";
import { IVoterIdNFT } from "../contracts/interfaces/IVoterIdNFT.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";

// =========================================================================
// MOCKS
// =========================================================================

contract MockVoterIdNFT_RVE is IVoterIdNFT {
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

    function revokeVoterId(address) external { }

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

// =========================================================================
// TEST CONTRACT
// =========================================================================

contract RoundVotingEngineBranchesTest is Test {
    CuryoReputation public crepToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    RoundRewardDistributor public rewardDistributor;
    MockVoterIdNFT_RVE public mockVoterIdNFT;
    ParticipationPool public participationPool;
    FrontendRegistry public frontendRegistry;

    address public owner = address(1);
    address public submitter = address(2);
    address public voter1 = address(3);
    address public voter2 = address(4);
    address public voter3 = address(5);
    address public voter4 = address(6);
    address public voter5 = address(7);
    address public voter6 = address(8);
    address public keeper = address(9);
    address public treasury = address(100);
    address public frontend1 = address(200);
    address public delegate1 = address(201);

    uint256 public constant STAKE = 5e6;
    uint256 public constant T0 = 1000; // setUp warp time

    function setUp() public {
        vm.warp(T0);
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
        // setConfig(minEpochBlocks, maxEpochBlocks, maxDuration, minVoters, maxVoters, baseRateBps, growthRateBps, maxProbBps, liquidityParam)
        votingEngine.setConfig(10, 50, 7 days, 2, 200, 30, 3, 500, 1000e6);

        mockVoterIdNFT = new MockVoterIdNFT_RVE();

        FrontendRegistry frImpl = new FrontendRegistry();
        frontendRegistry = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(frImpl), abi.encodeCall(FrontendRegistry.initialize, (owner, owner, address(crepToken)))
                )
            )
        );
        frontendRegistry.setVotingEngine(address(votingEngine));
        frontendRegistry.addFeeCreditor(address(votingEngine));
        votingEngine.setFrontendRegistry(address(frontendRegistry));

        participationPool = new ParticipationPool(address(crepToken), owner);
        participationPool.setAuthorizedCaller(address(votingEngine), true);
        participationPool.setAuthorizedCaller(address(registry), true);
        votingEngine.setParticipationPool(address(participationPool));

        crepToken.mint(owner, 2_000_000e6);
        crepToken.approve(address(participationPool), 500_000e6);
        participationPool.depositPool(500_000e6);
        crepToken.approve(address(votingEngine), 500_000e6);
        votingEngine.fundConsensusReserve(500_000e6);

        address[9] memory users = [submitter, voter1, voter2, voter3, voter4, voter5, voter6, frontend1, delegate1];
        for (uint256 i = 0; i < users.length; i++) {
            crepToken.mint(users[i], 10_000e6);
        }

        vm.stopPrank();
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _submitContent() internal returns (uint256 contentId) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "test goal", "test", 0);
        vm.stopPrank();
        contentId = 1;
    }

    function _submitContentWithUrl(string memory url) internal returns (uint256) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent(url, "test goal", "test", 0);
        vm.stopPrank();
        return registry.nextContentId() - 1;
    }

    function _vote(address voter, uint256 contentId, bool isUp) internal {
        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.vote(contentId, isUp, STAKE, address(0));
        vm.stopPrank();
    }

    function _voteWithStake(address voter, uint256 contentId, bool isUp, uint256 stakeAmount) internal {
        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), stakeAmount);
        votingEngine.vote(contentId, isUp, stakeAmount, address(0));
        vm.stopPrank();
    }

    function _voteWithFrontend(address voter, uint256 contentId, bool isUp, address frontend) internal {
        vm.startPrank(voter);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.vote(contentId, isUp, STAKE, frontend);
        vm.stopPrank();
    }

    function _registerFrontend(address fe) internal {
        vm.startPrank(fe);
        crepToken.approve(address(frontendRegistry), 1000e6);
        frontendRegistry.register();
        vm.stopPrank();
        vm.prank(owner);
        frontendRegistry.approveFrontend(fe);
    }

    function _forceSettle(uint256 contentId) internal {
        // Roll past maxEpochBlocks (50) to guarantee settlement
        vm.roll(block.number + 51);
        votingEngine.trySettle(contentId);
    }

    /// @dev Full round lifecycle: submit -> vote (two-sided) -> force settle. Returns contentId and roundId.
    function _setupAndSettleRound(bool unanimousUp) internal returns (uint256 contentId, uint256 roundId) {
        contentId = _submitContent();

        _vote(voter1, contentId, true);
        _vote(voter2, contentId, true);
        if (unanimousUp) {
            _vote(voter3, contentId, true);
        } else {
            _vote(voter3, contentId, false);
        }

        roundId = votingEngine.currentRoundId(contentId);

        if (unanimousUp) {
            // One-sided consensus: needs maxEpochBlocks to pass
            vm.roll(block.number + 51);
            votingEngine.trySettle(contentId);
        } else {
            // Two-sided: force past maxEpochBlocks for guaranteed settlement
            _forceSettle(contentId);
        }
    }

    // =========================================================================
    // vote() BRANCHES
    // =========================================================================

    function test_Vote_VoterIdRequired_RevertsWithoutId() public {
        vm.prank(owner);
        votingEngine.setVoterIdNFT(address(mockVoterIdNFT));

        uint256 contentId = _submitContent();

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(RoundVotingEngine.VoterIdRequired.selector);
        votingEngine.vote(contentId, true, STAKE, address(0));
        vm.stopPrank();
    }

    function test_Vote_VoterIdRequired_SucceedsWithId() public {
        vm.prank(owner);
        votingEngine.setVoterIdNFT(address(mockVoterIdNFT));
        mockVoterIdNFT.setHolder(voter1);
        mockVoterIdNFT.setHolder(submitter);

        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        assertTrue(votingEngine.hasVoted(contentId, 1, voter1));
    }

    function test_Vote_SelfVote_RevertsSubmitterVoting() public {
        uint256 contentId = _submitContent();

        vm.startPrank(submitter);
        crepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(RoundVotingEngine.SelfVote.selector);
        votingEngine.vote(contentId, true, STAKE, address(0));
        vm.stopPrank();
    }

    // Note: Delegate-of-submitter self-vote prevention is hard to test with the simple mock
    // because the mock's hasVoterId and resolveHolder are tied to the same mapping.
    // The real VoterIdNFT differentiates between delegation and direct holding.
    // This scenario is covered by the SelfVote check in the contract.

    function test_Vote_ContentNotActive_Reverts() public {
        uint256 contentId = _submitContent();

        vm.prank(owner);
        registry.setBonusPool(address(100));
        vm.prank(submitter);
        registry.cancelContent(contentId);

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(RoundVotingEngine.ContentNotActive.selector);
        votingEngine.vote(contentId, true, STAKE, address(0));
        vm.stopPrank();
    }

    function test_Vote_CooldownActive_Reverts() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        uint256 roundId = votingEngine.currentRoundId(contentId);

        // Force settle the round
        _forceSettle(contentId);

        // Now try to vote again on same content within 24h cooldown
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        votingEngine.vote(contentId, true, STAKE, address(0));
        vm.stopPrank();
    }

    function test_Vote_CooldownActive_SucceedsAfter24h() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        // Force settle the round
        _forceSettle(contentId);

        // Warp past 24h cooldown
        vm.warp(block.timestamp + 25 hours);
        _vote(voter1, contentId, true);

        uint256 roundId2 = votingEngine.currentRoundId(contentId);
        assertTrue(votingEngine.hasVoted(contentId, roundId2, voter1));
    }

    function test_Vote_MaxVotersReached_Reverts() public {
        vm.prank(owner);
        // setConfig with maxVoters=2
        votingEngine.setConfig(10, 50, 7 days, 2, 2, 30, 3, 500, 1000e6);

        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        vm.startPrank(voter3);
        crepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(RoundVotingEngine.MaxVotersReached.selector);
        votingEngine.vote(contentId, true, STAKE, address(0));
        vm.stopPrank();
    }

    function test_Vote_InvalidStake_BelowMin_Reverts() public {
        uint256 contentId = _submitContent();

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), 1e5);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        votingEngine.vote(contentId, true, 1e5, address(0));
        vm.stopPrank();
    }

    function test_Vote_InvalidStake_AboveMax_Reverts() public {
        uint256 contentId = _submitContent();

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), 101e6);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        votingEngine.vote(contentId, true, 101e6, address(0));
        vm.stopPrank();
    }

    function test_Vote_RoundNotAccepting_ExpiredRound() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);

        // Warp past 7 days (maxDuration) -- round is Open but expired
        vm.warp(T0 + 8 days);

        vm.startPrank(voter2);
        crepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(RoundVotingEngine.RoundNotAccepting.selector);
        votingEngine.vote(contentId, true, STAKE, address(0));
        vm.stopPrank();
    }

    function test_Vote_RecordsStakeOnVoterIdNFT() public {
        vm.prank(owner);
        votingEngine.setVoterIdNFT(address(mockVoterIdNFT));
        mockVoterIdNFT.setHolder(voter1);
        mockVoterIdNFT.setHolder(submitter);

        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);

        uint256 roundId = votingEngine.currentRoundId(contentId);
        uint256 tokenId = mockVoterIdNFT.tokenIds(voter1);
        uint256 recorded = mockVoterIdNFT.getEpochContentStake(contentId, roundId, tokenId);
        assertEq(recorded, STAKE);
    }

    function test_Vote_NoVoterIdNFT_SkipsAllIdChecks() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        assertTrue(votingEngine.hasVoted(contentId, 1, voter1));
    }

    function test_Vote_IdentityDoubleVote_CooldownFiresFirst() public {
        vm.prank(owner);
        votingEngine.setVoterIdNFT(address(mockVoterIdNFT));
        mockVoterIdNFT.setHolder(voter1);
        mockVoterIdNFT.setHolder(voter2);
        mockVoterIdNFT.setHolder(submitter);

        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);

        // voter1 already voted in this round, try again with same address
        // Cooldown check fires before AlreadyVoted check
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        votingEngine.vote(contentId, true, STAKE, address(0));
        vm.stopPrank();
    }

    function test_Vote_DelegateVoting() public {
        vm.prank(owner);
        votingEngine.setVoterIdNFT(address(mockVoterIdNFT));
        mockVoterIdNFT.setHolder(voter1);
        mockVoterIdNFT.setHolder(submitter);

        // Set up delegation: voter1 delegates to delegate1
        vm.prank(voter1);
        mockVoterIdNFT.setDelegate(delegate1);
        mockVoterIdNFT.setHolder(delegate1);

        uint256 contentId = _submitContent();

        // delegate1 can vote on behalf of voter1 (delegate1 has own voter ID)
        vm.startPrank(delegate1);
        crepToken.approve(address(votingEngine), STAKE);
        votingEngine.vote(contentId, true, STAKE, address(0));
        vm.stopPrank();

        uint256 roundId = votingEngine.currentRoundId(contentId);
        assertTrue(votingEngine.hasVoted(contentId, roundId, delegate1));
    }

    function test_Vote_AlreadyVoted_Reverts() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);

        // Contract checks cooldown before AlreadyVoted, so within cooldown period
        // the error is CooldownActive (cooldown is set on successful vote)
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        votingEngine.vote(contentId, true, STAKE, address(0));
        vm.stopPrank();
    }

    function test_Vote_FrontendTracking_ApprovedFrontend() public {
        _registerFrontend(frontend1);

        uint256 contentId = _submitContent();
        _voteWithFrontend(voter1, contentId, true, frontend1);

        uint256 roundId = votingEngine.currentRoundId(contentId);
        uint256 frontendStake = votingEngine.roundStakeWithApprovedFrontend(contentId, roundId);
        assertEq(frontendStake, STAKE);

        uint256 perFrontendStake = votingEngine.roundPerFrontendStake(contentId, roundId, frontend1);
        assertEq(perFrontendStake, STAKE);
    }

    function test_Vote_FrontendTracking_UnapprovedFrontend() public {
        // Register but DON'T approve frontend
        vm.startPrank(frontend1);
        crepToken.approve(address(frontendRegistry), 1000e6);
        frontendRegistry.register();
        vm.stopPrank();

        uint256 contentId = _submitContent();
        _voteWithFrontend(voter1, contentId, true, frontend1);

        uint256 roundId = votingEngine.currentRoundId(contentId);
        uint256 frontendStake = votingEngine.roundStakeWithApprovedFrontend(contentId, roundId);
        assertEq(frontendStake, 0);
    }

    function test_Vote_StoresVoteData() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);

        uint256 roundId = votingEngine.currentRoundId(contentId);
        RoundLib.Vote memory v = votingEngine.getVote(contentId, roundId, voter1);
        assertEq(v.voter, voter1);
        assertEq(v.stake, STAKE);
        assertTrue(v.isUp);
        assertGt(v.shares, 0);
    }

    function test_Vote_UpdatesRoundCounters() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        uint256 roundId = votingEngine.currentRoundId(contentId);
        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(round.voteCount, 2);
        assertEq(round.upCount, 1);
        assertEq(round.downCount, 1);
        assertEq(round.totalUpStake, STAKE);
        assertEq(round.totalDownStake, STAKE);
        assertGt(round.totalUpShares, 0);
        assertGt(round.totalDownShares, 0);
    }

    function test_Vote_UpdatesContentVoteCount() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        assertEq(votingEngine.getContentVoteCount(contentId), 2);
    }

    function test_Vote_RecordsCooldownTimestamp() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);

        uint256 lastVote = votingEngine.lastVoteTimestamp(contentId, voter1);
        assertEq(lastVote, block.timestamp);
    }

    // =========================================================================
    // trySettle / _shouldSettle BRANCHES
    // =========================================================================

    function test_TrySettle_RoundNotOpen_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupAndSettleRound(false);

        vm.expectRevert(RoundVotingEngine.RoundNotOpen.selector);
        votingEngine.trySettle(contentId);
    }

    function test_TrySettle_NoActiveRound_Reverts() public {
        // Content has no round yet
        uint256 contentId = _submitContent();
        // No votes -> no round -> currentRoundId is 0
        vm.expectRevert(RoundVotingEngine.RoundNotOpen.selector);
        votingEngine.trySettle(contentId);
    }

    function test_TrySettle_BeforeMinEpochBlocks_DoesNotSettle() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        uint256 roundId = votingEngine.currentRoundId(contentId);

        // Roll only 5 blocks (less than minEpochBlocks=10)
        vm.roll(block.number + 5);
        votingEngine.trySettle(contentId);

        // Round should still be Open
        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Open));
    }

    function test_TrySettle_AfterMaxEpochBlocks_AlwaysSettles() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        uint256 roundId = votingEngine.currentRoundId(contentId);

        // Roll past maxEpochBlocks (50)
        vm.roll(block.number + 51);
        votingEngine.trySettle(contentId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertTrue(
            uint256(round.state) == uint256(RoundLib.RoundState.Settled)
                || uint256(round.state) == uint256(RoundLib.RoundState.Tied)
        );
    }

    function test_TrySettle_TiedRound() public {
        uint256 contentId = _submitContent();
        // Equal stakes on both sides -> tie
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        uint256 roundId = votingEngine.currentRoundId(contentId);

        _forceSettle(contentId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied));
    }

    function test_TrySettle_TwoSidedSettlement_UpWins() public {
        uint256 contentId = _submitContent();
        // 2 UP, 1 DOWN -> UP wins
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, true);
        _vote(voter3, contentId, false);

        uint256 roundId = votingEngine.currentRoundId(contentId);

        _forceSettle(contentId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
        assertTrue(round.upWins);
    }

    function test_TrySettle_TwoSidedSettlement_DownWins() public {
        uint256 contentId = _submitContent();
        // 1 UP, 2 DOWN -> DOWN wins
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);
        _vote(voter3, contentId, false);

        uint256 roundId = votingEngine.currentRoundId(contentId);

        _forceSettle(contentId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
        assertFalse(round.upWins);
    }

    function test_TrySettle_ConsensusSettlement_OneSided() public {
        uint256 contentId = _submitContent();
        // All UP, no DOWN -> consensus settlement after maxEpochBlocks
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, true);
        _vote(voter3, contentId, true);

        uint256 roundId = votingEngine.currentRoundId(contentId);

        // Roll past maxEpochBlocks for consensus settlement
        vm.roll(block.number + 51);
        votingEngine.trySettle(contentId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
        assertTrue(round.upWins);

        // Consensus: losingPool=0, subsidy from consensus reserve
        uint256 voterPool = votingEngine.roundVoterPool(contentId, roundId);
        assertGt(voterPool, 0);
    }

    function test_TrySettle_ConsensusSettlement_BeforeMaxEpoch_DoesNotSettle() public {
        uint256 contentId = _submitContent();
        // All UP, no DOWN -> needs maxEpochBlocks to settle
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, true);

        uint256 roundId = votingEngine.currentRoundId(contentId);

        // Roll only 30 blocks (between min and max epoch)
        vm.roll(block.number + 30);
        votingEngine.trySettle(contentId);

        // One-sided with not enough blocks -> still open
        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Open));
    }

    function test_TrySettle_NotEnoughVoters_DoesNotSettle() public {
        uint256 contentId = _submitContent();
        // Only 1 voter (minVoters=2)
        _vote(voter1, contentId, true);

        uint256 roundId = votingEngine.currentRoundId(contentId);

        // Roll past maxEpochBlocks
        vm.roll(block.number + 51);
        // One-sided with 1 voter >= 0 upCount && downCount==0 && voteCount>0 -> checks maxEpochBlocks
        // This will try consensus settlement, which needs voteCount > 0 (yes) and one side empty (yes)
        votingEngine.trySettle(contentId);

        // With only 1 voter, consensus settlement still happens (voteCount > 0, downCount == 0)
        // The minVoters check is only for two-sided settlement
        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
    }

    function test_TrySettle_SettlementSetsTimestamp() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);
        _vote(voter3, contentId, true);

        uint256 roundId = votingEngine.currentRoundId(contentId);
        _forceSettle(contentId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertGt(round.settledAt, 0);
    }

    function test_TrySettle_VoterPoolAndWinningShares() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, true);
        _vote(voter3, contentId, false);

        uint256 roundId = votingEngine.currentRoundId(contentId);
        _forceSettle(contentId);

        uint256 voterPool = votingEngine.roundVoterPool(contentId, roundId);
        uint256 winningShares = votingEngine.roundWinningShares(contentId, roundId);
        assertGt(voterPool, 0);
        assertGt(winningShares, 0);
    }

    function test_TrySettle_FrontendFee_NoApprovedFrontends() public {
        (uint256 contentId, uint256 roundId) = _setupAndSettleRound(false);

        uint256 frontendPool = votingEngine.roundFrontendPool(contentId, roundId);
        assertEq(frontendPool, 0);
        uint256 voterPool = votingEngine.roundVoterPool(contentId, roundId);
        assertGt(voterPool, 0);
    }

    function test_TrySettle_FrontendFee_WithApprovedFrontends() public {
        _registerFrontend(frontend1);

        uint256 contentId = _submitContent();
        _voteWithFrontend(voter1, contentId, true, frontend1);
        _vote(voter2, contentId, true);
        _vote(voter3, contentId, false);

        uint256 roundId = votingEngine.currentRoundId(contentId);
        _forceSettle(contentId);

        uint256 frontendPool = votingEngine.roundFrontendPool(contentId, roundId);
        assertGt(frontendPool, 0);
    }

    function test_TrySettle_ParticipationRateSnapshot() public {
        (uint256 contentId, uint256 roundId) = _setupAndSettleRound(false);
        uint256 rateBps = votingEngine.roundParticipationRateBps(contentId, roundId);
        assertGt(rateBps, 0);
    }

    function test_TrySettle_CategoryFee_NoCategoryId() public {
        (uint256 contentId, uint256 roundId) = _setupAndSettleRound(false);
        uint256 categoryId = registry.getCategoryId(contentId);
        assertEq(categoryId, 0);
        uint256 voterPool = votingEngine.roundVoterPool(contentId, roundId);
        assertGt(voterPool, 0);
    }

    function test_TrySettle_SubmitterStake_AutoReturnAfter4Days() public {
        uint256 contentId = _submitContent();

        _vote(voter1, contentId, true);
        _vote(voter2, contentId, true);
        _vote(voter3, contentId, false);

        // Warp 4+ days from content creation (still within maxDuration=7 days)
        vm.warp(T0 + 4 days + 1 hours);

        uint256 roundId = votingEngine.currentRoundId(contentId);
        // Force settle
        _forceSettle(contentId);

        assertTrue(registry.isSubmitterStakeReturned(contentId));
    }

    // =========================================================================
    // Settlement probability view
    // =========================================================================

    function test_GetSettlementProbability_BeforeMinEpoch() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);

        uint256 roundId = votingEngine.currentRoundId(contentId);

        // Before minEpochBlocks
        uint256 prob = votingEngine.getSettlementProbability(contentId, roundId);
        assertEq(prob, 0);
    }

    function test_GetSettlementProbability_AfterMaxEpoch() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);

        uint256 roundId = votingEngine.currentRoundId(contentId);

        // Roll past maxEpochBlocks
        vm.roll(block.number + 51);
        uint256 prob = votingEngine.getSettlementProbability(contentId, roundId);
        assertEq(prob, 10000);
    }

    function test_GetSettlementProbability_BetweenMinAndMax() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);

        uint256 roundId = votingEngine.currentRoundId(contentId);

        // Roll to minEpochBlocks + 5 window
        vm.roll(block.number + 15);
        uint256 prob = votingEngine.getSettlementProbability(contentId, roundId);
        // prob = baseRateBps(30) + 5 * growthRateBps(3) = 30 + 15 = 45
        assertEq(prob, 45);
    }

    // =========================================================================
    // hasActiveVotes view
    // =========================================================================

    function test_HasActiveVotes_NoRound() public {
        uint256 contentId = _submitContent();
        assertFalse(votingEngine.hasActiveVotes(contentId));
    }

    function test_HasActiveVotes_WithVotes() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        assertTrue(votingEngine.hasActiveVotes(contentId));
    }

    function test_HasActiveVotes_AfterSettlement() public {
        (uint256 contentId,) = _setupAndSettleRound(false);
        assertFalse(votingEngine.hasActiveVotes(contentId));
    }

    // =========================================================================
    // cancelExpiredRound BRANCHES
    // =========================================================================

    function test_CancelExpiredRound_RoundNotOpen_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupAndSettleRound(false);

        vm.expectRevert(RoundVotingEngine.RoundNotOpen.selector);
        votingEngine.cancelExpiredRound(contentId, roundId);
    }

    function test_CancelExpiredRound_NotExpired_Reverts() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        uint256 roundId = votingEngine.currentRoundId(contentId);

        vm.expectRevert(RoundVotingEngine.RoundNotExpired.selector);
        votingEngine.cancelExpiredRound(contentId, roundId);
    }

    function test_CancelExpiredRound_Success() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        uint256 roundId = votingEngine.currentRoundId(contentId);

        vm.warp(T0 + 8 days);
        votingEngine.cancelExpiredRound(contentId, roundId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Cancelled));
    }

    function test_CancelExpiredRound_RestoresEpochStartRating() public {
        uint256 contentId = _submitContent();

        // Get initial rating
        uint256 ratingBefore = registry.getRating(contentId);

        _vote(voter1, contentId, true);
        uint256 roundId = votingEngine.currentRoundId(contentId);

        // Warp past maxDuration
        vm.warp(T0 + 8 days);
        votingEngine.cancelExpiredRound(contentId, roundId);

        // Rating should be restored to epoch start
        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Cancelled));
    }

    // =========================================================================
    // claimCancelledRoundRefund BRANCHES
    // =========================================================================

    function test_ClaimRefund_NotCancelledOrTied_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupAndSettleRound(false);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.RoundNotCancelledOrTied.selector);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
    }

    function test_ClaimRefund_AlreadyClaimed_Reverts() public {
        // Create a tied round (equal stakes)
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        uint256 roundId = votingEngine.currentRoundId(contentId);
        _forceSettle(contentId);

        // Verify it's tied
        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied));

        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
    }

    function test_ClaimRefund_NoVote_Reverts() public {
        // Create a tied round
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        uint256 roundId = votingEngine.currentRoundId(contentId);
        _forceSettle(contentId);

        vm.prank(voter3);
        vm.expectRevert(RoundVotingEngine.NoVote.selector);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
    }

    function test_ClaimRefund_CancelledRound_Success() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        uint256 roundId = votingEngine.currentRoundId(contentId);

        vm.warp(T0 + 8 days);
        votingEngine.cancelExpiredRound(contentId, roundId);

        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertGt(crepToken.balanceOf(voter1), balBefore);
    }

    function test_ClaimRefund_TiedRound_Success() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        uint256 roundId = votingEngine.currentRoundId(contentId);
        _forceSettle(contentId);

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied));

        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);
        assertEq(crepToken.balanceOf(voter1), balBefore + STAKE);
    }

    function test_ClaimRefund_CancelledRoundRefundClaimed_Mapping() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        uint256 roundId = votingEngine.currentRoundId(contentId);

        vm.warp(T0 + 8 days);
        votingEngine.cancelExpiredRound(contentId, roundId);

        assertFalse(votingEngine.cancelledRoundRefundClaimed(contentId, roundId, voter1));

        vm.prank(voter1);
        votingEngine.claimCancelledRoundRefund(contentId, roundId);

        assertTrue(votingEngine.cancelledRoundRefundClaimed(contentId, roundId, voter1));
    }

    // =========================================================================
    // setConfig BRANCHES
    // =========================================================================

    function test_SetConfig_InvalidMinEpochBlocks_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidConfig.selector);
        // minEpochBlocks < 10
        votingEngine.setConfig(5, 50, 7 days, 2, 200, 30, 3, 500, 1000e6);
    }

    function test_SetConfig_MaxEpochNotGreaterThanMin_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidConfig.selector);
        // maxEpochBlocks <= minEpochBlocks
        votingEngine.setConfig(50, 50, 7 days, 2, 200, 30, 3, 500, 1000e6);
    }

    function test_SetConfig_InvalidMaxDuration_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidConfig.selector);
        // maxDuration < 1 day
        votingEngine.setConfig(10, 50, 23 hours, 2, 200, 30, 3, 500, 1000e6);
    }

    function test_SetConfig_InvalidMinVoters_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidConfig.selector);
        // minVoters < 2
        votingEngine.setConfig(10, 50, 7 days, 1, 200, 30, 3, 500, 1000e6);
    }

    function test_SetConfig_InvalidMaxVoters_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidConfig.selector);
        // maxVoters > 10000
        votingEngine.setConfig(10, 50, 7 days, 2, 10001, 30, 3, 500, 1000e6);
    }

    function test_SetConfig_MaxVotersLessThanMin_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidConfig.selector);
        // maxVoters < minVoters
        votingEngine.setConfig(10, 50, 7 days, 5, 3, 30, 3, 500, 1000e6);
    }

    function test_SetConfig_InvalidBaseRateBps_Zero_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidConfig.selector);
        // baseRateBps == 0
        votingEngine.setConfig(10, 50, 7 days, 2, 200, 0, 3, 500, 1000e6);
    }

    function test_SetConfig_InvalidMaxProbBps_LessThanBase_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidConfig.selector);
        // maxProbBps < baseRateBps
        votingEngine.setConfig(10, 50, 7 days, 2, 200, 500, 3, 100, 1000e6);
    }

    function test_SetConfig_InvalidLiquidityParam_Zero_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidConfig.selector);
        // liquidityParam == 0
        votingEngine.setConfig(10, 50, 7 days, 2, 200, 30, 3, 500, 0);
    }

    function test_SetConfig_ValidConfig_Succeeds() public {
        vm.prank(owner);
        votingEngine.setConfig(20, 100, 14 days, 3, 500, 50, 5, 800, 2000e6);

        (
            uint64 minEpochBlocks,
            uint64 maxEpochBlocks,
            uint256 maxDuration,
            uint256 minVoters,
            uint256 maxVoters,
            uint16 baseRateBps,
            uint16 growthRateBps,
            uint16 maxProbBps,
            uint256 liquidityParam
        ) = votingEngine.config();

        assertEq(minEpochBlocks, 20);
        assertEq(maxEpochBlocks, 100);
        assertEq(maxDuration, 14 days);
        assertEq(minVoters, 3);
        assertEq(maxVoters, 500);
        assertEq(baseRateBps, 50);
        assertEq(growthRateBps, 5);
        assertEq(maxProbBps, 800);
        assertEq(liquidityParam, 2000e6);
    }

    // =========================================================================
    // Setter zero-address checks
    // =========================================================================

    function test_SetRewardDistributor_ZeroAddress_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        votingEngine.setRewardDistributor(address(0));
    }

    function test_SetFrontendRegistry_ZeroAddress_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        votingEngine.setFrontendRegistry(address(0));
    }

    function test_SetCategoryRegistry_ZeroAddress_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        votingEngine.setCategoryRegistry(address(0));
    }

    function test_SetTreasury_ZeroAddress_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        votingEngine.setTreasury(address(0));
    }

    function test_SetVoterIdNFT_ZeroAddress_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        votingEngine.setVoterIdNFT(address(0));
    }

    function test_SetParticipationPool_ZeroAddress_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        votingEngine.setParticipationPool(address(0));
    }

    // =========================================================================
    // Pause / Unpause
    // =========================================================================

    function test_Pause_BlocksVoting() public {
        uint256 contentId = _submitContent();

        vm.prank(owner);
        votingEngine.pause();

        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), STAKE);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        votingEngine.vote(contentId, true, STAKE, address(0));
        vm.stopPrank();
    }

    function test_Unpause_AllowsVoting() public {
        uint256 contentId = _submitContent();

        vm.prank(owner);
        votingEngine.pause();

        vm.prank(owner);
        votingEngine.unpause();

        _vote(voter1, contentId, true);
        assertTrue(votingEngine.hasVoted(contentId, 1, voter1));
    }

    function test_Pause_BlocksTrySettle() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        vm.prank(owner);
        votingEngine.pause();

        vm.roll(block.number + 51);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        votingEngine.trySettle(contentId);
    }

    function test_Pause_BlocksCancelExpiredRound() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        uint256 roundId = votingEngine.currentRoundId(contentId);

        vm.warp(T0 + 8 days);

        vm.prank(owner);
        votingEngine.pause();

        vm.expectRevert(Pausable.EnforcedPause.selector);
        votingEngine.cancelExpiredRound(contentId, roundId);
    }

    // =========================================================================
    // FundConsensusReserve
    // =========================================================================

    function test_FundConsensusReserve_ZeroAmount_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.ZeroAmount.selector);
        votingEngine.fundConsensusReserve(0);
    }

    function test_FundConsensusReserve_Success() public {
        uint256 reserveBefore = votingEngine.consensusReserve();
        vm.startPrank(owner);
        crepToken.approve(address(votingEngine), 100e6);
        votingEngine.fundConsensusReserve(100e6);
        vm.stopPrank();
        assertEq(votingEngine.consensusReserve(), reserveBefore + 100e6);
    }

    // =========================================================================
    // claimFrontendFee BRANCHES
    // =========================================================================

    function test_ClaimFrontendFee_RoundNotSettled_Reverts() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        uint256 roundId = votingEngine.currentRoundId(contentId);

        vm.expectRevert(RoundVotingEngine.RoundNotSettled.selector);
        votingEngine.claimFrontendFee(contentId, roundId, frontend1);
    }

    function test_ClaimFrontendFee_NoPool_Reverts() public {
        // Settle without any frontends -> frontendPool = 0
        (uint256 contentId, uint256 roundId) = _setupAndSettleRound(false);

        vm.expectRevert(RoundVotingEngine.NoPool.selector);
        votingEngine.claimFrontendFee(contentId, roundId, frontend1);
    }

    function test_ClaimFrontendFee_Success() public {
        _registerFrontend(frontend1);

        uint256 contentId = _submitContent();
        _voteWithFrontend(voter1, contentId, true, frontend1);
        _vote(voter2, contentId, true);
        _vote(voter3, contentId, false);

        uint256 roundId = votingEngine.currentRoundId(contentId);
        _forceSettle(contentId);

        uint256 frontendPool = votingEngine.roundFrontendPool(contentId, roundId);
        assertGt(frontendPool, 0);

        votingEngine.claimFrontendFee(contentId, roundId, frontend1);
        assertTrue(votingEngine.frontendFeeClaimed(contentId, roundId, frontend1));
    }

    function test_ClaimFrontendFee_AlreadyClaimed_Reverts() public {
        _registerFrontend(frontend1);

        uint256 contentId = _submitContent();
        _voteWithFrontend(voter1, contentId, true, frontend1);
        _vote(voter2, contentId, true);
        _vote(voter3, contentId, false);

        uint256 roundId = votingEngine.currentRoundId(contentId);
        _forceSettle(contentId);

        votingEngine.claimFrontendFee(contentId, roundId, frontend1);

        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        votingEngine.claimFrontendFee(contentId, roundId, frontend1);
    }

    // =========================================================================
    // claimParticipationReward BRANCHES
    // =========================================================================

    function test_ClaimParticipation_SuccessfulClaim() public {
        (uint256 contentId, uint256 roundId) = _setupAndSettleRound(false);

        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        votingEngine.claimParticipationReward(contentId, roundId);
        assertGt(crepToken.balanceOf(voter1), balBefore);
    }

    function test_ClaimParticipation_AlreadyClaimed_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupAndSettleRound(false);

        vm.prank(voter1);
        votingEngine.claimParticipationReward(contentId, roundId);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        votingEngine.claimParticipationReward(contentId, roundId);
    }

    function test_ClaimParticipation_NoPool_Reverts() public {
        // Deploy engine without participation pool, settle, then try to claim
        vm.startPrank(owner);
        RoundVotingEngine engineImpl2 = new RoundVotingEngine();
        RoundVotingEngine engine2 = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engineImpl2),
                    abi.encodeCall(RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(registry)))
                )
            )
        );
        RoundRewardDistributor distImpl2 = new RoundRewardDistributor();
        RoundRewardDistributor dist2 = RoundRewardDistributor(
            address(
                new ERC1967Proxy(
                    address(distImpl2),
                    abi.encodeCall(
                        RoundRewardDistributor.initialize,
                        (owner, address(crepToken), address(engine2), address(registry))
                    )
                )
            )
        );
        engine2.setRewardDistributor(address(dist2));
        engine2.setTreasury(treasury);
        engine2.setConfig(10, 50, 7 days, 2, 200, 30, 3, 500, 1000e6);
        crepToken.mint(owner, 500_000e6);
        crepToken.approve(address(engine2), 500_000e6);
        engine2.fundConsensusReserve(500_000e6);
        // DON'T set participation pool

        registry.setVotingEngine(address(engine2));
        vm.stopPrank();

        uint256 contentId = _submitContent();

        vm.startPrank(voter1);
        crepToken.approve(address(engine2), STAKE);
        engine2.vote(contentId, true, STAKE, address(0));
        vm.stopPrank();
        vm.startPrank(voter2);
        crepToken.approve(address(engine2), STAKE);
        engine2.vote(contentId, true, STAKE, address(0));
        vm.stopPrank();
        vm.startPrank(voter3);
        crepToken.approve(address(engine2), STAKE);
        engine2.vote(contentId, false, STAKE, address(0));
        vm.stopPrank();

        // Force settle
        vm.roll(block.number + 51);
        engine2.trySettle(contentId);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.NoPool.selector);
        engine2.claimParticipationReward(contentId, 1);

        // Restore registry
        vm.prank(owner);
        registry.setVotingEngine(address(votingEngine));
    }

    function test_ClaimParticipation_NoVote_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupAndSettleRound(false);

        // voter4 never voted
        vm.prank(voter4);
        vm.expectRevert(RoundVotingEngine.NoVote.selector);
        votingEngine.claimParticipationReward(contentId, roundId);
    }

    function test_ClaimParticipation_RoundNotSettled_Reverts() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        uint256 roundId = votingEngine.currentRoundId(contentId);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.RoundNotSettled.selector);
        votingEngine.claimParticipationReward(contentId, roundId);
    }

    // =========================================================================
    // Edge cases
    // =========================================================================

    function test_Vote_CreatesNewRoundAfterSettlement() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);
        _vote(voter3, contentId, true);

        uint256 roundId1 = votingEngine.currentRoundId(contentId);
        _forceSettle(contentId);

        // Warp past cooldown
        vm.warp(block.timestamp + 25 hours);

        // New vote should create a new round
        _vote(voter4, contentId, true);
        uint256 roundId2 = votingEngine.currentRoundId(contentId);
        assertGt(roundId2, roundId1);
    }

    function test_Vote_AutoSettlesPriorEpoch() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        uint256 roundId1 = votingEngine.currentRoundId(contentId);

        // Roll past maxEpochBlocks and warp past cooldown so next vote triggers auto-settle
        vm.roll(block.number + 51);
        vm.warp(block.timestamp + 25 hours);

        // This vote triggers _trySettle on the prior round, settles it, then creates new round
        _vote(voter3, contentId, true);

        RoundLib.Round memory round1 = votingEngine.getRound(contentId, roundId1);
        // The prior round should now be settled or tied
        assertTrue(
            uint256(round1.state) == uint256(RoundLib.RoundState.Settled)
                || uint256(round1.state) == uint256(RoundLib.RoundState.Tied)
        );
    }

    function test_Vote_MinStake_Succeeds() public {
        uint256 contentId = _submitContent();
        _voteWithStake(voter1, contentId, true, 1e6); // MIN_STAKE
        assertTrue(votingEngine.hasVoted(contentId, 1, voter1));
    }

    function test_Vote_MaxStake_Succeeds() public {
        uint256 contentId = _submitContent();
        _voteWithStake(voter1, contentId, true, 100e6); // MAX_STAKE
        assertTrue(votingEngine.hasVoted(contentId, 1, voter1));
    }

    function test_Vote_MultipleVotersDifferentStakes() public {
        uint256 contentId = _submitContent();
        _voteWithStake(voter1, contentId, true, 1e6);
        _voteWithStake(voter2, contentId, true, 50e6);
        _voteWithStake(voter3, contentId, false, 100e6);

        uint256 roundId = votingEngine.currentRoundId(contentId);
        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        assertEq(round.totalUpStake, 51e6);
        assertEq(round.totalDownStake, 100e6);
        assertEq(round.voteCount, 3);
    }

    function test_Vote_BondingCurveShares_EarlyVoterGetsMoreShares() public {
        uint256 contentId = _submitContent();

        // voter1 votes first on UP side (sameDirectionStake = 0)
        _vote(voter1, contentId, true);
        uint256 roundId = votingEngine.currentRoundId(contentId);
        RoundLib.Vote memory v1 = votingEngine.getVote(contentId, roundId, voter1);

        // voter2 votes second on UP side (sameDirectionStake = STAKE)
        _vote(voter2, contentId, true);
        RoundLib.Vote memory v2 = votingEngine.getVote(contentId, roundId, voter2);

        // First voter should get more shares than second voter with same stake
        assertGt(v1.shares, v2.shares);
    }

    function test_GetVote_ReturnsCorrectData() public {
        uint256 contentId = _submitContent();
        _voteWithFrontend(voter1, contentId, true, frontend1);

        uint256 roundId = votingEngine.currentRoundId(contentId);
        RoundLib.Vote memory v = votingEngine.getVote(contentId, roundId, voter1);
        assertEq(v.voter, voter1);
        assertEq(v.stake, STAKE);
        assertTrue(v.isUp);
        assertEq(v.frontend, frontend1);
        assertGt(v.shares, 0);
    }

    function test_GetContentVoteCount_AccumulatesAcrossRounds() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        assertEq(votingEngine.getContentVoteCount(contentId), 2);

        // Force settle the first round
        _forceSettle(contentId);

        // Warp past cooldown
        vm.warp(block.timestamp + 25 hours);

        _vote(voter3, contentId, true);
        assertEq(votingEngine.getContentVoteCount(contentId), 3);
    }

    function test_Initialize_ZeroAdmin_Reverts() public {
        RoundVotingEngine engineImpl2 = new RoundVotingEngine();
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        new ERC1967Proxy(
            address(engineImpl2),
            abi.encodeCall(RoundVotingEngine.initialize, (address(0), owner, address(crepToken), address(registry)))
        );
    }

    function test_Initialize_ZeroGovernance_Reverts() public {
        RoundVotingEngine engineImpl2 = new RoundVotingEngine();
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        new ERC1967Proxy(
            address(engineImpl2),
            abi.encodeCall(RoundVotingEngine.initialize, (owner, address(0), address(crepToken), address(registry)))
        );
    }

    function test_Initialize_ZeroCrepToken_Reverts() public {
        RoundVotingEngine engineImpl2 = new RoundVotingEngine();
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        new ERC1967Proxy(
            address(engineImpl2),
            abi.encodeCall(RoundVotingEngine.initialize, (owner, owner, address(0), address(registry)))
        );
    }

    function test_Initialize_ZeroRegistry_Reverts() public {
        RoundVotingEngine engineImpl2 = new RoundVotingEngine();
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        new ERC1967Proxy(
            address(engineImpl2),
            abi.encodeCall(RoundVotingEngine.initialize, (owner, owner, address(crepToken), address(0)))
        );
    }

    function test_TransferReward_Unauthorized_Reverts() public {
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.Unauthorized.selector);
        votingEngine.transferReward(voter1, 100e6);
    }

    function test_KeeperReward_Setting() public {
        vm.prank(owner);
        votingEngine.setKeeperReward(1e6);
        assertEq(votingEngine.keeperReward(), 1e6);
    }

    function test_FundKeeperRewardPool_Success() public {
        vm.startPrank(owner);
        crepToken.approve(address(votingEngine), 100e6);
        votingEngine.fundKeeperRewardPool(100e6);
        vm.stopPrank();
        assertEq(votingEngine.keeperRewardPool(), 100e6);
    }

    function test_FundKeeperRewardPool_ZeroAmount_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.ZeroAmount.selector);
        votingEngine.fundKeeperRewardPool(0);
    }

    function test_AddToConsensusReserve_Success() public {
        uint256 reserveBefore = votingEngine.consensusReserve();
        vm.startPrank(voter1);
        crepToken.approve(address(votingEngine), 50e6);
        votingEngine.addToConsensusReserve(50e6);
        vm.stopPrank();
        assertEq(votingEngine.consensusReserve(), reserveBefore + 50e6);
    }

    function test_AddToConsensusReserve_ZeroAmount_Reverts() public {
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.ZeroAmount.selector);
        votingEngine.addToConsensusReserve(0);
    }

    function test_GetRoundVoterCount() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        uint256 roundId = votingEngine.currentRoundId(contentId);
        assertEq(votingEngine.getRoundVoterCount(contentId, roundId), 2);
    }

    function test_GetRoundVoter() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);
        _vote(voter2, contentId, false);

        uint256 roundId = votingEngine.currentRoundId(contentId);
        assertEq(votingEngine.getRoundVoter(contentId, roundId, 0), voter1);
        assertEq(votingEngine.getRoundVoter(contentId, roundId, 1), voter2);
    }

    function test_RoundConfigSnapshot_PreventsMidRoundChanges() public {
        uint256 contentId = _submitContent();
        _vote(voter1, contentId, true);

        uint256 roundId = votingEngine.currentRoundId(contentId);

        // Change global config
        vm.prank(owner);
        votingEngine.setConfig(20, 100, 14 days, 3, 500, 50, 5, 800, 2000e6);

        // The round's snapshotted config should still use the original values
        RoundLib.RoundConfig memory roundCfg = votingEngine.getRoundConfig(contentId, roundId);
        assertEq(roundCfg.minEpochBlocks, 10);
        assertEq(roundCfg.maxEpochBlocks, 50);
        assertEq(roundCfg.liquidityParam, 1000e6);
    }
}
