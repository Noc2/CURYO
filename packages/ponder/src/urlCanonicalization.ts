export interface CanonicalUrlParts {
  canonicalUrl: string;
  urlHost: string;
}

export function getCanonicalUrlParts(value: string): CanonicalUrlParts | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  parsed.hash = "";
  parsed.hostname = parsed.hostname.toLowerCase();

  if ((parsed.protocol === "http:" && parsed.port === "80") || (parsed.protocol === "https:" && parsed.port === "443")) {
    parsed.port = "";
  }

  return {
    canonicalUrl: parsed.toString(),
    urlHost: parsed.hostname,
  };
}

export function getUrlLookupCandidates(value: string): string[] | null {
  const trimmed = value.trim();
  const canonical = getCanonicalUrlParts(trimmed);
  if (!canonical) return null;

  const parsed = new URL(canonical.canonicalUrl);
  const candidates = new Set<string>([trimmed, canonical.canonicalUrl]);

  // Root URLs are commonly submitted with and without a trailing slash.
  if (parsed.pathname === "/" && !parsed.search) {
    candidates.add(`${parsed.protocol}//${parsed.host}`);
    candidates.add(`${parsed.protocol}//${parsed.host}/`);
  }

  return [...candidates];
}
