import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWithTimeout } from "../utils.js";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("fetchWithTimeout", () => {
  it("passes an AbortSignal through to fetch", async () => {
    const response = new Response("ok", { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchWithTimeout("https://example.com/data", 5000, {
      method: "HEAD",
    });

    expect(result).toBe(response);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.com/data",
      expect.objectContaining({
        method: "HEAD",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  it("aborts slow requests once the timeout elapses", async () => {
    vi.useFakeTimers();

    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal;
      return new Promise((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), {
          once: true,
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const request = fetchWithTimeout("https://example.com/slow", 25);
    const rejection = expect(request).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(25);

    await rejection;
    expect(signal?.aborted).toBe(true);
  });
});
