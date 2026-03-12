# Curyo — Foundry (Smart Contracts)

Solidity smart contracts implementing the Curyo protocol: voting engine, content registry, reputation token, reward distribution, and governance. Built with [Foundry](https://book.getfoundry.sh/).

## Quick Start

```bash
# From the monorepo root:
yarn chain       # Start local Anvil chain
yarn deploy      # Deploy contracts
yarn foundry:test # Run test suite
```

## Scripts

| Command | Description |
|---|---|
| `yarn chain` | Start a local Anvil chain with Scaffold-ETH scaffolding |
| `yarn deploy` | Deploy contracts via Forge script |
| `yarn compile` | Compile Solidity contracts |
| `yarn foundry:test` | Run the Foundry test suite |
| `yarn format` | Format Solidity and JS files |
| `yarn lint` | Check code formatting |
| `yarn flatten` | Output flattened contracts |
| `yarn verify` | Verify contracts on Etherscan |
| `yarn account` | Check keystore account balance |
| `yarn account:generate` | Create a new keystore account |
| `yarn account:import` | Import an existing account into keystore |

## Configuration

Create a `.env` file (see `.env.example`):

| Variable | Description |
|---|---|
| `DEPLOYER_PRIVATE_KEY` | Auto-filled by `yarn account:generate` |
| `ALCHEMY_API_KEY` | RPC provider for testnet/mainnet deploys |
| `ETHERSCAN_API_KEY` | For contract verification |
| `LOCALHOST_KEYSTORE_ACCOUNT` | Keystore account name for local development |

## Project Structure

```
contracts/
├── ContentRegistry.sol          # Content submission & lifecycle management
├── RoundVotingEngine.sol        # Core tlock voting logic and gated round settlement
├── RoundRewardDistributor.sol   # Reward distribution to winning voters
├── CategoryRegistry.sol         # Content category management
├── ProfileRegistry.sol          # User reputation & metadata
├── FrontendRegistry.sol         # Frontend operator fee tracking
├── VoterIdNFT.sol               # Soulbound NFT for verified voters
├── CuryoReputation.sol          # cREP token (staking & reputation)
├── HumanFaucet.sol              # Passport-verified faucet for cREP + Voter ID
├── ParticipationPool.sol        # Optional participation rewards
├── governance/                  # Governor contracts
├── interfaces/                  # Contract interfaces
├── libraries/                   # RoundLib and utility functions
└── mocks/                       # Mock contracts for testing

test/                            # Foundry test suite
script/
├── Deploy.s.sol                 # Main deployment entry point
├── DeployCuryo.s.sol            # Core deployment logic
└── VerifyAll.s.sol              # Batch contract verification

scripts-js/                      # JS helpers for deployment & account management
```

## Architecture

All contracts use the **UUPS upgradeable** pattern with `AccessControlUpgradeable` for role-based permissions. Storage layout must be preserved across upgrades — never reorder, remove, or change types of existing storage variables.

Compiled ABIs and deployed addresses are generated into `packages/contracts/src/` and consumed via the `@curyo/contracts` workspace package.
