import assert from "node:assert/strict";
import test from "node:test";
import {
  getFollowedSubmissionNotificationKey,
  pickFollowedSubmissionNotifications,
} from "~~/lib/notifications/followedActivity";
import type { PonderDiscoverSignalsSubmissionItem } from "~~/services/ponder/client";

function makeSubmission(overrides: Partial<PonderDiscoverSignalsSubmissionItem>): PonderDiscoverSignalsSubmissionItem {
  return {
    contentId: overrides.contentId ?? "1",
    title: overrides.title ?? "Example",
    description: overrides.description ?? "Example description",
    url: overrides.url ?? "https://example.com",
    createdAt: overrides.createdAt ?? "2026-04-09T07:00:00.000Z",
    categoryId: overrides.categoryId ?? "1",
    submitter: overrides.submitter ?? "0x0000000000000000000000000000000000000001",
    profileName: overrides.profileName ?? null,
  };
}

test("pickFollowedSubmissionNotifications limits bursts to one submission per curator", () => {
  const firstSubmitter = "0x1111111111111111111111111111111111111111";
  const secondSubmitter = "0x2222222222222222222222222222222222222222";
  const items = [
    makeSubmission({ contentId: "1", submitter: firstSubmitter }),
    makeSubmission({ contentId: "2", submitter: firstSubmitter, createdAt: "2026-04-09T07:01:00.000Z" }),
    makeSubmission({ contentId: "3", submitter: secondSubmitter, createdAt: "2026-04-09T07:02:00.000Z" }),
    makeSubmission({ contentId: "4", submitter: secondSubmitter, createdAt: "2026-04-09T07:03:00.000Z" }),
  ];

  assert.deepEqual(
    pickFollowedSubmissionNotifications(items, new Set()).map(item => item.contentId),
    ["1", "3"],
  );
});

test("pickFollowedSubmissionNotifications ignores submissions that were already seen", () => {
  const seenItem = makeSubmission({ contentId: "1" });
  const newItem = makeSubmission({ contentId: "2", createdAt: "2026-04-09T07:01:00.000Z" });

  assert.deepEqual(
    pickFollowedSubmissionNotifications([seenItem, newItem], new Set([getFollowedSubmissionNotificationKey(seenItem)])),
    [newItem],
  );
});
