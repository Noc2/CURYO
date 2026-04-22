// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockQuestionRewardPoolEscrow {
    uint256 public nextRewardPoolId = 1;
    uint256 public lastContentId;
    address public lastFunder;
    uint8 public lastAsset;
    uint256 public lastAmount;
    uint256 public lastRequiredVoters;
    uint256 public lastRequiredSettledRounds;
    uint256 public lastBountyClosesAt;
    uint256 public lastFeedbackClosesAt;

    event MockSubmissionRewardPoolCreated(
        uint256 indexed rewardPoolId,
        uint256 indexed contentId,
        address funder,
        uint256 requiredVoters,
        uint256 requiredSettledRounds,
        uint256 bountyClosesAt,
        uint256 feedbackClosesAt
    );

    function createSubmissionRewardPoolFromRegistry(
        uint256 contentId,
        address funder,
        uint8 asset,
        uint256 amount,
        uint256 requiredVoters,
        uint256 requiredSettledRounds,
        uint256 bountyClosesAt,
        uint256 feedbackClosesAt
    ) external returns (uint256 rewardPoolId) {
        rewardPoolId = nextRewardPoolId++;
        lastContentId = contentId;
        lastFunder = funder;
        lastAsset = asset;
        lastAmount = amount;
        lastRequiredVoters = requiredVoters;
        lastRequiredSettledRounds = requiredSettledRounds;
        lastBountyClosesAt = bountyClosesAt;
        lastFeedbackClosesAt = feedbackClosesAt;
        emit MockSubmissionRewardPoolCreated(
            rewardPoolId, contentId, funder, requiredVoters, requiredSettledRounds, bountyClosesAt, feedbackClosesAt
        );
    }
}
