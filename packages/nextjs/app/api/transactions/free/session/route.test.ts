import { buildUnavailableFreeTransactionSummary, isFreeTransactionStoreUnavailableError } from "./fallback";
import assert from "node:assert/strict";
import { after, test } from "node:test";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = env.NODE_ENV;

env.NODE_ENV = "test";

after(() => {
  if (originalNodeEnv === undefined) {
    delete env.NODE_ENV;
  } else {
    env.NODE_ENV = originalNodeEnv;
  }
});

test("detects nested database auth/connect/tls failures for free transaction session fallback", () => {
  const error = new Error("wrapper", {
    cause: {
      code: "28000",
    },
  });
  const tlsError = new Error("wrapper", {
    cause: {
      code: "SELF_SIGNED_CERT_IN_CHAIN",
    },
  });
  const missingTableError = new Error("wrapper", {
    cause: {
      code: "42P01",
    },
  });

  assert.equal(isFreeTransactionStoreUnavailableError(error), true);
  assert.equal(isFreeTransactionStoreUnavailableError({ code: "ECONNREFUSED" }), true);
  assert.equal(isFreeTransactionStoreUnavailableError(tlsError), true);
  assert.equal(isFreeTransactionStoreUnavailableError(missingTableError), true);
  assert.equal(isFreeTransactionStoreUnavailableError(new Error("boom")), false);
});

test("builds a self-funded fallback summary when the free transaction store is unavailable", () => {
  const summary = buildUnavailableFreeTransactionSummary({
    address: "0xfa9605a2c38a0b4f16f689fdd07b63f295b86d1c",
    chainId: 11142220,
  });

  assert.deepEqual(summary, {
    chainId: 11142220,
    environment: "test",
    limit: 25,
    used: 0,
    remaining: 0,
    verified: false,
    exhausted: false,
    walletAddress: "0xfa9605A2c38a0B4f16f689FDD07B63F295b86d1C",
    voterIdTokenId: null,
  });
});
