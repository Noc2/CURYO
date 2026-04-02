import { getFallbackReputationAvatarDataUrl, getReputationAvatarUrl } from "./profileImage";
import assert from "node:assert/strict";
import test from "node:test";

test("getReputationAvatarUrl returns null for invalid addresses", () => {
  assert.equal(getReputationAvatarUrl("not-an-address"), null);
});

test("getReputationAvatarUrl includes the selected chain id when provided", () => {
  assert.equal(
    getReputationAvatarUrl("0xc1CD80C7cD37b5499560C362b164cbA1CfF71b44", 96, "#ff5500", 42220),
    "/api/reputation-avatar?address=0xc1cd80c7cd37b5499560c362b164cba1cff71b44&size=96&accent=ff5500&chainId=42220",
  );
});

test("getFallbackReputationAvatarDataUrl returns an inline empty-orb svg", () => {
  const dataUrl = getFallbackReputationAvatarDataUrl("0xc1CD80C7cD37b5499560C362b164cbA1CfF71b44", 24);

  assert.ok(dataUrl);
  assert.match(dataUrl, /^data:image\/svg\+xml;charset=utf-8,/);

  const svg = decodeURIComponent(dataUrl!.split(",")[1] ?? "");
  assert.match(svg, /orbital-avatar-empty-body/);
  assert.doesNotMatch(svg, /orbital-avatar-flare-/);
});
