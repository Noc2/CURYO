import { afterEach, describe, expect, it, vi } from "vitest";

function createJsonResponse(data: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    json: vi.fn().mockResolvedValue(data),
  };
}

async function loadGitHubStrategy(options: {
  fetchResponses?: unknown[];
  githubToken?: string | undefined;
} = {}) {
  vi.resetModules();
  const githubToken = Object.prototype.hasOwnProperty.call(options, "githubToken")
    ? options.githubToken
    : "github-token";

  const fetchWithTimeout = vi.fn();
  for (const response of options.fetchResponses ?? []) {
    fetchWithTimeout.mockResolvedValueOnce(response);
  }

  vi.doMock("../config.js", () => ({
    config: {
      githubToken,
    },
    log: {
      debug: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
    },
  }));
  vi.doMock("../utils.js", async () => {
    const actual = await vi.importActual<typeof import("../utils.js")>("../utils.js");
    return {
      ...actual,
      fetchWithTimeout,
    };
  });

  const module = await import("../strategies/github.js");
  return {
    ...module,
    mocks: {
      fetchWithTimeout,
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("githubStrategy", () => {
  it("matches repository URLs and rejects reserved GitHub pages", async () => {
    const strategyModule = await loadGitHubStrategy();

    expect(strategyModule.githubStrategy.canRate("https://github.com/vercel/ai")).toBe(true);
    expect(strategyModule.githubStrategy.canRate("https://github.com/vercel/ai/tree/main/packages/core")).toBe(true);
    expect(strategyModule.githubStrategy.canRate("https://github.com/explore")).toBe(false);
  });

  it("scores healthy active repositories higher than stale archived ones", async () => {
    const now = Date.now();
    const strategyModule = await loadGitHubStrategy({
      fetchResponses: [
        createJsonResponse({
          description: "AI SDK for building AI-powered apps",
          forks_count: 2800,
          full_name: "vercel/ai",
          homepage: "https://sdk.vercel.ai",
          html_url: "https://github.com/vercel/ai",
          language: "TypeScript",
          license: { spdx_id: "MIT" },
          pushed_at: new Date(now - 5 * 24 * 60 * 60 * 1000).toISOString(),
          stargazers_count: 16000,
        }),
        createJsonResponse({
          archived: true,
          description: "Old archived project",
          forks_count: 4,
          full_name: "example/old-project",
          html_url: "https://github.com/example/old-project",
          language: "JavaScript",
          pushed_at: new Date(now - 900 * 24 * 60 * 60 * 1000).toISOString(),
          stargazers_count: 25,
        }),
      ],
    });

    const activeScore = await strategyModule.githubStrategy.getScore("https://github.com/vercel/ai");
    const archivedScore = await strategyModule.githubStrategy.getScore("https://github.com/example/old-project");

    expect(activeScore).not.toBeNull();
    expect(archivedScore).not.toBeNull();
    expect(activeScore!).toBeGreaterThan(archivedScore!);
  });

  it("returns null when GITHUB_TOKEN is not configured", async () => {
    const strategyModule = await loadGitHubStrategy({
      githubToken: undefined,
    });

    await expect(strategyModule.githubStrategy.getScore("https://github.com/vercel/ai")).resolves.toBeNull();
    expect(strategyModule.mocks.fetchWithTimeout).not.toHaveBeenCalled();
  });
});
