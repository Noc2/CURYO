// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract MockQuestionRewardPoolEscrow {
    uint256 public nextRewardPoolId = 1;

    event MockSubmissionRewardPoolCreated(uint256 indexed rewardPoolId, uint256 indexed contentId, address funder);

    function createSubmissionRewardPoolFromRegistry(uint256 contentId, address funder, uint8, uint256)
        external
        returns (uint256 rewardPoolId)
    {
        rewardPoolId = nextRewardPoolId++;
        emit MockSubmissionRewardPoolCreated(rewardPoolId, contentId, funder);
    }
}
