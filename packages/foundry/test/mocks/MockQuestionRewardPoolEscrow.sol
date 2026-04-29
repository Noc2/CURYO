// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IRegistryVotingEngine {
    function votingEngine() external view returns (address);
}

contract MockQuestionRewardPoolEscrow {
    uint256 public nextRewardPoolId = 1;
    address public registryOverride;
    address public votingEngineOverride;
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

    event MockSubmissionBundleCreated(
        uint256 indexed rewardPoolId,
        uint256 indexed bundleId,
        address funder,
        uint256 requiredCompleters,
        uint256 requiredSettledRounds,
        uint256 bountyClosesAt,
        uint256 feedbackClosesAt
    );

    function setWiring(address registry_, address votingEngine_) external {
        registryOverride = registry_;
        votingEngineOverride = votingEngine_;
    }

    function getWiring() external view returns (address, address, address registry_, address votingEngine_, address) {
        registry_ = registryOverride == address(0) ? msg.sender : registryOverride;
        votingEngine_ = votingEngineOverride == address(0)
            ? IRegistryVotingEngine(msg.sender).votingEngine()
            : votingEngineOverride;
        return (address(0), address(0), registry_, votingEngine_, address(0));
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

    function createSubmissionBundleFromRegistry(
        uint256 bundleId,
        uint256[] calldata,
        address funder,
        uint8 asset,
        uint256 amount,
        uint256 requiredCompleters,
        uint256 requiredSettledRounds,
        uint256 bountyClosesAt,
        uint256 feedbackClosesAt
    ) external returns (uint256 rewardPoolId) {
        rewardPoolId = nextRewardPoolId++;
        lastContentId = bundleId;
        lastFunder = funder;
        lastAsset = asset;
        lastAmount = amount;
        lastRequiredVoters = requiredCompleters;
        lastRequiredSettledRounds = requiredSettledRounds;
        lastBountyClosesAt = bountyClosesAt;
        lastFeedbackClosesAt = feedbackClosesAt;
        emit MockSubmissionBundleCreated(
            rewardPoolId, bundleId, funder, requiredCompleters, requiredSettledRounds, bountyClosesAt, feedbackClosesAt
        );
    }
}
