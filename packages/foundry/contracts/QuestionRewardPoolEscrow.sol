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
import { ProtocolConfig } from "./ProtocolConfig.sol";
import { IVoterIdNFT } from "./interfaces/IVoterIdNFT.sol";
import { RoundLib } from "./libraries/RoundLib.sol";
import { QuestionRewardPoolEscrowClaimLib } from "./libraries/QuestionRewardPoolEscrowClaimLib.sol";

/// @title QuestionRewardPoolEscrow
/// @notice Holds per-question USDC bounties and pays equal per-round rewards to revealed voters.
/// @dev Curyo 2 keeps HREP coherence penalties in the voting engine. Stablecoin payouts are participation rewards.
contract QuestionRewardPoolEscrow is
    Initializable,
    AccessControlUpgradeable,
    PausableUpgradeable,
    ReentrancyGuardTransient
{
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    bytes32 internal constant CONFIG_ROLE = keccak256("CONFIG_ROLE");
    bytes32 internal constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 internal constant MIN_REQUIRED_VOTERS = 3;
    uint256 internal constant MIN_REQUIRED_SETTLED_ROUNDS = 1;
    uint256 internal constant MAX_REQUIRED_SETTLED_ROUNDS = 16;
    uint256 internal constant BPS_SCALE = 10_000;
    uint256 internal constant DEFAULT_FRONTEND_FEE_BPS = 300;
    uint256 internal constant MAX_FRONTEND_FEE_BPS = 500;
    /// @notice Grace period voters have after bountyClosesAt to claim on a still-claimable bundle
    ///         before a third party can sweep the remainder back to the funder.
    uint256 internal constant BUNDLE_CLAIM_GRACE = 7 days;
    uint8 internal constant REWARD_ASSET_HREP = 0;
    uint8 internal constant REWARD_ASSET_USDC = 1;

    struct RewardPool {
        uint64 id;
        uint64 contentId;
        uint64 startRoundId;
        uint64 nextRoundToEvaluate;
        uint64 bountyOpensAt;
        uint64 bountyClosesAt;
        uint64 feedbackClosesAt;
        address funder;
        address funderIdentity;
        address submitterIdentity;
        uint256 submitterVoterId;
        address submitterVoterIdNFT;
        uint8 asset;
        uint256 fundedAmount;
        uint256 unallocatedAmount;
        uint256 claimedAmount;
        uint32 requiredVoters;
        uint32 requiredSettledRounds;
        uint32 qualifiedRounds;
        bool refunded;
        uint16 frontendFeeBps;
        bool nonRefundable;
    }

    struct RoundSnapshot {
        bool qualified;
        uint32 eligibleVoters;
        uint256 allocation;
        uint32 claimedCount;
        uint256 frontendFeeAllocation;
    }

    struct BundleReward {
        uint64 id;
        uint64 bountyOpensAt;
        uint64 bountyClosesAt;
        uint64 feedbackClosesAt;
        address funder;
        address funderIdentity;
        uint8 asset;
        uint32 questionCount;
        uint32 requiredCompleters;
        uint32 requiredSettledRounds;
        uint32 completedRoundSets;
        uint32 claimedCount;
        uint16 frontendFeeBps;
        uint256 fundedAmount;
        uint256 unallocatedAmount;
        uint256 claimedAmount;
        bool refunded;
        // When set, unclaimed residue is forfeited to the protocol treasury instead of
        // refunded to the funder. Mirrors RewardPool.nonRefundable for the mandatory-
        // bounty anti-spam model on registry-initiated submissions.
        bool nonRefundable;
    }

    struct BundleQuestion {
        uint64 contentId;
    }

    struct BundleRoundSetSnapshot {
        bool qualified;
        uint32 claimedCount;
        uint256 allocation;
        uint256 frontendFeeAllocation;
    }

    IERC20 public hrepToken;
    IERC20 public usdcToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    IVoterIdNFT public voterIdNFT;
    uint256 public nextRewardPoolId;

    mapping(uint256 => RewardPool) private rewardPools;
    mapping(uint256 => mapping(uint256 => RoundSnapshot)) private roundSnapshots;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => bool))) private rewardClaimed;
    mapping(uint256 => BundleReward) private bundleRewards;
    mapping(uint256 => BundleQuestion[]) private bundleQuestions;
    mapping(uint256 => mapping(uint256 => uint32)) private bundleQuestionRecordedRounds;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => uint64))) private bundleRoundIds;
    mapping(uint256 => mapping(uint256 => BundleRoundSetSnapshot)) private bundleRoundSetSnapshots;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => bool))) private bundleRoundSetRewardClaimed;
    mapping(uint256 => uint256) private contentBundleId;
    mapping(uint256 => uint256) private contentBundleIndex;
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
        uint256 bountyOpensAt,
        uint256 bountyClosesAt,
        uint256 feedbackClosesAt,
        uint256 frontendFeeBps,
        uint8 asset,
        bool nonRefundable
    );
    event BountyWindowCreated(
        uint256 indexed rewardPoolId,
        uint256 indexed contentId,
        uint256 bountyOpensAt,
        uint256 bountyClosesAt,
        uint256 feedbackClosesAt,
        uint256 requiredVoters,
        uint256 requiredSettledRounds
    );
    event BountyWindowExpired(uint256 indexed rewardPoolId, uint256 indexed contentId, uint256 amount);
    event RewardPoolRoundQualified(
        uint256 indexed rewardPoolId,
        uint256 indexed contentId,
        uint256 indexed roundId,
        uint256 allocation,
        uint256 eligibleVoters,
        uint256 frontendFeeAllocation
    );
    event RewardPoolCursorAdvanced(
        uint256 indexed rewardPoolId, uint256 indexed contentId, uint256 fromRoundId, uint256 toRoundId, uint256 skipped
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
    event RewardPoolForfeited(uint256 indexed rewardPoolId, address indexed treasury, uint256 amount);
    event DefaultFrontendFeeBpsUpdated(uint256 previousFrontendFeeBps, uint256 newFrontendFeeBps);
    event QuestionBundleRewardCreated(
        uint256 indexed bundleId,
        address indexed funder,
        uint256 funderVoterId,
        uint256 amount,
        uint256 requiredCompleters,
        uint256 questionCount,
        uint256 requiredSettledRounds,
        uint256 bountyOpensAt,
        uint256 bountyClosesAt,
        uint256 feedbackClosesAt,
        uint256 frontendFeeBps,
        uint8 asset
    );
    event QuestionBundleRoundRecorded(
        uint256 indexed bundleId,
        uint256 indexed contentId,
        uint256 indexed roundId,
        uint256 bundleIndex,
        uint256 roundSetIndex
    );
    event QuestionBundleRoundSetQualified(
        uint256 indexed bundleId, uint256 indexed roundSetIndex, uint256 allocation, uint256 frontendFeeAllocation
    );
    /// @dev Removed: QuestionBundleFailed is no longer emitted after the retry-after-
    ///      failed-round refactor, so subscribing to that event is a no-op on current deployments.
    event QuestionBundleRewardClaimed(
        uint256 indexed bundleId,
        uint256 indexed roundSetIndex,
        address indexed claimant,
        uint256 voterId,
        uint256 amount,
        address frontend,
        address frontendRecipient,
        uint256 frontendFee,
        uint256 grossAmount
    );
    event QuestionBundleRewardRefunded(uint256 indexed bundleId, address indexed funder, uint256 amount);
    event QuestionBundleRewardForfeited(uint256 indexed bundleId, address indexed treasury, uint256 amount);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address admin,
        address hrepToken_,
        address usdcToken_,
        address registry_,
        address votingEngine_,
        address voterIdNFT_
    ) external initializer {
        require(admin != address(0), "Invalid admin");
        require(hrepToken_ != address(0), "Invalid HREP token");
        require(usdcToken_ != address(0), "Invalid token");
        require(registry_ != address(0), "Invalid registry");
        require(votingEngine_ != address(0), "Invalid engine");
        require(voterIdNFT_ != address(0), "Invalid Voter ID");

        __AccessControl_init();
        __Pausable_init();

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        _grantRole(CONFIG_ROLE, admin);
        _grantRole(PAUSER_ROLE, admin);

        hrepToken = IERC20(hrepToken_);
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
        uint256 bountyClosesAt,
        uint256 feedbackClosesAt
    ) external nonReentrant whenNotPaused returns (uint256 rewardPoolId) {
        rewardPoolId = _createRewardPool(
            contentId,
            msg.sender,
            REWARD_ASSET_USDC,
            amount,
            requiredVoters,
            requiredSettledRounds,
            bountyClosesAt,
            feedbackClosesAt,
            false
        );
    }

    function createSubmissionRewardPoolFromRegistry(
        uint256 contentId,
        address funder,
        uint8 asset,
        uint256 amount,
        uint256 requiredVoters,
        uint256 requiredSettledRounds,
        uint256 bountyClosesAt,
        uint256 feedbackClosesAt
    ) external nonReentrant whenNotPaused returns (uint256 rewardPoolId) {
        require(msg.sender == address(registry), "Only registry");
        require(funder != address(0), "Invalid funder");
        rewardPoolId = _createRewardPool(
            contentId,
            funder,
            asset,
            amount,
            requiredVoters,
            requiredSettledRounds,
            bountyClosesAt,
            feedbackClosesAt,
            true
        );
    }

    function createSubmissionBundleFromRegistry(
        uint256 bundleId,
        uint256[] calldata contentIds,
        address funder,
        uint8 asset,
        uint256 amount,
        uint256 requiredCompleters,
        uint256 requiredSettledRounds,
        uint256 bountyClosesAt,
        uint256 feedbackClosesAt
    ) external nonReentrant whenNotPaused returns (uint256 rewardPoolId) {
        require(msg.sender == address(registry), "Only registry");
        require(bundleId != 0, "Invalid bundle");
        require(bundleRewards[bundleId].id == 0, "Bundle exists");
        require(contentIds.length > 0, "No questions");
        require(funder != address(0), "Invalid funder");
        require(asset == REWARD_ASSET_HREP || asset == REWARD_ASSET_USDC, "Invalid asset");
        require(requiredCompleters >= MIN_REQUIRED_VOTERS, "Too few voters");
        require(requiredSettledRounds >= MIN_REQUIRED_SETTLED_ROUNDS, "Too few rounds");
        require(requiredSettledRounds <= MAX_REQUIRED_SETTLED_ROUNDS, "Too many rounds");
        require(amount >= requiredCompleters * requiredSettledRounds, "Amount too small");
        _requireFutureBountyWindow(bountyClosesAt);
        uint256 normalizedFeedbackClosesAt = _normalizeFeedbackClosesAt(bountyClosesAt, feedbackClosesAt);

        uint256 fundedAmount = _pullExactToken(funder, asset, amount);
        (uint256 funderVoterId, address funderIdentity) = _resolveFunderIdentity(funder);

        bundleRewards[bundleId] = BundleReward({
            id: bundleId.toUint64(),
            bountyOpensAt: block.timestamp.toUint64(),
            bountyClosesAt: bountyClosesAt.toUint64(),
            feedbackClosesAt: normalizedFeedbackClosesAt.toUint64(),
            funder: funder,
            funderIdentity: funderIdentity,
            asset: asset,
            questionCount: contentIds.length.toUint32(),
            requiredCompleters: requiredCompleters.toUint32(),
            requiredSettledRounds: requiredSettledRounds.toUint32(),
            completedRoundSets: 0,
            claimedCount: 0,
            frontendFeeBps: defaultFrontendFeeBps,
            fundedAmount: fundedAmount,
            unallocatedAmount: fundedAmount,
            claimedAmount: 0,
            refunded: false,
            // Registry-initiated submissions carry the mandatory-bounty anti-spam model:
            // unclaimed residue is forfeited to treasury rather than refunded, matching
            // the single-pool path (`createSubmissionRewardPoolFromRegistry`).
            nonRefundable: true
        });

        for (uint256 i = 0; i < contentIds.length;) {
            uint256 contentId = contentIds[i];
            require(registry.isContentActive(contentId), "Content not active");
            require(contentBundleId[contentId] == 0, "Content bundled");
            contentBundleId[contentId] = bundleId;
            contentBundleIndex[contentId] = i;
            bundleQuestions[bundleId].push(BundleQuestion({ contentId: contentId.toUint64() }));
            unchecked {
                ++i;
            }
        }

        emit QuestionBundleRewardCreated(
            bundleId,
            funder,
            funderVoterId,
            fundedAmount,
            requiredCompleters,
            contentIds.length,
            requiredSettledRounds,
            block.timestamp,
            bountyClosesAt,
            normalizedFeedbackClosesAt,
            defaultFrontendFeeBps,
            asset
        );
        rewardPoolId = bundleId;
    }

    function _createRewardPool(
        uint256 contentId,
        address funder,
        uint8 asset,
        uint256 amount,
        uint256 requiredVoters,
        uint256 requiredSettledRounds,
        uint256 bountyClosesAt,
        uint256 feedbackClosesAt,
        bool nonRefundable
    ) internal returns (uint256 rewardPoolId) {
        require(amount > 0, "Amount required");
        require(asset == REWARD_ASSET_HREP || asset == REWARD_ASSET_USDC, "Invalid asset");
        require(registry.isContentActive(contentId), "Content not active");
        require(requiredVoters >= MIN_REQUIRED_VOTERS, "Too few voters");
        require(requiredSettledRounds >= MIN_REQUIRED_SETTLED_ROUNDS, "Too few rounds");
        require(requiredSettledRounds <= MAX_REQUIRED_SETTLED_ROUNDS, "Too many rounds");
        require(amount >= requiredSettledRounds * requiredVoters, "Amount too small");
        _requireFutureBountyWindow(bountyClosesAt);
        uint256 normalizedFeedbackClosesAt = _normalizeFeedbackClosesAt(bountyClosesAt, feedbackClosesAt);
        if (!nonRefundable) {
            RoundLib.RoundConfig memory contentCfg = registry.getContentRoundConfig(contentId);
            require(amount >= requiredSettledRounds * uint256(contentCfg.maxVoters), "Amount too small");
            require(bountyClosesAt > block.timestamp, "Invalid bounty close");
        }

        uint256 fundedAmount = _pullExactToken(funder, asset, amount);

        uint256 currentRoundId = votingEngine.currentRoundId(contentId);
        uint256 startRoundId = currentRoundId == 0 ? 1 : currentRoundId + 1;
        (uint256 funderVoterId, address funderIdentity) = _resolveFunderIdentity(funder);
        address submitterIdentity = registry.getSubmitterIdentity(contentId);
        uint256 submitterVoterId = submitterIdentity == address(0) ? 0 : voterIdNFT.getTokenId(submitterIdentity);

        rewardPoolId = nextRewardPoolId++;
        rewardPools[rewardPoolId] = RewardPool({
            id: rewardPoolId.toUint64(),
            contentId: contentId.toUint64(),
            startRoundId: startRoundId.toUint64(),
            nextRoundToEvaluate: startRoundId.toUint64(),
            bountyOpensAt: block.timestamp.toUint64(),
            bountyClosesAt: bountyClosesAt.toUint64(),
            feedbackClosesAt: normalizedFeedbackClosesAt.toUint64(),
            funder: funder,
            funderIdentity: funderIdentity,
            submitterIdentity: submitterIdentity,
            submitterVoterId: submitterVoterId,
            submitterVoterIdNFT: address(voterIdNFT),
            asset: asset,
            fundedAmount: fundedAmount,
            unallocatedAmount: fundedAmount,
            claimedAmount: 0,
            requiredVoters: requiredVoters.toUint32(),
            requiredSettledRounds: requiredSettledRounds.toUint32(),
            qualifiedRounds: 0,
            refunded: false,
            frontendFeeBps: defaultFrontendFeeBps,
            nonRefundable: nonRefundable
        });

        emit RewardPoolCreated(
            rewardPoolId,
            contentId,
            funder,
            funderVoterId,
            fundedAmount,
            requiredVoters,
            requiredSettledRounds,
            startRoundId,
            block.timestamp,
            bountyClosesAt,
            normalizedFeedbackClosesAt,
            defaultFrontendFeeBps,
            asset,
            nonRefundable
        );
    }

    function qualifyRound(uint256 rewardPoolId, uint256 roundId) external whenNotPaused {
        RewardPool storage rewardPool = _getIncompleteRewardPoolForQualification(rewardPoolId);
        _qualifyRound(rewardPoolId, rewardPool, roundId);
    }

    function advanceQualificationCursor(uint256 rewardPoolId, uint256 maxRounds)
        external
        whenNotPaused
        returns (uint256 skipped, uint256 nextRoundToEvaluate)
    {
        require(maxRounds > 0, "No rounds");
        RewardPool storage rewardPool = _getIncompleteRewardPoolForQualification(rewardPoolId);

        nextRoundToEvaluate = rewardPool.nextRoundToEvaluate;
        while (skipped < maxRounds) {
            (bool roundFinished, bool canQualify,) = _roundQualificationStatus(rewardPool, nextRoundToEvaluate);
            if (!roundFinished || canQualify) break;
            nextRoundToEvaluate++;
            skipped++;
        }

        if (skipped > 0) {
            rewardPool.nextRoundToEvaluate = nextRoundToEvaluate.toUint64();
        }
    }

    function claimQuestionReward(uint256 rewardPoolId, uint256 roundId)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 rewardAmount)
    {
        RewardPool storage rewardPool = _getExistingRewardPool(rewardPoolId);
        require(votingEngine.roundUnrevealedCleanupRemaining(rewardPool.contentId, roundId) == 0, "Cleanup pending");
        _qualifyRoundIfNeeded(rewardPoolId, rewardPool, roundId);

        IVoterIdNFT roundVoterIdNft = _roundVoterIdNft(rewardPool.contentId, roundId);
        uint256 voterId = _requireVoterId(roundVoterIdNft, msg.sender);
        address rewardRecipient = roundVoterIdNft.getHolder(voterId);
        require(!_isExcludedVoter(rewardPool, roundId, voterId), "Excluded voter");
        require(!rewardClaimed[rewardPoolId][roundId][voterId], "Already claimed");

        bytes32 commitKey = _commitKeyForVoter(rewardPool.contentId, roundId, roundVoterIdNft, voterId);
        require(commitKey != bytes32(0), "No commit");

        (bool revealed, address frontend) = _revealedCommitFrontend(rewardPool.contentId, roundId, commitKey);
        require(revealed, "Vote not revealed");

        RoundSnapshot storage snapshot = roundSnapshots[rewardPoolId][roundId];
        uint256 grossAmount;
        uint256 frontendFee;
        address frontendRecipient;
        (grossAmount, rewardAmount, frontendFee, frontendRecipient) =
            QuestionRewardPoolEscrowClaimLib.computeEqualShareClaimSplit(
                votingEngine,
                rewardPool.contentId,
                roundId,
                commitKey,
                frontend,
                snapshot.allocation,
                snapshot.frontendFeeAllocation,
                snapshot.eligibleVoters,
                snapshot.claimedCount
            );
        require(grossAmount > 0, "No reward");

        rewardClaimed[rewardPoolId][roundId][voterId] = true;
        unchecked {
            snapshot.claimedCount++;
        }
        rewardPool.claimedAmount += grossAmount;

        IERC20 rewardToken = _rewardToken(rewardPool.asset);
        if (rewardAmount > 0) {
            rewardToken.safeTransfer(rewardRecipient, rewardAmount);
        }
        if (frontendFee > 0) {
            rewardToken.safeTransfer(frontendRecipient, frontendFee);
        }
        emit QuestionRewardClaimed(
            rewardPoolId,
            rewardPool.contentId,
            roundId,
            rewardRecipient,
            voterId,
            rewardAmount,
            frontend,
            frontendRecipient,
            frontendFee,
            grossAmount
        );
    }

    function recordBundleQuestionTerminal(uint256 contentId, uint256 roundId, bool settled) external {
        // Intentionally NOT gated by whenNotPaused: the voting engine invokes this inside a
        // try/catch during settlement, so a paused escrow would silently swallow the terminal
        // signal with no retry path, permanently locking bundle claims. Caller is restricted
        // to the voting engine, which is already a trusted state machine.
        require(msg.sender == address(votingEngine), "Only engine");
        _recordBundleQuestionTerminal(contentId, roundId, settled);
    }

    function syncBundleQuestionTerminal(uint256 contentId, uint256 roundId) external {
        (RoundLib.RoundState state, uint48 settledAt) = _roundTerminalState(contentId, roundId);
        require(settledAt != 0, "Round not terminal");
        _recordBundleQuestionTerminal(contentId, roundId, state == RoundLib.RoundState.Settled);
    }

    function _recordBundleQuestionTerminal(uint256 contentId, uint256 roundId, bool settled) internal {
        uint256 bundleId = contentBundleId[contentId];
        if (bundleId == 0) return;

        BundleReward storage bundle = _getExistingBundleReward(bundleId);
        if (bundle.refunded) return;

        uint256 bundleIndex = contentBundleIndex[contentId];
        uint256 roundSetIndex = bundleQuestionRecordedRounds[bundleId][bundleIndex];
        if (roundSetIndex >= bundle.requiredSettledRounds) return;
        if (roundSetIndex < bundle.completedRoundSets) return;

        bool settledWithinWindow = settled && _bundleRoundSettledWithinWindow(bundle, contentId, roundId);
        if (!settledWithinWindow) return;

        bundleRoundIds[bundleId][bundleIndex][roundSetIndex] = roundId.toUint64();
        bundleQuestionRecordedRounds[bundleId][bundleIndex] = (roundSetIndex + 1).toUint32();
        emit QuestionBundleRoundRecorded(bundleId, contentId, roundId, bundleIndex, roundSetIndex);

        if (roundSetIndex == bundle.completedRoundSets && _isBundleRoundSetComplete(bundleId, roundSetIndex)) {
            _qualifyBundleRoundSet(bundleId, bundle, roundSetIndex);
        }
    }

    function claimQuestionBundleReward(uint256 bundleId, uint256 roundSetIndex)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 rewardAmount)
    {
        BundleReward storage bundle = _getExistingBundleReward(bundleId);
        require(_isBundleRoundSetClaimOpen(bundle, bundleId, roundSetIndex), "Bundle not claimable");

        BundleQuestion storage firstQuestion = bundleQuestions[bundleId][0];
        uint256 firstRoundId = bundleRoundIds[bundleId][0][roundSetIndex];
        IVoterIdNFT roundVoterIdNft = _roundVoterIdNft(firstQuestion.contentId, firstRoundId);
        uint256 voterId = _requireVoterId(roundVoterIdNft, msg.sender);
        address rewardRecipient = roundVoterIdNft.getHolder(voterId);
        require(!bundleRoundSetRewardClaimed[bundleId][roundSetIndex][voterId], "Already claimed");
        require(!_isBundleExcludedVoter(bundle, bundleId, roundSetIndex, msg.sender), "Excluded voter");

        (address frontend, bytes32 firstCommitKey) =
            _requireCompletedBundleRoundSet(bundleId, roundSetIndex, msg.sender);
        BundleRoundSetSnapshot storage snapshot = bundleRoundSetSnapshots[bundleId][roundSetIndex];
        uint256 grossAmount;
        uint256 reservedFrontendFee;
        address frontendRecipient;
        (grossAmount, rewardAmount, reservedFrontendFee, frontendRecipient) =
            QuestionRewardPoolEscrowClaimLib.computeEqualShareClaimSplit(
                votingEngine,
                firstQuestion.contentId,
                firstRoundId,
                firstCommitKey,
                frontend,
                snapshot.allocation,
                snapshot.frontendFeeAllocation,
                bundle.requiredCompleters,
                snapshot.claimedCount
            );
        require(grossAmount > 0, "No reward");

        bundleRoundSetRewardClaimed[bundleId][roundSetIndex][voterId] = true;
        unchecked {
            snapshot.claimedCount++;
            bundle.claimedCount++;
        }
        bundle.claimedAmount += grossAmount;

        IERC20 rewardToken = _rewardToken(bundle.asset);
        if (rewardAmount > 0) {
            rewardToken.safeTransfer(rewardRecipient, rewardAmount);
        }
        if (reservedFrontendFee > 0) {
            rewardToken.safeTransfer(frontendRecipient, reservedFrontendFee);
        }

        emit QuestionBundleRewardClaimed(
            bundleId,
            roundSetIndex,
            rewardRecipient,
            voterId,
            rewardAmount,
            frontend,
            frontendRecipient,
            reservedFrontendFee,
            grossAmount
        );
    }

    function claimableQuestionBundleReward(uint256 bundleId, uint256 roundSetIndex, address account)
        external
        view
        returns (uint256 claimableAmount)
    {
        BundleReward storage bundle = bundleRewards[bundleId];
        if (bundle.id == 0 || !_isBundleRoundSetClaimOpen(bundle, bundleId, roundSetIndex)) return 0;

        BundleQuestion storage firstQuestion = bundleQuestions[bundleId][0];
        uint256 firstRoundId = bundleRoundIds[bundleId][0][roundSetIndex];
        uint256 voterId = _roundVoterIdNft(firstQuestion.contentId, firstRoundId).getTokenId(account);
        if (
            voterId == 0 || bundleRoundSetRewardClaimed[bundleId][roundSetIndex][voterId]
                || _isBundleExcludedVoter(bundle, bundleId, roundSetIndex, account)
        ) {
            return 0;
        }
        (bool completed, address frontend, bytes32 firstCommitKey) =
            _completedBundleRoundSetCommit(bundleId, roundSetIndex, account);
        if (!completed) return 0;

        BundleRoundSetSnapshot storage snapshot = bundleRoundSetSnapshots[bundleId][roundSetIndex];
        (, claimableAmount,,) = QuestionRewardPoolEscrowClaimLib.computeEqualShareClaimSplit(
            votingEngine,
            firstQuestion.contentId,
            firstRoundId,
            firstCommitKey,
            frontend,
            snapshot.allocation,
            snapshot.frontendFeeAllocation,
            bundle.requiredCompleters,
            snapshot.claimedCount
        );
    }

    function refundQuestionBundleReward(uint256 bundleId)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 refundAmount)
    {
        BundleReward storage bundle = _getExistingBundleReward(bundleId);
        require(!bundle.refunded, "Already refunded");
        // Refund conditions: bounty window expired, or all configured round sets were fully claimed.
        require(
            (bundle.bountyClosesAt != 0 && block.timestamp > bundle.bountyClosesAt)
                || (bundle.completedRoundSets >= bundle.requiredSettledRounds
                    && bundle.claimedCount >= uint256(bundle.requiredSettledRounds) * bundle.requiredCompleters),
            "Bundle active"
        );
        // If claims are still open (bundle is claim-complete but not fully claimed) and the
        // bounty-window-expiry branch triggered the refund, voters who haven't yet claimed
        // would have their earned share swept back to the funder. Give them an explicit
        // grace window to finish claiming before anyone can race them.
        if (_isBundleClaimOpen(bundle)) {
            require(block.timestamp > uint256(bundle.bountyClosesAt) + BUNDLE_CLAIM_GRACE, "Grace");
            _requireBundleCleanupComplete(bundleId);
        }
        refundAmount = bundle.fundedAmount - bundle.claimedAmount;
        require(refundAmount > 0, "No refund");

        bundle.refunded = true;
        if (bundle.nonRefundable) {
            address treasury = _protocolTreasury();
            require(treasury != address(0), "Treasury not set");
            _rewardToken(bundle.asset).safeTransfer(treasury, refundAmount);
            emit QuestionBundleRewardForfeited(bundleId, treasury, refundAmount);
        } else {
            _rewardToken(bundle.asset).safeTransfer(bundle.funder, refundAmount);
            emit QuestionBundleRewardRefunded(bundleId, bundle.funder, refundAmount);
        }
    }

    function refundExpiredRewardPool(uint256 rewardPoolId)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 refundAmount)
    {
        RewardPool storage rewardPool = _getExistingRewardPool(rewardPoolId);
        if (rewardPool.qualifiedRounds >= rewardPool.requiredSettledRounds) {
            refundAmount = _refundCompleteRewardPool(rewardPoolId, rewardPool);
        } else {
            require(rewardPool.bountyClosesAt != 0 && block.timestamp > rewardPool.bountyClosesAt, "Not expired");
            refundAmount = _refundUnallocatedRewardPool(rewardPoolId, rewardPool);
        }
    }

    function refundInactiveRewardPool(uint256 rewardPoolId)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 refundAmount)
    {
        RewardPool storage rewardPool = _getExistingRewardPool(rewardPoolId);
        require(!registry.isContentActive(rewardPool.contentId), "Content active");
        // If the content is Dormant, the original submitter still has an exclusive 24-hour
        // revival window. Forfeiting during that window would let anyone atomically combine
        // markDormant + refundInactiveRewardPool to strip the bounty before the submitter
        // can recover it. Wait until the revival window closes. Cancelled / non-dormant
        // content has dormantKeyReleasableAt == 0 so this check is a no-op there.
        require(block.timestamp > registry.dormantKeyReleasableAt(rewardPool.contentId), "Revival window active");
        refundAmount = _refundUnallocatedRewardPool(rewardPoolId, rewardPool);
    }

    function _refundUnallocatedRewardPool(uint256 rewardPoolId, RewardPool storage rewardPool)
        internal
        returns (uint256 refundAmount)
    {
        require(!rewardPool.refunded, "Already refunded");
        require(rewardPool.qualifiedRounds < rewardPool.requiredSettledRounds, "Bounty complete");
        _requireNoPendingFinishedRound(rewardPool);
        refundAmount = rewardPool.unallocatedAmount;
        require(refundAmount > 0, "No refund");
        rewardPool.refunded = true;
        rewardPool.unallocatedAmount = 0;
        _transferRewardPoolResidue(rewardPoolId, rewardPool, refundAmount);
    }

    function _refundCompleteRewardPool(uint256 rewardPoolId, RewardPool storage rewardPool)
        internal
        returns (uint256 refundAmount)
    {
        require(!rewardPool.refunded, "Already refunded");
        uint256 claimDeadline = rewardPool.bountyClosesAt;

        for (uint256 roundId = rewardPool.startRoundId; roundId < rewardPool.nextRoundToEvaluate;) {
            RoundSnapshot storage snapshot = roundSnapshots[rewardPoolId][roundId];
            if (snapshot.qualified) {
                if (claimDeadline == 0) {
                    (,,,,,,,,,, uint48 settledAt,,,) = votingEngine.rounds(rewardPool.contentId, roundId);
                    if (settledAt > claimDeadline) claimDeadline = settledAt;
                }
                if (snapshot.claimedCount < snapshot.eligibleVoters) {
                    require(
                        votingEngine.roundUnrevealedCleanupRemaining(rewardPool.contentId, roundId) == 0,
                        "Cleanup pending"
                    );
                    snapshot.claimedCount = snapshot.eligibleVoters;
                }
            }
            unchecked {
                ++roundId;
            }
        }
        require(block.timestamp > claimDeadline + BUNDLE_CLAIM_GRACE, "Grace");

        refundAmount = rewardPool.fundedAmount - rewardPool.claimedAmount;
        require(refundAmount > 0, "No refund");
        rewardPool.refunded = true;
        _transferRewardPoolResidue(rewardPoolId, rewardPool, refundAmount);
    }

    function _transferRewardPoolResidue(uint256 rewardPoolId, RewardPool storage rewardPool, uint256 amount) internal {
        if (rewardPool.nonRefundable) {
            address treasury = _protocolTreasury();
            require(treasury != address(0), "Treasury not set");
            _rewardToken(rewardPool.asset).safeTransfer(treasury, amount);
            emit RewardPoolForfeited(rewardPoolId, treasury, amount);
        } else {
            _rewardToken(rewardPool.asset).safeTransfer(rewardPool.funder, amount);
            emit RewardPoolRefunded(rewardPoolId, rewardPool.funder, amount);
        }
    }

    function claimableQuestionReward(uint256 rewardPoolId, uint256 roundId, address account)
        external
        view
        returns (uint256 claimableAmount)
    {
        RewardPool storage rewardPool = rewardPools[rewardPoolId];
        if (rewardPool.id == 0) return 0;

        IVoterIdNFT roundVoterIdNft = _roundVoterIdNft(rewardPool.contentId, roundId);
        uint256 voterId = roundVoterIdNft.getTokenId(account);
        if (
            voterId == 0 || _isExcludedVoter(rewardPool, roundId, voterId)
                || rewardClaimed[rewardPoolId][roundId][voterId]
        ) {
            return 0;
        }

        bytes32 commitKey = _commitKeyForVoter(rewardPool.contentId, roundId, roundVoterIdNft, voterId);
        if (commitKey == bytes32(0)) return 0;
        (bool revealed, address frontend) = _revealedCommitFrontend(rewardPool.contentId, roundId, commitKey);
        if (!revealed) return 0;

        RoundSnapshot storage snapshot = roundSnapshots[rewardPoolId][roundId];
        if (votingEngine.roundUnrevealedCleanupRemaining(rewardPool.contentId, roundId) > 0) return 0;
        if (!snapshot.qualified) {
            if (!_canPreviewNewQualification(rewardPool, roundId)) return 0;
            (, bool canQualify, uint256 eligibleVoters) = _previewRoundQualification(rewardPool, roundId);
            if (!canQualify) return 0;

            uint256 allocation = _previewRoundAllocation(rewardPool);
            if (allocation == 0) return 0;
            if (allocation < eligibleVoters) return 0;
            (, claimableAmount,,) = QuestionRewardPoolEscrowClaimLib.computeEqualShareClaimSplit(
                votingEngine,
                rewardPool.contentId,
                roundId,
                commitKey,
                frontend,
                allocation,
                _frontendFeeAllocation(rewardPool, allocation),
                eligibleVoters,
                0
            );
            return claimableAmount;
        }
        if (snapshot.eligibleVoters == 0 || snapshot.claimedCount >= snapshot.eligibleVoters) return 0;
        (, claimableAmount,,) = QuestionRewardPoolEscrowClaimLib.computeEqualShareClaimSplit(
            votingEngine,
            rewardPool.contentId,
            roundId,
            commitKey,
            frontend,
            snapshot.allocation,
            snapshot.frontendFeeAllocation,
            snapshot.eligibleVoters,
            snapshot.claimedCount
        );
    }

    function setVoterIdNFT(address voterIdNFT_) external onlyRole(CONFIG_ROLE) {
        require(voterIdNFT_ != address(0), "Invalid Voter ID");
        voterIdNFT = IVoterIdNFT(voterIdNFT_);
    }

    function setVotingEngine(address) external pure {
        revert();
    }

    function setDefaultFrontendFeeBps(uint256 frontendFeeBps_) external onlyRole(CONFIG_ROLE) {
        require(frontendFeeBps_ <= MAX_FRONTEND_FEE_BPS, "Fee too high");
        defaultFrontendFeeBps = frontendFeeBps_.toUint16();
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _resolveFunderIdentity(address funder)
        internal
        view
        returns (uint256 funderVoterId, address funderIdentity)
    {
        funderVoterId = voterIdNFT.getTokenId(funder);
        require(funderVoterId != 0, "Voter ID required");
        funderIdentity = voterIdNFT.getHolder(funderVoterId);
        if (funderIdentity == address(0)) {
            funderIdentity = funder;
        }
    }

    function _pullExactToken(address funder, uint8 asset, uint256 amount) internal returns (uint256 receivedAmount) {
        IERC20 token = _rewardToken(asset);
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(funder, address(this), amount);
        receivedAmount = token.balanceOf(address(this)) - balanceBefore;
        require(receivedAmount == amount, "Fee token unsupported");
    }

    function _requireFutureBountyWindow(uint256 bountyClosesAt) internal view {
        if (bountyClosesAt != 0) {
            require(bountyClosesAt > block.timestamp, "Invalid bounty close");
        }
    }

    function _normalizeFeedbackClosesAt(uint256 bountyClosesAt, uint256 feedbackClosesAt)
        internal
        view
        returns (uint256)
    {
        if (feedbackClosesAt == 0) {
            return bountyClosesAt;
        }
        require(feedbackClosesAt > block.timestamp, "Invalid feedback close");
        if (bountyClosesAt != 0) {
            require(feedbackClosesAt <= bountyClosesAt, "Feedback after bounty");
        }
        return feedbackClosesAt;
    }

    function _rewardToken(uint8 asset) internal view returns (IERC20 token) {
        if (asset == REWARD_ASSET_HREP) return hrepToken;
        if (asset == REWARD_ASSET_USDC) return usdcToken;
        revert("Invalid asset");
    }

    function _protocolTreasury() internal view returns (address treasury) {
        ProtocolConfig cfg = votingEngine.protocolConfig();
        if (address(cfg) != address(0)) {
            treasury = cfg.treasury();
        }
    }

    function _getExistingRewardPool(uint256 rewardPoolId) internal view returns (RewardPool storage rewardPool) {
        rewardPool = rewardPools[rewardPoolId];
        require(rewardPool.id != 0, "Bounty not found");
    }

    function _getExistingBundleReward(uint256 bundleId) internal view returns (BundleReward storage bundle) {
        bundle = bundleRewards[bundleId];
        require(bundle.id != 0, "Bundle not found");
    }

    function _isBundleClaimOpen(BundleReward storage bundle) internal view returns (bool) {
        return !bundle.refunded && bundle.claimedCount < uint256(bundle.completedRoundSets) * bundle.requiredCompleters;
    }

    function _isBundleRoundSetClaimOpen(BundleReward storage bundle, uint256 bundleId, uint256 roundSetIndex)
        internal
        view
        returns (bool)
    {
        if (bundle.refunded || roundSetIndex >= bundle.requiredSettledRounds) return false;
        BundleRoundSetSnapshot storage snapshot = bundleRoundSetSnapshots[bundleId][roundSetIndex];
        return snapshot.qualified && snapshot.claimedCount < bundle.requiredCompleters;
    }

    function _requireBundleCleanupComplete(uint256 bundleId) internal view {
        BundleQuestion[] storage questions = bundleQuestions[bundleId];
        BundleReward storage bundle = bundleRewards[bundleId];
        for (uint256 roundSetIndex = 0; roundSetIndex < bundle.completedRoundSets;) {
            for (uint256 i = 0; i < questions.length;) {
                uint256 roundId = bundleRoundIds[bundleId][i][roundSetIndex];
                require(
                    votingEngine.roundUnrevealedCleanupRemaining(questions[i].contentId, roundId) == 0,
                    "Cleanup pending"
                );
                unchecked {
                    ++i;
                }
            }
            unchecked {
                ++roundSetIndex;
            }
        }
    }

    function _bundleRoundSettledWithinWindow(BundleReward storage bundle, uint256 contentId, uint256 roundId)
        internal
        view
        returns (bool)
    {
        (RoundLib.RoundState state, uint48 settledAt) = _roundTerminalState(contentId, roundId);
        return state == RoundLib.RoundState.Settled && settledAt != 0
            && (bundle.bountyClosesAt == 0 || settledAt <= bundle.bountyClosesAt);
    }

    function _roundTerminalState(uint256 contentId, uint256 roundId)
        internal
        view
        returns (RoundLib.RoundState state, uint48 settledAt)
    {
        (, state,,,,,,,,, settledAt,,,) = votingEngine.rounds(contentId, roundId);
    }

    function _requireCompletedBundleRoundSet(uint256 bundleId, uint256 roundSetIndex, address account)
        internal
        view
        returns (address frontend, bytes32 firstCommitKey)
    {
        (bool completed, address completedFrontend, bytes32 completedFirstCommitKey) =
            _completedBundleRoundSetCommit(bundleId, roundSetIndex, account);
        require(completed, "Bundle incomplete");
        return (completedFrontend, completedFirstCommitKey);
    }

    function _completedBundleRoundSetCommit(uint256 bundleId, uint256 roundSetIndex, address account)
        internal
        view
        returns (bool completed, address frontend, bytes32 firstCommitKey)
    {
        BundleQuestion[] storage questions = bundleQuestions[bundleId];
        for (uint256 i = 0; i < questions.length;) {
            BundleQuestion storage question = questions[i];
            uint256 roundId = bundleRoundIds[bundleId][i][roundSetIndex];
            if (roundId == 0) return (false, address(0), bytes32(0));
            if (votingEngine.roundUnrevealedCleanupRemaining(question.contentId, roundId) > 0) {
                return (false, address(0), bytes32(0));
            }
            uint256 voterId = _voterIdForRound(question.contentId, roundId, account);
            if (voterId == 0) return (false, address(0), bytes32(0));
            bytes32 commitKey =
                _commitKeyForVoter(question.contentId, roundId, _roundVoterIdNft(question.contentId, roundId), voterId);
            if (commitKey == bytes32(0)) return (false, address(0), bytes32(0));
            (bool revealed, address questionFrontend) = _revealedCommitFrontend(question.contentId, roundId, commitKey);
            if (!revealed) return (false, address(0), bytes32(0));
            if (i == 0) {
                frontend = questionFrontend;
                firstCommitKey = commitKey;
            } else if (questionFrontend != frontend) {
                frontend = address(0);
            }
            if (
                questionFrontend != address(0)
                    && !votingEngine.frontendEligibleAtCommit(question.contentId, roundId, commitKey)
            ) {
                frontend = address(0);
            }
            unchecked {
                ++i;
            }
        }
        return (true, frontend, firstCommitKey);
    }

    function _isBundleRoundSetComplete(uint256 bundleId, uint256 roundSetIndex) internal view returns (bool) {
        BundleQuestion[] storage questions = bundleQuestions[bundleId];
        for (uint256 i = 0; i < questions.length;) {
            if (bundleRoundIds[bundleId][i][roundSetIndex] == 0) return false;
            unchecked {
                ++i;
            }
        }
        return true;
    }

    function _qualifyBundleRoundSet(uint256 bundleId, BundleReward storage bundle, uint256 roundSetIndex) internal {
        if (bundleRoundSetSnapshots[bundleId][roundSetIndex].qualified) return;

        if (_bundleRoundSetCompleterCount(bundleId, bundle, roundSetIndex) < bundle.requiredCompleters) {
            _resetBundleRoundSet(bundleId, roundSetIndex);
            return;
        }

        uint256 allocation = _previewBundleRoundSetAllocation(bundle);
        require(allocation > 0 && allocation <= bundle.unallocatedAmount, "No allocation");
        require(allocation >= bundle.requiredCompleters, "Reward allocation too small");
        uint256 frontendFeeAllocation = (allocation * bundle.frontendFeeBps) / BPS_SCALE;

        unchecked {
            bundle.completedRoundSets++;
        }
        bundle.unallocatedAmount -= allocation;

        bundleRoundSetSnapshots[bundleId][roundSetIndex] = BundleRoundSetSnapshot({
            qualified: true, claimedCount: 0, allocation: allocation, frontendFeeAllocation: frontendFeeAllocation
        });

        emit QuestionBundleRoundSetQualified(bundleId, roundSetIndex, allocation, frontendFeeAllocation);
    }

    function _bundleRoundSetCompleterCount(uint256 bundleId, BundleReward storage bundle, uint256 roundSetIndex)
        internal
        view
        returns (uint256 completerCount)
    {
        BundleQuestion[] storage questions = bundleQuestions[bundleId];
        if (questions.length == 0) return 0;

        uint256 firstContentId = questions[0].contentId;
        uint256 firstRoundId = bundleRoundIds[bundleId][0][roundSetIndex];
        IVoterIdNFT firstRoundVoterIdNft = _roundVoterIdNft(firstContentId, firstRoundId);
        uint256 commitCount = votingEngine.getRoundCommitCount(firstContentId, firstRoundId);
        for (uint256 i = 0; i < commitCount && completerCount < bundle.requiredCompleters;) {
            bytes32 commitKey = votingEngine.getRoundCommitKey(firstContentId, firstRoundId, i);
            (,,,, bool revealed,,) = votingEngine.commitCore(firstContentId, firstRoundId, commitKey);
            if (revealed) {
                uint256 voterId = votingEngine.commitVoterId(firstContentId, firstRoundId, commitKey);
                address voter = firstRoundVoterIdNft.getHolder(voterId);
                if (
                    !_isBundleExcludedVoter(bundle, bundleId, roundSetIndex, voter)
                        && _completedBundleRoundSetCommitIgnoringCleanup(bundleId, roundSetIndex, voter)
                ) {
                    unchecked {
                        completerCount++;
                    }
                }
            }
            unchecked {
                ++i;
            }
        }
    }

    function _completedBundleRoundSetCommitIgnoringCleanup(uint256 bundleId, uint256 roundSetIndex, address account)
        internal
        view
        returns (bool completed)
    {
        BundleQuestion[] storage questions = bundleQuestions[bundleId];
        for (uint256 i = 0; i < questions.length;) {
            BundleQuestion storage question = questions[i];
            uint256 roundId = bundleRoundIds[bundleId][i][roundSetIndex];
            uint256 voterId = _voterIdForRound(question.contentId, roundId, account);
            if (voterId == 0) return false;
            bytes32 commitKey =
                _commitKeyForVoter(question.contentId, roundId, _roundVoterIdNft(question.contentId, roundId), voterId);
            if (commitKey == bytes32(0)) return false;
            (bool revealed,) = _revealedCommitFrontend(question.contentId, roundId, commitKey);
            if (!revealed) return false;
            unchecked {
                ++i;
            }
        }
        return true;
    }

    function _resetBundleRoundSet(uint256 bundleId, uint256 roundSetIndex) internal {
        BundleQuestion[] storage questions = bundleQuestions[bundleId];
        for (uint256 i = 0; i < questions.length;) {
            uint256 recordedRoundSets = bundleQuestionRecordedRounds[bundleId][i];
            while (recordedRoundSets > roundSetIndex) {
                unchecked {
                    --recordedRoundSets;
                }
                delete bundleRoundIds[bundleId][i][recordedRoundSets];
            }
            bundleQuestionRecordedRounds[bundleId][i] = roundSetIndex.toUint32();
            unchecked {
                ++i;
            }
        }
    }

    function _previewBundleRoundSetAllocation(BundleReward storage bundle) internal view returns (uint256 allocation) {
        if (bundle.completedRoundSets >= bundle.requiredSettledRounds) return 0;
        uint256 remainingRoundSets = uint256(bundle.requiredSettledRounds) - bundle.completedRoundSets;
        allocation =
            remainingRoundSets == 1 ? bundle.unallocatedAmount : bundle.fundedAmount / bundle.requiredSettledRounds;
        if (allocation > bundle.unallocatedAmount) return 0;
    }

    function _isBundleExcludedVoter(
        BundleReward storage bundle,
        uint256 bundleId,
        uint256 roundSetIndex,
        address account
    ) internal view returns (bool) {
        BundleQuestion[] storage questions = bundleQuestions[bundleId];
        for (uint256 i = 0; i < questions.length;) {
            BundleQuestion storage question = questions[i];
            uint256 roundId = bundleRoundIds[bundleId][i][roundSetIndex];
            uint256 voterId = _voterIdForRound(question.contentId, roundId, account);
            if (voterId != 0) {
                uint256 funderVoterId =
                    _resolveFunderVoterId(question.contentId, roundId, bundle.funder, bundle.funderIdentity);
                if (voterId == funderVoterId || voterId == _voterIdForRound(question.contentId, roundId, bundle.funder))
                {
                    return true;
                }

                address submitterIdentity = registry.getSubmitterIdentity(question.contentId);
                if (submitterIdentity != address(0)) {
                    uint256 submitterVoterId = _voterIdForRound(question.contentId, roundId, submitterIdentity);
                    if (voterId == submitterVoterId) return true;
                }
            }
            unchecked {
                ++i;
            }
        }
        return false;
    }

    function _getIncompleteRewardPoolForQualification(uint256 rewardPoolId)
        internal
        view
        returns (RewardPool storage rewardPool)
    {
        rewardPool = _getExistingRewardPool(rewardPoolId);
        _requireIncompleteRewardPool(rewardPool);
    }

    function _qualifyRoundIfNeeded(uint256 rewardPoolId, RewardPool storage rewardPool, uint256 roundId) internal {
        if (!roundSnapshots[rewardPoolId][roundId].qualified) {
            _requireIncompleteRewardPool(rewardPool);
            _qualifyRound(rewardPoolId, rewardPool, roundId);
        }
    }

    function _requireIncompleteRewardPool(RewardPool storage rewardPool) internal view {
        require(!rewardPool.refunded, "Bounty refunded");
        require(rewardPool.qualifiedRounds < rewardPool.requiredSettledRounds, "Bounty complete");
    }

    function _qualifyRound(uint256 rewardPoolId, RewardPool storage rewardPool, uint256 roundId) internal {
        require(roundId >= rewardPool.startRoundId, "Round too early");
        require(!roundSnapshots[rewardPoolId][roundId].qualified, "Round qualified");
        require(roundId == rewardPool.nextRoundToEvaluate, "Round out of order");

        (bool roundSettled, bool canQualify, uint256 eligibleVoters) = _previewRoundQualification(rewardPool, roundId);
        require(roundSettled, "Round not settled");
        require(canQualify, "Too few eligible voters");

        uint256 allocation = _previewRoundAllocation(rewardPool);
        require(allocation > 0 && allocation <= rewardPool.unallocatedAmount, "No allocation");
        require(allocation >= eligibleVoters, "Reward allocation too small");
        uint256 frontendFeeAllocation = _frontendFeeAllocation(rewardPool, allocation);

        unchecked {
            rewardPool.qualifiedRounds++;
        }
        rewardPool.nextRoundToEvaluate = (roundId + 1).toUint64();
        rewardPool.unallocatedAmount -= allocation;

        roundSnapshots[rewardPoolId][roundId] = RoundSnapshot({
            qualified: true,
            eligibleVoters: eligibleVoters.toUint32(),
            allocation: allocation,
            claimedCount: 0,
            frontendFeeAllocation: frontendFeeAllocation
        });

        emit RewardPoolRoundQualified(
            rewardPoolId, rewardPool.contentId, roundId, allocation, eligibleVoters, frontendFeeAllocation
        );
    }

    function _canPreviewNewQualification(RewardPool storage rewardPool, uint256 roundId) internal view returns (bool) {
        if (rewardPool.refunded || rewardPool.qualifiedRounds >= rewardPool.requiredSettledRounds) return false;
        return roundId >= rewardPool.startRoundId && roundId == rewardPool.nextRoundToEvaluate;
    }

    function _previewRoundQualification(RewardPool storage rewardPool, uint256 roundId)
        internal
        view
        returns (bool roundSettled, bool canQualify, uint256 eligibleVoters)
    {
        (, RoundLib.RoundState state,, uint16 revealedCount,,,,,,, uint48 settledAt,,,) =
            votingEngine.rounds(rewardPool.contentId, roundId);
        if (state != RoundLib.RoundState.Settled) return (false, false, 0);
        if (!_roundSettledWithinPoolWindow(rewardPool, settledAt)) return (true, false, 0);

        roundSettled = true;
        eligibleVoters = revealedCount;
        if (eligibleVoters == 0) return (true, false, 0);
        uint256 funderVoterId = _funderVoterIdForRound(rewardPool, roundId);
        if (funderVoterId != 0 && _hasRevealedCommit(rewardPool.contentId, roundId, funderVoterId)) {
            eligibleVoters--;
        }
        uint256 currentFunderVoterId = _voterIdForRound(rewardPool.contentId, roundId, rewardPool.funder);
        if (
            currentFunderVoterId != 0 && currentFunderVoterId != funderVoterId
                && _hasRevealedCommit(rewardPool.contentId, roundId, currentFunderVoterId)
        ) {
            eligibleVoters--;
        }
        if (_submitterHasRevealedCommit(rewardPool, roundId, funderVoterId, currentFunderVoterId)) {
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

    function _requireNoPendingFinishedRound(RewardPool storage rewardPool) internal view {
        uint256 nextRoundToEvaluate = rewardPool.nextRoundToEvaluate;
        if (nextRoundToEvaluate > votingEngine.currentRoundId(rewardPool.contentId)) return;

        (bool roundFinished, bool canQualify,) = _roundQualificationStatus(rewardPool, nextRoundToEvaluate);
        if (!roundFinished) return;
        if (canQualify) revert("Bounty has qualifying round");
        revert("Advance qualification cursor");
    }

    function _roundSettledWithinPoolWindow(RewardPool storage rewardPool, uint48 settledAt)
        internal
        view
        returns (bool)
    {
        return settledAt != 0 && (rewardPool.bountyClosesAt == 0 || settledAt <= rewardPool.bountyClosesAt);
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
        bytes32 commitKey = _commitKeyForVoter(contentId, roundId, _roundVoterIdNft(contentId, roundId), voterId);
        if (commitKey == bytes32(0)) return false;
        (bool revealed,) = _revealedCommitFrontend(contentId, roundId, commitKey);
        return revealed;
    }

    function _revealedCommitFrontend(uint256 contentId, uint256 roundId, bytes32 commitKey)
        internal
        view
        returns (bool revealed, address frontend)
    {
        // Use the narrow commitCore getter -- this helper is called inside claim/bundle
        // iteration loops, and materializing the full 2 KB ciphertext on every read
        // blows out memory expansion at bounds-limit maxVoters.
        (address voter, uint64 stakeAmount, address commitFrontend,, bool commitRevealed,,) =
            votingEngine.commitCore(contentId, roundId, commitKey);
        stakeAmount;
        return (voter != address(0) && commitRevealed, commitFrontend);
    }

    function _frontendFeeAllocation(RewardPool storage rewardPool, uint256 allocation) internal view returns (uint256) {
        return (allocation * rewardPool.frontendFeeBps) / BPS_SCALE;
    }

    function _isExcludedVoter(RewardPool storage rewardPool, uint256 roundId, uint256 voterId)
        internal
        view
        returns (bool)
    {
        return voterId != 0
            && (voterId == _funderVoterIdForRound(rewardPool, roundId)
                || voterId == _voterIdForRound(rewardPool.contentId, roundId, rewardPool.funder)
                || _isSubmitterVoterIdForRound(rewardPool, roundId, voterId));
    }

    function _funderVoterIdForRound(RewardPool storage rewardPool, uint256 roundId) internal view returns (uint256) {
        return _resolveFunderVoterId(rewardPool.contentId, roundId, rewardPool.funder, rewardPool.funderIdentity);
    }

    function _resolveFunderVoterId(uint256 contentId, uint256 roundId, address funder, address funderIdentity)
        internal
        view
        returns (uint256)
    {
        if (funderIdentity != address(0)) {
            uint256 identityVoterId = _voterIdForRound(contentId, roundId, funderIdentity);
            if (identityVoterId != 0) return identityVoterId;
        }
        return _voterIdForRound(contentId, roundId, funder);
    }

    function _submitterHasRevealedCommit(
        RewardPool storage rewardPool,
        uint256 roundId,
        uint256 funderVoterId,
        uint256 currentFunderVoterId
    ) internal view returns (bool) {
        uint256 currentVoterId = _currentSubmitterVoterId(rewardPool, roundId);
        if (
            currentVoterId != 0 && currentVoterId != funderVoterId && currentVoterId != currentFunderVoterId
                && _hasRevealedCommit(rewardPool.contentId, roundId, currentVoterId)
        ) {
            return true;
        }

        uint256 snapshotVoterId = rewardPool.submitterVoterId;
        return _submitterSnapshotAppliesToRound(rewardPool, roundId) && snapshotVoterId != 0
            && snapshotVoterId != currentVoterId && snapshotVoterId != funderVoterId
            && snapshotVoterId != currentFunderVoterId
            && _hasRevealedCommit(rewardPool.contentId, roundId, snapshotVoterId);
    }

    function _isSubmitterVoterIdForRound(RewardPool storage rewardPool, uint256 roundId, uint256 voterId)
        internal
        view
        returns (bool)
    {
        if (_submitterSnapshotAppliesToRound(rewardPool, roundId) && voterId == rewardPool.submitterVoterId) {
            return true;
        }
        return voterId == _currentSubmitterVoterId(rewardPool, roundId);
    }

    function _submitterSnapshotAppliesToRound(RewardPool storage rewardPool, uint256 roundId)
        internal
        view
        returns (bool)
    {
        return rewardPool.submitterVoterIdNFT != address(0)
            && rewardPool.submitterVoterIdNFT == _roundVoterIdNftAddress(rewardPool.contentId, roundId);
    }

    function _currentSubmitterVoterId(RewardPool storage rewardPool, uint256 roundId) internal view returns (uint256) {
        address submitterIdentity = rewardPool.submitterIdentity;
        if (submitterIdentity == address(0)) {
            submitterIdentity = registry.getSubmitterIdentity(rewardPool.contentId);
        }
        if (submitterIdentity == address(0)) return 0;
        return _voterIdForRound(rewardPool.contentId, roundId, submitterIdentity);
    }

    function _requireVoterId(IVoterIdNFT voterIdNft_, address account) internal view returns (uint256 voterId) {
        voterId = voterIdNft_.getTokenId(account);
        require(voterId != 0, "Voter ID required");
    }

    function _commitKeyForVoter(uint256 contentId, uint256 roundId, IVoterIdNFT voterIdNft_, uint256 voterId)
        internal
        view
        returns (bytes32 commitKey)
    {
        commitKey = votingEngine.voterIdCommitKey(contentId, roundId, voterId);
        if (commitKey == bytes32(0)) {
            uint256 nullifier = voterIdNft_.getNullifier(voterId);
            if (nullifier != 0) {
                commitKey = votingEngine.voterNullifierCommitKey(contentId, roundId, nullifier);
            }
        }
    }

    function _voterIdForRound(uint256 contentId, uint256 roundId, address account) internal view returns (uint256) {
        return _roundVoterIdNft(contentId, roundId).getTokenId(account);
    }

    function _roundVoterIdNft(uint256 contentId, uint256 roundId) internal view returns (IVoterIdNFT) {
        return IVoterIdNFT(_roundVoterIdNftAddress(contentId, roundId));
    }

    function _roundVoterIdNftAddress(uint256 contentId, uint256 roundId) internal view returns (address) {
        address snapshot = votingEngine.roundVoterIdNFTSnapshot(contentId, roundId);
        return snapshot == address(0) ? address(voterIdNFT) : snapshot;
    }

    uint256[50] private __gap;
}
