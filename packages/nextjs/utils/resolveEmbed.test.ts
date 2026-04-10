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

test("resolveEmbed trims escaped Hugging Face avatar URLs before returning metadata", async () => {
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);

    if (url === "https://huggingface.co/api/models/Jackrong%2FGemopus-4-E4B-it") {
      return new Response(
        JSON.stringify({
          modelId: "Jackrong/Gemopus-4-E4B-it",
          pipeline_tag: "image-text-to-text",
          cardData: {},
        }),
        {
          headers: {
            "content-type": "application/json",
          },
        },
      );
    }

    if (url === "https://huggingface.co/Jackrong") {
      return new Response(
        '<script>{"userAvatarUrl":"https://cdn-avatars.huggingface.co/v1/production/uploads/66309bd090589b7c65950665/RcOk7ysh7nEt5YlHHzauj.jpeg&quot;,&quot;type&quot;:&quot;update&quot;"}</script>',
        {
          headers: {
            "content-type": "text/html",
          },
        },
      );
    }

    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const result = await resolveEmbed("huggingface", "Jackrong/Gemopus-4-E4B-it", { author: "Jackrong" });

  assert.deepEqual(calls, [
    "https://huggingface.co/api/models/Jackrong%2FGemopus-4-E4B-it",
    "https://huggingface.co/Jackrong",
  ]);
  assert.equal(
    result.thumbnailUrl,
    "https://cdn-avatars.huggingface.co/v1/production/uploads/66309bd090589b7c65950665/RcOk7ysh7nEt5YlHHzauj.jpeg",
  );
  assert.equal(
    result.imageUrl,
    "https://cdn-avatars.huggingface.co/v1/production/uploads/66309bd090589b7c65950665/RcOk7ysh7nEt5YlHHzauj.jpeg",
  );
  assert.equal(result.title, "Jackrong/Gemopus-4-E4B-it");
  assert.equal(result.description, "image text to text");
});
