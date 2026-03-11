type QueryValue = string | number | boolean | undefined;

export class PonderApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "PonderApiError";
    this.status = status;
  }
}

export interface PonderClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export class PonderClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor({ baseUrl, fetchImpl = fetch, timeoutMs = 10_000 }: PonderClientOptions) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
  }

  async searchContent(params: {
    status?: string;
    categoryId?: string;
    sortBy?: string;
    limit?: number;
    offset?: number;
  }): Promise<Record<string, unknown>> {
    return this.request("/content", params);
  }

  async getContent(contentId: string): Promise<Record<string, unknown>> {
    return this.request(`/content/${contentId}`);
  }

  async getContentByUrl(url: string): Promise<Record<string, unknown>> {
    return this.request("/content/by-url", { url });
  }

  async getCategories(): Promise<Record<string, unknown>> {
    return this.request("/categories");
  }

  async getProfile(address: string): Promise<Record<string, unknown>> {
    return this.request(`/profile/${address}`);
  }

  async getVoterAccuracy(address: string): Promise<Record<string, unknown>> {
    return this.request(`/voter-accuracy/${address}`);
  }

  async getStats(): Promise<Record<string, unknown>> {
    return this.request("/stats");
  }

  async searchVotes(params: {
    voter?: string;
    contentId?: string;
    roundId?: string;
    state?: string;
    limit?: number;
    offset?: number;
  }): Promise<Record<string, unknown>> {
    return this.request("/votes", params);
  }

  private async request(path: string, params?: Record<string, QueryValue>): Promise<Record<string, unknown>> {
    const url = new URL(path, `${this.baseUrl}/`);

    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timeoutHandle = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;

    try {
      response = await this.fetchImpl(url, {
        headers: {
          accept: "application/json",
        },
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new PonderApiError(`Ponder request timed out after ${this.timeoutMs}ms`, 504);
      }

      const message = error instanceof Error ? error.message : "Unknown fetch error";
      throw new PonderApiError(`Ponder request failed: ${message}`, 502);
    } finally {
      clearTimeout(timeoutHandle);
    }

    const body = await response.text();
    let parsed: Record<string, unknown> = {};
    if (body.length > 0) {
      try {
        const json = JSON.parse(body) as unknown;
        if (!isRecord(json)) {
          throw new Error("Expected a JSON object response");
        }

        parsed = json;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown parse error";
        throw new PonderApiError(`Ponder returned invalid JSON: ${message}`, 502);
      }
    }

    if (!response.ok) {
      const errorMessage = typeof parsed.error === "string" ? parsed.error : `Ponder request failed with status ${response.status}`;
      throw new PonderApiError(errorMessage, response.status);
    }

    return parsed;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
