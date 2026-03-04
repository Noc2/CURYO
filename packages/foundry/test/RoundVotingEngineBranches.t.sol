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
    RoundVotingEngine public engine;
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

    uint256 public constant STAKE = 5e6; // 5 cREP
    uint256 public constant T0 = 1_000_000; // setUp warp time
    uint256 public constant EPOCH = 1 hours; // epochDuration

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

        // ciphertext validation is plaintext-based on chainid 31337 (65 bytes)
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

        mockVoterIdNFT = new MockVoterIdNFT_RVE();

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

        address[9] memory users = [submitter, voter1, voter2, voter3, voter4, voter5, voter6, frontend1, delegate1];
        for (uint256 i = 0; i < users.length; i++) {
            crepToken.mint(users[i], 10_000e6);
        }

        vm.stopPrank();
    }

    // =========================================================================
    // TEST HELPERS
    // =========================================================================

    /// @dev Commit a vote in test mode and return (commitKey, salt).
    function _commit(address voter, uint256 contentId, bool isUp, uint256 stake)
        internal
        returns (bytes32 commitKey, bytes32 salt)
    {
        salt = keccak256(abi.encodePacked(voter, block.timestamp));
        bytes32 commitHash = keccak256(abi.encodePacked(isUp, salt, contentId));
        bytes memory ciphertext = abi.encodePacked(uint8(isUp ? 1 : 0), salt, contentId);
        vm.prank(voter);
        crepToken.approve(address(engine), stake);
        vm.prank(voter);
        engine.commitVote(contentId, commitHash, ciphertext, stake, address(0));
        commitKey = keccak256(abi.encodePacked(voter, commitHash));
    }

    /// @dev Commit with a specific frontend address.
    function _commitWithFrontend(address voter, uint256 contentId, bool isUp, uint256 stake, address frontend)
        internal
        returns (bytes32 commitKey, bytes32 salt)
    {
        salt = keccak256(abi.encodePacked(voter, block.timestamp));
        bytes32 commitHash = keccak256(abi.encodePacked(isUp, salt, contentId));
        bytes memory ciphertext = abi.encodePacked(uint8(isUp ? 1 : 0), salt, contentId);
        vm.prank(voter);
        crepToken.approve(address(engine), stake);
        vm.prank(voter);
        engine.commitVote(contentId, commitHash, ciphertext, stake, frontend);
        commitKey = keccak256(abi.encodePacked(voter, commitHash));
    }

    /// @dev Reveal a vote by commit key. Permissionless — no prank needed.
    function _reveal(uint256 contentId, uint256 roundId, bytes32 commitKey, bool isUp, bytes32 salt) internal {
        engine.revealVoteByCommitKey(contentId, roundId, commitKey, isUp, salt);
    }

    /// @dev Submit content as `submitter` and return contentId.
    function _submitContent() internal returns (uint256 contentId) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent("https://example.com/1", "test goal", "test", 0);
        vm.stopPrank();
        contentId = 1;
    }

    /// @dev Submit content with a custom URL.
    function _submitContentWithUrl(string memory url) internal returns (uint256) {
        vm.startPrank(submitter);
        crepToken.approve(address(registry), 10e6);
        registry.submitContent(url, "test goal", "test", 0);
        vm.stopPrank();
        return registry.nextContentId() - 1;
    }

    /// @dev Register and approve a frontend operator.
    function _registerFrontend(address fe) internal {
        vm.startPrank(fe);
        crepToken.approve(address(frontendRegistry), 1000e6);
        frontendRegistry.register();
        vm.stopPrank();
        vm.prank(owner);
        frontendRegistry.approveFrontend(fe);
    }

    /// @dev Full 3-voter round lifecycle: commit all epoch-1, warp past epoch, reveal all, warp settle delay, settle.
    /// Returns (contentId, roundId, commitKey1, salt1, commitKey2, salt2, commitKey3, salt3).
    function _setupThreeVoterRound(bool v1Up, bool v2Up, bool v3Up)
        internal
        returns (
            uint256 contentId,
            uint256 roundId,
            bytes32 ck1,
            bytes32 s1,
            bytes32 ck2,
            bytes32 s2,
            bytes32 ck3,
            bytes32 s3
        )
    {
        contentId = _submitContent();

        (ck1, s1) = _commit(voter1, contentId, v1Up, STAKE);
        (ck2, s2) = _commit(voter2, contentId, v2Up, STAKE);
        (ck3, s3) = _commit(voter3, contentId, v3Up, STAKE);

        roundId = engine.getActiveRoundId(contentId);

        // Warp past epoch end so votes become revealable
        RoundLib.Round memory r0 = engine.getRound(contentId, roundId);
        vm.warp(r0.startTime + EPOCH + 1);

        _reveal(contentId, roundId, ck1, v1Up, s1);
        _reveal(contentId, roundId, ck2, v2Up, s2);
        _reveal(contentId, roundId, ck3, v3Up, s3);

    }

    // =========================================================================
    // 1. BASIC ROUND LIFECYCLE: commit -> reveal -> settle (3 voters, epoch 1)
    // =========================================================================

    function test_BasicLifecycle_ThreeVoters_UpWins() public {
        (uint256 contentId, uint256 roundId,,,,,,) = _setupThreeVoterRound(true, true, false);

        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
        assertTrue(round.upWins);
        assertGt(round.settledAt, 0);
    }

    function test_BasicLifecycle_ThreeVoters_DownWins() public {
        (uint256 contentId, uint256 roundId,,,,,,) = _setupThreeVoterRound(true, false, false);

        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
        assertFalse(round.upWins);
    }

    function test_BasicLifecycle_VoteCountersUpdated() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);
        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(round.voteCount, 2);
        assertEq(round.totalStake, STAKE * 2);

        // Warp past epoch and reveal
        vm.warp(block.timestamp + EPOCH + 1);
        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, false, s2);

        round = engine.getRound(contentId, roundId);
        assertEq(round.revealedCount, 2);
        assertEq(round.upPool, STAKE);
        assertEq(round.downPool, STAKE);
        assertEq(round.upCount, 1);
        assertEq(round.downCount, 1);
    }

    function test_BasicLifecycle_CommitHashTracked() public {
        uint256 contentId = _submitContent();

        bool isUp = true;
        bytes32 salt = keccak256(abi.encodePacked(voter1, block.timestamp));
        bytes32 commitHash = keccak256(abi.encodePacked(isUp, salt, contentId));
        bytes memory ciphertext = abi.encodePacked(uint8(1), salt, contentId);

        vm.prank(voter1);
        crepToken.approve(address(engine), STAKE);
        vm.prank(voter1);
        engine.commitVote(contentId, commitHash, ciphertext, STAKE, address(0));

        uint256 roundId = engine.getActiveRoundId(contentId);
        assertEq(engine.voterCommitHash(contentId, roundId, voter1), commitHash);
        assertTrue(engine.hasCommitted(contentId, roundId, voter1));
    }

    function test_BasicLifecycle_ContentCommitCountIncrement() public {
        uint256 contentId = _submitContent();

        _commit(voter1, contentId, true, STAKE);
        assertEq(engine.getContentCommitCount(contentId), 1);

        _commit(voter2, contentId, false, STAKE);
        assertEq(engine.getContentCommitCount(contentId), 2);
    }

    function test_BasicLifecycle_VoterPoolAndWinningStake() public {
        (uint256 contentId, uint256 roundId,,,,,,) = _setupThreeVoterRound(true, true, false);

        engine.settleRound(contentId, roundId);

        uint256 voterPool = engine.roundVoterPool(contentId, roundId);
        uint256 winningStake = engine.roundWinningStake(contentId, roundId);
        assertGt(voterPool, 0);
        assertGt(winningStake, 0);
    }

    function test_BasicLifecycle_SettlementSetsTimestamp() public {
        (uint256 contentId, uint256 roundId,,,,,,) = _setupThreeVoterRound(true, true, false);

        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertGt(round.settledAt, 0);
    }

    // =========================================================================
    // 2. ROUND EXPIRY / CANCELLATION (minVoters not reached)
    // =========================================================================

    function test_CancelExpired_SucceedsAfterMaxDuration() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);
        _commit(voter2, contentId, false, STAKE);
        // Only 2 commits — minVoters=3 not reached

        uint256 roundId = engine.getActiveRoundId(contentId);

        // Warp past 7-day max duration
        vm.warp(block.timestamp + 7 days + 1);

        engine.cancelExpiredRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Cancelled));
    }

    function test_CancelExpired_RevertsBeforeExpiry() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);

        // Only 1 day elapsed
        vm.warp(block.timestamp + 1 days);

        vm.expectRevert(RoundVotingEngine.RoundNotExpired.selector);
        engine.cancelExpiredRound(contentId, roundId);
    }

    function test_CancelExpired_RevertsIfThresholdAlreadyReached() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);

        // Warp past epoch and reveal all (threshold reached)
        vm.warp(block.timestamp + EPOCH + 1);
        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, true, s2);
        _reveal(contentId, roundId, ck3, false, s3);

        // Warp past max duration — but threshold was reached so cancel should fail
        vm.warp(block.timestamp + 7 days + 1);

        vm.expectRevert(RoundVotingEngine.ThresholdReached.selector);
        engine.cancelExpiredRound(contentId, roundId);
    }

    function test_CancelExpired_RevertsIfRoundNotOpen() public {
        (uint256 contentId, uint256 roundId,,,,,,) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        vm.expectRevert(RoundVotingEngine.RoundNotOpen.selector);
        engine.cancelExpiredRound(contentId, roundId);
    }

    // =========================================================================
    // 3. CANNOT COMMIT TWICE TO THE SAME ROUND
    // =========================================================================

    function test_CommitTwice_SameRound_Reverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        // voter1 tries to commit again within the same round (cooldown also applies)
        // The cooldown check fires first; warp past cooldown to isolate AlreadyCommitted
        // Actually: hasCommitted check fires before cooldown is re-checked on second call
        // In the contract: cooldown check fires FIRST (lastVoteTimestamp > 0 and within 24h)
        // So we need to check CooldownActive fires first
        vm.startPrank(voter1);
        bytes32 salt2 = keccak256(abi.encodePacked(voter1, block.timestamp + 1));
        bytes32 commitHash2 = keccak256(abi.encodePacked(true, salt2, contentId));
        bytes memory ciphertext2 = abi.encodePacked(uint8(1), salt2, contentId);
        crepToken.approve(address(engine), STAKE);
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        engine.commitVote(contentId, commitHash2, ciphertext2, STAKE, address(0));
        vm.stopPrank();
    }

    function test_CommitTwice_AfterCooldown_SameRound_RevertsAlreadyCommitted() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);

        // Warp past 24h cooldown — but round is still open and voter already committed
        vm.warp(block.timestamp + 25 hours);

        vm.startPrank(voter1);
        bytes32 salt2 = keccak256(abi.encodePacked(voter1, block.timestamp));
        bytes32 commitHash2 = keccak256(abi.encodePacked(true, salt2, contentId));
        bytes memory ciphertext2 = abi.encodePacked(uint8(1), salt2, contentId);
        crepToken.approve(address(engine), STAKE);
        vm.expectRevert(RoundVotingEngine.AlreadyCommitted.selector);
        engine.commitVote(contentId, commitHash2, ciphertext2, STAKE, address(0));
        vm.stopPrank();
    }

    // =========================================================================
    // 4. CANNOT REVEAL BEFORE EPOCH ENDS (EpochNotEnded)
    // =========================================================================

    function test_Reveal_BeforeEpochEnd_Reverts() public {
        uint256 contentId = _submitContent();

        (bytes32 commitKey, bytes32 salt) = _commit(voter1, contentId, true, STAKE);
        uint256 roundId = engine.getActiveRoundId(contentId);

        // Do NOT warp — epoch has not ended yet
        vm.expectRevert(RoundVotingEngine.EpochNotEnded.selector);
        engine.revealVoteByCommitKey(contentId, roundId, commitKey, true, salt);
    }

    function test_Reveal_ExactlyAtEpochEnd_Succeeds() public {
        uint256 contentId = _submitContent();

        (bytes32 commitKey, bytes32 salt) = _commit(voter1, contentId, true, STAKE);
        uint256 roundId = engine.getActiveRoundId(contentId);

        // Warp to exactly one second after epoch end
        vm.warp(block.timestamp + EPOCH + 1);

        // Should not revert
        engine.revealVoteByCommitKey(contentId, roundId, commitKey, true, salt);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(round.revealedCount, 1);
    }

    // =========================================================================
    // 5. WRONG HASH ON REVEAL (HashMismatch)
    // =========================================================================

    function test_Reveal_WrongIsUp_HashMismatch() public {
        uint256 contentId = _submitContent();

        // Commit as isUp=true
        (bytes32 commitKey, bytes32 salt) = _commit(voter1, contentId, true, STAKE);
        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + EPOCH + 1);

        // Reveal with isUp=false (wrong direction — hash won't match)
        vm.expectRevert(RoundVotingEngine.HashMismatch.selector);
        engine.revealVoteByCommitKey(contentId, roundId, commitKey, false, salt);
    }

    function test_Reveal_WrongSalt_HashMismatch() public {
        uint256 contentId = _submitContent();

        (bytes32 commitKey,) = _commit(voter1, contentId, true, STAKE);
        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + EPOCH + 1);

        bytes32 wrongSalt = keccak256("wrong");
        vm.expectRevert(RoundVotingEngine.HashMismatch.selector);
        engine.revealVoteByCommitKey(contentId, roundId, commitKey, true, wrongSalt);
    }

    function test_Reveal_NonExistentCommitKey_Reverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);
        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + EPOCH + 1);

        bytes32 badKey = keccak256("bogus");
        vm.expectRevert(RoundVotingEngine.NoCommit.selector);
        engine.revealVoteByCommitKey(contentId, roundId, badKey, true, bytes32(0));
    }

    function test_Reveal_AlreadyRevealed_Reverts() public {
        uint256 contentId = _submitContent();

        (bytes32 commitKey, bytes32 salt) = _commit(voter1, contentId, true, STAKE);
        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + EPOCH + 1);
        _reveal(contentId, roundId, commitKey, true, salt);

        // Try to reveal again
        vm.expectRevert(RoundVotingEngine.AlreadyRevealed.selector);
        engine.revealVoteByCommitKey(contentId, roundId, commitKey, true, salt);
    }

    // =========================================================================
    // 6. IMMEDIATE SETTLEMENT AFTER THRESHOLD
    // =========================================================================

    function test_Settle_ImmediatelyAfterThreshold_Succeeds() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);

        // Warp past epoch and reveal all
        vm.warp(block.timestamp + EPOCH + 1);
        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, true, s2);
        _reveal(contentId, roundId, ck3, false, s3);

        // Settlement succeeds immediately after minVoters revealed — no delay required
        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
    }

    function test_Settle_AfterDelay_Succeeds() public {
        (uint256 contentId, uint256 roundId,,,,,,) = _setupThreeVoterRound(true, true, false);

        // Settlement succeeds immediately after reveals in _setupThreeVoterRound
        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
    }

    function test_Settle_NotEnoughVoters_Reverts() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);
        // Only 2 voters, minVoters=3

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + EPOCH + 1);
        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, false, s2);

        vm.warp(block.timestamp + EPOCH + 1);

        vm.expectRevert(RoundVotingEngine.NotEnoughVotes.selector);
        engine.settleRound(contentId, roundId);
    }

    function test_Settle_RoundNotOpen_Reverts() public {
        (uint256 contentId, uint256 roundId,,,,,,) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        // Try to settle again
        vm.expectRevert(RoundVotingEngine.RoundNotOpen.selector);
        engine.settleRound(contentId, roundId);
    }

    // =========================================================================
    // 7. TIED ROUND (equal weighted pools)
    // =========================================================================

    function test_TiedRound_EqualPools_StateIsTied() public {
        uint256 contentId = _submitContent();

        // 1 UP, 1 DOWN with same stake and same epoch weight -> equal weighted pools
        // We need at least 3 voters for minVoters. Use 2 UP + 2 DOWN but same stake.
        // To get tied: 2 UP voters at STAKE + 1 DOWN voter at 2*STAKE, or simply 1 UP + 1 DOWN
        // with minVoters=3 we need at least 3 reveals. Let's do 2 UP + 2 DOWN for a tie with equal stakes.
        // But minVoters=3 so we need 3 reveals.
        // Tie: 1.5 UP vs 1.5 DOWN effectively -- let's do STAKE on each side * matching counts.
        // Simplest: voter1 UP STAKE, voter2 DOWN STAKE, voter3 UP STAKE... that's 2 UP 1 DOWN no tie.
        // For a tie with 3 voters: voter1 UP 2*STAKE, voter2 DOWN 2*STAKE + voter3 UP 2*STAKE... no.
        // Tie means weightedUpPool == weightedDownPool. All epoch-1 (weight=100%).
        // We need sum(UP stakes) == sum(DOWN stakes).
        // 3 voters: voter1 UP 2e6, voter2 DOWN 3e6, voter3 UP 1e6 -> up=3e6, down=3e6 -> TIE.
        uint256 s1 = 2e6;
        uint256 s2 = 3e6;
        uint256 s3 = 1e6;

        (bytes32 ck1, bytes32 salt1) = _commit(voter1, contentId, true, s1);
        (bytes32 ck2, bytes32 salt2) = _commit(voter2, contentId, false, s2);
        (bytes32 ck3, bytes32 salt3) = _commit(voter3, contentId, true, s3);

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + EPOCH + 1);
        _reveal(contentId, roundId, ck1, true, salt1);
        _reveal(contentId, roundId, ck2, false, salt2);
        _reveal(contentId, roundId, ck3, true, salt3);

        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied));
    }

    function test_TiedRound_EvenStake_ThreeVoters() public {
        uint256 contentId = _submitContent();

        // voter1 UP 2*STAKE, voter2 DOWN STAKE, voter3 DOWN STAKE -> up pool = 2*STAKE, down pool = 2*STAKE => TIE
        uint256 upStake = 2 * STAKE;
        uint256 downStake = STAKE;

        (bytes32 ck1, bytes32 salt1) = _commit(voter1, contentId, true, upStake);
        (bytes32 ck2, bytes32 salt2) = _commit(voter2, contentId, false, downStake);
        (bytes32 ck3, bytes32 salt3) = _commit(voter3, contentId, false, downStake);

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + EPOCH + 1);
        _reveal(contentId, roundId, ck1, true, salt1);
        _reveal(contentId, roundId, ck2, false, salt2);
        _reveal(contentId, roundId, ck3, false, salt3);

        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied));
    }

    // =========================================================================
    // 8. CANCELLED ROUND REFUND
    // =========================================================================

    function test_CancelledRefund_ClaimSucceeds() public {
        uint256 contentId = _submitContent();

        _commit(voter1, contentId, true, STAKE);
        _commit(voter2, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + 7 days + 1);
        engine.cancelExpiredRound(contentId, roundId);

        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        engine.claimCancelledRoundRefund(contentId, roundId);
        uint256 balAfter = crepToken.balanceOf(voter1);

        assertEq(balAfter - balBefore, STAKE);
    }

    function test_CancelledRefund_CannotClaimTwice() public {
        uint256 contentId = _submitContent();

        _commit(voter1, contentId, true, STAKE);
        _commit(voter2, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + 7 days + 1);
        engine.cancelExpiredRound(contentId, roundId);

        vm.prank(voter1);
        engine.claimCancelledRoundRefund(contentId, roundId);

        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        engine.claimCancelledRoundRefund(contentId, roundId);
    }

    function test_CancelledRefund_NonParticipantReverts() public {
        uint256 contentId = _submitContent();

        _commit(voter1, contentId, true, STAKE);
        _commit(voter2, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + 7 days + 1);
        engine.cancelExpiredRound(contentId, roundId);

        vm.prank(voter3);
        vm.expectRevert(RoundVotingEngine.NoCommit.selector);
        engine.claimCancelledRoundRefund(contentId, roundId);
    }

    function test_CancelledRefund_RequiresCancelledOrTiedState() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);
        _commit(voter2, contentId, false, STAKE);
        uint256 roundId = engine.getActiveRoundId(contentId);

        // Round is still Open — should revert
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.RoundNotCancelledOrTied.selector);
        engine.claimCancelledRoundRefund(contentId, roundId);
    }

    function test_TiedRefund_ClaimSucceeds() public {
        uint256 contentId = _submitContent();

        // 2 UP 2 DOWN same stake -> tie (4 voters, all equal weight)
        uint256 up = STAKE;
        uint256 dn = STAKE;
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, up);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, dn);
        // Use a different stake to force a 3-voter tie: up=STAKE, down=STAKE via voter2, voter3
        // Actually equal total: voter1 UP STAKE, voter2 DOWN STAKE is a 2-voter situation.
        // We need 3. Use voter1 UP 2*STAKE, voter2 DOWN STAKE, voter3 DOWN STAKE.
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, true, up);
        // up = 2*STAKE, down = STAKE -> NOT tied. Redo.

        // Reset contentId for a fresh tied scenario
        // voter4 is our 3rd voter for this content
        // Already committed 3 (voter1, voter2, voter3) above with 2UP 1DOWN -> not tied
        // Let's use a second content for clarity
        uint256 cid2 = _submitContentWithUrl("https://example.com/tied");

        uint256 tieStake = 2e6;
        (bytes32 tck1, bytes32 ts1) = _commit(voter4, cid2, true, tieStake);
        (bytes32 tck2, bytes32 ts2) = _commit(voter5, cid2, false, tieStake);
        (bytes32 tck3, bytes32 ts3) = _commit(voter6, cid2, true, tieStake);
        // up = 2*tieStake, down = tieStake -> NOT tied

        // Use content 3 with truly equal pools
        uint256 cid3 = _submitContentWithUrl("https://example.com/tied2");
        uint256 stakeUp = 2e6;
        uint256 stakeDown = 3e6;
        uint256 stakeUp2 = 1e6;

        (bytes32 xck1, bytes32 xs1) = _commit(voter1, cid3, true, stakeUp);
        (bytes32 xck2, bytes32 xs2) = _commit(voter2, cid3, false, stakeDown);
        (bytes32 xck3, bytes32 xs3) = _commit(voter3, cid3, true, stakeUp2);

        uint256 xRoundId = engine.getActiveRoundId(cid3);

        vm.warp(block.timestamp + EPOCH + 1);
        _reveal(cid3, xRoundId, xck1, true, xs1);
        _reveal(cid3, xRoundId, xck2, false, xs2);
        _reveal(cid3, xRoundId, xck3, true, xs3);

        engine.settleRound(cid3, xRoundId);

        RoundLib.Round memory round = engine.getRound(cid3, xRoundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied));

        // voter1 claims refund from tied round
        uint256 balBefore = crepToken.balanceOf(voter1);
        vm.prank(voter1);
        engine.claimCancelledRoundRefund(cid3, xRoundId);
        uint256 balAfter = crepToken.balanceOf(voter1);

        assertEq(balAfter - balBefore, stakeUp);
    }

    // =========================================================================
    // 9. FRONTEND FEE CLAIMING
    // =========================================================================

    function test_FrontendFee_ApprovedFrontend_FeeAccumulated() public {
        _registerFrontend(frontend1);

        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commitWithFrontend(voter1, contentId, true, STAKE, frontend1);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);

        // Reveal after epoch
        vm.warp(block.timestamp + EPOCH + 1);
        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, true, s2);
        _reveal(contentId, roundId, ck3, false, s3);

        // Frontend stake tracked at reveal time
        uint256 fStake = engine.roundStakeWithApprovedFrontend(contentId, roundId);
        assertEq(fStake, STAKE); // only voter1 used approved frontend

        engine.settleRound(contentId, roundId);

        uint256 frontendPool = engine.roundFrontendPool(contentId, roundId);
        assertGt(frontendPool, 0);
    }

    function test_FrontendFee_ClaimSucceeds() public {
        _registerFrontend(frontend1);

        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commitWithFrontend(voter1, contentId, true, STAKE, frontend1);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + EPOCH + 1);
        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, true, s2);
        _reveal(contentId, roundId, ck3, false, s3);

        engine.settleRound(contentId, roundId);

        uint256 feesBefore = frontendRegistry.getAccumulatedFees(frontend1);
        engine.claimFrontendFee(contentId, roundId, frontend1);
        uint256 feesAfter = frontendRegistry.getAccumulatedFees(frontend1);

        assertGt(feesAfter - feesBefore, 0);
        assertTrue(engine.isFrontendFeeClaimed(contentId, roundId, frontend1));
    }

    function test_FrontendFee_CannotClaimTwice() public {
        _registerFrontend(frontend1);

        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commitWithFrontend(voter1, contentId, true, STAKE, frontend1);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + EPOCH + 1);
        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, true, s2);
        _reveal(contentId, roundId, ck3, false, s3);

        engine.settleRound(contentId, roundId);

        engine.claimFrontendFee(contentId, roundId, frontend1);

        vm.expectRevert(RoundVotingEngine.AlreadyClaimed.selector);
        engine.claimFrontendFee(contentId, roundId, frontend1);
    }

    function test_FrontendFee_NoApprovedFrontends_PoolIsZero() public {
        (uint256 contentId, uint256 roundId,,,,,,) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        uint256 frontendPool = engine.roundFrontendPool(contentId, roundId);
        assertEq(frontendPool, 0);
    }

    function test_FrontendFee_UnapprovedFrontend_NotTracked() public {
        // Register but do NOT approve
        vm.startPrank(frontend1);
        crepToken.approve(address(frontendRegistry), 1000e6);
        frontendRegistry.register();
        vm.stopPrank();

        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commitWithFrontend(voter1, contentId, true, STAKE, frontend1);
        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + EPOCH + 1);
        _reveal(contentId, roundId, ck1, true, s1);

        uint256 fStake = engine.roundStakeWithApprovedFrontend(contentId, roundId);
        assertEq(fStake, 0);
    }

    function test_FrontendFee_ClaimReverts_RoundNotSettled() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);
        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.expectRevert(RoundVotingEngine.RoundNotSettled.selector);
        engine.claimFrontendFee(contentId, roundId, frontend1);
    }

    function test_FrontendFee_ClaimReverts_NoPool() public {
        (uint256 contentId, uint256 roundId,,,,,,) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        // No frontend pool (no approved frontends were used)
        vm.expectRevert(RoundVotingEngine.NoPool.selector);
        engine.claimFrontendFee(contentId, roundId, frontend1);
    }

    // =========================================================================
    // 10. processUnrevealedVotes
    // =========================================================================

    function test_ProcessUnrevealed_ForfeitsOldEpochUnrevealedVotes() public {
        uint256 contentId = _submitContent();

        // voter1 commits but never reveals — forfeited after settlement (old epoch = epoch 1)
        _commit(voter1, contentId, true, STAKE);

        // voter2, voter3, voter4 commit and reveal (3 = minVoters)
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, false, STAKE);
        (bytes32 ck4, bytes32 s4) = _commit(voter4, contentId, true, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);

        // Warp past epoch
        RoundLib.Round memory rPU1start = engine.getRound(contentId, roundId);
        vm.warp(rPU1start.startTime + EPOCH + 1);

        _reveal(contentId, roundId, ck2, true, s2);
        _reveal(contentId, roundId, ck3, false, s3);
        _reveal(contentId, roundId, ck4, true, s4);

        // voter1's revealableAfter is in the past relative to settlement — forfeited
        engine.settleRound(contentId, roundId);

        uint256 treasuryBefore = crepToken.balanceOf(treasury);
        engine.processUnrevealedVotes(contentId, roundId, 0, 0);
        uint256 treasuryAfter = crepToken.balanceOf(treasury);

        // voter1's stake should have been sent to treasury
        assertGt(treasuryAfter - treasuryBefore, 0);
    }

    function test_ProcessUnrevealed_RefundsCurrentEpochVotes() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);

        // Warp past epoch 1 (absolute time) — voter1/2/3 votes become revealable
        RoundLib.Round memory rPU2start = engine.getRound(contentId, roundId);
        vm.warp(rPU2start.startTime + EPOCH + 1);
        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, true, s2);
        _reveal(contentId, roundId, ck3, false, s3);
        // thresholdReachedAt is set here = rPU2start.startTime + EPOCH + 1

        // Warp past epoch 2 — voter4 commits in epoch 3
        // voter4's revealableAfter = rPU2start.startTime + 3 * EPOCH
        vm.warp(rPU2start.startTime + 2 * EPOCH + 1);
        (bytes32 ck4,) = _commit(voter4, contentId, true, STAKE);

        // settledAt = rPU2start.startTime + 2 * EPOCH + 1 (current block.timestamp)
        // voter4 revealableAfter = rPU2start.startTime + 3 * EPOCH > settledAt => REFUNDED
        engine.settleRound(contentId, roundId);

        uint256 voter4BalBefore = crepToken.balanceOf(voter4);
        engine.processUnrevealedVotes(contentId, roundId, 0, 0);
        uint256 voter4BalAfter = crepToken.balanceOf(voter4);

        // voter4 committed in epoch 3; their epoch hadn't ended at settlement => refunded
        assertEq(voter4BalAfter - voter4BalBefore, STAKE);
    }

    function test_ProcessUnrevealed_RevertsIfRoundOpen() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);
        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.expectRevert(RoundVotingEngine.RoundNotSettledOrTied.selector);
        engine.processUnrevealedVotes(contentId, roundId, 0, 0);
    }

    function test_ProcessUnrevealed_AllRevealed_NoOp() public {
        (uint256 contentId, uint256 roundId,,,,,,) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        uint256 treasuryBefore = crepToken.balanceOf(treasury);
        engine.processUnrevealedVotes(contentId, roundId, 0, 0);
        uint256 treasuryAfter = crepToken.balanceOf(treasury);

        // All votes revealed — nothing to process
        assertEq(treasuryAfter, treasuryBefore);
    }

    function test_ProcessUnrevealed_IndexOutOfBounds_Reverts() public {
        (uint256 contentId, uint256 roundId,,,,,,) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        // startIndex > commitKeys.length
        vm.expectRevert(RoundVotingEngine.IndexOutOfBounds.selector);
        engine.processUnrevealedVotes(contentId, roundId, 999, 1);
    }

    function test_ProcessUnrevealed_TiedRound_RefundsUnrevealed() public {
        // Set up a tied round; any unrevealed votes should be refunded in tied state
        uint256 contentId = _submitContent();

        // voter4 will commit but NOT reveal
        _commit(voter4, contentId, true, STAKE);

        // 3-voter tie: up=2e6, down=3e6, up=1e6
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, 2e6);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, 3e6);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, true, 1e6);

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + EPOCH + 1);
        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, false, s2);
        _reveal(contentId, roundId, ck3, true, s3);
        // voter4's vote is NOT revealed

        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Tied));

        uint256 voter4BalBefore = crepToken.balanceOf(voter4);
        engine.processUnrevealedVotes(contentId, roundId, 0, 0);
        uint256 voter4BalAfter = crepToken.balanceOf(voter4);

        // In tied rounds, all unrevealed votes are refunded
        assertEq(voter4BalAfter - voter4BalBefore, STAKE);
    }

    // =========================================================================
    // ADDITIONAL BRANCH COVERAGE
    // =========================================================================

    function test_Commit_InvalidStake_BelowMin_Reverts() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, block.timestamp));
        bytes32 commitHash = keccak256(abi.encodePacked(true, salt, contentId));
        bytes memory ciphertext = abi.encodePacked(uint8(1), salt, contentId);

        vm.prank(voter1);
        crepToken.approve(address(engine), 1e5);
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        engine.commitVote(contentId, commitHash, ciphertext, 1e5, address(0));
    }

    function test_Commit_InvalidStake_AboveMax_Reverts() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, block.timestamp));
        bytes32 commitHash = keccak256(abi.encodePacked(true, salt, contentId));
        bytes memory ciphertext = abi.encodePacked(uint8(1), salt, contentId);

        vm.prank(voter1);
        crepToken.approve(address(engine), 101e6);
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.InvalidStake.selector);
        engine.commitVote(contentId, commitHash, ciphertext, 101e6, address(0));
    }

    function test_Commit_ContentNotActive_Reverts() public {
        uint256 contentId = _submitContent();

        vm.prank(owner);
        registry.setBonusPool(address(100));
        vm.prank(submitter);
        registry.cancelContent(contentId);

        bytes32 salt = keccak256(abi.encodePacked(voter1, block.timestamp));
        bytes32 commitHash = keccak256(abi.encodePacked(true, salt, contentId));
        bytes memory ciphertext = abi.encodePacked(uint8(1), salt, contentId);

        vm.prank(voter1);
        crepToken.approve(address(engine), STAKE);
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.ContentNotActive.selector);
        engine.commitVote(contentId, commitHash, ciphertext, STAKE, address(0));
    }

    function test_Commit_SelfVote_SubmitterReverts() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(submitter, block.timestamp));
        bytes32 commitHash = keccak256(abi.encodePacked(true, salt, contentId));
        bytes memory ciphertext = abi.encodePacked(uint8(1), salt, contentId);

        vm.prank(submitter);
        crepToken.approve(address(engine), STAKE);
        vm.prank(submitter);
        vm.expectRevert(RoundVotingEngine.SelfVote.selector);
        engine.commitVote(contentId, commitHash, ciphertext, STAKE, address(0));
    }

    function test_Commit_CooldownActive_Reverts() public {
        uint256 contentId = _submitContent();

        // voter1 commits — starts 24h cooldown
        _commit(voter1, contentId, true, STAKE);

        // voter1 immediately tries to commit again (within 24h) — should get CooldownActive
        vm.startPrank(voter1);
        bytes32 salt = keccak256(abi.encodePacked(voter1, block.timestamp + 1));
        bytes32 commitHash = keccak256(abi.encodePacked(false, salt, contentId));
        bytes memory ciphertext = abi.encodePacked(uint8(0), salt, contentId);
        crepToken.approve(address(engine), STAKE);
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        engine.commitVote(contentId, commitHash, ciphertext, STAKE, address(0));
        vm.stopPrank();
    }

    function test_Commit_RoundNotAccepting_ExpiredRound_Reverts() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        // Warp past 7-day max duration
        vm.warp(block.timestamp + 8 days);

        bytes32 salt = keccak256(abi.encodePacked(voter2, block.timestamp));
        bytes32 commitHash = keccak256(abi.encodePacked(true, salt, contentId));
        bytes memory ciphertext = abi.encodePacked(uint8(1), salt, contentId);

        vm.prank(voter2);
        crepToken.approve(address(engine), STAKE);
        vm.prank(voter2);
        vm.expectRevert(RoundVotingEngine.RoundNotAccepting.selector);
        engine.commitVote(contentId, commitHash, ciphertext, STAKE, address(0));
    }

    function test_Commit_EmptyCiphertext_Reverts() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, block.timestamp));
        bytes32 commitHash = keccak256(abi.encodePacked(true, salt, contentId));

        vm.prank(voter1);
        crepToken.approve(address(engine), STAKE);
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.InvalidCiphertext.selector);
        engine.commitVote(contentId, commitHash, "", STAKE, address(0));
    }

    function test_Commit_OversizedCiphertext_Reverts() public {
        uint256 contentId = _submitContent();

        bytes32 salt = keccak256(abi.encodePacked(voter1, block.timestamp));
        bytes32 commitHash = keccak256(abi.encodePacked(true, salt, contentId));
        bytes memory hugeCiphertext = new bytes(10_241); // exceeds MAX_CIPHERTEXT_SIZE

        vm.prank(voter1);
        crepToken.approve(address(engine), STAKE);
        vm.prank(voter1);
        vm.expectRevert(RoundVotingEngine.CiphertextTooLarge.selector);
        engine.commitVote(contentId, commitHash, hugeCiphertext, STAKE, address(0));
    }

    function test_Commit_MaxVotersReached_Reverts() public {
        vm.prank(owner);
        // maxVoters=3 — after 3 commits the 4th is rejected
        engine.setConfig(1 hours, 7 days, 3, 3);

        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);
        _commit(voter2, contentId, true, STAKE);
        _commit(voter3, contentId, false, STAKE);

        bytes32 salt = keccak256(abi.encodePacked(voter4, block.timestamp));
        bytes32 commitHash = keccak256(abi.encodePacked(true, salt, contentId));
        bytes memory ciphertext = abi.encodePacked(uint8(1), salt, contentId);

        vm.prank(voter4);
        crepToken.approve(address(engine), STAKE);
        vm.prank(voter4);
        vm.expectRevert(RoundVotingEngine.MaxVotersReached.selector);
        engine.commitVote(contentId, commitHash, ciphertext, STAKE, address(0));
    }

    function test_GetActiveRoundId_ReturnsZeroWithNoRound() public {
        uint256 contentId = _submitContent();
        assertEq(engine.getActiveRoundId(contentId), 0);
    }

    function test_GetActiveRoundId_ReturnsCorrectId() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);
        assertEq(engine.getActiveRoundId(contentId), 1);
    }

    function test_GetActiveRoundId_ReturnsZeroAfterSettlement() public {
        (uint256 contentId, uint256 roundId,,,,,,) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);
        assertEq(engine.getActiveRoundId(contentId), 0);
    }

    function test_NewRoundCreatedAfterSettlement() public {
        (uint256 contentId, uint256 roundId,,,,,,) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        // Wait past 24h cooldown then voter1 can commit again
        vm.warp(block.timestamp + 25 hours);
        _commit(voter1, contentId, true, STAKE);

        uint256 newRoundId = engine.getActiveRoundId(contentId);
        assertEq(newRoundId, roundId + 1);
    }

    function test_ThresholdReachedAt_SetOnMinVotersReveal() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + EPOCH + 1);
        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, true, s2);

        // Before 3rd reveal, thresholdReachedAt should be 0
        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(round.thresholdReachedAt, 0);

        uint256 beforeThirdReveal = block.timestamp;
        _reveal(contentId, roundId, ck3, false, s3);

        round = engine.getRound(contentId, roundId);
        assertEq(round.thresholdReachedAt, beforeThirdReveal);
    }

    function test_EpochWeighting_Epoch2Voters_ReducedWeight() public {
        uint256 contentId = _submitContent();

        // voter1 commits in epoch 1
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);

        // Warp past first epoch — voter2 commits in epoch 2
        RoundLib.Round memory rEW0 = engine.getRound(contentId, roundId);
        vm.warp(rEW0.startTime + EPOCH + 1);

        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, true, STAKE);

        // Warp past epoch 2: voter2/voter3 committed at T0+EPOCH+1 so their epoch ends at T0+2*EPOCH
        vm.warp(rEW0.startTime + 2 * EPOCH + 2);

        _reveal(contentId, roundId, ck1, false, s1);
        _reveal(contentId, roundId, ck2, true, s2);
        _reveal(contentId, roundId, ck3, true, s3);

        // UP gets 2 voters at 25% weight = 2 * STAKE * 0.25 = 0.5 * STAKE weighted
        // DOWN gets 1 voter at 100% weight = STAKE weighted
        // => DOWN wins despite fewer voters due to epoch-1 weight advantage

        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
        // DOWN should win: weightedDownPool = STAKE * 10000/10000 = STAKE
        // weightedUpPool = STAKE * 2500/10000 * 2 = STAKE/2
        assertFalse(round.upWins);
    }

    function test_ConsensusSettlement_UnanimousUpWins() public {
        uint256 contentId = _submitContent();

        // All UP, no DOWN -> unanimous
        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, true, STAKE);
        (bytes32 ck3, bytes32 s3) = _commit(voter3, contentId, true, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + EPOCH + 1);
        _reveal(contentId, roundId, ck1, true, s1);
        _reveal(contentId, roundId, ck2, true, s2);
        _reveal(contentId, roundId, ck3, true, s3);

        engine.settleRound(contentId, roundId);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Settled));
        assertTrue(round.upWins);

        // Consensus subsidy from reserve (losingPool == 0)
        uint256 voterPool = engine.roundVoterPool(contentId, roundId);
        assertGt(voterPool, 0);
    }

    function test_CooldownActive_SucceedsAfter24h() public {
        uint256 contentId = _submitContent();

        // voter1 commits — starts 24h cooldown
        _commit(voter1, contentId, true, STAKE);

        // Within 24h — voter1 cannot commit again
        vm.startPrank(voter1);
        bytes32 salt1 = keccak256(abi.encodePacked(voter1, block.timestamp + 1));
        bytes32 commitHash1 = keccak256(abi.encodePacked(false, salt1, contentId));
        bytes memory ciphertext1 = abi.encodePacked(uint8(0), salt1, contentId);
        crepToken.approve(address(engine), STAKE);
        vm.expectRevert(RoundVotingEngine.CooldownActive.selector);
        engine.commitVote(contentId, commitHash1, ciphertext1, STAKE, address(0));
        vm.stopPrank();

        // Warp past 24h cooldown — second round possible
        uint256 cid2 = _submitContentWithUrl("https://example.com/cooldown-test");
        vm.warp(block.timestamp + 25 hours);

        // voter1 can now commit to a different content
        (bytes32 ck2,) = _commit(voter1, cid2, true, STAKE);
        uint256 rid2 = engine.getActiveRoundId(cid2);
        assertTrue(engine.hasCommitted(cid2, rid2, voter1));
    }

    function test_Cooldown_AfterRoundSettles_VoterCanRecommit() public {
        (uint256 contentId, uint256 roundId,,,,,,) = _setupThreeVoterRound(true, true, false);
        engine.settleRound(contentId, roundId);

        // Warp past 24h cooldown
        vm.warp(block.timestamp + 25 hours);

        // voter1 can now commit to a new round
        _commit(voter1, contentId, true, STAKE);
        uint256 newRoundId = engine.getActiveRoundId(contentId);
        assertEq(newRoundId, roundId + 1);
        assertTrue(engine.hasCommitted(contentId, newRoundId, voter1));
    }

    function test_GetRound_ReturnsCorrectData() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);
        _commit(voter2, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);
        RoundLib.Round memory round = engine.getRound(contentId, roundId);

        assertEq(round.voteCount, 2);
        assertEq(round.totalStake, STAKE * 2);
        assertEq(uint256(round.state), uint256(RoundLib.RoundState.Open));
        assertGt(round.startTime, 0);
    }

    function test_GetCommit_ReturnsCorrectData() public {
        uint256 contentId = _submitContent();

        (bytes32 commitKey,) = _commit(voter1, contentId, true, STAKE);
        uint256 roundId = engine.getActiveRoundId(contentId);

        RoundLib.Commit memory commit = engine.getCommit(contentId, roundId, commitKey);
        assertEq(commit.voter, voter1);
        assertEq(commit.stakeAmount, STAKE);
        assertFalse(commit.revealed);
        assertEq(commit.epochIndex, 0); // epoch 1 -> index 0
    }

    function test_GetRoundCommitHashes_ReturnsAllKeys() public {
        uint256 contentId = _submitContent();

        _commit(voter1, contentId, true, STAKE);
        _commit(voter2, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);
        bytes32[] memory keys = engine.getRoundCommitHashes(contentId, roundId);
        assertEq(keys.length, 2);
    }

    function test_ComputeCurrentEpochEnd_NoRound_ReturnsEstimate() public {
        uint256 contentId = _submitContent();
        // No round yet
        uint256 epochEnd = engine.computeCurrentEpochEnd(contentId);
        assertApproxEqAbs(epochEnd, block.timestamp + EPOCH, 1);
    }

    function test_ComputeCurrentEpochEnd_WithRound_ReturnsCorrect() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);

        uint256 epochEnd = engine.computeCurrentEpochEnd(contentId);
        assertEq(epochEnd, T0 + EPOCH); // round.startTime + epochDuration
    }

    function test_RevealUpdatesWeightedPools() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        (bytes32 ck2, bytes32 s2) = _commit(voter2, contentId, false, STAKE);

        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + EPOCH + 1);
        _reveal(contentId, roundId, ck1, true, s1);

        RoundLib.Round memory round = engine.getRound(contentId, roundId);
        // epoch-1 weight = 100% -> weightedUpPool = STAKE
        assertEq(round.weightedUpPool, STAKE);
        assertEq(round.weightedDownPool, 0);

        _reveal(contentId, roundId, ck2, false, s2);

        round = engine.getRound(contentId, roundId);
        assertEq(round.weightedUpPool, STAKE);
        assertEq(round.weightedDownPool, STAKE);
    }

    function test_MultipleContentIds_IndependentRounds() public {
        uint256 cid1 = _submitContent();
        uint256 cid2 = _submitContentWithUrl("https://example.com/2");

        _commit(voter1, cid1, true, STAKE);
        _commit(voter2, cid2, false, STAKE);

        assertEq(engine.getActiveRoundId(cid1), 1);
        assertEq(engine.getActiveRoundId(cid2), 1);

        RoundLib.Round memory r1 = engine.getRound(cid1, 1);
        RoundLib.Round memory r2 = engine.getRound(cid2, 1);

        assertEq(r1.voteCount, 1);
        assertEq(r2.voteCount, 1);
    }

    function test_HasUnrevealedVotes_TrueWhenUnrevealed() public {
        uint256 contentId = _submitContent();
        _commit(voter1, contentId, true, STAKE);
        assertTrue(engine.hasUnrevealedVotes(contentId));
    }

    function test_HasUnrevealedVotes_FalseAfterAllRevealed() public {
        uint256 contentId = _submitContent();

        (bytes32 ck1, bytes32 s1) = _commit(voter1, contentId, true, STAKE);
        uint256 roundId = engine.getActiveRoundId(contentId);

        vm.warp(block.timestamp + EPOCH + 1);
        _reveal(contentId, roundId, ck1, true, s1);

        assertFalse(engine.hasUnrevealedVotes(contentId));
    }

    function test_HasUnrevealedVotes_FalseWithNoRound() public {
        uint256 contentId = _submitContent();
        assertFalse(engine.hasUnrevealedVotes(contentId));
    }
}
