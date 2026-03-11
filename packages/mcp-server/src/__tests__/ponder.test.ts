import { describe, expect, it, vi } from "vitest";
import { PonderApiError, PonderClient } from "../clients/ponder.js";

describe("PonderClient", () => {
  it("encodes url lookup requests correctly", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toBe("https://ponder.curyo.xyz/content/by-url?url=https%3A%2F%2Fexample.com%2Fwatch%3Fv%3D1");
      return new Response(JSON.stringify({ content: { id: "1" } }), {
        status: 200,
        headers: {
          "content-type": "application/json",
        },
      });
    });

    const client = new PonderClient({
      baseUrl: "https://ponder.curyo.xyz",
      fetchImpl,
    });

    await expect(client.getContentByUrl("https://example.com/watch?v=1")).resolves.toEqual({
      content: { id: "1" },
    });
  });

  it("throws a typed error for upstream failures", async () => {
    const client = new PonderClient({
      baseUrl: "https://ponder.curyo.xyz",
      fetchImpl: vi.fn<typeof fetch>(async () => {
        return new Response(JSON.stringify({ error: "Content not found" }), {
          status: 404,
          headers: {
            "content-type": "application/json",
          },
        });
      }),
    });

    await expect(client.getContent("123")).rejects.toEqual(new PonderApiError("Content not found", 404));
  });

  it("times out stalled upstream requests", async () => {
    const client = new PonderClient({
      baseUrl: "https://ponder.curyo.xyz",
      timeoutMs: 5,
      fetchImpl: vi.fn<typeof fetch>(async (_input, init) => {
        await new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        });
        return new Response();
      }),
    });

    await expect(client.getStats()).rejects.toMatchObject({
      message: "Ponder request timed out after 5ms",
      status: 504,
    });
  });

  it("throws a typed error for malformed JSON responses", async () => {
    const client = new PonderClient({
      baseUrl: "https://ponder.curyo.xyz",
      fetchImpl: vi.fn<typeof fetch>(async () => {
        return new Response("not-json", {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        });
      }),
    });

    await expect(client.getStats()).rejects.toMatchObject({
      message: expect.stringContaining("Ponder returned invalid JSON"),
      status: 502,
    });
  });
});
