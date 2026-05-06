import assert from "node:assert/strict";
import test from "node:test";
import {
  NAVIGATION_PROGRESS_DEBUG_STORAGE_KEY,
  buildNavigationProgressCandidate,
  shouldLogNavigationProgressDebug,
} from "~~/lib/ui/navigationProgressDiagnostics";

const currentHref = "https://curyo.xyz/profiles/0x123?tab=profile#avatar";

test("tracks same-origin navigation with a different path", () => {
  const candidate = buildNavigationProgressCandidate({
    currentHref,
    href: "/governance",
  });

  assert.deepEqual(candidate, {
    from: "https://curyo.xyz/profiles/0x123?tab=profile",
    target: "https://curyo.xyz/governance",
    targetHref: "https://curyo.xyz/governance",
  });
});

test("tracks same-origin navigation with a different query", () => {
  const candidate = buildNavigationProgressCandidate({
    currentHref: "https://curyo.xyz/rate?q=ai",
    href: "/rate?q=ux",
  });

  assert.equal(candidate?.target, "https://curyo.xyz/rate?q=ux");
});

test("ignores hash-only, external, blank-target, and modified navigations", () => {
  assert.equal(buildNavigationProgressCandidate({ currentHref, href: "#context" }), null);
  assert.equal(buildNavigationProgressCandidate({ currentHref, href: "https://example.com/governance" }), null);
  assert.equal(buildNavigationProgressCandidate({ currentHref, href: "/governance", target: "_blank" }), null);
  assert.equal(buildNavigationProgressCandidate({ currentHref, href: "/governance", isModifiedEvent: true }), null);
});

test("ignores links disabled for nprogress and non-navigation protocols", () => {
  assert.equal(buildNavigationProgressCandidate({ currentHref, href: "/governance", nprogressDisabled: true }), null);
  assert.equal(buildNavigationProgressCandidate({ currentHref, href: "mailto:hello@curyo.xyz" }), null);
  assert.equal(buildNavigationProgressCandidate({ currentHref, href: "tel:+123" }), null);
});

test("reads the navigation debug flag defensively", () => {
  const enabledStorage = {
    getItem: (key: string) => (key === NAVIGATION_PROGRESS_DEBUG_STORAGE_KEY ? "true" : null),
  };
  const throwingStorage = {
    getItem: () => {
      throw new Error("storage unavailable");
    },
  };

  assert.equal(shouldLogNavigationProgressDebug(enabledStorage), true);
  assert.equal(shouldLogNavigationProgressDebug(undefined), false);
  assert.equal(shouldLogNavigationProgressDebug(throwingStorage), false);
});
