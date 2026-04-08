#!/usr/bin/env bash
#
# Reset the local Anvil chain for a fresh E2E test run.
# Kills existing Anvil, restarts, redeploys, and reseeds content.
#
# Usage: bash packages/nextjs/e2e/scripts/reset-chain.sh

set -euo pipefail
cd "$(dirname "$0")/../../../.."

ANVIL_PORT="${ANVIL_PORT:-8545}"
PONDER_URL="${NEXT_PUBLIC_PONDER_URL:-http://localhost:42069}"

stop_listener() {
  local port="$1"
  local label="$2"
  local pids

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "$pids" ]]; then
    return
  fi

  echo "Stopping existing $label listener on port $port..."
  while read -r pid; do
    [[ -n "$pid" ]] && kill "$pid" 2>/dev/null || true
  done <<<"$pids"

  for _ in {1..10}; do
    if ! lsof -tiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return
    fi
    sleep 1
  done

  pids="$(lsof -tiTCP:"$port" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "$pids" ]]; then
    echo "Force stopping $label listener on port $port..."
    while read -r pid; do
      [[ -n "$pid" ]] && kill -9 "$pid" 2>/dev/null || true
    done <<<"$pids"
  fi
}

wait_for_anvil() {
  for _ in {1..30}; do
    if curl -s \
      -H "Content-Type: application/json" \
      --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
      "http://127.0.0.1:${ANVIL_PORT}" >/dev/null; then
      return
    fi
    sleep 1
  done

  echo "Timed out waiting for Anvil on port ${ANVIL_PORT}." >&2
  exit 1
}

wait_for_ponder() {
  for _ in {1..30}; do
    if curl -s "${PONDER_URL}/status" >/dev/null; then
      return
    fi
    sleep 1
  done

  echo "Timed out waiting for Ponder at ${PONDER_URL}." >&2
  exit 1
}

echo "Stopping existing services..."
stop_listener "${ANVIL_PORT}" "Anvil"
stop_listener "42069" "Ponder"

echo "Clearing Ponder state..."
rm -rf packages/ponder/.ponder

echo "Starting Anvil..."
yarn chain &
wait_for_anvil

echo "Deploying contracts..."
yarn deploy

echo "Starting Ponder..."
yarn ponder:dev &
wait_for_ponder

echo ""
echo "✓ Chain reset complete."
echo "  Start the app stack with: yarn dev:stack"
echo "  Run tests with:          yarn e2e"
echo ""
