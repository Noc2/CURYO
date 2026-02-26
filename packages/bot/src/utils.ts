/**
 * Fetch wrapper with AbortController-based timeout.
 * Prevents the bot from hanging indefinitely on unresponsive APIs.
 */
export async function fetchWithTimeout(
  url: string | URL,
  timeoutMs = 15_000,
  init?: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url.toString(), { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
