import { resolveRoundVoteRuntime } from "./roundVoteRuntime";
import assert from "node:assert/strict";
import test from "node:test";

test("resolveRoundVoteRuntime pins round reads to the block used for timestamp anchoring", async () => {
  const readCalls: Array<Record<string, unknown>> = [];
  const publicClient = {
    getBlock: async () => ({
      number: 123n,
      timestamp: 1_000n,
    }),
    readContract: async (args: Record<string, unknown>) => {
      readCalls.push(args);

      if (args.functionName === "currentRoundId") {
        return 2n;
      }

      if (args.functionName === "previewCommitReferenceRatingBps") {
        return 5_000;
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

  assert.equal(readCalls.length, 4);
  for (const call of readCalls) {
    assert.equal(call.blockNumber, 123n);
  }
  assert.equal(runtime.now(), 1_001_000);
  assert.equal(runtime.epochDuration, 100);
  assert.equal(runtime.roundReferenceRatingBps, 5_000);
});
