import { resolveEmbed } from "./resolveEmbed";
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("resolveEmbed prefers Hugging Face card thumbnails over avatar fallbacks", async () => {
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url === "https://huggingface.co/api/models/dealignai%2FGemma-4-31B-JANG_4M-CRACK") {
      return new Response(
        JSON.stringify({
          modelId: "dealignai/Gemma-4-31B-JANG_4M-CRACK",
          pipeline_tag: "text-generation",
          library_name: "mlx",
          cardData: {
            thumbnail: "dealign_mascot.png",
          },
        }),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const result = await resolveEmbed("huggingface", "dealignai/Gemma-4-31B-JANG_4M-CRACK", { author: "dealignai" });

  assert.deepEqual(calls, ["https://huggingface.co/api/models/dealignai%2FGemma-4-31B-JANG_4M-CRACK"]);
  assert.equal(
    result.thumbnailUrl,
    "https://huggingface.co/dealignai/Gemma-4-31B-JANG_4M-CRACK/raw/main/dealign_mascot.png",
  );
  assert.equal(
    result.imageUrl,
    "https://huggingface.co/dealignai/Gemma-4-31B-JANG_4M-CRACK/raw/main/dealign_mascot.png",
  );
  assert.equal(result.title, "dealignai/Gemma-4-31B-JANG_4M-CRACK");
  assert.equal(result.description, "text generation (mlx)");
});
