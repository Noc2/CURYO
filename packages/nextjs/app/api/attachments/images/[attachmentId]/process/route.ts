import { NextRequest, NextResponse } from "next/server";
import {
  getImageAttachment,
  processCompletedImageUpload,
  validateImageAttachmentBlobPathname,
} from "~~/lib/attachments/imageAttachments";
import { isSupportedImageUploadMimeType } from "~~/lib/auth/imageUploadChallenge.shared";
import { checkRateLimit } from "~~/utils/rateLimit";

const RATE_LIMIT = { limit: 20, windowMs: 60_000 };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const { attachmentId } = await params;
  const limited = await checkRateLimit(request, RATE_LIMIT, { extraKeyParts: [attachmentId] });
  if (limited) return limited;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const blobPathname = typeof body?.blobPathname === "string" ? body.blobPathname : "";
  const blobUrl = typeof body?.blobUrl === "string" ? body.blobUrl : "";
  const contentType = typeof body?.contentType === "string" ? body.contentType : "";

  if (!validateImageAttachmentBlobPathname(attachmentId, blobPathname)) {
    return NextResponse.json({ error: "Invalid image upload path." }, { status: 400 });
  }
  if (!blobUrl || !isSupportedImageUploadMimeType(contentType)) {
    return NextResponse.json({ error: "Invalid image upload metadata." }, { status: 400 });
  }

  const attachment = await getImageAttachment(attachmentId);
  if (!attachment) {
    return NextResponse.json({ error: "Image attachment was not found." }, { status: 404 });
  }
  if (attachment.status === "approved" || attachment.status === "blocked" || attachment.status === "deleted") {
    return NextResponse.json({ status: attachment.status });
  }

  await processCompletedImageUpload({ attachmentId, blobPathname, blobUrl, contentType });
  const updated = await getImageAttachment(attachmentId);
  return NextResponse.json({ status: updated?.status ?? "processing" });
}
