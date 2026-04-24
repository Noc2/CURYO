import { resolve4 as dnsResolve4, resolve6 as dnsResolve6 } from "dns/promises";

export type UrlSafetyDnsResolvers = {
  resolve4(hostname: string): Promise<string[]>;
  resolve6(hostname: string): Promise<string[]>;
};

const defaultDnsResolvers: UrlSafetyDnsResolvers = {
  resolve4: dnsResolve4,
  resolve6: dnsResolve6,
};

let dnsResolvers = defaultDnsResolvers;

export function __setUrlSafetyDnsResolversForTests(resolvers: Partial<UrlSafetyDnsResolvers> | null) {
  dnsResolvers = resolvers ? { ...defaultDnsResolvers, ...resolvers } : defaultDnsResolvers;
}

function parseIpv4(ip: string): number[] | null {
  const parts = ip.split(".").map(Number);
  return parts.length === 4 && parts.every(p => Number.isInteger(p) && p >= 0 && p <= 255) ? parts : null;
}

/** Check whether an IP address belongs to a private/reserved range. */
export function isPrivateIp(ip: string): boolean {
  // IPv4
  const parts = parseIpv4(ip);
  if (parts) {
    const [a, b, c] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 0 && c === 0) return true; // 192.0.0.0/24 (IETF protocol assignments)
    if (a === 192 && b === 0 && c === 2) return true; // 192.0.2.0/24 (documentation)
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15 (benchmarking)
    if (a === 198 && b === 51 && c === 100) return true; // 198.51.100.0/24 (documentation)
    if (a === 203 && b === 0 && c === 113) return true; // 203.0.113.0/24 (documentation)
    if (a >= 224) return true; // multicast and reserved ranges
  }
  // IPv6
  const lower = ip.toLowerCase();
  if (lower.startsWith("::ffff:")) {
    const mappedIpv4 = parseIpv4(lower.slice("::ffff:".length));
    if (mappedIpv4) return isPrivateIp(mappedIpv4.join("."));
  }

  if (lower === "::1" || lower === "::") return true;
  const firstSegment = Number.parseInt(lower.split(":")[0] ?? "", 16);
  if (Number.isFinite(firstSegment)) {
    if ((firstSegment & 0xfe00) === 0xfc00) return true; // unique local fc00::/7
    if ((firstSegment & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
    if ((firstSegment & 0xff00) === 0xff00) return true; // multicast ff00::/8
  }
  if (lower.startsWith("2001:db8:")) return true; // documentation
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
    const ipv4 = await dnsResolvers.resolve4(hostname).catch(() => [] as string[]);
    const ipv6 = await dnsResolvers.resolve6(hostname).catch(() => [] as string[]);
    const allIps = [...ipv4, ...ipv6];
    if (allIps.length === 0) return false;
    if (allIps.some(isPrivateIp)) return false;
  } catch {
    return false;
  }

  return true;
}
