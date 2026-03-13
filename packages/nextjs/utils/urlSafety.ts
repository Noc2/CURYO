import { resolve4, resolve6 } from "dns/promises";

/** Check whether an IP address belongs to a private/reserved range. */
function isPrivateIp(ip: string): boolean {
  // IPv4
  const parts = ip.split(".").map(Number);
  if (parts.length === 4 && parts.every(p => p >= 0 && p <= 255)) {
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
  }
  // IPv6
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
  if (lower.startsWith("fe80")) return true; // link-local
  return false;
}

/**
 * Block URLs that could be used for SSRF (internal network probing).
 * Rejects: non-HTTPS, IP-address hostnames, localhost, *.local, *.internal,
 * single-label hostnames (no dots), and hostnames that resolve to private IPs.
 */
export async function isSafeUrl(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;

  const hostname = parsed.hostname.toLowerCase();

  // Reject localhost
  if (hostname === "localhost") return false;

  // Reject single-label hostnames (no dots — e.g. "internal-service")
  if (!hostname.includes(".")) return false;

  // Reject *.local and *.internal TLDs
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return false;

  // Reject IPv4 addresses (e.g. 169.254.169.254)
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;

  // Reject IPv6 addresses (bracketed in URLs, parsed hostname strips brackets)
  if (hostname.startsWith("[") || hostname.includes(":")) return false;

  // DNS rebinding protection: resolve hostname and reject private/reserved IPs.
  // Note: TOCTOU race exists (fetch may resolve differently), but this raises
  // the bar significantly against DNS rebinding attacks.
  try {
    const ipv4 = await resolve4(hostname).catch(() => [] as string[]);
    const ipv6 = await resolve6(hostname).catch(() => [] as string[]);
    const allIps = [...ipv4, ...ipv6];
    if (allIps.length === 0) return false;
    if (allIps.some(isPrivateIp)) return false;
  } catch {
    return false;
  }

  return true;
}
