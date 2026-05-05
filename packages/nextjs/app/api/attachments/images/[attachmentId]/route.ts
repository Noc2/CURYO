import { NextRequest, NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { getImageAttachment } from "~~/lib/attachments/imageAttachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseImageParam(value: string) {
  const decoded = decodeURIComponent(value);
  const match = decoded.match(/^(att_[A-Za-z0-9_-]{16,80})\.webp$/);
  return match?.[1] ?? null;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ attachmentId: string }> }) {
  const { attachmentId: image } = await params;
  const attachmentId = parseImageParam(image);
  if (!attachmentId) {
    return new NextResponse("Not found", { status: 404 });
  }

  const attachment = await getImageAttachment(attachmentId);
  if (!attachment || attachment.status !== "approved" || !attachment.normalizedBlobPathname) {
    return new NextResponse("Not found", { status: 404 });
  }

  const result = await get(attachment.normalizedBlobPathname, {
    access: "private",
    ifNoneMatch: request.headers.get("if-none-match") ?? undefined,
  });
  if (!result) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (result.statusCode === 304) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: result.blob.etag,
        "Cache-Control": "public, max-age=300, must-revalidate",
      },
    });
  }

  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": "image/webp",
      "X-Content-Type-Options": "nosniff",
      ETag: result.blob.etag,
      "Cache-Control": "public, max-age=300, must-revalidate",
    },
  });
}
