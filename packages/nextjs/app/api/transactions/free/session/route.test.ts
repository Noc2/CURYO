import { NextRequest } from "next/server";
import { buildUnavailableFreeTransactionSummary, isFreeTransactionStoreUnavailableError } from "./fallback";
import assert from "node:assert/strict";
import { after, test } from "node:test";
import type { QueryResult, QueryResultRow } from "pg";
import { __setRateLimitStoreForTests } from "~~/utils/rateLimit";

const env = process.env as Record<string, string | undefined>;
const originalNodeEnv = env.NODE_ENV;
const originalTargetNetworks = env.NEXT_PUBLIC_TARGET_NETWORKS;

env.NODE_ENV = "test";

function queryResult<Row extends QueryResultRow>(rows: Row[]): QueryResult<Row> {
  return {
    command: "SELECT",
    fields: [],
    oid: 0,
    rowCount: rows.length,
    rows,
  };
}

after(() => {
  __setRateLimitStoreForTests(null);
  if (originalNodeEnv === undefined) {
    delete env.NODE_ENV;
  } else {
    env.NODE_ENV = originalNodeEnv;
  }
  if (originalTargetNetworks === undefined) {
    delete env.NEXT_PUBLIC_TARGET_NETWORKS;
  } else {
    env.NEXT_PUBLIC_TARGET_NETWORKS = originalTargetNetworks;
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

test("free transaction session route rejects unsupported numeric chain ids", async () => {
  env.NEXT_PUBLIC_TARGET_NETWORKS = "11142220";
  __setRateLimitStoreForTests({
    execute: async input => {
      const sql = typeof input === "string" ? input : input.sql;
      if (sql.includes("api_rate_limit_maintenance")) {
        return queryResult([]);
      }

      if (sql.includes("api_rate_limits")) {
        return queryResult([{ request_count: 1 }]);
      }

      return queryResult([]);
    },
  });

  const route = await import("./route");
  const response = await route.GET(
    new NextRequest(
      "https://curyo.xyz/api/transactions/free/session?address=0xfa9605a2c38a0b4f16f689fdd07b63f295b86d1c&chainId=1",
    ),
  );
  const body = (await response.json()) as { error: string };

  assert.equal(response.status, 400);
  assert.equal(body.error, "Unsupported chain");
});
