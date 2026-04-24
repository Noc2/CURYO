export const ContentRegistryAbi = [
  {
    "type": "constructor",
    "inputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "CONFIG_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "DEFAULT_ADMIN_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_DESCRIPTION_LENGTH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_QUESTION_BUNDLE_COUNT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "MAX_QUESTION_LENGTH",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "PAUSER_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "SLASH_RATING_THRESHOLD",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "TREASURY_ADMIN_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "TREASURY_ROLE",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "bonusPool",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "cancelContent",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "cancelReservedSubmission",
    "inputs": [
      {
        "name": "revealCommitment",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "categoryRegistry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ICategoryRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "clearExpiredReservedSubmission",
    "inputs": [
      {
        "name": "revealCommitment",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "contentBundleId",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "contentBundleIndex",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "contentRoundConfig",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "epochDuration",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "maxDuration",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "minVoters",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "maxVoters",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "contentSlashConfigSnapshot",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "slashThresholdBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "minSlashSettledRounds",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "minSlashLowDuration",
        "type": "uint48",
        "internalType": "uint48"
      },
      {
        "name": "minSlashEvidence",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "contents",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "id",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "contentHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "submitter",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "createdAt",
        "type": "uint48",
        "internalType": "uint48"
      },
      {
        "name": "lastActivityAt",
        "type": "uint48",
        "internalType": "uint48"
      },
      {
        "name": "status",
        "type": "uint8",
        "internalType": "enum ContentRegistry.ContentStatus"
      },
      {
        "name": "dormantCount",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "reviver",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "rating",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "categoryId",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "hrepToken",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IERC20"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "dormantKeyReleasableAt",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getConservativeRating",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getContentRoundConfig",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "cfg",
        "type": "tuple",
        "internalType": "struct RoundLib.RoundConfig",
        "components": [
          {
            "name": "epochDuration",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "maxDuration",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "minVoters",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "maxVoters",
            "type": "uint16",
            "internalType": "uint16"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getContentSubmitter",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getQuestionBundleContentIds",
    "inputs": [
      {
        "name": "bundleId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRating",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRatingState",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "state",
        "type": "tuple",
        "internalType": "struct RatingLib.RatingState",
        "components": [
          {
            "name": "ratingLogitX18",
            "type": "int128",
            "internalType": "int128"
          },
          {
            "name": "confidenceMass",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "effectiveEvidence",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "settledRounds",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "ratingBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "conservativeRatingBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "lastUpdatedAt",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "lowSince",
            "type": "uint48",
            "internalType": "uint48"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getRoleAdmin",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getSlashConfigForContent",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "slashConfig",
        "type": "tuple",
        "internalType": "struct RatingLib.SlashConfig",
        "components": [
          {
            "name": "slashThresholdBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "minSlashSettledRounds",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "minSlashLowDuration",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "minSlashEvidence",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "getSubmitterIdentity",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "grantRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "hasRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "initialize",
    "inputs": [
      {
        "name": "_admin",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_governance",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_hrepToken",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "initializeWithTreasury",
    "inputs": [
      {
        "name": "_admin",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_governance",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_treasuryAuthority",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_hrepToken",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "isContentActive",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "isDormancyEligible",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "markDormant",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "nextContentId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "nextQuestionBundleId",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pause",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "paused",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "pendingSubmissions",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "submitter",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "reservedAt",
        "type": "uint48",
        "internalType": "uint48"
      },
      {
        "name": "expiresAt",
        "type": "uint48",
        "internalType": "uint48"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "previewQuestionSubmissionKey",
    "inputs": [
      {
        "name": "contextUrl",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "imageUrls",
        "type": "string[]",
        "internalType": "string[]"
      },
      {
        "name": "videoUrl",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "title",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "description",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "tags",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "categoryId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "resolvedCategoryId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "submissionKey",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "protocolConfig",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ProtocolConfig"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "questionRewardPoolEscrow",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "ratingState",
    "inputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "ratingLogitX18",
        "type": "int128",
        "internalType": "int128"
      },
      {
        "name": "confidenceMass",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "effectiveEvidence",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "settledRounds",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "ratingBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "conservativeRatingBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "lastUpdatedAt",
        "type": "uint48",
        "internalType": "uint48"
      },
      {
        "name": "lowSince",
        "type": "uint48",
        "internalType": "uint48"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "recordMeaningfulActivity",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "releaseDormantSubmissionKey",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "renounceRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "callerConfirmation",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reserveSubmission",
    "inputs": [
      {
        "name": "revealCommitment",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "reviveContent",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "revokeRole",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setBonusPool",
    "inputs": [
      {
        "name": "_bonusPool",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setCategoryRegistry",
    "inputs": [
      {
        "name": "_categoryRegistry",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setProtocolConfig",
    "inputs": [
      {
        "name": "_protocolConfig",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setQuestionRewardPoolEscrow",
    "inputs": [
      {
        "name": "_questionRewardPoolEscrow",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setTreasury",
    "inputs": [
      {
        "name": "_treasury",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setVoterIdNFT",
    "inputs": [
      {
        "name": "_voterIdNFT",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setVotingEngine",
    "inputs": [
      {
        "name": "_votingEngine",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submissionKeyUsed",
    "inputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "submitQuestion",
    "inputs": [
      {
        "name": "contextUrl",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "imageUrls",
        "type": "string[]",
        "internalType": "string[]"
      },
      {
        "name": "videoUrl",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "title",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "description",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "tags",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "categoryId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "spec",
        "type": "tuple",
        "internalType": "struct ContentRegistry.QuestionSpecCommitment",
        "components": [
          {
            "name": "questionMetadataHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "resultSpecHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitQuestion",
    "inputs": [
      {
        "name": "contextUrl",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "imageUrls",
        "type": "string[]",
        "internalType": "string[]"
      },
      {
        "name": "videoUrl",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "title",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "description",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "tags",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "categoryId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitQuestionBundleWithRewardAndRoundConfig",
    "inputs": [
      {
        "name": "questions",
        "type": "tuple[]",
        "internalType": "struct ContentRegistry.BundleQuestionInput[]",
        "components": [
          {
            "name": "contextUrl",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "imageUrls",
            "type": "string[]",
            "internalType": "string[]"
          },
          {
            "name": "videoUrl",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "title",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "description",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "tags",
            "type": "string",
            "internalType": "string"
          },
          {
            "name": "categoryId",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "salt",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "spec",
            "type": "tuple",
            "internalType": "struct ContentRegistry.QuestionSpecCommitment",
            "components": [
              {
                "name": "questionMetadataHash",
                "type": "bytes32",
                "internalType": "bytes32"
              },
              {
                "name": "resultSpecHash",
                "type": "bytes32",
                "internalType": "bytes32"
              }
            ]
          }
        ]
      },
      {
        "name": "rewardTerms",
        "type": "tuple",
        "internalType": "struct ContentRegistry.SubmissionRewardTerms",
        "components": [
          {
            "name": "asset",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "requiredVoters",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "requiredSettledRounds",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "bountyClosesAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "feedbackClosesAt",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "roundConfig",
        "type": "tuple",
        "internalType": "struct RoundLib.RoundConfig",
        "components": [
          {
            "name": "epochDuration",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "maxDuration",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "minVoters",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "maxVoters",
            "type": "uint16",
            "internalType": "uint16"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "bundleId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "contentIds",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitQuestionWithRewardAndRoundConfig",
    "inputs": [
      {
        "name": "contextUrl",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "imageUrls",
        "type": "string[]",
        "internalType": "string[]"
      },
      {
        "name": "videoUrl",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "title",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "description",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "tags",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "categoryId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "rewardTerms",
        "type": "tuple",
        "internalType": "struct ContentRegistry.SubmissionRewardTerms",
        "components": [
          {
            "name": "asset",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "requiredVoters",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "requiredSettledRounds",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "bountyClosesAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "feedbackClosesAt",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "roundConfig",
        "type": "tuple",
        "internalType": "struct RoundLib.RoundConfig",
        "components": [
          {
            "name": "epochDuration",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "maxDuration",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "minVoters",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "maxVoters",
            "type": "uint16",
            "internalType": "uint16"
          }
        ]
      },
      {
        "name": "spec",
        "type": "tuple",
        "internalType": "struct ContentRegistry.QuestionSpecCommitment",
        "components": [
          {
            "name": "questionMetadataHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "resultSpecHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitQuestionWithRewardAndRoundConfig",
    "inputs": [
      {
        "name": "contextUrl",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "imageUrls",
        "type": "string[]",
        "internalType": "string[]"
      },
      {
        "name": "videoUrl",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "title",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "description",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "tags",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "categoryId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "rewardTerms",
        "type": "tuple",
        "internalType": "struct ContentRegistry.SubmissionRewardTerms",
        "components": [
          {
            "name": "asset",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "amount",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "requiredVoters",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "requiredSettledRounds",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "bountyClosesAt",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "feedbackClosesAt",
            "type": "uint256",
            "internalType": "uint256"
          }
        ]
      },
      {
        "name": "roundConfig",
        "type": "tuple",
        "internalType": "struct RoundLib.RoundConfig",
        "components": [
          {
            "name": "epochDuration",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "maxDuration",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "minVoters",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "maxVoters",
            "type": "uint16",
            "internalType": "uint16"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitQuestionWithRoundConfig",
    "inputs": [
      {
        "name": "contextUrl",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "imageUrls",
        "type": "string[]",
        "internalType": "string[]"
      },
      {
        "name": "videoUrl",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "title",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "description",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "tags",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "categoryId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "roundConfig",
        "type": "tuple",
        "internalType": "struct RoundLib.RoundConfig",
        "components": [
          {
            "name": "epochDuration",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "maxDuration",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "minVoters",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "maxVoters",
            "type": "uint16",
            "internalType": "uint16"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "submitQuestionWithRoundConfig",
    "inputs": [
      {
        "name": "contextUrl",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "imageUrls",
        "type": "string[]",
        "internalType": "string[]"
      },
      {
        "name": "videoUrl",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "title",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "description",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "tags",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "categoryId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "roundConfig",
        "type": "tuple",
        "internalType": "struct RoundLib.RoundConfig",
        "components": [
          {
            "name": "epochDuration",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "maxDuration",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "minVoters",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "maxVoters",
            "type": "uint16",
            "internalType": "uint16"
          }
        ]
      },
      {
        "name": "spec",
        "type": "tuple",
        "internalType": "struct ContentRegistry.QuestionSpecCommitment",
        "components": [
          {
            "name": "questionMetadataHash",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "resultSpecHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "supportsInterface",
    "inputs": [
      {
        "name": "interfaceId",
        "type": "bytes4",
        "internalType": "bytes4"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "treasury",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "unpause",
    "inputs": [],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateActivity",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "updateRatingState",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "roundId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "referenceRatingBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "nextState",
        "type": "tuple",
        "internalType": "struct RatingLib.RatingState",
        "components": [
          {
            "name": "ratingLogitX18",
            "type": "int128",
            "internalType": "int128"
          },
          {
            "name": "confidenceMass",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "effectiveEvidence",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "settledRounds",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "ratingBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "conservativeRatingBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "lastUpdatedAt",
            "type": "uint48",
            "internalType": "uint48"
          },
          {
            "name": "lowSince",
            "type": "uint48",
            "internalType": "uint48"
          }
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "voterIdNFT",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IVoterIdNFT"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "votingEngine",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "event",
    "name": "ContentCancelled",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ContentDormant",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ContentMediaSubmitted",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "imageUrls",
        "type": "string[]",
        "indexed": false,
        "internalType": "string[]"
      },
      {
        "name": "videoUrl",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ContentRevived",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "reviver",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ContentRoundConfigSet",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "epochDuration",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "maxDuration",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      },
      {
        "name": "minVoters",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "maxVoters",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ContentSubmitted",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "submitter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "contentHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "url",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "title",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "description",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "tags",
        "type": "string",
        "indexed": false,
        "internalType": "string"
      },
      {
        "name": "categoryId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DormantSubmissionKeyReleased",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "submissionKey",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Initialized",
    "inputs": [
      {
        "name": "version",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Paused",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ProtocolConfigUpdated",
    "inputs": [
      {
        "name": "protocolConfig",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "QuestionBundleContentLinked",
    "inputs": [
      {
        "name": "bundleId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "contentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "bundleIndex",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "QuestionBundleSubmitted",
    "inputs": [
      {
        "name": "bundleId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "submitter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "questionCount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "rewardAsset",
        "type": "uint8",
        "indexed": true,
        "internalType": "uint8"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "requiredCompleters",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "bountyClosesAt",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "feedbackClosesAt",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "bundleHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "rewardPoolId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "QuestionRewardPoolEscrowUpdated",
    "inputs": [
      {
        "name": "rewardPoolEscrow",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "QuestionSpecAnchored",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "questionMetadataHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "resultSpecHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RatingStateUpdated",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "roundId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "referenceRatingBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "oldRatingBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "newRatingBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "conservativeRatingBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "confidenceMass",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "effectiveEvidence",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "settledRounds",
        "type": "uint32",
        "indexed": false,
        "internalType": "uint32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RatingUpdated",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "oldRating",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "newRating",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleAdminChanged",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "previousAdminRole",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "newAdminRole",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleGranted",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RoleRevoked",
    "inputs": [
      {
        "name": "role",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "account",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "sender",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SubmissionReservationCancelled",
    "inputs": [
      {
        "name": "submitter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "revealCommitment",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SubmissionReservationExpired",
    "inputs": [
      {
        "name": "submitter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "revealCommitment",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SubmissionReserved",
    "inputs": [
      {
        "name": "submitter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "revealCommitment",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "expiresAt",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SubmissionRewardPoolAttached",
    "inputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "indexed": true,
        "internalType": "uint256"
      },
      {
        "name": "submitter",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "rewardAsset",
        "type": "uint8",
        "indexed": true,
        "internalType": "uint8"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "requiredVoters",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "requiredSettledRounds",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "bountyClosesAt",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "feedbackClosesAt",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "rewardPoolId",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "Unpaused",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "VoterIdNFTUpdated",
    "inputs": [
      {
        "name": "voterIdNFT",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "error",
    "name": "AccessControlBadConfirmation",
    "inputs": []
  },
  {
    "type": "error",
    "name": "AccessControlUnauthorizedAccount",
    "inputs": [
      {
        "name": "account",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "neededRole",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ]
  },
  {
    "type": "error",
    "name": "EnforcedPause",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ExpectedPause",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidInitialization",
    "inputs": []
  },
  {
    "type": "error",
    "name": "NotInitializing",
    "inputs": []
  },
  {
    "type": "error",
    "name": "ReentrancyGuardReentrantCall",
    "inputs": []
  },
  {
    "type": "error",
    "name": "SafeCastOverflowedUintDowncast",
    "inputs": [
      {
        "name": "bits",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ]
  },
  {
    "type": "error",
    "name": "SafeERC20FailedOperation",
    "inputs": [
      {
        "name": "token",
        "type": "address",
        "internalType": "address"
      }
    ]
  }
] as const;
