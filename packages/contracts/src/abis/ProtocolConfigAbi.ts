export const ProtocolConfigAbi = [
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
    "name": "categoryRegistry",
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
    "name": "config",
    "inputs": [],
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
    "name": "drandChainHash",
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
    "name": "drandGenesisTime",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "drandPeriod",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "frontendRegistry",
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
    "name": "getInitialConfidenceMass",
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
    "name": "getRatingConfig",
    "inputs": [],
    "outputs": [
      {
        "name": "cfg",
        "type": "tuple",
        "internalType": "struct RatingLib.RatingConfig",
        "components": [
          {
            "name": "smoothingAlpha",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "smoothingBeta",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "observationBetaX18",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "confidenceMassInitial",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "confidenceMassMin",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "confidenceMassMax",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "confidenceGainBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "confidenceReopenBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "surpriseReferenceX18",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maxDeltaLogitX18",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "maxAbsLogitX18",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "conservativePenaltyMaxBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "conservativePenaltyMinBps",
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
    "name": "getRoundConfigBounds",
    "inputs": [],
    "outputs": [
      {
        "name": "bounds",
        "type": "tuple",
        "internalType": "struct ProtocolConfig.RoundConfigBounds",
        "components": [
          {
            "name": "minEpochDuration",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "maxEpochDuration",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "minRoundDuration",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "maxRoundDuration",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "minSettlementVoters",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "maxSettlementVoters",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "minVoterCap",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "maxVoterCap",
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
    "name": "getSlashConfig",
    "inputs": [],
    "outputs": [
      {
        "name": "cfg",
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
        "name": "admin",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "governance",
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
        "name": "admin",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "governance",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "treasuryAuthority",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "minSubmissionHrepPool",
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
    "name": "minSubmissionUsdcPool",
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
    "name": "participationPool",
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
    "name": "ratingConfig",
    "inputs": [],
    "outputs": [
      {
        "name": "smoothingAlpha",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "smoothingBeta",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "observationBetaX18",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "confidenceMassInitial",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "confidenceMassMin",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "confidenceMassMax",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "confidenceGainBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "confidenceReopenBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "surpriseReferenceX18",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxDeltaLogitX18",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxAbsLogitX18",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "conservativePenaltyMaxBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "conservativePenaltyMinBps",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
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
    "name": "revealGracePeriod",
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
    "name": "rewardDistributor",
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
    "name": "roundConfigBounds",
    "inputs": [],
    "outputs": [
      {
        "name": "minEpochDuration",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "maxEpochDuration",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "minRoundDuration",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "maxRoundDuration",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "minSettlementVoters",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "maxSettlementVoters",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "minVoterCap",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "maxVoterCap",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "type": "function",
    "name": "setCategoryRegistry",
    "inputs": [
      {
        "name": "value",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setConfig",
    "inputs": [
      {
        "name": "epochDuration",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxDuration",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minVoters",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxVoters",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setDrandConfig",
    "inputs": [
      {
        "name": "chainHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "genesisTime",
        "type": "uint64",
        "internalType": "uint64"
      },
      {
        "name": "period",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setFrontendRegistry",
    "inputs": [
      {
        "name": "value",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setParticipationPool",
    "inputs": [
      {
        "name": "value",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setRatingConfig",
    "inputs": [
      {
        "name": "smoothingAlpha",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "smoothingBeta",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "observationBetaX18",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "confidenceMassInitial",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "confidenceMassMin",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "confidenceMassMax",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "confidenceGainBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "confidenceReopenBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "surpriseReferenceX18",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxDeltaLogitX18",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxAbsLogitX18",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "conservativePenaltyMaxBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "conservativePenaltyMinBps",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setRevealGracePeriod",
    "inputs": [
      {
        "name": "value",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setRewardDistributor",
    "inputs": [
      {
        "name": "value",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setRoundConfigBounds",
    "inputs": [
      {
        "name": "minEpochDuration",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxEpochDuration",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minRoundDuration",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxRoundDuration",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minSettlementVoters",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxSettlementVoters",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minVoterCap",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxVoterCap",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setSlashConfig",
    "inputs": [
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
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "setSubmissionRewardMinimums",
    "inputs": [
      {
        "name": "minHrepPool",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minUsdcPool",
        "type": "uint256",
        "internalType": "uint256"
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
        "name": "value",
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
        "name": "value",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "type": "function",
    "name": "slashConfig",
    "inputs": [],
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
    "name": "validateRoundConfig",
    "inputs": [
      {
        "name": "epochDuration",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxDuration",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "minVoters",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "maxVoters",
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
    "name": "voterIdNFT",
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
    "name": "CategoryRegistryUpdated",
    "inputs": [
      {
        "name": "categoryRegistry",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "ConfigUpdated",
    "inputs": [
      {
        "name": "epochDuration",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "maxDuration",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "minVoters",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "maxVoters",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "DrandConfigUpdated",
    "inputs": [
      {
        "name": "drandChainHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      },
      {
        "name": "genesisTime",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "period",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "FrontendRegistryUpdated",
    "inputs": [
      {
        "name": "frontendRegistry",
        "type": "address",
        "indexed": false,
        "internalType": "address"
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
    "name": "ParticipationPoolUpdated",
    "inputs": [
      {
        "name": "participationPool",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RatingConfigUpdated",
    "inputs": [
      {
        "name": "smoothingAlpha",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "smoothingBeta",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "observationBetaX18",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "confidenceMassInitial",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "confidenceMassMin",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "confidenceMassMax",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "confidenceGainBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "confidenceReopenBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "surpriseReferenceX18",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "maxDeltaLogitX18",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "maxAbsLogitX18",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "conservativePenaltyMaxBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "conservativePenaltyMinBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RevealGracePeriodUpdated",
    "inputs": [
      {
        "name": "revealGracePeriod",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "RewardDistributorUpdated",
    "inputs": [
      {
        "name": "rewardDistributor",
        "type": "address",
        "indexed": false,
        "internalType": "address"
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
    "name": "RoundConfigBoundsUpdated",
    "inputs": [
      {
        "name": "minEpochDuration",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "maxEpochDuration",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "minRoundDuration",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "maxRoundDuration",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "minSettlementVoters",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "maxSettlementVoters",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "minVoterCap",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "maxVoterCap",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SlashConfigUpdated",
    "inputs": [
      {
        "name": "slashThresholdBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "minSlashSettledRounds",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "minSlashLowDuration",
        "type": "uint48",
        "indexed": false,
        "internalType": "uint48"
      },
      {
        "name": "minSlashEvidence",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "SubmissionRewardMinimumsUpdated",
    "inputs": [
      {
        "name": "minHrepPool",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "minUsdcPool",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "type": "event",
    "name": "TreasuryUpdated",
    "inputs": [
      {
        "name": "treasury",
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
    "name": "InvalidAddress",
    "inputs": []
  },
  {
    "type": "error",
    "name": "InvalidConfig",
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
    "name": "RewardDistributorAlreadySet",
    "inputs": []
  }
] as const;
