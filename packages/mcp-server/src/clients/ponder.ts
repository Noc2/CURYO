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
}

export class PonderClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor({ baseUrl, fetchImpl = fetch }: PonderClientOptions) {
    this.baseUrl = baseUrl;
    this.fetchImpl = fetchImpl;
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

    const response = await this.fetchImpl(url, {
      headers: {
        accept: "application/json",
      },
    });

    const body = await response.text();
    const parsed = body.length > 0 ? JSON.parse(body) as Record<string, unknown> : {};

    if (!response.ok) {
      const errorMessage = typeof parsed.error === "string" ? parsed.error : `Ponder request failed with status ${response.status}`;
      throw new PonderApiError(errorMessage, response.status);
    }

    return parsed;
  }
}
