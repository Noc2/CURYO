import { NextRequest, NextResponse } from "next/server";
import {
  getX402QuestionSubmissionByClientRequest,
  x402QuestionSubmissionRecordBody,
} from "~~/lib/x402/questionSubmission";
import { checkRateLimit } from "~~/utils/rateLimit";

export const runtime = "nodejs";

const READ_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const limited = await checkRateLimit(request, READ_RATE_LIMIT, { allowOnStoreUnavailable: true });
  if (limited) return limited;

  const searchParams = request.nextUrl.searchParams;
  const chainId = Number.parseInt(searchParams.get("chainId") ?? "", 10);
  const clientRequestId = searchParams.get("clientRequestId")?.trim() ?? "";

  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    return NextResponse.json({ error: "Valid chainId is required" }, { status: 400 });
  }
  if (!clientRequestId) {
    return NextResponse.json({ error: "clientRequestId is required" }, { status: 400 });
  }

  const record = await getX402QuestionSubmissionByClientRequest({ chainId, clientRequestId });
  return NextResponse.json(x402QuestionSubmissionRecordBody(record), {
    status: record ? 200 : 404,
  });
}
