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
import { TokenTransferLib } from "./libraries/TokenTransferLib.sol";

/// @title FeedbackBonusEscrow
/// @notice Holds optional USDC bonuses for useful voter feedback and pays awarded feedback hashes after a round ends.
contract FeedbackBonusEscrow is Initializable, AccessControlUpgradeable, PausableUpgradeable, ReentrancyGuardTransient {
    using SafeERC20 for IERC20;
    using SafeCast for uint256;

    bytes32 public constant CONFIG_ROLE = keccak256("CONFIG_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint256 public constant BPS_SCALE = 10_000;
    uint256 public constant DEFAULT_FRONTEND_FEE_BPS = 300;
    uint256 public constant MAX_FRONTEND_FEE_BPS = 500;

    struct FeedbackBonusPool {
        uint64 id;
        uint64 contentId;
        uint64 roundId;
        uint48 feedbackClosesAt;
        address funder;
        address funderIdentity;
        address awarder;
        uint256 funderVoterId;
        address submitterIdentity;
        uint256 submitterVoterId;
        address voterIdNFTSnapshot;
        uint256 fundedAmount;
        uint256 remainingAmount;
        bool forfeited;
        uint16 frontendFeeBps;
    }

    IERC20 public usdcToken;
    ContentRegistry public registry;
    RoundVotingEngine public votingEngine;
    IVoterIdNFT public voterIdNFT;
    uint256 public nextFeedbackBonusPoolId;
    uint16 public defaultFrontendFeeBps;

    mapping(uint256 => FeedbackBonusPool) public feedbackBonusPools;
    mapping(uint256 => uint256) private poolFunderNullifier;
    mapping(uint256 => uint256) private poolSubmitterNullifier;
    mapping(uint256 => mapping(uint256 => bool)) public voterIdAwarded;
    mapping(uint256 => mapping(bytes32 => bool)) public feedbackHashAwarded;

    event FeedbackBonusPoolCreated(
        uint256 indexed poolId,
        uint256 indexed contentId,
        uint256 indexed roundId,
        address funder,
        address awarder,
        uint256 amount,
        uint256 feedbackClosesAt,
        uint256 frontendFeeBps
    );
    event FeedbackWindowCreated(
        uint256 indexed poolId, uint256 indexed contentId, uint256 indexed roundId, uint256 feedbackClosesAt
    );
    event FeedbackBonusAwarded(
        uint256 indexed poolId,
        uint256 indexed contentId,
        uint256 indexed roundId,
        address recipient,
        uint256 voterId,
        bytes32 feedbackHash,
        uint256 grossAmount,
        uint256 recipientAmount,
        address frontend,
        address frontendRecipient,
        uint256 frontendFee
    );
    event FeedbackBonusForfeited(uint256 indexed poolId, address indexed treasury, uint256 amount);
    event DefaultFrontendFeeBpsUpdated(uint256 previousFrontendFeeBps, uint256 newFrontendFeeBps);
    event VoterIdNFTUpdated(address voterIdNFT);
    event VotingEngineUpdated(address votingEngine);

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
        nextFeedbackBonusPoolId = 1;
        defaultFrontendFeeBps = DEFAULT_FRONTEND_FEE_BPS.toUint16();
    }

    function createFeedbackBonusPool(
        uint256 contentId,
        uint256 roundId,
        uint256 amount,
        uint256 feedbackClosesAt,
        address awarder
    ) external nonReentrant whenNotPaused returns (uint256 poolId) {
        require(amount > 0, "Amount required");
        require(roundId > 0, "Round required");
        require(awarder != address(0), "Invalid awarder");
        require(feedbackClosesAt > block.timestamp, "Invalid feedback close");
        require(registry.isContentActive(contentId), "Content not active");
        _requireTargetRound(contentId, roundId);

        uint256 receivedAmount = _pullUsdc(msg.sender, amount);
        uint256 funderVoterId = voterIdNFT.getTokenId(msg.sender);
        require(funderVoterId != 0, "Voter ID required");
        uint256 funderNullifier = voterIdNFT.getNullifier(funderVoterId);
        address funderIdentity = voterIdNFT.getHolder(funderVoterId);
        if (funderIdentity == address(0)) {
            funderIdentity = msg.sender;
        }
        address submitterIdentity = registry.getSubmitterIdentity(contentId);
        uint256 submitterVoterId = submitterIdentity == address(0) ? 0 : voterIdNFT.getTokenId(submitterIdentity);
        uint256 submitterNullifier = submitterVoterId == 0 ? 0 : voterIdNFT.getNullifier(submitterVoterId);

        poolId = nextFeedbackBonusPoolId++;
        feedbackBonusPools[poolId] = FeedbackBonusPool({
            id: poolId.toUint64(),
            contentId: contentId.toUint64(),
            roundId: roundId.toUint64(),
            feedbackClosesAt: feedbackClosesAt.toUint48(),
            funder: msg.sender,
            funderIdentity: funderIdentity,
            awarder: awarder,
            funderVoterId: funderVoterId,
            submitterIdentity: submitterIdentity,
            submitterVoterId: submitterVoterId,
            voterIdNFTSnapshot: address(voterIdNFT),
            fundedAmount: receivedAmount,
            remainingAmount: receivedAmount,
            forfeited: false,
            frontendFeeBps: defaultFrontendFeeBps
        });
        poolFunderNullifier[poolId] = funderNullifier;
        poolSubmitterNullifier[poolId] = submitterNullifier;

        emit FeedbackBonusPoolCreated(
            poolId, contentId, roundId, msg.sender, awarder, receivedAmount, feedbackClosesAt, defaultFrontendFeeBps
        );
        emit FeedbackWindowCreated(poolId, contentId, roundId, feedbackClosesAt);
    }

    function awardFeedbackBonus(uint256 poolId, address recipient, bytes32 feedbackHash, uint256 grossAmount)
        external
        nonReentrant
        whenNotPaused
        returns (uint256 recipientAmount)
    {
        FeedbackBonusPool storage pool = _getExistingPool(poolId);
        require(msg.sender == pool.awarder, "Only awarder");
        require(!pool.forfeited, "Pool forfeited");
        require(block.timestamp <= pool.feedbackClosesAt, "Feedback closed");
        require(feedbackHash != bytes32(0), "Feedback hash required");
        require(grossAmount > 0 && grossAmount <= pool.remainingAmount, "Invalid amount");
        require(!feedbackHashAwarded[poolId][feedbackHash], "Feedback already awarded");

        (uint256 voterId, address rewardRecipient, bytes32 commitKey, address frontend) =
            _requireRevealedIndependentVoter(pool, recipient);
        uint256 awardVoterId = votingEngine.commitVoterId(pool.contentId, pool.roundId, commitKey);
        if (awardVoterId == 0) awardVoterId = voterId;
        require(!voterIdAwarded[poolId][voterId] && !voterIdAwarded[poolId][awardVoterId], "Voter already awarded");

        uint256 frontendFee;
        address frontendRecipient;
        (recipientAmount, frontendFee, frontendRecipient) = _splitAward(pool, commitKey, frontend, grossAmount);

        pool.remainingAmount -= grossAmount;
        voterIdAwarded[poolId][awardVoterId] = true;
        if (awardVoterId != voterId) voterIdAwarded[poolId][voterId] = true;
        feedbackHashAwarded[poolId][feedbackHash] = true;

        uint256 paidFrontendFee = _routeFrontendFee(usdcToken, frontendRecipient, frontendFee);
        if (paidFrontendFee != frontendFee) {
            recipientAmount += frontendFee;
            frontendFee = 0;
            frontendRecipient = address(0);
        }
        if (recipientAmount > 0) {
            usdcToken.safeTransfer(rewardRecipient, recipientAmount);
        }

        emit FeedbackBonusAwarded(
            poolId,
            pool.contentId,
            pool.roundId,
            rewardRecipient,
            voterId,
            feedbackHash,
            grossAmount,
            recipientAmount,
            frontend,
            frontendRecipient,
            frontendFee
        );
    }

    function forfeitExpiredFeedbackBonus(uint256 poolId) external nonReentrant returns (uint256 forfeitedAmount) {
        FeedbackBonusPool storage pool = _getExistingPool(poolId);
        require(!pool.forfeited, "Already forfeited");
        require(block.timestamp > pool.feedbackClosesAt, "Not expired");
        forfeitedAmount = pool.remainingAmount;
        require(forfeitedAmount > 0, "No funds");

        pool.forfeited = true;
        pool.remainingAmount = 0;

        address treasury = _protocolTreasury();
        require(treasury != address(0), "Treasury not set");
        usdcToken.safeTransfer(treasury, forfeitedAmount);
        emit FeedbackBonusForfeited(poolId, treasury, forfeitedAmount);
    }

    function setVoterIdNFT(address voterIdNFT_) external onlyRole(CONFIG_ROLE) {
        require(voterIdNFT_ != address(0), "Invalid Voter ID");
        voterIdNFT = IVoterIdNFT(voterIdNFT_);
        emit VoterIdNFTUpdated(voterIdNFT_);
    }

    function setVotingEngine(address) external view onlyRole(CONFIG_ROLE) {
        revert("Invalid engine");
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

    function _pullUsdc(address funder, uint256 amount) internal returns (uint256 receivedAmount) {
        uint256 balanceBefore = usdcToken.balanceOf(address(this));
        usdcToken.safeTransferFrom(funder, address(this), amount);
        receivedAmount = usdcToken.balanceOf(address(this)) - balanceBefore;
        require(receivedAmount == amount, "Fee token unsupported");
    }

    function _requireTargetRound(uint256 contentId, uint256 roundId) internal view {
        uint256 currentRoundId = votingEngine.currentRoundId(contentId);
        if (currentRoundId == 0) {
            require(roundId == 1, "Invalid target round");
            return;
        }

        require(roundId == currentRoundId, "Invalid target round");
        (, RoundLib.RoundState state,,,,,,,,,,,,) = votingEngine.rounds(contentId, roundId);
        require(state == RoundLib.RoundState.Open, "Round not open");
    }

    function _requireRevealedIndependentVoter(FeedbackBonusPool storage pool, address recipient)
        internal
        view
        returns (uint256 voterId, address rewardRecipient, bytes32 commitKey, address frontend)
    {
        require(recipient != address(0), "Invalid recipient");
        (, RoundLib.RoundState state,,,,,,,,,,,,) = votingEngine.rounds(pool.contentId, pool.roundId);
        require(
            state == RoundLib.RoundState.Settled || state == RoundLib.RoundState.Tied
                || state == RoundLib.RoundState.RevealFailed,
            "Round not settled"
        );

        IVoterIdNFT roundVoterIdNft = _roundVoterIdNft(pool.contentId, pool.roundId);
        voterId = roundVoterIdNft.getTokenId(recipient);
        require(voterId != 0, "Voter ID required");
        rewardRecipient = roundVoterIdNft.getHolder(voterId);
        require(!_isExcludedVoter(pool, voterId), "Excluded voter");

        commitKey = _commitKeyForVoter(pool.contentId, pool.roundId, roundVoterIdNft, voterId);
        require(commitKey != bytes32(0), "No commit");

        (address voter,, address commitFrontend,, bool revealed,,) =
            votingEngine.commitCore(pool.contentId, pool.roundId, commitKey);
        frontend = commitFrontend;
        require(voter != address(0) && revealed, "Vote not revealed");
    }

    function _isExcludedVoter(FeedbackBonusPool storage pool, uint256 voterId) internal view returns (bool) {
        if (voterId == 0) return true;
        uint256 voterNullifier = _roundVoterIdNft(pool.contentId, pool.roundId).getNullifier(voterId);
        if (
            voterNullifier != 0
                && (voterNullifier == poolFunderNullifier[pool.id] || voterNullifier == poolSubmitterNullifier[pool.id])
        ) {
            return true;
        }
        if (
            pool.voterIdNFTSnapshot == address(_roundVoterIdNft(pool.contentId, pool.roundId))
                && (voterId == pool.funderVoterId || voterId == pool.submitterVoterId)
        ) {
            return true;
        }
        if (voterId == _voterIdForRound(pool.contentId, pool.roundId, pool.funder)) return true;
        if (
            pool.funderIdentity != address(0)
                && voterId == _voterIdForRound(pool.contentId, pool.roundId, pool.funderIdentity)
        ) {
            return true;
        }
        if (
            pool.submitterIdentity != address(0)
                && voterId == _voterIdForRound(pool.contentId, pool.roundId, pool.submitterIdentity)
        ) {
            return true;
        }

        address currentSubmitterIdentity = registry.getSubmitterIdentity(pool.contentId);
        return currentSubmitterIdentity != address(0)
            && voterId == _voterIdForRound(pool.contentId, pool.roundId, currentSubmitterIdentity);
    }

    function _splitAward(FeedbackBonusPool storage pool, bytes32 commitKey, address frontend, uint256 grossAmount)
        internal
        view
        returns (uint256 recipientAmount, uint256 frontendFee, address frontendRecipient)
    {
        recipientAmount = grossAmount;
        if (pool.frontendFeeBps == 0 || frontend == address(0)) {
            return (recipientAmount, 0, address(0));
        }

        frontendFee = (grossAmount * pool.frontendFeeBps) / BPS_SCALE;
        if (frontendFee == 0 || frontendFee > grossAmount) {
            return (recipientAmount, 0, address(0));
        }

        frontendRecipient = _resolveFrontendRewardRecipient(pool.contentId, pool.roundId, commitKey, frontend);
        if (frontendRecipient == address(0)) {
            return (recipientAmount, 0, address(0));
        }

        recipientAmount = grossAmount - frontendFee;
    }

    function _resolveFrontendRewardRecipient(uint256 contentId, uint256 roundId, bytes32 commitKey, address frontend)
        internal
        view
        returns (address frontendRecipient)
    {
        if (!votingEngine.frontendEligibleAtCommit(contentId, roundId, commitKey)) {
            return address(0);
        }

        address frontendRegistry = votingEngine.roundFrontendRegistrySnapshot(contentId, roundId);
        if (frontendRegistry == address(0)) {
            return address(0);
        }

        try IFrontendRegistry(frontendRegistry).getFrontendInfo(frontend) returns (
            address operator, uint256 stakedAmount, bool eligible, bool slashed
        ) {
            stakedAmount;
            bool canReceiveHistorically = eligible || _canReceiveHistoricalFees(frontendRegistry, frontend);
            if (operator != address(0) && !slashed && canReceiveHistorically) {
                frontendRecipient = operator;
            }
        } catch {
            return address(0);
        }
    }

    function _canReceiveHistoricalFees(address frontendRegistry, address frontend) internal view returns (bool) {
        try IFrontendRegistry(frontendRegistry).canReceiveHistoricalFees(frontend) returns (bool canReceive) {
            return canReceive;
        } catch {
            return false;
        }
    }

    function _routeFrontendFee(IERC20 token, address frontendRecipient, uint256 amount)
        internal
        returns (uint256 paidAmount)
    {
        if (amount == 0 || frontendRecipient == address(0)) return 0;
        return TokenTransferLib.tryTransfer(token, frontendRecipient, amount) ? amount : 0;
    }

    function _roundVoterIdNft(uint256 contentId, uint256 roundId) internal view returns (IVoterIdNFT) {
        address snapshot = votingEngine.roundVoterIdNFTSnapshot(contentId, roundId);
        return IVoterIdNFT(snapshot == address(0) ? address(voterIdNFT) : snapshot);
    }

    function _voterIdForRound(uint256 contentId, uint256 roundId, address account) internal view returns (uint256) {
        if (account == address(0)) return 0;
        return _roundVoterIdNft(contentId, roundId).getTokenId(account);
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

    function _protocolTreasury() internal view returns (address treasury) {
        ProtocolConfig cfg = votingEngine.protocolConfig();
        if (address(cfg) != address(0)) {
            treasury = cfg.treasury();
        }
    }

    function _getExistingPool(uint256 poolId) internal view returns (FeedbackBonusPool storage pool) {
        pool = feedbackBonusPools[poolId];
        require(pool.id != 0, "Bonus not found");
    }
}
