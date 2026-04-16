# HumanFaucet Redeploy Bootstrap

Use this when a fresh deployment must preserve already verified humans from a prior deployment.
The deploy script can replay those claims before the public faucet opens, then closes the migration
window before `HumanFaucet` ownership moves to governance.

## What Gets Replayed

Each migrated row:

- marks the old identity nullifier as used in the new `HumanFaucet`
- marks the holder address as claimed in the new `HumanFaucet`
- transfers the recorded cREP amount from the new faucet allocation
- mints a new Voter ID in the new `VoterIdNFT` with the old nullifier
- preserves referral stats when referrer fields are present

This is deliberately different from a plain token transfer plus NFT mint. Plain transfers would leave
`addressClaimed` and `nullifierUsed` empty and allow duplicate faucet claims after redeploy.

## Manifest

Copy `faucet-bootstrap.example.json` to `faucet-bootstrap.json` and replace every array with the
snapshot data. All arrays must be the same length and in the original claim order. Numeric fields
are quoted strings so large Self nullifiers and 6-decimal cREP amounts are parsed exactly.

Amounts use cREP's 6 decimals:

- `10000000000` = 10,000 cREP
- `15000000000` = 15,000 cREP, for a 10,000 cREP claim plus 5,000 cREP claimant referral bonus

For non-referral claims, set `referrers` to the zero address and both bonus arrays to `0`.
For referral claims, `amounts[i]` is the amount sent to the claimant, including the claimant bonus,
while `referrerRewards[i]` is the additional amount sent to the referrer.

## Snapshot Inputs

For the first 9 current verified humans, capture:

- holder address and nullifier from old `VoterIdNFT.VoterIdMinted` logs
- claimant amount from old `HumanFaucet.TokensClaimed` logs
- referral details, if any, from old `HumanFaucet.ReferralRewardPaid` logs

If token IDs must remain `1..9`, keep the rows ordered by the old token ID and run the bootstrap
before anyone can claim on the new deployment.

## Deploy

Set the manifest path before deploying:

```bash
MIGRATION_BOOTSTRAP_FILE=./migrations/faucet-bootstrap.json yarn deploy --network celo --keystore <name>
```

The deploy script validates the manifest before broadcasting, replays the claims after the new
faucet is funded, then calls `closeMigrationBootstrap()` before governance handoff.

## Post-Deploy Checks

For every migrated holder, verify:

- `CuryoReputation.balanceOf(holder)` matches the manifest amount plus any migrated referrer rewards
- `HumanFaucet.hasClaimed(holder)` is true
- `HumanFaucet.isNullifierUsed(nullifier)` is true
- `VoterIdNFT.hasVoterId(holder)` is true
- Ponder indexes the expected `voter_id` rows from the new deployment start block
