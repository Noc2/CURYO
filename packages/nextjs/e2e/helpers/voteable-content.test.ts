import { ANVIL_ACCOUNTS } from "./anvil-accounts";
import { ensureVoteableContentWithDeps } from "./voteable-content";
import assert from "node:assert/strict";
import test from "node:test";

const SUBMITTER = ANVIL_ACCOUNTS.account3.address;

function createPageStub() {
  const headingWaits: Array<{ name: string; state: string; timeout: number }> = [];

  return {
    headingWaits,
    page: {
      getByRole(role: string, options: { name: string }) {
        assert.equal(role, "heading");
        return {
          first() {
            return {
              async waitFor(waitOptions: { state: string; timeout: number }) {
                headingWaits.push({ name: options.name, ...waitOptions });
              },
            };
          },
        };
      },
    } as any,
  };
}

test("ensureVoteableContent routes directly to the indexed fallback content", async () => {
  const { page, headingWaits } = createPageStub();
  const findResults = [false, true];
  const gotoCalls: Array<{ url: string; options: unknown }> = [];
  const waitForFeedLoadedCalls: Array<{ timeout: number | undefined }> = [];
  const indexedCallbacks: Array<() => Promise<boolean>> = [];

  const result = await ensureVoteableContentWithDeps(page, {
    approveCREP: async () => true,
    submitContentDirect: async () => true,
    waitForPonderIndexed: async callback => {
      indexedCallbacks.push(callback);
      return callback();
    },
    getContentList: async () => ({
      items: [
        {
          id: "77",
          title: "Responsive Vote Layout lfls-1",
          submitter: SUBMITTER.toLowerCase(),
        },
      ],
    }),
    findVoteableContent: async () => findResults.shift() ?? false,
    gotoWithRetry: async (_page, url, options) => {
      gotoCalls.push({ url, options });
    },
    waitForFeedLoaded: async (_page, timeout) => {
      waitForFeedLoadedCalls.push({ timeout });
    },
    now: () => Number.parseInt("lfls", 36),
  });

  assert.equal(result, true);
  assert.equal(indexedCallbacks.length, 1);
  assert.deepEqual(gotoCalls, [
    {
      url: "/rate?content=77",
      options: { ensureWalletConnected: true, timeout: 45_000 },
    },
  ]);
  assert.deepEqual(waitForFeedLoadedCalls, [{ timeout: 30_000 }]);
  assert.deepEqual(headingWaits, [
    {
      name: "Responsive Vote Layout lfls-1",
      state: "visible",
      timeout: 30_000,
    },
  ]);
});

test("ensureVoteableContent returns false without navigation when indexing never yields a content id", async () => {
  const { page } = createPageStub();
  let gotoCalled = false;

  const result = await ensureVoteableContentWithDeps(page, {
    approveCREP: async () => true,
    submitContentDirect: async () => true,
    waitForPonderIndexed: async callback => {
      await callback();
      return true;
    },
    getContentList: async () => ({
      items: [
        {
          id: "88",
          title: "Different Content",
          submitter: SUBMITTER,
        },
      ],
    }),
    findVoteableContent: async () => false,
    gotoWithRetry: async () => {
      gotoCalled = true;
    },
    waitForFeedLoaded: async () => undefined,
    now: () => Number.parseInt("lfls", 36),
  });

  assert.equal(result, false);
  assert.equal(gotoCalled, false);
});

test("ensureVoteableContent retries with a distinct fallback when direct submission fails", async () => {
  const { page } = createPageStub();
  const findResults = [false, true];
  const submittedUrls: string[] = [];
  const submittedTitles: string[] = [];
  const indexedTitles: string[] = [];
  const gotoUrls: string[] = [];

  const result = await ensureVoteableContentWithDeps(page, {
    approveCREP: async () => true,
    submitContentDirect: async (url, title) => {
      submittedUrls.push(url);
      submittedTitles.push(title);
      return submittedUrls.length === 2;
    },
    waitForPonderIndexed: async callback => callback(),
    getContentList: async () => {
      const title = submittedTitles.at(-1) ?? "";
      indexedTitles.push(title);
      return {
        items: [
          {
            id: "99",
            title,
            submitter: SUBMITTER,
          },
        ],
      };
    },
    findVoteableContent: async () => findResults.shift() ?? false,
    gotoWithRetry: async (_page, url) => {
      gotoUrls.push(url);
    },
    waitForFeedLoaded: async () => undefined,
    now: () => Number.parseInt("retry", 36),
  });

  assert.equal(result, true);
  assert.deepEqual(submittedUrls, [
    "https://www.youtube.com/watch?v=responsiveretry1",
    "https://www.youtube.com/watch?v=responsiveretry2",
  ]);
  assert.deepEqual(submittedTitles, ["Responsive Vote Layout retry-1", "Responsive Vote Layout retry-2"]);
  assert.deepEqual(indexedTitles, ["Responsive Vote Layout retry-2"]);
  assert.deepEqual(gotoUrls, ["/rate?content=99"]);
});
