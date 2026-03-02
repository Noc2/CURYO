# Settlement Randomness: Analysis & Mitigation Options for Celo L2

Research date: 2026-03-02

---

## 1. Problem Statement

`RoundVotingEngine._shouldSettle()` uses `block.prevrandao` as its sole randomness source for deciding when rounds settle:

```solidity
uint256 rand = uint256(keccak256(abi.encodePacked(
    block.prevrandao, contentId, roundId, block.number
)));
return (rand % 10000) < prob;
```

On a single-sequencer L2, the sequencer can predict or control this value, enabling two attacks:

1. **Selective settlement timing** — Delay settlement when losing, trigger when winning.
2. **Vote + settle coordination** — Vote with one account, control settlement with sequencer power.

These are rated **High severity** in `GAME-THEORY-ANALYSIS.md` (Section A.4, E).

---

## 2. Celo L2 Specifics

Celo migrated from an independent L1 to an **OP Stack L2** in 2025. Key characteristics:

| Property | Value |
|----------|-------|
| Block time | 1 second |
| Sequencer model | **Single centralized sequencer** (decentralized sequencing on roadmap, not shipped) |
| `block.prevrandao` source | L1 Ethereum RANDAO (bridged via OP Stack derivation) |
| prevrandao change frequency | Every ~12 L2 blocks (same value while sharing an L1 origin block) |
| Old randomness beacon | Deprecated — Celo L1's RANDAO commit-reveal contract reverts post-migration |
| EIP-2537 (BLS12-381 precompiles) | Not yet available (requires Pectra adoption on Celo) |
| BN254 precompiles (EIP-196/197) | Available (standard EVM since Byzantium) |
| Chainlink VRF v2.5 | **Not supported on Celo** (supported: Ethereum, Arbitrum, Base, OP, Polygon, Avalanche, BNB, Ronin, Soneium) |

### What the Sequencer Can and Cannot Do

**Cannot**: Change `block.prevrandao` — it comes from L1 Ethereum's RANDAO, set by L1 validators.

**Can**:
- **Predict** settlement outcomes: The sequencer reads L1 state to derive L2 blocks. Since prevrandao only changes every ~12 L2 blocks and block.number is sequential, the sequencer can compute the settlement outcome for every upcoming L2 block.
- **Selectively include/exclude** `trySettle()` transactions: Include them only when the outcome favors the sequencer's position.
- **Time their own votes**: Vote in a block where the predicted subsequent settlement blocks produce favorable outcomes.

### Why On-Chain Fixes Don't Work

Any solution that derives randomness from block data (prevrandao, blockhash, multi-block accumulation, commit-to-future-block) fails because the Celo sequencer either knows or can predict all block-derived values. A `lastVoteBlock` guard (requiring 1-block gap between last vote and settlement) is ineffective — the sequencer predicts block N+1's outcome when deciding to vote in block N.

**The only robust approach is external randomness that the sequencer cannot predict.**

---

## 3. Solution Options

### Option A: drand Commit-Reveal Settlement (Recommended)

**drand** is a distributed randomness beacon operated by the **League of Entropy** — 24+ independent organizations including Cloudflare, EPFL, Protocol Labs, Ethereum Foundation, and others. It produces publicly verifiable, unbiasable random values every 3 seconds using threshold BLS signatures.

The **evmnet** beacon (launched 2024) produces BLS signatures on the **BN254 curve**, verifiable on any EVM chain via existing precompiles (EIP-196/197). No special chain support needed — works on Celo today.

#### Why drand Fits Curyo

- Curyo previously used drand+tlock for commit-reveal voting (migrated to public voting in March 2026). The team has operational experience with drand.
- The keeper service already runs `trySettle()` loops — extending it to submit drand signatures is minimal work.
- No LINK tokens required (unlike Chainlink VRF). No per-request fee.
- More decentralized than Chainlink VRF: 24+ independent organizations vs. commercial oracle network.
- BN254 verification costs ~160K gas — comparable to or cheaper than Chainlink VRF callbacks.

#### Design: Two-Phase Settlement with drand

Votes remain public (no change to voting UX). Only the settlement trigger uses drand:

**Phase 1 — Commit** (`settlementCommit`):
1. Anyone (keeper, voter, observer) calls `settlementCommit(contentId)`.
2. Contract checks: round is open, has both sides, meets minVoters, past minEpochBlocks.
3. Contract records `targetDrandRound = currentDrandRound() + DELAY_ROUNDS` where DELAY_ROUNDS ≈ 10 (30 seconds).
4. The target drand round has **not been produced yet** → the sequencer cannot predict the outcome.

**Phase 2 — Finalize** (`settlementFinalize`):
1. After 30 seconds, the target drand round is produced. Its output is public on drand's HTTP API.
2. Anyone calls `settlementFinalize(contentId, drandRoundNumber, drandSignature)`.
3. Contract verifies the BLS signature against the drand public key (BN254 pairing check, ~160K gas).
4. Uses `keccak256(drandSignature)` as the randomness seed for the settlement probability check.
5. If the check passes → settle. If not → the round remains open for future attempts.

**Fallback**: At `maxEpochBlocks` (~24h), forced settlement uses `block.prevrandao` as a degraded fallback. This ensures liveness even if drand-based settlement is censored for the full epoch. The censorship attack is bounded and highly visible.

#### Security Properties

| Attack | Mitigated? | Why |
|--------|-----------|-----|
| Sequencer predicts settlement outcome | **Yes** | drand output is unpredictable until produced. Commit happens before the drand round exists. |
| Sequencer censors commit tx | **Partially** | Sequencer gains no information by delaying (shifting to a different unpredictable drand round). Censoring ALL commits for 24h triggers prevrandao fallback and is publicly observable. |
| Sequencer censors finalize tx | **No effect** | The outcome is already determined by the committed drand round. Delaying finalization doesn't change the result. |
| Caller withholds unfavorable drand signature | **Mitigated** | drand output is public — any other party can submit the finalization. |
| drand goes offline | **Mitigated** | Fallback to prevrandao at maxEpochBlocks. |
| League of Entropy collusion | **Bounded** | Requires corrupting t-of-n (threshold) nodes across 24+ independent orgs. Far harder than bribing a single sequencer. |

#### Gas Cost

| Operation | Gas |
|-----------|-----|
| settlementCommit | ~50K (storage write) |
| settlementFinalize (BN254 BLS verification) | ~160K |
| **Total per settlement** | **~210K** |
| Current single-step trySettle | ~150K (with settlement execution) |
| **Net overhead** | **~60K gas** |

#### Implementation Complexity

| Component | Effort |
|-----------|--------|
| `ISettlementRandomness` interface | Low — new interface file |
| `DrandRandomness` contract (BN254 verification) | Medium — uses `@kevincharm/bls-bn254` library |
| `RoundVotingEngine` changes (2-phase settlement) | Medium — new storage fields, commit/finalize functions |
| Keeper changes (fetch drand, submit signature) | Low — HTTP fetch + contract call |
| `PrevRandaoRandomness` adapter (backward compat) | Low — wrapper around current logic |
| Foundry tests | Medium — mock drand signatures, test both paths |

**Note**: The `randa-mu/bls-solidity` and `@kevincharm/bls-bn254` libraries are **unaudited**. They should be reviewed before production deployment.

---

### Option B: Anyrand (Self-Deployed drand VRF)

**Anyrand** is a self-deployable VRF system that wraps drand evmnet with a request-callback pattern (similar to Chainlink VRF). It handles the relay infrastructure so you don't need to manage drand beacon fetching yourself.

| Property | Detail |
|----------|--------|
| Source | drand evmnet (BN254, League of Entropy) |
| Pattern | Request → anyone fulfills → callback |
| Keeper required | No — fulfillment is permissionless. Anyone can submit the drand signature. |
| Gas cost | ~160K for BLS verification + callback gas |
| Token cost | None |
| Chain support | Any EVM chain with BN254 precompiles (includes Celo) |
| Maturity | Newer project, unaudited contracts |
| Docs | [docs.anyrand.com](https://docs.anyrand.com) |

**Pros vs. Option A**: Simpler integration — uses a standard request-callback pattern instead of custom commit-reveal. No keeper changes needed for drand fetching.

**Cons vs. Option A**: Less control over the implementation. Depends on someone fulfilling the request (though this is permissionless). Additional external contract dependency.

---

### Option C: Gelato VRF (drand-Powered Relay)

**Gelato VRF** uses drand as its randomness source, with Gelato Web3 Functions handling the relay. Contracts emit a `RequestedRandomness` event, and Gelato's infrastructure fetches the drand output and calls a `fulfillRandomness` callback.

| Property | Detail |
|----------|--------|
| Source | drand (League of Entropy) |
| Pattern | Event emission → Gelato relay → callback |
| Keeper required | No — Gelato's infrastructure handles it |
| Gas cost | Callback gas + Gelato relay fee |
| Token cost | Gelato subscription (1Balance) |
| Celo support | **Unclear** — Gelato supports 14+ EVM chains but Celo is not explicitly confirmed |
| Maturity | Production service, used on Arbitrum and others |
| Docs | [docs.gelato.cloud/vrf](https://docs.gelato.cloud/web3-services/vrf/security-considerations) |

**Pros**: Turnkey service, no infrastructure to manage.

**Cons**: Relies on Gelato infrastructure (centralized relay). Celo support unconfirmed. Adds a payment dependency (Gelato 1Balance). Less decentralized than direct drand verification.

---

### Option D: Chainlink VRF v2.5

| Property | Detail |
|----------|--------|
| Source | Chainlink oracle network |
| Pattern | Request → VRF coordinator → callback |
| Gas cost | ~200-400K gas + LINK premium |
| Token cost | LINK tokens required |
| **Celo support** | **Not available** — Celo is not in the VRF v2.5 supported networks list |
| Maturity | Battle-tested, audited, widely used |

**Verdict**: Not viable for Celo deployment. Included for completeness.

---

### Option E: Accept Current Risk with Documentation

Keep `block.prevrandao` as-is. The economic bounds (MAX_STAKE=100 cREP, maxEpochBlocks=~24h forced settlement) limit the damage. Document the risk transparently.

| Property | Detail |
|----------|--------|
| Implementation cost | Zero |
| Risk level | High on paper, bounded in practice by MAX_STAKE |
| When this makes sense | Bootstrap phase where cREP has no market value and manipulation yields negligible profit |

---

## 4. Comparison Matrix

| | drand Commit-Reveal (A) | Anyrand (B) | Gelato VRF (C) | Chainlink VRF (D) | Status Quo (E) |
|---|---|---|---|---|---|
| **Available on Celo** | Yes | Yes | Unclear | **No** | Yes |
| **Sequencer manipulation** | Eliminated | Eliminated | Eliminated | N/A | Vulnerable |
| **External dependency** | drand HTTP API | Anyrand contracts | Gelato infra | Chainlink | None |
| **Token cost** | None | None | Gelato fee | LINK | None |
| **Gas overhead** | ~60K extra | ~60K extra | ~60K + relay | ~200K+ | 0 |
| **Decentralization** | Very high (24+ orgs) | Very high (same source) | Medium (Gelato relay) | Medium (Chainlink) | N/A |
| **UX impact** | ~30s settlement delay | ~6-10s delay | ~10-30s delay | ~10-30s delay | None |
| **Audit status** | BLS lib unaudited | Unaudited | Production service | Audited | N/A |
| **Keeper changes** | Small (fetch drand) | None | None | None | None |
| **Contract complexity** | Medium | Low-Medium | Low | Low | None |
| **Curyo team familiarity** | High (used drand before) | Low | Low | Low | N/A |

---

## 5. Recommendation

**Option A (drand commit-reveal settlement)** is the best fit for Curyo on Celo:

1. **Chainlink VRF is not available on Celo** — eliminates the most common industry solution.
2. **Curyo already has drand experience** — the previous tlock commit-reveal system used drand. The team understands the technology.
3. **The keeper service is already in place** — fetching a drand beacon and submitting a BLS signature is a small extension to the existing `trySettle()` loop.
4. **No token costs** — drand beacons are free and public. No LINK subscription, no Gelato balance.
5. **Maximum decentralization** — 24+ independent League of Entropy members vs. commercial oracle networks.
6. **BN254 verification works on Celo today** — no dependency on future EIP-2537/Pectra adoption.
7. **Graceful degradation** — prevrandao fallback at maxEpochBlocks ensures liveness if drand integration fails.

### Migration Path

| Phase | What | When |
|-------|------|------|
| **Phase 0** | Ship with prevrandao (current state). Document the risk. | Now |
| **Phase 1** | Add `ISettlementRandomness` interface + `PrevRandaoRandomness` adapter. No behavior change, just abstraction. | Near-term |
| **Phase 2** | Implement `DrandRandomness` contract with BN254 BLS verification. Add 2-phase settlement to `RoundVotingEngine`. Update keeper to fetch drand beacons. | When stakes justify |
| **Phase 3** | Governance switches `randomnessSource` from prevrandao to drand. | After testing |

### Commit-Reveal Scope

The reintegration is **settlement-only commit-reveal**, not full voting commit-reveal:

| Aspect | Old System (pre-March 2026) | Proposed System |
|--------|---------------------------|-----------------|
| Vote privacy | Encrypted with tlock | **Public** (unchanged) |
| Vote UX | Two-phase: commit + wait for reveal | **Single click** (unchanged) |
| Settlement randomness | drand (via tlock decryption timing) | **drand (direct BLS verification)** |
| Keeper role | Decrypt + reveal + settle | **Fetch drand beacon + commit + finalize** |
| drand dependency | Required for every vote | **Required only for settlement** |

The voting UX stays exactly as it is. Only the settlement trigger mechanism changes.

---

## 6. Contract Storage Layout Considerations

Since `RoundVotingEngine` uses UUPS upgradeable proxy, new storage must be **appended only**:

```solidity
// NEW storage — append after existing fields
ISettlementRandomness public randomnessSource;

// Settlement commit tracking: contentId => roundId => SettlementCommit
struct SettlementCommit {
    uint64 commitBlock;
    uint64 targetDrandRound;
    bool committed;
    bool finalized;
}
mapping(uint256 => mapping(uint256 => SettlementCommit)) public settlementCommits;
```

No existing storage slots are modified. The `RoundLib.Round` struct (stored in mappings) does not need changes.

---

## Sources

### Celo L2
- [Celo L1→L2 Changes](https://docs.celo.org/cel2/whats-changed/l1-l2) — sequencer model, deprecated precompiles
- [Celo L2 Architecture](https://docs.celo.org/cel2/whats-changed/cel2-architecture) — OP Stack derivation
- [Celo Randomness (Historical L1)](https://docs.celo.org/what-is-celo/about-celo-l1/protocol/randomness) — deprecated RANDAO commit-reveal
- [Celo Smart Contract Updates](https://specs.celo.org/smart_contract_updates_from_l1.html) — Random contract deactivated
- [Celo on L2BEAT](https://l2beat.com/scaling/projects/celo) — single sequencer assessment

### drand
- [drand Documentation](https://docs.drand.love/about/) — how drand works
- [League of Entropy Members](https://www.drand.love/loe) — 24+ organizations
- [Verifying quicknet beacons on Ethereum](https://docs.drand.love/blog/2025/08/26/verifying-bls12-on-ethereum/) — gas costs, BLS12-381 vs BN254
- [On-Chain Randomness Gotchas](https://docs.drand.love/blog/2025/01/16/on-chain-randomness-gotchas/) — integration pitfalls
- [Timelock Encryption (tlock paper)](https://eprint.iacr.org/2023/189.pdf) — theoretical foundation
- [randa-mu/bls-solidity](https://github.com/randa-mu/bls-solidity) — BLS verification contracts (unaudited)

### Anyrand
- [Anyrand VRF](https://anyrand.com/) — self-deployable drand VRF
- [Anyrand Quickstart](https://docs.anyrand.com/diy/quickstart) — integration guide
- [BLS on EVM (Anyrand)](https://docs.anyrand.com/technical-resources/bls-on-evm) — BN254 verification details
- [frogworksio/anyrand (GitHub)](https://github.com/frogworksio/anyrand) — source code

### Gelato VRF
- [Gelato VRF](https://gelato.cloud/) — drand-powered relay service
- [How Gelato VRF Works](https://docs.gelato.cloud/vrf/introduction/how-gelato-vrf-works) — architecture
- [Gelato VRF Security Considerations](https://docs.gelato.network/web3-services/vrf/security-considerations)

### Chainlink VRF
- [VRF v2.5 Supported Networks](https://docs.chain.link/vrf/v2-5/supported-networks) — Celo NOT listed
- [VRF v2.5 Announcement](https://blog.chain.link/introducing-vrf-v2-5/)

### OP Stack / L2 Sequencer
- [OP Stack Execution Engine Spec](https://specs.optimism.io/protocol/exec-engine.html) — prevrandao from L1
- [Arbitrum RANDAO Discussion](https://research.arbitrum.io/t/randomness-please-bridge-block-difficulty-randao-op-code/7897) — hardcoded value
- [EIP-4399: PREVRANDAO](https://eips.ethereum.org/EIPS/eip-4399)
- [Based Rollups and L2 Sequencing](https://www.sygnum.com/blog/2025/03/25/are-based-rollups-the-answer-to-ethereums-layer-2-conundrum/)
