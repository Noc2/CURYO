# WE-BLS Conditional Vote Reveal — Design Document

## Problem Statement

Curyo currently uses tlock encryption (via drand) to hide vote directions within 15-minute epochs. This creates a **first-mover disadvantage**: the first voter's direction is revealed after just 15 minutes, giving later voters asymmetric information. On low-activity content, this problem is especially acute — a single revealed vote can be exploited by strategic followers.

The fundamental limitation of tlock is that it's **time-based**: votes become decryptable after a fixed duration, regardless of how many other votes exist. What we want is **condition-based** reveal: votes should only become decryptable when enough votes have been committed to make the information less actionable.

## Proposed Solution: WE-BLS + Threshold BLS Committee

Use **Witness Encryption for BLS signatures (WE-BLS)** to encrypt votes such that decryption requires a BLS signature from a threshold committee — and that committee only signs when a vote-count threshold is met on-chain.

### Architecture Overview

```
                    ┌─────────────────┐
                    │  Keeper Committee │
                    │   (3-of-5 BLS)   │
                    │                   │
                    │  Monitors chain   │
                    │  Signs when N     │
                    │  votes committed  │
                    └────────┬──────────┘
                             │ BLS signature (witness)
                             ▼
┌──────────┐    WE-BLS     ┌──────────────┐    reveal    ┌──────────────┐
│  Voter   │──encrypted───▶│  On-chain    │◀────────────│  Anyone      │
│ (frontend)│   vote       │  ciphertext  │  (uses BLS  │  (permissionless)
└──────────┘               └──────────────┘   witness)   └──────────────┘
                                  │
                          tlock backstop
                          (7-day epoch)
                                  │
                                  ▼
                          drand beacon key
                          (fallback reveal)
```

### How It Works

1. **Committee Setup (one-time):** 5 keepers run a Distributed Key Generation (DKG) protocol, producing a shared BLS public key `PK` and individual key shares. No single keeper holds the full private key.

2. **Vote Encryption (per vote):**
   - Generate a random symmetric key `K`
   - Encrypt the vote payload with `K` (AES/chacha20)
   - Encrypt `K` via **WE-BLS** to `(PK, message)` where `message = hash(contentId, roundId, "threshold")`
   - Also encrypt `K` via **tlock** to a far-future drand round (7-day backstop)
   - Store both ciphertexts on-chain

3. **Threshold Trigger (when N votes committed):**
   - Each keeper independently monitors the chain
   - When a keeper observes N commits for a round, it computes and posts its BLS signature share on-chain
   - Once 3-of-5 shares are posted, anyone can reconstruct the full BLS signature

4. **Reveal (permissionless):**
   - The reconstructed BLS signature is the **witness** that decrypts the WE-BLS ciphertext
   - Anyone can use it to recover `K` and decrypt all votes for that round
   - On-chain reveal calls verify the BLS signature via EIP-2537 precompiles

5. **Fallback:** If the committee fails (fewer than 3 keepers sign), the tlock backstop ensures votes are decryptable after 7 days via the drand beacon.

### Dual Encryption Scheme

Each vote stores two encrypted copies of the symmetric key:

```
Ciphertext layout per vote:
  ├── encrypted_vote = AES(vote_payload, K)
  ├── we_bls_ciphertext = WE-BLS.encrypt(K, committee_PK, threshold_message)
  └── tlock_ciphertext = tlock.encrypt(K, drand_round_7days)
```

Decryption succeeds if **either** witness is available:
- **WE-BLS witness:** committee's BLS signature (condition-based, fast path)
- **tlock witness:** drand beacon signature at round N (time-based, 7-day fallback)

## Advantages

### vs. Current Tlock-Only System

| Property | Current (tlock) | WE-BLS + Committee |
|----------|----------------|-------------------|
| Reveal trigger | Time (15-min epoch) | Vote count threshold + time backstop |
| First-mover protection | None — vote 1 revealed in 15 min | Strong — vote 1 hidden until N votes exist |
| Low-activity content | Votes revealed to empty room | Votes stay hidden until meaningful participation |
| Information symmetry | Early voters disadvantaged | All voters equally informed (or equally blind) |
| Gaming resistance | Can wait, watch reveals, then vote | Nothing to watch until threshold met |
| Decentralization | Fully decentralized (drand) | Committee trust + drand backstop |

### vs. Simple Longer Epochs

| Property | Flat 2h epoch | WE-BLS |
|----------|-------------|--------|
| Settlement speed | Always slow (2h+ minimum) | Fast once threshold met |
| Adaptive to demand | No — same delay for popular and niche content | Yes — popular content reveals quickly |
| Protection guarantee | Time-limited (2h passes, vote exposed regardless) | Condition-based (vote hidden until N votes exist) |
| Complexity | Trivial (config change) | Significant (new infrastructure) |

### vs. Tiered Tlock Epochs

| Property | 3-tier tlock | WE-BLS |
|----------|-------------|--------|
| Vote 1 on inactive content | Revealed after longest tier (e.g., 24h) regardless | Never revealed until N votes exist (or 7-day backstop) |
| Cryptographic guarantee | Time-based only | Condition-based + time backstop |
| Sophisticated actor protection | Can decrypt locally after epoch | Cannot decrypt until committee signs |
| Complexity | Moderate (contract + frontend changes) | High (new committee infrastructure) |

## Disadvantages and Risks

### Trust Assumptions

- **Committee honesty:** Requires honest majority (3-of-5 keepers). A colluding majority (3+ keepers) could decrypt votes before the threshold is met, gaining an information advantage.
- **Liveness dependency:** If fewer than 3 keepers are online, the fast path is unavailable. The tlock backstop ensures eventual decryption but with a 7-day delay.
- **DKG ceremony:** The initial key generation requires all 5 keepers to participate honestly. A compromised DKG undermines the entire scheme.

**Mitigation:** The tlock backstop means the committee can never **prevent** decryption — only delay it. Committee members are staked and slashable, creating economic disincentives for misbehavior.

### Operational Complexity

- **DKG coordination:** Setting up and maintaining a threshold BLS committee requires off-chain coordination. Re-keying is needed when keepers join or leave.
- **Key rotation:** When the committee changes, in-flight rounds (votes encrypted to the old PK) must be handled. This requires overlapping key epochs — old and new committees coexist until all old rounds expire.
- **Infrastructure:** Each keeper needs to run a monitoring service, manage BLS key shares securely, and maintain uptime.

### On-Chain Costs

| Operation | Estimated Gas |
|-----------|-------------|
| BLS signature verification (EIP-2537 pairing check) | ~135,000-155,000 |
| Storing BLS signature share on-chain | ~20,000-40,000 per share |
| Storing dual ciphertext (WE-BLS + tlock) per vote | ~150-200 extra bytes calldata |

These costs are feasible on L2s but add up. The BLS verification cost is a one-time per-round cost (verify the aggregated signature, not individual shares).

### Frontend Complexity

- The frontend must encrypt votes to **two** targets (WE-BLS + tlock) instead of one
- The committee's public key must be readable from the contract
- The UI must show appropriate status: "Waiting for N votes" vs "Waiting for committee" vs "Waiting for tlock backstop"

### Ciphertext Size

Each vote carries two encrypted symmetric keys instead of one:

| Component | Size |
|-----------|------|
| WE-BLS ciphertext (IBE on BLS12-381) | ~80 bytes (raw) |
| tlock ciphertext (IBE on BLS12-381) | ~80 bytes (raw) |
| Encrypted vote (AES) | ~65 bytes |
| Total overhead vs current | ~80 extra bytes per vote |

On L2s with compressed calldata, this is negligible.

## Implementation Approach

### Phase 1: Contract + Committee Infrastructure

**New contracts:**
- `KeeperRegistry.sol` — Keeper registration, BLS public key storage, staking, slashing
- Modifications to `RoundVotingEngine.sol` — Store dual ciphertexts, verify BLS witness on reveal, track committee signature shares

**DKG:**
- Use an off-chain DKG protocol (celo-threshold-bls-rs has WASM bindings for Node.js)
- Store the resulting shared public key on-chain in the KeeperRegistry
- Each keeper stores their key share locally (never on-chain)

### Phase 2: Frontend Changes

**Vote encryption (useRoundVote.ts):**
- Read committee PK from KeeperRegistry contract
- Encrypt symmetric key via both WE-BLS and tlock
- Store both ciphertexts in the commitVote call

**Display (useRoundPhase.ts, RoundProgress.tsx):**
- Show "Waiting for N votes" when below threshold
- Show "Votes being revealed" when committee has signed
- Show "Tlock backstop: X days remaining" if committee hasn't signed

### Phase 3: Keeper Service

**Each keeper runs:**
- Chain monitor: watch for rounds reaching the vote threshold
- BLS signer: produce and post signature shares when threshold is met
- The keeper service is an extension of the existing keeper package

### Phase 4: Slashing

**Slashable conditions (all provable on-chain):**

| Offense | Detection Method | Consequence |
|---------|-----------------|-------------|
| Non-signing within deadline | On-chain: N commits exist, deadline passed, no share from keeper | Proportional stake slash |
| Premature signing | On-chain: share posted but commit count < N | Full stake slash |
| Invalid signature share | On-chain: BLS share verification fails | Full stake slash |

BLS12-381 makes all of these **objectively verifiable on-chain** via EIP-2537 precompiles — no dispute resolution or subjective judgment needed.

## Technical Feasibility

### What's Production-Ready Today

| Component | Status | Library/Standard |
|-----------|--------|-----------------|
| WE-BLS encryption (IBE) | Production | tlock-js (already in Curyo) |
| BLS12-381 on-chain verification | Production | EIP-2537 (live since Pectra, May 2025) |
| drand beacon verification in Solidity | Production | drand Solidity library |
| Threshold BLS / DKG | Mature | celo-threshold-bls-rs, drand, libBLS |
| BLS12-381 JS operations | Production | @noble/curves (audited) |

### What Needs Building

| Component | Effort |
|-----------|--------|
| KeeperRegistry contract | Medium — staking, BLS key registration, slashing logic |
| Dual encryption in frontend | Low — extend existing tlock encryption |
| Committee monitoring service | Medium — extend existing keeper package |
| DKG coordination tooling | Medium — wrapping existing libraries |
| On-chain BLS share aggregation | Medium — using EIP-2537 precompiles |
| Key rotation / re-keying | High — overlapping key epochs, migration logic |

### EIP-2537 Gas Costs (Reference)

| Operation | Gas |
|-----------|-----|
| G1ADD | 375 |
| G2ADD | 600 |
| MAP_FP_TO_G1 | 5,500 |
| MAP_FP2_TO_G2 | 23,800 |
| PAIRING_CHECK | 23,000 * k + 80,000 (k = number of pairs) |
| Single BLS verify (2-pair check) | ~126,000 + hash-to-curve |

### L2 Support

| Network | EIP-2537 Status |
|---------|----------------|
| Ethereum L1 | Live (Pectra, May 2025) |
| OP Stack (Optimism, Base) | Live (Isthmus upgrade, May 2025) |
| Arbitrum One / Nova | Live (ArbOS 40+) |

## Comparison with Alternatives

### Why Not Just Use tlock with Longer Epochs?

Longer tlock epochs (e.g., 2h, 24h) are simpler but fundamentally time-based. They **buy time** for more votes to arrive but don't **guarantee** it. On low-activity content:

- 24h tlock: vote 1 is revealed after 24h regardless — if no one else voted, the information is exposed to an empty room
- WE-BLS: vote 1 is **never** revealed until N other votes exist (unless the 7-day backstop triggers)

The tlock approach is a probabilistic mitigation; WE-BLS is a cryptographic guarantee (modulo committee trust).

### Why Not a TEE?

TEEs (SGX, Nitro) provide condition-based decryption but with hardware trust assumptions that are arguably worse than a staked threshold committee:
- SGX has had multiple side-channel attacks (Spectre, Foreshadow, AEPIC)
- TEE attestation is controlled by hardware manufacturers
- A threshold BLS committee has transparent, verifiable security — you can see each keeper's stake, uptime, and signing history on-chain

### Why Not a Single Keeper?

A single keeper with a BLS key can decrypt all votes at any time (they hold the full private key). This means:
- The keeper has a permanent information advantage
- A compromised keeper exposes all vote directions
- No redundancy — keeper goes offline, fast path is lost

Threshold BLS eliminates all three: no single keeper can decrypt, compromising one keeper reveals nothing, and only K-of-N need to be online.

## Timeline Example

```
t=0:       Vote 1 committed (encrypted to committee PK + tlock 7-day)
t=5min:    Vote 2 committed
t=30min:   Vote 3 committed → threshold reached (N=3)
t=30min+:  Keeper A posts BLS share
           Keeper C posts BLS share
           Keeper D posts BLS share → 3 shares = full signature
t=31min:   Anyone reconstructs BLS signature → decrypts all 3 votes
           Reveal transactions posted → votes visible on-chain
           Settlement delay starts (one epoch)
t=46min:   Settlement eligible
```

**Failure scenario:**
```
t=0:       Vote 1 committed
t=2h:      Vote 2 committed
t=5h:      Vote 3 committed → threshold reached
           Committee offline (network issue)
t=5h+100:  Deadline passes → committee members slashed
           No BLS signature available
t=7d:      tlock backstop → drand key published → votes decryptable
           Backup keeper reveals votes via tlock
           Stakes + slashed committee funds distributed
```

## Open Questions

1. **Committee size:** 3-of-5 is proposed. Should this be configurable? Larger committees (e.g., 5-of-9) are more robust but slower and harder to coordinate.

2. **Vote threshold for signing:** Should the committee sign at `minVoters` (currently 3) commits, or at a different threshold? Could be a separate configurable parameter.

3. **Deadline for signing:** How many blocks should the committee have after threshold is reached? Too short = false slashing on network delays. Too long = slow reveals.

4. **DKG trigger:** When should re-keying happen? On a fixed schedule? When a keeper is slashed? When a new keeper registers?

5. **Incremental rollout:** Should WE-BLS be opt-in per content category initially? This allows testing on lower-stakes content before full deployment.

6. **Committee incentives:** How should keeper rewards be structured? Per-round flat fee? Percentage of stakes? How does this interact with the existing keeper reward pool?

7. **Interaction with tiered tlock:** Could WE-BLS and tiered tlock coexist? E.g., WE-BLS as the primary mechanism with tiered tlock as the structured fallback (instead of a flat 7-day backstop).

## References

- [tlock: Practical Timelock Encryption from Threshold BLS](https://eprint.iacr.org/2023/189.pdf) — Foundation of Curyo's current encryption
- [EIP-2537: BLS12-381 Precompiles](https://eips.ethereum.org/EIPS/eip-2537) — On-chain BLS verification
- [drand On-Chain Verification](https://docs.drand.love/blog/2025/08/26/verifying-bls12-on-ethereum/) — Solidity library for beacon verification
- [Signature-Based Witness Encryption (ASIACRYPT 2024)](https://eprint.iacr.org/2024/1477) — Compact SWE constructions
- [McFly: Verifiable Encryption to the Future](https://eprint.iacr.org/2022/433.pdf) — General SWE for threshold BLS
- [Extractable WE for KZG Commitments](https://eprint.iacr.org/2024/264) — Practical WE construction
- [celo-threshold-bls-rs](https://github.com/celo-org/celo-threshold-bls-rs) — Threshold BLS + DKG in Rust with WASM
- [drand DKG Explained](https://docs.drand.love/blog/2023/09/08/distributed-key-generation/)
- [@noble/curves BLS12-381](https://github.com/paulmillr/noble-curves) — JS BLS operations
- [Cassiopeia: On-Chain WE](https://eprint.iacr.org/2023/635.pdf) — Committee-based WE on Arbitrum
