import { NextRequest, NextResponse } from "next/server";

export async function POST(_request: NextRequest) {
  return NextResponse.json({ error: "Free transaction reservation release is no longer supported" }, { status: 410 });
}
