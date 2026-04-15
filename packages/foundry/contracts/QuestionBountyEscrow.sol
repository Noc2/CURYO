// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { AccessControlUpgradeable } from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import { PausableUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import { ReentrancyGuardTransient } from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { SafeCast } from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import { ContentRegistry } from "./ContentRegistry.sol";
import { RoundVotingEngine } from "./RoundVotingEngine.sol";
import { IVoterIdNFT } from "./interfaces/IVoterIdNFT.sol";
import { RoundLib } from "./libraries/RoundLib.sol";

/// @title QuestionBountyEscrow
/// @notice Holds per-question USDC bounties and pays equal per-round rewards to revealed voters.
/// @dev Curyo 2 keeps cREP coherence penalties in the voting engine. Stablecoin payouts are participation rewards.
contract QuestionBountyEscrow is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardTransient
{
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    bytes32 public constant CONFIG_ROLE = keccak256("CONFIG_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant MIN_REQUIRED_VOTERS = 3;
    uint256 public constant MIN_REQUIRED_SETTLED_ROUNDS = 1;

    struct Bounty {
        uint64 id;
        uint64 contentId;
        uint64 startRoundId;
        uint64 expiresAt;
        address funder;
        uint256 funderVoterId;
        uint256 fundedAmount;
        uint256 unallocatedAmount;
        uint256 allocatedAmount;
        uint256 claimedAmount;
        uint32 requiredVoters;
        uint32 requiredSettledRounds;
        uint32 qualifiedRounds;
        bool refunded;
    }

    struct RoundSnapshot {
        bool qualified;
        uint32 eligibleVoters;
        uint256 allocation;
        uint256 claimedAmount;
        uint32 claimedCount;
    }

    IERC20 public usdcToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    IVoterIdNFT public voterIdNFT;
    uint256 public nextBountyId;

    mapping(uint256 => Bounty) public bounties;
    mapping(uint256 => mapping(uint256 => RoundSnapshot)) public roundSnapshots;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => bool))) public rewardClaimed;

    event BountyCreated(
        uint256 indexed bountyId,
        uint256 indexed contentId,
        address indexed funder,
        uint256 funderVoterId,
        uint256 amount,
        uint256 requiredVoters,
        uint256 requiredSettledRounds,
        uint256 startRoundId,
        uint256 expiresAt
    );
    event BountyRoundQualified(
        uint256 indexed bountyId,
        uint256 indexed contentId,
        uint256 indexed roundId,
        uint256 allocation,
        uint256 eligibleVoters
    );
    event BountyRewardClaimed(
        uint256 indexed bountyId,
        uint256 indexed contentId,
        uint256 indexed roundId,
        address claimant,
        uint256 voterId,
        uint256 amount
    );
    event BountyRefunded(uint256 indexed bountyId, address indexed funder, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address usdcToken_,
        address registry_,
        address votingEngine_,
        address voterIdNFT_
    ) external initializer {
        require(admin != address(0), "Invalid admin");
        require(usdcToken_ != address(0), "Invalid token");
        require(registry_ != address(0), "Invalid registry");
        require(votingEngine_ != address(0), "Invalid engine");
        require(voterIdNFT_ != address(0), "Invalid Voter ID");

        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CONFIG_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);

        usdcToken = IERC20(usdcToken_);
        registry = ContentRegistry(registry_);
        votingEngine = RoundVotingEngine(votingEngine_);
        voterIdNFT = IVoterIdNFT(voterIdNFT_);
        nextBountyId = 1;
    }

    function createBounty(
        uint256 contentId,
        uint256 amount,
        uint256 requiredVoters,
        uint256 requiredSettledRounds,
        uint256 expiresAt
    ) external nonReentrant whenNotPaused returns (uint256 bountyId) {
        require(amount > 0, "Amount required");
        require(registry.isContentActive(contentId), "Content not active");
        require(requiredVoters >= MIN_REQUIRED_VOTERS, "Too few voters");
        require(requiredSettledRounds >= MIN_REQUIRED_SETTLED_ROUNDS, "Too few rounds");
        if (expiresAt != 0) {
            require(expiresAt > block.timestamp, "Invalid expiry");
        }

        uint256 funderVoterId = _requireVoterId(msg.sender);
        uint256 fundedAmount = _pullExactUsdc(amount);

        uint256 currentRoundId = votingEngine.currentRoundId(contentId);
        uint256 startRoundId = currentRoundId == 0 ? 1 : currentRoundId + 1;

        bountyId = nextBountyId++;
        bounties[bountyId] = Bounty({
            id: bountyId.toUint64(),
            contentId: contentId.toUint64(),
            startRoundId: startRoundId.toUint64(),
            expiresAt: expiresAt.toUint64(),
            funder: msg.sender,
            funderVoterId: funderVoterId,
            fundedAmount: fundedAmount,
            unallocatedAmount: fundedAmount,
            allocatedAmount: 0,
            claimedAmount: 0,
            requiredVoters: requiredVoters.toUint32(),
            requiredSettledRounds: requiredSettledRounds.toUint32(),
            qualifiedRounds: 0,
            refunded: false
        });

        emit BountyCreated(
            bountyId,
            contentId,
            msg.sender,
            funderVoterId,
            fundedAmount,
            requiredVoters,
            requiredSettledRounds,
            startRoundId,
            expiresAt
        );
    }

    function qualifyRound(uint256 bountyId, uint256 roundId) external nonReentrant whenNotPaused {
        Bounty storage bounty = _getIncompleteBounty(bountyId);
        _qualifyRound(bountyId, bounty, roundId);
    }

    function claimBountyReward(uint256 bountyId, uint256 roundId)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 rewardAmount)
    {
        Bounty storage bounty = _getActiveBounty(bountyId);
        _qualifyRoundIfNeeded(bountyId, bounty, roundId);

        uint256 voterId = _requireVoterId(msg.sender);
        require(!_isExcludedVoter(bounty, voterId), "Excluded voter");
        require(!rewardClaimed[bountyId][roundId][voterId], "Already claimed");

        bytes32 commitKey = votingEngine.voterIdCommitKey(bounty.contentId, roundId, voterId);
        require(commitKey != bytes32(0), "No commit");
        require(votingEngine.commitVoterId(bounty.contentId, roundId, commitKey) == voterId, "Wrong Voter ID");

        (address voter,,,,,,, bool revealed,,) = votingEngine.commits(bounty.contentId, roundId, commitKey);
        require(voter != address(0), "No commit");
        require(revealed, "Vote not revealed");

        RoundSnapshot storage snapshot = roundSnapshots[bountyId][roundId];
        rewardAmount = snapshot.allocation / snapshot.eligibleVoters;
        if (snapshot.claimedCount + 1 == snapshot.eligibleVoters) {
            rewardAmount = snapshot.allocation - snapshot.claimedAmount;
        }
        require(rewardAmount > 0, "No reward");

        rewardClaimed[bountyId][roundId][voterId] = true;
        snapshot.claimedCount++;
        snapshot.claimedAmount += rewardAmount;
        bounty.claimedAmount += rewardAmount;

        usdcToken.safeTransfer(msg.sender, rewardAmount);
        emit BountyRewardClaimed(bountyId, bounty.contentId, roundId, msg.sender, voterId, rewardAmount);
    }

    function refundExpiredBounty(uint256 bountyId) external nonReentrant whenNotPaused returns (uint256 refundAmount) {
        Bounty storage bounty = bounties[bountyId];
        require(bounty.id != 0, "Bounty not found");
        require(!bounty.refunded, "Already refunded");
        require(bounty.expiresAt != 0 && block.timestamp > bounty.expiresAt, "Not expired");
        require(bounty.qualifiedRounds < bounty.requiredSettledRounds, "Bounty complete");

        refundAmount = bounty.unallocatedAmount;
        require(refundAmount > 0, "No refund");

        bounty.refunded = true;
        bounty.unallocatedAmount = 0;
        usdcToken.safeTransfer(bounty.funder, refundAmount);
        emit BountyRefunded(bountyId, bounty.funder, refundAmount);
    }

    function claimableBountyReward(uint256 bountyId, uint256 roundId, address account)
        external
        view
        returns (uint256 claimableAmount)
    {
        Bounty storage bounty = bounties[bountyId];
        if (bounty.id == 0 || bounty.refunded) return 0;

        uint256 voterId = voterIdNFT.getTokenId(account);
        if (voterId == 0 || _isExcludedVoter(bounty, voterId) || rewardClaimed[bountyId][roundId][voterId]) return 0;

        if (!_hasRevealedCommit(bounty.contentId, roundId, voterId)) return 0;

        RoundSnapshot storage snapshot = roundSnapshots[bountyId][roundId];
        if (!snapshot.qualified) {
            if (roundId < bounty.startRoundId || bounty.qualifiedRounds >= bounty.requiredSettledRounds) return 0;
            (, bool canQualify, uint256 eligibleVoters) = _previewRoundQualification(bounty, roundId);
            if (!canQualify) return 0;

            uint256 allocation = _previewRoundAllocation(bounty);
            if (allocation == 0) return 0;
            return allocation / eligibleVoters;
        }
        if (snapshot.eligibleVoters == 0) return 0;
        claimableAmount = snapshot.allocation / snapshot.eligibleVoters;
        if (snapshot.claimedCount + 1 == snapshot.eligibleVoters) {
            claimableAmount = snapshot.allocation - snapshot.claimedAmount;
        }
    }

    function setVoterIdNFT(address voterIdNFT_) external onlyRole(CONFIG_ROLE) {
        require(voterIdNFT_ != address(0), "Invalid Voter ID");
        voterIdNFT = IVoterIdNFT(voterIdNFT_);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _pullExactUsdc(uint256 amount) internal returns (uint256 receivedAmount) {
        uint256 balanceBefore = usdcToken.balanceOf(address(this));
        usdcToken.safeTransferFrom(msg.sender, address(this), amount);
        receivedAmount = usdcToken.balanceOf(address(this)) - balanceBefore;
        require(receivedAmount == amount, "Fee token unsupported");
    }

    function _getActiveBounty(uint256 bountyId) internal view returns (Bounty storage bounty) {
        bounty = bounties[bountyId];
        require(bounty.id != 0, "Bounty not found");
        require(!bounty.refunded, "Bounty refunded");
    }

    function _getIncompleteBounty(uint256 bountyId) internal view returns (Bounty storage bounty) {
        bounty = _getActiveBounty(bountyId);
        require(bounty.qualifiedRounds < bounty.requiredSettledRounds, "Bounty complete");
    }

    function _qualifyRoundIfNeeded(uint256 bountyId, Bounty storage bounty, uint256 roundId) internal {
        if (!roundSnapshots[bountyId][roundId].qualified) {
            require(bounty.qualifiedRounds < bounty.requiredSettledRounds, "Bounty complete");
            _qualifyRound(bountyId, bounty, roundId);
        }
    }

    function _qualifyRound(uint256 bountyId, Bounty storage bounty, uint256 roundId) internal {
        require(roundId >= bounty.startRoundId, "Round too early");
        require(!roundSnapshots[bountyId][roundId].qualified, "Round qualified");

        (bool roundSettled, bool canQualify, uint256 eligibleVoters) = _previewRoundQualification(bounty, roundId);
        require(roundSettled, "Round not settled");
        require(canQualify, "Too few eligible voters");

        uint256 allocation = _previewRoundAllocation(bounty);
        require(allocation > 0 && allocation <= bounty.unallocatedAmount, "No allocation");

        bounty.qualifiedRounds++;
        bounty.unallocatedAmount -= allocation;
        bounty.allocatedAmount += allocation;

        roundSnapshots[bountyId][roundId] = RoundSnapshot({
            qualified: true,
            eligibleVoters: eligibleVoters.toUint32(),
            allocation: allocation,
            claimedAmount: 0,
            claimedCount: 0
        });

        emit BountyRoundQualified(bountyId, bounty.contentId, roundId, allocation, eligibleVoters);
    }

    function _previewRoundQualification(Bounty storage bounty, uint256 roundId)
        internal
        view
        returns (bool roundSettled, bool canQualify, uint256 eligibleVoters)
    {
        (, RoundLib.RoundState state,, uint16 revealedCount,,,,,,,,,,) = votingEngine.rounds(bounty.contentId, roundId);
        if (state != RoundLib.RoundState.Settled) return (false, false, 0);

        roundSettled = true;
        eligibleVoters = revealedCount;
        if (eligibleVoters == 0) return (true, false, 0);
        if (_hasRevealedCommit(bounty.contentId, roundId, bounty.funderVoterId)) {
            eligibleVoters--;
        }
        uint256 submitterVoterId = _submitterVoterId(bounty.contentId);
        if (
            submitterVoterId != 0 && submitterVoterId != bounty.funderVoterId
                && _hasRevealedCommit(bounty.contentId, roundId, submitterVoterId)
        ) {
            eligibleVoters--;
        }
        canQualify = eligibleVoters >= bounty.requiredVoters;
    }

    function _previewRoundAllocation(Bounty storage bounty) internal view returns (uint256 allocation) {
        if (bounty.qualifiedRounds >= bounty.requiredSettledRounds) return 0;
        uint256 remainingRounds = uint256(bounty.requiredSettledRounds) - bounty.qualifiedRounds;
        allocation = remainingRounds == 1 ? bounty.unallocatedAmount : bounty.fundedAmount / bounty.requiredSettledRounds;
        if (allocation > bounty.unallocatedAmount) return 0;
    }

    function _hasRevealedCommit(uint256 contentId, uint256 roundId, uint256 voterId) internal view returns (bool) {
        if (voterId == 0) return false;
        bytes32 commitKey = votingEngine.voterIdCommitKey(contentId, roundId, voterId);
        if (commitKey == bytes32(0)) return false;
        (address voter,,,,,,, bool revealed,,) = votingEngine.commits(contentId, roundId, commitKey);
        return voter != address(0) && revealed;
    }

    function _isExcludedVoter(Bounty storage bounty, uint256 voterId) internal view returns (bool) {
        return voterId == bounty.funderVoterId || voterId == _submitterVoterId(bounty.contentId);
    }

    function _submitterVoterId(uint256 contentId) internal view returns (uint256) {
        address submitterIdentity = registry.getSubmitterIdentity(contentId);
        if (submitterIdentity == address(0)) return 0;
        return voterIdNFT.getTokenId(submitterIdentity);
    }

    function _requireVoterId(address account) internal view returns (uint256 voterId) {
        voterId = voterIdNFT.getTokenId(account);
        require(voterId != 0, "Voter ID required");
    }
}
