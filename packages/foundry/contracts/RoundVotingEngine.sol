// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import { IERC1363Receiver } from "@openzeppelin/contracts/interfaces/IERC1363Receiver.sol";

import { ContentRegistry } from "./ContentRegistry.sol";
import { ProtocolConfig } from "./ProtocolConfig.sol";
import { RoundLib } from "./libraries/RoundLib.sol";
import { RewardMath } from "./libraries/RewardMath.sol";
import { RoundSettlementSideEffectsLib } from "./libraries/RoundSettlementSideEffectsLib.sol";
import { CategoryFeeLib } from "./libraries/CategoryFeeLib.sol";
import { SubmitterStakeLib } from "./libraries/SubmitterStakeLib.sol";
import { TlockVoteLib } from "./libraries/TlockVoteLib.sol";
import { TokenTransferLib } from "./libraries/TokenTransferLib.sol";
import { VotePreflightLib } from "./libraries/VotePreflightLib.sol";
import { IFrontendRegistry } from "./interfaces/IFrontendRegistry.sol";
import { ICategoryRegistry } from "./interfaces/ICategoryRegistry.sol";
import { IVoterIdNFT } from "./interfaces/IVoterIdNFT.sol";
import { IRoundVotingEngine } from "./interfaces/IRoundVotingEngine.sol";
import { IParticipationPool } from "./interfaces/IParticipationPool.sol";

/// @title RoundVotingEngine
/// @notice Per-content round-based parimutuel voting with keeper-assisted/self-reveal and epoch-weighted rewards.
/// @dev Flow: commitVote (stores ciphertext bytes, drand metadata, and commit hash) → epoch ends → revealVote
///      (caller supplies plaintext consistent with the committed ciphertext) → settleRound (≥3 revealed votes) or
///      finalizeRevealFailedRound().
///      Rounds accumulate votes across 20-minute epochs. After each epoch, keepers normally derive reveal plaintext
///      off-chain from drand/tlock and submit reveals, while voters can also self-reveal if needed.
///      The contract enforces lightweight tlock metadata guardrails on chain but does not prove on-chain that the
///      ciphertext itself was honestly decryptable.
///      If 1 week passes below commit quorum the round cancels with refunds; once commit quorum exists,
///      missing reveal quorum can finalize as RevealFailed only after the round stops accepting votes
///      and the final reveal grace deadline has passed.
///      Epoch-weighting: epoch-1 (blind) = 100% reward weight; epoch-2+ (informed) = 25%.
///      Win condition uses weighted pools, not raw stake, preventing late-voter herding.
contract RoundVotingEngine is
    IRoundVotingEngine,
    IERC1363Receiver,
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardTransient
{
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    // --- Custom Errors ---
    error InvalidAddress();
    error InvalidStake();
    error ZeroAmount();
    error Unauthorized();
    error VoterIdRequired();
    error SelfVote();
    error ContentNotActive();
    error CooldownActive();
    error CiphertextTooLarge();
    error InvalidCiphertext();
    error InvalidCommitHash();
    error DrandChainHashMismatch();
    error TargetRoundOutOfWindow();
    error RoundNotOpen();
    error ActiveRoundStillOpen();
    error RoundNotAccepting();
    error RoundNotExpired();
    error RoundNotSettledOrTied();
    error RoundNotCancelledOrTied();
    error DormancyWindowElapsed();
    error ThresholdReached();
    error RevealGraceActive();

    error NotEnoughVotes();
    error AlreadyCommitted();
    error AlreadyRevealed();
    error AlreadyClaimed();
    error MaxVotersReached();
    error EpochNotEnded();
    error HashMismatch();
    error NoCommit();
    error NoStake();
    error VoteNotRevealed();
    error IndexOutOfBounds();
    error UnrevealedPastEpochVotes();
    error NothingProcessed();

    // --- Access Control Roles ---
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    // --- Constants ---
    uint256 public constant MIN_STAKE = 1e6; // 1 cREP (6 decimals)
    uint256 public constant MAX_STAKE = 100e6; // 100 cREP (6 decimals)
    uint256 public constant VOTE_COOLDOWN = 24 hours; // Time-based cooldown per content per voter
    uint256 public constant MAX_CIPHERTEXT_SIZE = 2_048; // 2 KB max ciphertext to prevent storage bloat

    // --- State ---
    IERC20 public crepToken;
    ContentRegistry public registry;
    ProtocolConfig public protocolConfig;

    // Round data: contentId => roundId => Round
    mapping(uint256 => mapping(uint256 => RoundLib.Round)) public rounds;

    // Per-content round tracking
    mapping(uint256 => uint256) public currentRoundId; // contentId => active round ID (0 = none)
    mapping(uint256 => uint256) internal nextRoundId; // contentId => next round ID to create

    // Commits: contentId => roundId => commitKey => Commit
    mapping(uint256 => mapping(uint256 => mapping(bytes32 => RoundLib.Commit))) public commits;

    // Track commit keys per round for iteration (reveal/settlement)
    mapping(uint256 => mapping(uint256 => bytes32[])) public roundCommitHashes;

    // Time-based cooldown: contentId => voter => timestamp of last vote
    mapping(uint256 => mapping(address => uint256)) internal lastVoteTimestamp;

    // Reward accounting per round
    mapping(uint256 => mapping(uint256 => uint256)) public roundVoterPool; // contentId => roundId => voter pool
    mapping(uint256 => mapping(uint256 => uint256)) public roundWinningStake; // contentId => roundId => epoch-weighted winning stake
    mapping(uint256 => mapping(uint256 => uint256)) public pendingSubmitterReward; // contentId => roundId => amount

    // Cancelled/tied round refund claims: contentId => roundId => voter => claimed
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public cancelledRoundRefundClaimed;

    // Fast zero/non-zero indicator for content vote history.
    mapping(uint256 => bool) internal contentHasCommits;

    // Sybil resistance
    // Consensus subsidy reserve: pre-funded + replenished by 5% of each losing pool.
    // Pays out on unanimous rounds (losingPool == 0) to incentivize voting on obvious content.
    uint256 public consensusReserve;

    // Config snapshot per round: prevents governance config changes from affecting in-progress rounds
    mapping(uint256 => mapping(uint256 => RoundLib.RoundConfig)) public roundConfigSnapshot;

    // Voter to commit hash lookup: contentId => roundId => voter => commitHash (O(1) claim lookups)
    mapping(uint256 => mapping(uint256 => mapping(address => bytes32))) public voterCommitHash;

    // Frontend fee aggregation (computed incrementally during revealVote for O(1) settlement)
    mapping(uint256 => mapping(uint256 => uint256)) public roundStakeWithEligibleFrontend;
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public roundPerFrontendStake;
    mapping(uint256 => mapping(uint256 => uint256)) public roundFrontendPool;
    mapping(uint256 => mapping(uint256 => uint256)) public roundEligibleFrontendCount;

    // --- Events ---
    event VoteCommitted(
        uint256 indexed contentId,
        uint256 indexed roundId,
        address indexed voter,
        bytes32 commitHash,
        uint64 targetRound,
        bytes32 drandChainHash,
        uint256 stake
    );
    event VoteRevealed(uint256 indexed contentId, uint256 indexed roundId, address indexed voter, bool isUp);
    event RoundSettled(uint256 indexed contentId, uint256 indexed roundId, bool upWins, uint256 losingPool);
    event RoundCancelled(uint256 indexed contentId, uint256 indexed roundId);
    event RoundTied(uint256 indexed contentId, uint256 indexed roundId);
    event RoundRevealFailed(uint256 indexed contentId, uint256 indexed roundId);
    event CancelledRoundRefundClaimed(
        uint256 indexed contentId, uint256 indexed roundId, address indexed voter, uint256 amount
    );
    event ForfeitedFundsAddedToTreasury(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    event CurrentEpochRefunded(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    event TreasuryFeeDistributed(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    event CategorySubmitterRewarded(
        uint256 indexed contentId, uint256 indexed categoryId, address indexed submitter, uint256 amount
    );
    event ConsensusReserveFunded(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    event ConsensusSubsidyDistributed(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _governance, address _crepToken, address _registry, address _protocolConfig)
        public
        initializer
    {
        __AccessControl_init();
        __Pausable_init();

        if (_governance == address(0)) revert InvalidAddress();
        if (_crepToken == address(0)) revert InvalidAddress();
        if (_registry == address(0)) revert InvalidAddress();
        if (_protocolConfig == address(0)) revert InvalidAddress();

        _grantRole(DEFAULT_ADMIN_ROLE, _governance);
        _grantRole(PAUSER_ROLE, _governance);

        crepToken = IERC20(_crepToken);
        registry = ContentRegistry(_registry);
        protocolConfig = ProtocolConfig(_protocolConfig);
    }

    /// @notice Add cREP to the consensus reserve.
    /// @dev Permissionless by design — treasury top-ups and slashed-stake routing both use this same path.
    function addToConsensusReserve(uint256 amount) external {
        _pullCrepFromSender(amount);
        consensusReserve += amount;
    }

    /// @notice Transfer cREP reward tokens to a recipient. Only callable by RewardDistributor.
    function transferReward(address recipient, uint256 crepAmount) external {
        if (msg.sender != protocolConfig.rewardDistributor()) revert Unauthorized();
        if (recipient == address(0)) revert InvalidAddress();
        if (crepAmount > 0) {
            crepToken.safeTransfer(recipient, crepAmount);
        }
    }

    // =========================================================================
    // COMMIT PHASE
    // =========================================================================

    /// @notice Commit a blind vote on content. Direction is hidden via tlock encryption.
    /// @param contentId The content being voted on.
    /// @param targetRound drand round targeted by the ciphertext.
    /// @param drandChainHash drand chain hash bound into the commitment.
    /// @param commitHash keccak256(abi.encodePacked(isUp, salt, contentId, targetRound, drandChainHash, keccak256(ciphertext))).
    /// @param ciphertext Tlock-encrypted payload (decryptable after epoch end via drand).
    /// @param stakeAmount Amount of cREP tokens to stake (1-100).
    /// @param frontend Address of frontend operator for fee distribution.
    function commitVote(
        uint256 contentId,
        uint64 targetRound,
        bytes32 drandChainHash,
        bytes32 commitHash,
        bytes calldata ciphertext,
        uint256 stakeAmount,
        address frontend
    ) external nonReentrant whenNotPaused {
        _commitVote(
            msg.sender, contentId, targetRound, drandChainHash, commitHash, ciphertext, stakeAmount, frontend, false
        );
    }

    function onTransferReceived(address operator, address from, uint256 value, bytes calldata data)
        external
        nonReentrant
        whenNotPaused
        returns (bytes4)
    {
        if (msg.sender != address(crepToken)) revert Unauthorized();
        if (operator != from) revert Unauthorized();

        (
            uint256 contentId,
            bytes32 commitHash,
            bytes memory ciphertext,
            uint64 targetRound,
            bytes32 drandChainHash,
            address frontend
        ) = TlockVoteLib.decodeCommitPayload(data);

        _commitVote(from, contentId, targetRound, drandChainHash, commitHash, ciphertext, value, frontend, true);
        return IERC1363Receiver.onTransferReceived.selector;
    }

    function _commitVote(
        address voter,
        uint256 contentId,
        uint64 targetRound,
        bytes32 drandChainHash,
        bytes32 commitHash,
        bytes memory ciphertext,
        uint256 stakeAmount,
        address frontend,
        bool stakeAlreadyTransferred
    ) internal {
        if (stakeAmount < MIN_STAKE || stakeAmount > MAX_STAKE) revert InvalidStake();
        if (commitHash == bytes32(0)) revert InvalidCommitHash();

        uint64 stakeAmount64 = uint64(stakeAmount);
        IVoterIdNFT currentVoterIdNft = _getVoterIdNft();
        (uint256 voterId, bool useTokenIdentity) =
            VotePreflightLib.validateVoterAndContent(currentVoterIdNft, registry, voter, contentId);

        // Get or create active round
        uint256 currentOpenRoundId = currentRoundId[contentId];
        if (currentOpenRoundId == 0 || RoundLib.isTerminal(rounds[contentId][currentOpenRoundId])) {
            if (registry.isDormancyEligible(contentId)) revert DormancyWindowElapsed();
        } else {
            RoundLib.Round storage currentRound = rounds[contentId][currentOpenRoundId];
            // If this commit would auto-finalize the stale open round and roll into a fresh round,
            // finalize it first so the registry can observe that no open round remains.
            if (_canFinalizeRevealFailedRound(contentId, currentOpenRoundId, currentRound)) {
                _markRoundRevealFailed(contentId, currentOpenRoundId, currentRound);
                if (registry.isDormancyEligible(contentId)) revert DormancyWindowElapsed();
            }
        }

        uint256 roundId = _getOrCreateRound(contentId);
        RoundLib.Round storage round = rounds[contentId][roundId];
        RoundLib.RoundConfig memory roundCfg = _getRoundConfig(contentId, roundId);

        // Round must be Open and not expired
        if (!RoundLib.acceptsVotes(round, roundCfg.maxDuration)) revert RoundNotAccepting();

        bytes32 commitKey = VotePreflightLib.prepareCommit(
            voterCommitHash,
            hasTokenIdCommitted,
            lastVoteTimestamp,
            lastVoteTimestampByToken,
            currentVoterIdNft,
            VotePreflightLib.CommitPreflightParams({
                voter: voter,
                contentId: contentId,
                roundId: roundId,
                voterId: voterId,
                useTokenIdentity: useTokenIdentity,
                cooldownWindow: VOTE_COOLDOWN,
                maxStake: MAX_STAKE,
                stakeAmount: stakeAmount,
                commitHash: commitHash,
                roundVoteCount: round.voteCount,
                maxVoters: roundCfg.maxVoters
            })
        );
        if (commits[contentId][roundId][commitKey].voter != address(0)) revert AlreadyCommitted();
        (uint256 epochEnd, uint8 epochIdx) = _computeCommitEpoch(round, roundCfg);
        _validateCommitTlockData(
            contentId, roundId, ciphertext, targetRound, drandChainHash, epochEnd, roundCfg.epochDuration
        );

        // Transfer cREP stake after all lightweight validation passes.
        if (!stakeAlreadyTransferred) {
            crepToken.safeTransferFrom(voter, address(this), stakeAmount);
        }

        _storeCommittedVote(
            contentId,
            roundId,
            commitKey,
            voter,
            stakeAmount64,
            ciphertext,
            frontend,
            epochEnd,
            targetRound,
            drandChainHash,
            epochIdx,
            commitHash,
            voterId,
            useTokenIdentity
        );
        _recordCommitAccounting(round, contentId, roundId, voter, voterId, useTokenIdentity, stakeAmount64, stakeAmount);

        emit VoteCommitted(contentId, roundId, voter, commitHash, targetRound, drandChainHash, stakeAmount);
    }

    function _computeCommitEpoch(RoundLib.Round storage round, RoundLib.RoundConfig memory roundCfg)
        internal
        view
        returns (uint256 epochEnd, uint8 epochIdx)
    {
        epochEnd = RoundLib.computeEpochEnd(round, roundCfg.epochDuration, block.timestamp);
        epochIdx = RoundLib.computeEpochIndex(round, roundCfg.epochDuration, block.timestamp);
    }

    function _validateCommitTlockData(
        uint256 contentId,
        uint256 roundId,
        bytes memory ciphertext,
        uint64 targetRound,
        bytes32 drandChainHash,
        uint256 epochEnd,
        uint256 epochDuration
    ) internal view {
        (bytes32 roundDrandChainHash, uint64 roundDrandGenesisTime, uint64 roundDrandPeriod) =
            _getRoundDrandConfig(contentId, roundId);
        TlockVoteLib.validateCommitData(
            ciphertext,
            targetRound,
            drandChainHash,
            roundDrandChainHash,
            epochEnd,
            epochDuration,
            roundDrandGenesisTime,
            roundDrandPeriod
        );
    }

    function _storeCommittedVote(
        uint256 contentId,
        uint256 roundId,
        bytes32 commitKey,
        address voter,
        uint64 stakeAmount64,
        bytes memory ciphertext,
        address frontend,
        uint256 epochEnd,
        uint64 targetRound,
        bytes32 drandChainHash,
        uint8 epochIdx,
        bytes32 commitHash,
        uint256 voterId,
        bool useTokenIdentity
    ) internal {
        _writeCommitStruct(
            contentId,
            roundId,
            commitKey,
            voter,
            stakeAmount64,
            ciphertext,
            frontend,
            epochEnd,
            targetRound,
            drandChainHash,
            epochIdx
        );
        _markFrontendEligibility(contentId, roundId, commitKey, frontend);
        _recordCommitIndexes(contentId, roundId, commitKey, epochEnd, voter, commitHash, voterId, useTokenIdentity);
    }

    function _writeCommitStruct(
        uint256 contentId,
        uint256 roundId,
        bytes32 commitKey,
        address voter,
        uint64 stakeAmount64,
        bytes memory ciphertext,
        address frontend,
        uint256 epochEnd,
        uint64 targetRound,
        bytes32 drandChainHash,
        uint8 epochIdx
    ) internal {
        commits[contentId][roundId][commitKey] = RoundLib.Commit({
            voter: voter,
            stakeAmount: stakeAmount64,
            ciphertext: ciphertext,
            frontend: frontend,
            revealableAfter: epochEnd.toUint48(),
            targetRound: targetRound,
            drandChainHash: drandChainHash,
            revealed: false,
            isUp: false,
            epochIndex: epochIdx
        });
    }

    function _markFrontendEligibility(uint256 contentId, uint256 roundId, bytes32 commitKey, address frontend)
        internal
    {
        IFrontendRegistry currentFrontendRegistry = _getFrontendRegistry();
        if (VotePreflightLib.isFrontendEligible(currentFrontendRegistry, frontend)) {
            frontendEligibleAtCommit[contentId][roundId][commitKey] = true;
        }
    }

    function _recordCommitIndexes(
        uint256 contentId,
        uint256 roundId,
        bytes32 commitKey,
        uint256 epochEnd,
        address voter,
        bytes32 commitHash,
        uint256 voterId,
        bool useTokenIdentity
    ) internal {
        roundCommitHashes[contentId][roundId].push(commitKey);
        epochUnrevealedCount[contentId][roundId][epochEnd]++;
        // `epochEnd` is derived from the current block timestamp, so for sequential commits in a round
        // it is monotonic and can be recorded directly as the latest revealable time.
        lastCommitRevealableAfter[contentId][roundId] = epochEnd;

        voterCommitHash[contentId][roundId][voter] = commitHash;
        if (!contentHasCommits[contentId]) {
            contentHasCommits[contentId] = true;
        }
        if (useTokenIdentity) {
            hasTokenIdCommitted[contentId][roundId][voterId] = true;
        }
    }

    function _recordCommitAccounting(
        RoundLib.Round storage round,
        uint256 contentId,
        uint256 roundId,
        address voter,
        uint256 voterId,
        bool useTokenIdentity,
        uint64 stakeAmount64,
        uint256 stakeAmount
    ) internal {
        round.voteCount++;
        round.totalStake += stakeAmount64;

        lastVoteTimestamp[contentId][voter] = block.timestamp;
        if (useTokenIdentity) {
            lastVoteTimestampByToken[contentId][voterId] = block.timestamp;
        }

        IVoterIdNFT currentVoterIdNft = _getVoterIdNft();
        if (useTokenIdentity) {
            currentVoterIdNft.recordStake(contentId, roundId, voterId, stakeAmount);
        }

        // Vote commits still refresh UI activity timestamps, but not the dormancy anchor.
        registry.updateActivity(contentId);
    }

    /// @dev Get or create the active round for a content item.
    function _getOrCreateRound(uint256 contentId) internal returns (uint256) {
        uint256 roundId = currentRoundId[contentId];

        // If there's an active round, use it
        if (roundId > 0) {
            RoundLib.Round storage existingRound = rounds[contentId][roundId];
            if (
                existingRound.state == RoundLib.RoundState.Open
                    && _canFinalizeRevealFailedRound(contentId, roundId, existingRound)
            ) {
                _markRoundRevealFailed(contentId, roundId, existingRound);
            }
            if (!RoundLib.isTerminal(existingRound)) {
                return roundId;
            }
        }

        // Create a new round
        nextRoundId[contentId]++;
        roundId = nextRoundId[contentId];
        currentRoundId[contentId] = roundId;

        rounds[contentId][roundId].startTime = block.timestamp.toUint48();
        rounds[contentId][roundId].state = RoundLib.RoundState.Open;

        // Snapshot config at round creation to prevent mid-round governance changes
        roundConfigSnapshot[contentId][roundId] = _currentConfig();
        roundRevealGracePeriodSnapshot[contentId][roundId] = protocolConfig.revealGracePeriod();
        roundDrandChainHashSnapshot[contentId][roundId] = protocolConfig.drandChainHash();
        roundDrandGenesisTimeSnapshot[contentId][roundId] = protocolConfig.drandGenesisTime();
        roundDrandPeriodSnapshot[contentId][roundId] = protocolConfig.drandPeriod();

        return roundId;
    }

    function _markRoundRevealFailed(uint256 contentId, uint256 roundId, RoundLib.Round storage round) internal {
        round.state = RoundLib.RoundState.RevealFailed;
        round.settledAt = block.timestamp.toUint48();
        emit RoundRevealFailed(contentId, roundId);
    }

    // =========================================================================
    // ROUND EXPIRY
    // =========================================================================

    /// @notice Cancel an expired round that didn't reach the minimum voter threshold. Permissionless.
    function cancelExpiredRound(uint256 contentId, uint256 roundId) external nonReentrant whenNotPaused {
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (round.state != RoundLib.RoundState.Open) revert RoundNotOpen();
        RoundLib.RoundConfig memory roundCfg = _getRoundConfig(contentId, roundId);
        if (!RoundLib.isExpired(round, roundCfg.maxDuration)) revert RoundNotExpired();
        // Cannot cancel once the round has meaningful commit quorum.
        if (round.voteCount >= roundCfg.minVoters) revert ThresholdReached();

        round.state = RoundLib.RoundState.Cancelled;

        emit RoundCancelled(contentId, roundId);
    }

    /// @notice Finalize a round whose reveal quorum never materialized after commit quorum was already reached.
    function finalizeRevealFailedRound(uint256 contentId, uint256 roundId) external nonReentrant whenNotPaused {
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (round.state != RoundLib.RoundState.Open) revert RoundNotOpen();
        RoundLib.RoundConfig memory roundCfg = _getRoundConfig(contentId, roundId);
        if (round.voteCount < roundCfg.minVoters) revert NotEnoughVotes();
        if (round.revealedCount >= roundCfg.minVoters) revert ThresholdReached();
        if (!_canFinalizeRevealFailedRound(contentId, roundId, round)) revert RevealGraceActive();

        _markRoundRevealFailed(contentId, roundId, round);
    }

    // =========================================================================
    // REVEAL PHASE (keeper-assisted / self-reveal)
    // =========================================================================

    /// @notice Reveal a specific commit by commit key. Any caller that knows the plaintext may call.
    /// @dev In normal operation a keeper decrypts the tlock ciphertext off-chain using drand and submits the plaintext
    ///      `(isUp, salt)` here. Voters can also self-reveal. The contract verifies consistency against the stored
    ///      ciphertext hash, but not that the ciphertext was honestly decryptable.
    function revealVoteByCommitKey(uint256 contentId, uint256 roundId, bytes32 commitKey, bool isUp, bytes32 salt)
        external
        nonReentrant
        whenNotPaused
    {
        _revealVoteInternal(contentId, roundId, commitKey, isUp, salt);
    }

    // =========================================================================
    // SETTLEMENT
    // =========================================================================

    /// @notice Settle a round after ≥minVoters votes have been revealed. Permissionless.
    /// @dev Win condition uses epoch-weighted pools to prevent late-voter herding.
    ///      Rating update uses raw revealed pools for accurate crowd opinion representation.
    function settleRound(uint256 contentId, uint256 roundId) external nonReentrant whenNotPaused {
        RoundLib.Round storage round = rounds[contentId][roundId];

        if (round.state != RoundLib.RoundState.Open) revert RoundNotOpen();

        RoundLib.RoundConfig memory roundCfg = _getRoundConfig(contentId, roundId);

        // Must have ≥ minVoters revealed votes
        if (round.revealedCount < roundCfg.minVoters) revert NotEnoughVotes();

        // Prevent selective revelation: all past-epoch commits must be revealed
        // (or their grace period must have expired) before settlement is allowed.
        // Loop is bounded: votes can only be committed during maxDuration, so no
        // epochUnrevealedCount entries exist beyond startTime + maxDuration + epochDuration.
        {
            uint256 _gracePeriod = _getRoundRevealGracePeriod(contentId, roundId);
            uint256 epochEnd = round.startTime + roundCfg.epochDuration;
            uint256 maxEpochEnd = round.startTime + roundCfg.maxDuration + roundCfg.epochDuration;
            while (epochEnd <= block.timestamp && epochEnd <= maxEpochEnd) {
                if (epochUnrevealedCount[contentId][roundId][epochEnd] > 0 && block.timestamp < epochEnd + _gracePeriod)
                {
                    revert UnrevealedPastEpochVotes();
                }
                epochEnd += roundCfg.epochDuration;
            }
        }

        // Tie: equal weighted pools, no winners
        if (round.weightedUpPool == round.weightedDownPool) {
            round.state = RoundLib.RoundState.Tied;
            round.settledAt = block.timestamp.toUint48();
            emit RoundTied(contentId, roundId);
            return;
        }

        // Determine winner: weighted majority wins (anti-herding)
        bool upWins = round.weightedUpPool > round.weightedDownPool;
        bool isFirstSettledRound = !contentHasSettledRound[contentId];
        round.upWins = upWins;
        round.state = RoundLib.RoundState.Settled;
        round.settledAt = block.timestamp.toUint48();
        contentHasSettledRound[contentId] = true;

        // Epoch-weighted winning stake — used for proportional reward distribution
        uint256 weightedWinningStake = upWins ? round.weightedUpPool : round.weightedDownPool;

        // Raw losing pool — 5% is reserved for revealed losers, the remainder is
        // redistributed to winners, protocol, treasury, and the consensus reserve.
        uint256 losingPool = upWins ? round.downPool : round.upPool;

        if (losingPool > 0) {
            (
                uint256 _loserRefundShare,
                uint256 voterShare,
                uint256 submitterShare,
                uint256 platformShare,
                uint256 treasuryShare,
                uint256 consensusShare
            ) = RewardMath.splitPoolAfterLoserRefund(losingPool);
            _loserRefundShare;

            // Store voter pool and weighted winning stake (used for proportional reward claims).
            // Loser rebates are paid directly from raw losing stake during claimReward().
            roundVoterPool[contentId][roundId] = voterShare;
            roundWinningStake[contentId][roundId] = weightedWinningStake;

            // Store submitter reward
            pendingSubmitterReward[contentId][roundId] = submitterShare;

            // Fund consensus reserve (5% of losing pool)
            if (consensusShare > 0) {
                consensusReserve += consensusShare;
                emit ConsensusReserveFunded(contentId, roundId, consensusShare);
            }

            // Distribute platform fees (3% frontend + 1% category)
            if (platformShare > 0) {
                ICategoryRegistry currentCategoryRegistry = _getCategoryRegistry();
                IFrontendRegistry currentFrontendRegistry = _getFrontendRegistry();
                uint256 categorySubmitterShare = platformShare / 4;
                uint256 frontendShare = platformShare - categorySubmitterShare;

                if (frontendShare > 0) {
                    if (roundStakeWithEligibleFrontend[contentId][roundId] > 0) {
                        roundFrontendPool[contentId][roundId] = frontendShare;
                        roundFrontendRegistrySnapshot[contentId][roundId] = address(currentFrontendRegistry);
                    } else {
                        roundVoterPool[contentId][roundId] += frontendShare;
                    }
                }

                if (categorySubmitterShare > 0) {
                    try CategoryFeeLib.distribute(
                        crepToken, registry, currentCategoryRegistry, contentId, categorySubmitterShare
                    ) returns (
                        bool paid, uint256 categoryId, address categorySubmitter
                    ) {
                        if (paid) {
                            emit CategorySubmitterRewarded(
                                contentId, categoryId, categorySubmitter, categorySubmitterShare
                            );
                        } else {
                            roundVoterPool[contentId][roundId] += categorySubmitterShare;
                        }
                    } catch {
                        roundVoterPool[contentId][roundId] += categorySubmitterShare;
                    }
                }
            }

            // Transfer treasury fee
            if (treasuryShare > 0) {
                address currentTreasury = protocolConfig.treasury();
                if (currentTreasury != address(0)) {
                    try TokenTransferLib.transfer(crepToken, currentTreasury, treasuryShare) {
                        emit TreasuryFeeDistributed(contentId, roundId, treasuryShare);
                    } catch {
                        roundVoterPool[contentId][roundId] += treasuryShare;
                    }
                } else {
                    roundVoterPool[contentId][roundId] += treasuryShare;
                }
            }
        } else {
            // Unanimous: losingPool == 0, pay from consensus reserve
            uint256 totalStake = round.upPool + round.downPool;
            uint256 subsidy = RewardMath.calculateConsensusSubsidy(totalStake, consensusReserve);

            if (subsidy > 0) {
                consensusReserve -= subsidy;
                (uint256 voterSubsidy, uint256 submitterSubsidy) = RewardMath.splitConsensusSubsidy(subsidy);
                roundVoterPool[contentId][roundId] = voterSubsidy;
                pendingSubmitterReward[contentId][roundId] = submitterSubsidy;
                emit ConsensusSubsidyDistributed(contentId, roundId, subsidy);
            }

            // All voters are winners; use weighted total stake
            roundWinningStake[contentId][roundId] = weightedWinningStake;
        }

        IParticipationPool currentParticipationPool = _getParticipationPool();
        address currentRewardDistributor = protocolConfig.rewardDistributor();
        RoundSettlementSideEffectsLib.recordSettlement(
            registry,
            currentParticipationPool,
            currentRewardDistributor,
            isFirstSettledRound,
            contentId,
            roundId,
            upWins,
            round.upPool,
            round.downPool
        );
        emit RoundSettled(contentId, roundId, upWins, losingPool);
    }

    // =========================================================================
    // REFUNDS (cancelled/tied/reveal-failed rounds)
    // =========================================================================

    /// @notice Claim refund for a cancelled, tied, or reveal-failed round. Pull-based.
    /// @dev AUDIT NOTE (I-7): No forfeiture deadline is intentional — refundable terminal-round stakes
    ///      belong to voters indefinitely. Adding a deadline would create a governance extraction vector.
    function claimCancelledRoundRefund(uint256 contentId, uint256 roundId) external nonReentrant {
        RoundLib.Round storage round = rounds[contentId][roundId];
        if (
            round.state != RoundLib.RoundState.Cancelled && round.state != RoundLib.RoundState.Tied
                && round.state != RoundLib.RoundState.RevealFailed
        ) {
            revert RoundNotCancelledOrTied();
        }
        if (cancelledRoundRefundClaimed[contentId][roundId][msg.sender]) revert AlreadyClaimed();

        bytes32 commitHash = voterCommitHash[contentId][roundId][msg.sender];
        if (commitHash == bytes32(0)) revert NoCommit();
        bytes32 commitKey = _buildCommitKey(msg.sender, commitHash);

        RoundLib.Commit storage commit = commits[contentId][roundId][commitKey];
        if (commit.stakeAmount == 0) revert NoStake();
        if (round.state != RoundLib.RoundState.Cancelled && !commit.revealed) revert VoteNotRevealed();

        uint256 refundAmount = commit.stakeAmount;
        commit.stakeAmount = 0;
        cancelledRoundRefundClaimed[contentId][roundId][msg.sender] = true;

        crepToken.safeTransfer(msg.sender, refundAmount);

        emit CancelledRoundRefundClaimed(contentId, roundId, msg.sender, refundAmount);
    }

    /// @notice Resolve submitter stake once the slash or healthy-return window has elapsed.
    /// @dev Permissionless so idle content cannot bypass the submitter stake policy.
    function resolveSubmitterStake(uint256 contentId) external nonReentrant whenNotPaused {
        bool hasSettledRound = contentHasSettledRound[contentId];
        if (!hasSettledRound && _hasOpenRound(contentId)) revert ActiveRoundStillOpen();
        SubmitterStakeLib.resolve(registry, hasSettledRound, contentId);
    }

    // =========================================================================
    // UNREVEALED VOTE PROCESSING
    // =========================================================================

    /// @notice Process unrevealed votes in batches after settlement. Permissionless.
    /// @dev For settled/tied rounds: unrevealed votes from past epochs are forfeited to treasury.
    ///      Current/future-epoch votes at settlement/tie time are refunded because they had no chance.
    ///      For reveal-failed rounds: all unrevealed votes are forfeited because the final reveal grace has passed.
    function processUnrevealedVotes(uint256 contentId, uint256 roundId, uint256 startIndex, uint256 count)
        external
        nonReentrant
        whenNotPaused
    {
        RoundLib.Round storage round = rounds[contentId][roundId];

        if (
            round.state != RoundLib.RoundState.Settled && round.state != RoundLib.RoundState.Tied
                && round.state != RoundLib.RoundState.RevealFailed
        ) {
            revert RoundNotSettledOrTied();
        }

        bytes32[] storage commitKeys = roundCommitHashes[contentId][roundId];
        uint256 len = commitKeys.length;
        if (startIndex >= len) revert IndexOutOfBounds();

        uint256 endIndex = (count == 0 || startIndex + count > len) ? len : startIndex + count;
        uint256 forfeitedCrep = 0;
        uint256 refundedCrep = 0;

        for (uint256 i = startIndex; i < endIndex; i++) {
            RoundLib.Commit storage commit = commits[contentId][roundId][commitKeys[i]];
            if (!commit.revealed && commit.stakeAmount > 0) {
                uint256 amount = commit.stakeAmount;
                commit.stakeAmount = 0;

                if (round.state == RoundLib.RoundState.RevealFailed || commit.revealableAfter <= round.settledAt) {
                    // Past epoch: ciphertext was decryptable but voter/keeper didn't reveal
                    forfeitedCrep += amount;
                } else {
                    // Current/future epoch: voter had no chance — refund
                    try TokenTransferLib.transfer(crepToken, commit.voter, amount) {
                        refundedCrep += amount;
                    } catch {
                        forfeitedCrep += amount;
                    }
                }
            }
        }

        if (forfeitedCrep > 0) {
            address currentTreasury = protocolConfig.treasury();
            if (currentTreasury != address(0)) {
                try TokenTransferLib.transfer(crepToken, currentTreasury, forfeitedCrep) {
                    emit ForfeitedFundsAddedToTreasury(contentId, roundId, forfeitedCrep);
                } catch {
                    // H-1 fix: fallback to consensus reserve instead of permanently locking funds
                    consensusReserve += forfeitedCrep;
                }
            } else {
                // H-1 fix: route to consensus reserve when treasury is unset
                consensusReserve += forfeitedCrep;
            }
        }

        if (refundedCrep > 0) {
            emit CurrentEpochRefunded(contentId, roundId, refundedCrep);
        }

        if (forfeitedCrep == 0 && refundedCrep == 0) revert NothingProcessed();
    }
    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    function _pullCrepFromSender(uint256 amount) internal {
        if (amount == 0) revert ZeroAmount();
        crepToken.safeTransferFrom(msg.sender, address(this), amount);
    }

    function _getRoundConfig(uint256 contentId, uint256 roundId) internal view returns (RoundLib.RoundConfig memory) {
        RoundLib.RoundConfig memory cfg = roundConfigSnapshot[contentId][roundId];
        if (cfg.epochDuration == 0) return _currentConfig();
        return cfg;
    }

    function _getRoundRevealGracePeriod(uint256 contentId, uint256 roundId) internal view returns (uint256) {
        uint256 gracePeriod = roundRevealGracePeriodSnapshot[contentId][roundId];
        if (gracePeriod == 0) return protocolConfig.revealGracePeriod();
        return gracePeriod;
    }

    function _getRoundDrandConfig(uint256 contentId, uint256 roundId)
        internal
        view
        returns (bytes32 chainHash, uint64 genesisTime, uint64 period)
    {
        chainHash = roundDrandChainHashSnapshot[contentId][roundId];
        genesisTime = roundDrandGenesisTimeSnapshot[contentId][roundId];
        period = roundDrandPeriodSnapshot[contentId][roundId];

        if (chainHash == bytes32(0) || genesisTime == 0 || period == 0) {
            chainHash = protocolConfig.drandChainHash();
            genesisTime = protocolConfig.drandGenesisTime();
            period = protocolConfig.drandPeriod();
        }
    }

    function _targetRoundRevealableAt(uint256 contentId, uint256 roundId, uint64 targetRound)
        internal
        view
        returns (uint256)
    {
        (, uint64 genesisTime, uint64 period) = _getRoundDrandConfig(contentId, roundId);
        return TlockVoteLib.targetRoundTimestamp(targetRound, genesisTime, period);
    }

    function _currentConfig() internal view returns (RoundLib.RoundConfig memory cfg) {
        (cfg.epochDuration, cfg.maxDuration, cfg.minVoters, cfg.maxVoters) = protocolConfig.config();
    }

    function _getFrontendRegistry() internal view returns (IFrontendRegistry) {
        return IFrontendRegistry(protocolConfig.frontendRegistry());
    }

    function _getCategoryRegistry() internal view returns (ICategoryRegistry) {
        return ICategoryRegistry(protocolConfig.categoryRegistry());
    }

    function _getVoterIdNft() internal view returns (IVoterIdNFT) {
        return IVoterIdNFT(protocolConfig.voterIdNFT());
    }

    function _getParticipationPool() internal view returns (IParticipationPool) {
        return IParticipationPool(protocolConfig.participationPool());
    }

    function _buildCommitKey(address voter, bytes32 commitHash) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(voter, commitHash));
    }

    function _getRevealFailedFinalizationTime(uint256 contentId, uint256 roundId, RoundLib.Round storage round)
        internal
        view
        returns (uint256)
    {
        RoundLib.RoundConfig memory roundCfg = _getRoundConfig(contentId, roundId);
        uint256 lastRevealableAt = lastCommitRevealableAfter[contentId][roundId];
        if (lastRevealableAt == 0) return 0;

        uint256 votingWindowEnd = uint256(round.startTime) + roundCfg.maxDuration;
        uint256 revealBase = lastRevealableAt > votingWindowEnd ? lastRevealableAt : votingWindowEnd;
        return revealBase + _getRoundRevealGracePeriod(contentId, roundId);
    }

    function _canFinalizeRevealFailedRound(uint256 contentId, uint256 roundId, RoundLib.Round storage round)
        internal
        view
        returns (bool)
    {
        if (round.state != RoundLib.RoundState.Open) return false;

        RoundLib.RoundConfig memory roundCfg = _getRoundConfig(contentId, roundId);
        if (round.voteCount < roundCfg.minVoters) return false;
        if (round.revealedCount >= roundCfg.minVoters) return false;

        uint256 finalizationTime = _getRevealFailedFinalizationTime(contentId, roundId, round);
        if (finalizationTime == 0) return false;

        return block.timestamp >= finalizationTime;
    }

    function _hasOpenRound(uint256 contentId) internal view returns (bool) {
        uint256 roundId = currentRoundId[contentId];
        return roundId != 0 && rounds[contentId][roundId].state == RoundLib.RoundState.Open;
    }

    function _revealVoteInternal(uint256 contentId, uint256 roundId, bytes32 commitKey, bool isUp, bytes32 salt)
        internal
    {
        RoundLib.Round storage round = rounds[contentId][roundId];

        if (round.state != RoundLib.RoundState.Open) revert RoundNotOpen();

        RoundLib.Commit storage commit = commits[contentId][roundId][commitKey];
        if (commit.voter == address(0)) revert NoCommit();
        if (commit.revealed) revert AlreadyRevealed();

        uint256 revealNotBefore = commit.revealableAfter;
        uint256 targetRoundRevealableAt = _targetRoundRevealableAt(contentId, roundId, commit.targetRound);
        if (targetRoundRevealableAt > revealNotBefore) {
            revealNotBefore = targetRoundRevealableAt;
        }

        // Both the round epoch and the committed drand round must have elapsed.
        if (block.timestamp < revealNotBefore) revert EpochNotEnded();

        // Verify commit hash
        bytes32 expectedHash = TlockVoteLib.buildExpectedCommitHash(
            isUp, salt, contentId, commit.targetRound, commit.drandChainHash, commit.ciphertext
        );
        if (commitKey != _buildCommitKey(commit.voter, expectedHash)) revert HashMismatch();

        // Mark as revealed
        commit.revealed = true;
        commit.isUp = isUp;

        // Decrement unrevealed count for this epoch (selective revelation prevention)
        epochUnrevealedCount[contentId][roundId][commit.revealableAfter]--;

        // Increment revealed count
        round.revealedCount++;

        // Update raw pools (used for rating calculation and refund accounting)
        if (isUp) {
            round.upPool += commit.stakeAmount;
            round.upCount++;
        } else {
            round.downPool += commit.stakeAmount;
            round.downCount++;
        }

        // Update epoch-weighted pools (used for win condition and reward distribution)
        uint256 w = RoundLib.epochWeightBps(commit.epochIndex);
        uint64 effectiveStk = uint64((uint256(commit.stakeAmount) * w) / 10000);
        if (isUp) {
            round.weightedUpPool += effectiveStk;
        } else {
            round.weightedDownPool += effectiveStk;
        }

        // Track when settlement threshold is first reached
        RoundLib.RoundConfig memory roundCfg = _getRoundConfig(contentId, roundId);
        if (round.revealedCount >= roundCfg.minVoters && round.thresholdReachedAt == 0) {
            round.thresholdReachedAt = block.timestamp.toUint48();
        }

        // Aggregate frontend fee data using commit-time eligibility, not reveal-time status.
        if (commit.frontend != address(0) && frontendEligibleAtCommit[contentId][roundId][commitKey]) {
            roundStakeWithEligibleFrontend[contentId][roundId] += commit.stakeAmount;
            if (roundPerFrontendStake[contentId][roundId][commit.frontend] == 0) {
                roundEligibleFrontendCount[contentId][roundId]++;
            }
            roundPerFrontendStake[contentId][roundId][commit.frontend] += commit.stakeAmount;
        }

        emit VoteRevealed(contentId, roundId, commit.voter, isUp);
    }

    // =========================================================================
    // VIEW FUNCTIONS
    // =========================================================================

    // Note: computeCurrentEpochEnd removed to fit size limit.
    // Use config().epochDuration plus rounds(contentId, roundId).startTime to compute off-chain.

    function hasCommits(uint256 contentId) external view override returns (bool) {
        return contentHasCommits[contentId];
    }

    function commitRevealAvailableAt(uint256 contentId, uint256 roundId, bytes32 commitKey)
        external
        view
        returns (uint256)
    {
        RoundLib.Commit storage commit = commits[contentId][roundId][commitKey];
        if (commit.voter == address(0)) revert NoCommit();

        uint256 revealNotBefore = commit.revealableAfter;
        uint256 targetRoundRevealableAt = _targetRoundRevealableAt(contentId, roundId, commit.targetRound);
        if (targetRoundRevealableAt > revealNotBefore) {
            revealNotBefore = targetRoundRevealableAt;
        }

        return revealNotBefore;
    }

    // --- Admin ---

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // =========================================================================
    // STORAGE
    // =========================================================================

    // One vote per identity per round
    mapping(uint256 => mapping(uint256 => mapping(uint256 => bool))) public hasTokenIdCommitted;

    // Per-identity cooldown: contentId => tokenId => timestamp (prevents cooldown bypass via delegation)
    mapping(uint256 => mapping(uint256 => uint256)) internal lastVoteTimestampByToken;

    // Per-epoch unrevealed commit counter: prevents selective vote revelation (front-running keeper).
    // contentId => roundId => epochEnd => number of unrevealed commits for that epoch.
    mapping(uint256 => mapping(uint256 => mapping(uint256 => uint256))) internal epochUnrevealedCount;

    // Per-round reveal grace period snapshot for governance consistency across open rounds.
    mapping(uint256 => mapping(uint256 => uint256)) public roundRevealGracePeriodSnapshot;

    // Per-round drand config snapshot so reveal timing stays stable across governance updates.
    mapping(uint256 => mapping(uint256 => bytes32)) internal roundDrandChainHashSnapshot;
    mapping(uint256 => mapping(uint256 => uint64)) internal roundDrandGenesisTimeSnapshot;
    mapping(uint256 => mapping(uint256 => uint64)) internal roundDrandPeriodSnapshot;

    // Latest revealableAfter timestamp among all commits in a round.
    mapping(uint256 => mapping(uint256 => uint256)) public lastCommitRevealableAfter;

    // Commit-time frontend eligibility snapshot to prevent retroactive fee eligibility changes.
    mapping(uint256 => mapping(uint256 => mapping(bytes32 => bool))) internal frontendEligibleAtCommit;

    // Frontend registry snapshot per round so historical fee claims do not depend on live registry replacement.
    mapping(uint256 => mapping(uint256 => address)) public roundFrontendRegistrySnapshot;

    // Tracks whether a content item has produced at least one settled round.
    mapping(uint256 => bool) internal contentHasSettledRound;

    // --- Storage gap reserved for future upgrades ---
    uint256[47] private __gap;
}
