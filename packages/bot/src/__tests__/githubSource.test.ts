import { afterEach, describe, expect, it, vi } from "vitest";

function createJsonResponse(data: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    json: vi.fn().mockResolvedValue(data),
  };
}

async function loadGitHubSource(options: {
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

  const log = {
    debug: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  };

  vi.doMock("../config.js", () => ({
    config: {
      githubToken,
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

  const module = await import("../sources/github.js");
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

describe("githubSource", () => {
  it("maps GitHub repositories into submit items and subcategories", async () => {
    const sourceModule = await loadGitHubSource({
      fetchResponses: [
        createJsonResponse({
          items: [
            {
              description: "AI SDK for building products with language models",
              forks_count: 2500,
              full_name: "vercel/ai",
              html_url: "https://github.com/vercel/ai",
              language: "TypeScript",
              stargazers_count: 16000,
              topics: ["ai", "llm", "sdk"],
            },
            {
              description: "The React Framework for the Web",
              forks_count: 26000,
              full_name: "vercel/next.js",
              html_url: "https://github.com/vercel/next.js",
              language: "TypeScript",
              stargazers_count: 130000,
              topics: ["react", "framework", "nextjs"],
            },
          ],
        }),
      ],
    });

    const items = await sourceModule.githubSource.fetchTrending(2);

    expect(items).toEqual([
      expect.objectContaining({
        categoryId: 8n,
        tags: "AI/ML",
        title: "vercel/ai",
        url: "https://github.com/vercel/ai",
      }),
      expect.objectContaining({
        categoryId: 8n,
        tags: "Frameworks",
        title: "vercel/next.js",
        url: "https://github.com/vercel/next.js",
      }),
    ]);
    expect(sourceModule.mocks.fetchWithTimeout).toHaveBeenCalledWith(
      expect.stringContaining("https://api.github.com/search/repositories?"),
      15_000,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer github-token",
        }),
      }),
    );
  });

  it("returns no items when GITHUB_TOKEN is missing", async () => {
    const sourceModule = await loadGitHubSource({
      githubToken: undefined,
    });

    const items = await sourceModule.githubSource.fetchTrending(3);

    expect(items).toEqual([]);
    expect(sourceModule.mocks.fetchWithTimeout).not.toHaveBeenCalled();
    expect(sourceModule.mocks.log.debug).toHaveBeenCalledWith("GitHub source skipped: GITHUB_TOKEN not set");
  });
});
