import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { renderOrbitalAvatarSvg } from "~~/lib/avatar/orbitalAvatar";
import { getReputationAvatarPayload } from "~~/lib/avatar/server";

const CACHE_SECONDS = 300;

function parseRequestedSize(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json({ error: "Missing or invalid address parameter" }, { status: 400 });
  }

  const payload = await getReputationAvatarPayload(address);
  const size = parseRequestedSize(request.nextUrl.searchParams.get("size"));
  const svg = renderOrbitalAvatarSvg(payload, { size });

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}, stale-while-revalidate=${CACHE_SECONDS * 6}`,
    },
  });
}
