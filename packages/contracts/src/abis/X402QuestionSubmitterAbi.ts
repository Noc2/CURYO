export const X402QuestionSubmitterAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "_registry",
        "type": "address",
        "internalType": "contract ContentRegistry"
      },
      {
        "name": "_usdcToken",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "_questionRewardPoolEscrow",
        "type": "address",
        "internalType": "address"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "computeX402QuestionPaymentNonce",
    "inputs": [
      {
        "name": "metadata",
        "type": "tuple",
        "internalType": "struct ContentRegistry.SubmissionMetadata",
        "components": [
          {
            "name": "url",
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
        ]
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
      },
      {
        "name": "payer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "payee",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "validAfter",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "validBefore",
        "type": "uint256",
        "internalType": "uint256"
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
    "name": "registry",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract ContentRegistry"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "submitQuestionWithX402Payment",
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
      },
      {
        "name": "paymentAuthorization",
        "type": "tuple",
        "internalType": "struct Eip3009Authorization",
        "components": [
          {
            "name": "from",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "to",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "value",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "validAfter",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "validBefore",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "nonce",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "signature",
            "type": "bytes",
            "internalType": "bytes"
          }
        ]
      }
    ],
    "outputs": [
      {
        "name": "contentId",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "usdcToken",
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
    "type": "event",
    "name": "X402QuestionSubmitted",
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
        "name": "paymentNonce",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  }
] as const;
