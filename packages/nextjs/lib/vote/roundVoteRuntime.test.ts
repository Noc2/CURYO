import { resolveRoundVoteRuntime } from "./roundVoteRuntime";
import assert from "node:assert/strict";
import test from "node:test";

test("resolveRoundVoteRuntime anchors tlock timing to the pending block timestamp", async () => {
  const readCalls: Array<Record<string, unknown>> = [];
  const blockCalls: Array<Record<string, unknown>> = [];
  const publicClient = {
    getBlock: async (args: Record<string, unknown>) => {
      blockCalls.push(args);
      return args.blockTag === "pending"
        ? {
            number: 124n,
            timestamp: 1_099n,
          }
        : {
            number: 123n,
            timestamp: 1_000n,
          };
    },
    readContract: async (args: Record<string, unknown>) => {
      readCalls.push(args);

      if (args.functionName === "previewCommitReferenceRatingBps") {
        return 5_000;
      }

      if (args.functionName === "previewCommitRoundId") {
        return 2n;
      }

      if (args.functionName === "roundConfigSnapshot") {
        return [100, 3_600, 3, 1_000];
      }

      return [900n, 0, 0n, 0n, 0n, 0n, 0n, 0n, 0n, false, 0n, 0n, 0n, 0n];
    },
  };

  const runtime = await resolveRoundVoteRuntime({
    publicClient: publicClient as never,
    votingEngineAddress: "0x0000000000000000000000000000000000000001",
    contentId: 7n,
    fallbackEpochDuration: 1200,
  });

  assert.deepEqual(
    blockCalls.map(call => call.blockTag),
    ["latest", "pending"],
  );
  assert.equal(readCalls.length, 4);
  for (const call of readCalls.slice(0, 2)) {
    assert.equal(call.blockTag, "pending");
  }
  for (const call of readCalls.slice(2)) {
    assert.equal(call.blockNumber, 123n);
  }
  assert.equal(runtime.now(), 1_101_000);
  assert.equal(runtime.epochDuration, 100);
  assert.equal(runtime.roundId, 2n);
  assert.equal(runtime.roundReferenceRatingBps, 5_000);
});

test("resolveRoundVoteRuntime keeps new-round targets fresh when latest is stale", async () => {
  const publicClient = {
    getBlock: async (args: Record<string, unknown>) =>
      args.blockTag === "pending"
        ? {
            number: 124n,
            timestamp: 4_000n,
          }
        : {
            number: 123n,
            timestamp: 1_000n,
          },
    readContract: async (args: Record<string, unknown>) => {
      if (args.functionName === "previewCommitReferenceRatingBps") {
        return 5_000;
      }

      if (args.functionName === "previewCommitRoundId") {
        return 3n;
      }

      if (args.functionName === "roundConfigSnapshot") {
        return [0, 0, 0, 0];
      }

      return [0n, 0, 0n, 0n, 0n, 0n, 0n, 0n, 0n, false, 0n, 0n, 0n, 0n];
    },
  };

  const runtime = await resolveRoundVoteRuntime({
    publicClient: publicClient as never,
    votingEngineAddress: "0x0000000000000000000000000000000000000001",
    contentId: 7n,
    fallbackEpochDuration: 1200,
  });

  assert.equal(runtime.now(), 4_061_000);
  assert.equal(runtime.epochDuration, 1200);
  assert.equal(runtime.roundId, 3n);
});
