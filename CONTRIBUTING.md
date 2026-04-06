# Contributing to Curyo

Thank you for your interest in contributing to Curyo — the first human reputation game to reclaim the web.

## Getting Started

1. Fork the repository
2. Clone your fork and install dependencies:
   ```bash
   git clone https://github.com/YOUR_USERNAME/curyo.git
   cd curyo
   corepack enable
   yarn install
   ```
3. Follow the [Usage](README.md#usage) section to run the project locally

## Project Structure

| Package | What lives here |
|---|---|
| `packages/foundry` | Solidity contracts, Foundry tests, deployment scripts |
| `packages/nextjs` | Next.js frontend, React components, hooks |
| `packages/ponder` | On-chain event indexer and API endpoints |
| `packages/keeper` | Standalone keeper service for vote reveals |
| `packages/bot` | Manual CLI bot for content submission and voting |

## How to Contribute

- **Report bugs** — open an issue with steps to reproduce
- **Suggest features** — open an issue describing the use case
- **Submit PRs** — fix a bug, improve docs, or add a feature

### Pull Request Guidelines

1. Create a branch with a descriptive name
2. Keep PRs focused — one concern per PR
3. Run linting and tests before submitting:
   ```bash
   yarn lint
   yarn foundry:test
   ```
4. Write a clear PR description explaining what changed and why

### Code Style

- Use the existing Prettier and ESLint configuration
- Follow existing patterns in the codebase
- Smart contract changes should include corresponding tests

## Questions?

Open an issue and we'll help you get started.
