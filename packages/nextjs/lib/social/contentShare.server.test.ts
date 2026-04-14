import { getContentShareDataForParam } from "./contentShare.server";
import assert from "node:assert/strict";
import test from "node:test";

test("getContentShareDataForParam preserves Ponder base path prefixes", async () => {
  const originalPonderUrl = process.env.NEXT_PUBLIC_PONDER_URL;
  process.env.NEXT_PUBLIC_PONDER_URL = "https://ponder.example/api";

  const requestedUrls: string[] = [];
  const fetchImpl: typeof fetch = async input => {
    requestedUrls.push(input.toString());

    return new Response(
      JSON.stringify({
        content: {
          id: "88",
          title: "A disputed piece of content",
          description: "A compact summary for social previews.",
          rating: 50,
          ratingBps: 5_000,
          totalVotes: 1,
          lastActivityAt: "1776160800",
          openRound: null,
        },
      }),
    );
  };

  try {
    const shareData = await getContentShareDataForParam("88", {
      fetchImpl,
      origin: "https://www.curyo.xyz",
    });

    assert.equal(requestedUrls[0], "https://ponder.example/api/content/88");
    assert.equal(shareData?.contentId, "88");
  } finally {
    if (originalPonderUrl === undefined) {
      delete process.env.NEXT_PUBLIC_PONDER_URL;
    } else {
      process.env.NEXT_PUBLIC_PONDER_URL = originalPonderUrl;
    }
  }
});
