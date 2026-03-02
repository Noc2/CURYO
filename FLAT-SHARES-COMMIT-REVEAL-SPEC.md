# Flat Shares with Commit-Reveal Voting

Specification for replacing the bonding curve share pricing with flat shares and adding commit-reveal vote secrecy to the Curyo protocol.

---

## 1. Executive Summary

Replace the bonding curve (`shares = stake * b / (sameDirectionStake + b)`) with flat share pricing (`shares = stake`) and add a commit-reveal phase to hide vote direction until settlement. The binary UP/DOWN parimutuel reward system and random settlement mechanism are preserved unchanged.

**What changes:**
- Shares are 1:1 with stake (no bonding curve advantage for early/contrarian voters)
- Vote direction is hidden during the round; only stake amount is visible
- A new `Revealing` state is added between `Open` and `Settled`
- Rating updates are deferred from vote time to reveal time
- The `liquidityParam` config field becomes unused

**What stays the same:**
- Binary UP/DOWN voting
- Parimutuel reward pool (losers pay winners)
- Pool split: 82% voters / 10% submitter / 2% platform / 1% treasury / 5% consensus
- Random settlement via `_shouldSettle()` with `block.prevrandao`
- Voter ID (Self.xyz), 1-100 cREP stake range, 24h cooldown
- Consensus subsidy for unanimous rounds

---

## 2. Motivation

### 2.1 Why remove the bonding curve

The bonding curve awards early voters more shares per cREP staked. This creates several problems documented in `GAME-THEORY-ANALYSIS.md`:

| Problem | Severity | Reference |
|---------|----------|-----------|
| **First-mover MEV**: validators front-run votes to capture cheaper shares | Medium | A.3, B.3 |
| **Race to vote first**: rewards timing over thoughtfulness | Medium | A.3 |
| **Governance attack surface**: tuning `b` via governance changes equilibrium properties | Medium | A.3 |
| **Not a proper scoring rule**: incentivizes early voting, not truthful voting | High | B.4 |
| **Complexity**: users cannot easily understand their expected reward | Low | — |

The bonding curve's stated purpose is anti-herding: making it more expensive to pile onto the majority side. However, the parimutuel structure already provides natural anti-herding — the more people on the winning side, the smaller each person's share of the losing pool. With flat shares, a voter on a 10-person winning side gets 1/10th of the pool, while a voter on a 2-person winning side gets 1/2. The parimutuel dynamics alone create a strong contrarian incentive.

Early voters retain a natural advantage without the bonding curve: it is easier to assess whether content at rating 50 is undervalued than to decide whether content at rating 90 should be 91 or 89. This organic informational edge replaces the mechanical edge of the bonding curve.

### 2.2 Why add commit-reveal

Without the bonding curve, the primary remaining concern is **herding via information cascades**. If votes are public, late voters can simply copy the majority direction at no additional cost. Commit-reveal addresses this by hiding vote direction during the round:

- **No information to copy**: voters cannot see which side is ahead during the commit phase
- **No front-running**: validators cannot front-run for directional advantage (direction is hidden)
- **Independent assessment**: each voter must form their own opinion without observing others
- **Settlement front-running eliminated**: the exact final outcome is unknown until reveals complete

### 2.3 What about the strike price mechanism?

An alternative was considered where each voter locks in the current rating as their personal "strike price" and wins/loses based on whether the final rating exceeds their strike. This was rejected because:

1. **Bracket attacks**: two colluding identities can bracket honest voters by placing votes on opposite sides at optimized strike prices, extracting 82% of honest voters' stakes
2. **Mean-reversion bias**: the profit-distance formula creates asymmetric payoffs that systematically push ratings toward 50 regardless of content quality
3. **Incompatible with commit-reveal**: the strike mechanism requires live rating updates (which require public votes), but commit-reveal hides votes — a fundamental tension
4. **All voters can win simultaneously**: when the final rating lands between an UP voter's and DOWN voter's strike prices, both win and no losing pool exists

See `TIME-WEIGHTED-SHARE-PRICING.md` and the bracket attack analysis for detailed numerical examples.

---

## 3. Mechanism Overview

### 3.1 Round lifecycle

```
┌─────────┐    trySettle()    ┌───────────┐    finalizeRound()    ┌───────────┐
│  Open   │ ───────────────> │ Revealing │ ────────────────────> │ Settled   │
│ (commit │                  │ (reveal   │                      │ (rewards  │
│  phase) │                  │  window)  │                      │  claimable│)
└─────────┘                  └───────────┘                      └───────────┘
     │                            │
     │ maxDuration expired        │ < minVoters revealed
     v                            v
┌───────────┐              ┌───────────┐
│ Cancelled │              │ Cancelled │
│ (refund)  │              │ (refund   │
└───────────┘              │ revealed; │
                           │ forfeit   │
                           │ unrevealed│)
                           └───────────┘
```

### 3.2 Voter flow

1. **Commit**: voter calls `commitVote(contentId, commitHash, stakeAmount, frontend)`. The contract transfers `stakeAmount` cREP and stores the commit hash. Vote direction is hidden.
2. **Wait**: the round continues accepting commits. Settlement probability increases per block (same as current `_shouldSettle`).
3. **Reveal trigger**: when `trySettle()` fires, the round transitions to `Revealing` state. A `RevealWindowOpened` event is emitted.
4. **Reveal**: within the reveal window (configurable, e.g. 150 blocks ≈ 5 min on Celo at 2s blocks), voters call `revealVote(contentId, roundId, isUp, salt)`. The contract verifies the hash matches, records the direction, and computes flat shares.
5. **Finalize**: after the reveal window, anyone (typically the keeper) calls `finalizeRound(contentId, roundId)`. Winners are determined, rewards distributed.

### 3.3 What's hidden, what's visible

| Data | During commit phase | During reveal phase | After finalize |
|------|--------------------|--------------------|----------------|
| Voter address | Visible | Visible | Visible |
| Stake amount | Visible | Visible | Visible |
| Vote direction | **Hidden** (hash only) | Visible (as reveals come in) | Visible |
| Total committed stake | Visible | Visible | Visible |
| Side totals (UP/DOWN) | **Hidden** | Partially visible (as reveals accumulate) | Visible |
| Content rating | **Frozen** (not updated) | Updated as reveals come in | Final |

---

## 4. Contract Changes

### 4.1 RoundLib.sol

#### New RoundState

```solidity
enum RoundState {
    Open,       // Accepting commits; settlement can trigger randomly after minEpochBlocks
    Revealing,  // Settlement triggered, accepting reveals within the reveal window
    Settled,    // Finalized, rewards distributed
    Cancelled,  // Expired without settlement or insufficient reveals — refund
    Tied        // Equal pools after settlement — refund all voters
}
```

#### Modified Round struct

```solidity
struct Round {
    uint256 startTime;
    uint64 startBlock;
    RoundState state;
    uint256 voteCount;         // Total commits (not reveals)
    uint256 revealCount;       // NEW: number of revealed votes
    uint256 totalStake;        // Total committed stake (visible during commit phase)
    uint256 totalUpStake;      // Only populated during/after reveal
    uint256 totalDownStake;    // Only populated during/after reveal
    uint256 totalUpShares;     // = totalUpStake (flat shares)
    uint256 totalDownShares;   // = totalDownStake (flat shares)
    uint256 upCount;           // Only populated during/after reveal
    uint256 downCount;         // Only populated during/after reveal
    bool upWins;
    uint256 settledAt;
    uint16 epochStartRating;
    uint64 revealDeadlineBlock; // NEW: block after which reveals are no longer accepted
}
```

#### Modified Vote struct

```solidity
struct Vote {
    address voter;
    uint256 stake;
    uint256 shares;       // = stake (flat shares, set at reveal time)
    bool isUp;            // Set at reveal time (meaningless before reveal)
    bool revealed;        // NEW: whether this vote has been revealed
    address frontend;
}
```

#### RoundConfig change

```solidity
struct RoundConfig {
    uint64 minEpochBlocks;
    uint64 maxEpochBlocks;
    uint256 maxDuration;
    uint256 minVoters;
    uint256 maxVoters;
    uint16 baseRateBps;
    uint16 growthRateBps;
    uint16 maxProbBps;
    uint256 liquidityParam;     // DEPRECATED: retained for storage layout, ignored in logic
    uint64 revealWindowBlocks;  // NEW: number of blocks for the reveal phase (e.g. 150 = ~5 min)
}
```

### 4.2 RoundVotingEngine.sol

#### New storage

```solidity
// contentId => roundId => voter => commitHash
mapping(uint256 => mapping(uint256 => mapping(address => bytes32))) public commitHashes;
```

#### commitVote() — replaces vote()

```solidity
/// @notice Commit a vote with hidden direction.
/// @param contentId The content to vote on.
/// @param commitHash keccak256(abi.encodePacked(contentId, roundId, msg.sender, isUp, salt))
/// @param stakeAmount Amount of cREP to stake (1-100).
/// @param frontend Frontend operator address for fee distribution.
function commitVote(
    uint256 contentId,
    bytes32 commitHash,
    uint256 stakeAmount,
    address frontend
) external nonReentrant whenNotPaused {
    // --- Validation (same as current _vote) ---
    // Stake range check (MIN_STAKE..MAX_STAKE)
    // Voter ID check
    // Submitter self-vote prevention
    // Content active check
    // 24h cooldown
    // Try to settle prior round
    // Get or create active round
    // Round must be Open (NOT Revealing) and not expired
    // One commit per voter per round
    // Voter cap
    // MAX_STAKE per Voter ID per content per round

    // --- Commit-specific logic ---
    // Transfer cREP stake
    crepToken.safeTransferFrom(msg.sender, address(this), stakeAmount);

    // Store commit (direction unknown — shares computed at reveal)
    commitHashes[contentId][roundId][msg.sender] = commitHash;
    votes[contentId][roundId][msg.sender] = RoundLib.Vote({
        voter: msg.sender,
        stake: stakeAmount,
        shares: 0,          // Set at reveal
        isUp: false,         // Set at reveal (placeholder)
        revealed: false,     // Not yet revealed
        frontend: frontend
    });

    // Track for iteration
    roundVoters[contentId][roundId].push(msg.sender);
    hasVoted[contentId][roundId][msg.sender] = true;

    // Update round counters (only aggregate stake, not direction)
    round.voteCount++;
    round.totalStake += stakeAmount;

    // Record cooldown and Voter ID stake
    // ...

    // NOTE: No rating update here — direction is hidden
    // NOTE: No VotePublished event with isUp — emit CommitPublished instead
    emit CommitPublished(contentId, roundId, msg.sender, stakeAmount);
}
```

#### Modified _trySettle() — triggers reveal phase

When `_shouldSettle()` returns true, instead of immediately executing settlement:

```solidity
function _trySettle(uint256 contentId, uint256 roundId) internal {
    RoundLib.Round storage round = rounds[contentId][roundId];
    RoundLib.RoundConfig memory roundCfg = _getRoundConfig(contentId, roundId);

    if (round.state != RoundLib.RoundState.Open) return;
    if (round.voteCount < roundCfg.minVoters) return;

    // Check expiry
    if (RoundLib.isExpired(round, roundCfg.maxDuration)) {
        round.state = RoundLib.RoundState.Cancelled;
        emit RoundCancelled(contentId, roundId);
        return;
    }

    if (!_shouldSettle(contentId, roundId, round, roundCfg)) return;

    // --- NEW: transition to Revealing instead of immediate settlement ---
    round.state = RoundLib.RoundState.Revealing;
    round.revealDeadlineBlock = uint64(block.number) + roundCfg.revealWindowBlocks;

    emit RevealWindowOpened(contentId, roundId, round.revealDeadlineBlock);
}
```

#### revealVote() — new function

```solidity
/// @notice Reveal a previously committed vote.
/// @param contentId The content ID.
/// @param roundId The round ID.
/// @param isUp The vote direction (true = UP, false = DOWN).
/// @param salt The random salt used in the commit hash.
function revealVote(
    uint256 contentId,
    uint256 roundId,
    bool isUp,
    bytes32 salt
) external nonReentrant {
    RoundLib.Round storage round = rounds[contentId][roundId];
    require(round.state == RoundLib.RoundState.Revealing, "Not in reveal phase");
    require(block.number <= round.revealDeadlineBlock, "Reveal window closed");

    RoundLib.Vote storage v = votes[contentId][roundId][msg.sender];
    require(v.voter == msg.sender, "No commit found");
    require(!v.revealed, "Already revealed");

    // Verify hash
    bytes32 expectedHash = keccak256(abi.encodePacked(contentId, roundId, msg.sender, isUp, salt));
    require(commitHashes[contentId][roundId][msg.sender] == expectedHash, "Hash mismatch");

    // Record direction and compute flat shares
    v.isUp = isUp;
    v.shares = v.stake;  // FLAT SHARES: 1 share per 1 cREP
    v.revealed = true;

    // Update round direction counters
    round.revealCount++;
    if (isUp) {
        round.totalUpStake += v.stake;
        round.totalUpShares += v.stake;  // = totalUpStake
        round.upCount++;
    } else {
        round.totalDownStake += v.stake;
        round.totalDownShares += v.stake;  // = totalDownStake
        round.downCount++;
    }

    // Update content rating as reveals come in
    uint16 newRating = RewardMath.calculateRating(round.totalUpStake, round.totalDownStake);
    try registry.updateRatingDirect(contentId, newRating) {} catch {}

    emit VoteRevealed(contentId, roundId, msg.sender, isUp, v.stake);
}
```

#### finalizeRound() — new function

```solidity
/// @notice Finalize a round after the reveal window closes.
/// @dev Callable by anyone (permissionless). Typically called by the keeper.
function finalizeRound(uint256 contentId, uint256 roundId) external nonReentrant {
    RoundLib.Round storage round = rounds[contentId][roundId];
    require(round.state == RoundLib.RoundState.Revealing, "Not in reveal phase");
    require(block.number > round.revealDeadlineBlock, "Reveal window still open");

    // Check minimum revealed voters
    if (round.revealCount < config.minVoters) {
        // Not enough reveals — cancel round
        // Revealed voters get full refund; unrevealed stakes go to treasury
        _cancelWithForfeiture(contentId, roundId, round);
        return;
    }

    // One-sided or two-sided?
    if (round.upCount == 0 || round.downCount == 0) {
        _executeConsensusSettlement(contentId, roundId, round);
    } else {
        _executeSettlement(contentId, roundId, round, _getRoundConfig(contentId, roundId));
    }

    // Handle unrevealed voters: forfeit their stakes
    _forfeitUnrevealedStakes(contentId, roundId, round);
}
```

#### _forfeitUnrevealedStakes() — new internal function

```solidity
/// @notice Forfeit stakes from voters who did not reveal.
/// @dev Unrevealed stakes are sent to the treasury. The voter loses everything.
function _forfeitUnrevealedStakes(uint256 contentId, uint256 roundId, RoundLib.Round storage round) internal {
    uint256 totalForfeited = 0;
    address[] storage voters = roundVoters[contentId][roundId];
    for (uint256 i = 0; i < voters.length; i++) {
        RoundLib.Vote storage v = votes[contentId][roundId][voters[i]];
        if (!v.revealed && v.stake > 0) {
            totalForfeited += v.stake;
            v.stake = 0;  // Prevent refund claims
            emit VoteForfeited(contentId, roundId, voters[i]);
        }
    }
    if (totalForfeited > 0) {
        crepToken.safeTransfer(treasury, totalForfeited);
    }
}
```

### 4.3 RewardMath.sol

#### calculateShares() change

```solidity
/// @notice Calculate shares for a vote (flat pricing).
/// @dev Each cREP staked = 1 share. No bonding curve.
/// @param stake The voter's stake amount.
/// @return shares Equal to stake.
function calculateShares(uint256 stake) internal pure returns (uint256) {
    return stake;
}
```

The `sameDirectionStake` and `b` parameters are removed. Callers simplified accordingly.

#### Everything else unchanged

`calculateRating()`, `calculateVoterReward()`, `splitPool()`, `calculateConsensusSubsidy()`, and `splitConsensusSubsidy()` remain exactly as-is. The reward distribution math is identical — only the share calculation changes.

### 4.4 RoundRewardDistributor.sol

#### claimReward() change

The only change: add a check that the voter revealed their vote.

```solidity
function claimReward(uint256 contentId, uint256 roundId) external nonReentrant {
    // ... existing checks ...
    RoundLib.Vote memory v = votingEngine.getVote(contentId, roundId, msg.sender);
    require(v.voter == msg.sender, "No vote found");
    require(v.revealed, "Vote not revealed");  // NEW: must have revealed

    bool voterWon = (v.isUp == round.upWins);
    // ... rest unchanged ...
}
```

### 4.5 Keeper changes

The keeper (`packages/keeper/`) needs to:

1. **Monitor `RevealWindowOpened` events** — when a round enters `Revealing` state
2. **Wait for `revealDeadlineBlock`** — then call `finalizeRound(contentId, roundId)`
3. The existing `trySettle()` call pattern remains the same for triggering the transition to `Revealing`

### 4.6 Frontend changes

1. **Vote submission**: generate a random 32-byte salt client-side, compute `commitHash`, call `commitVote()`. Store `{salt, isUp, contentId, roundId}` in localStorage.
2. **Listen for `RevealWindowOpened`**: when the round enters `Revealing`, prompt the user to reveal. Auto-submit `revealVote()` if the user is online and has the salt stored.
3. **Display during commit phase**: show total committed stake, number of voters, but NOT the directional split. The vote direction badges (UP/DOWN counts) are hidden until reveals.
4. **Salt recovery**: if localStorage is cleared, the user cannot reveal and loses their stake. The UI should warn about this and optionally offer encrypted backup.

### 4.7 Ponder indexer changes

1. **New events to index**: `CommitPublished`, `RevealWindowOpened`, `VoteRevealed`, `VoteForfeited`
2. **Schema update**: add `revealed` boolean and `revealDeadlineBlock` to vote/round tables
3. **API**: the `/votes` endpoint should indicate whether each vote has been revealed. During the commit phase, `isUp` should be `null` for unrevealed votes.

---

## 5. Commit Hash Construction

```solidity
bytes32 commitHash = keccak256(abi.encodePacked(
    contentId,      // uint256 — prevents replay across content
    roundId,        // uint256 — prevents replay across rounds
    msg.sender,     // address — prevents copying another voter's hash
    isUp,           // bool    — the hidden vote direction
    salt            // bytes32 — random entropy, prevents brute-force
));
```

**Security properties:**
- `msg.sender` inclusion prevents an attacker from copying a commit hash to a different address
- `roundId` prevents replaying a commit from a previous round
- `salt` (32 bytes of entropy) prevents brute-forcing the binary `isUp` value (without the salt, there are only 2 possible hashes per voter per round)
- The contract verifies `msg.sender` at both commit and reveal time

**Client-side salt generation:**
```typescript
const salt = ethers.hexlify(ethers.randomBytes(32));
// Store in localStorage: key = `curyo-vote-${contentId}-${roundId}-${address}`
localStorage.setItem(key, JSON.stringify({ salt, isUp, stakeAmount }));
```

---

## 6. Reveal Window Design

### 6.1 Duration

The reveal window should be short enough to not delay settlement significantly, but long enough for voters to submit transactions:

| Chain | Block time | 150 blocks | 300 blocks |
|-------|-----------|------------|------------|
| Celo L2 | 2s | 5 min | 10 min |
| Ethereum L1 | 12s | 30 min | 60 min |

**Recommendation: 150 blocks (≈5 minutes on Celo).** This is long enough for a voter to see the notification and submit one transaction, short enough to not meaningfully delay settlement.

### 6.2 Auto-reveal

The frontend should auto-reveal when the user is online:

1. Subscribe to `RevealWindowOpened` events via WebSocket
2. Check localStorage for matching `{contentId, roundId}` entries
3. Automatically submit `revealVote()` — no user interaction needed if salt is stored
4. Show a toast notification: "Your vote on [content] has been revealed"

If the user is offline during the reveal window, they lose their stake. This is the primary UX risk and should be clearly communicated at commit time.

### 6.3 New commits during reveal phase

The round does NOT accept new commits during the `Revealing` phase. The `commitVote()` function checks `round.state == RoundState.Open`.

---

## 7. Unrevealed Vote Handling

### 7.1 Default: forfeit to treasury

Unrevealed stakes are sent to the governance treasury. This is the simplest approach and creates a strong incentive to reveal (you lose your entire 1-100 cREP stake).

### 7.2 Insufficient reveals

If fewer than `minVoters` voters reveal, the round is cancelled:

- **Revealed voters**: full stake refund (they did nothing wrong)
- **Unrevealed voters**: stakes forfeited to treasury
- **No rewards distributed**

### 7.3 Edge case: all voters on one side don't reveal

If all UP voters reveal but no DOWN voters reveal (or vice versa), the round becomes one-sided. The consensus subsidy mechanism applies, same as current behavior for unanimous rounds.

---

## 8. Impact on Known Attack Vectors

### Attacks that improve

| Attack | Current | With flat shares + commit-reveal | Why |
|--------|---------|--------------------------------|-----|
| **First-mover MEV** (A.3, B.3) | Validators front-run for bonding curve advantage | **Eliminated.** Direction is hidden; flat shares mean no advantage from ordering | Direction hidden + no share advantage from position |
| **Information cascades** (B.4) | Bonding curve slows herding but doesn't prevent it | **Greatly reduced.** Voters cannot see which side is ahead | Vote direction hidden during commit phase |
| **Race to vote first** (A.3) | Strong incentive to vote early for more shares | **Eliminated.** All shares equal regardless of timing | Flat shares remove timing incentive |
| **Governance-tunable b** (A.3) | Reducing `b` flattens curve, changing equilibrium | **Eliminated.** No `b` parameter in share calculation | Bonding curve removed entirely |
| **Settlement front-running** (B.3) | Validator submits last-second vote knowing outcome | **Greatly reduced.** Cannot submit commits during reveal phase; direction hidden | No new commits after settlement triggers |

### Attacks unchanged

| Attack | Why unchanged |
|--------|--------------|
| **L2 sequencer control of `block.prevrandao`** (A.4) | Same randomness source used for `_shouldSettle()` |
| **~50% deterministic settlement** (A.4) | Same settlement probability model |
| **Consensus subsidy paradox** (C.2) | Same subsidy economics |
| **Slash threshold** (C.4) | Rating formula unchanged |
| **Strategic abstention** (A.2) | Voters can still choose not to vote |

### Attacks that change character

| Attack | Current | With flat shares + commit-reveal |
|--------|---------|--------------------------------|
| **minVoters seeding** (A.5, B.1) | Attacker controls 2+ identities on one side, waits for 1 contrarian | Direction is hidden, so attacker cannot selectively wait for contrarians. However, attacker with 2 identities can commit opposite directions (1 UP, 1 DOWN) to guarantee being on both sides. With flat shares, the winning identity gets `(stake / totalWinningStake) * voterPool` and the losing identity forfeits. Net profit depends on pool size. |
| **2-person collusion** (B.2) | Undetectable, limited by share allocation | Commit-reveal prevents seeing others' directions, so colluders cannot adapt. They must pre-commit to a strategy. Benefit is limited to having 2 votes instead of 1. |
| **Cross-content portfolio** (B.5) | Exploit first-mover bonding curve advantage across content | With flat shares, no positional advantage exists. Cross-content voting is just diversification, not exploitation. |
| **Sybil attacks** (B.6) | Extra identities get diminishing bonding curve returns | With flat shares, extra identities provide linear scaling (no diminishing returns). But without being able to see others' votes, Sybils cannot strategically time or direct their votes. The hedge strategy (1 UP, 1 DOWN from 2 identities) is the main concern. |

### The hedge attack (new concern)

With commit-reveal, an attacker with 2 identities can commit one UP and one DOWN on the same content. After settlement, one wins and one loses. The net result:

- Winner gets: `stake + (stake / totalWinningStake) * voterPool`
- Loser gets: 0 (forfeits stake)
- Net = `(stake / totalWinningStake) * voterPool - losingStake`

With equal stakes and balanced pools, this is approximately zero or slightly negative (the 82% pool split means the attacker only recovers 82% of their losing stake through the winning identity). With unequal stakes, the attacker can weight their winning identity more — but they don't know which side will win, so they're essentially gambling.

**This attack is not profitable in expectation if the attacker doesn't know the outcome.** Commit-reveal ensures they don't.

---

## 9. What About Live Rating Updates?

Currently, the content rating updates immediately after each vote (`RoundVotingEngine.sol:524-526`). With commit-reveal, the direction is hidden during the commit phase, so the rating cannot update in real-time.

### Approach: deferred rating update

- **During commit phase**: the content rating remains at its pre-round value (or the value from the previous round's settlement)
- **During reveal phase**: as each voter reveals, the rating updates incrementally using the same `calculateRating()` formula
- **After finalize**: the rating reflects the final directional split

**Trade-off**: the live rating on the content page will not reflect the current round's votes until reveals happen. This is acceptable because:
1. The rating from previous rounds is still displayed
2. The total committed stake (without direction) still signals engagement
3. Real-time rating accuracy was already limited by the bonding curve's share distortion

### UI display during commit phase

```
Rating: 72 (from previous round)
Active round: 5 votes committed · 280 cREP staked
[Directions hidden until settlement]
```

---

## 10. Gas Analysis

### Per-voter cost comparison

| Operation | Current (1 tx) | Commit-reveal (2 tx) | Delta |
|-----------|---------------|---------------------|-------|
| Commit tx base | — | 21,000 | +21,000 |
| Store commitHash (SSTORE cold) | — | 22,100 | +22,100 |
| Store Vote struct | 67,000 | 45,000 (partial, no shares/isUp) | -22,000 |
| cREP transfer | 25,000 | 25,000 | 0 |
| Bonding curve calc | 3,000 | 0 (flat shares) | -3,000 |
| Rating update | 5,000 | 0 (deferred) | -5,000 |
| **Commit total** | — | **~113,000** | — |
| | | | |
| Reveal tx base | — | 21,000 | +21,000 |
| Hash verification (SLOAD + keccak) | — | 2,200 | +2,200 |
| Update Vote struct (SSTORE warm) | — | 5,000 | +5,000 |
| Update round counters | — | 5,000 | +5,000 |
| Rating update | — | 5,000 | +5,000 |
| **Reveal total** | — | **~38,200** | — |
| | | | |
| **Current single-tx total** | **~100,000** | — | — |
| **Commit + Reveal total** | — | **~151,200** | **+51,200** |

**Net overhead: ≈51,000 gas per voter (≈51% increase).** On Celo L2 at typical gas prices (<0.001 gwei), this is well under $0.01 per voter.

### Settlement gas

`finalizeRound()` adds a loop over unrevealed voters to forfeit stakes. This is O(n) where n = number of unrevealed voters. With `maxVoters = 1000`, worst case is iterating 1000 voters. At ~5,000 gas per iteration (SLOAD + SSTORE), this is ≈5M gas — within block gas limits but expensive. Optimization: track unrevealed count and total unrevealed stake in the Round struct to avoid iteration.

---

## 11. Migration Path

### Storage layout compatibility

The `RoundLib.Round` struct gets new fields appended (`revealCount`, `revealDeadlineBlock`). The `Vote` struct gets `revealed`. Since the contract uses UUPS upgradeable pattern, new fields must be appended (never inserted or reordered).

**Breaking change**: the `shares` field in `Vote` changes semantics (from bonding curve shares to flat = stake). Old settled rounds with bonding curve shares remain claimable as-is. New rounds after upgrade use flat shares.

### Migration steps

1. Deploy updated `RoundLib`, `RewardMath`, `RoundVotingEngine`, and `RoundRewardDistributor`
2. All existing settled/cancelled/tied rounds are unaffected (claims work as before)
3. Any in-progress `Open` rounds at upgrade time: allow them to settle under old rules (bonding curve), or cancel and refund
4. New rounds created after upgrade use commit-reveal + flat shares
5. Remove `liquidityParam` from governance-configurable parameters; add `revealWindowBlocks`
6. Update frontend to commit-reveal flow
7. Update keeper to handle `RevealWindowOpened` and `finalizeRound()`
8. Update Ponder indexer for new events and schema

---

## 12. UX Considerations

### 12.1 Salt management

The salt is the voter's "reveal key." Losing it means losing the stake. Mitigations:

1. **localStorage** (default): store `{salt, isUp, contentId, roundId}` keyed by wallet address. Works across page reloads but not across devices/browsers.
2. **Deterministic salt** (alternative): derive salt from the user's wallet signature: `salt = keccak256(sign("Curyo vote: " + contentId + "-" + roundId))`. This makes the salt recoverable from the wallet — no localStorage needed. The signature request happens at commit time. **Recommended approach** — eliminates the risk of lost salts entirely.
3. **Backend backup** (optional): encrypt and store the salt in the user's profile on the backend. Adds a centralization point but provides recovery.

### 12.2 Reveal UX

With deterministic salts (option 2 above) and auto-reveal:

1. User clicks "Vote UP" and signs one transaction (commit)
2. Frontend stores the vote locally
3. When settlement triggers, frontend auto-submits the reveal transaction using the same wallet signature to re-derive the salt
4. User sees a notification: "Your vote has been revealed"
5. If user is offline, the frontend reveals on next visit (if within reveal window)

**Worst case**: user votes from a device, wipes it, and is offline during the 5-minute reveal window. They lose their stake (1-100 cREP). This is the primary UX risk.

### 12.3 What voters see during the round

```
                    ┌─────────────────────────────┐
                    │ "Interstellar" review video  │
                    │ Rating: 72                   │
                    │                              │
                    │ Round #3 · 7 votes committed │
                    │ 420 cREP staked              │
                    │                              │
                    │ Directions hidden until       │
                    │ settlement                   │
                    │                              │
                    │ Settles within 18h 32m       │
                    │                              │
                    │ [Vote UP ▲]  [Vote DOWN ▼]   │
                    └─────────────────────────────┘
```

The key difference from current UI: no UP/DOWN vote counts or stake split visible. Only total committed stake and voter count.

---

## 13. Comparison with Alternative Approaches

| Property | Current (bonding curve) | Flat + commit-reveal | Strike price | Flat only (no commit-reveal) |
|----------|------------------------|---------------------|--------------|------------------------------|
| Early-mover advantage | Strong (mechanical) | None (mechanical), natural (informational) | Strong (strike-based) | None |
| Anti-herding | Bonding curve price | Vote secrecy | Strike price difficulty | Parimutuel only |
| MEV resistance | Low | High | Low | Low |
| Complexity | Medium | Medium | High | Low |
| UX (transactions) | 1 | 2 (or 1.5 with auto-reveal) | 1 | 1 |
| Bracket attacks | Not possible | Not possible | Critical vulnerability | Not applicable |
| Information cascades | Partially mitigated | Strongly mitigated | Different character | Unmitigated |
| Live rating | Yes | Deferred to reveal | Yes | Yes |
| Off-chain coordination | Possible | Possible (not eliminated) | Possible | Possible |

---

## 14. What This Design Does NOT Solve

1. **Off-chain coordination**: voters can still coordinate via Discord, Telegram, etc. Commit-reveal only hides on-chain signals.
2. **L2 sequencer manipulation of `block.prevrandao`**: same randomness source. Consider Chainlink VRF for future improvement.
3. **~50% deterministic settlement**: same settlement probability model. The reveal window adds ≈5 minutes to settlement time.
4. **Consensus subsidy drain**: same economics. Successful curation still drains the subsidy reserve.
5. **"Always vote UP" degenerate equilibrium**: same fundamental issue — no mechanism-internal force penalizes this equilibrium.
6. **Dark DAO vote buying**: TEE-based vote-buying schemes can circumvent commit-reveal (Cornell research, 2023). This is a fundamental limitation of all commit-reveal schemes.
7. **Slash threshold**: rating formula unchanged, so the ≤10 slash threshold remains nearly unreachable.

---

## 15. Future: Threshold Encryption (V2)

Threshold encryption (e.g., Shutter Network) would replace commit-reveal with a single-transaction flow:

1. Voter encrypts their vote with a public key
2. Submits encrypted blob on-chain (1 transaction)
3. After settlement triggers, a distributed keyper network releases the decryption key
4. Keeper decrypts all votes and finalizes

**Advantages over commit-reveal:**
- Single transaction (better UX)
- No lost votes from missed reveals
- No salt management
- Stronger privacy (no dictionary attacks, though the binary vote space makes this marginal)

**Why not now:**
- Shutter's OP Stack support is testnet-only (SHOP on Sepolia); Celo L2 not yet supported
- Small keyper set (4-of-7) with explicit early-stage warnings
- Fixed `decryptionTimestamp` conflicts with Curyo's random settlement timing
- No production examples of on-chain voting contracts (only Snapshot off-chain voting)

**When to consider:** once Shutterized OP Stack reaches mainnet, the keyper set expands to 21+, and event-triggered decryption is supported.

---

## 16. Open Design Questions

1. **Should the reveal window be configurable via governance?** Shorter = less delay, higher risk of missed reveals. Longer = safer but delays settlement.

2. **Deterministic vs random salt?** Deterministic (wallet-derived) eliminates lost-salt risk but requires an additional signature at commit time. Random is simpler but riskier.

3. **Forfeit destination: treasury vs winning pool?** Forfeiting to treasury is neutral; forfeiting to the winning pool creates an incentive for attackers to discourage reveals (e.g., DDoS the frontend during reveal window). Treasury is safer.

4. **Should the keeper auto-reveal on behalf of users?** The keeper could store encrypted vote data and reveal automatically. This adds a centralization point but dramatically improves UX. Could be opt-in per user.

5. **Participation pool interaction**: currently, losers receive a participation bonus (up to 90% of stake at tier 0). With commit-reveal, unrevealed voters who "lose" by not revealing should NOT receive participation bonuses — they didn't participate in the reveal phase.

6. **Frontend fee tracking during commit phase**: currently, frontend fees are aggregated at vote time based on the frontend address. With commit-reveal, the frontend is recorded at commit time (visible), which is fine — the aggregation logic is unchanged.

---

## 17. Summary of Contract File Changes

| File | Change |
|------|--------|
| `RoundLib.sol` | Add `Revealing` state to enum. Add `revealCount`, `revealDeadlineBlock` to Round. Add `revealed` to Vote. Add `revealWindowBlocks` to RoundConfig. |
| `RewardMath.sol` | Simplify `calculateShares()` to return `stake`. Remove `sameDirectionStake` and `b` parameters. |
| `RoundVotingEngine.sol` | Add `commitHashes` mapping. Replace `_vote()` with `commitVote()`. Add `revealVote()`. Add `finalizeRound()`. Add `_forfeitUnrevealedStakes()`. Modify `_trySettle()` to transition to `Revealing`. Add new events: `CommitPublished`, `RevealWindowOpened`, `VoteRevealed`, `VoteForfeited`. Deprecate `liquidityParam` in config. |
| `RoundRewardDistributor.sol` | Add `v.revealed` check in `claimReward()`. |
| Keeper | Add `RevealWindowOpened` listener. Add `finalizeRound()` call after reveal deadline. |
| Frontend | Generate salt + commitHash. Store vote data locally. Auto-reveal on `RevealWindowOpened` event. Hide directional UI during commit phase. |
| Ponder | Index new events. Add `revealed` field. Hide `isUp` for unrevealed votes in API. |

---

## References

- Ottaviani & Sorensen (2006), "The Timing of Bets and the Favorite-Longshot Bias" — sequential parimutuel timing incentives
- Ottaviani & Sorensen (2010), "Noise, Information, and the Favorite-Longshot Bias in Parimutuel Predictions"
- Chen & Pennock (2007), "A Utility Framework for Bounded-Loss Market Makers"
- Crawford, Gneezy & Rottenstreich (2008), "The Power of Focal Points Is Limited" — payoff asymmetry and coordination failure
- Ali & Kartik, "A Theory of Information Cascades in Sequential Voting" — herding in sequential games
- ConsenSys PLCRVoting — production commit-reveal implementation
- UMA DVM 2.0 — commit-reveal with slashing for missed reveals
- Shutter Network — threshold encryption as commit-reveal replacement
- Cornell Dark DAO research (2023) — TEE-based vote buying circumventing commit-reveal
