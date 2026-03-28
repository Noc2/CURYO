import assert from "node:assert/strict";
import test from "node:test";

test("getMetadata uses the updated brand deck and social image alt copy", async () => {
  process.env.PORT = "4321";
  delete process.env.VERCEL_PROJECT_PRODUCTION_URL;

  const { getMetadata } = await import("./getMetadata");

  const metadata = getMetadata({
    title: "Curyo — Human Reputation at Stake",
    description: "Stake-Weighted Ratings From Verified Humans.",
  });

  assert.equal(metadata.metadataBase?.toString(), "http://localhost:4321/");
  assert.equal(metadata.description, "Stake-Weighted Ratings From Verified Humans.");
  assert.equal(metadata.title?.default, "Curyo — Human Reputation at Stake");
  assert.equal(metadata.openGraph?.description, "Stake-Weighted Ratings From Verified Humans.");
  assert.equal(
    metadata.openGraph?.images?.[0]?.alt,
    "Curyo brand banner with the headline Human Reputation at Stake and the subline Stake-Weighted Ratings From Verified Humans.",
  );
  assert.equal(
    metadata.twitter?.images?.[0]?.alt,
    "Curyo brand banner with the headline Human Reputation at Stake and the subline Stake-Weighted Ratings From Verified Humans.",
  );
});
