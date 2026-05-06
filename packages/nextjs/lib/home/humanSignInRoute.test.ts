import { HUMAN_SIGN_IN_DISCOVER_ROUTE, HUMAN_SIGN_IN_FAUCET_ROUTE, getHumanSignInRoute } from "./humanSignInRoute";
import assert from "node:assert/strict";
import test from "node:test";

test("routes humans without a Voter ID to the HREP faucet", () => {
  assert.equal(getHumanSignInRoute(false), HUMAN_SIGN_IN_FAUCET_ROUTE);
});

test("routes humans with a Voter ID to Discover", () => {
  assert.equal(getHumanSignInRoute(true), HUMAN_SIGN_IN_DISCOVER_ROUTE);
});
