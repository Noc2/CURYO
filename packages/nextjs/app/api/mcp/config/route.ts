import { NextResponse } from "next/server";
import { buildHostedMcpConfig } from "~~/lib/ai/mcpConfig";

export async function GET() {
  return NextResponse.json(buildHostedMcpConfig(), {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=300",
    },
  });
}
