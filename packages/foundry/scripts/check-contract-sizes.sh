#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONTRACTS_DIR="$ROOT_DIR/contracts"
OUT_DIR="$ROOT_DIR/out"
LIMIT_BYTES="${CONTRACT_SIZE_LIMIT:-24576}"

if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required to check contract sizes" >&2
    exit 1
fi

if [ ! -d "$OUT_DIR" ]; then
    echo "Missing Foundry artifacts in $OUT_DIR. Run forge build first." >&2
    exit 1
fi

echo "Checking deployed bytecode sizes against the EIP-170 limit (${LIMIT_BYTES} bytes)..."

checked=0
oversized=0

while IFS= read -r source; do
    rel_source="${source#"$CONTRACTS_DIR"/}"
    artifact_dir="$OUT_DIR/$rel_source"
    if [ ! -d "$artifact_dir" ]; then
        artifact_dir="$OUT_DIR/$(basename "$rel_source")"
    fi

    if [ ! -d "$artifact_dir" ]; then
        echo "::error file=$source,title=Missing artifact directory::Expected artifacts in $artifact_dir"
        exit 1
    fi

    for artifact in "$artifact_dir"/*.json; do
        [ -e "$artifact" ] || continue

        abi_length="$(jq -r '(.abi // []) | length' "$artifact")"
        deployed_bytecode="$(jq -r '.deployedBytecode.object // ""' "$artifact")"
        deployed_bytecode="${deployed_bytecode#0x}"

        if [ "$abi_length" = "0" ] || [ -z "$deployed_bytecode" ]; then
            continue
        fi

        size_bytes=$((${#deployed_bytecode} / 2))
        if [ "$size_bytes" -eq 0 ]; then
            continue
        fi

        checked=$((checked + 1))
        contract_name="$(basename "$artifact" .json)"
        printf "%6d  %s (%s)\n" "$size_bytes" "$contract_name" "$rel_source"

        if [ "$size_bytes" -gt "$LIMIT_BYTES" ]; then
            echo "::error file=$source,title=Contract size limit exceeded::$contract_name is ${size_bytes} bytes (limit ${LIMIT_BYTES})"
            oversized=$((oversized + 1))
        fi
    done
done < <(
    find "$CONTRACTS_DIR" -type f -name "*.sol" \
        ! -path "$CONTRACTS_DIR/interfaces/*" \
        ! -path "$CONTRACTS_DIR/libraries/*" \
        ! -path "$CONTRACTS_DIR/mocks/*" \
        | sort
)

if [ "$checked" -eq 0 ]; then
    echo "::error::No deployable contract artifacts were checked."
    exit 1
fi

if [ "$oversized" -gt 0 ]; then
    echo "Found $oversized oversized contract(s)." >&2
    exit 1
fi

echo "All checked contracts are within the EIP-170 limit."
