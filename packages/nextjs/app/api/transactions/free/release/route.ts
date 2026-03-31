import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Free transaction reservation release is no longer supported" }, { status: 410 });
}
