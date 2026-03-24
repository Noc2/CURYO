import http from "node:http";
import https from "node:https";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];

async function localFetch(input: FetchInput, init?: FetchInit): Promise<Response> {
  const request = new Request(input, init);
  const url = new URL(request.url);
  const transport = url.protocol === "https:" ? https : http;
  const body =
    request.method === "GET" || request.method === "HEAD" ? undefined : Buffer.from(await request.arrayBuffer());
  const headers = Object.fromEntries(request.headers.entries()) as Record<string, string>;

  if (body && body.length > 0 && !Object.keys(headers).some(header => header.toLowerCase() === "content-length")) {
    headers["Content-Length"] = String(body.length);
  }

  return new Promise<Response>((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: request.method,
        headers,
      },
      res => {
        const chunks: Buffer[] = [];
        res.on("data", chunk => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });
        res.on("end", () => {
          resolve(
            new Response(Buffer.concat(chunks), {
              status: res.statusCode ?? 500,
              headers: new Headers(res.headers as Record<string, string>),
            }),
          );
        });
      },
    );

    req.on("error", reject);

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

const originalFetch = globalThis.fetch.bind(globalThis);

if (!(globalThis as typeof globalThis & { __curyoE2EFetchShimInstalled?: boolean }).__curyoE2EFetchShimInstalled) {
  globalThis.fetch = ((input: FetchInput, init?: FetchInit) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input.toString() : input.url);
    if (LOCAL_HOSTS.has(url.hostname)) {
      return localFetch(input, init);
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  (globalThis as typeof globalThis & { __curyoE2EFetchShimInstalled?: boolean }).__curyoE2EFetchShimInstalled =
    true;
}
