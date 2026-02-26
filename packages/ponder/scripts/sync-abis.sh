#!/bin/bash
# Extract ABIs from foundry build output to ponder/abis/
# Run after `forge build` or `yarn compile`

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FOUNDRY_OUT="$SCRIPT_DIR/../../foundry/out"
PONDER_ABIS="$SCRIPT_DIR/../abis"

CONTRACTS=(
  ContentRegistry
  RoundVotingEngine
  RoundRewardDistributor
  CategoryRegistry
  ProfileRegistry
  FrontendRegistry
  VoterIdNFT
  CuryoReputation
)

for contract in "${CONTRACTS[@]}"; do
  src="$FOUNDRY_OUT/$contract.sol/$contract.json"
  dest="$PONDER_ABIS/${contract}Abi.ts"

  if [ ! -f "$src" ]; then
    echo "WARNING: $src not found, skipping"
    continue
  fi

  python3 -c "
import json
with open('$src') as f:
    abi = json.load(f)['abi']
filtered = [item for item in abi if item.get('type') in ('event', 'function', 'error', 'constructor')]
print('export const ${contract}Abi = ' + json.dumps(filtered, indent=2) + ' as const;')
" > "$dest"

  echo "Extracted $contract -> $dest"
done

echo "Done."
