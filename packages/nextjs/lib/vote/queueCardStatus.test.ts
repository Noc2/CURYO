import assert from "node:assert/strict";
import test from "node:test";
import { getQueueCardStatus } from "~~/lib/vote/queueCardStatus";

test("getQueueCardStatus shows blind rounds with countdown urgency", () => {
  const status = getQueueCardStatus({
    phase: "voting",
    isEpoch1: true,
    epoch1Remaining: 11 * 60,
    voteCount: 1,
    minVoters: 3,
    readyToSettle: false,
    thresholdReachedAt: 0,
  });

  assert.deepEqual(status, {
    phaseLabel: "Blind",
    phaseTone: "blind",
    urgencyLabel: "11m left",
    urgencyTone: "warning",
  });
});

test("getQueueCardStatus shows vote deficit urgency in open phase", () => {
  const status = getQueueCardStatus({
    phase: "voting",
    isEpoch1: false,
    epoch1Remaining: 0,
    voteCount: 1,
    minVoters: 3,
    readyToSettle: false,
    thresholdReachedAt: 0,
  });

  assert.deepEqual(status, {
    phaseLabel: "Open",
    phaseTone: "open",
    urgencyLabel: "Needs 2 more votes",
    urgencyTone: "neutral",
  });
});

test("getQueueCardStatus marks open rounds near settlement once quorum is met", () => {
  const status = getQueueCardStatus({
    phase: "voting",
    isEpoch1: false,
    epoch1Remaining: 0,
    voteCount: 4,
    minVoters: 3,
    readyToSettle: false,
    thresholdReachedAt: 123,
  });

  assert.deepEqual(status, {
    phaseLabel: "Open",
    phaseTone: "open",
    urgencyLabel: "Near settlement",
    urgencyTone: "success",
  });
});

test("getQueueCardStatus hides labels when there is no active round", () => {
  assert.equal(
    getQueueCardStatus({
      phase: "none",
      isEpoch1: false,
      epoch1Remaining: 0,
      voteCount: 0,
      minVoters: 3,
      readyToSettle: false,
      thresholdReachedAt: 0,
    }),
    null,
  );
});
