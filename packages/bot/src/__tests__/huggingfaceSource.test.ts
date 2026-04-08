import { afterEach, describe, expect, it, vi } from "vitest";

function createJsonResponse(data: unknown, init: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    statusText: init.statusText ?? "OK",
    json: vi.fn().mockResolvedValue(data),
  };
}

async function loadHuggingFaceSource(fetchResponses: unknown[]) {
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
    log,
  }));
  vi.doMock("../utils.js", async () => {
    const actual = await vi.importActual<typeof import("../utils.js")>("../utils.js");
    return {
      ...actual,
      fetchWithTimeout,
    };
  });

  const module = await import("../sources/huggingface.js");
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

describe("huggingFaceSource", () => {
  it("requests trending models with the current Hugging Face API sort key", async () => {
    const sourceModule = await loadHuggingFaceSource([
      createJsonResponse([
        {
          downloads: 123456,
          id: "openai/gpt-oss-20b",
          likes: 321,
          pipeline_tag: "text-generation",
        },
      ]),
    ]);

    const items = await sourceModule.huggingFaceSource.fetchTrending(10);

    expect(items).toEqual([
      expect.objectContaining({
        categoryId: 8n,
        tags: "Chatbots",
        title: "openai/gpt-oss-20b",
        url: "https://huggingface.co/openai/gpt-oss-20b",
      }),
    ]);

    const [requestUrl] = sourceModule.mocks.fetchWithTimeout.mock.calls[0] ?? [];
    expect(requestUrl).toBeTruthy();

    const parsed = new URL(requestUrl);
    expect(parsed.origin).toBe("https://huggingface.co");
    expect(parsed.pathname).toBe("/api/models");
    expect(parsed.searchParams.get("sort")).toBe("trending_score");
    expect(parsed.searchParams.get("direction")).toBe("-1");
    expect(parsed.searchParams.get("limit")).toBe("10");
  });
});
