import { listMissingRequiredTargetContracts } from "./requiredDeployments";
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

test("required deployment helper reports missing contract definitions per target chain", () => {
  const missingContracts = listMissingRequiredTargetContracts(
    [31337, 42220],
    {
      31337: {
        ContentRegistry: {},
        HumanReputation: {},
        ProtocolConfig: {},
      },
      42220: {
        ContentRegistry: {},
        ProtocolConfig: {},
      },
    },
    ["ContentRegistry", "HumanReputation"],
  );

  assert.deepEqual(missingContracts, ["42220:HumanReputation"]);
});

test("default required deployment list keeps optional bounty contracts out of the global chain guard", () => {
  const missingContracts = listMissingRequiredTargetContracts([42220], {
    42220: {
      ContentRegistry: {},
      HumanReputation: {},
      ProtocolConfig: {},
    },
  });

  assert.deepEqual(missingContracts, []);
});
