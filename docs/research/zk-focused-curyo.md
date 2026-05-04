# ZK-Focused Curyo Research

Research date: 2026-05-04

This note explores what a zk-focused version of Curyo could mean in practice.
It is grounded in the current Curyo codebase and in current zk/privacy tooling.
The two main prompts are:

1. Can zk reduce faulty or malformed commit-reveal votes?
2. Can zk support private question/bounty flows where only the requester sees
   all submitted answers?

## Short Answer

A zk-focused Curyo should probably not be a full rewrite. The strongest path is
a layered design:

- Keep Curyo's public, stake-backed, round-based settlement model as the default
  product surface.
- Add zk validity proofs around commits, answer submissions, voter eligibility,
  duplicate prevention, and later batch settlement proofs.
- Add encryption, not zk alone, for "only the requester can read the answers."
- Treat MACI, Semaphore, TACo, drand/tlock, and eventually Aztec/FHE systems as
  reference architectures rather than immediate replacements.

The practical split is important: zk proves statements about hidden data, while
encryption gives a chosen party readable access to hidden data. For private
answers, Curyo needs commitments plus encrypted payloads first, with zk as an
integrity and eligibility layer around that payload.

## Current Curyo Baseline

The current protocol is already privacy-adjacent:

- Questions are public content records. `ContentRegistry` stores content hashes,
  emits public metadata, anchors `questionMetadataHash` and `resultSpecHash`,
  snapshots submitter identity/nullifier, and wires bounty escrow.
- Voting uses binary HREP commit-reveal. `RoundVotingEngine` stores a commit
  hash, tlock ciphertext, drand chain hash, target round, frontend attribution,
  stake, voter, and reveal timing.
- `TlockVoteLib` validates tlock/AGE ciphertext shape and drand metadata, but
  the contract does not prove the ciphertext decrypts to the committed
  plaintext.
- `RoundRevealLib` verifies a reveal by recomputing the expected hash from
  `isUp`, `salt`, voter, content, round context, target drand round, chain hash,
  and ciphertext hash.
- Unrevealed or undecryptable commits are handled economically and through round
  finalization/cleanup rather than by commit-time cryptographic validity.
- Public agent results are built from indexed public rounds, revealed counts,
  stake, rating state, feedback, and result templates.

Relevant files:

- `packages/foundry/contracts/ContentRegistry.sol`
- `packages/foundry/contracts/RoundVotingEngine.sol`
- `packages/foundry/contracts/libraries/TlockVoteLib.sol`
- `packages/foundry/contracts/libraries/RoundRevealLib.sol`
- `packages/foundry/contracts/QuestionRewardPoolEscrow.sol`
- `packages/contracts/src/voting.ts`
- `packages/sdk/src/vote.ts`
- `packages/agents/src/questionSpecs.ts`
- `packages/sdk/src/agent.ts`

## Faulty Commits: What ZK Can And Cannot Fix

"Faulty commit" can mean several different things:

| Fault type | Current handling | ZK usefulness |
| --- | --- | --- |
| Random commit hash with no known preimage | Later reveal fails; stake can be forfeited | Strong. Require proof of knowledge of a valid preimage at commit time. |
| Schema-invalid hidden vote or answer | Discovered only at reveal/application layer | Strong. Circuit can constrain enum/range/shape. |
| Duplicate identity under another wallet | Voter ID/nullifier logic handles much of this publicly | Strong if moving to private/anonymous identities. |
| Malformed or undecryptable tlock ciphertext | Tlock metadata is checked, but decryptability is not proven | Hard. Needs proof of encryption correctness or a different encryption architecture. |
| Voter knows a valid reveal but refuses to reveal | Economic/cleanup problem | ZK does not force liveness. Keep bonds, deadlines, fallback reveals, and cleanup. |

For Curyo's current tlock path, zk can cheaply prove that a voter knows a valid
vote preimage, but it does not automatically prove that the submitted AGE/tlock
ciphertext will decrypt. Proving the full current tlock construction inside a
browser-friendly circuit would be heavy because it involves nontrivial
encryption, encoding, and pairing-adjacent assumptions.

That gives three realistic levels:

### Level 1: ZK Preflight Proof

At `commitVote`, require a proof that the voter knows:

- `isUp`
- `salt`
- the active `contentId`
- the active `roundId`
- the snapshotted reference rating
- the voter identity or voter secret, if private identity is introduced

The public outputs would include:

- a scope/domain: `chainId`, `votingEngine`, `contentId`, `roundId`
- a `nullifier` if the identity should be private or one-use
- a circuit-friendly commitment such as Poseidon over the hidden vote fields
- optional public binding to the existing `commitHash` or `keccak256(ciphertext)`

This rejects commits that cannot correspond to any valid vote. It does not
guarantee keeper-assisted tlock reveal. It is still useful because it removes
pure garbage commits and gives future structured-answer circuits a place to
live.

### Level 2: Proof Of Encryption Correctness

Require a proof that the ciphertext encrypts the same valid vote being committed
to. This directly addresses the known undecryptable-ciphertext problem, but it
is the hardest path if Curyo keeps the current tlock/AGE format.

More practical variants:

- Switch the committed encrypted payload to a circuit-friendly encryption
  scheme for votes.
- Keep drand/tlock for time release, but add an off-chain prover/attester layer
  for encryption correctness before accepting high-value rounds.
- Use MACI-style encrypted messages and off-chain tally/processing proofs rather
  than per-vote public tlock reveals.

### Level 3: MACI-Style Private Tally

MACI is the closest production reference for private voting with on-chain
contracts, encryption, and zk tally correctness. It would be a larger rewrite:
votes become encrypted messages; processing/tallying happens off-chain; proofs
verify that messages were processed correctly and that the final tally is
correct. This gives stronger vote privacy and anti-collusion properties, but it
changes Curyo's public per-vote reveal and reward mechanics.

MACI is attractive for a "private voting Curyo" variant, but it is not a small
patch to the current `RoundVotingEngine`.

## Private Answers: Encryption First, ZK Around It

The requester-only answer flow should be designed as a private submission system
parallel to the current public-question flow.

Recommended MVP flow:

1. The requester creates a question/bounty and publishes a per-question
   encryption public key or threshold access policy.
2. An answerer writes the answer locally.
3. The client creates a random salt and symmetric key.
4. The full answer payload is encrypted locally.
5. The symmetric key is encrypted to the requester, requester team, or threshold
   policy.
6. The encrypted payload is stored off-chain.
7. The contract stores only bounded public data: `questionId`, answerer identity
   or nullifier, answer commitment, encrypted payload digest/CID, deadline, and
   optional proof.
8. The requester decrypts answers locally and settles by referencing a winning
   commitment.

The commitment should be domain-separated, for example:

```text
answerCommitment = H(
  "curyo.private-answer.v1",
  chainId,
  bountyContract,
  questionId,
  answererOrNullifier,
  canonicalAnswerHash,
  salt
)
```

For free-form text, avoid proving over the full answer unless absolutely
necessary. Commit to a canonical answer hash or Merkle root. Use zk only for
bounded statements such as "this answer was submitted before the deadline",
"this answerer is eligible", "this answerer has not submitted twice", or "this
structured field is in range."

## Storage And Metadata

Encrypted IPFS/Filecoin/Arweave payloads can work, but privacy depends on more
than content encryption. IPFS explicitly leaves CIDs, DHT/provider metadata, and
retrieval behavior public; content is public unless encrypted. Sensitive answer
flows should therefore use content encryption plus one of:

- private object storage for the first production version;
- encrypted IPFS/Filecoin with private gateways and careful CID handling;
- delayed publication of encrypted payload locators until after the deadline;
- padding/batching to reduce answer-size and timing metadata leakage.

## Key Management

This is the highest product risk in requester-only answer privacy.

Do not rely on deprecated wallet encryption methods. A safer product pattern is:

- Generate a per-question encryption keypair in the app.
- Bind the public key to the bounty with an EIP-712 signature.
- Encrypt the requester's private viewing key into user-controlled backup
  storage, passkey storage, or a recovery flow.
- For smart wallets and multisigs, encrypt to explicit reviewer/viewer keys
  rather than to the contract account itself.
- Support key rotation before answers arrive.
- For team bounties, encrypt each answer key to multiple designated viewers or
  use threshold access control.

Threshold access control networks such as TACo are strong v2 candidates. They
let answerers encrypt to a policy, and nodes release decryption fragments only
when a requester satisfies conditions such as "current bounty creator" or
"delegated reviewer." That improves delegation and recovery, but adds node
liveness, policy, and trust assumptions.

## ZK Design Options

### Option A: Small Custom Validity Circuit

Best for a narrow Curyo v1:

- Prove valid vote preimage at commit time.
- Prove one private answer per identity/scope.
- Prove answer schema/range constraints for structured answer templates.
- Keep existing public settlement and rewards.

This can be implemented in Noir/Barretenberg for developer speed or
Circom/snarkjs for conservative Ethereum verifier maturity.

### Option B: Semaphore-Style Identity Layer

Best when Curyo wants private or pseudonymous human participation:

- Users join a group as verified humans.
- A proof shows group membership without revealing identity.
- A nullifier prevents more than one signal per scope.

This fits private answer submissions well. It does not solve answer encryption
by itself.

### Option C: MACI-Style Private Voting

Best when the voting process itself should become private:

- Votes are encrypted on-chain.
- A coordinator processes messages and tallies off-chain.
- ZK proofs verify tally correctness on-chain.
- Individual votes are not publicly revealed.

This conflicts with some current Curyo assumptions: public revealed vote
history, per-voter reward eligibility by visible commit/reveal, and simple
keeper-assisted tlock reveal.

### Option D: Private Smart Contract Environment

Aztec-style private state or FHE-style confidential contracts become interesting
if Curyo wants a private-native protocol rather than an EVM app with encrypted
attachments. These are more strategic than immediate:

- Aztec-style notes/nullifiers map naturally to private answers and spends.
- FHEVM-style systems can compute over encrypted state, but are a poor fit for
  arbitrary long-form text today.
- Both would force more product and deployment changes than an encrypted answer
  layer on Celo/EVM.

### Option E: zkVMs

RISC Zero and SP1 are attractive for complex off-chain computation integrity,
proof aggregation, and Rust-friendly proof logic. They are not the default for
browser/mobile answer submission or small commit validity circuits.

Use a zkVM later if Curyo needs:

- batch settlement proofs;
- complex evaluator logic written in Rust;
- proof aggregation across many answer/vote events;
- off-chain indexer or reward computation integrity.

## Stack Recommendation

For a first implementation, use a small circuit stack and avoid a zkVM:

1. Prototype in Noir if developer velocity is the main concern.
2. Benchmark Barretenberg verifier deployment and gas on Celo before committing.
3. Use Circom/Groth16 if verifier maturity and existing PSE/zk-kit primitives
   matter more than language ergonomics.
4. Use Semaphore directly if the first private feature is one-answer-per-human
   with anonymous or pseudonymous answerers.
5. Keep MACI as a separate product track for private voting/tallying, not as the
   first fix for current tlock faults.

The first circuit should be intentionally small:

```text
Private inputs:
  identitySecret or voterSecret
  voteOrAnswerEnum
  salt

Public inputs:
  chainId
  contractAddress
  contentId/questionId
  roundId or answerDeadline
  current group root or voter registry root
  nullifier
  commitment
```

Constraints:

- commitment matches private fields and public scope;
- enum/range is valid;
- identity is in the eligible group, if using a Merkle root;
- nullifier is derived from identity secret and scope;
- optional template-specific constraints are satisfied.

## Integration With Current Contracts

A minimal change to current voting could add a verifier gate before storage:

```solidity
function commitVoteWithProof(
    uint256 contentId,
    uint256 roundContext,
    uint64 targetRound,
    bytes32 drandChainHash,
    bytes32 commitHash,
    bytes calldata ciphertext,
    uint256 stakeAmount,
    address frontend,
    bytes calldata proof,
    bytes32[] calldata publicInputs
) external;
```

The verifier gate should run before stake transfer and before storing the
commit. Store a separate `zkCommitment` or `nullifier` only if it is needed for
future reveal, duplicate checks, or indexing.

Important constraint: the current reveal path uses `keccak256` and tlock
ciphertext hashing. A circuit-friendly Poseidon commitment can live alongside
the current commit hash, but it will not replace the current reveal check unless
the Solidity side also verifies the same commitment.

For private answers, do not overload `RoundVotingEngine`. Introduce a separate
contract or module:

```text
PrivateQuestionBounty
  createPrivateQuestion(...)
  submitEncryptedAnswer(questionId, commitment, payloadDigest, encryptedKey, proof?)
  settlePrivateQuestion(questionId, winningCommitment, optionalResultCommitment)
  openDisputeOrReveal(questionId, commitment, encryptedAuditKey?) // optional
```

This keeps current public Curyo intact while allowing a new privacy mode with
different visibility, moderation, and legal assumptions.

## Product Modes

Curyo could expose three modes:

| Mode | Who sees inputs? | Settlement | Best use |
| --- | --- | --- | --- |
| Public Curyo | Everyone | Current public vote/reveal | Public agent evaluation, public auditability |
| Private Answers | Requester/delegates only | Requester chooses or asks public voters to judge redacted outputs | Bounties, private evals, customer data |
| Private Voting | Coordinator/protocol sees limited data; public sees tally/proof | MACI/zk tally | Sensitive votes, anti-bribery, high-stakes governance |

Private Answers is the most relevant to "only the submitter of a
question/bounty can see all the answers." Private Voting is a different product
decision.

## Risks And Open Questions

- Tlock correctness: a small validity proof helps malformed preimages but does
  not prove current tlock ciphertext decryptability.
- Proof UX: browser/mobile proving must be tested on real low-memory devices,
  especially Safari and Android.
- Verifier gas: Celo verifier deployment, calldata, and precompile support need
  direct benchmark tests.
- Trusted setup: Groth16 circuits need ceremony management or reuse of audited
  artifacts.
- Circuit bugs: invalid constraints can be worse than no zk. Any payment or
  eligibility circuit needs independent review.
- Key loss: private answer bounties fail if the requester loses the viewing key.
- Metadata leakage: encrypted content still leaks timing, count, size, and
  storage access patterns.
- Subjective settlement: if only the requester reads answers, public observers
  cannot verify that the requester chose fairly unless there is a dispute,
  reveal, TEE, committee, or constrained scoring mechanism.
- Moderation and safety: private payloads make abuse detection harder. The
  protocol needs an explicit policy for illegal content, spam, malware, and
  malicious links.
- Reward eligibility: current bounty rewards depend on revealed voters and
  timely reveal. Private answer rewards need their own eligibility and dispute
  model.

## Recommended Roadmap

1. Write a short protocol spec for "faulty commit" categories and decide whether
   the first zk proof targets malformed preimages, malformed ciphertexts, or
   both.
2. Prototype a small `validVotePreimage` circuit with fixed binary votes,
   `contentId`, `roundId`, `nullifier`, and `commitment`.
3. Benchmark Noir/Barretenberg and Circom/Groth16 verifier costs on the target
   Celo deployment environment.
4. In parallel, design `PrivateQuestionBounty` as a separate encrypted-answer
   module with per-question viewing keys and answer commitments.
5. Add a Semaphore-style proof only if private answerer identity or one-answer
   per verified human is a near-term product requirement.
6. Keep MACI research active for a later private-voting track.
7. Before production, run threat modeling around key loss, metadata leakage,
   malicious answer payloads, requester mis-settlement, and proof-verifier spam.

## Source Notes

- MACI describes private on-chain voting using Ethereum contracts, encryption,
  and zk proofs, with off-chain tallying and on-chain proof verification:
  https://maci.pse.dev/
- Semaphore V4 provides anonymous group signaling, nullifiers, Solidity
  contracts, JavaScript libraries, setup artifacts, and audits:
  https://docs.semaphore.pse.dev/
- drand/tlock-js documents time-lock encryption using AGE, drand, and future
  round-based decryption:
  https://github.com/drand/tlock-js
- TACo documents threshold access control where encrypted payloads can be
  decrypted by qualifying consumers after threshold node approval:
  https://docs.taco.build/getting-started/key-concepts/access-control
- IPFS documents that CIDs, DHT/provider metadata, and content are public unless
  extra content encryption/privacy measures are used:
  https://docs.ipfs.tech/concepts/privacy-and-encryption/
- Circom/snarkjs document Groth16 setup, proof generation, and Solidity verifier
  export:
  https://docs.circom.io/getting-started/proving-circuits/
  https://github.com/iden3/snarkjs
- Barretenberg documents generating EVM Solidity verifiers and proof
  verification from Noir circuits:
  https://barretenberg.aztec.network/docs/how_to_guides/how-to-solidity-verifier/
- RISC Zero's Ethereum repository provides Solidity verifier contracts and
  Ethereum integration for zkVM proofs:
  https://github.com/risc0/risc0-ethereum
- SP1 V6 is a RISC-V zkVM for Rust/C/C++/RISC-V programs with on-chain
  verification docs:
  https://docs.succinct.xyz/docs/sp1/introduction
- Zama Protocol documents FHEVM components for confidential smart contracts and
  encrypted computation:
  https://docs.zama.org/protocol/protocol/overview
- Aztec documents private state through notes, nullifiers, and owned private
  state variables:
  https://docs.aztec.network/developers/docs/aztec-nr/framework-description/state_variables
