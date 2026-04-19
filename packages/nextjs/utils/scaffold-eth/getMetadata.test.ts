import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

const socialImageAlt =
  "Curyo brand banner with the headline AI Asks. Humans Stake. and the subline Get Verified, Rate With Reputation, and Earn USDC for Answers AI Can Verify.";

type MetadataSnapshot = {
  description?: string | null;
  manifest?: string | null;
  metadataBase?: string | null;
  openGraph?: {
    description?: string | null;
    images?: Array<{ alt?: string | null; url?: string | null }>;
  } | null;
  title?:
    | string
    | {
        default?: string;
        template?: string;
      }
    | null;
  twitter?: {
    images?: Array<{ alt?: string | null; url?: string | null }>;
  } | null;
};

function loadMetadataWithEnv(
  env: { PORT?: string; VERCEL_PROJECT_PRODUCTION_URL?: string },
  input: { description: string; title: string },
): MetadataSnapshot {
  const childEnv = { ...process.env };

  if (env.PORT === undefined) {
    delete childEnv.PORT;
  } else {
    childEnv.PORT = env.PORT;
  }

  if (env.VERCEL_PROJECT_PRODUCTION_URL === undefined) {
    delete childEnv.VERCEL_PROJECT_PRODUCTION_URL;
  } else {
    childEnv.VERCEL_PROJECT_PRODUCTION_URL = env.VERCEL_PROJECT_PRODUCTION_URL;
  }

  const script = `
    const imported = await import(${JSON.stringify(new URL("./getMetadata.ts", import.meta.url).href)});
    const getMetadata =
      imported.getMetadata ??
      imported.default?.getMetadata ??
      imported["module.exports"]?.getMetadata;

    if (typeof getMetadata !== "function") {
      throw new TypeError("getMetadata export was not found");
    }

    const metadata = getMetadata(${JSON.stringify(input)});
    console.log(JSON.stringify({
      metadataBase: metadata.metadataBase?.toString() ?? null,
      manifest: metadata.manifest ?? null,
      title: metadata.title ?? null,
      description: metadata.description ?? null,
      openGraph: metadata.openGraph
        ? {
            description: metadata.openGraph.description ?? null,
            images: metadata.openGraph.images?.map(image => ({
              url: typeof image === "string" ? image : image?.url?.toString() ?? null,
              alt: typeof image === "string" ? null : image?.alt ?? null,
            })),
          }
        : null,
      twitter: metadata.twitter
        ? {
            images: metadata.twitter.images?.map(image =>
              typeof image === "string"
                ? { url: image, alt: null }
                : { url: image?.url?.toString() ?? null, alt: image?.alt ?? null },
            ),
          }
        : null,
    }));
  `;

  const result = spawnSync(process.execPath, ["--import", "tsx", "--eval", script], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: childEnv,
  });

  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || "Failed to load metadata snapshot");
  }

  return JSON.parse(result.stdout) as MetadataSnapshot;
}

test("getMetadata uses localhost URLs and the updated brand copy when no production hostname is configured", () => {
  const metadata = loadMetadataWithEnv(
    {
      PORT: "4321",
      VERCEL_PROJECT_PRODUCTION_URL: undefined,
    },
    {
      title: "Curyo — AI Asks. Humans Stake.",
      description: "Get Verified, Rate With Reputation, and Earn USDC for Answers AI Can Verify.",
    },
  );

  assert.equal(metadata.metadataBase, "http://localhost:4321/");
  assert.equal(metadata.manifest, "/manifest.json");
  assert.deepEqual(metadata.title, {
    default: "Curyo — AI Asks. Humans Stake.",
    template: "%s | Curyo",
  });
  assert.equal(metadata.description, "Get Verified, Rate With Reputation, and Earn USDC for Answers AI Can Verify.");
  assert.equal(
    metadata.openGraph?.description,
    "Get Verified, Rate With Reputation, and Earn USDC for Answers AI Can Verify.",
  );
  assert.equal(metadata.openGraph?.images?.[0]?.url, "http://localhost:4321/og-image.png");
  assert.equal(metadata.twitter?.images?.[0]?.url, "http://localhost:4321/twitter-image.png");
  assert.equal(metadata.openGraph?.images?.[0]?.alt, socialImageAlt);
  assert.equal(metadata.twitter?.images?.[0]?.alt, socialImageAlt);
});

test("getMetadata prefers the production hostname for social metadata", () => {
  const metadata = loadMetadataWithEnv(
    {
      PORT: "4321",
      VERCEL_PROJECT_PRODUCTION_URL: "curyo.app",
    },
    {
      title: "Curyo — AI Asks. Humans Stake.",
      description: "Get Verified, Rate With Reputation, and Earn USDC for Answers AI Can Verify.",
    },
  );

  assert.equal(metadata.metadataBase, "https://curyo.app/");
  assert.equal(metadata.openGraph?.images?.[0]?.url, "https://curyo.app/og-image.png");
  assert.equal(metadata.twitter?.images?.[0]?.url, "https://curyo.app/twitter-image.png");
  assert.deepEqual(metadata.title, {
    default: "Curyo — AI Asks. Humans Stake.",
    template: "%s | Curyo",
  });
});
