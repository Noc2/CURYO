import assert from "node:assert/strict";
import test from "node:test";

async function loadGetMetadataWithEnv(env: { PORT?: string; VERCEL_PROJECT_PRODUCTION_URL?: string }) {
  const previousPort = process.env.PORT;
  const previousProductionUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;

  if (env.PORT === undefined) {
    delete process.env.PORT;
  } else {
    process.env.PORT = env.PORT;
  }

  if (env.VERCEL_PROJECT_PRODUCTION_URL === undefined) {
    delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
  } else {
    process.env.VERCEL_PROJECT_PRODUCTION_URL = env.VERCEL_PROJECT_PRODUCTION_URL;
  }

  try {
    const moduleUrl = new URL(`./getMetadata.ts?test=${Math.random().toString(36).slice(2)}`, import.meta.url);
    const module = (await import(moduleUrl.href)) as typeof import("./getMetadata");
    return module.getMetadata;
  } finally {
    if (previousPort === undefined) {
      delete process.env.PORT;
    } else {
      process.env.PORT = previousPort;
    }

    if (previousProductionUrl === undefined) {
      delete process.env.VERCEL_PROJECT_PRODUCTION_URL;
    } else {
      process.env.VERCEL_PROJECT_PRODUCTION_URL = previousProductionUrl;
    }
  }
}

test("getMetadata uses localhost URLs when no production hostname is configured", async () => {
  const getMetadata = await loadGetMetadataWithEnv({
    PORT: "4321",
    VERCEL_PROJECT_PRODUCTION_URL: undefined,
  });

  const metadata = getMetadata({
    title: "Curyo — Human Reputation at Stake",
    description: "Stake-Weighted Ratings From Verified Humans",
  });

  assert.equal(metadata.metadataBase?.toString(), "http://localhost:4321/");
  assert.equal(metadata.manifest, "/manifest.json");
  assert.equal(metadata.openGraph?.images?.[0]?.url, "http://localhost:4321/og-image.png");
  assert.equal(metadata.twitter?.images?.[0]?.url, "http://localhost:4321/twitter-image.png");
  assert.equal(
    metadata.openGraph?.images?.[0]?.alt,
    "Curyo brand banner with the headline Human Reputation at Stake and the subline Stake-Weighted Ratings From Verified Humans",
  );
});

test("getMetadata prefers the production hostname for social metadata", async () => {
  const getMetadata = await loadGetMetadataWithEnv({
    PORT: "4321",
    VERCEL_PROJECT_PRODUCTION_URL: "curyo.app",
  });

  const metadata = getMetadata({
    title: "Curyo — Human Reputation at Stake",
    description: "Stake-Weighted Ratings From Verified Humans",
  });

  assert.equal(metadata.metadataBase?.toString(), "https://curyo.app/");
  assert.equal(metadata.openGraph?.images?.[0]?.url, "https://curyo.app/og-image.png");
  assert.equal(metadata.twitter?.images?.[0]?.url, "https://curyo.app/twitter-image.png");
  assert.deepEqual(metadata.title, {
    default: "Curyo — Human Reputation at Stake",
    template: "%s | Curyo",
  });
});
