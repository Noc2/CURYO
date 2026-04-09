const DEV_PONDER_URL = "http://localhost:42069";

function isLocalhostHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

export function resolvePonderUrlValue(
  rawValue: string | undefined,
  production: boolean,
  allowLocalhostInProduction = false,
): { url: string | null; invalid: boolean } {
  const normalizedRawValue = rawValue?.trim() || undefined;
  const resolvedValue = normalizedRawValue ?? (!production ? DEV_PONDER_URL : undefined);

  if (!resolvedValue) {
    return { url: null, invalid: false };
  }

  let url: URL;
  try {
    url = new URL(resolvedValue);
  } catch {
    return { url: null, invalid: Boolean(normalizedRawValue) };
  }

  if (production && !allowLocalhostInProduction && isLocalhostHostname(url.hostname)) {
    return { url: null, invalid: false };
  }

  return {
    url: url.toString().replace(/\/$/, ""),
    invalid: false,
  };
}
