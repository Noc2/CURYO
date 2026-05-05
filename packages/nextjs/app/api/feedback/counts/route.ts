import { NextRequest, NextResponse } from "next/server";
import {
  listContentFeedbackCounts,
  normalizeContentFeedbackCountsInput,
  resolveContentFeedbackRoundContext,
} from "~~/lib/feedback/contentFeedback";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 60, windowMs: 60_000 };

export async function GET(request: NextRequest) {
  const contentIdsParam = request.nextUrl.searchParams.get("contentIds");
  const limited = await checkRateLimit(request, RATE_LIMIT, {
    extraKeyParts: [contentIdsParam ?? undefined],
  });
  if (limited) return limited;

  try {
    const contentIds = normalizeContentFeedbackCountsInput(contentIdsParam);
    if (contentIds.length === 0) {
      return NextResponse.json({ counts: {} });
    }

    const contextEntries = await Promise.all(
      contentIds.map(async contentId => [contentId, await resolveContentFeedbackRoundContext(contentId)] as const),
    );
    const counts = await listContentFeedbackCounts({
      contentIds,
      contextByContentId: new Map(contextEntries),
    });

    return NextResponse.json({ counts });
  } catch (error) {
    console.error("Error fetching feedback counts:", error);
    return NextResponse.json({ error: "Failed to fetch feedback counts" }, { status: 500 });
  }
}
