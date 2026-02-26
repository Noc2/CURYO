#!/usr/bin/env bash
#
# Reset the local Anvil chain for a fresh E2E test run.
# Kills existing Anvil, restarts, redeploys, and reseeds content.
#
# Usage: bash packages/nextjs/e2e/scripts/reset-chain.sh

set -euo pipefail
cd "$(dirname "$0")/../../../.."

echo "Stopping existing services..."
pkill -f "anvil" 2>/dev/null || true
pkill -f "ponder" 2>/dev/null || true
sleep 2

echo "Clearing Ponder state..."
rm -rf packages/ponder/.ponder

echo "Starting Anvil..."
yarn chain &
sleep 3

echo "Deploying contracts..."
yarn deploy

echo "Starting Ponder..."
yarn ponder:dev &
sleep 5

echo ""
echo "✓ Chain reset complete."
echo "  Start the frontend with: yarn start"
echo "  Run tests with:          yarn e2e"
echo ""
