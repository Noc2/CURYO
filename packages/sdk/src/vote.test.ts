import { CuryoReputationAbi, decodeVoteTransferPayload } from "@curyo/contracts";
import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData } from "viem";
import {
  buildStakeAmountWei,
  buildCommitVoteParams,
  buildVoteTransferAndCallData,
  buildVoteTransferPayload,
  generateVoteSalt,
  resolveFrontendCode,
} from "./vote";

test("vote helpers normalize stake amounts and frontend defaults", () => {
  assert.equal(buildStakeAmountWei(2.5), 2_500_000n);
  assert.equal(
    resolveFrontendCode(undefined, "0x1111111111111111111111111111111111111111"),
    "0x1111111111111111111111111111111111111111",
  );
  assert.equal(resolveFrontendCode(undefined, undefined), "0x0000000000000000000000000000000000000000");
});

test("generateVoteSalt accepts an injected random source", () => {
  const salt = generateVoteSalt(bytes => bytes.fill(0xab));
  assert.equal(salt, `0x${"ab".repeat(32)}`);
});

test("buildVoteTransferPayload round-trips through the contracts codec", () => {
  const drandChainHash = ("0x" + "22".repeat(32)) as `0x${string}`;
  const payload = buildVoteTransferPayload({
    contentId: 42n,
    commitHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    ciphertext: "0x1234",
    targetRound: 123n,
    drandChainHash,
    frontend: "0x2222222222222222222222222222222222222222",
  });

  assert.deepEqual(decodeVoteTransferPayload(payload), {
    contentId: 42n,
    commitHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    ciphertext: "0x1234",
    targetRound: 123n,
    drandChainHash,
    frontend: "0x2222222222222222222222222222222222222222",
  });
});

test("buildCommitVoteParams returns the tlock metadata needed for commitVote", async () => {
  const runtime = {
    client: {
      chain: () => ({
        info: async () => ({
          period: 3,
          genesis_time: 1677685200,
          hash: "ab".repeat(32),
        }),
      }),
    } as any,
    now: () => 1677685200 * 1000,
    encryptFn: async () => "FAKE-ARMORED-AGE-STRING",
  };

  const result = await buildCommitVoteParams({
    contentId: 42n,
    isUp: true,
    stakeAmount: 2.5,
    epochDuration: 1200,
    runtime,
  });

  assert.equal(result.targetRound > 0n, true);
  assert.equal(result.drandChainHash, `0x${"ab".repeat(32)}`);
  assert.equal(result.frontend, "0x0000000000000000000000000000000000000000");
});

test("buildVoteTransferAndCallData encodes the token transfer call", () => {
  const drandChainHash = ("0x" + "22".repeat(32)) as `0x${string}`;
  const payload = buildVoteTransferPayload({
    contentId: 42n,
    commitHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    ciphertext: "0x1234",
    targetRound: 123n,
    drandChainHash,
    frontend: "0x2222222222222222222222222222222222222222",
  });
  const data = buildVoteTransferAndCallData({
    votingEngineAddress: "0x3333333333333333333333333333333333333333",
    stakeWei: 2_500_000n,
    payload,
  });

  const decoded = decodeFunctionData({
    abi: CuryoReputationAbi,
    data,
  });

  assert.equal(decoded.functionName, "transferAndCall");
  assert.deepEqual(decoded.args, ["0x3333333333333333333333333333333333333333", 2_500_000n, payload]);
});
