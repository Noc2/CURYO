import { approveCREP, markDormant, reviveContent, waitForPonderIndexed } from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { fastForwardTime } from "../helpers/keeper";
import { getContentById, getContentList } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

/**
 * Content dormancy lifecycle tests.
 * Triggers Ponder events: ContentDormant, ContentRevived.
 *
 * Requires a 30-day time skip via evm_increaseTime. Must run AFTER all normal
 * tests to avoid disrupting time-sensitive operations (voting, settlement).
 *
 * Account allocation:
 * - Account #0 (deployer) — calls markDormant (permissionless, but we use #0 for simplicity)
 * - Account #2 (1000 cREP + VoterID) — revives dormant content (requires 5 cREP stake)
 */
test.describe("Content dormancy lifecycle", () => {
  test.describe.configure({ mode: "serial" });

  const CONTENT_REGISTRY = CONTRACT_ADDRESSES.ContentRegistry;
  const CREP_TOKEN = CONTRACT_ADDRESSES.CuryoReputation;

  // DORMANCY_PERIOD = 30 days = 2_592_000 seconds
  const DORMANCY_SECONDS = 2_592_001; // 30 days + 1 second buffer

  let dormantContentId: string | null = null;

  test("mark content as dormant after 30-day time skip", async () => {
    test.setTimeout(120_000);

    // Find an active piece of seeded content to mark as dormant.
    // Use content from the seed (not from E2E-submitted content which may have votes).
    let targetContentId: string | null = null;
    try {
      const { items } = await getContentList({ status: "0", limit: 50 });
      // Pick content that's still active (status=0) and hasn't been touched by other tests.
      // Seeded content IDs start at 1. Pick one near the end that's less likely to have votes.
      for (const item of items) {
        const id = parseInt(item.id);
        if (id >= 8 && id <= 13 && item.status === 0) {
          targetContentId = item.id;
          break;
        }
      }
      // Fallback: use any active content
      if (!targetContentId && items.length > 0) {
        targetContentId = items[items.length - 1].id;
      }
    } catch {
      test.skip(true, "Ponder not available — cannot find content for dormancy test");
      return;
    }

    if (!targetContentId) {
      test.skip(true, "No active content available for dormancy test");
      return;
    }

    // Verify it's active before time skip
    const { content: before } = await getContentById(targetContentId);
    expect(before.status).toBe(0);

    // Fast-forward 30+ days
    await fastForwardTime(DORMANCY_SECONDS);

    // Mark as dormant (permissionless after dormancy period)
    const success = await markDormant(BigInt(targetContentId), ANVIL_ACCOUNTS.account0.address, CONTENT_REGISTRY);
    expect(success).toBe(true);

    // Wait for Ponder to index the dormancy (60s — after 30-day time skip Ponder needs time)
    const indexed = await waitForPonderIndexed(async () => {
      const { content } = await getContentById(targetContentId!);
      return content.status === 1; // Dormant
    }, 60_000);

    expect(indexed, "Ponder did not index dormancy within 60s — on-chain tx succeeded").toBe(true);

    dormantContentId = targetContentId;
    const { content: after } = await getContentById(targetContentId);
    expect(after.status).toBe(1); // Dormant
  });

  test("revive dormant content and Ponder indexes revival", async () => {
    test.skip(!dormantContentId, "No dormant content from previous test");
    test.setTimeout(60_000);

    // Approve 5 cREP (5e6) to ContentRegistry for the revival stake
    const approveSuccess = await approveCREP(
      CONTENT_REGISTRY,
      BigInt(5e6),
      ANVIL_ACCOUNTS.account2.address,
      CREP_TOKEN,
    );
    expect(approveSuccess).toBe(true);

    // Revive content (account #2 stakes 5 cREP)
    const success = await reviveContent(BigInt(dormantContentId!), ANVIL_ACCOUNTS.account2.address, CONTENT_REGISTRY);
    expect(success).toBe(true);

    // Wait for Ponder to index the revival (60s — large time skips slow Ponder)
    const indexed = await waitForPonderIndexed(async () => {
      const { content } = await getContentById(dormantContentId!);
      return content.status === 0; // Active again
    }, 60_000);

    expect(indexed, "Ponder did not index revival within 60s — on-chain tx succeeded").toBe(true);

    const { content: after } = await getContentById(dormantContentId!);
    expect(after.status).toBe(0); // Active
  });

  test("second dormancy + revival cycle succeeds (revival #2)", async () => {
    test.skip(!dormantContentId, "No content from previous tests");
    test.setTimeout(120_000);

    // Fast-forward another 30 days
    await fastForwardTime(DORMANCY_SECONDS);

    // Mark dormant again
    const markSuccess = await markDormant(BigInt(dormantContentId!), ANVIL_ACCOUNTS.account0.address, CONTENT_REGISTRY);
    expect(markSuccess).toBe(true);

    // Approve + revive (2nd revival)
    const approveSuccess = await approveCREP(
      CONTENT_REGISTRY,
      BigInt(5e6),
      ANVIL_ACCOUNTS.account2.address,
      CREP_TOKEN,
    );
    expect(approveSuccess).toBe(true);

    const reviveSuccess = await reviveContent(
      BigInt(dormantContentId!),
      ANVIL_ACCOUNTS.account2.address,
      CONTENT_REGISTRY,
    );
    expect(reviveSuccess).toBe(true);

    // Verify content is active again (60s timeout for Ponder after time skips)
    const indexed = await waitForPonderIndexed(async () => {
      const { content } = await getContentById(dormantContentId!);
      return content.status === 0;
    }, 60_000);

    expect(indexed, "Ponder did not index 2nd revival within 60s — on-chain tx succeeded").toBe(true);

    const { content } = await getContentById(dormantContentId!);
    expect(content.status).toBe(0);
  });

  test("third revival attempt is rejected (MAX_REVIVALS = 2)", async () => {
    test.skip(!dormantContentId, "No content from previous tests");
    test.setTimeout(120_000);

    // Fast-forward another 30 days
    await fastForwardTime(DORMANCY_SECONDS);

    // Mark dormant again
    const markSuccess = await markDormant(BigInt(dormantContentId!), ANVIL_ACCOUNTS.account0.address, CONTENT_REGISTRY);
    expect(markSuccess).toBe(true);

    // Approve cREP for the revival attempt
    await approveCREP(CONTENT_REGISTRY, BigInt(5e6), ANVIL_ACCOUNTS.account2.address, CREP_TOKEN);

    // 3rd revival should FAIL (MAX_REVIVALS = 2)
    const reviveSuccess = await reviveContent(
      BigInt(dormantContentId!),
      ANVIL_ACCOUNTS.account2.address,
      CONTENT_REGISTRY,
    );
    expect(reviveSuccess).toBe(false);
  });
});
