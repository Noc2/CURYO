function normalizeHostname(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/\.+$/, "");
}

export function matchesHostname(hostname: string, expectedHost: string): boolean {
  const normalizedHostname = normalizeHostname(hostname);
  const normalizedExpected = normalizeHostname(expectedHost);

  return normalizedHostname === normalizedExpected || normalizedHostname.endsWith(`.${normalizedExpected}`);
}
