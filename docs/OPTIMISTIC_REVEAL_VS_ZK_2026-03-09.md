# Optimistic Reveal + Challenge vs zk Reveal

Status: Draft  
Last updated: 2026-03-09

## Purpose

This note evaluates whether Curyo should harden its tlock reveal path with:

1. an optimistic reveal + challenge period design, or
2. a zk-verifiable reveal design.

It is written against the current `RoundVotingEngine` behavior:

- `commitVote()` requires a non-empty `ciphertext` and stores it on-chain.
- `revealVoteByCommitKey()` verifies only that the submitted plaintext matches `commitHash`.
- the contract does not prove that the stored ciphertext actually decrypts to that plaintext.

Relevant code:

- `packages/foundry/contracts/RoundVotingEngine.sol`
- `packages/foundry/contracts/libraries/RoundLib.sol`
- `packages/keeper/src/keeper.ts`

## Current problem

Today, the protocol cryptographically binds a voter to `commitHash`, but not to the decryptability or correctness of the stored ciphertext. That creates a gap between:

- what the current contract strictly enforces, and
- the stronger "permissionless reveal via drand" property described in some public docs.

This gap matters because a voter can submit bytes that are non-empty and size-bounded but not actually revealable by honest third parties. That creates several risks:

- selective self-revelation
- quorum-withholding until cancellation
- settlement delay during the reveal grace window
- voluntary early signaling if the ciphertext is intentionally weak or directly leaked
- keeper operational noise from repeated decrypt failures

## Evaluation criteria

The two designs are compared on:

- whether the reveal result is objectively verifiable on-chain
- whether watchers are required for safety
- whether slashing can be objective
- how much new off-chain infrastructure is required
- how much new contract and audit complexity is introduced
- how much public code can be reused

## Option A: Optimistic reveal + challenge

### What it is

A relayer or keeper submits a reveal assertion and posts a bond. The reveal becomes final after a challenge window unless someone disputes it.

At a minimum, the asserted data would need to include:

- `contentId`
- `roundId`
- `commitKey`
- `ciphertextHash`
- `isUp`
- `salt`
- `revealableAfter`

The contract would then:

1. verify easy checks immediately
2. escrow the asserter bond
3. wait through a challenge period
4. finalize the reveal if unchallenged
5. slash or refund depending on the dispute result

### The core design issue for Curyo

Optimistic designs work best when a challenger can present objective evidence that the assertion is false.

For Curyo, some challenge categories are objective:

- wrong `commitHash` relation
- reveal submitted before `revealableAfter`
- wrong signer set or insufficient signatures
- equivocation: two conflicting reveals for the same `commitKey`

But the most important failure is not easy to challenge objectively:

- "the asserted plaintext did not actually come from decrypting the stored ciphertext"

Without a proof system or a trusted arbiter, the contract cannot distinguish:

- a real decryption of the stored ciphertext
from
- a plaintext privately leaked by the voter
from
- a fabricated plaintext vouched for by colluding keepers

That means an optimistic scheme only closes the full gap if the challenge game has access to objective cryptographic evidence or trusted external arbitration.

### Practical variants

#### A1. Single-asserter optimistic reveal

One relayer posts the reveal plus a bond. Anyone can challenge during a short window.

This is the smallest change set, but it is also the weakest version because it only works well if disputes are objectively decidable on-chain.

#### A2. Bonded keeper-attested optimistic reveal

An assertion must carry `k-of-n` keeper signatures over the reveal payload. Challengers can dispute:

- invalid signers
- duplicate/conflicting reveals
- premature signatures
- non-committee signatures

This is materially stronger than a single asserter because it raises the attack cost from "one malicious relayer" to "collude with a bonded threshold."

But it is still not cryptographically trustless. It remains an honest-threshold design.

#### A3. Epoch-root optimistic reveal

Keepers sign one Merkle root containing all reveals for an epoch, and individual users later prove leaf membership.

This improves gas efficiency and batching, but omission handling becomes harder:

- if a valid reveal is left out of the root, someone must challenge the omission
- omission challenges are usually more complex than wrong-inclusion challenges

### What can actually be slashed

Objective slash conditions:

- equivocation for the same `commitKey`
- signing or asserting before `revealableAfter`
- invalid committee participation
- malformed or duplicate signed root assertions

Weak or non-objective slash conditions:

- "signed a false decryption"
- "failed to reveal a valid vote"
- "revealed too few honest votes"

Those are not automatically slashable unless the protocol can verify decryption correctness or delegates dispute resolution to a trusted court or governance process.

### Public code that is relevant

These are useful as architectural references, not copy-paste solutions.

- UMA Optimistic Oracle V3
  - docs: <https://docs.uma.xyz/developers/optimistic-oracle-v3>
  - repo: <https://github.com/UMAprotocol/protocol>
  - relevance: assertion bonds, liveness windows, dispute callbacks, optimistic settlement pattern

- OP Stack fault dispute games
  - docs: <https://docs.optimism.io/stack/fault-proofs/explainer>
  - repo: <https://github.com/ethereum-optimism/optimism>
  - relevance: richer dispute games, bonds, challenger roles, delay/finality patterns

These systems prove that optimistic settlement plus challenge windows are a mature pattern. They do not directly solve "prove this plaintext came from this tlock ciphertext."

### Advantages

- smallest protocol change if scoped to procedural dispute categories
- lower proving complexity than zk
- easier to phase in incrementally
- natural fit for keeper bonds and slashable equivocation
- can improve operational robustness even without full cryptographic guarantees

### Disadvantages

- requires at least one honest, online watcher during the challenge window
- finality is delayed by that window
- does not make the reveal trustless unless the dispute itself has objective evidence
- slashability is limited on the most important "wrong decryption" question
- user-facing docs still cannot honestly claim fully permissionless cryptographic reveal if the system relies on keeper attestations

## Option B: zk reveal

### What it is

A proof system verifies that:

1. the stored ciphertext corresponds to the intended drand/tlock epoch
2. the ciphertext decrypts correctly
3. the decrypted payload yields `(isUp, salt)`
4. `keccak256(isUp, salt, contentId) == commitHash`

This can be built in two broad ways:

- a custom arithmetic circuit
- a zkVM proof over real Rust decryption code

### Why zk is attractive

This is the only path in this comparison that can realistically support the strong claim:

"anyone can reveal from the stored ciphertext, and the chain can verify that the reveal came from that ciphertext."

It removes the need for an honest watcher to preserve correctness. Watchers still help liveness, but not correctness.

### Real implementation choices

#### B1. Custom circuit

This would require dedicated circuit work for:

- drand/BLS-related checks
- tlock decryption logic
- `age` / `ChaCha20-Poly1305` hybrid decryption
- final `keccak256` relation

This is the least reusable path and the highest cryptographic engineering risk.

#### B2. zkVM proof

This is the most realistic zk path.

The prover executes existing Rust code that:

- validates the drand material
- decrypts the tlock wrapper
- decrypts the payload
- checks the commit hash relation

Then the chain verifies the resulting proof.

#### B3. Hybrid on Celo

Celo's Isthmus documentation includes EIP-2537 BLS12-381 precompiles. That creates a potentially useful hybrid design:

- verify the drand/BLS component on-chain
- prove only the remaining decrypt-and-commit-hash relation in a zkVM

This does not remove complexity, but it may reduce prover cost and scope.

### Public code that is reusable

The strongest public-code reuse is on the zkVM path.

- drand timelock reference implementations
  - docs: <https://docs.drand.love/docs/timelock-encryption>
  - Go repo: <https://github.com/drand/tlock>
  - JS repo: <https://github.com/drand/tlock-js>
  - relevance: reference semantics for the current tlock flow

- Rust implementations compatible with drand/tlock
  - `tlock_age`: <https://docs.rs/tlock_age/latest/tlock_age/>
  - `tlock`: <https://docs.rs/tlock/latest/tlock/>
  - source repo: <https://github.com/thibmeu/tlock-rs>
  - relevance: much better fit for zkVM proving than the Go or JS stacks

- SP1
  - docs: <https://docs.succinct.xyz/docs/sp1/introduction>
  - verifier contracts: <https://github.com/succinctlabs/sp1-contracts>
  - example/template repo: <https://github.com/succinctlabs/sp1-project-template>
  - relevance: prove arbitrary Rust computation and verify on-chain

- RISC Zero Ethereum / Steel
  - repo: <https://github.com/risc0/risc0-ethereum>
  - Steel docs: <https://dev.risczero.com/api/2.2/blockchain-integration/steel>
  - Steel repo: <https://github.com/boundless-xyz/steel>
  - relevance: another viable zkVM + on-chain verifier stack

- Celo Isthmus BLS precompiles
  - docs: <https://docs.celo.org/network/forno/releases/istanbul-to-isthmus>
  - spec: <https://specs.celo.org/upgrades/isthmus.html>
  - relevance: possible hybrid design using on-chain BLS verification

### Advantages

- strongest correctness guarantee
- no honest-watcher requirement for correctness
- the most honest match between protocol claims and contract behavior
- objective and automatic verification
- keeps the door open to private proofs that do not expose `salt`

### Disadvantages

- highest implementation complexity
- larger proving stack and much larger audit surface
- new prover service and proof lifecycle management
- likely batching pressure to keep proving cost reasonable
- operationally much heavier than an optimistic design

## Comparison

| Dimension | Optimistic reveal + challenge | zk reveal |
|---|---|---|
| Correctness model | honest watcher + objective disputes | cryptographic proof |
| Finality | delayed by challenge window | immediate after proof verification |
| Needs watcher online for safety | yes | no |
| Can prove ciphertext -> plaintext relation on-chain | not by itself | yes |
| Good slashability | procedural faults | not the primary control; proof rejects bad reveals |
| Bad reveal detection | depends on challengers | automatic |
| Off-chain complexity | medium | high |
| On-chain complexity | low/medium | medium/high |
| Audit scope | bond logic, dispute logic, committee logic | verifier integration, proving program, crypto assumptions |
| Best public code reuse | UMA / OP Stack patterns | Rust tlock code + zkVM stacks |
| Fits "fully permissionless reveal" claim | no, unless challenge evidence is itself cryptographic | yes |

## Directional implementation complexity

These are engineering estimates, not commitments.

### Optimistic reveal + challenge

Ballpark complexity: medium.

Likely additions:

- `ciphertextHash` storage at commit time
- reveal assertion struct and pending-assertion storage
- bond accounting
- challenge window and finalize path
- optional `KeeperRegistry` and committee selection
- slashing logic for procedural faults
- keeper changes for assertion submission and monitoring

What is still unresolved after implementation:

- if the dispute does not include cryptographic evidence, the system still relies on honest watchers and honest-threshold attestations for the hardest question

### zk reveal

Ballpark complexity: high.

Likely additions:

- `ciphertextHash` storage at commit time
- new verifier contract dependency
- new prover service or zk-enabled keeper
- proof program over Rust timelock decryption code
- batching design by vote or by epoch
- proof submission path in `RoundVotingEngine`
- proof observability, retries, and failure handling

What is still unresolved after implementation:

- prover performance and operational cost
- verification cost if batching is poor
- larger audit scope across Solidity and proof code

## Recommendation

### If the goal is a near-term mainnet-safe improvement

Do not present optimistic challenge as equivalent to zk.

An optimistic design is worth considering if the goal is:

- better liveness
- bonded keeper accountability
- slashable equivocation
- stronger operational guarantees than today's single-path keeper model

But it should be described honestly as a trust-minimized reveal committee design, not as a cryptographically bound ciphertext reveal.

The best incremental version is:

1. store `ciphertextHash`
2. require `k-of-n` keeper attestations over the reveal payload
3. add a short challenge window
4. slash only objective faults
5. keep documentation explicit that decryption correctness is committee-attested, not zk-proven

### If the goal is to support the strongest protocol claim

Prototype a zkVM path, not a hand-written custom circuit.

The most credible sequence is:

1. prototype decryption with Rust `tlock_age` / `tlock`
2. prove it in SP1 or RISC Zero
3. verify a single-vote proof first
4. move to batched epoch proofs if the proof cost is acceptable
5. only then decide whether to migrate the production reveal path

### Bottom line

For Curyo specifically:

- optimistic reveal + challenge is the better medium-complexity upgrade
- zk is the better long-term correctness story
- optimistic challenge does not remove the core trust-model gap unless the challenge can present objective evidence that the asserted plaintext came from the stored ciphertext

If the product needs a literal "permissionless reveal from stored ciphertext" guarantee, zk is the path to evaluate seriously. If the product mainly needs better operational robustness and slashable keeper behavior, optimistic reveal + challenge is more practical.

## Sources

- Current Curyo code:
  - `packages/foundry/contracts/RoundVotingEngine.sol`
  - `packages/foundry/contracts/libraries/RoundLib.sol`
  - `packages/keeper/src/keeper.ts`

- Optimistic systems:
  - UMA Optimistic Oracle V3 docs: <https://docs.uma.xyz/developers/optimistic-oracle-v3>
  - UMA protocol repo: <https://github.com/UMAprotocol/protocol>
  - OP Stack fault proofs explainer: <https://docs.optimism.io/stack/fault-proofs/explainer>
  - Optimism monorepo: <https://github.com/ethereum-optimism/optimism>

- Timelock / tlock:
  - drand timelock docs: <https://docs.drand.love/docs/timelock-encryption>
  - drand timelock Go repo: <https://github.com/drand/tlock>
  - drand timelock JS repo: <https://github.com/drand/tlock-js>
  - tlock paper landing page: <https://eprint.iacr.org/2023/189>
  - Rust `tlock_age` docs: <https://docs.rs/tlock_age/latest/tlock_age/>
  - Rust `tlock` docs: <https://docs.rs/tlock/latest/tlock/>
  - Rust source repo: <https://github.com/thibmeu/tlock-rs>

- zk stacks:
  - SP1 docs: <https://docs.succinct.xyz/docs/sp1/introduction>
  - SP1 contracts repo: <https://github.com/succinctlabs/sp1-contracts>
  - SP1 project template: <https://github.com/succinctlabs/sp1-project-template>
  - RISC Zero Ethereum repo: <https://github.com/risc0/risc0-ethereum>
  - Steel docs: <https://dev.risczero.com/api/2.2/blockchain-integration/steel>
  - Steel repo: <https://github.com/boundless-xyz/steel>

- Celo:
  - Isthmus upgrade docs: <https://docs.celo.org/network/forno/releases/istanbul-to-isthmus>
  - Isthmus spec: <https://specs.celo.org/upgrades/isthmus.html>
