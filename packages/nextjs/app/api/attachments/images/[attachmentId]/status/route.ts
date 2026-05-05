import { NextRequest, NextResponse } from "next/server";
import { getAttachmentImageUrl, getImageAttachment } from "~~/lib/attachments/imageAttachments";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 60, windowMs: 60_000 };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const { attachmentId } = await params;
  const limited = await checkRateLimit(request, RATE_LIMIT, { extraKeyParts: [attachmentId] });
  if (limited) return limited;

  const attachment = await getImageAttachment(attachmentId);
  if (!attachment) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  return NextResponse.json({
    attachmentId,
    error: attachment.error,
    height: attachment.height,
    imageUrl: attachment.status === "approved" ? getAttachmentImageUrl(request.url, attachmentId) : null,
    moderationStatus: attachment.moderationStatus,
    status: attachment.status,
    width: attachment.width,
  });
}
