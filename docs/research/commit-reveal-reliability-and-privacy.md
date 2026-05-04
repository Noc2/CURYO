# Commit-Reveal Reliability And Privacy For Curyo

Research date: 2026-05-04

This note replaces the earlier zk-centered framing. The goal is simpler:

1. Find the best practical solution for faulty or malformed commit-reveal votes.
2. Find the best practical privacy model while keeping HumanReputation (HREP),
   staking, vote settlement, and reputation outcomes public.

The recommendation is to improve Curyo's current public voting reliability with
faster non-reveal cleanup and better commit lifecycle semantics, then add a
separate encrypted-answer layer for private bounties. ZK remains useful for
some future checks, but it is not the main answer to either problem.

## Short Answer

Best solution for faulty commits:

- Keep drand/tlock-style blind voting for public HREP rounds.
- Treat faulty commits as a liveness and state-machine problem, not primarily a
  zk problem.
- Make commits explicitly pending until revealed.
- Let only revealed votes drive quorum, bounty qualification, rating movement,
  and public result packaging.
- After each vote's tlock target is available plus a short reveal grace,
  unrevealed commits become slashable, non-blocking, and removable in batches.
- Keep self-reveal as the voter's escape hatch if a keeper misses a valid vote.
- Add stronger client preflight, local encrypted reveal backups, monitoring, and
  repeat-offender penalties.

Best solution for privacy while keeping HREP/voting public:

- Do not make HREP private.
- Do not make votes private beyond the existing blind phase.
- Add privacy around question context, candidate answers, and requester-only
  review by using commitments plus off-chain encrypted payloads.
- Public HREP voters should vote only on public evaluation packets: redacted
  question text, requester-selected answer, summary, claim, or acceptance
  artifact.
- Only the requester and explicitly delegated reviewers should be able to read
  all raw private answers.

The core product split should be:

- Public Curyo: current public question and public HREP voting model.
- Private Answer Collection: encrypted answer intake for the requester.
- Public Reputation Validation: HREP voters publicly judge a redacted or
  requester-selected artifact derived from the private answers.

## Current Curyo Baseline

Current voting is already close to the desired public-voting model:

- Questions are public content records. `ContentRegistry` stores hashes, emits
  public metadata, anchors `questionMetadataHash` and `resultSpecHash`,
  snapshots submitter identity/nullifier, and wires bounty escrow.
- `RoundVotingEngine` records binary HREP commitments with stake, voter,
  frontend, tlock ciphertext, target drand round, drand chain hash, and reveal
  timing.
- `TlockVoteLib` validates ciphertext size, AGE armor shape, tlock stanza
  metadata, drand chain hash, and target round window.
- `RoundRevealLib` verifies a reveal by recomputing the expected hash from
  `isUp`, `salt`, voter, content, round, reference rating, tlock metadata, and
  ciphertext hash.
- `QuestionRewardPoolEscrow` pays public bounty rewards to eligible revealed
  voters, excluding funder/submitter identities where needed.
- Ponder and SDK result code package public vote counts, revealed counts, stake,
  rating state, feedback, public URLs, and result templates for agents.

The key weak spot is not that votes are hidden. The weak spot is that an
accepted commit can be valid-looking but unrevealable, and pending/unrevealed
commits can delay or complicate settlement.

Relevant files:

- `packages/foundry/contracts/RoundVotingEngine.sol`
- `packages/foundry/contracts/libraries/TlockVoteLib.sol`
- `packages/foundry/contracts/libraries/RoundRevealLib.sol`
- `packages/foundry/contracts/libraries/RoundCleanupLib.sol`
- `packages/foundry/contracts/QuestionRewardPoolEscrow.sol`
- `packages/contracts/src/voting.ts`
- `packages/sdk/src/vote.ts`
- `packages/nextjs/hooks/useManualRevealVotes.ts`

## Faulty Commit Taxonomy

Faulty commit issues are easier to resolve if the protocol distinguishes them:

| Fault type | Best response |
| --- | --- |
| Bad commit hash with no known preimage | Slash if not revealed by grace; do not let it count toward final quorum. |
| Valid preimage but voter refuses to reveal | Slash after grace; self-reveal fallback protects honest voters. |
| Valid-looking tlock/AGE payload that does not decrypt | Slash after grace; make it non-blocking once expired. |
| Keeper outage or missed decrypt | Voter self-reveal, redundant keepers, monitoring, and enough grace. |
| Pending commits consuming scarce round slots | Separate pending slots from revealed quorum; free expired pending slots. |
| Repeated non-reveal behavior by the same identity | Add cooldown, UI warnings, and possible reputation/eligibility penalties. |

The contract cannot cheaply prove "this tlock ciphertext will decrypt correctly"
before the drand round is available. It can validate shape and metadata, but not
future decryptability. That means the most robust solution is to reduce the
damage a bad commit can cause.

## Recommended Commit-Reveal Design

### 1. Keep Public Tlock Voting

Curyo should keep its current public voting direction:

- HREP stake remains public.
- Vote commits remain public.
- Vote directions become public after reveal.
- Settlement, reward eligibility, and rating movement remain public.
- Agents can continue citing public result URLs.

drand/tlock remains a good fit because it hides votes during the blind window
without adding a coordinator who can read them early. Shutter-style threshold
encryption is worth evaluating later, especially if Curyo wants event-based or
batch decryption, but it should not be a prerequisite for fixing faulty commits.

### 2. Make Pending, Revealed, And Expired Separate States

Today, a commit is accepted into round state immediately. A reliability-focused
version should make lifecycle state explicit:

```text
PendingCommit
  accepted -> revealable -> revealed
                      \-> expired/slashed
```

Important accounting rules:

- `committedCount` measures all accepted pending plus revealed commits.
- `revealedCount` measures only valid public reveals.
- `expiredCount` measures commits that missed reveal grace.
- Public quorum, settlement, rating movement, and bounty qualification use
  `revealedCount`, not raw `committedCount`.
- Pending commits may gate early settlement only until their reveal grace
  expires.
- Expired commits never block settlement after cleanup.

This keeps the fairness benefit of waiting for earlier blind voters, but stops a
malformed commit from turning into a long-lived round blocker.

### 3. Add Fast Per-Commit Reveal Grace

Each commit already has enough timing metadata to know when it should become
revealable:

- epoch end;
- target drand round;
- target round timestamp;
- tlock availability.

The protocol should define a short per-commit reveal grace, for example:

```text
effectiveRevealableAt = max(epochEnd, targetRoundTime)
revealDeadline = effectiveRevealableAt + revealGrace
```

Once `revealDeadline` passes:

- anyone can process the unrevealed commit in a bounded batch;
- the stake is forfeited or routed according to policy;
- the commit is excluded from settlement blockers;
- the pending slot is freed;
- the voter remains unable to submit another vote for the same content/round.

This is more important than adding a proof system. Honest voters still have
self-reveal; faulty voters lose stake; valid revealed voters can settle.

### 4. Separate Max Pending From Max Revealed

`maxVoters` should protect gas and UX, but pending malformed commits should not
be able to permanently consume the useful capacity of a round.

Recommended model:

- `maxRevealedVoters`: the intended cap for eligible revealed voters.
- `maxPendingCommits`: a larger gas/storage safety cap for pending commits.
- Expired pending commits free pending capacity after cleanup.
- A round is "full" for settlement/reward purposes only when revealed eligible
  voters reach `maxRevealedVoters`.

This reduces the griefing value of a bad commit. A verified human can still burn
their own HREP, but they cannot cheaply prevent others from producing a valid
public result.

### 5. Keep Economic Penalties Simple

For unrevealed commits after grace:

- no HREP reward;
- no bounty reward;
- no frontend fee attribution;
- staked HREP forfeited to consensus reserve or treasury;
- optional identity cooldown for repeated non-reveals;
- optional UI risk warning next time the same Voter ID tries to vote.

Avoid complex subjective slashing. The objective rule is enough: if a commit is
not revealed by deadline, it does not count and loses reward eligibility.

### 6. Improve Client And Keeper Reliability

Client-side changes cannot be the only line of defense, but they should reduce
accidental faults:

- canonical SDK-only commit builder for app/agent paths;
- parse and validate AGE/tlock metadata before transaction submission;
- persist an encrypted local reveal package containing `contentId`, `roundId`,
  `isUp`, `salt`, `targetRound`, `drandChainHash`, ciphertext hash, and
  transaction hash;
- show "manual reveal available" when keeper reveal has not happened;
- run redundant keepers and alert on decrypt failures;
- expose round health metrics: pending, revealable, revealed, expired,
  cleanup-needed.

This turns most honest failures into recoverable UX events rather than protocol
failures.

### 7. Keep ZK Optional

ZK can prove knowledge of a valid hidden vote preimage, but it does not solve
the current hard part: proving that a future tlock ciphertext will decrypt.

Use zk later only if Curyo needs:

- anonymous verified-human voting;
- private one-answer-per-human proofs;
- structured answer schema proofs;
- batch settlement proofs.

Do not block the reliability fix on zk.

## Privacy Goal

The desired privacy model is not "private Curyo voting." The better target is:

- raw private answers are visible only to the requester and delegated reviewers;
- HREP votes remain public;
- HREP staking, rewards, and reputation outcomes remain public;
- public voters judge a public artifact, not the full private answer corpus;
- the protocol stores commitments so private answers can be audited or disputed
  later without publishing them by default.

That preserves Curyo's public human-reputation value while adding a private
input lane for users who cannot put full context or all answers in public.

## Recommended Privacy Architecture

### 1. Add Private Answer Collection As A Separate Module

Do not overload `RoundVotingEngine`. Add a dedicated encrypted-answer module:

```text
PrivateAnswerBounty
  createPrivateBounty(publicQuestion, privacyPolicy, bountyTerms)
  submitEncryptedAnswer(questionId, answerCommitment, payloadDigest, encryptedKey, metadata)
  publishEvaluationPacket(questionId, packetHash, selectedAnswerCommitment?)
  attachPublicVotingContent(questionId, contentId)
  settleAnswerBounty(questionId, winnerCommitment)
```

The module should store bounded public state:

- question/bounty ID;
- requester/funder;
- public title or redacted prompt;
- deadline;
- bounty terms;
- answer commitment;
- encrypted payload digest or CID;
- encrypted symmetric key material;
- answerer address or answerer nullifier;
- selected/winning commitment;
- linked public voting `contentId`, if any.

It should not store raw answer text.

### 2. Encrypt Payloads Client-Side

Answer submission flow:

1. Requester creates a private bounty and publishes a per-question viewing key
   or threshold access policy.
2. Answerer writes an answer locally.
3. Client creates a random symmetric key.
4. Client encrypts the full answer payload.
5. Client encrypts the symmetric key to the requester or access policy.
6. Client stores the encrypted payload in private object storage or encrypted
   decentralized storage.
7. Client submits the answer commitment and encrypted payload digest on-chain.

Commitment example:

```text
answerCommitment = H(
  "curyo.private-answer.v1",
  chainId,
  privateAnswerBounty,
  questionId,
  answererOrNullifier,
  canonicalAnswerHash,
  salt
)
```

The requester can later prove which answer won by referencing the commitment
without revealing every answer.

### 3. Use Public Evaluation Packets For HREP Voting

To keep public voting meaningful, Curyo needs a public artifact for voters:

- a redacted question;
- the requester's selected answer;
- a summary of the answer set;
- a claim such as "this selected answer satisfies the bounty";
- a sanitized evidence bundle;
- a model/eval result derived from private answers.

That artifact becomes normal public Curyo content. HREP voters publicly vote on
it using the existing round engine.

This means privacy and reputation do different jobs:

- encrypted answer collection protects the raw private answer corpus;
- public HREP voting validates a public decision, output, or summary.

### 4. Use Direct Keys For MVP, Threshold Access For V2

MVP key management:

- generate a per-question X25519 or secp256k1 encryption keypair;
- bind the viewing public key to the bounty with an EIP-712 signature;
- encrypt the private viewing key into requester-controlled backup storage;
- support explicit reviewer keys for teams/multisigs;
- allow key rotation before answers arrive.

Do not rely on deprecated wallet encryption APIs. MetaMask deprecated
`eth_decrypt` and `eth_getEncryptionPublicKey`; Curyo should treat wallet
signing as identity/consent and use application-managed encryption keys for
payload privacy.

V2 key management:

- use threshold access control such as TACo for delegated review and recovery;
- policy can require "requester address", "delegated reviewer", "bounty still
  active", or "arbitration role";
- nodes release decryption fragments only when conditions pass.

Threshold access improves recovery and team workflows, but adds external
network liveness and trust assumptions. It is a production v2, not an MVP
blocker.

### 5. Be Honest About Metadata

Encrypted payloads still leak metadata:

- answer count;
- submission time;
- answer size unless padded;
- storage locator visibility;
- requester access timing;
- winner address/commitment if paid publicly.

For sensitive bounties, use private object storage first. IPFS/Filecoin can be
used if content is encrypted and the product accepts CID/DHT/provider metadata
leakage or mitigates it with private gateways, delayed locator publication,
padding, and batching.

## Product Modes

| Mode | Raw context/answers | HREP voting | Best use |
| --- | --- | --- | --- |
| Public Question | Public | Public | Current Curyo, public agent evaluation |
| Private Answer Collection | Requester/delegates only | Optional public vote on a derived packet | Private bounties, customer data, confidential evals |
| Public Validation Packet | Redacted or selected output public | Public | Reputation-backed acceptance of private-work output |

This keeps HumanReputation legible. HREP continues to mean public, auditable
human judgment on public artifacts. It does not become a private answer-market
token with invisible voting.

## What Not To Do

- Do not make the HREP token private.
- Do not hide public vote directions after reveal.
- Do not require public voters to judge data they cannot see.
- Do not publish all private answers just to make settlement easier.
- Do not use zk as the primary answer-privacy mechanism.
- Do not depend on one requester device key with no recovery path.
- Do not let pending commits permanently consume round capacity.

## Implementation Plan

### Commit-Reveal Reliability

1. Define explicit states for pending, revealed, expired, and cleaned commits.
2. Add or document per-commit reveal deadlines based on effective tlock
   revealability plus a short grace.
3. Ensure settlement and bounty qualification depend on revealed eligible voters
   rather than raw commits.
4. Make expired commits non-blocking after cleanup.
5. Separate pending capacity from revealed-voter capacity.
6. Add keeper health metrics and manual reveal UX around revealable commits.
7. Add tests for malformed ciphertexts, non-reveals, pending slot cleanup,
   valid self-reveal after keeper miss, and settlement after expired faulty
   commits.

### Privacy

1. Specify `PrivateAnswerBounty` separately from `RoundVotingEngine`.
2. Define canonical encrypted answer payloads and commitments.
3. Bind requester viewing keys with EIP-712 signatures.
4. Store encrypted payloads off-chain and only bounded commitments/digests
   on-chain.
5. Build public evaluation packets that can be submitted to normal Curyo voting.
6. Add delegated reviewer keys and recovery before broad production use.
7. Evaluate TACo/threshold access once the direct-key MVP proves the product
   flow.

## Open Questions

- What should the reveal grace be for Curyo's current 20-minute epochs?
- Should unrevealed stake go to consensus reserve, treasury, or be split?
- Should repeated non-reveal affect Voter ID eligibility or only UX warnings?
- Should private answer bounties pay answerers directly, or should HREP voters
  validate the selected winner first?
- What public artifact gives HREP voters enough information without exposing raw
  private answers?
- How much metadata leakage is acceptable for private bounties?
- Who can decrypt private answers for moderation, dispute, or legal requests?

## Source Notes

- drand/tlock-js documents time-lock encryption using AGE, drand, and future
  round-based decryption: https://github.com/drand/tlock-js
- drand documents timelock encryption as encrypting to a future time using the
  threshold drand network: https://docs.drand.love/docs/timelock-encryption
- Shutter API is a threshold-encryption commit-reveal option for future
  evaluation, especially event-based decryption:
  https://docs.shutter.network/docs/protocol/api/how_it_works
- TACo documents condition-based threshold decryption for payload access:
  https://docs.taco.build/getting-started/key-concepts/access-control
- IPFS documents that CIDs, DHT/provider metadata, and content are public unless
  additional content-encryption/privacy measures are used:
  https://docs.ipfs.tech/concepts/privacy-and-encryption/
- MetaMask deprecated `eth_decrypt` and `eth_getEncryptionPublicKey`, so Curyo
  should not base privacy on those wallet APIs:
  https://metamask.io/en-GB/news/metamask-api-method-deprecation/
- EIP-712 defines typed structured data signing and domain separation, useful
  for binding requester viewing keys to private bounties:
  https://eips.ethereum.org/EIPS/eip-712
- Semaphore and zk systems remain useful for future nullifier or anonymous
  eligibility proofs, but they are optional rather than core to this design:
  https://docs.semaphore.pse.dev/
