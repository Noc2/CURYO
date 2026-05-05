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
import { QuestionRewardPoolEscrowQualificationLib } from "./libraries/QuestionRewardPoolEscrowQualificationLib.sol";
import { TokenTransferLib } from "./libraries/TokenTransferLib.sol";

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
    uint256 internal constant MAX_REWARD_POOL_ROUND_VOTERS = 200;
    uint256 internal constant BPS_SCALE = 10_000;
    uint256 internal constant DEFAULT_FRONTEND_FEE_BPS = 300;
    uint256 internal constant MAX_FRONTEND_FEE_BPS = 500;
    /// @notice Grace period voters have after bountyClosesAt to claim on a still-claimable bundle
    ///         before a third party can sweep the remainder back to the funder.
    uint256 internal constant BUNDLE_CLAIM_GRACE = 7 days;
    /// @dev Worst-case settlement delay for a threshold-reached bundle round:
    ///      2 * absolute max epoch/round duration + max reveal grace + claim grace.
    uint256 internal constant BUNDLE_REFUND_GRACE = 98 days;
    uint8 internal constant REWARD_ASSET_HREP = 0;
    uint8 internal constant REWARD_ASSET_USDC = 1;

    error RewardPoolCursorNeedsAdvance();

    struct RewardPool {
        uint64 id;
        uint64 contentId;
        uint64 startRoundId;
        uint64 nextRoundToEvaluate;
        uint64 bountyOpensAt;
        uint64 bountyClosesAt;
        uint64 claimDeadline;
        address funder;
        address funderIdentity;
        address submitterIdentity;
        // Deprecated fields retained to preserve proxy storage layout.
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
        bool unallocatedRefunded;
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
        uint256 funderNullifier;
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
        uint256 contentId;
        uint256 submitterNullifier;
    }

    struct BundleRoundSetSnapshot {
        bool qualified;
        uint32 claimedCount;
        uint32 eligibleCompleters;
        uint256 allocation;
        uint256 frontendFeeAllocation;
    }

    IERC20 internal hrepToken;
    IERC20 internal usdcToken;
    ContentRegistry internal registry;
    RoundVotingEngine internal votingEngine;
    IVoterIdNFT internal voterIdNFT;
    uint256 internal nextRewardPoolId;

    mapping(uint256 => RewardPool) private rewardPools;
    mapping(uint256 => mapping(uint256 => RoundSnapshot)) private roundSnapshots;
    mapping(uint256 => mapping(uint256 => mapping(bytes32 => bool))) private rewardClaimed;
    mapping(uint256 => BundleReward) private bundleRewards;
    mapping(uint256 => BundleQuestion[]) private bundleQuestions;
    mapping(uint256 => mapping(uint256 => uint32)) private bundleQuestionRecordedRounds;
    mapping(uint256 => mapping(uint256 => mapping(uint256 => uint64))) private bundleRoundIds;
    mapping(uint256 => mapping(uint256 => BundleRoundSetSnapshot)) private bundleRoundSetSnapshots;
    mapping(uint256 => mapping(uint256 => mapping(bytes32 => bool))) private bundleRoundSetRewardClaimed;
    /// @dev Storage placeholder reserving the slot once occupied by the removed
    ///      `rewardPoolFunderNullifier` mapping (slim 2820d934). DO NOT remove or repurpose:
    ///      preserves storage layout for any in-place proxy upgrade from a deployment that
    ///      still has data in this slot. The funder's nullifier was write-only after the M2-1
    ///      payer-identity refactor; refunds use `RewardPool.funder` directly and exclusion
    ///      uses `rewardPoolPayerNullifier` for gateway-mediated payments.
    mapping(uint256 => uint256) private __deprecated_rewardPoolFunderNullifier;
    mapping(uint256 => uint256) private rewardPoolSubmitterNullifier;
    mapping(uint256 => address) private rewardPoolPayerIdentity;
    mapping(uint256 => uint256) private rewardPoolPayerNullifier;
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
        require(voterIdNFT.getTokenId(msg.sender) != 0, "Voter ID required");
        _requireCurrentRegistryEscrow();
        rewardPoolId = _createRewardPool(
            contentId,
            msg.sender,
            address(0),
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
        address payer,
        uint8 asset,
        uint256 amount,
        uint256 requiredVoters,
        uint256 requiredSettledRounds,
        uint256 bountyClosesAt,
        uint256 feedbackClosesAt
    ) external nonReentrant whenNotPaused returns (uint256 rewardPoolId) {
        require(msg.sender == address(registry), "Only registry");
        _requireRegistryVotingEngine();
        require(funder != address(0), "Invalid funder");
        rewardPoolId = _createRewardPool(
            contentId,
            funder,
            payer,
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
        _requireRegistryVotingEngine();
        require(bundleId != 0, "Invalid bundle");
        require(bundleRewards[bundleId].id == 0, "Bundle exists");
        require(contentIds.length > 0, "No questions");
        require(funder != address(0), "Invalid funder");
        require(asset == REWARD_ASSET_HREP || asset == REWARD_ASSET_USDC, "Invalid asset");
        require(requiredCompleters >= MIN_REQUIRED_VOTERS, "Too few voters");
        require(requiredSettledRounds >= MIN_REQUIRED_SETTLED_ROUNDS, "Too few rounds");
        require(requiredSettledRounds <= MAX_REQUIRED_SETTLED_ROUNDS, "Too many rounds");
        require(amount >= requiredCompleters * requiredSettledRounds, "Amount too small");
        _requireBundleFundingCoversMaxCompleters(contentIds, amount, requiredSettledRounds);
        // Bundles must have a strict future bountyClosesAt. Without this, a bountyClosesAt
        // of 0 would silently pass _requireFutureBountyWindow and render the bundle instantly
        // refundable through refundQuestionBundleReward (block.timestamp > 0 + BUNDLE_REFUND_GRACE
        // is trivially true). Today this is shielded by the registry's bountyClosesAt!=0 check,
        // but this escrow is the trust boundary — keep the constraint local.
        require(bountyClosesAt > block.timestamp, "Bad close");
        uint256 normalizedFeedbackClosesAt = _normalizeFeedbackClosesAt(bountyClosesAt, feedbackClosesAt);

        uint256 fundedAmount = _pullExactToken(funder, asset, amount);
        (uint256 funderVoterId, address funderIdentity, uint256 funderNullifier) = _resolveFunderIdentity(funder, asset);

        BundleReward storage bundle = bundleRewards[bundleId];
        bundle.id = bundleId.toUint64();
        bundle.bountyClosesAt = bountyClosesAt.toUint64();
        bundle.feedbackClosesAt = normalizedFeedbackClosesAt.toUint64();
        bundle.funder = funder;
        bundle.funderIdentity = funderIdentity;
        bundle.asset = asset;
        bundle.questionCount = uint32(contentIds.length);
        bundle.requiredCompleters = uint32(requiredCompleters);
        bundle.requiredSettledRounds = uint32(requiredSettledRounds);
        bundle.frontendFeeBps = defaultFrontendFeeBps;
        bundle.funderNullifier = funderNullifier;
        bundle.fundedAmount = fundedAmount;
        bundle.unallocatedAmount = fundedAmount;
        // Registry-initiated submissions carry the mandatory-bounty anti-spam model:
        // unclaimed residue is forfeited to treasury rather than refunded, matching
        // the single-pool path (`createSubmissionRewardPoolFromRegistry`).
        bundle.nonRefundable = true;

        for (uint256 i = 0; i < contentIds.length;) {
            uint256 contentId = contentIds[i];
            require(registry.isContentActive(contentId), "Content not active");
            require(contentBundleId[contentId] == 0, "Bundled");
            contentBundleId[contentId] = bundleId;
            contentBundleIndex[contentId] = i;
            uint256 submitterNullifier =
                QuestionRewardPoolEscrowQualificationLib.resolveSubmitterNullifier(registry, voterIdNFT, contentId);
            bundleQuestions[bundleId].push(
                BundleQuestion({ contentId: contentId, submitterNullifier: submitterNullifier })
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
        address payer,
        uint8 asset,
        uint256 amount,
        uint256 requiredVoters,
        uint256 requiredSettledRounds,
        uint256 bountyClosesAt,
        uint256 feedbackClosesAt,
        bool nonRefundable
    ) internal returns (uint256 rewardPoolId) {
        uint256 fundedAmount = _pullExactToken(funder, asset, amount);

        rewardPoolId = _createRewardPoolFromFundedAmount(
            contentId,
            funder,
            payer,
            asset,
            fundedAmount,
            requiredVoters,
            requiredSettledRounds,
            bountyClosesAt,
            feedbackClosesAt,
            nonRefundable
        );
    }

    function _createRewardPoolFromFundedAmount(
        uint256 contentId,
        address funder,
        address payer,
        uint8 asset,
        uint256 fundedAmount,
        uint256 requiredVoters,
        uint256 requiredSettledRounds,
        uint256 bountyClosesAt,
        uint256 feedbackClosesAt,
        bool nonRefundable
    ) internal returns (uint256 rewardPoolId) {
        uint256 amount = fundedAmount;
        require(amount > 0, "Amount required");
        require(asset == REWARD_ASSET_HREP || asset == REWARD_ASSET_USDC, "Invalid asset");
        require(registry.isContentActive(contentId), "Content not active");
        require(requiredVoters >= MIN_REQUIRED_VOTERS, "Too few voters");
        require(requiredSettledRounds >= MIN_REQUIRED_SETTLED_ROUNDS, "Too few rounds");
        require(requiredSettledRounds <= MAX_REQUIRED_SETTLED_ROUNDS, "Too many rounds");
        require(amount >= requiredSettledRounds * requiredVoters, "Amount too small");
        _requireFutureBountyWindow(bountyClosesAt);
        uint256 normalizedFeedbackClosesAt = _normalizeFeedbackClosesAt(bountyClosesAt, feedbackClosesAt);
        RoundLib.RoundConfig memory contentCfg = registry.getContentRoundConfig(contentId);
        require(requiredVoters <= contentCfg.maxVoters, "Voters exceed max");
        require(contentCfg.maxVoters <= MAX_REWARD_POOL_ROUND_VOTERS, "Voters exceed max");
        if (!nonRefundable) {
            require(amount >= requiredSettledRounds * uint256(contentCfg.maxVoters), "Amount too small");
            require(bountyClosesAt > block.timestamp, "Bad close");
        }

        uint256 currentRoundId = votingEngine.currentRoundId(contentId);
        uint256 startRoundId = currentRoundId == 0 ? 1 : currentRoundId + 1;
        (uint256 funderVoterId, address funderIdentity,) = _resolveFunderIdentity(funder, asset);
        // For X402 and other gateway-mediated payments, the actual human payer (submitter)
        // differs from the refund destination (funder/gateway). Resolve the payer's identity
        // for funder-side voter-eligibility exclusion so the payer cannot vote on their own question.
        address effectivePayer = payer == address(0) ? funder : payer;
        (, address payerIdentity, uint256 payerNullifier) = _resolveFunderIdentity(effectivePayer, asset);
        address submitterIdentity = registry.getSubmitterIdentity(contentId);
        uint256 submitterNullifier = registry.contentSubmitterNullifier(contentId);

        rewardPoolId = nextRewardPoolId++;
        rewardPools[rewardPoolId] = RewardPool({
            id: rewardPoolId.toUint64(),
            contentId: contentId.toUint64(),
            startRoundId: startRoundId.toUint64(),
            nextRoundToEvaluate: startRoundId.toUint64(),
            bountyOpensAt: block.timestamp.toUint64(),
            bountyClosesAt: bountyClosesAt.toUint64(),
            claimDeadline: bountyClosesAt.toUint64(),
            funder: funder,
            funderIdentity: funderIdentity,
            submitterIdentity: submitterIdentity,
            submitterVoterId: 0,
            submitterVoterIdNFT: address(0),
            asset: asset,
            fundedAmount: fundedAmount,
            unallocatedAmount: fundedAmount,
            claimedAmount: 0,
            requiredVoters: uint32(requiredVoters),
            requiredSettledRounds: uint32(requiredSettledRounds),
            qualifiedRounds: 0,
            refunded: false,
            unallocatedRefunded: false,
            frontendFeeBps: defaultFrontendFeeBps,
            nonRefundable: nonRefundable
        });
        rewardPoolSubmitterNullifier[rewardPoolId] = submitterNullifier;
        rewardPoolPayerIdentity[rewardPoolId] = payerIdentity;
        rewardPoolPayerNullifier[rewardPoolId] = payerNullifier;

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

    function qualifyRound(uint256 rewardPoolId, uint256 roundId) external {
        RewardPool storage rewardPool = _getIncompleteRewardPoolForQualification(rewardPoolId);
        _qualifyRound(rewardPoolId, rewardPool, roundId);
    }

    function advanceQualificationCursor(uint256 rewardPoolId, uint256 maxRounds)
        external
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
        returns (uint256 rewardAmount)
    {
        RewardPool storage rewardPool = _getExistingRewardPool(rewardPoolId);
        require(!rewardPool.refunded, "Bounty refunded");
        require(votingEngine.roundUnrevealedCleanupRemaining(rewardPool.contentId, roundId) == 0, "Cleanup pending");
        _qualifyRoundIfNeeded(rewardPoolId, rewardPool, roundId);

        IVoterIdNFT roundVoterIdNft = _roundVoterIdNft(rewardPool.contentId, roundId);
        uint256 voterId = _requireVoterId(roundVoterIdNft, msg.sender);
        address rewardRecipient = roundVoterIdNft.getHolder(voterId);
        require(!_isExcludedVoter(rewardPool, roundId, voterId), "Excluded voter");

        bytes32 commitKey = _commitKeyForVoter(rewardPool.contentId, roundId, roundVoterIdNft, voterId);
        require(commitKey != bytes32(0), "No commit");
        require(!rewardClaimed[rewardPoolId][roundId][commitKey], "Already claimed");

        (bool revealed, address frontend) =
            _timelyRevealedCommitFrontend(rewardPool.contentId, roundId, commitKey, rewardPool.bountyClosesAt);
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

        rewardClaimed[rewardPoolId][roundId][commitKey] = true;
        unchecked {
            snapshot.claimedCount++;
        }
        rewardPool.claimedAmount += grossAmount;

        (rewardAmount, frontendFee, frontendRecipient) = _settleClaimPayout(
            _rewardToken(rewardPool.asset), rewardRecipient, rewardAmount, frontendRecipient, frontendFee
        );
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

    function _settleClaimPayout(
        IERC20 rewardToken,
        address rewardRecipient,
        uint256 rewardAmount,
        address frontendRecipient,
        uint256 frontendFee
    ) internal returns (uint256, uint256, address) {
        if (
            frontendFee > 0 && frontendRecipient != address(0)
                && TokenTransferLib.tryTransfer(rewardToken, frontendRecipient, frontendFee)
        ) {
            // Frontend fee paid; nothing to redirect.
        } else {
            rewardAmount += frontendFee;
            frontendFee = 0;
            frontendRecipient = address(0);
        }
        if (rewardAmount > 0) {
            rewardToken.safeTransfer(rewardRecipient, rewardAmount);
        }
        return (rewardAmount, frontendFee, frontendRecipient);
    }

    function recordBundleQuestionTerminal(uint256 contentId, uint256 roundId, bool settled) external {
        // Intentionally NOT gated by whenNotPaused: the voting engine invokes this inside a
        // try/catch during settlement, so a paused escrow would silently swallow the terminal
        // signal with no retry path, permanently locking bundle claims. Caller is restricted
        // to the voting engine, which is already a trusted state machine.
        require(msg.sender == address(votingEngine), "Only engine");
        _recordBundleQuestionTerminal(contentId, roundId, settled);
    }

    /// @notice Mirror a settled or terminal round into its bundle accounting and qualify any
    ///         complete-but-pending round set. Permissionless and idempotent.
    /// @dev Settlement only does the O(1) record into the bundle slot; the heavy qualification
    ///      iteration (voters × bundle questions) is intentionally deferred here so it cannot
    ///      OOG the settlement transaction at high `maxVoters` × bundle-size. Anyone can call
    ///      this after settlement to drive the bundle forward.
    /// @dev OPERATIONS REQUIREMENT: deployments SHOULD run a keeper that calls this function
    ///      after each bundle question's round settles. Voters can also self-trigger this
    ///      call before claiming, and the refund path rechecks complete recorded sets before
    ///      sweeping funds.
    function syncBundleQuestionTerminal(uint256 contentId, uint256 roundId) external {
        // Existing bundles keep using this escrow's snapshotted engine after registry rotation.
        (RoundLib.RoundState state, uint48 settledAt,) = _roundTerminalState(contentId, roundId);
        require(settledAt != 0, "Round not terminal");
        _recordBundleQuestionTerminal(contentId, roundId, state == RoundLib.RoundState.Settled);
        uint256 bundleId = contentBundleId[contentId];
        if (bundleId == 0) return;
        BundleReward storage bundle = bundleRewards[bundleId];
        if (bundle.refunded) return;
        _qualifyPendingBundleRoundSet(bundleId, bundle);
    }

    function _qualifyPendingBundleRoundSet(uint256 bundleId, BundleReward storage bundle) internal {
        uint256 roundSetIndex = bundle.completedRoundSets;
        if (roundSetIndex >= bundle.requiredSettledRounds) return;
        if (bundleRoundSetSnapshots[bundleId][roundSetIndex].qualified) return;
        if (!_isBundleRoundSetComplete(bundleId, roundSetIndex)) return;
        _qualifyBundleRoundSet(bundleId, bundle, roundSetIndex);
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
        if (roundId <= bundleRoundIds[bundleId][bundleIndex][roundSetIndex]) return;
        if (roundSetIndex != 0) {
            unchecked {
                if (roundId <= bundleRoundIds[bundleId][bundleIndex][roundSetIndex - 1]) return;
            }
        }

        if (!settled || !_bundleRoundSettledWithinWindow(bundle, contentId, roundId)) return;

        bundleRoundIds[bundleId][bundleIndex][roundSetIndex] = uint64(roundId);
        bundleQuestionRecordedRounds[bundleId][bundleIndex] = uint32(roundSetIndex + 1);
        emit QuestionBundleRoundRecorded(bundleId, contentId, roundId, bundleIndex, roundSetIndex);

        // Qualification is intentionally NOT triggered here. With large bundles + high
        // per-content `maxVoters`, `_qualifyBundleRoundSet` is O(maxVoters * bundleSize)
        // and can exceed the settlement-block gas budget. Anyone can call
        // `syncBundleQuestionTerminal(contentId, roundId)` once the round set is complete
        // to evaluate eligibility and either qualify the snapshot or reset it for retry.
        // Indexers can detect round-set completion by counting QuestionBundleRoundRecorded
        // events for a given (bundleId, roundSetIndex) and matching against bundleQuestions.length.
    }


    function claimQuestionBundleReward(uint256 bundleId, uint256 roundSetIndex)
        external
        nonReentrant
        returns (uint256 rewardAmount)
    {
        BundleReward storage bundle = _getExistingBundleReward(bundleId);
        require(_isBundleRoundSetClaimOpen(bundle, bundleId, roundSetIndex), "Bundle not claimable");

        BundleQuestion storage firstQuestion = bundleQuestions[bundleId][0];
        uint256 firstRoundId = bundleRoundIds[bundleId][0][roundSetIndex];
        IVoterIdNFT roundVoterIdNft = _roundVoterIdNft(firstQuestion.contentId, firstRoundId);
        uint256 voterId = _requireVoterId(roundVoterIdNft, msg.sender);
        address rewardRecipient = roundVoterIdNft.getHolder(voterId);
        require(!_isBundleExcludedVoter(bundle, bundleId, roundSetIndex, msg.sender), "Excluded voter");

        (address frontend, bytes32 firstCommitKey) =
            _requireCompletedBundleRoundSet(bundleId, roundSetIndex, msg.sender);
        require(!bundleRoundSetRewardClaimed[bundleId][roundSetIndex][firstCommitKey], "Already claimed");
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
                snapshot.eligibleCompleters,
                snapshot.claimedCount
            );
        require(grossAmount > 0, "No reward");

        bundleRoundSetRewardClaimed[bundleId][roundSetIndex][firstCommitKey] = true;
        unchecked {
            snapshot.claimedCount++;
            bundle.claimedCount++;
        }
        bundle.claimedAmount += grossAmount;

        (rewardAmount, reservedFrontendFee, frontendRecipient) = _settleClaimPayout(
            _rewardToken(bundle.asset), rewardRecipient, rewardAmount, frontendRecipient, reservedFrontendFee
        );

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
        if (voterId == 0 || _isBundleExcludedVoter(bundle, bundleId, roundSetIndex, account)) {
            return 0;
        }
        (bool completed, address frontend, bytes32 firstCommitKey) =
            _completedBundleRoundSetCommit(bundleId, roundSetIndex, account);
        if (!completed) return 0;
        if (bundleRoundSetRewardClaimed[bundleId][roundSetIndex][firstCommitKey]) return 0;

        BundleRoundSetSnapshot storage snapshot = bundleRoundSetSnapshots[bundleId][roundSetIndex];
        (, claimableAmount,,) = QuestionRewardPoolEscrowClaimLib.computeEqualShareClaimSplit(
            votingEngine,
            firstQuestion.contentId,
            firstRoundId,
            firstCommitKey,
            frontend,
            snapshot.allocation,
            snapshot.frontendFeeAllocation,
            snapshot.eligibleCompleters,
            snapshot.claimedCount
        );
    }

    function refundQuestionBundleReward(uint256 bundleId) external nonReentrant returns (uint256 refundAmount) {
        BundleReward storage bundle = _getExistingBundleReward(bundleId);
        require(!bundle.refunded, "Already refunded");
        require(block.timestamp > bundle.bountyClosesAt, "Bundle active");
        require(block.timestamp > uint256(bundle.bountyClosesAt) + BUNDLE_REFUND_GRACE, "Grace");
        _qualifyPendingBundleRoundSet(bundleId, bundle);
        if (bundle.completedRoundSets != 0) {
            _requireBundleCleanupComplete(bundleId, bundle.completedRoundSets);
            if (bundle.bountyOpensAt == 0) {
                bundle.bountyOpensAt = (block.timestamp + BUNDLE_CLAIM_GRACE).toUint64();
                return 0;
            }
            require(block.timestamp > bundle.bountyOpensAt, "Grace");
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

    function refundExpiredRewardPool(uint256 rewardPoolId) external nonReentrant returns (uint256 refundAmount) {
        RewardPool storage rewardPool = _getExistingRewardPool(rewardPoolId);
        if (rewardPool.qualifiedRounds >= rewardPool.requiredSettledRounds || rewardPool.unallocatedRefunded) {
            refundAmount = _refundCompleteRewardPool(rewardPoolId, rewardPool);
        } else {
            require(rewardPool.bountyClosesAt != 0 && block.timestamp > rewardPool.bountyClosesAt, "Not expired");
            refundAmount = _refundUnallocatedRewardPool(rewardPoolId, rewardPool);
        }
    }

    function refundInactiveRewardPool(uint256 rewardPoolId) external nonReentrant returns (uint256 refundAmount) {
        RewardPool storage rewardPool = _getExistingRewardPool(rewardPoolId);
        require(!registry.isContentActive(rewardPool.contentId), "Content active");
        // If the content is Dormant, the original submitter still has an exclusive 24-hour
        // revival window. Forfeiting during that window would let anyone atomically combine
        // markDormant + refundInactiveRewardPool to strip the bounty before the submitter
        // can recover it. Wait until the revival window closes. Cancelled / non-dormant
        // content has dormantKeyReleasableAt == 0 so this check is a no-op there.
        require(block.timestamp > registry.dormantKeyReleasableAt(rewardPool.contentId), "Revival active");
        refundAmount = _refundUnallocatedRewardPool(rewardPoolId, rewardPool);
    }

    function _refundUnallocatedRewardPool(uint256 rewardPoolId, RewardPool storage rewardPool)
        internal
        returns (uint256 refundAmount)
    {
        require(!rewardPool.refunded, "Already refunded");
        require(!rewardPool.unallocatedRefunded, "Already refunded");
        require(rewardPool.qualifiedRounds < rewardPool.requiredSettledRounds, "Bounty complete");
        _requireNoPendingFinishedRound(rewardPool);
        refundAmount = rewardPool.unallocatedAmount;
        require(refundAmount > 0, "No refund");
        rewardPool.unallocatedRefunded = true;
        rewardPool.unallocatedAmount = 0;
        rewardPool.fundedAmount -= refundAmount;
        _transferRewardPoolResidue(rewardPoolId, rewardPool, refundAmount);
    }

    function _refundCompleteRewardPool(uint256 rewardPoolId, RewardPool storage rewardPool)
        internal
        returns (uint256 refundAmount)
    {
        uint256 claimDeadline = rewardPool.claimDeadline;
        require(claimDeadline != 0, "Grace");
        require(block.timestamp > claimDeadline + BUNDLE_CLAIM_GRACE, "Grace");

        refundAmount = rewardPool.fundedAmount - rewardPool.claimedAmount;
        require(refundAmount > 0, "No refund");
        rewardPool.refunded = true;
        rewardPool.claimDeadline = 0;
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
        if (rewardPool.refunded) return 0;

        IVoterIdNFT roundVoterIdNft = _roundVoterIdNft(rewardPool.contentId, roundId);
        uint256 voterId = roundVoterIdNft.getTokenId(account);
        if (voterId == 0 || _isExcludedVoter(rewardPool, roundId, voterId)) {
            return 0;
        }

        bytes32 commitKey = _commitKeyForVoter(rewardPool.contentId, roundId, roundVoterIdNft, voterId);
        if (commitKey == bytes32(0)) return 0;
        if (rewardClaimed[rewardPoolId][roundId][commitKey]) return 0;
        (bool revealed, address frontend) =
            _timelyRevealedCommitFrontend(rewardPool.contentId, roundId, commitKey, rewardPool.bountyClosesAt);
        if (!revealed) return 0;

        RoundSnapshot storage snapshot = roundSnapshots[rewardPoolId][roundId];
        if (votingEngine.roundUnrevealedCleanupRemaining(rewardPool.contentId, roundId) > 0) return 0;
        if (!snapshot.qualified) {
            if (!_canPreviewNewQualification(rewardPool, roundId)) return 0;
            (, bool canQualify, uint256 eligibleVoters,) = _previewRoundQualification(rewardPool, roundId);
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
                (allocation * rewardPool.frontendFeeBps) / BPS_SCALE,
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

    function getWiring()
        external
        view
        returns (address hrep, address usdc, address registry_, address votingEngine_, address voterIdNft_)
    {
        return (address(hrepToken), address(usdcToken), address(registry), address(votingEngine), address(voterIdNFT));
    }

    function setDefaultFrontendFeeBps(uint256 frontendFeeBps_) external onlyRole(CONFIG_ROLE) {
        require(frontendFeeBps_ <= MAX_FRONTEND_FEE_BPS, "Fee too high");
        defaultFrontendFeeBps = uint16(frontendFeeBps_);
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function _resolveFunderIdentity(address funder, uint8 asset)
        internal
        view
        returns (uint256 funderVoterId, address funderIdentity, uint256 funderNullifier)
    {
        funderVoterId = voterIdNFT.getTokenId(funder);
        if (funderVoterId == 0) {
            require(asset == REWARD_ASSET_USDC, "Voter ID required");
            return (0, funder, 0);
        }

        funderIdentity = voterIdNFT.getHolder(funderVoterId);
        if (funderIdentity == address(0)) {
            funderIdentity = funder;
        }
        funderNullifier = voterIdNFT.getNullifier(funderVoterId);
    }

    function _pullExactToken(address funder, uint8 asset, uint256 amount) internal returns (uint256 receivedAmount) {
        IERC20 token = _rewardToken(asset);
        uint256 balanceBefore = token.balanceOf(address(this));
        token.safeTransferFrom(funder, address(this), amount);
        receivedAmount = token.balanceOf(address(this)) - balanceBefore;
        require(receivedAmount == amount, "Bad token");
    }

    function _requireFutureBountyWindow(uint256 bountyClosesAt) internal view {
        if (bountyClosesAt != 0) {
            require(bountyClosesAt > block.timestamp, "Bad close");
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
        require(feedbackClosesAt > block.timestamp, "Bad feedback close");
        if (bountyClosesAt != 0) {
            require(feedbackClosesAt <= bountyClosesAt, "Late feedback");
        }
        return feedbackClosesAt;
    }

    function _rewardToken(uint8 asset) internal view returns (IERC20 token) {
        return asset == REWARD_ASSET_HREP ? hrepToken : usdcToken;
    }

    function _protocolTreasury() internal view returns (address treasury) {
        return votingEngine.protocolConfig().treasury();
    }

    function _requireRegistryVotingEngine() internal view {
        require(registry.votingEngine() == address(votingEngine), "Stale engine");
    }

    function _requireCurrentRegistryEscrow() internal view {
        _requireRegistryVotingEngine();
        require(registry.questionRewardPoolEscrow() == address(this), "Stale escrow");
    }

    function _getExistingRewardPool(uint256 rewardPoolId) internal view returns (RewardPool storage rewardPool) {
        rewardPool = rewardPools[rewardPoolId];
        require(rewardPool.id != 0, "Bounty not found");
    }

    function _getExistingBundleReward(uint256 bundleId) internal view returns (BundleReward storage bundle) {
        bundle = bundleRewards[bundleId];
        require(bundle.id != 0, "Bundle not found");
    }

    function _isBundleRoundSetClaimOpen(BundleReward storage bundle, uint256 bundleId, uint256 roundSetIndex)
        internal
        view
        returns (bool)
    {
        if (bundle.refunded || roundSetIndex >= bundle.requiredSettledRounds) return false;
        BundleRoundSetSnapshot storage snapshot = bundleRoundSetSnapshots[bundleId][roundSetIndex];
        return snapshot.qualified && snapshot.claimedCount < snapshot.eligibleCompleters;
    }

    function _requireBundleCleanupComplete(uint256 bundleId, uint256 completedRoundSets) internal view {
        BundleQuestion[] storage questions = bundleQuestions[bundleId];
        for (uint256 roundSetIndex = 0; roundSetIndex < completedRoundSets;) {
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

    function _bundleRoundSettledWithinWindow(BundleReward storage, uint256 contentId, uint256 roundId)
        internal
        view
        returns (bool)
    {
        (RoundLib.RoundState state, uint48 settledAt,) = _roundTerminalState(contentId, roundId);
        return state == RoundLib.RoundState.Settled && settledAt != 0;
    }

    function _roundTerminalState(uint256 contentId, uint256 roundId)
        internal
        view
        returns (RoundLib.RoundState state, uint48 settledAt, uint48 thresholdReachedAt)
    {
        (, state,,,,,,,,, settledAt, thresholdReachedAt,,) = votingEngine.rounds(contentId, roundId);
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
        uint64 bountyClosesAt = bundleRewards[bundleId].bountyClosesAt;
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
            (bool revealed, address questionFrontend) =
                _timelyRevealedCommitFrontend(question.contentId, roundId, commitKey, bountyClosesAt);
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
            if (bundleQuestionRecordedRounds[bundleId][i] <= roundSetIndex) return false;
            unchecked {
                ++i;
            }
        }
        return true;
    }

    function _qualifyBundleRoundSet(uint256 bundleId, BundleReward storage bundle, uint256 roundSetIndex) internal {
        if (bundleRoundSetSnapshots[bundleId][roundSetIndex].qualified) return;

        uint256 completerCount = _bundleRoundSetCompleterCount(bundleId, bundle, roundSetIndex);
        if (completerCount < bundle.requiredCompleters) {
            _resetBundleRoundSet(bundleId, roundSetIndex);
            return;
        }

        uint256 allocation = _previewBundleRoundSetAllocation(bundle);
        if (allocation == 0 || allocation < completerCount) {
            _resetBundleRoundSet(bundleId, roundSetIndex);
            return;
        }
        uint256 frontendFeeAllocation = (allocation * bundle.frontendFeeBps) / BPS_SCALE;

        unchecked {
            bundle.completedRoundSets++;
        }
        if (bundle.bountyOpensAt != 0) bundle.bountyOpensAt = 0;
        bundle.unallocatedAmount -= allocation;

        bundleRoundSetSnapshots[bundleId][roundSetIndex] = BundleRoundSetSnapshot({
            qualified: true,
            claimedCount: 0,
            eligibleCompleters: uint32(completerCount),
            allocation: allocation,
            frontendFeeAllocation: frontendFeeAllocation
        });
        emit QuestionBundleRoundSetQualified(bundleId, roundSetIndex, allocation, frontendFeeAllocation);
    }

    function _requireBundleFundingCoversMaxCompleters(
        uint256[] calldata contentIds,
        uint256 amount,
        uint256 requiredSettledRounds
    ) internal view {
        uint256 maxRoundVoters;
        for (uint256 i = 0; i < contentIds.length;) {
            RoundLib.RoundConfig memory cfg = registry.getContentRoundConfig(contentIds[i]);
            if (cfg.maxVoters > maxRoundVoters) {
                maxRoundVoters = cfg.maxVoters;
            }
            unchecked {
                ++i;
            }
        }
        require(amount >= maxRoundVoters * requiredSettledRounds, "Amount too small");
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
        for (uint256 i = 0; i < commitCount;) {
            bytes32 commitKey = votingEngine.getRoundCommitKey(firstContentId, firstRoundId, i);
            uint256 voterId = votingEngine.commitVoterId(firstContentId, firstRoundId, commitKey);
            address voter = firstRoundVoterIdNft.getHolder(voterId);
            if (voter == address(0)) {
                uint256 nullifier = firstRoundVoterIdNft.getNullifier(voterId);
                voter = firstRoundVoterIdNft.getHolder(firstRoundVoterIdNft.getTokenIdForNullifier(nullifier));
            }
            if (
                voter != address(0) && !_isBundleExcludedVoter(bundle, bundleId, roundSetIndex, voter)
                    && _completedBundleRoundSetCommitIgnoringCleanup(bundleId, roundSetIndex, voter)
            ) {
                unchecked {
                    completerCount++;
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
        uint64 bountyClosesAt = bundleRewards[bundleId].bountyClosesAt;
        for (uint256 i = 0; i < questions.length;) {
            BundleQuestion storage question = questions[i];
            uint256 roundId = bundleRoundIds[bundleId][i][roundSetIndex];
            uint256 voterId = _voterIdForRound(question.contentId, roundId, account);
            if (voterId == 0) return false;
            bytes32 commitKey =
                _commitKeyForVoter(question.contentId, roundId, _roundVoterIdNft(question.contentId, roundId), voterId);
            if (commitKey == bytes32(0)) return false;
            (bool revealed,) = _timelyRevealedCommitFrontend(question.contentId, roundId, commitKey, bountyClosesAt);
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
            uint256 recordedRounds = bundleQuestionRecordedRounds[bundleId][i];
            for (uint256 j = roundSetIndex + 1; j < recordedRounds;) {
                delete bundleRoundIds[bundleId][i][j];
                unchecked {
                    ++j;
                }
            }
            bundleQuestionRecordedRounds[bundleId][i] = uint32(roundSetIndex);
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
        if (account == bundle.funder || account == bundle.funderIdentity) {
            return true;
        }
        BundleQuestion[] storage questions = bundleQuestions[bundleId];
        for (uint256 i = 0; i < questions.length;) {
            BundleQuestion storage question = questions[i];
            uint256 roundId = bundleRoundIds[bundleId][i][roundSetIndex];
            if (account == registry.getSubmitterIdentity(question.contentId)) {
                return true;
            }
            if (QuestionRewardPoolEscrowQualificationLib.isBundleExcludedVoter(
                    _roundVoterIdNft(question.contentId, roundId),
                    account,
                    bundle.funder,
                    bundle.funderNullifier,
                    question.submitterNullifier
                )) {
                return true;
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
        require(!rewardPool.unallocatedRefunded, "Bounty refunded");
        require(rewardPool.qualifiedRounds < rewardPool.requiredSettledRounds, "Bounty complete");
    }

    function _qualifyRound(uint256 rewardPoolId, RewardPool storage rewardPool, uint256 roundId) internal {
        require(roundId >= rewardPool.startRoundId, "Round too early");
        require(!roundSnapshots[rewardPoolId][roundId].qualified, "Round qualified");
        require(roundId == rewardPool.nextRoundToEvaluate, "Round out of order");

        (bool roundSettled, bool canQualify, uint256 eligibleVoters, uint48 settledAt) =
            _previewRoundQualification(rewardPool, roundId);
        require(roundSettled, "Round not settled");
        require(canQualify, "Too few eligible voters");
        require(votingEngine.roundUnrevealedCleanupRemaining(rewardPool.contentId, roundId) == 0, "Cleanup pending");

        uint256 allocation = _previewRoundAllocation(rewardPool);
        require(allocation > 0 && allocation <= rewardPool.unallocatedAmount, "No allocation");
        require(allocation >= eligibleVoters, "Small allocation");
        uint256 frontendFeeAllocation = (allocation * rewardPool.frontendFeeBps) / BPS_SCALE;

        unchecked {
            rewardPool.qualifiedRounds++;
        }
        uint256 claimDeadline = block.timestamp > settledAt ? block.timestamp : settledAt;
        if (claimDeadline > rewardPool.claimDeadline) {
            rewardPool.claimDeadline = uint64(claimDeadline);
        }
        rewardPool.nextRoundToEvaluate = uint64(roundId + 1);
        rewardPool.unallocatedAmount -= allocation;

        roundSnapshots[rewardPoolId][roundId] = RoundSnapshot({
            qualified: true,
            eligibleVoters: uint32(eligibleVoters),
            allocation: allocation,
            claimedCount: 0,
            frontendFeeAllocation: frontendFeeAllocation
        });

        emit RewardPoolRoundQualified(
            rewardPoolId, rewardPool.contentId, roundId, allocation, eligibleVoters, frontendFeeAllocation
        );
    }

    function _canPreviewNewQualification(RewardPool storage rewardPool, uint256 roundId) internal view returns (bool) {
        if (
            rewardPool.refunded || rewardPool.unallocatedRefunded
                || rewardPool.qualifiedRounds >= rewardPool.requiredSettledRounds
        ) return false;
        return roundId >= rewardPool.startRoundId && roundId == rewardPool.nextRoundToEvaluate;
    }

    function _previewRoundQualification(RewardPool storage rewardPool, uint256 roundId)
        internal
        view
        returns (bool roundSettled, bool canQualify, uint256 eligibleVoters, uint48 settledAt)
    {
        return QuestionRewardPoolEscrowQualificationLib.previewRoundQualification(
            QuestionRewardPoolEscrowQualificationLib.QualificationContext({
                votingEngine: votingEngine,
                voterIdNft: _roundVoterIdNft(rewardPool.contentId, roundId),
                contentId: rewardPool.contentId,
                roundId: roundId,
                bountyClosesAt: rewardPool.bountyClosesAt,
                requiredVoters: rewardPool.requiredVoters,
                funder: rewardPool.funder,
                // Use payer identity for exclusion checks so gateway-mediated payments
                // (e.g. X402) correctly exclude the actual human payer, not the gateway contract.
                funderIdentity: rewardPoolPayerIdentity[rewardPool.id],
                funderNullifier: rewardPoolPayerNullifier[rewardPool.id],
                submitterIdentity: rewardPool.submitterIdentity,
                submitterNullifier: rewardPoolSubmitterNullifier[rewardPool.id]
            })
        );
    }

    function _roundQualificationStatus(RewardPool storage rewardPool, uint256 roundId)
        internal
        view
        returns (bool roundFinished, bool canQualify, uint256 eligibleVoters)
    {
        (, RoundLib.RoundState state,,,,,,,,,,,,) = votingEngine.rounds(rewardPool.contentId, roundId);
        if (state == RoundLib.RoundState.Open) return (false, false, 0);
        if (state != RoundLib.RoundState.Settled) return (true, false, 0);

        (, canQualify, eligibleVoters,) = _previewRoundQualification(rewardPool, roundId);
        if (canQualify) canQualify = _previewRoundAllocation(rewardPool) >= eligibleVoters;
        return (true, canQualify, eligibleVoters);
    }

    function _requireNoPendingFinishedRound(RewardPool storage rewardPool) internal view {
        uint256 nextRoundToEvaluate = rewardPool.nextRoundToEvaluate;
        QuestionRewardPoolEscrowQualificationLib.requireNoPendingFinishedRound(
            votingEngine, rewardPool.contentId, nextRoundToEvaluate, rewardPool.bountyClosesAt
        );
    }

    function _previewRoundAllocation(RewardPool storage rewardPool) internal view returns (uint256 allocation) {
        if (rewardPool.qualifiedRounds >= rewardPool.requiredSettledRounds) return 0;
        uint256 remainingRounds = uint256(rewardPool.requiredSettledRounds) - rewardPool.qualifiedRounds;
        allocation = remainingRounds == 1
            ? rewardPool.unallocatedAmount
            : rewardPool.fundedAmount / rewardPool.requiredSettledRounds;
        if (allocation > rewardPool.unallocatedAmount) return 0;
    }

    function _timelyRevealedCommitFrontend(uint256 contentId, uint256 roundId, bytes32 commitKey, uint64 closesAt)
        internal
        view
        returns (bool revealed, address frontend)
    {
        // Use the narrow commitCore getter -- this helper is called inside claim/bundle
        // iteration loops, and materializing the full 2 KB ciphertext on every read
        // blows out memory expansion at bounds-limit maxVoters.
        (address voter,, address commitFrontend, uint48 commitRevealedAt, bool commitRevealed,,) =
            votingEngine.commitCore(contentId, roundId, commitKey);
        return (
            voter != address(0) && commitRevealed && (closesAt == 0 || commitRevealedAt <= closesAt), commitFrontend
        );
    }

    function _isExcludedVoter(RewardPool storage rewardPool, uint256 roundId, uint256 voterId)
        internal
        view
        returns (bool)
    {
        return QuestionRewardPoolEscrowQualificationLib.isExcludedVoter(
            _roundVoterIdNft(rewardPool.contentId, roundId),
            voterId,
            rewardPool.funder,
            // Use payer identity for exclusion checks so gateway-mediated payments
            // (e.g. X402) correctly exclude the actual human payer, not the gateway contract.
            rewardPoolPayerIdentity[rewardPool.id],
            rewardPoolPayerNullifier[rewardPool.id],
            rewardPool.submitterIdentity,
            rewardPoolSubmitterNullifier[rewardPool.id]
        );
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
