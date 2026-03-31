import { CuryoReputationAbi, decodeVoteTransferPayload } from "@curyo/contracts";
import assert from "node:assert/strict";
import test from "node:test";
import { decodeFunctionData } from "viem";
import {
  buildStakeAmountWei,
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
  const payload = buildVoteTransferPayload({
    contentId: 42n,
    commitHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    ciphertext: "0x1234",
    frontend: "0x2222222222222222222222222222222222222222",
  });

  assert.deepEqual(decodeVoteTransferPayload(payload), {
    contentId: 42n,
    commitHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    ciphertext: "0x1234",
    frontend: "0x2222222222222222222222222222222222222222",
  });
});

test("buildVoteTransferAndCallData encodes the token transfer call", () => {
  const payload = buildVoteTransferPayload({
    contentId: 42n,
    commitHash: "0x1111111111111111111111111111111111111111111111111111111111111111",
    ciphertext: "0x1234",
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
