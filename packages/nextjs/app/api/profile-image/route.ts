import { NextRequest, NextResponse } from "next/server";
import { resolve4, resolve6 } from "dns/promises";
import { ResponseTooLargeError, readResponseBytes } from "~~/utils/fetchBodyLimit";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 60, windowMs: 60_000 };
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5 MB
const CACHE_SECONDS = 3600; // 1 hour

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.+$/, "");
}

function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length === 4 && parts.every(part => part >= 0 && part <= 255)) {
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }

  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80")) return true;
  return false;
}

async function isSafeProfileImageUrl(url: string): Promise<boolean> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== "https:") return false;
  if (parsed.username || parsed.password) return false;

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname || hostname === "localhost") return false;
  if (!hostname.includes(".")) return false;
  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return false;
  if (hostname.includes(":")) return false;

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

async function proxyImage(url: string): Promise<NextResponse> {
  const response = await fetch(url, { next: { revalidate: CACHE_SECONDS }, redirect: "manual" });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) return new NextResponse(null, { status: 502 });

    let redirectUrl: URL;
    try {
      redirectUrl = new URL(location, url);
    } catch {
      return new NextResponse(null, { status: 502 });
    }

    const safeRedirect = redirectUrl.toString();
    if (!(await isSafeProfileImageUrl(safeRedirect))) {
      return new NextResponse(null, { status: 403 });
    }

    const redirectedResponse = await fetch(safeRedirect, {
      next: { revalidate: CACHE_SECONDS },
      redirect: "manual",
    });
    if (!redirectedResponse.ok) {
      return new NextResponse(null, { status: redirectedResponse.status });
    }

    const redirectedType = redirectedResponse.headers.get("content-type") || "";
    if (!redirectedType.startsWith("image/")) {
      return new NextResponse(null, { status: 502 });
    }

    const redirectedBytes = await readResponseBytes(redirectedResponse, MAX_RESPONSE_SIZE);
    return new NextResponse(redirectedBytes, {
      headers: {
        "Content-Type": redirectedType,
        "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
      },
    });
  }

  if (!response.ok) {
    return new NextResponse(null, { status: response.status });
  }

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) {
    return new NextResponse(null, { status: 502 });
  }

  const bytes = await readResponseBytes(response, MAX_RESPONSE_SIZE);
  return new NextResponse(bytes, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
    },
  });
}

export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, RATE_LIMIT);
  if (limited) return limited;

  const url = request.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
  }

  if (!(await isSafeProfileImageUrl(url))) {
    return NextResponse.json({ error: "Invalid or unsafe image URL" }, { status: 400 });
  }

  try {
    return await proxyImage(url);
  } catch (error) {
    if (error instanceof ResponseTooLargeError) {
      return new NextResponse(null, { status: 413 });
    }
    return new NextResponse(null, { status: 502 });
  }
}
