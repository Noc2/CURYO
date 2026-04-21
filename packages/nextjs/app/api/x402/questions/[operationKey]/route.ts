import { NextRequest, NextResponse } from "next/server";
import {
  getX402QuestionSubmissionByOperationKey,
  x402QuestionSubmissionRecordBody,
} from "~~/lib/x402/questionSubmission";
import { checkRateLimit } from "~~/utils/rateLimit";

export const runtime = "nodejs";

const READ_RATE_LIMIT = { limit: 120, windowMs: 60_000 };

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ operationKey: string }> },
) {
  const limited = await checkRateLimit(request, READ_RATE_LIMIT, { allowOnStoreUnavailable: true });
  if (limited) return limited;

  const { operationKey } = await context.params;
  if (!/^0x[a-fA-F0-9]{64}$/.test(operationKey)) {
    return NextResponse.json({ error: "Invalid operation key" }, { status: 400 });
  }

  const record = await getX402QuestionSubmissionByOperationKey(operationKey as `0x${string}`);
  return NextResponse.json(x402QuestionSubmissionRecordBody(record), {
    status: record ? 200 : 404,
  });
}

