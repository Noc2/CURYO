import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("browser-facing public env modules avoid computed process.env access", () => {
  const browserEnvModules = [
    new URL("./public.ts", import.meta.url),
    new URL("../../services/ponder/client.ts", import.meta.url),
  ];

  for (const moduleUrl of browserEnvModules) {
    const source = readFileSync(moduleUrl, "utf8");

    assert.doesNotMatch(
      source,
      /process\.env\[[^\]]+\]/,
      `${moduleUrl.pathname} should use static process.env access so Next can inline NEXT_PUBLIC variables`,
    );
  }
});
