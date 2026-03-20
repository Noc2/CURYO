import assert from "node:assert/strict";
import test from "node:test";
import { getFallbackReputationAvatarDataUrl, getReputationAvatarUrl } from "./profileImage";

test("getReputationAvatarUrl returns null for invalid addresses", () => {
  assert.equal(getReputationAvatarUrl("not-an-address"), null);
});

test("getFallbackReputationAvatarDataUrl returns an inline empty-orb svg", () => {
  const dataUrl = getFallbackReputationAvatarDataUrl("0xc1CD80C7cD37b5499560C362b164cbA1CfF71b44", 24);

  assert.ok(dataUrl);
  assert.match(dataUrl, /^data:image\/svg\+xml;charset=utf-8,/);

  const svg = decodeURIComponent(dataUrl!.split(",")[1] ?? "");
  assert.match(svg, /orbital-avatar-empty-body/);
  assert.doesNotMatch(svg, /orbital-avatar-flare-/);
});
