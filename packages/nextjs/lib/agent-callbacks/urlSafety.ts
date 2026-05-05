import { isSafeUrl } from "~~/utils/urlSafety";

export function normalizeAgentCallbackUrl(input: string, label = "Callback URL") {
  const rawUrl = input.trim();
  if (!rawUrl) {
    throw new Error(`${label} is required.`);
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${label} must be a valid URL.`);
  }

  if (parsed.username || parsed.password || parsed.protocol !== "https:") {
    throw new Error(`${label} must be a public HTTPS URL.`);
  }

  return parsed.toString();
}

export async function assertSafeAgentCallbackUrl(input: string, label = "Callback URL") {
  const url = normalizeAgentCallbackUrl(input, label);
  if (!(await isSafeUrl(url))) {
    throw new Error(`${label} must be a public HTTPS URL.`);
  }

  return url;
}
