import { runCommitAttempts } from "./commit-attempts";
import assert from "node:assert/strict";
import test from "node:test";

test("runCommitAttempts stops after the first successful attempt", async () => {
  const calls: number[] = [];

  const result = await runCommitAttempts({
    attempts: 3,
    attempt: async attemptIndex => {
      calls.push(attemptIndex);
      return { success: attemptIndex === 1, attemptIndex };
    },
    isSuccess: value => value.success,
  });

  assert.deepEqual(calls, [0, 1]);
  assert.equal(result.success, true);
  assert.equal(result.attemptIndex, 1);
});

test("runCommitAttempts returns the final failed attempt when retries are exhausted", async () => {
  const calls: number[] = [];

  const result = await runCommitAttempts({
    attempts: 2,
    attempt: async attemptIndex => {
      calls.push(attemptIndex);
      return { success: false, attemptIndex };
    },
    isSuccess: value => value.success,
  });

  assert.deepEqual(calls, [0, 1]);
  assert.equal(result.success, false);
  assert.equal(result.attemptIndex, 1);
});

test("runCommitAttempts invokes the retry hook for each failed attempt before the last", async () => {
  const retries: number[] = [];

  await runCommitAttempts({
    attempts: 3,
    attempt: async attemptIndex => ({ success: attemptIndex === 2, attemptIndex }),
    isSuccess: value => value.success,
    onRetry: attemptIndex => {
      retries.push(attemptIndex);
    },
  });

  assert.deepEqual(retries, [0, 1]);
});
