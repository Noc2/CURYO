// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
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
contract RoundRewardDistributor is Initializable, AccessControlUpgradeable, ReentrancyGuardTransient, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    // --- Access Control Roles ---
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // --- Custom Errors ---
    error RoundNotSettled();
    error AlreadyClaimed();
    error NoPool();
    error NoStake();
    error NoApprovedStake();
    error PoolExhausted();
    error PoolDepleted();
    error VoteNotRevealed();
    error NotWinningSide();
    error NoParticipationRate();
    error NoCommit();
    error NoStrandedCrep();
    error TreasuryNotSet();

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

    // --- Events ---
    event RewardClaimed(
        uint256 indexed contentId,
        uint256 indexed roundId,
        address indexed voter,
        uint256 stakeReturned,
        uint256 crepReward
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
        _grantRole(UPGRADER_ROLE, _governance);

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

        // Total = original stake return + reward from voter pool
        uint256 crepReward = commit.stakeAmount + reward;

        votingEngine.transferReward(msg.sender, crepReward);

        emit RewardClaimed(contentId, roundId, msg.sender, commit.stakeAmount, crepReward);
    }

    // --- Submitter Reward Claiming ---

    /// @notice Content submitter claims their 10% reward from a settled round.
    /// @param contentId The content ID.
    /// @param roundId The round ID.
    function claimSubmitterReward(uint256 contentId, uint256 roundId) external nonReentrant {
        require(!submitterRewardClaimed[contentId][roundId], "Already claimed");

        address submitter = registry.getSubmitter(contentId);
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
        uint256 totalApprovedStake = votingEngine.roundStakeWithApprovedFrontend(contentId, roundId);
        uint256 totalFrontendClaimants = votingEngine.roundApprovedFrontendCount(contentId, roundId);

        if (totalFrontendPool == 0) revert NoPool();
        if (frontendStake == 0) revert NoStake();
        if (totalApprovedStake == 0) revert NoApprovedStake();
        if (totalFrontendClaimants == 0) revert NoPool();

        uint256 claimedCount = roundFrontendClaimedCount[contentId][roundId];
        uint256 claimedAmount = roundFrontendClaimedAmount[contentId][roundId];
        if (claimedAmount > totalFrontendPool) revert PoolExhausted();

        if (claimedCount + 1 == totalFrontendClaimants) {
            fee = totalFrontendPool - claimedAmount;
        } else {
            fee = (totalFrontendPool * frontendStake) / totalApprovedStake;
        }

        frontendFeeClaimed[contentId][roundId][frontend] = true;
        roundFrontendClaimedCount[contentId][roundId] = claimedCount + 1;
        roundFrontendClaimedAmount[contentId][roundId] = claimedAmount + fee;

        _payoutFrontendFee(contentId, roundId, frontend, fee);
        emit FrontendFeeClaimed(contentId, roundId, frontend, fee);
    }

    /// @notice Claim a participation reward for the caller on a settled round.
    function claimParticipationReward(uint256 contentId, uint256 roundId) external nonReentrant returns (uint256 paidReward)
    {
        address voter = msg.sender;
        if (participationRewardClaimed[contentId][roundId][voter]) revert AlreadyClaimed();

        RoundLib.Round memory round = _readRound(contentId, roundId);
        if (round.state != RoundLib.RoundState.Settled) revert RoundNotSettled();

        address rewardPoolAddress = votingEngine.roundParticipationPool(contentId, roundId);
        uint256 rateBps = votingEngine.roundParticipationRateBps(contentId, roundId);
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
            return 0;
        }

        uint256 alreadyPaid = participationRewardPaid[contentId][roundId][voter];
        if (alreadyPaid >= reward) revert AlreadyClaimed();

        uint256 remainingReward = reward - alreadyPaid;
        paidReward = IParticipationPool(rewardPoolAddress).distributeReward(voter, remainingReward);
        if (paidReward == 0) revert PoolDepleted();

        uint256 totalPaid = alreadyPaid + paidReward;
        participationRewardPaid[contentId][roundId][voter] = totalPaid;
        if (totalPaid == reward) {
            participationRewardClaimed[contentId][roundId][voter] = true;
        }

        emit ParticipationRewardClaimed(contentId, roundId, voter, paidReward);
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
            address frontendOperator, uint256, bool, bool frontendSlashed
        ) {
            if (frontendOperator == address(0) || frontendSlashed) {
                if (frontendOperator == address(0)) {
                    votingEngine.transferReward(frontend, fee);
                    return;
                }
                address treasury = votingEngine.treasury();
                if (treasury == address(0)) {
                    revert IFrontendRegistry.FrontendIsSlashed();
                }
                votingEngine.transferReward(treasury, fee);
                return;
            }

            try snapshotRegistry.creditFees(frontend, fee) {
                votingEngine.transferReward(snapshotRegistryAddress, fee);
            } catch {
                votingEngine.transferReward(frontend, fee);
            }
        } catch {
            votingEngine.transferReward(frontend, fee);
        }
    }

    // --- Admin ---

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) { }

    // --- Storage Gap for UUPS Upgradeability ---
    uint256[45] private __gap;
}
