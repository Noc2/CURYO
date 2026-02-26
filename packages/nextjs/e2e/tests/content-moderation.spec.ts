import {
  approveCREP,
  cancelContent,
  flagContent,
  submitContentDirect,
  transferCREP,
  waitForPonderIndexed,
} from "../helpers/admin-helpers";
import { ANVIL_ACCOUNTS, DEPLOYER } from "../helpers/anvil-accounts";
import { CONTRACT_ADDRESSES } from "../helpers/contracts";
import { getContentById, getContentList } from "../helpers/ponder-api";
import { expect, test } from "@playwright/test";

/**
 * Content moderation tests (contract-level).
 * Triggers Ponder events: ContentCancelled, ContentFlagged, SubmitterStakeSlashed.
 *
 * Account allocation:
 * - Account #2 (cREP + VoterID) — submits content, cancels own content
 * - Account #9 (deployer = governance in mock mode) — funds account #2, flags content
 *
 * All interactions use direct contract calls for reliability.
 */
test.describe("Content moderation", () => {
  test.describe.configure({ mode: "serial" });

  const CONTENT_REGISTRY = CONTRACT_ADDRESSES.ContentRegistry;
  const CREP_TOKEN = CONTRACT_ADDRESSES.CuryoReputation;
  const SUBMITTER = ANVIL_ACCOUNTS.account2.address;
  // MIN_SUBMITTER_STAKE = 10 cREP = 10e6
  const SUBMIT_STAKE = BigInt(10e6);

  let cancelledContentId: string | null = null;
  let flaggedContentId: string | null = null;

  /**
   * Helper: submit content via contract call and wait for Ponder to index it.
   * Returns the new content ID, or null if Ponder didn't index in time.
   */
  async function submitAndWaitForPonder(suffix: string): Promise<string | null> {
    // Snapshot current content IDs
    let initialIds: string[] = [];
    try {
      const { items } = await getContentList({ status: "all", limit: 200 });
      initialIds = items.map(c => c.id);
    } catch {
      // Ponder may not be available
    }

    // Top up cREP for submission stake (deployer has ~10M)
    await transferCREP(SUBMITTER, SUBMIT_STAKE * 2n, DEPLOYER.address, CREP_TOKEN);

    // Approve cREP for ContentRegistry
    await approveCREP(CONTENT_REGISTRY, SUBMIT_STAKE, SUBMITTER, CREP_TOKEN);

    // Submit content
    const uniqueId = Date.now();
    const url = `https://www.youtube.com/watch?v=${suffix}_${uniqueId}`;
    const ok = await submitContentDirect(
      url,
      `${suffix} Test ${uniqueId}`,
      "test",
      BigInt(1),
      SUBMITTER,
      CONTENT_REGISTRY,
    );
    expect(ok, "Content submission should succeed").toBe(true);

    // Poll Ponder until the new content appears
    let newContentId: string | null = null;
    const found = await waitForPonderIndexed(async () => {
      const { items } = await getContentList({ status: "all", limit: 200 });
      const newItem = items.find(c => !initialIds.includes(c.id));
      if (newItem) {
        newContentId = newItem.id;
        return true;
      }
      return false;
    });

    return found ? newContentId : null;
  }

  test("user cancels own content before votes", async () => {
    test.setTimeout(90_000);

    const contentId = await submitAndWaitForPonder("cancel_mod");
    expect(contentId, "Ponder should index the new content").not.toBeNull();

    // Verify it's active (status=0)
    const { content: before } = await getContentById(contentId!);
    expect(before.status).toBe(0);

    // Cancel content — submitter (account #2) calls cancelContent
    const success = await cancelContent(BigInt(contentId!), SUBMITTER, CONTENT_REGISTRY);
    expect(success).toBe(true);

    // Wait for Ponder to index the cancellation
    const indexed = await waitForPonderIndexed(async () => {
      const { content } = await getContentById(contentId!);
      return content.status === 2; // Cancelled
    });
    expect(indexed, "Ponder should index the cancellation").toBe(true);

    cancelledContentId = contentId;
    const { content: after } = await getContentById(contentId!);
    expect(after.status).toBe(2);
  });

  test("moderator flags content", async () => {
    test.setTimeout(90_000);

    const contentId = await submitAndWaitForPonder("flag_mod");
    expect(contentId, "Ponder should index the new content").not.toBeNull();

    // Verify it's active (status=0)
    const { content: before } = await getContentById(contentId!);
    expect(before.status).toBe(0);

    // Flag content — deployer has MODERATOR_ROLE
    const success = await flagContent(BigInt(contentId!), DEPLOYER.address, CONTENT_REGISTRY);
    expect(success).toBe(true);

    // Wait for Ponder to index the flagging
    const indexed = await waitForPonderIndexed(async () => {
      const { content } = await getContentById(contentId!);
      return content.status === 3; // Flagged
    });
    expect(indexed, "Ponder should index the flagging").toBe(true);

    flaggedContentId = contentId;
    const { content: after } = await getContentById(contentId!);
    expect(after.status).toBe(3);

    // Verify SubmitterStakeSlashed was also indexed:
    // flagContent() → _slashContent() → slashSubmitterStake() sets this to true
    expect(after.submitterStakeReturned).toBe(true);
  });

  test("flagged and cancelled content filtered from default feed", async () => {
    test.skip(!cancelledContentId && !flaggedContentId, "No cancelled or flagged content from previous tests");
    test.setTimeout(30_000);

    // Default feed (status=0, active only) should NOT contain them
    const { items: activeItems } = await getContentList({ limit: 200 });
    if (cancelledContentId) {
      expect(activeItems.find(c => c.id === cancelledContentId)).toBeUndefined();
    }
    if (flaggedContentId) {
      expect(activeItems.find(c => c.id === flaggedContentId)).toBeUndefined();
    }

    // All-status feed should contain them
    const { items: allItems } = await getContentList({ status: "all", limit: 200 });
    if (cancelledContentId) {
      const cancelled = allItems.find(c => c.id === cancelledContentId);
      expect(cancelled).toBeTruthy();
      expect(cancelled!.status).toBe(2);
    }
    if (flaggedContentId) {
      const flagged = allItems.find(c => c.id === flaggedContentId);
      expect(flagged).toBeTruthy();
      expect(flagged!.status).toBe(3);
    }
  });
});
