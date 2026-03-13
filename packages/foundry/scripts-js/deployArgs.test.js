import test from "node:test";
import assert from "node:assert/strict";
import { parseDeployArgs } from "./deployArgs.js";

test("parseDeployArgs returns defaults with no options", () => {
  assert.deepEqual(parseDeployArgs([]), {
    showHelp: false,
    network: "localhost",
    keystoreArg: null,
  });
});

test("parseDeployArgs reads supported options", () => {
  assert.deepEqual(
    parseDeployArgs(["--network", "sepolia", "--keystore", "deployer"]),
    {
      showHelp: false,
      network: "sepolia",
      keystoreArg: "deployer",
    }
  );
});

test("parseDeployArgs handles help", () => {
  assert.deepEqual(parseDeployArgs(["--help"]), {
    showHelp: true,
    network: "localhost",
    keystoreArg: null,
  });
});

test("parseDeployArgs rejects deprecated --file", () => {
  assert.throws(
    () => parseDeployArgs(["--file", "DeployGovernance.s.sol"]),
    /--file` is no longer supported/
  );
});

test("parseDeployArgs rejects unknown options", () => {
  assert.throws(() => parseDeployArgs(["--bogus"]), /Unknown option: --bogus/);
});

test("parseDeployArgs rejects missing values", () => {
  assert.throws(
    () => parseDeployArgs(["--network"]),
    /Missing value for --network/
  );
});

test("parseDeployArgs rejects positional arguments", () => {
  assert.throws(
    () => parseDeployArgs(["sepolia"]),
    /Unexpected argument: sepolia/
  );
});
