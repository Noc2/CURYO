# Curyo — Foundry (Smart Contracts)

Solidity smart contracts implementing the Curyo protocol: voting engine, content registry, reputation token, cREP stake settlement, question reward pool escrow, and governance. Built with [Foundry](https://book.getfoundry.sh/). The docs now describe the question-first submission flow, Question Reward Pools displayed as USD, USDC-on-Celo settlement, Voter ID-gated claims, and the default 3% frontend-operator share on qualified USDC reward claims.

## Quick Start

```bash
# From the monorepo root:
yarn chain       # Start local Anvil chain
yarn deploy      # Deploy contracts
yarn foundry:test # Run test suite
```

## Scripts

| Command                 | Description                                             |
| ----------------------- | ------------------------------------------------------- |
| `yarn chain`            | Start a local Anvil chain with Scaffold-ETH scaffolding |
| `yarn deploy`           | Deploy contracts via Forge script                       |
| `yarn compile`          | Compile Solidity contracts                              |
| `yarn foundry:test`     | Run the Foundry test suite                              |
| `yarn format`           | Format Solidity and JS files                            |
| `yarn lint`             | Check code formatting                                   |
| `yarn flatten`          | Output flattened contracts                              |
| `yarn verify`           | Verify contracts on Etherscan-compatible networks       |
| `yarn account`          | Check keystore account balance                          |
| `yarn account:generate` | Create a new keystore account                           |
| `yarn account:import`   | Import an existing account into keystore                |

On Celo and Celo Sepolia, deploys use a Foundry keystore selected via `--keystore <name>` and skip Forge's
auto-verification flow. Verify those contracts manually with
`make verify-blockscout NETWORK=<celo|celoSepolia> CONTRACT_ADDRESS=0x... CONTRACT_NAME=MyContract`.

## Configuration

Create a `.env` file (see `.env.example`):

| Variable            | Description                                                 |
| ------------------- | ----------------------------------------------------------- |
| `ALCHEMY_API_KEY`   | Optional RPC provider key for testnet/mainnet deploys       |
| `ETHERSCAN_API_KEY` | Optional explorer API key for Etherscan-compatible networks |

Localhost deploys use the standard Anvil private key directly, so `yarn deploy` does not need a keystore password
when deploying to `localhost`.

Live-network deploys are keystore-based rather than private-key-based. Generate or import a Foundry keystore, then run
`yarn deploy --network <network> --keystore <name>`.

## Project Structure

```
contracts/
├── ContentRegistry.sol          # Question-first submission & lifecycle management
├── RoundVotingEngine.sol        # Core tlock voting logic, metadata-bound commits, and gated round settlement
├── RoundRewardDistributor.sol   # Reward distribution to winning voters
├── CategoryRegistry.sol         # Content category management
├── ProfileRegistry.sol          # User reputation & metadata
├── FrontendRegistry.sol         # Frontend operator fee tracking
├── VoterIdNFT.sol               # Soulbound NFT for verified voters
├── CuryoReputation.sol          # cREP token (staking & reputation)
├── HumanFaucet.sol              # Passport-verified faucet for cREP + Voter ID
├── ParticipationPool.sol        # Halving-tier cREP Bootstrap Pool rewards
├── QuestionRewardPoolEscrow.sol     # Question Reward Pool custody and claims
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

The upgradeable control-plane contracts are deployed behind **transparent upgradeable proxies** and use
`AccessControlUpgradeable` for role-based permissions: `ContentRegistry`, `RoundVotingEngine`,
`RoundRewardDistributor`, `ProtocolConfig`, `FrontendRegistry`, and `ProfileRegistry`. Token, identity, faucet,
participation, governance, and helper contracts are intentionally non-upgradeable. For upgradeable implementation
contracts, storage layout must be preserved across upgrades — never reorder, remove, or change types of existing
storage variables.

Human faucet coverage includes direct callback simulation for hook-level cases and the bytes-based `verifySelfProof`
entrypoint via the mock Self hub. The mock proof path now enforces the same bound user-context hash shape used by the
real hub. Before a live Celo redeploy, still run at least one environment-level proof against the real Self hub/config
for the new faucet address and scope. Faucet config updates should always use a hub-created config ID; the contract now
rejects zero and unknown config IDs before storing them.

Compiled ABIs and deployed addresses are generated into `packages/contracts/src/` and consumed via the `@curyo/contracts` workspace package.
