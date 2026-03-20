// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { RoundVotingEngine } from "./RoundVotingEngine.sol";
import { ContentRegistry } from "./ContentRegistry.sol";
import { IFrontendRegistry } from "./interfaces/IFrontendRegistry.sol";
import { IParticipationPool } from "./interfaces/IParticipationPool.sol";
import { RoundLib } from "./libraries/RoundLib.sol";
import { RewardMath } from "./libraries/RewardMath.sol";

/// @title RoundRewardDistributor
/// @notice Pull-based reward claiming for settled rounds.
/// @dev NOT pausable — users must always be able to withdraw their funds.
///      Rewards are distributed proportional to epoch-weighted effective stake.
///      Epoch-1 (blind) voters earn 4× more per cREP than epoch-2+ voters.
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
    error NoStrandedCrep();
    error TreasuryNotSet();
    error InvalidParticipationSnapshot();
    error UnauthorizedCaller();
    error ParticipationRewardsOutstanding();
    error ParticipationRewardsAlreadyFinalized();

    // --- State ---
    IERC20 public crepToken;
    RoundVotingEngine public votingEngine;
    ContentRegistry public registry;

    // Track claimed rewards: contentId => roundId => voter => claimed
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public rewardClaimed;

    // Track submitter reward claims: contentId => roundId => claimed
    mapping(uint256 => mapping(uint256 => bool)) public submitterRewardClaimed;

    // Track frontend fee claims: contentId => roundId => frontend => claimed
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public frontendFeeClaimed;

    // Track aggregate frontend fee claim progress so the final claimant receives the dust remainder.
    mapping(uint256 => mapping(uint256 => uint256)) public roundFrontendClaimedCount;
    mapping(uint256 => mapping(uint256 => uint256)) public roundFrontendClaimedAmount;

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
    event SubmitterRewardClaimed(
        uint256 indexed contentId, uint256 indexed roundId, address indexed submitter, uint256 crepAmount
    );
    event FrontendFeeClaimed(
        uint256 indexed contentId, uint256 indexed roundId, address indexed frontend, uint256 amount
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
    event StrandedCrepSwept(address indexed treasury, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address _governance, address _crepToken, address _votingEngine, address _registry)
        public
        initializer
    {
        __AccessControl_init();

        require(_governance != address(0), "Invalid governance");
        require(_crepToken != address(0), "Invalid cREP token");
        require(_votingEngine != address(0), "Invalid voting engine");
        require(_registry != address(0), "Invalid registry");

        _grantRole(DEFAULT_ADMIN_ROLE, _governance);

        crepToken = IERC20(_crepToken);
        votingEngine = RoundVotingEngine(_votingEngine);
        registry = ContentRegistry(_registry);
    }

    /// @notice Sweep any cREP accidentally held by the distributor to the protocol treasury.
    /// @dev Historical cancellation fees were mistakenly routed here in some deployments. This contract does not
    ///      custody live reward inventory, so governance can safely recover the full balance to treasury.
    function sweepStrandedCrepToTreasury() external onlyRole(DEFAULT_ADMIN_ROLE) nonReentrant returns (uint256 amount) {
        address treasury = registry.treasury();
        if (treasury == address(0)) revert TreasuryNotSet();

        amount = crepToken.balanceOf(address(this));
        if (amount == 0) revert NoStrandedCrep();

        crepToken.safeTransfer(treasury, amount);
        emit StrandedCrepSwept(treasury, amount);
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

        // Find voter's commit
        RoundLib.Commit memory commit = _findVoterCommit(contentId, roundId, msg.sender);
        require(commit.voter == msg.sender, "No vote found");
        require(commit.revealed, "Vote not revealed");

        rewardClaimed[contentId][roundId][msg.sender] = true;

        bool voterWon = (commit.isUp == round.upWins);

        if (!voterWon) {
            uint256 refund = RewardMath.calculateRevealedLoserRefund(commit.stakeAmount);
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
        uint256 reward = RewardMath.calculateVoterReward(effectiveStake, weightedWinningStake, voterPool);

        // Total payout = original stake return + reward from voter pool
        uint256 totalPayout = commit.stakeAmount + reward;

        votingEngine.transferReward(msg.sender, totalPayout);

        emit RewardClaimed(contentId, roundId, msg.sender, commit.stakeAmount, reward);
    }

    // --- Submitter Reward Claiming ---

    /// @notice Content submitter claims their 10% reward from a settled round.
    /// @param contentId The content ID.
    /// @param roundId The round ID.
    function claimSubmitterReward(uint256 contentId, uint256 roundId) external nonReentrant {
        require(!submitterRewardClaimed[contentId][roundId], "Already claimed");

        (,, address submitter,,,,,,,,,) = registry.contents(contentId);
        require(msg.sender == submitter, "Not submitter");

        RoundLib.Round memory round = _readRound(contentId, roundId);
        require(round.state == RoundLib.RoundState.Settled, "Round not settled");

        submitterRewardClaimed[contentId][roundId] = true;

        uint256 crepAmount = votingEngine.pendingSubmitterReward(contentId, roundId);

        if (crepAmount > 0) {
            votingEngine.transferReward(submitter, crepAmount);
        }

        emit SubmitterRewardClaimed(contentId, roundId, submitter, crepAmount);
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
        RoundLib.Round memory round = _readRound(contentId, roundId);
        if (round.state != RoundLib.RoundState.Settled) revert RoundNotSettled();
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

        frontendFeeClaimed[contentId][roundId][frontend] = true;
        roundFrontendClaimedCount[contentId][roundId] = claimedCount + 1;
        roundFrontendClaimedAmount[contentId][roundId] = claimedAmount + fee;

        _payoutFrontendFee(contentId, roundId, frontend, fee);
        emit FrontendFeeClaimed(contentId, roundId, frontend, fee);
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

        (uint256 totalReward, uint256 reservedReward) =
            _syncParticipationRewardSnapshot(contentId, roundId, rewardPool, rewardRateBps, winningStake);

        emit ParticipationRewardSnapshotted(contentId, roundId, rewardPool, rewardRateBps, totalReward, reservedReward);
    }

    /// @notice Backfill or top up participation reward reservations for a settled round.
    /// @dev Governance can repair legacy rounds or settlements where the snapshot side effect failed.
    function backfillParticipationRewards(uint256 contentId, uint256 roundId, address rewardPool, uint256 rewardRateBps)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        nonReentrant
        returns (uint256 reservedReward)
    {
        RoundLib.Round memory round = _readRound(contentId, roundId);
        if (round.state != RoundLib.RoundState.Settled) revert RoundNotSettled();

        uint256 winningStake = round.upWins ? round.upPool : round.downPool;
        uint256 totalReward;
        (totalReward, reservedReward) =
            _syncParticipationRewardSnapshot(contentId, roundId, rewardPool, rewardRateBps, winningStake);

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

        RoundLib.Round memory round = _readRound(contentId, roundId);
        if (round.state != RoundLib.RoundState.Settled) revert RoundNotSettled();

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

    /// @notice Release any unclaimable participation-reward dust after every winning voter is fully paid.
    /// @dev Permissionless so old rounds can be cleaned up without admin intervention.
    function finalizeParticipationRewards(uint256 contentId, uint256 roundId)
        external
        nonReentrant
        returns (uint256 releasedDust)
    {
        if (roundParticipationRewardFinalized[contentId][roundId]) revert ParticipationRewardsAlreadyFinalized();

        RoundLib.Round memory round = _readRound(contentId, roundId);
        if (round.state != RoundLib.RoundState.Settled) revert RoundNotSettled();

        uint256 winnerCount = round.upWins ? round.upCount : round.downCount;
        if (roundParticipationRewardFullyClaimedCount[contentId][roundId] != winnerCount) {
            revert ParticipationRewardsOutstanding();
        }

        address rewardPoolAddress = roundParticipationRewardPool[contentId][roundId];
        if (rewardPoolAddress == address(0)) revert NoPool();

        uint256 reservedReward = roundParticipationRewardReserved[contentId][roundId];
        uint256 paidTotal = roundParticipationRewardPaidTotal[contentId][roundId];
        releasedDust = reservedReward > paidTotal ? reservedReward - paidTotal : 0;

        roundParticipationRewardFinalized[contentId][roundId] = true;
        if (releasedDust > 0) {
            IParticipationPool(rewardPoolAddress).releaseReservedReward(releasedDust);
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
            return RoundLib.Commit(address(0), 0, "", address(0), 0, false, false, 0);
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
        (
            commit.voter,
            commit.stakeAmount,
            commit.ciphertext,
            commit.frontend,
            commit.revealableAfter,
            commit.revealed,
            commit.isUp,
            commit.epochIndex
        ) = votingEngine.commits(contentId, roundId, commitKey);
    }

    function _payoutFrontendFee(uint256 contentId, uint256 roundId, address frontend, uint256 fee) internal {
        if (fee == 0) return;

        address snapshotRegistryAddress = votingEngine.roundFrontendRegistrySnapshot(contentId, roundId);
        if (snapshotRegistryAddress == address(0)) {
            votingEngine.transferReward(frontend, fee);
            return;
        }

        IFrontendRegistry snapshotRegistry = IFrontendRegistry(snapshotRegistryAddress);

        try snapshotRegistry.getFrontendInfo(frontend) returns (
            address frontendOperator, uint256 stakedAmount, bool, bool slashed
        ) {
            if (frontendOperator == address(0)) {
                votingEngine.transferReward(frontend, fee);
                return;
            }
            if (slashed || stakedAmount < snapshotRegistry.STAKE_AMOUNT()) {
                _routeFrontendFeeToProtocol(fee);
                return;
            }
            try snapshotRegistry.creditFees(frontend, fee) {
                votingEngine.transferReward(snapshotRegistryAddress, fee);
            } catch {
                _routeFrontendFeeToProtocol(fee);
            }
        } catch {
            votingEngine.transferReward(frontend, fee);
        }
    }

    function _routeFrontendFeeToProtocol(uint256 fee) internal {
        address treasury = registry.treasury();
        if (treasury != address(0)) {
            votingEngine.transferReward(treasury, fee);
            return;
        }

        votingEngine.transferReward(address(this), fee);
        crepToken.forceApprove(address(votingEngine), fee);
        votingEngine.addToConsensusReserve(fee);
    }

    function _syncParticipationRewardSnapshot(
        uint256 contentId,
        uint256 roundId,
        address rewardPool,
        uint256 rewardRateBps,
        uint256 winningStake
    ) internal returns (uint256 totalReward, uint256 reservedReward) {
        if (rewardPool == address(0)) revert NoPool();
        if (rewardRateBps == 0) revert NoParticipationRate();
        if (roundParticipationRewardFinalized[contentId][roundId]) revert InvalidParticipationSnapshot();

        address existingRewardPool = roundParticipationRewardPool[contentId][roundId];
        if (existingRewardPool != address(0) && existingRewardPool != rewardPool) {
            revert InvalidParticipationSnapshot();
        }

        uint256 existingRateBps = roundParticipationRewardRateBps[contentId][roundId];
        if (existingRateBps != 0 && existingRateBps != rewardRateBps) revert InvalidParticipationSnapshot();

        roundParticipationRewardPool[contentId][roundId] = rewardPool;
        roundParticipationRewardRateBps[contentId][roundId] = rewardRateBps;

        totalReward = roundParticipationRewardOwed[contentId][roundId];
        if (totalReward == 0) {
            totalReward = winningStake * rewardRateBps / 10000;
            roundParticipationRewardOwed[contentId][roundId] = totalReward;
        }

        reservedReward = roundParticipationRewardReserved[contentId][roundId];
        if (reservedReward < totalReward) {
            uint256 additionalReserved =
                IParticipationPool(rewardPool).reserveReward(address(this), totalReward - reservedReward);
            if (additionalReserved > 0) {
                reservedReward += additionalReserved;
                roundParticipationRewardReserved[contentId][roundId] = reservedReward;
            }
        }
    }

    // --- Storage Gap for Future Upgrades ---
    uint256[38] private __gap;
}
