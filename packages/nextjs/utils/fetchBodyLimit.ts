const textDecoder = new TextDecoder();

export class ResponseTooLargeError extends Error {
  constructor(message = "Response body exceeded configured size limit") {
    super(message);
    this.name = "ResponseTooLargeError";
  }
}

function getContentLength(response: Response): number | null {
  const raw = response.headers.get("content-length");
  if (!raw) return null;

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function assertContentLengthWithinLimit(response: Response, maxBytes: number) {
  const contentLength = getContentLength(response);
  if (contentLength !== null && contentLength > maxBytes) {
    throw new ResponseTooLargeError();
  }
}

export async function readResponseBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  assertContentLengthWithinLimit(response, maxBytes);

  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new ResponseTooLargeError();
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

export async function readResponseText(response: Response, maxBytes: number): Promise<string> {
  return textDecoder.decode(await readResponseBytes(response, maxBytes));
}

export async function readResponseJson<T>(response: Response, maxBytes: number): Promise<T> {
  return JSON.parse(await readResponseText(response, maxBytes)) as T;
}
