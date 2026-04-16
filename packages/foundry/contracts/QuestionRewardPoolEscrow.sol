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
import { IFrontendRegistry } from "./interfaces/IFrontendRegistry.sol";
import { IVoterIdNFT } from "./interfaces/IVoterIdNFT.sol";
import { RoundLib } from "./libraries/RoundLib.sol";

/// @title QuestionRewardPoolEscrow
/// @notice Holds per-question USDC reward pools and pays equal per-round rewards to revealed voters.
/// @dev Curyo 2 keeps cREP coherence penalties in the voting engine. Stablecoin payouts are participation rewards.
contract QuestionRewardPoolEscrow is
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
    uint256 public constant BPS_SCALE = 10_000;
    uint256 public constant DEFAULT_FRONTEND_FEE_BPS = 300;
    uint256 public constant MAX_FRONTEND_FEE_BPS = 500;

    struct RewardPool {
        uint64 id;
        uint64 contentId;
        uint64 startRoundId;
        uint64 nextRoundToEvaluate;
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
        uint16 frontendFeeBps;
        uint256 voterClaimedAmount;
        uint256 frontendClaimedAmount;
    }

    struct RoundSnapshot {
        bool qualified;
        uint32 eligibleVoters;
        uint256 allocation;
        uint256 claimedAmount;
        uint32 claimedCount;
        uint256 frontendFeeAllocation;
        uint256 voterClaimedAmount;
        uint256 frontendClaimedAmount;
    }

    IERC20 public usdcToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    IVoterIdNFT public voterIdNFT;
    uint256 public nextRewardPoolId;

    mapping(uint256 => RewardPool) private rewardPools;
    mapping(uint256 => mapping(uint256 => RoundSnapshot)) public roundSnapshots;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => bool))) public rewardClaimed;
    uint16 public defaultFrontendFeeBps;

    event RewardPoolCreated(
        uint256 indexed rewardPoolId,
        uint256 indexed contentId,
        address indexed funder,
        uint256 funderVoterId,
        uint256 amount,
        uint256 requiredVoters,
        uint256 requiredSettledRounds,
        uint256 startRoundId,
        uint256 expiresAt,
        uint256 frontendFeeBps
    );
    event RewardPoolRoundQualified(
        uint256 indexed rewardPoolId,
        uint256 indexed contentId,
        uint256 indexed roundId,
        uint256 allocation,
        uint256 eligibleVoters,
        uint256 frontendFeeAllocation
    );
    event QuestionRewardClaimed(
        uint256 indexed rewardPoolId,
        uint256 indexed contentId,
        uint256 indexed roundId,
        address claimant,
        uint256 voterId,
        uint256 amount,
        address frontend,
        address frontendRecipient,
        uint256 frontendFee,
        uint256 grossAmount
    );
    event RewardPoolRefunded(uint256 indexed rewardPoolId, address indexed funder, uint256 amount);
    event DefaultFrontendFeeBpsUpdated(uint256 previousFrontendFeeBps, uint256 newFrontendFeeBps);

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
        nextRewardPoolId = 1;
        defaultFrontendFeeBps = DEFAULT_FRONTEND_FEE_BPS.toUint16();
    }

    function createRewardPool(
        uint256 contentId,
        uint256 amount,
        uint256 requiredVoters,
        uint256 requiredSettledRounds,
        uint256 expiresAt
    ) external nonReentrant whenNotPaused returns (uint256 rewardPoolId) {
        require(amount > 0, "Amount required");
        require(registry.isContentActive(contentId), "Content not active");
        require(requiredVoters >= MIN_REQUIRED_VOTERS, "Too few voters");
        require(requiredSettledRounds >= MIN_REQUIRED_SETTLED_ROUNDS, "Too few rounds");
        (,,, uint16 maxVoters) = votingEngine.protocolConfig().config();
        require(amount >= requiredSettledRounds * uint256(maxVoters), "Amount too small");
        if (expiresAt != 0) {
            require(expiresAt > block.timestamp, "Invalid expiry");
        }

        uint256 funderVoterId = _requireVoterId(msg.sender);
        uint256 fundedAmount = _pullExactUsdc(amount);

        uint256 currentRoundId = votingEngine.currentRoundId(contentId);
        uint256 startRoundId = currentRoundId == 0 ? 1 : currentRoundId + 1;

        rewardPoolId = nextRewardPoolId++;
        rewardPools[rewardPoolId] = RewardPool({
            id: rewardPoolId.toUint64(),
            contentId: contentId.toUint64(),
            startRoundId: startRoundId.toUint64(),
            nextRoundToEvaluate: startRoundId.toUint64(),
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
            refunded: false,
            frontendFeeBps: defaultFrontendFeeBps,
            voterClaimedAmount: 0,
            frontendClaimedAmount: 0
        });

        emit RewardPoolCreated(
            rewardPoolId,
            contentId,
            msg.sender,
            funderVoterId,
            fundedAmount,
            requiredVoters,
            requiredSettledRounds,
            startRoundId,
            expiresAt,
            defaultFrontendFeeBps
        );
    }

    function qualifyRound(uint256 rewardPoolId, uint256 roundId) external nonReentrant whenNotPaused {
        RewardPool storage rewardPool = _getIncompleteRewardPoolForQualification(rewardPoolId);
        _qualifyRound(rewardPoolId, rewardPool, roundId);
    }

    function claimQuestionReward(uint256 rewardPoolId, uint256 roundId)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 rewardAmount)
    {
        RewardPool storage rewardPool = _getExistingRewardPool(rewardPoolId);
        _qualifyRoundIfNeeded(rewardPoolId, rewardPool, roundId);

        uint256 voterId = _requireVoterId(msg.sender);
        require(!_isExcludedVoter(rewardPool, voterId), "Excluded voter");
        require(!rewardClaimed[rewardPoolId][roundId][voterId], "Already claimed");

        bytes32 commitKey = votingEngine.voterIdCommitKey(rewardPool.contentId, roundId, voterId);
        require(commitKey != bytes32(0), "No commit");
        require(votingEngine.commitVoterId(rewardPool.contentId, roundId, commitKey) == voterId, "Wrong Voter ID");

        (bool revealed, address frontend) = _revealedCommitFrontend(rewardPool.contentId, roundId, commitKey);
        require(revealed, "Vote not revealed");

        RoundSnapshot storage snapshot = roundSnapshots[rewardPoolId][roundId];
        uint256 grossAmount = _nextEqualShare(snapshot.allocation, snapshot.eligibleVoters, snapshot.claimedCount);
        uint256 reservedFrontendFee =
            _nextEqualShare(snapshot.frontendFeeAllocation, snapshot.eligibleVoters, snapshot.claimedCount);
        uint256 frontendFee;
        address frontendRecipient;
        (rewardAmount, frontendFee, frontendRecipient) =
            _splitClaimAmounts(rewardPool, roundId, commitKey, frontend, grossAmount, reservedFrontendFee);
        require(grossAmount > 0, "No reward");

        rewardClaimed[rewardPoolId][roundId][voterId] = true;
        snapshot.claimedCount++;
        snapshot.claimedAmount += grossAmount;
        snapshot.voterClaimedAmount += rewardAmount;
        snapshot.frontendClaimedAmount += frontendFee;
        rewardPool.claimedAmount += grossAmount;
        rewardPool.voterClaimedAmount += rewardAmount;
        rewardPool.frontendClaimedAmount += frontendFee;

        if (rewardAmount > 0) {
            usdcToken.safeTransfer(msg.sender, rewardAmount);
        }
        if (frontendFee > 0) {
            usdcToken.safeTransfer(frontendRecipient, frontendFee);
        }
        emit QuestionRewardClaimed(
            rewardPoolId,
            rewardPool.contentId,
            roundId,
            msg.sender,
            voterId,
            rewardAmount,
            frontend,
            frontendRecipient,
            frontendFee,
            grossAmount
        );
    }

    function refundExpiredRewardPool(uint256 rewardPoolId)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 refundAmount)
    {
        RewardPool storage rewardPool = _getExistingRewardPool(rewardPoolId);
        require(rewardPool.expiresAt != 0 && block.timestamp > rewardPool.expiresAt, "Not expired");
        refundAmount = _refundUnallocatedRewardPool(rewardPoolId, rewardPool);
    }

    function refundInactiveRewardPool(uint256 rewardPoolId)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 refundAmount)
    {
        RewardPool storage rewardPool = _getExistingRewardPool(rewardPoolId);
        require(!registry.isContentActive(rewardPool.contentId), "Content active");
        refundAmount = _refundUnallocatedRewardPool(rewardPoolId, rewardPool);
    }

    function _refundUnallocatedRewardPool(uint256 rewardPoolId, RewardPool storage rewardPool)
        internal
        returns (uint256 refundAmount)
    {
        require(!rewardPool.refunded, "Already refunded");
        require(rewardPool.qualifiedRounds < rewardPool.requiredSettledRounds, "Reward pool complete");
        refundAmount = rewardPool.unallocatedAmount;
        require(refundAmount > 0, "No refund");
        rewardPool.refunded = true;
        rewardPool.unallocatedAmount = 0;
        usdcToken.safeTransfer(rewardPool.funder, refundAmount);
        emit RewardPoolRefunded(rewardPoolId, rewardPool.funder, refundAmount);
    }

    function claimableQuestionReward(uint256 rewardPoolId, uint256 roundId, address account)
        external
        view
        returns (uint256 claimableAmount)
    {
        RewardPool storage rewardPool = rewardPools[rewardPoolId];
        if (rewardPool.id == 0) return 0;

        uint256 voterId = voterIdNFT.getTokenId(account);
        if (voterId == 0 || _isExcludedVoter(rewardPool, voterId) || rewardClaimed[rewardPoolId][roundId][voterId]) {
            return 0;
        }

        bytes32 commitKey = votingEngine.voterIdCommitKey(rewardPool.contentId, roundId, voterId);
        if (commitKey == bytes32(0)) return 0;
        (bool revealed, address frontend) = _revealedCommitFrontend(rewardPool.contentId, roundId, commitKey);
        if (!revealed) return 0;

        RoundSnapshot storage snapshot = roundSnapshots[rewardPoolId][roundId];
        if (!snapshot.qualified) {
            if (!_canPreviewNewQualification(rewardPool, roundId)) return 0;
            (, bool canQualify, uint256 eligibleVoters) = _previewRoundQualification(rewardPool, roundId);
            if (!canQualify) return 0;

            uint256 allocation = _previewRoundAllocation(rewardPool);
            if (allocation == 0) return 0;
            if (allocation < eligibleVoters) return 0;
            uint256 previewGrossAmount = _nextEqualShare(allocation, eligibleVoters, 0);
            uint256 previewReservedFrontendFee =
                _nextEqualShare(_frontendFeeAllocation(rewardPool, allocation), eligibleVoters, 0);
            (claimableAmount,,) = _splitClaimAmounts(
                rewardPool, roundId, commitKey, frontend, previewGrossAmount, previewReservedFrontendFee
            );
            return claimableAmount;
        }
        if (snapshot.eligibleVoters == 0 || snapshot.claimedCount >= snapshot.eligibleVoters) return 0;
        uint256 grossAmount = _nextEqualShare(snapshot.allocation, snapshot.eligibleVoters, snapshot.claimedCount);
        uint256 reservedFrontendFee =
            _nextEqualShare(snapshot.frontendFeeAllocation, snapshot.eligibleVoters, snapshot.claimedCount);
        (claimableAmount,,) =
            _splitClaimAmounts(rewardPool, roundId, commitKey, frontend, grossAmount, reservedFrontendFee);
    }

    function setVoterIdNFT(address voterIdNFT_) external onlyRole(CONFIG_ROLE) {
        require(voterIdNFT_ != address(0), "Invalid Voter ID");
        voterIdNFT = IVoterIdNFT(voterIdNFT_);
    }

    function setDefaultFrontendFeeBps(uint256 frontendFeeBps_) external onlyRole(CONFIG_ROLE) {
        require(frontendFeeBps_ <= MAX_FRONTEND_FEE_BPS, "Fee too high");
        uint256 previousFrontendFeeBps = defaultFrontendFeeBps;
        defaultFrontendFeeBps = frontendFeeBps_.toUint16();
        emit DefaultFrontendFeeBpsUpdated(previousFrontendFeeBps, frontendFeeBps_);
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

    function _getExistingRewardPool(uint256 rewardPoolId) internal view returns (RewardPool storage rewardPool) {
        rewardPool = rewardPools[rewardPoolId];
        require(rewardPool.id != 0, "Reward pool not found");
    }

    function _getIncompleteRewardPoolForQualification(uint256 rewardPoolId)
        internal
        view
        returns (RewardPool storage rewardPool)
    {
        rewardPool = _getExistingRewardPool(rewardPoolId);
        _requirePoolOpenForQualification(rewardPool);
        require(rewardPool.qualifiedRounds < rewardPool.requiredSettledRounds, "Reward pool complete");
    }

    function _qualifyRoundIfNeeded(uint256 rewardPoolId, RewardPool storage rewardPool, uint256 roundId) internal {
        if (!roundSnapshots[rewardPoolId][roundId].qualified) {
            _requirePoolOpenForQualification(rewardPool);
            require(rewardPool.qualifiedRounds < rewardPool.requiredSettledRounds, "Reward pool complete");
            _qualifyRound(rewardPoolId, rewardPool, roundId);
        }
    }

    function _requirePoolOpenForQualification(RewardPool storage rewardPool) internal view {
        require(!rewardPool.refunded, "Reward pool refunded");
        require(rewardPool.expiresAt == 0 || block.timestamp <= rewardPool.expiresAt, "Reward pool expired");
        require(registry.isContentActive(rewardPool.contentId), "Content not active");
    }

    function _qualifyRound(uint256 rewardPoolId, RewardPool storage rewardPool, uint256 roundId) internal {
        require(roundId >= rewardPool.startRoundId, "Round too early");
        require(!roundSnapshots[rewardPoolId][roundId].qualified, "Round qualified");
        _advancePastIneligibleRounds(rewardPool, roundId);
        require(roundId == rewardPool.nextRoundToEvaluate, "Round out of order");

        (bool roundSettled, bool canQualify, uint256 eligibleVoters) = _previewRoundQualification(rewardPool, roundId);
        require(roundSettled, "Round not settled");
        require(canQualify, "Too few eligible voters");

        uint256 allocation = _previewRoundAllocation(rewardPool);
        require(allocation > 0 && allocation <= rewardPool.unallocatedAmount, "No allocation");
        require(allocation >= eligibleVoters, "Reward allocation too small");
        uint256 frontendFeeAllocation = _frontendFeeAllocation(rewardPool, allocation);

        rewardPool.qualifiedRounds++;
        rewardPool.nextRoundToEvaluate = (roundId + 1).toUint64();
        rewardPool.unallocatedAmount -= allocation;
        rewardPool.allocatedAmount += allocation;

        roundSnapshots[rewardPoolId][roundId] = RoundSnapshot({
            qualified: true,
            eligibleVoters: eligibleVoters.toUint32(),
            allocation: allocation,
            claimedAmount: 0,
            claimedCount: 0,
            frontendFeeAllocation: frontendFeeAllocation,
            voterClaimedAmount: 0,
            frontendClaimedAmount: 0
        });

        emit RewardPoolRoundQualified(
            rewardPoolId, rewardPool.contentId, roundId, allocation, eligibleVoters, frontendFeeAllocation
        );
    }

    function _advancePastIneligibleRounds(RewardPool storage rewardPool, uint256 targetRoundId) internal {
        uint256 nextRoundId = rewardPool.nextRoundToEvaluate;
        require(targetRoundId >= nextRoundId, "Round already skipped");

        while (nextRoundId < targetRoundId) {
            (bool roundFinished, bool canQualify,) = _roundQualificationStatus(rewardPool, nextRoundId);
            require(roundFinished, "Earlier round unfinished");
            require(!canQualify, "Earlier round qualifies");
            nextRoundId++;
        }

        if (nextRoundId != rewardPool.nextRoundToEvaluate) {
            rewardPool.nextRoundToEvaluate = nextRoundId.toUint64();
        }
    }

    function _canPreviewNewQualification(RewardPool storage rewardPool, uint256 roundId) internal view returns (bool) {
        if (rewardPool.refunded || rewardPool.qualifiedRounds >= rewardPool.requiredSettledRounds) return false;
        if (rewardPool.expiresAt != 0 && block.timestamp > rewardPool.expiresAt) return false;
        if (!registry.isContentActive(rewardPool.contentId)) return false;
        if (roundId < rewardPool.startRoundId || roundId < rewardPool.nextRoundToEvaluate) return false;

        for (uint256 nextRoundId = rewardPool.nextRoundToEvaluate; nextRoundId < roundId; nextRoundId++) {
            (bool roundFinished, bool canQualify,) = _roundQualificationStatus(rewardPool, nextRoundId);
            if (!roundFinished || canQualify) return false;
        }

        return true;
    }

    function _previewRoundQualification(RewardPool storage rewardPool, uint256 roundId)
        internal
        view
        returns (bool roundSettled, bool canQualify, uint256 eligibleVoters)
    {
        (, RoundLib.RoundState state,, uint16 revealedCount,,,,,,,,,,) =
            votingEngine.rounds(rewardPool.contentId, roundId);
        if (state != RoundLib.RoundState.Settled) return (false, false, 0);

        roundSettled = true;
        eligibleVoters = revealedCount;
        if (eligibleVoters == 0) return (true, false, 0);
        if (_hasRevealedCommit(rewardPool.contentId, roundId, rewardPool.funderVoterId)) {
            eligibleVoters--;
        }
        uint256 submitterVoterId = _submitterVoterId(rewardPool.contentId);
        if (
            submitterVoterId != 0 && submitterVoterId != rewardPool.funderVoterId
                && _hasRevealedCommit(rewardPool.contentId, roundId, submitterVoterId)
        ) {
            eligibleVoters--;
        }
        canQualify = eligibleVoters >= rewardPool.requiredVoters;
    }

    function _roundQualificationStatus(RewardPool storage rewardPool, uint256 roundId)
        internal
        view
        returns (bool roundFinished, bool canQualify, uint256 eligibleVoters)
    {
        (, RoundLib.RoundState state,,,,,,,,,,,,) = votingEngine.rounds(rewardPool.contentId, roundId);
        if (state == RoundLib.RoundState.Open) return (false, false, 0);
        if (state != RoundLib.RoundState.Settled) return (true, false, 0);

        (, canQualify, eligibleVoters) = _previewRoundQualification(rewardPool, roundId);
        if (canQualify) {
            uint256 allocation = _previewRoundAllocation(rewardPool);
            canQualify = allocation >= eligibleVoters;
        }
        return (true, canQualify, eligibleVoters);
    }

    function _previewRoundAllocation(RewardPool storage rewardPool) internal view returns (uint256 allocation) {
        if (rewardPool.qualifiedRounds >= rewardPool.requiredSettledRounds) return 0;
        uint256 remainingRounds = uint256(rewardPool.requiredSettledRounds) - rewardPool.qualifiedRounds;
        allocation = remainingRounds == 1
            ? rewardPool.unallocatedAmount
            : rewardPool.fundedAmount / rewardPool.requiredSettledRounds;
        if (allocation > rewardPool.unallocatedAmount) return 0;
    }

    function _hasRevealedCommit(uint256 contentId, uint256 roundId, uint256 voterId) internal view returns (bool) {
        if (voterId == 0) return false;
        bytes32 commitKey = votingEngine.voterIdCommitKey(contentId, roundId, voterId);
        if (commitKey == bytes32(0)) return false;
        (bool revealed,) = _revealedCommitFrontend(contentId, roundId, commitKey);
        return revealed;
    }

    function _revealedCommitFrontend(uint256 contentId, uint256 roundId, bytes32 commitKey)
        internal
        view
        returns (bool revealed, address frontend)
    {
        (address voter,,,,, address commitFrontend,, bool commitRevealed,,) =
            votingEngine.commits(contentId, roundId, commitKey);
        return (voter != address(0) && commitRevealed, commitFrontend);
    }

    function _frontendFeeAllocation(RewardPool storage rewardPool, uint256 allocation) internal view returns (uint256) {
        return (allocation * rewardPool.frontendFeeBps) / BPS_SCALE;
    }

    function _nextEqualShare(uint256 totalAmount, uint256 eligibleVoters, uint256 claimedCount)
        internal
        pure
        returns (uint256)
    {
        if (totalAmount == 0 || eligibleVoters == 0 || claimedCount >= eligibleVoters) return 0;
        uint256 baseShare = totalAmount / eligibleVoters;
        if (claimedCount + 1 == eligibleVoters) {
            return totalAmount - (baseShare * claimedCount);
        }
        return baseShare;
    }

    function _splitClaimAmounts(
        RewardPool storage rewardPool,
        uint256 roundId,
        bytes32 commitKey,
        address frontend,
        uint256 grossAmount,
        uint256 reservedFrontendFee
    ) internal view returns (uint256 voterReward, uint256 frontendFee, address frontendRecipient) {
        if (
            reservedFrontendFee == 0 || rewardPool.frontendFeeBps == 0 || frontend == address(0)
                || !votingEngine.frontendEligibleAtCommit(rewardPool.contentId, roundId, commitKey)
        ) {
            return (grossAmount, 0, address(0));
        }

        if (reservedFrontendFee > grossAmount) {
            reservedFrontendFee = grossAmount;
        }

        frontendRecipient = _resolveFrontendRewardRecipient(rewardPool.contentId, roundId, frontend);
        if (frontendRecipient == address(0)) {
            return (grossAmount, 0, address(0));
        }

        frontendFee = reservedFrontendFee;
        voterReward = grossAmount - frontendFee;
    }

    function _resolveFrontendRewardRecipient(uint256 contentId, uint256 roundId, address frontend)
        internal
        view
        returns (address)
    {
        if (frontend == address(0)) return address(0);

        address frontendRegistry = votingEngine.roundFrontendRegistrySnapshot(contentId, roundId);
        if (frontendRegistry == address(0)) {
            return frontend;
        }

        try IFrontendRegistry(frontendRegistry).getFrontendInfo(frontend) returns (
            address operator, uint256 stakedAmount, bool eligible, bool slashed
        ) {
            stakedAmount;
            if (operator != address(0) && eligible && !slashed) {
                return operator;
            }
        } catch {
            return address(0);
        }

        return address(0);
    }

    function _isExcludedVoter(RewardPool storage rewardPool, uint256 voterId) internal view returns (bool) {
        return voterId == rewardPool.funderVoterId || voterId == _submitterVoterId(rewardPool.contentId);
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
