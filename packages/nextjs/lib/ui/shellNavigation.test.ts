import assert from "node:assert/strict";
import test from "node:test";
import { shouldSuppressShellNavClick } from "~~/lib/ui/shellNavigation";

test("suppresses only exact same-url shell nav clicks", () => {
  assert.equal(
    shouldSuppressShellNavClick({
      currentHref: "https://curyo.xyz/rate",
      isActive: true,
      targetHref: "/rate",
    }),
    true,
  );

  assert.equal(
    shouldSuppressShellNavClick({
      currentHref: "https://curyo.xyz/rate?content=123",
      isActive: true,
      targetHref: "/rate",
    }),
    false,
  );

  assert.equal(
    shouldSuppressShellNavClick({
      currentHref: "https://curyo.xyz/governance#leaderboard",
      isActive: true,
      targetHref: "/governance",
    }),
    false,
  );
});

test("allows inactive, modified, and malformed shell nav clicks", () => {
  assert.equal(
    shouldSuppressShellNavClick({
      currentHref: "https://curyo.xyz/rate",
      isActive: false,
      targetHref: "/rate",
    }),
    false,
  );
  assert.equal(
    shouldSuppressShellNavClick({
      currentHref: "https://curyo.xyz/rate",
      isActive: true,
      isModifiedEvent: true,
      targetHref: "/rate",
    }),
    false,
  );
  assert.equal(
    shouldSuppressShellNavClick({
      currentHref: "not a url",
      isActive: true,
      targetHref: "/rate",
    }),
    false,
  );
});
