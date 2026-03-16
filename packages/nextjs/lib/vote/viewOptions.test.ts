import assert from "node:assert/strict";
import test from "node:test";
import { getVoteViewGroups, isActivityViewOption } from "~~/lib/vote/viewOptions";

test("getVoteViewGroups hides wallet-only entries when disconnected", () => {
  const groups = getVoteViewGroups(false);

  assert.deepEqual(
    groups.map(group => group.label),
    ["Discover"],
  );
  assert.equal(
    groups[0]?.options.some(option => option.value === "watched"),
    false,
  );
  assert.equal(
    groups[0]?.options.some(option => option.value === "contested"),
    false,
  );
});

test("getVoteViewGroups includes activity entries when connected", () => {
  const groups = getVoteViewGroups(true);

  assert.deepEqual(
    groups.map(group => group.label),
    ["Discover", "Your Activity"],
  );
  assert.equal(
    groups[1]?.options.some(option => option.value === "my_votes"),
    true,
  );
  assert.equal(
    groups[1]?.options.some(option => option.value === "settling_soon"),
    true,
  );
});

test("isActivityViewOption identifies personal views only", () => {
  assert.equal(isActivityViewOption("trending"), false);
  assert.equal(isActivityViewOption("my_submissions"), true);
});
