import { buildFreeTransactionOperationKey } from "./freeTransactionOperation";
import assert from "node:assert/strict";
import test from "node:test";

const BASE_PARAMS = {
  chainId: 42220,
  sender: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
};

test("buildFreeTransactionOperationKey is stable across equivalent numeric value encodings", () => {
  const fromBigInt = buildFreeTransactionOperationKey({
    ...BASE_PARAMS,
    calls: [
      {
        data: "0xdeadbeef",
        to: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        value: 0n,
      },
    ],
  });
  const fromHex = buildFreeTransactionOperationKey({
    ...BASE_PARAMS,
    calls: [
      {
        data: "0xdeadbeef",
        to: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        value: "0x0",
      },
    ],
  });
  const fromDecimalString = buildFreeTransactionOperationKey({
    ...BASE_PARAMS,
    calls: [
      {
        data: "0xdeadbeef",
        to: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
        value: "0",
      },
    ],
  });

  assert.equal(fromBigInt, fromHex);
  assert.equal(fromBigInt, fromDecimalString);
});

test("buildFreeTransactionOperationKey changes when call ordering changes", () => {
  const ordered = buildFreeTransactionOperationKey({
    ...BASE_PARAMS,
    calls: [
      {
        data: "0x1111",
        to: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      },
      {
        data: "0x2222",
        to: "0x1111111111111111111111111111111111111111",
      },
    ],
  });
  const reversed = buildFreeTransactionOperationKey({
    ...BASE_PARAMS,
    calls: [
      {
        data: "0x2222",
        to: "0x1111111111111111111111111111111111111111",
      },
      {
        data: "0x1111",
        to: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      },
    ],
  });

  assert.notEqual(ordered, reversed);
});

test("buildFreeTransactionOperationKey rejects malformed payloads", () => {
  const result = buildFreeTransactionOperationKey({
    ...BASE_PARAMS,
    calls: [
      {
        data: "not-hex" as `0x${string}`,
        to: "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd",
      },
    ],
  });

  assert.equal(result, null);
});
