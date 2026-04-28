// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ContentRegistry} from "./ContentRegistry.sol";
import {RoundLib} from "./libraries/RoundLib.sol";

struct Eip3009Authorization {
    address from;
    address to;
    uint256 value;
    uint256 validAfter;
    uint256 validBefore;
    bytes32 nonce;
    bytes signature;
}

interface IReceiveWithAuthorizationToken {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        bytes calldata signature
    ) external;
}

contract X402QuestionSubmitter {
    using SafeERC20 for IERC20;

    uint8 internal constant REWARD_ASSET_USDC = 1;

    ContentRegistry public immutable registry;
    IERC20 public immutable usdcToken;
    address public immutable questionRewardPoolEscrow;

    event X402QuestionSubmitted(
        uint256 indexed contentId, address indexed submitter, bytes32 indexed paymentNonce, uint256 amount
    );

    constructor(ContentRegistry _registry, address _usdcToken, address _questionRewardPoolEscrow) {
        require(address(_registry) != address(0), "Invalid registry");
        require(_usdcToken != address(0), "Invalid USDC");
        require(_questionRewardPoolEscrow != address(0), "Invalid escrow");
        registry = _registry;
        usdcToken = IERC20(_usdcToken);
        questionRewardPoolEscrow = _questionRewardPoolEscrow;
    }

    function submitQuestionWithX402Payment(
        string memory contextUrl,
        string[] memory imageUrls,
        string memory videoUrl,
        string memory title,
        string memory description,
        string memory tags,
        uint256 categoryId,
        bytes32 salt,
        ContentRegistry.SubmissionRewardTerms memory rewardTerms,
        RoundLib.RoundConfig memory roundConfig,
        ContentRegistry.QuestionSpecCommitment memory spec,
        Eip3009Authorization calldata paymentAuthorization
    ) external returns (uint256 contentId) {
        require(rewardTerms.asset == REWARD_ASSET_USDC, "USDC required");
        require(paymentAuthorization.from != address(0), "Invalid payer");
        require(paymentAuthorization.to == address(this), "Bad payee");
        require(paymentAuthorization.value == rewardTerms.amount, "Bad amount");
        require(
            paymentAuthorization.nonce
                == computeX402QuestionPaymentNonce(
                    ContentRegistry.SubmissionMetadata({
                        url: contextUrl, title: title, description: description, tags: tags, categoryId: categoryId
                    }),
                    imageUrls,
                    videoUrl,
                    salt,
                    rewardTerms,
                    roundConfig,
                    spec,
                    paymentAuthorization.from,
                    paymentAuthorization.to,
                    paymentAuthorization.value,
                    paymentAuthorization.validAfter,
                    paymentAuthorization.validBefore
                ),
            "Bad nonce"
        );

        IReceiveWithAuthorizationToken(address(usdcToken))
            .receiveWithAuthorization(
                paymentAuthorization.from,
                paymentAuthorization.to,
                paymentAuthorization.value,
                paymentAuthorization.validAfter,
                paymentAuthorization.validBefore,
                paymentAuthorization.nonce,
                paymentAuthorization.signature
            );
        usdcToken.forceApprove(questionRewardPoolEscrow, paymentAuthorization.value);

        contentId = registry.submitQuestionFromX402Gateway(
            contextUrl,
            imageUrls,
            videoUrl,
            title,
            description,
            tags,
            categoryId,
            salt,
            rewardTerms,
            roundConfig,
            spec,
            paymentAuthorization.from
        );

        emit X402QuestionSubmitted(
            contentId, paymentAuthorization.from, paymentAuthorization.nonce, paymentAuthorization.value
        );
    }

    function computeX402QuestionPaymentNonce(
        ContentRegistry.SubmissionMetadata memory metadata,
        string[] memory imageUrls,
        string memory videoUrl,
        bytes32 salt,
        ContentRegistry.SubmissionRewardTerms memory rewardTerms,
        RoundLib.RoundConfig memory roundConfig,
        ContentRegistry.QuestionSpecCommitment memory spec,
        address payer,
        address payee,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                "curyo-x402-question-payment-v1",
                block.chainid,
                address(registry),
                questionRewardPoolEscrow,
                address(this),
                payer,
                payee,
                value,
                validAfter,
                validBefore,
                metadata.url,
                imageUrls,
                videoUrl,
                metadata.title,
                metadata.description,
                metadata.tags,
                metadata.categoryId,
                salt,
                rewardTerms.asset,
                rewardTerms.amount,
                rewardTerms.requiredVoters,
                rewardTerms.requiredSettledRounds,
                rewardTerms.bountyClosesAt,
                rewardTerms.feedbackClosesAt,
                roundConfig.epochDuration,
                roundConfig.maxDuration,
                roundConfig.minVoters,
                roundConfig.maxVoters,
                spec.questionMetadataHash,
                spec.resultSpecHash
            )
        );
    }
}
