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

// =========================================================================
// MOCK
// =========================================================================

contract MockVoterIdNFT_SE is IVoterIdNFT {
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

    function removeHolder(address holder) external {
        holders[holder] = false;
    }

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
// TEST CONTRACT: Settlement Edge Cases
// =========================================================================

/// @title SettlementEdgeCasesTest
/// @notice Tests for settlement edge cases: double-settle, cancel timing boundaries,
///         settle on already-settled, treasury=address(0), consensus reserve depletion,
///         small losing pool rounding, cancel after tie, state machine transitions.
contract SettlementEdgeCasesTest is Test {
    CuryoReputation public crepToken;
    ContentRegistry public registry;
    RoundVotingEngine public engine;
    RoundRewardDistributor public rewardDistributor;
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
    address public treasury = address(100);
    address public frontend1 = address(200);

    uint256 public constant STAKE = 5e6; // 5 cREP
    uint256 public constant MIN_STAKE = 1e6;
    uint256 public constant T0 = 1_000_000;
    uint256 public constant EPOCH = 1 hours;

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

        engine = RoundVotingEngine(
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
                        (owner, address(crepToken), address(engine), address(registry))
                    )
                )
            )
        );

        registry.setVotingEngine(address(engine));
        engine.setRewardDistributor(address(rewardDistributor));
        engine.setTreasury(treasury);

        // epochDuration=1h, maxDuration=7d, minVoters=3, maxVoters=1000
        engine.setConfig(1 hours, 7 days, 3, 1000);

        FrontendRegistry frImpl = new FrontendRegistry();
        frontendRegistry = FrontendRegistry(
            address(
                new ERC1967Proxy(
                    address(frImpl), abi.encodeCall(FrontendRegistry.initialize, (owner, owner, address(crepToken)))
                )
            )
        );
        frontendRegistry.setVotingEngine(address(engine));
        frontendRegistry.addFeeCreditor(address(engine));
        engine.setFrontendRegistry(address(frontendRegistry));

        participationPool = new ParticipationPool(address(crepToken), owner);
        participationPool.setAuthorizedCaller(address(engine), true);
        participationPool.setAuthorizedCaller(address(registry), true);
        engine.setParticipationPool(address(participationPool));

        crepToken.mint(owner, 2_000_000e6);
        crepToken.approve(address(participationPool), 500_000e6);
        participationPool.depositPool(500_000e6);
        crepToken.approve(address(engine), 500_000e6);
        engine.fundConsensusReserve(500_000e6);

        address[8] memory users = [submitter, voter1, voter2, voter3, voter4, voter5, voter6, frontend1];
        for (uint256 i = 0; i < users.length; i++) {
            crepToken.mint(users[i], 10_000e6);
        }

        vm.stopPrank();
    }

    // =========================================================================
    // HELPERS
    // =========================================================================

    function _commit(address voter, uint256 contentId, bool isUp, uint256 stakeAmt)
        internal
        returns (bytes32 commitKey, bytes32 salt)
    {
        salt = keccak256(abi.encodePacked(voter, block.timestamp));
        bytes32 commitHash = keccak256(abi.encodePacked(isUp, salt, contentId));
        bytes memory ciphertext = abi.encodePacked(uint8(isUp ? 1 : 0), salt, contentId);
        vm.prank(voter);
        crepToken.approve(address(engine), stakeAmt);
        vm.prank(voter);
        engine.commitVote(contentId, commitHash, ciphertext, stakeAmt, address(0));
        commitKey = keccak256(abi.encodePacked(voter, commitHash));
    }

    function _reveal(uint256 contentId, uint256 roundId, bytes32 commitKey, bool isUp, bytes32 salt) internal {
        engine.revealVoteByCommitKey(contentId, roundId, commitKey, isUp, salt);
    }

    function _submitContent() internal returns (uint256 contentId) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "test goal", "test", 0);
        vm.stopPrank();
        contentId = 1;
    }

    function _submitContentN(uint256 n) internal returns (uint256) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        string memory url = string(abi.encodePacked("https://example.com/", vm.toString(n)));
        registry.submitContent(url, "test goal", "test", 0);
        vm.stopPrank();
        return registry.nextContentId() - 1;
    }

    /// @dev Full 3-voter round: commit, warp past epoch, reveal all 3.
    function _setupThreeVoterRound(bool v1Up, bool v2Up, bool v3Up)
        internal
        returns (uint256 contentId, uint256 roundId)
    {
        contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, v1Up, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, v2Up, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, v3Up, STAKE);

        roundId = engine.getActiveRoundId(contentId);

        RoundLib.Round memory r0 = engine.getRound(contentId, roundId);
        vm.warp(r0.startTime + EPOCH + 1);

        _reveal(contentId, roundId, ck1, v1Up, s1);
        _reveal(contentId, roundId, ck2, v2Up, s2);
        _reveal(contentId, roundId, ck3, v3Up, s3);
    }

    // =========================================================================
    // 1. DOUBLE-SETTLE: settleRound twice on same round should revert
    // =========================================================================

    function test_Settle_AlreadySettled_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);

        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));

        // Attempting to settle again should revert with RoundNotOpen
        vm.expectRevert(RoundVotingEngine.RoundNotOpen.selector);
        engine.settleRound(contentId, roundId);
    }

    // =========================================================================
    // 2. SETTLE ON TIED ROUND: should revert (state is Tied, not Open)
    // =========================================================================

    function test_Settle_TiedRound_Reverts() public {
        // Create a tied round: equal weighted pools
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, true, STAKE);

        // Need 4th voter to make it tied: 2 up + 2 down with equal stakes
        (bytes32 ck4, bytes32 s4) = _commit(voter4, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);
        RoundLib.Round memory r0 = engine.getRound(contentId, roundId);
        vm.warp(r0.startTime + EPOCH + 1);

        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, false, s2);
        _reveal(contentId, roundId, ck3, true, s3);
        _reveal(contentId, roundId, ck4, false, s4);

        // First settle creates Tied state
        engine.settleRound(contentId, roundId);
        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied));

        // Trying to settle again should revert
        vm.expectRevert(RoundVotingEngine.RoundNotOpen.selector);
        engine.settleRound(contentId, roundId);
    }

    // =========================================================================
    // 3. CANCEL TIMING BOUNDARY: exactly at maxDuration vs 1 second before
    // =========================================================================

    function test_Cancel_ExactlyAtMaxDuration_Succeeds() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);
        uint256 roundId = engine.getActiveRoundId(contentId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        // Warp to exactly start + maxDuration
        vm.warp(round.startTime + 7 days);

        engine.cancelExpiredRound(contentId, roundId);

        RoundLib.Round memory cancelled = engine.getRound(contentId, roundId);
        assertEq(uint256(cancelled.state), uint256(RoundLib.RoundState.Cancelled));
    }

    function test_Cancel_OneSecondBeforeMaxDuration_Reverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);
        uint256 roundId = engine.getActiveRoundId(contentId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        // Warp to 1 second BEFORE maxDuration
        vm.warp(round.startTime + 7 days - 1);

        vm.expectRevert(RoundVotingEngine.RoundNotExpired.selector);
        engine.cancelExpiredRound(contentId, roundId);
    }

    // =========================================================================
    // 4. CANCEL ALREADY SETTLED ROUND: should revert
    // =========================================================================

    function test_Cancel_SettledRound_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        vm.expectRevert(RoundVotingEngine.RoundNotOpen.selector);
        engine.cancelExpiredRound(contentId, roundId);
    }

    // =========================================================================
    // 5. CANCEL ROUND WITH THRESHOLD REACHED: should revert
    // =========================================================================

    function test_Cancel_ThresholdReached_Reverts() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);
        RoundLib.Round memory r0 = engine.getRound(contentId, roundId);
        vm.warp(r0.startTime + EPOCH + 1);

        // Reveal all 3 — threshold reached
        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, true, s2);
        _reveal(contentId, roundId, ck3, false, s3);

        // Warp past maxDuration
        vm.warp(r0.startTime + 7 days + 1);

        // Should revert because threshold was reached
        vm.expectRevert(RoundVotingEngine.ThresholdReached.selector);
        engine.cancelExpiredRound(contentId, roundId);
    }

    // =========================================================================
    // 6. SETTLE WITH EXACTLY minVoters (boundary)
    // =========================================================================

    function test_Settle_ExactlyMinVoters_Succeeds() public {
        // minVoters=3, exactly 3 revealed
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);

        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
    }

    // =========================================================================
    // 7. SETTLE WITH FEWER THAN minVoters: reverts
    // =========================================================================

    function test_Settle_BelowMinVoters_Reverts() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);
        RoundLib.Round memory r0 = engine.getRound(contentId, roundId);
        vm.warp(r0.startTime + EPOCH + 1);

        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, false, s2);

        // Even after long delay, should fail
        vm.warp(block.timestamp + 7 days);

        vm.expectRevert(RoundVotingEngine.NotEnoughVotes.selector);
        engine.settleRound(contentId, roundId);
    }

    // =========================================================================
    // 8. SETTLE IMMEDIATELY AFTER THRESHOLD: succeeds without delay
    // =========================================================================

    function test_Settle_ImmediatelyAfterThreshold_Succeeds() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);

        // Settle immediately after threshold — no delay required
        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
    }

    // =========================================================================
    // 9. TREASURY = address(0): treasury share redirects to voter pool
    // =========================================================================

    function test_SetTreasury_ZeroAddress_Reverts() public {
        vm.prank(owner);
        vm.expectRevert(RoundVotingEngine.InvalidAddress.selector);
        engine.setTreasury(address(0));
    }

    function test_Settle_TreasuryReceivesFee() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);

        uint256 treasuryBefore = crepToken.balanceOf(treasury);

        engine.settleRound(contentId, roundId);

        uint256 treasuryAfter = crepToken.balanceOf(treasury);
        // Treasury should receive some fee from the losing pool
        assertGt(treasuryAfter, treasuryBefore);
    }

    // =========================================================================
    // 10. SMALL LOSING POOL: rounding edge case with 1 cREP losing pool
    // =========================================================================

    function test_Settle_MinimalLosingPool_NoRevert() public {
        uint256 contentId = _submitContent();

        // 2 up voters with STAKE, 1 down voter with MIN_STAKE
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, false, MIN_STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);
        RoundLib.Round memory r0 = engine.getRound(contentId, roundId);
        vm.warp(r0.startTime + EPOCH + 1);

        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, true, s2);
        _reveal(contentId, roundId, ck3, false, s3);

        // Should not revert even with very small losing pool
        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
    }

    // =========================================================================
    // 11. UNANIMOUS ROUND: consensus subsidy from reserve
    // =========================================================================

    function test_Settle_UnanimousUp_ConsensusSubsidy() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, true);

        uint256 reserveBefore = engine.consensusReserve();

        engine.settleRound(contentId, roundId);

        uint256 reserveAfter = engine.consensusReserve();
        // Reserve should decrease (subsidy paid out)
        assertLt(reserveAfter, reserveBefore);

        // Voter pool should have the subsidy
        uint256 voterPool = engine.roundVoterPool(contentId, roundId);
        assertGt(voterPool, 0);
    }

    function test_Settle_UnanimousDown_ConsensusSubsidy() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(false, false, false);

        uint256 reserveBefore = engine.consensusReserve();

        engine.settleRound(contentId, roundId);

        uint256 reserveAfter = engine.consensusReserve();
        assertLt(reserveAfter, reserveBefore);
    }

    // =========================================================================
    // 12. CONSENSUS RESERVE AT ZERO: unanimous round settles with zero subsidy
    // =========================================================================

    function test_Settle_Unanimous_ZeroReserve_SettlesWithZeroSubsidy() public {
        // Drain the consensus reserve
        // We can't directly drain, but we can set up many unanimous rounds to exhaust it
        // Instead, let's deploy with zero reserve
        vm.startPrank(owner);

        CuryoReputation crepToken2 = new CuryoReputation(owner, owner);
        crepToken2.grantRole(crepToken2.MINTER_ROLE(), owner);

        ContentRegistry registryImpl2 = new ContentRegistry();
        RoundVotingEngine engineImpl2 = new RoundVotingEngine();
        RoundRewardDistributor distImpl2 = new RoundRewardDistributor();

        ContentRegistry registry2 = ContentRegistry(
            address(
                new ERC1967Proxy(
                    address(registryImpl2),
                    abi.encodeCall(ContentRegistry.initialize, (owner, owner, address(crepToken2)))
                )
            )
        );

        RoundVotingEngine engine2 = RoundVotingEngine(
            address(
                new ERC1967Proxy(
                    address(engineImpl2),
                    abi.encodeCall(
                        RoundVotingEngine.initialize, (owner, owner, address(crepToken2), address(registry2))
                    )
                )
            )
        );

        RoundRewardDistributor dist2 = RoundRewardDistributor(
            address(
                new ERC1967Proxy(
                    address(distImpl2),
                    abi.encodeCall(
                        RoundRewardDistributor.initialize,
                        (owner, address(crepToken2), address(engine2), address(registry2))
                    )
                )
            )
        );

        registry2.setVotingEngine(address(engine2));
        engine2.setRewardDistributor(address(dist2));
        engine2.setTreasury(treasury);
        engine2.setConfig(1 hours, 7 days, 3, 1000);

        // DO NOT fund consensus reserve — leave at 0
        assertEq(engine2.consensusReserve(), 0);

        // Mint tokens for voters
        crepToken2.mint(submitter, 10_000e6);
        crepToken2.mint(voter1, 10_000e6);
        crepToken2.mint(voter2, 10_000e6);
        crepToken2.mint(voter3, 10_000e6);
        vm.stopPrank();

        // Submit content
        vm.startPrank(submitter);
        crepToken2.approve(address(registry2), 10e6);
        registry2.submitContent("https://example.com/zero-reserve", "test", "test", 0);
        vm.stopPrank();
        uint256 contentId = 1;

        // Commit 3 unanimous votes
        bytes32 s1 = keccak256(abi.encodePacked(voter1, block.timestamp));
        bytes32 ch1 = keccak256(abi.encodePacked(true, s1, contentId));
        bytes memory ct1 = abi.encodePacked(uint8(1), s1, contentId);
        vm.prank(voter1);
        crepToken2.approve(address(engine2), STAKE);
        vm.prank(voter1);
        engine2.commitVote(contentId, ch1, ct1, STAKE, address(0));

        vm.warp(block.timestamp + 1); // offset for unique salt
        bytes32 s2 = keccak256(abi.encodePacked(voter2, block.timestamp));
        bytes32 ch2 = keccak256(abi.encodePacked(true, s2, contentId));
        bytes memory ct2 = abi.encodePacked(uint8(1), s2, contentId);
        vm.prank(voter2);
        crepToken2.approve(address(engine2), STAKE);
        vm.prank(voter2);
        engine2.commitVote(contentId, ch2, ct2, STAKE, address(0));

        vm.warp(block.timestamp + 1);
        bytes32 s3 = keccak256(abi.encodePacked(voter3, block.timestamp));
        bytes32 ch3 = keccak256(abi.encodePacked(true, s3, contentId));
        bytes memory ct3 = abi.encodePacked(uint8(1), s3, contentId);
        vm.prank(voter3);
        crepToken2.approve(address(engine2), STAKE);
        vm.prank(voter3);
        engine2.commitVote(contentId, ch3, ct3, STAKE, address(0));

        uint256 roundId = engine2.getActiveRoundId(contentId);
        RoundLib.Round memory r0 = engine2.getRound(contentId, roundId);
        vm.warp(r0.startTime + 1 hours + 1);

        // Reveal all
        bytes32 ck1 = keccak256(abi.encodePacked(voter1, ch1));
        bytes32 ck2 = keccak256(abi.encodePacked(voter2, ch2));
        bytes32 ck3 = keccak256(abi.encodePacked(voter3, ch3));
        engine2.revealVoteByCommitKey(contentId, roundId, ck1, true, s1);
        engine2.revealVoteByCommitKey(contentId, roundId, ck2, true, s2);
        engine2.revealVoteByCommitKey(contentId, roundId, ck3, true, s3);

        // Settle — should succeed even with zero reserve
        engine2.settleRound(contentId, roundId);

        RoundLib.Round memory settled = engine2.getRound(contentId, roundId);
        assertEq(uint256(settled.state), uint256(RoundLib.RoundState.Settled));

        // Voter pool should be 0 since reserve was 0
        assertEq(engine2.roundVoterPool(contentId, roundId), 0);
    }

    // =========================================================================
    // 13. CANCEL WITH ZERO COMMITS
    // =========================================================================

    function test_Cancel_ZeroCommits_NoRevert() public {
        // Submit content but never commit any votes
        uint256 contentId = _submitContent();

        // Commit 1 vote to create a round, then wait for expiry
        _commit(voter1, contentId, true, STAKE);
        uint256 roundId = engine.getActiveRoundId(contentId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        vm.warp(round.startTime + 7 days);

        engine.cancelExpiredRound(contentId, roundId);

        RoundLib.Round memory cancelled = engine.getRound(contentId, roundId);
        assertEq(uint256(cancelled.state), uint256(RoundLib.RoundState.Cancelled));
    }

    // =========================================================================
    // 14. REFUND ON CANCELLED ROUND: non-participant cannot claim
    // =========================================================================

    function test_Refund_NonParticipant_Reverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);
        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        vm.warp(round.startTime + 7 days);

        engine.cancelExpiredRound(contentId, roundId);

        // voter2 never committed
        vm.prank(voter2);
        vm.expectRevert(RoundVotingEngine.NoCommit.selector);
        engine.claimCancelledRoundRefund(contentId, roundId);
    }

    // =========================================================================
    // 15. REFUND DOUBLE-CLAIM: same voter claims twice
    // =========================================================================

    function test_Refund_DoubleClaim_Reverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);
        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        vm.warp(round.startTime + 7 days);

        engine.cancelExpiredRound(contentId, roundId);

        vm.prank(voter1);
        engine.claimCancelledRoundRefund(contentId, roundId);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        engine.claimCancelledRoundRefund(contentId, roundId);
    }

    // =========================================================================
    // 16. NEW ROUND AFTER SETTLEMENT
    // =========================================================================

    function test_NewRound_AfterSettlement_Succeeds() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        // Warp past 24h cooldown so voter can vote again
        vm.warp(block.timestamp + 24 hours + 1);

        // New vote should create a new round
        _commit(voter1, contentId, true, STAKE);
        uint256 newRoundId = engine.getActiveRoundId(contentId);

        assertGt(newRoundId, roundId);
    }

    // =========================================================================
    // 17. NEW ROUND AFTER TIE
    // =========================================================================

    function test_NewRound_AfterTie_Succeeds() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, true, STAKE);
        (bytes32 ck4, bytes32 s4) = _commit(voter4, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);
        RoundLib.Round memory r0 = engine.getRound(contentId, roundId);
        vm.warp(r0.startTime + EPOCH + 1);

        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, false, s2);
        _reveal(contentId, roundId, ck3, true, s3);
        _reveal(contentId, roundId, ck4, false, s4);

        engine.settleRound(contentId, roundId);

        // Warp past 24h cooldown
        vm.warp(block.timestamp + 24 hours + 1);

        // New vote should work
        _commit(voter1, contentId, true, STAKE);
        uint256 newRoundId = engine.getActiveRoundId(contentId);
        assertGt(newRoundId, roundId);
    }

    // =========================================================================
    // 18. NEW ROUND AFTER CANCEL
    // =========================================================================

    function test_NewRound_AfterCancel_Succeeds() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);
        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        vm.warp(round.startTime + 7 days);

        engine.cancelExpiredRound(contentId, roundId);

        _commit(voter1, contentId, true, STAKE);
        uint256 newRoundId = engine.getActiveRoundId(contentId);
        assertGt(newRoundId, roundId);
    }

    // =========================================================================
    // 19. REWARD CLAIM: loser gets nothing (only event)
    // =========================================================================

    function test_RewardClaim_Loser_GetsNothing() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        uint256 balanceBefore = crepToken.balanceOf(voter3);

        // voter3 voted false (down) but up won
        vm.prank(voter3);
        rewardDistributor.claimReward(contentId, roundId);

        uint256 balanceAfter = crepToken.balanceOf(voter3);
        // Loser gets nothing — balance unchanged
        assertEq(balanceAfter, balanceBefore);
    }

    // =========================================================================
    // 20. REWARD CLAIM: double claim reverts
    // =========================================================================

    function test_RewardClaim_DoubleClaim_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);

        vm.prank(voter1);
        vm.expectRevert("Already claimed");
        rewardDistributor.claimReward(contentId, roundId);
    }

    // =========================================================================
    // 21. REWARD CLAIM: non-voter reverts
    // =========================================================================

    function test_RewardClaim_NonVoter_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        vm.prank(voter6); // Never voted
        vm.expectRevert("No vote found");
        rewardDistributor.claimReward(contentId, roundId);
    }

    // =========================================================================
    // 22. REWARD CLAIM: round not settled reverts
    // =========================================================================

    function test_RewardClaim_NotSettled_Reverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);
        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.prank(voter1);
        vm.expectRevert("Round not settled");
        rewardDistributor.claimReward(contentId, roundId);
    }

    // =========================================================================
    // 23. SUBMITTER REWARD: non-submitter reverts
    // =========================================================================

    function test_SubmitterReward_NonSubmitter_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        vm.prank(voter1); // Not the submitter
        vm.expectRevert("Not submitter");
        rewardDistributor.claimSubmitterReward(contentId, roundId);
    }

    // =========================================================================
    // 24. SUBMITTER REWARD: double claim reverts
    // =========================================================================

    function test_SubmitterReward_DoubleClaim_Reverts() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        vm.prank(submitter);
        rewardDistributor.claimSubmitterReward(contentId, roundId);

        vm.prank(submitter);
        vm.expectRevert("Already claimed");
        rewardDistributor.claimSubmitterReward(contentId, roundId);
    }

    // =========================================================================
    // 25. SUBMITTER REWARD: unanimous round has subsidy
    // =========================================================================

    function test_SubmitterReward_UnanimousRound_HasSubsidy() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, true);
        engine.settleRound(contentId, roundId);

        uint256 pending = engine.pendingSubmitterReward(contentId, roundId);
        // Unanimous rounds get consensus subsidy split into voter+submitter
        assertGt(pending, 0);

        uint256 balanceBefore = crepToken.balanceOf(submitter);

        vm.prank(submitter);
        rewardDistributor.claimSubmitterReward(contentId, roundId);

        uint256 balanceAfter = crepToken.balanceOf(submitter);
        assertEq(balanceAfter - balanceBefore, pending);
    }

    // =========================================================================
    // 26. REFUND ON TIED ROUND
    // =========================================================================

    function test_Refund_TiedRound_ReturnsStake() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, true, STAKE);
        (bytes32 ck4, bytes32 s4) = _commit(voter4, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);
        RoundLib.Round memory r0 = engine.getRound(contentId, roundId);
        vm.warp(r0.startTime + EPOCH + 1);

        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, false, s2);
        _reveal(contentId, roundId, ck3, true, s3);
        _reveal(contentId, roundId, ck4, false, s4);

        engine.settleRound(contentId, roundId);

        uint256 balanceBefore = crepToken.balanceOf(voter1);

        vm.prank(voter1);
        engine.claimCancelledRoundRefund(contentId, roundId);

        uint256 balanceAfter = crepToken.balanceOf(voter1);
        assertEq(balanceAfter - balanceBefore, STAKE);
    }

    // =========================================================================
    // 27. WINNER REWARD CLAIM: gets stake + reward
    // =========================================================================

    function test_RewardClaim_Winner_GetsStakePlusReward() public {
        (uint256 contentId, uint256 roundId) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        uint256 balanceBefore = crepToken.balanceOf(voter1);

        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);

        uint256 balanceAfter = crepToken.balanceOf(voter1);
        // Winner gets at least their stake back + some reward from losing pool
        assertGt(balanceAfter - balanceBefore, STAKE);
    }

    // =========================================================================
    // 28. ASYMMETRIC STAKES: higher stake winner gets proportionally more
    // =========================================================================

    function test_Settle_AsymmetricStakes_ProportionalRewards() public {
        uint256 contentId = _submitContent();

        // voter1 stakes 10 cREP (up), voter2 stakes 5 cREP (up), voter3 stakes 5 cREP (down)
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, 10e6);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);
        RoundLib.Round memory r0 = engine.getRound(contentId, roundId);
        vm.warp(r0.startTime + EPOCH + 1);

        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, true, s2);
        _reveal(contentId, roundId, ck3, false, s3);

        engine.settleRound(contentId, roundId);

        uint256 bal1Before = crepToken.balanceOf(voter1);
        uint256 bal2Before = crepToken.balanceOf(voter2);

        vm.prank(voter1);
        rewardDistributor.claimReward(contentId, roundId);
        vm.prank(voter2);
        rewardDistributor.claimReward(contentId, roundId);

        uint256 reward1 = crepToken.balanceOf(voter1) - bal1Before;
        uint256 reward2 = crepToken.balanceOf(voter2) - bal2Before;

        // voter1 staked 2x, so should get a larger reward
        assertGt(reward1, reward2);
    }
}
