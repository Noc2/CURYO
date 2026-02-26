// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { UUPSUpgradeable } from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import { RoundVotingEngine } from "./RoundVotingEngine.sol";
import { ContentRegistry } from "./ContentRegistry.sol";
import { RoundLib } from "./libraries/RoundLib.sol";
import { RewardMath } from "./libraries/RewardMath.sol";

/// @title RoundRewardDistributor
/// @notice Pull-based reward claiming for settled rounds.
/// @dev NOT pausable — users must always be able to withdraw their funds.
///      Simplified from EpochRewardDistributor: no global pool, no isEpochFullySettled gate.
///      Claims work immediately after a round settles.
contract RoundRewardDistributor is Initializable, AccessControlUpgradeable, ReentrancyGuardTransient, UUPSUpgradeable {
    // --- Access Control Roles ---
    bytes32 public constant UPGRADER_ROLE = keccak256("UPGRADER_ROLE");

    // --- State ---
    IERC20 public crepToken;
    RoundVotingEngine public votingEngine;
    ContentRegistry public registry;

    // Track claimed rewards: contentId => roundId => voter => claimed
    mapping(uint256 => mapping(uint256 => mapping(address => bool))) public rewardClaimed;

    // Track submitter reward claims: contentId => roundId => claimed
    mapping(uint256 => mapping(uint256 => bool)) public submitterRewardClaimed;

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

    // --- Voter Reward Claiming ---

    /// @notice Claim reward for a settled round.
    /// @dev Returns stake + proportional rewards from the content-specific voter pool.
    ///      No global pool — all 87% of voter share is content-specific.
    ///      No waiting for other content to settle — claims work immediately.
    /// @param contentId The content ID.
    /// @param roundId The round ID.
    function claimReward(uint256 contentId, uint256 roundId) external nonReentrant {
        require(!rewardClaimed[contentId][roundId][msg.sender], "Already claimed");

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        require(round.state == RoundLib.RoundState.Settled, "Round not settled");

        // Find voter's commit
        RoundLib.Commit memory commit = _findVoterCommit(contentId, roundId, msg.sender);
        require(commit.voter == msg.sender, "No vote found");
        require(commit.revealed, "Vote not revealed");

        rewardClaimed[contentId][roundId][msg.sender] = true;

        bool voterWon = (commit.isUp == round.upWins);

        if (!voterWon) {
            emit LoserNotified(contentId, roundId, msg.sender);
            return;
        }

        // Voter won: return stake + content-specific pool reward
        uint256 voterPool = votingEngine.roundVoterPool(contentId, roundId);
        uint256 winningStake = votingEngine.roundWinningStake(contentId, roundId);
        uint256 reward = RewardMath.calculateVoterReward(commit.stakeAmount, winningStake, voterPool);

        // Total = stake return + reward
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

        RoundLib.Round memory round = votingEngine.getRound(contentId, roundId);
        require(round.state == RoundLib.RoundState.Settled, "Round not settled");

        submitterRewardClaimed[contentId][roundId] = true;

        uint256 crepAmount = votingEngine.pendingSubmitterReward(contentId, roundId);

        if (crepAmount > 0) {
            votingEngine.transferReward(submitter, crepAmount);
        }

        emit SubmitterRewardClaimed(contentId, roundId, submitter, crepAmount);
    }

    // --- Internal ---

    /// @dev Find a voter's commit using the O(1) voter-to-commitHash mapping.
    function _findVoterCommit(uint256 contentId, uint256 roundId, address voter)
        internal
        view
        returns (RoundLib.Commit memory)
    {
        bytes32 commitHash = votingEngine.getVoterCommitHash(contentId, roundId, voter);
        if (commitHash == bytes32(0)) {
            // Return empty commit (voter check will fail)
            return RoundLib.Commit(address(0), 0, "", address(0), 0, false, false);
        }
        bytes32 commitKey = keccak256(abi.encodePacked(voter, commitHash));
        return votingEngine.getCommit(contentId, roundId, commitKey);
    }

    // --- Admin ---

    function _authorizeUpgrade(address newImplementation) internal override onlyRole(UPGRADER_ROLE) { }

    // --- Storage Gap for UUPS Upgradeability ---
    uint256[50] private __gap;
}
