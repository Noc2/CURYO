import { approveHREP, submitContentDirect, waitForPonderIndexed } from "./admin-helpers";
import { ANVIL_ACCOUNTS } from "./anvil-accounts";
import { CONTRACT_ADDRESSES } from "./contracts";
import { getContentList } from "./ponder-api";
import { findVoteableContent, gotoWithRetry, waitForFeedLoaded } from "./wait-helpers";
import type { Page } from "@playwright/test";

const SUBMIT_STAKE = BigInt(10e6);
const FALLBACK_CONTENT_ATTEMPTS = 3;

type ContentListItem = {
  id: string;
  title: string;
  submitter: string;
};

type EnsureVoteableContentDeps = {
  approveHREP: typeof approveHREP;
  submitContentDirect: typeof submitContentDirect;
  waitForPonderIndexed: typeof waitForPonderIndexed;
  getContentList: (params: { status: "all"; limit: number }) => Promise<{ items: ContentListItem[] }>;
  findVoteableContent: typeof findVoteableContent;
  gotoWithRetry: typeof gotoWithRetry;
  waitForFeedLoaded: typeof waitForFeedLoaded;
  now: () => number;
};

const defaultDeps: EnsureVoteableContentDeps = {
  approveHREP,
  submitContentDirect,
  waitForPonderIndexed,
  getContentList,
  findVoteableContent,
  gotoWithRetry,
  waitForFeedLoaded,
  now: () => Date.now(),
};

function createFallbackContentUrl(uniqueId: string, attempt: number): string {
  return `https://www.youtube.com/watch?v=responsive${uniqueId}${attempt}`;
}

export async function ensureVoteableContentWithDeps(
  page: Page,
  deps: EnsureVoteableContentDeps = defaultDeps,
): Promise<boolean> {
  if (await deps.findVoteableContent(page)) {
    return true;
  }

  const submitter = ANVIL_ACCOUNTS.account3.address;
  const approved = await deps.approveHREP(
    CONTRACT_ADDRESSES.ContentRegistry,
    SUBMIT_STAKE,
    submitter,
    CONTRACT_ADDRESSES.HumanReputation,
  );
  if (!approved) {
    return false;
  }

  const uniqueId = deps.now().toString(36);
  for (let index = 0; index < FALLBACK_CONTENT_ATTEMPTS; index += 1) {
    const attempt = index + 1;
    const title = `Responsive Vote Layout ${uniqueId}-${attempt}`;
    const submitted = await deps.submitContentDirect(
      createFallbackContentUrl(uniqueId, attempt),
      title,
      "Deterministic content for responsive stake selector layout checks.",
      "Technology,Testing,Video",
      1,
      submitter,
      CONTRACT_ADDRESSES.ContentRegistry,
    );
    if (!submitted) {
      continue;
    }

    let indexedContentId: string | null = null;
    const indexed = await deps.waitForPonderIndexed(
      async () => {
        const { items } = await deps.getContentList({ status: "all", limit: 100 });
        const match = items.find(
          item => item.title === title && item.submitter.toLowerCase() === submitter.toLowerCase(),
        );
        indexedContentId = match?.id ?? null;
        return Boolean(indexedContentId);
      },
      90_000,
      2_000,
      "ensureVoteableContent",
    );
    if (!indexed || !indexedContentId) {
      return false;
    }

    await deps.gotoWithRetry(page, `/rate?content=${indexedContentId}`, {
      ensureWalletConnected: true,
      timeout: 45_000,
    });
    await deps.waitForFeedLoaded(page, 30_000);
    await page
      .getByRole("heading", { name: title })
      .first()
      .waitFor({ state: "visible", timeout: 30_000 })
      .catch(() => undefined);

    return deps.findVoteableContent(page);
  }

  return false;
}

export async function ensureVoteableContent(page: Page): Promise<boolean> {
  return ensureVoteableContentWithDeps(page);
}
