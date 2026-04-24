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
import { IFrontendRegistry } from "./interfaces/IFrontendRegistry.sol";
import { IVoterIdNFT } from "./interfaces/IVoterIdNFT.sol";
import { RoundLib } from "./libraries/RoundLib.sol";

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

    bytes32 public constant CONFIG_ROLE = keccak256("CONFIG_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant MIN_REQUIRED_VOTERS = 3;
    uint256 public constant MIN_REQUIRED_SETTLED_ROUNDS = 1;
    uint256 public constant BPS_SCALE = 10_000;
    uint256 public constant DEFAULT_FRONTEND_FEE_BPS = 300;
    uint256 public constant MAX_FRONTEND_FEE_BPS = 500;
    /// @notice Grace period voters have after bountyClosesAt to claim on a still-claimable bundle
    ///         before a third party can sweep the remainder back to the funder.
    uint256 public constant BUNDLE_CLAIM_GRACE = 7 days;
    uint8 public constant REWARD_ASSET_HREP = 0;
    uint8 public constant REWARD_ASSET_USDC = 1;

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
        uint256 funderVoterId;
        address submitterIdentity;
        uint256 submitterVoterId;
        address submitterVoterIdNFT;
        uint8 asset;
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
        bool nonRefundable;
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

    struct BundleReward {
        uint64 id;
        uint64 bountyOpensAt;
        uint64 bountyClosesAt;
        uint64 feedbackClosesAt;
        address funder;
        address funderIdentity;
        uint256 funderVoterId;
        uint8 asset;
        uint32 questionCount;
        uint32 requiredCompleters;
        uint32 completedQuestionCount;
        uint32 claimedCount;
        uint16 frontendFeeBps;
        uint256 fundedAmount;
        uint256 claimedAmount;
        uint256 voterClaimedAmount;
        uint256 frontendClaimedAmount;
        uint256 refundedAmount;
        // Legacy flag: no code path writes this after the "keep bundles retryable after
        // failed rounds" refactor. Kept in the struct to preserve storage layout of the
        // unreleased proxy state; read as always-false.
        bool failed;
        bool refunded;
        // When set, unclaimed residue is forfeited to the protocol treasury instead of
        // refunded to the funder. Mirrors RewardPool.nonRefundable for the mandatory-
        // bounty anti-spam model on registry-initiated submissions.
        bool nonRefundable;
    }

    struct BundleQuestion {
        uint64 contentId;
        uint64 roundId;
        bool settled;
        bool terminal;
    }

    IERC20 public hrepToken;
    IERC20 public usdcToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    IVoterIdNFT public voterIdNFT;
    uint256 public nextRewardPoolId;

    mapping(uint256 => RewardPool) private rewardPools;
    mapping(uint256 => mapping(uint256 => RoundSnapshot)) public roundSnapshots;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => bool))) public rewardClaimed;
    mapping(uint256 => BundleReward) private bundleRewards;
    mapping(uint256 => BundleQuestion[]) private bundleQuestions;
    mapping(uint256 => uint256) public contentBundleId;
    mapping(uint256 => uint256) public contentBundleIndex;
    mapping(uint256 => mapping(uint256 => bool)) public bundleRewardClaimed;
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
        uint256 bountyOpensAt,
        uint256 bountyClosesAt,
        uint256 feedbackClosesAt,
        uint256 frontendFeeBps,
        uint8 asset
    );
    event QuestionBundleRoundRecorded(
        uint256 indexed bundleId, uint256 indexed contentId, uint256 indexed roundId, uint256 bundleIndex
    );
    /// @dev Removed: QuestionBundleFailed is no longer emitted after the retry-after-
    ///      failed-round refactor. The bundle.failed flag is never set, so subscribing
    ///      to this event is a no-op on current deployments.
    event QuestionBundleRewardClaimed(
        uint256 indexed bundleId,
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

    function createRewardPoolWithAsset(
        uint256 contentId,
        uint8 asset,
        uint256 amount,
        uint256 requiredVoters,
        uint256 requiredSettledRounds,
        uint256 bountyClosesAt,
        uint256 feedbackClosesAt
    ) external nonReentrant whenNotPaused returns (uint256 rewardPoolId) {
        rewardPoolId = _createRewardPool(
            contentId,
            msg.sender,
            asset,
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
        require(amount >= requiredCompleters, "Amount too small");
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
            funderVoterId: funderVoterId,
            asset: asset,
            questionCount: contentIds.length.toUint32(),
            requiredCompleters: requiredCompleters.toUint32(),
            completedQuestionCount: 0,
            claimedCount: 0,
            frontendFeeBps: defaultFrontendFeeBps,
            fundedAmount: fundedAmount,
            claimedAmount: 0,
            voterClaimedAmount: 0,
            frontendClaimedAmount: 0,
            refundedAmount: 0,
            failed: false,
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
            bundleQuestions[bundleId].push(
                BundleQuestion({ contentId: contentId.toUint64(), roundId: 0, settled: false, terminal: false })
            );
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
            block.timestamp,
            bountyClosesAt,
            normalizedFeedbackClosesAt,
            defaultFrontendFeeBps,
            asset
        );
        emit BountyWindowCreated(
            bundleId, 0, block.timestamp, bountyClosesAt, normalizedFeedbackClosesAt, requiredCompleters, 1
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
            funderVoterId: funderVoterId,
            submitterIdentity: submitterIdentity,
            submitterVoterId: submitterVoterId,
            submitterVoterIdNFT: address(voterIdNFT),
            asset: asset,
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
            frontendClaimedAmount: 0,
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
        emit BountyWindowCreated(
            rewardPoolId,
            contentId,
            block.timestamp,
            bountyClosesAt,
            normalizedFeedbackClosesAt,
            requiredVoters,
            requiredSettledRounds
        );
    }

    function qualifyRound(uint256 rewardPoolId, uint256 roundId) external nonReentrant whenNotPaused {
        RewardPool storage rewardPool = _getIncompleteRewardPoolForQualification(rewardPoolId);
        _qualifyRound(rewardPoolId, rewardPool, roundId);
    }

    function advanceQualificationCursor(uint256 rewardPoolId, uint256 maxRounds)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 skipped, uint256 nextRoundToEvaluate)
    {
        require(maxRounds > 0, "No rounds");
        RewardPool storage rewardPool = _getIncompleteRewardPoolForQualification(rewardPoolId);

        uint256 fromRoundId = rewardPool.nextRoundToEvaluate;
        nextRoundToEvaluate = fromRoundId;
        while (skipped < maxRounds) {
            (bool roundFinished, bool canQualify,) = _roundQualificationStatus(rewardPool, nextRoundToEvaluate);
            if (!roundFinished || canQualify) break;
            nextRoundToEvaluate++;
            skipped++;
        }

        if (skipped > 0) {
            rewardPool.nextRoundToEvaluate = nextRoundToEvaluate.toUint64();
            emit RewardPoolCursorAdvanced(rewardPoolId, rewardPool.contentId, fromRoundId, nextRoundToEvaluate, skipped);
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
        require(!_isExcludedVoter(rewardPool, roundId, voterId), "Excluded voter");
        require(!rewardClaimed[rewardPoolId][roundId][voterId], "Already claimed");

        bytes32 commitKey = votingEngine.voterIdCommitKey(rewardPool.contentId, roundId, voterId);
        require(commitKey != bytes32(0), "No commit");

        (bool revealed, address frontend) = _revealedCommitFrontend(rewardPool.contentId, roundId, commitKey);
        require(revealed, "Vote not revealed");

        RoundSnapshot storage snapshot = roundSnapshots[rewardPoolId][roundId];
        uint256 grossAmount = _nextEqualShare(snapshot.allocation, snapshot.eligibleVoters, snapshot.claimedCount);
        uint256 reservedFrontendFee =
            _nextEqualShare(snapshot.frontendFeeAllocation, snapshot.eligibleVoters, snapshot.claimedCount);
        uint256 frontendFee;
        address frontendRecipient;
        (rewardAmount, frontendFee, frontendRecipient) =
            _computeClaimSplit(rewardPool.contentId, roundId, commitKey, frontend, grossAmount, reservedFrontendFee);
        require(grossAmount > 0, "No reward");

        rewardClaimed[rewardPoolId][roundId][voterId] = true;
        unchecked {
            snapshot.claimedCount++;
        }
        snapshot.claimedAmount += grossAmount;
        snapshot.voterClaimedAmount += rewardAmount;
        snapshot.frontendClaimedAmount += frontendFee;
        rewardPool.claimedAmount += grossAmount;
        rewardPool.voterClaimedAmount += rewardAmount;
        rewardPool.frontendClaimedAmount += frontendFee;

        IERC20 rewardToken = _rewardToken(rewardPool.asset);
        if (rewardAmount > 0) {
            rewardToken.safeTransfer(msg.sender, rewardAmount);
        }
        if (frontendFee > 0) {
            rewardToken.safeTransfer(frontendRecipient, frontendFee);
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

    function recordBundleQuestionTerminal(uint256 contentId, uint256 roundId, bool settled) external nonReentrant {
        // Intentionally NOT gated by whenNotPaused: the voting engine invokes this inside a
        // try/catch during settlement, so a paused escrow would silently swallow the terminal
        // signal with no retry path, permanently locking bundle claims. Caller is restricted
        // to the voting engine, which is already a trusted state machine.
        require(msg.sender == address(votingEngine), "Only engine");
        uint256 bundleId = contentBundleId[contentId];
        if (bundleId == 0) return;

        BundleReward storage bundle = _getExistingBundleReward(bundleId);
        if (bundle.refunded) return;

        uint256 bundleIndex = contentBundleIndex[contentId];
        BundleQuestion storage question = bundleQuestions[bundleId][bundleIndex];
        if (question.terminal) return;

        bool settledWithinWindow = settled && _bundleRoundSettledWithinWindow(bundle, contentId, roundId);
        if (!settledWithinWindow) return;

        question.roundId = roundId.toUint64();
        question.terminal = true;
        question.settled = true;
        unchecked {
            bundle.completedQuestionCount++;
        }
        emit QuestionBundleRoundRecorded(bundleId, contentId, roundId, bundleIndex);
    }

    function claimQuestionBundleReward(uint256 bundleId)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 rewardAmount)
    {
        BundleReward storage bundle = _getExistingBundleReward(bundleId);
        require(_isBundleClaimOpen(bundle), "Bundle not claimable");

        BundleQuestion storage firstQuestion = bundleQuestions[bundleId][0];
        IVoterIdNFT roundVoterIdNft = _roundVoterIdNft(firstQuestion.contentId, firstQuestion.roundId);
        uint256 voterId = _requireVoterId(roundVoterIdNft, msg.sender);
        require(!bundleRewardClaimed[bundleId][voterId], "Already claimed");
        require(!_isBundleExcludedVoter(bundle, bundleId, msg.sender), "Excluded voter");

        (address frontend, bytes32 firstCommitKey) = _requireCompletedBundle(bundleId, msg.sender);
        uint256 grossAmount = _nextEqualShare(bundle.fundedAmount, bundle.requiredCompleters, bundle.claimedCount);
        require(grossAmount > 0, "No reward");

        uint256 reservedFrontendFee = (grossAmount * bundle.frontendFeeBps) / BPS_SCALE;
        address frontendRecipient;
        (rewardAmount, reservedFrontendFee, frontendRecipient) = _computeClaimSplit(
            firstQuestion.contentId, firstQuestion.roundId, firstCommitKey, frontend, grossAmount, reservedFrontendFee
        );

        bundleRewardClaimed[bundleId][voterId] = true;
        unchecked {
            bundle.claimedCount++;
        }
        bundle.claimedAmount += grossAmount;
        bundle.voterClaimedAmount += rewardAmount;
        bundle.frontendClaimedAmount += reservedFrontendFee;

        IERC20 rewardToken = _rewardToken(bundle.asset);
        if (rewardAmount > 0) {
            rewardToken.safeTransfer(msg.sender, rewardAmount);
        }
        if (reservedFrontendFee > 0) {
            rewardToken.safeTransfer(frontendRecipient, reservedFrontendFee);
        }

        emit QuestionBundleRewardClaimed(
            bundleId, msg.sender, voterId, rewardAmount, frontend, frontendRecipient, reservedFrontendFee, grossAmount
        );
    }

    function claimableQuestionBundleReward(uint256 bundleId, address account)
        external
        view
        returns (uint256 claimableAmount)
    {
        BundleReward storage bundle = bundleRewards[bundleId];
        if (bundle.id == 0 || !_isBundleClaimOpen(bundle)) return 0;

        BundleQuestion storage firstQuestion = bundleQuestions[bundleId][0];
        uint256 voterId = _roundVoterIdNft(firstQuestion.contentId, firstQuestion.roundId).getTokenId(account);
        if (voterId == 0 || bundleRewardClaimed[bundleId][voterId] || _isBundleExcludedVoter(bundle, bundleId, account))
        {
            return 0;
        }
        if (!_hasCompletedBundle(bundleId, account)) return 0;

        uint256 grossAmount = _nextEqualShare(bundle.fundedAmount, bundle.requiredCompleters, bundle.claimedCount);
        uint256 reservedFrontendFee = (grossAmount * bundle.frontendFeeBps) / BPS_SCALE;
        return grossAmount - reservedFrontendFee;
    }

    function refundQuestionBundleReward(uint256 bundleId)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 refundAmount)
    {
        BundleReward storage bundle = _getExistingBundleReward(bundleId);
        require(!bundle.refunded, "Already refunded");
        // Refund conditions: bounty window expired, or all voters claimed.
        require(
            (bundle.bountyClosesAt != 0 && block.timestamp > bundle.bountyClosesAt)
                || bundle.claimedCount >= bundle.requiredCompleters,
            "Bundle active"
        );
        // If claims are still open (bundle is claim-complete but not fully claimed) and the
        // bounty-window-expiry branch triggered the refund, voters who haven't yet claimed
        // would have their earned share swept back to the funder. Give them an explicit
        // grace window to finish claiming before anyone can race them.
        if (_isBundleClaimOpen(bundle)) {
            require(block.timestamp > uint256(bundle.bountyClosesAt) + BUNDLE_CLAIM_GRACE, "Claim grace active");
            _requireBundleCleanupComplete(bundleId);
        }
        refundAmount = bundle.fundedAmount - bundle.claimedAmount;
        require(refundAmount > 0, "No refund");

        bundle.refunded = true;
        bundle.refundedAmount = refundAmount;
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
        require(rewardPool.bountyClosesAt != 0 && block.timestamp > rewardPool.bountyClosesAt, "Not expired");
        refundAmount = _refundUnallocatedRewardPool(rewardPoolId, rewardPool);
        emit BountyWindowExpired(rewardPoolId, rewardPool.contentId, refundAmount);
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
        if (rewardPool.nonRefundable) {
            address treasury = _protocolTreasury();
            require(treasury != address(0), "Treasury not set");
            _rewardToken(rewardPool.asset).safeTransfer(treasury, refundAmount);
            emit RewardPoolForfeited(rewardPoolId, treasury, refundAmount);
        } else {
            _rewardToken(rewardPool.asset).safeTransfer(rewardPool.funder, refundAmount);
            emit RewardPoolRefunded(rewardPoolId, rewardPool.funder, refundAmount);
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

        bytes32 commitKey = votingEngine.voterIdCommitKey(rewardPool.contentId, roundId, voterId);
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
            uint256 previewGrossAmount = _nextEqualShare(allocation, eligibleVoters, 0);
            uint256 previewReservedFrontendFee =
                _nextEqualShare(_frontendFeeAllocation(rewardPool, allocation), eligibleVoters, 0);
            (claimableAmount,,) = _computeClaimSplit(
                rewardPool.contentId, roundId, commitKey, frontend, previewGrossAmount, previewReservedFrontendFee
            );
            return claimableAmount;
        }
        if (snapshot.eligibleVoters == 0 || snapshot.claimedCount >= snapshot.eligibleVoters) return 0;
        uint256 grossAmount = _nextEqualShare(snapshot.allocation, snapshot.eligibleVoters, snapshot.claimedCount);
        uint256 reservedFrontendFee =
            _nextEqualShare(snapshot.frontendFeeAllocation, snapshot.eligibleVoters, snapshot.claimedCount);
        (claimableAmount,,) =
            _computeClaimSplit(rewardPool.contentId, roundId, commitKey, frontend, grossAmount, reservedFrontendFee);
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

    function _resolveFunderIdentity(address funder)
        internal
        view
        returns (uint256 funderVoterId, address funderIdentity)
    {
        funderVoterId = voterIdNFT.getTokenId(funder);
        if (funderVoterId == 0) return (0, address(0));
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
        return !bundle.refunded && bundle.completedQuestionCount == bundle.questionCount
            && bundle.claimedCount < bundle.requiredCompleters;
    }

    function _requireBundleCleanupComplete(uint256 bundleId) internal view {
        BundleQuestion[] storage questions = bundleQuestions[bundleId];
        for (uint256 i = 0; i < questions.length;) {
            BundleQuestion storage question = questions[i];
            require(
                votingEngine.roundUnrevealedCleanupRemaining(question.contentId, question.roundId) == 0,
                "Cleanup pending"
            );
            unchecked {
                ++i;
            }
        }
    }

    function _bundleRoundSettledWithinWindow(BundleReward storage bundle, uint256 contentId, uint256 roundId)
        internal
        view
        returns (bool)
    {
        (, RoundLib.RoundState state,,,,,,,,, uint48 settledAt,,,) = votingEngine.rounds(contentId, roundId);
        return state == RoundLib.RoundState.Settled && settledAt != 0
            && (bundle.bountyClosesAt == 0 || settledAt <= bundle.bountyClosesAt);
    }

    function _requireCompletedBundle(uint256 bundleId, address account)
        internal
        view
        returns (address frontend, bytes32 firstCommitKey)
    {
        BundleQuestion[] storage questions = bundleQuestions[bundleId];
        for (uint256 i = 0; i < questions.length;) {
            BundleQuestion storage question = questions[i];
            require(question.terminal, "Question not settled");
            require(
                votingEngine.roundUnrevealedCleanupRemaining(question.contentId, question.roundId) == 0,
                "Cleanup pending"
            );
            uint256 voterId = _voterIdForRound(question.contentId, question.roundId, account);
            require(voterId != 0, "Voter ID required");
            bytes32 commitKey = votingEngine.voterIdCommitKey(question.contentId, question.roundId, voterId);
            require(commitKey != bytes32(0), "No commit");
            (bool revealed, address questionFrontend) =
                _revealedCommitFrontend(question.contentId, question.roundId, commitKey);
            require(revealed, "Vote not revealed");
            if (i == 0) {
                frontend = questionFrontend;
                firstCommitKey = commitKey;
            }
            unchecked {
                ++i;
            }
        }
    }

    function _hasCompletedBundle(uint256 bundleId, address account) internal view returns (bool) {
        BundleQuestion[] storage questions = bundleQuestions[bundleId];
        for (uint256 i = 0; i < questions.length;) {
            BundleQuestion storage question = questions[i];
            if (!question.terminal) return false;
            if (votingEngine.roundUnrevealedCleanupRemaining(question.contentId, question.roundId) > 0) return false;
            uint256 voterId = _voterIdForRound(question.contentId, question.roundId, account);
            if (voterId == 0) return false;
            bytes32 commitKey = votingEngine.voterIdCommitKey(question.contentId, question.roundId, voterId);
            if (commitKey == bytes32(0)) return false;
            (bool revealed,) = _revealedCommitFrontend(question.contentId, question.roundId, commitKey);
            if (!revealed) return false;
            unchecked {
                ++i;
            }
        }
        return true;
    }

    function _isBundleExcludedVoter(BundleReward storage bundle, uint256 bundleId, address account)
        internal
        view
        returns (bool)
    {
        BundleQuestion[] storage questions = bundleQuestions[bundleId];
        for (uint256 i = 0; i < questions.length;) {
            BundleQuestion storage question = questions[i];
            uint256 voterId = _voterIdForRound(question.contentId, question.roundId, account);
            if (voterId != 0) {
                uint256 funderVoterId = _funderVoterIdForBundleQuestion(bundle, question.contentId, question.roundId);
                if (voterId == funderVoterId) return true;

                address submitterIdentity = registry.getSubmitterIdentity(question.contentId);
                if (submitterIdentity != address(0)) {
                    uint256 submitterVoterId = _voterIdForRound(question.contentId, question.roundId, submitterIdentity);
                    if (voterId == submitterVoterId) return true;
                }
            }
            unchecked {
                ++i;
            }
        }
        return false;
    }

    function _funderVoterIdForBundleQuestion(BundleReward storage bundle, uint256 contentId, uint256 roundId)
        internal
        view
        returns (uint256)
    {
        return _resolveFunderVoterId(contentId, roundId, bundle.funder, bundle.funderIdentity, bundle.funderVoterId);
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
        if (_submitterHasRevealedCommit(rewardPool, roundId, funderVoterId)) {
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

    function _computeClaimSplit(
        uint256 contentId,
        uint256 roundId,
        bytes32 commitKey,
        address frontend,
        uint256 grossAmount,
        uint256 reservedFrontendFee
    ) internal view returns (uint256 voterReward, uint256 frontendFee, address frontendRecipient) {
        if (
            reservedFrontendFee == 0 || frontend == address(0)
                || !votingEngine.frontendEligibleAtCommit(contentId, roundId, commitKey)
        ) {
            return (grossAmount, 0, address(0));
        }

        if (reservedFrontendFee > grossAmount) {
            reservedFrontendFee = grossAmount;
        }

        frontendRecipient = _resolveFrontendRewardRecipient(contentId, roundId, frontend);
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

    function _isExcludedVoter(RewardPool storage rewardPool, uint256 roundId, uint256 voterId)
        internal
        view
        returns (bool)
    {
        return voterId != 0
            && (voterId == _funderVoterIdForRound(rewardPool, roundId)
                || _isSubmitterVoterIdForRound(rewardPool, roundId, voterId));
    }

    function _funderVoterIdForRound(RewardPool storage rewardPool, uint256 roundId) internal view returns (uint256) {
        return _resolveFunderVoterId(
            rewardPool.contentId, roundId, rewardPool.funder, rewardPool.funderIdentity, rewardPool.funderVoterId
        );
    }

    function _resolveFunderVoterId(
        uint256 contentId,
        uint256 roundId,
        address funder,
        address funderIdentity,
        uint256 fallbackVoterId
    ) internal view returns (uint256) {
        uint256 funderVoterId = _voterIdForRound(contentId, roundId, funder);
        if (funderVoterId != 0) return funderVoterId;

        if (funderIdentity != address(0)) {
            uint256 identityVoterId = _voterIdForRound(contentId, roundId, funderIdentity);
            if (identityVoterId != 0) return identityVoterId;
        }

        return fallbackVoterId;
    }

    function _submitterHasRevealedCommit(RewardPool storage rewardPool, uint256 roundId, uint256 funderVoterId)
        internal
        view
        returns (bool)
    {
        uint256 currentVoterId = _currentSubmitterVoterId(rewardPool, roundId);
        if (
            currentVoterId != 0 && currentVoterId != funderVoterId
                && _hasRevealedCommit(rewardPool.contentId, roundId, currentVoterId)
        ) {
            return true;
        }

        uint256 snapshotVoterId = rewardPool.submitterVoterId;
        return _submitterSnapshotAppliesToRound(rewardPool, roundId) && snapshotVoterId != 0
            && snapshotVoterId != currentVoterId && snapshotVoterId != funderVoterId
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
