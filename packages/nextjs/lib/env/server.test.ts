import { resolveServerPonderUrl, resolveServerTargetNetworks } from "./server";
import assert from "node:assert/strict";
import { test } from "node:test";

test("resolveServerPonderUrl keeps the local default outside production", () => {
  assert.equal(resolveServerPonderUrl(undefined, false), "http://localhost:42069");
});

test("resolveServerPonderUrl treats localhost production URLs as unavailable", () => {
  assert.equal(resolveServerPonderUrl("http://localhost:42069", true), null);
});

test("resolveServerTargetNetworks tolerates local-chain builds in production mode", () => {
  const networks = resolveServerTargetNetworks("31337,11142220", true);
  assert.deepEqual(
    networks?.map(network => network.id),
    [31337, 11142220],
  );
});

test("resolveServerTargetNetworks returns null for invalid production values", () => {
  assert.equal(resolveServerTargetNetworks("not-a-chain", true), null);
});
