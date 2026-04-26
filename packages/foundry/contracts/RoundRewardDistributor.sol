// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { RoundVotingEngine } from "./RoundVotingEngine.sol";
import { ContentRegistry } from "./ContentRegistry.sol";
import { ProtocolConfig } from "./ProtocolConfig.sol";
import { IFrontendRegistry } from "./interfaces/IFrontendRegistry.sol";
import { IParticipationPool } from "./interfaces/IParticipationPool.sol";
import { RoundLib } from "./libraries/RoundLib.sol";
import { RewardMath } from "./libraries/RewardMath.sol";

/// @title RoundRewardDistributor
/// @notice Pull-based reward claiming for settled rounds.
/// @dev NOT pausable — users must always be able to withdraw their funds.
///      Rewards are distributed proportional to epoch-weighted effective stake.
///      Epoch-1 (blind) voters earn 4× more per HREP than epoch-2+ voters.
contract RoundRewardDistributor is Initializable, AccessControlUpgradeable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;

    // --- Custom Errors ---
    error RoundNotSettled();
    error AlreadyClaimed();
    error NoPool();
    error NoStake();
    error NoEligibleStake();
    error PoolExhausted();
    error PoolDepleted();
    error VoteNotRevealed();
    error NotWinningSide();
    error NoParticipationRate();
    error NoCommit();
    error NoStrandedHrep();
    error TreasuryNotSet();
    error InvalidParticipationSnapshot();
    error UnauthorizedCaller();
    error UnauthorizedFrontendFeeCaller();
    error FrontendFeeNotClaimable();
    error FrontendFeeNotConfiscatable();
    error ParticipationRewardsOutstanding();
    error ParticipationRewardsAlreadyFinalized();
    error UnrevealedCleanupPending();
    error RewardFinalizationTooEarly();
    error InvalidFinalizationInput();
    error RewardDustAlreadyFinalized();
    error NoRewardDust();
    error VotingEngineNotDrained();

    enum FrontendFeeDisposition {
        Direct,
        CreditRegistry,
        Protocol
    }

    uint256 public constant STALE_REWARD_FINALIZATION_DELAY = 30 days;

    // --- State ---
    IERC20 public hrepToken;
    RoundVotingEngine public votingEngine;
    ContentRegistry public registry;

    // Track claimed rewards: contentId => roundId => voter => claimed
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public rewardClaimed;

    // Track aggregate voter reward claim progress so the final winner receives the dust remainder.
    mapping(uint256 => mapping(uint256 => uint256)) public roundVoterRewardClaimedCount;
    mapping(uint256 => mapping(uint256 => uint256)) public roundVoterRewardClaimedAmount;
    mapping(uint256 => mapping(uint256 => bool)) public roundVoterRewardDustFinalized;
    mapping(uint256 => mapping(uint256 => uint256)) public roundLoserRebateClaimedCount;
    mapping(uint256 => mapping(uint256 => uint256)) public roundLoserRebateClaimedAmount;

    // Track frontend fee claims: contentId => roundId => frontend => claimed
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public frontendFeeClaimed;

    // Track aggregate frontend fee claim progress so the final claimant receives the dust remainder.
    mapping(uint256 => mapping(uint256 => uint256)) public roundFrontendClaimedCount;
    mapping(uint256 => mapping(uint256 => uint256)) public roundFrontendClaimedAmount;
    mapping(uint256 => mapping(uint256 => bool)) public roundFrontendFeeDustFinalized;

    // Track participation reward claims: contentId => roundId => voter => claimed/paid
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public participationRewardClaimed;
    mapping(uint256 => mapping(uint256 => mapping(address => uint256))) public participationRewardPaid;
    mapping(uint256 => mapping(uint256 => address)) public roundParticipationRewardPool;
    mapping(uint256 => mapping(uint256 => uint256)) public roundParticipationRewardRateBps;
    mapping(uint256 => mapping(uint256 => uint256)) public roundParticipationRewardOwed;
    mapping(uint256 => mapping(uint256 => uint256)) public roundParticipationRewardReserved;
    mapping(uint256 => mapping(uint256 => uint256)) public roundParticipationRewardPaidTotal;
    mapping(uint256 => mapping(uint256 => uint256)) public roundParticipationRewardFullyClaimedCount;
    mapping(uint256 => mapping(uint256 => bool)) public roundParticipationRewardFinalized;

    // --- Events ---
    event RewardClaimed(
        uint256 indexed contentId, uint256 indexed roundId, address indexed voter, uint256 stakeReturned, uint256 reward
    );
    event LoserNotified(uint256 indexed contentId, uint256 indexed roundId, address indexed voter);
    event FrontendFeeClaimed(
        uint256 indexed contentId, uint256 indexed roundId, address indexed frontend, uint256 amount
    );
    event FrontendFeeConfiscated(
        uint256 indexed contentId, uint256 indexed roundId, address indexed frontend, uint256 amount
    );
    event FrontendRegistryLookupFailed(
        uint256 indexed contentId, uint256 indexed roundId, address indexed frontend, address frontendRegistry
    );
    event FrontendFeeCreditFailed(
        uint256 indexed contentId,
        uint256 indexed roundId,
        address indexed frontend,
        address frontendRegistry,
        uint256 amount
    );
    event ParticipationRewardClaimed(
        uint256 indexed contentId, uint256 indexed roundId, address indexed voter, uint256 amount
    );
    event ParticipationRewardSnapshotted(
        uint256 indexed contentId,
        uint256 indexed roundId,
        address indexed rewardPool,
        uint256 rewardRateBps,
        uint256 totalReward,
        uint256 reservedReward
    );
    event ParticipationRewardBackfilled(
        uint256 indexed contentId,
        uint256 indexed roundId,
        address indexed rewardPool,
        uint256 rewardRateBps,
        uint256 totalReward,
        uint256 reservedReward
    );
    event ParticipationRewardFinalized(
        uint256 indexed contentId, uint256 indexed roundId, address indexed rewardPool, uint256 releasedDust
    );
    event VotingEngineUpdated(address votingEngine);
    event VoterRewardDustFinalized(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    event FrontendFeeDustFinalized(uint256 indexed contentId, uint256 indexed roundId, uint256 amount);
    event FrontendFeeDustBatchProcessed(
        uint256 indexed contentId, uint256 indexed roundId, uint256 processedCount, uint256 expectedTotal
    );
    event FrontendFeeDustBatchReset(uint256 indexed contentId, uint256 indexed roundId);
    event ParticipationRewardSnapshotFailed(
        uint256 indexed contentId,
        uint256 indexed roundId,
        address indexed rewardPool,
        uint256 rewardRateBps,
        uint256 totalReward
    );
    event StrandedHrepSwept(address indexed treasury, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _governance, address _hrepToken, address _votingEngine, address _registry)
        public
        initializer
    {
        __AccessControl_init();

        require(_governance != address(0), "Invalid governance");
        require(_hrepToken != address(0), "Invalid HREP token");
        require(_votingEngine != address(0), "Invalid voting engine");
        require(_registry != address(0), "Invalid registry");

        _grantRole(DEFAULT_ADMIN_ROLE, _governance);

        hrepToken = IERC20(_hrepToken);
        votingEngine = RoundVotingEngine(_votingEngine);
        registry = ContentRegistry(_registry);
    }

    /// @notice Sweep any HREP accidentally held by the distributor to the protocol treasury.
    /// @dev Historical cancellation fees were mistakenly routed here in some deployments. This contract does not
    ///      custody live reward inventory, so governance can safely recover the full balance to treasury.
    function sweepStrandedHrepToTreasury() external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant returns (uint256 amount) {
        address treasury = _protocolTreasury();
        if (treasury == address(0)) revert TreasuryNotSet();

        amount = hrepToken.balanceOf(address(this));
        if (amount == 0) revert NoStrandedHrep();

        hrepToken.safeTransfer(treasury, amount);
        emit StrandedHrepSwept(treasury, amount);
    }

    /// @notice Update the voting engine used for future rounds after old-engine rewards have been drained.
    function setVotingEngine(address _votingEngine) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(_votingEngine != address(0), "Invalid voting engine");
        if (votingEngine.accountedHrepBalance() != 0) revert VotingEngineNotDrained();
        votingEngine = RoundVotingEngine(_votingEngine);
        emit VotingEngineUpdated(_votingEngine);
    }

    // --- Voter Reward Claiming ---

    /// @notice Claim reward for a settled round.
    /// @dev Winners receive stake + epoch-weighted-stake-proportional rewards from the voter pool.
    ///      Revealed losers receive a fixed 5% rebate and unrevealed losers cannot claim.
    ///      Epoch-1 voters (blind) get 100% weight; epoch-2+ voters (informed) get 25% weight.
    ///      This creates a 4:1 reward ratio incentivizing early blind voting.
    /// @param contentId The content ID.
    /// @param roundId The round ID.
    function claimReward(uint256 contentId, uint256 roundId) external nonReentrant {
        require(!rewardClaimed[contentId][roundId][msg.sender], "Already claimed");

        RoundLib.Round memory round = _readRound(contentId, roundId);
        require(round.state == RoundLib.RoundState.Settled, "Round not settled");
        _requireNoPendingUnrevealedCleanup(contentId, roundId);

        // Find voter's commit
        RoundLib.Commit memory commit = _findVoterCommit(contentId, roundId, msg.sender);
        require(commit.voter == msg.sender, "No vote found");
        require(commit.revealed, "Vote not revealed");

        rewardClaimed[contentId][roundId][msg.sender] = true;

        bool voterWon = (commit.isUp == round.upWins);

        if (!voterWon) {
            uint256 loserRefundPool =
                RewardMath.calculateRevealedLoserRefund(round.upWins ? round.downPool : round.upPool);
            uint256 totalLosingClaimants = round.upWins ? round.downCount : round.upCount;
            uint256 loserClaimedCount = roundLoserRebateClaimedCount[contentId][roundId];
            uint256 loserClaimedAmount = roundLoserRebateClaimedAmount[contentId][roundId];
            if (
                totalLosingClaimants == 0 || loserClaimedCount >= totalLosingClaimants
                    || loserClaimedAmount > loserRefundPool
            ) {
                revert PoolExhausted();
            }

            uint256 refund = loserClaimedCount + 1 == totalLosingClaimants
                ? loserRefundPool - loserClaimedAmount
                : RewardMath.calculateRevealedLoserRefund(commit.stakeAmount);
            roundLoserRebateClaimedCount[contentId][roundId] = loserClaimedCount + 1;
            roundLoserRebateClaimedAmount[contentId][roundId] = loserClaimedAmount + refund;
            if (refund > 0) {
                votingEngine.transferReward(msg.sender, refund);
            }

            emit RewardClaimed(contentId, roundId, msg.sender, 0, refund);
            return;
        }

        // Compute epoch-weighted effective stake (determines share of voter pool)
        uint256 w = RoundLib.epochWeightBps(commit.epochIndex);
        uint256 effectiveStake = (commit.stakeAmount * w) / 10000;

        uint256 voterPool = votingEngine.roundVoterPool(contentId, roundId);
        uint256 weightedWinningStake = votingEngine.roundWinningStake(contentId, roundId);
        uint256 totalWinningClaimants = round.upWins ? round.upCount : round.downCount;
        uint256 claimedCount = roundVoterRewardClaimedCount[contentId][roundId];
        uint256 claimedAmount = roundVoterRewardClaimedAmount[contentId][roundId];
        if (totalWinningClaimants == 0 || claimedCount >= totalWinningClaimants || claimedAmount > voterPool) {
            revert PoolExhausted();
        }

        uint256 reward;
        if (claimedCount + 1 == totalWinningClaimants) {
            reward = voterPool - claimedAmount;
        } else {
            reward = RewardMath.calculateVoterReward(effectiveStake, weightedWinningStake, voterPool);
        }
        roundVoterRewardClaimedCount[contentId][roundId] = claimedCount + 1;
        roundVoterRewardClaimedAmount[contentId][roundId] = claimedAmount + reward;

        // Total payout = original stake return + reward from voter pool
        uint256 totalPayout = commit.stakeAmount + reward;

        votingEngine.transferReward(msg.sender, totalPayout);

        emit RewardClaimed(contentId, roundId, msg.sender, commit.stakeAmount, reward);
    }

    // --- Frontend Fee Claims ---

    /// @notice Claim frontend fees for a settled round.
    /// @dev AUDIT NOTE: This path intentionally crystallizes historical frontend fees against the
    ///      frontend's current slash/bond status. Permissionless callers can therefore finalize an
    ///      old round while a frontend is still slashed or underbonded.
    function claimFrontendFee(uint256 contentId, uint256 roundId, address frontend)
        external
        nonReentrant
        returns (uint256 fee)
    {
        FrontendFeeDisposition disposition;
        address operator;
        bool registryLookupFailed;
        address snapshotRegistryAddress;
        fee = _quoteFrontendFee(contentId, roundId, frontend);
        (disposition, operator, registryLookupFailed, snapshotRegistryAddress) =
            _resolveFrontendFeeDisposition(contentId, roundId, frontend);
        if (registryLookupFailed) {
            emit FrontendRegistryLookupFailed(contentId, roundId, frontend, snapshotRegistryAddress);
        }
        if (disposition == FrontendFeeDisposition.Protocol) revert FrontendFeeNotClaimable();

        address expectedCaller = operator != address(0) ? operator : frontend;
        if (msg.sender != expectedCaller) revert UnauthorizedFrontendFeeCaller();

        _consumeFrontendFeeClaim(contentId, roundId, frontend, fee);
        _payoutFrontendFee(contentId, roundId, frontend, fee, disposition);
        emit FrontendFeeClaimed(contentId, roundId, frontend, fee);
    }

    /// @notice Route a settled frontend fee to protocol once the frontend is slashed or underbonded.
    function confiscateFrontendFee(uint256 contentId, uint256 roundId, address frontend)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
        returns (uint256 fee)
    {
        fee = _quoteFrontendFee(contentId, roundId, frontend);
        (FrontendFeeDisposition disposition,,,) = _resolveFrontendFeeDisposition(contentId, roundId, frontend);
        if (disposition != FrontendFeeDisposition.Protocol) revert FrontendFeeNotConfiscatable();

        _consumeFrontendFeeClaim(contentId, roundId, frontend, fee);
        _routeRewardToProtocol(fee);
        emit FrontendFeeConfiscated(contentId, roundId, frontend, fee);
    }

    /// @notice Finalize only mathematical voter-reward dust after stale winners have had time to claim.
    /// @dev `sortedWinningVoters` must contain every revealed winner exactly once, sorted by address ascending.
    function finalizeVoterRewardDust(uint256 contentId, uint256 roundId, address[] calldata sortedWinningVoters)
        external
        nonReentrant
        returns (uint256 releasedDust)
    {
        if (roundVoterRewardDustFinalized[contentId][roundId]) revert RewardDustAlreadyFinalized();

        RoundLib.Round memory round = _readSettledStaleRound(contentId, roundId);
        _requireNoPendingUnrevealedCleanup(contentId, roundId);

        uint256 totalWinningClaimants = round.upWins ? round.upCount : round.downCount;
        if (sortedWinningVoters.length != totalWinningClaimants) revert InvalidFinalizationInput();

        uint256 voterPool = votingEngine.roundVoterPool(contentId, roundId);
        uint256 weightedWinningStake = votingEngine.roundWinningStake(contentId, roundId);
        if (totalWinningClaimants == 0 || voterPool == 0 || weightedWinningStake == 0) revert NoRewardDust();

        uint256 expectedTotal;
        address previous;
        for (uint256 i = 0; i < sortedWinningVoters.length; i++) {
            address voter = sortedWinningVoters[i];
            if (voter == address(0) || (i != 0 && voter <= previous)) revert InvalidFinalizationInput();
            previous = voter;

            RoundLib.Commit memory commit = _findVoterCommit(contentId, roundId, voter);
            if (commit.voter != voter || !commit.revealed || commit.isUp != round.upWins) {
                revert InvalidFinalizationInput();
            }

            uint256 effectiveStake = (commit.stakeAmount * RoundLib.epochWeightBps(commit.epochIndex)) / 10000;
            expectedTotal += RewardMath.calculateVoterReward(effectiveStake, weightedWinningStake, voterPool);
        }

        releasedDust = _finalizableDust(voterPool, expectedTotal, roundVoterRewardClaimedAmount[contentId][roundId]);
        if (releasedDust == 0) revert NoRewardDust();

        roundVoterRewardDustFinalized[contentId][roundId] = true;
        roundVoterRewardClaimedAmount[contentId][roundId] += releasedDust;
        _routeRewardToProtocol(releasedDust);

        emit VoterRewardDustFinalized(contentId, roundId, releasedDust);
    }

    /// @notice Finalize only mathematical frontend-fee dust after stale frontend operators have had time to claim.
    /// @dev `sortedFrontends` must contain every eligible frontend exactly once, sorted by address ascending.
    function finalizeFrontendFeeDust(uint256 contentId, uint256 roundId, address[] calldata sortedFrontends)
        external
        nonReentrant
        returns (uint256 releasedDust)
    {
        _processFrontendFeeDustBatch(contentId, roundId, sortedFrontends);
        releasedDust = _finalizeProcessedFrontendFeeDust(contentId, roundId);
    }

    /// @notice Process a globally sorted slice of eligible frontends for later dust finalization.
    function processFrontendFeeDustBatch(uint256 contentId, uint256 roundId, address[] calldata sortedFrontends)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
        returns (uint256 processedCount, uint256 expectedTotal)
    {
        (processedCount, expectedTotal) = _processFrontendFeeDustBatch(contentId, roundId, sortedFrontends);
    }

    /// @notice Finalize frontend-fee dust after all eligible frontend batches have been processed.
    function finalizeProcessedFrontendFeeDust(uint256 contentId, uint256 roundId)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
        returns (uint256 releasedDust)
    {
        releasedDust = _finalizeProcessedFrontendFeeDust(contentId, roundId);
    }

    /// @notice Reset in-progress frontend-fee dust batch accounting so governance can restart a bad cursor.
    function resetFrontendFeeDustBatch(uint256 contentId, uint256 roundId) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (roundFrontendFeeDustFinalized[contentId][roundId]) revert RewardDustAlreadyFinalized();

        delete roundFrontendFeeDustProcessedCount[contentId][roundId];
        delete roundFrontendFeeDustExpectedTotal[contentId][roundId];
        delete roundFrontendFeeDustLastFrontend[contentId][roundId];

        emit FrontendFeeDustBatchReset(contentId, roundId);
    }

    function previewFrontendFee(uint256 contentId, uint256 roundId, address frontend)
        external
        view
        returns (uint256 fee, FrontendFeeDisposition disposition, address operator, bool alreadyClaimed)
    {
        alreadyClaimed = frontendFeeClaimed[contentId][roundId][frontend];
        fee = _quoteFrontendFee(contentId, roundId, frontend);
        (disposition, operator,,) = _resolveFrontendFeeDisposition(contentId, roundId, frontend);
    }

    /// @notice Snapshot and reserve voter participation rewards for a settled round.
    /// @dev Called by the voting engine during settlement so claims no longer depend on the pool's
    ///      future authorization state or on unrelated rounds consuming the same balance first.
    function snapshotParticipationRewards(
        uint256 contentId,
        uint256 roundId,
        address rewardPool,
        uint256 rewardRateBps,
        uint256 winningStake
    ) external nonReentrant {
        if (msg.sender != address(votingEngine)) revert UnauthorizedCaller();

        (uint256 totalReward, uint256 reservedReward, bool fullyReserved) =
            _syncParticipationRewardSnapshot(contentId, roundId, rewardPool, rewardRateBps, winningStake, false);
        if (!fullyReserved) {
            emit ParticipationRewardSnapshotFailed(contentId, roundId, rewardPool, rewardRateBps, totalReward);
            return;
        }

        emit ParticipationRewardSnapshotted(contentId, roundId, rewardPool, rewardRateBps, totalReward, reservedReward);
    }

    /// @notice Backfill or top up participation reward reservations for a settled round.
    /// @dev Governance can repair settlements where the snapshot side effect failed or top up reservations.
    function backfillParticipationRewards(uint256 contentId, uint256 roundId, address rewardPool, uint256 rewardRateBps)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
        returns (uint256 reservedReward)
    {
        RoundLib.Round memory round = _readRound(contentId, roundId);
        if (round.state != RoundLib.RoundState.Settled) revert RoundNotSettled();
        _requireNoPendingUnrevealedCleanup(contentId, roundId);

        uint256 winningStake = round.upWins ? round.upPool : round.downPool;
        uint256 totalReward;
        bool fullyReserved;
        (totalReward, reservedReward, fullyReserved) =
            _syncParticipationRewardSnapshot(contentId, roundId, rewardPool, rewardRateBps, winningStake, true);
        if (!fullyReserved) revert PoolDepleted();

        emit ParticipationRewardBackfilled(contentId, roundId, rewardPool, rewardRateBps, totalReward, reservedReward);
    }

    /// @notice Claim a participation reward for the caller on a settled round.
    function claimParticipationReward(uint256 contentId, uint256 roundId)
        external
        nonReentrant
        returns (uint256 paidReward)
    {
        address voter = msg.sender;
        if (participationRewardClaimed[contentId][roundId][voter]) revert AlreadyClaimed();
        if (roundParticipationRewardFinalized[contentId][roundId]) revert ParticipationRewardsAlreadyFinalized();

        RoundLib.Round memory round = _readRound(contentId, roundId);
        if (round.state != RoundLib.RoundState.Settled) revert RoundNotSettled();
        _requireNoPendingUnrevealedCleanup(contentId, roundId);

        address rewardPoolAddress = roundParticipationRewardPool[contentId][roundId];
        uint256 rateBps = roundParticipationRewardRateBps[contentId][roundId];
        uint256 totalReward = roundParticipationRewardOwed[contentId][roundId];
        uint256 reservedReward = roundParticipationRewardReserved[contentId][roundId];
        if (rewardPoolAddress == address(0)) revert NoPool();

        RoundLib.Commit memory commit = _findVoterCommit(contentId, roundId, voter);
        if (commit.voter != voter) revert NoCommit();
        if (!commit.revealed) revert VoteNotRevealed();
        if (commit.stakeAmount == 0) revert NoStake();

        if (commit.isUp != round.upWins) revert NotWinningSide();
        if (rateBps == 0) revert NoParticipationRate();

        uint256 reward = commit.stakeAmount * rateBps / 10000;
        if (reward == 0) {
            participationRewardClaimed[contentId][roundId][voter] = true;
            roundParticipationRewardFullyClaimedCount[contentId][roundId] += 1;
            return 0;
        }

        uint256 currentlyClaimable = reward;
        if (reservedReward < totalReward) {
            currentlyClaimable = (reward * reservedReward) / totalReward;
        }
        if (currentlyClaimable == 0) revert PoolDepleted();

        uint256 alreadyPaid = participationRewardPaid[contentId][roundId][voter];
        if (alreadyPaid >= currentlyClaimable) revert AlreadyClaimed();

        uint256 remainingReward = currentlyClaimable - alreadyPaid;
        paidReward = IParticipationPool(rewardPoolAddress).withdrawReservedReward(voter, remainingReward);
        if (paidReward == 0) revert PoolDepleted();

        uint256 totalPaid = alreadyPaid + paidReward;
        participationRewardPaid[contentId][roundId][voter] = totalPaid;
        roundParticipationRewardPaidTotal[contentId][roundId] += paidReward;
        if (totalPaid == reward) {
            participationRewardClaimed[contentId][roundId][voter] = true;
            roundParticipationRewardFullyClaimedCount[contentId][roundId] += 1;
        }

        emit ParticipationRewardClaimed(contentId, roundId, voter, paidReward);
    }

    /// @notice Release participation-reward dust, or stale unclaimed reservations after the finalization delay.
    /// @dev Permissionless so old rounds can be cleaned up without admin intervention.
    function finalizeParticipationRewards(uint256 contentId, uint256 roundId)
        external
        nonReentrant
        returns (uint256 releasedDust)
    {
        if (roundParticipationRewardFinalized[contentId][roundId]) {
            revert ParticipationRewardsAlreadyFinalized();
        }

        RoundLib.Round memory round = _readRound(contentId, roundId);
        if (round.state != RoundLib.RoundState.Settled) revert RoundNotSettled();
        _requireNoPendingUnrevealedCleanup(contentId, roundId);

        uint256 winnerCount = round.upWins ? round.upCount : round.downCount;
        bool stale = _isStaleRound(round);
        if (roundParticipationRewardFullyClaimedCount[contentId][roundId] != winnerCount && !stale) {
            revert ParticipationRewardsOutstanding();
        }

        address rewardPoolAddress = roundParticipationRewardPool[contentId][roundId];
        if (rewardPoolAddress == address(0)) revert NoPool();

        uint256 reservedReward = roundParticipationRewardReserved[contentId][roundId];
        uint256 paidTotal = roundParticipationRewardPaidTotal[contentId][roundId];
        releasedDust = reservedReward > paidTotal ? reservedReward - paidTotal : 0;

        roundParticipationRewardFinalized[contentId][roundId] = true;
        if (releasedDust > 0) {
            releasedDust = IParticipationPool(rewardPoolAddress).releaseReservedReward(releasedDust);
            roundParticipationRewardReserved[contentId][roundId] = reservedReward - releasedDust;
        }

        emit ParticipationRewardFinalized(contentId, roundId, rewardPoolAddress, releasedDust);
    }

    // --- Internal ---

    /// @dev Find a voter's commit using the O(1) voter-to-commitHash mapping.
    function _findVoterCommit(uint256 contentId, uint256 roundId, address voter)
        internal
        view
        returns (RoundLib.Commit memory)
    {
        bytes32 commitHash = votingEngine.voterCommitHash(contentId, roundId, voter);
        if (commitHash == bytes32(0)) {
            return RoundLib.Commit(address(0), 0, "", 0, bytes32(0), address(0), 0, false, false, 0);
        }
        bytes32 commitKey = keccak256(abi.encodePacked(voter, commitHash));
        return _readCommit(contentId, roundId, commitKey);
    }

    function _readRound(uint256 contentId, uint256 roundId) internal view returns (RoundLib.Round memory round) {
        (
            round.startTime,
            round.state,
            round.voteCount,
            round.revealedCount,
            round.totalStake,
            round.upPool,
            round.downPool,
            round.upCount,
            round.downCount,
            round.upWins,
            round.settledAt,
            round.thresholdReachedAt,
            round.weightedUpPool,
            round.weightedDownPool
        ) = votingEngine.rounds(contentId, roundId);
    }

    function _readCommit(uint256 contentId, uint256 roundId, bytes32 commitKey)
        internal
        view
        returns (RoundLib.Commit memory commit)
    {
        // Use the narrow getter that skips `ciphertext` / `targetRound` / `drandChainHash`.
        // The full public `commits()` accessor copies the ~2 KB `bytes ciphertext` field
        // per call, which blows out memory expansion when iterating many commits during
        // dust finalization at bounds-limit maxVoters.
        (
            commit.voter,
            commit.stakeAmount,
            commit.frontend,
            commit.revealableAfter,
            commit.revealed,
            commit.isUp,
            commit.epochIndex
        ) = votingEngine.commitCore(contentId, roundId, commitKey);
    }

    function _quoteFrontendFee(uint256 contentId, uint256 roundId, address frontend)
        internal
        view
        returns (uint256 fee)
    {
        RoundLib.Round memory round = _readRound(contentId, roundId);
        if (round.state != RoundLib.RoundState.Settled) revert RoundNotSettled();
        _requireNoPendingUnrevealedCleanup(contentId, roundId);
        if (frontendFeeClaimed[contentId][roundId][frontend]) revert AlreadyClaimed();

        uint256 totalFrontendPool = votingEngine.roundFrontendPool(contentId, roundId);
        uint256 frontendStake = votingEngine.roundPerFrontendStake(contentId, roundId, frontend);
        uint256 totalEligibleStake = votingEngine.roundStakeWithEligibleFrontend(contentId, roundId);
        uint256 totalFrontendClaimants = votingEngine.roundEligibleFrontendCount(contentId, roundId);

        if (totalFrontendPool == 0) revert NoPool();
        if (frontendStake == 0) revert NoStake();
        if (totalEligibleStake == 0) revert NoEligibleStake();
        if (totalFrontendClaimants == 0) revert NoPool();

        uint256 claimedCount = roundFrontendClaimedCount[contentId][roundId];
        uint256 claimedAmount = roundFrontendClaimedAmount[contentId][roundId];
        if (claimedAmount > totalFrontendPool) revert PoolExhausted();

        if (claimedCount + 1 == totalFrontendClaimants) {
            fee = totalFrontendPool - claimedAmount;
        } else {
            fee = (totalFrontendPool * frontendStake) / totalEligibleStake;
        }
    }

    function _consumeFrontendFeeClaim(uint256 contentId, uint256 roundId, address frontend, uint256 fee) internal {
        frontendFeeClaimed[contentId][roundId][frontend] = true;
        roundFrontendClaimedCount[contentId][roundId] += 1;
        roundFrontendClaimedAmount[contentId][roundId] += fee;
    }

    function _requireNoPendingUnrevealedCleanup(uint256 contentId, uint256 roundId) internal view {
        if (votingEngine.roundUnrevealedCleanupRemaining(contentId, roundId) > 0) {
            revert UnrevealedCleanupPending();
        }
    }

    function _resolveFrontendFeeDisposition(uint256 contentId, uint256 roundId, address frontend)
        internal
        view
        returns (
            FrontendFeeDisposition disposition,
            address operator,
            bool registryLookupFailed,
            address snapshotRegistryAddress
        )
    {
        snapshotRegistryAddress = votingEngine.roundFrontendRegistrySnapshot(contentId, roundId);
        if (snapshotRegistryAddress == address(0)) {
            return (FrontendFeeDisposition.Direct, frontend, false, snapshotRegistryAddress);
        }

        IFrontendRegistry snapshotRegistry = IFrontendRegistry(snapshotRegistryAddress);
        try snapshotRegistry.getFrontendInfo(frontend) returns (
            address frontendOperator, uint256 stakedAmount, bool eligible, bool slashed
        ) {
            if (frontendOperator == address(0)) {
                return (FrontendFeeDisposition.Direct, frontend, false, snapshotRegistryAddress);
            }
            if (eligible) {
                return (FrontendFeeDisposition.CreditRegistry, frontendOperator, false, snapshotRegistryAddress);
            }
            if (slashed || stakedAmount < snapshotRegistry.STAKE_AMOUNT()) {
                return (FrontendFeeDisposition.Protocol, frontendOperator, false, snapshotRegistryAddress);
            }
            return (FrontendFeeDisposition.CreditRegistry, frontendOperator, false, snapshotRegistryAddress);
        } catch {
            return (FrontendFeeDisposition.Direct, frontend, true, snapshotRegistryAddress);
        }
    }

    function _payoutFrontendFee(
        uint256 contentId,
        uint256 roundId,
        address frontend,
        uint256 fee,
        FrontendFeeDisposition disposition
    ) internal {
        if (fee == 0) return;

        address snapshotRegistryAddress = votingEngine.roundFrontendRegistrySnapshot(contentId, roundId);
        if (disposition == FrontendFeeDisposition.Direct || snapshotRegistryAddress == address(0)) {
            votingEngine.transferReward(frontend, fee);
            return;
        }

        if (disposition == FrontendFeeDisposition.Protocol) {
            _routeRewardToProtocol(fee);
            return;
        }

        IFrontendRegistry snapshotRegistry = IFrontendRegistry(snapshotRegistryAddress);

        try snapshotRegistry.creditFees(frontend, fee) {
            votingEngine.transferReward(snapshotRegistryAddress, fee);
        } catch {
            emit FrontendFeeCreditFailed(contentId, roundId, frontend, snapshotRegistryAddress, fee);
            _routeRewardToProtocol(fee);
        }
    }

    function _routeRewardToProtocol(uint256 fee) internal {
        address treasury = _protocolTreasury();
        if (treasury != address(0)) {
            votingEngine.transferReward(treasury, fee);
            return;
        }

        votingEngine.transferReward(address(this), fee);
        hrepToken.forceApprove(address(votingEngine), fee);
        votingEngine.addToConsensusReserve(fee);
    }

    function _readSettledStaleRound(uint256 contentId, uint256 roundId)
        internal
        view
        returns (RoundLib.Round memory round)
    {
        round = _readRound(contentId, roundId);
        if (round.state != RoundLib.RoundState.Settled) revert RoundNotSettled();
        if (!_isStaleRound(round)) revert RewardFinalizationTooEarly();
    }

    function _isStaleRound(RoundLib.Round memory round) internal view returns (bool) {
        return round.settledAt != 0 && block.timestamp >= uint256(round.settledAt) + STALE_REWARD_FINALIZATION_DELAY;
    }

    function _processFrontendFeeDustBatch(uint256 contentId, uint256 roundId, address[] calldata sortedFrontends)
        internal
        returns (uint256 processedCount, uint256 expectedTotal)
    {
        if (roundFrontendFeeDustFinalized[contentId][roundId]) revert RewardDustAlreadyFinalized();
        if (sortedFrontends.length == 0) revert InvalidFinalizationInput();

        _readSettledStaleRound(contentId, roundId);
        _requireNoPendingUnrevealedCleanup(contentId, roundId);

        uint256 totalFrontendPool = votingEngine.roundFrontendPool(contentId, roundId);
        uint256 totalEligibleStake = votingEngine.roundStakeWithEligibleFrontend(contentId, roundId);
        uint256 totalFrontendClaimants = votingEngine.roundEligibleFrontendCount(contentId, roundId);
        if (totalFrontendPool == 0 || totalEligibleStake == 0 || totalFrontendClaimants == 0) revert NoRewardDust();

        processedCount = roundFrontendFeeDustProcessedCount[contentId][roundId];
        expectedTotal = roundFrontendFeeDustExpectedTotal[contentId][roundId];
        address previous = roundFrontendFeeDustLastFrontend[contentId][roundId];

        for (uint256 i = 0; i < sortedFrontends.length; i++) {
            address frontend = sortedFrontends[i];
            if (frontend == address(0) || frontend <= previous) revert InvalidFinalizationInput();
            previous = frontend;

            uint256 frontendStake = votingEngine.roundPerFrontendStake(contentId, roundId, frontend);
            if (frontendStake == 0) revert InvalidFinalizationInput();
            expectedTotal += (totalFrontendPool * frontendStake) / totalEligibleStake;
        }

        processedCount += sortedFrontends.length;
        if (processedCount > totalFrontendClaimants) revert InvalidFinalizationInput();

        roundFrontendFeeDustProcessedCount[contentId][roundId] = processedCount;
        roundFrontendFeeDustExpectedTotal[contentId][roundId] = expectedTotal;
        roundFrontendFeeDustLastFrontend[contentId][roundId] = previous;

        emit FrontendFeeDustBatchProcessed(contentId, roundId, processedCount, expectedTotal);
    }

    function _finalizeProcessedFrontendFeeDust(uint256 contentId, uint256 roundId)
        internal
        returns (uint256 releasedDust)
    {
        if (roundFrontendFeeDustFinalized[contentId][roundId]) revert RewardDustAlreadyFinalized();

        _readSettledStaleRound(contentId, roundId);
        _requireNoPendingUnrevealedCleanup(contentId, roundId);

        uint256 totalFrontendClaimants = votingEngine.roundEligibleFrontendCount(contentId, roundId);
        if (
            totalFrontendClaimants == 0
                || roundFrontendFeeDustProcessedCount[contentId][roundId] != totalFrontendClaimants
        ) {
            revert InvalidFinalizationInput();
        }

        uint256 totalFrontendPool = votingEngine.roundFrontendPool(contentId, roundId);
        uint256 expectedTotal = roundFrontendFeeDustExpectedTotal[contentId][roundId];
        releasedDust =
            _finalizableDust(totalFrontendPool, expectedTotal, roundFrontendClaimedAmount[contentId][roundId]);
        if (releasedDust == 0) revert NoRewardDust();

        roundFrontendFeeDustFinalized[contentId][roundId] = true;
        roundFrontendClaimedAmount[contentId][roundId] += releasedDust;
        _routeRewardToProtocol(releasedDust);

        emit FrontendFeeDustFinalized(contentId, roundId, releasedDust);
    }

    function _finalizableDust(uint256 totalPool, uint256 expectedTotal, uint256 claimedAmount)
        internal
        pure
        returns (uint256)
    {
        if (expectedTotal >= totalPool) return 0;
        uint256 totalDust = totalPool - expectedTotal;
        uint256 alreadyClaimedDust = claimedAmount > expectedTotal ? claimedAmount - expectedTotal : 0;
        if (alreadyClaimedDust >= totalDust) return 0;
        return totalDust - alreadyClaimedDust;
    }

    function _syncParticipationRewardSnapshot(
        uint256 contentId,
        uint256 roundId,
        address rewardPool,
        uint256 rewardRateBps,
        uint256 winningStake,
        bool requireFullReservation
    ) internal returns (uint256 totalReward, uint256 reservedReward, bool fullyReserved) {
        if (rewardPool == address(0)) revert NoPool();
        if (rewardRateBps == 0) revert NoParticipationRate();
        if (roundParticipationRewardFinalized[contentId][roundId]) revert InvalidParticipationSnapshot();

        address existingRewardPool = roundParticipationRewardPool[contentId][roundId];
        if (existingRewardPool != address(0) && existingRewardPool != rewardPool) {
            revert InvalidParticipationSnapshot();
        }

        uint256 existingRateBps = roundParticipationRewardRateBps[contentId][roundId];
        if (existingRateBps != 0 && existingRateBps != rewardRateBps) revert InvalidParticipationSnapshot();

        totalReward = roundParticipationRewardOwed[contentId][roundId];
        if (totalReward == 0) {
            totalReward = winningStake * rewardRateBps / 10000;
        }

        reservedReward = roundParticipationRewardReserved[contentId][roundId];
        if (reservedReward < totalReward) {
            uint256 additionalReserved =
                IParticipationPool(rewardPool).reserveReward(address(this), totalReward - reservedReward);
            if (additionalReserved > 0) {
                uint256 nextReservedReward = reservedReward + additionalReserved;
                if (nextReservedReward < totalReward) {
                    uint256 releasedReserved = IParticipationPool(rewardPool).releaseReservedReward(additionalReserved);
                    if (releasedReserved != additionalReserved) revert InvalidParticipationSnapshot();
                    if (requireFullReservation) revert PoolDepleted();
                    return (totalReward, reservedReward, false);
                }
                reservedReward = nextReservedReward;
            } else if (requireFullReservation) {
                revert PoolDepleted();
            } else if (totalReward > 0) {
                return (totalReward, reservedReward, false);
            }
        }

        roundParticipationRewardPool[contentId][roundId] = rewardPool;
        roundParticipationRewardRateBps[contentId][roundId] = rewardRateBps;
        if (roundParticipationRewardOwed[contentId][roundId] == 0) {
            roundParticipationRewardOwed[contentId][roundId] = totalReward;
        }
        roundParticipationRewardReserved[contentId][roundId] = reservedReward;
        fullyReserved = true;
    }

    function _protocolTreasury() internal view returns (address) {
        return ProtocolConfig(votingEngine.protocolConfig()).treasury();
    }

    // Appended state for batched frontend fee dust finalization.
    mapping(uint256 => mapping(uint256 => uint256)) public roundFrontendFeeDustProcessedCount;
    mapping(uint256 => mapping(uint256 => uint256)) public roundFrontendFeeDustExpectedTotal;
    mapping(uint256 => mapping(uint256 => address)) public roundFrontendFeeDustLastFrontend;

    // --- Storage Gap for Future Upgrades ---
    uint256[31] private __gap;
}
