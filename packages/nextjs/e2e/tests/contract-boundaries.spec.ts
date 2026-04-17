import { approveCREP, commitVoteDirect, submitContentDirect, waitForPonderIndexed } from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { getContentList } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

/**
 * Contract boundary tests — verifies on-chain reverts for invalid operations.
 *
 * Uses direct contract calls (no browser/UI) to test edge cases with commitVote:
 * 1. Commit with stake below MIN_STAKE (1 cREP) → InvalidStake
 * 2. Commit with stake above MAX_STAKE (100 cREP) → InvalidStake
 * 3. Self-vote (submitter commits on own content) → SelfVote
 * 4. Double commit in same round → AlreadyCommitted
 *
 * Account allocation:
 * - Account #2 — submitter of seeded content #1 (self-vote test)
 * - Account #3 — voter for boundary tests
 * - Account #4 — voter for double-commit test
 * - Account #10 — submits fresh content for double-commit test
 */
test.describe("Contract boundary conditions", () => {
  const VOTING_ENGINE = CONTRACT_ADDRESSES.RoundVotingEngine;
  const CREP_TOKEN = CONTRACT_ADDRESSES.CuryoReputation;
  const CONTENT_REGISTRY = CONTRACT_ADDRESSES.ContentRegistry;
  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

  test("commit with stake below MIN_STAKE (1 cREP) reverts", async () => {
    const voter = ANVIL_ACCOUNTS.account3;
    const belowMinStake = BigInt(500_000); // 0.5 cREP (MIN_STAKE = 1 cREP = 1e6)

    // Approve the tiny amount
    await approveCREP(VOTING_ENGINE, belowMinStake, voter.address, CREP_TOKEN);

    // Use seeded content #1 (submitted by account #2)
    const result = await commitVoteDirect(BigInt(1), true, belowMinStake, ZERO_ADDRESS, voter.address, VOTING_ENGINE);
    expect(result.success, "Commit with below-MIN_STAKE should revert").toBe(false);
  });

  test("commit with stake above MAX_STAKE (100 cREP) reverts", async () => {
    const voter = ANVIL_ACCOUNTS.account3;
    const aboveMaxStake = BigInt(101e6); // 101 cREP (MAX_STAKE = 100 cREP)

    // Approve the large amount
    await approveCREP(VOTING_ENGINE, aboveMaxStake, voter.address, CREP_TOKEN);

    // Use seeded content #1
    const result = await commitVoteDirect(BigInt(1), true, aboveMaxStake, ZERO_ADDRESS, voter.address, VOTING_ENGINE);
    expect(result.success, "Commit with above-MAX_STAKE should revert").toBe(false);
  });

  test("self-vote (submitter commits on own content) reverts", async () => {
    // Content #1 was submitted by account #2
    const submitter = ANVIL_ACCOUNTS.account2;
    const stake = BigInt(1e6); // 1 cREP

    await approveCREP(VOTING_ENGINE, stake, submitter.address, CREP_TOKEN);

    const result = await commitVoteDirect(BigInt(1), true, stake, ZERO_ADDRESS, submitter.address, VOTING_ENGINE);
    expect(result.success, "Self-vote should revert with SelfVote").toBe(false);
  });

  test("double commit in same round reverts", async () => {
    test.setTimeout(60_000);

    // Ask a fresh question so we get a clean round with no existing votes
    const submitter = ANVIL_ACCOUNTS.account10;
    await approveCREP(CONTENT_REGISTRY, BigInt(10e6), submitter.address, CREP_TOKEN);

    const uniqueId = Date.now();
    const submitted = await submitContentDirect(
      `https://www.youtube.com/watch?v=double_vote_test_${uniqueId}`,
      `Double Vote Test ${uniqueId}`,
      `Double vote test description ${uniqueId}`,
      "test",
      1,
      submitter.address,
      CONTENT_REGISTRY,
    );
    expect(submitted, "Content submission failed").toBe(true);

    // Wait for Ponder to index
    let freshContentId: string | null = null;
    const indexed = await waitForPonderIndexed(async () => {
      const { items } = await getContentList({ status: "all", sortBy: "newest", limit: 5 });
      const match = items.find(item => item.url.includes(`double_vote_test_${uniqueId}`));
      if (match) {
        freshContentId = match.id;
        return true;
      }
      return false;
    }, 60_000);
    expect(indexed).toBe(true);
    expect(freshContentId).toBeTruthy();

    // First commit should succeed
    const voter = ANVIL_ACCOUNTS.account4;
    const stake = BigInt(1e6); // 1 cREP
    await approveCREP(VOTING_ENGINE, stake * 2n, voter.address, CREP_TOKEN);

    const firstCommit = await commitVoteDirect(
      BigInt(freshContentId!),
      true,
      stake,
      ZERO_ADDRESS,
      voter.address,
      VOTING_ENGINE,
    );
    expect(firstCommit.success, "First commit should succeed").toBe(true);

    // Second commit on same content in same round should revert
    const secondCommit = await commitVoteDirect(
      BigInt(freshContentId!),
      false,
      stake,
      ZERO_ADDRESS,
      voter.address,
      VOTING_ENGINE,
    );
    expect(secondCommit.success, "Double commit should revert with AlreadyCommitted").toBe(false);
  });
});
