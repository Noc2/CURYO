import { NextRequest, NextResponse } from "next/server";
import { X402QuestionInputError, parseX402QuestionRequest } from "~~/lib/x402/questionPayload";
import {
  X402QuestionConfigError,
  X402QuestionConflictError,
  getX402QuestionFallbackChainId,
  handleX402QuestionSubmissionRequest,
} from "~~/lib/x402/questionSubmission";
import { checkRateLimit } from "~~/utils/rateLimit";

export const runtime = "nodejs";

const WRITE_RATE_LIMIT = { limit: 30, windowMs: 60_000 };

function errorResponse(error: unknown) {
  if (
    error instanceof X402QuestionInputError ||
    error instanceof X402QuestionConfigError ||
    error instanceof X402QuestionConflictError
  ) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  console.error("[x402-question] failed request", error);
  return NextResponse.json({ error: "Failed to submit x402 question" }, { status: 500 });
}

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  let payload;
  try {
    payload = parseX402QuestionRequest(body, getX402QuestionFallbackChainId());
  } catch (error) {
    return errorResponse(error);
  }

  const limited = await checkRateLimit(request, WRITE_RATE_LIMIT, {
    extraKeyParts: [payload.chainId, payload.clientRequestId],
  });
  if (limited) return limited;

  try {
    const result = await handleX402QuestionSubmissionRequest({
      payload,
      request,
    });

    return NextResponse.json(result.body, {
      headers: result.headers,
      status: result.status,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
