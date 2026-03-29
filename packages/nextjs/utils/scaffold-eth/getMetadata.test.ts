import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

const env = process.env as Record<string, string | undefined>;
const originalPort = env.PORT;
const originalVercelProductionUrl = env.VERCEL_PROJECT_PRODUCTION_URL;

async function loadGetMetadata() {
  return import(`./getMetadata.ts?test=${Date.now()}-${Math.random()}`);
}

afterEach(() => {
  if (originalPort === undefined) {
    delete env.PORT;
  } else {
    env.PORT = originalPort;
  }

  if (originalVercelProductionUrl === undefined) {
    delete env.VERCEL_PROJECT_PRODUCTION_URL;
  } else {
    env.VERCEL_PROJECT_PRODUCTION_URL = originalVercelProductionUrl;
  }
});

test("getMetadata uses the local base URL when no Vercel production URL is configured", async () => {
  env.PORT = "4567";
  delete env.VERCEL_PROJECT_PRODUCTION_URL;

  const { getMetadata } = await loadGetMetadata();
  const metadata = getMetadata({
    title: "Curyo",
    description: "Stake-Weighted Ratings From Verified Humans",
  });

  assert.equal(metadata.metadataBase?.toString(), "http://localhost:4567/");
  assert.equal(metadata.openGraph?.images?.[0]?.url, "http://localhost:4567/og-image.png");
  assert.equal(metadata.twitter?.images?.[0]?.url, "http://localhost:4567/twitter-image.png");
});

test("getMetadata uses the Vercel production URL and updated social alt copy", async () => {
  env.VERCEL_PROJECT_PRODUCTION_URL = "curyo.xyz";
  delete env.PORT;

  const { getMetadata } = await loadGetMetadata();
  const metadata = getMetadata({
    title: "Curyo",
    description: "Stake-Weighted Ratings From Verified Humans",
  });

  assert.equal(metadata.metadataBase?.toString(), "https://curyo.xyz/");
  assert.equal(metadata.openGraph?.images?.[0]?.alt, metadata.twitter?.images?.[0]?.alt);
  assert.equal(
    metadata.openGraph?.images?.[0]?.alt,
    "Curyo brand banner with the headline Human Reputation at Stake and the subline Stake-Weighted Ratings From Verified Humans",
  );
});
