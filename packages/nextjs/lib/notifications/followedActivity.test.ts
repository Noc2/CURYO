import assert from "node:assert/strict";
import test from "node:test";
import {
  getFollowedResolutionNotificationKey,
  getFollowedSubmissionNotificationKey,
  pickFollowedActivityNotification,
  pickFollowedSubmissionNotifications,
} from "~~/lib/notifications/followedActivity";
import type {
  PonderDiscoverSignalsResolutionItem,
  PonderDiscoverSignalsSubmissionItem,
} from "~~/services/ponder/client";

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

function makeResolution(overrides: Partial<PonderDiscoverSignalsResolutionItem>): PonderDiscoverSignalsResolutionItem {
  return {
    id: overrides.id ?? "vote-1",
    contentId: overrides.contentId ?? "1",
    roundId: overrides.roundId ?? "1",
    voter: overrides.voter ?? "0x0000000000000000000000000000000000000001",
    isUp: overrides.isUp ?? true,
    title: overrides.title ?? "Example",
    description: overrides.description ?? "Example description",
    url: overrides.url ?? "https://example.com",
    settledAt: overrides.settledAt ?? "2026-04-09T07:00:00.000Z",
    roundState: overrides.roundState ?? null,
    roundUpWins: overrides.roundUpWins ?? true,
    profileName: overrides.profileName ?? null,
    outcome: overrides.outcome ?? "won",
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

test("pickFollowedActivityNotification returns at most one newest followed activity", () => {
  const olderSubmission = makeSubmission({ contentId: "1", createdAt: "2026-04-09T07:01:00.000Z" });
  const newerResolution = makeResolution({ id: "vote-2", contentId: "2", settledAt: "2026-04-09T07:03:00.000Z" });
  const newestSubmission = makeSubmission({ contentId: "3", createdAt: "2026-04-09T07:05:00.000Z" });

  const picked = pickFollowedActivityNotification({
    submissions: [olderSubmission, newestSubmission],
    resolutions: [newerResolution],
    seenSubmissionKeys: new Set(),
    seenResolutionKeys: new Set(),
  });

  assert.equal(picked?.kind, "submission");
  assert.equal(picked?.item.contentId, "3");
});

test("pickFollowedActivityNotification skips followed curator history from before the follow", () => {
  const curator = "0x1111111111111111111111111111111111111111";
  const preFollowSubmission = makeSubmission({
    contentId: "1",
    submitter: curator,
    createdAt: "2026-04-09T07:00:00.000Z",
  });
  const preFollowResolution = makeResolution({
    id: "vote-1",
    contentId: "2",
    voter: curator,
    settledAt: "2026-04-09T07:01:00.000Z",
  });
  const postFollowSubmission = makeSubmission({
    contentId: "3",
    submitter: curator,
    createdAt: "2026-04-09T07:03:00.000Z",
  });

  const picked = pickFollowedActivityNotification({
    submissions: [preFollowSubmission, postFollowSubmission],
    resolutions: [preFollowResolution],
    seenSubmissionKeys: new Set(),
    seenResolutionKeys: new Set(),
    followedSinceByAddress: new Map([[curator, "2026-04-09T07:02:00.000Z"]]),
  });

  assert.equal(picked?.kind, "submission");
  assert.equal(picked?.item.contentId, "3");
});

test("pickFollowedActivityNotification ignores already seen submissions and resolutions", () => {
  const submission = makeSubmission({ contentId: "1" });
  const resolution = makeResolution({ id: "vote-1", contentId: "2", settledAt: "2026-04-09T07:01:00.000Z" });

  const picked = pickFollowedActivityNotification({
    submissions: [submission],
    resolutions: [resolution],
    seenSubmissionKeys: new Set([getFollowedSubmissionNotificationKey(submission)]),
    seenResolutionKeys: new Set([getFollowedResolutionNotificationKey(resolution)]),
  });

  assert.equal(picked, null);
});

test("pickFollowedSubmissionNotifications ignores submissions that were already seen", () => {
  const seenItem = makeSubmission({ contentId: "1" });
  const newItem = makeSubmission({ contentId: "2", createdAt: "2026-04-09T07:01:00.000Z" });

  assert.deepEqual(
    pickFollowedSubmissionNotifications([seenItem, newItem], new Set([getFollowedSubmissionNotificationKey(seenItem)])),
    [newItem],
  );
});
