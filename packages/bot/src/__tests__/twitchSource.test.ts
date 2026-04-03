import { afterEach, describe, expect, it, vi } from "vitest";

function createJsonResponse(data: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    json: vi.fn().mockResolvedValue(data),
  };
}

async function loadTwitchSource(fetchResponses: unknown[]) {
  vi.resetModules();

  const fetchWithTimeout = vi.fn();
  for (const response of fetchResponses) {
    fetchWithTimeout.mockResolvedValueOnce(response);
  }

  const log = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };

  vi.doMock("../config.js", () => ({
    config: {
      twitchClientId: "client-id",
      twitchClientSecret: "client-secret",
    },
    log,
  }));
  vi.doMock("../utils.js", async () => {
    const actual = await vi.importActual<typeof import("../utils.js")>("../utils.js");
    return {
      ...actual,
      fetchWithTimeout,
    };
  });

  const module = await import("../sources/twitch.js");
  return {
    ...module,
    mocks: {
      fetchWithTimeout,
      log,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("twitchSource", () => {
  it("maps Twitch game names to the configured subcategories", async () => {
    const sourceModule = await loadTwitchSource([
      createJsonResponse({ access_token: "token" }),
      createJsonResponse({
        data: [
          {
            game_id: "509658",
            title: "Daily catch-up",
            url: "https://twitch.tv/clip/1",
            broadcaster_name: "Streamer",
          },
        ],
      }),
      createJsonResponse({
        data: [{ id: "509658", name: "Just Chatting" }],
      }),
    ]);

    const items = await sourceModule.twitchSource.fetchTrending(1);

    expect(items).toEqual([
      expect.objectContaining({
        tags: "Talk Shows",
        title: "Daily catch-up",
        url: "https://twitch.tv/clip/1",
      }),
    ]);
    expect(sourceModule.mocks.fetchWithTimeout).toHaveBeenCalledTimes(3);
  });

  it("falls back to Gaming when the Twitch game name is unmapped", async () => {
    const sourceModule = await loadTwitchSource([
      createJsonResponse({ access_token: "token" }),
      createJsonResponse({
        data: [
          {
            game_id: "1234",
            title: "High score run",
            url: "https://twitch.tv/clip/2",
            broadcaster_name: "Speedrunner",
          },
        ],
      }),
      createJsonResponse({
        data: [{ id: "1234", name: "Elden Ring" }],
      }),
    ]);

    const items = await sourceModule.twitchSource.fetchTrending(1);

    expect(items[0]?.tags).toBe("Gaming");
  });
});
